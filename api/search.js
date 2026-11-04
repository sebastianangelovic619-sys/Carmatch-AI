
"use strict";

/* ============================================================
   CARMATCH AI - BACKEND v21
   - Slovenský výstup vrátane opisov a technických údajov
   - Samostatný AI prekladový krok
   - Kompatibilita s app.js v19
   - Presne 3 rozdielne automobily
   - Supabase autentifikácia
   - Denný limit 5 vyhľadávaní
   - Refund pri chybe generovania alebo prekladu
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
   PREKLAD TECHNICKÝCH OZNAČENÍ
   ============================================================ */

function localizeFuel(value) {
  let result = cleanString(value);

  if (!result) return null;

  result = result
    .replace(/\bplug[\s-]?in hybrid\b/gi, "Plug-in hybrid")
    .replace(/\bPHEV\b/gi, "Plug-in hybrid")
    .replace(/\bMHEV\b/gi, "Mild-hybridný pohon")
    .replace(/\bmild[\s-]?hybrid\b/gi, "Mild-hybridný pohon")
    .replace(/\bHEV\b/gi, "Hybridný pohon")
    .replace(/\bhybrid\b/gi, "Hybrid")
    .replace(/\bpetrol\b/gi, "Benzín")
    .replace(/\bgasoline\b/gi, "Benzín")
    .replace(/\bdiesel\b/gi, "Nafta")
    .replace(/\belectricity\b/gi, "Elektrina")
    .replace(/\belectric\b/gi, "Elektrický pohon")
    .replace(/\bhydrogen\b/gi, "Vodík")
    .replace(/\bLPG\b/gi, "LPG")
    .replace(/\bCNG\b/gi, "CNG");

  return result.trim();
}

function localizeDrive(value) {
  const original = cleanString(value);

  if (!original) return null;

  const s = normalizeText(original);

  if (
    /\b(awd|4wd|4x4|all wheel drive|four wheel drive|4motion|quattro|xdrive)\b/i.test(s)
  ) {
    if (/\bxdrive\b/i.test(original)) {
      return "Pohon všetkých kolies (xDrive)";
    }

    if (/\bquattro\b/i.test(original)) {
      return "Pohon všetkých kolies (quattro)";
    }

    if (/\b4motion\b/i.test(original)) {
      return "Pohon všetkých kolies (4MOTION)";
    }

    return "Pohon všetkých kolies (4×4)";
  }

  if (
    /\b(fwd|front wheel drive|predny pohon)\b/i.test(s)
  ) {
    return "Pohon predných kolies";
  }

  if (
    /\b(rwd|rear wheel drive|zadny pohon)\b/i.test(s)
  ) {
    return "Pohon zadných kolies";
  }

  return original;
}

function localizeTransmission(value) {
  let original = cleanString(value);

  if (!original) return null;

  const s = normalizeText(original);

  const speedMatch = s.match(
    /\b(\d+)[ -]?speed\b/i
  );

  const speeds = speedMatch
    ? Number(speedMatch[1])
    : null;

  if (/\b(cvt)\b/i.test(s)) {
    return speeds
      ? `${speeds}-stupňová automatická prevodovka CVT`
      : "Automatická prevodovka CVT";
  }

  if (/\b(dct|dual clutch)\b/i.test(s)) {
    return speeds
      ? `${speeds}-stupňová dvojspojková prevodovka`
      : "Dvojspojková automatická prevodovka";
  }

  if (/\b(dsg)\b/i.test(s)) {
    return speeds
      ? `${speeds}-stupňová automatická prevodovka DSG`
      : "Automatická prevodovka DSG";
  }

  if (/\b(manual|manual transmission)\b/i.test(s)) {
    return speeds
      ? `${speeds}-stupňová manuálna prevodovka`
      : "Manuálna prevodovka";
  }

  if (/\b(automatic|automatic transmission)\b/i.test(s)) {
    return speeds
      ? `${speeds}-stupňová automatická prevodovka`
      : "Automatická prevodovka";
  }

  if (/\bsingle speed\b/i.test(s)) {
    return "Jednostupňová prevodovka";
  }

  return original;
}

function localizeBody(value) {
  const original = cleanString(value);

  if (!original) return null;

  const s = normalizeText(original);

  if (/\bsuv\b/i.test(s)) return "SUV";
  if (/\b(coupe|coupe)\b/i.test(s)) return "Kupé";
  if (/\b(sedan|saloon)\b/i.test(s)) return "Sedan";
  if (/\b(estate|wagon|station wagon)\b/i.test(s)) return "Kombi";
  if (/\bhatchback\b/i.test(s)) return "Hatchback";
  if (/\b(convertible|cabriolet)\b/i.test(s)) return "Kabriolet";
  if (/\broadster\b/i.test(s)) return "Roadster";
  if (/\b(pickup|pick-up)\b/i.test(s)) return "Pick-up";
  if (/\b(crossover)\b/i.test(s)) return "Crossover";
  if (/\b(minivan|mpv)\b/i.test(s)) return "Rodinné MPV";
  if (/\bliftback\b/i.test(s)) return "Liftback";
  if (/\bfastback\b/i.test(s)) return "Fastback";

  return original;
}

function localizeEngine(value) {
  let result = cleanString(value);

  if (!result) return null;

  result = result
    .replace(/\binline[- ]?six\b/gi, "radový šesťvalec")
    .replace(/\binline[- ]?4\b/gi, "radový štvorvalec")
    .replace(/\binline[- ]?3\b/gi, "radový trojvalec")
    .replace(/\bV[- ]?6\b/gi, "vidlicový šesťvalec")
    .replace(/\bV[- ]?8\b/gi, "vidlicový osemvalec")
    .replace(/\bV[- ]?12\b/gi, "vidlicový dvanásťvalec")
    .replace(/\bturbocharged\b/gi, "prepĺňaný turbodúchadlom")
    .replace(/\btwin turbo\b/gi, "prepĺňaný dvoma turbodúchadlami")
    .replace(/\btwin-turbo\b/gi, "prepĺňaný dvoma turbodúchadlami")
    .replace(/\bsupercharged\b/gi, "mechanicky prepĺňaný")
    .replace(/\belectric motor\b/gi, "elektromotor")
    .replace(/\bpetrol engine\b/gi, "benzínový motor")
    .replace(/\bdiesel engine\b/gi, "naftový motor");

  return result;
}

function localizeConsumption(value) {
  let result = cleanString(value);

  if (!result) return null;

  result = result
    .replace(/\bcombined fuel consumption\b/gi, "Kombinovaná spotreba")
    .replace(/\bfuel consumption\b/gi, "Spotreba paliva")
    .replace(/\belectric consumption\b/gi, "Spotreba elektrickej energie")
    .replace(/\bWLTP consumption\b/gi, "Spotreba podľa WLTP")
    .replace(/\bcombined\b/gi, "kombinovaná")
    .replace(/\bconsumption\b/gi, "spotreba");

  return result;
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

  if (typeof value === "object") return "";

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
    { keys: ["length"], label: "Maximálna dĺžka" },
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
   VRÁTENIE VYHĽADÁVANIA
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

function parseJsonContent(content) {
  if (!content || typeof content !== "string") {
    throw new Error("AI nevrátila žiadnu odpoveď.");
  }

  let cleaned = content.trim();

  cleaned = cleaned
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");

    if (first === -1 || last <= first) {
      throw new Error("Odpoveď AI nemá platný JSON formát.");
    }

    return JSON.parse(
      cleaned.slice(first, last + 1)
    );
  }
}

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


/* ============================================================
   SPOLOČNÁ AI POŽIADAVKA
   ============================================================ */

async function callAI(systemPrompt, userPrompt, maxTokens = 4500) {
  let firstError = null;

  if (GROQ_API_KEY) {
    try {
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
              content: systemPrompt
            },
            {
              role: "user",
              content: userPrompt
            }
          ],
          temperature: 0.1,
          max_tokens: maxTokens,
          response_format: {
            type: "json_object"
          }
        })
      });

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          `Groq chyba ${response.status}: ${JSON.stringify(data).slice(0, 500)}`
        );
      }

      const content = extractMessageContent(data);

      if (!content) {
        throw new Error("Groq vrátil prázdnu odpoveď.");
      }

      return content;

    } catch (error) {
      firstError = error;

      console.error(
        "CARMATCH AI: Groq failed",
        error.message
      );
    }
  }

  if (OPENROUTER_API_KEY) {
    try {
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
              content: systemPrompt
            },
            {
              role: "user",
              content: userPrompt
            }
          ],
          temperature: 0.1,
          max_tokens: maxTokens,
          response_format: {
            type: "json_object"
          }
        })
      });

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          `OpenRouter chyba ${response.status}: ${JSON.stringify(data).slice(0, 500)}`
        );
      }

      const content = extractMessageContent(data);

      if (!content) {
        throw new Error("OpenRouter vrátil prázdnu odpoveď.");
      }

      return content;

    } catch (error) {
      console.error(
        "CARMATCH AI: OpenRouter failed",
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
   SLOVENSKÝ PROMPT NA VÝBER ÁUT
   ============================================================ */

function buildCarPrompt(query) {
  return `
Si CARMATCH AI – odborný automobilový poradca.

Komunikuješ výhradne v slovenskom jazyku.

POŽIADAVKA ZÁKAZNÍKA:
${query}

Vyber presne TRI rozdielne skutočné automobily.

VÝSTUP MUSÍ BYŤ IBA PLATNÝ JSON.

Použi túto štruktúru:

{
  "cars": [
    {
      "brand": "Značka",
      "name": "Úplný názov automobilu",
      "model": "Presný model a verzia",
      "generation": "Generácia",
      "trim": "Výbava",
      "year": 2026,
      "body": "SUV",
      "power": "200 kW / 272 HP",
      "engine": "Benzínový motor 2,0 l",
      "consumptionWltp": "7,5 l/100 km",
      "seats": 5,
      "trunkLiters": 600,
      "drivetrain": "Pohon všetkých kolies (4×4)",
      "fuel": "Benzín",
      "transmission": "Automatická prevodovka",
      "lengthMm": 4800,
      "reason": "Slovenský dôvod odporúčania.",
      "pros": [
        "Prvá výhoda.",
        "Druhá výhoda."
      ],
      "cons": [
        "Prvá nevýhoda."
      ],
      "maintenance": "Informácie o údržbe v slovenčine."
    }
  ]
}

JAZYKOVÉ PRAVIDLÁ:

1. VŠETKY textové hodnoty musia byť po slovensky.
2. Žiadne anglické vety, odseky ani opisy.
3. Dôvody odporúčania píš po slovensky.
4. Výhody a nevýhody píš po slovensky.
5. Údržbu opisuj po slovensky.
6. Technické údaje uvádzaj po slovensky.
7. Namiesto Petrol používaj Benzín.
8. Namiesto Diesel používaj Nafta.
9. Namiesto AWD používaj Pohon všetkých kolies.
10. Namiesto FWD používaj Pohon predných kolies.
11. Namiesto RWD používaj Pohon zadných kolies.
12. Namiesto Automatic používaj Automatická prevodovka.
13. Namiesto Manual používaj Manuálna prevodovka.
14. Názvy značiek, modelov a oficiálnych výbav neprekladaj.

PRAVIDLÁ PRESNOSTI:

1. Vráť presne tri rozdielne modely.
2. Vozidlá musia skutočne existovať.
3. Dodrž všetky povinné požiadavky zákazníka.
4. Neprekračuj stanovený rozpočet.
5. Nezamieňaj jednotlivé generácie vozidiel.
6. Nezamieňaj benzín, naftu, hybrid a elektromobil.
7. Nevymýšľaj výkon, motor, sedadlá, kufor ani rozmery.
8. Ak údaj nepoznáš, použi null.
9. Nevymýšľaj presnú aktuálnu cenu.
10. Nevymýšľaj oficiálne internetové adresy.
11. Výkon uvádzaj v kW a HP.
12. Objem kufra uvádzaj v litroch.
13. Dĺžku uvádzaj v milimetroch.
14. Spotrebu uvádzaj podľa WLTP, iba ak ju poznáš.
15. Nevymýšľaj percentuálnu zhodu.
16. Nevkladaj text mimo JSON.

Odpoveď musí byť prirodzená, gramaticky správna slovenčina.
Presnosť je dôležitejšia ako množstvo údajov.
`;
}


/* ============================================================
   PARSOVANIE A NORMALIZÁCIA ÁUT
   ============================================================ */

function parseCarsResponse(content) {
  const parsed = parseJsonContent(content);

  const rawCars = Array.isArray(parsed)
    ? parsed
    : parsed?.cars;

  if (!Array.isArray(rawCars) || rawCars.length !== 3) {
    throw new Error(
      "AI musí vrátiť presne tri vozidlá."
    );
  }

  const cars = rawCars.map(rawCar => {
    const car =
      rawCar && typeof rawCar === "object"
        ? rawCar
        : {};

    const specs = car.specs || {};
    const technical = car.technicalData || {};

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
       * sa cena nezobrazuje ako overená.
       */

      price: null,
      currency: "EUR",
      priceSource: "",

      configurator: "",
      officialUrl: "",

      /*
       * Obrázky dopĺňa frontend samostatne.
       */

      image: "",
      imageUrl: "",
      images: [],
      imageCandidates: [],

      power: firstValue(
        car.power,
        car.enginePower,
        specs.power,
        technical.power
      ),

      engine: cleanString(
        firstValue(
          car.engine,
          car.engineVersion,
          specs.engine,
          technical.engine
        )
      ),

      consumptionWltp: cleanString(
        firstValue(
          car.consumptionWltp,
          car.wltpConsumption,
          specs.consumptionWltp,
          specs.wltp,
          specs.consumption,
          technical.consumptionWltp
        )
      ),

      seats: firstValue(
        car.seats,
        car.seatCount,
        specs.seats,
        technical.seats
      ),

      trunkLiters: firstValue(
        car.trunkLiters,
        car.trunk,
        car.boot,
        specs.trunkLiters,
        specs.trunk,
        technical.trunkLiters
      ),

      drivetrain: cleanString(
        firstValue(
          car.drivetrain,
          car.drive,
          specs.drivetrain,
          specs.drive,
          technical.drivetrain
        )
      ),

      fuel: cleanString(
        firstValue(
          car.fuel,
          car.fuelType,
          specs.fuel,
          technical.fuel
        )
      ),

      transmission: cleanString(
        firstValue(
          car.transmission,
          car.gearbox,
          specs.transmission,
          technical.transmission
        )
      ),

      lengthMm: firstValue(
        car.lengthMm,
        car.lengthMM,
        specs.lengthMm,
        specs.length,
        technical.lengthMm
      ),

      body: cleanString(
        firstValue(
          car.body,
          car.bodyType,
          specs.body
        )
      ),

      score: null,

      reason: cleanString(
        firstValue(
          car.reason,
          car.description
        )
      ),

      pros: cleanList(car.pros),
      cons: cleanList(car.cons),

      maintenance: cleanString(car.maintenance)
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
   DRUHÝ KROK: PREKLAD VŠETKÝCH TEXTOV DO SLOVENČINY
   ============================================================ */

function buildTranslationPrompt(cars) {
  const translatableCars = cars.map(car => ({
    engine: car.engine,
    consumptionWltp: car.consumptionWltp,
    drivetrain: car.drivetrain,
    fuel: car.fuel,
    transmission: car.transmission,
    body: car.body,
    reason: car.reason,
    pros: car.pros,
    cons: car.cons,
    maintenance: car.maintenance
  }));

  return `
Prelož všetky textové hodnoty v nasledujúcom JSON do
prirodzenej, gramaticky správnej SLOVENČINY.

VSTUP:
${JSON.stringify({ cars: translatableCars })}

PRAVIDLÁ:

1. Prelož každý anglický opis a technický údaj.
2. Neponechávaj anglické vety ani anglické vysvetlenia.
3. Používaj správne slovenské odborné automobilové názvoslovie.
4. "Petrol" prelož ako "Benzín".
5. "Diesel" prelož ako "Nafta".
6. "AWD" prelož ako "Pohon všetkých kolies".
7. "FWD" prelož ako "Pohon predných kolies".
8. "RWD" prelož ako "Pohon zadných kolies".
9. "Automatic" prelož ako "Automatická prevodovka".
10. "Manual" prelož ako "Manuálna prevodovka".
11. "Inline-6" prelož ako "radový šesťvalec".
12. "V6" prelož ako "vidlicový šesťvalec".
13. "Turbocharged" prelož ako "prepĺňaný turbodúchadlom".
14. Zachovaj názvy xDrive, quattro, DSG a 4MOTION.
15. Zachovaj všetky číselné hodnoty, jednotky a technické fakty.
16. Nevymýšľaj nové technické údaje.
17. Nemeň význam pôvodných textov.
18. Ak je hodnota null alebo prázdna, ponechaj ju tak.
19. Výhody a nevýhody musia zostať po slovensky.
20. Vráť presne tri autá v rovnakom poradí.

Vráť výhradne JSON v tejto štruktúre:

{
  "cars": [
    {
      "engine": "Slovenský názov motora",
      "consumptionWltp": "Slovenská spotreba",
      "drivetrain": "Slovenský názov pohonu",
      "fuel": "Slovenský názov paliva",
      "transmission": "Slovenský názov prevodovky",
      "body": "Slovenská karoséria",
      "reason": "Slovenský dôvod odporúčania",
      "pros": ["Slovenská výhoda"],
      "cons": ["Slovenská nevýhoda"],
      "maintenance": "Slovenské informácie o údržbe"
    }
  ]
}

Nevkladaj žiadny text mimo JSON.
`;
}

async function translateCarsToSlovak(cars) {
  const systemPrompt = `
Si profesionálny slovenský automobilový prekladateľ.

Všetky texty prekladáš do prirodzenej slovenčiny.
Zachovávaš čísla, jednotky, technické fakty a význam.
Nevytváraš nové údaje.
Vrátiš iba platný JSON.
`;

  const prompt = buildTranslationPrompt(cars);

  const content = await callAI(
    systemPrompt,
    prompt,
    3500
  );

  const parsed = parseJsonContent(content);

  if (
    !Array.isArray(parsed?.cars) ||
    parsed.cars.length !== 3
  ) {
    throw new Error(
      "Prekladová AI nevrátila presne tri vozidlá."
    );
  }

  return cars.map((car, index) => {
    const translated = parsed.cars[index] || {};

    const translatedCar = {
      ...car,

      engine: cleanString(
        translated.engine,
        car.engine
      ),

      consumptionWltp: cleanString(
        translated.consumptionWltp,
        car.consumptionWltp
      ),

      drivetrain: cleanString(
        translated.drivetrain,
        car.drivetrain
      ),

      fuel: cleanString(
        translated.fuel,
        car.fuel
      ),

      transmission: cleanString(
        translated.transmission,
        car.transmission
      ),

      body: cleanString(
        translated.body,
        car.body
      ),

      reason: cleanString(
        translated.reason,
        car.reason
      ),

      pros: translated.pros !== undefined
        ? cleanList(translated.pros)
        : car.pros,

      cons: translated.cons !== undefined
        ? cleanList(translated.cons)
        : car.cons,

      maintenance: cleanString(
        translated.maintenance,
        car.maintenance
      )
    };

    /*
     * Dodatočná technická kontrola po preklade.
     */

    translatedCar.engine = localizeEngine(
      translatedCar.engine
    );

    translatedCar.consumptionWltp = localizeConsumption(
      translatedCar.consumptionWltp
    );

    translatedCar.fuel = localizeFuel(
      translatedCar.fuel
    );

    translatedCar.drivetrain = localizeDrive(
      translatedCar.drivetrain
    );

    translatedCar.transmission = localizeTransmission(
      translatedCar.transmission
    );

    translatedCar.body = localizeBody(
      translatedCar.body
    );

    return translatedCar;
  });
}


/* ============================================================
   GENEROVANIE A PREKLAD VÝSLEDKOV
   ============================================================ */

async function generateCars(query) {
  const generationSystem = `
Si CARMATCH AI, slovenský automobilový poradca.
Odpovedáš výhradne po slovensky.
Vrátiš iba platný JSON.
`;

  const generationPrompt = buildCarPrompt(query);

  /*
   * Prvá požiadavka:
   * výber troch automobilov.
   */

  const generatedContent = await callAI(
    generationSystem,
    generationPrompt,
    4500
  );

  const cars = parseCarsResponse(
    generatedContent
  );

  /*
   * Druhá požiadavka:
   * jazyková korektúra a preklad.
   */

  const translatedCars = await translateCarsToSlovak(
    cars
  );

  return translatedCars;
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
     GENEROVANIE A PREKLAD VÝSLEDKOV
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
      "CARMATCH AI: Search or translation failed",
      error.message
    );

    /* --------------------------------------------------------
       REFUND PRI CHYBE
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
        "Vyhľadávanie alebo preklad sa nepodarilo dokončiť. Skús to znova.",
      code: "AI_SEARCH_FAILED",
      remaining,
      refunded: refund.ok && refund.refunded
    });
  }
}
