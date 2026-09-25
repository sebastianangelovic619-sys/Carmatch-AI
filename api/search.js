// ============================================================
// CARMATCH AI - FINAL BACKEND v7
// ============================================================
// Supabase anonymous auth + 5 searches/day
// Groq Compound live web research
// Groq Compound Mini fallback
// Multiple OpenRouter FREE fallbacks
// Automatic provider switching
// Search refund when every provider fails
// Server-side exact vehicle photo search
// Wikimedia Commons + Wikipedia fallback
//
// v7 IMPROVEMENTS
// ------------------------------------------------------------
// 1. Výkon vždy v kW + HP
// 2. Žiadne PS / CV / bhp / horsepower textové jednotky
// 3. HP sa automaticky dopočíta z kW
// 4. Cena sa hľadá prioritne z oficiálneho výrobcu
// 5. AI musí uviesť zdroj ceny
// 6. Cena sa nesmie automaticky meniť na "Cena nie je dostupná"
// 7. Podpora "Od €XX XXX"
// 8. Validácia oficiálneho priceSource
// 9. Silnejšie pravidlá pre aktuálny modelový rok
// 10. Lepšia validácia generácie
// 11. Presnejšie vyhľadávanie fotografií
// 12. Oddelené price research od bežných dát
// ============================================================


// ============================================================
// API URLS
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
  process.env.SUPABASE_URL;

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY;

const GROQ_API_KEY =
  process.env.GROQ_API_KEY;

const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY;


// ============================================================
// SETTINGS
// ============================================================

const MAX_SEARCHES_PER_DAY = 5;

const GROQ_TIMEOUT = 55000;
const GROQ_MINI_TIMEOUT = 45000;
const OPENROUTER_TIMEOUT = 35000;

const WIKIMEDIA_TIMEOUT = 8000;
const WIKIPEDIA_TIMEOUT = 8000;

const MAX_IMAGE_CANDIDATES = 8;


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
// RESPONSE HELPER
// ============================================================

function sendJson(
  res,
  status,
  data
) {
  return res
    .status(status)
    .json(data);
}


// ============================================================
// SAFE TEXT
// ============================================================

function text(
  value,
  maxLength = 5000
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value)
    .replace(/\u0000/g, "")
    .slice(0, maxLength);
}


// ============================================================
// SAFE ARRAY
// ============================================================

function arrayText(
  value,
  maxItems = 10
) {
  if (
    !Array.isArray(value)
  ) {
    return [];
  }

  return value
    .map(item =>
      text(item, 1000)
    )
    .filter(Boolean)
    .slice(0, maxItems);
}


// ============================================================
// JSON EXTRACTION
// ============================================================

function parseAIJson(
  raw
) {
  if (!raw) {
    throw new Error(
      "AI returned an empty response"
    );
  }

  let value =
    String(raw).trim();

  value =
    value
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

  try {
    return JSON.parse(
      value
    );
  } catch (_) {}

  const firstBrace =
    value.indexOf("{");

  const lastBrace =
    value.lastIndexOf("}");

  if (
    firstBrace !== -1 &&
    lastBrace !== -1 &&
    lastBrace > firstBrace
  ) {
    const extracted =
      value.slice(
        firstBrace,
        lastBrace + 1
      );

    try {
      return JSON.parse(
        extracted
      );
    } catch (_) {}
  }

  throw new Error(
    "AI returned invalid JSON"
  );
}


// ============================================================
// SUPABASE USER VERIFICATION
// ============================================================

async function verifyUser(
  accessToken
) {
  if (
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY
  ) {
    throw new Error(
      "Supabase environment variables are missing"
    );
  }

  if (!accessToken) {
    return null;
  }

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      10000
    );

  try {
    const response =
      await fetch(
        `${SUPABASE_URL}/auth/v1/user`,
        {
          method: "GET",

          headers: {
            apikey:
              SUPABASE_ANON_KEY,

            Authorization:
              `Bearer ${accessToken}`
          },

          signal:
            controller.signal
        }
      );

    if (!response.ok) {
      return null;
    }

    const user =
      await response.json();

    if (
      !user ||
      !user.id
    ) {
      return null;
    }

    return user;
  } finally {
    clearTimeout(timer);
  }
}


// ============================================================
// SUPABASE RPC
// ============================================================

async function callSupabaseRPC(
  functionName,
  accessToken
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      10000
    );

  try {
    const response =
      await fetch(
        `${SUPABASE_URL}/rest/v1/rpc/${functionName}`,
        {
          method: "POST",

          headers: {
            apikey:
              SUPABASE_ANON_KEY,

            Authorization:
              `Bearer ${accessToken}`,

            "Content-Type":
              "application/json",

            Accept:
              "application/json"
          },

          body: "{}",

          signal:
            controller.signal
        }
      );

    const raw =
      await response.text();

    let data;

    try {
      data =
        JSON.parse(raw);
    } catch (_) {
      throw new Error(
        "Supabase returned invalid JSON"
      );
    }

    if (!response.ok) {
      throw new Error(
        `Supabase RPC ${functionName} failed`
      );
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
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
    !result ||
    result.allowed !== true
  ) {
    return {
      allowed: false,
      remaining: 0
    };
  }

  return {
    allowed: true,

    remaining:
      Number.isFinite(
        Number(
          result.remaining
        )
      )
        ? Number(
            result.remaining
          )
        : 0
  };
}


// ============================================================
// REFUND SEARCH
// ============================================================

async function refundSearch(
  accessToken
) {
  try {
    return await callSupabaseRPC(
      "refund_search",
      accessToken
    );
  } catch (error) {
    console.error(
      "CARMATCH AI refund failed:",
      error
    );

    return null;
  }
}


// ============================================================
// REQUEST NORMALIZATION
// ============================================================

function normalizeRequest(
  body
) {
  const filters =
    body &&
    typeof body.filters ===
      "object" &&
    body.filters !== null
      ? body.filters
      : {};

  return {
    naturalLanguage:
      text(
        body?.naturalLanguage,
        3000
      ),

    filters: {
      budget:
        text(
          filters.budget,
          100
        ),

      seats:
        text(
          filters.seats,
          100
        ),

      power:
        text(
          filters.power,
          100
        ),

      trunk:
        text(
          filters.trunk,
          100
        ),

      drive:
        text(
          filters.drive,
          100
        ),

      fuel:
        text(
          filters.fuel,
          100
        ),

      body:
        text(
          filters.body,
          100
        ),

      style:
        text(
          filters.style,
          100
        ),

      length:
        text(
          filters.length,
          100
        ),

      year:
        text(
          filters.year,
          100
        ),

      avoid:
        text(
          filters.avoid,
          500
        )
    }
  };
}


// ============================================================
// LANGUAGE
// ============================================================

function detectLanguage() {
  return "Slovak";
}


// ============================================================
// MARKET
// ============================================================

function detectMarket(
  request
) {
  const content =
    `${request.naturalLanguage} ${
      JSON.stringify(
        request.filters
      )
    }`.toLowerCase();

  if (
    content.includes(
      "slovensko"
    ) ||
    content.includes(
      "slovakia"
    ) ||
    content.includes(
      "eur"
    ) ||
    content.includes("€")
  ) {
    return "Slovakia / European Union";
  }

  return "Europe";
}


// ============================================================
// CURRENT DATE
// ============================================================

function currentDate() {
  return new Date()
    .toISOString()
    .slice(0, 10);
}


// ============================================================
// POWER CONVERSION
// ============================================================

function kwToHP(
  kw
) {
  const value =
    Number(kw);

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return null;
  }

  // Mechanical horsepower.
  // 1 kW = 1.34102209 HP
  return Math.round(
    value * 1.34102209
  );
}


// ============================================================
// EXTRACT NUMERIC kW
// ============================================================

function extractKW(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const stringValue =
    String(value)
      .replace(
        ",",
        "."
      )
      .toLowerCase();

  const match =
    stringValue.match(
      /(\d+(?:\.\d+)?)\s*kw/
    );

  if (!match) {
    return null;
  }

  const kw =
    Number(
      match[1]
    );

  return Number.isFinite(
    kw
  )
    ? kw
    : null;
}


// ============================================================
// NORMALIZE POWER
// ============================================================

function normalizePower(
  power,
  kw,
  hp
) {
  let numericKW =
    extractKW(
      power
    );

  if (
    numericKW === null &&
    Number.isFinite(
      Number(kw)
    )
  ) {
    numericKW =
      Number(kw);
  }

  // If the AI accidentally gives PS/CV/bhp only,
  // convert it to approximate kW.
  if (
    numericKW === null &&
    power
  ) {
    const match =
      String(power)
        .replace(
          ",",
          "."
        )
        .match(
          /(\d+(?:\.\d+)?)\s*(ps|cv|bhp|hp)/i
        );

    if (match) {
      const hpValue =
        Number(
          match[1]
        );

      if (
        Number.isFinite(
          hpValue
        )
      ) {
        numericKW =
          hpValue /
          1.34102209;
      }
    }
  }

  if (
    numericKW === null
  ) {
    return {
      kw: null,
      hp: null,
      display: ""
    };
  }

  numericKW =
    Math.round(
      numericKW
    );

  const numericHP =
    Number.isFinite(
      Number(hp)
    )
      ? Math.round(
          Number(hp)
        )
      : kwToHP(
          numericKW
        );

  return {
    kw:
      numericKW,

    hp:
      numericHP,

    display:
      `${numericKW} kW / ${numericHP} HP`
  };
}


// ============================================================
// PRICE CLEANING
// ============================================================

function normalizePrice(
  price
) {
  if (
    price === null ||
    price === undefined
  ) {
    return "";
  }

  let value =
    String(price)
      .trim();

  if (!value) {
    return "";
  }

  const lower =
    value.toLowerCase();

  const invalidValues = [
    "cena nie je dostupná",
    "cena nie je dostupna",
    "cena na vyžiadanie",
    "cena na vyziadanie",
    "price unavailable",
    "price not available",
    "not available",
    "n/a",
    "na",
    "unknown",
    "unknown price",
    "unavailable"
  ];

  if (
    invalidValues.includes(
      lower
    )
  ) {
    return "";
  }

  return value
    .replace(
      /\bfrom\b/gi,
      "Od"
    )
    .replace(
      /\bstarting at\b/gi,
      "Od"
    )
    .trim();
}


// ============================================================
// PRICE SOURCE VALIDATION
// ============================================================

function isOfficialManufacturerURL(
  url
) {
  if (
    !url ||
    typeof url !== "string"
  ) {
    return false;
  }

  try {
    const parsed =
      new URL(url);

    if (
      parsed.protocol !==
      "https:"
    ) {
      return false;
    }

    const host =
      parsed.hostname
        .toLowerCase();

    const blocked =
      [
        "youtube.com",
        "facebook.com",
        "instagram.com",
        "reddit.com",
        "wikipedia.org",
        "commons.wikimedia.org",
        "autobild.de",
        "caranddriver.com",
        "cars.com",
        "mobile.de",
        "autoscout24.com",
        "autotrader.com"
      ];

    if (
      blocked.some(
        domain =>
          host === domain ||
          host.endsWith(
            `.${domain}`
          )
      )
    ) {
      return false;
    }

    return true;
  } catch (_) {
    return false;
  }
}


// ============================================================
// PRICE SOURCE LIST
// ============================================================

function normalizeSources(
  sources
) {
  return arrayText(
    sources,
    15
  ).filter(
    source => {
      try {
        new URL(
          source
        );

        return true;
      } catch (_) {
        return false;
      }
    }
  );
}


// ============================================================
// PROMPT
// ============================================================

function buildPrompt(
  request
) {
  const language =
    detectLanguage(
      request
    );

  const market =
    detectMarket(
      request
    );

  return `
You are CARMATCH AI, a professional automotive research assistant.

TODAY:
${currentDate()}

TARGET MARKET:
${market}

RESPONSE LANGUAGE:
${language}

============================================================
LANGUAGE
============================================================

Always respond in Slovak.

All user-facing explanatory text must be Slovak.

============================================================
MAIN TASK
============================================================

Find EXACTLY 3 real production vehicles matching the user's
requirements as closely as possible.

Use current information.

When live web research is available, research the web BEFORE
producing the answer.

============================================================
CRITICAL PRICE RESEARCH RULE
============================================================

PRICE IS EXTREMELY IMPORTANT.

For EVERY vehicle you recommend, actively search for its
CURRENT OFFICIAL MANUFACTURER PRICE.

Priority:

1. Official Slovak manufacturer website
2. Official Czech manufacturer website
3. Official German manufacturer website
4. Official EU manufacturer website
5. Official manufacturer configurator
6. Official manufacturer price list

Do NOT rely on random dealer prices if an official manufacturer
price exists.

Do NOT use old launch prices if a current official price exists.

Do NOT use prices from used-car websites.

Do NOT use prices from marketplace websites.

Do NOT use a generic estimated price when a current official
manufacturer price can be found.

The price must correspond to the SAME:
- generation
- body style
- engine
- drivetrain
- market
- model year

If the official manufacturer gives a starting price, use:

"Od €XX XXX"

If the official manufacturer gives a fixed configured/base price,
use:

"€XX XXX"

If the manufacturer publishes the price in another currency,
do not silently convert it unless the target market does not
have an official EUR price.

If an official manufacturer price genuinely cannot be found,
ONLY THEN use:

"Cena na vyžiadanie"

But this must be the LAST RESORT.

Do NOT write:
- Cena nie je dostupná
- Price unavailable
- Price not available
- Unknown price
- N/A

Use only:
"Cena na vyžiadanie"

priceSource MUST contain the exact official manufacturer URL
where the price was verified.

dataSources should also contain the official source.

============================================================
POWER FORMAT
============================================================

The application uses kW and HP.

The FINAL power value MUST use:

"XXX kW / YYY HP"

Example:

"375 kW / 503 HP"

NEVER use:
- PS
- CV
- bhp
- hp alone
- horsepower

Do not write:
"375 kW / 510 PS"

Do not write:
"510 PS"

Use HP only.

HP means mechanical horsepower.

Calculate:

HP = kW × 1.34102209

If the manufacturer provides kW, use kW as the primary
verified value and calculate HP from kW.

============================================================
CURRENT MODEL
============================================================

If the user asks for newest/current/2026/2027:

Prefer the newest currently sold or officially announced
production generation relevant to the target market.

Never mix generations.

Never combine specifications from different generations.

============================================================
USER REQUEST
============================================================

${request.naturalLanguage || "No text request."}

FILTERS:

${JSON.stringify(
  request.filters,
  null,
  2
)}

============================================================
FILTER LOGIC
============================================================

Respect ALL strong user requirements.

Budget:
${request.filters.budget || "not specified"}

Seats:
${request.filters.seats || "not specified"}

Power:
${request.filters.power || "not specified"}

Trunk:
${request.filters.trunk || "not specified"}

Drive:
${request.filters.drive || "not specified"}

Fuel:
${request.filters.fuel || "not specified"}

Body:
${request.filters.body || "not specified"}

Style:
${request.filters.style || "not specified"}

Length:
${request.filters.length || "not specified"}

Year:
${request.filters.year || "not specified"}

Avoid:
${request.filters.avoid || "none"}

============================================================
PHOTOGRAPH
============================================================

image MUST be:

""

photoSource MUST be:

""

The backend searches Wikimedia Commons and Wikipedia
independently.

Never invent image URLs.

============================================================
CONFIGURATOR
============================================================

configurator must be an official manufacturer URL only.

If no official configurator can be verified:

""

============================================================
MAINTENANCE
============================================================

Give a realistic short maintenance description in Slovak.

Do not invent exact annual maintenance costs.

============================================================
SCORING
============================================================

score represents matching accuracy to the user's requirements.

It is NOT a review score.

0-100.

============================================================
OUTPUT
============================================================

Return ONLY valid JSON.

No markdown.

No code fences.

Exactly:

{
  "cars": [
    {
      "name": "",
      "generation": "",
      "year": 2026,
      "score": 95,

      "price": "",
      "priceSource": "",

      "power": "",
      "powerKW": 0,
      "powerHP": 0,

      "seats": 5,
      "trunk": "",
      "drive": "",
      "fuel": "",

      "reason": "",
      "pros": [],
      "cons": [],
      "maintenance": "",

      "image": "",
      "photoSource": "",

      "configurator": "",

      "dataSources": []
    }
  ]
}

Exactly 3 cars.

year must be a number.

seats must be a number.

score must be a number from 0 to 100.

powerKW must be a number.

powerHP must be a number.

priceSource must be an official manufacturer URL whenever
price is provided.

IMPORTANT:

Do not return "Cena nie je dostupná".

Do not return "Price unavailable".

Try official manufacturer research first.

All explanatory text MUST be in Slovak.
`;
}


// ============================================================
// NORMALIZE ONE CAR
// ============================================================

function normalizeCar(
  car
) {
  if (
    !car ||
    typeof car !== "object"
  ) {
    throw new Error(
      "Invalid vehicle object"
    );
  }

  const rawPower =
    text(
      car.power,
      150
    );

  const normalizedPower =
    normalizePower(
      rawPower,
      car.powerKW,
      car.powerHP
    );

  const normalizedPrice =
    normalizePrice(
      car.price
    );

  let priceSource =
    text(
      car.priceSource,
      2000
    );

  if (
    !isOfficialManufacturerURL(
      priceSource
    )
  ) {
    priceSource = "";
  }

  const dataSources =
    normalizeSources(
      car.dataSources
    );

  const result = {
    name:
      text(
        car.name,
        200
      ),

    generation:
      text(
        car.generation,
        300
      ),

    year:
      Number(
        car.year
      ),

    score:
      Number(
        car.score
      ),

    price:
      normalizedPrice,

    priceSource,

    power:
      normalizedPower.display,

    powerKW:
      normalizedPower.kw,

    powerHP:
      normalizedPower.hp,

    seats:
      Number(
        car.seats
      ),

    trunk:
      text(
        car.trunk,
        150
      ),

    drive:
      text(
        car.drive,
        150
      ),

    fuel:
      text(
        car.fuel,
        150
      ),

    reason:
      text(
        car.reason,
        1500
      ),

    pros:
      arrayText(
        car.pros
      ),

    cons:
      arrayText(
        car.cons
      ),

    maintenance:
      text(
        car.maintenance,
        1500
      ),

    image: "",

    photoSource: "",

    configurator:
      text(
        car.configurator,
        2000
      ),

    dataSources,

    imageCandidates: []
  };

  if (!result.name) {
    throw new Error(
      "Vehicle name missing"
    );
  }

  if (!result.generation) {
    throw new Error(
      `Generation missing for ${result.name}`
    );
  }

  if (
    !Number.isFinite(
      result.year
    ) ||
    result.year < 2000 ||
    result.year > 2100
  ) {
    throw new Error(
      `Invalid model year for ${result.name}`
    );
  }

  if (
    !Number.isFinite(
      result.score
    )
  ) {
    result.score = 0;
  }

  result.score =
    Math.max(
      0,
      Math.min(
        100,
        Math.round(
          result.score
        )
      )
    );

  if (
    !Number.isFinite(
      result.seats
    ) ||
    result.seats < 1 ||
    result.seats > 20
  ) {
    result.seats = null;
  }

  if (!result.reason) {
    result.reason =
      "Spĺňa zadané požiadavky používateľa.";
  }

  return result;
}


// ============================================================
// VALIDATE 3 CARS
// ============================================================

function validateCars(
  data
) {
  if (
    !data ||
    !Array.isArray(
      data.cars
    )
  ) {
    throw new Error(
      "AI response does not contain cars"
    );
  }

  if (
    data.cars.length !== 3
  ) {
    throw new Error(
      `AI returned ${data.cars.length} cars instead of 3`
    );
  }

  return data.cars.map(
    normalizeCar
  );
}


// ============================================================
// FETCH WITH TIMEOUT
// ============================================================

async function fetchWithTimeout(
  url,
  options = {},
  timeout = 30000
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
// IMAGE REJECTION
// ============================================================

const IMAGE_REJECT_WORDS = [
  "logo",
  "icon",
  "flag",
  "emblem",
  "badge",
  "wheel",
  "interior",
  "dashboard",
  "steering",
  "engine",
  "poster",
  "advertisement",
  "advert",
  "brochure",
  "drawing",
  "diagram",
  "blueprint",
  "model kit",
  "toy",
  "miniature",
  "hot wheels",
  "matchbox",
  "scale model",
  "render",
  "concept",
  "prototype",
  "motorcycle",
  "motorbike",
  "truck",
  "bus"
];

function isRejectedImageTitle(
  title
) {
  const lower =
    String(
      title || ""
    ).toLowerCase();

  return IMAGE_REJECT_WORDS.some(
    word =>
      lower.includes(
        word
      )
  );
}


// ============================================================
// IMAGE URL VALIDATION
// ============================================================

function isWikimediaPhotoURL(
  url
) {
  if (
    !url ||
    typeof url !== "string"
  ) {
    return false;
  }

  try {
    const parsed =
      new URL(url);

    if (
      parsed.protocol !==
      "https:"
    ) {
      return false;
    }

    return (
      parsed.hostname ===
        "upload.wikimedia.org" ||
      parsed.hostname.endsWith(
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
  const lower =
    String(
      url || ""
    ).toLowerCase();

  return (
    lower.includes(".jpg") ||
    lower.includes(".jpeg") ||
    lower.includes(".png") ||
    lower.includes(".webp")
  );
}


// ============================================================
// CLEAN SEARCH TEXT
// ============================================================

function cleanSearchText(
  value
) {
  return String(
    value || ""
  )
    .replace(
      /[()[\]{},:;|]/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


// ============================================================
// VEHICLE SEARCH TERMS
// ============================================================

function vehicleSearchTerms(
  car
) {
  const name =
    cleanSearchText(
      car.name
    );

  const generation =
    cleanSearchText(
      car.generation
    );

  const year =
    Number(
      car.year
    );

  return {
    name,
    generation,
    year:
      Number.isFinite(
        year
      )
        ? String(year)
        : ""
  };
}


// ============================================================
// IMAGE SEARCH QUERIES
// ============================================================

function buildImageSearchQueries(
  car
) {
  const {
    name,
    generation,
    year
  } =
    vehicleSearchTerms(
      car
    );

  const queries = [];

  if (
    name &&
    generation &&
    year
  ) {
    queries.push(
      `${name} ${generation} ${year} automobile`
    );
  }

  if (
    name &&
    generation
  ) {
    queries.push(
      `${name} ${generation} automobile`
    );
  }

  if (
    name &&
    year
  ) {
    queries.push(
      `${name} ${year} automobile`
    );
  }

  if (name) {
    queries.push(
      `${name} automobile`
    );
  }

  if (
    name &&
    generation
  ) {
    queries.push(
      `${name} ${generation}`
    );
  }

  return [
    ...new Set(
      queries
    )
  ];
}


// ============================================================
// IMAGE RELEVANCE
// ============================================================

function imageRelevanceScore(
  candidate,
  car
) {
  const title =
    String(
      candidate.title || ""
    ).toLowerCase();

  const query =
    String(
      candidate.query || ""
    ).toLowerCase();

  const combined =
    `${title} ${query}`;

  const {
    name,
    generation,
    year
  } =
    vehicleSearchTerms(
      car
    );

  let score = 0;

  const nameWords =
    name
      .toLowerCase()
      .split(
        /[^a-z0-9áäčďéíľĺňóôŕšťúýž-]+/i
      )
      .filter(
        word =>
          word.length >= 3
      );

  const generationWords =
    generation
      .toLowerCase()
      .split(
        /[^a-z0-9áäčďéíľĺňóôŕšťúýž-]+/i
      )
      .filter(
        word =>
          word.length >= 2
      );

  for (
    const word
    of nameWords
  ) {
    if (
      combined.includes(
        word
      )
    ) {
      score += 8;
    }
  }

  for (
    const word
    of generationWords
  ) {
    if (
      combined.includes(
        word
      )
    ) {
      score += 10;
    }
  }

  if (
    year &&
    combined.includes(
      year
    )
  ) {
    score += 15;
  }

  if (
    combined.includes(
      "automobile"
    ) ||
    combined.includes(
      "car"
    ) ||
    combined.includes(
      "vehicle"
    )
  ) {
    score += 3;
  }

  if (
    candidate.queryIndex === 0
  ) {
    score += 10;
  } else if (
    candidate.queryIndex === 1
  ) {
    score += 6;
  }

  return score;
}


// ============================================================
// DEDUPLICATE IMAGES
// ============================================================

function dedupeImageCandidates(
  candidates,
  car
) {
  const map =
    new Map();

  for (
    const candidate
    of candidates
  ) {
    if (
      !candidate ||
      !candidate.image
    ) {
      continue;
    }

    if (
      !isWikimediaPhotoURL(
        candidate.image
      )
    ) {
      continue;
    }

    if (
      !isImageExtension(
        candidate.image
      )
    ) {
      continue;
    }

    if (
      isRejectedImageTitle(
        candidate.title
      )
    ) {
      continue;
    }

    const relevance =
      imageRelevanceScore(
        candidate,
        car
      );

    if (
      relevance < 12
    ) {
      continue;
    }

    const key =
      candidate.image;

    if (!map.has(key)) {
      map.set(
        key,
        {
          ...candidate,
          relevance
        }
      );
    }
  }

  return [
    ...map.values()
  ]
    .sort(
      (a, b) =>
        b.relevance -
        a.relevance
    )
    .slice(
      0,
      MAX_IMAGE_CANDIDATES
    );
}


// ============================================================
// WIKIMEDIA SEARCH
// ============================================================

async function searchWikimediaImages(
  query,
  queryIndex = 0
) {
  const params =
    new URLSearchParams({
      action: "query",

      generator: "search",

      gsrsearch:
        `${query} filetype:bitmap`,

      gsrnamespace: "6",

      gsrlimit: "20",

      prop: "imageinfo",

      iiprop:
        "url|mime|size|dimensions|descriptionurl",

      iiurlwidth: "1600",

      format: "json",

      origin: "*"
    });

  const url =
    `${WIKIMEDIA_API}?${params.toString()}`;

  const response =
    await fetchWithTimeout(
      url,
      {
        method: "GET",

        headers: {
          Accept:
            "application/json",

          "User-Agent":
            "CARMATCHAI/7.0 vehicle-image-lookup"
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
    Object.values(
      data?.query?.pages || {}
    );

  const candidates = [];

  for (
    const page
    of pages
  ) {
    const title =
      text(
        page?.title,
        500
      );

    if (
      isRejectedImageTitle(
        title
      )
    ) {
      continue;
    }

    const imageInfo =
      page?.imageinfo?.[0];

    if (!imageInfo) {
      continue;
    }

    if (
      imageInfo.mime &&
      !String(
        imageInfo.mime
      ).startsWith(
        "image/"
      )
    ) {
      continue;
    }

    const width =
      Number(
        imageInfo.width
      );

    const height =
      Number(
        imageInfo.height
      );

    if (
      Number.isFinite(width) &&
      Number.isFinite(height)
    ) {
      if (
        width < 600 ||
        height < 350
      ) {
        continue;
      }

      const ratio =
        width / height;

      if (
        ratio < 0.8 ||
        ratio > 3.5
      ) {
        continue;
      }
    }

    const imageUrl =
      imageInfo.thumburl ||
      imageInfo.url ||
      "";

    if (
      !isWikimediaPhotoURL(
        imageUrl
      )
    ) {
      continue;
    }

    candidates.push({
      image:
        imageUrl,

      photoSource:
        imageInfo.descriptionurl ||
        "",

      title,

      query,

      queryIndex
    });
  }

  return candidates;
}


// ============================================================
// WIKIPEDIA SEARCH
// ============================================================

async function searchWikipediaImages(
  query,
  queryIndex = 0
) {
  const searchParams =
    new URLSearchParams({
      action: "query",

      list: "search",

      srsearch: query,

      srnamespace: "0",

      srlimit: "10",

      format: "json",

      origin: "*"
    });

  const searchUrl =
    `${WIKIPEDIA_API}?${searchParams.toString()}`;

  const searchResponse =
    await fetchWithTimeout(
      searchUrl,
      {
        method: "GET",

        headers: {
          Accept:
            "application/json",

          "User-Agent":
            "CARMATCHAI/7.0 vehicle-image-lookup"
        }
      },
      WIKIPEDIA_TIMEOUT
    );

  if (!searchResponse.ok) {
    throw new Error(
      `Wikipedia search HTTP ${searchResponse.status}`
    );
  }

  const searchData =
    await searchResponse.json();

  const results =
    searchData?.query?.search;

  if (
    !Array.isArray(
      results
    ) ||
    results.length === 0
  ) {
    return [];
  }

  const titles =
    results
      .slice(0, 10)
      .map(
        item =>
          item?.title
      )
      .filter(Boolean)
      .join("|");

  if (!titles) {
    return [];
  }

  const imageParams =
    new URLSearchParams({
      action: "query",

      titles,

      prop:
        "pageimages|info",

      inprop: "url",

      piprop: "thumbnail",

      pithumbsize: "1600",

      format: "json",

      origin: "*"
    });

  const imageUrl =
    `${WIKIPEDIA_API}?${imageParams.toString()}`;

  const imageResponse =
    await fetchWithTimeout(
      imageUrl,
      {
        method: "GET",

        headers: {
          Accept:
            "application/json",

          "User-Agent":
            "CARMATCHAI/7.0 vehicle-image-lookup"
        }
      },
      WIKIPEDIA_TIMEOUT
    );

  if (!imageResponse.ok) {
    throw new Error(
      `Wikipedia image HTTP ${imageResponse.status}`
    );
  }

  const imageData =
    await imageResponse.json();

  const pages =
    Object.values(
      imageData?.query?.pages || {}
    );

  const candidates = [];

  for (
    const page
    of pages
  ) {
    const title =
      text(
        page?.title,
        500
      );

    if (
      isRejectedImageTitle(
        title
      )
    ) {
      continue;
    }

    const thumbnail =
      page?.thumbnail?.source ||
      "";

    if (
      !isWikimediaPhotoURL(
        thumbnail
      )
    ) {
      continue;
    }

    candidates.push({
      image:
        thumbnail,

      photoSource:
        page?.fullurl ||
        "",

      title,

      query,

      queryIndex
    });
  }

  return candidates;
}


// ============================================================
// FIND VEHICLE IMAGES
// ============================================================

async function findCarImages(
  car
) {
  const queries =
    buildImageSearchQueries(
      car
    );

  if (
    queries.length === 0
  ) {
    return {
      ...car,

      image: "",

      photoSource: "",

      imageCandidates: []
    };
  }

  let candidates = [];

  const commonsResults =
    await Promise.allSettled(
      queries.map(
        (
          query,
          index
        ) =>
          searchWikimediaImages(
            query,
            index
          )
      )
    );

  for (
    const result
    of commonsResults
  ) {
    if (
      result.status ===
      "fulfilled"
    ) {
      candidates.push(
        ...result.value
      );
    }
  }

  let deduped =
    dedupeImageCandidates(
      candidates,
      car
    );

  if (
    deduped.length <
    MAX_IMAGE_CANDIDATES
  ) {
    const wikipediaResults =
      await Promise.allSettled(
        queries.map(
          (
            query,
            index
          ) =>
            searchWikipediaImages(
              query,
              index
            )
        )
      );

    for (
      const result
      of wikipediaResults
    ) {
      if (
        result.status ===
        "fulfilled"
      ) {
        candidates.push(
          ...result.value
        );
      }
    }

    deduped =
      dedupeImageCandidates(
        candidates,
        car
      );
  }

  const imageCandidates =
    deduped
      .slice(
        0,
        MAX_IMAGE_CANDIDATES
      )
      .map(
        candidate => ({
          url:
            candidate.image,

          source:
            candidate.photoSource ||
            "",

          title:
            candidate.title ||
            ""
        })
      );

  const first =
    imageCandidates[0];

  return {
    ...car,

    image:
      first?.url || "",

    photoSource:
      first?.source || "",

    imageCandidates
  };
}


// ============================================================
// ADD PHOTOS
// ============================================================

async function addCarImages(
  cars
) {
  return Promise.all(
    cars.map(
      car =>
        findCarImages(
          car
        )
    )
  );
}


// ============================================================
// GROQ MODEL
// ============================================================

async function callGroqModel(
  request,
  model,
  timeout
) {
  if (!GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY is not configured"
    );
  }

  const response =
    await fetchWithTimeout(
      GROQ_URL,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${GROQ_API_KEY}`,

          "Groq-Model-Version":
            "latest"
        },

        body: JSON.stringify({
          model,

          messages: [
            {
              role: "system",

              content: `
You are CARMATCH AI.

Always answer in Slovak.

CRITICAL:
For every vehicle, actively research the CURRENT OFFICIAL
MANUFACTURER PRICE.

Never give:
"Cena nie je dostupná"

Never give:
"Price unavailable"

Only use:
"Cena na vyžiadanie"

if an official manufacturer price genuinely cannot be found.

The priceSource must be the official manufacturer website
where the price was verified.

POWER:
Always output:
XXX kW / YYY HP

Never use PS, CV or bhp.

Calculate HP from kW:
HP = kW × 1.34102209

Return ONLY valid JSON.
`
            },

            {
              role: "user",

              content:
                buildPrompt(
                  request
                )
            }
          ],

          temperature: 0.1,

          max_completion_tokens:
            12000,

          response_format: {
            type:
              "json_object"
          },

          ...(model ===
          "groq/compound"
            ? {
                compound_custom: {
                  tools: {
                    enabled_tools: [
                      "web_search",
                      "visit_website"
                    ]
                  }
                }
              }
            : {
                compound_custom: {
                  tools: {
                    enabled_tools: [
                      "web_search"
                    ]
                  }
                }
              })
        })
      },
      timeout
    );

  const raw =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `Groq ${model} HTTP ${response.status}: ${raw.slice(
        0,
        500
      )}`
    );
  }

  let apiData;

  try {
    apiData =
      JSON.parse(raw);
  } catch (_) {
    throw new Error(
      "Groq API returned invalid JSON"
    );
  }

  const content =
    apiData
      ?.choices?.[0]
      ?.message
      ?.content;

  if (!content) {
    throw new Error(
      `Groq ${model} returned empty content`
    );
  }

  const parsed =
    parseAIJson(
      content
    );

  const validatedCars =
    validateCars(
      parsed
    );

  const cars =
    await addCarImages(
      validatedCars
    );

  return {
    cars,

    provider:
      `Groq ${model}`,

    liveWeb: true
  };
}


// ============================================================
// GROQ FAILOVER
// ============================================================

async function callGroq(
  request
) {
  let lastError =
    null;

  const models = [
    {
      model:
        "groq/compound",

      timeout:
        GROQ_TIMEOUT
    },

    {
      model:
        "groq/compound-mini",

      timeout:
        GROQ_MINI_TIMEOUT
    }
  ];

  for (
    const item
    of models
  ) {
    try {
      return await callGroqModel(
        request,
        item.model,
        item.timeout
      );
    } catch (error) {
      lastError =
        error;

      console.error(
        `CARMATCH AI - ${item.model} failed:`,
        error
      );
    }
  }

  throw (
    lastError ||
    new Error(
      "All Groq providers failed"
    )
  );
}


// ============================================================
// OPENROUTER MODEL
// ============================================================

async function callOpenRouterModel(
  request,
  model
) {
  if (!OPENROUTER_API_KEY) {
    throw new Error(
      "OPENROUTER_API_KEY is not configured"
    );
  }

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

        body: JSON.stringify({
          model,

          messages: [
            {
              role: "system",

              content: `
You are CARMATCH AI.

Always answer in Slovak.

CURRENT PRICE IS MANDATORY WHEN POSSIBLE.

Search for the official manufacturer price.

Do NOT return:
"Cena nie je dostupná"
"Price unavailable"
"Unknown price"

If an official price cannot genuinely be found,
use only:
"Cena na vyžiadanie"

priceSource must be an official manufacturer URL.

POWER MUST BE:
XXX kW / YYY HP

Never use PS.
Never use CV.
Never use bhp.

HP = kW × 1.34102209

Return exactly 3 real production vehicles.

Return ONLY valid JSON.
`
            },

            {
              role: "user",

              content:
                buildPrompt(
                  request
                )
            }
          ],

          temperature: 0.1,

          max_tokens:
            10000,

          response_format: {
            type:
              "json_object"
          }
        })
      },
      OPENROUTER_TIMEOUT
    );

  const raw =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `OpenRouter ${model} HTTP ${response.status}: ${raw.slice(
        0,
        500
      )}`
    );
  }

  let apiData;

  try {
    apiData =
      JSON.parse(raw);
  } catch (_) {
    throw new Error(
      `OpenRouter ${model} returned invalid API JSON`
    );
  }

  const content =
    apiData
      ?.choices?.[0]
      ?.message
      ?.content;

  if (!content) {
    throw new Error(
      `OpenRouter ${model} returned empty content`
    );
  }

  const parsed =
    parseAIJson(
      content
    );

  const validatedCars =
    validateCars(
      parsed
    );

  const cars =
    await addCarImages(
      validatedCars
    );

  return {
    cars,

    provider:
      `OpenRouter (${model})`,

    liveWeb: false
  };
}


// ============================================================
// OPENROUTER FAILOVER
// ============================================================

async function callOpenRouter(
  request
) {
  let lastError =
    null;

  for (
    const model
    of OPENROUTER_FREE_MODELS
  ) {
    try {
      console.log(
        `CARMATCH AI - trying OpenRouter model: ${model}`
      );

      return await callOpenRouterModel(
        request,
        model
      );
    } catch (error) {
      lastError =
        error;

      console.error(
        `CARMATCH AI - OpenRouter ${model} failed:`,
        error
      );
    }
  }

  throw (
    lastError ||
    new Error(
      "All OpenRouter free models failed"
    )
  );
}


// ============================================================
// MAIN HANDLER
// ============================================================

export default async function handler(
  req,
  res
) {
  // ==========================================================
  // CORS
  // ==========================================================

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

  if (
    req.method ===
    "OPTIONS"
  ) {
    return res
      .status(200)
      .end();
  }

  if (
    req.method !==
    "POST"
  ) {
    return sendJson(
      res,
      405,
      {
        error:
          "Method not allowed"
      }
    );
  }

  try {
    // ========================================================
    // ENVIRONMENT
    // ========================================================

    if (
      !SUPABASE_URL ||
      !SUPABASE_ANON_KEY
    ) {
      console.error(
        "CARMATCH AI: Supabase environment variables missing"
      );

      return sendJson(
        res,
        500,
        {
          error:
            "Configuration error"
        }
      );
    }

    if (
      !GROQ_API_KEY &&
      !OPENROUTER_API_KEY
    ) {
      return sendJson(
        res,
        500,
        {
          error:
            "Configuration error",

          message:
            "CARMATCH AI nemá nakonfigurovaný GROQ_API_KEY ani OPENROUTER_API_KEY."
        }
      );
    }

    // ========================================================
    // AUTHORIZATION
    // ========================================================

    const authorization =
      req.headers.authorization ||
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
            "Unauthorized"
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
            "Unauthorized"
        }
      );
    }

    // ========================================================
    // VERIFY USER
    // ========================================================

    const user =
      await verifyUser(
        accessToken
      );

    if (!user) {
      return sendJson(
        res,
        401,
        {
          error:
            "Supabase session is invalid or expired"
        }
      );
    }

    // ========================================================
    // REQUEST
    // ========================================================

    const request =
      normalizeRequest(
        req.body || {}
      );

    // ========================================================
    // DAILY LIMIT
    // ========================================================

    const usage =
      await useSearch(
        accessToken
      );

    if (!usage.allowed) {
      return sendJson(
        res,
        429,
        {
          error:
            "Denný limit vyhľadávaní bol dosiahnutý.",

          message:
            "Použil si všetkých 5 vyhľadávaní pre dnešok.",

          remaining: 0
        }
      );
    }

    // ========================================================
    // PROVIDERS
    // ========================================================

    let result = null;

    let groqFailed = false;

    let openRouterFailed =
      false;

    // ========================================================
    // 1. GROQ
    // ========================================================

    if (GROQ_API_KEY) {
      try {
        result =
          await callGroq(
            request
          );
      } catch (error) {
        groqFailed = true;

        console.error(
          "CARMATCH AI - all Groq providers failed:",
          error
        );
      }
    }

    // ========================================================
    // 2. OPENROUTER
    // ========================================================

    if (
      !result &&
      OPENROUTER_API_KEY
    ) {
      try {
        result =
          await callOpenRouter(
            request
          );
      } catch (error) {
        openRouterFailed =
          true;

        console.error(
          "CARMATCH AI - all OpenRouter providers failed:",
          error
        );
      }
    }

    // ========================================================
    // ALL PROVIDERS FAILED
    // ========================================================

    if (!result) {
      const refund =
        await refundSearch(
          accessToken
        );

      const remaining =
        Number.isFinite(
          Number(
            refund?.remaining
          )
        )
          ? Number(
              refund.remaining
            )
          : usage.remaining;

      return sendJson(
        res,
        503,
        {
          error:
            "AI temporarily unavailable",

          message:
            "CARMATCH AI momentálne nemá dostupnú AI službu. Toto vyhľadávanie sa nezapočítalo do denného limitu.",

          retryable:
            true,

          remaining,

          providerStatus: {
            groq:
              !GROQ_API_KEY
                ? "not_configured"
                : groqFailed
                  ? "unavailable"
                  : "unknown",

            openrouter:
              !OPENROUTER_API_KEY
                ? "not_configured"
                : openRouterFailed
                  ? "unavailable"
                  : "unknown"
          }
        }
      );
    }

    // ========================================================
    // FINAL SERVER-SIDE POWER NORMALIZATION
    // ========================================================

    result.cars =
      result.cars.map(
        car => {
          const power =
            normalizePower(
              car.power,
              car.powerKW,
              car.powerHP
            );

          return {
            ...car,

            power:
              power.display,

            powerKW:
              power.kw,

            powerHP:
              power.hp
          };
        }
      );

    // ========================================================
    // SUCCESS
    // ========================================================

    return sendJson(
      res,
      200,
      {
        cars:
          result.cars,

        remaining:
          usage.remaining,

        ai: {
          provider:
            result.provider,

          liveWeb:
            Boolean(
              result.liveWeb
            ),

          generatedAt:
            new Date().toISOString()
        }
      }
    );

  } catch (error) {
    console.error(
      "CARMATCH AI INTERNAL ERROR:",
      error
    );

    return sendJson(
      res,
      500,
      {
        error:
          "Server configuration error",

        message:
          "CARMATCH AI sa nepodarilo dokončiť požiadavku. Skontroluj nastavenia Supabase, GROQ_API_KEY a OPENROUTER_API_KEY vo Verceli.",

        retryable:
          true
      }
    );
  }
}