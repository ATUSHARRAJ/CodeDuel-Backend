const ProblemStatement = require("../models/problemStatementModel");
const SolvedProblem = require("../models/solvedProblemModel");
const ProfileDetails = require("../models/profileDetailsModel");
const { generateDriverCodeWithAI } = require("../utils/aiAgent");
const axios = require("axios");

const PISTON_API = "https://emkc.org/api/v2/piston/execute";

const LANGUAGE_MAP = {
    'c++': 'cpp',
    'cpp': 'cpp',
    'python': 'python',
    'py': 'python',
    'java': 'java',
    'javascript': 'javascript',
    'js': 'javascript',
    'node': 'javascript'
};

const submitCode = async (req, res) => {
    const { problemId, userCode, language } = req.body;
    const userId = req.user.id;

    if (!problemId || !userCode || !language) {
        return res.status(400).json({ success: false, message: "Missing fields" });
    }

    try {
        const problem = await ProblemStatement.findOne({ id: problemId });
        if (!problem) return res.status(404).json({ success: false, message: "Problem not found" });

        const langKey = LANGUAGE_MAP[language.toLowerCase()];
        if (!langKey) return res.status(400).json({ success: false, message: "Unsupported language" });

        let template = "";
        let isNewGenerated = false; // Flag to track if we need to save later

        // 1. Check Cache
        if (problem.driverCodeTemplates && problem.driverCodeTemplates[langKey]) {
            console.log(`✅ Using Cached Template for ${langKey}`);
            template = problem.driverCodeTemplates[langKey];
        } else {
            console.log(`⚠️ Template missing for ${langKey}. Generating via AI...`);
            template = await generateDriverCodeWithAI(langKey, problem.starterCode, problem.testCases);
            isNewGenerated = true; // Mark true, but DON'T SAVE YET
        }

        // 2. Prepare Code
        const finalDriverCode = template.replace("##USER_CODE_HERE##", userCode);

        // 3. Execute on Piston
        const payload = {
            language: langKey,
            version: "*",
            files: [{ content: finalDriverCode }]
        };

        const response = await axios.post(PISTON_API, payload);
        const result = response.data;

        // ---------------------------------------------------------
        // 🛑 ERROR HANDLING & SAVING LOGIC
        // ---------------------------------------------------------

        // Check for Runtime Errors (Segfault, etc.) or Compilation Errors
        if (result.run.code !== 0 || result.run.signal) {
            console.log("❌ Execution Failed. Template will NOT be saved.");
            // Agar template naya tha aur fail hua, toh hum usse save nahi karenge.
            // Taaki agli baar AI dubara fresh try kare.
            
            return res.json({ 
                success: false, 
                status: "Runtime/Compilation Error", 
                output: result.run.stderr || result.run.stdout,
                debug: "Code execution failed, so template was not cached."
            });
        }

        // ✅ SUCCESS CASE: Code ran successfully (Exit Code 0)
        // Ab hum template save kar sakte hain agar wo naya tha
        if (isNewGenerated) {
            if (!problem.driverCodeTemplates) problem.driverCodeTemplates = {};
            
            problem.driverCodeTemplates[langKey] = template;
            problem.markModified('driverCodeTemplates');
            await problem.save();
            console.log(`💾 Verified & Saved New Template for ${langKey}`);
        }

        const output = result.run.output ? result.run.output.trim() : "";

        // 4. Final Verdict
        if (output.includes("Accepted")) {
            // ... (Save SolvedProblem Logic Same as Before) ...
            
            const existingSolution = await SolvedProblem.findOne({ user: userId, problemId: problemId });
            if (existingSolution) {
                existingSolution.code = userCode;
                existingSolution.language = language;
                await existingSolution.save();
                return res.json({ success: true, status: "Accepted", output: "All Test Cases Passed! (Updated)" });
            } else {
                await SolvedProblem.create({ user: userId, problemId: Number(problemId), language: language, code: userCode });
                const profile = await ProfileDetails.findOne({ user: userId });
                if (profile) {
                    profile.stats.questionsSolved += 1;
                    profile.stats.points += 10;
                    await profile.save();
                }
                return res.json({ success: true, status: "Accepted", output: "All Test Cases Passed!", points: 10 });
            }
        } else {
            return res.json({ success: false, status: "Wrong Answer", output: output });
        }

    } catch (error) {
        console.error("Submit Error:", error.message);
        return res.status(500).json({ success: false, message: "Internal Server Execution Failed" });
    }
};

module.exports = { submitCode };