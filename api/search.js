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

  const timeout = (ms) => {
    const controller = new AbortController();

    const timer = setTimeout(() => {
      controller.abort();
    }, ms);

    return {
      signal: controller.signal,
      clear: () => clearTimeout(timer)
    };
  };

  try {
    const { naturalLanguage = "", filters = {} } = req.body || {};

    const userText = String(naturalLanguage || "").trim();

    /*
      -------------------------------------------------------
      LANGUAGE / MARKET
      -------------------------------------------------------
    */

    function detectLanguage(text) {
      const t = text.toLowerCase();

      if (
        /[áäčďéíĺľňóôŕšťúýž]/.test(t) ||
        /\b(chcem|potrebujem|auto|vozidlo|kufor|výkon|pohon|cena)\b/.test(t)
      ) {
        return "sk";
      }

      if (
        /\b(chciałbym|samochód|potrzebuję|cena|napęd)\b/.test(t)
      ) {
        return "pl";
      }

      if (
        /\b(chci|potřebuji|auto|vůz|cena|výkon)\b/.test(t)
      ) {
        return "cs";
      }

      if (
        /\b(ich|möchte|brauche|preis|leistung|auto)\b/.test(t)
      ) {
        return "de";
      }

      if (
        /\b(je|voiture|prix|besoin|puissance)\b/.test(t)
      ) {
        return "fr";
      }

      if (
        /\b(voglio|auto|prezzo|potenza|bisogno)\b/.test(t)
      ) {
        return "it";
      }

      if (
        /\b(quiero|coche|precio|potencia|necesito)\b/.test(t)
      ) {
        return "es";
      }

      return "en";
    }

    const language = detectLanguage(userText);

    const marketMap = {
      sk: "Slovakia / European Union",
      cs: "Czech Republic / European Union",
      pl: "Poland / European Union",
      de: "Germany / European Union",
      fr: "France / European Union",
      it: "Italy / European Union",
      es: "Spain / European Union",
      en: "International market"
    };

    const market = marketMap[language] || "International market";

    /*
      -------------------------------------------------------
      AI PROMPT
      -------------------------------------------------------
    */

    const prompt = `
You are CARMATCH AI, a professional worldwide automotive recommendation assistant.

CURRENT DATE: August 31, 2026.

USER LANGUAGE:
${language}

USER MARKET:
${market}

USER REQUEST:
${userText}

FILTERS:
${JSON.stringify(filters, null, 2)}

Your task:

Select EXACTLY 3 vehicles that best match the user's requirements.

IMPORTANT RULES:

1. Consider manufacturers worldwide.
2. Prefer the newest genuinely available generation.
3. Never confuse generations.
4. Never invent specifications.
5. Never invent model years.
6. Never invent prices.
7. Never claim that a price is verified unless you actually have a reliable source.
8. If the exact manufacturer's price is not known, use:
   "Cena neoverená"
9. Do NOT use approximate prices such as:
   "around €80,000"
   "approximately €80,000"
   "about €80,000"
10. Adapt the market to the user's language.
11. Adapt currency and market information to the user's market when possible.
12. Give exactly 3 vehicles.
13. Rank them from #1 to #3.
14. Score them from 0 to 100.
15. Include advantages and disadvantages.
16. Include maintenance information.
17. Include trunk capacity when genuinely known.
18. Include dimensions when genuinely known.
19. Include the official manufacturer name.
20. Include an official manufacturer configurator URL ONLY if you genuinely know it.
21. Never invent URLs.
22. Do NOT generate image URLs.
23. Images will be searched separately by the backend.
24. Return ONLY valid JSON.
25. All text must be written in the user's language.

PRICE RULE:

Always provide a price when a reliable current starting price is known.

Use the manufacturer's officially published starting price whenever possible.

IMPORTANT:
- Do NOT invent a price.
- Do NOT use an approximate price.
- Do NOT use "around", "approximately", "about", or similar estimates.
- Distinguish clearly between "starting price" and the price of a configured vehicle.
- If only a starting price is known, explicitly label it as a starting price.
- Use the currency appropriate for the selected market.
- Prefer the official manufacturer's price for the selected market.
- If an exact official price is known, set priceVerified to true.
- If the price is known but cannot be confidently verified from the manufacturer, set priceVerified to false but still provide the known price and clearly state that it requires verification.
- Never replace a known price with "Cena neoverená".
- If no reliable price is known at all, use "Cena nie je dostupná".

Examples:

"price": "84 990 €",
"priceVerified": true,
"priceSource": "Oficiálny cenník výrobcu",
"priceType": "starting_price"

OR

"price": "84 990 €",
"priceVerified": false,
"priceSource": "Cena vyžaduje overenie",
"priceType": "starting_price"

OR, only when no reliable price is available:

"price": "Cena nie je dostupná",
"priceVerified": false,
"priceSource": "",
"priceType": "unknown"

Never invent a price simply to fill the field.
Return this exact structure:

{
  "language": "${language}",
  "market": "${market}",
  "cars": [
    {
      "name": "Brand Model",
      "generation": "Exact generation",
      "year": 2026,
      "score": 95,
      "price": "Cena neoverená",
      "priceVerified": false,
      "priceSource": "",
      "power": "300 kW",
      "seats": 5,
      "trunk": "500 l",
      "drive": "AWD",
      "fuel": "Petrol",
      "body": "SUV",
      "dimensions": "Length × width × height",
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
      "manufacturer": "Manufacturer",
      "configurator": ""
    }
  ]
}
`;

    /*
      -------------------------------------------------------
      OPENROUTER
      -------------------------------------------------------
    */

    const requestTimeout = timeout(22000);

    let response;

    try {
      response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          signal: requestTimeout.signal,
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
      role: "system",
      content:
        "Return ONLY valid JSON. Never return explanations, safety labels, markdown or plain text."
    },
    {
      role: "user",
      content: prompt
    }
  ],
  temperature: 0.1,
  max_tokens: 3500,
  response_format: {
    type: "json_object"
  }
})
          })
        }
      );
    } catch (error) {
      if (error.name === "AbortError") {
        return res.status(504).json({
          error: "AI request timed out",
          message:
            "Vyhľadávanie trvalo príliš dlho. Skús požiadavku zopakovať."
        });
      }

      throw error;
    } finally {
      requestTimeout.clear();
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status).json({
        error: "OpenRouter API error",
        details:
          data?.error?.message ||
          "Unknown OpenRouter error"
      });
    }

    if (
  text.trim().toLowerCase() === "user safety: safe"
) {
  return res.status(502).json({
    error: "AI returned a safety status instead of vehicle data"
  });
}

    if (!text) {
      return res.status(500).json({
        error: "AI returned an empty response"
      });
    }

    text = String(text).trim();

    /*
      -------------------------------------------------------
      CLEAN JSON
      -------------------------------------------------------
    */

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
    } catch (error) {
      console.error("INVALID AI JSON:", text);

      return res.status(500).json({
        error: "AI returned invalid JSON",
        details: text.substring(0, 500)
      });
    }

    if (
      !result ||
      !Array.isArray(result.cars) ||
      result.cars.length < 3
    ) {
      return res.status(500).json({
        error: "AI response does not contain 3 cars"
      });
    }

    /*
      -------------------------------------------------------
      WIKIMEDIA IMAGE SEARCH
      -------------------------------------------------------
    */

    async function searchWikimedia(query) {
      const url =
        "https://commons.wikimedia.org/w/api.php?" +
        new URLSearchParams({
          action: "query",
          generator: "search",
          gsrsearch: query,
          gsrnamespace: "6",
          gsrlimit: "8",
          prop: "imageinfo",
          iiprop: "url|extmetadata",
          iiurlwidth: "1200",
          format: "json",
          origin: "*"
        });

      const controller = timeout(5000);

      try {
        const response = await fetch(url, {
          signal: controller.signal
        });

        if (!response.ok) {
          return null;
        }

        const data = await response.json();

        const pages =
          Object.values(
            data?.query?.pages || {}
          );

        for (const page of pages) {
          const info =
            page?.imageinfo?.[0];

          if (!info) continue;

          const image =
            info.thumburl || info.url;

          if (!image) continue;

          const title =
            String(page.title || "").toLowerCase();

          /*
            Reject logos/icons and obviously irrelevant files.
          */

          if (
            title.includes("logo") ||
            title.includes("emblem") ||
            title.includes("icon") ||
            title.includes("badge") ||
            title.includes("symbol")
          ) {
            continue;
          }

          return {
            image,
            photoSource: "Wikimedia Commons"
          };
        }

        return null;
      } catch {
        return null;
      } finally {
        controller.clear();
      }
    }

    async function findCarImage(car) {
      const name =
        String(car.name || "").trim();

      const generation =
        String(car.generation || "").trim();

      /*
        Several searches are attempted.
        This greatly improves the chance of finding
        an actual vehicle photograph.
      */

      const queries = [
        `${name} ${generation}`,
        `${name} ${generation} automobile`,
        `${name} car`,
        `${name} vehicle`
      ];

      for (const query of queries) {
        const result =
          await searchWikimedia(query);

        if (result?.image) {
          return result;
        }
      }

      return {
        image: "",
        photoSource: ""
      };
    }

    /*
      Search all 3 images in parallel.
      This is important for speed.
    */

    const photoResults =
      await Promise.all(
        result.cars
          .slice(0, 3)
          .map(car => findCarImage(car))
      );

    /*
      -------------------------------------------------------
      FINAL RESULT
      -------------------------------------------------------
    */

    const cars =
      result.cars
        .slice(0, 3)
        .map((car, index) => {

          const photo =
            photoResults[index] || {};

          return {
            name:
              car.name || "Neznáme auto",

            generation:
              car.generation || "Neznáma generácia",

            year:
              car.year || "",

            score:
              car.score ?? "",

            price:
  car.price || "Cena nie je dostupná",

priceVerified:
  car.priceVerified === true,

priceSource:
  car.priceSource || "",

priceType:
  car.priceType || "unknown",

            power:
              car.power || "Údaj nie je dostupný",

            seats:
              car.seats ?? "Údaj nie je dostupný",

            trunk:
              car.trunk || "Údaj nie je dostupný",

            drive:
              car.drive || "Údaj nie je dostupný",

            fuel:
              car.fuel || "Údaj nie je dostupný",

            body:
              car.body || "Údaj nie je dostupný",

            dimensions:
              car.dimensions ||
              "Údaj nie je dostupný",

            image:
              photo.image || "",

            photoSource:
              photo.photoSource || "",

            reason:
              car.reason || "",

            pros:
              Array.isArray(car.pros)
                ? car.pros.slice(0, 4)
                : [],

            cons:
              Array.isArray(car.cons)
                ? car.cons.slice(0, 4)
                : [],

            maintenance:
              car.maintenance ||
              "Údaj nie je dostupný",

            manufacturer:
              car.manufacturer || "",

            configurator:
              car.configurator || ""
          };
        });

    return res.status(200).json({
      language:
        result.language || language,

      market:
        result.market || market,

      cars
    });

  } catch (error) {
    console.error(
      "CARMATCH ERROR:",
      error
    );

    return res.status(500).json({
      error: "Backend error",
      message:
        error?.message ||
        "Unknown backend error"
    });
  }
}
