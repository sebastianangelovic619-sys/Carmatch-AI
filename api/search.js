
"use strict";

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

const MAX_SEARCHES = 5;
const DAILY_LIMIT = 5;

const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const OPENROUTER_URL =
  "https://openrouter.ai/api/v1/chat/completions";

function send(res, status, data) {
  return res.status(status).json(data);
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function readJson(response) {
  const text = await response.text();

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 1500) };
  }
}

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

  if (!response.ok || !data || !data.id) {
    console.error("CARMATCH AI: Auth verification failed", {
      status: response.status,
      error: data,
    });

    return null;
  }

  return data;
}

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

async function chargeSearch(accessToken) {
  const result = await supabaseRpc(
    "increment_search",
    {
      daily_limit: DAILY_LIMIT,
      max_searches: MAX_SEARCHES,
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
      error: "Search usage function unavailable",
    };
  }

  const data = normalizeRpcData(result.data);

  if (
    !data ||
    typeof data !== "object" ||
    typeof data.allowed !== "boolean"
  ) {
    console.error(
      "CARMATCH AI: Unexpected increment_search response",
      data
    );

    return {
      ok: false,
      limited: false,
      error: "Unexpected usage function response",
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

function extractMessageContent(data) {
  const content = data?.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => item.text || "")
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

    parsed = JSON.parse(cleaned.slice(first, last + 1));
  }

  const cars = Array.isArray(parsed)
    ? parsed
    : parsed?.cars;

  if (!Array.isArray(cars) || cars.length < 3) {
    throw new Error("AI did not return three cars");
  }

  return cars.slice(0, 3).map((car) => ({
    ...car,
    name: String(
      car.name || car.model || car.title || "Unknown car"
    ),
    brand: String(car.brand || ""),
    model: String(car.model || car.name || ""),
    year: car.year ?? null,
    price: car.price ?? null,
    currency: car.currency || "EUR",
    image: car.image || car.imageUrl || "",
    imageUrl: car.imageUrl || car.image || "",
    description: String(car.description || ""),
    specs: car.specs || {},
  }));
}

function buildPrompt(query) {
  return `
You are CARMATCH AI, a car research assistant.

User request:
${query}

Return ONLY a valid JSON object with this structure:
{
  "cars": [
    {
      "brand": "Car manufacturer",
      "name": "Full model name",
      "model": "Model and version",
      "year": 2026,
      "price": 50000,
      "currency": "EUR",
      "description": "Useful short description",
      "image": "",
      "imageUrl": "",
      "specs": {
        "power": "Power and units",
        "acceleration": "0-100 km/h",
        "topSpeed": "Top speed",
        "fuel": "Fuel or powertrain",
        "transmission": "Transmission",
        "drive": "Drive type"
      }
    }
  ]
}

Rules:
- Return exactly three distinct cars matching the user's request.
- Use realistic, defensible specifications and prices.
- Price must be a number in EUR when a reliable price is known.
- If the price cannot be verified, use null. Never invent an exact price.
- Use the requested currency if the user clearly requests another currency.
- Do not invent image URLs. Leave image and imageUrl as empty strings.
- Do not include markdown, comments, or text outside the JSON.
- Keep descriptions concise and helpful.
- If the user gives a budget, prioritize cars within that budget.
- If the user asks for used cars, distinguish used prices from new-car prices.
- If a model year is uncertain, use null.
`;
}

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
      temperature: 0.2,
      max_tokens: 3500,
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

    throw new Error(`Groq request failed: ${response.status}`);
  }

  return extractMessageContent(data);
}

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
        process.env.APP_URL || "https://carmatch-ai.vercel.app",
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
      temperature: 0.2,
      max_tokens: 3500,
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

async function findCarImage(car) {
  const searchTerm = [
    car.brand,
    car.model || car.name,
    car.year,
  ]
    .filter(Boolean)
    .join(" ");

  if (!searchTerm) return "";

  try {
    const url = new URL(
      "https://commons.wikimedia.org/w/api.php"
    );

    url.searchParams.set("action", "query");
    url.searchParams.set("format", "json");
    url.searchParams.set("generator", "search");
    url.searchParams.set("gsrsearch", searchTerm + " car");
    url.searchParams.set("gsrnamespace", "6");
    url.searchParams.set("gsrlimit", "5");
    url.searchParams.set("prop", "imageinfo");
    url.searchParams.set("iiprop", "url");
    url.searchParams.set("iiurlwidth", "900");
    url.searchParams.set("origin", "*");

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "CARMATCH-AI/1.0",
      },
    });

    if (!response.ok) return "";

    const data = await readJson(response);
    const pages = Object.values(
      data?.query?.pages || {}
    );

    const page = pages.find((item) => {
      const title = String(item.title || "").toLowerCase();

      return (
        title.includes("car") ||
        title.includes(String(car.model || car.name).toLowerCase())
      );
    }) || pages[0];

    const imageInfo = page?.imageinfo?.[0];

    return (
      imageInfo?.thumburl ||
      imageInfo?.url ||
      ""
    );
  } catch (error) {
    console.error(
      "CARMATCH AI: Image lookup failed",
      error.message
    );

    return "";
  }
}

async function addImages(cars) {
  return Promise.all(
    cars.map(async (car) => {
      const existingImage = car.imageUrl || car.image;

      if (existingImage) return car;

      const imageUrl = await findCarImage(car);

      return {
        ...car,
        image: imageUrl,
        imageUrl,
      };
    })
  );
}

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

  const accessToken = getBearerToken(req);

  if (!accessToken) {
    return send(res, 401, {
      error: "Prihlás sa a skús vyhľadávanie znova.",
    });
  }

  const user = await verifyUser(accessToken);

  if (!user) {
    return send(res, 401, {
      error: "Prihlásenie vypršalo. Prihlás sa znova.",
    });
  }

  const body = req.body || {};

  const query =
    typeof body.query === "string"
      ? body.query.trim()
      : typeof body.prompt === "string"
        ? body.prompt.trim()
        : typeof body.search === "string"
          ? body.search.trim()
          : "";

  if (!query) {
    return send(res, 400, {
      error: "Zadaj, aké auto hľadáš.",
    });
  }

  if (query.length > 1000) {
    return send(res, 400, {
      error: "Vyhľadávanie je príliš dlhé.",
    });
  }

  if (!GROQ_API_KEY && !OPENROUTER_API_KEY) {
    console.error(
      "CARMATCH AI: No AI provider API key configured"
    );

    return send(res, 500, {
      error: "AI provider is not configured on the server.",
    });
  }

  // Count the search only for a verified Supabase user.
  // Fail closed if the database limit function is unavailable.
  const usage = await chargeSearch(accessToken);

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
        "Nepodarilo sa overiť limit vyhľadávania. Skús to neskôr.",
      code: "SEARCH_USAGE_UNAVAILABLE",
    });
  }

  try {
    const generatedCars = await generateCars(query);
    const cars = await addImages(generatedCars);

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

    return send(res, 502, {
      error:
        "AI momentálne nedokáže dokončiť vyhľadávanie. Skús to znova.",
      code: "AI_SEARCH_FAILED",
      remaining: usage.remaining,
    });
  }
}
