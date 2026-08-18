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

CURRENT DATE: August 18, 2026.

USER REQUEST:
${naturalLanguage}

FILTERS:
${JSON.stringify(filters, null, 2)}

Recommend exactly 3 vehicles that best match the user's requirements.

Rules:
- Consider manufacturers worldwide.
- Prefer the newest available generation.
- Prefer 2026 or 2027 when genuinely available.
- Never invent specifications.
- Never invent prices.
- Never invent model years.
- Never confuse different generations.
- Give exactly 3 vehicles.
- Rank them by how well they match the user's requirements.
- Give a realistic score from 0 to 100.
- Include advantages, disadvantages and maintenance information.
- Include trunk capacity when available.
- Include dimensions when available.
- Include an official manufacturer configurator URL ONLY when you know it is valid.
- Never invent a configurator URL.
- The entire answer must use the same language as the user's request.
- Translate all descriptive information into that language.

IMPORTANT IMAGE RULE:
Do NOT generate or invent an image URL.
Return image as an empty string.
The application will find the image separately.

Return ONLY valid JSON:

{
  "language": "auto",
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

    let text = data?.choices?.[0]?.message?.content || "";

    if (!text) {
      return res.status(500).json({
        error: "AI returned an empty response"
      });
    }

    text = text.trim();

    if (text.startsWith("```")) {
      text = text
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
    }

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

    // Find a suitable image on Wikimedia Commons
    async function findCarImage(car) {
      const search = `${car.name} ${car.generation || ""}`;

      const url =
        "https://commons.wikimedia.org/w/api.php?" +
        new URLSearchParams({
          action: "query",
          generator: "search",
          gsrsearch: search,
          gsrnamespace: "6",
          gsrlimit: "5",
          prop: "imageinfo",
          iiprop: "url|extmetadata",
          iiurlwidth: "1200",
          format: "json",
          origin: "*"
        });

      try {
        const response = await fetch(url);

        if (!response.ok) {
          return {
            image: "",
            photoSource: ""
          };
        }

        const data = await response.json();
        const pages = Object.values(data?.query?.pages || {});

        for (const page of pages) {
          const info = page?.imageinfo?.[0];

          if (!info?.thumburl && !info?.url) {
            continue;
          }

          const title = (page.title || "").toLowerCase();

          // Prefer actual image files rather than logos/icons.
          if (
            title.includes("logo") ||
            title.includes("emblem") ||
            title.includes("icon")
          ) {
            continue;
          }

          const author =
            info.extmetadata?.Artist?.value ||
            info.extmetadata?.Credit?.value ||
            "";

          const license =
            info.extmetadata?.LicenseShortName?.value ||
            "";

          return {
            image: info.thumburl || info.url,
            photoSource: `Wikimedia Commons${author ? ` — ${author}` : ""}${
              license ? ` — ${license}` : ""
            }`
          };
        }

        return {
          image: "",
          photoSource: ""
        };
      } catch {
        return {
          image: "",
          photoSource: ""
        };
      }
    }

    const cars = await Promise.all(
      result.cars.slice(0, 3).map(async car => {
        const name = car.name || "Car";

        const photo = await findCarImage(car);

        return {
          name,
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
          image: photo.image,
          photoSource: photo.photoSource,
          reason: car.reason || "",
          pros: Array.isArray(car.pros) ? car.pros : [],
          cons: Array.isArray(car.cons) ? car.cons : [],
          maintenance: car.maintenance || "Unknown",
          manufacturer: car.manufacturer || "",
          configurator: car.configurator || ""
        };
      })
    );

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
