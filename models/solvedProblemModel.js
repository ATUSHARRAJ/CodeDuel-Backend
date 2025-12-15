const mongoose = require('mongoose');

const solvedProblemSchema = new mongoose.Schema({
  // 🔗 Reference to the User (One document per user)
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true // Ensure 1 User = 1 Progress Document
  },

  // 📂 The Array of Solved Problems
  problems: [
    {
      problemId: { 
        type: Number, 
        required: true 
      },
      language: { 
        type: String, 
        required: true 
      },
      code: { 
        type: String, 
        required: true 
      },
      solvedAt: { 
        type: Date, 
        default: Date.now 
      }
    }
  ]
}, { 
  timestamps: true 
});

module.exports = mongoose.model('SolvedProblem', solvedProblemSchema);