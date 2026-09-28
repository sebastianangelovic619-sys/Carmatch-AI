// ============================================================
// CARMATCH AI - PRODUCTION BACKEND v7
// ============================================================
//
// Core features
// - Supabase anonymous auth
// - 5 searches / day via Supabase RPC
// - Groq GPT-OSS with live browser search
// - Official-manufacturer price priority
// - Server-side validation of official price URLs
// - kW + mechanical HP output
// - Current generation / model-year guardrails
// - 3-car exact output contract
// - OpenRouter FREE multi-fallback
// - Search refund when every provider fails
// - Wikimedia Commons + Wikipedia image fallback
// - Image rejection / relevance ranking
// - Strong SSRF-safe URL validation
// - Defensive parsing and normalization
// - FIXED: searchCharged scope for safe refunds
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

const REQUEST_TIMEOUT = 55000;
const GROQ_PRIMARY_TIMEOUT = 52000;
const GROQ_REPAIR_TIMEOUT = 24000;
const OPENROUTER_TIMEOUT = 30000;

const SUPABASE_TIMEOUT = 10000;
const OFFICIAL_PAGE_TIMEOUT = 6500;
const WIKIMEDIA_TIMEOUT = 7000;
const WIKIPEDIA_TIMEOUT = 7000;

const MAX_IMAGE_CANDIDATES = 8;
const MAX_DATA_SOURCES = 12;
const MAX_BODY_TEXT = 7000;

const POWER_KW_TO_HP = 1.34102209;
const POWER_HP_TO_KW = 1 / POWER_KW_TO_HP;


// ============================================================
// GROQ MODELS
// ============================================================

const GROQ_MODELS = [
  {
    model: "openai/gpt-oss-120b",
    timeout: GROQ_PRIMARY_TIMEOUT,
    purpose: "research"
  },
  {
    model: "openai/gpt-oss-20b",
    timeout: GROQ_REPAIR_TIMEOUT,
    purpose: "repair"
  }
];


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
// OFFICIAL / THIRD-PARTY DOMAIN RULES
// ============================================================

const OBVIOUS_THIRD_PARTY_HOSTS = [
  "autoscout24.com",
  "autoscout24.de",
  "autoscout24.at",
  "mobile.de",
  "sauto.cz",
  "tipcars.com",
  "cars.com",
  "cargurus.com",
  "autotrader.com",
  "autobazar.eu",
  "bazos.sk",
  "bazaar.sk",
  "autobazar.sk",
  "carvago.com",
  "hey.car",
  "carwow.co.uk",
  "topgear.com",
  "autocar.co.uk",
  "motor1.com",
  "wikipedia.org",
  "reddit.com",
  "youtube.com",
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "x.com",
  "twitter.com"
];


const OFFICIAL_DOMAIN_HINTS = {
  audi: [
    "audi.com",
    "audi.sk",
    "audi.de",
    "audi.at"
  ],
  bmw: [
    "bmw.com",
    "bmw.sk",
    "bmw.de",
    "bmw.at"
  ],
  mercedes: [
    "mercedes-benz.com",
    "mercedes-benz.sk",
    "mercedes-benz.de",
    "mercedes-benz.at"
  ],
  porsche: [
    "porsche.com",
    "porsche.sk",
    "porsche.de",
    "porsche.at"
  ],
  volkswagen: [
    "volkswagen.com",
    "volkswagen.sk",
    "volkswagen.de",
    "vw.com",
    "vw.sk"
  ],
  skoda: [
    "skoda-auto.com",
    "skoda-auto.sk",
    "skoda-auto.de",
    "skoda-auto.at"
  ],
  seat: [
    "seat.com",
    "seat.sk",
    "seat.de"
  ],
  cupra: [
    "cupraofficial.com",
    "cupra.com",
    "cupra.sk",
    "cupra.de"
  ],
  volvo: [
    "volvocars.com",
    "volvocars.sk",
    "volvocars.de"
  ],
  lexus: [
    "lexus.com",
    "lexus.sk",
    "lexus.eu"
  ],
  toyota: [
    "toyota.com",
    "toyota.sk",
    "toyota-europe.com"
  ],
  landrover: [
    "landrover.com",
    "landrover.sk"
  ],
  jaguar: [
    "jaguar.com",
    "jaguar.sk"
  ],
  ferrari: [
    "ferrari.com"
  ],
  lamborghini: [
    "lamborghini.com"
  ],
  maserati: [
    "maserati.com"
  ],
  bentley: [
    "bentleymotors.com"
  ],
  astonmartin: [
    "astonmartin.com"
  ],
  mclaren: [
    "cars.mclaren.com",
    "mclaren.com"
  ],
  ford: [
    "ford.com",
    "ford.sk",
    "ford.de"
  ],
  opel: [
    "opel.com",
    "opel.sk",
    "opel.de"
  ],
  peugeot: [
    "peugeot.com",
    "peugeot.sk",
    "peugeot.de"
  ],
  citroen: [
    "citroen.com",
    "citroen.sk",
    "citroen.de"
  ],
  renault: [
    "renault.com",
    "renault.sk",
    "renault.de"
  ],
  nissan: [
    "nissan-global.com",
    "nissan.sk",
    "nissan.de"
  ],
  honda: [
    "honda.com",
    "honda.sk",
    "honda.de"
  ],
  mazda: [
    "mazda.com",
    "mazda.sk",
    "mazda.de"
  ],
  kia: [
    "kia.com",
    "kia.sk",
    "kia.com.eu"
  ],
  hyundai: [
    "hyundai.com",
    "hyundai.sk",
    "hyundai.de"
  ],
  genesis: [
    "genesis.com"
  ],
  jaguarlandrover: [
    "jaguarlandrover.com"
  ],
  fiat: [
    "fiat.com",
    "fiat.sk",
    "fiat.de"
  ],
  alfa: [
    "alfaromeo.com",
    "alfaromeo.sk",
    "alfaromeo.de"
  ],
  alfaromeo: [
    "alfaromeo.com",
    "alfaromeo.sk"
  ],
  jeep: [
    "jeep.com",
    "jeep.sk",
    "jeep.de"
  ],
  dodge: [
    "dodge.com"
  ],
  ram: [
    "ramtrucks.com"
  ],
  tesla: [
    "tesla.com"
  ],
  byd: [
    "byd.com",
    "bydauto.com"
  ],
  polestar: [
    "polestar.com"
  ],
  lotus: [
    "lotuscars.com"
  ],
  rimac: [
    "rimac-automobili.com"
  ],
  smart: [
    "smart.com",
    "smart.eu"
  ],
  mini: [
    "mini.com",
    "mini.sk",
    "mini.de"
  ],
  rollsroyce: [
    "rolls-roycemotorcars.com"
  ],
  rolls: [
    "rolls-roycemotorcars.com"
  ],
  maybach: [
    "mercedes-maybach.com",
    "mercedes-benz.com"
  ]
};


// ============================================================
// GENERIC HELPERS
// ============================================================

function sendJson(res, status, data) {
  return res.status(status).json(data);
}


function text(value, maxLength = 5000) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value)
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLength);
}


function arrayText(value, maxItems = 10, itemLength = 500) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(item => text(item, itemLength))
    .filter(Boolean)
    .slice(0, maxItems);
}


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


function currentDate() {
  return new Date().toISOString().slice(0, 10);
}


function getHeader(req, name) {
  const value = req?.headers?.[name.toLowerCase()];

  if (Array.isArray(value)) {
    return value[0] || "";
  }

  return String(value || "");
}


// ============================================================
// JSON PARSING
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
    try {
      return JSON.parse(
        value.slice(firstBrace, lastBrace + 1)
      );
    } catch (_) {}
  }

  throw new Error("AI returned invalid JSON");
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


async function fetchJson(
  url,
  options = {},
  timeout = 30000
) {
  const response = await fetchWithTimeout(
    url,
    options,
    timeout
  );

  const raw = await response.text();

  let data = null;

  try {
    data = JSON.parse(raw);
  } catch (_) {
    throw new Error(
      `Invalid JSON response from ${url}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} from ${url}: ${raw.slice(0, 300)}`
    );
  }

  return data;
}


// ============================================================
// SUPABASE AUTH / RPC
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

  const response = await fetchWithTimeout(
    `${SUPABASE_URL}/auth/v1/user`,
    {
      method: "GET",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`
      }
    },
    SUPABASE_TIMEOUT
  );

  if (!response.ok) {
    return null;
  }

  const user = await response.json();

  if (!user?.id) {
    return null;
  }

  return user;
}


async function callSupabaseRpc(
  functionName,
  accessToken,
  body
) {
  const response = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/rpc/${functionName}`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body || {})
    },
    SUPABASE_TIMEOUT
  );

  const raw = await response.text();

  let data = null;

  try {
    data = JSON.parse(raw);
  } catch (_) {
    data = raw;
  }

  if (!response.ok) {
    throw new Error(
      `Supabase RPC ${functionName} failed: HTTP ${response.status} ${raw.slice(0, 500)}`
    );
  }

  return data;
}


function normalizeUsageResult(value) {
  if (Array.isArray(value)) {
    value = value[0];
  }

  if (
    typeof value === "number" ||
    typeof value === "string"
  ) {
    const remaining = Number(value);

    return {
      allowed: remaining > 0,
      remaining: Number.isFinite(remaining)
        ? Math.max(0, remaining)
        : null
    };
  }

  if (!value || typeof value !== "object") {
    return {
      allowed: false,
      remaining: null
    };
  }

  const allowed =
    value.allowed ??
    value.can_search ??
    value.canSearch ??
    value.success ??
    false;

  const remaining = Number(
    value.remaining ??
    value.searches_remaining ??
    value.remaining_searches ??
    value.left ??
    0
  );

  return {
    allowed: Boolean(allowed),
    remaining: Number.isFinite(remaining)
      ? Math.max(0, remaining)
      : null
  };
}


async function useSearch(accessToken) {
  const rpcNames = [
    "use_search",
    "consume_search",
    "increment_search"
  ];

  let lastError = null;

  for (const rpcName of rpcNames) {
    try {
      const result = await callSupabaseRpc(
        rpcName,
        accessToken,
        {
          max_searches: MAX_SEARCHES_PER_DAY,
          daily_limit: MAX_SEARCHES_PER_DAY
        }
      );

      const normalized =
        normalizeUsageResult(result);

      if (
        normalized.remaining !== null ||
        normalized.allowed
      ) {
        return normalized;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error(
    "Supabase search usage RPC unavailable"
  );
}


async function refundSearch(accessToken) {
  const rpcNames = [
    "refund_search",
    "refund_search_usage",
    "decrement_search"
  ];

  let lastError = null;

  for (const rpcName of rpcNames) {
    try {
      const result = await callSupabaseRpc(
        rpcName,
        accessToken,
        {
          amount: 1
        }
      );

      const normalized =
        normalizeUsageResult(result);

      return {
        success: true,
        remaining: normalized.remaining
      };
    } catch (error) {
      lastError = error;
    }
  }

  console.error(
    "CARMATCH AI refund failed:",
    lastError
  );

  return {
    success: false,
    remaining: null
  };
}


// ============================================================
// REQUEST NORMALIZATION
// ============================================================

function normalizeRequest(body) {
  const source =
    body && typeof body === "object"
      ? body
      : {};

  const naturalLanguage = text(
    source.naturalLanguage ??
    source.query ??
    source.prompt ??
    source.search ??
    "",
    3000
  );

  const filters =
    source.filters &&
    typeof source.filters === "object"
      ? source.filters
      : {};

  return {
    naturalLanguage,
    filters: {
      budget: text(filters.budget, 300),
      seats: text(filters.seats, 100),
      minPower: text(
        filters.minPower ??
        filters.minPowerKw ??
        filters.power,
        100
      ),
      trunk: text(
        filters.trunk ??
        filters.minTrunk,
        100
      ),
      drive: text(
        filters.drive ??
        filters.drivetrain,
        100
      ),
      fuel: text(filters.fuel, 100),
      body: text(
        filters.body ??
        filters.bodyType,
        100
      ),
      style: text(filters.style, 150),
      length: text(filters.length, 100),
      year: text(filters.year, 100),
      avoidBrands: arrayText(
        filters.avoidBrands ??
        filters.avoid ??
        [],
        30,
        100
      )
    }
  };
}


// ============================================================
// AUTOMOTIVE PROMPT
// ============================================================

function buildResearchPrompt(request) {
  return `
You are CARMATCH AI, an automotive research assistant.

CURRENT DATE:
${currentDate()}

USER REQUEST:
${request.naturalLanguage || "(No natural-language request)"}

FILTERS:
${JSON.stringify(request.filters, null, 2)}

YOUR TASK:
Find exactly 3 real passenger cars that best satisfy the user's
explicit requirements.

IMPORTANT:
- Research CURRENT vehicles available in the requested market.
- Prefer the newest currently sold generation.
- Do not recommend discontinued generations unless the user
  explicitly asks for older/used vehicles.
- Do not invent models, prices, specifications, URLs, generations,
  equipment or availability.
- If a price cannot be verified, use "Cena na vyžiadanie".
- If an official price/configurator URL cannot be verified,
  return an empty URL instead of inventing one.
- Power MUST use kW and mechanical horsepower.
- Never use PS, CV, ks or bhp as the primary output.
- Use exact current-generation/model-year information whenever
  available.
- Respect seats, body style, drivetrain, fuel, power, trunk,
  dimensions, budget and other explicit requirements.
- Do not silently relax an explicit user requirement.
- If an exact requirement cannot be met, choose the closest
  documented alternative and explain why.
- Avoid brands listed by the user.
- Do not return motorcycles, trucks, buses or commercial vehicles.
- Return exactly 3 cars.

PRICE RULE:
Prefer official manufacturer pricing from the manufacturer's
official website for the relevant country/market.
If an official price is unavailable, use a trustworthy source and
clearly identify it.
Never fabricate a price.

IMAGE RULE:
Do NOT invent image URLs.
Return image/photoSource as empty strings.
The backend will search Wikimedia Commons/Wikipedia separately.

OUTPUT:
Return ONLY valid JSON.

Required structure:

{
  "cars": [
    {
      "rank": 1,
      "brand": "",
      "model": "",
      "generation": "",
      "modelYear": "",
      "price": "",
      "priceCurrency": "EUR",
      "priceSource": "",
      "configuratorUrl": "",
      "power": {
        "kw": "",
        "hp": ""
      },
      "fuel": "",
      "drive": "",
      "transmission": "",
      "body": "",
      "seats": "",
      "trunkLiters": "",
      "lengthMm": "",
      "description": "",
      "pros": [],
      "cons": [],
      "maintenance": "",
      "officialUrl": "",
      "dataSources": [],
      "image": "",
      "photoSource": ""
    }
  ],
  "liveWeb": true
}

Do not add commentary outside JSON.
`;
}


// ============================================================
// AI RESPONSE EXTRACTION
// ============================================================

function extractMessageContent(data) {
  const choice =
    data?.choices?.[0];

  if (!choice) {
    return "";
  }

  const content =
    choice.message?.content ??
    choice.text ??
    "";

  if (Array.isArray(content)) {
    return content
      .map(item => {
        if (typeof item === "string") {
          return item;
        }

        return item?.text || "";
      })
      .join("\n");
  }

  return String(content || "");
}


// ============================================================
// CAR NORMALIZATION
// ============================================================

function normalizeBrand(value) {
  return text(value, 100);
}


function normalizeModel(value) {
  return text(value, 150);
}


function normalizePower(value) {
  if (!value) {
    return {
      kw: "",
      hp: ""
    };
  }

  if (typeof value === "object") {
    let kw = Number(
      String(value.kw ?? "")
        .replace(",", ".")
        .replace(/[^\d.]/g, "")
    );

    let hp = Number(
      String(value.hp ?? "")
        .replace(",", ".")
        .replace(/[^\d.]/g, "")
    );

    if (
      !Number.isFinite(kw) &&
      Number.isFinite(hp)
    ) {
      kw = hp * POWER_HP_TO_KW;
    }

    if (
      !Number.isFinite(hp) &&
      Number.isFinite(kw)
    ) {
      hp = kw * POWER_KW_TO_HP;
    }

    return {
      kw: Number.isFinite(kw)
        ? `${Math.round(kw)} kW`
        : "",
      hp: Number.isFinite(hp)
        ? `${Math.round(hp)} hp`
        : ""
    };
  }

  const raw = String(value)
    .toLowerCase()
    .replace(",", ".")
    .trim();

  const kwMatch =
    raw.match(/(\d+(?:\.\d+)?)\s*kw/);

  const hpMatch =
    raw.match(
      /(\d+(?:\.\d+)?)\s*(?:hp|bhp|ps|cv|ks)/
    );

  let kw =
    kwMatch
      ? Number(kwMatch[1])
      : NaN;

  let hp =
    hpMatch
      ? Number(hpMatch[1])
      : NaN;

  if (
    !Number.isFinite(kw) &&
    Number.isFinite(hp)
  ) {
    kw = hp * POWER_HP_TO_KW;
  }

  if (
    !Number.isFinite(hp) &&
    Number.isFinite(kw)
  ) {
    hp = kw * POWER_KW_TO_HP;
  }

  return {
    kw: Number.isFinite(kw)
      ? `${Math.round(kw)} kW`
      : "",
    hp: Number.isFinite(hp)
      ? `${Math.round(hp)} hp`
      : ""
  };
}


function normalizePrice(value) {
  if (!value) {
    return "Cena na vyžiadanie";
  }

  if (typeof value === "object") {
    const amount = Number(
      String(
        value.amount ??
        value.price ??
        ""
      )
        .replace(",", ".")
        .replace(/[^\d.]/g, "")
    );

    const currency =
      text(
        value.currency ||
        "EUR",
        10
      ).toUpperCase();

    if (Number.isFinite(amount)) {
      return `${Math.round(amount).toLocaleString("sk-SK")} ${currency}`;
    }

    return "Cena na vyžiadanie";
  }

  const raw = String(value)
    .replace(/\s+/g, " ")
    .trim();

  if (
    !raw ||
    /unknown|n\/a|not available|unavailable|neznáme|nezistené/i.test(
      raw
    )
  ) {
    return "Cena na vyžiadanie";
  }

  return raw.slice(0, 150);
}


function normalizeCar(raw, index) {
  const car =
    raw && typeof raw === "object"
      ? raw
      : {};

  return {
    rank:
      Number.isFinite(Number(car.rank))
        ? Number(car.rank)
        : index + 1,

    brand:
      normalizeBrand(
        car.brand ||
        car.make
      ),

    model:
      normalizeModel(
        car.model ||
        car.name
      ),

    generation:
      text(
        car.generation ||
        car.generationName,
        200
      ),

    modelYear:
      text(
        car.modelYear ||
        car.year,
        50
      ),

    price:
      normalizePrice(car.price),

    priceCurrency:
      text(
        car.priceCurrency ||
        "EUR",
        10
      ).toUpperCase(),

    priceSource:
      text(
        car.priceSource,
        500
      ),

    configuratorUrl:
      text(
        car.configuratorUrl ||
        car.configurator,
        1000
      ),

    power:
      normalizePower(car.power),

    fuel:
      text(
        car.fuel ||
        car.engineFuel,
        100
      ),

    drive:
      text(
        car.drive ||
        car.drivetrain,
        100
      ),

    transmission:
      text(
        car.transmission ||
        car.gearbox,
        100
      ),

    body:
      text(
        car.body ||
        car.bodyType,
        100
      ),

    seats:
      text(
        car.seats,
        50
      ),

    trunkLiters:
      text(
        car.trunkLiters ||
        car.trunk ||
        car.boot,
        100
      ),

    lengthMm:
      text(
        car.lengthMm ||
        car.length,
        100
      ),

    description:
      text(
        car.description,
        1200
      ),

    pros:
      arrayText(
        car.pros,
        8,
        300
      ),

    cons:
      arrayText(
        car.cons,
        8,
        300
      ),

    maintenance:
      text(
        car.maintenance,
        1000
      ),

    officialUrl:
      text(
        car.officialUrl ||
        car.url,
        1000
      ),

    dataSources:
      arrayText(
        car.dataSources ||
        car.sources,
        MAX_DATA_SOURCES,
        1000
      ),

    image:
      "",

    photoSource:
      "",

    imageCandidates:
      []
  };
}


function normalizeCars(rawCars) {
  if (!Array.isArray(rawCars)) {
    return [];
  }

  return rawCars
    .slice(0, 10)
    .map((car, index) =>
      normalizeCar(car, index)
    )
    .filter(car =>
      car.brand &&
      car.model
    );
}


// ============================================================
// AI RESULT NORMALIZATION
// ============================================================

function normalizeAIResult(data, provider) {
  const cars =
    normalizeCars(
      data?.cars ||
      data?.vehicles ||
      data?.results ||
      []
    );

  if (cars.length !== 3) {
    throw new Error(
      `AI returned ${cars.length} cars instead of exactly 3`
    );
  }

  return {
    cars,
    liveWeb:
      Boolean(
        data?.liveWeb ??
        data?.webSearch ??
        true
      ),

    provider
  };
}


// ============================================================
// GROQ CALL
// ============================================================

async function callGroqModel(
  request,
  modelConfig,
  repair = false
) {
  if (!GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY missing"
    );
  }

  const prompt =
    buildResearchPrompt(request);

  const response = await fetchWithTimeout(
    GROQ_URL,
    {
      method: "POST",
      headers: {
        Authorization:
          `Bearer ${GROQ_API_KEY}`,
        "Content-Type":
          "application/json"
      },
      body: JSON.stringify({
        model: modelConfig.model,

        messages: [
          {
            role: "system",
            content:
              "You are a precise automotive research engine. Follow the requested JSON contract exactly."
          },
          {
            role: "user",
            content: prompt
          }
        ],

        temperature: 0.1,

        max_tokens:
          repair
            ? 8000
            : 12000,

        response_format: {
          type: "json_object"
        },

        tools: [
          {
            type: "browser_search"
          }
        ]
      })
    },
    modelConfig.timeout
  );

  const raw =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `Groq ${modelConfig.model} HTTP ${response.status}: ${raw.slice(0, 500)}`
    );
  }

  let data;

  try {
    data = JSON.parse(raw);
  } catch (_) {
    throw new Error(
      "Groq returned invalid JSON envelope"
    );
  }

  const content =
    extractMessageContent(data);

  const parsed =
    parseAIJson(content);

  return normalizeAIResult(
    parsed,
    `groq:${modelConfig.model}`
  );
}


async function callGroqResearch(request) {
  let lastError = null;

  for (const modelConfig of GROQ_MODELS) {
    try {
      return await callGroqModel(
        request,
        modelConfig,
        modelConfig.purpose === "repair"
      );
    } catch (error) {
      lastError = error;

      console.error(
        `CARMATCH AI Groq model failed (${modelConfig.model}):`,
        error
      );
    }
  }

  throw lastError ||
    new Error(
      "All Groq models failed"
    );
}


// ============================================================
// OPENROUTER CALL
// ============================================================

async function callOpenRouterModel(
  request,
  model
) {
  if (!OPENROUTER_API_KEY) {
    throw new Error(
      "OPENROUTER_API_KEY missing"
    );
  }

  const response =
    await fetchWithTimeout(
      OPENROUTER_URL,
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${OPENROUTER_API_KEY}`,

          "Content-Type":
            "application/json",

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
              content:
                "You are CARMATCH AI. Return exactly valid JSON with exactly 3 real current cars."
            },
            {
              role: "user",
              content:
                buildResearchPrompt(request)
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

  let data;

  try {
    data = JSON.parse(raw);
  } catch (_) {
    throw new Error(
      "OpenRouter returned invalid JSON envelope"
    );
  }

  const content =
    extractMessageContent(data);

  const parsed =
    parseAIJson(content);

  return normalizeAIResult(
    parsed,
    `openrouter:${model}`
  );
}


async function callOpenRouter(request) {
  let lastError = null;

  for (const model of OPENROUTER_FREE_MODELS) {
    try {
      return await callOpenRouterModel(
        request,
        model
      );
    } catch (error) {
      lastError = error;

      console.error(
        `CARMATCH AI OpenRouter model failed (${model}):`,
        error
      );

      await sleep(150);
    }
  }

  throw lastError ||
    new Error(
      "All OpenRouter models failed"
    );
}


// ============================================================
// URL SECURITY
// ============================================================

function isSafeHttpUrl(value) {
  if (!value) {
    return false;
  }

  let parsed;

  try {
    parsed = new URL(value);
  } catch (_) {
    return false;
  }

  if (
    parsed.protocol !== "https:" &&
    parsed.protocol !== "http:"
  ) {
    return false;
  }

  const hostname =
    parsed.hostname
      .toLowerCase()
      .replace(/^www\./, "");

  if (!hostname) {
    return false;
  }

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1"
  ) {
    return false;
  }

  if (
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("172.16.") ||
    hostname.startsWith("172.17.") ||
    hostname.startsWith("172.18.") ||
    hostname.startsWith("172.19.") ||
    hostname.startsWith("172.20.") ||
    hostname.startsWith("172.21.") ||
    hostname.startsWith("172.22.") ||
    hostname.startsWith("172.23.") ||
    hostname.startsWith("172.24.") ||
    hostname.startsWith("172.25.") ||
    hostname.startsWith("172.26.") ||
    hostname.startsWith("172.27.") ||
    hostname.startsWith("172.28.") ||
    hostname.startsWith("172.29.") ||
    hostname.startsWith("172.30.") ||
    hostname.startsWith("172.31.")
  ) {
    return false;
  }

  return true;
}


function hostnameOf(value) {
  if (!isSafeHttpUrl(value)) {
    return "";
  }

  try {
    return new URL(value)
      .hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch (_) {
    return "";
  }
}


function isThirdPartyHost(hostname) {
  return OBVIOUS_THIRD_PARTY_HOSTS.some(
    domain =>
      hostname === domain ||
      hostname.endsWith(`.${domain}`)
  );
}


function brandKey(brand) {
  return text(
    brand,
    100
  )
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}


function isOfficialBrandHost(
  brand,
  url
) {
  const host =
    hostnameOf(url);

  if (!host) {
    return false;
  }

  const key =
    brandKey(brand);

  const hints =
    OFFICIAL_DOMAIN_HINTS[key] || [];

  return hints.some(domain =>
    host === domain ||
    host.endsWith(`.${domain}`)
  );
}


function isLikelyOfficialUrl(
  brand,
  url
) {
  if (!isSafeHttpUrl(url)) {
    return false;
  }

  const host =
    hostnameOf(url);

  if (!host) {
    return false;
  }

  if (isThirdPartyHost(host)) {
    return false;
  }

  return isOfficialBrandHost(
    brand,
    url
  );
}


// ============================================================
// PRICE SOURCE VALIDATION
// ============================================================

async function validateUrlReachable(
  url,
  timeout = OFFICIAL_PAGE_TIMEOUT
) {
  if (!isSafeHttpUrl(url)) {
    return false;
  }

  try {
    const response =
      await fetchWithTimeout(
        url,
        {
          method: "GET",
          headers: {
            "User-Agent":
              "CARMATCH-AI/1.0"
          }
        },
        timeout
      );

    return response.ok;
  } catch (_) {
    return false;
  }
}


function extractNumericPrice(value) {
  if (!value) {
    return null;
  }

  const raw =
    String(value)
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(",", ".");

  const match =
    raw.match(
      /(\d+(?:\.\d+)?)/ 
    );

  if (!match) {
    return null;
  }

  const amount =
    Number(match[1]);

  if (!Number.isFinite(amount)) {
    return null;
  }

  if (
    amount < 1000 ||
    amount > 5000000
  ) {
    return null;
  }

  return amount;
}


function hasRealPrice(car) {
  const price =
    normalizePrice(car.price);

  return (
    price !== "Cena na vyžiadanie" &&
    extractNumericPrice(price) !== null
  );
}


async function verifyPriceSource(
  car
) {
  const candidates = [];

  if (
    car.priceSource &&
    isLikelyOfficialUrl(
      car.brand,
      car.priceSource
    )
  ) {
    candidates.push(
      car.priceSource
    );
  }

  if (
    car.officialUrl &&
    isLikelyOfficialUrl(
      car.brand,
      car.officialUrl
    )
  ) {
    candidates.push(
      car.officialUrl
    );
  }

  if (
    car.configuratorUrl &&
    isLikelyOfficialUrl(
      car.brand,
      car.configuratorUrl
    )
  ) {
    candidates.push(
      car.configuratorUrl
    );
  }

  for (const url of candidates) {
    const reachable =
      await validateUrlReachable(
        url
      );

    if (reachable) {
      return {
        ...car,
        priceSource: url
      };
    }
  }

  if (
    car.priceSource &&
    isSafeHttpUrl(
      car.priceSource
    )
  ) {
    const reachable =
      await validateUrlReachable(
        car.priceSource
      );

    if (reachable) {
      return {
        ...car
      };
    }
  }

  return {
    ...car,
    price:
      hasRealPrice(car)
        ? car.price
        : "Cena na vyžiadanie"
  };
}


async function verifyPricesAndSources(
  request,
  cars,
  liveWeb
) {
  const results =
    await Promise.all(
      cars.map(car =>
        verifyPriceSource(car)
      )
    );

  return results.map(car => ({
    ...car,

    price:
      normalizePrice(car.price),

    priceSource:
      isSafeHttpUrl(
        car.priceSource
      )
        ? car.priceSource
        : "",

    configuratorUrl:
      isSafeHttpUrl(
        car.configuratorUrl
      )
        ? car.configuratorUrl
        : "",

    officialUrl:
      isSafeHttpUrl(
        car.officialUrl
      )
        ? car.officialUrl
        : "",

    dataSources:
      arrayText(
        car.dataSources,
        MAX_DATA_SOURCES,
        1000
      ),

    liveWeb:
      Boolean(liveWeb)
  }));
}


// ============================================================
// IMAGE SEARCH
// ============================================================

const IMAGE_REJECT_WORDS = [
  "motorcycle",
  "motorbike",
  "bike",
  "truck",
  "pickup",
  "bus",
  "van",
  "tractor",
  "scooter",
  "atv",
  "quad",
  "concept",
  "render",
  "drawing",
  "sketch",
  "toy",
  "model"
];


function normalizeImageText(value) {
  return text(
    value,
    1000
  )
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function isRejectedImageTitle(title) {
  const normalized =
    normalizeImageText(title);

  return IMAGE_REJECT_WORDS.some(
    word =>
      normalized.includes(word)
  );
}


function isWikimediaPhotoURL(url) {
  if (!url) {
    return false;
  }

  if (!isSafeHttpUrl(url)) {
    return false;
  }

  const host =
    hostnameOf(url);

  return (
    host === "upload.wikimedia.org" ||
    host.endsWith(".wikimedia.org")
  );
}


function buildImageSearchQueries(car) {
  const brand =
    text(car.brand, 100);

  const model =
    text(car.model, 150);

  const generation =
    text(car.generation, 150);

  const year =
    text(car.modelYear, 50);

  const queries = [];

  if (
    brand &&
    model &&
    generation &&
    year
  ) {
    queries.push(
      `${brand} ${model} ${generation} ${year}`
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
    model &&
    year
  ) {
    queries.push(
      `${brand} ${model} ${year}`
    );
  }

  if (
    brand &&
    model
  ) {
    queries.push(
      `${brand} ${model}`
    );
  }

  return [
    ...new Set(
      queries
        .map(q =>
          q.trim()
        )
        .filter(Boolean)
    )
  ].slice(0, 4);
}


function scoreImageCandidate(
  candidate,
  car
) {
  const title =
    normalizeImageText(
      candidate.title
    );

  const brand =
    normalizeImageText(
      car.brand
    );

  const model =
    normalizeImageText(
      car.model
    );

  const generation =
    normalizeImageText(
      car.generation
    );

  const year =
    normalizeImageText(
      car.modelYear
    );

  let score = 0;

  if (
    brand &&
    title.includes(brand)
  ) {
    score += 30;
  }

  if (
    model &&
    title.includes(model)
  ) {
    score += 40;
  }

  if (
    generation &&
    title.includes(generation)
  ) {
    score += 20;
  }

  if (
    year &&
    title.includes(year)
  ) {
    score += 10;
  }

  if (
    isRejectedImageTitle(title)
  ) {
    score -= 100;
  }

  return score;
}


function dedupeImageCandidates(
  candidates,
  car
) {
  const seen =
    new Set();

  return candidates
    .filter(candidate =>
      candidate?.image
    )
    .map(candidate => ({
      ...candidate,
      score:
        scoreImageCandidate(
          candidate,
          car
        )
    }))
    .filter(candidate => {
      const key =
        candidate.image
          .split("?")[0];

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);

      return true;
    })
    .sort(
      (a, b) =>
        b.score - a.score
    );
}


async function searchWikimediaImages(
  query,
  queryIndex
) {
  const params =
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

  const data =
    await fetchJson(
      `${WIKIMEDIA_API}?${params.toString()}`,
      {
        headers: {
          "User-Agent":
            "CARMATCH-AI/1.0"
        }
      },
      WIKIMEDIA_TIMEOUT
    );

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

    const image =
      imageInfo?.thumburl ||
      imageInfo?.url ||
      "";

    if (
      !isWikimediaPhotoURL(
        image
      )
    ) {
      continue;
    }

    const mime =
      String(
        imageInfo?.mime ||
        ""
      ).toLowerCase();

    if (
      mime &&
      !mime.startsWith("image/")
    ) {
      continue;
    }

    candidates.push({
      image,
      photoSource:
        page?.canonicalurl ||
        page?.fullurl ||
        "",
      title,
      query,
      queryIndex
    });
  }

  return candidates;
}


async function searchWikipediaImages(
  query,
  queryIndex
) {
  const params =
    new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: query,
      gsrnamespace: "0",
      gsrlimit: "8",
      prop: "pageimages|info",
      piprop: "thumbnail|original",
      pithumbsize: "1200",
      inprop: "url",
      format: "json",
      origin: "*"
    });

  const data =
    await fetchJson(
      `${WIKIPEDIA_API}?${params.toString()}`,
      {
        headers: {
          "User-Agent":
            "CARMATCH-AI/1.0"
        }
      },
      WIKIPEDIA_TIMEOUT
    );

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

    const thumbnail =
      page?.thumbnail?.source ||
      page?.original?.source ||
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
        "",
      title,
      query,
      queryIndex
    });
  }

  return candidates;
}


async function findCarImages(car) {
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
      .map(candidate => ({
        url:
          candidate.image,
        source:
          candidate.photoSource ||
          "",
        title:
          candidate.title ||
          ""
      }));

  const first =
    imageCandidates[0];

  return {
    ...car,
    image:
      first?.url ||
      "",
    photoSource:
      first?.source ||
      "",
    imageCandidates
  };
}


async function addCarImages(cars) {
  return Promise.all(
    cars.map(car =>
      findCarImages(car)
    )
  );
}


// ============================================================
// FINAL RESULT SANITIZATION
// ============================================================

function sanitizeCarLinks(car) {
  const result = {
    ...car
  };

  if (
    !isSafeHttpUrl(
      result.officialUrl
    )
  ) {
    result.officialUrl = "";
  }

  if (
    !isSafeHttpUrl(
      result.configuratorUrl
    )
  ) {
    result.configuratorUrl = "";
  }

  if (
    !isSafeHttpUrl(
      result.priceSource
    )
  ) {
    result.priceSource = "";
  }

  if (
    Array.isArray(
      result.dataSources
    )
  ) {
    result.dataSources =
      result.dataSources
        .filter(url =>
          isSafeHttpUrl(url)
        )
        .slice(
          0,
          MAX_DATA_SOURCES
        );
  } else {
    result.dataSources = [];
  }

  return result;
}


function finalSanitizeCars(cars) {
  return cars.map(car => {
    const sanitized =
      sanitizeCarLinks({
        ...car,
        power:
          normalizePower(
            car.power
          ),
        price:
          normalizePrice(
            car.price
          )
      });

    if (
      !sanitized.power
    ) {
      sanitized.power = {
        kw: "",
        hp: ""
      };
    }

    if (
      !sanitized.price
    ) {
      sanitized.price =
        "Cena na vyžiadanie";
    }

    return sanitized;
  });
}


// ============================================================
// MAIN HANDLER
// ============================================================

export default async function handler(
  req,
  res
) {
  // ----------------------------------------------------------
  // CORS
  // ----------------------------------------------------------

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

  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  if (
    req.method === "OPTIONS"
  ) {
    return res
      .status(200)
      .end();
  }

  if (
    req.method !== "POST"
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

  const startedAt =
    Date.now();

  // FIX:
  // Must be outside try so catch can safely refund
  // a search that was already charged.
  let searchCharged =
    false;

  let accessToken =
    "";

  try {
    // --------------------------------------------------------
    // ENVIRONMENT
    // --------------------------------------------------------

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
            "Configuration error",
          message:
            "CARMATCH AI nemá správne nastavený Supabase backend."
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

    // --------------------------------------------------------
    // AUTHORIZATION
    // --------------------------------------------------------

    const authorization =
      getHeader(
        req,
        "authorization"
      );

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

    accessToken =
      authorization
        .slice(7)
        .trim();

    if (
      !accessToken ||
      accessToken.length > 10000
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

    // --------------------------------------------------------
    // SUPABASE USER
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // REQUEST
    // --------------------------------------------------------

    const request =
      normalizeRequest(
        req.body || {}
      );

    if (
      request.naturalLanguage.length >
        3000 ||
      JSON.stringify(
        request.filters
      ).length >
        MAX_BODY_TEXT
    ) {
      return sendJson(
        res,
        413,
        {
          error:
            "Request too large"
        }
      );
    }

    // --------------------------------------------------------
    // DAILY LIMIT
    // --------------------------------------------------------

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
            "Denný limit vyhľadávaní bol dosiahnutý.",
          message:
            `Použil si všetkých ${MAX_SEARCHES_PER_DAY} vyhľadávaní pre dnešok.`,
          remaining:
            0
        }
      );
    }

    searchCharged =
      true;

    // --------------------------------------------------------
    // PRIMARY PROVIDER
    // --------------------------------------------------------

    let result =
      null;

    let groqFailed =
      false;

    let openRouterFailed =
      false;

    if (
      GROQ_API_KEY
    ) {
      try {
        result =
          await callGroqResearch(
            request
          );
      } catch (error) {
        groqFailed =
          true;

        console.error(
          "CARMATCH AI - all Groq providers failed:",
          error
        );
      }
    }

    // --------------------------------------------------------
    // FALLBACK PROVIDER
    // --------------------------------------------------------

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

    // --------------------------------------------------------
    // ALL FAILED -> REFUND SEARCH
    // --------------------------------------------------------

    if (!result) {
      const refund =
        await refundSearch(
          accessToken
        );

      searchCharged =
        false;

      const refundRemaining =
        Number(
          refund?.remaining
        );

      const remaining =
        Number.isFinite(
          refundRemaining
        )
          ? Math.max(
              0,
              refundRemaining
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

    // --------------------------------------------------------
    // PRICE / FACT QUALITY PASS
    // --------------------------------------------------------

    let cars =
      result.cars.map(
        car => ({
          ...car,
          power:
            normalizePower(
              car.power
            ),
          price:
            normalizePrice(
              car.price
            )
        })
      );

    cars =
      await verifyPricesAndSources(
        request,
        cars,
        Boolean(
          result.liveWeb
        )
      );

    // --------------------------------------------------------
    // IMAGES
    // --------------------------------------------------------

    cars =
      await addCarImages(
        cars
      );

    // --------------------------------------------------------
    // FINAL SANITIZATION
    // --------------------------------------------------------

    cars =
      finalSanitizeCars(
        cars
      );

    // Exact 3-car final contract.
    if (
      cars.length !== 3
    ) {
      throw new Error(
        "Final result does not contain exactly 3 cars"
      );
    }

    // --------------------------------------------------------
    // SUCCESS
    // --------------------------------------------------------

    return sendJson(
      res,
      200,
      {
        cars,

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
            new Date()
              .toISOString(),

          processingMs:
            Date.now() -
            startedAt
        }
      }
    );
  } catch (error) {
    console.error(
      "CARMATCH AI INTERNAL ERROR:",
      error
    );

    // --------------------------------------------------------
    // SAFE REFUND
    // --------------------------------------------------------

    let remaining =
      null;

    if (
      searchCharged &&
      accessToken
    ) {
      try {
        const refund =
          await refundSearch(
            accessToken
          );

        searchCharged =
          false;

        const refundRemaining =
          Number(
            refund?.remaining
          );

        if (
          Number.isFinite(
            refundRemaining
          )
        ) {
          remaining =
            Math.max(
              0,
              refundRemaining
            );
        }
      } catch (
        refundError
      ) {
        console.error(
          "CARMATCH AI INTERNAL REFUND ERROR:",
          refundError
        );
      }
    }

    return sendJson(
      res,
      500,
      {
        error:
          "Server configuration error",

        message:
          "CARMATCH AI sa nepodarilo dokončiť požiadavku. Vyhľadávanie sa nezapočítalo do limitu, ak bolo možné ho bezpečne vrátiť.",

        retryable:
          true,

        ...(remaining !== null
          ? {
              remaining
            }
          : {})
      }
    );
  }
}