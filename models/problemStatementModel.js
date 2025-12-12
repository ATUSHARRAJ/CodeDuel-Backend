const mongoose = require("mongoose");

const problemStatementSchema = new mongoose.Schema({
  // 1. Basic Info
  id: { 
    type: Number, 
    required: true, 
    unique: true 
  },
  title: { 
    type: String, 
    required: true 
  },
  difficulty: { 
    type: String, 
    enum: ["Easy", "Medium", "Hard"], 
    default: "Easy" 
  },
  topic: { 
    type: String, 
    required: true 
  },
  description: { 
    type: String, 
    required: true 
  },

  // 2. Data for User & Frontend
  examples: [
    {
      input: String,
      output: String,
      explanation: String
    }
  ],
  constraints: [String],
  
  // 3. Test Cases for Backend Logic
  testCases: [
    {
      input: String,
      expected: String
    }
  ],

  // 4. Starter Code (Jo User ko Frontend editor me dikhega)
  // Ye waisa hi rahega jaisa abhi hai
  starterCode: {
    type: Object, // Example: { cpp: "class Solution...", python: "class Solution..." }
    required: true
  },

  // ✅ 5. NEW: Driver Code Templates (Jo Backend Piston pe run karega)
  // Pehle ye Shayad String tha, ab ise Object bana diya hai
  driverCodeTemplates: {
    cpp: { 
        type: String, 
        default: "" // Default empty string agar generate nahi hua
    },
    java: { 
        type: String, 
        default: "" 
    },
    python: { 
        type: String, 
        default: "" 
    },
    javascript: { 
        type: String, 
        default: "" 
    }
  }

}, { timestamps: true });

module.exports = mongoose.model("ProblemStatement", problemStatementSchema);