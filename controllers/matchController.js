// backend/controllers/matchController.js

const ProfileDetails = require('../models/profileDetailsModel');
const mongoose = require('mongoose');

// --- CONSTANTS ---
const POINTS_RANKED_WIN = 50;
const POINTS_RANKED_LOSS = 20;
const POINTS_CASUAL_XP = 0; // ✅ Casual matches award 0 points now

/**
 * ✅ Fetches user profile and rank data using authId
 * @param {string} authId - The User ID from authentication
 */
const getUserRankAndProfile = async (authId) => {
    // 1. Validate ID Format
    if (!mongoose.Types.ObjectId.isValid(authId)) {
        throw new Error("Invalid user ID format");
    }

    // 2. Fetch Profile
    const profile = await ProfileDetails.findOne({ user: authId });

    if (!profile) {
        throw new Error("Profile not found");
    }

    return {
        userId: authId,
        profile
    };
};

/**
 * ✅ Updates points and rank of winner and loser depending on match type.
 * @param {string} winnerAuthId 
 * @param {string} loserAuthId 
 * @param {string} matchType - 'RANKED' or 'CASUAL'
 */
const updateMatchResults = async (winnerAuthId, loserAuthId, matchType) => {
    
    // 1. Fetch Winner & Loser Data
    const winnerData = await getUserRankAndProfile(winnerAuthId);
    const loserData = await getUserRankAndProfile(loserAuthId);

    // 2. Normalize Match Type (Safety Check: 'ranked' -> 'RANKED')
    const type = matchType ? matchType.toUpperCase() : 'CASUAL';

    let winnerPointChange = 0;
    let loserPointChange = 0;

    let winnerNewRank = winnerData.profile.stats.rank;
    let loserNewRank = loserData.profile.stats.rank;

    // --- RANKED MATCH LOGIC ---
    if (type === 'RANKED') {
        // Winner gets points
        winnerData.profile.stats.rankedPoints += POINTS_RANKED_WIN;
        winnerPointChange = POINTS_RANKED_WIN;

        // Loser loses points (But not below 0)
        loserData.profile.stats.rankedPoints = Math.max(
            0,
            loserData.profile.stats.rankedPoints - POINTS_RANKED_LOSS
        );
        loserPointChange = -POINTS_RANKED_LOSS;

        // Recalculate Ranks (Ensure updateRank method exists in Model)
        if (typeof winnerData.profile.updateRank === 'function') {
            winnerNewRank = winnerData.profile.updateRank();
        }
        if (typeof loserData.profile.updateRank === 'function') {
            loserNewRank = loserData.profile.updateRank();
        }

        // Save Loser Data (Winner saved at end)
        await loserData.profile.save();
    }

    // --- CASUAL MATCH LOGIC ---
    else if (type === 'CASUAL') {
        // ✅ No Points for Casual Match
        winnerPointChange = 0; 
        loserPointChange = 0;
        // Winner stats (points) remain unchanged
    }

    // --- COMMON LOGIC (Winner Stats) ---
    // Always increase "Questions Solved" for the winner
    winnerData.profile.stats.questionsSolved += 1;
    
    await winnerData.profile.save();

    // --- RETURN RESULT FOR FRONTEND ---
    return {
        winner: {
            pointsChange: winnerPointChange,
            newPoints: type === "RANKED" 
                ? winnerData.profile.stats.rankedPoints 
                : winnerData.profile.stats.points,
            newRank: winnerNewRank,
            casualXPGain: 0
        },
        loser: {
            pointsChange: loserPointChange,
            newPoints: type === "RANKED"
                ? loserData.profile.stats.rankedPoints
                : loserData.profile.stats.points,
            newRank: loserNewRank
        }
    };
};

module.exports = {
    getUserRankAndProfile,
    updateMatchResults,
};