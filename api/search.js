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
    const { naturalLanguage = "", filters = {} } =
      req.body || {};

    const userText = String(
      naturalLanguage || ""
    ).trim();

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
        /\b(voiture|prix|besoin|puissance)\b/.test(t)
      ) {
        return "fr";
      }

      if (
        /\b(voglio|prezzo|potenza|bisogno)\b/.test(t)
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

    const market =
      marketMap[language] ||
      "International market";

    const prompt = `
You are CARMATCH AI.

Current date: August 31, 2026.

User language:
${language}

User market:
${market}

User request:
${userText}

Filters:
${JSON.stringify(filters)}

Select exactly 3 vehicles that best match the request.

IMPORTANT:

- Consider worldwide manufacturers.
- Prefer the newest genuinely available generation.
- Never confuse generations.
- Never invent specifications.
- Never invent model years.
- Never invent prices.
- Never invent URLs.
- All descriptive text must be in the user's language.
- Use the user's market where appropriate.
- Return exactly 3 vehicles.
- Rank them from 1 to 3.
- Give a score from 0 to 100.
- Include pros and cons.
- Include maintenance information.
- Include trunk capacity when genuinely known.
- Include dimensions when genuinely known.
- Include manufacturer.
- Include an official configurator URL only when genuinely known.
- Do not generate image URLs.

PRICE RULES:

- Never invent a price.
- Never use approximate prices.
- Prefer an officially published manufacturer starting price.
- Clearly identify a starting price.
- If an exact reliable price is known, provide it.
- If the price cannot be confidently verified, set priceVerified to false.
- If no reliable price is known, use "Cena nie je dostupná".

VERY IMPORTANT OUTPUT RULE:

Return ONLY one JSON object.

Do NOT write:
- thinking
- analysis
- reasoning
- explanations before JSON
- explanations after JSON
- markdown
- code fences
- "Here's a thinking process"
- "User Safety"
- any other text outside JSON.

The first character of the response must be {
The last character of the response must be }

Use exactly this structure:

{
  "language": "${language}",
  "market": "${market}",
  "cars": [
    {
      "name": "Brand Model",
      "generation": "Exact generation",
      "year": 2026,
      "score": 95,
      "price": "84 990 €",
      "priceVerified": false,
      "priceSource": "",
      "priceType": "starting_price",
      "power": "300 kW",
      "seats": 5,
      "trunk": "500 l",
      "drive": "AWD",
      "fuel": "Petrol",
      "body": "SUV",
      "dimensions": "Length × width × height",
      "reason": "Explanation in user's language",
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
            "HTTP-Referer":
              "https://carmatchai.vercel.app",
            "X-Title": "CARMATCH AI"
          },

          body: JSON.stringify({
            model: "openrouter/free",

            messages: [
              {
                role: "system",
                content:
                  "Return ONLY one valid JSON object. Do not output thinking, reasoning, analysis, markdown or any text outside the JSON object."
              },
              {
                role: "user",
                content: prompt
              }
            ],

            temperature: 0.1,
            max_tokens: 3500
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

    const data =
      await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status).json({
        error: "OpenRouter API error",
        details:
          data?.error?.message ||
          "Unknown OpenRouter error"
      });
    }

    let text =
      data?.choices?.[0]?.message?.content ||
      "";

    text = String(text).trim();

    if (!text) {
      return res.status(502).json({
        error: "AI returned an empty response"
      });
    }

    /*
      -------------------------------------------------------
      REMOVE MARKDOWN CODE FENCES
      -------------------------------------------------------
    */

    text = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    /*
      -------------------------------------------------------
      FIND JSON INSIDE EXTRA AI TEXT
      -------------------------------------------------------
    */

    function extractJSON(raw) {
      const firstBrace =
        raw.indexOf("{");

      const lastBrace =
        raw.lastIndexOf("}");

      if (
        firstBrace === -1 ||
        lastBrace === -1 ||
        lastBrace <= firstBrace
      ) {
        return null;
      }

      return raw.substring(
        firstBrace,
        lastBrace + 1
      );
    }

    const jsonText =
      extractJSON(text);

    if (!jsonText) {
      console.error(
        "NO JSON FOUND:",
        text.substring(0, 1000)
      );

      return res.status(502).json({
        error:
          "AI response did not contain JSON",
        details:
          text.substring(0, 500)
      });
    }

    let result;

    try {
      result =
        JSON.parse(jsonText);
    } catch (error) {
      console.error(
        "INVALID AI JSON:",
        jsonText.substring(0, 1000)
      );

      return res.status(502).json({
        error:
          "AI returned invalid JSON",
        details:
          jsonText.substring(0, 500)
      });
    }

    /*
      -------------------------------------------------------
      VALIDATE RESULT
      -------------------------------------------------------
    */

    if (
      !result ||
      !Array.isArray(result.cars) ||
      result.cars.length < 3
    ) {
      return res.status(502).json({
        error:
          "AI response does not contain 3 cars"
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

      const controller =
        timeout(5000);

      try {
        const imageResponse =
          await fetch(url, {
            signal:
              controller.signal
          });

        if (!imageResponse.ok) {
          return null;
        }

        const imageData =
          await imageResponse.json();

        const pages =
          Object.values(
            imageData?.query?.pages ||
              {}
          );

        for (const page of pages) {
          const info =
            page?.imageinfo?.[0];

          if (!info) continue;

          const image =
            info.thumburl ||
            info.url;

          if (!image) continue;

          const title =
            String(
              page.title || ""
            ).toLowerCase();

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
            photoSource:
              "Wikimedia Commons"
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
        String(
          car.name || ""
        ).trim();

      const generation =
        String(
          car.generation || ""
        ).trim();

      const queries = [
        `${name} ${generation}`,
        `${name} ${generation} automobile`,
        `${name} car`,
        `${name} vehicle`
      ];

      for (const query of queries) {
        const result =
          await searchWikimedia(
            query
          );

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
      -------------------------------------------------------
      SEARCH PHOTOS IN PARALLEL
      -------------------------------------------------------
    */

    const photoResults =
      await Promise.all(
        result.cars
          .slice(0, 3)
          .map(car =>
            findCarImage(car)
          )
      );

    /*
      -------------------------------------------------------
      FINAL CARS
      -------------------------------------------------------
    */

    const cars =
      result.cars
        .slice(0, 3)
        .map((car, index) => {

          const photo =
            photoResults[index] ||
            {};

          return {
            name:
              car.name ||
              "Neznáme auto",

            generation:
              car.generation ||
              "Neznáma generácia",

            year:
              car.year || "",

            score:
              car.score ?? "",

            price:
              car.price ||
              "Cena nie je dostupná",

            priceVerified:
              car.priceVerified === true,

            priceSource:
              car.priceSource || "",

            priceType:
              car.priceType ||
              "unknown",

            power:
              car.power ||
              "Údaj nie je dostupný",

            seats:
              car.seats ??
              "Údaj nie je dostupný",

            trunk:
              car.trunk ||
              "Údaj nie je dostupný",

            drive:
              car.drive ||
              "Údaj nie je dostupný",

            fuel:
              car.fuel ||
              "Údaj nie je dostupný",

            body:
              car.body ||
              "Údaj nie je dostupný",

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
        result.language ||
        language,

      market:
        result.market ||
        market,

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
