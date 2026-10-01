// ============================================================
// CARMATCH AI - PRODUCTION BACKEND v12
// ============================================================
//
// FIX v12
// - Hard overall request deadline
// - Individual fetch timeouts
// - Response-body timeout protection
// - Groq fallback chain
// - Parallel OpenRouter FREE fallbacks
// - Parallel official price verification
// - Parallel Wikimedia/Wikipedia image search
// - Supabase anonymous auth
// - 5 searches/day
// - Refund on failed search
// - Separate short refund timeout
// - Exactly 3 unique cars
// - Defensive JSON parsing
// - Defensive normalization
// - SSRF-safe URL validation
// - Official manufacturer URL validation
// - kW + mechanical hp
// - No [object Object]
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
  process.env.SUPABASE_URL || "";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || "";

const GROQ_API_KEY =
  process.env.GROQ_API_KEY || "";

const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY || "";


// ============================================================
// GLOBAL SETTINGS
// ============================================================

const MAX_SEARCHES_PER_DAY = 5;

// Hard safety limit.
// The complete request should finish well before Vercel's
// 300-second runtime limit.
const REQUEST_HARD_TIMEOUT = 110000;

const SUPABASE_TIMEOUT = 7000;
const REFUND_TIMEOUT = 5000;

const GROQ_PRIMARY_TIMEOUT = 32000;
const GROQ_REPAIR_TIMEOUT = 15000;

const OPENROUTER_TIMEOUT = 19000;

const OFFICIAL_PAGE_TIMEOUT = 4500;

const WIKIMEDIA_TIMEOUT = 4500;
const WIKIPEDIA_TIMEOUT = 4500;

const RESPONSE_BODY_TIMEOUT = 5000;

const MAX_IMAGE_CANDIDATES = 8;
const MAX_IMAGE_QUERIES = 3;

const MAX_DATA_SOURCES = 12;

const MAX_BODY_TEXT = 7000;


// ============================================================
// POWER
// ============================================================

const POWER_KW_TO_HP =
  1.34102209;

const POWER_HP_TO_KW =
  1 / POWER_KW_TO_HP;


// ============================================================
// MODELS
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

const OPENROUTER_FREE_MODELS = [
  "qwen/qwen3.8-27b:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3.5-lightning:free",
  "openrouter/free"
];


// ============================================================
// THIRD-PARTY HOSTS
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


// ============================================================
// OFFICIAL MANUFACTURER DOMAINS
// ============================================================

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
    "cupra.com",
    "cupraofficial.com",
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
    "nissan.com",
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

  hyundai: [
    "hyundai.com",
    "hyundai.sk",
    "hyundai.de"
  ],

  kia: [
    "kia.com",
    "kia.sk",
    "kia.de"
  ],

  genesis: [
    "genesis.com"
  ],

  tesla: [
    "tesla.com"
  ],

  polestar: [
    "polestar.com"
  ],

  smart: [
    "smart.com"
  ],

  mini: [
    "mini.com",
    "mini.sk",
    "mini.de"
  ],

  fiat: [
    "fiat.com",
    "fiat.sk",
    "fiat.de"
  ],

  alfaromeo: [
    "alfaromeo.com",
    "alfaromeo.sk"
  ],

  jeep: [
    "jeep.com",
    "jeep.sk"
  ],

  dodge: [
    "dodge.com"
  ],

  chrysler: [
    "chrysler.com"
  ],

  ram: [
    "ramtrucks.com"
  ],

  chevrolet: [
    "chevrolet.com"
  ],

  cadillac: [
    "cadillac.com"
  ],

  suzuki: [
    "suzuki.com",
    "suzuki.sk"
  ],

  subaru: [
    "subaru.com",
    "subaru.sk"
  ],

  mitsubishi: [
    "mitsubishi-motors.com",
    "mitsubishi-motors.sk"
  ],

  dacia: [
    "dacia.com",
    "dacia.sk"
  ],

  mg: [
    "mgmotor.eu",
    "mgmotor.com"
  ],

  byd: [
    "byd.com",
    "bydauto.com"
  ],

  nio: [
    "nio.com"
  ],

  xpeng: [
    "xpeng.com"
  ],

  zeekr: [
    "zeekr.eu",
    "zeekr.com"
  ]
};

const OFFICIAL_MANUFACTURER_DOMAINS = [
  ...new Set(
    Object.values(OFFICIAL_DOMAIN_HINTS)
      .flat()
      .map(domain =>
        String(domain)
          .toLowerCase()
          .replace(/^https?:\/\//, "")
          .replace(/^www\./, "")
          .replace(/\/.*$/, "")
      )
  )
];


// ============================================================
// IMAGE REJECTION
// ============================================================

const IMAGE_REJECT_WORDS = [
  "logo",
  "icon",
  "interior",
  "dashboard",
  "cockpit",
  "steering",
  "engine",
  "wheel",
  "rim",
  "seat",
  "front-seat",
  "rear-seat",
  "trunk",
  "boot",
  "cargo",
  "technical",
  "diagram",
  "schematic",
  "blueprint",
  "brochure",
  "manual",
  "press-kit",
  "presskit",
  "concept",
  "prototype",
  "render",
  "drawing",
  "sketch",
  "toy",
  "model-car",
  "scale-model",
  "truck",
  "bus",
  "van",
  "motorcycle",
  "bike",
  "helmet",
  "person",
  "people"
];


// ============================================================
// GENERIC HELPERS
// ============================================================

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}


function scalarText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    const result =
      String(value).trim();

    return result || fallback;
  }

  if (Array.isArray(value)) {
    const result =
      value
        .map(item =>
          scalarText(item, "")
        )
        .filter(Boolean)
        .join(", ");

    return result || fallback;
  }

  if (isPlainObject(value)) {
    const preferredKeys = [
      "message",
      "error",
      "text",
      "value",
      "name",
      "description",
      "reason",
      "title",
      "url",
      "href",
      "src"
    ];

    for (const key of preferredKeys) {
      if (
        Object.prototype.hasOwnProperty.call(
          value,
          key
        )
      ) {
        const result =
          scalarText(
            value[key],
            ""
          );

        if (result) {
          return result;
        }
      }
    }

    try {
      const json =
        JSON.stringify(value);

      return (
        json &&
        json !== "{}"
      )
        ? json
        : fallback;
    } catch {
      return fallback;
    }
  }

  return fallback;
}


function text(value, fallback = "") {
  return scalarText(
    value,
    fallback
  );
}


function arrayText(value) {
  if (!Array.isArray(value)) {
    const single =
      scalarText(value, "");

    return single
      ? [single]
      : [];
  }

  return value
    .map(item =>
      scalarText(item, "")
    )
    .filter(Boolean);
}


function clamp(value, min, max) {
  return Math.min(
    Math.max(value, min),
    max
  );
}


function numberOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value === "number"
  ) {
    return Number.isFinite(value)
      ? value
      : null;
  }

  const raw =
    String(value)
      .replace(",", ".")
      .replace(/[^\d.+-]/g, "");

  if (!raw) {
    return null;
  }

  const result =
    Number(raw);

  return Number.isFinite(result)
    ? result
    : null;
}


function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}


// ============================================================
// REQUEST CONTEXT / HARD DEADLINE
// ============================================================

function createRequestContext() {
  const controller =
    new AbortController();

  const deadline =
    Date.now() +
    REQUEST_HARD_TIMEOUT;

  const timer =
    setTimeout(() => {
      controller.abort();
    }, REQUEST_HARD_TIMEOUT);

  return {
    controller,
    deadline,
    timer
  };
}


function clearRequestContext(context) {
  if (!context) {
    return;
  }

  clearTimeout(
    context.timer
  );
}


function remainingMs(context) {
  if (!context) {
    return 10000;
  }

  return Math.max(
    0,
    context.deadline -
      Date.now()
  );
}


function deadlineError() {
  return new Error(
    "Vyhľadávanie trvalo príliš dlho."
  );
}


async function promiseWithTimeout(
  promise,
  timeout
) {
  let timer;

  try {
    return await Promise.race([
      promise,

      new Promise((_, reject) => {
        timer =
          setTimeout(() => {
            reject(
              deadlineError()
            );
          }, timeout);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}


// ============================================================
// FETCH
// ============================================================

async function fetchWithTimeout(
  url,
  options = {},
  timeout = 10000,
  context = null
) {
  const remaining =
    remainingMs(context);

  if (remaining <= 0) {
    throw deadlineError();
  }

  const controller =
    new AbortController();

  const actualTimeout =
    Math.min(
      timeout,
      remaining
    );

  const timer =
    setTimeout(() => {
      controller.abort();
    }, actualTimeout);

  try {
    return await fetch(
      url,
      {
        ...options,
        signal:
          controller.signal
      }
    );
  } catch (error) {
    if (
      controller.signal.aborted
    ) {
      throw new Error(
        `Request timeout: ${url}`
      );
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}


async function readResponseText(
  response,
  timeout,
  context = null
) {
  const remaining =
    remainingMs(context);

  if (remaining <= 0) {
    throw deadlineError();
  }

  const actualTimeout =
    Math.min(
      timeout,
      remaining
    );

  return promiseWithTimeout(
    response.text(),
    actualTimeout
  );
}


async function readResponseJson(
  response,
  timeout,
  context = null
) {
  const raw =
    await readResponseText(
      response,
      timeout,
      context
    );

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(
      "Server vrátil neplatný JSON."
    );
  }
}


// ============================================================
// JSON PARSING
// ============================================================

function extractJsonText(raw) {
  let value =
    scalarText(raw, "");

  if (!value) {
    return "";
  }

  value =
    value.trim()
      .replace(
        /^```(?:json|JSON)?\s*/,
        ""
      )
      .replace(
        /\s*```$/,
        ""
      )
      .trim();

  const firstObject =
    value.indexOf("{");

  const firstArray =
    value.indexOf("[");

  let start = -1;

  if (
    firstObject >= 0 &&
    firstArray >= 0
  ) {
    start =
      Math.min(
        firstObject,
        firstArray
      );
  } else if (
    firstObject >= 0
  ) {
    start = firstObject;
  } else if (
    firstArray >= 0
  ) {
    start = firstArray;
  }

  if (start > 0) {
    value =
      value.slice(start);
  }

  const lastObject =
    value.lastIndexOf("}");

  const lastArray =
    value.lastIndexOf("]");

  const end =
    Math.max(
      lastObject,
      lastArray
    );

  if (end >= 0) {
    value =
      value.slice(
        0,
        end + 1
      );
  }

  return value.trim();
}


function parseAIJson(raw) {
  if (
    raw !== null &&
    typeof raw === "object"
  ) {
    return raw;
  }

  const cleaned =
    extractJsonText(raw);

  if (!cleaned) {
    throw new Error(
      "AI nevrátilo žiadne dáta."
    );
  }

  try {
    return JSON.parse(cleaned);
  } catch (firstError) {
    const repaired =
      cleaned
        .replace(
          /,\s*([}\]])/g,
          "$1"
        )
        .replace(
          /([{,]\s*)([A-Za-z0-9_]+)\s*:/g,
          '$1"$2":'
        );

    try {
      return JSON.parse(repaired);
    } catch {
      throw new Error(
        `AI vrátilo neplatný JSON: ${scalarText(
          firstError?.message,
          "parse error"
        )}`
      );
    }
  }
}


// ============================================================
// REQUEST NORMALIZATION
// ============================================================

function normalizeRequest(body) {
  const source =
    isPlainObject(body)
      ? body
      : {};

  const input =
    isPlainObject(source.filters)
      ? source.filters
      : source;

  return {
    naturalLanguage:
      text(
        source.naturalLanguage ??
        source.query ??
        source.prompt ??
        source.request ??
        "",
        ""
      ),

    budget:
      numberOrNull(
        input.budget ??
        input.maxBudget ??
        input.maxPrice
      ),

    seats:
      numberOrNull(
        input.seats ??
        input.seatCount
      ),

    power:
      numberOrNull(
        input.power ??
        input.powerKw ??
        input.minPower
      ),

    trunk:
      numberOrNull(
        input.trunk ??
        input.trunkLiters ??
        input.minTrunk
      ),

    drive:
      text(
        input.drive ??
        input.drivetrain ??
        "",
        ""
      ),

    fuel:
      text(
        input.fuel ??
        input.fuelType ??
        "",
        ""
      ),

    body:
      text(
        input.body ??
        input.bodyType ??
        "",
        ""
      ),

    style:
      text(
        input.style ??
        "",
        ""
      ),

    length:
      numberOrNull(
        input.length ??
        input.maxLength ??
        input.maxLengthMm
      ),

    year:
      numberOrNull(
        input.year ??
        input.minYear
      ),

    avoid:
      text(
        input.avoid ??
        input.avoidBrands ??
        "",
        ""
      )
  };
}


// ============================================================
// REQUEST SUMMARY
// ============================================================

function buildRequestSummary(request) {
  const parts = [];

  if (request.naturalLanguage) {
    parts.push(
      `Používateľova požiadavka: ${request.naturalLanguage}`
    );
  }

  if (request.budget !== null) {
    parts.push(
      `Maximálny rozpočet: ${request.budget} EUR`
    );
  }

  if (request.seats !== null) {
    parts.push(
      `Počet miest: ${request.seats}`
    );
  }

  if (request.power !== null) {
    parts.push(
      `Minimálny výkon: ${request.power} kW`
    );
  }

  if (request.trunk !== null) {
    parts.push(
      `Minimálny kufor: ${request.trunk} l`
    );
  }

  if (request.drive) {
    parts.push(
      `Pohon: ${request.drive}`
    );
  }

  if (request.fuel) {
    parts.push(
      `Palivo: ${request.fuel}`
    );
  }

  if (request.body) {
    parts.push(
      `Karoséria: ${request.body}`
    );
  }

  if (request.style) {
    parts.push(
      `Štýl: ${request.style}`
    );
  }

  if (request.length !== null) {
    parts.push(
      `Maximálna dĺžka: ${request.length} mm`
    );
  }

  if (request.year !== null) {
    parts.push(
      `Minimálny rok: ${request.year}`
    );
  }

  if (request.avoid) {
    parts.push(
      `Vynechať značky: ${request.avoid}`
    );
  }

  return parts.join("\n");
}


// ============================================================
// SUPABASE USER
// ============================================================

async function verifyUser(
  accessToken,
  context
) {
  if (!SUPABASE_URL) {
    throw new Error(
      "SUPABASE_URL nie je nastavené."
    );
  }

  if (!SUPABASE_ANON_KEY) {
    throw new Error(
      "SUPABASE_ANON_KEY nie je nastavené."
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
      SUPABASE_TIMEOUT,
      context
    );

  if (!response.ok) {
    throw new Error(
      `Supabase user verification failed (${response.status})`
    );
  }

  return readResponseJson(
    response,
    RESPONSE_BODY_TIMEOUT,
    context
  );
}


// ============================================================
// SUPABASE RPC
// ============================================================

async function callSupabaseRPC(
  functionName,
  accessToken,
  body = {},
  context = null,
  timeout = SUPABASE_TIMEOUT
) {
  if (!SUPABASE_URL) {
    throw new Error(
      "SUPABASE_URL nie je nastavené."
    );
  }

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

        body:
          JSON.stringify(body)
      },
      timeout,
      context
    );

  const raw =
    await readResponseText(
      response,
      RESPONSE_BODY_TIMEOUT,
      context
    );

  let data = null;

  if (raw) {
    try {
      data =
        JSON.parse(raw);
    } catch {
      data = raw;
    }
  }

  if (!response.ok) {
    const error =
      new Error(
        `Supabase RPC ${functionName} failed (${response.status})`
      );

    error.status =
      response.status;

    error.data =
      data;

    throw error;
  }

  return data;
}


// ============================================================
// USAGE
// ============================================================

function normalizeUsageResult(result) {
  if (
    result === null ||
    result === undefined
  ) {
    return {
      allowed: true,
      remaining:
        MAX_SEARCHES_PER_DAY - 1
    };
  }

  if (
    typeof result === "boolean"
  ) {
    return {
      allowed: result,
      remaining:
        result
          ? MAX_SEARCHES_PER_DAY - 1
          : 0
    };
  }

  if (
    typeof result === "number"
  ) {
    const remaining =
      clamp(
        Math.floor(result),
        0,
        MAX_SEARCHES_PER_DAY
      );

    return {
      allowed:
        remaining > 0,
      remaining
    };
  }

  if (
    typeof result === "string"
  ) {
    const trimmed =
      result.trim();

    if (
      trimmed.toLowerCase() ===
      "true"
    ) {
      return {
        allowed: true,
        remaining:
          MAX_SEARCHES_PER_DAY - 1
      };
    }

    if (
      trimmed.toLowerCase() ===
      "false"
    ) {
      return {
        allowed: false,
        remaining: 0
      };
    }

    const numeric =
      numberOrNull(trimmed);

    if (numeric !== null) {
      const remaining =
        clamp(
          Math.floor(numeric),
          0,
          MAX_SEARCHES_PER_DAY
        );

      return {
        allowed:
          remaining > 0,
        remaining
      };
    }

    try {
      return normalizeUsageResult(
        JSON.parse(trimmed)
      );
    } catch {
      return {
        allowed: true,
        remaining:
          MAX_SEARCHES_PER_DAY - 1
      };
    }
  }

  if (
    Array.isArray(result)
  ) {
    if (result.length === 0) {
      return {
        allowed: true,
        remaining:
          MAX_SEARCHES_PER_DAY - 1
      };
    }

    return normalizeUsageResult(
      result[0]
    );
  }

  if (isPlainObject(result)) {
    const allowedRaw =
      result.allowed ??
      result.success ??
      result.ok ??
      result.can_search ??
      result.canSearch;

    const remainingRaw =
      result.remaining ??
      result.remaining_searches ??
      result.remainingSearches ??
      result.searches_remaining ??
      result.left;

    const countRaw =
      result.count ??
      result.search_count ??
      result.searches_used ??
      result.used ??
      result.usage;

    let remaining =
      numberOrNull(
        remainingRaw
      );

    if (
      remaining === null &&
      countRaw !== undefined
    ) {
      const used =
        numberOrNull(
          countRaw
        );

      if (used !== null) {
        remaining =
          clamp(
            MAX_SEARCHES_PER_DAY -
              Math.floor(used),
            0,
            MAX_SEARCHES_PER_DAY
          );
      }
    }

    if (remaining === null) {
      remaining =
        MAX_SEARCHES_PER_DAY - 1;
    }

    const allowed =
      allowedRaw === undefined
        ? remaining > 0
        : Boolean(allowedRaw);

    return {
      allowed,
      remaining:
        clamp(
          Math.floor(remaining),
          0,
          MAX_SEARCHES_PER_DAY
        )
    };
  }

  return {
    allowed: true,
    remaining:
      MAX_SEARCHES_PER_DAY - 1
  };
}


// ============================================================
// CONSUME SEARCH
// ============================================================

async function useSearch(
  accessToken,
  context
) {
  const candidates = [
    "use_search",
    "consume_search",
    "increment_search"
  ];

  let lastError = null;

  for (const functionName of candidates) {
    try {
      const result =
        await callSupabaseRPC(
          functionName,
          accessToken,
          {},
          context,
          SUPABASE_TIMEOUT
        );

      return normalizeUsageResult(
        result
      );
    } catch (error) {
      lastError =
        error;
    }
  }

  throw (
    lastError ||
    new Error(
      "Nepodarilo sa overiť limit vyhľadávaní."
    )
  );
}


// ============================================================
// REFUND
// ============================================================

async function refundSearch(
  accessToken
) {
  const candidates = [
    "refund_search",
    "refund_search_usage"
  ];

  let lastError = null;

  for (const functionName of candidates) {
    try {
      const result =
        await callSupabaseRPC(
          functionName,
          accessToken,
          {},
          null,
          REFUND_TIMEOUT
        );

      return normalizeUsageResult(
        result
      );
    } catch (error) {
      lastError =
        error;
    }
  }

  throw (
    lastError ||
    new Error(
      "Refund RPC nie je dostupné."
    )
  );
}


// ============================================================
// URL SAFETY
// ============================================================

function isPrivateHostname(hostname) {
  const host =
    String(hostname || "")
      .toLowerCase();

  if (!host) {
    return true;
  }

  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1"
  ) {
    return true;
  }

  if (
    host.endsWith(".localhost") ||
    host.endsWith(".local")
  ) {
    return true;
  }

  const ipv4 =
    host.match(
      /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/
    );

  if (ipv4) {
    const parts =
      ipv4
        .slice(1)
        .map(Number);

    const a = parts[0];
    const b = parts[1];

    if (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) {
      return true;
    }

    if (
      a === 100 &&
      b >= 64 &&
      b <= 127
    ) {
      return true;
    }

    if (
      a === 192 &&
      b === 0
    ) {
      return true;
    }

    if (
      a === 198 &&
      (b === 18 || b === 19)
    ) {
      return true;
    }

    if (a >= 224) {
      return true;
    }
  }

  return false;
}


function isThirdPartyHost(hostname) {
  const host =
    String(hostname || "")
      .toLowerCase()
      .replace(/^www\./, "");

  return OBVIOUS_THIRD_PARTY_HOSTS.some(
    blocked =>
      host === blocked ||
      host.endsWith(`.${blocked}`)
  );
}


function safeHttpUrl(
  value,
  options = {}
) {
  const raw =
    scalarText(value, "");

  if (!raw) {
    return null;
  }

  try {
    const parsed =
      new URL(raw);

    if (
      parsed.protocol !== "https:" &&
      parsed.protocol !== "http:"
    ) {
      return null;
    }

    const hostname =
      parsed.hostname
        .toLowerCase()
        .replace(/^www\./, "");

    if (
      isPrivateHostname(hostname)
    ) {
      return null;
    }

    if (
      options.rejectThirdParty &&
      isThirdPartyHost(hostname)
    ) {
      return null;
    }

    return parsed.href;
  } catch {
    return null;
  }
}


// ============================================================
// BRAND
// ============================================================

function normalizeBrand(brand) {
  const normalized =
    normalizeKey(brand);

  const aliases = {
    mercedesbenz: "mercedes",
    mercedesamg: "mercedes",
    alfaromeo: "alfaromeo"
  };

  return (
    aliases[normalized] ||
    normalized
  );
}


// ============================================================
// OFFICIAL URL
// ============================================================

function isOfficialManufacturerURL(
  url,
  brand
) {
  const safe =
    safeHttpUrl(url);

  if (!safe) {
    return false;
  }

  let parsed;

  try {
    parsed =
      new URL(safe);
  } catch {
    return false;
  }

  const hostname =
    parsed.hostname
      .toLowerCase()
      .replace(/^www\./, "");

  const normalizedBrand =
    normalizeBrand(brand);

  const knownDomains =
    OFFICIAL_DOMAIN_HINTS[
      normalizedBrand
    ];

  if (
    Array.isArray(knownDomains)
  ) {
    return knownDomains.some(
      domain => {
        const clean =
          String(domain)
            .toLowerCase()
            .replace(/^www\./, "");

        return (
          hostname === clean ||
          hostname.endsWith(`.${clean}`)
        );
      }
    );
  }

  return OFFICIAL_MANUFACTURER_DOMAINS.some(
    domain =>
      hostname === domain ||
      hostname.endsWith(`.${domain}`)
  );
}


// ============================================================
// POWER
// ============================================================

function normalizePower(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return {
      kw: null,
      hp: null
    };
  }

  if (isPlainObject(value)) {
    if (
      value.kw !== undefined ||
      value.kW !== undefined ||
      value.powerKw !== undefined
    ) {
      return normalizePower(
        value.kw ??
        value.kW ??
        value.powerKw
      );
    }

    if (value.hp !== undefined) {
      return normalizePower(
        `${value.hp} hp`
      );
    }

    return {
      kw: null,
      hp: null
    };
  }

  const raw =
    String(value)
      .trim()
      .toLowerCase();

  if (!raw) {
    return {
      kw: null,
      hp: null
    };
  }

  const match =
    raw.match(
      /-?\d+(?:[.,]\d+)?/
    );

  if (!match) {
    return {
      kw: null,
      hp: null
    };
  }

  const number =
    Number(
      match[0].replace(",", ".")
    );

  if (!Number.isFinite(number)) {
    return {
      kw: null,
      hp: null
    };
  }

  const hpDetected =
    /\bhp\b|\bhk\b|\bps\b|\bks\b|\bbhp\b|\bhorsepower\b/.test(
      raw
    );

  const kwDetected =
    /\bkw\b|\bkilowatt/.test(
      raw
    );

  if (
    hpDetected &&
    !kwDetected
  ) {
    const kw =
      number *
      POWER_HP_TO_KW;

    return {
      kw:
        Math.round(kw * 10) / 10,

      hp:
        Math.round(number)
    };
  }

  return {
    kw:
      Math.round(number * 10) / 10,

    hp:
      Math.round(
        number *
        POWER_KW_TO_HP
      )
  };
}


// ============================================================
// PRICE
// ============================================================

function normalizePrice(value) {
  const unavailable = {
    text: "Cena nie je dostupná",
    amount: null,
    currency: null
  };

  if (
    value === null ||
    value === undefined
  ) {
    return unavailable;
  }

  if (isPlainObject(value)) {
    return normalizePrice(
      value.amount ??
      value.price ??
      value.value ??
      value.text
    );
  }

  const raw =
    String(value).trim();

  if (!raw) {
    return unavailable;
  }

  const upper =
    raw.toUpperCase();

  let currency = null;

  if (
    upper.includes("EUR") ||
    raw.includes("€")
  ) {
    currency = "EUR";
  } else if (
    upper.includes("USD") ||
    raw.includes("$")
  ) {
    currency = "USD";
  } else if (
    upper.includes("GBP") ||
    raw.includes("£")
  ) {
    currency = "GBP";
  } else if (
    upper.includes("CHF")
  ) {
    currency = "CHF";
  } else if (
    upper.includes("AED")
  ) {
    currency = "AED";
  } else if (
    upper.includes("CZK") ||
    raw.includes("Kč")
  ) {
    currency = "CZK";
  }

  const match =
    raw.match(
      /\d[\d\s.,]*/
    );

  if (!match) {
    return {
      text: raw,
      amount: null,
      currency
    };
  }

  let numeric =
    match[0]
      .replace(/\s/g, "");

  const hasComma =
    numeric.includes(",");

  const hasDot =
    numeric.includes(".");

  if (
    hasComma &&
    hasDot
  ) {
    const lastComma =
      numeric.lastIndexOf(",");

    const lastDot =
      numeric.lastIndexOf(".");

    if (lastComma > lastDot) {
      numeric =
        numeric
          .replace(/\./g, "")
          .replace(",", ".");
    } else {
      numeric =
        numeric
          .replace(/,/g, "");
    }
  } else if (hasComma) {
    const decimals =
      numeric.length -
      numeric.lastIndexOf(",") -
      1;

    if (
      decimals === 1 ||
      decimals === 2
    ) {
      numeric =
        numeric.replace(",", ".");
    } else {
      numeric =
        numeric.replace(/,/g, "");
    }
  } else if (hasDot) {
    const decimals =
      numeric.length -
      numeric.lastIndexOf(".") -
      1;

    if (
      decimals === 1 ||
      decimals === 2
    ) {
      numeric =
        numeric.replace(".", ".");
    } else {
      numeric =
        numeric.replace(/\./g, "");
    }
  }

  const amount =
    Number(numeric);

  return {
    text: raw,
    amount:
      Number.isFinite(amount)
        ? amount
        : null,
    currency
  };
}


function priceHasNumber(price) {
  return (
    price &&
    numberOrNull(price.amount) !== null
  );
}


// ============================================================
// RESEARCH PROMPT
// ============================================================

function buildResearchPrompt(request) {
  return `
You are CARMATCH AI, an automotive research assistant.

Use CURRENT web information.

Return EXACTLY THREE different real production cars that match the user's request.

CRITICAL RULES:

1. Research current market information.
2. Prefer the newest/current generation.
3. Prefer current model-year information.
4. Never invent facts.
5. Never invent prices.
6. Never invent URLs.
7. Prefer official manufacturer websites.
8. Prefer official manufacturer price pages.
9. Prefer official configurators.
10. If a verified current price cannot be found, use exactly:
"Cena nie je dostupná"
11. Power must be in kW and mechanical hp.
12. Display only mechanical hp, never PS/ks/bhp.
13. Return exactly 3 vehicles.
14. Vehicles must be genuinely different.
15. No concepts.
16. No prototypes.
17. No motorcycles.
18. No trucks.
19. No buses.
20. No vans unless explicitly requested.
21. No used cars unless explicitly requested.
22. Respect the user filters.
23. Do not invent missing specifications.
24. Slovak explanations are preferred.
25. imageCandidates should normally be empty.
26. The backend will search for vehicle images separately.

Research:
- exact brand
- exact model
- current generation
- model year
- powertrain
- power kW
- mechanical horsepower
- seats
- luggage capacity
- drivetrain
- fuel/powertrain
- current new-car price
- official price URL
- official configurator URL
- why it matches
- pros
- cons
- maintenance
- reliable sources

USER REQUEST:

${buildRequestSummary(request)}

Return ONLY JSON.

Required structure:

{
  "cars": [
    {
      "name": "Brand Model",
      "generation": "Current generation",
      "year": 2026,
      "score": 90,
      "price": "€...",
      "officialPriceUrl": "https://...",
      "configuratorUrl": "https://...",
      "powerKw": 180,
      "powerHp": 241,
      "seats": 5,
      "trunkLiters": 600,
      "drive": "AWD",
      "fuel": "Petrol",
      "body": "SUV",
      "style": "Sporty",
      "lengthMm": 4800,
      "reason": "Slovak explanation",
      "pros": ["..."],
      "cons": ["..."],
      "maintenance": "Slovak explanation",
      "sources": [
        {
          "title": "Source",
          "url": "https://..."
        }
      ],
      "imageCandidates": []
    }
  ]
}
`.trim();
}


// ============================================================
// REPAIR PROMPT
// ============================================================

function buildRepairPrompt(originalOutput) {
  return `
Repair this automotive AI response.

Return ONLY valid JSON.

Requirements:
- EXACTLY 3 cars.
- No markdown.
- No commentary.
- Do not invent facts.
- Do not invent prices.
- Do not invent URLs.
- Missing price = "Cena nie je dostupná".
- Power = kW + mechanical hp.
- Arrays contain strings.
- URLs must be HTTP/HTTPS.
- Preserve valid factual information.
- Remove invalid objects.
- Keep the vehicles different.

Original output:

${scalarText(
  originalOutput,
  ""
).slice(0, MAX_BODY_TEXT)}

Return:

{
  "cars": [
    {
      "name": "",
      "generation": "",
      "year": null,
      "score": null,
      "price": "",
      "officialPriceUrl": "",
      "configuratorUrl": "",
      "powerKw": null,
      "powerHp": null,
      "seats": null,
      "trunkLiters": null,
      "drive": "",
      "fuel": "",
      "body": "",
      "style": "",
      "lengthMm": null,
      "reason": "",
      "pros": [],
      "cons": [],
      "maintenance": "",
      "sources": [],
      "imageCandidates": []
    }
  ]
}
`.trim();
}


// ============================================================
// GROQ
// ============================================================

async function callGroq(
  modelConfig,
  prompt,
  context
) {
  if (!GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY nie je nastavený."
    );
  }

  const body = {
    model:
      modelConfig.model,

    messages: [
      {
        role: "system",
        content:
          "You are a precise automotive research engine. Use web search when necessary. Return only valid JSON."
      },

      {
        role: "user",
        content: prompt
      }
    ],

    temperature: 0.1,

    max_completion_tokens: 6000,

    tools: [
      {
        type: "browser_search"
      }
    ]
  };

  const response =
    await fetchWithTimeout(
      GROQ_URL,
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${GROQ_API_KEY}`,

          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(body)
      },
      modelConfig.timeout,
      context
    );

  const raw =
    await readResponseText(
      response,
      RESPONSE_BODY_TIMEOUT,
      context
    );

  if (!response.ok) {
    throw new Error(
      `Groq ${modelConfig.model} failed (${response.status}): ${raw.slice(
        0,
        800
      )}`
    );
  }

  let data;

  try {
    data =
      JSON.parse(raw);
  } catch {
    throw new Error(
      "Groq vrátil neplatnú HTTP odpoveď."
    );
  }

  const content =
    data?.choices?.[0]?.message?.content ??
    data?.choices?.[0]?.text ??
    "";

  if (!content) {
    throw new Error(
      "Groq nevrátil obsah."
    );
  }

  return scalarText(
    content,
    ""
  );
}


// ============================================================
// OPENROUTER
// ============================================================

async function callOpenRouter(
  model,
  prompt,
  context
) {
  if (!OPENROUTER_API_KEY) {
    throw new Error(
      "OPENROUTER_API_KEY nie je nastavený."
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

        body:
          JSON.stringify({
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

            max_tokens: 6000
          })
      },
      OPENROUTER_TIMEOUT,
      context
    );

  const raw =
    await readResponseText(
      response,
      RESPONSE_BODY_TIMEOUT,
      context
    );

  if (!response.ok) {
    throw new Error(
      `OpenRouter ${model} failed (${response.status}): ${raw.slice(
        0,
        800
      )}`
    );
  }

  let data;

  try {
    data =
      JSON.parse(raw);
  } catch {
    throw new Error(
      "OpenRouter vrátil neplatnú HTTP odpoveď."
    );
  }

  const content =
    data?.choices?.[0]?.message?.content ??
    data?.choices?.[0]?.text ??
    "";

  if (!content) {
    throw new Error(
      "OpenRouter nevrátil obsah."
    );
  }

  return scalarText(
    content,
    ""
  );
}


// ============================================================
// AI RESULT
// ============================================================

function normalizeAIResult(value) {
  const root =
    isPlainObject(value)
      ? value
      : {};

  let cars =
    Array.isArray(root.cars)
      ? root.cars
      : [];

  if (
    cars.length === 0 &&
    Array.isArray(root.results)
  ) {
    cars =
      root.results;
  }

  return {
    cars:
      cars
        .filter(isPlainObject)
        .map(normalizeCar)
  };
}


// ============================================================
// CAR NORMALIZATION
// ============================================================

function normalizeCar(source) {
  const car =
    isPlainObject(source)
      ? source
      : {};

  const power =
    normalizePower(
      car.power ??
      car.powerKw ??
      car.kw ??
      car.hp
    );

  const price =
    normalizePrice(
      car.price ??
      car.priceText ??
      car.officialPrice
    );

  const year =
    numberOrNull(
      car.year ??
      car.modelYear
    );

  const score =
    numberOrNull(
      car.score ??
      car.matchScore
    );

  const seats =
    numberOrNull(
      car.seats ??
      car.seatCount
    );

  const trunkLiters =
    numberOrNull(
      car.trunkLiters ??
      car.trunk ??
      car.boot
    );

  const lengthMm =
    numberOrNull(
      car.lengthMm ??
      car.length
    );

  return {
    name:
      text(
        car.name ??
        car.model ??
        "",
        "Neznáme vozidlo"
      ),

    generation:
      text(
        car.generation ??
        car.generationName ??
        "",
        ""
      ),

    year,

    score:
      score === null
        ? null
        : clamp(score, 0, 100),

    price:
      price.text,

    priceAmount:
      price.amount,

    currency:
      price.currency,

    officialPriceUrl:
      safeHttpUrl(
        car.officialPriceUrl ??
        car.priceUrl ??
        car.officialPriceLink
      ),

    configuratorUrl:
      safeHttpUrl(
        car.configuratorUrl ??
        car.configurator
      ),

    power:
      power.kw === null
        ? ""
        : `${power.kw} kW / ${power.hp} hp`,

    powerKw:
      power.kw,

    powerHp:
      power.hp,

    seats,

    trunk:
      trunkLiters === null
        ? text(
            car.trunk ??
            car.boot ??
            "",
            ""
          )
        : `${trunkLiters} l`,

    trunkLiters,

    length:
      lengthMm === null
        ? text(
            car.length,
            ""
          )
        : `${lengthMm} mm`,

    lengthMm,

    drive:
      normalizeDrive(
        car.drive ??
        car.drivetrain
      ),

    fuel:
      text(
        car.fuel ??
        car.fuelType ??
        "",
        ""
      ),

    body:
      text(
        car.body ??
        car.bodyType ??
        "",
        ""
      ),

    style:
      text(
        car.style ??
        "",
        ""
      ),

    reason:
      text(
        car.reason ??
        car.matchReason ??
        car.description ??
        "",
        ""
      ),

    pros:
      arrayText(
        car.pros ??
        car.advantages
      ),

    cons:
      arrayText(
        car.cons ??
        car.disadvantages
      ),

    maintenance:
      text(
        car.maintenance ??
        car.maintenanceInfo ??
        "",
        ""
      ),

    sources:
      normalizeSources(
        car.sources ??
        car.dataSources ??
        car.source
      ),

    imageCandidates:
      normalizeImageCandidates(
        car.imageCandidates ??
        car.images ??
        car.image
      )
  };
}


// ============================================================
// DRIVE
// ============================================================

function normalizeDrive(value) {
  const raw =
    text(value, "");

  if (!raw) {
    return "";
  }

  const normalized =
    normalizeKey(raw);

  if (
    normalized.includes("allwheel") ||
    normalized.includes("awd") ||
    normalized.includes("4x4")
  ) {
    return "AWD";
  }

  if (
    normalized.includes("rearwheel") ||
    normalized === "rwd" ||
    normalized.includes("zadny")
  ) {
    return "RWD";
  }

  if (
    normalized.includes("frontwheel") ||
    normalized === "fwd" ||
    normalized.includes("predny")
  ) {
    return "FWD";
  }

  return raw;
}


// ============================================================
// SOURCES
// ============================================================

function normalizeSources(value) {
  let items = [];

  if (Array.isArray(value)) {
    items = value;
  } else if (value) {
    items = [value];
  }

  const result = [];

  for (const item of items) {
    let url = "";
    let title = "";

    if (
      typeof item === "string"
    ) {
      url =
        safeHttpUrl(item);

      title =
        item;
    } else if (
      isPlainObject(item)
    ) {
      url =
        safeHttpUrl(
          item.url ??
          item.href ??
          item.link
        );

      title =
        text(
          item.title ??
          item.name ??
          item.label ??
          item.url ??
          "",
          "Zdroj"
        );
    }

    if (!url) {
      continue;
    }

    if (
      result.some(
        source =>
          source.url === url
      )
    ) {
      continue;
    }

    result.push({
      title,
      url
    });

    if (
      result.length >=
      MAX_DATA_SOURCES
    ) {
      break;
    }
  }

  return result;
}


// ============================================================
// IMAGE CANDIDATES
// ============================================================

function normalizeImageCandidates(value) {
  let items = [];

  if (Array.isArray(value)) {
    items = value;
  } else if (value) {
    items = [value];
  }

  const result = [];

  for (const item of items) {
    let url = "";

    if (
      typeof item === "string"
    ) {
      url =
        safeHttpUrl(item);
    } else if (
      isPlainObject(item)
    ) {
      url =
        safeHttpUrl(
          item.url ??
          item.src ??
          item.href ??
          item.image
        );
    }

    if (!url) {
      continue;
    }

    if (
      isRejectedImageUrl(url)
    ) {
      continue;
    }

    if (
      result.includes(url)
    ) {
      continue;
    }

    result.push(url);

    if (
      result.length >=
      MAX_IMAGE_CANDIDATES
    ) {
      break;
    }
  }

  return result;
}


function isRejectedImageUrl(url) {
  const lower =
    String(url || "")
      .toLowerCase();

  return IMAGE_REJECT_WORDS.some(
    word =>
      lower.includes(word)
  );
}


// ============================================================
// IMAGE TERMS
// ============================================================

function imageSearchTerms(car) {
  const name =
    text(car.name, "");

  const generation =
    text(car.generation, "");

  const year =
    numberOrNull(car.year);

  const base =
    [
      name,
      generation,
      year
    ]
      .filter(Boolean)
      .join(" ");

  if (!base) {
    return [];
  }

  return [
    `${base} exterior`,
    `${base} front exterior`,
    `${base} side exterior`
  ];
}


// ============================================================
// WIKIMEDIA SEARCH
// ============================================================

async function fetchWikimediaSearch(
  query,
  context
) {
  const params =
    new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: query,
      gsrnamespace: "6",
      gsrlimit: "8",
      prop: "imageinfo",
      iiprop: "url|mime|size|extmetadata",
      iiurlwidth: "1200",
      format: "json",
      origin: "*"
    });

  const response =
    await fetchWithTimeout(
      `${WIKIMEDIA_API}?${params}`,
      {
        method: "GET",

        headers: {
          Accept:
            "application/json"
        }
      },
      WIKIMEDIA_TIMEOUT,
      context
    );

  if (!response.ok) {
    throw new Error(
      `Wikimedia failed (${response.status})`
    );
  }

  const data =
    await readResponseJson(
      response,
      RESPONSE_BODY_TIMEOUT,
      context
    );

  const pages =
    Object.values(
      data?.query?.pages || {}
    );

  return pages
    .map(page => {
      const info =
        page?.imageinfo?.[0];

      const url =
        safeHttpUrl(
          info?.thumburl ??
          info?.url
        );

      if (!url) {
        return null;
      }

      const metadata =
        info?.extmetadata || {};

      const description =
        scalarText(
          metadata
            ?.ImageDescription
            ?.value ??
          metadata
            ?.ObjectName
            ?.value ??
          page.title,
          ""
        );

      return {
        url,

        title:
          text(
            page.title,
            ""
          ),

        description,

        source:
          "Wikimedia Commons",

        width:
          numberOrNull(
            info?.width
          ),

        height:
          numberOrNull(
            info?.height
          )
      };
    })
    .filter(Boolean);
}


// ============================================================
// WIKIPEDIA SEARCH
// ============================================================

async function fetchWikipediaImages(
  query,
  context
) {
  const searchParams =
    new URLSearchParams({
      action: "query",
      list: "search",
      srsearch: query,
      srlimit: "4",
      srnamespace: "0",
      format: "json",
      origin: "*"
    });

  const searchResponse =
    await fetchWithTimeout(
      `${WIKIPEDIA_API}?${searchParams}`,
      {
        method: "GET",

        headers: {
          Accept:
            "application/json"
        }
      },
      WIKIPEDIA_TIMEOUT,
      context
    );

  if (!searchResponse.ok) {
    throw new Error(
      `Wikipedia search failed (${searchResponse.status})`
    );
  }

  const searchData =
    await readResponseJson(
      searchResponse,
      RESPONSE_BODY_TIMEOUT,
      context
    );

  const titles =
    (
      searchData
        ?.query
        ?.search ||
      []
    )
      .map(item =>
        text(
          item.title,
          ""
        )
      )
      .filter(Boolean);

  if (titles.length === 0) {
    return [];
  }

  const imageParams =
    new URLSearchParams({
      action: "query",
      prop: "pageimages|images",
      titles:
        titles.join("|"),
      piprop: "thumbnail",
      pithumbsize: "1200",
      imlimit: "8",
      format: "json",
      origin: "*"
    });

  const imageResponse =
    await fetchWithTimeout(
      `${WIKIPEDIA_API}?${imageParams}`,
      {
        method: "GET",

        headers: {
          Accept:
            "application/json"
        }
      },
      WIKIPEDIA_TIMEOUT,
      context
    );

  if (!imageResponse.ok) {
    throw new Error(
      `Wikipedia images failed (${imageResponse.status})`
    );
  }

  const imageData =
    await readResponseJson(
      imageResponse,
      RESPONSE_BODY_TIMEOUT,
      context
    );

  const pages =
    Object.values(
      imageData
        ?.query
        ?.pages ||
      {}
    );

  return pages
    .map(page => {
      const url =
        safeHttpUrl(
          page
            ?.thumbnail
            ?.source
        );

      if (!url) {
        return null;
      }

      return {
        url,

        title:
          text(
            page.title,
            ""
          ),

        description:
          text(
            page.title,
            ""
          ),

        source:
          "Wikipedia",

        width:
          numberOrNull(
            page
              ?.thumbnail
              ?.width
          ),

        height:
          numberOrNull(
            page
              ?.thumbnail
              ?.height
          )
      };
    })
    .filter(Boolean);
}


// ============================================================
// IMAGE SCORING
// ============================================================

function normalizeImageTokenSet(value) {
  return [
    ...new Set(
      text(value, "")
        .toLowerCase()
        .normalize("NFD")
        .replace(
          /[\u0300-\u036f]/g,
          ""
        )
        .split(/[^a-z0-9]+/)
        .filter(
          token =>
            token.length >= 2
        )
    )
  ];
}


function scoreImageCandidate(
  candidate,
  car
) {
  const haystack =
    [
      candidate?.title,
      candidate?.description,
      candidate?.url
    ]
      .map(value =>
        text(
          value,
          ""
        ).toLowerCase()
      )
      .join(" ");

  const nameTokens =
    normalizeImageTokenSet(
      car?.name
    );

  const generationTokens =
    normalizeImageTokenSet(
      car?.generation
    );

  let score = 0;

  for (const token of nameTokens) {
    if (
      token.length >= 3 &&
      haystack.includes(token)
    ) {
      score += 12;
    }
  }

  for (
    const token of generationTokens
  ) {
    if (
      token.length >= 3 &&
      haystack.includes(token)
    ) {
      score += 5;
    }
  }

  if (
    /\bfront\b|\bside\b|\brear\b|\bexterior\b/.test(
      haystack
    )
  ) {
    score += 10;
  }

  if (
    candidate?.width >= 700
  ) {
    score += 4;
  }

  if (
    candidate?.height >= 400
  ) {
    score += 3;
  }

  if (
    /\binterior\b|\bdashboard\b|\bcockpit\b|\bengine\b/.test(
      haystack
    )
  ) {
    score -= 100;
  }

  if (
    isRejectedImageUrl(
      candidate?.url
    )
  ) {
    score -= 200;
  }

  return score;
}


// ============================================================
// IMAGE ENGINE
// ============================================================

async function findCarImages(
  car,
  context
) {
  const queries =
    imageSearchTerms(car);

  if (
    queries.length === 0
  ) {
    return [];
  }

  const queryResults =
    await Promise.all(
      queries.map(
        async query => {
          try {
            return await fetchWikimediaSearch(
              query,
              context
            );
          } catch {
            return [];
          }
        }
      )
    );

  const candidates =
    queryResults.flat();

  // Wikipedia is only an optional fallback.
  // Run it only when Wikimedia returned too few images.
  if (
    candidates.length <
    MAX_IMAGE_CANDIDATES
  ) {
    try {
      const wiki =
        await fetchWikipediaImages(
          text(car.name, ""),
          context
        );

      candidates.push(...wiki);
    } catch {
      // Optional fallback.
    }
  }

  const unique =
    new Map();

  for (
    const candidate of candidates
  ) {
    if (!candidate?.url) {
      continue;
    }

    if (
      isRejectedImageUrl(
        candidate.url
      )
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
        {
          ...candidate,

          score:
            scoreImageCandidate(
              candidate,
              car
            )
        }
      );
    }
  }

  return [
    ...unique.values()
  ]
    .sort(
      (a, b) =>
        b.score - a.score
    )
    .slice(
      0,
      MAX_IMAGE_CANDIDATES
    )
    .map(item => ({
      url:
        item.url,

      title:
        text(
          item.title,
          ""
        ),

      source:
        text(
          item.source,
          ""
        )
    }));
}


// ============================================================
// OFFICIAL PRICE PAGE
// ============================================================

async function fetchOfficialPage(
  url,
  context
) {
  const safe =
    safeHttpUrl(url);

  if (!safe) {
    return null;
  }

  const response =
    await fetchWithTimeout(
      safe,
      {
        method: "GET",

        headers: {
          Accept:
            "text/html,application/xhtml+xml"
        },

        redirect: "follow"
      },
      OFFICIAL_PAGE_TIMEOUT,
      context
    );

  if (!response.ok) {
    return null;
  }

  const contentType =
    response.headers.get(
      "content-type"
    ) || "";

  if (
    !contentType.includes("text/html") &&
    !contentType.includes(
      "application/xhtml+xml"
    )
  ) {
    return null;
  }

  const html =
    await readResponseText(
      response,
      RESPONSE_BODY_TIMEOUT,
      context
    );

  return {
    url:
      response.url ||
      safe,

    html:
      html.slice(
        0,
        MAX_BODY_TEXT
      )
  };
}


function containsPriceEvidence(html) {
  const source =
    String(html || "")
      .toLowerCase();

  return (
    /€\s?\d/.test(source) ||
    /\d[\d\s.,]{2,}\s?€/.test(source) ||
    /\beur\b/.test(source) ||
    /starting price/.test(source) ||
    /from price/.test(source) ||
    /base price/.test(source)
  );
}


// ============================================================
// PRICE VERIFICATION
// ============================================================

async function verifyOneCarPrice(
  car,
  context
) {
  const brand =
    text(car.name, "")
      .split(/\s+/)[0];

  let officialUrl =
    safeHttpUrl(
      car.officialPriceUrl
    );

  if (
    officialUrl &&
    !isOfficialManufacturerURL(
      officialUrl,
      brand
    )
  ) {
    officialUrl = null;
  }

  let officialVerified =
    false;

  if (officialUrl) {
    try {
      const page =
        await fetchOfficialPage(
          officialUrl,
          context
        );

      if (
        page &&
        containsPriceEvidence(
          page.html
        )
      ) {
        officialVerified = true;
      }
    } catch {
      officialVerified = false;
    }
  }

  const sources =
    normalizeSources(
      car.sources
    );

  if (
    officialUrl &&
    !sources.some(
      source =>
        source.url ===
        officialUrl
    )
  ) {
    sources.unshift({
      title:
        "Oficiálna stránka výrobcu",

      url:
        officialUrl
    });
  }

  const price =
    normalizePrice(
      car.price
    );

  return {
    ...car,

    price:
      priceHasNumber(price)
        ? price.text
        : "Cena nie je dostupná",

    priceAmount:
      priceHasNumber(price)
        ? price.amount
        : null,

    currency:
      priceHasNumber(price)
        ? price.currency
        : null,

    officialPriceUrl:
      officialUrl,

    officialPriceVerified:
      officialVerified,

    sources:
      sources.slice(
        0,
        MAX_DATA_SOURCES
      )
  };
}


async function verifyPricesAndSources(
  cars,
  context
) {
  return Promise.all(
    cars.map(car =>
      verifyOneCarPrice(
        car,
        context
      )
    )
  );
}


// ============================================================
// FINAL SANITIZATION
// ============================================================

function finalSanitizeCars(cars) {
  return cars
    .slice(0, 3)
    .map(car => {
      const power =
        normalizePower(
          car.power ??
          car.powerKw ??
          car.kw
        );

      const trunkLiters =
        numberOrNull(
          car.trunkLiters
        );

      const price =
        normalizePrice(
          car.price
        );

      const lengthMm =
        numberOrNull(
          car.lengthMm
        );

      return {
        name:
          text(
            car.name,
            "Neznáme vozidlo"
          ),

        generation:
          text(
            car.generation,
            ""
          ),

        year:
          numberOrNull(
            car.year
          ),

        score:
          car.score === null ||
          car.score === undefined
            ? null
            : clamp(
                numberOrNull(
                  car.score
                ) ?? 0,
                0,
                100
              ),

        price:
          priceHasNumber(price)
            ? price.text
            : "Cena nie je dostupná",

        priceAmount:
          priceHasNumber(price)
            ? price.amount
            : null,

        currency:
          priceHasNumber(price)
            ? price.currency
            : null,

        officialPriceUrl:
          safeHttpUrl(
            car.officialPriceUrl
          ) || "",

        configuratorUrl:
          safeHttpUrl(
            car.configuratorUrl
          ) || "",

        officialPriceVerified:
          Boolean(
            car.officialPriceVerified
          ),

        power:
          power.kw === null
            ? ""
            : `${power.kw} kW / ${power.hp} hp`,

        powerKw:
          power.kw,

        powerHp:
          power.hp,

        seats:
          numberOrNull(
            car.seats
          ),

        trunk:
          trunkLiters === null
            ? text(
                car.trunk,
                ""
              )
            : `${trunkLiters} l`,

        trunkLiters,

        length:
          lengthMm === null
            ? text(
                car.length,
                ""
              )
            : `${lengthMm} mm`,

        lengthMm,

        drive:
          text(
            car.drive,
            ""
          ),

        fuel:
          text(
            car.fuel,
            ""
          ),

        body:
          text(
            car.body,
            ""
          ),

        style:
          text(
            car.style,
            ""
          ),

        reason:
          text(
            car.reason,
            ""
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
            ""
          ),

        sources:
          normalizeSources(
            car.sources
          ),

        imageCandidates:
          normalizeImageCandidates(
            car.imageCandidates
          )
      };
    });
}


// ============================================================
// BASIC CAR VALIDATION
// ============================================================

function validateCar(
  car,
  request
) {
  if (
    !isPlainObject(car)
  ) {
    return false;
  }

  if (
    !text(car.name, "")
  ) {
    return false;
  }

  if (
    request.budget !== null &&
    numberOrNull(car.priceAmount) !== null &&
    numberOrNull(car.priceAmount) >
      request.budget
  ) {
    return false;
  }

  if (
    request.seats !== null &&
    numberOrNull(car.seats) !== null &&
    numberOrNull(car.seats) <
      request.seats
  ) {
    return false;
  }

  if (
    request.power !== null &&
    numberOrNull(car.powerKw) !== null &&
    numberOrNull(car.powerKw) <
      request.power
  ) {
    return false;
  }

  if (
    request.trunk !== null &&
    numberOrNull(car.trunkLiters) !== null &&
    numberOrNull(car.trunkLiters) <
      request.trunk
  ) {
    return false;
  }

  if (
    request.length !== null &&
    numberOrNull(car.lengthMm) !== null &&
    numberOrNull(car.lengthMm) >
      request.length
  ) {
    return false;
  }

  if (
    request.year !== null &&
    numberOrNull(car.year) !== null &&
    numberOrNull(car.year) <
      request.year
  ) {
    return false;
  }

  if (request.avoid) {
    const avoid =
      request.avoid
        .split(/[,;]+/)
        .map(value =>
          normalizeKey(value)
        )
        .filter(Boolean);

    const brand =
      normalizeBrand(
        text(
          car.name,
          ""
        ).split(/\s+/)[0]
      );

    if (
      avoid.includes(brand)
    ) {
      return false;
    }
  }

  return true;
}


// ============================================================
// UNIQUE THREE-CAR SELECTION
// ============================================================

function selectThreeCars(
  cars,
  request
) {
  if (!Array.isArray(cars)) {
    return [];
  }

  const result = [];
  const seen = new Set();

  for (const car of cars) {
    if (
      !isPlainObject(car)
    ) {
      continue;
    }

    const normalizedName =
      normalizeKey(
        car.name
      );

    if (!normalizedName) {
      continue;
    }

    if (
      seen.has(
        normalizedName
      )
    ) {
      continue;
    }

    if (
      !validateCar(
        car,
        request
      )
    ) {
      continue;
    }

    seen.add(
      normalizedName
    );

    result.push(car);

    if (
      result.length === 3
    ) {
      break;
    }
  }

  return result;
}


// ============================================================
// SINGLE AI PARSER
// ============================================================

function parseProviderResult(
  raw,
  request
) {
  const parsed =
    normalizeAIResult(
      parseAIJson(raw)
    );

  const selected =
    selectThreeCars(
      parsed.cars,
      request
    );

  if (
    selected.length !== 3
  ) {
    throw new Error(
      `AI neposkytlo 3 použiteľné vozidlá (${parsed.cars.length} nájdených).`
    );
  }

  return {
    cars: selected
  };
}


// ============================================================
// AI RESEARCH
// ============================================================

async function runAIResearch(
  request,
  context
) {
  const researchPrompt =
    buildResearchPrompt(
      request
    );

  const errors = [];

  // ----------------------------------------------------------
  // GROQ PRIMARY
  // ----------------------------------------------------------

  if (GROQ_API_KEY) {
    try {
      const raw =
        await callGroq(
          GROQ_MODELS[0],
          researchPrompt,
          context
        );

      return {
        data:
          parseProviderResult(
            raw,
            request
          ),

        provider:
          "groq",

        model:
          GROQ_MODELS[0].model
      };
    } catch (error) {
      errors.push(
        `Groq 120B: ${scalarText(
          error?.message,
          "unknown error"
        )}`
      );
    }
  }

  // ----------------------------------------------------------
  // GROQ REPAIR / FALLBACK
  // ----------------------------------------------------------

  if (GROQ_API_KEY) {
    try {
      const raw =
        await callGroq(
          GROQ_MODELS[1],
          buildRepairPrompt(
            errors.join("\n")
          ),
          context
        );

      return {
        data:
          parseProviderResult(
            raw,
            request
          ),

        provider:
          "groq",

        model:
          GROQ_MODELS[1].model
      };
    } catch (error) {
      errors.push(
        `Groq 20B: ${scalarText(
          error?.message,
          "unknown error"
        )}`
      );
    }
  }

  // ----------------------------------------------------------
  // OPENROUTER FREE FALLBACKS
  //
  // Run them in parallel instead of sequentially.
  // This prevents 4 x timeout accumulation.
  // ----------------------------------------------------------

  if (OPENROUTER_API_KEY) {
    const attempts =
      OPENROUTER_FREE_MODELS.map(
        async model => {
          const raw =
            await callOpenRouter(
              model,
              researchPrompt,
              context
            );

          return {
            data:
              parseProviderResult(
                raw,
                request
              ),

            provider:
              "openrouter",

            model
          };
        }
      );

    try {
      return await Promise.any(
        attempts
      );
    } catch (aggregateError) {
      for (
        const error of
          aggregateError?.errors ||
          []
      ) {
        errors.push(
          scalarText(
            error?.message,
            "OpenRouter error"
          )
        );
      }
    }
  }

  throw new Error(
    `Všetci AI poskytovatelia zlyhali. ${errors
      .slice(0, 8)
      .join(" | ")}`
  );
}


// ============================================================
// FINAL PIPELINE
// ============================================================

async function buildFinalCars(
  request,
  context
) {
  if (
    remainingMs(context) <= 0
  ) {
    throw deadlineError();
  }

  const aiResult =
    await runAIResearch(
      request,
      context
    );

  let cars =
    aiResult.data.cars
      .slice(0, 3)
      .map(normalizeCar);

  if (
    cars.length !== 3
  ) {
    throw new Error(
      "AI neposkytlo presne tri vozidlá."
    );
  }

  // ----------------------------------------------------------
  // Price verification
  // ----------------------------------------------------------

  cars =
    await verifyPricesAndSources(
      cars,
      context
    );

  // ----------------------------------------------------------
  // Images for all 3 cars in parallel
  // ----------------------------------------------------------

  cars =
    await Promise.all(
      cars.map(
        async car => {
          let images =
            normalizeImageCandidates(
              car.imageCandidates
            );

          if (
            images.length === 0
          ) {
            try {
              images =
                await findCarImages(
                  car,
                  context
                );
            } catch {
              images = [];
            }
          }

          return {
            ...car,

            imageCandidates:
              images
          };
        }
      )
    );

  // ----------------------------------------------------------
  // Final sanitize
  // ----------------------------------------------------------

  cars =
    finalSanitizeCars(
      cars
    );

  // ----------------------------------------------------------
  // Exact 3 contract
  // ----------------------------------------------------------

  if (
    cars.length !== 3
  ) {
    throw new Error(
      "Výsledky neobsahujú presne tri vozidlá."
    );
  }

  return {
    cars,

    provider:
      aiResult.provider,

    model:
      aiResult.model
  };
}


// ============================================================
// RESPONSE
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
// MAIN HANDLER
// ============================================================

export default async function handler(
  req,
  res
) {
  let accessToken = "";
  let searchCharged = false;

  const context =
    createRequestContext();

  try {
    // --------------------------------------------------------
    // METHOD
    // --------------------------------------------------------

    if (
      req.method !== "POST"
    ) {
      return sendJson(
        res,
        405,
        {
          error:
            "Method Not Allowed",

          message:
            "Použi POST request."
        }
      );
    }

    // --------------------------------------------------------
    // AUTHORIZATION
    // --------------------------------------------------------

    const authorization =
      req.headers?.authorization ||
      req.headers?.Authorization ||
      "";

    accessToken =
      authorization.startsWith(
        "Bearer "
      )
        ? authorization
            .slice(7)
            .trim()
        : "";

    if (
      !accessToken ||
      accessToken.length > 10000
    ) {
      return sendJson(
        res,
        401,
        {
          error:
            "Unauthorized",

          message:
            "Chýba platná Authorization relácia."
        }
      );
    }

    // --------------------------------------------------------
    // VERIFY USER
    // --------------------------------------------------------

    const user =
      await verifyUser(
        accessToken,
        context
      );

    if (!user?.id) {
      return sendJson(
        res,
        401,
        {
          error:
            "Unauthorized",

          message:
            "Supabase relácia nie je platná."
        }
      );
    }

    // --------------------------------------------------------
    // BODY
    // --------------------------------------------------------

    let rawBody =
      req.body;

    if (
      typeof rawBody === "string"
    ) {
      try {
        rawBody =
          JSON.parse(
            rawBody
          );
      } catch {
        return sendJson(
          res,
          400,
          {
            error:
              "Invalid JSON",

            message:
              "Požiadavka obsahuje neplatný JSON."
          }
        );
      }
    }

    const request =
      normalizeRequest(
        rawBody
      );

    const isEmpty =
      !request.naturalLanguage &&
      request.budget === null &&
      request.seats === null &&
      request.power === null &&
      request.trunk === null &&
      !request.drive &&
      !request.fuel &&
      !request.body &&
      !request.style &&
      request.length === null &&
      request.year === null &&
      !request.avoid;

    if (isEmpty) {
      return sendJson(
        res,
        400,
        {
          error:
            "Empty request",

          message:
            "Zadaj požiadavku alebo aspoň jeden filter."
        }
      );
    }

    // --------------------------------------------------------
    // CONSUME SEARCH
    // --------------------------------------------------------

    const usage =
      await useSearch(
        accessToken,
        context
      );

    if (
      !usage.allowed
    ) {
      return sendJson(
        res,
        429,
        {
          error:
            "Daily search limit reached",

          message:
            "Dosiahol si denný limit 5 vyhľadávaní.",

          remaining:
            0
        }
      );
    }

    searchCharged = true;

    // --------------------------------------------------------
    // HARD DEADLINE CHECK
    // --------------------------------------------------------

    if (
      remainingMs(context) <= 0
    ) {
      throw deadlineError();
    }

    // --------------------------------------------------------
    // AI + DATA + IMAGES
    // --------------------------------------------------------

    const finalResult =
      await buildFinalCars(
        request,
        context
      );

    // --------------------------------------------------------
    // REMAINING
    // --------------------------------------------------------

    const remaining =
      numberOrNull(
        usage.remaining
      ) !== null
        ? clamp(
            Math.floor(
              usage.remaining
            ),
            0,
            MAX_SEARCHES_PER_DAY
          )
        : Math.max(
            0,
            MAX_SEARCHES_PER_DAY - 1
          );

    // --------------------------------------------------------
    // SUCCESS
    // --------------------------------------------------------

    searchCharged = false;

    return sendJson(
      res,
      200,
      {
        cars:
          finalResult.cars,

        remaining,

        ai: {
          provider:
            finalResult.provider,

          model:
            finalResult.model
        }
      }
    );
  } catch (error) {
    console.error(
      "CARMATCH AI backend error:",
      error
    );

    // --------------------------------------------------------
    // REFUND
    // --------------------------------------------------------

    if (
      searchCharged &&
      accessToken
    ) {
      try {
        const refund =
          await refundSearch(
            accessToken
          );

        searchCharged = false;

        const remaining =
          numberOrNull(
            refund?.remaining
          );

        const originalMessage =
          scalarText(
            error?.message,
            "Vyhľadávanie sa nepodarilo dokončiť."
          );

        const payload = {
          error:
            "Search failed and was refunded",

          message:
            `${originalMessage} Vyhľadávanie bolo vrátené a nebolo spotrebované.`,

          refunded:
            true
        };

        if (
          remaining !== null
        ) {
          payload.remaining =
            clamp(
              Math.floor(remaining),
              0,
              MAX_SEARCHES_PER_DAY
            );
        }

        return sendJson(
          res,
          503,
          payload
        );
      } catch (refundError) {
        console.error(
          "CARMATCH AI refund error:",
          refundError
        );

        return sendJson(
          res,
          500,
          {
            error:
              "Internal Server Error",

            message:
              scalarText(
                error?.message,
                "Vyhľadávanie sa nepodarilo dokončiť."
              ),

            refunded:
              false,

            refundError:
              "Refund RPC sa nepodarilo vykonať."
          }
        );
      }
    }

    // --------------------------------------------------------
    // NORMAL ERROR
    // --------------------------------------------------------

    return sendJson(
      res,
      500,
      {
        error:
          "Internal Server Error",

        message:
          scalarText(
            error?.message,
            "Vyhľadávanie sa nepodarilo dokončiť."
          )
      }
    );
  } finally {
    clearRequestContext(
      context
    );
  }
}