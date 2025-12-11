const SolvedProblem = require('../models/solvedProblemModel');

// @desc    Get all problems solved by the current user
// @route   GET /api/solved-problems/me
// @access  Private
const getMySolvedProblems = async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch all records for this user
    // .select() picks only the fields we need to keep the response light
    const solvedList = await SolvedProblem.find({ user: userId })
      .select('problemId language solvedAt code -_id'); // Include 'code' if you want to show it later

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