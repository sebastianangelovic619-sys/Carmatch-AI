
"use strict";

/* ============================================================
   CARMATCH AI - BACKEND v20
   - Výstup výhradne v slovenčine
   - Kompatibilita s frontend app.js v19
   - Presne 3 rozdielne vozidlá
   - Konzervatívne technické údaje
   - Supabase autentifikácia
   - Limit 5 vyhľadávaní denne
   - Refund pri chybe AI
   ============================================================ */

const SUPABASE_URL = (
  process.env.SUPABASE_URL || ""
).replace(/\/+$/, "");

const SUPABASE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLIC_KEY ||
  "";

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY || "";

const DAILY_LIMIT = 5;
const MAX_QUERY_LENGTH = 1000;

const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const OPENROUTER_URL =
  "https://openrouter.ai/api/v1/chat/completions";


/* ============================================================
   ZÁKLADNÉ FUNKCIE
   ============================================================ */

function send(res, status, data) {
  return res.status(status).json(data);
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);

  return match ? match[1].trim() : "";
}

async function readJson(response) {
  const raw = await response.text();

  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return {
      message: raw.slice(0, 1500)
    };
  }
}

function firstValue(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;

    if (
      typeof value === "string" &&
      !value.trim()
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function cleanString(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (
    typeof value === "string" ||
    typeof value === "number"
  ) {
    return String(value).trim() || fallback;
  }

  return fallback;
}

function cleanList(value) {
  if (Array.isArray(value)) {
    return value
      .map(item => cleanString(item))
      .filter(Boolean)
      .slice(0, 6);
  }

  if (
    typeof value === "string" &&
    value.trim()
  ) {
    return [value.trim()];
  }

  return [];
}

function normalizeText(value) {
  return cleanString(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}


/* ============================================================
   PREKLAD BEŽNÝCH TECHNICKÝCH OZNAČENÍ
   ============================================================ */

function localizeValue(value, dictionary) {
  const original = cleanString(value);

  if (!original) return null;

  const normalized = normalizeText(original);

  if (dictionary[normalized]) {
    return dictionary[normalized];
  }

  return original;
}

const FUEL_TRANSLATIONS = {
  "petrol": "Benzín",
  "gasoline": "Benzín",
  "diesel": "Nafta",
  "electric": "Elektrina",
  "ev": "Elektrina",
  "hybrid": "Hybrid",
  "mild hybrid": "Mild-hybrid",
  "plug-in hybrid": "Plug-in hybrid",
  "plugin hybrid": "Plug-in hybrid",
  "phev": "Plug-in hybrid",
  "hev": "Hybrid",
  "hydrogen": "Vodík",
  "lpg": "LPG",
  "cng": "CNG"
};

const DRIVE_TRANSLATIONS = {
  "awd": "Pohon všetkých kolies",
  "4wd": "Pohon všetkých kolies",
  "4x4": "Pohon všetkých kolies",
  "all wheel drive": "Pohon všetkých kolies",
  "four wheel drive": "Pohon všetkých kolies",
  "fwd": "Pohon predných kolies",
  "front wheel drive": "Pohon predných kolies",
  "rwd": "Pohon zadných kolies",
  "rear wheel drive": "Pohon zadných kolies"
};

const TRANSMISSION_TRANSLATIONS = {
  "automatic": "Automatická",
  "automatic transmission": "Automatická",
  "manual": "Manuálna",
  "manual transmission": "Manuálna",
  "dct": "Dvojspojková automatická",
  "dual clutch": "Dvojspojková automatická",
  "cvt": "Automatická CVT",
  "single speed": "Jednostupňová",
  "single-speed": "Jednostupňová"
};

const BODY_TRANSLATIONS = {
  "suv": "SUV",
  "coupe": "Kupé",
  "coupé": "Kupé",
  "sedan": "Sedan",
  "saloon": "Sedan",
  "estate": "Kombi",
  "wagon": "Kombi",
  "station wagon": "Kombi",
  "hatchback": "Hatchback",
  "convertible": "Kabriolet",
  "cabriolet": "Kabriolet",
  "roadster": "Roadster",
  "pickup": "Pick-up",
  "van": "Dodávka",
  "mpv": "Rodinné MPV",
  "liftback": "Liftback",
  "fastback": "Fastback"
};

function localizeFuel(value) {
  return localizeValue(value, FUEL_TRANSLATIONS);
}

function localizeDrive(value) {
  return localizeValue(value, DRIVE_TRANSLATIONS);
}

function localizeTransmission(value) {
  return localizeValue(
    value,
    TRANSMISSION_TRANSLATIONS
  );
}

function localizeBody(value) {
  return localizeValue(value, BODY_TRANSLATIONS);
}


/* ============================================================
   FILTRE A VYTVORENIE ZADANIA
   ============================================================ */

function formatFilterValue(value) {
  if (
    value === undefined ||
    value === null ||
    value === false
  ) {
    return "";
  }

  if (Array.isArray(value)) {
    return value
      .map(item => String(item).trim())
      .filter(Boolean)
      .join(", ");
  }

  if (typeof value === "object") {
    return "";
  }

  const formatted = String(value).trim();

  const ignored = [
    "",
    "any",
    "all",
    "none",
    "null",
    "undefined",
    "nezáleží",
    "všetky",
    "všetko"
  ];

  return ignored.includes(formatted.toLowerCase())
    ? ""
    : formatted;
}

function getFilterLines(filters) {
  if (!filters || typeof filters !== "object") {
    return [];
  }

  const definitions = [
    { keys: ["budget"], label: "Maximálny rozpočet (€)" },
    { keys: ["seats"], label: "Počet sedadiel" },
    { keys: ["power"], label: "Minimálny výkon (kW)" },
    { keys: ["trunk"], label: "Minimálny objem kufra (l)" },
    { keys: ["drive"], label: "Požadovaný pohon" },
    { keys: ["fuel"], label: "Požadované palivo" },
    { keys: ["body"], label: "Typ karosérie" },
    { keys: ["style"], label: "Požadovaný štýl" },
    { keys: ["length"], label: "Maximálna dĺžka (m)" },
    { keys: ["year"], label: "Minimálny rok výroby" },
    { keys: ["avoid", "avoidBrands"], label: "Vylúčené značky" }
  ];

  const lines = [];

  for (const definition of definitions) {
    let value = "";

    for (const key of definition.keys) {
      value = formatFilterValue(filters[key]);

      if (value) break;
    }

    if (value) {
      lines.push(`${definition.label}: ${value}`);
    }
  }

  return lines;
}

function buildSearchQuery(body) {
  const directCandidates = [
    body.query,
    body.prompt,
    body.search
  ];

  for (const candidate of directCandidates) {
    if (
      typeof candidate === "string" &&
      candidate.trim()
    ) {
      return candidate.trim();
    }
  }

  const naturalLanguage =
    typeof body.naturalLanguage === "string"
      ? body.naturalLanguage.trim()
      : "";

  const filterLines = getFilterLines(body.filters);

  const parts = [];

  if (naturalLanguage) {
    parts.push(
      "POŽIADAVKA ZÁKAZNÍKA:\n" +
      naturalLanguage
    );
  }

  if (filterLines.length) {
    parts.push(
      "POVINNÉ FILTRE:\n" +
      filterLines.join("\n")
    );
  }

  return parts.join("\n\n").trim();
}


/* ============================================================
   SUPABASE AUTENTIFIKÁCIA
   ============================================================ */

async function verifyUser(accessToken) {
  const response = await fetch(
    `${SUPABASE_URL}/auth/v1/user`,
    {
      method: "GET",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  const data = await readJson(response);

  if (!response.ok || !data?.id) {
    console.error(
      "CARMATCH AI: Auth verification failed",
      {
        status: response.status,
        error: data
      }
    );

    return null;
  }

  return data;
}


/* ============================================================
   SUPABASE RPC
   ============================================================ */

async function supabaseRpc(
  functionName,
  payload,
  accessToken
) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/${functionName}`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Content-Profile": "public",
        "Accept-Profile": "public"
      },
      body: JSON.stringify(payload)
    }
  );

  const data = await readJson(response);

  return {
    ok: response.ok,
    status: response.status,
    data,
    error: response.ok ? null : data
  };
}

function normalizeRpcData(data) {
  if (Array.isArray(data)) {
    return data.length ? data[0] : null;
  }

  return data;
}

function extractRemaining(data) {
  if (!data || typeof data !== "object") {
    return null;
  }

  const value =
    data.remaining ??
    data.searches_remaining ??
    data.remaining_searches;

  if (value === undefined || value === null) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? Math.max(0, Math.min(DAILY_LIMIT, number))
    : null;
}


/* ============================================================
   ODPOČÍTANIE VYHĽADÁVANIA
   ============================================================ */

async function chargeSearch(accessToken) {
  const result = await supabaseRpc(
    "increment_search",
    {
      daily_limit: DAILY_LIMIT,
      max_searches: DAILY_LIMIT
    },
    accessToken
  );

  if (!result.ok) {
    console.error(
      "CARMATCH AI: increment_search failed",
      {
        status: result.status,
        error: result.error
      }
    );

    return {
      ok: false,
      limited: false
    };
  }

  const data = normalizeRpcData(result.data);

  if (
    !data ||
    typeof data !== "object" ||
    typeof data.allowed !== "boolean"
  ) {
    console.error(
      "CARMATCH AI: Unexpected increment response",
      data
    );

    return {
      ok: false,
      limited: false
    };
  }

  if (data.allowed === false) {
    return {
      ok: false,
      limited: true,
      remaining: 0
    };
  }

  return {
    ok: true,
    limited: false,
    remaining: extractRemaining(data)
  };
}


/* ============================================================
   VRÁTENIE VYHĽADÁVANIA PRI CHYBE
   ============================================================ */

async function refundSearch(accessToken) {
  const result = await supabaseRpc(
    "refund_search",
    {},
    accessToken
  );

  if (!result.ok) {
    console.error(
      "CARMATCH AI: refund_search failed",
      {
        status: result.status,
        error: result.error
      }
    );

    return {
      ok: false,
      refunded: false,
      remaining: null
    };
  }

  const data = normalizeRpcData(result.data);

  if (
    !data ||
    typeof data !== "object" ||
    typeof data.refunded !== "boolean"
  ) {
    console.error(
      "CARMATCH AI: Unexpected refund response",
      data
    );

    return {
      ok: false,
      refunded: false,
      remaining: null
    };
  }

  return {
    ok: true,
    refunded: data.refunded,
    remaining: extractRemaining(data)
  };
}


/* ============================================================
   AI JSON PARSING
   ============================================================ */

function extractMessageContent(data) {
  const content = data?.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map(item => item.text || "")
      .join("\n");
  }

  return "";
}

function parseCarsResponse(content) {
  if (!content || typeof content !== "string") {
    throw new Error("AI nevrátila žiadnu odpoveď.");
  }

  let cleaned = content.trim();

  cleaned = cleaned
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  let parsed;

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");

    if (first === -1 || last <= first) {
      throw new Error("Odpoveď AI nemá platný JSON formát.");
    }

    parsed = JSON.parse(
      cleaned.slice(first, last + 1)
    );
  }

  const rawCars = Array.isArray(parsed)
    ? parsed
    : parsed?.cars;

  if (!Array.isArray(rawCars) || rawCars.length !== 3) {
    throw new Error(
      "AI musí vrátiť presne tri vozidlá."
    );
  }

  const cars = rawCars.map(rawCar => {
    const car = rawCar && typeof rawCar === "object"
      ? rawCar
      : {};

    const specs = car.specs || {};
    const technical = car.technicalData || {};

    const power = firstValue(
      car.power,
      car.enginePower,
      specs.power,
      technical.power
    );

    const engine = firstValue(
      car.engine,
      car.engineVersion,
      specs.engine,
      technical.engine
    );

    const consumptionWltp = firstValue(
      car.consumptionWltp,
      car.wltpConsumption,
      specs.consumptionWltp,
      specs.wltp,
      specs.consumption,
      technical.consumptionWltp
    );

    const seats = firstValue(
      car.seats,
      car.seatCount,
      specs.seats,
      technical.seats
    );

    const trunkLiters = firstValue(
      car.trunkLiters,
      car.trunk,
      car.boot,
      specs.trunkLiters,
      specs.trunk,
      technical.trunkLiters
    );

    const drivetrain = firstValue(
      car.drivetrain,
      car.drive,
      specs.drivetrain,
      specs.drive,
      technical.drivetrain
    );

    const fuel = firstValue(
      car.fuel,
      car.fuelType,
      specs.fuel,
      technical.fuel
    );

    const transmission = firstValue(
      car.transmission,
      car.gearbox,
      specs.transmission,
      technical.transmission
    );

    const lengthMm = firstValue(
      car.lengthMm,
      car.lengthMM,
      specs.lengthMm,
      specs.length,
      technical.lengthMm
    );

    const body = firstValue(
      car.body,
      car.bodyType,
      specs.body
    );

    const brand = cleanString(car.brand);

    const model = cleanString(
      firstValue(
        car.model,
        car.name,
        car.title
      )
    );

    const name = cleanString(
      firstValue(
        car.name,
        car.model,
        car.title
      ),
      "Neznáme vozidlo"
    );

    return {
      brand,
      name,
      model,

      generation: cleanString(car.generation),
      trim: cleanString(
        firstValue(
          car.trim,
          car.version,
          car.variant
        )
      ),

      year: firstValue(
        car.year,
        car.modelYear
      ),

      modelYear: firstValue(
        car.modelYear,
        car.year
      ),

      /*
       * Bez spoľahlivého externého cenového zdroja
       * cenu neprezentujeme ako overenú.
       */

      price: null,
      currency: "EUR",
      priceSource: "",

      /*
       * AI nesmie vymýšľať oficiálne odkazy.
       */

      configurator: "",
      officialUrl: "",

      /*
       * Obrázky dopĺňa frontend samostatne.
       */

      image: "",
      imageUrl: "",
      images: [],
      imageCandidates: [],

      power,
      engine,
      consumptionWltp,

      seats,
      trunkLiters,

      drivetrain: localizeDrive(drivetrain),
      fuel: localizeFuel(fuel),
      transmission: localizeTransmission(transmission),

      lengthMm,
      body: localizeBody(body),

      score: null,

      reason: cleanString(
        firstValue(
          car.reason,
          car.description
        ),
        "Dôvod odporúčania nebol uvedený."
      ),

      pros: cleanList(car.pros),
      cons: cleanList(car.cons),

      maintenance: cleanString(
        car.maintenance,
        "Informácie o údržbe nie sú overené."
      )
    };
  });

  const identities = cars.map(car =>
    `${normalizeText(car.brand)} ${normalizeText(car.model)}`
      .replace(/\s+/g, " ")
      .trim()
  );

  if (
    identities.some(identity => !identity) ||
    new Set(identities).size !== 3
  ) {
    throw new Error(
      "AI vrátila neúplné alebo duplicitné modely."
    );
  }

  return cars;
}


/* ============================================================
   SLOVENSKÝ PROMPT PRE AI
   ============================================================ */

function buildPrompt(query) {
  return `
Si CARMATCH AI – profesionálny automobilový poradca.

DÔLEŽITÉ:
Komunikuješ výhradne v SLOVENSKOM JAZYKU.

ZÁKAZNÍKOVA POŽIADAVKA:
${query}

Tvojou úlohou je nájsť presne TRI rozdielne skutočné vozidlá,
ktoré čo najpresnejšie zodpovedajú požiadavkám zákazníka.

ODPOVEĎ MUSÍ BYŤ VÝHRADNE PLATNÝ JSON.

Použi presne túto štruktúru:

{
  "cars": [
    {
      "brand": "Značka",
      "name": "Úplný názov vozidla",
      "model": "Presný model a verzia",
      "generation": "Generácia vozidla",
      "trim": "Výbava",
      "year": 2026,

      "price": null,
      "currency": "EUR",

      "body": "SUV",
      "power": "200 kW / 272 HP",
      "engine": "Benzínový motor 2,0 l",
      "consumptionWltp": "7,5 l/100 km",

      "seats": 5,
      "trunkLiters": 600,
      "drivetrain": "Pohon všetkých kolies",
      "fuel": "Benzín",
      "transmission": "Automatická",
      "lengthMm": 4800,

      "reason": "Toto vozidlo vyhovuje požiadavkám, pretože...",
      "pros": [
        "Prvá výhoda",
        "Druhá výhoda"
      ],
      "cons": [
        "Prvá nevýhoda",
        "Druhá nevýhoda"
      ],
      "maintenance": "Stručné informácie o údržbe."
    }
  ]
}

JAZYKOVÉ PRAVIDLÁ:

1. VŠETKY texty píš po slovensky.
2. Nepoužívaj anglické vety.
3. Dôvody odporúčania píš prirodzenou slovenčinou.
4. Výhody a nevýhody píš po slovensky.
5. Informácie o údržbe píš po slovensky.
6. Technické označenia prekladaj, ak majú bežný slovenský ekvivalent.
7. Názvy automobilových značiek a oficiálne názvy modelov nemeníš.
8. Skratky ako SUV, WLTP, AWD a kW môžeš ponechať, ale ich význam vysvetli po slovensky, ak je to potrebné.
9. Nepoužívaj anglické označenia ako Petrol, Diesel, Automatic, Front Wheel Drive alebo Rear Wheel Drive, ak existuje slovenský ekvivalent.

PRAVIDLÁ PRESNOSTI:

1. Vráť presne tri ROZDIELNE modely automobilov.
2. Odporúčaj iba skutočne existujúce vozidlá.
3. Dodrž všetky povinné požiadavky zákazníka.
4. Neodporúčaj vozidlo, ktoré nespĺňa jasne zadaný povinný filter.
5. Dodrž maximálny rozpočet.
6. Nezamieňaj jednotlivé generácie vozidiel.
7. Nezamieňaj benzín, naftu, mild-hybrid, plug-in hybrid a elektromobil.
8. Nikdy nevymýšľaj výkon, motor, počet sedadiel, objem kufra ani rozmery.
9. Ak údaj spoľahlivo nepoznáš, použi null.
10. Nevymýšľaj aktuálnu cenu.
11. Ak cenu nevieš spoľahlivo potvrdiť, použi null.
12. Nevymýšľaj odkazy na oficiálne stránky.
13. Výkon uvádzaj v kW a HP.
14. Objem kufra uvádzaj v litroch.
15. Dĺžku vozidla uvádzaj v milimetroch.
16. Spotrebu uvádzaj podľa WLTP iba vtedy, ak ju poznáš.
17. Výhody a nevýhody musia zodpovedať konkrétnemu modelu.
18. Nevymýšľaj percentuálnu zhodu.
19. Ak nevieš potvrdiť údaj, radšej ho vynechaj.
20. Nevkladaj žiadny text mimo JSON.

KVALITA JE DÔLEŽITEJŠIA AKO MNOŽSTVO ÚDAJOV.
`;
}


/* ============================================================
   GROQ
   ============================================================ */

async function callGroq(query) {
  if (!GROQ_API_KEY) {
    throw new Error("Chýba nastavenie GROQ_API_KEY.");
  }

  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content:
            "Si slovenský automobilový poradca. Vždy odpovedaj výhradne po slovensky a vráť iba platný JSON."
        },
        {
          role: "user",
          content: buildPrompt(query)
        }
      ],
      temperature: 0.1,
      max_tokens: 4500,
      response_format: {
        type: "json_object"
      }
    })
  });

  const data = await readJson(response);

  if (!response.ok) {
    console.error(
      "CARMATCH AI: Groq failed",
      {
        status: response.status,
        error: data
      }
    );

    throw new Error(
      `Požiadavka na Groq zlyhala: ${response.status}`
    );
  }

  return extractMessageContent(data);
}


/* ============================================================
   OPENROUTER
   ============================================================ */

async function callOpenRouter(query) {
  if (!OPENROUTER_API_KEY) {
    throw new Error("Chýba nastavenie OPENROUTER_API_KEY.");
  }

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer":
        process.env.APP_URL ||
        "https://carmatchai.vercel.app",
      "X-Title": "CARMATCH AI"
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Si slovenský automobilový poradca. Vždy odpovedaj výhradne po slovensky a vráť iba platný JSON."
        },
        {
          role: "user",
          content: buildPrompt(query)
        }
      ],
      temperature: 0.1,
      max_tokens: 4500,
      response_format: {
        type: "json_object"
      }
    })
  });

  const data = await readJson(response);

  if (!response.ok) {
    console.error(
      "CARMATCH AI: OpenRouter failed",
      {
        status: response.status,
        error: data
      }
    );

    throw new Error(
      `Požiadavka na OpenRouter zlyhala: ${response.status}`
    );
  }

  return extractMessageContent(data);
}


/* ============================================================
   GENEROVANIE ÁUT
   ============================================================ */

async function generateCars(query) {
  let firstError = null;

  if (GROQ_API_KEY) {
    try {
      const content = await callGroq(query);

      return parseCarsResponse(content);

    } catch (error) {
      firstError = error;

      console.error(
        "CARMATCH AI: Groq attempt failed",
        error.message
      );
    }
  }

  if (OPENROUTER_API_KEY) {
    try {
      const content = await callOpenRouter(query);

      return parseCarsResponse(content);

    } catch (error) {
      console.error(
        "CARMATCH AI: OpenRouter attempt failed",
        error.message
      );

      throw error;
    }
  }

  throw firstError || new Error(
    "Nie je nastavený žiadny AI poskytovateľ."
  );
}


/* ============================================================
   HLAVNÝ API HANDLER
   ============================================================ */

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return send(res, 405, {
      error: "Použi požiadavku POST."
    });
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error(
      "CARMATCH AI: Missing Supabase environment variables"
    );

    return send(res, 500, {
      error: "Supabase nie je správne nastavený na serveri."
    });
  }

  if (!GROQ_API_KEY && !OPENROUTER_API_KEY) {
    return send(res, 500, {
      error: "Na serveri nie je nastavený AI poskytovateľ."
    });
  }

  const accessToken = getBearerToken(req);

  if (!accessToken) {
    return send(res, 401, {
      error: "Prihlás sa a skús vyhľadávanie znova."
    });
  }

  let user;

  try {
    user = await verifyUser(accessToken);

  } catch (error) {
    console.error(
      "CARMATCH AI: Auth request failed",
      error.message
    );

    return send(res, 503, {
      error: "Nepodarilo sa spojiť so Supabase Auth."
    });
  }

  if (!user) {
    return send(res, 401, {
      error: "Prihlásenie vypršalo. Prihlás sa znova."
    });
  }

  const body =
    req.body && typeof req.body === "object"
      ? req.body
      : {};

  const query = buildSearchQuery(body);

  console.log(
    "CARMATCH AI: Search request received",
    {
      userVerified: Boolean(user.id),
      queryLength: query.length,
      hasFilters: Boolean(body.filters)
    }
  );

  if (!query) {
    return send(res, 400, {
      error: "Napíš, aké auto hľadáš.",
      code: "EMPTY_SEARCH_QUERY"
    });
  }

  if (query.length > MAX_QUERY_LENGTH) {
    return send(res, 400, {
      error: "Tvoja požiadavka je príliš dlhá.",
      code: "SEARCH_QUERY_TOO_LONG"
    });
  }


  /* ----------------------------------------------------------
     ODPOČÍTANIE VYHĽADÁVANIA
     ---------------------------------------------------------- */

  let usage;

  try {
    usage = await chargeSearch(accessToken);

  } catch (error) {
    console.error(
      "CARMATCH AI: Usage request failed",
      error.message
    );

    return send(res, 503, {
      error: "Nepodarilo sa overiť denný limit.",
      code: "SEARCH_USAGE_UNAVAILABLE"
    });
  }

  if (!usage.ok && usage.limited) {
    return send(res, 429, {
      error: "Dosiahol si denný limit piatich vyhľadávaní.",
      remaining: 0,
      limitReached: true
    });
  }

  if (!usage.ok) {
    return send(res, 503, {
      error: "Nepodarilo sa overiť denný limit.",
      code: "SEARCH_USAGE_UNAVAILABLE"
    });
  }


  /* ----------------------------------------------------------
     GENEROVANIE VÝSLEDKOV
     ---------------------------------------------------------- */

  try {
    const cars = await generateCars(query);

    return send(res, 200, {
      cars,
      remaining: usage.remaining,
      ai: "CARMATCH AI",
      language: "sk"
    });

  } catch (error) {
    console.error(
      "CARMATCH AI: Search generation failed",
      error.message
    );

    /* --------------------------------------------------------
       VRÁTENIE VYHĽADÁVANIA PRI CHYBE AI
       -------------------------------------------------------- */

    let refund = {
      ok: false,
      refunded: false,
      remaining: null
    };

    try {
      refund = await refundSearch(accessToken);

    } catch (refundError) {
      console.error(
        "CARMATCH AI: Refund request failed",
        refundError.message
      );
    }

    const remaining =
      refund.ok && refund.refunded
        ? refund.remaining
        : usage.remaining;

    return send(res, 502, {
      error:
        "Vyhľadávanie sa nepodarilo dokončiť. Skús to znova.",
      code: "AI_SEARCH_FAILED",
      remaining,
      refunded: refund.ok && refund.refunded
    });
  }
}
