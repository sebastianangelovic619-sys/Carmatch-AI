// ============================================================
// CARMATCH AI - PRODUCTION BACKEND v10
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
// - Robust top-level error handling
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
  alfa: [
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
  genesis: [
    "genesis.com"
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

const OFFICIAL_DOMAIN_BRAND_HINTS = [
  "audi",
  "bmw",
  "mercedes",
  "porsche",
  "volkswagen",
  "skoda",
  "seat",
  "cupra",
  "volvo",
  "lexus",
  "toyota",
  "landrover",
  "jaguar",
  "ferrari",
  "lamborghini",
  "maserati",
  "bentley",
  "astonmartin",
  "mclaren",
  "ford",
  "opel",
  "peugeot",
  "citroen",
  "renault",
  "nissan",
  "honda",
  "mazda",
  "hyundai",
  "kia",
  "genesis",
  "tesla",
  "polestar",
  "smart",
  "mini",
  "fiat",
  "alfaromeo",
  "jeep",
  "dodge",
  "chrysler",
  "ram",
  "chevrolet",
  "cadillac",
  "suzuki",
  "subaru",
  "mitsubishi",
  "dacia",
  "mgmotor",
  "byd",
  "nio",
  "xpeng",
  "zeekr"
];

const OFFICIAL_MANUFACTURER_DOMAINS = [
  ...new Set(
    Object.values(OFFICIAL_DOMAIN_HINTS)
      .flat()
      .map(value =>
        String(value)
          .toLowerCase()
          .replace(/^https?:\/\//, "")
          .replace(/^www\./, "")
          .replace(/\/.*$/, "")
      )
  )
];


// ============================================================
// IMAGE REJECTION RULES
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

function cleanPrimitive(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return "";
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
    const output = String(value).trim();
    return output || fallback;
  }

  if (Array.isArray(value)) {
    const joined = value
      .map(item => scalarText(item, ""))
      .filter(Boolean)
      .join(", ");

    return joined || fallback;
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
        const result = scalarText(
          value[key],
          ""
        );

        if (result) {
          return result;
        }
      }
    }

    try {
      const json = JSON.stringify(value);
      return json && json !== "{}"
        ? json
        : fallback;
    } catch {
      return fallback;
    }
  }

  return fallback;
}

function text(value, fallback = "") {
  return scalarText(value, fallback);
}

function arrayText(value) {
  if (!Array.isArray(value)) {
    const single = scalarText(value, "");
    return single ? [single] : [];
  }

  return value
    .map(item => scalarText(item, ""))
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

  const number =
    typeof value === "number"
      ? value
      : Number(
          String(value)
            .replace(",", ".")
            .replace(/[^\d.+-]/g, "")
        );

  return Number.isFinite(number)
    ? number
    : null;
}

function sleep(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function slugify(value) {
  return normalizeKey(value);
}


// ============================================================
// JSON / AI PARSING
// ============================================================

function extractJsonText(raw) {
  let value = scalarText(raw, "");

  if (!value) {
    return "";
  }

  value = value.trim();

  if (
    value.startsWith("```json") ||
    value.startsWith("```JSON")
  ) {
    value = value.replace(
      /^```(?:json|JSON)\s*/,
      ""
    );
  }

  if (value.endsWith("```")) {
    value = value.slice(
      0,
      -3
    );
  }

  value = value.trim();

  const firstObject = value.indexOf("{");
  const firstArray = value.indexOf("[");

  let start = -1;

  if (
    firstObject >= 0 &&
    firstArray >= 0
  ) {
    start = Math.min(
      firstObject,
      firstArray
    );
  } else if (firstObject >= 0) {
    start = firstObject;
  } else if (firstArray >= 0) {
    start = firstArray;
  }

  if (start > 0) {
    value = value.slice(start);
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
    value = value.slice(
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
        .replace(/,\s*([}\]])/g, "$1")
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
          "unknown parse error"
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
    source.filters &&
    isPlainObject(source.filters)
      ? source.filters
      : source;

  const naturalLanguage =
    text(
      source.naturalLanguage ??
      source.query ??
      source.prompt ??
      source.request ??
      "",
      ""
    );

  return {
    naturalLanguage,

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
// HTTP FETCH WITH TIMEOUT
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
// SUPABASE
// ============================================================

async function verifyUser(accessToken) {
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

  if (!accessToken) {
    throw new Error(
      "Chýba Authorization token."
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
    const raw =
      await response.text();

    throw new Error(
      `Supabase user verification failed (${response.status}): ${raw.slice(
        0,
        500
      )}`
    );
  }

  return response.json();
}

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
          JSON.stringify(body)
      },
      SUPABASE_TIMEOUT
    );

  const raw =
    await response.text();

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

    error.data = data;

    throw error;
  }

  return data;
}


// ============================================================
// SEARCH USAGE
// ============================================================

async function useSearch(accessToken) {
  const candidates = [
    {
      name: "use_search",
      bodies: [
        {},
        {
          max_searches:
            MAX_SEARCHES_PER_DAY,
          daily_limit:
            MAX_SEARCHES_PER_DAY
        }
      ]
    },
    {
      name: "consume_search",
      bodies: [
        {},
        {
          max_searches:
            MAX_SEARCHES_PER_DAY,
          daily_limit:
            MAX_SEARCHES_PER_DAY
        }
      ]
    },
    {
      name: "increment_search",
      bodies: [
        {},
        {
          max_searches:
            MAX_SEARCHES_PER_DAY,
          daily_limit:
            MAX_SEARCHES_PER_DAY
        }
      ]
    }
  ];

  let lastError = null;

  for (
    const candidate of candidates
  ) {
    for (
      const body of candidate.bodies
    ) {
      try {
        const result =
          await callSupabaseRPC(
            candidate.name,
            accessToken,
            body
          );

        return normalizeUsageResult(
          result
        );
      } catch (error) {
        lastError = error;
      }
    }
  }

  throw (
    lastError ||
    new Error(
      "Nepodarilo sa overiť limit vyhľadávaní."
    )
  );
}

function normalizeUsageResult(result) {
  if (
    result === null ||
    result === undefined
  ) {
    return {
      allowed: true,
      remaining:
        MAX_SEARCHES_PER_DAY
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

    const number =
      numberOrNull(trimmed);

    if (number !== null) {
      const remaining =
        clamp(
          Math.floor(number),
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

  if (Array.isArray(result)) {
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
      result.available ??
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

    let allowed =
      allowedRaw === undefined
        ? remaining > 0
        : Boolean(
            allowedRaw
          );

    if (
      result.error &&
      !allowedRaw &&
      remaining === 0
    ) {
      allowed = false;
    }

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
// REFUND
// ============================================================

async function refundSearch(
  accessToken
) {
  const candidates = [
    {
      name: "refund_search",
      bodies: [
        {},
        {
          amount: 1
        }
      ]
    },
    {
      name: "refund_search_usage",
      bodies: [
        {},
        {
          amount: 1
        }
      ]
    }
  ];

  let lastError = null;

  for (
    const candidate of candidates
  ) {
    for (
      const body of candidate.bodies
    ) {
      try {
        const result =
          await callSupabaseRPC(
            candidate.name,
            accessToken,
            body
          );

        return normalizeUsageResult(
          result
        );
      } catch (error) {
        lastError = error;
      }
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
      a === 169 && b === 254 ||
      a === 172 && b >= 16 && b <= 31 ||
      a === 192 && b === 168
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

    if (
      a >= 224
    ) {
      return true;
    }
  }

  return false;
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
      new URL(raw);

    const protocol =
      parsed.protocol.toLowerCase();

    if (
      protocol !== "https:" &&
      protocol !== "http:"
    ) {
      return null;
    }

    const hostname =
      parsed.hostname
        .toLowerCase()
        .replace(/^www\./, "");

    if (
      isPrivateHostname(
        hostname
      )
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

function isThirdPartyHost(hostname) {
  const host =
    String(hostname || "")
      .toLowerCase()
      .replace(/^www\./, "");

  return OBVIOUS_THIRD_PARTY_HOSTS.some(
    blocked =>
      host === blocked ||
      host.endsWith(
        `.${blocked}`
      )
  );
}

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

  if (
    normalizedBrand &&
    OFFICIAL_DOMAIN_HINTS[
      normalizedBrand
    ]
  ) {
    return OFFICIAL_DOMAIN_HINTS[
      normalizedBrand
    ].some(domain => {
      const cleanDomain =
        String(domain)
          .toLowerCase()
          .replace(/^www\./, "");

      return (
        hostname ===
          cleanDomain ||
        hostname.endsWith(
          `.${cleanDomain}`
        )
      );
    });
  }

  return (
    OFFICIAL_MANUFACTURER_DOMAINS.some(
      domain =>
        hostname === domain ||
        hostname.endsWith(
          `.${domain}`
        )
    )
  );
}

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
    landrover:
      "landrover",
    landroverrange:
      "landrover",
    alfaromeo:
      "alfaromeo"
  };

  return (
    aliases[normalized] ||
    normalized
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
    return normalizePower(
      value.kw ??
      value.kW ??
      value.powerKw ??
      value.hp ??
      value.power
    );
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

  const numberMatch =
    raw.match(
      /-?\d+(?:[.,]\d+)?/
    );

  if (!numberMatch) {
    return {
      kw: null,
      hp: null
    };
  }

  const number =
    Number(
      numberMatch[0]
        .replace(",", ".")
    );

  if (
    !Number.isFinite(number)
  ) {
    return {
      kw: null,
      hp: null
    };
  }

  const isKw =
    /\bkw\b|\bkilowatt/.test(
      raw
    );

  const isHp =
    /\bhp\b|\bhk\b|\bps\b|\bks\b|\bbhp\b|\bhorsepower\b/.test(
      raw
    );

  if (isHp && !isKw) {
    const kw =
      number *
      POWER_HP_TO_KW;

    return {
      kw: Math.round(
        kw * 10
      ) / 10,
      hp: Math.round(number)
    };
  }

  const kw =
    number;

  return {
    kw: Math.round(
      kw * 10
    ) / 10,
    hp: Math.round(
      kw * POWER_KW_TO_HP
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
      amount: null,
      currency: null
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
    String(value)
      .trim();

  if (!raw) {
    return {
      text:
        "Cena nie je dostupná",
      amount: null,
      currency: null
    };
  }

  const numberMatch =
    raw.match(
      /(?:\d[\d\s.,]*)/
    );

  let amount = null;

  if (numberMatch) {
    const numeric =
      numberMatch[0]
        .replace(/\s/g, "")
        .replace(
          /(\d)[.](\d{3})(?!\d)/g,
          "$1$2"
        )
        .replace(",", ".");

    const parsed =
      Number(numeric);

    if (
      Number.isFinite(parsed)
    ) {
      amount = parsed;
    }
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

  return {
    text: raw,
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
// PROMPTS
// ============================================================

function buildResearchPrompt(
  request
) {
  const summary =
    buildRequestSummary(
      request
    );

  return `
You are CARMATCH AI, an automotive research assistant.

Your task is to find EXACTLY THREE real, currently relevant production cars matching the user's requirements.

IMPORTANT:
- Research current information.
- Prioritize current model year and current generation.
- Do not invent facts.
- Do not invent prices.
- Do not invent URLs.
- Do not invent dimensions, power, luggage volume or drivetrain.
- Distinguish current vehicles from discontinued generations.
- Use manufacturer sources whenever possible.
- Official manufacturer price pages are preferred.
- Prices should be new-car prices where possible.
- If a verified current official price cannot be found, use:
  "Cena nie je dostupná"
- Never manufacture a numeric price.
- Power MUST use kW and mechanical horsepower.
- Never label power as PS, ks, bhp or metric horsepower.
- Convert HP to kW when necessary.
- Exactly three cars must be returned.
- Results must be meaningfully different from each other.
- Do not return motorcycles, trucks, buses or vans unless explicitly requested.
- Do not return concepts or prototypes.
- Do not return used cars unless explicitly requested.

USER REQUEST:
${summary}

For every candidate, research:
1. Exact brand and model.
2. Current generation.
3. Current model year if available.
4. Current engine/powertrain.
5. Power in kW and mechanical hp.
6. Seats.
7. Luggage capacity.
8. Drivetrain.
9. Fuel type / powertrain.
10. Approximate or official new-car price.
11. Official manufacturer price/configurator URL where available.
12. Reliable supporting sources.
13. Reasons why it matches.
14. Pros.
15. Cons.
16. Maintenance considerations.
17. Exterior vehicle photo candidates.

Return ONLY JSON.

Use this exact structure:

{
  "cars": [
    {
      "name": "Brand Model",
      "generation": "generation",
      "year": 2026,
      "score": 92,
      "price": "€...",
      "officialPriceUrl": "https://...",
      "configuratorUrl": "https://...",
      "power": "180 kW / 241 hp",
      "powerKw": 180,
      "powerHp": 241,
      "seats": 5,
      "trunk": "600 l",
      "trunkLiters": 600,
      "drive": "AWD",
      "fuel": "Petrol",
      "reason": "Slovak explanation",
      "pros": [
        "..."
      ],
      "cons": [
        "..."
      ],
      "maintenance": "...",
      "sources": [
        {
          "title": "...",
          "url": "https://..."
        }
      ]
    }
  ]
}
`.trim();
}

function buildRepairPrompt(
  originalOutput
) {
  return `
Repair the following AI output.

Return ONLY valid JSON.

Requirements:
- Exactly 3 cars.
- No markdown.
- No commentary outside JSON.
- Preserve verified factual information.
- Never invent missing prices or URLs.
- Use "Cena nie je dostupná" when price is not verified.
- Power must be kW plus mechanical hp.
- Arrays must contain strings.
- URLs must be full http/https URLs.

Original output:
${scalarText(
  originalOutput,
  ""
).slice(
  0,
  MAX_BODY_TEXT
)}

Expected JSON structure:

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
      "power": "",
      "powerKw": null,
      "powerHp": null,
      "seats": null,
      "trunk": "",
      "trunkLiters": null,
      "drive": "",
      "fuel": "",
      "reason": "",
      "pros": [],
      "cons": [],
      "maintenance": "",
      "sources": []
    }
  ]
}
`.trim();
}


// ============================================================
// GROQ CALL
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
        role: "system",
        content:
          "You are a precise automotive research engine. Always follow the requested JSON schema."
      },
      {
        role: "user",
        content: prompt
      }
    ],

    temperature: 0.1,

    max_completion_tokens:
      7000,

    response_format: {
      type: "json_object"
    }
  };

  /*
   * GPT-OSS browser search support.
   * Unknown/unsupported extra fields are intentionally avoided.
   */
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
// OPENROUTER CALL
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
            max_tokens: 7000
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
// AI PROVIDER CHAIN
// ============================================================

async function runAIResearch(
  request
) {
  const researchPrompt =
    buildResearchPrompt(
      request
    );

  const errors = [];

  if (GROQ_API_KEY) {
    for (
      const model of GROQ_MODELS
    ) {
      try {
        const raw =
          await callGroq(
            model,
            researchPrompt
          );

        let parsed =
          parseAIJson(raw);

        parsed =
          normalizeAIResult(
            parsed
          );

        if (
          parsed.cars.length === 3
        ) {
          return {
            data: parsed,
            provider:
              "groq",
            model:
              model.model
          };
        }

        errors.push(
          `Groq ${model.model}: AI nevrátilo presne 3 autá.`
        );

      } catch (error) {
        errors.push(
          `Groq ${model.model}: ${scalarText(
            error?.message,
            "unknown error"
          )}`
        );
      }
    }
  }

  if (OPENROUTER_API_KEY) {
    for (
      const model of OPENROUTER_FREE_MODELS
    ) {
      try {
        const raw =
          await callOpenRouter(
            model,
            researchPrompt
          );

        let parsed =
          parseAIJson(raw);

        parsed =
          normalizeAIResult(
            parsed
          );

        if (
          parsed.cars.length === 3
        ) {
          return {
            data: parsed,
            provider:
              "openrouter",
            model
          };
        }

        errors.push(
          `OpenRouter ${model}: AI nevrátilo presne 3 autá.`
        );

      } catch (error) {
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
      .slice(0, 8)
      .join(" | ")}`
  );
}


// ============================================================
// AI RESULT NORMALIZATION
// ============================================================

function normalizeAIResult(
  value
) {
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

  cars =
    cars
      .filter(
        item =>
          isPlainObject(item)
      )
      .map(
        normalizeCar
      );

  return {
    cars
  };
}

function normalizeCar(
  source
) {
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
      "4x4"
    ) ||
    normalized.includes(
      "awd"
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
    Array.isArray(value)
  ) {
    items = value;
  } else if (
    value
  ) {
    items = [value];
  }

  const result = [];

  for (
    const item of items
  ) {
    let url = "";
    let title = "";

    if (
      typeof item === "string"
    ) {
      url =
        safeHttpUrl(
          item
        );

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

function normalizeImageCandidates(
  value
) {
  let items = [];

  if (
    Array.isArray(value)
  ) {
    items = value;
  } else if (
    value
  ) {
    items = [value];
  }

  const result = [];

  for (
    const item of items
  ) {
    let url = "";

    if (
      typeof item === "string"
    ) {
      url =
        safeHttpUrl(
          item
        );
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
      isRejectedImageUrl(
        url
      )
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

function isRejectedImageUrl(
  url
) {
  const lower =
    String(url || "")
      .toLowerCase();

  return IMAGE_REJECT_WORDS.some(
    word =>
      lower.includes(
        word
      )
  );
}


// ============================================================
// IMAGE SEARCH HELPERS
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

  const terms = [];

  const base =
    [
      name,
      generation,
      year
    ]
      .filter(Boolean)
      .join(" ");

  if (base) {
    terms.push(
      `${base} exterior`
    );

    terms.push(
      `${base} front`
    );

    terms.push(
      `${base} side`
    );

    terms.push(
      `${base} rear`
    );

    terms.push(
      `${base} official`
    );

    terms.push(
      `${base} press photo`
    );

    terms.push(
      `${base} 2026`
    );
  }

  return [
    ...new Set(
      terms
    )
  ].slice(0, 7);
}

async function fetchWikimediaSearch(
  query
) {
  const params =
    new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: query,
      gsrnamespace: "6",
      gsrlimit: "12",
      prop: "imageinfo",
      iiprop:
        "url|mime|size|extmetadata",
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
          metadata.ImageDescription?.value ??
          metadata.ObjectName?.value ??
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

async function fetchWikipediaImages(
  query
) {
  const searchParams =
    new URLSearchParams({
      action: "query",
      list: "search",
      srsearch: query,
      srlimit: "5",
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
      searchData?.query?.search ||
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
      imageData?.query?.pages || {}
    );

  const result = [];

  for (
    const page of pages
  ) {
    const thumb =
      safeHttpUrl(
        page?.thumbnail?.source
      );

    if (thumb) {
      result.push({
        url: thumb,
        title:
          text(
            page?.title,
            ""
          ),
        description:
          text(
            page?.title,
            ""
          ),
        source:
          "Wikipedia",
        width:
          numberOrNull(
            page?.thumbnail?.width
          ),
        height:
          numberOrNull(
            page?.thumbnail?.height
          )
      });
    }
  }

  return result;
}


// ============================================================
// IMAGE RELEVANCE
// ============================================================

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

  for (
    const token of nameTokens
  ) {
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
    /\binterior\b|\bdashboard\b|\bcockpit\b|\bengine\b/.test(
      haystack
    )
  ) {
    score -= 100;
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
    isRejectedImageUrl(
      candidate?.url
    )
  ) {
    score -= 200;
  }

  return score;
}

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
        .split(/[^a-z0-9]+/)
        .filter(
          token =>
            token.length >= 2
        )
    )
  ];
}


// ============================================================
// IMAGE ENGINE
// ============================================================

async function findCarImages(
  car
) {
  const queries =
    imageSearchTerms(
      car
    );

  const candidates = [];

  for (
    const query of queries
  ) {
    try {
      const results =
        await fetchWikimediaSearch(
          query
        );

      candidates.push(
        ...results
      );
    } catch {
      // Continue to next query.
    }
  }

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
      // Wikipedia is an optional fallback.
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

  const sorted =
    [...unique.values()]
      .sort(
        (a, b) =>
          b.score - a.score
      );

  return sorted
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
// OFFICIAL PRICE VERIFICATION
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
        method: "GET",
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

async function verifyPricesAndSources(
  cars
) {
  const result = [];

  for (
    const car of cars
  ) {
    const brand =
      text(
        car.name,
        ""
      ).split(
        /\s+/
      )[0];

    let officialVerified =
      false;

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

    let price =
      normalizePrice(
        car.price
      );

    /*
     * Never claim a numeric official price merely because
     * AI generated one. Keep it only when a numeric value exists.
     * Verification flag is stored separately.
     */
    if (
      !priceHasNumber(
        price
      )
    ) {
      price = {
        text:
          "Cena nie je dostupná",
        amount:
          null,
        currency:
          null
      };
    }

    result.push({
      ...car,

      price:
        price.text,

      priceAmount:
        price.amount,

      currency:
        price.currency,

      officialPriceUrl:
        officialUrl,

      officialPriceVerified:
        officialVerified,

      sources:
        sources.slice(
          0,
          MAX_DATA_SOURCES
        )
    });
  }

  return result;
}


// ============================================================
// CURRENT MODEL / SANITIZATION
// ============================================================

function sanitizeUrlField(
  value
) {
  return safeHttpUrl(
    value
  ) || "";
}

function finalSanitizeCars(
  cars
) {
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

      const imageCandidates =
        normalizeImageCandidates(
          car.imageCandidates
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
          sanitizeUrlField(
            car.officialPriceUrl
          ),

        configuratorUrl:
          sanitizeUrlField(
            car.configuratorUrl
          ),

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

        imageCandidates
      };
    });
}


// ============================================================
// HARD FILTER / OUTPUT VALIDATION
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
    !text(
      car.name,
      ""
    )
  ) {
    return false;
  }

  /*
   * We do not hard-reject every missing field because some
   * manufacturers do not publish every dimension consistently.
   */

  if (
    request.budget !== null &&
    numberOrNull(
      car.priceAmount
    ) !== null &&
    numberOrNull(
      car.priceAmount
    ) > request.budget
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
    ) < request.seats
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
    ) < request.power
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
    ) < request.trunk
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
    ) < request.year
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
    ) > request.length
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

    const carBrand =
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
        carBrand
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
    !Array.isArray(cars) ||
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
// MAIN AI + IMAGE PIPELINE
// ============================================================

async function buildFinalCars(
  request
) {
  const aiResult =
    await runAIResearch(
      request
    );

  let cars =
    aiResult.data.cars;

  cars =
    cars
      .slice(0, 3)
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

  cars =
    await verifyPricesAndSources(
      cars
    );

  /*
   * Image search is independent per car.
   * If one image search fails, the car can still be returned.
   */

  cars =
    await Promise.all(
      cars.map(
        async car => {
          let imageCandidates =
            normalizeImageCandidates(
              car.imageCandidates
            );

          if (
            imageCandidates.length === 0
          ) {
            try {
              imageCandidates =
                await findCarImages(
                  car
                );
            } catch {
              imageCandidates =
                [];
            }
          }

          return {
            ...car,
            imageCandidates
          };
        }
      )
    );

  cars =
    finalSanitizeCars(
      cars
    );

  if (
    !validateCars(
      cars,
      request
    )
  ) {
    /*
     * Do not destroy valid AI results merely because optional
     * values are absent. Exact 3 result count remains mandatory.
     */
    if (
      cars.length !== 3
    ) {
      throw new Error(
        "Výsledky neobsahujú presne tri vozidlá."
      );
    }
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
// HTTP RESPONSE
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
// TOP-LEVEL HANDLER
// ============================================================

export default async function handler(
  req,
  res
) {
  /*
   * CRITICAL:
   * These variables must exist OUTSIDE the try block.
   * The catch block may need them for refund handling.
   */
  let accessToken = "";
  let searchCharged = false;

  try {
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

    /*
     * Read and validate Authorization.
     */
    const authorization =
      req.headers?.authorization ||
      req.headers?.Authorization ||
      "";

    accessToken =
      authorization
        .startsWith(
          "Bearer "
        )
        ? authorization.slice(
            7
          ).trim()
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

    /*
     * Verify user.
     */
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

    /*
     * Parse body safely.
     */
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

    if (
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
      !request.avoid
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

    /*
     * Consume one search.
     */
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

    searchCharged = true;

    /*
     * Run AI + verification + images.
     */
    const finalResult =
      await buildFinalCars(
        request
      );

    /*
     * Success.
     *
     * Keep the returned usage count. The database RPC is the
     * source of truth. If it returned a remaining value, expose
     * it. Otherwise expose the safest expected post-charge value.
     */
    const remaining =
      numberOrNull(
        usage.remaining
      ) !== null
        ? Math.max(
            0,
            Math.min(
              MAX_SEARCHES_PER_DAY,
              Math.floor(
                usage.remaining
              )
            )
          )
        : Math.max(
            0,
            MAX_SEARCHES_PER_DAY - 1
          );

    /*
     * Search is now successfully completed.
     * No refund is needed.
     */
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

    /*
     * IMPORTANT:
     * If search was already charged, try to refund it.
     * Refund errors must NEVER replace the original error.
     */
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

        const refundedRemaining =
          numberOrNull(
            refund?.remaining
          );

        const baseMessage =
          scalarText(
            error?.message,
            "Vyhľadávanie sa nepodarilo dokončiť."
          );

        return sendJson(
          res,
          503,
          {
            error:
              "Search failed and was refunded",
            message:
              `${baseMessage} Vyhľadávanie bolo vrátené a nebolo spotrebované.`,
            refunded:
              true,
            remaining:
              refundedRemaining === null
                ? undefined
                : refundedRemaining
          }
        );

      } catch (refundError) {
        console.error(
          "CARMATCH AI refund error:",
          refundError
        );

        /*
         * Do not crash the function because refund failed.
         */
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

    /*
     * Normal uncharged error.
     */
    const message =
      scalarText(
        error?.message,
        "Vyhľadávanie sa nepodarilo dokončiť."
      );

    return sendJson(
      res,
      500,
      {
        error:
          "Internal Server Error",
        message
      }
    );
  }
}