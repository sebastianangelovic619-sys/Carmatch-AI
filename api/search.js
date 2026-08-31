export default async function handler(req, res) {
  /* =====================================================
     CARMATCH AI - FINAL STABLE BACKEND
     
     FREE:
       openrouter/free
       ↓
       retry

     PAID FALLBACK:
       openai/gpt-oss-120b
       ↓
       retry

     Images:
       Wikimedia Commons

     ===================================================== */

  /* =====================================================
     CORS
     ===================================================== */

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

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
       REQUEST DATA
       =================================================== */

    const {
      naturalLanguage = "",
      filters = {}
    } = req.body || {};

    const userText =
      String(
        naturalLanguage || ""
      ).trim();

    /* ===================================================
       LANGUAGE DETECTION
       =================================================== */

    function detectLanguage(text) {

      const t =
        String(text || "")
          .toLowerCase();

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
August 31, 2026

USER LANGUAGE:
${language}

USER MARKET:
${market}

USER REQUEST:
${userText}

FILTERS:
${JSON.stringify(filters, null, 2)}

Your task is to recommend EXACTLY 3 vehicles that best match the user's requirements.

IMPORTANT RULES:

1. Consider manufacturers worldwide.
2. Prefer the newest genuinely available generation.
3. Never confuse different generations.
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
18. Include an official manufacturer configurator URL only when genuinely known.
19. Do not generate image URLs.
20. Images are searched separately by the backend.
21. All descriptive text must use the user's language.
22. Do not output reasoning.
23. Do not output thinking.
24. Do not output markdown.
25. Do not output safety labels.
26. Never output "User Safety: safe".
27. Do not write anything before the JSON.
28. Do not write anything after the JSON.
29. Return exactly ONE JSON object.
30. The JSON object must contain exactly 3 cars.

PRICE RULE:

Never guess a price.

If a reliable price is genuinely known:

"price": "actual known price"
"priceVerified": true

If no reliable price is known:

"price": "Cena nie je dostupná"
"priceVerified": false

Never use approximate prices.

Never use:
- around
- approximately
- about
- roughly
- estimated
- similar price

If you cannot confidently verify a price, use:

"price": "Cena nie je dostupná"
"priceVerified": false

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
       MODEL CONFIGURATION
       =================================================== */

    const FREE_MODEL =
      "openrouter/free";

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
      30000;

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
       CLEAN AI OUTPUT
       =================================================== */

    function cleanAIText(input) {

      let text =
        String(
          input || ""
        ).trim();

      /*
        Remove markdown fences.
      */

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

      /*
        Remove accidental safety messages.
      */

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
       VALIDATE AI RESULT
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

    /* ===================================================
       ASK MODEL
       =================================================== */

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
                        "Return ONLY one valid JSON object. Never return markdown, reasoning, thinking, safety labels, commentary, or User Safety messages."
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

        /* ---------------------------------------------
           PROVIDER ERROR
           --------------------------------------------- */

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

        /* ---------------------------------------------
           OPENROUTER JSON
           --------------------------------------------- */

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

        /* ---------------------------------------------
           GET CONTENT
           --------------------------------------------- */

        let content =
          data
            ?.choices?.[0]
            ?.message
            ?.content ||
          "";

        /*
          Some providers can return content
          as an array.
        */

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

        /* ---------------------------------------------
           PARSE CAR JSON
           --------------------------------------------- */

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

        /* ---------------------------------------------
           SUCCESS
           --------------------------------------------- */

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
       AI FALLBACK SYSTEM
       =================================================== */

    let result =
      null;

    let successfulModel =
      "";

    const errors = [];

    /* ===================================================
       FREE ATTEMPT #1
       =================================================== */

    console.log(
      "CARMATCH AI: FREE ATTEMPT #1"
    );

    let response =
      await askModel(
        FREE_MODEL
      );

    if (
      response.ok
    ) {

      result =
        response.result;

      successfulModel =
        response.model ||
        FREE_MODEL;

      console.log(
        "CARMATCH AI FREE SUCCESS:",
        successfulModel
      );

    } else {

      errors.push({

        tier:
          "free",

        attempt:
          1,

        model:
          FREE_MODEL,

        status:
          response.status,

        error:
          response.error,

        raw:
          response.raw
      });

      console.error(
        "CARMATCH AI FREE #1 FAILED:",
        response
      );
    }

    /* ===================================================
       FREE ATTEMPT #2
       =================================================== */

    if (!result) {

      await sleep(
        500
      );

      console.log(
        "CARMATCH AI: FREE ATTEMPT #2"
      );

      response =
        await askModel(
          FREE_MODEL
        );

      if (
        response.ok
      ) {

        result =
          response.result;

        successfulModel =
          response.model ||
          FREE_MODEL;

        console.log(
          "CARMATCH AI FREE RETRY SUCCESS:",
          successfulModel
        );

      } else {

        errors.push({

          tier:
            "free",

          attempt:
            2,

          model:
            FREE_MODEL,

          status:
            response.status,

          error:
            response.error,

          raw:
            response.raw
        });

        console.error(
          "CARMATCH AI FREE #2 FAILED:",
          response
        );
      }
    }

    /* ===================================================
       PAID FALLBACK
       =================================================== */

    if (
      !result &&
      PAID_FALLBACK_ENABLED
    ) {

      console.log(
        "CARMATCH AI: FREE FAILED"
      );

      console.log(
        "CARMATCH AI: STARTING PAID FALLBACK:",
        PAID_MODEL
      );

      /* -----------------------------------------------
         PAID ATTEMPT #1
         ----------------------------------------------- */

      response =
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

        console.log(
          "CARMATCH AI PAID SUCCESS:",
          successfulModel
        );

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

        console.error(
          "CARMATCH AI PAID #1 FAILED:",
          response
        );
      }

      /* -----------------------------------------------
         PAID ATTEMPT #2
         ----------------------------------------------- */

      if (!result) {

        await sleep(
          500
        );

        console.log(
          "CARMATCH AI: PAID ATTEMPT #2"
        );

        response =
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

          console.log(
            "CARMATCH AI PAID RETRY SUCCESS:",
            successfulModel
          );

        } else {

          errors.push({

            tier:
              "paid",

            attempt:
              2,

            model:
              PAID_MODEL,

            status:
              response.status,

            error:
              response.error,

            raw:
              response.raw
          });

          console.error(
            "CARMATCH AI PAID #2 FAILED:",
            response
          );
        }
      }

    } else if (
      !result &&
      !PAID_FALLBACK_ENABLED
    ) {

      console.log(
        "CARMATCH AI: PAID FALLBACK IS DISABLED"
      );
    }

    /* ===================================================
       EVERYTHING FAILED
       =================================================== */

    if (!result) {

      console.error(
        "ALL CARMATCH AI ATTEMPTS FAILED:",
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
          PAID_FALLBACK_ENABLED
            ? "CARMATCH AI momentálne nedostal použiteľnú odpoveď ani z bezplatných, ani z plateného AI modelu."
            : "CARMATCH AI momentálne nedostal použiteľnú odpoveď z bezplatných AI modelov.",

        retryable:
          true,

        paidFallbackEnabled:
          PAID_FALLBACK_ENABLED
      });
    }

    /* ===================================================
       WIKIMEDIA IMAGE SEARCH
       =================================================== */

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

          /*
            Avoid logos and other irrelevant images.
          */

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

    /* ===================================================
       FIND CAR IMAGE
       =================================================== */

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

      const manufacturer =
        String(
          car.manufacturer || ""
        ).trim();

      const queries = [

        `${manufacturer} ${name} ${generation}`,

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

      /*
        Image failure must NEVER
        cause the AI request to fail.
      */

      return {

        image:
          "",

        photoSource:
          ""
      };
    }

    /* ===================================================
       SEARCH ALL 3 IMAGES IN PARALLEL
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
       FINAL CAR DATA
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
                "Neznáma generácia",

              year:
                car.year ||
                "",

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

    /* ===================================================
       SUCCESS RESPONSE
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

    /* ===================================================
       GLOBAL BACKEND ERROR
       =================================================== */

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
