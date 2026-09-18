// ============================================================
// CARMATCH AI - FINAL BACKEND
// Supabase anonymous auth + 5 searches/day
// Groq Compound live web research
// OpenRouter safe fallback
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
// RESPONSE HELPER
// ============================================================

function sendJson(res, status, data) {
  return res.status(status).json(data);
}


// ============================================================
// SAFE TEXT
// ============================================================

function text(value, maxLength = 5000) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value)
    .replace(/\u0000/g, "")
    .slice(0, maxLength);
}


function arrayText(value, maxItems = 10) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(item => text(item, 500))
    .filter(Boolean)
    .slice(0, maxItems);
}


// ============================================================
// JSON EXTRACTION
// ============================================================

function parseAIJson(raw) {
  if (!raw) {
    throw new Error("AI returned an empty response");
  }

  let value = String(raw).trim();

  // Remove markdown code fences
  value = value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Direct JSON
  try {
    return JSON.parse(value);
  } catch (_) {}

  // Search for JSON object inside text
  const firstBrace = value.indexOf("{");
  const lastBrace = value.lastIndexOf("}");

  if (
    firstBrace !== -1 &&
    lastBrace !== -1 &&
    lastBrace > firstBrace
  ) {
    const extracted =
      value.slice(
        firstBrace,
        lastBrace + 1
      );

    try {
      return JSON.parse(extracted);
    } catch (_) {}
  }

  throw new Error("AI returned invalid JSON");
}


// ============================================================
// SUPABASE USER VERIFICATION
// ============================================================

async function verifyUser(accessToken) {
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

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      10000
    );

  try {
    const response =
      await fetch(
        `${SUPABASE_URL}/auth/v1/user`,
        {
          method: "GET",

          headers: {
            apikey:
              SUPABASE_ANON_KEY,

            Authorization:
              `Bearer ${accessToken}`
          },

          signal: controller.signal
        }
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

  } finally {
    clearTimeout(timer);
  }
}


// ============================================================
// SUPABASE RPC
// ============================================================

async function callSupabaseRPC(
  functionName,
  accessToken
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      10000
    );

  try {
    const response =
      await fetch(
        `${SUPABASE_URL}/rest/v1/rpc/${functionName}`,
        {
          method: "POST",

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

          body: "{}",

          signal: controller.signal
        }
      );

    const raw =
      await response.text();

    let data;

    try {
      data = JSON.parse(raw);
    } catch (_) {
      throw new Error(
        `Supabase returned invalid JSON`
      );
    }

    if (!response.ok) {
      throw new Error(
        `Supabase RPC ${functionName} failed`
      );
    }

    return data;

  } finally {
    clearTimeout(timer);
  }
}


// ============================================================
// USE SEARCH
// ============================================================

async function useSearch(accessToken) {
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
      allowed: false,
      remaining: 0
    };
  }

  return {
    allowed: true,

    remaining:
      Number.isFinite(
        Number(result.remaining)
      )
        ? Number(result.remaining)
        : 0
  };
}


// ============================================================
// REFUND SEARCH IF ALL AI PROVIDERS FAIL
// ============================================================

async function refundSearch(accessToken) {
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

function normalizeRequest(body) {
  const filters =
    body &&
    typeof body.filters === "object" &&
    body.filters !== null
      ? body.filters
      : {};

  return {
    naturalLanguage:
      text(
        body?.naturalLanguage,
        3000
      ),

    filters: {
      budget:
        text(filters.budget, 100),

      seats:
        text(filters.seats, 100),

      power:
        text(filters.power, 100),

      trunk:
        text(filters.trunk, 100),

      drive:
        text(filters.drive, 100),

      fuel:
        text(filters.fuel, 100),

      body:
        text(filters.body, 100),

      style:
        text(filters.style, 100),

      length:
        text(filters.length, 100),

      year:
        text(filters.year, 100),

      avoid:
        text(filters.avoid, 500)
    }
  };
}


// ============================================================
// LANGUAGE
// ============================================================

function detectLanguage(request) {
  const content =
    `${request.naturalLanguage} ${
      JSON.stringify(request.filters)
    }`.toLowerCase();

  const slovak =
    [
      "chcem",
      "potrebujem",
      "auto",
      "autá",
      "vozidlo",
      "rozpočet",
      "sedadlá",
      "kufor",
      "výkon",
      "pohon",
      "benzín",
      "nafta",
      "elektrické",
      "elektromobil",
      "hybrid",
      "rok",
      "nové",
      "najnovšie",
      "lacné",
      "športové",
      "luxusné"
    ];

  const count =
    slovak.filter(
      word => content.includes(word)
    ).length;

  return count > 0
    ? "Slovak"
    : "English";
}


// ============================================================
// MARKET
// ============================================================

function detectMarket(request) {
  const content =
    `${request.naturalLanguage} ${
      JSON.stringify(request.filters)
    }`.toLowerCase();

  if (
    content.includes("slovensko") ||
    content.includes("slovakia") ||
    content.includes("eur") ||
    content.includes("€")
  ) {
    return "Slovakia / European Union";
  }

  return "Europe";
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
// PROMPT
// ============================================================

function buildPrompt(request) {
  const language =
    detectLanguage(request);

  const market =
    detectMarket(request);

  return `
You are CARMATCH AI, a professional automotive research assistant.

TODAY:
${currentDate()}

TARGET MARKET:
${market}

RESPONSE LANGUAGE:
${language}

USER REQUEST:
${request.naturalLanguage || "No text request."}

FILTERS:
${JSON.stringify(
  request.filters,
  null,
  2
)}

============================================================
MAIN TASK
============================================================

Find EXACTLY 3 real production vehicles that match the user's
requirements as closely as possible.

You MUST perform current web research before answering.

Use current information, not only your internal knowledge.

============================================================
SOURCE PRIORITY
============================================================

Use sources in this order:

1. Official manufacturer website
2. Official manufacturer regional website
3. Official configurator
4. Official price list
5. Reliable automotive publication

For current prices and configurators, prefer official manufacturer
sources.

============================================================
EXACT VEHICLE
============================================================

For every vehicle determine:

- brand
- exact model
- exact generation
- facelift/version if applicable
- model year
- current variant when relevant

NEVER mix different generations.

NEVER use an old generation with a newer generation's price.

NEVER use a facelift image for a clearly different pre-facelift car.

NEVER recommend a concept car unless the user explicitly asks for
concept cars.

NEVER invent a vehicle.

============================================================
CURRENT PRICE
============================================================

The price must be the CURRENT official starting price for the
target market whenever it can be verified.

Use wording such as:

"€XX XXX"

or

"Od €XX XXX"

Do NOT use:

- used-car price
- dealer discount
- leasing payment
- old launch price
- approximate guessed price
- estimated future price

NEVER invent a number.

If the current official price cannot be verified, use exactly:

"Cena na vyžiadanie"

Then explain that the official current price could not be verified.

priceSource must contain the source URL when available.

============================================================
CURRENT / NEWEST MODEL
============================================================

If the user requests "newest", "najnovšie", "2026", "2027", or
similar wording, prefer the newest currently sold or officially
announced production generation relevant to the target market.

Do NOT invent future availability.

============================================================
IMAGE
============================================================

The image should represent the exact vehicle whenever possible.

Prefer:
- manufacturer media image
- official manufacturer page
- reliable source showing the same generation

Do NOT return:
- brand logo
- unrelated model
- old generation
- random unrelated car
- stock image of another generation

If an exact direct image URL cannot be verified, return an empty
image string instead of inventing a URL.

photoSource must explain the image source.

============================================================
OFFICIAL CONFIGURATOR
============================================================

configurator must contain only an official manufacturer URL.

Never use:
- dealer configurator
- marketplace
- Google search
- third-party website

If there is no official configurator, return an empty string.

============================================================
USER FILTERS
============================================================

Respect every available filter:

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

Avoid:
${request.filters.avoid || "none"}

============================================================
IMPORTANT FILTER LOGIC
============================================================

Do not ignore strong requirements.

Example:

If user requests 2 seats + high power + sports car,
do not recommend a normal 5-seat family car.

If user requests large trunk,
do not recommend a car with a small trunk merely because it is
popular.

If user requests 4x4,
prefer actual AWD/4WD vehicles.

If user specifies brands to avoid,
do not return those brands.

============================================================
MAINTENANCE
============================================================

Give a realistic short maintenance description.

Mention relevant factors such as:
- servicing complexity
- performance-car maintenance
- hybrid system complexity
- EV battery considerations
- expensive brakes/tyres
- drivetrain complexity

Do not invent exact annual costs.

============================================================
RESULT FORMAT
============================================================

Return ONLY valid JSON.

No markdown.
No code fences.
No explanation outside JSON.

The JSON must have this exact top-level structure:

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

year must be a number.

seats must be a number.

score must be a number from 0 to 100.

pros and cons must be arrays.

dataSources must contain URLs or identifiable source names.

MOST IMPORTANT:
Research the web first.
Use current information.
Never invent prices.
Never invent URLs.
Never mix generations.
`;
}


// ============================================================
// NORMALIZE ONE CAR
// ============================================================

function normalizeCar(car) {
  if (
    !car ||
    typeof car !== "object"
  ) {
    throw new Error(
      "Invalid vehicle object"
    );
  }

  const result = {
    name:
      text(car.name, 200),

    generation:
      text(car.generation, 300),

    year:
      Number(car.year),

    score:
      Number(car.score),

    price:
      text(car.price, 150),

    power:
      text(car.power, 150),

    seats:
      Number(car.seats),

    trunk:
      text(car.trunk, 150),

    drive:
      text(car.drive, 150),

    fuel:
      text(car.fuel, 150),

    reason:
      text(car.reason, 1500),

    pros:
      arrayText(car.pros),

    cons:
      arrayText(car.cons),

    maintenance:
      text(
        car.maintenance,
        1500
      ),

    image:
      text(
        car.image,
        2000
      ),

    photoSource:
      text(
        car.photoSource,
        2000
      ),

    configurator:
      text(
        car.configurator,
        2000
      ),

    priceSource:
      text(
        car.priceSource,
        2000
      ),

    dataSources:
      arrayText(
        car.dataSources,
        10
      )
  };

  if (!result.name) {
    throw new Error(
      "Vehicle name missing"
    );
  }

  if (!result.generation) {
    throw new Error(
      `Generation missing for ${result.name}`
    );
  }

  if (
    !Number.isFinite(result.year) ||
    result.year < 2000 ||
    result.year > 2100
  ) {
    throw new Error(
      `Invalid model year for ${result.name}`
    );
  }

  if (
    !Number.isFinite(result.score)
  ) {
    result.score = 0;
  }

  result.score =
    Math.max(
      0,
      Math.min(
        100,
        Math.round(
          result.score
        )
      )
    );

  if (
    !Number.isFinite(result.seats) ||
    result.seats < 1 ||
    result.seats > 20
  ) {
    result.seats = null;
  }

  if (!result.reason) {
    result.reason =
      "Spĺňa zadané požiadavky používateľa.";
  }

  return result;
}


// ============================================================
// VALIDATE 3 CARS
// ============================================================

function validateCars(data) {
  if (
    !data ||
    !Array.isArray(data.cars)
  ) {
    throw new Error(
      "AI response does not contain cars"
    );
  }

  if (
    data.cars.length !== 3
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
// GROQ COMPOUND
// ============================================================

async function callGroq(request) {
  if (!GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY is not configured"
    );
  }

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      55000
    );

  try {
    const response =
      await fetch(
        GROQ_URL,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${GROQ_API_KEY}`,

            "Groq-Model-Version":
              "latest"
          },

          body: JSON.stringify({
            model:
              "groq/compound",

            messages: [
              {
                role: "system",

                content:
                  "You are CARMATCH AI. Use the built-in web search and website tools to research current automotive information. Return only the requested JSON."
              },
              {
                role: "user",

                content:
                  buildPrompt(request)
              }
            ],

            compound_custom: {
              tools: {
                enabled_tools: [
                  "web_search",
                  "visit_website"
                ]
              }
            }
          }),

          signal: controller.signal
        }
      );

    const raw =
      await response.text();

    if (!response.ok) {
      throw new Error(
        `Groq HTTP ${response.status}`
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
      apiData?.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error(
        "Groq returned empty content"
      );
    }

    const parsed =
      parseAIJson(content);

    const cars =
      validateCars(parsed);

    return {
      cars,

      provider:
        "Groq Compound",

      liveWeb:
        true
    };

  } finally {
    clearTimeout(timer);
  }
}


// ============================================================
// OPENROUTER FALLBACK
// ============================================================

async function callOpenRouter(request) {
  if (!OPENROUTER_API_KEY) {
    throw new Error(
      "OPENROUTER_API_KEY is not configured"
    );
  }

  const models = [
    "openrouter/free"
  ];

  let lastError =
    null;

  for (const model of models) {
    try {
      const controller =
        new AbortController();

      const timer =
        setTimeout(
          () => controller.abort(),
          30000
        );

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
                    role:
                      "system",

                    content:
                      "Return only valid JSON. Never invent current automotive prices, image URLs, or official configurator URLs. If current information cannot be verified, use empty fields or 'Cena na vyžiadanie'."
                  },
                  {
                    role:
                      "user",

                    content:
                      buildPrompt(request)
                  }
                ],

                temperature:
                  0.1,

                max_tokens:
                  7000,

                response_format: {
                  type:
                    "json_object"
                }
              }),

              signal:
                controller.signal
            }
          );

        const raw =
          await response.text();

        if (!response.ok) {
          lastError =
            new Error(
              `OpenRouter HTTP ${response.status}`
            );

          continue;
        }

        let apiData;

        try {
          apiData =
            JSON.parse(raw);
        } catch (_) {
          lastError =
            new Error(
              "OpenRouter returned invalid API JSON"
            );

          continue;
        }

        const content =
          apiData?.choices?.[0]?.message?.content;

        if (!content) {
          lastError =
            new Error(
              "OpenRouter returned empty content"
            );

          continue;
        }

        const parsed =
          parseAIJson(content);

        const cars =
          validateCars(parsed);

        return {
          cars,

          provider:
            `OpenRouter (${model})`,

          liveWeb:
            false
        };

      } finally {
        clearTimeout(timer);
      }

    } catch (error) {
      lastError =
        error;
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


  try {

    // --------------------------------------------------------
    // ENVIRONMENT CHECK
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
            "Configuration error"
        }
      );
    }


    // --------------------------------------------------------
    // AUTHORIZATION HEADER
    // --------------------------------------------------------

    const authorization =
      req.headers.authorization ||
      "";

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

    if (!accessToken) {
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
    // VERIFY SUPABASE USER
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // NORMALIZE REQUEST
    // --------------------------------------------------------

    const request =
      normalizeRequest(
        req.body || {}
      );


    // --------------------------------------------------------
    // CHECK DAILY SEARCH LIMIT
    // --------------------------------------------------------

    const usage =
      await useSearch(
        accessToken
      );

    if (!usage.allowed) {
      return sendJson(
        res,
        429,
        {
          error:
            "Denný limit vyhľadávaní bol dosiahnutý.",

          message:
            "Použil si všetkých 5 vyhľadávaní pre dnešok.",

          remaining:
            0
        }
      );
    }


    // --------------------------------------------------------
    // GROQ FIRST
    // --------------------------------------------------------

    let result =
      null;

    let groqFailed =
      false;

    try {
      result =
        await callGroq(
          request
        );
    } catch (error) {

      groqFailed =
        true;

      console.error(
        "CARMATCH AI - Groq failed:",
        error
      );
    }


    // --------------------------------------------------------
    // OPENROUTER SECOND
    // --------------------------------------------------------

    let openRouterFailed =
      false;

    if (!result) {
      try {
        result =
          await callOpenRouter(
            request
          );
      } catch (error) {

        openRouterFailed =
          true;

        console.error(
          "CARMATCH AI - OpenRouter failed:",
          error
        );
      }
    }


    // --------------------------------------------------------
    // ALL PROVIDERS FAILED
    // --------------------------------------------------------

    if (!result) {

      const refund =
        await refundSearch(
          accessToken
        );

      const remaining =
        Number.isFinite(
          Number(
            refund?.remaining
          )
        )
          ? Number(
              refund.remaining
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
              groqFailed
                ? "unavailable"
                : "unknown",

            openrouter:
              openRouterFailed
                ? "unavailable"
                : "unknown"
          }
        }
      );
    }


    // --------------------------------------------------------
    // SUCCESS
    // --------------------------------------------------------

    return sendJson(
      res,
      200,
      {
        cars:
          result.cars,

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
            new Date().toISOString()
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
          "CARMATCH AI sa nepodarilo dokončiť požiadavku. Skontroluj nastavenia Supabase a AI kľúčov vo Verceli.",

        retryable:
          true
      }
    );
  }
}