const mongoose = require("mongoose");

const problemStatementSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  title: { type: String, required: true },
  difficulty: { type: String, enum: ["Easy", "Medium", "Hard"], required: true },
  description: { type: String, required: true },
  
  // Public Examples (shown to user)
  examples: [{
    input: String,
    output: String,
    explanation: String
  }],
  
  // Constraints
  constraints: [String],
  
  // Starter Code (User sees this)
  starterCode: {
    type: Map,
    of: String
  },

  // Driver Code (For "Run" button - simple check)
  driverCode: {
    type: Map,
    of: String
  },

  // HIDDEN TEST CASES (For "Submit" button - rigorous check)
  testCases: [{
    input: String,
    expected: String
  }]
}, { timestamps: true });

module.exports = mongoose.model("ProblemStatement", problemStatementSchema);