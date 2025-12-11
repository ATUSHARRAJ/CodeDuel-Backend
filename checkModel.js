const { GoogleGenerativeAI } = require("@google/generative-ai");
const dotenv = require("dotenv");
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
console.log("Using Key:", apiKey ? "***********" + apiKey.slice(-4) : "MISSING");

async function check() {
  // Use raw fetch to bypass SDK version issues
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.models) {
      console.log("\n✅ AVAILABLE MODELS FOR YOUR KEY:");
      data.models.forEach(m => {
        if (m.supportedGenerationMethods.includes("generateContent")) {
          console.log(` - ${m.name.replace('models/', '')}`); // Copy this string!
        }
      });
    } else {
      console.log("❌ Error listing models:", data);
    }
  } catch (error) {
    console.error("Network Error:", error.message);
  }
}

check();