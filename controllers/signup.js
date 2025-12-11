const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
// 1. ✅ REMOVED ".default" (Now compatible with module.exports)
const User = require("../models/userModel"); 

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const googleLogin = async (req, res) => {
  try {
    const { token } = req.body;

    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub } = payload;

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name,
        email,
        googleId: sub,
        profilePic: picture, // This syncs perfectly with your Schema
      });
    }

    const jwtToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    return res.json({
      success: true,
      token: jwtToken,
      user,
    });

  } catch (err) {
    console.error("Google Login Error:", err);
    return res.status(500).json({ message: "Google Login Failed" });
  }
};

module.exports = googleLogin;