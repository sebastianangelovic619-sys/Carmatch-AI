export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "OPENROUTER_API_KEY is missing in Vercel"
    });
  }

  try {
    const { naturalLanguage = "", filters = {} } = req.body || {};

    const prompt = `
You are CARMATCH AI, a professional worldwide automotive recommendation assistant.

User request:
${naturalLanguage}

Filters:
${JSON.stringify(filters)}

Select exactly 3 vehicles.

Rules:
- Match the user's requirements as closely as possible.
- Consider vehicles worldwide.
- Prefer the newest genuine generation.
- Prefer 2026 or 2027 when genuinely available.
- Never invent specifications.
- Never invent prices.
- If the exact manufacturer price is unknown, write "Price not verified".
- Never invent URLs.
- Use the same language as the user's request.
- Keep the answer concise.
- Return ONLY valid JSON.

Return:

{
  "language": "same language as user",
  "cars": [
    {
      "name": "",
      "generation": "",
      "year": "",
      "score": 0,
      "price": "",
      "power": "",
      "seats": "",
      "trunk": "",
      "drive": "",
      "fuel": "",
      "body": "",
      "dimensions": "",
      "image": "",
      "photoSource": "",
      "reason": "",
      "pros": [],
      "cons": [],
      "maintenance": "",
      "manufacturer": "",
      "configurator": ""
    }
  ]
}
`;

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://carmatchai.vercel.app",
          "X-Title": "CARMATCH AI"
        },
        body: JSON.stringify({
          model: "openrouter/free",
          messages: [
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.1,
          max_tokens: 1600
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "OpenRouter API error",
        details: data?.error?.message || "Unknown error"
      });
    }

    let text =
      data?.choices?.[0]?.message?.content || "";

    if (!text) {
      return res.status(500).json({
        error: "AI returned an empty response"
      });
    }

    text = text
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let result;

    try {
      result = JSON.parse(text);
    } catch {
      return res.status(500).json({
        error: "AI returned invalid JSON",
        details: text.substring(0, 500)
      });
    }

    if (!result || !Array.isArray(result.cars)) {
      return res.status(500).json({
        error: "AI response does not contain cars"
      });
    }

    const cars = result.cars
      .slice(0, 3)
      .map(car => ({
        name: car.name || "Unknown",
        generation: car.generation || "Unknown",
        year: car.year || "",
        score: car.score ?? "",
        price: car.price || "Price not verified",
        power: car.power || "Unknown",
        seats: car.seats || "Unknown",
        trunk: car.trunk || "Unknown",
        drive: car.drive || "Unknown",
        fuel: car.fuel || "Unknown",
        body: car.body || "Unknown",
        dimensions: car.dimensions || "Unknown",

        // Obrázky zatiaľ nezdržiavajú backend.
        image: "",
        photoSource: "",

        reason: car.reason || "",

        pros: Array.isArray(car.pros)
          ? car.pros.slice(0, 3)
          : [],

        cons: Array.isArray(car.cons)
          ? car.cons.slice(0, 2)
          : [],

        maintenance:
          car.maintenance || "Unknown",

        manufacturer:
          car.manufacturer || "",

        configurator:
          car.configurator || ""
      }));

    return res.status(200).json({
      language: result.language || "auto",
      cars
    });

  } catch (error) {
    console.error("CARMATCH ERROR:", error);

    return res.status(500).json({
      error: "Backend error",
      message: error.message
    });
  }
}
