// const ProblemStatement = require("../models/problemStatementModel");
// const SolvedProblem = require("../models/solvedProblemModel");
// const ProfileDetails = require("../models/profileDetailsModel");
// const { generateDriverCodeWithAI } = require("../utils/aiAgent");
// const axios = require("axios");

// const PISTON_API = "https://emkc.org/api/v2/piston/execute";

// const LANGUAGE_MAP = {
//     'c++': 'cpp',
//     'cpp': 'cpp',
//     'python': 'python',
//     'py': 'python',
//     'java': 'java',
//     'javascript': 'javascript',
//     'js': 'javascript',
//     'node': 'javascript'
// };

// const submitCode = async (req, res) => {
//     const { problemId, userCode, language } = req.body;
//     const userId = req.user.id;

//     if (!problemId || !userCode || !language) {
//         return res.status(400).json({ success: false, message: "Missing fields" });
//     }

//     try {
//         const problem = await ProblemStatement.findOne({ id: problemId });
//         if (!problem) return res.status(404).json({ success: false, message: "Problem not found" });

//         const langKey = LANGUAGE_MAP[language.toLowerCase()];
//         if (!langKey) return res.status(400).json({ success: false, message: "Unsupported language" });

//         let template = "";
//         let isNewGenerated = false; 

//         // 1. Check Cache or Generate
//         if (problem.driverCodeTemplates && problem.driverCodeTemplates[langKey]) {
//             console.log(`✅ Using Cached Template for ${langKey}`);
//             template = problem.driverCodeTemplates[langKey];
//         } else {
//             console.log(`⚠️ Template missing for ${langKey}. Generating via AI...`);
//             template = await generateDriverCodeWithAI(langKey, problem.starterCode, problem.testCases);
//             isNewGenerated = true;
//         }

//         // 2. Prepare Code
//         const finalDriverCode = template.replace("##USER_CODE_HERE##", userCode);

//         // 3. Execute on Piston
//         const payload = {
//             language: langKey,
//             version: "*",
//             files: [{ content: finalDriverCode }]
//         };

//         const response = await axios.post(PISTON_API, payload);
//         const result = response.data;

//         // 🛑 RUNTIME ERROR CHECK
//         if (result.run.code !== 0 || result.run.signal) {
//             console.log("❌ Execution Failed. Template will NOT be saved.");
//             return res.json({ 
//                 success: false, 
//                 status: "Runtime/Compilation Error", 
//                 output: result.run.stderr || result.run.stdout
//             });
//         }

//         // ✅ SAVE TEMPLATE IF NEW & SUCCESSFUL
//         if (isNewGenerated) {
//             if (!problem.driverCodeTemplates) problem.driverCodeTemplates = {};
//             problem.driverCodeTemplates[langKey] = template;
//             problem.markModified('driverCodeTemplates');
//             await problem.save();
//             console.log(`💾 Verified & Saved New Template for ${langKey}`);
//         }

//         const output = result.run.output ? result.run.output.trim() : "";

//         // 4. FINAL VERDICT & DB UPDATE
//         if (output.includes("Accepted")) {
            
//             // --- UPDATED LOGIC START ---
//             let pointsAwarded = 0;
//             let statusMessage = "Accepted";

//             // A. Find User's Progress Doc
//             let progress = await SolvedProblem.findOne({ user: userId });

//             if (!progress) {
//                 // Case 1: First time solving ANY problem -> Create Doc
//                 progress = await SolvedProblem.create({
//                     user: userId,
//                     problems: [{ problemId: Number(problemId), code: userCode, language }]
//                 });
//                 pointsAwarded = 10;
//                 statusMessage = "All Test Cases Passed! (+10 Points)";
//             } else {
//                 // Case 2: Doc exists -> Check if THIS problem is in array
//                 const existingIndex = progress.problems.findIndex(p => p.problemId === Number(problemId));

//                 if (existingIndex > -1) {
//                     // Update existing solution (No Points)
//                     progress.problems[existingIndex].code = userCode;
//                     progress.problems[existingIndex].language = language;
//                     progress.problems[existingIndex].solvedAt = Date.now();
//                     statusMessage = "Solution Updated (Already Solved)";
//                 } else {
//                     // Add new solution (Award Points)
//                     progress.problems.push({ problemId: Number(problemId), code: userCode, language });
//                     pointsAwarded = 10;
//                     statusMessage = "All Test Cases Passed! (+10 Points)";
//                 }
//                 await progress.save();
//             }

//             // B. Update Profile Stats (Only if points awarded)
//             if (pointsAwarded > 0) {
//                 const profile = await ProfileDetails.findOne({ user: userId });
//                 if (profile) {
//                     profile.stats.questionsSolved += 1;
//                     profile.stats.points += pointsAwarded;
//                     await profile.save();
//                 }
//             }
//             // --- UPDATED LOGIC END ---

//             return res.json({ 
//                 success: true, 
//                 status: "Accepted", 
//                 output: statusMessage, 
//                 pointsAwarded 
//             });

//         } else {
//             return res.json({ success: false, status: "Wrong Answer", output: output });
//         }

//     } catch (error) {
//         console.error("Submit Error:", error.message);
//         return res.status(500).json({ success: false, message: "Internal Server Execution Failed" });
//     }
// };

// module.exports = { submitCode };


const ProblemStatement = require("../models/problemStatementModel");
const SolvedProblem = require("../models/solvedProblemModel");
const ProfileDetails = require("../models/profileDetailsModel");
const { generateDriverCodeWithAI } = require("../utils/aiAgent");
const axios = require("axios");

// ✅ Judge0 Public API
const JUDGE0_API = "https://ce.judge0.com";

// ✅ Language mapping (IMPORTANT CHANGE)
const LANGUAGE_MAP = {
    'c++': 54,
    'cpp': 54,
    'python': 71,
    'py': 71,
    'java': 62,
    'javascript': 63,
    'js': 63,
    'node': 63
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
        let isNewGenerated = false;

        // 1. Cache / Generate template
        if (problem.driverCodeTemplates && problem.driverCodeTemplates[language]) {
            template = problem.driverCodeTemplates[language];
        } else {
            template = await generateDriverCodeWithAI(language, problem.starterCode, problem.testCases);
            isNewGenerated = true;
        }

        const finalDriverCode = template.replace("##USER_CODE_HERE##", userCode);

        // ✅ Judge0 execution
        const response = await axios.post(
            `${JUDGE0_API}/submissions?base64_encoded=false&wait=true`,
            {
                source_code: finalDriverCode,
                language_id: langKey
            },
            {
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );

        const result = response.data;

        // ❌ Error handling
        const error = result.stderr || result.compile_output;
        if (result.status.id !== 3) {
            return res.json({
                success: false,
                status: "Runtime/Compilation Error",
                output: error || "Execution Failed"
            });
        }

        // ✅ Save template if new
        if (isNewGenerated) {
            if (!problem.driverCodeTemplates) problem.driverCodeTemplates = {};
            problem.driverCodeTemplates[language] = template;
            problem.markModified('driverCodeTemplates');
            await problem.save();
        }

        const output = result.stdout ? result.stdout.trim() : "";

        // ✅ Verdict
        if (output.includes("Accepted")) {

            let pointsAwarded = 0;
            let statusMessage = "Accepted";

            let progress = await SolvedProblem.findOne({ user: userId });

            if (!progress) {
                progress = await SolvedProblem.create({
                    user: userId,
                    problems: [{ problemId: Number(problemId), code: userCode, language }]
                });
                pointsAwarded = 10;
                statusMessage = "All Test Cases Passed! (+10 Points)";
            } else {
                const existingIndex = progress.problems.findIndex(p => p.problemId === Number(problemId));

                if (existingIndex > -1) {
                    progress.problems[existingIndex].code = userCode;
                    progress.problems[existingIndex].language = language;
                    progress.problems[existingIndex].solvedAt = Date.now();
                    statusMessage = "Solution Updated (Already Solved)";
                } else {
                    progress.problems.push({ problemId: Number(problemId), code: userCode, language });
                    pointsAwarded = 10;
                    statusMessage = "All Test Cases Passed! (+10 Points)";
                }
                await progress.save();
            }

            if (pointsAwarded > 0) {
                const profile = await ProfileDetails.findOne({ user: userId });
                if (profile) {
                    profile.stats.questionsSolved += 1;
                    profile.stats.points += pointsAwarded;
                    await profile.save();
                }
            }

            return res.json({
                success: true,
                status: "Accepted",
                output: statusMessage,
                pointsAwarded
            });

        } else {
            return res.json({ success: false, status: "Wrong Answer", output: output });
        }

    } catch (error) {
        console.error("Submit Error:", error.response?.data || error.message);
        return res.status(500).json({
            success: false,
            message: "Execution Failed"
        });
    }
};

module.exports = { submitCode };
