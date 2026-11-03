
"use strict";

/* =========================================
   CARMATCH AI - BACKEND
   Frontend kompatibilita: app.js v19
========================================= */

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


/* =========================================
   ZÁKLADNÉ FUNKCIE
========================================= */

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
      message: raw.slice(0, 1500),
    };
  }
}

function firstValue(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && !value.trim()) continue;
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

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [];
}


/* =========================================
   FILTRE A VYTVORENIE ZADANIA
========================================= */

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
    "všetko",
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
    { keys: ["budget"], label: "Maximálny rozpočet" },
    { keys: ["seats"], label: "Počet sedadiel" },
    { keys: ["power"], label: "Minimálny výkon" },
    { keys: ["trunk"], label: "Minimálny objem kufra" },
    { keys: ["drive"], label: "Pohon" },
    { keys: ["fuel"], label: "Palivo" },
    { keys: ["body"], label: "Karoséria" },
    { keys: ["style"], label: "Štýl" },
    { keys: ["length"], label: "Maximálna dĺžka" },
    { keys: ["year"], label: "Minimálny rok výroby" },
    { keys: ["avoid", "avoidBrands"], label: "Vylúčené značky" },
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
    body.search,
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
    parts.push(naturalLanguage);
  }

  if (filterLines.length) {
    parts.push(
      "POŽIADAVKY POUŽÍVATEĽA:\n" +
      filterLines.join("\n")
    );
  }

  return parts.join("\n\n").trim();
}


/* =========================================
   SUPABASE AUTENTIFIKÁCIA
========================================= */

async function verifyUser(accessToken) {
  const response = await fetch(
    `${SUPABASE_URL}/auth/v1/user`,
    {
      method: "GET",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const data = await readJson(response);

  if (!response.ok || !data?.id) {
    console.error(
      "CARMATCH AI: Auth verification failed",
      {
        status: response.status,
        error: data,
      }
    );

    return null;
  }

  return data;
}


/* =========================================
   SUPABASE RPC
========================================= */

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
        "Accept-Profile": "public",
      },
      body: JSON.stringify(payload),
    }
  );

  const data = await readJson(response);

  return {
    ok: response.ok,
    status: response.status,
    data,
    error: response.ok ? null : data,
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
    ? Math.max(0, number)
    : null;
}


/* =========================================
   ODPOČÍTANIE VYHĽADÁVANIA
========================================= */

async function chargeSearch(accessToken) {
  const result = await supabaseRpc(
    "increment_search",
    {
      daily_limit: DAILY_LIMIT,
      max_searches: DAILY_LIMIT,
    },
    accessToken
  );

  if (!result.ok) {
    console.error(
      "CARMATCH AI: increment_search failed",
      {
        status: result.status,
        error: result.error,
      }
    );

    return {
      ok: false,
      limited: false,
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
      limited: false,
    };
  }

  if (data.allowed === false) {
    return {
      ok: false,
      limited: true,
      remaining: 0,
    };
  }

  return {
    ok: true,
    limited: false,
    remaining: extractRemaining(data),
  };
}


/* =========================================
   VRÁTENIE VYHĽADÁVANIA PRI CHYBE
========================================= */

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
        error: result.error,
      }
    );

    return {
      ok: false,
      refunded: false,
      remaining: null,
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
      remaining: null,
    };
  }

  return {
    ok: true,
    refunded: data.refunded,
    remaining: extractRemaining(data),
  };
}


/* =========================================
   AI JSON PARSING
========================================= */

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
    throw new Error("AI returned an empty response");
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
      throw new Error("AI response is not valid JSON");
    }

    parsed = JSON.parse(
      cleaned.slice(first, last + 1)
    );
  }

  const rawCars = Array.isArray(parsed)
    ? parsed
    : parsed?.cars;

  if (!Array.isArray(rawCars) || rawCars.length < 3) {
    throw new Error("AI did not return three cars");
  }

  const cars = rawCars.slice(0, 3).map(rawCar => {
    const car = rawCar && typeof rawCar === "object"
      ? rawCar
      : {};

    const specs = car.specs || {};
    const technical = car.technicalData || {};

    /*
      Prevod pôvodného objektu specs
      do samostatných polí app.js v19.
    */

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

    const price = firstValue(
      car.price,
      specs.price
    );

    return {
      brand: cleanString(car.brand),
      name: cleanString(
        firstValue(car.name, car.model, car.title),
        "Neznáme vozidlo"
      ),
      model: cleanString(
        firstValue(car.model, car.name, car.title)
      ),

      generation: cleanString(car.generation),
      trim: cleanString(
        firstValue(car.trim, car.version, car.variant)
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
        Ceny bez dôveryhodného zdroja
        nesmú byť prezentované ako overené.
      */

      price: price ?? null,
      currency: cleanString(car.currency, "EUR"),

      /*
        AI nesmie vytvárať vymyslené odkazy.
        Oficiálne odkazy doplníme až cez
        overiteľný zdroj dát.
      */

      priceSource: "",
      configurator: "",
      officialUrl: "",

      /*
        Nepoužívame automaticky vybraný
        obrázok z backendu. Frontend v19
        sa pokúsi nájsť vhodnejšiu fotografiu.
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
      drivetrain,
      fuel,
      transmission,
      lengthMm,

      body: cleanString(
        firstValue(car.body, car.bodyType, specs.body)
      ),

      score: null,

      reason: cleanString(
        firstValue(car.reason, car.description)
      ),

      pros: cleanList(car.pros),
      cons: cleanList(car.cons),

      maintenance: cleanString(car.maintenance),
    };
  });

  const identities = cars.map(car =>
    `${car.brand} ${car.model}`
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
  );

  if (new Set(identities).size !== 3) {
    throw new Error(
      "AI returned duplicate car models"
    );
  }

  return cars;
}


/* =========================================
   PROMPT PRE AI
========================================= */

function buildPrompt(query) {
  return `
You are CARMATCH AI, a careful automotive research assistant.

USER REQUEST:
${query}

Return ONLY valid JSON in this exact general structure:

{
  "cars": [
    {
      "brand": "Manufacturer",
      "name": "Full vehicle name",
      "model": "Exact model and version",
      "generation": "Generation if known",
      "trim": "Trim if known",
      "year": 2026,

      "price": null,
      "currency": "EUR",

      "body": "SUV",
      "power": "200 kW / 272 HP",
      "engine": "Engine or motor description",
      "consumptionWltp": "WLTP consumption if known",

      "seats": 5,
      "trunkLiters": 600,
      "drivetrain": "AWD",
      "fuel": "Petrol / diesel / hybrid / electric",
      "transmission": "Automatic",
      "lengthMm": 4800,

      "reason": "Why this car matches the request",
      "pros": [
        "Advantage"
      ],
      "cons": [
        "Disadvantage"
      ],
      "maintenance": "Maintenance information if known"
    }
  ]
}

CRITICAL RULES:

1. Return exactly three DIFFERENT vehicle models.
2. Follow every user requirement and filter.
3. Do not recommend a model that violates a clearly specified mandatory requirement.
4. Respect the budget. Do not treat an unknown price as proof that a car is within budget.
5. Do not confuse a model generation with an older generation.
6. Do not confuse a petrol, diesel, mild-hybrid, plug-in hybrid or electric version.
7. Never invent engine specifications, power, seating, trunk capacity or dimensions.
8. If a value is not reliably known, return null.
9. Never invent an exact current price. Return null if it is uncertain.
10. Do not invent official URLs or image URLs.
11. Use kW and HP for power.
12. Use litres for trunk capacity.
13. Use millimetres for vehicle length.
14. Use WLTP values only when known. Do not invent consumption.
15. Keep pros and cons specific to the actual model.
16. Do not return explanations outside JSON.
17. Do not return markdown or code fences.
18. Do not invent a matching percentage.

Be conservative. Correct unknown values are better than fabricated values.
`;
}


/* =========================================
   GROQ
========================================= */

async function callGroq(query) {
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is missing");
  }

  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content:
            "Return only valid JSON. Do not use markdown.",
        },
        {
          role: "user",
          content: buildPrompt(query),
        },
      ],
      temperature: 0.1,
      max_tokens: 4500,
      response_format: {
        type: "json_object",
      },
    }),
  });

  const data = await readJson(response);

  if (!response.ok) {
    console.error("CARMATCH AI: Groq failed", {
      status: response.status,
      error: data,
    });

    throw new Error(
      `Groq request failed: ${response.status}`
    );
  }

  return extractMessageContent(data);
}


/* =========================================
   OPENROUTER
========================================= */

async function callOpenRouter(query) {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is missing");
  }

  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer":
        process.env.APP_URL ||
        "https://carmatchai.vercel.app",
      "X-Title": "CARMATCH AI",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Return only valid JSON. Do not use markdown.",
        },
        {
          role: "user",
          content: buildPrompt(query),
        },
      ],
      temperature: 0.1,
      max_tokens: 4500,
      response_format: {
        type: "json_object",
      },
    }),
  });

  const data = await readJson(response);

  if (!response.ok) {
    console.error("CARMATCH AI: OpenRouter failed", {
      status: response.status,
      error: data,
    });

    throw new Error(
      `OpenRouter request failed: ${response.status}`
    );
  }

  return extractMessageContent(data);
}


/* =========================================
   GENEROVANIE ÁUT
========================================= */

async function generateCars(query) {
  let firstError;

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
    "No AI provider is configured"
  );
}


/* =========================================
   HLAVNÝ API HANDLER
========================================= */

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
      error: "Method not allowed. Use POST.",
    });
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error(
      "CARMATCH AI: Missing Supabase environment variables"
    );

    return send(res, 500, {
      error: "Supabase is not configured on the server.",
    });
  }

  if (!GROQ_API_KEY && !OPENROUTER_API_KEY) {
    return send(res, 500, {
      error: "AI provider is not configured on the server.",
    });
  }

  const accessToken = getBearerToken(req);

  if (!accessToken) {
    return send(res, 401, {
      error: "Prihlás sa a skús vyhľadávanie znova.",
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
      error: "Nepodarilo sa spojiť so Supabase Auth.",
    });
  }

  if (!user) {
    return send(res, 401, {
      error: "Prihlásenie vypršalo. Prihlás sa znova.",
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
      bodyFields: Object.keys(body),
      queryLength: query.length,
      hasFilters: Boolean(body.filters),
    }
  );

  if (!query) {
    return send(res, 400, {
      error: "Zadaj, aké auto hľadáš.",
      code: "EMPTY_SEARCH_QUERY",
    });
  }

  if (query.length > MAX_QUERY_LENGTH) {
    return send(res, 400, {
      error: "Vyhľadávanie je príliš dlhé.",
      code: "SEARCH_QUERY_TOO_LONG",
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
      error:
        "Nepodarilo sa overiť limit vyhľadávania.",
      code: "SEARCH_USAGE_UNAVAILABLE",
    });
  }

  if (!usage.ok && usage.limited) {
    return send(res, 429, {
      error: "Dosiahol si denný limit vyhľadávania.",
      remaining: 0,
      limitReached: true,
    });
  }

  if (!usage.ok) {
    return send(res, 503, {
      error:
        "Nepodarilo sa overiť limit vyhľadávania.",
      code: "SEARCH_USAGE_UNAVAILABLE",
    });
  }


  /* GENEROVANIE VÝSLEDKOV */

  try {
    const cars = await generateCars(query);

    return send(res, 200, {
      cars,
      remaining: usage.remaining,
      ai: "CARMATCH AI",
    });

  } catch (error) {
    console.error(
      "CARMATCH AI: Search generation failed",
      error.message
    );

    /* REFUND PRI NEÚSPEŠNOM VYHĽADÁVANÍ */

    let refund = {
      ok: false,
      refunded: false,
      remaining: null,
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
        "AI momentálne nedokáže dokončiť vyhľadávanie. Skús to znova.",
      code: "AI_SEARCH_FAILED",
      remaining,
      refunded: refund.ok && refund.refunded,
    });
  }
}
