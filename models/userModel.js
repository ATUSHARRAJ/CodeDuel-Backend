const mongoose = require("mongoose"); // 1. Use require instead of import

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    googleId: {
      type: String,
      default: null,
    },
    profilePic: {
      type: String,
      default: "",
    },
    password: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// 2. ❌ DELETE THIS LINE: export default mongoose.model("User", userSchema);

// 3. ✅ REPLACE WITH THIS:
module.exports = mongoose.model("User", userSchema);