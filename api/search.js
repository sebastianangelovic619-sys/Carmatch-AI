// ============================================================
// CARMATCH AI - FINAL BACKEND v6.1
// ============================================================
// Supabase anonymous auth + 5 searches/day
// Groq Compound live web research
// Groq Compound Mini fallback
// Multiple OpenRouter FREE fallbacks
// Automatic provider switching
// Search refund protection
// Frontend refund action support
// Exact Wikimedia Commons / Wikipedia vehicle images
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

const GROQ_TIMEOUT = 55000;
const GROQ_MINI_TIMEOUT = 45000;
const OPENROUTER_TIMEOUT = 35000;

const WIKIMEDIA_TIMEOUT = 8000;
const WIKIPEDIA_TIMEOUT = 8000;


// ============================================================
// IMAGE SETTINGS
// ============================================================

const MAX_IMAGE_CANDIDATES = 8;
const IMAGE_SEARCH_LIMIT = 35;
const IMAGE_MIN_WIDTH = 500;
const IMAGE_MIN_HEIGHT = 300;


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


// ============================================================
// BASIC RESPONSE
// ============================================================

function sendJson(res, status, data) {
  res.status(status);

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  return res.json(data);
}


// ============================================================
// FETCH WITH TIMEOUT
// ============================================================

async function fetchWithTimeout(url, options = {}, timeout = 15000) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, timeout);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}


// ============================================================
// TEXT HELPERS
// ============================================================

function text(value) {
  if (value === null || value === undefined) {
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

function normalizePower(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const match = String(value).replace(",", ".").match(/-?\d+(?:\.\d+)?/);

  if (!match) {
    return null;
  }

  const number = Number(match[0]);

  return Number.isFinite(number) ? number : null;
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

  const valueText = String(value).trim();

  if (!valueText) {
    return "Cena nie je dostupná";
  }

  const unavailable = [
    "unknown",
    "n/a",
    "na",
    "not available",
    "unavailable",
    "null",
    "undefined",
    "price unavailable",
    "cena nie je dostupná",
    "cena na vyžiadanie"
  ];

  if (unavailable.includes(valueText.toLowerCase())) {
    return "Cena nie je dostupná";
  }

  return valueText;
}


// ============================================================
// AI JSON PARSER
// ============================================================

function parseAIJson(content) {
  let raw = text(content);

  if (!raw) {
    throw new Error("AI returned empty response.");
  }

  raw = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(raw);
  } catch (_) {
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");

    if (
      firstBrace !== -1 &&
      lastBrace !== -1 &&
      lastBrace > firstBrace
    ) {
      const extracted = raw.slice(firstBrace, lastBrace + 1);

      try {
        return JSON.parse(extracted);
      } catch (_) {
        // continue
      }
    }

    throw new Error("AI returned invalid JSON.");
  }
}


// ============================================================
// SUPABASE USER VERIFICATION
// ============================================================

async function verifyUser(accessToken) {
  if (!SUPABASE_URL) {
    throw new Error("SUPABASE_URL is missing.");
  }

  if (!SUPABASE_ANON_KEY) {
    throw new Error("SUPABASE_ANON_KEY is missing.");
  }

  const response = await fetchWithTimeout(
    `${SUPABASE_URL}/auth/v1/user`,
    {
      method: "GET",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`
      }
    },
    10000
  );

  if (!response.ok) {
    throw new Error("Invalid Supabase session.");
  }

  const user = await response.json();

  if (!user || !user.id) {
    throw new Error("Supabase user not found.");
  }

  return user;
}


// ============================================================
// SUPABASE RPC
// ============================================================

async function callSupabaseRPC(functionName, accessToken) {
  const response = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/rpc/${functionName}`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: "{}"
    },
    10000
  );

  const raw = await response.text();

  let data = null;

  try {
    data = raw ? JSON.parse(raw) : null;
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

async function useSearch(accessToken) {
  const result = await callSupabaseRPC(
    "use_search",
    accessToken
  );

  if (typeof result === "boolean") {
    return {
      allowed: result,
      remaining: result
        ? Math.max(MAX_SEARCHES_PER_DAY - 1, 0)
        : 0
    };
  }

  if (typeof result === "number") {
    return {
      allowed: result > 0,
      remaining: Math.max(result, 0)
    };
  }

  if (Array.isArray(result)) {
    const row = result[0] || {};

    return {
      allowed:
        row.allowed !== false &&
        row.success !== false,
      remaining:
        Number.isFinite(Number(row.remaining))
          ? Number(row.remaining)
          : null
    };
  }

  if (result && typeof result === "object") {
    return {
      allowed:
        result.allowed !== false &&
        result.success !== false,
      remaining:
        Number.isFinite(Number(result.remaining))
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

async function refundSearch(accessToken) {
  try {
    const result = await callSupabaseRPC(
      "refund_search",
      accessToken
    );

    if (Array.isArray(result)) {
      const row = result[0] || {};

      return {
        success: row.success !== false,
        remaining:
          Number.isFinite(Number(row.remaining))
            ? Number(row.remaining)
            : null
      };
    }

    if (result && typeof result === "object") {
      return {
        success: result.success !== false,
        remaining:
          Number.isFinite(Number(result.remaining))
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

function normalizeRequest(body) {
  const input = body && typeof body === "object"
    ? body
    : {};

  const filters =
    input.filters &&
    typeof input.filters === "object"
      ? input.filters
      : {};

  return {
    naturalLanguage: text(
      input.naturalLanguage ||
      input.query ||
      input.prompt
    ),

    filters: {
      budget: text(filters.budget),
      seats: text(filters.seats),
      minPower: text(filters.minPower),
      trunk: text(filters.trunk),
      drive: text(filters.drive),
      fuel: text(filters.fuel),
      body: text(filters.body),
      style: text(filters.style),
      length: text(filters.length),
      year: text(filters.year),
      avoidBrands: arrayText(filters.avoidBrands)
    },

    resultCount: 3
  };
}


// ============================================================
// MARKET DETECTION
// ============================================================

function detectMarket(request) {
  const combined = JSON.stringify(request).toLowerCase();

  if (
    combined.includes("slovak") ||
    combined.includes("slovakia") ||
    combined.includes("slovensko") ||
    combined.includes("eur")
  ) {
    return "Slovakia / European Union";
  }

  return "European Union";
}


// ============================================================
// BUILD AI PROMPT
// ============================================================

function buildPrompt(request) {
  const currentDate = new Date()
    .toISOString()
    .slice(0, 10);

  const market = detectMarket(request);

  return `
You are CARMATCH AI, an automotive research assistant.

CURRENT DATE:
${currentDate}

TARGET MARKET:
${market}

USER REQUEST:
${request.naturalLanguage || "No natural-language request provided."}

FILTERS:
${JSON.stringify(request.filters, null, 2)}

IMPORTANT RULES:

1. Return EXACTLY 3 real production vehicles.

2. Recommend vehicles that actually exist.
   Never invent a vehicle, generation, engine, price, URL or specification.

3. Prioritize current/new vehicles and the newest available generation.
   When the user explicitly asks for a future model year, only use information that can
   be supported by current research.

4. Research current information whenever web research is available.

5. Prices:
   - Use the current price for the relevant market whenever possible.
   - Never invent a price.
   - If an exact current price cannot be verified, use:
     "Cena nie je dostupná"
   - If the manufacturer lists a vehicle as "price on request", use:
     "Cena na vyžiadanie"

6. POWER:
   - User-facing power values MUST use only HP and kW.
   - Never use PS.
   - Never use ks.
   - Never use k.
   - Never use "koní".
   - Never use "kon".
   - Never convert HP to kW or kW to HP.
   - If the source provides both, preserve the source values.

7. IMAGE:
   - Do NOT invent image URLs.
   - Return image and photoSource as empty strings.
   - The backend will independently find exact vehicle photographs.

8. PHOTO:
   Backend searches Wikimedia Commons and Wikipedia.
   Therefore identify the vehicle as precisely as possible:
   brand + exact model + generation + model year.

9. CONFIGURATOR:
   Provide ONLY an official manufacturer configurator URL when one can be verified.
   Never invent a configurator URL.

10. Avoid generic recommendations that do not match the user's constraints.

11. If the user asks for high performance, do not recommend a normal low-power version
    merely because the model name matches.

12. If the user asks for SUV, estate/wagon, sedan, coupe, etc., respect the body style.

13. Consider:
    - purchase price
    - power
    - practicality
    - boot/trunk
    - seats
    - drivetrain
    - fuel/powertrain
    - reliability considerations
    - maintenance
    - performance
    - suitability for the request

14. The score is NOT a political or subjective popularity score.
    It is a matching score from 0 to 100 based only on how well the vehicle satisfies
    the user's explicit requirements.

RETURN ONLY VALID JSON.

EXACT JSON STRUCTURE:

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
      "powerHP": "",
      "powerKW": "",
      "seats": "",
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

No markdown.
No explanations outside JSON.
`.trim();
}


// ============================================================
// VALIDATE CAR
// ============================================================

function normalizeCar(car) {
  if (!car || typeof car !== "object") {
    return null;
  }

  const normalized = {
    name: text(car.name),
    brand: text(car.brand),
    model: text(car.model),
    generation: text(car.generation),
    year: text(car.year),

    price: normalizePrice(car.price),
    currency: text(car.currency),
    priceSource: text(car.priceSource),

    powerHP: normalizePower(car.powerHP),
    powerKW: normalizePower(car.powerKW),

    seats: normalizePower(car.seats),

    trunk: text(car.trunk),
    drive: text(car.drive),
    fuel: text(car.fuel),
    body: text(car.body),
    length: text(car.length),

    officialConfigurator: text(
      car.officialConfigurator
    ),

    maintenance: text(car.maintenance),

    pros: arrayText(car.pros),
    cons: arrayText(car.cons),

    reason: text(car.reason),

    score: normalizePower(car.score),

    image: "",
    photoSource: "",

    imageCandidates: []
  };

  if (!normalized.name) {
    return null;
  }

  if (!normalized.brand) {
    return null;
  }

  if (!normalized.model) {
    return null;
  }

  if (
    normalized.score === null ||
    normalized.score < 0 ||
    normalized.score > 100
  ) {
    normalized.score = 0;
  }

  if (
    normalized.seats !== null &&
    (
      normalized.seats < 1 ||
      normalized.seats > 20
    )
  ) {
    normalized.seats = null;
  }

  return normalized;
}


// ============================================================
// VALIDATE CAR ARRAY
// ============================================================

function normalizeCars(data) {
  if (!data || typeof data !== "object") {
    throw new Error("AI response is not an object.");
  }

  const cars = Array.isArray(data.cars)
    ? data.cars
    : [];

  if (cars.length !== 3) {
    throw new Error(
      `AI returned ${cars.length} cars instead of exactly 3.`
    );
  }

  const normalized = cars
    .map(normalizeCar)
    .filter(Boolean);

  if (normalized.length !== 3) {
    throw new Error(
      "AI returned invalid vehicle data."
    );
  }

  return normalized;
}


// ============================================================
// IMAGE URL VALIDATION
// ============================================================

function isWikimediaPhotoURL(url) {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);

    if (parsed.protocol !== "https:") {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    return (
      hostname === "upload.wikimedia.org" ||
      hostname.endsWith(".wikimedia.org")
    );

  } catch (_) {
    return false;
  }
}


function isImageExtension(url) {
  if (!url) {
    return false;
  }

  const clean = url
    .split("?")[0]
    .split("#")[0]
    .toLowerCase();

  return (
    clean.endsWith(".jpg") ||
    clean.endsWith(".jpeg") ||
    clean.endsWith(".png") ||
    clean.endsWith(".webp")
  );
}


// ============================================================
// IMAGE TITLE FILTER
// ============================================================

function isRejectedImageTitle(title) {
  const normalized = text(title).toLowerCase();

  return IMAGE_REJECT_WORDS.some(word =>
    normalized.includes(word)
  );
}


// ============================================================
// IMAGE WORD NORMALIZATION
// ============================================================

function normalizeSearchWords(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9áäčďéíĺľňóôŕšťúýž\s-]/gi, " ")
    .replace(/[-_/]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}


function getVehicleSearchWords(car) {
  const combined = [
    car.brand,
    car.model,
    car.generation,
    car.year
  ].join(" ");

  const words = normalizeSearchWords(combined);

  const stopWords = new Set([
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
    "series"
  ]);

  return words.filter(word =>
    !stopWords.has(word) &&
    word.length >= 2
  );
}


// ============================================================
// IMAGE RELEVANCE
// ============================================================

function imageRelevanceScore(title, car, queryIndex = 0) {
  const titleWords = new Set(
    normalizeSearchWords(title)
  );

  const vehicleWords =
    getVehicleSearchWords(car);

  let score = 0;

  for (const word of vehicleWords) {
    if (titleWords.has(word)) {
      score += 10;
    }
  }

  const lowerTitle = text(title).toLowerCase();

  if (
    car.brand &&
    lowerTitle.includes(
      text(car.brand).toLowerCase()
    )
  ) {
    score += 12;
  }

  if (
    car.model &&
    lowerTitle.includes(
      text(car.model).toLowerCase()
    )
  ) {
    score += 20;
  }

  if (
    car.generation &&
    lowerTitle.includes(
      text(car.generation).toLowerCase()
    )
  ) {
    score += 15;
  }

  if (
    car.year &&
    lowerTitle.includes(
      text(car.year).toLowerCase()
    )
  ) {
    score += 8;
  }

  if (
    lowerTitle.includes("automobile") ||
    lowerTitle.includes("car") ||
    lowerTitle.includes("vehicle")
  ) {
    score += 3;
  }

  score -= queryIndex;

  return score;
}


// ============================================================
// BUILD IMAGE QUERIES
// ============================================================

function buildImageQueries(car) {
  const brand = text(car.brand);
  const model = text(car.model);
  const generation = text(car.generation);
  const year = text(car.year);

  const queries = [];

  if (
    brand &&
    model &&
    generation &&
    year
  ) {
    queries.push(
      `${brand} ${model} ${generation} ${year} automobile`
    );
  }

  if (
    brand &&
    model &&
    generation
  ) {
    queries.push(
      `${brand} ${model} ${generation} automobile`
    );
  }

  if (
    brand &&
    model &&
    year
  ) {
    queries.push(
      `${brand} ${model} ${year} car`
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

async function searchWikimedia(query, car, queryIndex) {
  const url = new URL(WIKIMEDIA_API);

  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");

  url.searchParams.set(
    "generator",
    "search"
  );

  url.searchParams.set(
    "gsrsearch",
    query
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
    "prop",
    "imageinfo"
  );

  url.searchParams.set(
    "iiprop",
    "url|mime|size"
  );

  url.searchParams.set(
    "iiurlwidth",
    "1600"
  );

  const response = await fetchWithTimeout(
    url.toString(),
    {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    },
    WIKIMEDIA_TIMEOUT
  );

  if (!response.ok) {
    throw new Error(
      `Wikimedia HTTP ${response.status}`
    );
  }

  const data = await response.json();

  const pages =
    data?.query?.pages || [];

  const candidates = [];

  for (const page of pages) {
    const title = text(page.title);

    if (!title) {
      continue;
    }

    if (isRejectedImageTitle(title)) {
      continue;
    }

    const imageInfo =
      Array.isArray(page.imageinfo)
        ? page.imageinfo[0]
        : null;

    if (!imageInfo) {
      continue;
    }

    const mime =
      text(imageInfo.mime).toLowerCase();

    if (
      mime &&
      !mime.startsWith("image/")
    ) {
      continue;
    }

    const width =
      Number(imageInfo.width) || 0;

    const height =
      Number(imageInfo.height) || 0;

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

    if (!isWikimediaPhotoURL(imageUrl)) {
      continue;
    }

    if (
      !isImageExtension(imageUrl)
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
      url: imageUrl,
      title,
      relevance,
      width,
      height,
      source: "Wikimedia Commons"
    });
  }

  return candidates;
}


// ============================================================
// WIKIPEDIA SEARCH
// ============================================================

async function searchWikipedia(query, car, queryIndex) {
  const url = new URL(WIKIPEDIA_API);

  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");

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

  const response = await fetchWithTimeout(
    url.toString(),
    {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    },
    WIKIPEDIA_TIMEOUT
  );

  if (!response.ok) {
    throw new Error(
      `Wikipedia HTTP ${response.status}`
    );
  }

  const data = await response.json();

  const pages =
    data?.query?.pages || [];

  const candidates = [];

  for (const page of pages) {
    const title = text(page.title);

    if (!title) {
      continue;
    }

    if (isRejectedImageTitle(title)) {
      continue;
    }

    const thumbnail =
      page.thumbnail?.source;

    if (!thumbnail) {
      continue;
    }

    if (!isWikimediaPhotoURL(thumbnail)) {
      continue;
    }

    const width =
      Number(page.thumbnail?.width) || 0;

    const height =
      Number(page.thumbnail?.height) || 0;

    if (
      width < IMAGE_MIN_WIDTH ||
      height < IMAGE_MIN_HEIGHT
    ) {
      continue;
    }

    const relevance =
      imageRelevanceScore(
        title,
        car,
        queryIndex
      ) + 5;

    candidates.push({
      url: thumbnail,
      title,
      relevance,
      width,
      height,
      source: "Wikipedia"
    });
  }

  return candidates;
}


// ============================================================
// EXACT CAR IMAGE SEARCH
// ============================================================

async function findCarImages(car) {
  const queries =
    buildImageQueries(car);

  const allCandidates = [];

  for (
    let i = 0;
    i < queries.length;
    i++
  ) {
    const query = queries[i];

    try {
      const results =
        await searchWikimedia(
          query,
          car,
          i
        );

      allCandidates.push(
        ...results
      );
    } catch (error) {
      console.error(
        "Wikimedia image search failed:",
        error?.message || error
      );
    }

    if (
      allCandidates.length >=
      IMAGE_SEARCH_LIMIT
    ) {
      break;
    }
  }


  // ----------------------------------------------------------
  // WIKIPEDIA FALLBACK
  // ----------------------------------------------------------

  if (
    allCandidates.length <
    MAX_IMAGE_CANDIDATES
  ) {
    for (
      let i = 0;
      i < queries.length;
      i++
    ) {
      const query = queries[i];

      try {
        const results =
          await searchWikipedia(
            query,
            car,
            i
          );

        allCandidates.push(
          ...results
        );
      } catch (error) {
        console.error(
          "Wikipedia image search failed:",
          error?.message || error
        );
      }

      if (
        allCandidates.length >=
        IMAGE_SEARCH_LIMIT
      ) {
        break;
      }
    }
  }


  // ----------------------------------------------------------
  // DEDUPLICATE
  // ----------------------------------------------------------

  const unique =
    new Map();

  for (const candidate of allCandidates) {
    if (!candidate?.url) {
      continue;
    }

    if (!unique.has(candidate.url)) {
      unique.set(
        candidate.url,
        candidate
      );
    }
  }


  // ----------------------------------------------------------
  // SORT
  // ----------------------------------------------------------

  const sorted =
    [...unique.values()]
      .sort((a, b) =>
        b.relevance - a.relevance
      );


  // ----------------------------------------------------------
  // FINAL CANDIDATES
  // ----------------------------------------------------------

  const finalCandidates =
    sorted
      .slice(
        0,
        MAX_IMAGE_CANDIDATES
      )
      .map(item => item.url);


  // ----------------------------------------------------------
  // RESULT
  // ----------------------------------------------------------

  return {
    image:
      finalCandidates[0] || "",

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

async function addCarImages(cars) {
  const results =
    await Promise.allSettled(
      cars.map(car =>
        findCarImages(car)
      )
    );

  return cars.map(
    (car, index) => {
      const result =
        results[index];

      if (
        result.status === "fulfilled"
      ) {
        return {
          ...car,
          image:
            result.value.image || "",

          photoSource:
            result.value.photoSource || "",

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
    buildPrompt(request);

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
        content: prompt
      }
    ],

    temperature: 0.1,

    max_completion_tokens: 12000,

    response_format: {
      type: "json_object"
    }
  };


  // ----------------------------------------------------------
  // GROQ COMPOUND
  // ----------------------------------------------------------

  if (
    model === "groq/compound"
  ) {
    body.tools = [
      {
        type: "browser_search"
      },
      {
        type: "browser_visit"
      }
    ];
  }


  // ----------------------------------------------------------
  // GROQ COMPOUND MINI
  // ----------------------------------------------------------

  if (
    model === "groq/compound-mini"
  ) {
    body.tools = [
      {
        type: "browser_search"
      }
    ];
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
            `Bearer ${GROQ_API_KEY}`
        },

        body:
          JSON.stringify(body)
      },
      timeout
    );


  const raw =
    await response.text();


  if (!response.ok) {
    throw new Error(
      `Groq ${model} HTTP ${response.status}: ${raw.slice(0, 500)}`
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
    parseAIJson(content);

  const cars =
    normalizeCars(parsed);


  return await addCarImages(cars);
}


// ============================================================
// GROQ PROVIDERS
// ============================================================

async function callGroq(request) {
  let firstError = null;

  try {
    return await callGroqModel(
      "groq/compound",
      request,
      GROQ_TIMEOUT
    );
  } catch (error) {
    firstError = error;

    console.error(
      "Groq Compound failed:",
      error?.message || error
    );
  }


  try {
    return await callGroqModel(
      "groq/compound-mini",
      request,
      GROQ_MINI_TIMEOUT
    );
  } catch (error) {
    console.error(
      "Groq Compound Mini failed:",
      error?.message || error
    );

    throw new Error(
      `Groq providers failed. First error: ${
        firstError?.message || "unknown"
      }. Second error: ${
        error?.message || "unknown"
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
    buildPrompt(request);


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
        content: prompt
      }
    ],

    temperature: 0.1,

    max_tokens: 10000,

    response_format: {
      type: "json_object"
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
          JSON.stringify(body)
      },
      OPENROUTER_TIMEOUT
    );


  const raw =
    await response.text();


  if (!response.ok) {
    throw new Error(
      `OpenRouter ${model} HTTP ${response.status}: ${raw.slice(0, 500)}`
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
    parseAIJson(content);

  const cars =
    normalizeCars(parsed);


  return await addCarImages(cars);
}


// ============================================================
// OPENROUTER FALLBACK CHAIN
// ============================================================

async function callOpenRouter(request) {
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

function getRequestId(req) {
  const header =
    req.headers?.["x-search-request-id"];

  if (header) {
    return text(header);
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
  // ----------------------------------------------------------
  // CORS / OPTIONS
  // ----------------------------------------------------------

  if (req.method === "OPTIONS") {
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


  // ----------------------------------------------------------
  // METHOD
  // ----------------------------------------------------------

  if (req.method !== "POST") {
    return sendJson(
      res,
      405,
      {
        error:
          "Method not allowed."
      }
    );
  }


  // ----------------------------------------------------------
  // ENVIRONMENT
  // ----------------------------------------------------------

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


  // ----------------------------------------------------------
  // AUTHORIZATION
  // ----------------------------------------------------------

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
    authorization.slice(7).trim();


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


  // ----------------------------------------------------------
  // VERIFY USER
  // ----------------------------------------------------------

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


  // ----------------------------------------------------------
  // BODY
  // ----------------------------------------------------------

  const body =
    req.body &&
    typeof req.body === "object"
      ? req.body
      : {};


  // ==========================================================
  // FRONTEND REFUND ACTION
  // ==========================================================
  //
  // This is used when the browser gets a network-level error
  // and therefore cannot know whether the original request
  // reached the backend.
  //
  // IMPORTANT:
  // The existing refund_search Supabase RPC does not expose
  // an idempotency key, so this endpoint should only be called
  // by the frontend for a request that received NO HTTP response.
  //
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


  // ----------------------------------------------------------
  // REQUEST
  // ----------------------------------------------------------

  const request =
    normalizeRequest(body);


  if (
    !request.naturalLanguage &&
    Object.values(request.filters)
      .every(value =>
        Array.isArray(value)
          ? value.length === 0
          : !text(value)
      )
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


  // ----------------------------------------------------------
  // SEARCH CONSUMPTION STATE
  // ----------------------------------------------------------

  let searchConsumed = false;
  let searchRefunded = false;

  let refundResult = null;


  // ----------------------------------------------------------
  // REFUND ONCE FOR THIS REQUEST
  // ----------------------------------------------------------

  async function refundOnce() {
    if (
      !searchConsumed ||
      searchRefunded
    ) {
      return refundResult;
    }

    searchRefunded = true;

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


    if (!usage.allowed) {
      return sendJson(
        res,
        429,
        {
          error:
            "Denný limit 5 vyhľadávaní bol dosiahnutý.",

          remaining:
            Number.isFinite(
              Number(usage.remaining)
            )
              ? Number(usage.remaining)
              : 0
        }
      );
    }


    // The search has now actually consumed
    // one daily search.
    searchConsumed = true;


    // ========================================================
    // PROVIDER 1: GROQ
    // ========================================================

    let cars = null;
    let groqError = null;

    try {
      cars =
        await callGroq(
          request
        );
    } catch (error) {
      groqError = error;

      console.error(
        "Groq completely failed:",
        error?.message || error
      );
    }


    // ========================================================
    // PROVIDER 2: OPENROUTER
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
          error?.message || error
        );
      }
    }


    // ========================================================
    // ALL AI PROVIDERS FAILED
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
            Number(usage.remaining)
          )
            ? Number(usage.remaining)
            : null
      }
    );


  } catch (error) {
    // ========================================================
    // IMPORTANT:
    // Any unexpected server error AFTER use_search()
    // is now refunded.
    // ========================================================

    console.error(
      "CARMATCH AI backend error:",
      error?.message || error
    );


    let refund = null;

    if (searchConsumed) {
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