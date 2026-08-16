
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { naturalLanguage, filters, resultCount = 3 } = req.body || {};

    if (!naturalLanguage && !filters) {
      return res.status(400).json({
        error: "Missing search requirements"
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY is not configured"
      });
    }

    const prompt = `
You are CARMATCH AI, an expert worldwide automotive recommendation assistant.

USER REQUEST:
${naturalLanguage || "No natural-language request."}

FILTERS:
${JSON.stringify(filters || {}, null, 2)}

TASK:
Find the ${resultCount} best matching vehicles.

Priorities:
1. Consider vehicles worldwide.
2. Prefer the newest currently available generation.
3. Prefer model years 2026 or 2027 when available.
4. Do not confuse an old generation with the newest generation.
5. Vehicle photographs must correspond to the exact generation/model.
6. Prefer high-quality current photographs.
7. Prefer official manufacturer information for specifications.
8. Include an official manufacturer configurator when available.
9. Explain why each vehicle matches the user's requirements.
10. Include advantages, disadvantages and maintenance considerations.

Return ONLY valid JSON in this structure:

{
  "cars": [
    {
      "name": "Brand Model",
      "generation": "Generation",
      "year": 2026,
      "score": 95,
      "price": "€...",
      "power": "... kW",
      "seats": "...",
      "trunk": "...",
      "drive": "...",
      "fuel": "...",
      "image": "...",
      "photoSource": "...",
      "reason": "...",
      "pros": ["...", "..."],
      "cons": ["...", "..."],
      "maintenance": "...",
      "configurator": "..."
    }
  ]
}
`;

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-5",
          input: prompt
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      return res.status(response.status).json({
        error: "OpenAI API error",
        details: errorText
      });
    }

    const data = await response.json();

    const text =
      data.output_text ||
      data.output?.map(item =>
        item.content
          ?.map(content => content.text || "")
          .join("")
      ).join("") ||
      "";

    let result;

    try {
      result = JSON.parse(text);
    } catch {
      return res.status(500).json({
        error: "AI returned invalid JSON",
        raw: text
      });
    }

    return res.status(200).json(result);

    
  } catch (error) {

    console.error(error);

    return res.status(500).json({
      error: "Server error",
      message: error.message
    });
  }
}
