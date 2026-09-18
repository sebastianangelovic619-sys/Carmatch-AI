// ============================================================
// CARMATCH AI
// Backend: Supabase usage limit + Groq Compound web search
//         + OpenRouter fallback
// ============================================================

const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const OPENROUTER_URL =
  "https://openrouter.ai/api/v1/chat/completions";

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY;

const GROQ_API_KEY =
  process.env.GROQ_API_KEY;

const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY;

const MAX_SEARCHES_PER_DAY = 5;


// ============================================================
// BASIC HELPERS
// ============================================================

function json(res, status, data) {
  res.status(status).json(data);
}


function cleanText(value, max = 5000) {
  if (value === undefined || value === null) return "";

  return String(value)
    .replace(/\u0000/g, "")
    .slice(0, max);
}


function safeArray(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map(x => cleanText(x, 500))
    .filter(Boolean)
    .slice(0, 10);
}


function extractJson(text) {
  if (!text) {
    throw new Error("AI returned empty response");
  }

  let cleaned = String(text).trim();

  // Remove markdown code fences
  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Direct JSON
  try {
    return JSON.parse(cleaned);
  } catch (_) {}

  // Find first JSON object
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");

  if (first !== -1 && last !== -1 && last > first) {
    const possible = cleaned.slice(first, last + 1);

    try {
      return JSON.parse(possible);
    } catch (_) {}
  }

  throw new Error("AI returned invalid JSON");
}


// ============================================================
// SUPABASE AUTH
// ============================================================

async function verifySupabaseUser(accessToken) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase environment variables are missing");
  }

  if (!accessToken) {
    return null;
  }

  const response = await fetch(
    `${SUPABASE_URL}/auth/v1/user`,
    {
      method: "GET",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  if (!response.ok) {
    return null;
  }

  const user = await response.json();

  if (!user || !user.id) {
    return null;
  }

  return user;
}


// ============================================================
// SUPABASE RPC
// ============================================================

async function supabaseRPC(functionName, accessToken) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/${functionName}`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: "{}"
    }
  );

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch (_) {
    throw new Error(
      `Supabase RPC returned invalid response: ${text}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `Supabase RPC error: ${text}`
    );
  }

  return data;
}


// ============================================================
// SEARCH USAGE
// ============================================================

async function consumeSearch(accessToken) {
  const result = await supabaseRPC(
    "use_search",
    accessToken
  );

  if (!result || result.allowed !== true) {
    return {
      allowed: false,
      remaining: 0
    };
  }

  return {
    allowed: true,
    remaining:
      typeof result.remaining === "number"
        ? result.remaining
        : 0
  };
}


async function refundSearch(accessToken) {
  try {
    return await supabaseRPC(
      "refund_search",
      accessToken
    );
  } catch (_) {
    return null;
  }
}


// ============================================================
// REQUEST VALIDATION
// ============================================================

function validateRequest(body) {
  const naturalLanguage = cleanText(
    body?.naturalLanguage,
    3000
  );

  const filters =
    body?.filters && typeof body.filters === "object"
      ? body.filters
      : {};

  return {
    naturalLanguage,
    filters: {
      budget: cleanText(filters.budget, 100),
      seats: cleanText(filters.seats, 100),
      power: cleanText(filters.power, 100),
      trunk: cleanText(filters.trunk, 100),
      drive: cleanText(filters.drive, 100),
      fuel: cleanText(filters.fuel, 100),
      body: cleanText(filters.body, 100),
      style: cleanText(filters.style, 100),
      length: cleanText(filters.length, 100),
      year: cleanText(filters.year, 100),
      avoid: cleanText(filters.avoid, 500)
    }
  };
}


// ============================================================
// LANGUAGE / MARKET
// ============================================================

function detectLanguage(text) {
  const value = String(text || "").toLowerCase();

  const slovakWords = [
    "chcem",
    "potrebujem",
    "auto",
    "vozidlo",
    "rozpočet",
    "sedadlá",
    "kufor",
    "výkon",
    "pohon",
    "benzín",
    "nafta",
    "elektrické",
    "hybrid",
    "rok",
    "nové",
    "najnovšie"
  ];

  const count = slovakWords.filter(
    word => value.includes(word)
  ).length;

  return count >= 1 ? "slovak" : "english";
}


function detectMarket(text) {
  const value = String(text || "").toLowerCase();

  if (
    value.includes("slovensko") ||
    value.includes("slovakia") ||
    value.includes("eur") ||
    value.includes("€")
  ) {
    return "Slovakia / European Union";
  }

  return "Europe";
}


// ============================================================
// CAR SCHEMA NORMALIZATION
// ============================================================

function normalizeCar(car) {
  if (!car || typeof car !== "object") {
    throw new Error("Invalid car object");
  }

  const normalized = {
    name: cleanText(car.name, 200),
    generation: cleanText(car.generation, 300),
    year: Number(car.year) || null,
    score: Number(car.score) || 0,

    price: cleanText(car.price, 150),

    power: cleanText(car.power, 150),
    seats:
      Number(car.seats) ||
      null,

    trunk: cleanText(car.trunk, 150),
    drive: cleanText(car.drive, 100),
    fuel: cleanText(car.fuel, 150),

    reason: cleanText(car.reason, 1500),

    pros: safeArray(car.pros),
    cons: safeArray(car.cons),

    maintenance: cleanText(
      car.maintenance,
      1500
    ),

    image: cleanText(car.image, 1500),

    photoSource: cleanText(
      car.photoSource,
      1500
    ),

    configurator: cleanText(
      car.configurator,
      1500
    ),

    priceSource: cleanText(
      car.priceSource,
      1500
    ),

    dataSources: safeArray(
      car.dataSources
    )
  };

  if (!normalized.name) {
    throw new Error("Car name missing");
  }

  if (!normalized.generation) {
    throw new Error(
      `Generation missing for ${normalized.name}`
    );
  }

  if (!normalized.year) {
    throw new Error(
      `Model year missing for ${normalized.name}`
    );
  }

  if (!normalized.reason) {
    throw new Error(
      `Reason missing for ${normalized.name}`
    );
  }

  return normalized;
}


function validateCars(data) {
  if (
    !data ||
    !Array.isArray(data.cars)
  ) {
    throw new Error(
      "AI response does not contain cars array"
    );
  }

  if (data.cars.length !== 3) {
    throw new Error(
      `AI returned ${data.cars.length} cars instead of exactly 3`
    );
  }

  return data.cars.map(normalizeCar);
}


// ============================================================
// MAIN AI PROMPT
// ============================================================

function buildPrompt(request) {
  const language =
    detectLanguage(request.naturalLanguage);

  const market =
    detectMarket(
      `${request.naturalLanguage} ${JSON.stringify(
        request.filters
      )}`
    );

  const today =
    new Date()
      .toISOString()
      .slice(0, 10);

  return `
You are CARMATCH AI, a professional automotive research assistant.

CURRENT DATE:
${today}

TARGET MARKET:
${market}

USER LANGUAGE:
${language === "slovak" ? "Slovak" : "English"}

USER REQUEST:
${request.naturalLanguage || "No natural-language request provided."}

FILTERS:
${JSON.stringify(request.filters, null, 2)}

YOUR TASK:

Find exactly 3 currently relevant cars that best satisfy the user's
request and filters.

IMPORTANT:
This is NOT a generic car knowledge task.

You MUST research CURRENT information on the web before answering.

You must prioritize:
1. Official manufacturer websites.
2. Official configurators.
3. Official price lists.
4. Official regional manufacturer websites.
5. Reliable automotive sources only when an official source is unavailable.

============================================================
VEHICLE IDENTIFICATION
============================================================

For every car identify the EXACT:

- manufacturer
- model
- generation
- model year
- current version/variant when relevant

Do NOT mix:
- old generation photos with new generation data
- old prices with current cars
- facelift and pre-facelift information
- different generations
- concept cars with production cars
- discontinued versions with current versions

If the user asks for "newest", use the newest generation/version
that is actually currently available or officially announced for sale.

Do NOT invent future models.

============================================================
PRICE
============================================================

This is extremely important.

The price field must represent the CURRENT "starting from" price
for the relevant market whenever an official price is available.

Prefer:

"€XX XXX"

or

"€XX XXX od"

depending on the source.

The price should come from:
- official manufacturer website
- official configurator
- official price list

Do NOT use:
- random used-car prices
- dealer discount prices
- leasing monthly payments
- old launch prices
- estimated prices
- guessed prices

If a current official price cannot be verified, write:

"Cena na vyžiadanie"

and explain why in priceSource.

NEVER invent a price.

============================================================
IMAGE
============================================================

The image must correspond to the EXACT car.

Prefer an official manufacturer image or a reliable image
showing the same:

- model
- generation
- facelift/version
- model year when possible

Do NOT return:
- generic brand logos
- unrelated model images
- old-generation images
- stock images of a different generation
- random search-result images

The image URL must be a direct usable image URL whenever possible.

photoSource must identify where the image came from.

============================================================
OFFICIAL CONFIGURATOR
============================================================

Find the official manufacturer configurator for the exact vehicle
whenever one exists.

The configurator field must contain ONLY an official manufacturer
website URL.

Do NOT use:
- dealer websites
- car marketplaces
- Google search URLs
- third-party configurators

If no official configurator exists, use an empty string.

============================================================
USER FILTERS
============================================================

Respect the user's filters.

Budget:
${request.filters.budget || "not specified"}

Seats:
${request.filters.seats || "not specified"}

Power:
${request.filters.power || "not specified"}

Trunk:
${request.filters.trunk || "not specified"}

Drive:
${request.filters.drive || "not specified"}

Fuel:
${request.filters.fuel || "not specified"}

Body:
${request.filters.body || "not specified"}

Style:
${request.filters.style || "not specified"}

Length:
${request.filters.length || "not specified"}

Year:
${request.filters.year || "not specified"}

Brands/models to avoid:
${request.filters.avoid || "none"}

============================================================
RECOMMENDATION QUALITY
============================================================

Do not automatically recommend generic popular cars.

If the user asks for:
- high performance
- two seats
- sports car
- luxury
- 4x4
- large trunk
- unusual/exotic vehicle

then the results must actually satisfy those requirements.

Do not recommend a normal family sedan just because it is popular.

============================================================
MAINTENANCE
============================================================

Give a realistic short maintenance assessment.

Mention:
- expected servicing complexity
- expensive components if relevant
- EV battery / hybrid system considerations if relevant
- performance-car costs if relevant

Do NOT invent exact annual costs unless verified.

============================================================
OUTPUT
============================================================

Return ONLY valid JSON.

Do not use markdown.
Do not use code fences.
Do not write anything before or after the JSON.

Format:

{
  "cars": [
    {
      "name": "...",
      "generation": "...",
      "year": 2026,
      "score": 95,
      "price": "...",
      "power": "...",
      "seats": 5,
      "trunk": "...",
      "drive": "...",
      "fuel": "...",
      "reason": "...",
      "pros": ["...", "...", "..."],
      "cons": ["...", "..."],
      "maintenance": "...",
      "image": "...",
      "photoSource": "...",
      "configurator": "...",
      "priceSource": "...",
      "dataSources": ["...", "..."]
    }
  ]
}

There MUST be exactly 3 cars.

The score is NOT a political or subjective rating.
It is only a technical matching score from 0-100 showing how closely
the vehicle satisfies the user's explicitly stated automotive criteria.

Most importantly:
VERIFY CURRENT INFORMATION ON THE WEB.
Do not rely only on your internal knowledge.
`;
}


// ============================================================
// GROQ COMPOUND
// ============================================================

async function callGroqCompound(request) {
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is missing");
  }

  const prompt =
    buildPrompt(request);

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      45000
    );

  try {
    const response = await fetch(
      GROQ_URL,
      {
        method: "POST",
        signal: controller.signal,

        headers: {
          "Content-Type": "application/json",
          Authorization:
            `Bearer ${GROQ_API_KEY}`
        },

        body: JSON.stringify({
          model: "groq/compound",

          messages: [
            {
              role: "system",
              content:
                "You are CARMATCH AI. Always research current web information and return only valid JSON matching the requested structure."
            },
            {
              role: "user",
              content: prompt
            }
          ],

          response_format: {
            type: "json_object"
          },

          temperature: 0.1,

          max_completion_tokens: 7000,

          compound_custom: {
            tools: {
              enabled_tools: [
                "web_search",
                "visit_website"
              ]
            }
          }
        })
      }
    );

    const text =
      await response.text();

    if (!response.ok) {
      throw new Error(
        `Groq HTTP ${response.status}: ${text}`
      );
    }

    let data;

    try {
      data = JSON.parse(text);
    } catch (_) {
      throw new Error(
        "Groq returned invalid API JSON"
      );
    }

    const content =
      data?.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error(
        "Groq returned empty content"
      );
    }

    const parsed =
      extractJson(content);

    const cars =
      validateCars(parsed);

    return {
      cars,
      provider: "Groq Compound",
      liveWeb: true
    };

  } finally {
    clearTimeout(timeout);
  }
}


// ============================================================
// OPENROUTER FALLBACK
// ============================================================

async function callOpenRouter(request) {
  if (!OPENROUTER_API_KEY) {
    throw new Error(
      "OPENROUTER_API_KEY is missing"
    );
  }

  const prompt = `
${buildPrompt(request)}

IMPORTANT FALLBACK RULE:

You may not have live web access.

Therefore:
- NEVER invent current prices.
- NEVER pretend an unverified price is current.
- If you cannot verify a current official price, use:
  "Cena na vyžiadanie"
- If you cannot verify an exact current image URL, use an empty string.
- If you cannot verify an official configurator URL, use an empty string.

Return only JSON.
`;

  const models = [
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b"
  ];

  let lastError = null;

  for (const model of models) {
    try {
      const response =
        await fetch(
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

            body: JSON.stringify({
              model,

              messages: [
                {
                  role: "system",
                  content:
                    "Return only valid JSON. Never invent current automotive prices or URLs."
                },
                {
                  role: "user",
                  content: prompt
                }
              ],

              response_format: {
                type: "json_object"
              },

              temperature: 0.1,

              max_tokens: 7000
            })
          }
        );

      const text =
        await response.text();

      if (!response.ok) {
        lastError =
          new Error(
            `OpenRouter ${model} HTTP ${response.status}: ${text}`
          );

        continue;
      }

      let data;

      try {
        data = JSON.parse(text);
      } catch (_) {
        lastError =
          new Error(
            "OpenRouter returned invalid API JSON"
          );

        continue;
      }

      const content =
        data?.choices?.[0]?.message?.content;

      if (!content) {
        lastError =
          new Error(
            "OpenRouter returned empty content"
          );

        continue;
      }

      const parsed =
        extractJson(content);

      const cars =
        validateCars(parsed);

      return {
        cars,
        provider:
          `OpenRouter (${model})`,
        liveWeb: false
      };

    } catch (error) {
      lastError = error;
    }
  }

  throw (
    lastError ||
    new Error(
      "OpenRouter fallback failed"
    )
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

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return json(
      res,
      405,
      {
        error: "Method not allowed"
      }
    );
  }


  // ----------------------------------------------------------
  // AUTHORIZATION
  // ----------------------------------------------------------

  try {
    const authorization =
      req.headers.authorization ||
      "";

    if (
      !authorization.startsWith(
        "Bearer "
      )
    ) {
      return json(
        res,
        401,
        {
          error:
            "Missing Supabase access token"
        }
      );
    }

    const accessToken =
      authorization.slice(
        "Bearer ".length
      ).trim();

    const user =
      await verifySupabaseUser(
        accessToken
      );

    if (!user) {
      return json(
        res,
        401,
        {
          error:
            "Invalid or expired Supabase session"
        }
      );
    }


    // --------------------------------------------------------
    // REQUEST
    // --------------------------------------------------------

    const request =
      validateRequest(req.body || {});


    // --------------------------------------------------------
    // SEARCH LIMIT
    // --------------------------------------------------------

    const usage =
      await consumeSearch(
        accessToken
      );

    if (!usage.allowed) {
      return json(
        res,
        429,
        {
          error:
            "Denný limit vyhľadávaní bol dosiahnutý.",
          message:
            `Dnes už bolo použitých ${MAX_SEARCHES_PER_DAY} z ${MAX_SEARCHES_PER_DAY} vyhľadávaní.`,
          remaining: 0
        }
      );
    }


    // --------------------------------------------------------
    // AI
    // --------------------------------------------------------

    let result = null;
    let groqError = null;
    let openRouterError = null;


    // ========================================================
    // 1. GROQ COMPOUND
    // ========================================================

    try {
      result =
        await callGroqCompound(
          request
        );
    } catch (error) {
      groqError = error;

      console.error(
        "CARMATCH AI - Groq Compound failed:",
        error
      );
    }


    // ========================================================
    // 2. OPENROUTER FALLBACK
    // ========================================================

    if (!result) {
      try {
        result =
          await callOpenRouter(
            request
          );
      } catch (error) {
        openRouterError =
          error;

        console.error(
          "CARMATCH AI - OpenRouter fallback failed:",
          error
        );
      }
    }


    // ========================================================
    // ALL PROVIDERS FAILED
    // ========================================================

    if (!result) {
      const refund =
        await refundSearch(
          accessToken
        );

      return json(
        res,
        503,
        {
          error:
            "AI is temporarily unavailable",

          message:
            "CARMATCH AI momentálne nedostal použiteľnú odpoveď z AI služieb. Vyhľadávanie bolo vrátené.",

          retryable: true,

          remaining:
            typeof refund?.remaining === "number"
              ? refund.remaining
              : usage.remaining,

          providers: {
            groq:
              groqError
                ? "failed"
                : "unknown",

            openrouter:
              openRouterError
                ? "failed"
                : "unknown"
          }
        }
      );
    }


    // --------------------------------------------------------
    // FINAL RESPONSE
    // --------------------------------------------------------

    return json(
      res,
      200,
      {
        cars: result.cars,

        remaining:
          usage.remaining,

        ai: {
          provider:
            result.provider,

          liveWeb:
            result.liveWeb === true,

          generatedAt:
            new Date().toISOString()
        }
      }
    );

  } catch (error) {

    console.error(
      "CARMATCH AI FAILURE:",
      error
    );

    return json(
      res,
      500,
      {
        error:
          "Internal server error",

        message:
          "CARMATCH AI zaznamenal internú chybu.",

        retryable: true
      }
    );
  }
}