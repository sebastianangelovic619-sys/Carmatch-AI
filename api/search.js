
"use strict";

/* ============================================================
   CARMATCH AI - SEARCH API FINAL
   Vercel ES Module
   Supabase Auth + RPC + Groq + OpenRouter
   Exactly 3 cars + Wikipedia/Wikimedia images
   ============================================================ */

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";

const SUPABASE_URL = String(
  process.env.SUPABASE_URL || ""
).trim().replace(/\/+$/, "");

const SUPABASE_PUBLIC_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

const AUTH_TIMEOUT = 8000;
const IMAGE_TIMEOUT = 8000;
const MAX_IMAGES = 8;
const MAX_CARS = 3;
const DAILY_LIMIT = 5;

const PROVIDERS = [
  {
    name: "groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: "openai/gpt-oss-120b",
    timeout: 55000
  },
  {
    name: "groq-mini",
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: "openai/gpt-oss-20b",
    timeout: 45000
  }
];

const OPENROUTER_MODELS = [
  "qwen/qwen3.5-397b-a17b",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "openrouter/free"
];

/* ============================================================
   BASIC HELPERS
   ============================================================ */

function json(res, status, data) {
  return res.status(status).json(data);
}

function clean(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
}

function nullableNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function isValidUrl(value) {
  try {
    const url = new URL(value);

    return (
      url.protocol === "http:" ||
      url.protocol === "https:"
    );
  } catch (_) {
    return false;
  }
}

function normalizeUrl(value) {
  let url = clean(value);

  if (!url) {
    return "";
  }

  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  return isValidUrl(url) ? url : "";
}

function hpFromKw(kw) {
  const value = Number(kw);

  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.round(value * 1.35962);
}

function kwFromHp(hp) {
  const value = Number(hp);

  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.round((value / 1.35962) * 10) / 10;
}

/* ============================================================
   REQUEST BODY
   ============================================================ */

function getRequestBody(req) {
  const body = req?.body;

  if (body === undefined || body === null) {
    return {};
  }

  if (
    typeof body === "object" &&
    !Buffer.isBuffer(body)
  ) {
    return body;
  }

  const raw = Buffer.isBuffer(body)
    ? body.toString("utf8")
    : String(body);

  const trimmed = raw.trim();

  if (!trimmed) {
    return {};
  }

  try {
    const parsed = JSON.parse(trimmed);

    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch (_) {
    // Non-JSON body handled below.
  }

  return { text: trimmed };
}

/* ============================================================
   FILTERS
   ============================================================ */

function filtersToText(filters) {
  if (!filters || typeof filters !== "object") {
    return "";
  }

  const parts = [];

  function add(label, value, suffix = "") {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      parts.push(
        `${label}: ${String(value).trim()}${suffix}`
      );
    }
  }

  add("maximálny rozpočet", filters.budget, " €");
  add("počet sedadiel", filters.seats);
  add("minimálny výkon", filters.power, " kW");
  add("minimálny kufor", filters.trunk, " l");
  add("pohon", filters.drive);
  add("palivo", filters.fuel);
  add("karoséria", filters.body);
  add("štýl", filters.style);
  add("maximálna dĺžka", filters.length, " m");
  add("minimálny modelový rok", filters.year);
  add("vynechať značky", filters.avoid);

  return parts.join("; ");
}

/* ============================================================
   USER QUERY
   ============================================================ */

function getUserQuery(req) {
  const body = getRequestBody(req);
  const query = req?.query || {};

  const candidates = [
    body.naturalLanguage,
    body.natural_language,
    body.query,
    body.search,
    body.prompt,
    body.text,
    body.userQuery,
    body.user_query,
    body.input,
    body.message,
    body.requirements,
    body.carQuery,
    body.car_query,
    body.request,

    query.naturalLanguage,
    query.natural_language,
    query.query,
    query.search,
    query.prompt,
    query.text,
    query.userQuery,
    query.user_query,
    query.input,
    query.message
  ];

  let naturalLanguage = "";

  for (const value of candidates) {
    const cleaned = clean(value);

    if (cleaned) {
      naturalLanguage = cleaned;
      break;
    }
  }

  const filterText = filtersToText(body.filters);

  if (naturalLanguage && filterText) {
    return `${naturalLanguage}

Doplňujúce filtre: ${filterText}`;
  }

  if (naturalLanguage) {
    return naturalLanguage;
  }

  if (filterText) {
    return (
      "Používateľ nezadal voľný text. " +
      `Vyber auto podľa týchto filtrov: ${filterText}`
    );
  }

  if (typeof req?.body === "string") {
    const plain = req.body.trim();

    if (
      plain &&
      !plain.startsWith("{") &&
      !plain.startsWith("[")
    ) {
      return plain;
    }
  }

  return "";
}

/* ============================================================
   SUPABASE AUTH
   ============================================================ */

function getBearerToken(req) {
  const raw =
    req?.headers?.authorization ||
    req?.headers?.Authorization ||
    "";

  const match = String(raw).match(/^Bearer\s+(.+)$/i);

  return match ? match[1].trim() : "";
}

function isSupabaseUrl(url) {
  try {
    const parsed = new URL(url);

    return (
      parsed.protocol === "https:" &&
      parsed.hostname.endsWith(".supabase.co")
    );
  } catch (_) {
    return false;
  }
}

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

async function verifySupabaseAccessToken(req) {
  const token = getBearerToken(req);

  if (!token) {
    return {
      ok: false,
      status: 401,
      code: "missing_token",
      error: "Chýba Supabase access token."
    };
  }

  if (!SUPABASE_URL || !isSupabaseUrl(SUPABASE_URL)) {
    return {
      ok: false,
      status: 500,
      code: "bad_supabase_url",
      error: "SUPABASE_URL nie je správne nastavená."
    };
  }

  if (!SUPABASE_PUBLIC_KEY) {
    return {
      ok: false,
      status: 500,
      code: "missing_supabase_key",
      error: "Na serveri chýba Supabase publishable/anon key."
    };
  }

  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    AUTH_TIMEOUT
  );

  try {
    const response = await fetch(
      `${SUPABASE_URL}/auth/v1/user`,
      {
        method: "GET",

        headers: {
          apikey: SUPABASE_PUBLIC_KEY,
          Authorization: `Bearer ${token}`,
          Accept: "application/json"
        },

        cache: "no-store",
        signal: controller.signal
      }
    );

    const raw = await response.text();

    let data = null;

    try {
      data = raw ? JSON.parse(raw) : null;
    } catch (_) {
      data = null;
    }

    if (
      response.status === 401 ||
      response.status === 403
    ) {
      return {
        ok: false,
        status: 401,
        code: "invalid_token",
        error: "Supabase access token je neplatný alebo expirovaný."
      };
    }

    if (!response.ok) {
      console.error(
        "CARMATCH AI: Supabase Auth verification failed",
        {
          status: response.status,
          response: data || raw.slice(0, 500)
        }
      );

      return {
        ok: false,
        status: 500,
        code: "auth_server_error",
        error:
          "Supabase Auth odmietol overenie. Skontroluj, " +
          "či SUPABASE_URL a Supabase kľúč patria k rovnakému projektu."
      };
    }

    const userId = clean(data?.id || data?.user?.id);

    if (!looksLikeUuid(userId)) {
      console.error(
        "CARMATCH AI: Supabase Auth returned no valid user id"
      );

      return {
        ok: false,
        status: 500,
        code: "missing_user_id",
        error: "Supabase Auth nevrátil platné ID používateľa."
      };
    }

    return {
      ok: true,
      userId,
      user: data,
      accessToken: token
    };
  } catch (error) {
    console.error(
      "CARMATCH AI: Supabase Auth request failed",
      error?.message || error
    );

    return {
      ok: false,
      status: 500,
      code:
        error?.name === "AbortError"
          ? "auth_timeout"
          : "auth_network_error",

      error:
        error?.name === "AbortError"
          ? "Supabase Auth server neodpovedal včas."
          : "Nepodarilo sa spojiť so Supabase Auth serverom."
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ============================================================
   SUPABASE RPC
   IMPORTANT:
   - apikey = public/publishable key
   - Authorization = verified user's access token
   - auth.uid() in PostgreSQL can identify the user
   ============================================================ */

async function supabaseRpc(
  functionName,
  payload,
  accessToken
) {
  if (
    !SUPABASE_URL ||
    !SUPABASE_PUBLIC_KEY ||
    !accessToken
  ) {
    return {
      ok: false,
      status: 500,
      error: "Supabase RPC configuration missing"
    };
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(functionName)}`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          apikey: SUPABASE_PUBLIC_KEY,
          Authorization: `Bearer ${accessToken}`
        },

        body: JSON.stringify(payload || {}),
        cache: "no-store"
      }
    );

    const raw = await response.text();

    let data = null;

    try {
      data = raw ? JSON.parse(raw) : null;
    } catch (_) {
      data = raw;
    }

    if (!response.ok) {
      console.error(
        `CARMATCH AI: RPC ${functionName} failed`,
        {
          status: response.status,
          error: data
        }
      );

      return {
        ok: false,
        status: response.status,
        error: data
      };
    }

    return {
      ok: true,
      status: response.status,
      data
    };
  } catch (error) {
    console.error(
      `CARMATCH AI: RPC ${functionName} request failed`,
      error?.message || error
    );

    return {
      ok: false,
      status: 0,
      error: error?.message || "Supabase request failed"
    };
  }
}

/* ============================================================
   RPC RESULT HELPERS
   ============================================================ */

function chargeAllowed(data) {
  if (data === false) {
    return false;
  }

  if (typeof data === "number" && data < 0) {
    return false;
  }

  if (data && typeof data === "object") {
    const deniedKeys = [
      "allowed",
      "success",
      "ok",
      "can_search",
      "canSearch"
    ];

    for (const key of deniedKeys) {
      if (data[key] === false) {
        return false;
      }
    }
  }

  return true;
}

function extractRemaining(data) {
  if (typeof data === "number" && data >= 0) {
    return Math.round(data);
  }

  if (!data || typeof data !== "object") {
    return null;
  }

  const keys = [
    "remaining",
    "searches_remaining",
    "remaining_searches",
    "remainingSearches",
    "left"
  ];

  for (const key of keys) {
    const number = Number(data[key]);

    if (Number.isFinite(number) && number >= 0) {
      return Math.round(number);
    }
  }

  return null;
}

async function tryRpcFunctionNames(
  functionNames,
  payloads,
  accessToken
) {
  for (const functionName of functionNames) {
    for (const payload of payloads) {
      const result = await supabaseRpc(
        functionName,
        payload,
        accessToken
      );

      if (result.ok) {
        return {
          ...result,
          functionName,
          payload
        };
      }
    }
  }

  return {
    ok: false
  };
}

/* ============================================================
   CHARGE SEARCH
   Current SQL signature:
   increment_search(
     daily_limit integer DEFAULT 5,
     max_searches integer DEFAULT 5
   )

   The verified user's JWT is sent with every RPC request.
   The database function should identify the user using auth.uid().
   ============================================================ */

async function chargeSearch(userId, accessToken) {
  const result = await tryRpcFunctionNames(
    [
      "increment_search",
      "use_search",
      "consume_search"
    ],

    [
      {
        daily_limit: DAILY_LIMIT,
        max_searches: DAILY_LIMIT
      },
      {},
      {
        p_user_id: userId
      },
      {
        user_id: userId
      }
    ],

    accessToken
  );

  if (!result.ok) {
    return {
      ok: false,
      limited: false,
      error: "Search usage function unavailable"
    };
  }

  const allowed = chargeAllowed(result.data);

  return {
    ok: allowed,
    limited: !allowed,
    functionName: result.functionName,
    data: result.data,
    remaining: extractRemaining(result.data)
  };
}

/* ============================================================
   REFUND SEARCH
   Requires a matching refund RPC to exist in Supabase.
   ============================================================ */

async function refundSearch(userId, accessToken) {
  const result = await tryRpcFunctionNames(
    [
      "refund_search",
      "refund_search_usage",
      "decrement_search"
    ],

    [
      {},
      {
        p_user_id: userId
      },
      {
        user_id: userId
      }
    ],

    accessToken
  );

  if (result.ok) {
    return {
      ok: true,
      functionName: result.functionName,
      data: result.data
    };
  }

  console.error(
    "CARMATCH AI: no refund RPC succeeded"
  );

  return {
    ok: false
  };
}

/* ============================================================
   IMAGE FILTERING
   ============================================================ */

function rejectedImageUrl(url) {
  const value = String(url || "").toLowerCase();

  const blocked = [
    "logo",
    "interior",
    "dashboard",
    "concept",
    "render",
    "truck",
    "bus",
    "motorcycle",
    "motorbike",
    "wallpaper",
    "sketch",
    "blueprint",
    "icon",
    "badge",
    "emblem"
  ];

  return blocked.some(term => value.includes(term));
}

/* ============================================================
   TIMED FETCH
   ============================================================ */

async function timedFetch(
  url,
  options = {},
  timeout = IMAGE_TIMEOUT
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

/* ============================================================
   WIKIPEDIA IMAGE
   ============================================================ */

async function wikipediaImage(brand, model) {
  const title = encodeURIComponent(
    `${brand} ${model}`.trim()
  );

  const url =
    `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`;

  try {
    const response = await timedFetch(
      url,
      {
        headers: {
          "User-Agent": "CARMATCH-AI/1.0"
        }
      }
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const images = [];

    const candidates = [
      data?.originalimage?.source,
      data?.thumbnail?.source
    ];

    for (const image of candidates) {
      if (
        image &&
        isValidUrl(image) &&
        !rejectedImageUrl(image) &&
        !images.includes(image)
      ) {
        images.push(image);
      }
    }

    return images;
  } catch (_) {
    return [];
  }
}

/* ============================================================
   WIKIMEDIA COMMONS
   ============================================================ */

async function wikimediaImages(
  brand,
  model,
  generation,
  modelYear
) {
  const search = encodeURIComponent(
    `${brand} ${model} ${generation || ""} ${modelYear || ""}`.trim()
  );

  const url =
    "https://commons.wikimedia.org/w/api.php" +
    "?action=query" +
    "&generator=search" +
    `&gsrsearch=${search}` +
    "&gsrnamespace=6" +
    "&gsrlimit=20" +
    "&prop=imageinfo" +
    "&iiprop=url|extmetadata" +
    "&iiurlwidth=1600" +
    "&format=json" +
    "&origin=*";

  try {
    const response = await timedFetch(
      url,
      {
        headers: {
          "User-Agent": "CARMATCH-AI/1.0"
        }
      }
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json();

    const pages = data?.query?.pages
      ? Object.values(data.query.pages)
      : [];

    const images = [];

    for (const page of pages) {
      const info = page?.imageinfo?.[0];

      const imageUrl =
        info?.thumburl ||
        info?.url ||
        "";

      const title = clean(
        page?.title
      ).toLowerCase();

      const description = clean(
        info?.extmetadata?.ImageDescription?.value ||
        info?.extmetadata?.ObjectName?.value ||
        ""
      ).toLowerCase();

      if (
        !imageUrl ||
        !isValidUrl(imageUrl) ||
        rejectedImageUrl(imageUrl) ||
        rejectedImageUrl(title) ||
        rejectedImageUrl(description)
      ) {
        continue;
      }

      const haystack = `${title} ${description}`;
      const brandText = String(brand || "").toLowerCase();

      const brandOk = haystack.includes(brandText);

      const modelWords = String(model || "")
        .toLowerCase()
        .split(/\s+/)
        .map(word =>
          word.replace(/[^a-z0-9-]/g, "")
        )
        .filter(Boolean)
        .slice(0, 3);

      const modelOk =
        modelWords.length === 0 ||
        modelWords.some(word => haystack.includes(word));

      if (!brandOk || !modelOk) {
        continue;
      }

      if (!images.includes(imageUrl)) {
        images.push(imageUrl);
      }

      if (images.length >= MAX_IMAGES) {
        break;
      }
    }

    return images;
  } catch (_) {
    return [];
  }
}

/* ============================================================
   IMAGE CANDIDATES
   ============================================================ */

async function getImageCandidates(
  brand,
  model,
  generation,
  modelYear
) {
  const [wiki, commons] = await Promise.all([
    wikipediaImage(brand, model),
    wikimediaImages(
      brand,
      model,
      generation,
      modelYear
    )
  ]);

  const unique = [];

  for (const image of [...wiki, ...commons]) {
    if (
      !isValidUrl(image) ||
      rejectedImageUrl(image) ||
      unique.includes(image)
    ) {
      continue;
    }

    unique.push(image);

    if (unique.length >= MAX_IMAGES) {
      break;
    }
  }

  return unique;
}

/* ============================================================
   AI PROMPT
   ============================================================ */

function buildPrompt(userQuery) {
  return `You are CARMATCH AI, an automotive research assistant for a Slovak user.

USER REQUEST:
${userQuery}

TASK:
Return EXACTLY 3 real passenger cars that best match the request.

Prefer current European or Slovak-market information, the newest
available generation, current model years, official manufacturer
information and verifiable current prices.

STRICT RULES:

1. Return exactly 3 cars.
2. Cars must be real production passenger cars.
3. Never invent cars, specifications, prices or URLs.
4. Do not return concept cars unless explicitly requested.
5. Prefer currently produced models.
6. Give a numeric starting price in EUR when verifiable.
7. If a price is not reliably verifiable, use null.
8. priceSource must be an actual source URL when available.
9. officialUrl must be an actual official manufacturer URL when available.
10. Power must contain numeric kW and HP when known.
11. Use only kW and HP. Never use ks, k, koní or PS.
12. trunkLiters means normal boot capacity with normal seats in place.
13. Distinguish petrol, diesel, HEV, PHEV and EV correctly.
14. Keep modelYear separate from generation.
15. reason must explain why the car matches the request.
16. description should be useful and factual.
17. maintenance must not invent service intervals.
18. Include consumptionWltp only when reasonably verified.
19. Pros and cons must be factual.
20. score must be between 0 and 100.
21. Return ONLY valid JSON. No Markdown or text outside JSON.

JSON FORMAT:

{
  "cars": [
    {
      "rank": 1,
      "brand": "",
      "model": "",
      "modelYear": null,
      "generation": "",
      "category": "",
      "body": "",
      "trim": "",
      "fuel": "",
      "drivetrain": "",
      "transmission": "",
      "power": {
        "kw": null,
        "hp": null
      },
      "engine": "",
      "trunkLiters": null,
      "seats": null,
      "lengthMm": null,
      "consumptionWltp": "",
      "price": {
        "amount": null,
        "currency": "EUR",
        "type": "starting"
      },
      "priceSource": "",
      "officialUrl": "",
      "reason": "",
      "description": "",
      "maintenance": "",
      "pros": [],
      "cons": [],
      "score": 0
    }
  ]
}`;
}

/* ============================================================
   AI CALL
   ============================================================ */

async function callAI(provider, prompt) {
  let apiKey = "";

  const headers = {
    "Content-Type": "application/json"
  };

  if (
    provider.name === "groq" ||
    provider.name === "groq-mini"
  ) {
    apiKey = GROQ_API_KEY;
  }

  if (provider.name === "openrouter") {
    apiKey = OPENROUTER_API_KEY;

    headers["HTTP-Referer"] =
      "https://carmatchai.vercel.app";

    headers["X-Title"] = "CARMATCH AI";
  }

  if (!apiKey) {
    throw new Error(
      `${provider.name} API key missing`
    );
  }

  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    provider.timeout || 35000
  );

  try {
    const response = await fetch(
      provider.url,
      {
        method: "POST",

        headers: {
          ...headers,
          Authorization: `Bearer ${apiKey}`
        },

        signal: controller.signal,

        body: JSON.stringify({
          model: provider.model,

          messages: [
            {
              role: "system",
              content:
                "You are a precise automotive research assistant. Return valid JSON only."
            },
            {
              role: "user",
              content: prompt
            }
          ],

          temperature: 0.1,
          max_tokens: 7000
        })
      }
    );

    const raw = await response.text();

    if (!response.ok) {
      throw new Error(
        `${provider.name}: HTTP ${response.status} ${raw.slice(0, 500)}`
      );
    }

    let data;

    try {
      data = JSON.parse(raw);
    } catch (_) {
      throw new Error(
        `${provider.name}: invalid API JSON`
      );
    }

    const content =
      data?.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error(
        `${provider.name}: empty AI response`
      );
    }

    return content;
  } finally {
    clearTimeout(timer);
  }
}

/* ============================================================
   EXTRACT JSON
   ============================================================ */

function extractJson(value) {
  if (!value) {
    throw new Error("Empty AI result");
  }

  let cleaned = String(value).trim();

  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // Try extracting a JSON object below.
  }

  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");

  if (first >= 0 && last > first) {
    try {
      return JSON.parse(
        cleaned.slice(first, last + 1)
      );
    } catch (_) {
      // Handled below.
    }
  }

  throw new Error("AI returned invalid JSON");
}

/* ============================================================
   NORMALIZE CAR
   ============================================================ */

function normalizeCar(car, index) {
  const modelYear = nullableNumber(car?.modelYear);
  const trunkLiters = nullableNumber(car?.trunkLiters);
  const seats = nullableNumber(car?.seats);
  const lengthMm = nullableNumber(car?.lengthMm);

  const result = {
    rank: Number(car?.rank) || index + 1,

    brand: clean(car?.brand) || "Unknown",
    model: clean(car?.model) || "Unknown model",

    modelYear:
      modelYear !== null && modelYear > 0
        ? modelYear
        : null,

    generation: clean(car?.generation),
    category: clean(car?.category),
    body: clean(car?.body),
    trim: clean(car?.trim),
    fuel: clean(car?.fuel),
    drivetrain: clean(car?.drivetrain),

    drive: clean(
      car?.drivetrain || car?.drive
    ),

    transmission: clean(car?.transmission),

    power: {
      kw: null,
      hp: null
    },

    engine: clean(car?.engine),

    trunkLiters:
      trunkLiters !== null && trunkLiters >= 0
        ? trunkLiters
        : null,

    trunk:
      trunkLiters !== null && trunkLiters >= 0
        ? trunkLiters
        : null,

    seats:
      seats !== null && seats > 0
        ? seats
        : null,

    lengthMm:
      lengthMm !== null && lengthMm > 0
        ? lengthMm
        : null,

    consumptionWltp: clean(car?.consumptionWltp),

    price: {
      amount: null,
      currency: "EUR",
      type: "starting"
    },

    priceSource: normalizeUrl(car?.priceSource),
    officialUrl: normalizeUrl(car?.officialUrl),

    configurator: normalizeUrl(car?.officialUrl),

    reason: clean(car?.reason),
    description: clean(car?.description),
    maintenance: clean(car?.maintenance),

    pros: Array.isArray(car?.pros)
      ? car.pros
          .map(clean)
          .filter(Boolean)
          .slice(0, 5)
      : [],

    cons: Array.isArray(car?.cons)
      ? car.cons
          .map(clean)
          .filter(Boolean)
          .slice(0, 5)
      : [],

    score: Math.max(
      0,
      Math.min(
        100,
        Math.round(Number(car?.score) || 0)
      )
    ),

    images: [],
    imageCandidates: [],
    image: "",
    imageSource: "",
    photoSource: "",
    year:
      modelYear !== null && modelYear > 0
        ? modelYear
        : null,

    dataSources: []
  };

  const kw = nullableNumber(car?.power?.kw);
  const hp = nullableNumber(car?.power?.hp);

  if (kw !== null && kw > 0) {
    result.power.kw = Math.round(kw);
  }

  if (hp !== null && hp > 0) {
    result.power.hp = Math.round(hp);
  }

  if (
    result.power.kw === null &&
    result.power.hp !== null
  ) {
    result.power.kw = kwFromHp(result.power.hp);
  }

  if (
    result.power.hp === null &&
    result.power.kw !== null
  ) {
    result.power.hp = hpFromKw(result.power.kw);
  }

  const amount = nullableNumber(car?.price?.amount);

  if (amount !== null && amount > 0) {
    result.price.amount = Math.round(amount);
  }

  const currency = clean(car?.price?.currency);

  if (currency) {
    result.price.currency = currency.toUpperCase();
  }

  const priceType = clean(car?.price?.type);

  if (priceType) {
    result.price.type = priceType;
  }

  return result;
}

/* ============================================================
   VALIDATE CARS
   ============================================================ */

function validateCars(parsed) {
  if (
    !Array.isArray(parsed?.cars) ||
    parsed.cars.length < MAX_CARS
  ) {
    throw new Error(
      "AI nevrátila aspoň 3 vozidlá."
    );
  }

  const cars = parsed.cars
    .slice(0, MAX_CARS)
    .map((car, index) => normalizeCar(car, index));

  if (cars.length !== MAX_CARS) {
    throw new Error(
      "AI nevrátila presne 3 vozidlá."
    );
  }

  return cars;
}

/* ============================================================
   OPENROUTER FALLBACKS
   ============================================================ */

async function callOpenRouter(prompt) {
  for (const model of OPENROUTER_MODELS) {
    try {
      return await callAI(
        {
          name: "openrouter",
          url: "https://openrouter.ai/api/v1/chat/completions",
          model,
          timeout: 35000
        },
        prompt
      );
    } catch (error) {
      console.error(
        `CARMATCH AI: OpenRouter ${model} failed`,
        error?.message || error
      );
    }
  }

  throw new Error("All OpenRouter providers failed");
}

/* ============================================================
   PROVIDER FALLBACK LOGIC
   ============================================================ */

async function getCarsFromProviders(prompt) {
  const errors = [];

  for (const provider of PROVIDERS) {
    try {
      const raw = await callAI(provider, prompt);

      return validateCars(
        extractJson(raw)
      );
    } catch (error) {
      const message =
        `${provider.name}: ${error?.message || error}`;

      errors.push(message);

      console.error(
        "CARMATCH AI provider failed",
        message
      );
    }
  }

  try {
    const raw = await callOpenRouter(prompt);

    return validateCars(
      extractJson(raw)
    );
  } catch (error) {
    errors.push(
      `openrouter: ${error?.message || error}`
    );
  }

  throw new Error(
    errors.join(" | ").slice(0, 3000) ||
    "AI providers failed"
  );
}

/* ============================================================
   MAIN VERCEL HANDLER
   ============================================================ */

export default async function handler(req, res) {
  /* METHOD CHECK */

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return json(res, 405, {
      ok: false,
      error: "Method not allowed"
    });
  }

  /* USER REQUEST */

  const userQuery = getUserQuery(req);

  if (!userQuery) {
    return json(res, 400, {
      ok: false,
      error: "Zadajte požiadavky na auto."
    });
  }

  /* SUPABASE AUTHENTICATION */

  const auth = await verifySupabaseAccessToken(req);

  if (!auth.ok) {
    let publicError =
      "Supabase autentifikácia nie je správne nastavená na serveri.";

    if (auth.code === "missing_token") {
      publicError =
        "Supabase relácia chýba. Obnov stránku a skús znova.";
    }

    if (auth.code === "invalid_token") {
      publicError =
        "Supabase relácia je neplatná alebo expirovaná. Obnov stránku a skús znova.";
    }

    console.error("CARMATCH AI auth error", {
      code: auth.code,
      error: auth.error
    });

    return json(res, auth.status || 500, {
      ok: false,
      error: publicError
    });
  }

  /*
   * These values come from the verified Supabase session.
   * The API does not trust a user ID sent by the browser.
   */

  const userId = auth.userId;
  const accessToken = auth.accessToken;

  /* CHARGE ONE SEARCH */

  const charge = await chargeSearch(
    userId,
    accessToken
  );

  if (!charge.ok) {
    if (charge.limited) {
      return json(res, 429, {
        ok: false,
        error:
          "Denný limit 5 vyhľadávaní bol dosiahnutý.",
        remaining: 0
      });
    }

    console.error(
      "CARMATCH AI: chargeSearch failed",
      charge.error
    );

    return json(res, 500, {
      ok: false,
      error:
        "Nepodarilo sa overiť limit vyhľadávaní. Skontroluj Supabase RPC a databázové logy."
    });
  }

  /* AI SEARCH */

  try {
    const prompt = buildPrompt(userQuery);

    let cars = await getCarsFromProviders(prompt);

    /* IMAGE SEARCH */

    cars = await Promise.all(
      cars.map(async car => {
        const images = await getImageCandidates(
          car.brand,
          car.model,
          car.generation,
          car.modelYear
        );

        const imageCandidates = images.map(url => ({
          url,
          source: "https://commons.wikimedia.org/"
        }));

        const dataSources = [
          car.priceSource,
          car.officialUrl
        ]
          .filter(Boolean)
          .filter(
            (value, index, array) =>
              array.indexOf(value) === index
          );

        return {
          ...car,

          images,
          imageCandidates,

          image: images[0] || "",

          imageSource: images.length
            ? "Wikimedia / Wikipedia"
            : "",

          photoSource: images.length
            ? "https://commons.wikimedia.org/"
            : "",

          dataSources
        };
      })
    );

    /* SUCCESS */

    return json(res, 200, {
      ok: true,
      cars,

      remaining: charge.remaining,

      usage: {
        charged: true,
        remaining: charge.remaining
      }
    });
  } catch (error) {
    /* COMPLETE FAILURE -> ATTEMPT REFUND */

    console.error(
      "CARMATCH AI SEARCH ERROR:",
      error?.message || error
    );

    const refund = await refundSearch(
      userId,
      accessToken
    );

    if (!refund.ok) {
      console.error(
        "CARMATCH AI: refund failed; check refund RPC configuration"
      );
    }

    return json(res, 502, {
      ok: false,

      refunded: refund.ok,

      remaining: null,

      error: refund.ok
        ? "Vyhľadávanie sa nepodarilo dokončiť. Spotreba vyhľadávania bola vrátená."
        : "Vyhľadávanie sa nepodarilo dokončiť a automatické vrátenie spotreby zlyhalo."
    });
  }
}
