
"use strict";

/* ============================================================
   CARMATCH AI - BACKEND v22
   - Slovenský výstup a jazyková kontrola
   - Identifikácia skutočného modelu auta
   - Kompatibilita s app.js v20
   - Presne 3 rozdielne automobily
   - Normalizácia technických údajov
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
const AI_TIMEOUT = 22000;

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
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}


/* ============================================================
   IDENTIFIKÁCIA SKUTOČNÉHO MODELU
   ============================================================ */

function extractBaseModel(value, brand) {
  let model = cleanString(value);

  if (!model) return "";

  const normalizedModel = normalizeText(model);
  const normalizedBrand = normalizeText(brand);

  if (
    normalizedBrand &&
    normalizedModel.startsWith(normalizedBrand + " ")
  ) {
    model = model.slice(brand.length).trim();
  }

  model = model
    // Označenia motorov, nie základný názov auta.
    .replace(
      /\b\d+(?:[.,]\d+)?\s*(?:tsi|tdi|tfsi|tdci|tce|dci|ecoboost|hdi|bluehdi|gdi|mpi|fsi)\b/gi,
      " "
    )
    .replace(
      /\b\d{2,3}\s*tfsi\b/gi,
      " "
    )
    // Označenia pohonu a motorovej verzie.
    .replace(
      /\bxdrive\s*\d+[a-z]*\b/gi,
      " "
    )
    .replace(
      /\bsdrive\s*\d+[a-z]*\b/gi,
      " "
    )
    .replace(
      /\b(?:4motion|quattro|4matic|4x4|awd|fwd|rwd)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();

  return model;
}

function isValidVehicleModel(model) {
  const value = cleanString(model);

  if (value.length < 2) return false;

  const normalized = normalizeText(value);

  const invalidNames = [
    "tsi",
    "tdi",
    "tfsi",
    "quattro",
    "4motion",
    "xdrive",
    "4matic",
    "awd",
    "4x4",
    "suv",
    "sedan",
    "estate",
    "diesel",
    "petrol",
    "automatic",
    "manual"
  ];

  if (invalidNames.includes(normalized)) {
    return false;
  }

  // Samotné označenie motora nesmie byť model.
  if (
    /^\d+(?:[.,]\d+)?\s*(?:tsi|tdi|tfsi|tdci|tce|dci)$/i.test(value)
  ) {
    return false;
  }

  return true;
}


/* ============================================================
   LOKALIZÁCIA TECHNICKÝCH OZNAČENÍ
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
    .replace(/\bhydrogen\b/gi, "Vodík");

  return result.trim();
}

function localizeDrive(value) {
  const original = cleanString(value);

  if (!original) return null;

  const normalized = normalizeText(original);

  if (
    /\b(awd|4wd|4x4|all wheel drive|four wheel drive|4motion|quattro|xdrive)\b/.test(normalized)
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
    /\b(fwd|front wheel drive)\b/.test(normalized)
  ) {
    return "Pohon predných kolies";
  }

  if (
    /\b(rwd|rear wheel drive)\b/.test(normalized)
  ) {
    return "Pohon zadných kolies";
  }

  return original;
}

function localizeTransmission(value) {
  const original = cleanString(value);

  if (!original) return null;

  const normalized = normalizeText(original);

  const speedMatch = normalized.match(
    /\b(\d+)\s*speed\b/
  );

  const speeds = speedMatch
    ? Number(speedMatch[1])
    : null;

  if (/\bcvt\b/.test(normalized)) {
    return speeds
      ? `${speeds}-stupňová automatická prevodovka CVT`
      : "Automatická prevodovka CVT";
  }

  if (/\b(dct|dual clutch)\b/.test(normalized)) {
    return speeds
      ? `${speeds}-stupňová dvojspojková prevodovka`
      : "Dvojspojková automatická prevodovka";
  }

  if (/\bdsg\b/.test(normalized)) {
    return speeds
      ? `${speeds}-stupňová automatická prevodovka DSG`
      : "Automatická prevodovka DSG";
  }

  if (/\bmanual\b/.test(normalized)) {
    return speeds
      ? `${speeds}-stupňová manuálna prevodovka`
      : "Manuálna prevodovka";
  }

  if (/\bautomatic\b/.test(normalized)) {
    return speeds
      ? `${speeds}-stupňová automatická prevodovka`
      : "Automatická prevodovka";
  }

  if (/\bsingle speed\b/.test(normalized)) {
    return "Jednostupňová prevodovka";
  }

  return original;
}

function localizeBody(value) {
  const original = cleanString(value);

  if (!original) return null;

  const normalized = normalizeText(original);

  if (/\bsuv\b/.test(normalized)) return "SUV";
  if (/\b(coupe|coupe)\b/.test(normalized)) return "Kupé";
  if (/\b(sedan|saloon)\b/.test(normalized)) return "Sedan";
  if (/\b(estate|wagon|station wagon)\b/.test(normalized)) return "Kombi";
  if (/\bhatchback\b/.test(normalized)) return "Hatchback";
  if (/\b(convertible|cabriolet)\b/.test(normalized)) return "Kabriolet";
  if (/\broadster\b/.test(normalized)) return "Roadster";
  if (/\b(pickup|pick up)\b/.test(normalized)) return "Pick-up";
  if (/\bcrossover\b/.test(normalized)) return "Crossover";
  if (/\b(minivan|mpv)\b/.test(normalized)) return "Rodinné MPV";
  if (/\bliftback\b/.test(normalized)) return "Liftback";
  if (/\bfastback\b/.test(normalized)) return "Fastback";

  return original;
}

function localizeEngine(value) {
  let result = cleanString(value);

  if (!result) return null;

  result = result
    .replace(/\binline[- ]?six\b/gi, "radový šesťvalec")
    .replace(/\binline[- ]?6\b/gi, "radový šesťvalec")
    .replace(/\binline[- ]?four\b/gi, "radový štvorvalec")
    .replace(/\binline[- ]?4\b/gi, "radový štvorvalec")
    .replace(/\binline[- ]?3\b/gi, "radový trojvalec")
    .replace(/\bV[- ]?6\b/gi, "vidlicový šesťvalec")
    .replace(/\bV[- ]?8\b/gi, "vidlicový osemvalec")
    .replace(/\bV[- ]?12\b/gi, "vidlicový dvanásťvalec")
    .replace(/\bturbocharged\b/gi, "prepĺňaný turbodúchadlom")
    .replace(/\btwin[- ]?turbo\b/gi, "prepĺňaný dvoma turbodúchadlami")
    .replace(/\bsupercharged\b/gi, "mechanicky prepĺňaný")
    .replace(/\belectric motor\b/gi, "elektromotor")
    .replace(/\bpetrol engine\b/gi, "benzínový motor")
    .replace(/\bdiesel engine\b/gi, "naftový motor")
    .replace(/\bpetrol\b/gi, "benzínový")
    .replace(/\bdiesel\b/gi, "naftový")
    .replace(/\b(\d+)\.(\d+)\s*L\b/gi, "$1,$2 l")
    .replace(/\b(\d+)\s*L\b/gi, "$1 l");

  return result.trim();
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
    .replace(/\bconsumption\b/gi, "spotreba")
    .replace(/(\d+)\.(\d+)(?=\s*(?:l\/|kWh|km))/gi, "$1,$2");

  return result.trim();
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
   JSON A AI POMOCNÉ FUNKCIE
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

async function fetchWithTimeout(url, options, timeout = AI_TIMEOUT) {
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
   SPOLOČNÁ AI POŽIADAVKA
   ============================================================ */

async function callAI(
  systemPrompt,
  userPrompt,
  maxTokens = 4500
) {
  let firstError = null;

  if (GROQ_API_KEY) {
    try {
      const response = await fetchWithTimeout(
        GROQ_URL,
        {
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
        }
      );

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          `Groq chyba ${response.status}`
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
      const response = await fetchWithTimeout(
        OPENROUTER_URL,
        {
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
        }
      );

      const data = await readJson(response);

      if (!response.ok) {
        throw new Error(
          `OpenRouter chyba ${response.status}`
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
   PROMPT NA VÝBER ÁUT
   ============================================================ */

function buildCarPrompt(query) {
  return `
Si CARMATCH AI – odborný automobilový poradca.

Odpovedáš výhradne po slovensky.

POŽIADAVKA ZÁKAZNÍKA:
${query}

Vyber presne TRI rozdielne skutočné automobily.

DÔLEŽITÉ ROZDELENIE:
- brand = značka, napr. Volkswagen
- model = skutočný základný obchodný názov, napr. Tiguan
- engine = motor, napr. 2.0 TSI
- drivetrain = pohon, napr. 4MOTION
- trim = výbava, napr. R-Line

Nikdy nepouži názov motora ako názov modelu.
Napríklad model je "Tiguan", nie "2.0 TSI 4MOTION".
Napríklad model je "Q7", nie "55 TFSI quattro".
Napríklad model je "X7", nie "xDrive40i".

VÝSTUP MUSÍ BYŤ IBA PLATNÝ JSON.

Použi túto štruktúru:

{
  "cars": [
    {
      "brand": "Volkswagen",
      "name": "Volkswagen Tiguan",
      "model": "Tiguan",
      "generation": "Generácia vozidla",
      "trim": "R-Line",
      "year": 2026,
      "body": "SUV",
      "power": "195 kW / 265 HP",
      "engine": "Benzínový motor 2,0 l TSI",
      "consumptionWltp": null,
      "seats": 5,
      "trunkLiters": null,
      "drivetrain": "Pohon všetkých kolies (4MOTION)",
      "fuel": "Benzín",
      "transmission": "Automatická prevodovka",
      "lengthMm": null,
      "reason": "Slovenský dôvod odporúčania.",
      "pros": ["Výhoda v slovenčine."],
      "cons": ["Nevýhoda v slovenčine."],
      "maintenance": "Informácie o údržbe v slovenčine."
    }
  ]
}

JAZYKOVÉ PRAVIDLÁ:
1. Všetky opisné texty píš po slovensky.
2. Nepoužívaj anglické vety.
3. Dôvody odporúčania, výhody, nevýhody a údržbu píš po slovensky.
4. Namiesto Petrol používaj Benzín.
5. Namiesto Diesel používaj Nafta.
6. Namiesto AWD používaj Pohon všetkých kolies.
7. Namiesto FWD používaj Pohon predných kolies.
8. Namiesto RWD používaj Pohon zadných kolies.
9. Namiesto Automatic používaj Automatická prevodovka.
10. Zachovaj originálne obchodné názvy značiek, modelov a výbav.

PRAVIDLÁ PRESNOSTI:
1. Vráť presne tri rozdielne modely.
2. Vozidlá musia skutočne existovať.
3. Dodrž všetky povinné požiadavky zákazníka.
4. Neprekračuj rozpočet.
5. Rozlišuj jednotlivé generácie vozidiel.
6. Nezamieňaj rôzne druhy pohonu a paliva.
7. Nevymýšľaj technické údaje.
8. Ak údaj nepoznáš, použi null.
9. Nevymýšľaj aktuálnu cenu.
10. Nevymýšľaj internetové adresy.
11. Výkon uvádzaj v kW a HP.
12. Objem kufra uvádzaj v litroch.
13. Dĺžku uvádzaj v milimetroch.
14. Spotrebu uvádzaj podľa WLTP iba vtedy, ak je známa.
15. Nevymýšľaj percentuálnu zhodu.
16. Nevkladaj text mimo JSON.

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

    const rawModel = cleanString(
      firstValue(
        car.model,
        car.name,
        car.title
      )
    );

    const model = extractBaseModel(
      rawModel,
      brand
    );

    if (!brand || !isValidVehicleModel(model)) {
      throw new Error(
        `AI neuviedla skutočný názov modelu: ${brand} ${rawModel}`
      );
    }

    return {
      brand,
      model,
      name: `${brand} ${model}`,

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
       * Cena ostáva neoverená, kým nebude pripojený
       * dôveryhodný aktuálny cenový zdroj.
       */

      price: null,
      currency: "EUR",
      priceSource: "",

      configurator: "",
      officialUrl: "",

      /*
       * Fotografie vyhľadá frontend samostatne.
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
        firstValue(car.reason, car.description)
      ),

      pros: cleanList(car.pros),
      cons: cleanList(car.cons),

      maintenance: cleanString(car.maintenance)
    };
  });

  const identities = cars.map(car =>
    `${normalizeText(car.brand)} ${normalizeText(car.model)}`
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
   PREKLAD VŠETKÝCH OPISOV DO SLOVENČINY
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
Prelož všetky textové hodnoty v nasledujúcom JSON
do prirodzenej, gramaticky správnej SLOVENČINY.

VSTUP:
${JSON.stringify({ cars: translatableCars })}

PRAVIDLÁ:
1. Prelož všetky anglické vety a opisy.
2. Používaj správne slovenské automobilové názvoslovie.
3. "Petrol" prelož ako "Benzín".
4. "Diesel" prelož ako "Nafta".
5. "AWD" prelož ako "Pohon všetkých kolies".
6. "FWD" prelož ako "Pohon predných kolies".
7. "RWD" prelož ako "Pohon zadných kolies".
8. "Automatic" prelož ako "Automatická prevodovka".
9. "Manual" prelož ako "Manuálna prevodovka".
10. "Inline-6" prelož ako "radový šesťvalec".
11. "V6" prelož ako "vidlicový šesťvalec".
12. "Turbocharged" prelož ako "prepĺňaný turbodúchadlom".
13. Zachovaj názvy xDrive, quattro, DSG a 4MOTION.
14. Zachovaj všetky číselné hodnoty a technické fakty.
15. Nevymýšľaj nové údaje.
16. Nemeň význam pôvodného textu.
17. Zachovaj poradie troch áut.
18. Vráť výhradne JSON.

ŠTRUKTÚRA:

{
  "cars": [
    {
      "engine": "Slovenský názov motora",
      "consumptionWltp": "Slovenská spotreba",
      "drivetrain": "Slovenský názov pohonu",
      "fuel": "Slovenský názov paliva",
      "transmission": "Slovenská prevodovka",
      "body": "Slovenská karoséria",
      "reason": "Slovenský dôvod odporúčania",
      "pros": ["Slovenská výhoda"],
      "cons": ["Slovenská nevýhoda"],
      "maintenance": "Slovenská údržba"
    }
  ]
}

Nepridávaj žiadny text mimo JSON.
`;
}

function containsEnglishText(value) {
  const textValue = cleanString(value);

  if (!textValue) return false;

  const markers =
    /\b(the|with|for|and|from|offers|provides|features|excellent|spacious|powerful|comfortable|reliable|maintenance|consumption|diesel|petrol|automatic|manual|inline[- ]?6|turbocharged|all wheel drive|front wheel drive|rear wheel drive)\b/i;

  return markers.test(textValue);
}

function validateSlovakDescriptions(cars) {
  const fields = [
    "engine",
    "consumptionWltp",
    "drivetrain",
    "fuel",
    "transmission",
    "body",
    "reason",
    "maintenance"
  ];

  for (const car of cars) {
    for (const field of fields) {
      if (containsEnglishText(car[field])) {
        throw new Error(
          `Preklad nebol dokončený v poli ${field}.`
        );
      }
    }

    for (const item of [
      ...car.pros,
      ...car.cons
    ]) {
      if (containsEnglishText(item)) {
        throw new Error(
          "Niektorý opis výhod alebo nevýhod zostal v angličtine."
        );
      }
    }
  }
}

async function translateCarsToSlovak(cars) {
  const systemPrompt = `
Si profesionálny slovenský automobilový prekladateľ.
Prekladáš všetky opisy do prirodzenej slovenčiny.
Zachovávaš číselné údaje, jednotky a technický význam.
Nevytváraš nové fakty.
Vrátiš iba platný JSON.
`;

  const content = await callAI(
    systemPrompt,
    buildTranslationPrompt(cars),
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

  const translatedCars = cars.map((car, index) => {
    const translated = parsed.cars[index] || {};

    const result = {
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

    result.engine = localizeEngine(result.engine);
    result.consumptionWltp = localizeConsumption(result.consumptionWltp);
    result.drivetrain = localizeDrive(result.drivetrain);
    result.fuel = localizeFuel(result.fuel);
    result.transmission = localizeTransmission(result.transmission);
    result.body = localizeBody(result.body);

    return result;
  });

  validateSlovakDescriptions(translatedCars);

  return translatedCars;
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

  const generatedContent = await callAI(
    generationSystem,
    buildCarPrompt(query),
    4500
  );

  const cars = parseCarsResponse(
    generatedContent
  );

  return translateCarsToSlovak(cars);
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


  /* ODPOČÍTANIE VYHĽADÁVANIA */

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


  /* GENEROVANIE A PREKLAD VÝSLEDKOV */

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
