const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const uri = process.env.DATABASE_URL;

    if (!uri) {
      console.error("DATABASE_URL not found in .env");
      process.exit(1);
    }

    const conn = await mongoose.connect(uri);

    console.log("MongoDB Connected:", conn.connection.host);
  } catch (err) {
    console.error("Error connecting to MongoDB:", err.message);
    process.exit(1);
  }
};

module.exports = connectDB;
