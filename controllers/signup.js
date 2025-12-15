const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const axios = require("axios"); // Required for GitHub
const bcrypt = require("bcryptjs"); // Required for Standard Login
const User = require("../models/userModel");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// --- Helper to Generate Token ---
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

// ==========================================
// 1. GOOGLE LOGIN (With Account Linking)
// ==========================================
const googleLogin = async (req, res) => {
  try {
    const { token } = req.body;

    // A. Verify Token with Google
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub } = payload; // sub is the Google ID

    // B. Check if user exists by Google ID
    let user = await User.findOne({ googleId: sub });

    if (user) {
      // User found via Google ID -> Login
      const jwtToken = generateToken(user._id);
      return res.json({ success: true, token: jwtToken, user });
    }

    // C. Check if user exists by Email (Account Linking)
    user = await User.findOne({ email });

    if (user) {
      // User exists (via Email/Pass or GitHub) -> Link Google ID
      user.googleId = sub;
      if (!user.profilePic) user.profilePic = picture;
      await user.save();

      const jwtToken = generateToken(user._id);
      return res.json({ success: true, token: jwtToken, user });
    }

    // D. Create New User
    user = await User.create({
      name,
      email,
      googleId: sub,
      profilePic: picture,
    });

    const jwtToken = generateToken(user._id);
    return res.json({ success: true, token: jwtToken, user });

  } catch (err) {
    console.error("Google Login Error:", err);
    return res.status(500).json({ success: false, message: "Google Login Failed" });
  }
};

// ==========================================
// 2. GITHUB LOGIN (With Account Linking)
// ==========================================
const githubLogin = async (req, res) => {
  const { code } = req.body;

  try {
    // A. Exchange Code for Access Token
    const tokenRes = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      },
      { headers: { Accept: "application/json" } }
    );

    const accessToken = tokenRes.data.access_token;
    if (!accessToken) {
      return res.status(400).json({ success: false, message: "GitHub token exchange failed" });
    }

    // B. Get User Profile
    const userRes = await axios.get("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const githubUser = userRes.data;

    // C. Get User Email (Handle private emails)
    let email = githubUser.email;
    if (!email) {
      const emailRes = await axios.get("https://api.github.com/user/emails", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const primary = emailRes.data.find((e) => e.primary && e.verified);
      email = primary ? primary.email : null;
    }

    if (!email) {
      return res.status(400).json({ success: false, message: "No verified email found on GitHub account" });
    }

    // D. Logic: Find by ID -> Find by Email -> Create
    
    // Check by GitHub ID
    let user = await User.findOne({ githubId: githubUser.id.toString() });
    if (user) {
      const token = generateToken(user._id);
      return res.json({ success: true, token, user });
    }

    // Check by Email (Account Linking)
    user = await User.findOne({ email });
    if (user) {
      user.githubId = githubUser.id.toString();
      if (!user.profilePic) user.profilePic = githubUser.avatar_url;
      await user.save();
      
      const token = generateToken(user._id);
      return res.json({ success: true, token, user });
    }

    // Create New User
    user = await User.create({
      name: githubUser.name || githubUser.login,
      email: email,
      githubId: githubUser.id.toString(),
      profilePic: githubUser.avatar_url,
    });

    const token = generateToken(user._id);
    return res.json({ success: true, token, user });

  } catch (err) {
    console.error("GitHub Login Error:", err.response?.data || err.message);
    return res.status(500).json({ success: false, message: "GitHub Login Failed" });
  }
};

// ==========================================
// 3. STANDARD LOGIN (Email & Password)
// ==========================================
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Please provide email and password" });
    }

    // A. Find User
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }

    // B. Check Password
    // (Note: If user registered via Google/GitHub, password might be null)
    if (!user.password) {
      return res.status(400).json({ success: false, message: "Please login with Google or GitHub" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }

    // C. Success
    const token = generateToken(user._id);
    return res.json({ success: true, token, user });

  } catch (err) {
    console.error("Login Error:", err);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // 1. Validation
    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Please fill in all fields" 
      });
    }

    // 2. Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: "User already exists. Please login." 
      });
    }

    // 3. Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 4. Create the new user
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      profilePic: "", // Default empty profile pic
    });

    // 5. Generate Token
    const token = generateToken(user._id);

    // 6. Return Success Response
    // (Must match the format of login/googleLogin)
    return res.status(201).json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        profilePic: user.profilePic,
      },
    });

  } catch (err) {
    console.error("Register Error:", err);
    return res.status(500).json({ 
      success: false, 
      message: "Server Error during registration" 
    });
  }
};

// ⚠️ Don't forget to export it along with others!
module.exports = { 
    register,     // <--- Add this
    login, 
    googleLogin, 
    githubLogin 
};
