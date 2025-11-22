import { TIKZ_API_URL } from "../constants";

export const compileTikz = async (tikzCode: string): Promise<string> => {
  try {
    const response = await fetch(TIKZ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        source: tikzCode,
        mode: 'auto',
        format: 'png',
        density: 300,
        transparent: true
      })
    });

    if (!response.ok) {
      throw new Error(`TikZ API Error: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.ok && data.log) {
      throw new Error(`Compilation Failed: ${data.log}`);
    }

    return data.image_base64;
  } catch (error) {
    console.error("TikZ Compilation Error:", error);
    throw error;
  }
};
