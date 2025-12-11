// Import the model
const problemStatement = require("../models/problemStatementModel");

// Controller function to get all problems
const getAllProblems = async (req, res) => {
  try {
    // 1. Fetch all documents BUT exclude 'testCases'
    // .select('-testCases') means "return everything EXCEPT testCases
    const problems = await problemStatement.find({}).select('-testCases');

    // 2. Check if data exists
    if (!problems || problems.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "No problem statements found." 
      });
    }

    // 3. Send the data to the frontend
    return res.status(200).json({
      success: true,
      count: problems.length,
      data: problems
    });

  } catch (error) {
    console.error("Error fetching problems:", error);
    // 4. Handle server errors
    return res.status(500).json({
      success: false,
      message: "Server Error: Unable to fetch problems.",
      error: error.message
    });
  }
};

// Export the controller to be used in routes
module.exports = { getAllProblems };