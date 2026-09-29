// ============================================================
// CARMATCH AI - PRODUCTION BACKEND v9
// ============================================================
//
// Core features
// - Supabase anonymous auth
// - 5 searches / day via Supabase RPC
// - Groq GPT-OSS with live browser search
// - Official-manufacturer price priority
// - Server-side validation of official price URLs
// - kW + mechanical HP output (never PS / ks / bhp)
// - Current generation / model-year guardrails
// - 3-car exact output contract
// - OpenRouter FREE multi-fallback
// - Search refund when every provider fails
// - Wikimedia Commons + Wikipedia image fallback
// - Image rejection / relevance ranking
// - Strong SSRF-safe URL validation
// - Defensive parsing and normalization
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
    "rimac-automobili.com",
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


function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}


function cleanPrimitive(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.replace(/\u0000/g, "").trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}


function scalarText(value, maxLength = 5000, depth = 0) {
  if (depth > 4 || value === null || value === undefined) return "";

  const primitive = cleanPrimitive(value);
  if (primitive) return primitive.slice(0, maxLength);

  if (Array.isArray(value)) {
    return value
      .map(item =>
        scalarText(
          item,
          Math.max(
            80,
            Math.floor(maxLength / Math.max(1, value.length))
          ),
          depth + 1
        )
      )
      .filter(Boolean)
      .join(", ")
      .slice(0, maxLength);
  }

  if (isPlainObject(value)) {
    const preferredKeys = [
      "text",
      "value",
      "display",
      "label",
      "name",
      "title",
      "model",
      "brand",
      "make",
      "description",
      "content",
      "formatted",
      "string",
      "raw"
    ];

    for (const key of preferredKeys) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const extracted = scalarText(
          value[key],
          maxLength,
          depth + 1
        );

        if (
          extracted &&
          extracted !== "[object Object]"
        ) {
          return extracted;
        }
      }
    }

    const primitiveValues = Object.values(value)
      .map(item => cleanPrimitive(item))
      .filter(Boolean);

    if (primitiveValues.length === 1) {
      return primitiveValues[0].slice(0, maxLength);
    }
  }

  return "";
}


function text(value, maxLength = 5000) {
  return scalarText(value, maxLength);
}


function arrayText(
  value,
  maxItems = 10,
  itemLength = 500
) {
  if (!Array.isArray(value)) return [];

  return value
    .map(item => scalarText(item, itemLength))
    .map(item => item.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter(item => item !== "[object Object]")
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

  if (!user || !user.id) {
    return null;
  }

  return user;
}


async function callSupabaseRPC(
  functionName,
  accessToken,
  body = {}
) {
  return fetchJson(
    `${SUPABASE_URL}/rest/v1/rpc/${functionName}`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(body)
    },
    SUPABASE_TIMEOUT
  );
}


function extractUsageResult(result) {
  if (!result || typeof result !== "object") {
    return null;
  }

  const allowedRaw =
    result.allowed ??
    result.can_search ??
    result.canSearch ??
    result.success;

  if (typeof allowedRaw !== "boolean") {
    return null;
  }

  const remainingNumber = Number(
    result.remaining ??
    result.searches_remaining ??
    result.remaining_searches
  );

  return {
    allowed: allowedRaw,
    remaining: Number.isFinite(remainingNumber)
      ? Math.max(
          0,
          Math.min(
            MAX_SEARCHES_PER_DAY,
            Math.round(remainingNumber)
          )
        )
      : 0
  };
}


async function useSearch(accessToken) {
  const candidates = [
    {
      name: "use_search",
      bodies: [
        {},
        {
          max_searches: MAX_SEARCHES_PER_DAY,
          daily_limit: MAX_SEARCHES_PER_DAY
        }
      ]
    },
    {
      name: "consume_search",
      bodies: [
        {},
        {
          max_searches: MAX_SEARCHES_PER_DAY,
          daily_limit: MAX_SEARCHES_PER_DAY
        }
      ]
    },
    {
      name: "increment_search",
      bodies: [
        {
          max_searches: MAX_SEARCHES_PER_DAY,
          daily_limit: MAX_SEARCHES_PER_DAY
        },
        {}
      ]
    }
  ];

  let lastError = null;

  for (const candidate of candidates) {
    for (const body of candidate.bodies) {
      try {
        const result = await callSupabaseRPC(
          candidate.name,
          accessToken,
          body
        );

        const usage = extractUsageResult(result);

        if (usage) {
          return usage;
        }

        lastError = new Error(
          `Supabase ${candidate.name} returned an unsupported usage shape`
        );
      } catch (error) {
        lastError = error;
      }
    }
  }

  throw (
    lastError ||
    new Error("No usable Supabase search RPC found")
  );
}


async function refundSearch(accessToken) {
  const attempts = [
    {
      name: "refund_search",
      bodies: [
        { amount: 1 },
        {}
      ]
    },
    {
      name: "refund_search_usage",
      bodies: [
        { amount: 1 },
        {}
      ]
    }
  ];

  let lastError = null;

  for (const attempt of attempts) {
    for (const body of attempt.bodies) {
      try {
        const result = await callSupabaseRPC(
          attempt.name,
          accessToken,
          body
        );

        return (
          extractUsageResult(result) ||
          result
        );
      } catch (error) {
        lastError = error;
      }
    }
  }

  console.error(
    "CARMATCH AI refund failed:",
    lastError
  );

  return null;
}


// ============================================================
// REQUEST NORMALIZATION
// ============================================================

function normalizeRequest(body) {
  const safeBody =
    body && typeof body === "object"
      ? body
      : {};

  const filters =
    safeBody.filters &&
    typeof safeBody.filters === "object" &&
    !Array.isArray(safeBody.filters)
      ? safeBody.filters
      : {};

  return {
    naturalLanguage: text(
      safeBody.naturalLanguage,
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


function detectMarket(request) {
  const content =
    `${request.naturalLanguage} ${JSON.stringify(request.filters)}`
      .toLowerCase();

  if (
    content.includes("slovensko") ||
    content.includes("slovakia") ||
    content.includes("slovak") ||
    content.includes("eur") ||
    content.includes("€")
  ) {
    return "Slovakia / European Union";
  }

  return "Europe / European Union";
}


// ============================================================
// POWER NORMALIZATION
// ============================================================
//
// Final output is ALWAYS:
//
//     500 kW / 671 HP
//
// HP = mechanical horsepower.
// 1 kW = 1.34102209 HP
//
// PS, ks, CV and metric horsepower are interpreted as metric
// horsepower first, then converted through kW.
// ============================================================

function parseNumeric(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const match = String(value)
    .replace(/,/g, ".")
    .match(
      /-?\d+(?:\.\d+)?/
    );

  if (!match) {
    return null;
  }

  const number = Number(match[0]);

  return Number.isFinite(number)
    ? number
    : null;
}


function normalizePower(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (isPlainObject(value)) {
    const nestedCandidates = [
      value.power,
      value.output,
      value.maximum,
      value.max,
      value.value
    ];

    const directKw = parseNumeric(
      value.kw ??
      value.kW ??
      value.kilowatts
    );

    const directHp = parseNumeric(
      value.hp ??
      value.HP ??
      value.bhp ??
      value.horsepower
    );

    const unit = String(
      value.unit ??
      value.unitOfMeasure ??
      value.units ??
      ""
    ).toLowerCase();

    if (
      directKw &&
      directKw > 0
    ) {
      const hp = Math.round(
        directKw * POWER_KW_TO_HP
      );

      return `${Math.round(directKw)} kW / ${hp} HP`;
    }

    if (
      directHp &&
      directHp > 0
    ) {
      const kw = Math.round(
        directHp * POWER_HP_TO_KW
      );

      return `${kw} kW / ${Math.round(directHp)} HP`;
    }

    const objectValue = parseNumeric(
      value.value
    );

    if (
      objectValue &&
      objectValue > 0 &&
      /kw|kilowatt/.test(unit)
    ) {
      const hp = Math.round(
        objectValue * POWER_KW_TO_HP
      );

      return `${Math.round(objectValue)} kW / ${hp} HP`;
    }

    if (
      objectValue &&
      objectValue > 0 &&
      /hp|horsepower|bhp|ps|cv|ks|koni|koní/.test(unit)
    ) {
      const kw =
        /ps|cv|ks|koni|koní/.test(unit)
          ? Math.round(
              objectValue * 0.73549875
            )
          : Math.round(
              objectValue * POWER_HP_TO_KW
            );

      const hp = Math.round(
        kw * POWER_KW_TO_HP
      );

      return `${kw} kW / ${hp} HP`;
    }

    for (const nested of nestedCandidates) {
      const normalized =
        normalizePower(nested);

      if (normalized) {
        return normalized;
      }
    }

    const combined =
      scalarText(value, 300);

    if (combined) {
      return normalizePower(combined);
    }

    return "";
  }

  const raw =
    scalarText(value, 500);

  if (!raw) {
    return "";
  }

  const kwMatch =
    raw.match(
      /(\d+(?:[.,]\d+)?)\s*kW\b/i
    );

  if (kwMatch) {
    const kw =
      parseNumeric(kwMatch[1]);

    if (
      kw &&
      kw > 0 &&
      kw < 3000
    ) {
      const hp = Math.round(
        kw * POWER_KW_TO_HP
      );

      return `${Math.round(kw)} kW / ${hp} HP`;
    }
  }

  const hpMatch =
    raw.match(
      /(\d+(?:[.,]\d+)?)\s*(?:hp|horsepower|bhp)\b/i
    );

  if (hpMatch) {
    const hp =
      parseNumeric(hpMatch[1]);

    if (
      hp &&
      hp > 0 &&
      hp < 5000
    ) {
      const kw = Math.round(
        hp * POWER_HP_TO_KW
      );

      return `${kw} kW / ${Math.round(hp)} HP`;
    }
  }

  const metricMatch =
    raw.match(
      /(\d+(?:[.,]\d+)?)\s*(?:PS|Pferdestärke(?:n)?|CV|ks|koni|koní|kon[eí]?)\b/i
    );

  if (metricMatch) {
    const metricHp =
      parseNumeric(metricMatch[1]);

    if (
      metricHp &&
      metricHp > 0 &&
      metricHp < 5000
    ) {
      const kw = Math.round(
        metricHp * 0.73549875
      );

      const hp = Math.round(
        kw * POWER_KW_TO_HP
      );

      return `${kw} kW / ${hp} HP`;
    }
  }

  const bare =
    parseNumeric(raw);

  if (
    bare &&
    bare > 0 &&
    bare < 3000 &&
    /^\s*\d+(?:[.,]\d+)?\s*$/.test(raw)
  ) {
    const kw =
      Math.round(bare);

    const hp =
      Math.round(
        kw * POWER_KW_TO_HP
      );

    return `${kw} kW / ${hp} HP`;
  }

  return "";
}


// ============================================================
// PRICE NORMALIZATION
// ============================================================

function normalizePrice(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (isPlainObject(value)) {
    const amount =
      parseNumeric(
        value.amount ??
        value.price ??
        value.value ??
        value.min ??
        value.startingPrice
      );

    const currency =
      String(
        value.currency ??
        value.currencyCode ??
        "EUR"
      ).toUpperCase();

    const from =
      Boolean(
        value.from ??
        value.starting ??
        value.startingAt
      );

    if (
      amount &&
      amount >= 1000 &&
      amount <= 10000000 &&
      currency === "EUR"
    ) {
      return formatDetectedEuroPrice(
        amount,
        from
      );
    }

    for (
      const nested of [
        value.price,
        value.amount,
        value.value,
        value.formatted,
        value.display
      ]
    ) {
      const normalized =
        normalizePrice(nested);

      if (normalized) {
        return normalized;
      }
    }

    return "";
  }

  let price =
    scalarText(value, 300)
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  if (!price) {
    return "";
  }

  const lower =
    price.toLowerCase();

  const unavailable = [
    "cena nie je dostupná",
    "cena nie je k dispozícii",
    "cena nie je k dispozicii",
    "price unavailable",
    "price not available",
    "not available",
    "n/a",
    "unknown",
    "unknown price",
    "neznáma cena",
    "neznamá cena",
    "neuvedené",
    "neuvedena",
    "tbc",
    "tba"
  ];

  if (
    unavailable.some(
      item => lower.includes(item)
    )
  ) {
    return "";
  }

  const euro =
    price.match(
      /(?:od\s*|from\s*|starting(?:\s+at)?\s*)?(?:€\s*)?(\d{1,3}(?:[ .]\d{3})+(?:[,.]\d{2})?|\d{4,8}(?:[,.]\d{2})?)\s*(?:€|EUR)\b/i
    );

  if (euro) {
    const rawNumber =
      euro[1]
        .replace(/\s/g, "")
        .replace(
          /\.(?=\d{3}(?:\D|$))/g,
          ""
        )
        .replace(
          /,(\d{2})$/,
          ".$1"
        );

    const amount =
      Number(rawNumber);

    if (
      Number.isFinite(amount) &&
      amount >= 1000 &&
      amount <= 10000000
    ) {
      return formatDetectedEuroPrice(
        amount,
        /^(?:od|from|starting|cena\s+od)\b/i.test(price)
      );
    }
  }

  return price.slice(0, 160);
}


function priceHasNumber(value) {
  return /\d/.test(
    normalizePrice(value)
  );
}


// ============================================================
// URL / DOMAIN VALIDATION
// ============================================================

function hostnameOf(url) {
  try {
    return new URL(url)
      .hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch (_) {
    return "";
  }
}


function isBlockedHost(host) {
  if (!host) {
    return true;
  }

  return OBVIOUS_THIRD_PARTY_HOSTS.some(
    domain =>
      host === domain ||
      host.endsWith(`.${domain}`)
  );
}


function brandKeyFromName(name) {
  const lower =
    String(name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const keys =
    Object.keys(
      OFFICIAL_DOMAIN_HINTS
    ).sort(
      (a, b) =>
        b.length - a.length
    );

  for (const key of keys) {
    if (lower.includes(key)) {
      return key;
    }
  }

  if (lower.includes("mercedes")) {
    return "mercedes";
  }

  if (lower.includes("alfa romeo")) {
    return "alfaromeo";
  }

  if (lower.includes("land rover")) {
    return "landrover";
  }

  return "";
}


function isOfficialManufacturerURL(
  url,
  carName = ""
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
      parsed.protocol !== "https:"
    ) {
      return false;
    }

    const host =
      parsed.hostname
        .toLowerCase()
        .replace(/^www\./, "");    const hostname = parsed.hostname.toLowerCase();

    const hostMatches = OFFICIAL_MANUFACTURER_DOMAINS.some(
      domain =>
        hostname === domain ||
        hostname.endsWith(`.${domain}`)
    );

    if (!hostMatches) {
      return false;
    }

    const expectedBrands = [
      ...manufacturerNamesFromCar(carName),
      ...OFFICIAL_DOMAIN_BRAND_HINTS
        .filter(item => item.domain === hostname)
        .map(item => item.brand)
    ];

    if (expectedBrands.length === 0) {
      return true;
    }

    const normalizedHost = normalizedSearchString(
      hostname.replace(/\.(com|sk|de|fr|it|es|co\.uk|nl|be|at|ch|pl|cz|se|no|dk|fi|eu)$/i, "")
    );

    const normalizedCar = normalizedSearchString(carName);

    const brandMatch = expectedBrands.some(brand => {
      const normalizedBrand =
        normalizedSearchString(brand);

      return (
        normalizedCar.includes(normalizedBrand) ||
        normalizedHost.includes(normalizedBrand)
      );
    });

    return brandMatch;
  } catch (_) {
    return false;
  }
}


function extractMessageContent(apiData) {
  const choices = apiData?.choices;

  if (!Array.isArray(choices) || choices.length === 0) {
    return "";
  }

  const message = choices[0]?.message;

  if (!message) {
    return "";
  }

  const direct = scalarText(
    message.content,
    300000
  );

  if (direct) {
    return direct;
  }

  if (Array.isArray(message.content)) {
    const pieces = [];

    for (const item of message.content) {
      const value = scalarText(
        item,
        100000
      );

      if (value) {
        pieces.push(value);
      }
    }

    if (pieces.length > 0) {
      return pieces.join("\n");
    }
  }

  const outputText = scalarText(
    apiData.output_text,
    300000
  );

  if (outputText) {
    return outputText;
  }

  return "";
}


function parseAIJson(content) {
  let textContent = scalarText(
    content,
    500000
  ).trim();

  if (!textContent) {
    throw new Error("AI returned empty response");
  }

  textContent = textContent
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(textContent);
  } catch (_) {
    const firstBrace = textContent.indexOf("{");
    const lastBrace = textContent.lastIndexOf("}");

    if (
      firstBrace >= 0 &&
      lastBrace > firstBrace
    ) {
      const possibleJson =
        textContent.slice(
          firstBrace,
          lastBrace + 1
        );

      try {
        return JSON.parse(possibleJson);
      } catch (_) {
        // Continue to array recovery below.
      }
    }

    const firstBracket = textContent.indexOf("[");
    const lastBracket = textContent.lastIndexOf("]");

    if (
      firstBracket >= 0 &&
      lastBracket > firstBracket
    ) {
      const possibleArray =
        textContent.slice(
          firstBracket,
          lastBracket + 1
        );

      try {
        return {
          cars: JSON.parse(possibleArray)
        };
      } catch (_) {
        // Final error below.
      }
    }

    throw new Error(
      "AI returned invalid JSON"
    );
  }
}


function normalizePower(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "";
  }

  if (
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    if (
      value.kw !== undefined ||
      value.kW !== undefined
    ) {
      const kw = Number(
        value.kw ?? value.kW
      );

      if (Number.isFinite(kw) && kw > 0) {
        const hp = Math.round(
          kw * POWER_KW_TO_HP
        );

        return `${Math.round(kw)} kW / ${hp} HP`;
      }
    }

    if (
      value.hp !== undefined ||
      value.HP !== undefined
    ) {
      const hp = Number(
        value.hp ?? value.HP
      );

      if (Number.isFinite(hp) && hp > 0) {
        const kw = Math.round(
          hp * POWER_HP_TO_KW
        );

        return `${kw} kW / ${Math.round(hp)} HP`;
      }
    }

    const unit = scalarText(
      value.unit ||
      value.unitOfMeasure ||
      value.units,
      30
    ).toLowerCase();

    const nestedValue =
      value.value ??
      value.amount ??
      value.number;

    if (
      nestedValue !== undefined &&
      unit
    ) {
      const numeric =
        Number(nestedValue);

      if (
        Number.isFinite(numeric) &&
        numeric > 0
      ) {
        if (
          unit === "kw" ||
          unit === "kilowatt" ||
          unit === "kilowatts"
        ) {
          return `${Math.round(numeric)} kW / ${Math.round(
            numeric * POWER_KW_TO_HP
          )} HP`;
        }

        if (
          unit === "hp" ||
          unit === "horsepower" ||
          unit === "bhp"
        ) {
          return `${Math.round(
            numeric * POWER_HP_TO_KW
          )} kW / ${Math.round(numeric)} HP`;
        }

        if (
          unit === "ps" ||
          unit === "ks" ||
          unit === "cv"
        ) {
          const hp =
            numeric / 1.01387;

          return `${Math.round(
            hp * POWER_HP_TO_KW
          )} kW / ${Math.round(hp)} HP`;
        }
      }
    }

    const nestedCandidates = [
      value.power,
      value.output,
      value.maximum,
      value.max
    ];

    for (const nested of nestedCandidates) {
      const normalized =
        normalizePower(nested);

      if (normalized) {
        return normalized;
      }
    }

    const fallback =
      scalarText(value, 200);

    if (fallback) {
      return normalizePower(fallback);
    }

    return "";
  }

  const source =
    String(value)
      .replace(/,/g, ".")
      .replace(/\s+/g, " ")
      .trim();

  if (!source) {
    return "";
  }

  const kwMatch =
    source.match(
      /(\d+(?:\.\d+)?)\s*kW\b/i
    );

  if (kwMatch) {
    const kw = Number(
      kwMatch[1]
    );

    if (
      Number.isFinite(kw) &&
      kw > 0
    ) {
      return `${Math.round(kw)} kW / ${Math.round(
        kw * POWER_KW_TO_HP
      )} HP`;
    }
  }

  const hpMatch =
    source.match(
      /(\d+(?:\.\d+)?)\s*(?:HP|bhp|horsepower)\b/i
    );

  if (hpMatch) {
    const hp = Number(
      hpMatch[1]
    );

    if (
      Number.isFinite(hp) &&
      hp > 0
    ) {
      return `${Math.round(
        hp * POWER_HP_TO_KW
      )} kW / ${Math.round(hp)} HP`;
    }
  }

  const psMatch =
    source.match(
      /(\d+(?:\.\d+)?)\s*(?:PS|ks|CV)\b/i
    );

  if (psMatch) {
    const ps = Number(
      psMatch[1]
    );

    if (
      Number.isFinite(ps) &&
      ps > 0
    ) {
      const hp =
        ps / 1.01387;

      return `${Math.round(
        hp * POWER_HP_TO_KW
      )} kW / ${Math.round(hp)} HP`;
    }
  }

  const number =
    Number(
      source.replace(
        /[^\d.]/g,
        ""
      )
    );

  if (
    Number.isFinite(number) &&
    number > 0
  ) {
    if (
      number >= 20 &&
      number <= 1500
    ) {
      const kw =
        number > 250
          ? number * POWER_HP_TO_KW
          : number;

      const hp =
        kw * POWER_KW_TO_HP;

      return `${Math.round(kw)} kW / ${Math.round(hp)} HP`;
    }
  }

  return "";
}


function normalizePrice(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    const preferred = [
      value.price,
      value.amount,
      value.value,
      value.display,
      value.formatted,
      value.text
    ];

    for (const item of preferred) {
      const normalized =
        normalizePrice(item);

      if (normalized) {
        return normalized;
      }
    }

    return "";
  }

  const textValue =
    String(value)
      .replace(/\u00a0/g, " ")
      .trim();

  if (!textValue) {
    return "";
  }

  const lower =
    textValue.toLowerCase();

  const unavailable = [
    "n/a",
    "na",
    "unknown",
    "unknown price",
    "not available",
    "price unavailable",
    "unavailable",
    "contact dealer",
    "contact us",
    "on request",
    "price on request",
    "cena na vyziadanie",
    "cena na vyžiadanie",
    "cena nie je dostupná",
    "nezname",
    "neznáme"
  ];

  if (
    unavailable.some(
      item => lower === item
    )
  ) {
    return "";
  }

  const match =
    textValue.match(
      /(?:€|EUR)\s*([\d\s.,]+)|([\d\s.,]+)\s*(?:€|EUR)/i
    );

  if (!match) {
    return "";
  }

  const numberText =
    (match[1] || match[2] || "")
      .replace(/\s/g, "")
      .replace(
        /(\d)\.(?=\d{3}(?:\D|$))/g,
        "$1"
      )
      .replace(
        /,(\d{2})$/,
        ".$1"
      );

  const amount =
    Number(numberText);

  if (
    !Number.isFinite(amount) ||
    amount < 1000 ||
    amount > 10000000
  ) {
    return "";
  }

  const formatted =
    Math.round(amount)
      .toLocaleString(
        "sk-SK",
        {
          maximumFractionDigits: 0,
          useGrouping: true
        }
      )
      .replace(
        /\u00a0/g,
        " "
      );

  return `€${formatted}`;
}


function priceHasNumber(value) {
  return Boolean(
    normalizePrice(value)
  );
}


function buildVehicleName(car) {
  const brand =
    scalarText(
      car.brand ||
      car.make,
      100
    );

  const model =
    scalarText(
      car.model ||
      car.name,
      200
    );

  if (
    model &&
    brand &&
    !normalizedSearchString(model).startsWith(
      normalizedSearchString(brand)
    )
  ) {
    return `${brand} ${model}`.trim();
  }

  return model || brand || "";
}


function validateCars(parsed) {
  const source =
    Array.isArray(parsed)
      ? parsed
      : parsed?.cars;

  if (
    !Array.isArray(source)
  ) {
    throw new Error(
      "AI response does not contain cars array"
    );
  }

  if (source.length !== 3) {
    throw new Error(
      `AI returned ${source.length} cars instead of exactly 3`
    );
  }

  return source.map(
    (rawCar, index) => {
      if (
        !rawCar ||
        typeof rawCar !== "object"
      ) {
        throw new Error(
          `Invalid car object at position ${index + 1}`
        );
      }

      const name =
        buildVehicleName(
          rawCar
        );

      if (!name) {
        throw new Error(
          `Vehicle name missing at position ${index + 1}`
        );
      }

      const generation =
        scalarText(
          rawCar.generation,
          300
        );

      if (!generation) {
        throw new Error(
          `Generation missing for ${name}`
        );
      }

      const year =
        Number(rawCar.year);

      if (
        !Number.isFinite(year) ||
        year < 2000 ||
        year > 2100
      ) {
        throw new Error(
          `Invalid model year for ${name}`
        );
      }

      return {
        ...rawCar,
        name,
        generation,
        year,
        power:
          normalizePower(
            rawCar.power
          ),
        price:
          normalizePrice(
            rawCar.price
          ),
        seats:
          Number.isFinite(
            Number(rawCar.seats)
          )
            ? Math.round(
                Number(rawCar.seats)
              )
            : null,
        trunk:
          scalarText(
            rawCar.trunk,
            150
          ),
        drive:
          scalarText(
            rawCar.drive,
            150
          ),
        fuel:
          scalarText(
            rawCar.fuel,
            150
          ),
        transmission:
          scalarText(
            rawCar.transmission,
            150
          ),
        body:
          scalarText(
            rawCar.body,
            150
          ),
        reason:
          scalarText(
            rawCar.reason,
            1500
          ),
        pros:
          arrayText(
            rawCar.pros,
            8,
            500
          ),
        cons:
          arrayText(
            rawCar.cons,
            8,
            500
          ),
        maintenance:
          scalarText(
            rawCar.maintenance,
            1500
          ),
        image:
          scalarText(
            rawCar.image,
            3000
          ),
        photoSource:
          scalarText(
            rawCar.photoSource,
            3000
          ),
        configurator:
          scalarText(
            rawCar.configurator,
            3000
          ),
        priceSource:
          scalarText(
            rawCar.priceSource,
            3000
          ),
        priceVerified:
          rawCar.priceVerified === true,
        priceVerification:
          scalarText(
            rawCar.priceVerification,
            100
          ),
        dataSources:
          arrayText(
            rawCar.dataSources,
            MAX_DATA_SOURCES,
            1200
          ),
        imageCandidates:
          Array.isArray(
            rawCar.imageCandidates
          )
            ? rawCar.imageCandidates
            : []
      };
    }
  );
}


// ============================================================
// REQUEST NORMALIZATION
// ============================================================

function normalizeRequest(body) {
  const naturalLanguage =
    scalarText(
      body?.naturalLanguage ||
      body?.query ||
      body?.prompt ||
      body?.description,
      3000
    );

  const filters =
    body?.filters &&
    typeof body.filters === "object"
      ? body.filters
      : {};

  return {
    naturalLanguage,
    filters
  };
}


// ============================================================
// PROMPT
// ============================================================

function buildPrompt(request, mode = "research") {
  const filtersJson =
    JSON.stringify(
      request.filters || {},
      null,
      2
    );

  return `
You are CARMATCH AI, an automotive research assistant.

The user wants EXACTLY 3 real, currently available new cars.

USER REQUEST:
${request.naturalLanguage || "No natural-language request."}

FILTERS:
${filtersJson}

============================================================
CORE RULES
============================================================

1. Return EXACTLY 3 vehicles.
2. Recommend real production vehicles.
3. Prioritize current 2026 model-year vehicles and current generations.
4. Do not invent models, generations, prices, specifications, URLs or photos.
5. If a price cannot be verified, return an unavailable price instead of guessing.
6. Prefer official manufacturer sources.
7. Do not use concept cars unless the user explicitly asks for concepts.
8. Do not use discontinued generations when a current generation exists.
9. Respect the user's filters.
10. Explain briefly why each vehicle fits.
11. Output must be valid JSON only.
12. Output must be in Slovak.
13. Power must be returned as "XXX kW / YYY HP".
14. HP means mechanical horsepower.
15. Conversion:
    1 kW = 1.34102209 HP.
16. Never use PS, ks, CV, bhp or koní as the final power unit.
17. Do not return markdown.
18. Do not return commentary outside JSON.

============================================================
PRICE RULES
============================================================

- Prefer official manufacturer prices.
- Prefer Slovak or EU manufacturer pages.
- If the exact current price cannot be verified:
  "Cena na vyžiadanie"
- Never invent a price.
- Never use a monthly finance payment as vehicle price.
- Never use a deposit as vehicle price.
- Never use a used-car price as a new-car price.
- Never use a marketplace price as an official manufacturer price.

============================================================
URL RULES
============================================================

configurator:
- Must be a real official manufacturer configurator URL.
- Empty string if unavailable.

priceSource:
- Must be an official manufacturer URL supporting the price.
- Empty string if unavailable.

dataSources:
- Use real URLs.
- Prefer official manufacturer sources.
- Do not invent URLs.

============================================================
IMAGE RULES
============================================================

Do not generate image URLs.
The backend will independently find photos through Wikimedia Commons
and Wikipedia.

Return:
"image": "",
"photoSource": "",
"imageCandidates": []

============================================================
OUTPUT SCHEMA
============================================================

{
  "cars": [
    {
      "name": "",
      "generation": "",
      "year": 2026,
      "score": 0,
      "price": "",
      "power": "",
      "seats": 0,
      "trunk": "",
      "drive": "",
      "fuel": "",
      "transmission": "",
      "body": "",
      "reason": "",
      "pros": [],
      "cons": [],
      "maintenance": "",
      "image": "",
      "photoSource": "",
      "imageCandidates": [],
      "configurator": "",
      "priceSource": "",
      "priceVerified": false,
      "priceVerification": "unverified",
      "dataSources": []
    }
  ]
}

Exactly 3 cars.
`;
}


// ============================================================
// GROQ
// ============================================================

async function callGroqModel(
  request,
  modelConfig
) {
  if (!GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY missing"
    );
  }

  const prompt =
    buildPrompt(
      request,
      modelConfig.purpose
    );

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
        body: JSON.stringify({
          model:
            modelConfig.model,
          messages: [
            {
              role: "system",
              content: `
You are an expert automotive researcher.

Use live browser search whenever available.

Return ONLY valid JSON.

All factual automotive information must be current and
must refer to the requested/current vehicle generation.

Power format:
XXX kW / YYY HP

1 kW = 1.34102209 HP.

Never use PS, ks, CV, bhp or koní as the final power unit.

Do not invent prices or URLs.
`
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.1,
          max_completion_tokens: 9000,
          tools: [
            {
              type:
                "browser_search"
            }
          ],
          tool_choice:
            "required",
          reasoning_effort:
            "medium",
          include_reasoning:
            false
        })
      },
      modelConfig.timeout
    );

  const raw =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `Groq ${modelConfig.model} HTTP ${response.status}: ${raw.slice(0, 700)}`
    );
  }

  let apiData;

  try {
    apiData =
      JSON.parse(raw);
  } catch (_) {
    throw new Error(
      `Groq ${modelConfig.model} returned invalid API JSON`
    );
  }

  const content =
    extractMessageContent(
      apiData
    );

  if (!content) {
    throw new Error(
      `Groq ${modelConfig.model} returned empty content`
    );
  }

  const parsed =
    parseAIJson(content);

  const cars =
    validateCars(parsed);

  return {
    cars,
    provider:
      `Groq (${modelConfig.model})`,
    liveWeb: true,
    rawApi: apiData
  };
}


async function callGroqResearch(request) {
  let lastError = null;

  for (
    const modelConfig of GROQ_MODELS
  ) {
    try {
      console.log(
        `CARMATCH AI - trying Groq model: ${modelConfig.model}`
      );

      return await callGroqModel(
        request,
        modelConfig
      );
    } catch (error) {
      lastError =
        error;

      console.error(
        `CARMATCH AI - Groq ${modelConfig.model} failed:`,
        error
      );
    }
  }

  throw (
    lastError ||
    new Error(
      "All Groq models failed"
    )
  );
}


// ============================================================
// OPENROUTER
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

Return exactly 3 current real production vehicles.

Use current model generations.

Never invent prices, power, specifications or URLs.

Power:
XXX kW / YYY HP

1 kW = 1.34102209 HP.

Output must be in Slovak.
`
            },
            {
              role: "user",
              content:
                buildPrompt(
                  request,
                  "fallback"
                )
            }
          ],
          temperature: 0.1,
          max_tokens: 9000
        })
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
    extractMessageContent(
      apiData
    );

  if (!content) {
    throw new Error(
      `OpenRouter ${model} returned empty content`
    );
  }

  const parsed =
    parseAIJson(content);

  const cars =
    validateCars(parsed);

  return {
    cars,
    provider:
      `OpenRouter (${model})`,
    liveWeb: false,
    rawApi: apiData
  };
}


async function callOpenRouter(request) {
  let lastError = null;

  for (
    const model of OPENROUTER_FREE_MODELS
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
      "All OpenRouter FREE models failed"
    )
  );
}


// ============================================================
// OFFICIAL PRICE SOURCE EXTRACTION
// ============================================================

function extractOfficialSources(car) {
  const sources = [];

  if (
    isOfficialManufacturerURL(
      car.priceSource,
      car.name
    )
  ) {
    sources.push(
      car.priceSource
    );
  }

  for (
    const source of car.dataSources
  ) {
    if (
      isOfficialManufacturerURL(
        source,
        car.name
      )
    ) {
      sources.push(source);
    }
  }

  if (
    isOfficialManufacturerURL(
      car.configurator,
      car.name
    )
  ) {
    sources.push(
      car.configurator
    );
  }

  return [
    ...new Set(sources)
  ];
}


// ============================================================
// OFFICIAL PAGE TEXT EXTRACTION
// ============================================================

function stripHtml(html) {
  return String(html || "")
    .replace(
      /<script[\s\S]*?<\/script>/gi,
      " "
    )
    .replace(
      /<style[\s\S]*?<\/style>/gi,
      " "
    )
    .replace(
      /<noscript[\s\S]*?<\/noscript>/gi,
      " "
    )
    .replace(
      /<[^>]+>/g,
      " "
    )
    .replace(
      /&nbsp;/gi,
      " "
    )
    .replace(
      /&amp;/gi,
      "&"
    )
    .replace(
      /&quot;/gi,
      '"'
    )
    .replace(
      /&#39;/gi,
      "'"
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim()
    .slice(
      0,
      250000
    );
}


function normalizedSearchString(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[^a-z0-9]+/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


function carNameSearchTokens(car) {
  return normalizedSearchString(
    car.name
  )
    .split(" ")
    .filter(
      word => word.length >= 3
    )
    .slice(0, 6);
}


function formatDetectedEuroPrice(
  amount,
  fromPrefix = false
) {
  if (
    !Number.isFinite(amount) ||
    amount < 1000 ||
    amount > 10000000
  ) {
    return "";
  }

  const formatted =
    Math.round(amount)
      .toLocaleString(
        "sk-SK",
        {
          maximumFractionDigits: 0,
          useGrouping: true
        }
      )
      .replace(
        /\u00a0/g,
        " "
      );

  return `${
    fromPrefix ? "Od " : ""
  }€${formatted}`;
}


function extractOfficialEuroPriceFromText(
  visible,
  car
) {
  const source =
    String(visible || "");

  if (!source) {
    return "";
  }

  const lower =
    source.toLowerCase();

  const modelTokens =
    carNameSearchTokens(car);

  const priceRegex =
    /(?:od|from|starting(?:\s+at)?|cena\s+od|starting\s+from)?\s*(?:€|eur)\s*(\d{1,3}(?:[ .]\d{3})+(?:[,.]\d{2})?|\d{4,7}(?:[,.]\d{2})?)|(?:od|from|starting(?:\s+at)?|cena\s+od|starting\s+from)?\s*(\d{1,3}(?:[ .]\d{3})+(?:[,.]\d{2})?|\d{4,7}(?:[,.]\d{2})?)\s*(?:€|eur)/gi;

  const financeWords = [
    "mesac",
    "mesačne",
    "mesačne",
    "splát",
    "splátka",
    "per month",
    "monthly",
    "lease",
    "leasing",
    "deposit",
    "záloha"
  ];

  const priceWords = [
    "cena",
    "price",
    "od",
    "from",
    "starting",
    "starting at"
  ];

  const candidates = [];
  let match;

  while (
    (match =
      priceRegex.exec(
        lower
      )) !== null
  ) {
    const fullMatch =
      match[0];

    const numberText =
      match[1] ||
      match[2];

    if (!numberText) {
      continue;
    }

    const normalizedNumber =
      numberText
        .replace(
          /\s/g,
          ""
        )
        .replace(
          /\.(?=\d{3}(?:\D|$))/g,
          ""
        )
        .replace(
          /,(\d{2})$/,
          ".$1"
        );

    const amount =
      Number(
        normalizedNumber
      );

    if (
      !Number.isFinite(amount) ||
      amount < 1000 ||
      amount > 10000000
    ) {
      continue;
    }

    const start =
      Math.max(
        0,
        match.index - 1800
      );

    const end =
      Math.min(
        source.length,
        match.index + 1800
      );

    const context =
      lower.slice(
        start,
        end
      );

    const tokenHits =
      modelTokens.filter(
        token =>
          context.includes(token)
      ).length;

    if (
      modelTokens.length > 0 &&
      tokenHits === 0
    ) {
      continue;
    }

    const financeHit =
      financeWords.some(
        word =>
          context.includes(word)
      );

    if (financeHit) {
      continue;
    }

    const priceWordHit =
      priceWords.some(
        word =>
          context.includes(word)
      );

    const fromPrefix =
      /\b(?:od|from|starting|cena\s+od)\b/i.test(
        fullMatch
      );

    let score =
      tokenHits * 20;

    if (priceWordHit) {
      score += 10;
    }

    if (fromPrefix) {
      score += 8;
    }

    candidates.push({
      amount,
      score,
      fromPrefix
    });
  }

  if (
    candidates.length === 0
  ) {
    return "";
  }

  candidates.sort(
    (a, b) => {
      if (
        b.score !== a.score
      ) {
        return (
          b.score -
          a.score
        );
      }

      return (
        a.amount -
        b.amount
      );
    }
  );

  return formatDetectedEuroPrice(
    candidates[0].amount,
    candidates[0].fromPrefix
  );
}


async function fetchOfficialPageEvidence(
  url,
  car
) {
  if (
    !isOfficialManufacturerURL(
      url,
      car.name
    )
  ) {
    return {
      ok: false,
      reason:
        "non_official_url"
    };
  }

  if (
    !isSafeExternalHttpsURL(url)
  ) {
    return {
      ok: false,
      reason:
        "unsafe_url"
    };
  }

  try {
    const response =
      await fetchWithTimeout(
        url,
        {
          method: "GET",
          headers: {
            Accept:
              "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
            "User-Agent":
              "Mozilla/5.0 (compatible; CARMATCH-AI/7.0; +https://carmatchai.vercel.app)"
          }
        },
        OFFICIAL_PAGE_TIMEOUT
      );

    if (!response.ok) {
      return {
        ok: false,
        reason:
          `http_${response.status}`
      };
    }

    const contentType =
      String(
        response.headers.get(
          "content-type"
        ) || ""
      ).toLowerCase();

    if (
      !contentType.includes(
        "text/html"
      ) &&
      !contentType.includes(
        "application/xhtml+xml"
      ) &&
      !contentType.includes(
        "application/json"
      )
    ) {
      return {
        ok: false,
        reason:
          "unsupported_content_type"
      };
    }

    const raw =
      await response.text();

    const visible =
      stripHtml(raw);

    const haystack =
      normalizedSearchString(
        visible
      );

    const tokens =
      carNameSearchTokens(car);

    const tokenHits =
      tokens.filter(
        token =>
          haystack.includes(token)
      ).length;

    const hasModelMention =
      tokenHits >=
      Math.min(
        2,
        tokens.length
      );

    const detectedPrice =
      extractOfficialEuroPriceFromText(
        visible,
        car
      );

    const hasEuroPrice =
      Boolean(
        detectedPrice
      );

    const pricePhrases = [
      "od €",
      "od eur",
      "starting at",
      "from €",
      "price",
      "cena"
    ];

    const hasPricePhrase =
      pricePhrases.some(
        phrase =>
          haystack.includes(
            normalizedSearchString(
              phrase
            )
          )
      );

    return {
      ok:
        hasModelMention &&
        hasEuroPrice &&
        hasPricePhrase,
      modelMention:
        hasModelMention,
      euroPrice:
        hasEuroPrice,
      pricePhrase:
        hasPricePhrase,
      detectedPrice,
      contentLength:
        visible.length,
      host:
        hostnameOf(url),
      finalUrl:
        response.url || url
    };
  } catch (error) {
    return {
      ok: false,
      reason:
        error?.name ===
        "AbortError"
          ? "timeout"
          : "fetch_failed"
    };
  }
}


// ============================================================
// PRICE REPAIR / VERIFICATION
// ============================================================

function buildRepairRequest(
  request,
  cars
) {
  return `
${buildPrompt(
  request,
  "repair"
)}

============================================================
PREVIOUS CARS TO VERIFY
============================================================
${JSON.stringify(
  cars.map(
    car => ({
      name: car.name,
      generation:
        car.generation,
      year: car.year,
      power: car.power,
      price: car.price,
      priceSource:
        car.priceSource,
      dataSources:
        car.dataSources
    })
  ),
  null,
  2
)}

============================================================
REPAIR TASK
============================================================

For each of the SAME 3 vehicles:

1. Search the official manufacturer website.
2. Search the official Slovak/EU manufacturer site or configurator.
3. Verify the current new-vehicle starting price.
4. Verify the generation/model year.
5. Verify power from the current generation.
6. Return the official URL used for price verification.

NEVER guess.
NEVER use third-party marketplace prices as the primary price.

Return ONLY:
{
  "cars": [
    {
      "name": "",
      "generation": "",
      "year": 2026,
      "power": "",
      "price": "",
      "priceSource": "",
      "priceVerified": true,
      "officialSource": true,
      "dataSources": []
    }
  ]
}

Exactly 3 cars, in the same order.
`;
}


async function repairWithGroq(
  request,
  cars
) {
  if (!GROQ_API_KEY) {
    return null;
  }

  try {
    const model =
      GROQ_MODELS[1];

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
          body: JSON.stringify({
            model:
              model.model,
            messages: [
              {
                role: "system",
                content: `
You verify automotive facts with live browser search.

Use official manufacturer sources for prices whenever possible.

Return ONLY valid JSON.

Power must be XXX kW / YYY HP using mechanical HP.
1 kW = 1.34102209 HP.
Never output PS, ks, CV, bhp or koní as the final power unit.
`
              },
              {
                role: "user",
                content:
                  buildRepairRequest(
                    request,
                    cars
                  )
              }
            ],
            temperature: 0.05,
            max_completion_tokens: 7000,
            tools: [
              {
                type:
                  "browser_search"
              }
            ],
            tool_choice:
              "required",
            reasoning_effort:
              "medium",
            include_reasoning:
              false
          })
        },
        GROQ_REPAIR_TIMEOUT
      );

    const raw =
      await response.text();

    if (!response.ok) {
      throw new Error(
        `Groq repair HTTP ${response.status}: ${raw.slice(0, 500)}`
      );
    }

    const apiData =
      JSON.parse(raw);

    const content =
      extractMessageContent(
        apiData
      );

    if (!content) {
      throw new Error(
        "Groq repair returned empty content"
      );
    }

    return parseAIJson(
      content
    );
  } catch (error) {
    console.error(
      "CARMATCH AI price/fact repair failed:",
      error
    );

    return null;
  }
}


function mergeRepairData(
  cars,
  repaired
) {
  if (
    !repaired ||
    !Array.isArray(
      repaired.cars
    )
  ) {
    return cars;
  }

  return cars.map(
    (car, index) => {
      const patch =
        repaired.cars[index];

      if (
        !patch ||
        typeof patch !==
          "object"
      ) {
        return car;
      }

      const next = {
        ...car
      };

      if (
        patch.name &&
        normalizedSearchString(
          patch.name
        ) ===
          normalizedSearchString(
            car.name
          )
      ) {
        if (
          patch.generation
        ) {
          next.generation =
            scalarText(
              patch.generation,
              300
            );
        }

        const repairedYear =
          Number(
            patch.year
          );

        if (
          Number.isFinite(
            repairedYear
          ) &&
          repairedYear >=
            2000 &&
          repairedYear <=
            2100
        ) {
          next.year =
            repairedYear;
        }

        const repairedPower =
          normalizePower(
            patch.power
          );

        if (repairedPower) {
          next.power =
            repairedPower;
        }

        const repairedPrice =
          normalizePrice(
            patch.price
          );

        if (repairedPrice) {
          next.price =
            repairedPrice;
        }

        const repairedSource =
          scalarText(
            patch.priceSource,
            2000
          );

        if (repairedSource) {
          next.priceSource =
            repairedSource;
        }

        if (
          Array.isArray(
            patch.dataSources
          )
        ) {
          next.dataSources =
            arrayText(
              patch.dataSources,
              MAX_DATA_SOURCES,
              1200
            );
        }

        next.priceVerified =
          patch.priceVerified ===
          true;

        next.priceVerification =
          patch.priceVerified ===
          true
            ? "live-manufacturer-check"
            : "unverified";
      }

      return next;
    }
  );
}


async function verifyPricesAndSources(
  request,
  cars,
  liveWeb
) {
  let working =
    cars.map(
      car => ({
        ...car,
        price:
          normalizePrice(
            car.price
          ),
        power:
          normalizePower(
            car.power
          )
      })
    );

  // Validate and, where possible, directly fetch the official URL.
  const pageChecks =
    await Promise.all(
      working.map(
        async car => {
          const sources =
            extractOfficialSources(
              car
            );

          for (
            const source of sources.slice(
              0,
              2
            )
          ) {
            const evidence =
              await fetchOfficialPageEvidence(
                source,
                car
              );

            if (
              evidence.ok
            ) {
              return {
                carName:
                  car.name,
                verified:
                  true,
                source,
                detectedPrice:
                  evidence.detectedPrice ||
                  ""
              };
            }
          }

          return {
            carName:
              car.name,
            verified:
              false,
            source:
              ""
          };
        }
      )
    );

  working =
    working.map(
      (car, index) => {
        const check =
          pageChecks[index];

        if (
          check?.verified
        ) {
          return {
            ...car,
            price:
              check.detectedPrice ||
              car.price,
            priceVerified:
              true,
            priceVerification:
              "official-page-confirmed",
            priceSource:
              check.source
          };
        }

        return car;
      }
    );

  const needsRepair =
    working.some(
      car => {
        const officialSource =
          isOfficialManufacturerURL(
            car.priceSource,
            car.name
          );

        return (
          !priceHasNumber(
            car.price
          ) ||
          !officialSource
        );
      }
    );

  // Only perform the additional live repair call when needed. This keeps
  // ordinary requests fast while still giving missing/weak price data a
  // second research pass.
  if (
    needsRepair &&
    liveWeb &&
    GROQ_API_KEY
  ) {
    const repaired =
      await repairWithGroq(
        request,
        working
      );

    if (repaired) {
      working =
        mergeRepairData(
          working,
          repaired
        );
    }
  }

  // Re-check all official sources after the repair pass.
  const finalChecks =
    await Promise.all(
      working.map(
        async car => {
          const sources =
            extractOfficialSources(
              car
            );

          for (
            const source of sources.slice(
              0,
              2
            )
          ) {
            const evidence =
              await fetchOfficialPageEvidence(
                source,
                car
              );

            if (
              evidence.ok
            ) {
              return {
                verified:
                  true,
                source,
                detectedPrice:
                  evidence.detectedPrice ||
                  ""
              };
            }
          }

          return {
            verified:
              false,
            source:
              ""
          };
        }
      )
    );

  return working.map(
    (car, index) => {
      const check =
        finalChecks[index];

      const officialSource =
        isOfficialManufacturerURL(
          car.priceSource,
          car.name
        );

      const reliablePrice =
        priceHasNumber(
          car.price
        ) &&
        officialSource;

      if (
        check?.verified
      ) {
        return {
          ...car,
          price:
            check.detectedPrice ||
            car.price,
          priceVerified:
            true,
          priceVerification:
            "official-page-confirmed",
          priceSource:
            check.source
        };
      }

      // A live model with browser search may return a valid official price
      // page that blocks our server fetch (JS challenge, locale gateway, etc.).
      // In that case retain the price only when the source itself is a clean
      // official manufacturer URL. Otherwise do not display an unverified
      // numeric price.
      if (
        reliablePrice &&
        liveWeb
      ) {
        return {
          ...car,
          priceVerified:
            Boolean(
              car.priceVerified
            ),
          priceVerification:
            car.priceVerified
              ? car.priceVerification
              : "official-source-reported"
        };
      }

      return {
        ...car,
        price:
          "Cena na vyžiadanie",
        priceSource:
          officialSource
            ? car.priceSource
            : "",
        priceVerified:
          false,
        priceVerification:
          "unverified"
      };
    }
  );
}


// ============================================================
// CONFIGURATOR + SOURCE SANITIZATION
// ============================================================

function sanitizeCarLinks(car) {
  const configurator =
    isOfficialManufacturerURL(
      car.configurator,
      car.name
    )
      ? car.configurator
      : "";

  const priceSource =
    isOfficialManufacturerURL(
      car.priceSource,
      car.name
    )
      ? car.priceSource
      : "";

  const dataSources =
    car.dataSources.filter(
      source =>
        isSafeExternalHttpsURL(
          source
        )
    );

  return {
    ...car,
    configurator,
    priceSource,
    dataSources: [
      ...new Set(
        dataSources
      )
    ].slice(
      0,
      MAX_DATA_SOURCES
    )
  };
}


// ============================================================
// IMAGE SEARCH
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
  "bus",
  "tractor",
  "van"
];


function isRejectedImageTitle(
  title
) {
  const lower =
    String(title || "")
      .toLowerCase();

  return IMAGE_REJECT_WORDS.some(
    word =>
      lower.includes(word)
  );
}


function isWikimediaPhotoURL(
  url
) {
  if (
    !url ||
    typeof url !==
      "string"
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


function isImageExtension(
  url
) {
  const lower =
    String(url || "")
      .toLowerCase();

  return (
    /\.jpe?g(?:[?#]|$)/i.test(
      lower
    ) ||
    /\.png(?:[?#]|$)/i.test(
      lower
    ) ||
    /\.webp(?:[?#]|$)/i.test(
      lower
    )
  );
}


function cleanSearchText(
  value
) {
  return String(value || "")
    .replace(
      /()[\]{},:;|]/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


function vehicleSearchTerms(
  car
) {
  const name =
    cleanSearchText(
      buildVehicleName(
        car
      ) ||
        car.name
    );

  const generation =
    cleanSearchText(
      scalarText(
        car.generation,
        200
      )
    );

  const year =
    Number(car.year);

  return {
    name,
    generation,
    year:
      Number.isFinite(year)
        ? String(year)
        : ""
  };
}


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
      `${name} ${generation} ${year} car automobile`
    );

    queries.push(
      `${name} ${year} exterior production car`
    );

    queries.push(
      `${name} ${generation} exterior car`
    );
  }

  if (
    name &&
    generation
  ) {
    queries.push(
      `${name} ${generation} car automobile`
    );
  }

  if (
    name &&
    year
  ) {
    queries.push(
      `${name} ${year} car automobile`
    );

    queries.push(
      `${name} ${year} road car`
    );
  }

  if (name) {
    queries.push(
      `${name} car automobile`
    );

    queries.push(
      `${name} production car`
    );
  }

  return [
    ...new Set(
      queries
    )
  ].slice(
    0,
    7
  );
}


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
    const word of nameWords
  ) {
    if (
      combined.includes(word)
    ) {
      score += 8;
    }
  }

  for (
    const word of generationWords
  ) {
    if (
      combined.includes(word)
    ) {
      score += 10;
    }
  }

  if (
    year &&
    combined.includes(year)
  ) {
    score += 15;
  }

  if (
    combined.includes("car") ||
    combined.includes(
      "automobile"
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


function dedupeImageCandidates(
  candidates,
  car
) {
  const map =
    new Map();

  for (
    const candidate of candidates
  ) {
    if (!candidate?.image) {
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
      relevance < 15
    ) {
      continue;
    }

    if (
      !map.has(
        candidate.image
      )
    ) {
      map.set(
        candidate.image,
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

  const response =
    await fetchWithTimeout(
      `${WIKIMEDIA_API}?${params.toString()}`,
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
      data?.query?.pages ||
        {}
    );

  const candidates = [];

  for (
    const page of pages
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
      Number.isFinite(
        width
      ) &&
      Number.isFinite(
        height
      )
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

  const searchResponse =
    await fetchWithTimeout(
      `${WIKIPEDIA_API}?${searchParams.toString()}`,
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

  if (
    !searchResponse.ok
  ) {
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
      piprop:
        "thumbnail",
      pithumbsize:
        "1600",
      format: "json",
      origin: "*"
    });

  const imageResponse =
    await fetchWithTimeout(
      `${WIKIPEDIA_API}?${imageParams.toString()}`,
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

  if (
    !imageResponse.ok
  ) {
    throw new Error(
      `Wikipedia image HTTP ${imageResponse.status}`
    );
  }

  const imageData =
    await imageResponse.json();

  const pages =
    Object.values(
      imageData?.query?.pages ||
        {}
    );

  const candidates = [];

  for (
    const page of pages
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
    const result of commonsResults
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
      const result of wikipediaResults
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
// FINAL RESULT SANITIZATION
// ============================================================

function finalSanitizeCars(
  cars
) {
  return cars.map(
    (
      rawCar,
      index
    ) => {
      const car = {
        ...rawCar,
        name:
          buildVehicleName(
            rawCar
          ),
        generation:
          scalarText(
            rawCar.generation,
            300
          ),
        year:
          Number(
            rawCar.year
          ),
        score:
          Math.max(
            0,
            Math.min(
              100,
              Math.round(
                Number(
                  rawCar.score
                ) || 0
              )
            )
          ),
        price:
          normalizePrice(
            rawCar.price
          ) ||
          "Cena na vyžiadanie",
        power:
          normalizePower(
            rawCar.power
          ),
        seats:
          Number.isFinite(
            Number(
              rawCar.seats
            )
          )
            ? Math.round(
                Number(
                  rawCar.seats
                )
              )
            : null,
        trunk:
          scalarText(
            rawCar.trunk,
            150
          ),
        drive:
          scalarText(
            rawCar.drive,
            150
          ),
        fuel:
          scalarText(
            rawCar.fuel,
            150
          ),
        transmission:
          scalarText(
            rawCar.transmission,
            150
          ),
        body:
          scalarText(
            rawCar.body,
            150
          ),
        reason:
          scalarText(
            rawCar.reason,
            1500
          ) ||
          "Spĺňa zadané požiadavky používateľa.",
        pros:
          arrayText(
            rawCar.pros,
            8,
            500
          ),
        cons:
          arrayText(
            rawCar.cons,
            8,
            500
          ),
        maintenance:
          scalarText(
            rawCar.maintenance,
            1500
          ),
        image:
          isWikimediaPhotoURL(
            rawCar.image
          )
            ? rawCar.image
            : "",
        photoSource:
          isSafeExternalHttpsURL(
            rawCar.photoSource
          )
            ? rawCar.photoSource
            : "",
        configurator:
          scalarText(
            rawCar.configurator,
            2000
          ),
        priceSource:
          scalarText(
            rawCar.priceSource,
            2000
          ),
        priceVerified:
          rawCar.priceVerified ===
          true,
        priceVerification:
          scalarText(
            rawCar.priceVerification,
            100
          ) ||
          "unverified",
        dataSources:
          arrayText(
            rawCar.dataSources,
            MAX_DATA_SOURCES,
            1200
          ),
        imageCandidates:
          Array.isArray(
            rawCar.imageCandidates
          )
            ? rawCar.imageCandidates
                .map(
                  item => ({
                    url:
                      isWikimediaPhotoURL(
                        item?.url
                      )
                        ? item.url
                        : "",
                    source:
                      isSafeExternalHttpsURL(
                        item?.source
                      )
                        ? item.source
                        : "",
                    title:
                      scalarText(
                        item?.title,
                        500
                      )
                  })
                )
                .filter(
                  item =>
                    item.url
                )
                .slice(
                  0,
                  MAX_IMAGE_CANDIDATES
                )
            : []
      };

      if (!car.name) {
        throw new Error(
          `Vehicle name missing at position ${index + 1}`
        );
      }

      if (!car.generation) {
        throw new Error(
          `Generation missing for ${car.name}`
        );
      }

      if (
        !Number.isFinite(
          car.year
        ) ||
        car.year < 2000 ||
        car.year > 2100
      ) {
        throw new Error(
          `Invalid model year for ${car.name}`
        );
      }

      car.configurator =
        isOfficialManufacturerURL(
          car.configurator,
          car.name
        )
          ? car.configurator
          : "";

      car.priceSource =
        isOfficialManufacturerURL(
          car.priceSource,
          car.name
        )
          ? car.priceSource
          : "";

      const cleanCandidates =
        car.imageCandidates.filter(
          candidate =>
            candidate.title !==
            "[object Object]"
        );

      car.imageCandidates =
        cleanCandidates;

      if (
        !car.image &&
        cleanCandidates[0]
      ) {
        car.image =
          cleanCandidates[0].url;

        car.photoSource =
          cleanCandidates[0].source ||
          "";
      }

      return car;
    }
  );
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

  const startedAt =
    Date.now();

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

    const accessToken =
      authorization
        .slice(7)
        .trim();

    if (
      !accessToken ||
      accessToken.length >
        10000
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
      request.naturalLanguage
        .length > 3000 ||
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

    let searchCharged =
      false;

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
          remaining: 0
        }
      );
    }

    searchCharged =
      true;

    // --------------------------------------------------------
    // PRIMARY PROVIDER
    // --------------------------------------------------------

    let result = null;
    let groqFailed =
      false;
    let openRouterFailed =
      false;

    if (GROQ_API_KEY) {
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
            new Date().toISOString(),
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

    let remaining =
      null;

    if (
      searchCharged
    ) {
      const refund =
        await refundSearch(
          accessToken
        );

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
    }

    return sendJson(
      res,
      500,
      {
        error:
          "Search failed",
        message:
          "CARMATCH AI sa nepodarilo dokončiť toto vyhľadávanie. Vyhľadávanie sa nezapočítalo do limitu, ak bolo možné ho bezpečne vrátiť.",
        retryable:
          true,
        ...(remaining !==
        null
          ? {
              remaining
            }
          : {})
      }
    );
  }
}