// ============================================================
// CARMATCH AI - PRODUCTION BACKEND v13.4
// ============================================================
//
// FIXES
// - Correct Supabase project
// - Correct Supabase authentication
// - Detailed Supabase auth errors
// - Supports publishable / anon key environment variables
// - No old Supabase project fallback
//
// TEST MODE
// - 5 searches/day LIMIT DISABLED
// - Supabase authentication remains enabled
// - No search is consumed
// - No refund is needed
//
// AI
// - Groq GPT-OSS 120B + Browser Search
// - Groq GPT-OSS 20B + Browser Search fallback
// - OpenRouter FREE fallbacks
//
// OUTPUT
// - Exactly 3 cars
// - Slovak language
// - kW + mechanical HP
// - Official URLs only when verified
// - No invented image URLs
// ============================================================

const SEARCH_LIMIT_ENABLED = false;

// ============================================================
// CONFIG
// ============================================================

const REQUEST_HARD_TIMEOUT = 150000;

const SUPABASE_TIMEOUT = 7000;

const GROQ_PRIMARY_TIMEOUT = 50000;
const GROQ_FALLBACK_TIMEOUT = 30000;

const OPENROUTER_TIMEOUT = 20000;

const OFFICIAL_PAGE_TIMEOUT = 4500;

const WIKIMEDIA_TIMEOUT = 4500;
const WIKIPEDIA_TIMEOUT = 4500;

const RESPONSE_BODY_TIMEOUT = 7000;

const MAX_IMAGE_CANDIDATES = 8;
const MAX_OUTPUT_CARS = 3;
const MAX_TEXT_LENGTH = 16000;

// ============================================================
// ENVIRONMENT
// ============================================================

const GROQ_API_KEY =
  process.env.GROQ_API_KEY || "";

const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY || "";

// ============================================================
// SUPABASE
// ============================================================
//
// CORRECT PROJECT:
// frmhjjzgvmitdgcvgfuk
//
// IMPORTANT:
// The backend first uses Vercel Environment Variables.
// There is NO old Supabase project fallback anymore.
// ============================================================

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://frmhjjzgvmitdgcvgfuk.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_53FDnkTuv2C6rhZIVDJVxQ_MOAg_80E";

// ============================================================
// AI MODELS
// ============================================================

const GROQ_PRIMARY_MODEL =
  "openai/gpt-oss-120b";

const GROQ_FALLBACK_MODEL =
  "openai/gpt-oss-20b";

const OPENROUTER_MODELS = [
  "openrouter/free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3.5-lightning:free"
];

// ============================================================
// BASIC HELPERS
// ============================================================

function json(res, status, payload) {
  res.status(status);

  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );

  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  return res.end(
    JSON.stringify(payload)
  );
}

function cors(res) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );
}

function now() {
  return Date.now();
}

function remainingTime(deadline) {
  return Math.max(
    100,
    deadline - now()
  );
}

function cleanText(
  value,
  max = MAX_TEXT_LENGTH
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
    .slice(0, max);
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function safeObject(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? value
    : {};
}

function normalizeWhitespace(value) {
  return cleanText(value)
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================================
// NUMBER HELPERS
// ============================================================

function toNumber(value) {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const cleaned =
    value
      .replace(",", ".")
      .replace(/[^\d.-]/g, "");

  const result =
    Number(cleaned);

  return Number.isFinite(result)
    ? result
    : null;
}

function toInteger(value) {
  const n =
    toNumber(value);

  if (n === null) {
    return null;
  }

  return Math.round(n);
}

// ============================================================
// DEADLINE / TIMEOUT
// ============================================================

function createDeadlineController(ms) {
  const controller =
    new AbortController();

  const deadline =
    now() + ms;

  const timer =
    setTimeout(() => {
      try {
        controller.abort(
          new Error(
            "REQUEST_HARD_TIMEOUT"
          )
        );
      } catch {
        controller.abort();
      }
    }, ms);

  return {
    controller,
    deadline,

    clear() {
      clearTimeout(timer);
    }
  };
}

async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs = 5000,
  rootSignal = null
) {
  const controller =
    new AbortController();

  const safeTimeout =
    Math.max(
      100,
      Math.min(
        timeoutMs,
        120000
      )
    );

  const timer =
    setTimeout(() => {
      try {
        controller.abort(
          new Error(
            "REQUEST_TIMEOUT"
          )
        );
      } catch {
        controller.abort();
      }
    }, safeTimeout);

  let abortListener = null;

  try {
    if (rootSignal) {
      if (rootSignal.aborted) {
        controller.abort(
          new Error(
            "REQUEST_HARD_TIMEOUT"
          )
        );
      } else {
        abortListener = () => {
          try {
            controller.abort(
              new Error(
                "REQUEST_HARD_TIMEOUT"
              )
            );
          } catch {
            controller.abort();
          }
        };

        rootSignal.addEventListener(
          "abort",
          abortListener,
          {
            once: true
          }
        );
      }
    }

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

    if (
      rootSignal &&
      abortListener
    ) {
      rootSignal.removeEventListener(
        "abort",
        abortListener
      );
    }
  }
}

async function readResponseBody(
  response
) {
  const bodyPromise =
    response.text();

  const timeoutPromise =
    new Promise((_, reject) => {
      const timer =
        setTimeout(() => {
          reject(
            new Error(
              "RESPONSE_BODY_TIMEOUT"
            )
          );
        }, RESPONSE_BODY_TIMEOUT);

      bodyPromise
        .finally(() => {
          clearTimeout(timer);
        })
        .catch(() => {});
    });

  return Promise.race([
    bodyPromise,
    timeoutPromise
  ]);
}

// ============================================================
// URL SAFETY
// ============================================================

function safeHttpsUrl(value) {
  if (!value) {
    return null;
  }

  try {
    const url =
      new URL(
        String(value).trim()
      );

    if (
      url.protocol !== "https:"
    ) {
      return null;
    }

    if (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "0.0.0.0" ||
      url.hostname === "::1"
    ) {
      return null;
    }

    if (
      url.hostname.endsWith(".local") ||
      url.hostname.endsWith(".internal")
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

// ============================================================
// ERROR
// ============================================================

function getErrorMessage(error) {
  if (!error) {
    return "Unknown error";
  }

  if (
    typeof error === "string"
  ) {
    return error.slice(0, 700);
  }

  if (error.message) {
    return String(
      error.message
    ).slice(0, 700);
  }

  return "Unknown error";
}

// ============================================================
// REQUEST BODY
// ============================================================

function parseRequestBody(req) {
  const body =
    req.body;

  if (
    body &&
    typeof body === "object" &&
    !Array.isArray(body)
  ) {
    return body;
  }

  if (
    typeof body === "string"
  ) {
    const raw =
      body.trim();

    if (!raw) {
      return {};
    }

    try {
      return safeObject(
        JSON.parse(raw)
      );
    } catch {
      throw new Error(
        "INVALID_JSON_BODY"
      );
    }
  }

  if (
    typeof Buffer !==
      "undefined" &&
    Buffer.isBuffer(body)
  ) {
    const raw =
      body.toString("utf8").trim();

    if (!raw) {
      return {};
    }

    try {
      return safeObject(
        JSON.parse(raw)
      );
    } catch {
      throw new Error(
        "INVALID_JSON_BODY"
      );
    }
  }

  return {};
}

// ============================================================
// REQUEST DATA
// ============================================================

function extractNaturalLanguage(
  body
) {
  const candidates = [
    body?.aiRequest,
    body?.naturalLanguage,
    body?.query,
    body?.request,
    body?.prompt,
    body?.text
  ];

  for (
    const candidate
    of candidates
  ) {
    const text =
      normalizeWhitespace(
        candidate
      );

    if (text) {
      return text;
    }
  }

  return "";
}

function extractFilters(
  body
) {
  const bodyObject =
    safeObject(body);

  const filterObject =
    safeObject(
      bodyObject.filters
    );

  const hasFilters =
    Object.keys(
      filterObject
    ).length > 0;

  const source =
    hasFilters
      ? filterObject
      : bodyObject;

  return {
    budget:
      cleanText(
        source.budget
      ),

    seats:
      cleanText(
        source.seats
      ),

    power:
      cleanText(
        source.power
      ),

    trunk:
      cleanText(
        source.trunk
      ),

    drive:
      cleanText(
        source.drive
      ),

    fuel:
      cleanText(
        source.fuel
      ),

    body:
      cleanText(
        source.body
      ),

    style:
      cleanText(
        source.style
      ),

    length:
      cleanText(
        source.length
      ),

    year:
      cleanText(
        source.year
      ),

    avoid:
      cleanText(
        source.avoid ||
        source.avoidBrands
      )
  };
}

// ============================================================
// RESEARCH PROMPT
// ============================================================

function buildResearchPrompt(
  naturalLanguage,
  filters
) {
  const filterLines =
    Object.entries(
      filters
    )
      .filter(
        ([, value]) =>
          value
      )
      .map(
        ([key, value]) =>
          `- ${key}: ${value}`
      )
      .join("\n");

  return `
You are CARMATCH AI, an automotive research assistant.

The user wants exactly 3 real production cars matching the request.

USER REQUEST:
${naturalLanguage || "(none)"}

FILTERS:
${filterLines || "(none)"}

RESEARCH RULES:
1. Use real production cars.
2. Prefer current/newest generations.
3. Consider Slovakia and EU availability when relevant.
4. Use browser web research.
5. Verify important facts before answering.
6. Never invent prices.
7. Never invent URLs.
8. If exact official current price cannot be verified, use "Cena na vyžiadanie".
9. If there is no reliable price information, use "Cena nie je dostupná".
10. Prefer official manufacturer sources.
11. Give power in kW and mechanical horsepower.
12. Do not use PS as mechanical horsepower.
13. Write descriptions in Slovak.
14. Return exactly 3 cars.
15. Do not return concepts unless explicitly requested.
16. Do not return trucks, buses, motorcycles or unrelated vehicles.
17. Keep the answer compact.

FOR EACH CAR RETURN:
- brand
- model
- generation
- modelYear
- price
- currency
- powerKw
- powerHpMechanical
- fuel
- drivetrain
- body
- seats
- trunkLitres
- lengthMm
- officialSourceUrl
- officialPriceUrl
- officialConfiguratorUrl
- description
- pros
- cons
- maintenance
- imageSearchName

IMPORTANT:
Do not return image URLs.
The backend searches images separately.

URL RULE:
Only return real HTTPS URLs.
Use null when unavailable.

OUTPUT:
Return ONLY valid JSON.
No markdown.
No commentary.
No explanation outside JSON.

FORMAT:
{
  "cars": [
    {
      "brand": "",
      "model": "",
      "generation": "",
      "modelYear": null,
      "price": "",
      "currency": "",
      "powerKw": null,
      "powerHpMechanical": null,
      "fuel": "",
      "drivetrain": "",
      "body": "",
      "seats": null,
      "trunkLitres": null,
      "lengthMm": null,
      "officialSourceUrl": null,
      "officialPriceUrl": null,
      "officialConfiguratorUrl": null,
      "description": "",
      "pros": [],
      "cons": [],
      "maintenance": "",
      "imageSearchName": ""
    }
  ]
}
`.trim();
}

function buildRepairPrompt(
  originalOutput,
  naturalLanguage,
  filters
) {
  const filterLines =
    Object.entries(
      filters
    )
      .filter(
        ([, value]) =>
          value
      )
      .map(
        ([key, value]) =>
          `- ${key}: ${value}`
      )
      .join("\n");

  return `
Repair the following automotive research.

USER REQUEST:
${naturalLanguage}

FILTERS:
${filterLines || "(none)"}

ORIGINAL OUTPUT:
${cleanText(
  originalOutput,
  30000
)}

Return exactly 3 real production cars.

Requirements:
- Slovak language
- current/newest generation where possible
- no invented prices
- no invented URLs
- null when uncertain
- powerKw numeric
- powerHpMechanical numeric
- no image URLs
- exactly 3 cars
- JSON only

FORMAT:
{
  "cars": [
    {
      "brand": "",
      "model": "",
      "generation": "",
      "modelYear": null,
      "price": "",
      "currency": "",
      "powerKw": null,
      "powerHpMechanical": null,
      "fuel": "",
      "drivetrain": "",
      "body": "",
      "seats": null,
      "trunkLitres": null,
      "lengthMm": null,
      "officialSourceUrl": null,
      "officialPriceUrl": null,
      "officialConfiguratorUrl": null,
      "description": "",
      "pros": [],
      "cons": [],
      "maintenance": "",
      "imageSearchName": ""
    }
  ]
}
`.trim();
}

// ============================================================
// JSON PARSING
// ============================================================

function stripCodeFence(
  text
) {
  return String(
    text || ""
  )
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
}

function extractJsonObject(
  text
) {
  if (!text) {
    return null;
  }

  const cleaned =
    stripCodeFence(text);

  try {
    return JSON.parse(
      cleaned
    );
  } catch {}

  const firstBrace =
    cleaned.indexOf("{");

  const lastBrace =
    cleaned.lastIndexOf("}");

  if (
    firstBrace >= 0 &&
    lastBrace > firstBrace
  ) {
    const candidate =
      cleaned.slice(
        firstBrace,
        lastBrace + 1
      );

    try {
      return JSON.parse(
        candidate
      );
    } catch {}
  }

  return null;
}

// ============================================================
// AI CONTENT EXTRACTION
// ============================================================

function extractAssistantContent(
  data
) {
  const choice =
    data?.choices?.[0];

  if (!choice) {
    return "";
  }

  const message =
    choice?.message;

  if (!message) {
    return "";
  }

  const content =
    message.content;

  if (
    typeof content ===
    "string"
  ) {
    return content;
  }

  if (
    Array.isArray(content)
  ) {
    const joined =
      content
        .map(item => {
          if (
            typeof item ===
            "string"
          ) {
            return item;
          }

          if (
            item?.text
          ) {
            return item.text;
          }

          return "";
        })
        .join("\n");

    if (joined.trim()) {
      return joined;
    }
  }

  if (
    typeof message.output_text ===
    "string"
  ) {
    return message.output_text;
  }

  if (
    typeof message.reasoning ===
    "string"
  ) {
    return message.reasoning;
  }

  return "";
}

// ============================================================
// GROQ REQUEST
// ============================================================

async function callGroq(
  model,
  prompt,
  timeoutMs,
  rootSignal,
  deadline
) {
  if (!GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY missing"
    );
  }

  const available =
    remainingTime(
      deadline
    );

  if (
    available <= 100
  ) {
    throw new Error(
      "REQUEST_HARD_TIMEOUT"
    );
  }

  const allowedTimeout =
    Math.max(
      100,
      Math.min(
        timeoutMs,
        available - 100
      )
    );

  const response =
    await fetchWithTimeout(
      "https://api.groq.com/openai/v1/chat/completions",

      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${GROQ_API_KEY}`,

          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            model,

            messages: [
              {
                role: "system",

                content:
                  "You are CARMATCH AI. Research efficiently. Follow the requested JSON format exactly. Do not explain your reasoning."
              },

              {
                role: "user",
                content: prompt
              }
            ],

            temperature: 0.2,

            max_completion_tokens:
              3500,

            top_p: 1,

            stream: false,

            reasoning_effort:
              "low",

            tool_choice:
              "required",

            tools: [
              {
                type:
                  "browser_search"
              }
            ]
          })
      },

      allowedTimeout,
      rootSignal
    );

  const rawText =
    await readResponseBody(
      response
    );

  let data = null;

  try {
    data =
      rawText
        ? JSON.parse(
            rawText
          )
        : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const detail =
      data?.error?.message ||
      rawText.slice(
        0,
        700
      ) ||
      `HTTP ${response.status}`;

    throw new Error(
      `Groq ${response.status}: ${detail}`
    );
  }

  const content =
    extractAssistantContent(
      data
    );

  if (!content) {
    throw new Error(
      "Groq returned empty content"
    );
  }

  return content;
}

// ============================================================
// OPENROUTER REQUEST
// ============================================================

async function callOpenRouter(
  model,
  prompt,
  timeoutMs,
  rootSignal,
  deadline
) {
  if (!OPENROUTER_API_KEY) {
    throw new Error(
      "OPENROUTER_API_KEY missing"
    );
  }

  const available =
    remainingTime(
      deadline
    );

  if (
    available <= 100
  ) {
    throw new Error(
      "REQUEST_HARD_TIMEOUT"
    );
  }

  const allowedTimeout =
    Math.max(
      100,
      Math.min(
        timeoutMs,
        available - 100
      )
    );

  const response =
    await fetchWithTimeout(
      "https://openrouter.ai/api/v1/chat/completions",

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
                  "You are CARMATCH AI. Return only valid JSON. Keep the answer concise."
              },

              {
                role: "user",
                content: prompt
              }
            ],

            temperature: 0.1,

            max_tokens:
              3500,

            stream: false
          })
      },

      allowedTimeout,
      rootSignal
    );

  const rawText =
    await readResponseBody(
      response
    );

  let data = null;

  try {
    data =
      rawText
        ? JSON.parse(
            rawText
          )
        : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const detail =
      data?.error?.message ||
      rawText.slice(
        0,
        700
      ) ||
      `HTTP ${response.status}`;

    throw new Error(
      `OpenRouter ${model} ${response.status}: ${detail}`
    );
  }

  const content =
    extractAssistantContent(
      data
    );

  if (!content) {
    throw new Error(
      `OpenRouter ${model} returned empty content`
    );
  }

  return content;
}

// ============================================================
// AI PIPELINE
// ============================================================

async function runAIResearch(
  naturalLanguage,
  filters,
  rootController,
  deadline
) {
  const rootSignal =
    rootController.signal;

  const researchPrompt =
    buildResearchPrompt(
      naturalLanguage,
      filters
    );

  const errors = [];

  // ----------------------------------------------------------
  // 1. GROQ 120B
  // ----------------------------------------------------------

  try {
    const output =
      await callGroq(
        GROQ_PRIMARY_MODEL,
        researchPrompt,
        GROQ_PRIMARY_TIMEOUT,
        rootSignal,
        deadline
      );

    const parsed =
      extractJsonObject(
        output
      );

    if (
      parsed &&
      Array.isArray(
        parsed.cars
      )
    ) {
      return {
        data: parsed,
        provider:
          "groq-120b"
      };
    }

    // --------------------------------------------------------
    // GROQ 20B REPAIR
    // --------------------------------------------------------

    try {
      const repairedOutput =
        await callGroq(
          GROQ_FALLBACK_MODEL,

          buildRepairPrompt(
            output,
            naturalLanguage,
            filters
          ),

          GROQ_FALLBACK_TIMEOUT,
          rootSignal,
          deadline
        );

      const repaired =
        extractJsonObject(
          repairedOutput
        );

      if (
        repaired &&
        Array.isArray(
          repaired.cars
        )
      ) {
        return {
          data:
            repaired,

          provider:
            "groq-20b-repair"
        };
      }

      errors.push(
        "Groq 20B repair returned invalid JSON"
      );
    } catch (repairError) {
      errors.push(
        `Groq repair: ${getErrorMessage(
          repairError
        )}`
      );
    }

  } catch (error) {
    errors.push(
      `Groq 120B: ${getErrorMessage(
        error
      )}`
    );
  }

  // ----------------------------------------------------------
  // 2. GROQ 20B
  // ----------------------------------------------------------

  try {
    const output =
      await callGroq(
        GROQ_FALLBACK_MODEL,
        researchPrompt,
        GROQ_FALLBACK_TIMEOUT,
        rootSignal,
        deadline
      );

    const parsed =
      extractJsonObject(
        output
      );

    if (
      parsed &&
      Array.isArray(
        parsed.cars
      )
    ) {
      return {
        data:
          parsed,

        provider:
          "groq-20b"
      };
    }

    errors.push(
      "Groq 20B returned invalid JSON"
    );

  } catch (error) {
    errors.push(
      `Groq 20B: ${getErrorMessage(
        error
      )}`
    );
  }

  // ----------------------------------------------------------
  // 3. OPENROUTER FREE - PARALLEL
  // ----------------------------------------------------------

  const openRouterTasks =
    OPENROUTER_MODELS.map(
      async model => {
        try {
          const output =
            await callOpenRouter(
              model,
              researchPrompt,
              OPENROUTER_TIMEOUT,
              rootSignal,
              deadline
            );

          const parsed =
            extractJsonObject(
              output
            );

          if (
            !parsed ||
            !Array.isArray(
              parsed.cars
            )
          ) {
            throw new Error(
              "Invalid JSON"
            );
          }

          return {
            data:
              parsed,

            provider:
              `openrouter:${model}`
          };

        } catch (error) {
          throw new Error(
            `${model}: ${getErrorMessage(
              error
            )}`
          );
        }
      }
    );

  try {
    return await Promise.any(
      openRouterTasks
    );

  } catch (
    aggregateError
  ) {
    const reasons =
      aggregateError?.errors ||
      [];

    for (
      const reason
      of reasons
    ) {
      errors.push(
        getErrorMessage(
          reason
        )
      );
    }
  }

  throw new Error(
    `All AI providers failed: ${errors.join(
      " | "
    )}`
  );
}

// ============================================================
// CAR NORMALIZATION
// ============================================================

function mechanicalHpFromKw(
  kw
) {
  if (
    !Number.isFinite(
      kw
    )
  ) {
    return null;
  }

  return Math.round(
    kw * 1.34102209
  );
}

function normalizeProsCons(
  value
) {
  return safeArray(value)
    .map(item =>
      normalizeWhitespace(
        item
      )
    )
    .filter(Boolean)
    .slice(
      0,
      5
    );
}

function normalizeCar(
  car
) {
  const source =
    safeObject(car);

  const powerKw =
    toNumber(
      source.powerKw ??
      source.kw ??
      source.power
    );

  let powerHpMechanical =
    toNumber(
      source.powerHpMechanical ??
      source.mechanicalHp ??
      source.hp
    );

  if (
    powerHpMechanical === null &&
    powerKw !== null
  ) {
    powerHpMechanical =
      mechanicalHpFromKw(
        powerKw
      );
  }

  let modelYear =
    toInteger(
      source.modelYear
    );

  if (
    modelYear !== null &&
    (
      modelYear < 1990 ||
      modelYear > 2035
    )
  ) {
    modelYear = null;
  }

  return {
    brand:
      normalizeWhitespace(
        source.brand
      ),

    model:
      normalizeWhitespace(
        source.model
      ),

    generation:
      normalizeWhitespace(
        source.generation
      ),

    modelYear,

    price:
      normalizeWhitespace(
        source.price
      ),

    currency:
      normalizeWhitespace(
        source.currency
      ),

    powerKw,

    powerHpMechanical,

    fuel:
      normalizeWhitespace(
        source.fuel
      ),

    drivetrain:
      normalizeWhitespace(
        source.drivetrain
      ),

    body:
      normalizeWhitespace(
        source.body
      ),

    seats:
      toInteger(
        source.seats
      ),

    trunkLitres:
      toInteger(
        source.trunkLitres ??
        source.trunk
      ),

    lengthMm:
      toInteger(
        source.lengthMm ??
        source.length
      ),

    officialSourceUrl:
      safeHttpsUrl(
        source.officialSourceUrl
      ),

    officialPriceUrl:
      safeHttpsUrl(
        source.officialPriceUrl
      ),

    officialConfiguratorUrl:
      safeHttpsUrl(
        source.officialConfiguratorUrl
      ),

    description:
      normalizeWhitespace(
        source.description
      ),

    pros:
      normalizeProsCons(
        source.pros
      ),

    cons:
      normalizeProsCons(
        source.cons
      ),

    maintenance:
      normalizeWhitespace(
        source.maintenance
      ),

    imageSearchName:
      normalizeWhitespace(
        source.imageSearchName ||
        `${source.brand || ""} ${source.model || ""} ${source.generation || ""}`
      )
  };
}

// ============================================================
// IMAGE FILTER
// ============================================================

const REJECT_IMAGE_WORDS = [
  "logo",
  "logos",
  "icon",
  "icons",
  "interior",
  "dashboard",
  "steering",
  "wheel rim",
  "rim",
  "engine",
  "engine bay",
  "concept",
  "prototype",
  "sketch",
  "drawing",
  "render",
  "rendering",
  "truck",
  "bus",
  "motorcycle",
  "bike",
  "van interior"
];

function isBadImageText(
  value
) {
  const text =
    String(
      value || ""
    ).toLowerCase();

  return REJECT_IMAGE_WORDS.some(
    word =>
      text.includes(word)
  );
}

// ============================================================
// WIKIMEDIA
// ============================================================

async function searchWikimedia(
  query,
  rootSignal,
  deadline
) {
  if (
    !query ||
    isBadImageText(
      query
    )
  ) {
    return [];
  }

  const url =
    "https://commons.wikimedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch:
        `${query} car`,
      gsrnamespace: "6",
      gsrlimit:
        String(
          MAX_IMAGE_CANDIDATES
        ),
      prop: "imageinfo",
      iiprop:
        "url|mime|size",
      iiurlwidth:
        "1000",
      format: "json",
      origin: "*"
    }).toString();

  try {
    const available =
      remainingTime(
        deadline
      );

    if (
      available <= 100
    ) {
      return [];
    }

    const response =
      await fetchWithTimeout(
        url,

        {
          headers: {
            Accept:
              "application/json"
          }
        },

        Math.max(
          100,
          Math.min(
            WIKIMEDIA_TIMEOUT,
            available - 100
          )
        ),

        rootSignal
      );

    if (!response.ok) {
      return [];
    }

    const rawText =
      await readResponseBody(
        response
      );

    const data =
      rawText
        ? JSON.parse(
            rawText
          )
        : null;

    const pages =
      data?.query?.pages ||
      {};

    const result = [];

    for (
      const page
      of Object.values(
        pages
      )
    ) {
      const title =
        cleanText(
          page?.title
        );

      if (
        isBadImageText(
          title
        )
      ) {
        continue;
      }

      const info =
        page?.imageinfo?.[0];

      if (!info) {
        continue;
      }

      const mime =
        String(
          info.mime || ""
        );

      if (
        !mime.startsWith(
          "image/"
        )
      ) {
        continue;
      }

      const width =
        toInteger(
          info.width
        );

      const height =
        toInteger(
          info.height
        );

      if (
        width !== null &&
        height !== null &&
        (
          width < 500 ||
          height < 300
        )
      ) {
        continue;
      }

      const thumbnail =
        safeHttpsUrl(
          info.thumburl ||
          info.url
        );

      const original =
        safeHttpsUrl(
          info.url
        );

      if (
        !thumbnail &&
        !original
      ) {
        continue;
      }

      result.push({
        url:
          thumbnail ||
          original,

        originalUrl:
          original ||
          thumbnail,

        source:
          "Wikimedia Commons",

        title
      });
    }

    return result.slice(
      0,
      MAX_IMAGE_CANDIDATES
    );

  } catch {
    return [];
  }
}

// ============================================================
// WIKIPEDIA
// ============================================================

async function searchWikipedia(
  query,
  rootSignal,
  deadline
) {
  if (
    !query ||
    isBadImageText(
      query
    )
  ) {
    return [];
  }

  const url =
    "https://en.wikipedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch:
        query,
      gsrlimit:
        "5",
      prop:
        "pageimages",
      piprop:
        "original",
      pithumbsize:
        "1000",
      format:
        "json",
      origin:
        "*"
    }).toString();

  try {
    const available =
      remainingTime(
        deadline
      );

    if (
      available <= 100
    ) {
      return [];
    }

    const response =
      await fetchWithTimeout(
        url,

        {
          headers: {
            Accept:
              "application/json"
          }
        },

        Math.max(
          100,
          Math.min(
            WIKIPEDIA_TIMEOUT,
            available - 100
          )
        ),

        rootSignal
      );

    if (!response.ok) {
      return [];
    }

    const rawText =
      await readResponseBody(
        response
      );

    const data =
      rawText
        ? JSON.parse(
            rawText
          )
        : null;

    const pages =
      data?.query?.pages ||
      {};

    const result = [];

    for (
      const page
      of Object.values(
        pages
      )
    ) {
      const title =
        cleanText(
          page?.title
        );

      if (
        isBadImageText(
          title
        )
      ) {
        continue;
      }

      const imageUrl =
        safeHttpsUrl(
          page?.original?.source
        );

      if (!imageUrl) {
        continue;
      }

      result.push({
        url:
          imageUrl,

        originalUrl:
          imageUrl,

        source:
          "Wikipedia",

        title
      });
    }

    return result;

  } catch {
    return [];
  }
}

// ============================================================
// IMAGE ENGINE
// ============================================================

async function findCarImages(
  car,
  rootSignal,
  deadline
) {
  const query =
    normalizeWhitespace(
      car.imageSearchName ||
      `${car.brand} ${car.model} ${car.generation}`
    );

  if (
    !query ||
    isBadImageText(
      query
    )
  ) {
    return [];
  }

  const [
    wikimedia,
    wikipedia
  ] =
    await Promise.all([
      searchWikimedia(
        query,
        rootSignal,
        deadline
      ),

      searchWikipedia(
        query,
        rootSignal,
        deadline
      )
    ]);

  const combined = [
    ...wikimedia,
    ...wikipedia
  ];

  const seen =
    new Set();

  const unique = [];

  for (
    const item
    of combined
  ) {
    const url =
      safeHttpsUrl(
        item?.url
      );

    if (
      !url ||
      seen.has(url)
    ) {
      continue;
    }

    seen.add(url);

    unique.push({
      url,

      originalUrl:
        safeHttpsUrl(
          item?.originalUrl
        ) || url,

      source:
        cleanText(
          item?.source
        ),

      title:
        cleanText(
          item?.title
        )
    });
  }

  return unique.slice(
    0,
    MAX_IMAGE_CANDIDATES
  );
}

// ============================================================
// OFFICIAL URL VERIFICATION
// ============================================================

async function verifyUrl(
  candidate,
  rootSignal,
  deadline
) {
  const url =
    safeHttpsUrl(
      candidate
    );

  if (!url) {
    return null;
  }

  try {
    let available =
      remainingTime(
        deadline
      );

    if (
      available <= 100
    ) {
      return null;
    }

    let response =
      await fetchWithTimeout(
        url,

        {
          method:
            "HEAD",

          redirect:
            "follow"
        },

        Math.max(
          100,
          Math.min(
            OFFICIAL_PAGE_TIMEOUT,
            available - 100
          )
        ),

        rootSignal
      );

    if (
      response.ok ||
      response.status === 401 ||
      response.status === 403 ||
      response.status === 405
    ) {
      return url;
    }

    available =
      remainingTime(
        deadline
      );

    if (
      available <= 100
    ) {
      return null;
    }

    response =
      await fetchWithTimeout(
        url,

        {
          method:
            "GET",

          redirect:
            "follow",

          headers: {
            Range:
              "bytes=0-3000"
          }
        },

        Math.max(
          100,
          Math.min(
            OFFICIAL_PAGE_TIMEOUT,
            available - 100
          )
        ),

        rootSignal
      );

    if (
      response.ok ||
      response.status === 206
    ) {
      return url;
    }

    return null;

  } catch {
    return null;
  }
}

async function verifyCarOfficialUrls(
  car,
  rootSignal,
  deadline
) {
  const entries = [
    [
      "officialSourceUrl",
      car.officialSourceUrl
    ],

    [
      "officialPriceUrl",
      car.officialPriceUrl
    ],

    [
      "officialConfiguratorUrl",
      car.officialConfiguratorUrl
    ]
  ];

  const verified =
    await Promise.all(
      entries.map(
        async ([key, url]) => [
          key,

          await verifyUrl(
            url,
            rootSignal,
            deadline
          )
        ]
      )
    );

  const result = {};

  for (
    const [
      key,
      value
    ] of verified
  ) {
    result[key] =
      value;
  }

  return result;
}

// ============================================================
// PRICE NORMALIZATION
// ============================================================

function normalizePrice(
  car
) {
  const priceText =
    normalizeWhitespace(
      car.price
    );

  const verifiedUrl =
    safeHttpsUrl(
      car.officialPriceUrl
    );

  if (!priceText) {
    return {
      price:
        verifiedUrl
          ? "Cena na vyžiadanie"
          : "Cena nie je dostupná",

      currency:
        car.currency || ""
    };
  }

  const lowered =
    priceText.toLowerCase();

  if (
    lowered.includes(
      "na vyžiadanie"
    ) ||
    lowered.includes(
      "na vyziadanie"
    )
  ) {
    return {
      price:
        "Cena na vyžiadanie",

      currency:
        car.currency || ""
    };
  }

  if (
    lowered.includes(
      "nie je dostupná"
    ) ||
    lowered.includes(
      "nie je dostupna"
    )
  ) {
    return {
      price:
        "Cena nie je dostupná",

      currency:
        car.currency || ""
    };
  }

  return {
    price:
      priceText,

    currency:
      car.currency || ""
  };
}

// ============================================================
// VALIDATION
// ============================================================

function hasUsableCar(
  car
) {
  return Boolean(
    car &&
    car.brand &&
    car.model
  );
}

function deduplicateCars(
  cars
) {
  const seen =
    new Set();

  const result = [];

  for (
    const car
    of cars
  ) {
    const key =
      `${car.brand}|${car.model}|${car.generation}`
        .toLowerCase();

    if (
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);

    result.push(
      car
    );
  }

  return result;
}

// ============================================================
// FINAL CAR
// ============================================================

function buildFinalCar(
  car,
  imageData,
  verifiedUrls
) {
  const normalizedPrice =
    normalizePrice(
      car
    );

  let powerHpMechanical =
    car.powerHpMechanical;

  if (
    powerHpMechanical === null &&
    car.powerKw !== null
  ) {
    powerHpMechanical =
      mechanicalHpFromKw(
        car.powerKw
      );
  }

  return {
    brand:
      car.brand,

    model:
      car.model,

    generation:
      car.generation,

    modelYear:
      car.modelYear,

    price:
      normalizedPrice.price,

    currency:
      normalizedPrice.currency,

    powerKw:
      car.powerKw,

    powerHpMechanical,

    fuel:
      car.fuel,

    drivetrain:
      car.drivetrain,

    body:
      car.body,

    seats:
      car.seats,

    trunkLitres:
      car.trunkLitres,

    lengthMm:
      car.lengthMm,

    officialSourceUrl:
      verifiedUrls
        .officialSourceUrl,

    officialPriceUrl:
      verifiedUrls
        .officialPriceUrl,

    officialConfiguratorUrl:
      verifiedUrls
        .officialConfiguratorUrl,

    description:
      car.description,

    pros:
      car.pros,

    cons:
      car.cons,

    maintenance:
      car.maintenance,

    images:
      safeArray(
        imageData
      )
        .slice(
          0,
          MAX_IMAGE_CANDIDATES
        )
        .map(
          item => ({
            url:
              safeHttpsUrl(
                item?.url
              ),

            originalUrl:
              safeHttpsUrl(
                item?.originalUrl
              ),

            source:
              cleanText(
                item?.source
              ),

            title:
              cleanText(
                item?.title
              )
          })
        )
        .filter(
          item =>
            Boolean(
              item.url
            )
        )
  };
}

// ============================================================
// SUPABASE AUTHENTICATION
// ============================================================

function extractBearerToken(
  req
) {
  const auth =
    req.headers?.authorization ||
    req.headers?.Authorization ||
    "";

  if (
    typeof auth !== "string" ||
    !auth.startsWith(
      "Bearer "
    )
  ) {
    return null;
  }

  return (
    auth
      .slice(7)
      .trim() ||
    null
  );
}

async function verifySupabaseUser(
  accessToken,
  rootSignal,
  deadline
) {
  // ----------------------------------------------------------
  // TOKEN CHECK
  // ----------------------------------------------------------

  if (!accessToken) {
    throw new Error(
      "SUPABASE_AUTH: Missing Bearer access token"
    );
  }

  // ----------------------------------------------------------
  // CONFIG CHECK
  // ----------------------------------------------------------

  if (!SUPABASE_URL) {
    throw new Error(
      "SUPABASE_AUTH: SUPABASE_URL is missing"
    );
  }

  if (!SUPABASE_ANON_KEY) {
    throw new Error(
      "SUPABASE_AUTH: SUPABASE_ANON_KEY is missing"
    );
  }

  // ----------------------------------------------------------
  // SUPABASE USER ENDPOINT
  // ----------------------------------------------------------

  const endpoint =
    `${SUPABASE_URL}/auth/v1/user`;

  const available =
    remainingTime(
      deadline
    );

  if (
    available <= 100
  ) {
    throw new Error(
      "SUPABASE_AUTH: REQUEST_HARD_TIMEOUT"
    );
  }

  const response =
    await fetchWithTimeout(
      endpoint,

      {
        method:
          "GET",

        headers: {
          apikey:
            SUPABASE_ANON_KEY,

          Authorization:
            `Bearer ${accessToken}`,

          Accept:
            "application/json"
        }
      },

      Math.max(
        100,
        Math.min(
          SUPABASE_TIMEOUT,
          available - 100
        )
      ),

      rootSignal
    );

  const body =
    await readResponseBody(
      response
    );

  let data = null;

  try {
    data =
      body
        ? JSON.parse(
            body
          )
        : null;
  } catch {
    data = null;
  }

  // ----------------------------------------------------------
  // SUPABASE ERROR
  // ----------------------------------------------------------

  if (!response.ok) {
    const supabaseMessage =
      data?.msg ||
      data?.message ||
      data?.error_description ||
      data?.error ||
      body ||
      `HTTP ${response.status}`;

    console.error(
      "SUPABASE AUTH HTTP ERROR:",
      response.status,
      supabaseMessage
    );

    throw new Error(
      `SUPABASE_AUTH: HTTP ${response.status}: ${String(
        supabaseMessage
      ).slice(0, 500)}`
    );
  }

  // ----------------------------------------------------------
  // USER CHECK
  // ----------------------------------------------------------

  if (!data?.id) {
    console.error(
      "SUPABASE AUTH INVALID USER RESPONSE:",
      data
    );

    throw new Error(
      "SUPABASE_AUTH: Supabase returned no user ID"
    );
  }

  return data;
}

// ============================================================
// MAIN HANDLER
// ============================================================

export default async function handler(
  req,
  res
) {
  cors(res);

  // ----------------------------------------------------------
  // OPTIONS
  // ----------------------------------------------------------

  if (
    req.method ===
    "OPTIONS"
  ) {
    return res
      .status(204)
      .end();
  }

  // ----------------------------------------------------------
  // ONLY POST
  // ----------------------------------------------------------

  if (
    req.method !==
    "POST"
  ) {
    return json(
      res,
      405,
      {
        ok: false,

        error:
          "Method not allowed"
      }
    );
  }

  // ----------------------------------------------------------
  // HARD DEADLINE
  // ----------------------------------------------------------

  const hardTimeout =
    createDeadlineController(
      REQUEST_HARD_TIMEOUT
    );

  const rootController =
    hardTimeout.controller;

  const rootSignal =
    rootController.signal;

  const hardDeadline =
    hardTimeout.deadline;

  let user = null;

  try {
    // ========================================================
    // SUPABASE AUTH
    // ========================================================

    const accessToken =
      extractBearerToken(
        req
      );

    user =
      await verifySupabaseUser(
        accessToken,
        rootSignal,
        hardDeadline
      );

    // ========================================================
    // BODY
    // ========================================================

    let body;

    try {
      body =
        parseRequestBody(
          req
        );
    } catch (error) {
      console.error(
        "CARMATCH AI BODY ERROR:",
        getErrorMessage(
          error
        )
      );

      return json(
        res,
        400,
        {
          ok: false,

          error:
            "Neplatné údaje požiadavky."
        }
      );
    }

    // ========================================================
    // REQUEST
    // ========================================================

    const naturalLanguage =
      extractNaturalLanguage(
        body
      );

    const filters =
      extractFilters(
        body
      );

    const hasAnyFilter =
      Object.values(
        filters
      ).some(
        Boolean
      );

    if (
      !naturalLanguage &&
      !hasAnyFilter
    ) {
      return json(
        res,
        400,
        {
          ok: false,

          error:
            "Zadajte požiadavku alebo aspoň jeden filter."
        }
      );
    }

    // ========================================================
    // TEST MODE
    // ========================================================
    //
    // Search limit is currently disabled.
    // No RPC.
    // No search consumption.
    // No refund.
    // ========================================================

    const remaining = 5;

    // ========================================================
    // AI
    // ========================================================

    const aiResult =
      await runAIResearch(
        naturalLanguage,
        filters,
        rootController,
        hardDeadline
      );

    // ========================================================
    // NORMALIZE CARS
    // ========================================================

    let cars =
      safeArray(
        aiResult?.data?.cars
      )
        .map(
          normalizeCar
        )
        .filter(
          hasUsableCar
        );

    cars =
      deduplicateCars(
        cars
      ).slice(
        0,
        MAX_OUTPUT_CARS
      );

    // ========================================================
    // EXACTLY 3
    // ========================================================

    if (
      cars.length !== 3
    ) {
      throw new Error(
        `AI returned ${cars.length} usable cars instead of exactly 3`
      );
    }

    // ========================================================
    // PARALLEL ENRICHMENT
    // ========================================================

    const enriched =
      await Promise.all(
        cars.map(
          async car => {
            const [
              imageData,
              verifiedUrls
            ] =
              await Promise.all([
                findCarImages(
                  car,
                  rootSignal,
                  hardDeadline
                ),

                verifyCarOfficialUrls(
                  car,
                  rootSignal,
                  hardDeadline
                )
              ]);

            return buildFinalCar(
              car,
              imageData,
              verifiedUrls
            );
          }
        )
      );

    // ========================================================
    // SUCCESS
    // ========================================================

    return json(
      res,
      200,
      {
        ok: true,

        testMode: true,

        limitEnabled:
          SEARCH_LIMIT_ENABLED,

        remaining,

        userId:
          user.id,

        provider:
          aiResult.provider,

        cars:
          enriched
      }
    );

  } catch (error) {
    const message =
      getErrorMessage(
        error
      );

    console.error(
      "CARMATCH AI ERROR:",
      message
    );

    const lower =
      message.toLowerCase();

    const timeout =
      message.includes(
        "TIMEOUT"
      ) ||
      lower.includes(
        "timed out"
      ) ||
      lower.includes(
        "aborted"
      ) ||
      lower.includes(
        "abort"
      );

    // --------------------------------------------------------
    // AUTH ERROR
    // --------------------------------------------------------

    if (
      message.startsWith(
        "SUPABASE_AUTH:"
      )
    ) {
      return json(
        res,
        401,
        {
          ok: false,

          error:
            "Supabase authentication failed.",

          detail:
            message,

          authError:
            true,

          refunded:
            false,

          limitEnabled:
            SEARCH_LIMIT_ENABLED
        }
      );
    }

    // --------------------------------------------------------
    // GENERAL ERROR
    // --------------------------------------------------------

    return json(
      res,

      timeout
        ? 504
        : 500,

      {
        ok: false,

        error:
          timeout
            ? "Server sa nepodarilo dokončiť vyhľadávanie v časovom limite."
            : "Vyhľadávanie sa nepodarilo dokončiť.",

        detail:
          message,

        refunded:
          false,

        limitEnabled:
          SEARCH_LIMIT_ENABLED
      }
    );

  } finally {
    hardTimeout.clear();
  }
}