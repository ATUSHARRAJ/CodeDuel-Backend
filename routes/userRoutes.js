const router = require("express").Router();
const signupController = require("../controllers/signup");  // this is a function
const { getAllProblems } = require('../controllers/problemController');
 const { submitCode } = require('../controllers/submitController');
 const { getProfile, updateProfile } = require('../controllers/profileController');
 const { getMySolvedProblems } = require('../controllers/solvedProblemController');
const { protect } = require('../middleware/authMiddleware');

// Define the GET route
router.post("/auth/google-login", signupController);
router.get('/all-problems', getAllProblems);
router.post('/submit', protect, submitCode);
router.route('/profile/me')
  .get(protect, getProfile)    // Fetch
  .put(protect, updateProfile);
router.get('/solved-problems/me', protect, getMySolvedProblems);

module.exports = router;
