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
You are CARMATCH AI, a professional worldwide automotive recommendation system.

CURRENT DATE: August 17, 2026.

USER REQUEST:
${naturalLanguage}

FILTERS:
${JSON.stringify(filters, null, 2)}

TASK:
Find exactly 3 vehicles that best match the user's requirements.

IMPORTANT RULES:

1. Use web search when current information is needed.
2. Consider vehicles from manufacturers worldwide.
3. Prefer the newest generation actually available.
4. Verify model year before presenting it.
5. Never confuse an old generation with a new generation.
6. Prefer model year 2026 or 2027 when genuinely available.
7. Never invent specifications.
8. Never invent prices.
9. Never invent photographs.
10. Never invent configurator URLs.
11. If a fact cannot be reliably verified, write "Unknown".
12. Prefer official manufacturer sources for specifications.
13. Prefer official manufacturer websites for configurators.
14. Return exactly 3 vehicles.
15. Rank them according to how well they satisfy the user's requirements.
16. Calculate a realistic match score from 0 to 100.
17. Explain why each vehicle was selected.
18. Include advantages and disadvantages.
19. Include maintenance information.
20. Include trunk capacity when available.
21. Include dimensions when available.
22. Include a source list.
23. The answer MUST use the same language as the user's request.
24. Translate all user-facing descriptive information into that language.
25. Keep official model names and URLs unchanged.

PHOTO RULE:

Only provide an image URL if web research found a photograph that clearly corresponds to the same model and generation.

Do not use an older generation photograph simply because it is easier to find.

If an exact photograph cannot be reliably verified:
image = ""

CONFIGURATOR RULE:

Only provide a configurator URL if it is an official manufacturer URL and was found during web research.

Never invent a URL.

If there is no verified configurator:
configurator = ""

LANGUAGE:

Detect the language automatically.

Slovak → Slovak
English → English
Czech → Czech
German → German
French → French
Italian → Italian
Spanish → Spanish
Polish → Polish
Hungarian → Hungarian

Return ONLY valid JSON.

FORMAT:

{
  "language": "sk",
  "cars": [
    {
      "name": "Brand Model",
      "generation": "Exact generation",
      "year": 2026,
      "score": 95,
      "price": "€100,000",
      "power": "300 kW",
      "seats": 5,
      "trunk": "500 l",
      "drive": "AWD",
      "fuel": "Petrol",
      "body": "SUV",
      "dimensions": "Length × width × height",
      "image": "",
      "photoSource": "",
      "reason": "Why this vehicle matches",
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
      "manufacturer": "",
      "configurator": "",
      "sources": [
        {
          "title": "Source title",
          "url": "https://example.com"
        }
      ]
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

          tools: [
            {
              type: "openrouter:web_search",
              parameters: {
                max_results: 3,
                max_total_results: 6,
                search_context_size: "low"
              }
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
        details: data?.error?.message || "Unknown OpenRouter error"
      });
    }

    const text = data?.choices?.[0]?.message?.content || "";

    if (!text) {
      return res.status(500).json({
        error: "AI returned an empty response"
      });
    }

    let cleaned = text.trim();

    if (cleaned.startsWith("```")) {
      cleaned = cleaned
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
    }

    let result;

    try {
      result = JSON.parse(cleaned);
    } catch {
      return res.status(500).json({
        error: "AI returned invalid JSON",
        details: cleaned.substring(0, 800)
      });
    }

    if (!result || !Array.isArray(result.cars)) {
      return res.status(500).json({
        error: "AI response does not contain cars"
      });
    }

    const cars = result.cars.slice(0, 3).map(car => ({
      name: car.name || "Unknown vehicle",
      generation: car.generation || "Unknown",
      year: car.year || "",
      score: car.score ?? "",
      price: car.price || "Unknown",
      power: car.power || "Unknown",
      seats: car.seats || "Unknown",
      trunk: car.trunk || "Unknown",
      drive: car.drive || "Unknown",
      fuel: car.fuel || "Unknown",
      body: car.body || "Unknown",
      dimensions: car.dimensions || "Unknown",
      image: car.image || "",
      photoSource: car.photoSource || "",
      reason: car.reason || "",
      pros: Array.isArray(car.pros) ? car.pros : [],
      cons: Array.isArray(car.cons) ? car.cons : [],
      maintenance: car.maintenance || "Unknown",
      manufacturer: car.manufacturer || "",
      configurator: car.configurator || "",
      sources: Array.isArray(car.sources) ? car.sources : []
    }));

    return res.status(200).json({
      language: result.language || "auto",
      cars
    });

  } catch (error) {
    console.error("CARMATCH BACKEND ERROR:", error);

    return res.status(500).json({
      error: "Backend error",
      message: error.message
    });
  }
}
