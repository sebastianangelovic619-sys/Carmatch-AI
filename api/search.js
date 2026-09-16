module.exports = async function handler(req, res) {
  try {
    // =========================================================
    // CORS
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

    // =========================================================
    // OPENROUTER API KEY
    // =========================================================

    var apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "OPENROUTER_API_KEY is missing in Vercel"
      });
    }

    // =========================================================
    // REQUEST DATA
    // =========================================================

    var input = req.body || {};

    if (typeof input === "string") {
      try {
        input = JSON.parse(input);
      } catch (e) {
        input = {};
      }
    }

    var naturalLanguage = String(
      input.naturalLanguage || ""
    ).trim();

    var filters =
      input.filters &&
      typeof input.filters === "object"
        ? input.filters
        : {};

    var language = detectLanguage(naturalLanguage);
    var market = getMarket(language);

    // =========================================================
    // PROMPT
    // =========================================================

    var prompt = createPrompt(
      naturalLanguage,
      filters,
      language,
      market
    );

    // =========================================================
    // FREE MODELS
    // =========================================================
    // OpenRouter currently lists these free models.
    // openrouter/free automatically selects an available
    // compatible free model.
    // =========================================================

    var models = [
      "openrouter/free",
      "google/gemma-4-26b-a4b-it:free",
      "google/gemma-4-31b-it:free",
      "nvidia/nemotron-3-super-120b-a12b:free"
    ];

    var paidEnabled =
      String(
        process.env.PAID_FALLBACK_ENABLED || "false"
      ).toLowerCase() === "true";

    var paidModel =
      process.env.PAID_FALLBACK_MODEL ||
      "openai/gpt-oss-120b";

    var result = null;
    var usedModel = "";
    var errors = [];

    // =========================================================
    // ROUND 1
    // =========================================================

    for (var i = 0; i < models.length; i++) {
      var attempt = await callAI(
        apiKey,
        models[i],
        prompt
      );

      if (attempt.ok) {
        result = attempt.data;
        usedModel = attempt.model || models[i];
        break;
      }

      errors.push({
        model: models[i],
        status: attempt.status || 0,
        error: attempt.error || "Unknown AI error"
      });
    }

    // =========================================================
    // SHORT RETRY
    // =========================================================

    if (!result) {
      await wait(500);

      // Najprv skúsime router znova, pretože vyberá
      // dostupný free provider automaticky.
      var retry = await callAI(
        apiKey,
        "openrouter/free",
        prompt
      );

      if (retry.ok) {
        result = retry.data;
        usedModel =
          retry.model || "openrouter/free";
      } else {
        errors.push({
          model: "openrouter/free-retry",
          status: retry.status || 0,
          error: retry.error || "Retry failed"
        });
      }
    }

    // =========================================================
    // OPTIONAL PAID FALLBACK
    // =========================================================

    if (!result && paidEnabled) {
      var paidAttempt = await callAI(
        apiKey,
        paidModel,
        prompt
      );

      if (paidAttempt.ok) {
        result = paidAttempt.data;
        usedModel =
          paidAttempt.model || paidModel;
      } else {
        errors.push({
          model: paidModel,
          status: paidAttempt.status || 0,
          error:
            paidAttempt.error ||
            "Paid fallback failed"
        });
      }
    }

    // =========================================================
    // COMPLETE FAILURE
    // =========================================================

    if (!result) {
      console.error(
        "CARMATCH AI FREE MODEL ERRORS:",
        JSON.stringify(errors)
      );

      return res.status(503).json({
        error: "AI is temporarily unavailable",

        message:
          paidEnabled
            ? "CARMATCH AI momentálne nedostal použiteľnú odpoveď."
            : "CARMATCH AI momentálne nedostal použiteľnú odpoveď z bezplatných AI modelov.",

        retryable: true,

        paidFallbackEnabled: paidEnabled
      });
    }

    // =========================================================
    // EXACTLY 3 CARS
    // =========================================================

    if (
      !Array.isArray(result.cars) ||
      result.cars.length < 3
    ) {
      return res.status(503).json({
        error: "AI returned insufficient results",
        message:
          "AI nevrátila tri použiteľné vozidlá.",
        retryable: true,
        paidFallbackEnabled: paidEnabled
      });
    }

    var selectedCars =
      result.cars.slice(0, 3);

    // =========================================================
    // IMAGES
    // =========================================================

    var cars = [];

    for (var k = 0; k < selectedCars.length; k++) {
      var currentCar = selectedCars[k];

      var photo = await findWikimediaImage(
        currentCar.manufacturer,
        currentCar.name,
        currentCar.generation
      );

      cars.push(
        normalizeCar(
          currentCar,
          photo
        )
      );
    }

    // =========================================================
    // FINAL RESPONSE
    // =========================================================

    return res.status(200).json({
      language:
        result.language || language,

      market:
        result.market || market,

      cars: cars,

      ai: {
        model: usedModel,

        paidFallbackEnabled:
          paidEnabled,

        paidFallbackUsed:
          paidEnabled &&
          usedModel === paidModel
      }
    });
  } catch (error) {
    console.error(
      "CARMATCH AI ERROR:",
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
// LANGUAGE
// ===========================================================

function detectLanguage(text) {
  var t = String(text || "").toLowerCase();

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
  var map = {
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
You are CARMATCH AI, a worldwide vehicle recommendation engine.

CURRENT DATE:
September 2026

LANGUAGE:
${language}

MARKET:
${market}

USER REQUEST:
${naturalLanguage || "No free text was provided."}

FILTERS:
${JSON.stringify(filters, null, 2)}

============================================================
TASK
============================================================

Return EXACTLY 3 real production vehicles.

Match the user's requirements as closely as possible.

Consider vehicles from manufacturers worldwide.

Never recommend an excluded brand.

Do not automatically recommend:
- Škoda Superb
- Mercedes-Benz E-Class
- Audi A6

unless they genuinely match the request.

============================================================
IMPORTANT FILTERS
============================================================

Respect:

- budget
- maximum price
- minimum price
- minimum power
- minimum kW
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
- specific brands
- all other explicit requirements

If the user specifies 2 seats:
prefer genuine 2-seat vehicles.

If high performance is required:
do not replace them with weak mainstream vehicles.

If a large trunk is required:
prioritize genuinely practical luggage capacity.

============================================================
MODEL YEAR
============================================================

Current date is September 2026.

Prefer the newest genuinely available generation.

Prefer current 2026 vehicles.

Use 2027 only when genuinely available.

Never invent a model year.

Never confuse:
- production year
- model year
- facelift
- generation

If exact model year is uncertain:
use "Aktuálna generácia".

============================================================
PRICE
============================================================

Try to provide a real current starting price.

For Slovakia/EU:
prefer current Slovak pricing.

If unavailable:
use current EU pricing when reliable.

Never invent a price.

If a reliable current price is known:

priceVerified = true

Otherwise:

price = "Cena nie je dostupná"
priceVerified = false

============================================================
SPECIFICATIONS
============================================================

Never invent:

- power
- kW
- horsepower
- torque
- seats
- trunk
- dimensions
- drivetrain
- fuel
- generation
- year
- price

If multiple engines exist:
state which version the specifications describe.

============================================================
MAINTENANCE
============================================================

Maintenance must be specific to the selected vehicle.

Discuss relevant factors such as:

- engine oil
- transmission
- AWD system
- differential
- brakes
- tires
- DPF
- AdBlue
- spark plugs
- timing belt or chain
- cooling
- EV battery
- electric motor
- hybrid system
- complexity
- potentially expensive components

Do not invent exact service intervals.

============================================================
PROS AND CONS
============================================================

Pros and cons must be specific to the actual vehicle.

============================================================
CONFIGURATOR
============================================================

Provide an official manufacturer configurator URL only when confidently known.

Never invent URLs.

Otherwise:
"".

============================================================
SCORE
============================================================

score must be an integer from 0 to 100.

It represents how well the vehicle matches the user's exact requirements.

============================================================
LANGUAGE
============================================================

All descriptive text must be in the user's language.

============================================================
JSON
============================================================

Return ONLY valid JSON.

No markdown.
No code block.
No explanation.
No reasoning.
No commentary.

Use this structure:

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

EXACTLY 3 CARS.
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
  var controller =
    new AbortController();

  var timeout = setTimeout(
    function () {
      controller.abort();
    },
    14000
  );

  try {
    var body = {
      model: model,

      messages: [
        {
          role: "system",
          content:
            "Return ONLY valid JSON. Exactly 3 real production cars. No markdown. No reasoning."
        },
        {
          role: "user",
          content: prompt
        }
      ],

      temperature: 0.1,

      max_tokens: 5000,

      response_format: {
        type: "json_object"
      }
    };

    var response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",

        headers: {
          Authorization:
            "Bearer " + apiKey,

          "Content-Type":
            "application/json",

          "HTTP-Referer":
            "https://carmatchai.vercel.app",

          "X-Title":
            "CARMATCH AI"
        },

        signal: controller.signal,

        body: JSON.stringify(body)
      }
    );

    var text =
      await response.text();

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: text.slice(0, 1200)
      };
    }

    var data;

    try {
      data = JSON.parse(text);
    } catch (e) {
      return {
        ok: false,
        status: 502,
        error:
          "OpenRouter returned invalid JSON"
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

    var content =
      data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message
        ? data.choices[0].message.content
        : "";

    if (Array.isArray(content)) {
      content =
        content
          .map(function (item) {
            if (
              typeof item ===
              "string"
            ) {
              return item;
            }

            return item &&
              item.text
              ? item.text
              : "";
          })
          .join("");
    }

    content =
      cleanText(content);

    var parsed =
      extractJSON(content);

    if (!isValidResult(parsed)) {
      return {
        ok: false,
        status: 502,
        error:
          "AI returned invalid JSON or fewer than 3 cars"
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
          : "Request failed"
    };
  } finally {
    clearTimeout(timeout);
  }
}


// ===========================================================
// CLEAN TEXT
// ===========================================================

function cleanText(text) {
  var value =
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

  value =
    value.replace(
      /^\s*(User Safety|Safety)\s*:\s*safe\s*/i,
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

  var start =
    text.indexOf("{");

  if (start === -1) {
    return null;
  }

  var depth = 0;
  var inString = false;
  var escaped = false;

  for (
    var i = start;
    i < text.length;
    i++
  ) {
    var character =
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
        var candidate =
          text.slice(
            start,
            i + 1
          );

        try {
          return JSON.parse(
            candidate
          );
        } catch (e) {
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
    var i = 0;
    i < 3;
    i++
  ) {
    var car =
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
      typeof car.manufacturer !==
      "string"
    ) {
      return false;
    }

    if (
      typeof car.generation !==
      "string"
    ) {
      return false;
    }

    if (
      typeof car.year !==
      "string"
    ) {
      return false;
    }

    if (
      typeof car.price !==
      "string"
    ) {
      return false;
    }

    if (
      !Array.isArray(car.pros)
    ) {
      return false;
    }

    if (
      !Array.isArray(car.cons)
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


// ===========================================================
// WIKIMEDIA IMAGE SEARCH
// ===========================================================

async function findWikimediaImage(
  manufacturer,
  name,
  generation
) {
  var queries = [
    manufacturer +
      " " +
      name +
      " " +
      generation +
      " 2026",

    manufacturer +
      " " +
      name +
      " 2026",

    manufacturer +
      " " +
      name
  ];

  for (
    var i = 0;
    i < queries.length;
    i++
  ) {
    var found =
      await searchWikimedia(
        queries[i]
      );

    if (
      found &&
      found.image
    ) {
      return found;
    }
  }

  return {
    image: "",
    photoSource: ""
  };
}


// ===========================================================
// WIKIMEDIA
// ===========================================================

async function searchWikimedia(
  query
) {
  var controller =
    new AbortController();

  var timeout =
    setTimeout(
      function () {
        controller.abort();
      },
      3000
    );

  try {
    var parameters =
      new URLSearchParams({
        action: "query",
        generator: "search",
        gsrsearch: query,
        gsrnamespace: "6",
        gsrlimit: "8",
        prop: "imageinfo",
        iiprop: "url|mime",
        iiurlwidth: "1200",
        format: "json",
        origin: "*"
      });

    var response =
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

    var data =
      await response.json();

    var pages =
      Object.values(
        (
          data &&
          data.query &&
          data.query.pages
        ) || {}
      );

    for (
      var i = 0;
      i < pages.length;
      i++
    ) {
      var page =
        pages[i];

      var info =
        page &&
        page.imageinfo &&
        page.imageinfo[0];

      if (!info) {
        continue;
      }

      var image =
        info.thumburl ||
        info.url ||
        "";

      var mime =
        String(
          info.mime || ""
        ).toLowerCase();

      var title =
        String(
          page.title || ""
        ).toLowerCase();

      if (
        !mime.startsWith(
          "image/"
        )
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
  } catch (e) {
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
  var score =
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
      String(
        car.name ||
        "Neznáme auto"
      ),

    manufacturer:
      String(
        car.manufacturer || ""
      ),

    generation:
      String(
        car.generation ||
        "Aktuálna generácia"
      ),

    year:
      String(
        car.year ||
        "Aktuálna generácia"
      ),

    score: score,

    price:
      String(
        car.price ||
        "Cena nie je dostupná"
      ),

    priceVerified:
      car.priceVerified === true,

    priceSource:
      String(
        car.priceSource || ""
      ),

    priceType:
      String(
        car.priceType ||
        "unknown"
      ),

    power:
      String(
        car.power ||
        "Údaj nie je dostupný"
      ),

    seats:
      String(
        car.seats ||
        "Údaj nie je dostupný"
      ),

    trunk:
      String(
        car.trunk ||
        "Údaj nie je dostupný"
      ),

    drive:
      String(
        car.drive ||
        "Údaj nie je dostupný"
      ),

    fuel:
      String(
        car.fuel ||
        "Údaj nie je dostupný"
      ),

    body:
      String(
        car.body ||
        "Údaj nie je dostupný"
      ),

    dimensions:
      String(
        car.dimensions ||
        "Údaj nie je dostupný"
      ),

    image:
      photo &&
      photo.image
        ? photo.image
        : "",

    photoSource:
      photo &&
      photo.photoSource
        ? photo.photoSource
        : "",

    reason:
      String(
        car.reason ||
        "Vysvetlenie nie je dostupné."
      ),

    pros:
      Array.isArray(car.pros)
        ? car.pros.slice(0, 5)
        : [],

    cons:
      Array.isArray(car.cons)
        ? car.cons.slice(0, 5)
        : [],

    maintenance:
      String(
        car.maintenance ||
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
// URL VALIDATION
// ===========================================================

function isValidURL(value) {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return false;
  }

  try {
    var url =
      new URL(value);

    return (
      url.protocol === "https:" ||
      url.protocol === "http:"
    );
  } catch (e) {
    return false;
  }
}


// ===========================================================
// WAIT
// ===========================================================

function wait(ms) {
  return new Promise(
    function (resolve) {
      setTimeout(
        resolve,
        ms
      );
    }
  );
}