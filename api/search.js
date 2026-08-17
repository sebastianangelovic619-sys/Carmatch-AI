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
    const body = req.body || {};
    const naturalLanguage = body.naturalLanguage || "";
    const filters = body.filters || {};

    const prompt = `
You are CARMATCH AI.

Your job is to recommend exactly 3 cars that best match the user's requirements.

USER REQUEST:
${naturalLanguage}

FILTERS:
${JSON.stringify(filters, null, 2)}

IMPORTANT:
- Consider manufacturers from all over the world.
- Prefer the newest generation available.
- Prefer model year 2026 or 2027 when actually available.
- Do not invent a generation or model year.
- Do not invent specifications.
- If you are uncertain about a specification, say "unknown".
- Give practical advantages and disadvantages.
- Give realistic maintenance information.
- Give an official manufacturer configurator URL when known.
- Never pretend that an image URL is a verified photograph.
- Return exactly 3 cars.

Return ONLY valid JSON in this exact structure:

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
      "trunk": "unknown",
      "drive": "AWD",
      "fuel": "Petrol",
      "image": "",
      "photoSource": "",
      "reason": "Why this car matches the request",
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
          temperature: 0.1
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "OpenRouter API error",
        details: data.error?.message || "Unknown OpenRouter error"
      });
    }

    const text = data.choices?.[0]?.message?.content || "";

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
        details: text.substring(0, 500)
      });
    }

    if (!parsed.cars || !Array.isArray(parsed.cars)) {
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
