const ProfileDetails = require('../models/profileDetailsModel');
const User = require('../models/userModel');

// @desc    Get current user's profile (Auto-creates if missing)
// @route   GET /api/profile/me
// @access  Private
const getProfile = async (req, res) => {
  try {
    const userId = req.user.id; // From authMiddleware

    // 1. Fetch Profile AND populate User details (email + profilePic)
    let profile = await ProfileDetails.findOne({ user: userId })
      .populate('user', 'email profilePic'); 

    // 2. AUTO-CREATE PROFILE if missing (First time login)
    if (!profile) {
      const user = await User.findById(userId);
      
      if (!user) {
        return res.status(404).json({ success: false, message: "User account not found" });
      }

      // Logic: If User model has a pic (e.g., Google), use it. Otherwise, use placeholder.
      const initialPic = (user.profilePic && user.profilePic.length > 0) 
        ? user.profilePic 
        : 'https://via.placeholder.com/150';

      // Create the default profile with NEW Schema fields
      profile = await ProfileDetails.create({
        user: userId,
        username: user.name || 'Coder', 
        fullName: user.name || 'Anonymous User',
        profilePic: initialPic,
        stats: { 
          level: 1, 
          points: 0,        // Casual XP
          rankedPoints: 0,  // 🔴 NEW: Competitive Elo starts at 0
          rank: "Bronze I",
          questionsSolved: 0,
          streak: 0
        }
      });
      
      // Re-populate so the response structure matches a normal fetch
      profile = await profile.populate('user', 'email profilePic');
    }

    // 3. SMART SYNC (The "Self-Healing" Image Logic)
    // If the Profile has a generic placeholder, BUT the User account (Google) 
    // has a real photo, prefer the real one.
    let displayPic = profile.profilePic;
    
    if (displayPic.includes('via.placeholder') && profile.user.profilePic && profile.user.profilePic.length > 0) {
        displayPic = profile.user.profilePic;
        
        // Optional: Update DB to save this sync permanently
        // await ProfileDetails.updateOne({ _id: profile._id }, { profilePic: displayPic });
    }

    // 4. Send Response
    res.status(200).json({
      success: true,
      data: {
        ...profile._doc, // Spread existing profile data
        profilePic: displayPic // Override with the best available image
      }
    });

  } catch (error) {
    console.error("Get Profile Error:", error.message);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// @desc    Update user details (Bio, GitHub, etc.)
// @route   PUT /api/profile/me
// @access  Private
const updateProfile = async (req, res) => {
  try {
    const { 
      fullName, 
      college, 
      bio, 
      preferredLanguage, 
      github, 
      profilePic,
      username 
    } = req.body;

    // 1. Build the update object safely
    // ⚠️ CRITICAL: We do NOT allow updating 'stats' here. 
    // Stats (Rank/Points) are only updated by the Game Engine (matchController).
    const updateFields = {};
    
    if (fullName) updateFields.fullName = fullName;
    if (college) updateFields.college = college;
    if (bio) updateFields.bio = bio;
    if (preferredLanguage) updateFields.preferredLanguage = preferredLanguage;
    if (github) updateFields.github = github;
    if (profilePic) updateFields.profilePic = profilePic;
    if (username) updateFields.username = username;

    // 2. Find and Update
    let profile = await ProfileDetails.findOneAndUpdate(
      { user: req.user.id },
      { $set: updateFields },
      { new: true, runValidators: true } // returns updated doc
    ).populate('user', 'email profilePic');

    if (!profile) {
      return res.status(404).json({ success: false, message: "Profile not found" });
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: profile
    });

  } catch (error) {
    console.error("Update Profile Error:", error.message);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

module.exports = { getProfile, updateProfile };