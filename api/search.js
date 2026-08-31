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

    /*
      ======================================================
      LANGUAGE
      ======================================================
    */

    function detectLanguage(text) {
      const t = text.toLowerCase();

      if (
        /[áäčďéíĺľňóôŕšťúýž]/.test(t) ||
        /\b(chcem|chceš|potrebujem|auto|vozidlo|kufor|výkon|pohon|cena|miest)\b/.test(t)
      ) {
        return "sk";
      }

      if (
        /\b(chci|potřebuji|auto|vozidlo|kufr|výkon|pohon|cena)\b/.test(t)
      ) {
        return "cs";
      }

      if (
        /\b(ich|möchte|brauche|auto|fahrzeug|preis|leistung|allrad)\b/.test(t)
      ) {
        return "de";
      }

      if (
        /\b(je|voiture|prix|besoin|puissance|4x4)\b/.test(t)
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

      if (
        /\b(keresek|autó|ár|teljesítmény)\b/.test(t)
      ) {
        return "hu";
      }

      return "en";
    }

    const language = detectLanguage(userText);

    const marketMap = {
      sk: "Slovakia",
      cs: "Czech Republic",
      de: "Germany",
      fr: "France",
      it: "Italy",
      es: "Spain",
      pl: "Poland",
      hu: "Hungary",
      en: "International market"
    };

    const market =
      marketMap[language] ||
      "International market";

    /*
      ======================================================
      PROMPT
      ======================================================
    */

    const prompt = `
You are CARMATCH AI, a professional automotive recommendation system.

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

Choose EXACTLY 3 vehicles that best match the user's request.

RULES:

- Consider manufacturers worldwide.
- Prefer the newest genuine generation.
- Never confuse generations.
- Never invent specifications.
- Never invent model years.
- Never invent prices.
- Never invent URLs.
- Prefer official manufacturer information when known.
- Match the user's market when possible.
- Answer all descriptive text in the user's language.
- Return exactly 3 vehicles.
- Rank them from #1 to #3.
- Give a realistic match score from 0 to 100.
- Include advantages.
- Include disadvantages.
- Include maintenance information.
- Include trunk capacity when known.
- Include dimensions when known.
- Include manufacturer.
- Include configurator only when genuinely known.

PRICE RULE:

Never guess a price.

If you genuinely know an exact manufacturer starting price, provide it.

If you do NOT know a reliable official price:
price = "Cena nie je overená"
priceVerified = false
priceSource = ""

Never use approximate prices.

IMAGE RULE:

Do not generate image URLs.
image must be empty.
Images are handled separately by the backend.

LANGUAGE RULE:

All descriptive information must be written in the user's language.

Return ONLY the JSON object required by the schema.
Never return markdown.
Never return reasoning.
Never return thinking.
Never return safety labels.
`;

    /*
      ======================================================
      OPENROUTER
      ======================================================
    */

    const controller =
      new AbortController();

    const timeoutId =
      setTimeout(() => {
        controller.abort();
      }, 18000);

    let response;

    try {
      response = await fetch(
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
            model:
              "google/gemma-4-26b-a4b-it:free",

            messages: [
              {
                role: "system",
                content:
                  "Return ONLY valid JSON matching the provided schema. Do not output reasoning, markdown, safety labels or text outside JSON."
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

                schema: {
                  type: "object",

                  additionalProperties:
                    false,

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

                        additionalProperties:
                          false,

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

                          image: {
                            type: "string"
                          },

                          photoSource: {
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
                          "image",
                          "photoSource",
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
                }
              }
            }
          })
        }
      );
    } catch (error) {
      if (
        error?.name ===
        "AbortError"
      ) {
        return res.status(504).json({
          error:
            "AI request timed out",
          message:
            "AI odpovedala príliš pomaly. Skús vyhľadávanie znova."
        });
      }

      throw error;

    } finally {
      clearTimeout(timeoutId);
    }

    /*
      ======================================================
      OPENROUTER RESPONSE
      ======================================================
    */

    const raw =
      await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          "OpenRouter API error",

        details:
          raw.substring(0, 1500)
      });
    }

    let data;

    try {
      data =
        JSON.parse(raw);
    } catch {
      return res.status(502).json({
        error:
          "OpenRouter returned invalid API JSON",

        details:
          raw.substring(0, 1000)
      });
    }

    let text =
      data?.choices?.[0]?.message?.content ||
      "";

    /*
      Handle providers that return
      content as an array.
    */

    if (Array.isArray(text)) {
      text = text
        .map(item =>
          typeof item === "string"
            ? item
            : item?.text || ""
        )
        .join("");
    }

    text =
      String(text).trim();

    if (!text) {
      return res.status(502).json({
        error:
          "AI returned an empty response"
      });
    }

    /*
      ======================================================
      JSON CLEANUP
      ======================================================
    */

    text = text
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

    function extractJSON(value) {
      const first =
        value.indexOf("{");

      const last =
        value.lastIndexOf("}");

      if (
        first === -1 ||
        last === -1 ||
        last <= first
      ) {
        return null;
      }

      return value.substring(
        first,
        last + 1
      );
    }

    const jsonText =
      extractJSON(text);

    if (!jsonText) {
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
        "CARMATCH INVALID JSON:",
        text.substring(0, 2000)
      );

      return res.status(502).json({
        error:
          "AI returned invalid JSON",

        details:
          text.substring(0, 500)
      });
    }

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

    /*
      ======================================================
      WIKIMEDIA IMAGE SEARCH
      ======================================================
    */

    async function findImage(car) {
      const name =
        String(
          car.name || ""
        ).trim();

      const generation =
        String(
          car.generation || ""
        ).trim();

      const year =
        String(
          car.year || ""
        ).trim();

      const queries = [
        `${name} ${generation} ${year}`,
        `${name} ${generation}`,
        `${name} car`
      ];

      for (const query of queries) {

        const controller =
          new AbortController();

        const timer =
          setTimeout(
            () =>
              controller.abort(),
            3000
          );

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
                "6",

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

          const imageResponse =
            await fetch(url, {
              signal:
                controller.signal
            });

          if (
            !imageResponse.ok
          ) {
            continue;
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

        } catch {
          // Try the next query.
        } finally {
          clearTimeout(timer);
        }
      }

      return {
        image: "",
        photoSource: ""
      };
    }

    /*
      All 3 image searches run simultaneously.
    */

    const photos =
      await Promise.all(
        result.cars
          .slice(0, 3)
          .map(car =>
            findImage(car)
          )
      );

    /*
      ======================================================
      FINAL RESULT
      ======================================================
    */

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
      url.protocol === "https:" ||
      url.protocol === "http:"
    );

  } catch {
    return false;
  }
}
