module.exports = async function handler(req, res) {
  // =========================================================
  // HEADERS
  // =========================================================

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
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

  try {
    // =======================================================
    // API KEY
    // =======================================================

    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "OPENROUTER_API_KEY is missing in Vercel"
      });
    }

    // =======================================================
    // REQUEST
    // =======================================================

    let input = req.body || {};

    if (typeof input === "string") {
      try {
        input = JSON.parse(input);
      } catch {
        input = {};
      }
    }

    const naturalLanguage = String(
      input.naturalLanguage || ""
    ).trim();

    const filters =
      input.filters &&
      typeof input.filters === "object"
        ? input.filters
        : {};

    if (!naturalLanguage && Object.keys(filters).length === 0) {
      return res.status(400).json({
        error: "Missing search request",
        message: "Zadaj požiadavku alebo aspoň jeden filter."
      });
    }

    // =======================================================
    // LANGUAGE + MARKET
    // =======================================================

    const language = detectLanguage(naturalLanguage);
    const market = getMarket(language);

    // =======================================================
    // PROMPT
    // =======================================================

    const prompt = createPrompt(
      naturalLanguage,
      filters,
      language,
      market
    );

    // =======================================================
    // AI
    // =======================================================

    let aiResult = await callAI(
      apiKey,
      "openrouter/free",
      prompt
    );

    // =======================================================
    // ONE SIMPLE FREE FALLBACK
    // =======================================================

    if (!aiResult.ok) {
      aiResult = await callAI(
        apiKey,
        "google/gemma-4-26b-a4b-it:free",
        prompt
      );
    }

    // =======================================================
    // AI FAILURE
    // =======================================================

    if (!aiResult.ok) {
      console.error(
        "CARMATCH AI FAILURE:",
        aiResult.error
      );

      return res.status(503).json({
        error: "AI is temporarily unavailable",
        message:
          "CARMATCH AI momentálne nedostal použiteľnú odpoveď z bezplatných AI modelov.",
        retryable: true,
        paidFallbackEnabled: false
      });
    }

    const result = aiResult.data;

    // =======================================================
    // EXACTLY 3 CARS
    // =======================================================

    if (
      !result ||
      !Array.isArray(result.cars) ||
      result.cars.length < 3
    ) {
      return res.status(503).json({
        error: "Invalid AI result",
        message:
          "AI nevrátila tri použiteľné vozidlá.",
        retryable: true,
        paidFallbackEnabled: false
      });
    }

    const selectedCars = result.cars.slice(0, 3);

    // =======================================================
    // IMAGE SEARCH IN PARALLEL
    // =======================================================

    const cars = await Promise.all(
      selectedCars.map(async function (car) {
        let photo = {
          image: "",
          photoSource: ""
        };

        try {
          photo = await findWikimediaImage(
            car.manufacturer,
            car.name,
            car.generation
          );
        } catch (error) {
          console.error(
            "PHOTO SEARCH ERROR:",
            error
          );
        }

        return normalizeCar(
          car,
          photo
        );
      })
    );

    // =======================================================
    // FINAL RESPONSE
    // =======================================================

    return res.status(200).json({
      language:
        result.language || language,

      market:
        result.market || market,

      cars: cars,

      ai: {
        model:
          aiResult.model ||
          "openrouter/free",

        paidFallbackEnabled: false,

        paidFallbackUsed: false
      }
    });

  } catch (error) {
    console.error(
      "CARMATCH AI BACKEND ERROR:",
      error
    );

    return res.status(500).json({
      error: "Backend error",
      message:
        error && error.message
          ? error.message
          : "Unknown server error"
    });
  }
};


// ===========================================================
// LANGUAGE DETECTION
// ===========================================================

function detectLanguage(text) {
  const t = String(text || "").toLowerCase();

  if (
    /[áäčďéíĺľňóôŕšťúýž]/.test(t) ||
    /\b(chcem|potrebujem|auto|vozidlo|kufor|výkon|pohon|cena|miest|rok|benzín|nafta|elektrické|hybrid)\b/.test(t)
  ) {
    return "sk";
  }

  if (
    /[ěščřžůúďťňóáíé]/.test(t) ||
    /\b(chci|potřebuji|vozidlo|kufr|výkon|pohon|cena|místa|rok)\b/.test(t)
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


// ===========================================================
// MARKET
// ===========================================================

function getMarket(language) {
  const map = {
    sk: "Slovakia / European Union",
    cs: "Czech Republic / European Union",
    de: "Germany / European Union",
    fr: "France / European Union",
    it: "Italy / European Union",
    es: "Spain / European Union",
    pl: "Poland / European Union",
    en: "International market"
  };

  return map[language] || "International market";
}


// ===========================================================
// PROMPT
// ===========================================================

function createPrompt(
  naturalLanguage,
  filters,
  language,
  market
) {
  return `
You are CARMATCH AI.

You are a worldwide automobile recommendation engine.

CURRENT DATE:
September 2026

LANGUAGE:
${language}

MARKET:
${market}

USER REQUEST:
${naturalLanguage || "No free text provided."}

FILTERS:
${JSON.stringify(filters, null, 2)}

============================================================
TASK
============================================================

Return exactly 3 real production cars.

Choose cars that genuinely match the user's requirements.

Consider manufacturers from around the world.

Do not recommend a brand explicitly excluded by the user.

Do not automatically recommend:
- Škoda Superb
- Mercedes-Benz E-Class
- Audi A6

unless they genuinely match the request.

============================================================
REQUIREMENTS
============================================================

Respect:

- budget
- price
- minimum power
- kW
- horsepower
- seats
- trunk
- drivetrain
- AWD
- 4x4
- RWD
- FWD
- fuel
- petrol
- diesel
- electric
- hybrid
- plug-in hybrid
- body type
- vehicle length
- model year
- performance
- practicality
- maintenance
- brands to avoid
- requested brands
- all explicit user requirements

If the user wants 2 seats:
prefer true 2-seat vehicles.

If the user wants high power:
do not replace the requirement with a weak mainstream vehicle.

If the user wants a large trunk:
prioritize genuinely practical luggage capacity.

============================================================
MODEL YEAR
============================================================

Current date is September 2026.

Prefer the newest genuinely available generation.

Prefer current 2026 vehicles.

Use 2027 only if genuinely available.

Never invent a model year.

Never confuse:

- generation
- facelift
- model year
- production year

When exact year is uncertain:
use "Aktuálna generácia".

============================================================
PRICE
============================================================

Provide a current real starting price only when reliable.

For Slovakia/EU:
prefer Slovak pricing.

If unavailable:
use reliable EU pricing.

Never invent a price.

When a reliable price exists:

priceVerified = true

When not reliably available:

price = "Cena nie je dostupná"
priceVerified = false

============================================================
SPECIFICATIONS
============================================================

Never invent:

- power
- horsepower
- kW
- torque
- seats
- trunk
- dimensions
- drivetrain
- fuel
- generation
- year
- price

For cars with multiple engines:
state the relevant version in the specification.

============================================================
MAINTENANCE
============================================================

Describe actual vehicle-specific maintenance factors.

Examples:

- engine oil
- transmission
- AWD
- differential
- brakes
- tires
- DPF
- AdBlue
- spark plugs
- timing belt
- timing chain
- cooling
- EV battery
- electric motor
- hybrid system
- expensive components
- vehicle complexity

Do not invent exact service intervals.

============================================================
PROS AND CONS
============================================================

Make pros and cons specific to the actual vehicle.

============================================================
CONFIGURATOR
============================================================

Provide an official manufacturer configurator URL only when
you are confident that it is correct.

Never invent a URL.

If unknown:

""

============================================================
SCORE
============================================================

score must be an integer from 0 to 100.

It represents how closely the car matches the user's request.

============================================================
LANGUAGE
============================================================

All descriptive text must be in the user's language.

============================================================
OUTPUT
============================================================

Return ONLY valid JSON.

No markdown.
No code block.
No explanation.
No reasoning.
No commentary.

Use exactly:

{
  "language": "${language}",
  "market": "${market}",
  "cars": [
    {
      "name": "string",
      "manufacturer": "string",
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
      "configurator": "string"
    }
  ]
}

Exactly 3 cars.
`;
}


// ===========================================================
// OPENROUTER
// ===========================================================

async function callAI(
  apiKey,
  model,
  prompt
) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(function () {
      controller.abort();
    }, 18000);

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",

        headers: {
          "Authorization":
            "Bearer " + apiKey,

          "Content-Type":
            "application/json",

          "HTTP-Referer":
            "https://carmatchai.vercel.app",

          "X-Title":
            "CARMATCH AI"
        },

        signal: controller.signal,

        body: JSON.stringify({
          model: model,

          messages: [
            {
              role: "system",

              content:
                "Return ONLY valid JSON. Exactly 3 real production cars. No markdown. No reasoning. No commentary."
            },

            {
              role: "user",

              content: prompt
            }
          ],

          temperature: 0.1,

          max_tokens: 4500
        })
      }
    );

    const text =
      await response.text();

    if (!response.ok) {
      return {
        ok: false,

        status:
          response.status,

        error:
          text.slice(0, 1200)
      };
    }

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      return {
        ok: false,

        status: 502,

        error:
          "Invalid JSON response from OpenRouter"
      };
    }

    if (
      data &&
      data.error
    ) {
      return {
        ok: false,

        status:
          Number(
            data.error.code
          ) || 502,

        error:
          data.error.message ||
          "OpenRouter error"
      };
    }

    let content = "";

    if (
      data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message
    ) {
      content =
        data.choices[0].message.content ||
        "";
    }

    if (
      Array.isArray(content)
    ) {
      content =
        content
          .map(function (item) {
            if (
              typeof item === "string"
            ) {
              return item;
            }

            return item &&
              typeof item.text ===
                "string"
              ? item.text
              : "";
          })
          .join("");
    }

    content =
      cleanText(content);

    const parsed =
      extractJSON(content);

    if (
      !isValidResult(parsed)
    ) {
      return {
        ok: false,

        status: 502,

        error:
          "AI returned an invalid car result"
      };
    }

    return {
      ok: true,

      data: parsed,

      model:
        data.model || model
    };

  } catch (error) {
    return {
      ok: false,

      status:
        error &&
        error.name === "AbortError"
          ? 504
          : 500,

      error:
        error &&
        error.message
          ? error.message
          : "AI request failed"
    };

  } finally {
    clearTimeout(timeout);
  }
}


// ===========================================================
// CLEAN TEXT
// ===========================================================

function cleanText(text) {
  let value =
    String(text || "").trim();

  value =
    value.replace(
      /^\s*```json\s*/i,
      ""
    );

  value =
    value.replace(
      /^\s*```\s*/i,
      ""
    );

  value =
    value.replace(
      /\s*```\s*$/i,
      ""
    );

  return value.trim();
}


// ===========================================================
// EXTRACT JSON
// ===========================================================

function extractJSON(text) {
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
    const character =
      text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (character === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (character === "{") {
      depth++;
    }

    if (character === "}") {
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


// ===========================================================
// VALIDATE
// ===========================================================

function isValidResult(data) {
  if (
    !data ||
    typeof data !== "object"
  ) {
    return false;
  }

  if (
    !Array.isArray(data.cars)
  ) {
    return false;
  }

  if (
    data.cars.length < 3
  ) {
    return false;
  }

  for (
    let i = 0;
    i < 3;
    i++
  ) {
    const car =
      data.cars[i];

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
      typeof car.manufacturer !== "string" ||
      !car.manufacturer.trim()
    ) {
      return false;
    }
  }

  return true;
}


// ===========================================================
// WIKIMEDIA IMAGE SEARCH
// ===========================================================

async function findWikimediaImage(
  manufacturer,
  name,
  generation
) {
  const query =
    [
      manufacturer,
      name,
      generation
    ]
      .filter(Boolean)
      .join(" ");

  const result =
    await searchWikimedia(query);

  if (result) {
    return result;
  }

  const fallback =
    [
      manufacturer,
      name
    ]
      .filter(Boolean)
      .join(" ");

  return (
    await searchWikimedia(
      fallback
    )
  ) || {
    image: "",
    photoSource: ""
  };
}


// ===========================================================
// WIKIMEDIA
// ===========================================================

async function searchWikimedia(query) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(function () {
      controller.abort();
    }, 2500);

  try {
    const parameters =
      new URLSearchParams({
        action: "query",
        generator: "search",
        gsrsearch: query,
        gsrnamespace: "6",
        gsrlimit: "6",
        prop: "imageinfo",
        iiprop: "url|mime",
        iiurlwidth: "1200",
        format: "json",
        origin: "*"
      });

    const response =
      await fetch(
        "https://commons.wikimedia.org/w/api.php?" +
        parameters.toString(),
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
        data &&
        data.query &&
        data.query.pages
          ? data.query.pages
          : {}
      );

    for (
      let i = 0;
      i < pages.length;
      i++
    ) {
      const page =
        pages[i];

      const info =
        page &&
        page.imageinfo &&
        page.imageinfo[0];

      if (!info) {
        continue;
      }

      const image =
        info.thumburl ||
        info.url ||
        "";

      const mime =
        String(
          info.mime || ""
        ).toLowerCase();

      const title =
        String(
          page.title || ""
        ).toLowerCase();

      if (
        !mime.startsWith("image/")
      ) {
        continue;
      }

      if (
        /logo|emblem|icon|badge|symbol|flag/.test(
          title
        )
      ) {
        continue;
      }

      if (image) {
        return {
          image: image,

          photoSource:
            "Wikimedia Commons"
        };
      }
    }

    return null;

  } catch {
    return null;

  } finally {
    clearTimeout(timeout);
  }
}


// ===========================================================
// NORMALIZE CAR
// ===========================================================

function normalizeCar(
  car,
  photo
) {
  let score =
    Number(car.score);

  if (
    !Number.isFinite(score)
  ) {
    score = 0;
  }

  score =
    Math.max(
      0,
      Math.min(
        100,
        Math.round(score)
      )
    );

  return {
    name:
      safeString(
        car.name,
        "Neznáme auto"
      ),

    manufacturer:
      safeString(
        car.manufacturer,
        "Neznámy výrobca"
      ),

    generation:
      safeString(
        car.generation,
        "Aktuálna generácia"
      ),

    year:
      safeString(
        car.year,
        "Aktuálna generácia"
      ),

    score: score,

    price:
      safeString(
        car.price,
        "Cena nie je dostupná"
      ),

    priceVerified:
      car.priceVerified === true,

    priceSource:
      safeString(
        car.priceSource,
        ""
      ),

    priceType:
      safeString(
        car.priceType,
        "unknown"
      ),

    power:
      safeString(
        car.power,
        "Údaj nie je dostupný"
      ),

    seats:
      safeString(
        car.seats,
        "Údaj nie je dostupný"
      ),

    trunk:
      safeString(
        car.trunk,
        "Údaj nie je dostupný"
      ),

    drive:
      safeString(
        car.drive,
        "Údaj nie je dostupný"
      ),

    fuel:
      safeString(
        car.fuel,
        "Údaj nie je dostupný"
      ),

    body:
      safeString(
        car.body,
        "Údaj nie je dostupný"
      ),

    dimensions:
      safeString(
        car.dimensions,
        "Údaj nie je dostupný"
      ),

    image:
      photo && photo.image
        ? photo.image
        : "",

    photoSource:
      photo && photo.photoSource
        ? photo.photoSource
        : "",

    reason:
      safeString(
        car.reason,
        "Vysvetlenie nie je dostupné."
      ),

    pros:
      Array.isArray(car.pros)
        ? car.pros
            .slice(0, 5)
            .map(function (item) {
              return String(item);
            })
        : [],

    cons:
      Array.isArray(car.cons)
        ? car.cons
            .slice(0, 5)
            .map(function (item) {
              return String(item);
            })
        : [],

    maintenance:
      safeString(
        car.maintenance,
        "Informácie o údržbe nie sú dostupné."
      ),

    configurator:
      isValidURL(
        car.configurator
      )
        ? car.configurator
        : ""
  };
}


// ===========================================================
// SAFE STRING
// ===========================================================

function safeString(
  value,
  fallback
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const result =
    String(value).trim();

  return result
    ? result
    : fallback;
}


// ===========================================================
// URL
// ===========================================================

function isValidURL(value) {
  if (
    typeof value !== "string" ||
    !value.trim()
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