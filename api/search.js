// ============================================================
// CARMATCH AI - FINAL BACKEND v6.2
// ============================================================
// Current Groq browser-search models
// Groq GPT-OSS 120B primary
// Groq GPT-OSS 20B fallback
// OpenRouter FREE fallbacks
// Supabase anonymous auth + 5 searches/day
// Search refund protection
// Frontend refund action support
// Stronger automotive research prompt
// Better power + price extraction
// More detailed descriptions
// Exact vehicle image search
// Wikimedia Commons + Wikipedia exact-page fallback
// ============================================================


// ============================================================
// API ENDPOINTS
// ============================================================

const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const OPENROUTER_URL =
  "https://openrouter.ai/api/v1/chat/completions";

const WIKIMEDIA_API =
  "https://commons.wikimedia.org/w/api.php";

const WIKIPEDIA_API =
  "https://en.wikipedia.org/w/api.php";


// ============================================================
// ENVIRONMENT
// ============================================================

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const GROQ_API_KEY =
  process.env.GROQ_API_KEY;

const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY;


// ============================================================
// SEARCH LIMIT
// ============================================================

const MAX_SEARCHES_PER_DAY = 5;


// ============================================================
// TIMEOUTS
// ============================================================

const GROQ_PRIMARY_TIMEOUT = 55000;
const GROQ_FALLBACK_TIMEOUT = 45000;
const OPENROUTER_TIMEOUT = 35000;

const WIKIMEDIA_TIMEOUT = 8000;
const WIKIPEDIA_TIMEOUT = 8000;


// ============================================================
// CURRENT GROQ MODELS
// ============================================================

const GROQ_PRIMARY_MODEL =
  "openai/gpt-oss-120b";

const GROQ_FALLBACK_MODEL =
  "openai/gpt-oss-20b";


// ============================================================
// IMAGE SETTINGS
// ============================================================

const MAX_IMAGE_CANDIDATES = 12;

const IMAGE_SEARCH_LIMIT = 35;

const IMAGE_MIN_WIDTH = 500;

const IMAGE_MIN_HEIGHT = 280;


// ============================================================
// OPENROUTER FREE MODELS
// ============================================================

const OPENROUTER_FREE_MODELS = [
  "qwen/qwen3.8-27b:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3.5-lightning:free",
  "openrouter/free"
];


// ============================================================
// IMAGE REJECT WORDS
// ============================================================

const IMAGE_REJECT_WORDS = [
  "logo",
  "icon",
  "flag",
  "emblem",
  "badge",
  "wheel",
  "wheels",
  "rim",
  "rims",
  "interior",
  "dashboard",
  "steering",
  "engine",
  "motor",
  "poster",
  "advertisement",
  "advert",
  "brochure",
  "catalogue",
  "catalog",
  "drawing",
  "diagram",
  "blueprint",
  "screenshot",
  "model kit",
  "toy",
  "miniature",
  "hot wheels",
  "matchbox",
  "scale model",
  "diecast",
  "render",
  "concept",
  "prototype",
  "motorcycle",
  "motorbike",
  "truck",
  "bus",
  "van"
];


// ============================================================
// RESPONSE
// ============================================================

function sendJson(res, status, data) {
  res.status(status);

  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );

  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Search-Request-Id"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  return res.json(data);
}


// ============================================================
// FETCH WITH TIMEOUT
// ============================================================

async function fetchWithTimeout(
  url,
  options = {},
  timeout = 15000
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      timeout
    );

  try {
    return await fetch(
      url,
      {
        ...options,
        signal:
          controller.signal
      }
    );
  } finally {
    clearTimeout(timer);
  }
}


// ============================================================
// TEXT HELPERS
// ============================================================

function text(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value).trim();
}


function arrayText(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(item => text(item))
    .filter(Boolean);
}


// ============================================================
// NUMBER HELPERS
// ============================================================

function normalizeNumber(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : null;
  }

  const match =
    String(value)
      .replace(",", ".")
      .match(/-?\d+(?:\.\d+)?/);

  if (!match) {
    return null;
  }

  const number =
    Number(match[0]);

  return Number.isFinite(number)
    ? number
    : null;
}


// ============================================================
// POWER NORMALIZATION
// ============================================================

function normalizePower(value) {
  return normalizeNumber(value);
}


// ============================================================
// PRICE NORMALIZATION
// ============================================================

function normalizePrice(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "Cena nie je dostupná";
  }

  const valueText =
    String(value).trim();

  if (!valueText) {
    return "Cena nie je dostupná";
  }

  const lower =
    valueText.toLowerCase();

  const unavailable = [
    "unknown",
    "n/a",
    "na",
    "not available",
    "not found",
    "unavailable",
    "unknown price",
    "price unavailable",
    "null",
    "undefined",
    "cena nie je dostupná"
  ];

  if (
    unavailable.includes(lower)
  ) {
    return "Cena nie je dostupná";
  }

  if (
    lower.includes(
      "price on request"
    ) ||
    lower.includes(
      "price upon request"
    ) ||
    lower.includes(
      "cena na vyžiadanie"
    )
  ) {
    return "Cena na vyžiadanie";
  }

  return valueText;
}


// ============================================================
// AI JSON PARSER
// ============================================================

function parseAIJson(content) {
  let raw =
    text(content);

  if (!raw) {
    throw new Error(
      "AI returned empty response."
    );
  }


  // Remove markdown fences.

  raw =
    raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();


  // First try direct JSON.

  try {
    return JSON.parse(raw);
  } catch (_) {
    // Continue.
  }


  // Try extracting the first JSON object.

  const firstBrace =
    raw.indexOf("{");

  const lastBrace =
    raw.lastIndexOf("}");


  if (
    firstBrace !== -1 &&
    lastBrace !== -1 &&
    lastBrace > firstBrace
  ) {
    const extracted =
      raw.slice(
        firstBrace,
        lastBrace + 1
      );

    try {
      return JSON.parse(
        extracted
      );
    } catch (_) {
      // Continue.
    }
  }


  throw new Error(
    "AI returned invalid JSON."
  );
}


// ============================================================
// SUPABASE USER VERIFICATION
// ============================================================

async function verifyUser(
  accessToken
) {
  if (!SUPABASE_URL) {
    throw new Error(
      "SUPABASE_URL is missing."
    );
  }

  if (!SUPABASE_ANON_KEY) {
    throw new Error(
      "SUPABASE_ANON_KEY is missing."
    );
  }


  const response =
    await fetchWithTimeout(
      `${SUPABASE_URL}/auth/v1/user`,
      {
        method: "GET",

        headers: {
          apikey:
            SUPABASE_ANON_KEY,

          Authorization:
            `Bearer ${accessToken}`
        }
      },
      10000
    );


  if (!response.ok) {
    throw new Error(
      "Invalid Supabase session."
    );
  }


  const user =
    await response.json();


  if (
    !user ||
    !user.id
  ) {
    throw new Error(
      "Supabase user not found."
    );
  }


  return user;
}


// ============================================================
// SUPABASE RPC
// ============================================================

async function callSupabaseRPC(
  functionName,
  accessToken
) {
  const response =
    await fetchWithTimeout(
      `${SUPABASE_URL}/rest/v1/rpc/${functionName}`,
      {
        method: "POST",

        headers: {
          apikey:
            SUPABASE_ANON_KEY,

          Authorization:
            `Bearer ${accessToken}`,

          "Content-Type":
            "application/json"
        },

        body: "{}"
      },
      10000
    );


  const raw =
    await response.text();


  let data = null;


  try {
    data =
      raw
        ? JSON.parse(raw)
        : null;
  } catch (_) {
    data = raw;
  }


  if (!response.ok) {
    throw new Error(
      `Supabase RPC ${functionName} failed: ${response.status}`
    );
  }


  return data;
}


// ============================================================
// USE SEARCH
// ============================================================

async function useSearch(
  accessToken
) {
  const result =
    await callSupabaseRPC(
      "use_search",
      accessToken
    );


  if (
    typeof result === "boolean"
  ) {
    return {
      allowed:
        result,

      remaining:
        result
          ? Math.max(
              MAX_SEARCHES_PER_DAY - 1,
              0
            )
          : 0
    };
  }


  if (
    typeof result === "number"
  ) {
    return {
      allowed:
        result > 0,

      remaining:
        Math.max(
          result,
          0
        )
    };
  }


  if (
    Array.isArray(result)
  ) {
    const row =
      result[0] || {};

    return {
      allowed:
        row.allowed !== false &&
        row.success !== false,

      remaining:
        Number.isFinite(
          Number(row.remaining)
        )
          ? Number(row.remaining)
          : null
    };
  }


  if (
    result &&
    typeof result === "object"
  ) {
    return {
      allowed:
        result.allowed !== false &&
        result.success !== false,

      remaining:
        Number.isFinite(
          Number(result.remaining)
        )
          ? Number(result.remaining)
          : null
    };
  }


  return {
    allowed: true,
    remaining: null
  };
}


// ============================================================
// REFUND SEARCH
// ============================================================

async function refundSearch(
  accessToken
) {
  try {
    const result =
      await callSupabaseRPC(
        "refund_search",
        accessToken
      );


    if (
      Array.isArray(result)
    ) {
      const row =
        result[0] || {};

      return {
        success:
          row.success !== false,

        remaining:
          Number.isFinite(
            Number(row.remaining)
          )
            ? Number(row.remaining)
            : null
      };
    }


    if (
      result &&
      typeof result === "object"
    ) {
      return {
        success:
          result.success !== false,

        remaining:
          Number.isFinite(
            Number(result.remaining)
          )
            ? Number(result.remaining)
            : null
      };
    }


    return {
      success: true,
      remaining: null
    };

  } catch (error) {

    console.error(
      "refund_search failed:",
      error?.message || error
    );


    return {
      success: false,
      remaining: null
    };
  }
}


// ============================================================
// REQUEST NORMALIZATION
// ============================================================

function normalizeRequest(
  body
) {
  const input =
    body &&
    typeof body === "object"
      ? body
      : {};


  const filters =
    input.filters &&
    typeof input.filters === "object"
      ? input.filters
      : {};


  return {
    naturalLanguage:
      text(
        input.naturalLanguage ||
        input.query ||
        input.prompt
      ),

    filters: {
      budget:
        text(filters.budget),

      seats:
        text(filters.seats),

      minPower:
        text(filters.minPower),

      trunk:
        text(filters.trunk),

      drive:
        text(filters.drive),

      fuel:
        text(filters.fuel),

      body:
        text(filters.body),

      style:
        text(filters.style),

      length:
        text(filters.length),

      year:
        text(filters.year),

      avoidBrands:
        arrayText(
          filters.avoidBrands
        )
    },

    resultCount: 3
  };
}


// ============================================================
// MARKET DETECTION
// ============================================================

function detectMarket(
  request
) {
  const combined =
    JSON.stringify(
      request
    ).toLowerCase();


  if (
    combined.includes("slovak") ||
    combined.includes("slovakia") ||
    combined.includes("slovensko") ||
    combined.includes("eur") ||
    combined.includes("€")
  ) {
    return "Slovakia / European Union";
  }


  return "European Union";
}


// ============================================================
// BUILD AI PROMPT
// ============================================================

function buildPrompt(
  request
) {
  const currentDate =
    new Date()
      .toISOString()
      .slice(0, 10);


  const market =
    detectMarket(
      request
    );


  return `
You are CARMATCH AI, a professional automotive research assistant.

CURRENT DATE:
${currentDate}

TARGET MARKET:
${market}

USER REQUEST:
${request.naturalLanguage || "No natural-language request provided."}

FILTERS:
${JSON.stringify(
  request.filters,
  null,
  2
)}


============================================================
CORE OBJECTIVE
============================================================

Find exactly 3 real vehicles that best match the user's request.

Do actual current web research before answering.

Do not rely only on your memory.

Every important specification should be supported by current web information whenever possible.


============================================================
VEHICLE SELECTION
============================================================

1. Return EXACTLY 3 real production vehicles.

2. The vehicle must actually exist.

3. Respect body style.

4. Respect power requirements.

5. Respect drivetrain requirements.

6. Respect seat requirements.

7. Respect trunk/boot requirements.

8. Respect budget requirements.

9. Respect fuel/powertrain requirements.

10. Respect year/model-generation requirements.

11. Respect avoidBrands.

12. Do NOT recommend a normal low-power version when the user explicitly asks for a high-performance version.

13. Prefer the newest currently available production generation that fits the request.

14. Do not invent a future model or specification.


============================================================
CURRENT RESEARCH
============================================================

For EACH vehicle, research:

- current model generation
- current model year
- exact engine or powertrain
- exact power
- seats
- boot/trunk capacity
- drivetrain
- fuel/powertrain
- length
- current price in the target market
- maintenance considerations
- official configurator
- relevant current vehicle details

Use multiple relevant web searches when necessary.

Prefer manufacturer sources for technical specifications.

Prefer official regional manufacturer or dealer sources for prices.

Use reputable automotive sources as secondary verification.

Do not invent a value merely because a field is required.


============================================================
PRICE RULES
============================================================

This is extremely important.

1. Find the current price for the TARGET MARKET.

2. Prefer Slovakia / EU pricing when the request is for Slovakia or Europe.

3. Do NOT use an unrelated US price when a European price is available.

4. Do NOT use an old price when a current price is available.

5. Do NOT invent a price.

6. If the exact current price cannot be verified, write:
"Cena nie je dostupná"

7. If the official source explicitly says price on request, write:
"Cena na vyžiadanie"

8. priceSource should contain the URL of the page used for the price whenever a reliable URL was found.

9. Never fabricate a priceSource URL.


============================================================
POWER RULES
============================================================

The application displays ONLY HP and kW.

IMPORTANT:

- Never use PS.
- Never use ks.
- Never use k.
- Never use koní.
- Never use kon.
- Never convert HP to kW.
- Never convert kW to HP.

For powerHP:
Only provide a number if the researched source explicitly provides HP/bhp/horsepower.

For powerKW:
Only provide a number if the researched source explicitly provides kW.

If one source gives both, preserve both source values exactly.

If the source gives only PS and no HP or kW, do NOT convert PS.

Search for another reliable source that explicitly gives HP or kW before leaving the field empty.


============================================================
DESCRIPTIONS
============================================================

Do NOT be overly brief.

maintenance:
Write 2-4 informative sentences in Slovak.

reason:
Write approximately 3-5 informative sentences in Slovak explaining why the vehicle matches the user's request.

pros:
Return at least 3 useful vehicle-specific advantages whenever real information supports them.

cons:
Return at least 3 useful vehicle-specific disadvantages whenever real information supports them.

Do NOT use generic filler like:
"dobré auto"
"dobrý výkon"
"pekný dizajn"

Be specific to the actual vehicle.


============================================================
TRUNK / BOOT
============================================================

Use the manufacturer's published boot/trunk capacity whenever possible.

Keep the original published unit if possible.

Do not invent a trunk value.


============================================================
OFFICIAL CONFIGURATOR
============================================================

Return ONLY an official manufacturer configurator URL.

Do not invent URLs.

Do not return dealer configurators unless they are clearly the official manufacturer configurator.

If a reliable official configurator cannot be found:
return an empty string.


============================================================
IMAGE
============================================================

Do not generate image URLs.

Return:

"image": "",
"photoSource": ""

The backend will independently search Wikimedia Commons and Wikipedia for exact photographs.


============================================================
SOURCE DISCIPLINE
============================================================

For every vehicle:

- Do not mix specifications between different generations.
- Do not mix specifications between different engines.
- Do not use a price for a different trim when another exact current trim fits.
- Make the selected powertrain explicit in the vehicle name or generation when necessary.
- Use current information whenever possible.


============================================================
MATCH SCORE
============================================================

score must be a number from 0 to 100.

It represents only how closely the vehicle matches the user's explicit requirements.

It is NOT a popularity score.

It is NOT a quality ranking.

It is NOT a general opinion score.


============================================================
OUTPUT
============================================================

Return ONLY valid JSON.

Do NOT write markdown.

Do NOT write explanations outside JSON.

Do NOT wrap the JSON in markdown code fences.


EXACT STRUCTURE:

{
  "cars": [
    {
      "name": "",
      "brand": "",
      "model": "",
      "generation": "",
      "year": "",
      "price": "",
      "currency": "",
      "priceSource": "",
      "powerHP": null,
      "powerKW": null,
      "seats": null,
      "trunk": "",
      "drive": "",
      "fuel": "",
      "body": "",
      "length": "",
      "officialConfigurator": "",
      "maintenance": "",
      "pros": [],
      "cons": [],
      "reason": "",
      "score": 0,
      "image": "",
      "photoSource": ""
    }
  ]
}
`.trim();
}


// ============================================================
// EXTRACT ALTERNATIVE CAR FIELDS
// ============================================================

function getFirstValue(
  object,
  keys
) {
  if (
    !object ||
    typeof object !== "object"
  ) {
    return null;
  }


  for (
    const key of keys
  ) {
    if (
      object[key] !== undefined &&
      object[key] !== null &&
      object[key] !== ""
    ) {
      return object[key];
    }
  }


  return null;
}


// ============================================================
// NORMALIZE CAR
// ============================================================

function normalizeCar(
  car
) {
  if (
    !car ||
    typeof car !== "object"
  ) {
    return null;
  }


  const rawPowerHP =
    getFirstValue(
      car,
      [
        "powerHP",
        "powerHp",
        "hp",
        "horsepower",
        "horsePower",
        "horsepowerHP"
      ]
    );


  const rawPowerKW =
    getFirstValue(
      car,
      [
        "powerKW",
        "powerKw",
        "kw",
        "kilowatts",
        "power_kW"
      ]
    );


  const rawSeats =
    getFirstValue(
      car,
      [
        "seats",
        "seatCount"
      ]
    );


  const rawPrice =
    getFirstValue(
      car,
      [
        "price",
        "priceEUR",
        "startingPrice",
        "basePrice"
      ]
    );


  const normalized = {

    name:
      text(car.name),

    brand:
      text(car.brand),

    model:
      text(car.model),

    generation:
      text(car.generation),

    year:
      text(car.year),

    price:
      normalizePrice(
        rawPrice
      ),

    currency:
      text(car.currency),

    priceSource:
      text(
        car.priceSource
      ),

    powerHP:
      normalizePower(
        rawPowerHP
      ),

    powerKW:
      normalizePower(
        rawPowerKW
      ),

    seats:
      normalizeNumber(
        rawSeats
      ),

    trunk:
      text(
        car.trunk ||
        car.boot ||
        car.bootCapacity
      ),

    drive:
      text(
        car.drive ||
        car.drivetrain
      ),

    fuel:
      text(
        car.fuel ||
        car.powertrain
      ),

    body:
      text(
        car.body ||
        car.bodyStyle
      ),

    length:
      text(
        car.length
      ),

    officialConfigurator:
      text(
        car.officialConfigurator ||
        car.configurator
      ),

    maintenance:
      text(
        car.maintenance ||
        car.maintenanceInfo
      ),

    pros:
      arrayText(
        car.pros
      ),

    cons:
      arrayText(
        car.cons
      ),

    reason:
      text(
        car.reason
      ),

    score:
      normalizeNumber(
        car.score
      ),

    image: "",

    photoSource: "",

    imageCandidates: []
  };


  // ----------------------------------------------------------
  // REQUIRED IDENTITY
  // ----------------------------------------------------------

  if (
    !normalized.name ||
    !normalized.brand ||
    !normalized.model
  ) {
    return null;
  }


  // ----------------------------------------------------------
  // SCORE
  // ----------------------------------------------------------

  if (
    normalized.score === null ||
    normalized.score < 0 ||
    normalized.score > 100
  ) {
    normalized.score = 0;
  }


  // ----------------------------------------------------------
  // SEATS
  // ----------------------------------------------------------

  if (
    normalized.seats !== null &&
    (
      normalized.seats < 1 ||
      normalized.seats > 20
    )
  ) {
    normalized.seats = null;
  }


  // ----------------------------------------------------------
  // CLEAN ARRAYS
  // ----------------------------------------------------------

  normalized.pros =
    normalized.pros
      .slice(0, 6);

  normalized.cons =
    normalized.cons
      .slice(0, 6);


  return normalized;
}


// ============================================================
// NORMALIZE CAR ARRAY
// ============================================================

function normalizeCars(
  data
) {
  if (
    !data ||
    typeof data !== "object"
  ) {
    throw new Error(
      "AI response is not an object."
    );
  }


  const cars =
    Array.isArray(data.cars)
      ? data.cars
      : [];


  if (
    cars.length !== 3
  ) {
    throw new Error(
      `AI returned ${cars.length} cars instead of exactly 3.`
    );
  }


  const normalized =
    cars
      .map(
        normalizeCar
      )
      .filter(Boolean);


  if (
    normalized.length !== 3
  ) {
    throw new Error(
      "AI returned invalid vehicle data."
    );
  }


  return normalized;
}


// ============================================================
// IMAGE URL VALIDATION
// ============================================================

function isWikimediaPhotoURL(
  url
) {
  if (!url) {
    return false;
  }


  try {
    const parsed =
      new URL(url);


    if (
      parsed.protocol !== "https:"
    ) {
      return false;
    }


    const hostname =
      parsed.hostname
        .toLowerCase();


    return (
      hostname ===
        "upload.wikimedia.org" ||

      hostname.endsWith(
        ".wikimedia.org"
      )
    );

  } catch (_) {
    return false;
  }
}


// ============================================================
// IMAGE EXTENSION
// ============================================================

function isImageExtension(
  url
) {
  if (!url) {
    return false;
  }


  const clean =
    url
      .split("?")[0]
      .split("#")[0]
      .toLowerCase();


  return (
    clean.endsWith(".jpg") ||
    clean.endsWith(".jpeg") ||
    clean.endsWith(".png") ||
    clean.endsWith(".webp") ||
    clean.endsWith(".avif")
  );
}


// ============================================================
// IMAGE TITLE REJECTION
// ============================================================

function isRejectedImageTitle(
  title
) {
  const normalized =
    text(title)
      .toLowerCase();


  return IMAGE_REJECT_WORDS
    .some(
      word =>
        normalized.includes(word)
    );
}


// ============================================================
// IMAGE WORDS
// ============================================================

function normalizeSearchWords(
  value
) {
  return text(value)
    .toLowerCase()
    .replace(
      /[^a-z0-9áäčďéíĺľňóôŕšťúýž\s-]/gi,
      " "
    )
    .replace(
      /[-_/]+/g,
      " "
    )
    .split(/\s+/)
    .filter(Boolean);
}


// ============================================================
// VEHICLE SEARCH WORDS
// ============================================================

function getVehicleSearchWords(
  car
) {
  const combined = [
    car.brand,
    car.model,
    car.generation,
    car.year
  ].join(" ");


  const words =
    normalizeSearchWords(
      combined
    );


  const stopWords =
    new Set([
      "the",
      "and",
      "with",
      "new",
      "car",
      "cars",
      "automobile",
      "vehicle",
      "model",
      "generation",
      "series",
      "edition",
      "version"
    ]);


  return words.filter(
    word =>
      !stopWords.has(word) &&
      word.length >= 2
  );
}


// ============================================================
// VEHICLE IDENTITY MATCH
// ============================================================

function vehicleIdentityMatch(
  title,
  car
) {
  const lowerTitle =
    text(title)
      .toLowerCase();

  const brand =
    text(car.brand)
      .toLowerCase();

  const model =
    text(car.model)
      .toLowerCase();

  if (
    !brand ||
    !model
  ) {
    return false;
  }


  const brandModel =
    `${brand} ${model}`;


  // Strong exact match.

  if (
    lowerTitle.includes(
      brandModel
    )
  ) {
    return true;
  }


  // Model-only fallback for uncommon/unique model names.

  const normalizedTitleWords =
    new Set(
      normalizeSearchWords(
        title
      )
    );


  const modelWords =
    normalizeSearchWords(
      model
    );


  const modelMatches =
    modelWords
      .filter(
        word =>
          normalizedTitleWords.has(
            word
          )
      );


  if (
    modelWords.length >= 1 &&
    modelMatches.length ===
      modelWords.length
  ) {

    if (
      normalizedTitleWords.has(
        brand
      )
    ) {
      return true;
    }
  }


  return false;
}


// ============================================================
// IMAGE RELEVANCE SCORE
// ============================================================

function imageRelevanceScore(
  title,
  car,
  queryIndex = 0
) {
  const lowerTitle =
    text(title)
      .toLowerCase();


  const vehicleWords =
    getVehicleSearchWords(
      car
    );


  const titleWords =
    new Set(
      normalizeSearchWords(
        title
      )
    );


  let score = 0;


  // ----------------------------------------------------------
  // BRAND
  // ----------------------------------------------------------

  if (
    car.brand &&
    lowerTitle.includes(
      text(car.brand)
        .toLowerCase()
    )
  ) {
    score += 25;
  }


  // ----------------------------------------------------------
  // MODEL
  // ----------------------------------------------------------

  if (
    car.model &&
    lowerTitle.includes(
      text(car.model)
        .toLowerCase()
    )
  ) {
    score += 40;
  }


  // ----------------------------------------------------------
  // BRAND + MODEL
  // ----------------------------------------------------------

  if (
    car.brand &&
    car.model
  ) {
    const brandModel =
      `${car.brand} ${car.model}`
        .toLowerCase();


    if (
      lowerTitle.includes(
        brandModel
      )
    ) {
      score += 50;
    }
  }


  // ----------------------------------------------------------
  // GENERATION
  // ----------------------------------------------------------

  if (
    car.generation &&
    lowerTitle.includes(
      text(car.generation)
        .toLowerCase()
    )
  ) {
    score += 22;
  }


  // ----------------------------------------------------------
  // YEAR
  // ----------------------------------------------------------

  if (
    car.year &&
    lowerTitle.includes(
      text(car.year)
        .toLowerCase()
    )
  ) {
    score += 15;
  }


  // ----------------------------------------------------------
  // VEHICLE WORDS
  // ----------------------------------------------------------

  for (
    const word of vehicleWords
  ) {
    if (
      titleWords.has(word)
    ) {
      score += 5;
    }
  }


  // ----------------------------------------------------------
  // AUTOMOBILE WORD
  // ----------------------------------------------------------

  if (
    lowerTitle.includes("automobile") ||
    lowerTitle.includes("car") ||
    lowerTitle.includes("vehicle")
  ) {
    score += 3;
  }


  // Earlier queries should be slightly preferred.

  score -= queryIndex * 2;


  return score;
}


// ============================================================
// BUILD IMAGE QUERIES
// ============================================================

function buildImageQueries(
  car
) {
  const brand =
    text(car.brand);

  const model =
    text(car.model);

  const generation =
    text(car.generation);

  const year =
    text(car.year);


  const queries = [];


  if (
    brand &&
    model &&
    year
  ) {
    queries.push(
      `${brand} ${model} ${year}`
    );
  }


  if (
    brand &&
    model &&
    generation
  ) {
    queries.push(
      `${brand} ${model} ${generation}`
    );
  }


  if (
    brand &&
    model
  ) {
    queries.push(
      `${brand} ${model} automobile`
    );
  }


  if (
    brand &&
    model
  ) {
    queries.push(
      `${brand} ${model} car`
    );
  }


  if (model) {
    queries.push(
      `${model} automobile`
    );
  }


  return [
    ...new Set(
      queries
        .map(q => q.trim())
        .filter(Boolean)
    )
  ];
}


// ============================================================
// WIKIMEDIA SEARCH
// ============================================================

async function searchWikimedia(
  query,
  car,
  queryIndex
) {
  const url =
    new URL(
      WIKIMEDIA_API
    );


  url.searchParams.set(
    "action",
    "query"
  );

  url.searchParams.set(
    "format",
    "json"
  );

  url.searchParams.set(
    "formatversion",
    "2"
  );

  url.searchParams.set(
    "generator",
    "search"
  );

  url.searchParams.set(
    "gsrsearch",
    `${query} filetype:bitmap`
  );

  url.searchParams.set(
    "gsrnamespace",
    "6"
  );

  url.searchParams.set(
    "gsrlimit",
    "35"
  );

  url.searchParams.set(
    "gsrsort",
    "relevance"
  );

  url.searchParams.set(
    "prop",
    "imageinfo"
  );

  url.searchParams.set(
    "iiprop",
    "url|mime|size|thumbmime"
  );

  url.searchParams.set(
    "iiurlwidth",
    "1600"
  );


  const response =
    await fetchWithTimeout(
      url.toString(),
      {
        method: "GET",

        headers: {
          Accept:
            "application/json"
        }
      },
      WIKIMEDIA_TIMEOUT
    );


  if (!response.ok) {
    throw new Error(
      `Wikimedia HTTP ${response.status}`
    );
  }


  const data =
    await response.json();


  const pages =
    data?.query?.pages || [];


  const candidates = [];


  for (
    const page of pages
  ) {
    const title =
      text(page.title);


    if (!title) {
      continue;
    }


    if (
      isRejectedImageTitle(
        title
      )
    ) {
      continue;
    }


    if (
      !vehicleIdentityMatch(
        title,
        car
      )
    ) {
      continue;
    }


    const imageInfo =
      Array.isArray(
        page.imageinfo
      )
        ? page.imageinfo[0]
        : null;


    if (!imageInfo) {
      continue;
    }


    const mime =
      text(
        imageInfo.mime
      ).toLowerCase();


    if (
      mime &&
      !mime.startsWith(
        "image/"
      )
    ) {
      continue;
    }


    const width =
      Number(
        imageInfo.width
      ) || 0;


    const height =
      Number(
        imageInfo.height
      ) || 0;


    if (
      width < IMAGE_MIN_WIDTH ||
      height < IMAGE_MIN_HEIGHT
    ) {
      continue;
    }


    const imageUrl =
      text(
        imageInfo.thumburl ||
        imageInfo.url
      );


    if (
      !isWikimediaPhotoURL(
        imageUrl
      )
    ) {
      continue;
    }


    if (
      !isImageExtension(
        imageUrl
      )
    ) {
      continue;
    }


    const relevance =
      imageRelevanceScore(
        title,
        car,
        queryIndex
      );


    candidates.push({
      url:
        imageUrl,

      title,

      relevance,

      width,

      height,

      source:
        "Wikimedia Commons"
    });
  }


  return candidates;
}


// ============================================================
// WIKIPEDIA EXACT PAGE IMAGE SEARCH
// ============================================================

async function searchWikipediaExact(
  car
) {
  const brand =
    text(car.brand);

  const model =
    text(car.model);

  const generation =
    text(car.generation);


  const titles =
    [
      `${brand} ${model}`,
      `${model}`,
      generation
        ? `${brand} ${model} (${generation})`
        : ""
    ]
      .map(
        title =>
          text(title)
      )
      .filter(Boolean);


  const uniqueTitles =
    [
      ...new Set(titles)
    ];


  if (
    uniqueTitles.length === 0
  ) {
    return [];
  }


  const url =
    new URL(
      WIKIPEDIA_API
    );


  url.searchParams.set(
    "action",
    "query"
  );

  url.searchParams.set(
    "format",
    "json"
  );

  url.searchParams.set(
    "formatversion",
    "2"
  );

  url.searchParams.set(
    "titles",
    uniqueTitles.join("|")
  );

  url.searchParams.set(
    "redirects",
    "1"
  );

  url.searchParams.set(
    "prop",
    "pageimages|info"
  );

  url.searchParams.set(
    "piprop",
    "thumbnail"
  );

  url.searchParams.set(
    "pithumbsize",
    "1600"
  );


  const response =
    await fetchWithTimeout(
      url.toString(),
      {
        method: "GET",

        headers: {
          Accept:
            "application/json"
        }
      },
      WIKIPEDIA_TIMEOUT
    );


  if (!response.ok) {
    throw new Error(
      `Wikipedia exact HTTP ${response.status}`
    );
  }


  const data =
    await response.json();


  const pages =
    data?.query?.pages || [];


  const candidates = [];


  for (
    const page of pages
  ) {
    const title =
      text(page.title);


    if (!title) {
      continue;
    }


    if (
      isRejectedImageTitle(
        title
      )
    ) {
      continue;
    }


    if (
      !vehicleIdentityMatch(
        title,
        car
      )
    ) {
      continue;
    }


    const thumbnail =
      page.thumbnail?.source;


    if (!thumbnail) {
      continue;
    }


    if (
      !isWikimediaPhotoURL(
        thumbnail
      )
    ) {
      continue;
    }


    const width =
      Number(
        page.thumbnail?.width
      ) || 0;


    const height =
      Number(
        page.thumbnail?.height
      ) || 0;


    if (
      width < IMAGE_MIN_WIDTH ||
      height < IMAGE_MIN_HEIGHT
    ) {
      continue;
    }


    candidates.push({
      url:
        thumbnail,

      title,

      relevance:
        imageRelevanceScore(
          title,
          car,
          0
        ) + 10,

      width,

      height,

      source:
        "Wikipedia"
    });
  }


  return candidates;
}


// ============================================================
// WIKIPEDIA SEARCH FALLBACK
// ============================================================

async function searchWikipedia(
  query,
  car,
  queryIndex
) {
  const url =
    new URL(
      WIKIPEDIA_API
    );


  url.searchParams.set(
    "action",
    "query"
  );

  url.searchParams.set(
    "format",
    "json"
  );

  url.searchParams.set(
    "formatversion",
    "2"
  );

  url.searchParams.set(
    "generator",
    "search"
  );

  url.searchParams.set(
    "gsrsearch",
    query
  );

  url.searchParams.set(
    "gsrlimit",
    "20"
  );

  url.searchParams.set(
    "prop",
    "pageimages|info"
  );

  url.searchParams.set(
    "piprop",
    "thumbnail"
  );

  url.searchParams.set(
    "pithumbsize",
    "1600"
  );


  const response =
    await fetchWithTimeout(
      url.toString(),
      {
        method: "GET",

        headers: {
          Accept:
            "application/json"
        }
      },
      WIKIPEDIA_TIMEOUT
    );


  if (!response.ok) {
    throw new Error(
      `Wikipedia HTTP ${response.status}`
    );
  }


  const data =
    await response.json();


  const pages =
    data?.query?.pages || [];


  const candidates = [];


  for (
    const page of pages
  ) {
    const title =
      text(page.title);


    if (!title) {
      continue;
    }


    if (
      isRejectedImageTitle(
        title
      )
    ) {
      continue;
    }


    if (
      !vehicleIdentityMatch(
        title,
        car
      )
    ) {
      continue;
    }


    const thumbnail =
      page.thumbnail?.source;


    if (!thumbnail) {
      continue;
    }


    if (
      !isWikimediaPhotoURL(
        thumbnail
      )
    ) {
      continue;
    }


    const width =
      Number(
        page.thumbnail?.width
      ) || 0;


    const height =
      Number(
        page.thumbnail?.height
      ) || 0;


    if (
      width < IMAGE_MIN_WIDTH ||
      height < IMAGE_MIN_HEIGHT
    ) {
      continue;
    }


    candidates.push({
      url:
        thumbnail,

      title,

      relevance:
        imageRelevanceScore(
          title,
          car,
          queryIndex
        ) + 5,

      width,

      height,

      source:
        "Wikipedia"
    });
  }


  return candidates;
}


// ============================================================
// EXACT VEHICLE IMAGE SEARCH
// ============================================================

async function findCarImages(
  car
) {
  const queries =
    buildImageQueries(
      car
    );


  let allCandidates = [];


  // ----------------------------------------------------------
  // 1. EXACT WIKIPEDIA PAGE
  // ----------------------------------------------------------

  try {
    const exactWiki =
      await searchWikipediaExact(
        car
      );

    allCandidates.push(
      ...exactWiki
    );

  } catch (error) {

    console.error(
      "Wikipedia exact search failed:",
      error?.message || error
    );
  }


  // ----------------------------------------------------------
  // 2. WIKIMEDIA PRIMARY SEARCH
  // ----------------------------------------------------------

  const primaryQueries =
    queries.slice(0, 3);


  const primaryResults =
    await Promise.allSettled(
      primaryQueries.map(
        (query, index) =>
          searchWikimedia(
            query,
            car,
            index
          )
      )
    );


  for (
    const result of primaryResults
  ) {
    if (
      result.status === "fulfilled"
    ) {
      allCandidates.push(
        ...result.value
      );
    }
  }


  // ----------------------------------------------------------
  // 3. WIKIMEDIA SECONDARY SEARCH
  // ----------------------------------------------------------

  if (
    allCandidates.length <
    6 &&
    queries.length > 3
  ) {
    const secondaryQueries =
      queries.slice(3, 5);


    const secondaryResults =
      await Promise.allSettled(
        secondaryQueries.map(
          (query, index) =>
            searchWikimedia(
              query,
              car,
              index + 3
            )
        )
      );


    for (
      const result of secondaryResults
    ) {
      if (
        result.status === "fulfilled"
      ) {
        allCandidates.push(
          ...result.value
        );
      }
    }
  }


  // ----------------------------------------------------------
  // 4. WIKIPEDIA SEARCH FALLBACK
  // ----------------------------------------------------------

  if (
    allCandidates.length <
    6
  ) {
    const wikiQueries =
      queries.slice(0, 3);


    const wikiResults =
      await Promise.allSettled(
        wikiQueries.map(
          (query, index) =>
            searchWikipedia(
              query,
              car,
              index
            )
        )
      );


    for (
      const result of wikiResults
    ) {
      if (
        result.status === "fulfilled"
      ) {
        allCandidates.push(
          ...result.value
        );
      }
    }
  }


  // ----------------------------------------------------------
  // 5. DEDUPLICATE
  // ----------------------------------------------------------

  const unique =
    new Map();


  for (
    const candidate of
      allCandidates
  ) {
    if (
      !candidate?.url
    ) {
      continue;
    }


    if (
      !unique.has(
        candidate.url
      )
    ) {
      unique.set(
        candidate.url,
        candidate
      );
    }
  }


  // ----------------------------------------------------------
  // 6. SORT BY RELEVANCE
  // ----------------------------------------------------------

  const sorted =
    [...unique.values()]
      .sort(
        (a, b) =>
          b.relevance -
          a.relevance
      );


  // ----------------------------------------------------------
  // 7. FINAL CANDIDATES
  // ----------------------------------------------------------

  const finalCandidates =
    sorted
      .slice(
        0,
        MAX_IMAGE_CANDIDATES
      )
      .map(
        item =>
          item.url
      );


  return {
    image:
      finalCandidates[0] ||
      "",

    photoSource:
      finalCandidates[0]
        ? (
            sorted[0]?.source ||
            "Wikimedia Commons"
          )
        : "",

    imageCandidates:
      finalCandidates
  };
}


// ============================================================
// ADD IMAGES TO ALL 3 CARS
// ============================================================

async function addCarImages(
  cars
) {
  const results =
    await Promise.allSettled(
      cars.map(
        car =>
          findCarImages(
            car
          )
      )
    );


  return cars.map(
    (car, index) => {

      const result =
        results[index];


      if (
        result.status ===
        "fulfilled"
      ) {
        return {
          ...car,

          image:
            result.value.image ||
            "",

          photoSource:
            result.value.photoSource ||
            "",

          imageCandidates:
            Array.isArray(
              result.value.imageCandidates
            )
              ? result.value.imageCandidates
              : []
        };
      }


      console.error(
        `Image search failed for ${car.name}:`,
        result.reason?.message ||
        result.reason
      );


      return {
        ...car,

        image: "",

        photoSource: "",

        imageCandidates: []
      };
    }
  );
}


// ============================================================
// GROQ MODEL CALL
// ============================================================

async function callGroqModel(
  model,
  request,
  timeout
) {
  if (!GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY is missing."
    );
  }


  const prompt =
    buildPrompt(
      request
    );


  const body = {
    model,

    messages: [
      {
        role: "system",

        content:
          "You are a meticulous automotive research assistant. Use current web research. Return only valid JSON matching the requested structure."
      },

      {
        role: "user",

        content:
          prompt
      }
    ],

    temperature: 0.1,

    max_completion_tokens: 12000,

    // Browser search is enabled here.
    // We intentionally do NOT use response_format,
    // because Groq documents browser search as incompatible
    // with structured outputs.

    tools: [
      {
        type:
          "browser_search"
      }
    ]
  };


  const response =
    await fetchWithTimeout(
      GROQ_URL,

      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${GROQ_API_KEY}`
        },

        body:
          JSON.stringify(
            body
          )
      },

      timeout
    );


  const raw =
    await response.text();


  if (!response.ok) {
    throw new Error(
      `Groq ${model} HTTP ${response.status}: ${raw.slice(0, 700)}`
    );
  }


  let data;


  try {
    data =
      JSON.parse(raw);
  } catch (_) {
    throw new Error(
      "Groq returned invalid response JSON."
    );
  }


  const content =
    data?.choices?.[0]?.message?.content;


  if (!content) {
    throw new Error(
      "Groq returned no message content."
    );
  }


  const parsed =
    parseAIJson(
      content
    );


  const cars =
    normalizeCars(
      parsed
    );


  return await addCarImages(
    cars
  );
}


// ============================================================
// GROQ PROVIDERS
// ============================================================

async function callGroq(
  request
) {
  let firstError =
    null;


  // ----------------------------------------------------------
  // PRIMARY
  // ----------------------------------------------------------

  try {

    console.log(
      `Trying Groq ${GROQ_PRIMARY_MODEL}`
    );


    return await callGroqModel(
      GROQ_PRIMARY_MODEL,
      request,
      GROQ_PRIMARY_TIMEOUT
    );

  } catch (error) {

    firstError =
      error;


    console.error(
      "Groq GPT-OSS 120B failed:",
      error?.message || error
    );
  }


  // ----------------------------------------------------------
  // FALLBACK
  // ----------------------------------------------------------

  try {

    console.log(
      `Trying Groq ${GROQ_FALLBACK_MODEL}`
    );


    return await callGroqModel(
      GROQ_FALLBACK_MODEL,
      request,
      GROQ_FALLBACK_TIMEOUT
    );

  } catch (error) {

    console.error(
      "Groq GPT-OSS 20B failed:",
      error?.message || error
    );


    throw new Error(
      `Groq providers failed. First error: ${
        firstError?.message ||
        "unknown"
      }. Second error: ${
        error?.message ||
        "unknown"
      }`
    );
  }
}


// ============================================================
// OPENROUTER MODEL CALL
// ============================================================

async function callOpenRouterModel(
  model,
  request
) {
  if (!OPENROUTER_API_KEY) {
    throw new Error(
      "OPENROUTER_API_KEY is missing."
    );
  }


  const prompt =
    buildPrompt(
      request
    );


  const body = {
    model,

    messages: [
      {
        role: "system",

        content:
          "You are a precise automotive research assistant. Return only valid JSON."
      },

      {
        role: "user",

        content:
          prompt
      }
    ],

    temperature: 0.1,

    max_tokens: 12000,

    response_format: {
      type:
        "json_object"
    }
  };


  const response =
    await fetchWithTimeout(
      OPENROUTER_URL,

      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${OPENROUTER_API_KEY}`,

          "HTTP-Referer":
            "https://carmatchai.vercel.app",

          "X-Title":
            "CARMATCH AI"
        },

        body:
          JSON.stringify(
            body
          )
      },

      OPENROUTER_TIMEOUT
    );


  const raw =
    await response.text();


  if (!response.ok) {
    throw new Error(
      `OpenRouter ${model} HTTP ${response.status}: ${raw.slice(0, 700)}`
    );
  }


  let data;


  try {
    data =
      JSON.parse(raw);
  } catch (_) {
    throw new Error(
      "OpenRouter returned invalid response JSON."
    );
  }


  const content =
    data?.choices?.[0]?.message?.content;


  if (!content) {
    throw new Error(
      "OpenRouter returned no message content."
    );
  }


  const parsed =
    parseAIJson(
      content
    );


  const cars =
    normalizeCars(
      parsed
    );


  return await addCarImages(
    cars
  );
}


// ============================================================
// OPENROUTER FALLBACK CHAIN
// ============================================================

async function callOpenRouter(
  request
) {
  const errors = [];


  for (
    const model of
      OPENROUTER_FREE_MODELS
  ) {

    try {

      console.log(
        `Trying OpenRouter model: ${model}`
      );


      return await callOpenRouterModel(
        model,
        request
      );

    } catch (error) {

      const message =
        error?.message ||
        String(error);


      errors.push(
        `${model}: ${message}`
      );


      console.error(
        `OpenRouter ${model} failed:`,
        message
      );
    }
  }


  throw new Error(
    `All OpenRouter FREE models failed: ${errors.join(" | ")}`
  );
}


// ============================================================
// REQUEST ID
// ============================================================

function getRequestId(
  req
) {
  const header =
    req.headers?.[
      "x-search-request-id"
    ];


  if (header) {
    return text(
      header
    );
  }


  return "";
}


// ============================================================
// MAIN HANDLER
// ============================================================

export default async function handler(
  req,
  res
) {

  // ==========================================================
  // OPTIONS
  // ==========================================================

  if (
    req.method === "OPTIONS"
  ) {

    res.status(204);

    res.setHeader(
      "Access-Control-Allow-Origin",
      "*"
    );

    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Search-Request-Id"
    );

    res.setHeader(
      "Access-Control-Allow-Methods",
      "POST, OPTIONS"
    );

    return res.end();
  }


  // ==========================================================
  // METHOD
  // ==========================================================

  if (
    req.method !== "POST"
  ) {

    return sendJson(
      res,
      405,
      {
        error:
          "Method not allowed."
      }
    );
  }


  // ==========================================================
  // ENVIRONMENT
  // ==========================================================

  if (
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY
  ) {

    return sendJson(
      res,
      500,
      {
        error:
          "Supabase environment variables are missing."
      }
    );
  }


  // ==========================================================
  // AUTHORIZATION
  // ==========================================================

  const authorization =
    req.headers?.authorization ||
    req.headers?.Authorization ||
    "";


  if (
    !authorization.startsWith(
      "Bearer "
    )
  ) {

    return sendJson(
      res,
      401,
      {
        error:
          "Missing authorization token."
      }
    );
  }


  const accessToken =
    authorization
      .slice(7)
      .trim();


  if (!accessToken) {

    return sendJson(
      res,
      401,
      {
        error:
          "Invalid authorization token."
      }
    );
  }


  // ==========================================================
  // VERIFY USER
  // ==========================================================

  try {

    await verifyUser(
      accessToken
    );

  } catch (error) {

    return sendJson(
      res,
      401,
      {
        error:
          "Your session is invalid or expired."
      }
    );
  }


  // ==========================================================
  // BODY
  // ==========================================================

  const body =
    req.body &&
    typeof req.body === "object"
      ? req.body
      : {};


  // ==========================================================
  // FRONTEND REFUND ACTION
  // ==========================================================

  if (
    body.action ===
    "refund_search"
  ) {

    const refund =
      await refundSearch(
        accessToken
      );


    return sendJson(
      res,

      refund.success
        ? 200
        : 500,

      {
        refunded:
          refund.success,

        remaining:
          refund.remaining
      }
    );
  }


  // ==========================================================
  // REQUEST
  // ==========================================================

  const request =
    normalizeRequest(
      body
    );


  const filtersEmpty =
    Object.values(
      request.filters
    )
      .every(
        value =>
          Array.isArray(value)
            ? value.length === 0
            : !text(value)
      );


  if (
    !request.naturalLanguage &&
    filtersEmpty
  ) {

    return sendJson(
      res,
      400,
      {
        error:
          "Please enter a car request."
      }
    );
  }


  // ==========================================================
  // SEARCH STATE
  // ==========================================================

  let searchConsumed =
    false;

  let searchRefunded =
    false;

  let refundResult =
    null;


  // ==========================================================
  // REFUND ONLY ONCE
  // ==========================================================

  async function refundOnce() {

    if (
      !searchConsumed ||
      searchRefunded
    ) {
      return refundResult;
    }


    searchRefunded =
      true;


    refundResult =
      await refundSearch(
        accessToken
      );


    return refundResult;
  }


  // ==========================================================
  // CONSUME SEARCH
  // ==========================================================

  try {

    const usage =
      await useSearch(
        accessToken
      );


    if (
      !usage.allowed
    ) {

      return sendJson(
        res,
        429,
        {
          error:
            "Denný limit 5 vyhľadávaní bol dosiahnutý.",

          remaining:
            Number.isFinite(
              Number(
                usage.remaining
              )
            )
              ? Number(
                  usage.remaining
                )
              : 0
        }
      );
    }


    // Search is now consumed.

    searchConsumed =
      true;


    // ========================================================
    // GROQ
    // ========================================================

    let cars =
      null;

    let groqError =
      null;


    try {

      cars =
        await callGroq(
          request
        );

    } catch (error) {

      groqError =
        error;


      console.error(
        "Groq completely failed:",
        error?.message ||
        error
      );
    }


    // ========================================================
    // OPENROUTER
    // ========================================================

    if (!cars) {

      try {

        cars =
          await callOpenRouter(
            request
          );

      } catch (error) {

        console.error(
          "OpenRouter completely failed:",
          error?.message ||
          error
        );
      }
    }


    // ========================================================
    // TOTAL FAILURE
    // ========================================================

    if (
      !Array.isArray(cars) ||
      cars.length !== 3
    ) {

      const refund =
        await refundOnce();


      return sendJson(
        res,
        503,
        {
          error:
            "Vyhľadávanie sa nepodarilo dokončiť. Pokus bol vrátený.",

          refunded:
            Boolean(
              refund?.success
            ),

          remaining:
            refund?.remaining ??
            null,

          providerStatus: {
            groq:
              groqError
                ? "failed"
                : "ok",

            openrouter:
              "failed"
          }
        }
      );
    }


    // ========================================================
    // SUCCESS
    // ========================================================

    return sendJson(
      res,
      200,
      {
        cars,

        remaining:
          Number.isFinite(
            Number(
              usage.remaining
            )
          )
            ? Number(
                usage.remaining
              )
            : null
      }
    );


  } catch (error) {

    // ========================================================
    // UNEXPECTED FAILURE AFTER SEARCH CONSUMPTION
    // ========================================================

    console.error(
      "CARMATCH AI backend error:",
      error?.message ||
      error
    );


    let refund =
      null;


    if (
      searchConsumed
    ) {

      refund =
        await refundOnce();
    }


    return sendJson(
      res,
      500,
      {
        error:
          "Vyhľadávanie sa nepodarilo dokončiť.",

        refunded:
          Boolean(
            refund?.success
          ),

        remaining:
          refund?.remaining ??
          null
      }
    );
  }
}