const SolvedProblem = require('../models/solvedProblemModel');

// @desc    Get all problems solved by the current user
// @route   GET /api/solved-problems/me
// @access  Private
const getMySolvedProblems = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // 1. Find the ONE document for this user that holds the array of solutions
    const userProgress = await SolvedProblem.findOne({ user: userId });

    // 2. If the user has never solved a problem, return an empty list (Success)
    if (!userProgress) {
        return res.status(200).json({
            success: true,
            count: 0,
            data: [] 
        });
    }

    // 3. Extract the 'problems' array from the document
    // This array contains objects like: { problemId: 1, code: "...", language: "cpp", ... }
    const solvedList = userProgress.problems;

    // 4. Send the array to the frontend
    res.status(200).json({
      success: true,
      count: solvedList.length,
      data: solvedList
    });

  } catch (error) {
    console.error("Get Solved Problems Error:", error.message);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

module.exports = { getMySolvedProblems };