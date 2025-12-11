// backend/server.js
const express = require('express');
const dotenv = require('dotenv');
dotenv.config();

const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

// --- Config & DB ---
const connectDB = require('./config/db');
connectDB(); 

// --- Route Imports ---
const apiRoutes = require('./routes/userRoutes'); 

// --- Controllers & Models for Sockets ---
const matchController = require('./controllers/matchController'); 
const ProblemStatement = require('./models/problemStatementModel'); 

const app = express();

// --- Middleware ---
app.use(express.json());
app.use(cors({ origin: '*' })); 

// --- Mount Routes ---
app.use('/api', apiRoutes);

// --- Create HTTP Server + Socket.io ---
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || '*', 
    methods: ['GET', 'POST'],
  },
});

// ==========================================
// ⚡ SOCKET.IO GAME LOGIC 
// ==========================================

// Global Structures
const socketRoomMap = new Map(); // socket.id -> roomId
const roomDataMap = new Map();   // roomId -> { playerAuthIds: [], playerSocketIds: [], status, isRanked, problemId }
let rankedQueue = [];            // Queue for Ranked (Skill-based)
let casualQueue = [];            // Queue for Casual (FIFO)

// --- 🧠 MATCHMAKING HELPER ---
function findOpponent(queue, currentUserData, mode) {
    if (mode === 'ranked') {
        // RANKED: Match based on Rank Tier (e.g. "Silver" vs "Silver")
        return queue.findIndex(opponent => {
            // Extract Tier: "Silver I" -> "Silver"
            const myTier = (currentUserData.rank || "Unranked").split(' ')[0];
            const oppTier = (opponent.rank || "Unranked").split(' ')[0];
            
            // They match ONLY if they are in the same Tier
            return myTier === oppTier;
        });
    } else {
        // CASUAL: Match with the first person waiting
        return queue.length > 0 ? 0 : -1;
    }
}

// --- 🎲 PROBLEM SELECTION HELPER ---
async function selectProblemDifficulty(mode, avgPoints) {
    let targetDifficulty = "Easy";
    
    if (mode === 'ranked') {
        // Dynamic Difficulty based on Avg Skill
        if (avgPoints >= 2200) targetDifficulty = "Hard";      
        else if (avgPoints >= 1400) targetDifficulty = "Medium"; 
    } else {
        // Random Difficulty for Casual/Lobby
        const difficulties = ["Easy", "Medium", "Hard"];
        targetDifficulty = difficulties[Math.floor(Math.random() * difficulties.length)];
    }
    
    try {
        const randomProblems = await ProblemStatement.aggregate([
            { $match: { difficulty: targetDifficulty } },
            { $sample: { size: 1 } }
        ]);
        return randomProblems.length > 0 ? randomProblems[0].id : "1";
    } catch (error) {
        console.error('DB Problem Fetch Error:', error.message);
        return "1"; // Fallback Problem ID
    }
}

io.on('connection', (socket) => {
  console.log('User Connected:', socket.id);

  // -----------------------------------------------------------
  // A. FIND MATCH EVENT (Ranked/Casual Queue)
  // -----------------------------------------------------------
  socket.on('find_match', async ({ userAuthId, mode }) => {
    const isRanked = mode === 'ranked';
    let currentQueue = isRanked ? rankedQueue : casualQueue;

    try {
      // 1. Fetch Real User Data from DB (Secure)
      const userData = await matchController.getUserRankAndProfile(userAuthId);
      
      const rank = userData.profile.stats.rank; 
      const points = isRanked ? userData.profile.stats.rankedPoints : userData.profile.stats.points;
      const username = userData.profile.username || "Unknown Warrior"; 

      // 2. Prevent Duplicate Queueing
      const isAlreadyInQueue = rankedQueue.some(q => q.userAuthId === userAuthId) || casualQueue.some(q => q.userAuthId === userAuthId);
      if (isAlreadyInQueue) return;

      const currentUserData = { 
        id: socket.id, 
        userAuthId, 
        username, 
        points, 
        rank, 
        searchStartTime: Date.now() 
      };

      console.log(`User ${username} (${rank}) joined ${mode} queue.`);

      // 3. Find Opponent Logic
      const foundIndex = findOpponent(currentQueue, currentUserData, mode);
      
      if (foundIndex !== -1) {
        // --- MATCH FOUND ---
        const opponentData = currentQueue.splice(foundIndex, 1)[0];
        const opponentSocket = io.sockets.sockets.get(opponentData.id);

        if (opponentSocket) {
          // Clean up queues
          if (isRanked) rankedQueue = rankedQueue.filter(q => q.id !== opponentData.id);
          else casualQueue = casualQueue.filter(q => q.id !== opponentData.id);

          // Create Unique Room ID
          const roomId = `match_${currentUserData.userAuthId}_${opponentData.userAuthId}_${Date.now()}`;
          
          // Join Room
          socket.join(roomId);
          opponentSocket.join(roomId);
          
          socketRoomMap.set(socket.id, roomId);
          socketRoomMap.set(opponentData.id, roomId);

          // Select Problem
          const avgPoints = (currentUserData.points + opponentData.points) / 2;
          const selectedProblemId = await selectProblemDifficulty(mode, avgPoints);

          console.log(`Match Started: ${roomId} | ${currentUserData.rank} VS ${opponentData.rank}`);

          // Save Game Data
          roomDataMap.set(roomId, {
            playerAuthIds: [currentUserData.userAuthId, opponentData.userAuthId],
            playerSocketIds: [socket.id, opponentData.id],
            status: 'active',
            isRanked: isRanked,
            problemId: selectedProblemId, 
            winnerId: null,
          });

          // Notify Players
          io.to(roomId).emit('match_found', {
            roomId,
            problemId: selectedProblemId,
            isRanked: isRanked,
            players: [
              { id: currentUserData.userAuthId, username: currentUserData.username, rank: currentUserData.rank, points: currentUserData.points },
              { id: opponentData.userAuthId, username: opponentData.username, rank: opponentData.rank, points: opponentData.points }
            ]
          });

        } else {
          // Opponent disconnected while matching, put me back in queue
          currentQueue.push(currentUserData); 
        }
      } else {
        // --- NO MATCH FOUND ---
        currentQueue.push(currentUserData);
        const tier = rank ? rank.split(' ')[0] : "Unranked";
        socket.emit('waiting', { message: `Searching for a ${tier} tier opponent...` });
      }

    } catch (error) {
      console.error('Matchmaking Error:', error.message);
      socket.emit('error', { message: 'Failed to join matchmaking.' });
    }
  });

  // -----------------------------------------------------------
  // B. PRIVATE LOBBY LOGIC (Play with Friends)
  // -----------------------------------------------------------
  
  // 1. CREATE LOBBY
  socket.on('create_private_lobby', ({ userAuthId }) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase(); 
    
    roomDataMap.set(roomId, {
        playerAuthIds: [userAuthId],
        playerSocketIds: [socket.id],
        status: 'waiting', 
        isRanked: false,   
        problemId: null    
    });

    socket.join(roomId);
    socketRoomMap.set(socket.id, roomId); // Map socket to room
    
    socket.emit('lobby_created', { roomId });
    console.log(`🏠 Private Lobby Created: ${roomId} by ${userAuthId}`);
  });

  // 2. JOIN LOBBY
  socket.on('join_private_lobby', async ({ roomId, userAuthId }) => {
    const room = roomDataMap.get(roomId);

    if (!room) {
        socket.emit('error', { message: "Lobby not found or expired." });
        return;
    }
    if (room.status !== 'waiting') {
        socket.emit('error', { message: "Game already started." });
        return;
    }
    if (room.playerAuthIds.includes(userAuthId)) {
        return; // Prevent joining self
    }

    // Add Friend to Room
    room.playerAuthIds.push(userAuthId);
    room.playerSocketIds.push(socket.id);
    room.status = 'active'; 
    
    socket.join(roomId);
    socketRoomMap.set(socket.id, roomId); // Map socket to room

    // Fetch Players Info
    const hostId = room.playerAuthIds[0];
    const hostData = await matchController.getUserRankAndProfile(hostId);
    const friendData = await matchController.getUserRankAndProfile(userAuthId);

    // Select Problem (Casual Mode)
    const problemId = await selectProblemDifficulty('casual', 0); 
    room.problemId = problemId;

    roomDataMap.set(roomId, room);

    // Notify BOTH players
    io.to(roomId).emit('match_found', {
        roomId,
        problemId,
        isRanked: false,
        players: [
            { id: hostData.userId, username: hostData.profile.username },
            { id: friendData.userId, username: friendData.profile.username }
        ]
    });
  });

  // -----------------------------------------------------------
  // C. CHAT SYSTEM
  // -----------------------------------------------------------
  socket.on('send_message', ({ roomId, message, username }) => {
    socket.to(roomId).emit('receive_message', {
      message,
      username,
      timestamp: new Date().toISOString()
    });
  });

  // -----------------------------------------------------------
  // D. HANDLE WIN (Race Logic)
  // -----------------------------------------------------------
  socket.on('player_won', async ({ roomId, problemId, userAuthId }) => {
    const roomData = roomDataMap.get(roomId);

    if (!roomData || roomData.status !== 'active') return;

    // 1. Mark Game Over
    roomData.status = 'finished';
    roomData.winnerId = userAuthId;
    roomDataMap.set(roomId, roomData);

    const winnerAuthId = userAuthId;
    const loserAuthId = roomData.playerAuthIds.find(id => id !== userAuthId);

    console.log(`🏆 Match ${roomId} won by ${winnerAuthId}`);

    try {
      const matchType = roomData.isRanked ? 'RANKED' : 'CASUAL';
      
      const results = await matchController.updateMatchResults(
          winnerAuthId, 
          loserAuthId, 
          matchType
      );

      io.to(roomId).emit('match_over', {
        winnerId: winnerAuthId,
        isRanked: roomData.isRanked,
        winDetails: results.winner,
        loseDetails: results.loser,
        problemId
      });

    } catch (error) {
      console.error('Error updating match results:', error.message);
    }
  });

  // -----------------------------------------------------------
  // E. DISCONNECT HANDLING
  // -----------------------------------------------------------
  socket.on('disconnect', async () => {
    console.log('User Disconnected:', socket.id);
    
    // 1. Remove from Queues
    rankedQueue = rankedQueue.filter(u => u.id !== socket.id);
    casualQueue = casualQueue.filter(u => u.id !== socket.id);

    // 2. Handle Active Match Disconnect
    const roomId = socketRoomMap.get(socket.id);
    if (roomId) {
      const roomData = roomDataMap.get(roomId);
      
      if (roomData && roomData.status === 'active') {
        const remainingSocketId = roomData.playerSocketIds.find(id => id !== socket.id);
        
        if (remainingSocketId) {
          io.to(remainingSocketId).emit('user-disconnected', { 
            message: "Opponent disconnected! You win by default." 
          });

          // RANKED LOGIC: Disconnecting counts as a loss
          if (roomData.isRanked) {
              console.log(`Ranked Disconnect in ${roomId}. Awarding win to survivor.`);
              
              const disconnectedIndex = roomData.playerSocketIds.indexOf(socket.id);
              const remainingIndex = roomData.playerSocketIds.indexOf(remainingSocketId);
              
              if(disconnectedIndex !== -1 && remainingIndex !== -1) {
                  const loserAuthId = roomData.playerAuthIds[disconnectedIndex];
                  const winnerAuthId = roomData.playerAuthIds[remainingIndex];

                  matchController.updateMatchResults(winnerAuthId, loserAuthId, 'RANKED')
                    .catch(e => console.error("Error saving disconnect result:", e));
              }
          }
        }
        roomDataMap.delete(roomId);
      }
      // If waiting in lobby, delete room
      else if (roomData && roomData.status === 'waiting') {
          roomDataMap.delete(roomId);
      }
      
      socketRoomMap.delete(socket.id);
    }
  });

  socket.on('cancel_search', () => {
    rankedQueue = rankedQueue.filter(u => u.id !== socket.id);
    casualQueue = casualQueue.filter(u => u.id !== socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`SERVER RUNNING ON PORT ${PORT}`);
});