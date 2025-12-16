const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const axios = require("axios");
const bcrypt = require("bcryptjs");
const User = require("../models/userModel");

// Google OAuth Client
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ==============================
// Helper: Generate JWT
// ==============================
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

// ==============================
// 1. GOOGLE LOGIN (Account Linking)
// ==============================
const googleLogin = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Google token missing",
      });
    }

    // Verify Google ID Token
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub } = payload;

    // A. Find by Google ID
    let user = await User.findOne({ googleId: sub });

    if (user) {
      const jwtToken = generateToken(user._id);
      return res.json({ success: true, token: jwtToken, user });
    }

    // B. Account Linking via Email
    user = await User.findOne({ email });

    if (user) {
      user.googleId = sub;
      if (!user.profilePic) user.profilePic = picture;
      await user.save();

      const jwtToken = generateToken(user._id);
      return res.json({ success: true, token: jwtToken, user });
    }

    // C. Create New User
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
    return res.status(500).json({
      success: false,
      message: "Google Login Failed",
    });
  }
};

// ==============================
// 2. GITHUB LOGIN (Account Linking)
// ==============================
const githubLogin = async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "GitHub authorization code missing",
      });
    }

    // A. Exchange Code → Access Token
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
      return res.status(400).json({
        success: false,
        message: "GitHub token exchange failed",
      });
    }

    // B. Get GitHub User
    const userRes = await axios.get("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const githubUser = userRes.data;

    // C. Get Email (if private)
    let email = githubUser.email;
    if (!email) {
      const emailRes = await axios.get(
        "https://api.github.com/user/emails",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      const primary = emailRes.data.find(
        (e) => e.primary && e.verified
      );

      email = primary ? primary.email : null;
    }

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "No verified email found on GitHub account",
      });
    }

    // D. Find by GitHub ID
    let user = await User.findOne({
      githubId: githubUser.id.toString(),
    });

    if (user) {
      const token = generateToken(user._id);
      return res.json({ success: true, token, user });
    }

    // E. Account Linking via Email
    user = await User.findOne({ email });

    if (user) {
      user.githubId = githubUser.id.toString();
      if (!user.profilePic) user.profilePic = githubUser.avatar_url;
      await user.save();

      const token = generateToken(user._id);
      return res.json({ success: true, token, user });
    }

    // F. Create New User
    user = await User.create({
      name: githubUser.name || githubUser.login,
      email,
      githubId: githubUser.id.toString(),
      profilePic: githubUser.avatar_url,
    });

    const token = generateToken(user._id);
    return res.json({ success: true, token, user });

  } catch (err) {
    console.error("GitHub Login Error:", err.message);
    console.log("DETAILS:", err.response?.data);

    return res.status(500).json({
      success: false,
      message: "GitHub Login Failed",
      details: err.response?.data,
    });
  }
};

// ==============================
// 3. EMAIL + PASSWORD LOGIN
// ==============================
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password required",
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    if (!user.password) {
      return res.status(400).json({
        success: false,
        message: "Please login using Google or GitHub",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const token = generateToken(user._id);
    return res.json({ success: true, token, user });

  } catch (err) {
    console.error("Login Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// ==============================
// 4. REGISTER
// ==============================
const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      profilePic: "",
    });

    const token = generateToken(user._id);
    return res.status(201).json({
      success: true,
      token,
      user,
    });

  } catch (err) {
    console.error("Register Error:", err);
    return res.status(500).json({
      success: false,
      message: "Registration failed",
    });
  }
};

// ==============================
// EXPORTS
// ==============================
module.exports = {
  register,
  login,
  googleLogin,
  githubLogin,
};
