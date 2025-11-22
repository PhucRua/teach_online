import { GoogleGenAI, Type } from "@google/genai";
import { MODEL_IDS } from "../constants";
import { AIResult } from "../types";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const solveMathFromImage = async (
  base64Image: string,
  userPrompt: string
): Promise<AIResult> => {
  try {
    const systemInstruction = `
      You are a Math expert. 
      1. OCR the text in the image accurately. Use LaTeX for math expressions wrapped in $.
      2. Solve the problem step-by-step clearly in Vietnamese.
      3. Return the result as a valid JSON object with keys "ocr" and "solution".
    `;

    const response = await ai.models.generateContent({
      model: MODEL_IDS.VISION,
      contents: {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Image
            }
          },
          {
            text: `REQUEST:
            - Read the image (OCR).
            - Solve it.
            - Format: JSON { "ocr": "...", "solution": "..." }
            ${userPrompt ? `User Note: ${userPrompt}` : ''}`
          }
        ]
      },
      config: {
        temperature: 0.2,
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            ocr: { type: Type.STRING },
            solution: { type: Type.STRING }
          },
          required: ["ocr", "solution"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");

    const parsed = JSON.parse(text);
    return {
      ocr: parsed.ocr || "OCR Failed",
      solution: parsed.solution || "Could not generate solution."
    };

  } catch (error) {
    console.error("Gemini Error:", error);
    throw error;
  }
};

export const generateTikzCode = async (
  description: string,
  type: 'bbt' | 'graph' | 'chart'
): Promise<string> => {
  try {
    const contextMap = {
      bbt: "Create a Variation Table (bảng biến thiên) using tkz-tab.",
      graph: "Create a Function Graph with axis and grid.",
      chart: "Create a Chart (Pie or Bar)."
    };

    // Strict prompt to avoid conversational filler
    const prompt = `
      Task: Write LaTeX/TikZ code.
      Type: ${contextMap[type]}
      User Description: ${description}
      
      STRICT RULES:
      1. Return ONLY the code. No explanation. No markdown backticks.
      2. Start immediately with \\begin{tikzpicture}
      3. End immediately with \\end{tikzpicture}
      4. Ensure all packages used are standard (tikz, pgfplots, tkz-tab).
    `;

    const response = await ai.models.generateContent({
      model: MODEL_IDS.TEXT,
      contents: prompt,
      config: {
        temperature: 0.1, // Lower temperature for more deterministic code
      }
    });

    let text = response.text || "";
    
    // robust cleanup
    text = text.replace(/```latex/g, '').replace(/```/g, '');
    
    const match = text.match(/\\begin{tikzpicture}[\s\S]*?\\end{tikzpicture}/);
    if (match) {
      text = match[0];
    } else {
        // Fallback: if regex fails, assume the whole text is code if it looks like it
        if (!text.includes("\\begin{tikzpicture}")) {
             text = `\\begin{tikzpicture}\n${text}\n\\end{tikzpicture}`;
        }
    }
    
    return text.trim();
  } catch (error) {
    console.error("TikZ Generation Error:", error);
    throw error;
  }
};