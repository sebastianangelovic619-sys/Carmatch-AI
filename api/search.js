// ============================================================
// CARMATCH AI - PRODUCTION BACKEND v13 TEST
// ============================================================
//
// TEST MODE
// - 5 searches/day LIMIT TEMPORARILY DISABLED
// - Supabase authentication remains enabled
// - No search is consumed
// - No search refund is needed because nothing is consumed
//
// AI
// - Groq GPT-OSS 120B + Browser Search
// - Groq GPT-OSS 20B + Browser Search fallback
// - OpenRouter FREE fallbacks
//
// SAFETY / PERFORMANCE
// - Hard request deadline
// - Per-request timeouts
// - Parallel OpenRouter fallbacks
// - Parallel image lookup
// - Parallel official URL verification
// - Exactly 3 cars
// - kW + mechanical HP
// - No invented price/URL
// - SSRF protection
// ============================================================

const SEARCH_LIMIT_ENABLED = false;

// ============================================================
// CONFIG
// ============================================================

const REQUEST_HARD_TIMEOUT = 110000;

const SUPABASE_TIMEOUT = 7000;

const GROQ_PRIMARY_TIMEOUT = 32000;
const GROQ_FALLBACK_TIMEOUT = 22000;

const OPENROUTER_TIMEOUT = 19000;

const OFFICIAL_PAGE_TIMEOUT = 4500;

const WIKIMEDIA_TIMEOUT = 4500;
const WIKIPEDIA_TIMEOUT = 4500;

const RESPONSE_BODY_TIMEOUT = 5000;

const MAX_IMAGE_CANDIDATES = 8;

const MAX_OUTPUT_CARS = 3;

const MAX_TEXT_LENGTH = 16000;

// ============================================================
// ENVIRONMENT
// ============================================================

const GROQ_API_KEY =
  process.env.GROQ_API_KEY ||
  "";

const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY ||
  "";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://ltqjgvrphjinsjvyaxrb.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_Tl9JJu6B_A1tQ_si2Wb25Q_f8A3e5uw";

// ============================================================
// CURRENT AI MODELS
// ============================================================

const GROQ_PRIMARY_MODEL =
  "openai/gpt-oss-120b";

const GROQ_FALLBACK_MODEL =
  "openai/gpt-oss-20b";

// Current free OpenRouter models / router
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
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.end(JSON.stringify(payload));
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function now() {
  return Date.now();
}

function remainingTime(deadline) {
  return Math.max(100, deadline - now());
}

function cleanText(value, max = MAX_TEXT_LENGTH) {
  if (value === null || value === undefined) return "";

  const text = String(value)
    .replace(/\u0000/g, "")
    .trim();

  return text.slice(0, max);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function normalizeWhitespace(value) {
  return cleanText(value).replace(/\s+/g, " ").trim();
}

// ============================================================
// NUMBER HELPERS
// ============================================================

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");

  const result = Number(cleaned);

  return Number.isFinite(result) ? result : null;
}

function toInteger(value) {
  const n = toNumber(value);

  if (n === null) return null;

  return Math.round(n);
}

// ============================================================
// TIMEOUT / ABORT HELPERS
// ============================================================

function createDeadlineController(ms) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    try {
      controller.abort(new Error("REQUEST_HARD_TIMEOUT"));
    } catch {
      controller.abort();
    }
  }, ms);

  return {
    controller,
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
  const controller = new AbortController();

  const timer = setTimeout(() => {
    try {
      controller.abort(new Error("REQUEST_TIMEOUT"));
    } catch {
      controller.abort();
    }
  }, timeoutMs);

  let abortListener = null;

  try {
    if (rootSignal) {
      if (rootSignal.aborted) {
        controller.abort();
      } else {
        abortListener = () => {
          try {
            controller.abort();
          } catch {}
        };

        rootSignal.addEventListener("abort", abortListener, {
          once: true
        });
      }
    }

    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);

    if (rootSignal && abortListener) {
      rootSignal.removeEventListener("abort", abortListener);
    }
  }
}

async function readResponseBody(response) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    try {
      controller.abort();
    } catch {}
  }, RESPONSE_BODY_TIMEOUT);

  try {
    const text = await response.text();

    return text;
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================
// URL SAFETY
// ============================================================

function safeHttpsUrl(value) {
  if (!value) return null;

  try {
    const url = new URL(String(value).trim());

    if (url.protocol !== "https:") {
      return null;
    }

    if (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "0.0.0.0"
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

function isProbablyHttpUrl(value) {
  return Boolean(safeHttpsUrl(value));
}

// ============================================================
// ERROR HELPERS
// ============================================================

function getErrorMessage(error) {
  if (!error) return "Unknown error";

  if (typeof error === "string") {
    return error.slice(0, 500);
  }

  if (error.message) {
    return String(error.message).slice(0, 500);
  }

  return "Unknown error";
}

// ============================================================
// REQUEST PARSING
// ============================================================

function extractNaturalLanguage(body) {
  const candidates = [
    body?.aiRequest,
    body?.naturalLanguage,
    body?.query,
    body?.request,
    body?.prompt,
    body?.text
  ];

  for (const candidate of candidates) {
    const text = normalizeWhitespace(candidate);

    if (text) {
      return text;
    }
  }

  return "";
}

function extractFilters(body) {
  const source =
    safeObject(body?.filters).length
      ? body.filters
      : safeObject(body);

  return {
    budget: cleanText(source.budget),
    seats: cleanText(source.seats),
    power: cleanText(source.power),
    trunk: cleanText(source.trunk),
    drive: cleanText(source.drive),
    fuel: cleanText(source.fuel),
    body: cleanText(source.body),
    style: cleanText(source.style),
    length: cleanText(source.length),
    year: cleanText(source.year),
    avoid: cleanText(source.avoid)
  };
}

// ============================================================
// PROMPT BUILDING
// ============================================================

function buildResearchPrompt(naturalLanguage, filters) {
  const filterLines = Object.entries(filters)
    .filter(([, value]) => value)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n");

  return `
You are CARMATCH AI, an automotive research assistant.

The user wants exactly 3 real cars that best match the request.

USER REQUEST:
${naturalLanguage || "(none)"}

FILTERS:
${filterLines || "(none)"}

IMPORTANT RESEARCH RULES:
1. Recommend REAL production vehicles.
2. Prefer the newest/current generation available.
3. Consider the user's country/European market when relevant.
4. Use web research whenever available.
5. Do not invent prices.
6. Do not invent URLs.
7. If an exact current official price cannot be verified, use:
   "Cena na vyžiadanie"
8. If no reliable price is available, use:
   "Cena nie je dostupná"
9. Use official manufacturer pages when possible.
10. Give power in kW and mechanical horsepower.
11. Do not use PS as "mechanical hp".
12. Keep descriptions in Slovak.
13. Return exactly 3 vehicles.
14. Do not return concepts unless the user explicitly asks for concepts.
15. Do not return trucks, buses, motorcycles or unrelated vehicles.

For each car return:
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

IMAGE RULE:
Do NOT invent image URLs.
The backend will find images separately.

URL RULE:
Only include real HTTPS URLs found during research.
Use null when unavailable.

Return ONLY valid JSON.
No markdown.
No explanation outside JSON.

Expected structure:

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

function buildRepairPrompt(originalOutput, naturalLanguage, filters) {
  const filterLines = Object.entries(filters)
    .filter(([, value]) => value)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n");

  return `
Repair and convert the following automotive research into valid JSON.

USER REQUEST:
${naturalLanguage}

FILTERS:
${filterLines || "(none)"}

ORIGINAL AI OUTPUT:
${cleanText(originalOutput, 30000)}

Requirements:
- exactly 3 real production cars
- Slovak language
- no invented prices
- no invented URLs
- null when uncertain
- powerKw numeric
- powerHpMechanical numeric
- no image URLs
- output JSON only

Use this exact structure:

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
// JSON EXTRACTION
// ============================================================

function stripCodeFence(text) {
  return String(text || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractJsonObject(text) {
  if (!text) return null;

  const cleaned = stripCodeFence(text);

  try {
    return JSON.parse(cleaned);
  } catch {}

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = cleaned.slice(firstBrace, lastBrace + 1);

    try {
      return JSON.parse(candidate);
    } catch {}
  }

  return null;
}

// ============================================================
// OPENAI-COMPATIBLE RESPONSE EXTRACTION
// ============================================================

function extractAssistantContent(data) {
  if (!data) return "";

  const choice = data?.choices?.[0];

  if (!choice) return "";

  const content = choice?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map(item => {
        if (typeof item === "string") return item;
        if (item?.text) return item.text;
        return "";
      })
      .join("\n");
  }

  return "";
}

// ============================================================
// GROQ CALL
// ============================================================

async function callGroq(
  model,
  prompt,
  timeoutMs,
  rootSignal
) {
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY missing");
  }

  const response = await fetchWithTimeout(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are a precise automotive research assistant. Follow the requested JSON format exactly."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.1,
        max_completion_tokens: 5000,
        top_p: 1,
        stream: false,

        // Groq Browser Search.
        // No response_format is used because Browser Search
        // is incompatible with structured outputs.
        tools: [
          {
            type: "browser_search"
          }
        ],
        tool_choice: "required"
      }
    },
    Math.min(timeoutMs, Math.max(100, remainingTime(
      rootSignal.__deadline
    ) - 100)),
    rootSignal
  );

  const rawText = await readResponseBody(response);

  let data = null;

  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const detail =
      data?.error?.message ||
      rawText.slice(0, 700) ||
      `HTTP ${response.status}`;

    throw new Error(`Groq ${response.status}: ${detail}`);
  }

  const content = extractAssistantContent(data);

  if (!content) {
    throw new Error("Groq returned empty content");
  }

  return content;
}

// ============================================================
// OPENROUTER CALL
// ============================================================

async function callOpenRouter(
  model,
  prompt,
  timeoutMs,
  rootSignal
) {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY missing");
  }

  const response = await fetchWithTimeout(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://carmatchai.vercel.app",
        "X-Title": "CARMATCH AI"
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are CARMATCH AI. Return only the requested JSON."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 4500,
        stream: false
      })
    },
    Math.min(timeoutMs, Math.max(100, remainingTime(
      rootSignal.__deadline
    ) - 100)),
    rootSignal
  );

  const rawText = await readResponseBody(response);

  let data = null;

  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const detail =
      data?.error?.message ||
      rawText.slice(0, 700) ||
      `HTTP ${response.status}`;

    throw new Error(
      `OpenRouter ${model} ${response.status}: ${detail}`
    );
  }

  const content = extractAssistantContent(data);

  if (!content) {
    throw new Error(`OpenRouter ${model} returned empty content`);
  }

  return content;
}

// ============================================================
// AI RESEARCH PIPELINE
// ============================================================

async function runAIResearch(
  naturalLanguage,
  filters,
  rootController
) {
  const rootSignal = rootController.signal;

  rootSignal.__deadline =
    rootController.__deadline || (now() + REQUEST_HARD_TIMEOUT);

  const researchPrompt =
    buildResearchPrompt(naturalLanguage, filters);

  const errors = [];

  // ----------------------------------------------------------
  // 1. GROQ GPT-OSS 120B
  // ----------------------------------------------------------

  try {
    const output = await callGroq(
      GROQ_PRIMARY_MODEL,
      researchPrompt,
      GROQ_PRIMARY_TIMEOUT,
      rootSignal
    );

    const parsed = extractJsonObject(output);

    if (parsed) {
      return {
        data: parsed,
        provider: "groq-120b"
      };
    }

    // --------------------------------------------------------
    // Repair through Groq 20B if first response is not valid
    // --------------------------------------------------------

    try {
      const repairedOutput = await callGroq(
        GROQ_FALLBACK_MODEL,
        buildRepairPrompt(
          output,
          naturalLanguage,
          filters
        ),
        GROQ_FALLBACK_TIMEOUT,
        rootSignal
      );

      const repaired = extractJsonObject(repairedOutput);

      if (repaired) {
        return {
          data: repaired,
          provider: "groq-20b-repair"
        };
      }
    } catch (repairError) {
      errors.push(
        `Groq repair: ${getErrorMessage(repairError)}`
      );
    }

    errors.push("Groq 120B returned invalid JSON");
  } catch (error) {
    errors.push(
      `Groq 120B: ${getErrorMessage(error)}`
    );
  }

  // ----------------------------------------------------------
  // 2. GROQ GPT-OSS 20B FALLBACK
  // ----------------------------------------------------------

  try {
    const output = await callGroq(
      GROQ_FALLBACK_MODEL,
      researchPrompt,
      GROQ_FALLBACK_TIMEOUT,
      rootSignal
    );

    const parsed = extractJsonObject(output);

    if (parsed) {
      return {
        data: parsed,
        provider: "groq-20b"
      };
    }

    errors.push("Groq 20B returned invalid JSON");
  } catch (error) {
    errors.push(
      `Groq 20B: ${getErrorMessage(error)}`
    );
  }

  // ----------------------------------------------------------
  // 3. PARALLEL OPENROUTER FREE FALLBACK
  // ----------------------------------------------------------

  const openRouterTasks = OPENROUTER_MODELS.map(
    async model => {
      try {
        const output = await callOpenRouter(
          model,
          researchPrompt,
          OPENROUTER_TIMEOUT,
          rootSignal
        );

        const parsed = extractJsonObject(output);

        if (!parsed) {
          throw new Error("Invalid JSON");
        }

        return {
          data: parsed,
          provider: `openrouter:${model}`
        };
      } catch (error) {
        throw new Error(
          `${model}: ${getErrorMessage(error)}`
        );
      }
    }
  );

  try {
    return await Promise.any(openRouterTasks);
  } catch (aggregateError) {
    const reasons =
      aggregateError?.errors || [];

    for (const reason of reasons) {
      errors.push(getErrorMessage(reason));
    }
  }

  throw new Error(
    `All AI providers failed: ${errors.join(" | ")}`
  );
}

// ============================================================
// CAR NORMALIZATION
// ============================================================

function mechanicalHpFromKw(kw) {
  if (!Number.isFinite(kw)) return null;

  // Mechanical horsepower:
  // 1 kW ≈ 1.34102209 mechanical hp
  return Math.round(kw * 1.34102209);
}

function normalizeProsCons(value) {
  return safeArray(value)
    .map(item => normalizeWhitespace(item))
    .filter(Boolean)
    .slice(0, 5);
}

function normalizeCar(car) {
  const source = safeObject(car);

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
      mechanicalHpFromKw(powerKw);
  }

  const seats =
    toInteger(source.seats);

  const trunkLitres =
    toInteger(
      source.trunkLitres ??
      source.trunk
    );

  const lengthMm =
    toInteger(
      source.lengthMm ??
      source.length
    );

  let modelYear =
    toInteger(source.modelYear);

  if (modelYear !== null) {
    if (modelYear < 1990 || modelYear > 2035) {
      modelYear = null;
    }
  }

  const officialSourceUrl =
    safeHttpsUrl(
      source.officialSourceUrl
    );

  const officialPriceUrl =
    safeHttpsUrl(
      source.officialPriceUrl
    );

  const officialConfiguratorUrl =
    safeHttpsUrl(
      source.officialConfiguratorUrl
    );

  return {
    brand: normalizeWhitespace(source.brand),
    model: normalizeWhitespace(source.model),
    generation: normalizeWhitespace(source.generation),
    modelYear,
    price: normalizeWhitespace(source.price),
    currency: normalizeWhitespace(source.currency),
    powerKw,
    powerHpMechanical,
    fuel: normalizeWhitespace(source.fuel),
    drivetrain: normalizeWhitespace(source.drivetrain),
    body: normalizeWhitespace(source.body),
    seats,
    trunkLitres,
    lengthMm,
    officialSourceUrl,
    officialPriceUrl,
    officialConfiguratorUrl,
    description: normalizeWhitespace(source.description),
    pros: normalizeProsCons(source.pros),
    cons: normalizeProsCons(source.cons),
    maintenance: normalizeWhitespace(source.maintenance),
    imageSearchName:
      normalizeWhitespace(
        source.imageSearchName ||
        `${source.brand || ""} ${source.model || ""} ${source.generation || ""}`
      )
  };
}

// ============================================================
// INVALID / CONCEPT IMAGE TERMS
// ============================================================

const REJECT_IMAGE_WORDS = [
  "logo",
  "logos",
  "icon",
  "icons",
  "interior",
  "dashboard",
  "steering",
  "wheel",
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

function isBadImageText(value) {
  const text = String(value || "").toLowerCase();

  return REJECT_IMAGE_WORDS.some(word =>
    text.includes(word)
  );
}

// ============================================================
// WIKIMEDIA COMMONS IMAGE SEARCH
// ============================================================

async function searchWikimedia(
  query,
  rootSignal
) {
  if (!query || isBadImageText(query)) {
    return [];
  }

  const url =
    "https://commons.wikimedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: `${query} car`,
      gsrnamespace: "6",
      gsrlimit: String(MAX_IMAGE_CANDIDATES),
      prop: "imageinfo",
      iiprop: "url|mime|size",
      iiurlwidth: "1000",
      format: "json",
      origin: "*"
    }).toString();

  try {
    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          "Accept": "application/json"
        }
      },
      WIKIMEDIA_TIMEOUT,
      rootSignal
    );

    if (!response.ok) {
      return [];
    }

    const data =
      await response.json();

    const pages =
      data?.query?.pages || {};

    const result = [];

    for (const page of Object.values(pages)) {
      const title =
        cleanText(page?.title);

      if (isBadImageText(title)) {
        continue;
      }

      const info =
        page?.imageinfo?.[0];

      if (!info) continue;

      const mime =
        String(info.mime || "");

      if (!mime.startsWith("image/")) {
        continue;
      }

      const width =
        toInteger(info.width);

      const height =
        toInteger(info.height);

      if (
        width !== null &&
        height !== null &&
        (width < 500 || height < 300)
      ) {
        continue;
      }

      const thumbnail =
        safeHttpsUrl(
          info.thumburl || info.url
        );

      const original =
        safeHttpsUrl(info.url);

      if (!thumbnail && !original) {
        continue;
      }

      result.push({
        url: thumbnail || original,
        originalUrl: original || thumbnail,
        source: "Wikimedia Commons",
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
// WIKIPEDIA IMAGE FALLBACK
// ============================================================

async function searchWikipedia(
  query,
  rootSignal
) {
  if (!query || isBadImageText(query)) {
    return [];
  }

  const url =
    "https://en.wikipedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: query,
      gsrlimit: "5",
      prop: "pageimages",
      piprop: "original",
      pithumbsize: "1000",
      format: "json",
      origin: "*"
    }).toString();

  try {
    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          "Accept": "application/json"
        }
      },
      WIKIPEDIA_TIMEOUT,
      rootSignal
    );

    if (!response.ok) {
      return [];
    }

    const data =
      await response.json();

    const pages =
      data?.query?.pages || {};

    const result = [];

    for (const page of Object.values(pages)) {
      const title =
        cleanText(page?.title);

      if (isBadImageText(title)) {
        continue;
      }

      const image =
        page?.original;

      const imageUrl =
        safeHttpsUrl(
          image?.source
        );

      if (!imageUrl) {
        continue;
      }

      result.push({
        url: imageUrl,
        originalUrl: imageUrl,
        source: "Wikipedia",
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
  rootSignal
) {
  const query =
    normalizeWhitespace(
      car.imageSearchName ||
      `${car.brand} ${car.model} ${car.generation}`
    );

  if (!query) {
    return [];
  }

  const [wikimedia, wikipedia] =
    await Promise.all([
      searchWikimedia(query, rootSignal),
      searchWikipedia(query, rootSignal)
    ]);

  const combined = [
    ...wikimedia,
    ...wikipedia
  ];

  const seen = new Set();

  const unique = [];

  for (const item of combined) {
    const url =
      safeHttpsUrl(item?.url);

    if (!url) continue;

    if (seen.has(url)) {
      continue;
    }

    seen.add(url);

    unique.push({
      url,
      originalUrl:
        safeHttpsUrl(item?.originalUrl) ||
        url,
      source:
        cleanText(item?.source),
      title:
        cleanText(item?.title)
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
  rootSignal
) {
  const url =
    safeHttpsUrl(candidate);

  if (!url) {
    return null;
  }

  try {
    let response =
      await fetchWithTimeout(
        url,
        {
          method: "HEAD",
          redirect: "follow"
        },
        OFFICIAL_PAGE_TIMEOUT,
        rootSignal
      );

    if (
      response.ok ||
      response.status === 403 ||
      response.status === 401 ||
      response.status === 405
    ) {
      return url;
    }

    // Some sites do not support HEAD.
    response =
      await fetchWithTimeout(
        url,
        {
          method: "GET",
          redirect: "follow",
          headers: {
            Range: "bytes=0-3000"
          }
        },
        OFFICIAL_PAGE_TIMEOUT,
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
  rootSignal
) {
  const urls = {
    officialSourceUrl:
      car.officialSourceUrl,

    officialPriceUrl:
      car.officialPriceUrl,

    officialConfiguratorUrl:
      car.officialConfiguratorUrl
  };

  const entries =
    Object.entries(urls);

  const verified =
    await Promise.all(
      entries.map(
        async ([key, url]) => [
          key,
          await verifyUrl(
            url,
            rootSignal
          )
        ]
      )
    );

  const result = {};

  for (const [key, value] of verified) {
    result[key] = value;
  }

  return result;
}

// ============================================================
// PRICE NORMALIZATION
// ============================================================

function normalizePrice(car) {
  const priceText =
    normalizeWhitespace(car.price);

  const url =
    safeHttpsUrl(
      car.officialPriceUrl
    );

  // Never invent a numeric price.
  if (!priceText) {
    return {
      price: url
        ? "Cena na vyžiadanie"
        : "Cena nie je dostupná",
      currency: car.currency || ""
    };
  }

  const lowered =
    priceText.toLowerCase();

  if (
    lowered.includes("na vyžiadanie") ||
    lowered.includes("na vyziadanie")
  ) {
    return {
      price: "Cena na vyžiadanie",
      currency: car.currency || ""
    };
  }

  if (
    lowered.includes("nie je dostupná") ||
    lowered.includes("nie je dostupna")
  ) {
    return {
      price: "Cena nie je dostupná",
      currency: car.currency || ""
    };
  }

  return {
    price: priceText,
    currency: car.currency || ""
  };
}

// ============================================================
// FINAL CAR VALIDATION
// ============================================================

function hasUsableCar(car) {
  return Boolean(
    car &&
    car.brand &&
    car.model
  );
}

function deduplicateCars(cars) {
  const seen = new Set();

  const result = [];

  for (const car of cars) {
    const key =
      `${car.brand}|${car.model}|${car.generation}`
        .toLowerCase();

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    result.push(car);
  }

  return result;
}

// ============================================================
// FRONTEND-FRIENDLY FINAL RESULT
// ============================================================

function buildFinalCar(car, imageData, verifiedUrls) {
  const normalizedPrice =
    normalizePrice(car);

  let powerKw =
    car.powerKw;

  let powerHpMechanical =
    car.powerHpMechanical;

  if (
    powerKw !== null &&
    powerHpMechanical === null
  ) {
    powerHpMechanical =
      mechanicalHpFromKw(powerKw);
  }

  return {
    brand: car.brand,
    model: car.model,
    generation: car.generation,
    modelYear: car.modelYear,

    price:
      normalizedPrice.price,

    currency:
      normalizedPrice.currency,

    powerKw,
    powerHpMechanical,

    fuel: car.fuel,
    drivetrain: car.drivetrain,
    body: car.body,
    seats: car.seats,
    trunkLitres: car.trunkLitres,
    lengthMm: car.lengthMm,

    officialSourceUrl:
      verifiedUrls.officialSourceUrl,

    officialPriceUrl:
      verifiedUrls.officialPriceUrl,

    officialConfiguratorUrl:
      verifiedUrls.officialConfiguratorUrl,

    description:
      car.description,

    pros:
      car.pros,

    cons:
      car.cons,

    maintenance:
      car.maintenance,

    images:
      safeArray(imageData)
        .slice(0, MAX_IMAGE_CANDIDATES)
        .map(item => ({
          url:
            safeHttpsUrl(item?.url),
          originalUrl:
            safeHttpsUrl(item?.originalUrl),
          source:
            cleanText(item?.source),
          title:
            cleanText(item?.title)
        }))
        .filter(item => item.url)
  };
}

// ============================================================
// AUTHENTICATION
// ============================================================

function extractBearerToken(req) {
  const auth =
    req.headers?.authorization ||
    req.headers?.Authorization ||
    "";

  if (!auth.startsWith("Bearer ")) {
    return null;
  }

  return auth.slice(7).trim() || null;
}

async function verifySupabaseUser(
  accessToken,
  rootSignal
) {
  if (!accessToken) {
    throw new Error("Missing Supabase access token");
  }

  const endpoint =
    `${SUPABASE_URL}/auth/v1/user`;

  const response =
    await fetchWithTimeout(
      endpoint,
      {
        method: "GET",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization:
            `Bearer ${accessToken}`
        }
      },
      SUPABASE_TIMEOUT,
      rootSignal
    );

  const body =
    await readResponseBody(response);

  let data = null;

  try {
    data =
      body ? JSON.parse(body) : null;
  } catch {
    data = null;
  }

  if (!response.ok || !data?.id) {
    throw new Error(
      "Supabase authentication failed"
    );
  }

  return data;
}

// ============================================================
// MAIN HANDLER
// ============================================================

export default async function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return json(res, 405, {
      ok: false,
      error: "Method not allowed"
    });
  }

  const hardDeadline =
    now() + REQUEST_HARD_TIMEOUT;

  const hardTimeout =
    createDeadlineController(
      REQUEST_HARD_TIMEOUT
    );

  hardTimeout.controller.__deadline =
    hardDeadline;

  let user = null;

  try {
    // --------------------------------------------------------
    // AUTH
    // --------------------------------------------------------

    const accessToken =
      extractBearerToken(req);

    user =
      await verifySupabaseUser(
        accessToken,
        hardTimeout.controller.signal
      );

    // --------------------------------------------------------
    // REQUEST BODY
    // --------------------------------------------------------

    const body =
      await req.json();

    const naturalLanguage =
      extractNaturalLanguage(body);

    const filters =
      extractFilters(body);

    if (
      !naturalLanguage &&
      !Object.values(filters).some(Boolean)
    ) {
      return json(res, 400, {
        ok: false,
        error:
          "Zadajte požiadavku alebo aspoň jeden filter."
      });
    }

    // --------------------------------------------------------
    // SEARCH LIMIT
    // --------------------------------------------------------
    //
    // TEST MODE:
    // SEARCH_LIMIT_ENABLED = false
    //
    // Therefore no Supabase usage RPC is called.
    // Nothing is consumed.
    // --------------------------------------------------------

    let remaining = 5;

    if (SEARCH_LIMIT_ENABLED) {
      // Intentionally disabled in this TEST build.
      //
      // Production version will call the existing
      // Supabase usage RPC here.
      remaining = 4;
    }

    // --------------------------------------------------------
    // AI RESEARCH
    // --------------------------------------------------------

    const aiResult =
      await runAIResearch(
        naturalLanguage,
        filters,
        hardTimeout.controller
      );

    let cars =
      safeArray(
        aiResult?.data?.cars
      )
        .map(normalizeCar)
        .filter(hasUsableCar);

    cars =
      deduplicateCars(cars);

    // Exactly 3 cars.
    cars =
      cars.slice(
        0,
        MAX_OUTPUT_CARS
      );

    if (cars.length !== 3) {
      throw new Error(
        `AI returned ${cars.length} usable cars instead of exactly 3`
      );
    }

    // --------------------------------------------------------
    // PARALLEL ENRICHMENT
    // --------------------------------------------------------

    const enriched =
      await Promise.all(
        cars.map(
          async car => {
            const [
              imageData,
              verifiedUrls
            ] = await Promise.all([
              findCarImages(
                car,
                hardTimeout.controller.signal
              ),

              verifyCarOfficialUrls(
                car,
                hardTimeout.controller.signal
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

    // --------------------------------------------------------
    // FINAL RESPONSE
    // --------------------------------------------------------

    return json(res, 200, {
      ok: true,

      testMode: true,

      limitEnabled:
        SEARCH_LIMIT_ENABLED,

      remaining,

      userId:
        user.id,

      provider:
        aiResult.provider,

      cars: enriched
    });

  } catch (error) {
    const message =
      getErrorMessage(error);

    console.error(
      "CARMATCH AI ERROR:",
      message
    );

    const timeout =
      message.includes("TIMEOUT");

    return json(
      res,
      timeout ? 504 : 500,
      {
        ok: false,

        error:
          timeout
            ? "Server sa nepodarilo dokončiť vyhľadávanie v časovom limite."
            : "Vyhľadávanie sa nepodarilo dokončiť.",

        detail:
          process.env.NODE_ENV === "development"
            ? message
            : undefined,

        refunded: false,

        limitEnabled:
          SEARCH_LIMIT_ENABLED
      }
    );
  } finally {
    hardTimeout.clear();
  }
}