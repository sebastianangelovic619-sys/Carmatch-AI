export default async function handler(req, res) {
  /* =====================================================
     CARMATCH AI - STABLE BACKEND
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
  // OPENROUTER KEY
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
    const {
      naturalLanguage = "",
      filters = {}
    } = req.body || {};

    const userText =
      String(
        naturalLanguage || ""
      ).trim();

    // ---------------------------------------------------
    // LANGUAGE
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

RULES:

1. Consider manufacturers worldwide.
2. Prefer the newest genuinely available generation.
3. Never confuse generations.
4. Never invent specifications.
5. Never invent model years.
6. Never invent prices.
7. Never invent URLs.
8. Match the user's market whenever possible.
9. Return EXACTLY 3 vehicles.
10. Rank them from best match to third best.
11. Give a realistic score from 0 to 100.
12. Include advantages.
13. Include disadvantages.
14. Include maintenance information.
15. Include trunk capacity when known.
16. Include dimensions when known.
17. Include manufacturer.
18. Include official manufacturer configurator URL only when genuinely known.
19. Do not generate image URLs.
20. Images are handled separately by the backend.
21. All descriptive text must use the user's language.
22. Do not output reasoning.
23. Do not output thinking.
24. Do not output markdown.
25. Do not output safety labels.
26. Do not output "User Safety: safe".
27. Do not write anything before the JSON.
28. Do not write anything after the JSON.
29. The answer MUST be one JSON object.
30. The object MUST contain exactly 3 cars.

PRICE RULE:

Never guess a price.

If a reliable price is genuinely known, provide it.

Otherwise:

"price": "Cena nie je dostupná"

and:

"priceVerified": false

Never use approximate prices.

JSON FORMAT:

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

RETURN ONLY JSON.
`;

    // ---------------------------------------------------
    // MODEL FALLBACKS
    //
    // IMPORTANT:
    // No old Gemma/Llama/Qwen free slugs.
    //
    // openrouter/free is first because OpenRouter
    // dynamically selects an available free model.
    // ---------------------------------------------------

    const models = [
      "openrouter/free",
      "openai/gpt-oss-20b:free",
      "liquid/lfm-2.5-2.6b:free",
      "minimax/minimax-m3:free",
      "nvidia/nemotron-3-ultra-550b-a55b:free"
    ];

    // ---------------------------------------------------
    // TIMEOUT
    // ---------------------------------------------------

    const REQUEST_TIMEOUT =
      12000;

    // ---------------------------------------------------
    // RETRY DELAY
    // ---------------------------------------------------

    const sleep = (ms) =>
      new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            ms
          )
      );

    // ---------------------------------------------------
    // REMOVE BAD MODEL OUTPUT
    // ---------------------------------------------------

    function cleanAIText(input) {
      let text =
        String(input || "")
          .trim();

      // Remove markdown fences
      text =
        text.replace(
          /```json/gi,
          ""
        );

      text =
        text.replace(
          /```/g,
          ""
        );

      // Remove common safety labels
      text =
        text.replace(
          /^user\s*safety\s*:\s*safe\s*/i,
          ""
        );

      text =
        text.replace(
          /^safety\s*:\s*safe\s*/i,
          ""
        );

      text =
        text.replace(
          /^safe\s*/i,
          ""
        );

      return text.trim();
    }

    // ---------------------------------------------------
    // EXTRACT JSON ROBUSTLY
    // ---------------------------------------------------

    function extractJSON(input) {
      let text =
        cleanAIText(input);

      if (!text) {
        return null;
      }

      // First object
      const start =
        text.indexOf("{");

      if (start === -1) {
        return null;
      }

      /*
        Find the matching final }.
        We do not simply trust lastIndexOf because
        some models may append commentary.
      */

      let depth = 0;
      let inString = false;
      let escaped = false;

      for (
        let i = start;
        i < text.length;
        i++
      ) {
        const ch =
          text[i];

        if (escaped) {
          escaped = false;
          continue;
        }

        if (ch === "\\") {
          escaped = true;
          continue;
        }

        if (ch === '"') {
          inString =
            !inString;
          continue;
        }

        if (inString) {
          continue;
        }

        if (ch === "{") {
          depth++;
        }

        if (ch === "}") {
          depth--;

          if (depth === 0) {
            const candidate =
              text.slice(
                start,
                i + 1
              );

            try {
              return JSON.parse(
                candidate
              );
            } catch {
              return null;
            }
          }
        }
      }

      return null;
    }

    // ---------------------------------------------------
    // VALIDATE RESULT
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

        if (
          !Array.isArray(
            car.pros
          )
        ) {
          return false;
        }

        if (
          !Array.isArray(
            car.cons
          )
        ) {
          return false;
        }
      }

      return true;
    }

    // ---------------------------------------------------
    // REQUEST ONE MODEL
    // ---------------------------------------------------

    async function askModel(
      model
    ) {
      const controller =
        new AbortController();

      const timer =
        setTimeout(
          () =>
            controller.abort(),
          REQUEST_TIMEOUT
        );

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

              body:
                JSON.stringify({
                  model,

                  messages: [
                    {
                      role:
                        "system",

                      content:
                        "Return ONLY valid JSON. Never output markdown, reasoning, thinking, commentary, safety labels, or User Safety messages."
                    },

                    {
                      role:
                        "user",

                      content:
                        prompt
                    }
                  ],

                  temperature:
                    0.1,

                  max_tokens:
                    3500
                })
            }
          );

        const raw =
          await response.text();

        if (
          !response.ok
        ) {
          return {
            ok: false,

            status:
              response.status,

            error:
              raw.substring(
                0,
                1500
              )
          };
        }

        let data;

        try {
          data =
            JSON.parse(
              raw
            );
        } catch {
          return {
            ok: false,
            status: 502,
            error:
              "Invalid JSON from OpenRouter"
          };
        }

        let content =
          data
            ?.choices?.[0]
            ?.message?.content ||
          "";

        if (
          Array.isArray(
            content
          )
        ) {
          content =
            content
              .map(
                (part) =>
                  typeof part ===
                  "string"
                    ? part
                    : part?.text ||
                      ""
              )
              .join("");
        }

        content =
          cleanAIText(
            content
          );

        if (!content) {
          return {
            ok: false,
            status: 502,
            error:
              "Empty AI response"
          };
        }

        const parsed =
          extractJSON(
            content
          );

        if (
          !parsed ||
          !validateResult(
            parsed
          )
        ) {
          return {
            ok: false,
            status: 502,
            error:
              "AI returned invalid JSON or not exactly 3 cars",

            raw:
              content.substring(
                0,
                2000
              )
          };
        }

        return {
          ok: true,

          result:
            parsed,

          model:
            data?.model ||
            model
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
        clearTimeout(
          timer
        );
      }
    }

    // ---------------------------------------------------
    // TRY MODELS
    // ---------------------------------------------------

    let result =
      null;

    let successfulModel =
      "";

    const errors = [];

    for (
      let i = 0;
      i < models.length;
      i++
    ) {
      const model =
        models[i];

      const attempt =
        await askModel(
          model
        );

      if (
        attempt.ok
      ) {
        result =
          attempt.result;

        successfulModel =
          attempt.model ||
          model;

        console.log(
          "CARMATCH AI SUCCESS:",
          successfulModel
        );

        break;
      }

      errors.push({
        model,
        status:
          attempt.status,
        error:
          attempt.error,
        raw:
          attempt.raw
      });

      console.error(
        "CARMATCH AI FAILED:",
        {
          model,
          status:
            attempt.status,
          error:
            attempt.error
        }
      );

      /*
        Small pause before next model.
      */

      if (
        i <
        models.length - 1
      ) {
        await sleep(
          250
        );
      }
    }

    // ---------------------------------------------------
    // ONE EXTRA RETRY THROUGH FREE ROUTER
    //
    // Because openrouter/free chooses the backend
    // dynamically, a second request can land on
    // a different available provider/model.
    // ---------------------------------------------------

    if (!result) {
      const retry =
        await askModel(
          "openrouter/free"
        );

      if (
        retry.ok
      ) {
        result =
          retry.result;

        successfulModel =
          retry.model ||
          "openrouter/free";

        console.log(
          "CARMATCH AI RETRY SUCCESS:",
          successfulModel
        );
      } else {
        errors.push({
          model:
            "openrouter/free-retry",
          status:
            retry.status,
          error:
            retry.error,
          raw:
            retry.raw
        });
      }
    }

    // ---------------------------------------------------
    // FINAL FAILURE
    // ---------------------------------------------------

    if (!result) {
      console.error(
        "ALL AI ATTEMPTS FAILED:",
        JSON.stringify(
          errors,
          null,
          2
        )
      );

      return res.status(503).json({
        error:
          "AI is temporarily unavailable",

        message:
          "CARMATCH AI momentálne nedostal použiteľnú odpoveď od dostupných AI modelov.",

        retryable:
          true
      });
    }

    // ---------------------------------------------------
    // WIKIMEDIA IMAGE SEARCH
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
          3500
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

    // ---------------------------------------------------
    // FIND IMAGE
    // ---------------------------------------------------

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
    // IMAGE SEARCH
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
    // FINAL RESULT
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
                car.year ||
                "",

              score:
                Number.isFinite(
                  Number(
                    car.score
                  )
                )
                  ? Math.max(
                      0,
                      Math.min(
                        100,
                        Number(
                          car.score
                        )
                      )
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
                photo.image ||
                "",

              photoSource:
                photo.photoSource ||
                "",

              reason:
                car.reason ||
                "",

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

    // ---------------------------------------------------
    // SUCCESS
    // ---------------------------------------------------

    return res.status(200).json({
      language:
        result.language ||
        language,

      market:
        result.market ||
        market,

      cars,

      ai: {
        model:
          successfulModel
      }
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
