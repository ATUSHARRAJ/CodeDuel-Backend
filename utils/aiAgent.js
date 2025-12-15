const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const generateDriverCodeWithAI = async (language, starterCode, testCases) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Missing GROQ_API_KEY");

  const MAX_RETRIES = 3;
  let attempts = 0;
  
  // Strongest model for logic
  const MODEL = "llama-3.3-70b-versatile"; 

  const langKey = language.toLowerCase();
  
  // Convert starter code to string for context
  const starterCodeStr = typeof starterCode === 'object' ? JSON.stringify(starterCode) : starterCode;

  // ------------------------------------------------------------------
  // ⚡ ULTIMATE LANGUAGE RULES (Global Scope Placement)
  // ------------------------------------------------------------------
  const LANG_CONFIG = {
    'cpp': `
      - **Structure:** 1. Write Headers (#include <bits/stdc++.h>,#include <iostream>, <vector>, <string>, <algorithm>, <map>, <set>) and 'using namespace std;'.
        2. **GLOBAL SCOPE:** Write '##USER_CODE_HERE##' outside of any function or class. (Do NOT wrap it in 'class Solution' yourself, the user provides the class).
        3. **MAIN FUNCTION:** Inside 'int main()', instantiate 'Solution solution;' and run tests.
      - **Syntax:** Convert JSON arrays directly to C++ initializer lists (e.g., JSON '[1,2]' becomes '{1, 2}').
    `,
    'java': `
      - **Structure:**
        1. always include import java.util.*;
        2. Define 'public class Main {'.
        3. Inside Main, create 'public static void main(String[] args)'.
        4. **OUTSIDE Main** (after closing brace of Main), write '##USER_CODE_HERE##'. (This allows the user's 'class Solution' to exist as a sibling class).
        5. In main(), instantiate 'Solution sol = new Solution();'.
      - **Syntax:** Use 'new int[]{...}' for arrays and 'Arrays.equals()' for comparison.
    `,
    'python': `
      - **Structure:**
        1. Always include from typing import * at the top.
        2. Write '##USER_CODE_HERE##' at the very top level.
        3. Write 'if __name__ == "__main__":' block below.
        4. Instantiate 'sol = Solution()'.
      - **Syntax:** Convert 'true'->'True', 'false'->'False', 'null'->'None'.
    `,
    'javascript': `
      - **Structure:** 1. Write '##USER_CODE_HERE##' at the top.
        2. Below it, write the test runner logic.
        3. Instantiate 'const sol = new Solution();' or call function directly based on starter code context.
    `
  };

  const selectedRules = LANG_CONFIG[langKey] || LANG_CONFIG['cpp'];

  while (attempts < MAX_RETRIES) {
    try {
      const prompt = `
        You are a Senior Code Architect.
        
        **GOAL:** Generate a Driver Code Wrapper for **${language}**.
        
        **CRITICAL INSTRUCTION:** - The "User Code" ALREADY contains the Class and Function definitions.
        - **DO NOT** write 'class Solution' or function signatures yourself.
        - **DO NOT** wrap the placeholder in another class.
        - simply place '##USER_CODE_HERE##' at the Global Scope.

        **INPUTS:**
        1. **Starter Code Context:** ${starterCodeStr}
        2. **Test Cases:** ${JSON.stringify(testCases)}

        **LANGUAGE SPECIFIC RULES:**
        ${selectedRules}

        **RUNNER LOGIC (Inside Main/Runner):**
        - **NO PARSING:** Hardcode the test case values from JSON directly into native variables (vectors, arrays, etc.).
        - Call the user's function.
        - Compare output with expected result strictly.
        - Print "Accepted" if ALL pass.
        - Print "Wrong Answer" if ANY fail. 
        - (Optional: Print failure details like "Expected X but got Y").

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
            { role: "system", content: "You are a coding engine. Output only valid code." },
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
      // 🛡️ Safety: Ensure C++ Headers exist if AI forgets
      if (langKey === 'cpp' && !text.includes("#include <vector>")) {
         text = "#include <iostream>\n#include <vector>\n#include <string>\n#include <algorithm>\nusing namespace std;\n\n" + text;
      }

      return text;

    } catch (error) {
      attempts++;
      console.error(`Attempt ${attempts} failed: ${error.message}`);
      await sleep(2000);
    }
  }
  throw new Error("Failed to generate driver code.");
};

module.exports = { generateDriverCodeWithAI };