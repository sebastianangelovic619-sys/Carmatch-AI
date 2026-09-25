// ============================================================
// CARMATCH AI - PRODUCTION BACKEND v7
// ============================================================
//
// Supabase anonymous auth
// 5 searches / day
// Groq GPT-OSS live browser search
// Official manufacturer price verification
// Official page price extraction
// kW + mechanical HP normalization
// Generation / model-year protection
// OpenRouter FREE failovers
// Search refund when all providers fail
// Wikimedia Commons + Wikipedia images
// SSRF-safe URL checks
// Defensive JSON parsing
// Exact 3-car response contract
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


// ============================================================
// POWER CONVERSION
// ============================================================
//
// Mechanical horsepower:
//
// 1 kW = 1.34102209 HP
//
// Final format:
//
// 500 kW / 671 HP
//
// Never PS
// Never ks
// Never CV
// Never bhp
// Never koní
// ============================================================

const POWER_KW_TO_HP = 1.34102209;
const POWER_HP_TO_KW = 1 / POWER_KW_TO_HP;


// ============================================================
// GROQ MODELS
// ============================================================
//
// Groq Compound is intentionally NOT used because it was
// decommissioned on 2026-09-21.
//
// GPT-OSS supports browser_search.
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
// OFFICIAL MANUFACTURER DOMAIN HINTS
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
    .trim()
    .slice(0, maxLength);
}


// ============================================================
// SAFE ARRAY
// ============================================================

function arrayText(
  value,
  maxItems = 10,
  itemLength = 500
) {
  if (
    !Array.isArray(value)
  ) {
    return [];
  }

  return value
    .map(
      item =>
        text(
          item,
          itemLength
        )
    )
    .filter(Boolean)
    .slice(
      0,
      maxItems
    );
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
// HEADER
// ============================================================

function getHeader(
  req,
  name
) {
  const value =
    req?.headers?.[
      name.toLowerCase()
    ];

  if (
    Array.isArray(value)
  ) {
    return value[0] || "";
  }

  return String(value || "");
}


// ============================================================
// JSON PARSING
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
    String(raw)
      .trim();

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
    lastBrace >
      firstBrace
  ) {
    try {
      return JSON.parse(
        value.slice(
          firstBrace,
          lastBrace + 1
        )
      );
    } catch (_) {}
  }

  throw new Error(
    "AI returned invalid JSON"
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
    clearTimeout(timer);
  }
}


// ============================================================
// FETCH JSON
// ============================================================

async function fetchJson(
  url,
  options = {},
  timeout = 30000
) {
  const response =
    await fetchWithTimeout(
      url,
      options,
      timeout
    );

  const raw =
    await response.text();

  let data = null;

  try {
    data =
      JSON.parse(raw);
  } catch (_) {
    throw new Error(
      `Invalid JSON response from ${url}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} from ${url}: ${raw.slice(
        0,
        300
      )}`
    );
  }

  return data;
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

  const response =
    await fetchWithTimeout(
      `${SUPABASE_URL}/auth/v1/user`,
      {
        method:
          "GET",

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
}


// ============================================================
// SUPABASE RPC
// ============================================================

async function callSupabaseRPC(
  functionName,
  accessToken
) {
  return await fetchJson(
    `${SUPABASE_URL}/rest/v1/rpc/${functionName}`,
    {
      method:
        "POST",

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

      body:
        "{}"
    },
    SUPABASE_TIMEOUT
  );
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
      allowed:
        false,

      remaining:
        0
    };
  }

  const remaining =
    Number(
      result.remaining
    );

  return {
    allowed:
      true,

    remaining:
      Number.isFinite(
        remaining
      )
        ? Math.max(
            0,
            remaining
          )
        : 0
  };
}


// ============================================================
// REFUND
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
  const safeBody =
    body &&
    typeof body ===
      "object"
      ? body
      : {};

  const filters =
    safeBody.filters &&
    typeof safeBody.filters ===
      "object" &&
    !Array.isArray(
      safeBody.filters
    )
      ? safeBody.filters
      : {};

  return {
    naturalLanguage:
      text(
        safeBody.naturalLanguage,
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
// MARKET
// ============================================================

function detectMarket(
  request
) {
  const content =
    `${request.naturalLanguage} ${JSON.stringify(
      request.filters
    )}`.toLowerCase();

  if (
    content.includes(
      "slovensko"
    ) ||
    content.includes(
      "slovakia"
    ) ||
    content.includes(
      "slovak"
    ) ||
    content.includes(
      "eur"
    ) ||
    content.includes("€")
  ) {
    return "Slovakia / European Union";
  }

  return "Europe / European Union";
}


// ============================================================
// POWER PARSER
// ============================================================

function parseNumeric(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const match =
    String(value)
      .replace(
        /,/g,
        "."
      )
      .match(
        /-?\d+(?:\.\d+)?/
      );

  if (!match) {
    return null;
  }

  const number =
    Number(
      match[0]
    );

  return Number.isFinite(
    number
  )
    ? number
    : null;
}


// ============================================================
// POWER NORMALIZATION
// ============================================================

function normalizePower(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  const raw =
    String(value)
      .trim();

  if (!raw) {
    return "";
  }

  // ----------------------------------------------------------
  // Explicit kW
  // ----------------------------------------------------------

  const kwMatch =
    raw.match(
      /(\d+(?:[.,]\d+)?)\s*kW\b/i
    );

  if (kwMatch) {
    const kw =
      parseNumeric(
        kwMatch[1]
      );

    if (
      kw &&
      kw > 0
    ) {
      const hp =
        Math.round(
          kw *
            POWER_KW_TO_HP
        );

      return `${Math.round(
        kw
      )} kW / ${hp} HP`;
    }
  }

  // ----------------------------------------------------------
  // Mechanical HP
  // ----------------------------------------------------------

  const hpMatch =
    raw.match(
      /(\d+(?:[.,]\d+)?)\s*(?:hp|horsepower|bhp)\b/i
    );

  if (hpMatch) {
    const hp =
      parseNumeric(
        hpMatch[1]
      );

    if (
      hp &&
      hp > 0
    ) {
      const kw =
        Math.round(
          hp *
            POWER_HP_TO_KW
        );

      return `${kw} kW / ${Math.round(
        hp
      )} HP`;
    }
  }

  // ----------------------------------------------------------
  // Metric horsepower
  // ----------------------------------------------------------

  const metricMatch =
    raw.match(
      /(\d+(?:[.,]\d+)?)\s*(?:PS|Pferdestärke(?:n)?|CV|ks|koni|koní|kon[eí]?)\b/i
    );

  if (metricMatch) {
    const metricHp =
      parseNumeric(
        metricMatch[1]
      );

    if (
      metricHp &&
      metricHp > 0
    ) {
      const kw =
        Math.round(
          metricHp *
            0.73549875
        );

      const hp =
        Math.round(
          kw *
            POWER_KW_TO_HP
        );

      return `${kw} kW / ${hp} HP`;
    }
  }

  // ----------------------------------------------------------
  // Bare numeric value
  // ----------------------------------------------------------

  const bare =
    parseNumeric(
      raw
    );

  if (
    bare &&
    bare > 0 &&
    bare < 3000 &&
    /^\s*\d+(?:[.,]\d+)?\s*$/.test(
      raw
    )
  ) {
    const kw =
      Math.round(
        bare
      );

    const hp =
      Math.round(
        kw *
          POWER_KW_TO_HP
      );

    return `${kw} kW / ${hp} HP`;
  }

  return "";
}


// ============================================================
// PRICE NORMALIZATION
// ============================================================

function normalizePrice(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  let price =
    String(value)
      .replace(
        /\u00a0/g,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
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
      item =>
        lower.includes(
          item
        )
    )
  ) {
    return "";
  }

  const euro =
    price.match(
      /(?:od\s*)?(?:€\s*)?(\d{1,3}(?:[ .]\d{3})+(?:[,.]\d{2})?|\d{4,7}(?:[,.]\d{2})?)\s*(?:€|EUR)\b/i
    );

  if (euro) {
    const rawNumber =
      euro[1]
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
        rawNumber
      );

    if (
      Number.isFinite(
        amount
      ) &&
      amount >=
        1000 &&
      amount <=
        10000000
    ) {
      const formatted =
        Math.round(
          amount
        )
          .toLocaleString(
            "sk-SK",
            {
              maximumFractionDigits: 0,
              useGrouping:
                true
            }
          )
          .replace(
            /\u00a0/g,
            " "
          );

      const prefix =
        /^od\b/i.test(
          price
        )
          ? "Od "
          : "";

      return `${prefix}€${formatted}`;
    }
  }

  return price.slice(
    0,
    160
  );
}


function priceHasNumber(
  value
) {
  return /\d/.test(
    normalizePrice(
      value
    )
  );
}


// ============================================================
// HOSTNAME
// ============================================================

function hostnameOf(
  url
) {
  try {
    return new URL(
      url
    )
      .hostname
      .toLowerCase()
      .replace(
        /^www\./,
        ""
      );
  } catch (_) {
    return "";
  }
}


// ============================================================
// THIRD PARTY CHECK
// ============================================================

function isBlockedHost(
  host
) {
  if (!host) {
    return true;
  }

  return OBVIOUS_THIRD_PARTY_HOSTS.some(
    domain =>
      host === domain ||
      host.endsWith(
        `.${domain}`
      )
  );
}


// ============================================================
// BRAND DETECTION
// ============================================================

function brandKeyFromName(
  name
) {
  const lower =
    String(name || "")
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        " "
      )
      .trim();

  const keys =
    Object.keys(
      OFFICIAL_DOMAIN_HINTS
    ).sort(
      (a, b) =>
        b.length -
        a.length
    );

  for (
    const key
    of keys
  ) {
    if (
      lower.includes(
        key
      )
    ) {
      return key;
    }
  }

  if (
    lower.includes(
      "mercedes"
    )
  ) {
    return "mercedes";
  }

  if (
    lower.includes(
      "alfa romeo"
    )
  ) {
    return "alfaromeo";
  }

  if (
    lower.includes(
      "land rover"
    )
  ) {
    return "landrover";
  }

  return "";
}


// ============================================================
// OFFICIAL MANUFACTURER URL CHECK
// ============================================================

function isOfficialManufacturerURL(
  url,
  carName = ""
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

    const host =
      parsed.hostname
        .toLowerCase()
        .replace(
          /^www\./,
          ""
        );

    if (
      isBlockedHost(
        host
      )
    ) {
      return false;
    }

    if (
      host ===
        "localhost" ||
      host.endsWith(
        ".localhost"
      ) ||
      /^(\d+\.){3}\d+$/.test(
        host
      ) ||
      host ===
        "::1"
    ) {
      return false;
    }

    const brandKey =
      brandKeyFromName(
        carName
      );

    if (
      brandKey &&
      OFFICIAL_DOMAIN_HINTS[
        brandKey
      ]
    ) {
      return OFFICIAL_DOMAIN_HINTS[
        brandKey
      ].some(
        domain =>
          host ===
            domain ||
          host.endsWith(
            `.${domain}`
          )
      );
    }

    const brandWords =
      String(carName || "")
        .toLowerCase()
        .replace(
          /[^a-z0-9]+/g,
          " "
        )
        .split(" ")
        .filter(
          word =>
            word.length >= 4
        )
        .slice(0, 3);

    return brandWords.some(
      word =>
        host.includes(
          word
        )
    );
  } catch (_) {
    return false;
  }
}


// ============================================================
// SAFE EXTERNAL URL
// ============================================================

function isSafeExternalHttpsURL(
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

    const host =
      parsed.hostname
        .toLowerCase();

    if (
      host ===
        "localhost" ||
      host.endsWith(
        ".localhost"
      ) ||
      host ===
        "127.0.0.1" ||
      host ===
        "0.0.0.0" ||
      host ===
        "::1" ||
      /^10\./.test(
        host
      ) ||
      /^192\.168\./.test(
        host
      ) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(
        host
      )
    ) {
      return false;
    }

    if (
      /^(\d+\.){3}\d+$/.test(
        host
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
// CAR NORMALIZATION
// ============================================================

function normalizeCar(
  car
) {
  if (
    !car ||
    typeof car !==
      "object" ||
    Array.isArray(car)
  ) {
    throw new Error(
      "Invalid vehicle object"
    );
  }

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
      normalizePrice(
        car.price
      ),

    power:
      normalizePower(
        car.power
      ),

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
        car.pros,
        8,
        500
      ),

    cons:
      arrayText(
        car.cons,
        8,
        500
      ),

    maintenance:
      text(
        car.maintenance,
        1500
      ),

    image: "",

    photoSource: "",

    configurator:
      "",

    priceSource:
      "",

    priceVerified:
      false,

    priceVerification:
      "unverified",

    dataSources:
      arrayText(
        car.dataSources,
        MAX_DATA_SOURCES,
        1200
      ),

    imageCandidates:
      []
  };

  if (
    !result.name
  ) {
    throw new Error(
      "Vehicle name missing"
    );
  }

  if (
    !result.generation
  ) {
    throw new Error(
      `Generation missing for ${result.name}`
    );
  }

  if (
    !Number.isFinite(
      result.year
    ) ||
    result.year <
      2000 ||
    result.year >
      2100
  ) {
    throw new Error(
      `Invalid model year for ${result.name}`
    );
  }

  result.score =
    Number.isFinite(
      result.score
    )
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(
              result.score
            )
          )
        )
      : 0;

  result.seats =
    Number.isFinite(
      result.seats
    ) &&
    result.seats >=
      1 &&
    result.seats <=
      20
      ? Math.round(
          result.seats
        )
      : null;

  if (
    !result.reason
  ) {
    result.reason =
      "Spĺňa zadané požiadavky používateľa.";
  }

  return result;
}


// ============================================================
// EXACTLY 3 CARS
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
    data.cars.length !==
      3
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
// MAIN PROMPT
// ============================================================

function buildPrompt(
  request,
  mode = "research"
) {
  const market =
    detectMarket(
      request
    );

  const modeRules =
    mode === "repair"
      ? `
You are repairing and verifying a previous result.

Be conservative.

Never guess current prices.

Use live browser research again.
`
      : `
You are the primary CARMATCH AI automotive research engine.

Perform live browser research before finalizing the answer.
`;

  return `
You are CARMATCH AI, a professional automotive research assistant.

TODAY:
${currentDate()}

TARGET MARKET:
${market}

LANGUAGE:
Slovak

${modeRules}

============================================================
USER REQUEST
============================================================

${request.naturalLanguage || "No natural-language request."}

============================================================
FILTERS
============================================================

${JSON.stringify(
  request.filters,
  null,
  2
)}

============================================================
ABSOLUTE RULES
============================================================

1. Return EXACTLY 3 real production vehicles.
2. Respect ALL strong user requirements.
3. Never invent a vehicle.
4. Never invent a current price.
5. Never invent a URL.
6. Never invent a specification.
7. Never mix generations.
8. Never mix facelift generations.
9. Never recommend a concept unless explicitly requested.
10. Prefer the newest production generation when requested.
11. All explanatory text must be Slovak.

============================================================
POWER
============================================================

The final power field MUST be:

XXX kW / YYY HP

Use mechanical horsepower.

1 kW = 1.34102209 HP

If the manufacturer gives PS/CV/ks,
convert them into kW and then mechanical HP.

Never output:

PS
CV
ks
bhp
Pferdestärke
koni
koní
koní

The final field must contain ONLY kW and HP.

============================================================
PRICE
============================================================

The price is one of the most important fields.

Search the current REAL new-car price.

Priority:

1. Official Slovak manufacturer website
2. Official Slovak manufacturer-controlled importer
3. Official European manufacturer website
4. Official manufacturer configurator
5. Official current manufacturer price list

Do NOT use third-party marketplaces as the primary price source.

Do NOT use:

AutoScout24
mobile.de
generic autobazars
dealer listing portals
Wikipedia
Reddit
YouTube
forums
random blogs

If the manufacturer says:

From
Starting at
Od

use the actual starting price.

Examples:

Od €79 990
€79 990

When an official current manufacturer price exists,
DO NOT write:

Cena nie je dostupná
Price unavailable
N/A

Only use:

Cena na vyžiadanie

when the manufacturer genuinely does not publish
a current public price.

priceSource MUST be the official manufacturer/importer
URL used for the price.

============================================================
CURRENT GENERATION
============================================================

For current / newest / 2026 / 2027 requests:

Use the newest relevant production generation.

Do not mix data from another generation.

Do not call an older generation current.

============================================================
PHOTO
============================================================

Do not provide an image URL.

The backend finds vehicle photos separately.

image = ""
photoSource = ""

============================================================
CONFIGURATOR
============================================================

Only use an official manufacturer configurator URL.

If unavailable:

configurator = ""

============================================================
MAINTENANCE
============================================================

Keep maintenance information realistic.

Do not invent exact annual maintenance costs.

Mention relevant complexity such as:

performance brakes
performance tyres
hybrid components
EV battery considerations
complex drivetrain
service complexity

============================================================
OUTPUT
============================================================

Return ONLY valid JSON.

No markdown.

No code fences.

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

year = number
seats = number
score = 0–100
pros = array
cons = array
dataSources = array

MOST IMPORTANT:

Research live information.

Use official manufacturer prices.

Use kW + HP.

Never invent prices.

Never invent URLs.

Never mix generations.

All explanatory text in Slovak.
`;
}


// ============================================================
// GROQ MAIN REQUEST
// ============================================================

async function callGroqModel(
  request,
  model,
  timeout,
  mode = "research"
) {
  if (
    !GROQ_API_KEY
  ) {
    throw new Error(
      "GROQ_API_KEY is not configured"
    );
  }

  const response =
    await fetchWithTimeout(
      GROQ_URL,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${GROQ_API_KEY}`
        },

        body:
          JSON.stringify({
            model,

            messages: [
              {
                role:
                  "system",

                content: `
You are CARMATCH AI.

You are a professional automotive research engine.

Use live browser search.

Current manufacturer prices must come from official
manufacturer or manufacturer-controlled regional sources.

Never invent prices.

Always return user-facing explanatory text in Slovak.

Power must always be:

XXX kW / YYY HP

HP means mechanical horsepower.

1 kW = 1.34102209 HP

Never use PS, ks, CV, bhp or koní in the final power field.

Return ONLY valid JSON.
`
              },

              {
                role:
                  "user",

                content:
                  buildPrompt(
                    request,
                    mode
                  )
              }
            ],

            temperature:
              0.1,

            max_completion_tokens:
              12000,

            response_format: {
              type:
                "json_object"
            },

            tools: [
              {
                type:
                  "browser_search"
              }
            ],

            tool_choice:
              "required",

            reasoning_effort:
              mode ===
              "repair"
                ? "medium"
                : "high",

            include_reasoning:
              false
          })
      },
      timeout
    );

  const raw =
    await response.text();

  if (
    !response.ok
  ) {
    throw new Error(
      `Groq ${model} HTTP ${response.status}: ${raw.slice(
        0,
        800
      )}`
    );
  }

  let apiData;

  try {
    apiData =
      JSON.parse(
        raw
      );
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

  const cars =
    validateCars(
      parsed
    );

  return {
    cars,

    provider:
      `Groq ${model}`,

    liveWeb:
      true
  };
}


// ============================================================
// GROQ FAILOVER
// ============================================================

async function callGroqResearch(
  request
) {
  let lastError =
    null;

  for (
    const item
    of GROQ_MODELS
      .filter(
        model =>
          model.purpose ===
          "research"
      )
  ) {
    try {
      return await callGroqModel(
        request,
        item.model,
        item.timeout,
        "research"
      );
    } catch (error) {
      lastError =
        error;

      console.error(
        `CARMATCH AI - Groq ${item.model} failed:`,
        error
      );
    }
  }

  // Fallback to 20B if the primary model failed.
  try {
    const fallback =
      GROQ_MODELS.find(
        model =>
          model.model ===
          "openai/gpt-oss-20b"
      );

    return await callGroqModel(
      request,
      fallback.model,
      fallback.timeout,
      "research"
    );
  } catch (error) {
    lastError =
      error;

    console.error(
      "CARMATCH AI - Groq 20B fallback failed:",
      error
    );
  }

  throw (
    lastError ||
    new Error(
      "All Groq providers failed"
    )
  );
}


// ============================================================
// OPENROUTER JSON SUPPORT
// ============================================================

function openRouterSupportsJsonMode(
  model
) {
  return (
    model ===
    "qwen/qwen3.8-27b:free"
  );
}


// ============================================================
// OPENROUTER MODEL
// ============================================================

async function callOpenRouterModel(
  request,
  model
) {
  if (
    !OPENROUTER_API_KEY
  ) {
    throw new Error(
      "OPENROUTER_API_KEY is not configured"
    );
  }

  const body = {
    model,

    messages: [
      {
        role:
          "system",

        content: `
You are CARMATCH AI fallback.

Return ONLY valid JSON.

All explanatory text MUST be Slovak.

Power MUST be:

XXX kW / YYY HP

Use mechanical horsepower.

1 kW = 1.34102209 HP

Never use PS, ks, CV, bhp or koní
in the final power field.

Do not invent current prices.

Do not invent URLs.

Do not invent image URLs.

The backend searches images separately.

If a current official manufacturer price cannot
be verified, use:

Cena na vyžiadanie

Exactly 3 real production vehicles.
`
      },

      {
        role:
          "user",

        content:
          buildPrompt(
            request,
            "research"
          )
      }
    ],

    temperature:
      0.1,

    max_tokens:
      11000
  };

  if (
    openRouterSupportsJsonMode(
      model
    )
  ) {
    body.response_format = {
      type:
        "json_object"
    };
  }

  const response =
    await fetchWithTimeout(
      OPENROUTER_URL,
      {
        method:
          "POST",

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
          JSON.stringify(
            body
          )
      },
      OPENROUTER_TIMEOUT
    );

  const raw =
    await response.text();

  if (
    !response.ok
  ) {
    throw new Error(
      `OpenRouter ${model} HTTP ${response.status}: ${raw.slice(
        0,
        800
      )}`
    );
  }

  let apiData;

  try {
    apiData =
      JSON.parse(
        raw
      );
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

  const cars =
    validateCars(
      parsed
    );

  return {
    cars,

    provider:
      `OpenRouter (${model})`,

    liveWeb:
      false
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
      "All OpenRouter FREE models failed"
    )
  );
}


// ============================================================
// SOURCE EXTRACTION
// ============================================================

function extractOfficialSources(
  car
) {
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

  for (
    const source
    of car.dataSources
  ) {
    if (
      isOfficialManufacturerURL(
        source,
        car.name
      )
    ) {
      sources.push(
        source
      );
    }
  }

  return [
    ...new Set(
      sources
    )
  ];
}


// ============================================================
// HTML CLEANING
// ============================================================

function stripHtml(
  html
) {
  return String(
    html || ""
  )
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


// ============================================================
// NORMALIZED SEARCH STRING
// ============================================================

function normalizedSearchString(
  value
) {
  return String(
    value || ""
  )
    .toLowerCase()
    .normalize(
      "NFD"
    )
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


// ============================================================
// MODEL TOKENS
// ============================================================

function carNameSearchTokens(
  car
) {
  return normalizedSearchString(
    car.name
  )
    .split(" ")
    .filter(
      word =>
        word.length >= 3
    )
    .slice(
      0,
      6
    );
}


// ============================================================
// EURO PRICE EXTRACTION
// ============================================================

function formatDetectedEuroPrice(
  amount,
  fromPrefix = false
) {
  if (
    !Number.isFinite(
      amount
    ) ||
    amount <
      1000 ||
    amount >
      10000000
  ) {
    return "";
  }

  const formatted =
    Math.round(
      amount
    )
      .toLocaleString(
        "sk-SK",
        {
          maximumFractionDigits: 0,
          useGrouping:
            true
        }
      )
      .replace(
        /\u00a0/g,
        " "
      );

  return `${fromPrefix ? "Od " : ""}€${formatted}`;
}


// ============================================================
// EXTRACT OFFICIAL PRICE FROM PAGE TEXT
// ============================================================

function extractOfficialEuroPriceFromText(
  visible,
  car
) {
  const source =
    String(
      visible || ""
    );

  if (!source) {
    return "";
  }

  const lower =
    source.toLowerCase();

  const modelTokens =
    carNameSearchTokens(
      car
    );

  const priceRegex =
    /(?:od|from|starting(?:\s+at)?|cena\s+od|starting\s+from)?\s*(?:€|eur)\s*(\d{1,3}(?:[ .]\d{3})+(?:[,.]\d{2})?|\d{4,7}(?:[,.]\d{2})?)|(?:od|from|starting(?:\s+at)?|cena\s+od|starting\s+from)?\s*(\d{1,3}(?:[ .]\d{3})+(?:[,.]\d{2})?|\d{4,7}(?:[,.]\d{2})?)\s*(?:€|eur)/gi;

  const financeWords = [
    "mesac",
    "mesačne",
    "mesacne",
    "splát",
    "splátka",
    "splatka",
    "per month",
    "monthly",
    "lease",
    "leasing",
    "deposit",
    "záloha",
    "zaloha"
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
      !Number.isFinite(
        amount
      ) ||
      amount <
        1000 ||
      amount >
        10000000
    ) {
      continue;
    }

    const start =
      Math.max(
        0,
        match.index -
          1800
      );

    const end =
      Math.min(
        source.length,
        match.index +
          1800
      );

    const context =
      lower.slice(
        start,
        end
      );

    const tokenHits =
      modelTokens.filter(
        token =>
          context.includes(
            token
          )
      ).length;

    if (
      modelTokens.length >
        0 &&
      tokenHits === 0
    ) {
      continue;
    }

    const financeHit =
      financeWords.some(
        word =>
          context.includes(
            word
          )
      );

    if (
      financeHit
    ) {
      continue;
    }

    const priceWordHit =
      priceWords.some(
        word =>
          context.includes(
            word
          )
      );

    const fromPrefix =
      /\b(?:od|from|starting|cena\s+od)\b/i.test(
        fullMatch
      );

    let score =
      tokenHits *
      20;

    if (
      priceWordHit
    ) {
      score += 10;
    }

    if (
      fromPrefix
    ) {
      score += 8;
    }

    candidates.push({
      amount,
      score,
      fromPrefix
    });
  }

  if (
    candidates.length ===
      0
  ) {
    return "";
  }

  candidates.sort(
    (a, b) => {
      if (
        b.score !==
        a.score
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


// ============================================================
// OFFICIAL PAGE VERIFICATION
// ============================================================

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
      ok:
        false,

      reason:
        "non_official_url"
    };
  }

  if (
    !isSafeExternalHttpsURL(
      url
    )
  ) {
    return {
      ok:
        false,

      reason:
        "unsafe_url"
    };
  }

  try {
    const response =
      await fetchWithTimeout(
        url,
        {
          method:
            "GET",

          headers: {
            Accept:
              "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",

            "User-Agent":
              "Mozilla/5.0 (compatible; CARMATCH-AI/7.0; +https://carmatchai.vercel.app)"
          }
        },
        OFFICIAL_PAGE_TIMEOUT
      );

    if (
      !response.ok
    ) {
      return {
        ok:
          false,

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
        ok:
          false,

        reason:
          "unsupported_content_type"
      };
    }

    const raw =
      await response.text();

    const visible =
      stripHtml(
        raw
      );

    const haystack =
      normalizedSearchString(
        visible
      );

    const tokens =
      carNameSearchTokens(
        car
      );

    const tokenHits =
      tokens.filter(
        token =>
          haystack.includes(
            token
          )
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
        hostnameOf(
          url
        ),

      finalUrl:
        response.url ||
        url
    };
  } catch (error) {
    return {
      ok:
        false,

      reason:
        error?.name ===
        "AbortError"
          ? "timeout"
          : "fetch_failed"
    };
  }
}


// ============================================================
// PRICE/FIELD REPAIR PROMPT
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
PREVIOUS RESULT TO VERIFY
============================================================

${JSON.stringify(
  cars.map(
    car => ({
      name:
        car.name,

      generation:
        car.generation,

      year:
        car.year,

      power:
        car.power,

      price:
        car.price,

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

Use live browser search.

For each of the SAME 3 cars:

1. Verify the current generation.
2. Verify the model year.
3. Verify current power.
4. Search the official manufacturer website.
5. Search the official Slovak/EU manufacturer website.
6. Search the official manufacturer configurator if useful.
7. Find the real current starting price.
8. Return the exact official URL used.

Never guess.

Never use AutoScout24/mobile.de/random dealer portals
as the primary price source.

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

Exactly 3 cars in the same order.
`;
}


// ============================================================
// GROQ PRICE REPAIR
// ============================================================

async function repairWithGroq(
  request,
  cars
) {
  if (
    !GROQ_API_KEY
  ) {
    return null;
  }

  try {
    const model =
      GROQ_MODELS.find(
        item =>
          item.model ===
          "openai/gpt-oss-20b"
      );

    const response =
      await fetchWithTimeout(
        GROQ_URL,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${GROQ_API_KEY}`
          },

          body:
            JSON.stringify({
              model:
                model.model,

              messages: [
                {
                  role:
                    "system",

                  content: `
You verify automotive facts using live browser search.

Official manufacturer price is mandatory whenever available.

Return ONLY valid JSON.

Power must be:

XXX kW / YYY HP

Use mechanical HP.

1 kW = 1.34102209 HP.

Never output PS, ks, CV, bhp or koní
as the final power unit.
`
                },

                {
                  role:
                    "user",

                  content:
                    buildRepairRequest(
                      request,
                      cars
                    )
                }
              ],

              temperature:
                0.05,

              max_completion_tokens:
                7000,

              response_format: {
                type:
                  "json_object"
              },

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

    if (
      !response.ok
    ) {
      throw new Error(
        `Groq repair HTTP ${response.status}: ${raw.slice(
          0,
          500
        )}`
      );
    }

    const apiData =
      JSON.parse(
        raw
      );

    const content =
      apiData
        ?.choices?.[0]
        ?.message
        ?.content;

    if (
      !content
    ) {
      throw new Error(
        "Groq repair returned empty content"
      );
    }

    return parseAIJson(
      content
    );
  } catch (error) {
    console.error(
      "CARMATCH AI repair failed:",
      error
    );

    return null;
  }
}


// ============================================================
// MERGE REPAIR
// ============================================================

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
    (
      car,
      index
    ) => {
      const patch =
        repaired.cars[
          index
        ];

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

      const sameName =
        normalizedSearchString(
          patch.name
        ) ===
        normalizedSearchString(
          car.name
        );

      if (
        !sameName
      ) {
        return next;
      }

      if (
        patch.generation
      ) {
        next.generation =
          text(
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

      if (
        repairedPower
      ) {
        next.power =
          repairedPower;
      }

      const repairedPrice =
        normalizePrice(
          patch.price
        );

      if (
        repairedPrice
      ) {
        next.price =
          repairedPrice;
      }

      const repairedSource =
        text(
          patch.priceSource,
          2000
        );

      if (
        repairedSource
      ) {
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

      return next;
    }
  );
}


// ============================================================
// VERIFY PRICES AND SOURCES
// ============================================================

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

  // ----------------------------------------------------------
  // DIRECT OFFICIAL PAGE CHECK
  // ----------------------------------------------------------

  const pageChecks =
    await Promise.all(
      working.map(
        async car => {
          const sources =
            extractOfficialSources(
              car
            );

          for (
            const source
            of sources.slice(
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
      (
        car,
        index
      ) => {
        const check =
          pageChecks[
            index
          ];

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

  // ----------------------------------------------------------
  // SECOND LIVE RESEARCH PASS ONLY WHEN NEEDED
  // ----------------------------------------------------------

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

    if (
      repaired
    ) {
      working =
        mergeRepairData(
          working,
          repaired
        );
    }
  }

  // ----------------------------------------------------------
  // FINAL OFFICIAL PAGE CHECK
  // ----------------------------------------------------------

  const finalChecks =
    await Promise.all(
      working.map(
        async car => {
          const sources =
            extractOfficialSources(
              car
            );

          for (
            const source
            of sources.slice(
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
    (
      car,
      index
    ) => {
      const check =
        finalChecks[
          index
        ];

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

      // ------------------------------------------------------
      // Live browser research result from Groq.
      // If the source is an official manufacturer URL,
      // retain the model-reported current price even when
      // the server cannot parse the JS-rendered page.
      // ------------------------------------------------------

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

      // ------------------------------------------------------
      // Unverified numeric prices are NEVER shown.
      // ------------------------------------------------------

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
// LINK SANITIZATION
// ============================================================

function sanitizeCarLinks(
  car
) {
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
  "bus",
  "tractor",
  "van"
];


// ============================================================
// IMAGE REJECT
// ============================================================

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
// WIKIMEDIA IMAGE URL
// ============================================================

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
      new URL(
        url
      );

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


// ============================================================
// IMAGE SEARCH TEXT
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
// VEHICLE IMAGE TERMS
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
        ? String(
            year
          )
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
      `${name} ${generation} ${year} car automobile`
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
  }

  if (
    name
  ) {
    queries.push(
      `${name} car automobile`
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
      candidate.title ||
        ""
    ).toLowerCase();

  const query =
    String(
      candidate.query ||
        ""
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

  let score =
    0;

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
      "car"
    ) ||
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
    candidate.queryIndex ===
    0
  ) {
    score += 10;
  } else if (
    candidate.queryIndex ===
    1
  ) {
    score += 6;
  }

  return score;
}


// ============================================================
// IMAGE DEDUPLICATION
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
      !candidate?.image
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
      relevance <
      15
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


// ============================================================
// WIKIMEDIA SEARCH
// ============================================================

async function searchWikimediaImages(
  query,
  queryIndex = 0
) {
  const params =
    new URLSearchParams({
      action:
        "query",

      generator:
        "search",

      gsrsearch:
        `${query} filetype:bitmap`,

      gsrnamespace:
        "6",

      gsrlimit:
        "20",

      prop:
        "imageinfo",

      iiprop:
        "url|mime|size|dimensions|descriptionurl",

      iiurlwidth:
        "1600",

      format:
        "json",

      origin:
        "*"
    });

  const response =
    await fetchWithTimeout(
      `${WIKIMEDIA_API}?${params.toString()}`,
      {
        method:
          "GET",

        headers: {
          Accept:
            "application/json",

          "User-Agent":
            "CARMATCHAI/7.0 vehicle-image-lookup"
        }
      },
      WIKIMEDIA_TIMEOUT
    );

  if (
    !response.ok
  ) {
    throw new Error(
      `Wikimedia HTTP ${response.status}`
    );
  }

  const data =
    await response.json();

  const pages =
    Object.values(
      data
        ?.query
        ?.pages ||
        {}
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
      page
        ?.imageinfo?.[0];

    if (
      !imageInfo
    ) {
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
        width <
          600 ||
        height <
          350
      ) {
        continue;
      }

      const ratio =
        width /
        height;

      if (
        ratio <
          0.8 ||
        ratio >
          3.5
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
      action:
        "query",

      list:
        "search",

      srsearch:
        query,

      srnamespace:
        "0",

      srlimit:
        "10",

      format:
        "json",

      origin:
        "*"
    });

  const searchResponse =
    await fetchWithTimeout(
      `${WIKIPEDIA_API}?${searchParams.toString()}`,
      {
        method:
          "GET",

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
    searchData
      ?.query
      ?.search;

  if (
    !Array.isArray(
      results
    ) ||
    results.length ===
      0
  ) {
    return [];
  }

  const titles =
    results
      .slice(
        0,
        10
      )
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
      action:
        "query",

      titles,

      prop:
        "pageimages|info",

      inprop:
        "url",

      piprop:
        "thumbnail",

      pithumbsize:
        "1600",

      format:
        "json",

      origin:
        "*"
    });

  const imageResponse =
    await fetchWithTimeout(
      `${WIKIPEDIA_API}?${imageParams.toString()}`,
      {
        method:
          "GET",

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
      imageData
        ?.query
        ?.pages ||
        {}
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
      page
        ?.thumbnail
        ?.source ||
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
// FIND CAR IMAGES
// ============================================================

async function findCarImages(
  car
) {
  const queries =
    buildImageSearchQueries(
      car
    );

  if (
    queries.length ===
      0
  ) {
    return {
      ...car,

      image:
        "",

      photoSource:
        "",

      imageCandidates:
        []
    };
  }

  let candidates =
    [];

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
      first?.url ||
      "",

    photoSource:
      first?.source ||
      "",

    imageCandidates
  };
}


// ============================================================
// ADD IMAGES
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
// FINAL SANITIZATION
// ============================================================

function finalSanitizeCars(
  cars
) {
  return cars.map(
    car => {
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
        sanitized.power =
          "";
      }

      if (
        !sanitized.price
      ) {
        sanitized.price =
          "Cena na vyžiadanie";
      }

      return sanitized;
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
    // ENV
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
    // AUTH
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
    // VERIFY USER
    // --------------------------------------------------------

    const user =
      await verifyUser(
        accessToken
      );

    if (
      !user
    ) {
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
        req.body ||
          {}
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
    // DAILY SEARCH LIMIT
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

    // --------------------------------------------------------
    // PROVIDERS
    // --------------------------------------------------------

    let result =
      null;

    let groqFailed =
      false;

    let openRouterFailed =
      false;

    // --------------------------------------------------------
    // GROQ
    // --------------------------------------------------------

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
    // OPENROUTER
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
    // ALL PROVIDERS FAILED
    // --------------------------------------------------------

    if (
      !result
    ) {
      const refund =
        await refundSearch(
          accessToken
        );

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
    // NORMALIZE BEFORE PRICE CHECK
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

    // --------------------------------------------------------
    // OFFICIAL PRICE / FACT QUALITY PASS
    // --------------------------------------------------------

    cars =
      await verifyPricesAndSources(
        request,
        cars,
        Boolean(
          result.liveWeb
        )
      );

    // --------------------------------------------------------
    // PHOTOS
    // --------------------------------------------------------

    cars =
      await addCarImages(
        cars
      );

    // --------------------------------------------------------
    // FINAL SAFETY
    // --------------------------------------------------------

    cars =
      finalSanitizeCars(
        cars
      );

    if (
      cars.length !==
      3
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

    return sendJson(
      res,
      500,
      {
        error:
          "Server configuration error",

        message:
          "CARMATCH AI sa nepodarilo dokončiť požiadavku. Skontroluj Supabase, GROQ_API_KEY a OPENROUTER_API_KEY vo Verceli.",

        retryable:
          true
      }
    );
  }
}