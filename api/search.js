export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "OPENROUTER_API_KEY is missing"
      });
    }

    const { naturalLanguage, filters } = req.body || {};

    const prompt = `
You are CARMATCH AI, an expert worldwide car recommendation assistant.

User request:
${naturalLanguage || "No request provided"}

Filters:
${JSON.stringify(filters || {}, null, 2)}

Recommend exactly 3 cars that best match the user's requirements.

Prioritize:
- worldwide manufacturers
- newest available generation
- model years 2026 or 2027 when available
- correct generation
- correct model year
- performance
- price
- seats
- drivetrain
- practicality
- maintenance costs

For every car provide:
- brand
- model
- generation
- model year
- price
- power
- seats
- drivetrain
- fuel type
- advantages
- disadvantages
- maintenance information
- official manufacturer configurator URL

Return ONLY valid JSON:

{
  "cars": [
    {
      "name": "Brand Model",
      "generation": "Generation",
      "year": 2026,
      "score": 95,
      "price": "€100,000",
      "power": "300 kW",
      "seats": 2,
      "drive": "AWD",
      "fuel": "Petrol",
      "image": "",
      "photoSource": "",
      "reason": "Why this car matches",
      "pros": [
        "Advantage 1",
        "Advantage 2",
        "Advantage 3"
      ],
      "cons": [
        "Disadvantage 1",
        "Disadvantage 2"
      ],
      "maintenance": "Maintenance information",
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
          "HTTP-Referer": "https://carmatch-ai.vercel.app",
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
          temperature: 0.2
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "OpenRouter API error",
        details: data.error?.message || "Unknown error"
      });
    }

    const text =
      data.choices?.[0]?.message?.content || "";

    if (!text) {
      return res.status(500).json({
        error: "AI returned an empty response"
      });
    }

    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch (error) {
      return res.status(500).json({
        error: "AI returned invalid JSON",
        raw: text
      });
    }

    if (!Array.isArray(parsed.cars)) {
      return res.status(500).json({
        error: "AI response does not contain cars"
      });
    }

    return res.status(200).json({
      cars: parsed.cars.slice(0, 3)
    });

  } catch (error) {
    return res.status(500).json({
      error: "Backend error",
      message: error.message
    });
  }
}
