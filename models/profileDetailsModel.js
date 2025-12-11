const mongoose = require('mongoose');

// Define valid ranks (Free Fire Style)
const VALID_RANKS = [
  "Bronze I", "Bronze II", "Bronze III",
  "Silver I", "Silver II", "Silver III",
  "Gold I", "Gold II", "Gold III", "Gold IV",
  "Platinum I", "Platinum II", "Platinum III", "Platinum IV",
  "Diamond I", "Diamond II", "Diamond III", "Diamond IV",
  "Heroic",
  "Grandmaster"
];

const profileDetailsSchema = new mongoose.Schema({
  // 🔗 Reference to Auth User
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', 
    required: true,
    unique: true 
  },

  // 👤 Personal Details
  username: { type: String, default: 'Coder' },
  fullName: { type: String, default: 'Anonymous User' },
  college: { type: String, default: 'BIT Sindri' },
  bio: { type: String, default: 'Ready to code!' },
  preferredLanguage: { type: String, default: 'C++' },
  github: { type: String, default: '' },
  profilePic: { type: String, default: 'https://via.placeholder.com/150' },

  // 📊 Stats
  stats: {
    level: { 
      type: Number, 
      default: 1 
    },
    // 🟢 CASUAL POINTS (Total XP / Practice Points)
    // Increases with every problem solved, never decreases.
    points: { 
      type: Number, 
      default: 0 
    },
    // 🔴 RANKED POINTS (Competitive Elo)
    // Used for Matchmaking & Rank Updates. Can go up or down.
    rankedPoints: { 
      type: Number, 
      default: 0 // Starting Elo (You can change this to 1000 if you want non-zero start)
    },
    questionsSolved: { 
      type: Number, 
      default: 0 
    },
    streak: { 
      type: Number, 
      default: 0 
    },
    rank: { 
      type: String, 
      default: "Bronze I", 
      enum: VALID_RANKS 
    }
  }
}, { timestamps: true });

// 🛠️ METHOD: Logic to Auto-Update Rank based on RANKED POINTS
profileDetailsSchema.methods.updateRank = function() {
  // ⚠️ NOW USING RANKED POINTS ONLY
  const rp = this.stats.rankedPoints;

  if (rp >= 3200) this.stats.rank = "Grandmaster";
  else if (rp >= 2600) this.stats.rank = "Heroic";
  else if (rp >= 2450) this.stats.rank = "Diamond IV";
  else if (rp >= 2300) this.stats.rank = "Diamond III";
  else if (rp >= 2150) this.stats.rank = "Diamond II";
  else if (rp >= 2000) this.stats.rank = "Diamond I";
  else if (rp >= 1850) this.stats.rank = "Platinum IV";
  else if (rp >= 1700) this.stats.rank = "Platinum III";
  else if (rp >= 1600) this.stats.rank = "Platinum II";
  else if (rp >= 1500) this.stats.rank = "Platinum I";
  else if (rp >= 1450) this.stats.rank = "Gold IV";
  else if (rp >= 1400) this.stats.rank = "Gold III";
  else if (rp >= 1350) this.stats.rank = "Gold II";
  else if (rp >= 1300) this.stats.rank = "Gold I";
  else if (rp >= 1200) this.stats.rank = "Silver III";
  else if (rp >= 1100) this.stats.rank = "Silver II";
  else if (rp >= 1000) this.stats.rank = "Silver I";
  else if (rp >= 800)  this.stats.rank = "Bronze III";
  else if (rp >= 500)  this.stats.rank = "Bronze II";
  else                 this.stats.rank = "Bronze I";

  return this.stats.rank;
};

module.exports = mongoose.model('ProfileDetails', profileDetailsSchema);