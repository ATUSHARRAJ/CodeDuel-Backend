const mongoose = require('mongoose');

const solvedProblemSchema = new mongoose.Schema({
  // 🔗 Reference to the User
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // 🔢 Problem ID (Number, as requested)
  problemId: {
    type: Number, 
    required: true
  },

  // 📝 Language used
  language: {
    type: String,
    required: true
  },

  // 💻 ONLY the User's Code (Not the full driver code)
  code: {
    type: String, 
    required: true 
  },

  solvedAt: {
    type: Date,
    default: Date.now
  }
}, { 
  timestamps: true 
});

// ⚡ Compound Index: Ensures (User + Problem) is unique.
// This allows us to quickly check "Has this user solved Problem 1?"
solvedProblemSchema.index({ user: 1, problemId: 1 }, { unique: true });

module.exports = mongoose.model('SolvedProblem', solvedProblemSchema);