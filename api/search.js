// api/search.js

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
// - SSRF-safe URL validation
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
  audi: ["audi.com", "audi.sk", "audi.de", "audi.at"],
  bmw: ["bmw.com", "bmw.sk", "bmw.de", "bmw.at"],
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
  ferrari: ["ferrari.com"],
  lamborghini: ["lamborghini.com"],
  maserati: ["maserati.com"],
  astonmartin: ["astonmartin.com"],
  mclaren: ["cars.mclaren.com", "mclaren.com"],
  ford: ["ford.com", "ford.sk", "ford.de"],
  opel: ["opel.com", "opel.sk", "opel.de"],
  peugeot: ["peugeot.com", "peugeot.sk", "peugeot.de"],
  citroen: ["citroen.com", "citroen.sk", "citroen.de"],
  renault: ["renault.com", "renault.sk", "renault.de"],
  nissan: ["nissan-global.com", "nissan.sk", "nissan.de"],
  honda: ["honda.com", "honda.sk", "honda.de"],
  mazda: ["mazda.com", "mazda.sk", "mazda.de"],
  kia: ["kia.com", "kia.sk", "kia.com.eu"],
  hyundai: ["hyundai.com", "hyundai.sk", "hyundai.de"],
  genesis: ["genesis.com"],
  fiat: ["fiat.com", "fiat.sk", "fiat.de"],
  alfa: [
    "alfaromeo.com",
    "alfaromeo.sk",
    "alfaromeo.de"
  ],
  alfaromeo: [
    "alfaromeo.com",
    "alfaromeo.sk"
  ],
  jeep: ["jeep.com", "jeep.sk", "jeep.de"],
  dodge: ["dodge.com"],
  ram: ["ramtrucks.com"],
  tesla: ["tesla.com"],
  byd: ["byd.com", "bydauto.com"],
  polestar: ["polestar.com"],
  lotus: ["lotuscars.com"],
  smart: ["smart.com", "smart.eu"],
  mini: ["mini.com", "mini.sk", "mini.de"],
  rollsroyce: ["rolls-roycemotorcars.com"],
  rolls: ["rolls-roycemotorcars.com"],
  maybach: [
    "mercedes-maybach.com",
    "mercedes-benz.com"
  ]
};

function sendJson(res, status, data) {
  return res.status(status).json(data);
}

function text(value, maxLength = 5000) {
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

function arrayText(
  value,
  maxItems = 10,
  itemLength = 500
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(item =>
      text(item, itemLength)
    )
    .filter(Boolean)
    .slice(0, maxItems);
}

function getHeader(req, name) {
  const value =
    req?.headers?.[name.toLowerCase()];

  if (Array.isArray(value)) {
    return value[0] || "";
  }

  return String(value || "");
}

function parseAIJson(raw) {
  if (!raw) {
    throw new Error(
      "AI returned an empty response"
    );
  }

  let value =
    String(raw).trim();

  value = value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(value);
  } catch (_) {}

  const firstBrace =
    value.indexOf("{");

  const lastBrace =
    value.lastIndexOf("}");

  if (
    firstBrace !== -1 &&
    lastBrace !== -1 &&
    lastBrace > firstBrace
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

async function fetchWithTimeout(
  url,
  options = {},
  timeout = 30000
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
        signal: controller.signal
      }
    );
  } finally {
    clearTimeout(timer);
  }
}

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
    data = JSON.parse(raw);
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
    return null;
  }

  const user =
    await response.json();

  if (!user?.id) {
    return null;
  }

  return user;
}

async function useSearch(
  accessToken
) {
  const response =
    await fetchWithTimeout(
      `${SUPABASE_URL}/rest/v1/rpc/use_search`,
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
        body: JSON.stringify({
          p_limit:
            MAX_SEARCHES_PER_DAY
        })
      },
      SUPABASE_TIMEOUT
    );

  const raw =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `use_search RPC failed: ${response.status} ${raw.slice(
        0,
        500
      )}`
    );
  }

  let data;

  try {
    data = JSON.parse(raw);
  } catch (_) {
    data = raw;
  }

  if (
    Array.isArray(data) &&
    data.length > 0
  ) {
    data = data[0];
  }

  const allowed =
    Boolean(
      data?.allowed ??
      data?.success ??
      data?.can_search
    );

  const remaining =
    Number(
      data?.remaining ??
      data?.searches_remaining ??
      0
    );

  return {
    allowed,
    remaining:
      Number.isFinite(remaining)
        ? Math.max(0, remaining)
        : 0
  };
}

async function refundSearch(
  accessToken
) {
  try {
    const response =
      await fetchWithTimeout(
        `${SUPABASE_URL}/rest/v1/rpc/refund_search`,
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
          body: JSON.stringify({})
        },
        SUPABASE_TIMEOUT
      );

    const raw =
      await response.text();

    if (!response.ok) {
      return null;
    }

    try {
      let data =
        JSON.parse(raw);

      if (
        Array.isArray(data) &&
        data.length
      ) {
        data = data[0];
      }

      return data;
    } catch (_) {
      return null;
    }
  } catch (_) {
    return null;
  }
}

function normalizeRequest(
  body
) {
  const filters =
    body?.filters &&
    typeof body.filters === "object"
      ? body.filters
      : {};

  const naturalLanguage =
    text(
      body?.naturalLanguage ||
      body?.query ||
      body?.prompt ||
      "",
      3000
    );

  return {
    naturalLanguage,
    filters: {
      budget:
        Number(filters.budget) || 0,
      seats:
        Number(filters.seats) || 0,
      trunk:
        Number(filters.trunk) || 0,
      power:
        Number(filters.power) || 0,
      length:
        Number(filters.length) || 0,
      drive:
        text(filters.drive, 100),
      fuel:
        text(filters.fuel, 100),
      body:
        text(filters.body, 100),
      style:
        text(filters.style, 100),
      avoidBrands:
        text(
          filters.avoidBrands ||
          filters.avoid ||
          "",
          1000
        )
    }
  };
}

function buildPrompt(
  request,
  mode = "research"
) {
  const filters =
    request.filters || {};

  return `
CARMATCH AI automotive research request.

LANGUAGE:
Return all user-facing explanatory text in Slovak.

USER REQUEST:
${request.naturalLanguage || "(none)"}

STRUCTURED FILTERS:
${JSON.stringify(filters, null, 2)}

TARGET MARKET:
Slovakia / European Union unless the user's request clearly
specifies another market.

MODE:
${mode}

============================================================
TASK
============================================================

Find exactly 3 REAL production vehicles that best match the
user's stated requirements.

Interpret the natural-language request together with the
structured filters.

Do not recommend motorcycles, trucks, buses, tractors or
non-production concepts.

For current/new-car requests, prioritize the newest currently
sold or officially announced relevant generation.

============================================================
PRICE
============================================================

Find the REAL CURRENT NEW-VEHICLE PRICE from the manufacturer
or manufacturer-controlled official importer for the TARGET
MARKET.

Preferred order:
1. Official Slovak manufacturer website
2. Official Slovak manufacturer-controlled importer
3. Official EU manufacturer website
4. Official manufacturer configurator
5. Official current manufacturer price list

Do NOT use third-party marketplaces or dealer ads as the
primary price source.

Do NOT use:
- AutoScout24
- mobile.de
- generic autobazars
- dealer listing portals
- Wikipedia
- Reddit
- YouTube
- random blogs

If the official source shows:
"from", "starting at", "od", use the actual starting price.

If the manufacturer genuinely publishes no current price,
use:
" Cena na vyžiadanie "

Never invent prices.

priceSource MUST be the official manufacturer/importer URL used
for the price whenever possible.

============================================================
POWER
============================================================

Power MUST be:
XXX kW / YYY HP

HP means mechanical horsepower.

1 kW = 1.34102209 HP.

Never return:
PS
ks
CV
bhp
koní

============================================================
CURRENT GENERATION
============================================================

For 2026/2027/current requests:
- use the newest relevant production generation;
- do not mix generations;
- do not label a previous generation as current.

============================================================
PHOTOS
============================================================

Do NOT provide image URLs.

The backend searches Wikimedia Commons separately.

image = ""
photoSource = ""

============================================================
CONFIGURATOR
============================================================

configurator must be an official manufacturer URL only.

If none is verified:
configurator = ""

============================================================
MAINTENANCE
============================================================

Give realistic short maintenance notes in Slovak.

Do not invent exact yearly maintenance costs.

============================================================
OUTPUT
============================================================

Return ONLY valid JSON.

No markdown.
No code fences.
No additional text.

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

Important:
- exactly 3 cars;
- year is a number;
- seats is a number;
- score is 0–100;
- pros/cons are arrays;
- dataSources contains URLs or identifiable source names;
- power is always kW + HP;
- price is the current official manufacturer price whenever
  published;
- priceSource is an official manufacturer/importer URL whenever
  possible.
`;
}

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
      .replace(/,/g, ".")
      .match(
        /-?\d+(?:\.\d+)?/
      );

  if (!match) {
    return null;
  }

  const number =
    Number(match[0]);

  return Number.isFinite(number)
    ? number
    : null;
}

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
    String(value).trim();

  if (!raw) {
    return "";
  }

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
          hp /
            POWER_KW_TO_HP
        );

      return `${kw} kW / ${Math.round(
        hp
      )} HP`;
    }
  }

  const metricHpMatch =
    raw.match(
      /(\d+(?:[.,]\d+)?)\s*(?:ps|ks|cv|kon[ií])\b/i
    );

  if (metricHpMatch) {
    const metricHp =
      parseNumeric(
        metricHpMatch[1]
      );

    if (
      metricHp &&
      metricHp > 0
    ) {
      const kw =
        metricHp *
        0.73549875;

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

  const number =
    parseNumeric(raw);

  if (
    number &&
    number > 0
  ) {
    const kw =
      number > 1000
        ? number / 1000
        : number;

    const hp =
      Math.round(
        kw *
          POWER_KW_TO_HP
      );

    return `${Math.round(
      kw
    )} kW / ${hp} HP`;
  }

  return "";
}

function normalizePrice(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  const raw =
    String(value).trim();

  if (!raw) {
    return "";
  }

  if (
    /price unavailable|unavailable|n\/a|not available/i.test(
      raw
    )
  ) {
    return "Cena na vyžiadanie";
  }

  return raw.slice(0, 200);
}

function normalizeYear(
  value
) {
  const year =
    Number(value);

  if (
    !Number.isFinite(year)
  ) {
    return new Date()
      .getUTCFullYear();
  }

  return Math.max(
    1900,
    Math.min(
      2100,
      Math.round(year)
    )
  );
}

function sanitizeCar(
  car
) {
  return {
    name: text(
      car?.name,
      200
    ),
    generation: text(
      car?.generation,
      200
    ),
    year: normalizeYear(
      car?.year
    ),
    score: Math.max(
      0,
      Math.min(
        100,
        Number(car?.score) || 0
      )
    ),
    price:
      normalizePrice(
        car?.price
      ),
    power:
      normalizePower(
        car?.power
      ),
    seats: Math.max(
      0,
      Math.round(
        Number(car?.seats) || 0
      )
    ),
    trunk: text(
      car?.trunk,
      100
    ),
    drive: text(
      car?.drive,
      100
    ),
    fuel: text(
      car?.fuel,
      100
    ),
    reason: text(
      car?.reason,
      1500
    ),
    pros:
      arrayText(
        car?.pros,
        8,
        300
      ),
    cons:
      arrayText(
        car?.cons,
        8,
        300
      ),
    maintenance:
      text(
        car?.maintenance,
        1000
      ),
    image: "",
    photoSource: "",
    configurator:
      text(
        car?.configurator,
        1000
      ),
    priceSource:
      text(
        car?.priceSource,
        1000
      ),
    dataSources:
      arrayText(
        car?.dataSources,
        MAX_DATA_SOURCES,
        1000
      )
  };
}

function validateCars(
  parsed
) {
  if (
    !parsed ||
    !Array.isArray(
      parsed.cars
    )
  ) {
    throw new Error(
      "AI response does not contain cars array"
    );
  }

  if (
    parsed.cars.length !== 3
  ) {
    throw new Error(
      `AI returned ${parsed.cars.length} cars instead of exactly 3`
    );
  }

  const cars =
    parsed.cars.map(
      sanitizeCar
    );

  for (const car of cars) {
    if (!car.name) {
      throw new Error(
        "AI returned a car without a name"
      );
    }
  }

  return cars;
}

function getBrandKey(
  carName
) {
  const normalized =
    String(carName || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(
        /[\u0300-\u036f]/g,
        ""
      )
      .replace(
        /[^a-z0-9]/g,
        ""
      );

  const aliases = [
    ["mercedes", "mercedes"],
    ["benz", "mercedes"],
    ["bmw", "bmw"],
    ["audi", "audi"],
    ["porsche", "porsche"],
    ["volkswagen", "volkswagen"],
    ["skoda", "skoda"],
    ["volvo", "volvo"],
    ["lexus", "lexus"],
    ["toyota", "toyota"],
    ["ferrari", "ferrari"],
    ["lamborghini", "lamborghini"],
    ["maserati", "maserati"],
    ["astonmartin", "astonmartin"],
    ["mclaren", "mclaren"],
    ["ford", "ford"],
    ["opel", "opel"],
    ["peugeot", "peugeot"],
    ["citroen", "citroen"],
    ["renault", "renault"],
    ["nissan", "nissan"],
    ["honda", "honda"],
    ["mazda", "mazda"],
    ["kia", "kia"],
    ["hyundai", "hyundai"],
    ["genesis", "genesis"],
    ["fiat", "fiat"],
    ["alfaromeo", "alfaromeo"],
    ["jeep", "jeep"],
    ["dodge", "dodge"],
    ["ram", "ram"],
    ["tesla", "tesla"],
    ["byd", "byd"],
    ["polestar", "polestar"],
    ["lotus", "lotus"],
    ["smart", "smart"],
    ["mini", "mini"]
  ];

  for (
    const [alias, key]
    of aliases
  ) {
    if (
      normalized.includes(
        alias
      )
    ) {
      return key;
    }
  }

  return "";
}

function isOfficialManufacturerURL(
  url,
  carName
) {
  if (
    !url ||
    typeof url !== "string"
  ) {
    return false;
  }

  let parsed;

  try {
    parsed =
      new URL(url);
  } catch (_) {
    return false;
  }

  if (
    parsed.protocol !==
    "https:"
  ) {
    return false;
  }

  const hostname =
    parsed.hostname
      .toLowerCase()
      .replace(
        /^www\./,
        ""
      );

  if (
    OBVIOUS_THIRD_PARTY_HOSTS.some(
      domain =>
        hostname === domain ||
        hostname.endsWith(
          `.${domain}`
        )
    )
  ) {
    return false;
  }

  const brand =
    getBrandKey(
      carName
    );

  const hints =
    OFFICIAL_DOMAIN_HINTS[
      brand
    ];

  if (
    !hints ||
    hints.length === 0
  ) {
    return false;
  }

  return hints.some(
    domain =>
      hostname === domain ||
      hostname.endsWith(
        `.${domain}`
      )
  );
}

function sanitizeURL(
  url,
  carName,
  allowOfficialOnly = false
) {
  if (
    !url ||
    typeof url !== "string"
  ) {
    return "";
  }

  try {
    const parsed =
      new URL(url);

    if (
      parsed.protocol !==
      "https:"
    ) {
      return "";
    }

    if (
      parsed.username ||
      parsed.password
    ) {
      return "";
    }

    const hostname =
      parsed.hostname
        .toLowerCase();

    if (
      hostname ===
        "localhost" ||
      hostname ===
        "127.0.0.1" ||
      hostname ===
        "0.0.0.0" ||
      hostname ===
        "::1" ||
      hostname.endsWith(
        ".local"
      )
    ) {
      return "";
    }

    if (
      OBVIOUS_THIRD_PARTY_HOSTS.some(
        domain =>
          hostname === domain ||
          hostname.endsWith(
            `.${domain}`
          )
      )
    ) {
      return "";
    }

    if (
      allowOfficialOnly &&
      !isOfficialManufacturerURL(
        url,
        carName
      )
    ) {
      return "";
    }

    return parsed.toString();
  } catch (_) {
    return "";
  }
}

function sanitizeCarLinks(
  car
) {
  const result = {
    ...car
  };

  result.configurator =
    sanitizeURL(
      car.configurator,
      car.name,
      true
    );

  result.priceSource =
    sanitizeURL(
      car.priceSource,
      car.name,
      true
    );

  result.dataSources =
    arrayText(
      car.dataSources,
      MAX_DATA_SOURCES,
      1000
    )
      .map(source => {
        if (
          /^https:\/\//i.test(
            source
          )
        ) {
          return sanitizeURL(
            source,
            car.name,
            false
          );
        }

        return source;
      })
      .filter(Boolean);

  return result;
}

function carNameSearchTokens(
  car
) {
  return String(
    car?.name || ""
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
      word =>
        word.length >= 3
    )
    .slice(0, 8);
}

async function verifyOfficialPage(
  url,
  car
) {
  if (
    !isOfficialManufacturerURL(
      url,
      car.name
    )
  ) {
    return null;
  }

  try {
    const response =
      await fetchWithTimeout(
        url,
        {
          method: "GET",
          headers: {
            "User-Agent":
              "CARMATCH-AI/7.0"
          }
        },
        OFFICIAL_PAGE_TIMEOUT
      );

    if (!response.ok) {
      return null;
    }

    const html =
      await response.text();

    return html
      .replace(
        /<script[\s\S]*?<\/script>/gi,
        " "
      )
      .replace(
        /<style[\s\S]*?<\/style>/gi,
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
  } catch (_) {
    return null;
  }
}

function extractOfficialEuroPriceFromText(
  visible,
  car
) {
  if (!visible) {
    return "";
  }

  const lower =
    visible.toLowerCase();

  const tokens =
    carNameSearchTokens(
      car
    );

  const modelFound =
    tokens.length === 0 ||
    tokens.some(
      token =>
        lower.includes(
          token
        )
    );

  if (!modelFound) {
    return "";
  }

  const patterns = [
    /(?:from|starting\s+at|od|ab)\s*(?:€|eur)\s*([\d\s.,]+)/i,
    /(?:€|eur)\s*([\d\s.,]+)/i
  ];

  for (
    const pattern
    of patterns
  ) {
    const match =
      visible.match(
        pattern
      );

    if (!match) {
      continue;
    }

    const raw =
      String(
        match[1]
      )
        .replace(
          /\s/g,
          ""
        )
        .replace(
          /\./g,
          ""
        )
        .replace(
          /,/g,
          "."
        );

    const amount =
      Number(raw);

    if (
      Number.isFinite(
        amount
      ) &&
      amount >= 1000 &&
      amount <= 10000000
    ) {
      const formatted =
        Math.round(
          amount
        ).toLocaleString(
          "sk-SK"
        );

      const prefix =
        /from|starting\s+at|od|ab/i.test(
          match[0]
        )
          ? "Od "
          : "";

      return `${prefix}€${formatted}`;
    }
  }

  return "";
}

async function verifyPricesAndSources(
  request,
  cars,
  liveWeb
) {
  return Promise.all(
    cars.map(
      async car => {
        let result = {
          ...car
        };

        const candidates = [];

        if (
          isOfficialManufacturerURL(
            car.priceSource,
            car.name
          )
        ) {
          candidates.push(
            car.priceSource
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
            candidates.push(
              source
            );
          }
        }

        if (
          isOfficialManufacturerURL(
            car.configurator,
            car.name
          )
        ) {
          candidates.push(
            car.configurator
          );
        }

        const unique =
          [
            ...new Set(
              candidates
            )
          ].slice(0, 4);

        for (
          const url
          of unique
        ) {
          const visible =
            await verifyOfficialPage(
              url,
              car
            );

          if (!visible) {
            continue;
          }

          const officialPrice =
            extractOfficialEuroPriceFromText(
              visible,
              car
            );

          if (
            officialPrice
          ) {
            result.price =
              officialPrice;

            result.priceSource =
              url;

            break;
          }
        }

        if (
          !result.price
        ) {
          result.price =
            "Cena na vyžiadanie";
        }

        result.priceSource =
          sanitizeURL(
            result.priceSource,
            result.name,
            true
          );

        return result;
      }
    )
  );
}

function buildImageSearchQueries(
  car
) {
  const name =
    text(
      car.name,
      200
    );

  const generation =
    text(
      car.generation,
      200
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
    Number.isFinite(year)
  ) {
    queries.push(
      `${name} ${year} car automobile`
    );
  }

  if (name) {
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
    typeof url !== "string"
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

  const nameTokens =
    carNameSearchTokens(
      car
    );

  const generation =
    String(
      car.generation || ""
    )
      .toLowerCase();

  let score = 0;

  for (
    const token
    of nameTokens
  ) {
    if (
      combined.includes(
        token
      )
    ) {
      score += 8;
    }
  }

  for (
    const token
    of generation
      .split(
        /[^a-z0-9]+/
      )
      .filter(
        x =>
          x.length >= 2
      )
  ) {
    if (
      combined.includes(
        token
      )
    ) {
      score += 10;
    }
  }

  if (
    Number.isFinite(
      Number(car.year)
    ) &&
    combined.includes(
      String(car.year)
    )
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
  queryIndex
) {
  const params =
    new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: query,
      gsrnamespace: "6",
      gsrlimit: "20",
      prop: "imageinfo",
      iiprop:
        "url|mime|size",
      iiurlwidth: "1000",
      format: "json",
      origin: "*"
    });

  const data =
    await fetchJson(
      `${WIKIMEDIA_API}?${params.toString()}`,
      {},
      WIKIMEDIA_TIMEOUT
    );

  const pages =
    Object.values(
      data?.query?.pages || {}
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

    const info =
      page?.imageinfo?.[0];

    const image =
      info?.thumburl ||
      info?.url ||
      "";

    if (
      !isWikimediaPhotoURL(
        image
      )
    ) {
      continue;
    }

    if (
      !isImageExtension(
        image
      )
    ) {
      continue;
    }

    candidates.push({
      image,
      photoSource:
        info?.descriptionurl ||
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
      gsrlimit: "20",
      prop: "pageimages",
      piprop: "thumbnail",
      pithumbsize: "1000",
      format: "json",
      origin: "*"
    });

  const data =
    await fetchJson(
      `${WIKIPEDIA_API}?${params.toString()}`,
      {},
      WIKIPEDIA_TIMEOUT
    );

  const pages =
    Object.values(
      data?.query?.pages || {}
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
        findCarImages(car)
    )
  );
}

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
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          Authorization:
            `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: `
You are CARMATCH AI.

You are an automotive research engine.

ALWAYS research current data with the available browser search.
ALWAYS prioritize official manufacturer sources for prices.
ALWAYS return explanatory text in Slovak.

POWER MUST be:
XXX kW / YYY HP

HP means mechanical horsepower.
1 kW = 1.34102209 HP.
Never return PS, ks, CV, bhp or koní in the final power field.

Never invent prices or URLs.
Return ONLY valid JSON.
`
            },
            {
              role: "user",
              content:
                buildPrompt(
                  request,
                  mode
                )
            }
          ],
          temperature: 0.1,
          max_completion_tokens:
            12000,
          tools: [
            {
              type:
                "browser_search"
            }
          ],
          tool_choice:
            "required",
          reasoning_effort:
            mode === "repair"
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

  if (!response.ok) {
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
      JSON.parse(raw);
  } catch (_) {
    throw new Error(
      "Groq API returned invalid JSON"
    );
  }

  const content =
    apiData?.choices?.[0]
      ?.message?.content;

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
    liveWeb: true,
    rawApi:
      apiData
  };
}

async function callGroqResearch(
  request
) {
  let lastError = null;

  const primary =
    GROQ_MODELS[0];

  try {
    return await callGroqModel(
      request,
      primary.model,
      primary.timeout,
      primary.purpose
    );
  } catch (error) {
    lastError =
      error;

    console.error(
      "CARMATCH AI primary Groq failed:",
      error
    );
  }

  const fallback =
    GROQ_MODELS[1];

  try {
    return await callGroqModel(
      request,
      fallback.model,
      fallback.timeout,
      fallback.purpose
    );
  } catch (error) {
    lastError =
      error;

    console.error(
      "CARMATCH AI fallback Groq failed:",
      error
    );
  }

  throw (
    lastError ||
    new Error(
      "All Groq models failed"
    )
  );
}

function openRouterSupportsJsonMode(
  model
) {
  return (
    model ===
    "qwen/qwen3.8-27b:free"
  );
}

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
        role: "system",
        content: `
You are CARMATCH AI fallback.

Return ONLY valid JSON.

Always write all explanatory text in Slovak.

Power MUST be formatted as:
XXX kW / YYY HP

HP is mechanical horsepower.
1 kW = 1.34102209 HP.

Never use PS, ks, CV, bhp or koní in the power field.

Do not invent current prices.
Do not invent URLs.
Do not invent image URLs.

The backend searches images separately.

When a CURRENT official manufacturer price cannot be verified,
use "Cena na vyžiadanie" rather than inventing one.

Return exactly 3 real production vehicles.
`
      },
      {
        role: "user",
        content:
          buildPrompt(
            request,
            "research"
          )
      }
    ],
    temperature: 0.1,
    max_tokens: 11000
  };

  if (
    openRouterSupportsJsonMode(
      model
    )
  ) {
    body.response_format = {
      type: "json_object"
    };
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
        body:
          JSON.stringify(
            body
          )
      },
      OPENROUTER_TIMEOUT
    );

  const raw =
    await response.text();

  if (!response.ok) {
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
      JSON.parse(raw);
  } catch (_) {
    throw new Error(
      "OpenRouter API returned invalid JSON"
    );
  }

  const content =
    apiData?.choices?.[0]
      ?.message?.content;

  if (!content) {
    throw new Error(
      `OpenRouter ${model} returned empty content`
    );
  }

  const parsed =
    parseAIJson(
      content
    );

  return {
    cars:
      validateCars(
        parsed
      ),
    provider:
      `OpenRouter ${model}`,
    liveWeb: false,
    rawApi:
      apiData
  };
}

async function callOpenRouter(
  request
) {
  let lastError = null;

  for (
    const model
    of OPENROUTER_FREE_MODELS
  ) {
    try {
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

export default async function handler(
  req,
  res
) {
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

  let searchCharged =
    false;

  try {
    if (
      !SUPABASE_URL ||
      !SUPABASE_ANON_KEY
    ) {
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

    let result = null;
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
          retryable: true,
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

    cars =
      await addCarImages(
        cars
      );

    cars =
      finalSanitizeCars(
        cars
      );

    if (
      cars.length !== 3
    ) {
      throw new Error(
        "Final result does not contain exactly 3 cars"
      );
    }

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
          "Server configuration error",
        message:
          "CARMATCH AI sa nepodarilo dokončiť požiadavku. Vyhľadávanie sa nezapočítalo do limitu, ak bolo možné ho bezpečne vrátiť.",
        retryable: true,
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