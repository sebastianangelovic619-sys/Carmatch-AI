// ============================================================
// CARMATCH AI - FINAL BACKEND v4
// Supabase anonymous auth + 5 searches/day
// Groq Compound live web research
// Groq Compound Mini fallback
// Multiple OpenRouter FREE fallbacks
// Automatic provider switching
// Search refund when every provider fails
// Server-side vehicle photo search with multiple candidates
// Wikimedia Commons + Wikipedia fallback
// ============================================================

const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const OPENROUTER_URL =
  "https://openrouter.ai/api/v1/chat/completions";

const WIKIMEDIA_API =
  "https://commons.wikimedia.org/w/api.php";

const WIKIPEDIA_API =
  "https://en.wikipedia.org/w/api.php";

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

const WIKIMEDIA_TIMEOUT = 7000;
const WIKIPEDIA_TIMEOUT = 7000;

const MAX_IMAGE_CANDIDATES = 6;


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

function sendJson(res, status, data) {
  return res.status(status).json(data);
}


// ============================================================
// SAFE TEXT
// ============================================================

function text(value, maxLength = 5000) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replace(/\u0000/g, "")
    .slice(0, maxLength);
}


// ============================================================
// SAFE ARRAY
// ============================================================

function arrayText(value, maxItems = 10) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(item => text(item, 500))
    .filter(Boolean)
    .slice(0, maxItems);
}


// ============================================================
// JSON EXTRACTION
// ============================================================

function parseAIJson(raw) {
  if (!raw) {
    throw new Error("AI returned an empty response");
  }

  let value = String(raw).trim();

  value = value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(value);
  } catch (_) {}

  const firstBrace = value.indexOf("{");
  const lastBrace = value.lastIndexOf("}");

  if (
    firstBrace !== -1 &&
    lastBrace !== -1 &&
    lastBrace > firstBrace
  ) {
    const extracted = value.slice(
      firstBrace,
      lastBrace + 1
    );

    try {
      return JSON.parse(extracted);
    } catch (_) {}
  }

  throw new Error("AI returned invalid JSON");
}


// ============================================================
// SUPABASE USER VERIFICATION
// ============================================================

async function verifyUser(accessToken) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Supabase environment variables are missing"
    );
  }

  if (!accessToken) {
    return null;
  }

  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    10000
  );

  try {
    const response = await fetch(
      `${SUPABASE_URL}/auth/v1/user`,
      {
        method: "GET",

        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`
        },

        signal: controller.signal
      }
    );

    if (!response.ok) {
      return null;
    }

    const user = await response.json();

    if (!user || !user.id) {
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
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    10000
  );

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/${functionName}`,
      {
        method: "POST",

        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization:
            `Bearer ${accessToken}`,

          "Content-Type": "application/json",

          Accept: "application/json"
        },

        body: "{}",

        signal: controller.signal
      }
    );

    const raw = await response.text();

    let data;

    try {
      data = JSON.parse(raw);
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

async function useSearch(accessToken) {
  const result = await callSupabaseRPC(
    "use_search",
    accessToken
  );

  if (!result || result.allowed !== true) {
    return {
      allowed: false,
      remaining: 0
    };
  }

  return {
    allowed: true,

    remaining: Number.isFinite(
      Number(result.remaining)
    )
      ? Number(result.remaining)
      : 0
  };
}


// ============================================================
// REFUND SEARCH
// ============================================================

async function refundSearch(accessToken) {
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

function normalizeRequest(body) {
  const filters =
    body &&
    typeof body.filters === "object" &&
    body.filters !== null
      ? body.filters
      : {};

  return {
    naturalLanguage: text(
      body?.naturalLanguage,
      3000
    ),

    filters: {
      budget: text(filters.budget, 100),
      seats: text(filters.seats, 100),
      power: text(filters.power, 100),
      trunk: text(filters.trunk, 100),
      drive: text(filters.drive, 100),
      fuel: text(filters.fuel, 100),
      body: text(filters.body, 100),
      style: text(filters.style, 100),
      length: text(filters.length, 100),
      year: text(filters.year, 100),
      avoid: text(filters.avoid, 500)
    }
  };
}


// ============================================================
// LANGUAGE
// ============================================================

function detectLanguage(request) {
  const content =
    `${request.naturalLanguage} ${
      JSON.stringify(request.filters)
    }`.toLowerCase();

  const slovak = [
    "chcem",
    "potrebujem",
    "auto",
    "autá",
    "vozidlo",
    "rozpočet",
    "sedadlá",
    "kufor",
    "výkon",
    "pohon",
    "benzín",
    "nafta",
    "elektrické",
    "elektromobil",
    "hybrid",
    "rok",
    "nové",
    "najnovšie",
    "lacné",
    "športové",
    "luxusné",
    "diesel",
    "benzínové",
    "plug-in",
    "pohon všetkých kolies",
    "štvorkolka"
  ];

  const count = slovak.filter(
    word => content.includes(word)
  ).length;

  return count > 0 ? "Slovak" : "English";
}


// ============================================================
// MARKET
// ============================================================

function detectMarket(request) {
  const content =
    `${request.naturalLanguage} ${
      JSON.stringify(request.filters)
    }`.toLowerCase();

  if (
    content.includes("slovensko") ||
    content.includes("slovakia") ||
    content.includes("eur") ||
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
// PROMPT
// ============================================================

function buildPrompt(request) {
  const language = detectLanguage(request);
  const market = detectMarket(request);

  return `
You are CARMATCH AI, a professional automotive research assistant.

TODAY:
${currentDate()}

TARGET MARKET:
${market}

RESPONSE LANGUAGE:
${language}

USER REQUEST:
${request.naturalLanguage || "No text request."}

FILTERS:
${JSON.stringify(request.filters, null, 2)}

============================================================
MAIN TASK
============================================================

Find EXACTLY 3 real production vehicles that match the user's
requirements as closely as possible.

You MUST perform current web research before answering whenever
web research tools are available.

Use current information.

Do not rely only on old internal knowledge.

============================================================
IMPORTANT
============================================================

Never invent a vehicle.

Never invent a current price.

Never invent a URL.

Never mix generations.

Never mix facelift versions incorrectly.

Never recommend concept cars unless explicitly requested.

If exact current information cannot be verified, clearly indicate
that it could not be verified.

============================================================
SOURCE PRIORITY
============================================================

1. Official manufacturer website
2. Official regional manufacturer website
3. Official configurator
4. Official price list
5. Reliable automotive publication

============================================================
CURRENT PRICE
============================================================

Prefer the current official price for the target market.

Use:

"€XX XXX"

or

"Od €XX XXX"

If it cannot be verified:

"Cena na vyžiadanie"

priceSource must contain the source URL when available.

============================================================
CURRENT MODEL
============================================================

If the user asks for newest/current/2026/2027:

Prefer the newest currently sold or officially announced
production generation relevant to the target market.

Do not invent future availability.

============================================================
IMAGE
============================================================

Return an image URL only when you have a reliable URL representing
the exact vehicle/generation.

Prefer official manufacturer media images.

Never use:

- brand logo
- unrelated vehicle
- old generation
- random stock image
- different facelift

If an exact image URL cannot be verified:

image = ""

============================================================
CONFIGURATOR
============================================================

configurator must be an official manufacturer URL only.

If unavailable:

configurator = ""

============================================================
FILTERS
============================================================

Respect ALL filters.

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
FILTER LOGIC
============================================================

Strong user requirements must not be ignored.

If the user requests 2 seats + high power + sports car,
do not recommend a normal 5-seat family vehicle.

If the user requests a large trunk,
do not recommend a vehicle with a small trunk just because it is
popular.

If the user requests AWD/4x4,
prefer actual AWD/4WD vehicles.

If brands are listed under Avoid,
do not recommend those brands.

============================================================
MAINTENANCE
============================================================

Give a realistic short maintenance description.

Mention relevant factors such as:

- servicing complexity
- performance-car maintenance
- hybrid complexity
- EV battery considerations
- expensive brakes
- expensive tyres
- drivetrain complexity

Do not invent exact annual maintenance costs.

============================================================
SCORING
============================================================

score represents how closely the vehicle matches the user's stated
requirements.

It is NOT a review score.

It must be a number from 0 to 100.

============================================================
OUTPUT
============================================================

Return ONLY valid JSON.

No markdown.

No code fences.

No explanation outside JSON.

Exact structure:

{
  "cars": [
    {
      "name": "",
      "generation": "",
      "year": 2026,
      "score": 95,
      "price": "",
      "power": "",
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
      "priceSource": "",
      "dataSources": []
    }
  ]
}

Exactly 3 cars.

year must be a number.

seats must be a number.

score must be a number from 0 to 100.

pros and cons must be arrays.

dataSources must contain URLs or identifiable source names.

MOST IMPORTANT:

Research current information first whenever web tools are available.

Never invent prices.

Never invent URLs.

Never mix generations.
`;
}


// ============================================================
// NORMALIZE ONE CAR
// ============================================================

function normalizeCar(car) {
  if (!car || typeof car !== "object") {
    throw new Error("Invalid vehicle object");
  }

  const result = {
    name: text(car.name, 200),

    generation: text(
      car.generation,
      300
    ),

    year: Number(car.year),

    score: Number(car.score),

    price: text(car.price, 150),

    power: text(car.power, 150),

    seats: Number(car.seats),

    trunk: text(car.trunk, 150),

    drive: text(car.drive, 150),

    fuel: text(car.fuel, 150),

    reason: text(car.reason, 1500),

    pros: arrayText(car.pros),

    cons: arrayText(car.cons),

    maintenance: text(
      car.maintenance,
      1500
    ),

    image: text(car.image, 2000),

    photoSource: text(
      car.photoSource,
      2000
    ),

    configurator: text(
      car.configurator,
      2000
    ),

    priceSource: text(
      car.priceSource,
      2000
    ),

    dataSources: arrayText(
      car.dataSources,
      10
    ),

    imageCandidates: []
  };

  if (!result.name) {
    throw new Error("Vehicle name missing");
  }

  if (!result.generation) {
    throw new Error(
      `Generation missing for ${result.name}`
    );
  }

  if (
    !Number.isFinite(result.year) ||
    result.year < 2000 ||
    result.year > 2100
  ) {
    throw new Error(
      `Invalid model year for ${result.name}`
    );
  }

  if (!Number.isFinite(result.score)) {
    result.score = 0;
  }

  result.score = Math.max(
    0,
    Math.min(
      100,
      Math.round(result.score)
    )
  );

  if (
    !Number.isFinite(result.seats) ||
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

function validateCars(data) {
  if (!data || !Array.isArray(data.cars)) {
    throw new Error(
      "AI response does not contain cars"
    );
  }

  if (data.cars.length !== 3) {
    throw new Error(
      `AI returned ${data.cars.length} cars instead of 3`
    );
  }

  return data.cars.map(normalizeCar);
}


// ============================================================
// FETCH WITH TIMEOUT
// ============================================================

async function fetchWithTimeout(
  url,
  options = {},
  timeout = 30000
) {
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    timeout
  );

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
// IMAGE SEARCH HELPERS
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
  "concept"
];


function isRejectedImageTitle(title) {
  const lower =
    String(title || "").toLowerCase();

  return IMAGE_REJECT_WORDS.some(
    word => lower.includes(word)
  );
}


// ============================================================
// IMAGE URL VALIDATION
// ============================================================

function isWikimediaPhotoURL(url) {
  if (!url || typeof url !== "string") {
    return false;
  }

  try {
    const parsed = new URL(url);

    if (parsed.protocol !== "https:") {
      return false;
    }

    return (
      parsed.hostname === "upload.wikimedia.org" ||
      parsed.hostname.endsWith(".wikimedia.org") ||
      parsed.hostname.endsWith(".wikipedia.org")
    );
  } catch (_) {
    return false;
  }
}


function isHttpsURL(url) {
  if (!url || typeof url !== "string") {
    return false;
  }

  try {
    return new URL(url).protocol === "https:";
  } catch (_) {
    return false;
  }
}


// ============================================================
// CLEAN IMAGE SEARCH TEXT
// ============================================================

function cleanSearchText(value) {
  return String(value || "")
    .replace(/[,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


// ============================================================
// IMAGE SEARCH QUERIES
// ============================================================

function buildImageSearchQueries(car) {
  const name =
    cleanSearchText(
      text(car.name, 200)
    );

  const generation =
    cleanSearchText(
      text(car.generation, 200)
    );

  const year =
    Number(car.year);

  const queries = [];

  if (
    name &&
    generation &&
    Number.isFinite(year)
  ) {
    queries.push(
      `${name} ${generation} ${year}`
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

  if (
    name &&
    Number.isFinite(year)
  ) {
    queries.push(
      `${name} ${year}`
    );
  }

  if (name) {
    queries.push(
      `${name} car`
    );

    queries.push(
      name
    );
  }

  return [
    ...new Set(queries)
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
    String(candidate.title || "")
      .toLowerCase();

  const query =
    String(candidate.query || "")
      .toLowerCase();

  const name =
    cleanSearchText(car.name)
      .toLowerCase();

  const generation =
    cleanSearchText(car.generation)
      .toLowerCase();

  const year =
    String(car.year || "");

  let score = 0;

  const nameWords =
    name
      .split(
        /[^a-z0-9áäčďéíľĺňóôŕšťúýž-]+/i
      )
      .filter(
        word => word.length >= 3
      );

  const generationWords =
    generation
      .split(
        /[^a-z0-9áäčďéíľĺňóôŕšťúýž-]+/i
      )
      .filter(
        word => word.length >= 2
      );

  for (const word of nameWords) {
    if (
      title.includes(word) ||
      query.includes(word)
    ) {
      score += 5;
    }
  }

  for (const word of generationWords) {
    if (
      title.includes(word) ||
      query.includes(word)
    ) {
      score += 8;
    }
  }

  if (
    year &&
    title.includes(year)
  ) {
    score += 10;
  }

  if (
    title.includes("car") ||
    title.includes("automobile")
  ) {
    score += 2;
  }

  if (candidate.queryIndex === 0) {
    score += 8;
  } else if (candidate.queryIndex === 1) {
    score += 5;
  }

  return score;
}


// ============================================================
// DEDUPLICATE IMAGE CANDIDATES
// ============================================================

function dedupeImageCandidates(
  candidates,
  car
) {
  const map = new Map();

  for (const candidate of candidates) {
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

    const key =
      candidate.image;

    if (!map.has(key)) {
      map.set(
        key,
        {
          ...candidate,

          relevance:
            imageRelevanceScore(
              candidate,
              car
            )
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
// WIKIMEDIA COMMONS SEARCH
// ============================================================

async function searchWikimediaImages(
  query,
  queryIndex = 0
) {
  const params =
    new URLSearchParams({
      action: "query",

      generator: "search",

      gsrsearch: query,

      gsrnamespace: "6",

      gsrlimit: "10",

      prop: "imageinfo",

      iiprop:
        "url|mime|dimensions|descriptionurl",

      iiurlwidth: "1400",

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
            "CARMATCHAI/2.0 (vehicle image lookup)"
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

  for (const page of pages) {
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
      ).startsWith("image/")
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
      Number.isFinite(height) &&
      (
        width < 400 ||
        height < 250
      )
    ) {
      continue;
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
      image: imageUrl,

      photoSource:
        imageInfo.descriptionurl ||
        `https://commons.wikimedia.org/wiki/${encodeURIComponent(
          title.replace(
            / /g,
            "_"
          )
        )}`,

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

      srlimit: "8",

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
            "CARMATCHAI/2.0 (vehicle image lookup)"
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
    !Array.isArray(results) ||
    results.length === 0
  ) {
    return [];
  }

  const titles =
    results
      .slice(0, 8)
      .map(
        item => item?.title
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

      prop: "pageimages|info",

      inprop: "url",

      piprop: "thumbnail",

      pithumbsize: "1400",

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
            "CARMATCHAI/2.0 (vehicle image lookup)"
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

  for (const page of pages) {
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
      image: thumbnail,

      photoSource:
        page?.fullurl ||
        `https://en.wikipedia.org/wiki/${encodeURIComponent(
          title.replace(
            / /g,
            "_"
          )
        )}`,

      title,

      query,

      queryIndex
    });
  }

  return candidates;
}


// ============================================================
// FIND MULTIPLE PHOTOS FOR ONE VEHICLE
// ============================================================

async function findCarImages(car) {
  const candidates = [];

  // Preserve an already supplied HTTPS image from the AI.
  if (
    isHttpsURL(
      car.image
    )
  ) {
    candidates.push({
      image: car.image,

      photoSource:
        car.photoSource ||
        "AI-provided image URL",

      title:
        car.name,

      query: "AI",

      queryIndex: -1,

      relevance: 1000
    });
  }

  const queries =
    buildImageSearchQueries(
      car
    );

  // Search Commons queries in parallel.
  const commonsResults =
    await Promise.allSettled(
      queries.map(
        (query, index) =>
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
    } else {
      console.warn(
        `CARMATCH AI Wikimedia image search failed for ${car.name}:`,
        result.reason?.message ||
          result.reason
      );
    }
  }

  let deduped =
    dedupeImageCandidates(
      candidates,
      car
    );

  // Keep a valid AI supplied image as the first candidate.
  const aiCandidate =
    candidates.find(
      candidate =>
        candidate?.query === "AI" &&
        isHttpsURL(
          candidate?.image
        )
    );

  if (aiCandidate) {
    const withoutAI =
      deduped.filter(
        candidate =>
          candidate.image !==
          aiCandidate.image
      );

    deduped = [
      {
        ...aiCandidate,
        relevance: 1000
      },

      ...withoutAI
    ].slice(
      0,
      MAX_IMAGE_CANDIDATES
    );
  }

  // Wikipedia is used when Commons gave us nothing.
  if (
    deduped.length === 0
  ) {
    const wikipediaResults =
      await Promise.allSettled(
        queries.map(
          (query, index) =>
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
      } else {
        console.warn(
          `CARMATCH AI Wikipedia image search failed for ${car.name}:`,
          result.reason?.message ||
            result.reason
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
// ADD PHOTOS TO ALL THREE CARS
// ============================================================

async function addCarImages(cars) {
  return Promise.all(
    cars.map(
      car =>
        findCarImages(car)
    )
  );
}


// ============================================================
// GROQ REQUEST
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

              content:
                "You are CARMATCH AI. Perform current automotive web research when web tools are available. Return ONLY valid JSON matching the requested structure."
            },

            {
              role: "user",

              content:
                buildPrompt(request)
            }
          ],

          temperature: 0.1,

          max_completion_tokens:
            12000,

          response_format: {
            type: "json_object"
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
      `Groq ${model} HTTP ${response.status}: ${raw.slice(0, 500)}`
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

  const message =
    apiData?.choices?.[0]?.message;

  const content =
    message?.content;

  if (!content) {
    throw new Error(
      `Groq ${model} returned empty content`
    );
  }

  const parsed =
    parseAIJson(content);

  const validatedCars =
    validateCars(parsed);

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
// OPENROUTER SINGLE MODEL
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

Return ONLY valid JSON.

You are a fallback provider.

Do NOT invent current prices.

Do NOT invent image URLs.

Do NOT invent official configurator URLs.

If current information cannot be verified,
use "Cena na vyžiadanie" for price or an empty string
for URLs.

Always return exactly 3 real production vehicles.

Follow every user filter.
`
            },

            {
              role: "user",

              content:
                buildPrompt(request)
            }
          ],

          temperature: 0.1,

          max_tokens: 10000,

          response_format: {
            type: "json_object"
          }
        })
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
    apiData?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error(
      `OpenRouter ${model} returned empty content`
    );
  }

  const parsed =
    parseAIJson(content);

  const validatedCars =
    validateCars(parsed);

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
// OPENROUTER MULTI-MODEL FALLBACK
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
      console.error(
        "CARMATCH AI: No AI API key configured"
      );

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
    // PROVIDER STATUS
    // ========================================================

    let result = null;

    let groqFailed = false;

    let openRouterFailed = false;

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
    // 2. OPENROUTER FREE
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
        openRouterFailed = true;

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