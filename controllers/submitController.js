const ProblemStatement = require("../models/problemStatementModel");
const SolvedProblem = require("../models/solvedProblemModel");
const ProfileDetails = require("../models/profileDetailsModel");
const { generateDriverCodeWithAI } = require("../utils/aiAgent");
const axios = require("axios");

const PISTON_API = "https://emkc.org/api/v2/piston/execute";

// Piston Versions Map (Better Approach)
const LANGUAGE_VERSIONS = {
    'cpp': '10.2.0',
    'python': '3.10.0',
    'java': '15.0.2',
    'javascript': '18.15.0'
};

const submitCode = async (req, res) => {
  const { problemId, userCode, language } = req.body;
  const userId = req.user.id; 

  if (!problemId || !userCode || !language) {
    return res.status(400).json({ success: false, message: "Missing fields" });
  }

  try {
    // 1. Fetch Problem
    const problem = await ProblemStatement.findOne({ id: problemId });
    if (!problem) return res.status(404).json({ success: false, message: "Problem not found" });

    // Language normalization
    let langKey = language.toLowerCase();
    if (langKey === 'c++') langKey = 'cpp';

    // 2. AI Driver Code Generation
    const fullCode = await generateDriverCodeWithAI(langKey, userCode, problem.testCases);

    // 3. Piston Execution
    const payload = {
        language: langKey,
        // Use '*' if you don't care about specific version, or use the map
        version: LANGUAGE_VERSIONS[langKey] || "*", 
        files: [{ content: fullCode }]
    };

    const response = await axios.post(PISTON_API, payload);
    const result = response.data;

    // 4. Handle Compile/Runtime Errors
    if (result.run.stderr) {
        return res.json({ success: false, status: "Runtime Error", output: result.run.stderr });
    }

    const output = result.run.output ? result.run.output.trim() : "";

    // ---------------------------------------------------------
    // ✅ SUCCESS LOGIC
    // ---------------------------------------------------------
    if (output.includes("Accepted")) {
        
        // A. Check for existing solution
        const existingSolution = await SolvedProblem.findOne({ user: userId, problemId: problemId });

        if (existingSolution) {
            // Update code only
            existingSolution.code = userCode;
            existingSolution.language = language;
            await existingSolution.save();
            
            return res.json({ 
                success: true, 
                status: "Accepted", 
                output: "All Test Cases Passed! (Solution Updated)",
                pointsAwarded: 0 
            });

        } else {
            // B. First Time Solve
            
            // 1. Save Solution
            await SolvedProblem.create({
                user: userId,
                problemId: Number(problemId),
                language: language,
                code: userCode
            });

            // 2. Update Profile Stats
            const profile = await ProfileDetails.findOne({ user: userId });
            
            let newRank = null;
            let pointsGiven = 0;

            // SAFETY CHECK: Agar profile galti se delete ho gayi ho
            if (profile) {
                profile.stats.questionsSolved += 1;
                profile.stats.points += 10;
                pointsGiven = 10;
                
                // Assuming updateRank() is a method on your Schema
                if (typeof profile.updateRank === 'function') {
                    newRank = profile.updateRank(); 
                }
                
                await profile.save();
            } else {
                console.error(`Profile not found for user ${userId} during submission`);
                // Optional: Create profile here if missing
            }

            return res.json({ 
                success: true, 
                status: "Accepted", 
                output: "All Test Cases Passed!",
                pointsAwarded: pointsGiven,
                newRank: newRank
            });
        }

    } else {
        // ❌ Wrong Answer (AI didn't print Accepted)
        return res.json({ success: false, status: "Wrong Answer", output: output });
    }

  } catch (error) {
    console.error("Submit Error:", error.message);
    return res.status(500).json({ success: false, message: "Server execution failed" });
  }
};

module.exports = { submitCode };