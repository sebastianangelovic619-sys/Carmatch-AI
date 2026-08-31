export default async function handler(req, res) {
  /* =====================================================
     CARMATCH AI - ROBUST BACKEND
     ===================================================== */

  // -----------------------------------------------------
  // CORS
  // -----------------------------------------------------

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  // -----------------------------------------------------
  // API KEY
  // -----------------------------------------------------

  const apiKey =
    process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error:
        "OPENROUTER_API_KEY is missing in Vercel"
    });
  }

  try {
    // ---------------------------------------------------
    // INPUT
    // ---------------------------------------------------

    const {
      naturalLanguage = "",
      filters = {}
    } = req.body || {};

    const userText =
      String(
        naturalLanguage || ""
      ).trim();

    // ---------------------------------------------------
    // LANGUAGE DETECTION
    // ---------------------------------------------------

    function detectLanguage(text) {
      const t =
        String(text || "").toLowerCase();

      if (
        /[áäčďéíĺľňóôŕšťúýž]/.test(t) ||
        /\b(chcem|potrebujem|auto|vozidlo|kufor|výkon|pohon|cena|miest|rok|benzín|nafta|elektrické|hybrid)\b/.test(t)
      ) {
        return "sk";
      }

      if (
        /\b(chci|potřebuji|auto|vozidlo|kufr|výkon|pohon|cena|místa|rok)\b/.test(t)
      ) {
        return "cs";
      }

      if (
        /\b(ich|möchte|brauche|fahrzeug|preis|leistung|allrad|sitze|jahr)\b/.test(t)
      ) {
        return "de";
      }

      if (
        /\b(voiture|prix|besoin|puissance|places|année)\b/.test(t)
      ) {
        return "fr";
      }

      if (
        /\b(voglio|macchina|prezzo|potenza|bisogno|posti|anno)\b/.test(t)
      ) {
        return "it";
      }

      if (
        /\b(quiero|coche|precio|potencia|necesito|plazas|año)\b/.test(t)
      ) {
        return "es";
      }

      if (
        /\b(chcę|samochód|cena|moc|potrzebuję|miejsc|rok)\b/.test(t)
      ) {
        return "pl";
      }

      return "en";
    }

    const language =
      detectLanguage(userText);

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

    // ---------------------------------------------------
    // PROMPT
    // ---------------------------------------------------

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
3. Never confuse generations.
4. Never invent specifications.
5. Never invent model years.
6. Never invent prices.
7. Never invent URLs.
8. Match the user's market whenever possible.
9. Return EXACTLY 3 vehicles.
10. Rank them from #1 to #3.
11. Give a realistic score from 0 to 100.
12. Include advantages.
13. Include disadvantages.
14. Include maintenance information.
15. Include trunk capacity when known.
16. Include dimensions when known.
17. Include manufacturer.
18. Include official manufacturer configurator URL only when genuinely known.
19. Do not generate image URLs.
20. Images are searched separately by the backend.
21. All descriptive text must use the user's language.
22. Do not mention internal reasoning.
23. Do not mention safety systems or content labels.
24. Return valid JSON only.

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
- estimated
- similar estimate

If the manufacturer price cannot be confidently verified:

priceVerified = false

Never invent a price.

JSON STRUCTURE:

{
  "language": "string",
  "market": "string",
  "cars": [
    {
      "name": "string",
      "generation": "string",
      "year": "string",
      "score": 0,
      "price": "string",
      "priceVerified": false,
      "priceSource": "string",
      "priceType": "string",
      "power": "string",
      "seats": "string",
      "trunk": "string",
      "drive": "string",
      "fuel": "string",
      "body": "string",
      "dimensions": "string",
      "reason": "string",
      "pros": ["string"],
      "cons": ["string"],
      "maintenance": "string",
      "manufacturer": "string",
      "configurator": "string"
    }
  ]
}

Return ONLY JSON.
`;

    // ---------------------------------------------------
    // JSON SCHEMA
    // ---------------------------------------------------

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

    // ---------------------------------------------------
    // MODEL LIST
    //
    // 1. openrouter/free
    //    OpenRouter automatically selects an available
    //    free model appropriate for the request.
    //
    // 2. gpt-oss-20b:free
    //    Current free model with structured outputs.
    //
    // 3. Nemotron 3 Ultra:free
    //    Current free model, but DOES NOT support
    //    response_format, so it uses plain JSON prompt.
    // ---------------------------------------------------

    const models = [
      {
        id: "openrouter/free",
        supportsSchema: true
      },

      {
        id: "openai/gpt-oss-20b:free",
        supportsSchema: true
      },

      {
        id:
          "nvidia/nemotron-3-ultra-550b-a55b:free",
        supportsSchema: false
      }
    ];

    // ---------------------------------------------------
    // TIMEOUT
    // ---------------------------------------------------

    const MODEL_TIMEOUT =
      30000;

    // ---------------------------------------------------
    // OPENROUTER REQUEST
    // ---------------------------------------------------

    async function askModel(modelConfig) {
      const controller =
        new AbortController();

      const timer =
        setTimeout(() => {
          controller.abort();
        }, MODEL_TIMEOUT);

      try {
        const body = {
          model:
            modelConfig.id,

          messages: [
            {
              role: "system",
              content:
                "Return ONLY valid JSON. Never return markdown, reasoning, thinking, commentary or safety labels."
            },

            {
              role: "user",
              content: prompt
            }
          ],

          temperature: 0.1,

          max_tokens: 3500
        };

        /*
          response_format is used only for models where
          structured output is supported.
        */

        if (modelConfig.supportsSchema) {
          body.response_format = {
            type: "json_schema",

            json_schema: {
              name:
                "carmatch_results",

              strict: true,

              schema
            }
          };
        }

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

              body:
                JSON.stringify(body)
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
              raw.substring(0, 1500)
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
              "Invalid OpenRouter JSON response"
          };
        }

        let content =
          data?.choices?.[0]?.message?.content ||
          "";

        /*
          Some providers can return content as an array.
        */

        if (Array.isArray(content)) {
          content =
            content
              .map((item) => {
                if (
                  typeof item ===
                  "string"
                ) {
                  return item;
                }

                return (
                  item?.text ||
                  ""
                );
              })
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

          content,

          model:
            data?.model ||
            modelConfig.id
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

    // ---------------------------------------------------
    // JSON EXTRACTION
    // ---------------------------------------------------

    function extractJSON(text) {
      let cleaned =
        String(text || "")
          .trim();

      // Remove markdown blocks.
      cleaned =
        cleaned.replace(
          /^```json\s*/i,
          ""
        );

      cleaned =
        cleaned.replace(
          /^```\s*/i,
          ""
        );

      cleaned =
        cleaned.replace(
          /\s*```$/i,
          ""
        );

      // Remove obvious prefixes.
      const firstObject =
        cleaned.indexOf("{");

      const firstArray =
        cleaned.indexOf("[");

      let start = -1;

      if (
        firstObject === -1
      ) {
        start =
          firstArray;
      } else if (
        firstArray === -1
      ) {
        start =
          firstObject;
      } else {
        start =
          Math.min(
            firstObject,
            firstArray
          );
      }

      if (start < 0) {
        return null;
      }

      if (start > 0) {
        cleaned =
          cleaned.slice(start);
      }

      const lastObject =
        cleaned.lastIndexOf("}");

      const lastArray =
        cleaned.lastIndexOf("]");

      const end =
        Math.max(
          lastObject,
          lastArray
        );

      if (end < 0) {
        return null;
      }

      cleaned =
        cleaned.slice(
          0,
          end + 1
        );

      try {
        return JSON.parse(
          cleaned
        );
      } catch {
        return null;
      }
    }

    // ---------------------------------------------------
    // BASIC RESULT VALIDATION
    // ---------------------------------------------------

    function validateResult(data) {
      if (
        !data ||
        typeof data !== "object"
      ) {
        return false;
      }

      if (
        !Array.isArray(
          data.cars
        )
      ) {
        return false;
      }

      if (
        data.cars.length !== 3
      ) {
        return false;
      }

      for (
        const car of data.cars
      ) {
        if (
          !car ||
          typeof car !==
            "object"
        ) {
          return false;
        }

        if (
          typeof car.name !==
          "string" ||
          !car.name.trim()
        ) {
          return false;
        }

        if (
          typeof car.manufacturer !==
          "string"
        ) {
          return false;
        }
      }

      return true;
    }

    // ---------------------------------------------------
    // MODEL RETRY SYSTEM
    // ---------------------------------------------------

    let result = null;

    const modelErrors = [];

    for (
      let attempt = 0;
      attempt < models.length;
      attempt++
    ) {
      const model =
        models[attempt];

      const ai =
        await askModel(
          model
        );

      // Request error
      if (!ai.ok) {
        modelErrors.push({
          model:
            model.id,

          status:
            ai.status,

          error:
            ai.error
        });

        console.error(
          `CARMATCH AI MODEL FAILED: ${model.id}`,
          ai.status,
          ai.error
        );

        continue;
      }

      // Try JSON
      const parsed =
        extractJSON(
          ai.content
        );

      if (
        !parsed ||
        !validateResult(
          parsed
        )
      ) {
        modelErrors.push({
          model:
            model.id,

          status:
            502,

          error:
            "AI returned invalid or incomplete JSON"
        });

        console.error(
          `CARMATCH AI INVALID JSON: ${model.id}`,
          String(
            ai.content
          ).substring(
            0,
            2000
          )
        );

        continue;
      }

      // SUCCESS
      result =
        parsed;

      console.log(
        `CARMATCH AI SUCCESS: ${model.id}`
      );

      break;
    }

    // ---------------------------------------------------
    // LAST JSON REPAIR ATTEMPT
    //
    // Uses openrouter/free again with a tiny prompt.
    // This catches cases such as:
    // "User Safety: safe"
    // followed by valid JSON.
    // ---------------------------------------------------

    if (!result) {
      const repairPrompt = `
Convert the following AI output into valid JSON.

IMPORTANT:
- Return ONLY JSON.
- Do not explain anything.
- Do not add commentary.
- Do not add safety labels.
- The final JSON must contain EXACTLY 3 cars.
- Preserve all useful information.
- If something is missing, use an empty string.
- Do not invent vehicle facts.

OUTPUT TO REPAIR:

${modelErrors.length
  ? "Previous model responses were unsuccessful."
  : ""}
`;

      try {
        const repairController =
          new AbortController();

        const repairTimer =
          setTimeout(
            () =>
              repairController.abort(),
            18000
          );

        const repairResponse =
          await fetch(
            "https://openrouter.ai/api/v1/chat/completions",
            {
              method: "POST",

              signal:
                repairController.signal,

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

              body:
                JSON.stringify({
                  model:
                    "openrouter/free",

                  messages: [
                    {
                      role:
                        "system",

                      content:
                        "Return ONLY valid JSON."
                    },

                    {
                      role:
                        "user",

                      content:
                        `${repairPrompt}\n\nORIGINAL USER REQUEST:\n${userText}\n\nFILTERS:\n${JSON.stringify(filters)}`
                    }
                  ],

                  temperature:
                    0.05,

                  max_tokens:
                    3500
                })
            }
          );

        const repairRaw =
          await repairResponse.text();

        clearTimeout(
          repairTimer
        );

        if (
          repairResponse.ok
        ) {
          try {
            const repairData =
              JSON.parse(
                repairRaw
              );

            let repairContent =
              repairData
                ?.choices?.[0]
                ?.message
                ?.content ||
              "";

            if (
              Array.isArray(
                repairContent
              )
            ) {
              repairContent =
                repairContent
                  .map(
                    (item) =>
                      typeof item ===
                      "string"
                        ? item
                        : item?.text ||
                          ""
                  )
                  .join("");
            }

            const repaired =
              extractJSON(
                repairContent
              );

            if (
              repaired &&
              validateResult(
                repaired
              )
            ) {
              result =
                repaired;

              console.log(
                "CARMATCH AI JSON REPAIR SUCCESS"
              );
            }
          } catch (repairError) {
            console.error(
              "JSON REPAIR FAILED:",
              repairError
            );
          }
        }
      } catch (repairError) {
        console.error(
          "JSON REPAIR REQUEST FAILED:",
          repairError
        );
      }
    }

    // ---------------------------------------------------
    // ALL AI METHODS FAILED
    // ---------------------------------------------------

    if (!result) {
      console.error(
        "ALL AI MODELS FAILED:",
        modelErrors
      );

      return res.status(503).json({
        error:
          "AI is temporarily unavailable",

        message:
          "CARMATCH AI momentálne nedostal použiteľnú odpoveď od dostupných AI modelov.",

        retryable:
          true,

        details:
          process.env.NODE_ENV ===
          "development"
            ? modelErrors
            : undefined
      });
    }

    // ---------------------------------------------------
    // IMAGE SEARCH
    // ---------------------------------------------------

    async function searchWikimedia(
      query
    ) {
      const controller =
        new AbortController();

      const timer =
        setTimeout(
          () =>
            controller.abort(),
          4000
        );

      try {
        const params =
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
          await fetch(
            `https://commons.wikimedia.org/w/api.php?${params.toString()}`,
            {
              signal:
                controller.signal
            }
          );

        if (
          !response.ok
        ) {
          return null;
        }

        const data =
          await response.json();

        const pages =
          Object.values(
            data?.query
              ?.pages || {}
          );

        for (
          const page of pages
        ) {
          const info =
            page
              ?.imageinfo?.[0];

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
            !mime.startsWith(
              "image/"
            )
          ) {
            continue;
          }

          const title =
            String(
              page.title || ""
            ).toLowerCase();

          if (
            title.includes(
              "logo"
            ) ||
            title.includes(
              "emblem"
            ) ||
            title.includes(
              "icon"
            ) ||
            title.includes(
              "badge"
            ) ||
            title.includes(
              "symbol"
            ) ||
            title.includes(
              "flag"
            )
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
        clearTimeout(
          timer
        );
      }
    }

    async function findCarImage(
      car
    ) {
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

    // ---------------------------------------------------
    // SEARCH 3 IMAGES IN PARALLEL
    // ---------------------------------------------------

    const photos =
      await Promise.all(
        result.cars
          .slice(0, 3)
          .map(
            (car) =>
              findCarImage(
                car
              )
          )
      );

    // ---------------------------------------------------
    // FINAL RESPONSE
    // ---------------------------------------------------

    const cars =
      result.cars
        .slice(0, 3)
        .map(
          (
            car,
            index
          ) => {
            const photo =
              photos[index] ||
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
                Number.isFinite(
                  Number(
                    car.score
                  )
                )
                  ? Number(
                      car.score
                    )
                  : 0,

              price:
                car.price ||
                "Cena nie je dostupná",

              priceVerified:
                car.priceVerified ===
                true,

              priceSource:
                car.priceSource ||
                "",

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
                photo.photoSource ||
                "",

              reason:
                car.reason || "",

              pros:
                Array.isArray(
                  car.pros
                )
                  ? car.pros.slice(
                      0,
                      4
                    )
                  : [],

              cons:
                Array.isArray(
                  car.cons
                )
                  ? car.cons.slice(
                      0,
                      4
                    )
                  : [],

              maintenance:
                car.maintenance ||
                "Údaj nie je dostupný",

              manufacturer:
                car.manufacturer ||
                "",

              configurator:
                isValidURL(
                  car.configurator
                )
                  ? car.configurator
                  : ""
            };
          }
        );

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

function isValidURL(
  value
) {
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
