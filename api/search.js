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
You are CARMATCH AI, a worldwide automotive research and recommendation assistant.

CURRENT DATE:
August 17, 2026.

USER REQUEST:
${naturalLanguage}

FILTERS:
${JSON.stringify(filters, null, 2)}

YOUR TASK:

Find the 3 best vehicles matching the user's requirements.

IMPORTANT:

1. Use web search for current information.
2. Search the web before deciding on the vehicles.
3. Prefer official manufacturer websites for specifications.
4. Verify the model year.
5. Verify the exact generation.
6. Prefer the newest generation available.
7. Prefer 2026 or 2027 when actually available.
8. Never invent a model year.
9. Never confuse an older generation with a newer generation.
10. Consider vehicles worldwide.
11. Compare multiple suitable vehicles before selecting the final 3.
12. Return exactly 3 vehicles.
13. The response language MUST be the same language as the user's request.
14. Translate ALL descriptive information into that language.
15. Technical names, model names and official URLs may remain in their original form.
16. Do not invent a photograph URL.
17. Do not invent a configurator URL.
18. Only provide a configurator URL if it was found and verified through web research.
19. If no verified configurator exists, return an empty string.
20. If an exact photograph cannot be verified, return an empty image URL instead of a random photograph.
21. Do not present uncertain information as fact.
22. Give a confidence level for important information.
23. Give a short explanation of why each vehicle was selected.

For each vehicle find, when available:

- brand
- model
- exact generation
- model year
- current price
- power
- seats
- trunk capacity
- drivetrain
- fuel/powertrain
- body type
- approximate dimensions
- advantages
- disadvantages
- maintenance information
- reason for selection
- official manufacturer website
- verified official configurator
- verified photograph
- source URLs

PHOTO REQUIREMENT:

The photograph must correspond as closely as possible to:
brand + model + generation + model year.

Do NOT use an older-generation photograph simply because it is easier to find.

CONFIGURATOR REQUIREMENT:

Only return a configurator URL if the page was actually found during web research and appears to be an official manufacturer page.

LANGUAGE REQUIREMENT:

Detect the language of the user's request automatically.

If the user writes Slovak, answer in Slovak.
If the user writes English, answer in English.
If the user writes Czech, answer in Czech.
If the user writes German, answer in German.
If the user writes Italian, answer in Italian.
If the user writes French, answer in French.
If the user writes Spanish, answer in Spanish.

The entire user-facing description must use that language.

Return ONLY valid JSON.

Use exactly this structure:

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
      "seats": 2,
      "trunk": "400 l",
      "drive": "AWD",
      "fuel": "Petrol",
      "body": "Coupe",
      "dimensions": "Length information",
      "image": "",
      "photoSource": "",
      "reason": "Why this vehicle was selected",
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


          temperature: 0.1
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "OpenRouter API error",
        details:
          data?.error?.message ||
          data?.error ||
          "Unknown OpenRouter error"
      });
    }

    const text =
      data?.choices?.[0]?.message?.content || "";

    if (!text) {
      return res.status(500).json({
        error: "AI returned an empty response"
      });
    }

    let cleanedText = text.trim();

    if (cleanedText.startsWith("```")) {
      cleanedText = cleanedText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
    }

    let parsed;

    try {
      parsed = JSON.parse(cleanedText);
    } catch (error) {
      return res.status(500).json({
        error: "AI returned invalid JSON",
        details: cleanedText.substring(0, 1000)
      });
    }

    if (!parsed || !Array.isArray(parsed.cars)) {
      return res.status(500).json({
        error: "AI response does not contain cars"
      });
    }

    const cars = parsed.cars.slice(0, 3).map(car => ({
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
      language: parsed.language || "auto",
      cars
    });

  } catch (error) {
    return res.status(500).json({
      error: "Backend error",
      message: error.message
    });
  }
}
