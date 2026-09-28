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
      `${