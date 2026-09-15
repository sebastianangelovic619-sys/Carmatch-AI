export default async function handler(req, res) {
  /* =====================================================
     CARMATCH AI - FINAL MULTI MODEL AUTOMOTIVE BACKEND

     Improvements:
     - Stronger current-generation rules
     - Current 2026/2027 model-year priority
     - Price must be supplied when reliably known
     - Better maintenance information
     - No generic "2024" unless actually correct
     - Exact 3 cars
     - Free-model failover
     - Wikimedia image search
     ===================================================== */

  /* =====================================================
     CORS
     ===================================================== */

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

  /* =====================================================
     API KEY
     ===================================================== */

  const apiKey =
    process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error:
        "OPENROUTER_API_KEY is missing in Vercel"
    });
  }

  try {
    /* ===================================================
       REQUEST
       =================================================== */

    const {
      naturalLanguage = "",
      filters = {}
    } = req.body || {};

    const userText =
      String(naturalLanguage || "").trim();

    /* ===================================================
       LANGUAGE
       =================================================== */

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

    /* ===================================================
       MARKET
       =================================================== */

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

    /* ===================================================
       PROMPT
       =================================================== */

    const prompt = `
You are CARMATCH AI, a professional worldwide automotive recommendation assistant.

CURRENT DATE:
September 15, 2026

USER LANGUAGE:
${language}

USER MARKET:
${market}

USER REQUEST:
${userText}

FILTERS:
${JSON.stringify(filters, null, 2)}

==========================================================
CRITICAL AUTOMOTIVE DATA RULES
==========================================================

You MUST prioritize CURRENT automotive information.

The current date is September 2026.

When the user asks for a current/new/recent vehicle:

- Prefer the latest genuinely available generation.
- Prefer 2026 model year when genuinely available.
- Prefer 2027 model year when genuinely available.
- Do NOT automatically use 2024 or 2025.
- Do NOT use an old model year merely because you know it better.
- If a vehicle has received a facelift, use the facelift/current version.
- If a completely new generation exists, NEVER recommend the previous generation as the current one.
- Never confuse production year with model year.
- Never invent a model year.
- If the exact current model year cannot be established with reasonable confidence, write "2026" only when it is genuinely appropriate for the current generation; otherwise use "Aktuálna generácia".

IMPORTANT:
A vehicle being known from 2024 does NOT mean that 2024 is its current model year.

==========================================================
PRICE RULES
==========================================================

PRICE IS IMPORTANT.

Always try to provide a real current price when it is reasonably known.

For European-market vehicles, prefer the current European starting MSRP/list price.

For Slovakia/EU users:
- Prefer Slovak/EU pricing when known.
- If Slovak price is unavailable but EU pricing is known, use the EU price.
- Clearly identify the market/type of price in priceType.
- Never convert currencies unless necessary.
- Never invent a price.

If a reliable current price is known:

"price": "€XX XXX"
"priceVerified": true

If a current price is not reliably known:

"price": "Cena nie je dostupná"
"priceVerified": false

Do NOT use:
- around
- approximately
- about
- roughly
- estimated
- similar price
- odhad
- približne

If you know a current manufacturer's starting price, use it.

priceSource should describe the source type when known, for example:
"Oficiálny cenník výrobcu"
"Oficiálna cena výrobcu"
"EU starting MSRP"

priceType examples:
"Slovakia"
"EU"
"Germany"
"UK"
"US"
"Global"
"unknown"

==========================================================
MAINTENANCE RULES
==========================================================

Maintenance information must be specific to the selected vehicle.

DO NOT write generic text such as:

"Vyžaduje špecializovaný servis Audi."

Instead mention useful vehicle-specific information such as:

- typical service interval when known
- oil service when applicable
- EV battery/electric drivetrain maintenance
- brakes
- tires
- transmission service when applicable
- quattro/AWD maintenance when applicable
- hybrid system considerations
- diesel DPF/AdBlue considerations when applicable
- major maintenance items
- expected maintenance complexity

Do not invent exact service intervals.

If exact intervals are unknown, describe the maintenance characteristics without inventing numbers.

==========================================================
SPECIFICATION RULES
==========================================================

Never invent:

- horsepower
- kW
- torque
- seats
- trunk volume
- dimensions
- drivetrain
- fuel type
- generation
- model year
- price
- configurator URL

Use the most appropriate current specification when confidently known.

For variants with multiple engines, clearly describe the relevant version.

==========================================================
RECOMMENDATION RULES
==========================================================

Your task is to recommend EXACTLY 3 vehicles.

Consider manufacturers worldwide.

Match ALL important user requirements:

- budget
- seats
- power
- trunk
- drivetrain
- fuel
- body
- vehicle length
- model year
- performance
- practicality
- maintenance
- brands to avoid
- other filters

If the user explicitly asks for a powerful vehicle, do NOT recommend weak mainstream vehicles merely because they are popular.

If the user requests 2 seats, do NOT recommend 5-seat vehicles unless absolutely necessary.

If the user requests large trunk capacity, prioritize genuinely large trunks.

If the user excludes brands, NEVER recommend those brands.

Do not default to:
- Škoda Superb
- Mercedes E-Class
- Audi A6

unless they genuinely satisfy the user's request.

Return the best three matches, not three generic popular cars.

==========================================================
OUTPUT RULES
==========================================================

Return EXACTLY ONE JSON object.

Return EXACTLY 3 cars.

No markdown.

No explanation outside JSON.

No reasoning.

No thinking.

No safety labels.

Never output:
"User Safety: safe"

All descriptive text must be written in the user's language.

==========================================================
JSON FORMAT
==========================================================

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
      "pros": [
        "string"
      ],
      "cons": [
        "string"
      ],
      "maintenance": "string",
      "manufacturer": "string",
      "configurator": "string"
    }
  ]
}

RETURN ONLY JSON.
`;

    /* ===================================================
       FREE MODELS
       =================================================== */

    const FREE_MODELS = [
      "google/gemma-4-26b-a4b-it:free",
      "google/gemma-4-31b-it:free",
      "nvidia/nemotron-3-super-120b-a12b:free",
      "openrouter/free"
    ];

    /* ===================================================
       PAID FALLBACK
       =================================================== */

    const PAID_MODEL =
      process.env.PAID_FALLBACK_MODEL ||
      "openai/gpt-oss-120b";

    const PAID_FALLBACK_ENABLED =
      String(
        process.env.PAID_FALLBACK_ENABLED ||
        "false"
      ).toLowerCase() === "true";

    /* ===================================================
       TIMEOUT
       =================================================== */

    const REQUEST_TIMEOUT =
      25000;

    /* ===================================================
       SLEEP
       =================================================== */

    const sleep =
      (ms) =>
        new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              ms
            )
        );

    /* ===================================================
       CLEAN AI TEXT
       =================================================== */

    function cleanAIText(input) {
      let text =
        String(
          input || ""
        ).trim();

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

      text =
        text.replace(
          /^\s*User\s+Safety\s*:\s*safe\s*/i,
          ""
        );

      text =
        text.replace(
          /^\s*Safety\s*:\s*safe\s*/i,
          ""
        );

      return text.trim();
    }

    /* ===================================================
       EXTRACT JSON
       =================================================== */

    function extractJSON(input) {
      const text =
        cleanAIText(input);

      if (!text) {
        return null;
      }

      const start =
        text.indexOf("{");

      if (start === -1) {
        return null;
      }

      let depth = 0;
      let inString = false;
      let escaped = false;

      for (
        let i = start;
        i < text.length;
        i++
      ) {
        const char =
          text[i];

        if (escaped) {
          escaped = false;
          continue;
        }

        if (char === "\\") {
          escaped = true;
          continue;
        }

        if (char === '"') {
          inString =
            !inString;
          continue;
        }

        if (inString) {
          continue;
        }

        if (char === "{") {
          depth++;
        }

        if (char === "}") {
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

    /* ===================================================
       VALIDATE RESULT
       =================================================== */

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
          typeof car !== "object"
        ) {
          return false;
        }

        if (
          typeof car.name !== "string" ||
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

        if (
          typeof car.year !== "string"
        ) {
          return false;
        }

        if (
          typeof car.price !== "string"
        ) {
          return false;
        }

        if (
          typeof car.maintenance !==
          "string"
        ) {
          return false;
        }
      }

      return true;
    }

    /* ===================================================
       ASK MODEL
       =================================================== */

    async function askModel(model) {
      const controller =
        new AbortController();

      const timer =
        setTimeout(
          () =>
            controller.abort(),
          REQUEST_TIMEOUT
        );

      try {
        const body = {
          model,

          messages: [
            {
              role: "system",
              content:
                "Return ONLY one valid JSON object. Do not return markdown, reasoning, thinking, commentary, safety labels, or User Safety messages. Use current automotive information for September 2026 whenever known."
            },

            {
              role: "user",
              content:
                prompt
            }
          ],

          temperature:
            0.1,

          max_tokens:
            4000
        };

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
                JSON.stringify(
                  body
                )
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
              "OpenRouter returned invalid JSON"
          };
        }

        if (data?.error) {
          return {
            ok: false,
            status:
              Number(
                data.error.code
              ) || 502,
            error:
              data.error.message ||
              "OpenRouter returned an API error"
          };
        }

        let content =
          data
            ?.choices?.[0]
            ?.message
            ?.content ||
          "";

        if (
          Array.isArray(
            content
          )
        ) {
          content =
            content
              .map(
                (part) => {
                  if (
                    typeof part ===
                    "string"
                  ) {
                    return part;
                  }

                  return (
                    part?.text ||
                    ""
                  );
                }
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
              "AI returned an empty response"
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
              "AI model timeout"
          };
        }

        return {
          ok: false,
          status: 500,
          error:
            error?.message ||
            "AI request failed"
        };

      } finally {
        clearTimeout(
          timer
        );
      }
    }

    /* ===================================================
       FREE ROUND 1
       =================================================== */

    let result = null;
    let successfulModel = "";

    const errors = [];

    for (
      let i = 0;
      i < FREE_MODELS.length;
      i++
    ) {
      const model =
        FREE_MODELS[i];

      console.log(
        `CARMATCH AI: FREE MODEL ${i + 1}/${FREE_MODELS.length}: ${model}`
      );

      const response =
        await askModel(
          model
        );

      if (
        response.ok
      ) {
        result =
          response.result;

        successfulModel =
          response.model ||
          model;

        break;
      }

      errors.push({
        tier:
          "free",
        attempt:
          i + 1,
        model,
        status:
          response.status,
        error:
          response.error,
        raw:
          response.raw
      });
    }

    /* ===================================================
       FREE ROUND 2
       =================================================== */

    if (!result) {
      await sleep(1000);

      for (
        let i = 0;
        i < FREE_MODELS.length;
        i++
      ) {
        const model =
          FREE_MODELS[i];

        console.log(
          `CARMATCH AI: FREE RETRY ${i + 1}/${FREE_MODELS.length}: ${model}`
        );

        const response =
          await askModel(
            model
          );

        if (
          response.ok
        ) {
          result =
            response.result;

          successfulModel =
            response.model ||
            model;

          break;
        }

        errors.push({
          tier:
            "free-retry",
          attempt:
            i + 1,
          model,
          status:
            response.status,
          error:
            response.error,
          raw:
            response.raw
        });
      }
    }

    /* ===================================================
       PAID FALLBACK
       =================================================== */

    if (
      !result &&
      PAID_FALLBACK_ENABLED
    ) {
      const response =
        await askModel(
          PAID_MODEL
        );

      if (
        response.ok
      ) {
        result =
          response.result;

        successfulModel =
          response.model ||
          PAID_MODEL;
      } else {
        errors.push({
          tier:
            "paid",
          attempt:
            1,
          model:
            PAID_MODEL,
          status:
            response.status,
          error:
            response.error,
          raw:
            response.raw
        });
      }

      if (!result) {
        await sleep(800);

        const retryResponse =
          await askModel(
            PAID_MODEL
          );

        if (
          retryResponse.ok
        ) {
          result =
            retryResponse.result;

          successfulModel =
            retryResponse.model ||
            PAID_MODEL;
        } else {
          errors.push({
            tier:
              "paid-retry",
            attempt:
              2,
            model:
              PAID_MODEL,
            status:
              retryResponse.status,
            error:
              retryResponse.error,
            raw:
              retryResponse.raw
          });
        }
      }
    }

    /* ===================================================
       FAILURE
       =================================================== */

    if (!result) {
      return res.status(503).json({
        error:
          "AI is temporarily unavailable",

        message:
          PAID_FALLBACK_ENABLED
            ? "CARMATCH AI momentálne nedostal použiteľnú odpoveď."
            : "CARMATCH AI momentálne nedostal použiteľnú odpoveď z bezplatných AI modelov.",

        retryable:
          true,

        paidFallbackEnabled:
          PAID_FALLBACK_ENABLED,

        debug:
          process.env.NODE_ENV !==
          "production"
            ? errors
            : undefined
      });
    }

    /* ===================================================
       WIKIMEDIA IMAGE SEARCH
       =================================================== */

    async function searchWikimedia(query) {
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
              "8",

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
              info.mime ||
              ""
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
              page.title ||
              ""
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
        clearTimeout(
          timer
        );
      }
    }

    /* ===================================================
       FIND CAR IMAGE
       =================================================== */

    async function findCarImage(car) {
      const name =
        String(
          car.name ||
          ""
        ).trim();

      const generation =
        String(
          car.generation ||
          ""
        ).trim();

      const manufacturer =
        String(
          car.manufacturer ||
          ""
        ).trim();

      const queries = [
        `${manufacturer} ${name} ${generation} 2026`,
        `${manufacturer} ${name} 2026`,
        `${name} ${generation}`,
        `${manufacturer} ${name} car`,
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
        image:
          "",
        photoSource:
          ""
      };
    }

    /* ===================================================
       IMAGES
       =================================================== */

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

    /* ===================================================
       FINAL DATA
       =================================================== */

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

            let score =
              Number(
                car.score
              );

            if (
              !Number.isFinite(
                score
              )
            ) {
              score = 0;
            }

            score =
              Math.max(
                0,
                Math.min(
                  100,
                  score
                )
              );

            return {
              name:
                car.name ||
                "Neznáme auto",

              generation:
                car.generation ||
                "Aktuálna generácia",

              year:
                car.year ||
                "Aktuálna generácia",

              score,

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
                "Informácie o údržbe nie sú dostupné.",

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

    /* ===================================================
       SUCCESS
       =================================================== */

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
          successfulModel,

        paidFallbackUsed:
          successfulModel ===
          PAID_MODEL,

        paidFallbackEnabled:
          PAID_FALLBACK_ENABLED
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
```0