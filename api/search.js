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

    function detectLanguage(text) {
      const t = text.toLowerCase();

      if (
        /[áäčďéíĺľňóôŕšťúýž]/.test(t) ||
        /\b(chcem|potrebujem|auto|vozidlo|kufor|výkon|pohon|cena)\b/.test(t)
      ) {
        return "sk";
      }

      if (/\b(chciałbym|samochód|potrzebuję|cena|napęd)\b/.test(t)) {
        return "pl";
      }

      if (/\b(chci|potřebuji|auto|vůz|cena|výkon)\b/.test(t)) {
        return "cs";
      }

      if (/\b(ich|möchte|brauche|preis|leistung|auto)\b/.test(t)) {
        return "de";
      }

      if (/\b(je|voiture|prix|besoin|puissance)\b/.test(t)) {
        return "fr";
      }

      if (/\b(voglio|auto|prezzo|potenza|bisogno)\b/.test(t)) {
        return "it";
      }

      if (/\b(quiero|coche|precio|potencia|necesito)\b/.test(t)) {
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

Select EXACTLY 3 vehicles that best match the user's requirements.

IMPORTANT RULES:

1. Consider manufacturers worldwide.
2. Prefer the newest genuinely available generation.
3. Never confuse different generations.
4. Never invent specifications.
5. Never invent model years.
6. Never invent prices.
7. Never invent URLs.
8. Adapt all text to the user's language.
9. Adapt market and currency to the user's market.
10. Return exactly 3 vehicles.
11. Rank them from #1 to #3.
12. Score them from 0 to 100.
13. Include advantages and disadvantages.
14. Include maintenance information.
15. Include trunk capacity when genuinely known.
16. Include dimensions when genuinely known.
17. Include the official manufacturer name.
18. Include an official manufacturer configurator URL ONLY when genuinely known.
19. Do not generate image URLs.
20. Images are searched separately by the backend.
21. Return ONLY valid JSON.
22. Do not return markdown.
23. Do not return explanations outside JSON.

PRICE RULES:

- Never invent a price.
- Never use approximate prices.
- Never use "around", "approximately", "about" or similar estimates.
- Prefer an officially published manufacturer starting price.
- Clearly distinguish starting price from configured vehicle price.
- Use the currency appropriate for the selected market.
- If a reliable official price is known, provide it.
- If a price is known but cannot be confidently verified, provide it with priceVerified false.
- If no reliable price is known, use "Cena nie je dostupná".
- Never pretend that an unverified price is verified.

Return exactly this JSON structure:

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
                  "Return ONLY valid JSON. Never return markdown, explanations, safety labels or plain text outside JSON."
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

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status).json({
        error: "OpenRouter API error",
        details:
          data?.error?.message ||
          "Unknown OpenRouter error"
      });
    }

    let text =
      data?.choices?.[0]?.message?.content || "";

    text = String(text).trim();

    if (!text) {
      return res.status(502).json({
        error: "AI returned an empty response"
      });
    }

    if (
      text.toLowerCase() === "user safety:
