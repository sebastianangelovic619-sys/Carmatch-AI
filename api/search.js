// ============================================================
// CARMATCH AI - PRODUCTION BACKEND v11
// ============================================================
//
// Core features
// - Supabase anonymous auth
// - 5 searches / day via Supabase RPC
// - Groq GPT-OSS + REAL browser_search
// - OpenRouter FREE fallbacks
// - Official-manufacturer price priority
// - Server-side official price URL validation
// - kW + mechanical HP
// - Current generation / model-year guardrails
// - Exactly 3 cars
// - Search refund when every provider fails
// - Wikimedia Commons + Wikipedia image fallback
// - Parallel image searching
// - Parallel official price verification
// - SSRF-safe URL validation
// - Defensive parsing / normalization
// - Strong top-level error handling
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


// Keep the complete request under typical serverless limits.
const REQUEST_TIMEOUT = 45000;

const GROQ_PRIMARY_TIMEOUT = 40000;
const GROQ_REPAIR_TIMEOUT = 18000;

const OPENROUTER_TIMEOUT = 24000;

const SUPABASE_TIMEOUT = 8000;

const OFFICIAL_PAGE_TIMEOUT = 5000;

const WIKIMEDIA_TIMEOUT = 5000;
const WIKIPEDIA_TIMEOUT = 5000;


// Only a small number of image searches are necessary.
// They run in parallel.
const MAX_IMAGE_CANDIDATES = 8;

const MAX_IMAGE_QUERIES = 4;

const MAX_DATA_SOURCES = 12;

const MAX_BODY_TEXT = 7000;


// ============================================================
// POWER CONVERSION
// ============================================================

const POWER_KW_TO_HP =
  1.34102209;

const POWER_HP_TO_KW =
  1 / POWER_KW_TO_HP;


// ============================================================
// GROQ MODELS
// ============================================================

const GROQ_MODELS = [
  {
    model:
      "openai/gpt-oss-120b",
    timeout:
      GROQ_PRIMARY_TIMEOUT,
    purpose:
      "research"
  },
  {
    model:
      "openai/gpt-oss-20b",
    timeout:
      GROQ_REPAIR_TIMEOUT,
    purpose:
      "repair"
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
// OFFICIAL / THIRD-PARTY DOMAINS
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
    Object.values(
      OFFICIAL_DOMAIN_HINTS
    )
      .flat()
      .map(
        value =>
          String(value)
            .toLowerCase()
            .replace(
              /^https?:\/\//,
              ""
            )
            .replace(
              /^www\./,
              ""
            )
            .replace(
              /\/.*$/,
              ""
            )
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

function isPlainObject(
  value
) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}


function scalarText(
  value,
  fallback = ""
) {
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

  if (
    Array.isArray(value)
  ) {
    const result =
      value
        .map(
          item =>
            scalarText(
              item,
              ""
            )
        )
        .filter(Boolean)
        .join(", ");

    return result || fallback;
  }

  if (
    isPlainObject(value)
  ) {
    const keys = [
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

    for (
      const key of keys
    ) {
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
        JSON.stringify(
          value
        );

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


function text(
  value,
  fallback = ""
) {
  return scalarText(
    value,
    fallback
  );
}


function arrayText(
  value
) {
  if (
    !Array.isArray(value)
  ) {
    const single =
      scalarText(
        value,
        ""
      );

    return single
      ? [single]
      : [];
  }

  return value
    .map(
      item =>
        scalarText(
          item,
          ""
        )
    )
    .filter(Boolean);
}


function clamp(
  value,
  min,
  max
) {
  return Math.min(
    Math.max(
      value,
      min
    ),
    max
  );
}


function numberOrNull(
  value
) {
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
    return Number.isFinite(
      value
    )
      ? value
      : null;
  }

  const raw =
    String(value)
      .replace(",", ".")
      .replace(
        /[^\d.+-]/g,
        ""
      );

  if (!raw) {
    return null;
  }

  const number =
    Number(raw);

  return Number.isFinite(
    number
  )
    ? number
    : null;
}


function normalizeKey(
  value
) {
  return String(
    value || ""
  )
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[^a-z0-9]+/g,
      ""
    );
}


// ============================================================
// JSON PARSING
// ============================================================

function extractJsonText(
  raw
) {
  let value =
    scalarText(
      raw,
      ""
    );

  if (!value) {
    return "";
  }

  value =
    value.trim();

  value =
    value.replace(
      /^```(?:json|JSON)?\s*/,
      ""
    );

  value =
    value.replace(
      /\s*```$/,
      ""
    );

  value =
    value.trim();

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
    start =
      firstObject;
  } else if (
    firstArray >= 0
  ) {
    start =
      firstArray;
  }

  if (
    start > 0
  ) {
    value =
      value.slice(
        start
      );
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

  if (
    end >= 0
  ) {
    value =
      value.slice(
        0,
        end + 1
      );
  }

  return value.trim();
}


function parseAIJson(
  raw
) {
  if (
    raw !== null &&
    typeof raw === "object"
  ) {
    return raw;
  }

  const cleaned =
    extractJsonText(
      raw
    );

  if (!cleaned) {
    throw new Error(
      "AI nevrátilo žiadne dáta."
    );
  }

  try {
    return JSON.parse(
      cleaned
    );
  } catch (
    firstError
  ) {
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
      return JSON.parse(
        repaired
      );
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

function normalizeRequest(
  body
) {
  const source =
    isPlainObject(body)
      ? body
      : {};

  const input =
    isPlainObject(
      source.filters
    )
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

function buildRequestSummary(
  request
) {
  const parts = [];

  if (
    request.naturalLanguage
  ) {
    parts.push(
      `Používateľova požiadavka: ${request.naturalLanguage}`
    );
  }

  if (
    request.budget !== null
  ) {
    parts.push(
      `Maximálny rozpočet: ${request.budget} EUR`
    );
  }

  if (
    request.seats !== null
  ) {
    parts.push(
      `Počet miest: ${request.seats}`
    );
  }

  if (
    request.power !== null
  ) {
    parts.push(
      `Minimálny výkon: ${request.power} kW`
    );
  }

  if (
    request.trunk !== null
  ) {
    parts.push(
      `Minimálny kufor: ${request.trunk} l`
    );
  }

  if (
    request.drive
  ) {
    parts.push(
      `Pohon: ${request.drive}`
    );
  }

  if (
    request.fuel
  ) {
    parts.push(
      `Palivo: ${request.fuel}`
    );
  }

  if (
    request.body
  ) {
    parts.push(
      `Karoséria: ${request.body}`
    );
  }

  if (
    request.style
  ) {
    parts.push(
      `Štýl: ${request.style}`
    );
  }

  if (
    request.length !== null
  ) {
    parts.push(
      `Maximálna dĺžka: ${request.length} mm`
    );
  }

  if (
    request.year !== null
  ) {
    parts.push(
      `Minimálny rok: ${request.year}`
    );
  }

  if (
    request.avoid
  ) {
    parts.push(
      `Vynechať značky: ${request.avoid}`
    );
  }

  return parts.join(
    "\n"
  );
}


// ============================================================
// FETCH WITH TIMEOUT
// ============================================================

async function fetchWithTimeout(
  url,
  options = {},
  timeout = REQUEST_TIMEOUT
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
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
    clearTimeout(
      timer
    );
  }
}


// ============================================================
// SUPABASE USER
// ============================================================

async function verifyUser(
  accessToken
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
      SUPABASE_TIMEOUT
    );

  if (!response.ok) {
    throw new Error(
      `Supabase user verification failed (${response.status})`
    );
  }

  return response.json();
}


// ============================================================
// SUPABASE RPC
// ============================================================

async function callSupabaseRPC(
  functionName,
  accessToken,
  body = {}
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
          JSON.stringify(
            body
          )
      },
      SUPABASE_TIMEOUT
    );

  const raw =
    await response.text();

  let data = null;

  if (raw) {
    try {
      data =
        JSON.parse(
          raw
        );
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
// USAGE RESULT
// ============================================================

function normalizeUsageResult(
  result
) {
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
      allowed:
        result,
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
        Math.floor(
          result
        ),
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

    const number =
      numberOrNull(
        trimmed
      );

    if (
      number !== null
    ) {
      const remaining =
        clamp(
          Math.floor(
            number
          ),
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
        JSON.parse(
          trimmed
        )
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
    if (
      result.length === 0
    ) {
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

  if (
    isPlainObject(result)
  ) {
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

      if (
        used !== null
      ) {
        remaining =
          clamp(
            MAX_SEARCHES_PER_DAY -
              Math.floor(
                used
              ),
            0,
            MAX_SEARCHES_PER_DAY
          );
      }
    }

    if (
      remaining === null
    ) {
      remaining =
        MAX_SEARCHES_PER_DAY - 1;
    }

    let allowed =
      allowedRaw === undefined
        ? remaining > 0
        : Boolean(
            allowedRaw
          );

    return {
      allowed,
      remaining:
        clamp(
          Math.floor(
            remaining
          ),
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
// USE SEARCH
// ============================================================

async function useSearch(
  accessToken
) {
  const candidates = [
    "use_search",
    "consume_search",
    "increment_search"
  ];

  let lastError = null;

  for (
    const functionName of candidates
  ) {
    try {
      const result =
        await callSupabaseRPC(
          functionName,
          accessToken,
          {}
        );

      return normalizeUsageResult(
        result
      );
    } catch (
      error
    ) {
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

  for (
    const functionName of candidates
  ) {
    try {
      const result =
        await callSupabaseRPC(
          functionName,
          accessToken,
          {}
        );

      return normalizeUsageResult(
        result
      );
    } catch (
      error
    ) {
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

function isPrivateHostname(
  hostname
) {
  const host =
    String(
      hostname || ""
    ).toLowerCase();

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
    host.endsWith(
      ".localhost"
    ) ||
    host.endsWith(
      ".local"
    )
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

    const a =
      parts[0];

    const b =
      parts[1];

    if (
      a === 10 ||
      a === 127 ||
      (a === 169 &&
        b === 254) ||
      (a === 172 &&
        b >= 16 &&
        b <= 31) ||
      (a === 192 &&
        b === 168)
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
      (b === 18 ||
        b === 19)
    ) {
      return true;
    }

    if (
      a >= 224
    ) {
      return true;
    }
  }

  return false;
}


function isThirdPartyHost(
  hostname
) {
  const host =
    String(
      hostname || ""
    )
      .toLowerCase()
      .replace(
        /^www\./,
        ""
      );

  return OBVIOUS_THIRD_PARTY_HOSTS.some(
    blocked =>
      host === blocked ||
      host.endsWith(
        `.${blocked}`
      )
  );
}


function safeHttpUrl(
  value,
  options = {}
) {
  const raw =
    scalarText(
      value,
      ""
    );

  if (!raw) {
    return null;
  }

  try {
    const parsed =
      new URL(
        raw
      );

    if (
      parsed.protocol !==
        "https:" &&
      parsed.protocol !==
        "http:"
    ) {
      return null;
    }

    const hostname =
      parsed.hostname
        .toLowerCase()
        .replace(
          /^www\./,
          ""
        );

    if (
      isPrivateHostname(
        hostname
      )
    ) {
      return null;
    }

    if (
      options.rejectThirdParty &&
      isThirdPartyHost(
        hostname
      )
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

function normalizeBrand(
  brand
) {
  const normalized =
    normalizeKey(
      brand
    );

  const aliases = {
    mercedesbenz:
      "mercedes",

    mercedesamg:
      "mercedes",

    alfaromeo:
      "alfaromeo"
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
    safeHttpUrl(
      url
    );

  if (!safe) {
    return false;
  }

  let parsed;

  try {
    parsed =
      new URL(
        safe
      );
  } catch {
    return false;
  }

  const hostname =
    parsed.hostname
      .toLowerCase()
      .replace(
        /^www\./,
        ""
      );

  const normalizedBrand =
    normalizeBrand(
      brand
    );

  const knownDomains =
    OFFICIAL_DOMAIN_HINTS[
      normalizedBrand
    ];

  if (
    Array.isArray(
      knownDomains
    )
  ) {
    return knownDomains.some(
      domain => {
        const clean =
          String(
            domain
          )
            .toLowerCase()
            .replace(
              /^www\./,
              ""
            );

        return (
          hostname ===
            clean ||
          hostname.endsWith(
            `.${clean}`
          )
        );
      }
    );
  }

  return OFFICIAL_MANUFACTURER_DOMAINS.some(
    domain =>
      hostname === domain ||
      hostname.endsWith(
        `.${domain}`
      )
  );
}


// ============================================================
// POWER
// ============================================================

function normalizePower(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return {
      kw: null,
      hp: null
    };
  }

  if (
    isPlainObject(value)
  ) {
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

    if (
      value.hp !== undefined
    ) {
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
    String(
      value
    )
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
      match[0].replace(
        ",",
        "."
      )
    );

  if (
    !Number.isFinite(
      number
    )
  ) {
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
        Math.round(
          kw * 10
        ) / 10,

      hp:
        Math.round(
          number
        )
    };
  }

  const kw =
    number;

  return {
    kw:
      Math.round(
        kw * 10
      ) / 10,

    hp:
      Math.round(
        kw *
          POWER_KW_TO_HP
      )
  };
}


// ============================================================
// PRICE
// ============================================================

function normalizePrice(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return {
      text:
        "Cena nie je dostupná",
      amount:
        null,
      currency:
        null
    };
  }

  if (
    isPlainObject(value)
  ) {
    return normalizePrice(
      value.amount ??
      value.price ??
      value.value ??
      value.text
    );
  }

  const raw =
    String(
      value
    ).trim();

  if (!raw) {
    return {
      text:
        "Cena nie je dostupná",
      amount:
        null,
      currency:
        null
    };
  }

  const match =
    raw.match(
      /\d[\d\s.,]*/
    );

  let amount =
    null;

  if (match) {
    let numeric =
      match[0]
        .replace(
          /\s/g,
          ""
        );

    if (
      numeric.includes(".") &&
      numeric.includes(",")
    ) {
      numeric =
        numeric.replace(
          /\./g,
          ""
        );

      numeric =
        numeric.replace(
          ",",
          "."
        );
    } else if (
      /^\d{1,3}(?:\.\d{3})+$/.test(
        numeric
      )
    ) {
      numeric =
        numeric.replace(
          /\./g,
          ""
        );
    } else {
      numeric =
        numeric.replace(
          ",",
          "."
        );
    }

    const parsed =
      Number(
        numeric
      );

    if (
      Number.isFinite(
        parsed
      )
    ) {
      amount =
        parsed;
    }
  }

  const upper =
    raw.toUpperCase();

  let currency =
    null;

  if (
    upper.includes("EUR") ||
    raw.includes("€")
  ) {
    currency =
      "EUR";
  } else if (
    upper.includes("USD") ||
    raw.includes("$")
  ) {
    currency =
      "USD";
  } else if (
    upper.includes("GBP") ||
    raw.includes("£")
  ) {
    currency =
      "GBP";
  } else if (
    upper.includes("CHF")
  ) {
    currency =
      "CHF";
  } else if (
    upper.includes("AED")
  ) {
    currency =
      "AED";
  } else if (
    upper.includes("CZK") ||
    raw.includes("Kč")
  ) {
    currency =
      "CZK";
  }

  return {
    text:
      raw,
    amount,
    currency
  };
}


function priceHasNumber(
  price
) {
  return (
    price &&
    numberOrNull(
      price.amount
    ) !== null
  );
}


// ============================================================
// RESEARCH PROMPT
// ============================================================

function buildResearchPrompt(
  request
) {
  return `
You are CARMATCH AI, an automotive research assistant.

Research the CURRENT automotive market using web search.

Return EXACTLY THREE real production cars matching the user request.

CRITICAL RULES:

1. Use current information.
2. Prefer the newest/current generation.
3. Prefer current model year information.
4. Do NOT invent facts.
5. Do NOT invent prices.
6. Do NOT invent URLs.
7. Do NOT invent specifications.
8. Prefer official manufacturer websites.
9. Use official manufacturer price/configurator pages whenever available.
10. If a current verified price is unavailable, write exactly:
   "Cena nie je dostupná"
11. Power must be kW + mechanical hp.
12. Never use PS, ks or bhp as the displayed unit.
13. Exactly 3 cars.
14. Cars must be genuinely different.
15. Do not return concepts.
16. Do not return prototypes.
17. Do not return motorcycles.
18. Do not return trucks.
19. Do not return buses.
20. Do not return vans unless explicitly requested.
21. Do not return used vehicles unless explicitly requested.
22. Respect the user's filters.
23. If a filter cannot be verified, do not invent a value.
24. Slovak explanations are preferred.
25. ImageCandidates should normally be empty. The backend will find images separately.

USER REQUEST:
${buildRequestSummary(
  request
)}

For each vehicle research:

- exact brand
- exact model
- current generation
- model year
- powertrain
- power in kW
- mechanical horsepower
- seats
- luggage capacity
- drivetrain
- fuel/powertrain
- new-car price
- official price URL
- official configurator URL
- reasons why it matches
- pros
- cons
- maintenance considerations
- reliable sources

Return ONLY JSON.

Use this structure:

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
      "pros": [
        "..."
      ],
      "cons": [
        "..."
      ],
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

function buildRepairPrompt(
  originalOutput
) {
  return `
Repair this automotive AI output.

Return ONLY valid JSON.

Requirements:
- EXACTLY 3 cars.
- No markdown.
- No commentary.
- Do not invent facts.
- Do not invent prices.
- Do not invent URLs.
- Missing price must become "Cena nie je dostupná".
- Power must be kW + mechanical hp.
- Arrays must contain strings.
- URLs must be http/https.
- Preserve valid factual information.

Original output:

${scalarText(
  originalOutput,
  ""
).slice(
  0,
  MAX_BODY_TEXT
)}

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
//
// IMPORTANT:
//
// Groq GPT-OSS supports browser_search.
// Groq documentation also states that browser search is NOT
// compatible with structured outputs.
//
// Therefore we intentionally DO NOT send response_format here.
// We request browser_search and parse JSON ourselves afterwards.
//
// ============================================================

async function callGroq(
  modelConfig,
  prompt
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
        role:
          "system",

        content:
          "You are a precise automotive research engine. Search the web when necessary. Return only valid JSON matching the user's requested structure."
      },

      {
        role:
          "user",

        content:
          prompt
      }
    ],

    temperature:
      0.1,

    max_completion_tokens:
      6000,

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
        method:
          "POST",

        headers: {
          Authorization:
            `Bearer ${GROQ_API_KEY}`,

          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(
            body
          )
      },
      modelConfig.timeout
    );

  const raw =
    await response.text();

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
      JSON.parse(
        raw
      );
  } catch {
    throw new Error(
      "Groq vrátil neplatnú HTTP odpoveď."
    );
  }

  const message =
    data?.choices?.[0]?.message;

  const content =
    message?.content ??
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
  prompt
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
        method:
          "POST",

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
                role:
                  "system",

                content:
                  "You are a precise automotive research assistant. Return only valid JSON."
              },

              {
                role:
                  "user",

                content:
                  prompt
              }
            ],

            temperature:
              0.1,

            max_tokens:
              6000
          })
      },
      OPENROUTER_TIMEOUT
    );

  const raw =
    await response.text();

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
      JSON.parse(
        raw
      );
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
// AI RESULT NORMALIZATION
// ============================================================

function normalizeAIResult(
  value
) {
  const root =
    isPlainObject(
      value
    )
      ? value
      : {};

  let cars =
    Array.isArray(
      root.cars
    )
      ? root.cars
      : [];

  if (
    cars.length === 0 &&
    Array.isArray(
      root.results
    )
  ) {
    cars =
      root.results;
  }

  return {
    cars:
      cars
        .filter(
          item =>
            isPlainObject(
              item
            )
        )
        .map(
          normalizeCar
        )
  };
}


// ============================================================
// CAR NORMALIZATION
// ============================================================

function normalizeCar(
  source
) {
  const car =
    isPlainObject(
      source
    )
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

  const sources =
    normalizeSources(
      car.sources ??
      car.dataSources ??
      car.source
    );

  const images =
    normalizeImageCandidates(
      car.imageCandidates ??
      car.images ??
      car.image
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
        : clamp(
            score,
            0,
            100
          ),

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

    sources,

    imageCandidates:
      images
  };
}


// ============================================================
// DRIVE
// ============================================================

function normalizeDrive(
  value
) {
  const raw =
    text(
      value,
      ""
    );

  if (!raw) {
    return "";
  }

  const normalized =
    normalizeKey(
      raw
    );

  if (
    normalized.includes(
      "allwheel"
    ) ||
    normalized.includes(
      "awd"
    ) ||
    normalized.includes(
      "4x4"
    )
  ) {
    return "AWD";
  }

  if (
    normalized.includes(
      "rearwheel"
    ) ||
    normalized === "rwd" ||
    normalized.includes(
      "zadny"
    )
  ) {
    return "RWD";
  }

  if (
    normalized.includes(
      "frontwheel"
    ) ||
    normalized === "fwd" ||
    normalized.includes(
      "predny"
    )
  ) {
    return "FWD";
  }

  return raw;
}


// ============================================================
// SOURCES
// ============================================================

function normalizeSources(
  value
) {
  let items = [];

  if (
    Array.isArray(
      value
    )
  ) {
    items =
      value;
  } else if (
    value
  ) {
    items = [
      value
    ];
  }

  const result = [];

  for (
    const item of items
  ) {
    let url =
      "";

    let title =
      "";

    if (
      typeof item ===
      "string"
    ) {
      url =
        safeHttpUrl(
          item
        );

      title =
        item;
    } else if (
      isPlainObject(
        item
      )
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
          source.url ===
          url
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

function normalizeImageCandidates(
  value
) {
  let items = [];

  if (
    Array.isArray(
      value
    )
  ) {
    items =
      value;
  } else if (
    value
  ) {
    items = [
      value
    ];
  }

  const result = [];

  for (
    const item of items
  ) {
    let url =
      "";

    if (
      typeof item ===
      "string"
    ) {
      url =
        safeHttpUrl(
          item
        );
    } else if (
      isPlainObject(
        item
      )
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
      isRejectedImageUrl(
        url
      )
    ) {
      continue;
    }

    if (
      result.includes(
        url
      )
    ) {
      continue;
    }

    result.push(
      url
    );

    if (
      result.length >=
      MAX_IMAGE_CANDIDATES
    ) {
      break;
    }
  }

  return result;
}


function isRejectedImageUrl(
  url
) {
  const lower =
    String(
      url || ""
    ).toLowerCase();

  return IMAGE_REJECT_WORDS.some(
    word =>
      lower.includes(
        word
      )
  );
}


// ============================================================
// IMAGE SEARCH TERMS
// ============================================================

function imageSearchTerms(
  car
) {
  const name =
    text(
      car.name,
      ""
    );

  const generation =
    text(
      car.generation,
      ""
    );

  const year =
    numberOrNull(
      car.year
    );

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
    `${base} front`,
    `${base} side`,
    `${base} official`
  ].slice(
    0,
    MAX_IMAGE_QUERIES
  );
}


// ============================================================
// WIKIMEDIA
// ============================================================

async function fetchWikimediaSearch(
  query
) {
  const params =
    new URLSearchParams({
      action:
        "query",

      generator:
        "search",

      gsrsearch:
        query,

      gsrnamespace:
        "6",

      gsrlimit:
        "10",

      prop:
        "imageinfo",

      iiprop:
        "url|mime|size|extmetadata",

      iiurlwidth:
        "1200",

      format:
        "json",

      origin:
        "*"
    });

  const response =
    await fetchWithTimeout(
      `${WIKIMEDIA_API}?${params}`,
      {
        method:
          "GET",

        headers: {
          Accept:
            "application/json"
        }
      },
      WIKIMEDIA_TIMEOUT
    );

  if (!response.ok) {
    throw new Error(
      `Wikimedia failed (${response.status})`
    );
  }

  const data =
    await response.json();

  const pages =
    Object.values(
      data?.query?.pages ||
        {}
    );

  return pages
    .map(
      page => {
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
          info?.extmetadata ||
          {};

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
      }
    )
    .filter(Boolean);
}


// ============================================================
// WIKIPEDIA
// ============================================================

async function fetchWikipediaImages(
  query
) {
  const searchParams =
    new URLSearchParams({
      action:
        "query",

      list:
        "search",

      srsearch:
        query,

      srlimit:
        "5",

      srnamespace:
        "0",

      format:
        "json",

      origin:
        "*"
    });

  const searchResponse =
    await fetchWithTimeout(
      `${WIKIPEDIA_API}?${searchParams}`,
      {
        method:
          "GET",

        headers: {
          Accept:
            "application/json"
        }
      },
      WIKIPEDIA_TIMEOUT
    );

  if (!searchResponse.ok) {
    throw new Error(
      `Wikipedia search failed (${searchResponse.status})`
    );
  }

  const searchData =
    await searchResponse.json();

  const titles =
    (
      searchData?.query
        ?.search ||
      []
    )
      .map(
        item =>
          text(
            item.title,
            ""
          )
      )
      .filter(Boolean);

  if (
    titles.length === 0
  ) {
    return [];
  }

  const imageParams =
    new URLSearchParams({
      action:
        "query",

      prop:
        "pageimages|images",

      titles:
        titles.join("|"),

      piprop:
        "thumbnail",

      pithumbsize:
        "1200",

      imlimit:
        "10",

      format:
        "json",

      origin:
        "*"
    });

  const imageResponse =
    await fetchWithTimeout(
      `${WIKIPEDIA_API}?${imageParams}`,
      {
        method:
          "GET",

        headers: {
          Accept:
            "application/json"
        }
      },
      WIKIPEDIA_TIMEOUT
    );

  if (!imageResponse.ok) {
    throw new Error(
      `Wikipedia images failed (${imageResponse.status})`
    );
  }

  const imageData =
    await imageResponse.json();

  const pages =
    Object.values(
      imageData?.query
        ?.pages ||
        {}
    );

  return pages
    .map(
      page => {
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
      }
    )
    .filter(Boolean);
}


// ============================================================
// IMAGE SCORING
// ============================================================

function normalizeImageTokenSet(
  value
) {
  return [
    ...new Set(
      text(
        value,
        ""
      )
        .toLowerCase()
        .normalize("NFD")
        .replace(
          /[\u0300-\u036f]/g,
          ""
        )
        .split(
          /[^a-z0-9]+/
        )
        .filter(
          token =>
            token.length >=
            2
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
      .map(
        value =>
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

  let score =
    0;

  for (
    const token of nameTokens
  ) {
    if (
      token.length >= 3 &&
      haystack.includes(
        token
      )
    ) {
      score += 12;
    }
  }

  for (
    const token of generationTokens
  ) {
    if (
      token.length >= 3 &&
      haystack.includes(
        token
      )
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
    /\binterior\b|\bdashboard\b|\bcockpit\b|\bengine\b/.test(
      haystack
    )
  ) {
    score -= 100;
  }

  if (
    candidate?.width >=
    700
  ) {
    score += 4;
  }

  if (
    candidate?.height >=
    400
  ) {
    score += 3;
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
//
// IMPORTANT:
//
// Old version:
// query 1 -> wait
// query 2 -> wait
// query 3 -> wait
// ...
//
// New version:
// ALL Wikimedia queries run in parallel.
//
// This substantially reduces serverless execution time.
// ============================================================

async function findCarImages(
  car
) {
  const queries =
    imageSearchTerms(
      car
    );

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
              query
            );
          } catch {
            return [];
          }
        }
      )
    );

  const candidates =
    queryResults.flat();

  if (
    candidates.length <
    MAX_IMAGE_CANDIDATES
  ) {
    try {
      const wiki =
        await fetchWikipediaImages(
          text(
            car.name,
            ""
          )
        );

      candidates.push(
        ...wiki
      );
    } catch {
      // Optional fallback.
    }
  }

  const unique =
    new Map();

  for (
    const candidate of candidates
  ) {
    if (
      !candidate?.url
    ) {
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
        b.score -
        a.score
    )
    .slice(
      0,
      MAX_IMAGE_CANDIDATES
    )
    .map(
      item => ({
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
      })
    );
}


// ============================================================
// OFFICIAL PRICE PAGE
// ============================================================

async function fetchOfficialPage(
  url
) {
  const safe =
    safeHttpUrl(
      url
    );

  if (!safe) {
    return null;
  }

  const response =
    await fetchWithTimeout(
      safe,
      {
        method:
          "GET",

        headers: {
          Accept:
            "text/html,application/xhtml+xml"
        },

        redirect:
          "follow"
      },
      OFFICIAL_PAGE_TIMEOUT
    );

  if (!response.ok) {
    return null;
  }

  const contentType =
    response.headers.get(
      "content-type"
    ) || "";

  if (
    !contentType.includes(
      "text/html"
    ) &&
    !contentType.includes(
      "application/xhtml+xml"
    )
  ) {
    return null;
  }

  const html =
    await response.text();

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


function containsPriceEvidence(
  html
) {
  const source =
    String(
      html || ""
    ).toLowerCase();

  return (
    /€\s?\d/.test(
      source
    ) ||
    /\d[\d\s.,]{2,}\s?€/.test(
      source
    ) ||
    /\beur\b/.test(
      source
    ) ||
    /starting price/.test(
      source
    ) ||
    /from price/.test(
      source
    ) ||
    /base price/.test(
      source
    )
  );
}


// ============================================================
// PRICE VERIFICATION
// ============================================================
//
// All 3 official pages are checked in parallel.
// ============================================================

async function verifyOneCarPrice(
  car
) {
  const brand =
    text(
      car.name,
      ""
    ).split(
      /\s+/
    )[0];

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
    officialUrl =
      null;
  }

  let officialVerified =
    false;

  if (
    officialUrl
  ) {
    try {
      const page =
        await fetchOfficialPage(
          officialUrl
        );

      if (
        page &&
        containsPriceEvidence(
          page.html
        )
      ) {
        officialVerified =
          true;
      }
    } catch {
      officialVerified =
        false;
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
      priceHasNumber(
        price
      )
        ? price.text
        : "Cena nie je dostupná",

    priceAmount:
      priceHasNumber(
        price
      )
        ? price.amount
        : null,

    currency:
      priceHasNumber(
        price
      )
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
  cars
) {
  return Promise.all(
    cars.map(
      car =>
        verifyOneCarPrice(
          car
        )
    )
  );
}


// ============================================================
// FINAL SANITIZATION
// ============================================================

function finalSanitizeCars(
  cars
) {
  return cars
    .slice(
      0,
      3
    )
    .map(
      car => {
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
            priceHasNumber(
              price
            )
              ? price.text
              : "Cena nie je dostupná",

          priceAmount:
            priceHasNumber(
              price
            )
              ? price.amount
              : null,

          currency:
            priceHasNumber(
              price
            )
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
            text(
              car.length,
              ""
            ),

          lengthMm:
            numberOrNull(
              car.lengthMm
            ),

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
      }
    );
}


// ============================================================
// VALIDATION
// ============================================================

function validateCar(
  car,
  request
) {
  if (
    !isPlainObject(
      car
    )
  ) {
    return false;
  }

  if (
    !text(
      car.name,
      ""
    )
  ) {
    return false;
  }

  if (
    request.budget !== null &&
    numberOrNull(
      car.priceAmount
    ) !== null &&
    numberOrNull(
      car.priceAmount
    ) >
      request.budget
  ) {
    return false;
  }

  if (
    request.seats !== null &&
    numberOrNull(
      car.seats
    ) !== null &&
    numberOrNull(
      car.seats
    ) <
      request.seats
  ) {
    return false;
  }

  if (
    request.power !== null &&
    numberOrNull(
      car.powerKw
    ) !== null &&
    numberOrNull(
      car.powerKw
    ) <
      request.power
  ) {
    return false;
  }

  if (
    request.trunk !== null &&
    numberOrNull(
      car.trunkLiters
    ) !== null &&
    numberOrNull(
      car.trunkLiters
    ) <
      request.trunk
  ) {
    return false;
  }

  if (
    request.year !== null &&
    numberOrNull(
      car.year
    ) !== null &&
    numberOrNull(
      car.year
    ) <
      request.year
  ) {
    return false;
  }

  if (
    request.length !== null &&
    numberOrNull(
      car.lengthMm
    ) !== null &&
    numberOrNull(
      car.lengthMm
    ) >
      request.length
  ) {
    return false;
  }

  if (
    request.avoid
  ) {
    const avoid =
      request.avoid
        .split(
          /[,;]+/
        )
        .map(
          value =>
            normalizeKey(
              value
            )
        )
        .filter(Boolean);

    const brand =
      normalizeBrand(
        text(
          car.name,
          ""
        ).split(
          /\s+/
        )[0]
      );

    if (
      avoid.includes(
        brand
      )
    ) {
      return false;
    }
  }

  return true;
}


function validateCars(
  cars,
  request
) {
  if (
    !Array.isArray(
      cars
    ) ||
    cars.length !== 3
  ) {
    return false;
  }

  const unique =
    new Set(
      cars.map(
        car =>
          normalizeKey(
            car.name
          )
      )
    );

  if (
    unique.size !== 3
  ) {
    return false;
  }

  return cars.every(
    car =>
      validateCar(
        car,
        request
      )
  );
}


// ============================================================
// AI RESEARCH CHAIN
// ============================================================

async function runAIResearch(
  request
) {
  const researchPrompt =
    buildResearchPrompt(
      request
    );

  const errors = [];

  // ----------------------------------------------------------
  // GROQ
  // ----------------------------------------------------------

  if (
    GROQ_API_KEY
  ) {
    for (
      const model of GROQ_MODELS
    ) {
      try {
        const raw =
          await callGroq(
            model,
            researchPrompt
          );

        const parsed =
          normalizeAIResult(
            parseAIJson(
              raw
            )
          );

        if (
          parsed.cars.length ===
          3
        ) {
          return {
            data:
              parsed,

            provider:
              "groq",

            model:
              model.model
          };
        }

        errors.push(
          `Groq ${model.model}: nevrátilo presne 3 autá`
        );
      } catch (
        error
      ) {
        errors.push(
          `Groq ${model.model}: ${scalarText(
            error?.message,
            "unknown error"
          )}`
        );
      }
    }
  }

  // ----------------------------------------------------------
  // OPENROUTER
  // ----------------------------------------------------------

  if (
    OPENROUTER_API_KEY
  ) {
    for (
      const model of OPENROUTER_FREE_MODELS
    ) {
      try {
        const raw =
          await callOpenRouter(
            model,
            researchPrompt
          );

        const parsed =
          normalizeAIResult(
            parseAIJson(
              raw
            )
          );

        if (
          parsed.cars.length ===
          3
        ) {
          return {
            data:
              parsed,

            provider:
              "openrouter",

            model
          };
        }

        errors.push(
          `OpenRouter ${model}: nevrátilo presne 3 autá`
        );
      } catch (
        error
      ) {
        errors.push(
          `OpenRouter ${model}: ${scalarText(
            error?.message,
            "unknown error"
          )}`
        );
      }
    }
  }

  throw new Error(
    `Všetci AI poskytovatelia zlyhali. ${errors
      .slice(
        0,
        8
      )
      .join(
        " | "
      )}`
  );
}


// ============================================================
// FINAL PIPELINE
// ============================================================

async function buildFinalCars(
  request
) {
  const aiResult =
    await runAIResearch(
      request
    );

  let cars =
    aiResult.data.cars
      .slice(
        0,
        3
      )
      .map(
        normalizeCar
      );

  if (
    cars.length !== 3
  ) {
    throw new Error(
      "AI neposkytlo presne tri vozidlá."
    );
  }

  // ----------------------------------------------------------
  // Verify prices in parallel
  // ----------------------------------------------------------

  cars =
    await verifyPricesAndSources(
      cars
    );

  // ----------------------------------------------------------
  // Search images in parallel for all 3 cars
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
                  car
                );
            } catch {
              images =
                [];
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
  // Exact 3-car contract
  // ----------------------------------------------------------

  if (
    cars.length !== 3
  ) {
    throw new Error(
      "Výsledky neobsahujú presne tri vozidlá."
    );
  }

  // Do not reject otherwise usable results because an optional
  // specification was missing.
  //
  // Exact 3 results is the hard requirement.

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
    .status(
      status
    )
    .json(
      data
    );
}


// ============================================================
// TOP-LEVEL HANDLER
// ============================================================

export default async function handler(
  req,
  res
) {
  let accessToken =
    "";

  let searchCharged =
    false;

  try {
    // --------------------------------------------------------
    // METHOD
    // --------------------------------------------------------

    if (
      req.method !==
      "POST"
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
            .slice(
              7
            )
            .trim()
        : "";

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
        accessToken
      );

    if (
      !user?.id
    ) {
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
      typeof rawBody ===
      "string"
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

    if (
      isEmpty
    ) {
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
            "Daily search limit reached",

          message:
            "Dosiahol si denný limit 5 vyhľadávaní.",

          remaining:
            0
        }
      );
    }

    searchCharged =
      true;

    // --------------------------------------------------------
    // AI + IMAGES + PRICE VERIFICATION
    // --------------------------------------------------------

    const finalResult =
      await buildFinalCars(
        request
      );

    // --------------------------------------------------------
    // REMAINING SEARCHES
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
            MAX_SEARCHES_PER_DAY -
              1
          );

    // --------------------------------------------------------
    // SUCCESS
    // --------------------------------------------------------

    searchCharged =
      false;

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
  } catch (
    error
  ) {
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

        searchCharged =
          false;

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
            remaining;
        }

        return sendJson(
          res,
          503,
          payload
        );
      } catch (
        refundError
      ) {
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
  }
}