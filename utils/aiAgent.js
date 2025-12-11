 
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const generateDriverCodeWithAI = async (language, userCode, testCases) => {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) throw new Error("Missing GROQ_API_KEY");

  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 3000;
  let attempts = 0;

  // ✅ Best Model for Logic
  const MODEL = "llama-3.3-70b-versatile"; 

  while (attempts < MAX_RETRIES) {
    try {
      const prompt = `
        You are a specialized Code Execution Agent.
        
        **GOAL:** Generate a single, complete source file in ${language} that includes the User's Code and runs it against the Test Cases.

        **USER CODE:**
        ${userCode}

        **TEST CASES (JSON):**
        ${JSON.stringify(testCases)}

        **STRICT RULES:**
        1. **PRESERVE USER CODE:** You MUST inject the **USER CODE** provided above exactly as is. Do not refactor, change, or remove a single character of the user's logic. Place it before the main function (or appropriate runner).
        2. **NO PARSING IN CODE:** Do NOT write code that uses 'substr', 'find', or 'stringstream' to parse the inputs at runtime. 
           - Instead, YOU (the AI) must extract the raw values from the JSON strings now.
           - Example: If input is "s = \"anagram\", t = \"nagaram\"", you must generate C++ vectors: 
             \`vector<string> s_vals = {"anagram", ...};\`
             \`vector<string> t_vals = {"nagaram", ...};\`
        3. **HANDLE MULTIPLE ARGUMENTS:** If the user function takes multiple arguments (like s and t), create separate vectors for each argument.
        4. **NO EXTERNAL LIBS:** Use only standard libraries (<iostream>, <vector>, <string>, <algorithm>).
        5. **NAMESPACE:** For C++, always include 'using namespace std;'.
        6. **VERDICT ONLY:** Print "Accepted" if all pass. Print "Wrong Answer" and exit(0) if any fail. No debug output.

        **OUTPUT:** Raw code only. No markdown.
      `;

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: "You are a coding engine. Write only executable code." },
            { role: "user", content: prompt }
          ],
          temperature: 0.1, 
        }),
      });

      if (!response.ok) throw new Error(`Groq API Error: ${response.statusText}`);

      const data = await response.json();
      let text = data.choices?.[0]?.message?.content || "";

      // Cleanup Markdown
      text = text.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim();
      console.log(text);
      // 🛡️ Safety: Ensure Headers & Namespace
      if (language === "cpp") {
        if (!text.includes("#include <iostream>")) text = "#include <iostream>\n" + text;
        if (!text.includes("#include <vector>")) text = "#include <vector>\n" + text;
        if (!text.includes("using namespace std;")) text = "using namespace std;\n" + text;
      }

      return text;

    } catch (error) {
      attempts++;
      console.error(`Attempt ${attempts} failed: ${error.message}`);
      
      if (error.message.includes("429")) {
        await sleep(RETRY_DELAY_MS);
      } else {
        throw error;
      }
    }
  }
  throw new Error("Failed to generate driver code.");
};

module.exports = { generateDriverCodeWithAI };