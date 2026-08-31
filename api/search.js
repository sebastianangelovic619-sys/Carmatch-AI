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
    const {
      naturalLanguage = "",
      filters = {}
    } = req.body || {};

    const userText = String(
      naturalLanguage || ""
    ).trim();

    /* =====================================================
       LANGUAGE
       ===================================================== */

    function detectLanguage(text) {
      const t = text.toLowerCase();

      if (
        /[áäčďéíĺľňóôŕšťúýž]/.test(t) ||
        /\b(chcem|potrebujem|auto|vozidlo|kufor|výkon|pohon|cena|miest)\b/.test(t)
      ) {
        return "sk";
      }

      if (
        /\b(chci|potřebuji|auto|vozidlo|kufr|výkon|pohon|cena)\b/.test(t)
      ) {
        return "cs";
      }

      if (
        /\b(ich|möchte|brauche|fahrzeug|preis|leistung|allrad)\b/.test(t)
      ) {
        return "de";
      }

      if (
        /\b(voiture|prix|besoin|puissance)\b/.test(t)
      ) {
        return "fr";
      }

      if (
        /\b(voglio|macchina|prezzo|potenza|bisogno)\b/.test(t)
      ) {
        return "it";
      }

      if (
        /\b(quiero|coche|precio|potencia|necesito)\b/.test(t)
      ) {
        return "es";
      }

      if (
        /\b(chcę|samochód|cena|moc|potrzebuję)\b/.test(t)
      ) {
        return "pl";
      }

      return "en";
    }

    const language = detectLanguage(userText);

    const marketMap = {
      sk: "Slovakia / European Union",
      cs: "Czech Republic / European Union",
      de: "Germany / European Union",
      fr: "France / European Union",
      it: "Italy / European Union",
      es: "Spain / European Union",
      pl: "Poland / European Union",
      en: "International market"
    };

    const market =
      marketMap[language] ||
      "International market";

    /* =====================================================
       PROMPT
       ===================================================== */

    const prompt = `
You are CARMATCH AI, a professional worldwide automotive recommendation assistant.

CURRENT DATE:
August 31, 2026

USER LANGUAGE:
${language}

USER MARKET:
${market}

USER REQUEST:
${userText}

FILTERS:
${JSON.stringify(filters, null, 2)}

Choose EXACTLY 3 vehicles that best match the user's requirements.

IMPORTANT RULES:

1. Consider manufacturers worldwide.
2. Prefer the newest genuinely available generation.
3. Never confuse different generations.
4. Never invent specifications.
5. Never invent model years.
6. Never invent prices.
7. Never invent URLs.
8. Match the user's market whenever possible.
9. Return exactly 3 vehicles.
10. Rank them from #1 to #3.
11. Give a realistic score from 0 to 100.
12. Include advantages.
13. Include disadvantages.
14. Include maintenance information.
15. Include trunk capacity when known.
16. Include dimensions when known.
17. Include the manufacturer.
18. Include an official manufacturer configurator URL only when genuinely known.
19. Do not generate image URLs.
20. Images are searched separately by the backend.
21. All descriptive text must use the user's language.

PRICE RULE:

Never guess a price.

If a reliable starting price is genuinely known, provide it.

If no reliable price is known:

"price": "Cena nie je dostupná"

and:

"priceVerified": false

Never use:
- around
- approximately
- about
- roughly
- similar estimates

If a known price cannot be confidently verified from the manufacturer:

priceVerified = false

Never invent a price simply to fill the field.

Return ONLY JSON.
Do not return reasoning.
Do not return thinking.
Do not return markdown.
Do not return safety labels.
Do not return text before or after JSON.
`;

    /* =====================================================
       OPENROUTER MODELS
       ===================================================== */

    const models = [
      "google/gemma-4-26b-a4b-it:free",
      "meta-llama/llama-4-scout:free",
      "qwen/qwen3-30b-a3b:free"
    ];

    /* =====================================================
       JSON SCHEMA
       ===================================================== */

    const schema = {
      type: "object",
      additionalProperties: false,

      properties: {
        language: {
          type: "string"
        },

        market: {
          type: "string"
        },

        cars: {
          type: "array",
          minItems: 3,
          maxItems: 3,

          items: {
            type: "object",
            additionalProperties: false,

            properties: {
              name: {
                type: "string"
              },

              generation: {
                type: "string"
              },

              year: {
                type: "string"
              },

              score: {
                type: "number"
              },

              price: {
                type: "string"
              },

              priceVerified: {
                type: "boolean"
              },

              priceSource: {
                type: "string"
              },

              priceType: {
                type: "string"
              },

              power: {
                type: "string"
              },

              seats: {
                type: "string"
              },

              trunk: {
                type: "string"
              },

              drive: {
                type: "string"
              },

              fuel: {
                type: "string"
              },

              body: {
                type: "string"
              },

              dimensions: {
                type: "string"
              },

              reason: {
                type: "string"
              },

              pros: {
                type: "array",
                items: {
                  type: "string"
                }
              },

              cons: {
                type: "array",
                items: {
                  type: "string"
                }
              },

              maintenance: {
                type: "string"
              },

              manufacturer: {
                type: "string"
              },

              configurator: {
                type: "string"
              }
            },

            required: [
              "name",
              "generation",
              "year",
              "score",
              "price",
              "priceVerified",
              "priceSource",
              "priceType",
              "power",
              "seats",
              "trunk",
              "drive",
              "fuel",
              "body",
              "dimensions",
              "reason",
              "pros",
              "cons",
              "maintenance",
              "manufacturer",
              "configurator"
            ]
          }
        }
      },

      required: [
        "language",
        "market",
        "cars"
      ]
    };

    /* =====================================================
       OPENROUTER REQUEST WITH AUTOMATIC FALLBACK
       ===================================================== */

    async function askModel(model) {
      const controller =
        new AbortController();

      const timer =
        setTimeout(() => {
          controller.abort();
        }, 15000);

      try {
        const response =
          await fetch(
            "https://openrouter.ai/api/v1/chat/completions",
            {
              method: "POST",

              signal:
                controller.signal,

              headers: {
                "Authorization":
                  `Bearer ${apiKey}`,

                "Content-Type":
                  "application/json",

                "HTTP-Referer":
                  "https://carmatchai.vercel.app",

                "X-Title":
                  "CARMATCH AI"
              },

              body: JSON.stringify({
                model,

                messages: [
                  {
                    role: "system",
                    content:
                      "Return ONLY valid JSON. Never return reasoning, thinking, markdown or safety labels."
                  },
                  {
                    role: "user",
                    content: prompt
                  }
                ],

                temperature: 0.1,

                max_tokens: 2600,

                response_format: {
                  type: "json_schema",

                  json_schema: {
                    name:
                      "carmatch_results",

                    strict: true,

                    schema
                  }
                }
              })
            }
          );

        const raw =
          await response.text();

        if (!response.ok) {
          return {
            ok: false,
            status:
              response.status,
            error:
              raw.substring(0, 1000)
          };
        }

        let data;

        try {
          data =
            JSON.parse(raw);
        } catch {
          return {
            ok: false,
            status: 502,
            error:
              "Invalid OpenRouter response"
          };
        }

        let content =
          data?.choices?.[0]?.message?.content ||
          "";

        if (Array.isArray(content)) {
          content =
            content
              .map(item =>
                typeof item === "string"
                  ? item
                  : item?.text || ""
              )
              .join("");
        }

        content =
          String(content).trim();

        if (!content) {
          return {
            ok: false,
            status: 502,
            error:
              "Empty AI response"
          };
        }

        return {
          ok: true,
          content
        };

      } catch (error) {

        if (
          error?.name ===
          "AbortError"
        ) {
          return {
            ok: false,
            status: 504,
            error:
              "Model timeout"
          };
        }

        return {
          ok: false,
          status: 500,
          error:
            error?.message ||
            "Model request failed"
        };

      } finally {
        clearTimeout(timer);
      }
    }

    /* =====================================================
       TRY MODELS ONE BY ONE
       ===================================================== */

    let aiContent = "";

    const modelErrors = [];

    for (const model of models) {

      const result =
        await askModel(model);

      if (result.ok) {
        aiContent =
          result.content;

        break;
      }

      modelErrors.push({
        model,
        status:
          result.status,
        error:
          result.error
      });

      /*
        Continue automatically after:
        429 rate limit
        500 provider error
        502 invalid response
        504 timeout
      */

      continue;
    }

    if (!aiContent) {
      console.error(
        "ALL AI MODELS FAILED:",
        modelErrors
      );

      return res.status(503).json({
        error:
          "AI is temporarily unavailable",

        message:
          "Všetky dostupné AI modely sú momentálne zaneprázdnené. Skús vyhľadávanie o chvíľu znova."
      });
    }

    /* =====================================================
       CLEAN AI JSON
       ===================================================== */

    let text =
      String(aiContent).trim();

    text =
      text
        .replace(
          /^```json\s*/i,
          ""
        )
        .replace(
          /^```\s*/i,
          ""
        )
        .replace(
          /\s*```$/i,
          ""
        )
        .trim();

    /*
      Some providers may accidentally
      put text around the JSON.
    */

    const first =
      text.indexOf("{");

    const last =
      text.lastIndexOf("}");

    if (
      first === -1 ||
      last === -1 ||
      last <= first
    ) {
      console.error(
        "AI DID NOT RETURN JSON:",
        text.substring(0, 2000)
      );

      return res.status(502).json({
        error:
          "AI response did not contain JSON"
      });
    }

    text =
      text.substring(
        first,
        last + 1
      );

    let result;

    try {
      result =
        JSON.parse(text);

    } catch (error) {

      console.error(
        "INVALID AI JSON:",
        text.substring(0, 2000)
      );

      return res.status(502).json({
        error:
          "AI returned invalid JSON",

        details:
          text.substring(0, 500)
      });
    }

    /* =====================================================
       VALIDATE RESULT
       ===================================================== */

    if (
      !result ||
      !Array.isArray(result.cars) ||
      result.cars.length !== 3
    ) {
      return res.status(502).json({
        error:
          "AI did not return exactly 3 cars"
      });
    }

    /* =====================================================
       IMAGE SEARCH
       ===================================================== */

    async function searchWikimedia(query) {

      const controller =
        new AbortController();

      const timer =
        setTimeout(() => {
          controller.abort();
        }, 3000);

      try {

        const url =
          "https://commons.wikimedia.org/w/api.php?" +
          new URLSearchParams({
            action:
              "query",

            generator:
              "search",

            gsrsearch:
              query,

            gsrnamespace:
              "6",

            gsrlimit:
              "5",

            prop:
              "imageinfo",

            iiprop:
              "url|mime",

            iiurlwidth:
              "1200",

            format:
              "json",

            origin:
              "*"
          });

        const response =
          await fetch(url, {
            signal:
              controller.signal
          });

        if (!response.ok) {
          return null;
        }

        const data =
          await response.json();

        const pages =
          Object.values(
            data?.query?.pages ||
            {}
          );

        for (const page of pages) {

          const info =
            page?.imageinfo?.[0];

          if (!info) {
            continue;
          }

          const image =
            info.thumburl ||
            info.url;

          if (!image) {
            continue;
          }

          const mime =
            String(
              info.mime || ""
            ).toLowerCase();

          if (
            !mime.startsWith("image/")
          ) {
            continue;
          }

          const title =
            String(
              page.title || ""
            ).toLowerCase();

          if (
            title.includes("logo") ||
            title.includes("emblem") ||
            title.includes("icon") ||
            title.includes("badge") ||
            title.includes("symbol") ||
            title.includes("flag")
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
        clearTimeout(timer);
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
        `${name} car`,
        `${name} automobile`
      ];

      for (
        const query of queries
      ) {

        const photo =
          await searchWikimedia(
            query
          );

        if (
          photo?.image
        ) {
          return photo;
        }
      }

      return {
        image: "",
        photoSource: ""
      };
    }

    /*
      Search all 3 images simultaneously.
    */

    const photos =
      await Promise.all(
        result.cars
          .slice(0, 3)
          .map(car =>
            findCarImage(car)
          )
      );

    /* =====================================================
       FINAL DATA
       ===================================================== */

    const cars =
      result.cars
        .slice(0, 3)
        .map((car, index) => {

          const photo =
            photos[index] || {};

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
              Number.isFinite(
                Number(car.score)
              )
                ? Number(car.score)
                : 0,

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
              car.seats ||
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
              isValidURL(
                car.configurator
              )
                ? car.configurator
                : ""
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
      "CARMATCH BACKEND ERROR:",
      error
    );

    return res.status(500).json({
      error:
        "Backend error",

      message:
        error?.message ||
        "Unknown backend error"
    });
  }
}


/* =======================================================
   URL VALIDATION
   ======================================================= */

function isValidURL(value) {

  if (
    typeof value !==
    "string"
  ) {
    return false;
  }

  try {

    const url =
      new URL(value);

    return (
      url.protocol ===
        "https:" ||
      url.protocol ===
        "http:"
    );

  } catch {

    return false;
  }
}
