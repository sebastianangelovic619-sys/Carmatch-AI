"use strict";

/* ============================================================
   CARMATCH AI — BACKEND v33
   Kompatibilita: frontend app.js v20
   Endpoint: POST /api/search
   package.json: { "type": "module" }

   OPRAVY v33:
   - Opravené vyhľadávanie fotografií podľa generácie.
   - Rok fotografie sa kontroluje, ak je uvedený v metadátach.
   - Ak rok chýba, akceptuje sa jednoznačná zhoda generácie.
   - Vyhľadávacie dopyty už nevyžadujú rok v názve fotografie.
   - Zachované overovanie značky a modelu.
   - Zachovaná Supabase kvóta/refund, presne 3 autá a filtre.
   ============================================================ */

const DAILY_LIMIT = 5;
const MAX_QUERY_LENGTH = 1000;
const MAX_SOURCES_PER_CAR = 6;
const MAX_TOTAL_SOURCES = 36;
const MAX_SOURCE_SNIPPET = 700;
const MAX_IDENTITY_RESEARCH_SOURCES_PER_CAR = 2;
const AUTH_TIMEOUT_MS = 8000;
const RPC_TIMEOUT_MS = 8000;
const SEARCH_TIMEOUT_MS = 9000;
const IMAGE_TIMEOUT_MS = 10000;
const AI_TIMEOUT_MS = 22000;
const MAX_PHOTOS_PER_CAR = 5;

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_API_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const SERPER_API_KEY = process.env.SERPER_API_KEY || "";
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";

class HttpError extends Error {
  constructor(message, statusCode = 500, code = "BACKEND_ERROR", details) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function json(res, statusCode, payload) {
  return res.status(statusCode).json(payload);
}

function header(req, name) {
  const headers = req?.headers || {};
  const wanted = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === wanted) return headers[key];
  }
  return "";
}

function bearerToken(req) {
  const match = String(header(req, "authorization") || "")
    .trim()
    .match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function cleanString(value, maxLength = 500) {
  if (value === null || value === undefined || typeof value === "object") return "";
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalized(value) {
  return cleanString(value, 2000)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function parseBody(body) {
  if (body && typeof body === "object" && !Array.isArray(body)) return body;
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch (_) {
      return {};
    }
  }
  return {};
}

function parseNumeric(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  let raw = cleanString(value, 100)
    .replace(/\u00A0/g, " ")
    .replace(/\s/g, "");

  if (!raw) return null;

  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(raw)) {
    raw = raw.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(raw)) {
    raw = raw.replace(/,/g, "");
  } else if (raw.includes(",") && !raw.includes(".")) {
    raw = raw.replace(",", ".");
  }

  const match = raw.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;

  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function normalizeFilters(input) {
  const source =
    input && typeof input === "object" && !Array.isArray(input)
      ? input
      : {};

  const keys = [
    "budget", "seats", "power", "trunk", "drive",
    "fuel", "body", "style", "length", "year", "avoid"
  ];

  const filters = {};

  for (const key of keys) {
    const value = source[key];
    if (value === null || value === undefined || value === "") continue;

    if (["budget", "seats", "power", "trunk", "length", "year"].includes(key)) {
      const number = parseNumeric(value);
      if (number !== null) filters[key] = number;
    } else {
      const string = cleanString(value, key === "avoid" ? 500 : 120);
      if (string) filters[key] = string;
    }
  }

  return filters;
}

function normalizeInput(body) {
  const naturalLanguage = cleanString(
    body.naturalLanguage ?? body.query ?? body.prompt ?? "",
    MAX_QUERY_LENGTH
  );

  const filters = normalizeFilters(body.filters);

  if (!naturalLanguage && !Object.keys(filters).length) {
    throw new HttpError(
      "Zadaj požiadavku alebo nastav aspoň jeden filter.",
      400,
      "EMPTY_SEARCH"
    );
  }

  return { naturalLanguage, filters };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function responseJson(response) {
  const raw = await response.text();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch (_) {
    return { raw: raw.slice(0, 1200) };
  }
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ""));

    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password
    ) return "";

    if (["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname)) {
      return "";
    }

    url.hash = "";
    return url.toString();
  } catch (_) {
    return "";
  }
}

/* ---------------------------- SUPABASE AUTH ---------------------------- */

async function verifyUser(token) {
  if (!SUPABASE_URL || !SUPABASE_API_KEY) {
    throw new HttpError(
      "Supabase nie je nakonfigurovaný. Skontroluj SUPABASE_URL a SUPABASE_ANON_KEY alebo SUPABASE_PUBLISHABLE_KEY.",
      500,
      "SUPABASE_CONFIG"
    );
  }

  if (!token) {
    throw new HttpError(
      "Prihlásenie vypršalo. Prihlás sa znova.",
      401,
      "UNAUTHORIZED"
    );
  }

  let response;

  try {
    response = await fetchWithTimeout(
      `${SUPABASE_URL}/auth/v1/user`,
      {
        method: "GET",
        headers: {
          apikey: SUPABASE_API_KEY,
          Authorization: `Bearer ${token}`,
          Accept: "application/json"
        }
      },
      AUTH_TIMEOUT_MS
    );
  } catch (error) {
    throw new HttpError(
      "Nepodarilo sa overiť Supabase reláciu.",
      503,
      "SUPABASE_AUTH_UNAVAILABLE",
      error.message
    );
  }

  const data = await responseJson(response);

  if (!response.ok || !data?.id) {
    throw new HttpError(
      "Supabase relácia je neplatná alebo expirovaná. Prihlás sa znova.",
      401,
      "invalid_token",
      data?.message || data?.msg || undefined
    );
  }

  return data;
}

async function callRpc(name, args, token) {
  let response;

  try {
    response = await fetchWithTimeout(
      `${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(name)}`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_API_KEY,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify(args || {})
      },
      RPC_TIMEOUT_MS
    );
  } catch (error) {
    throw new HttpError(
      `Supabase RPC ${name} sa nepodarilo kontaktovať.`,
      503,
      "SUPABASE_RPC_UNAVAILABLE",
      error.message
    );
  }

  const data = await responseJson(response);

  if (!response.ok) {
    const error = new Error(
      cleanString(
        data?.message ||
        data?.details ||
        data?.hint ||
        data?.error ||
        `RPC ${name} failed`,
        500
      )
    );

    error.code = data?.code || "";
    error.statusCode = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

function isMissingRpc(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();

  return (
    ["PGRST202", "42883", "PGRST204"].includes(code) ||
    message.includes("could not find the function") ||
    (message.includes("function") && message.includes("does not exist"))
  );
}

function isLimitError(error) {
  return /daily.?limit|limit.?reached|quota|too many|maximum.*search|search limit|denn.{0,8}limit|limit vyhľad/i.test(
    String(error?.message || "").toLowerCase()
  );
}

function firstObject(data) {
  return Array.isArray(data) ? (data[0] ?? null) : data;
}

function readRemaining(data) {
  const value = firstObject(data);

  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(DAILY_LIMIT, Math.floor(value)));
  }

  if (!value || typeof value !== "object") return null;

  for (const key of [
    "remaining", "remaining_searches", "searches_left",
    "remainingSearches", "left"
  ]) {
    const number = Number(value[key]);

    if (value[key] !== undefined && Number.isFinite(number)) {
      return Math.max(0, Math.min(DAILY_LIMIT, Math.floor(number)));
    }
  }

  for (const key of [
    "search_count", "count", "used", "usage_count", "used_searches"
  ]) {
    const number = Number(value[key]);

    if (value[key] !== undefined && Number.isFinite(number)) {
      return Math.max(0, DAILY_LIMIT - Math.floor(number));
    }
  }

  return null;
}

function resultDenied(data) {
  const value = firstObject(data);

  if (value === false) return true;
  if (!value || typeof value !== "object") return false;

  const status = String(
    value.status || value.code || value.error || ""
  ).toLowerCase();

  return (
    value.allowed === false ||
    value.success === false ||
    value.ok === false ||
    value.limit_reached === true ||
    value.daily_limit_reached === true ||
    /limit|quota|exceed/.test(status)
  );
}

async function consumeSearch(token) {
  const attempts = [
    {
      name: "increment_search",
      args: { daily_limit: DAILY_LIMIT, max_searches: DAILY_LIMIT }
    },
    {
      name: "consume_search",
      args: { daily_limit: DAILY_LIMIT, max_searches: DAILY_LIMIT }
    },
    {
      name: "use_search",
      args: {}
    }
  ];

  let lastMissing = null;

  for (const attempt of attempts) {
    try {
      const data = await callRpc(attempt.name, attempt.args, token);

      if (resultDenied(data)) {
        throw new HttpError(
          "Dosiahol si denný limit 5 vyhľadávaní. Skús to znova zajtra.",
          429,
          "DAILY_LIMIT_REACHED"
        );
      }

      return {
        consumed: true,
        remaining: readRemaining(data),
        rpc: attempt.name
      };
    } catch (error) {
      if (error instanceof HttpError) throw error;

      if (isLimitError(error)) {
        throw new HttpError(
          "Dosiahol si denný limit 5 vyhľadávaní. Skús to znova zajtra.",
          429,
          "DAILY_LIMIT_REACHED"
        );
      }

      if (isMissingRpc(error)) {
        lastMissing = error;
        continue;
      }

      throw new HttpError(
        `Nepodarilo sa odpočítať vyhľadávanie v Supabase: ${error.message}`,
        error.statusCode === 401 ? 401 : 500,
        "SEARCH_QUOTA_ERROR",
        error.data || undefined
      );
    }
  }

  throw new HttpError(
    "V Supabase sa nenašla RPC funkcia increment_search, consume_search ani use_search.",
    500,
    "SEARCH_RPC_MISSING",
    lastMissing?.message
  );
}

async function refundSearch(token) {
  for (const name of [
    "refund_search",
    "refund_search_usage",
    "decrement_search"
  ]) {
    try {
      await callRpc(name, {}, token);
      return { refunded: true, function: name };
    } catch (error) {
      if (isMissingRpc(error)) continue;

      console.error(`CARMATCH AI: ${name} failed:`, error.message);

      return {
        refunded: false,
        error: error.message
      };
    }
  }

  return {
    refunded: false,
    error: "Refund RPC function not found"
  };
}

/* ---------------------------- WEB SEARCH ---------------------------- */

function buildGeneralQuery(input) {
  const f = input.filters;

  const parts = [
    input.naturalLanguage,
    "production cars Europe Slovakia official specifications EUR"
  ];

  if (f.budget) parts.push(`maximum price ${f.budget} EUR`);
  if (f.seats) parts.push(`${f.seats} seats`);
  if (f.power) parts.push(`minimum power ${f.power} kW`);
  if (f.trunk) parts.push(`minimum boot capacity ${f.trunk} litres`);
  if (f.drive) parts.push(`drive ${f.drive}`);
  if (f.fuel) parts.push(`fuel ${f.fuel}`);
  if (f.body) parts.push(`body type ${f.body}`);
  if (f.style) parts.push(`style ${f.style}`);
  if (f.length) parts.push(`maximum length ${f.length} metres`);
  if (f.year) parts.push(`model year from ${f.year}`);
  if (f.avoid) parts.push(`exclude brands ${f.avoid}`);

  return parts.filter(Boolean).join("; ").slice(0, 1200);
}

async function serperSearch(query, type = "search", num = 8) {
  if (!SERPER_API_KEY) return [];

  const endpoint = type === "images" ? "images" : "search";

  const response = await fetchWithTimeout(
    `https://google.serper.dev/${endpoint}`,
    {
      method: "POST",
      headers: {
        "X-API-KEY": SERPER_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        q: query,
        gl: "sk",
        hl: "en",
        num
      })
    },
    type === "images" ? IMAGE_TIMEOUT_MS : SEARCH_TIMEOUT_MS
  );

  const data = await responseJson(response);

  if (!response.ok) {
    throw new Error(
      data?.message ||
      data?.error ||
      `Serper ${endpoint} HTTP ${response.status}`
    );
  }

  return type === "images"
    ? (data.images || [])
    : (data.organic || []);
}

async function tavilySearch(query) {
  if (!TAVILY_API_KEY) return [];

  const response = await fetchWithTimeout(
    "https://api.tavily.com/search",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query,
        search_depth: "basic",
        topic: "general",
        max_results: 6,
        include_answer: false,
        include_raw_content: false
      })
    },
    SEARCH_TIMEOUT_MS
  );

  const data = await responseJson(response);

  if (!response.ok) {
    throw new Error(data?.message || `Tavily HTTP ${response.status}`);
  }

  return (data.results || []).map(item => ({
    title: item.title,
    link: item.url,
    snippet: item.content
  }));
}

function normalizeSource(item) {
  const url = safeHttpsUrl(item?.link || item?.url);
  if (!url) return null;

  const title = cleanString(item?.title || "Webový zdroj", 180);
  const snippet = cleanString(
    item?.snippet || item?.content || item?.description || "",
    MAX_SOURCE_SNIPPET
  );

  if (!title && !snippet) return null;

  return { title, url, snippet };
}

async function searchSources(query) {
  let rows = [];
  let primaryError = null;

  if (SERPER_API_KEY) {
    try {
      rows = await serperSearch(query, "search", 8);
    } catch (error) {
      primaryError = error;
      console.warn(
        "CARMATCH AI: Serper search failed; trying Tavily:",
        error.message
      );
    }
  }

  if ((!rows || !rows.length) && TAVILY_API_KEY) {
    try {
      rows = await tavilySearch(query);
    } catch (error) {
      console.warn("CARMATCH AI: Tavily search failed:", error.message);
      if (!primaryError) primaryError = error;
    }
  }

  if ((!rows || !rows.length) && primaryError && !TAVILY_API_KEY) {
    throw primaryError;
  }

  const unique = [];
  const seen = new Set();

  for (const item of rows || []) {
    const source = normalizeSource(item);
    if (!source || seen.has(source.url)) continue;

    seen.add(source.url);
    unique.push(source);

    if (unique.length >= 8) break;
  }

  return unique;
}

function assignSourceIds(items, startAt = 1, limit = MAX_TOTAL_SOURCES) {
  return items.slice(0, limit).map((source, index) => ({
    id: `S${startAt + index}`,
    title: source.title,
    url: source.url,
    snippet: source.snippet
  }));
}

/* ---------------------------- AI JSON SCHEMAS ---------------------------- */

const CANDIDATE_SCHEMA = {
  type: "object",
  properties: {
    cars: {
      type: "array",
      items: {
        type: "object",
        properties: {
          brand: { type: "string" },
          model: { type: "string" }
        },
        required: ["brand", "model"],
        additionalProperties: false
      }
    }
  },
  required: ["cars"],
  additionalProperties: false
};

const FINAL_CAR_SCHEMA = {
  type: "object",
  properties: {
    brand: { type: "string" },
    model: { type: "string" },
    name: { type: "string" },
    generation: { type: ["string", "null"] },
    modelYear: { type: ["integer", "null"] },
    trim: { type: "string" },
    body: { type: "string" },
    price: { type: "string" },
    priceSource: { type: "string" },
    power: { type: "string" },
    engine: { type: "string" },
    consumptionWltp: { type: "string" },
    seats: { type: ["integer", "null"] },
    trunkLiters: { type: ["number", "null"] },
    drivetrain: { type: "string" },
    fuel: { type: "string" },
    transmission: { type: "string" },
    lengthMm: { type: ["integer", "null"] },
    reason: { type: "string" },
    pros: { type: "array", items: { type: "string" } },
    cons: { type: "array", items: { type: "string" } },
    maintenance: { type: "string" },
    configurator: { type: "string" },
    officialUrl: { type: "string" },
    sourceIds: { type: "array", items: { type: "string" } }
  },
  required: [
    "brand", "model", "name", "generation", "modelYear", "trim", "body",
    "price", "priceSource", "power", "engine", "consumptionWltp", "seats",
    "trunkLiters", "drivetrain", "fuel", "transmission", "lengthMm", "reason",
    "pros", "cons", "maintenance", "configurator", "officialUrl", "sourceIds"
  ],
  additionalProperties: false
};

const FINAL_SCHEMA = {
  type: "object",
  properties: {
    cars: {
      type: "array",
      items: FINAL_CAR_SCHEMA
    }
  },
  required: ["cars"],
  additionalProperties: false
};

/* ---------------------------- AI PROVIDERS ---------------------------- */

function extractJson(value) {
  let raw = String(value || "").trim();

  raw = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(raw);
  } catch (_) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");

    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch (_) {}
    }

    throw new Error(
      `AI nevrátila parsovateľný JSON. Začiatok odpovede: ${raw.slice(0, 240) || "<prázdne>"}`
    );
  }
}

function assistantContent(data) {
  const choice = data?.choices?.[0];
  const message = choice?.message;
  const content = message?.content;

  if (typeof content === "string") return content.trim();

  if (content && typeof content === "object" && !Array.isArray(content)) {
    return JSON.stringify(content);
  }

  if (Array.isArray(content)) {
    return content.map(part => {
      if (typeof part === "string") return part;
      return part?.text || part?.content || "";
    }).join("\n").trim();
  }

  if (typeof choice?.text === "string") return choice.text.trim();
  if (typeof data?.output_text === "string") return data.output_text.trim();

  return "";
}

function isRateLimitError(error) {
  return (
    Number(error?.statusCode) === 429 ||
    /rate.?limit|tokens per minute|too many requests|tpm limit/i.test(
      String(error?.message || "")
    )
  );
}

function retryAfterSeconds(headers) {
  const value = headers?.get?.("retry-after");
  const seconds = Number(value);

  return Number.isFinite(seconds) && seconds > 0
    ? Math.ceil(seconds)
    : null;
}

function isGroqStrictModel(model) {
  return /^openai\/gpt-oss-(?:20b|120b)$/i.test(
    String(model || "").trim()
  );
}

function jsonSchemaResponseFormat(schema, name) {
  return {
    type: "json_schema",
    json_schema: {
      name,
      strict: true,
      schema
    }
  };
}

async function callChat(
  provider,
  apiKey,
  model,
  prompt,
  maxOutputTokens,
  schema,
  schemaName
) {
  const openrouter = provider === "openrouter";

  const url = openrouter
    ? "https://openrouter.ai/api/v1/chat/completions"
    : "https://api.groq.com/openai/v1/chat/completions";

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json"
  };

  const strictSchemaSupported =
    openrouter || isGroqStrictModel(model);

  const userPrompt = strictSchemaSupported
    ? prompt
    : `${prompt}\n\nJSON SCHEMA (dodrž presne všetky názvy a typy polí):\n${JSON.stringify(schema)}`;

  const body = {
    model,
    messages: [
      {
        role: "system",
        content: "Si presný automobilový rešeršný asistent. Rešpektuj dodané dôkazy. Nikdy nevymýšľaj fakty. Vráť iba údaje požadovanej štruktúry."
      },
      {
        role: "user",
        content: userPrompt
      }
    ],
    temperature: 0.1,
    response_format: strictSchemaSupported
      ? jsonSchemaResponseFormat(schema, schemaName)
      : { type: "json_object" }
  };

  if (openrouter) {
    headers["HTTP-Referer"] =
      process.env.APP_URL || "https://carmatchai.vercel.app";

    headers["X-Title"] = "CARMATCH AI";
    body.max_tokens = maxOutputTokens;
    body.provider = { require_parameters: true };
    body.plugins = [{ id: "response-healing" }];
  } else {
    body.max_completion_tokens = maxOutputTokens;

    if (isGroqStrictModel(model)) {
      body.reasoning_effort = "low";
    }
  }

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    },
    AI_TIMEOUT_MS
  );

  const data = await responseJson(response);

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      data?.raw ||
      `${provider} HTTP ${response.status}`;

    const error = new Error(cleanString(message, 700));
    error.statusCode = response.status;
    error.retryAfter = retryAfterSeconds(response.headers);
    error.provider = provider;
    error.model = model;

    throw error;
  }

  const choice = data?.choices?.[0];
  const content = assistantContent(data);

  if (!content) {
    const reason = cleanString(
      choice?.message?.refusal ||
      choice?.finish_reason ||
      data?.error?.message ||
      "bez textového obsahu",
      220
    );

    const error = new Error(
      `${provider} ${model} vrátil prázdny textový výstup (${reason}).`
    );

    error.statusCode = 502;
    error.provider = provider;
    error.model = model;

    throw error;
  }

  if (choice?.finish_reason === "length") {
    const error = new Error(
      `${provider} ${model} skrátil výstup pre nedostatok max tokenov.`
    );

    error.statusCode = 502;
    error.provider = provider;
    error.model = model;

    throw error;
  }

  return extractJson(content);
}

function allowedOpenRouterModels() {
  return [
    "openrouter/free",
    "nvidia/nemotron-3.5-super-vl:free"
  ];
}

async function generateAI(prompt, options = {}) {
  const maxOutputTokens = Math.max(
    200,
    Math.min(3000, Number(options.maxOutputTokens) || 2200)
  );

  const schema = options.schema || CANDIDATE_SCHEMA;
  const schemaName = options.schemaName || "carmatch_response";

  const errors = [];
  let groqRateLimited = false;

  if (GROQ_API_KEY) {
    const primaryModel =
      process.env.GROQ_MODEL || "openai/gpt-oss-120b";

    const fallbackModel =
      process.env.GROQ_FALLBACK_MODEL || "openai/gpt-oss-20b";

    const models = [...new Set([primaryModel, fallbackModel])];

    for (const model of models) {
      try {
        return await callChat(
          "groq",
          GROQ_API_KEY,
          model,
          prompt,
          maxOutputTokens,
          schema,
          schemaName
        );
      } catch (error) {
        const limited = isRateLimitError(error);
        if (limited) groqRateLimited = true;

        const message = `Groq ${model}: ${error.message}`;
        errors.push(message);

        console.error(`CARMATCH AI: ${message}`);
      }
    }
  }

  if (OPENROUTER_API_KEY) {
    for (const model of allowedOpenRouterModels()) {
      try {
        return await callChat(
          "openrouter",
          OPENROUTER_API_KEY,
          model,
          prompt,
          maxOutputTokens,
          schema,
          schemaName
        );
      } catch (error) {
        const message = `OpenRouter ${model}: ${error.message}`;
        errors.push(message);

        console.error(`CARMATCH AI: ${message}`);
      }
    }
  }

  const lastErrors = errors.slice(-4).join(" | ");

  if (groqRateLimited && !OPENROUTER_API_KEY) {
    throw new HttpError(
      "Groq dočasne dosiahol limit tokenov. Vyhľadávanie nebolo dokončené; skús to neskôr alebo nastav OPENROUTER_API_KEY ako záložného poskytovateľa.",
      503,
      "AI_RATE_LIMITED",
      lastErrors
    );
  }

  throw new HttpError(
    errors.length
      ? `Nepodarilo sa získať validnú odpoveď od AI. ${lastErrors}`
      : "Chýba GROQ_API_KEY aj OPENROUTER_API_KEY vo Vercel Environment Variables.",
    502,
    "AI_UNAVAILABLE",
    lastErrors || undefined
  );
}

/* ---------------------------- AI PROMPTS ---------------------------- */

function candidatePrompt(input, sources) {
  const sourceText = sources
    .map(s => `${s.id} | ${s.title}\n${s.snippet}`)
    .join("\n\n");

  return `
Vyber presne TRI odlišné sériové automobily, ktoré najlepšie spĺňajú používateľovo zadanie.
Vráť objekt podľa priloženej JSON schémy. V poli cars musia byť presne tri položky.
Používateľova požiadavka: ${input.naturalLanguage || "Používateľ zadal iba filtre."}
Filtre: ${JSON.stringify(input.filters)}
Všeobecné webové podklady:
${sourceText || "Žiadne."}

Pravidlá:
- Vyber reálne sériové autá dostupné alebo relevantné pre európsky trh.
- Rešpektuj filtre a značky, ktorým sa používateľ chce vyhnúť.
- Zatiaľ NEUVÁDZAJ generáciu, modelový rok, výkon, cenu ani technické údaje.
- Vyber iba presnú značku a názov modelu. Nevyberaj koncepty, prototypy ani neexistujúce modely.
- Nepíš text pred JSON ani za JSON.
`;
}

function modelResearchQueries(candidate) {
  const brand = cleanString(candidate.brand, 80);
  const model = cleanString(candidate.model, 100);

  const currentYear = new Date().getUTCFullYear();
  const nextYear = currentYear + 1;

  const aliases = brandAliases(brand);
  const shortBrand = aliases.length > 1 ? aliases[1] : brand;

  return [
    `"${brand}" "${model}" current generation generation code chassis code Europe`,
    `"${shortBrand}" "${model}" generation code chassis code production period ${currentYear}`,
    `"${brand}" "${model}" "${currentYear}" "${nextYear}" model years production period`,
    `"${brand}" "${model}" model year ${currentYear} manufacturer Europe specifications`
  ];
}

function brandAliases(brand) {
  const key = normalized(brand);

  const aliases = {
    "mercedes benz": ["mercedes benz", "mercedes"],
    "land rover": ["land rover", "landrover"],
    "alfa romeo": ["alfa romeo"],
    "aston martin": ["aston martin"],
    "rolls royce": ["rolls royce", "rolls-royce"],
    "volkswagen": ["volkswagen", "vw"],
    "vw": ["vw", "volkswagen"],
    "ds automobiles": ["ds automobiles", "ds"],
    "citroen": ["citroen", "citroën"],
    "skoda": ["skoda", "škoda"]
  };

  return aliases[key] || [key];
}

function phrasePresent(haystack, phrase) {
  const hay = ` ${normalized(haystack)} `;
  const needle = ` ${normalized(phrase)} `;

  return needle.trim().length > 2 && hay.includes(needle);
}

function brandMatchesText(brand, text) {
  return brandAliases(brand).some(alias =>
    phrasePresent(text, alias)
  );
}

function vehicleMatchesSource(car, source) {
  const haystack =
    `${source.title || ""} ${source.snippet || ""} ${source.url || ""}`;

  const modelTokens = tokens(car.model);

  return (
    brandMatchesText(car.brand, haystack) &&
    modelTokens.length > 0 &&
    modelTokens.every(token => normalized(haystack).includes(token))
  );
}

function sourceIdentityScore(car, source) {
  const title = `${source.title || ""}`;
  const body = `${source.title || ""} ${source.snippet || ""}`;

  const titleNorm = normalized(title);
  const bodyNorm = normalized(body);

  let score = 0;

  if (brandMatchesText(car.brand, title)) score += 5;
  else if (brandMatchesText(car.brand, body)) score += 2;

  for (const token of tokens(car.model)) {
    if (titleNorm.includes(token)) score += 5;
    else if (bodyNorm.includes(token)) score += 2;
  }

  if (/\b(?:x\d{2,4}|w\d{2,4}|g\d{2,4}|f\d{2,4})\b/i.test(body)) {
    score += 3;
  }

  if (/generation|generat|generaci|generatie|klasse\s+(?:ii|iii|iv)|\b(?:1st|2nd|3rd|4th)\b/i.test(body)) {
    score += 3;
  }

  if (/model\s*year|model-year|modeljaar|model years|production period|productieperiode|looptijd|20\d{2}\s*[-–]\s*(?:present|heden)/i.test(body)) {
    score += 3;
  }

  try {
    const host = new URL(source.url).hostname.toLowerCase();

    if (/mercedes-benz|bmw|audi|volkswagen|toyota|ford|porsche|hyundai|kia|skoda|renault|stellantis|volvocars/.test(host)) {
      score += 2;
    }
  } catch (_) {}

  return score;
}

async function collectModelSources(candidates, firstSourceId = 1) {
  const results = await Promise.all(
    candidates.map(async candidate => {
      const queries = modelResearchQueries(candidate);

      const groups = await Promise.all(
        queries.map(query =>
          searchSources(query).catch(error => {
            console.warn(
              `CARMATCH AI: model source search failed for ${candidate.brand} ${candidate.model}:`,
              error.message
            );
            return [];
          })
        )
      );

      const byUrl = new Map();

      for (const item of groups.flat()) {
        if (!item?.url) continue;

        const old = byUrl.get(item.url);

        if (!old || (item.snippet || "").length > (old.snippet || "").length) {
          byUrl.set(item.url, item);
        }
      }

      return [...byUrl.values()]
        .filter(item => vehicleMatchesSource(candidate, item))
        .sort((a, b) =>
          sourceIdentityScore(candidate, b) -
          sourceIdentityScore(candidate, a)
        )
        .slice(0, MAX_SOURCES_PER_CAR);
    })
  );

  const all = [];
  const perCar = [];
  let next = firstSourceId;

  for (const rows of results) {
    const assigned = assignSourceIds(
      rows,
      next,
      MAX_SOURCES_PER_CAR
    );

    perCar.push(assigned);
    all.push(...assigned);
    next += assigned.length;
  }

  return {
    all: all.slice(0, MAX_TOTAL_SOURCES),
    perCar
  };
}

function detailedPrompt(input, candidates, sourceGroups) {
  const evidence = candidates.map((candidate, index) => {
    const sources = sourceGroups[index] || [];

    return (
      `AUTO ${index + 1}: ${candidate.brand} ${candidate.model}\n` +
      (
        sources.length
          ? sources.map(s =>
              `${s.id} | ${s.title}\n${s.snippet}\nURL: ${s.url}`
            ).join("\n\n")
          : "Žiadne použiteľné zdroje sa nenašli."
      )
    );
  }).join("\n\n----------------\n\n");

  return `
Si automobilový rešeršný asistent pre Slovensko. Odpovedaj po slovensky.
Vráť objekt podľa priloženej JSON schémy; pole cars musí obsahovať presne tri autá.
Dátum: ${new Date().toISOString().slice(0, 10)}.
POŽIADAVKA: ${input.naturalLanguage || "Používateľ zadal iba filtre."}
FILTRE: ${JSON.stringify(input.filters)}

SAMOSTATNÉ PODKLADY PRE KAŽDÉ AUTO:
${evidence}

PRAVIDLÁ:
- Vráť presne tieto tri značky a modely. Nemeň ich a nepridávaj ďalšie.
- Použi iba dôkazy zo sekcie daného auta. Nepriraď zdroje inému vozidlu.
- Generáciu uveď ako presný kód (napr. X247, W206, G70), ak je v zdroji, alebo ako číselné označenie generácie, ak je takto uvedené v zdroji. Inak null.
- Modelový rok nie je rok publikovania článku ani dátum webovej stránky. Uveď ho len vtedy, keď zdroj výslovne hovorí o modelovom roku (model year, MY, modelový rok) alebo jasne označuje konkrétnu modelovú verziu. Inak null.
- Ak generáciu alebo modelový rok nevieš potvrdiť, použi null. Nikdy ich neodhaduj.
- sourceIds uveď ako ID zdrojov priradených k danému autu, ktoré podporujú jeho identitu.
- Výkon uveď iba v kW. Spotrebu iba WLTP. Kufor musí patriť konkrétnej karosérii/verzii.
- Cenu v EUR uveď iba pri dôkaze pre konkrétnu verziu/trh; inak "Cena neoverená". Nevypočítavaj odhadom.
- Nezamieňaj systémový výkon hybridu s výkonom spaľovacieho motora.
- Motor, palivo, prevodovku, pohon, karosériu a sedadlá uveď iba pri zdroji, ktorý ich potvrdzuje.
- officialUrl a configurator musia byť presné URL výrobcu prítomné v zdrojoch daného modelu. priceSource musí podporovať konkrétnu cenu.
- Neznáme textové údaje vyplň prázdnym reťazcom alebo "Neoverené" podľa významu. Neznáme čísla a generáciu/rok vyplň null.
- Žiadne vymyslené skóre, URL, ceny, servisné sumy, poruchy ani technické údaje.
- reason, pros, cons a maintenance píš stručne a realisticky. Do polí pros a cons vlož najviac tri položky.
- Nepíš text pred JSON ani za JSON.
`;
}

/* ---------------------------- EVIDENCE VALIDATION ---------------------------- */

function tokens(value) {
  return normalized(value)
    .split(" ")
    .filter(token => token.length >= 2);
}

function relevantSourcesForCar(car, sources) {
  return sources.filter(source =>
    vehicleMatchesSource(car, source)
  );
}

function approximatelyEqual(a, b, percent = 0.02, minimum = 1) {
  return Math.abs(a - b) <= Math.max(minimum, Math.abs(a) * percent);
}

function numberList(value) {
  const matches =
    String(value || "").match(/\d+(?:[\s.,]\d{3})*(?:[.,]\d+)?/g) || [];

  return matches.map(item => {
    let raw = item.replace(/\s/g, "");

    if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(raw)) {
      raw = raw.replace(/\./g, "").replace(",", ".");
    } else if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(raw)) {
      raw = raw.replace(/,/g, "");
    } else if (raw.includes(",") && !raw.includes(".")) {
      raw = raw.replace(",", ".");
    }

    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }).filter(n => n !== null);
}

function verifyPower(value, evidence) {
  const match = String(value || "").match(/(\d+(?:[.,]\d+)?)\s*kW\b/i);
  if (!match || !evidence) return false;

  const amount = Number(match[1].replace(",", "."));

  const kws = [
    ...evidence.matchAll(/(\d+(?:[.,]\d+)?)\s*kW\b/gi)
  ].map(m => Number(m[1].replace(",", ".")));

  const hps = [
    ...evidence.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:hp|bhp)\b/gi)
  ].map(m => Number(m[1].replace(",", ".")));

  return (
    kws.some(n => approximatelyEqual(amount, n, 0.02, 2)) ||
    hps.some(n =>
      approximatelyEqual(amount * 1.341022, n, 0.025, 3)
    )
  );
}

function verifyUnitNumber(
  value,
  evidence,
  unitPattern,
  tolerance = 0.02,
  minimum = 1
) {
  const amount = parseNumeric(value);
  if (amount === null || !evidence) return false;

  const regex = new RegExp(
    `(\\d+(?:[.,]\\d+)?)\\s*${unitPattern}`,
    "gi"
  );

  return [...evidence.matchAll(regex)].some(match =>
    approximatelyEqual(
      amount,
      Number(match[1].replace(",", ".")),
      tolerance,
      minimum
    )
  );
}

function verifySeats(value, evidence) {
  const n = parseNumeric(value);

  if (
    n === null ||
    !Number.isInteger(n) ||
    n < 1 ||
    n > 9 ||
    !evidence
  ) return false;

  return (
    new RegExp(
      `\\b${n}\\s*(?:seats?|seater|passengers?|miest(?:a|ami)?|sedadiel)\\b`,
      "i"
    ).test(evidence) ||
    new RegExp(
      `(?:seats?|seating|miest|sedadiel)[^\\n]{0,45}\\b${n}\\b`,
      "i"
    ).test(evidence)
  );
}

function verifyPrice(value, evidence) {
  if (
    !value ||
    !evidence ||
    !/(?:€|\bEUR\b)/i.test(String(value))
  ) return false;

  const requested = numberList(value).filter(n => n >= 1000);
  if (!requested.length) return false;

  const regex =
    /(?:€\s*|\bEUR\s*)(\d[\d\s.,]{2,})|(\d[\d\s.,]{2,})\s*(?:€|EUR)(?![A-Za-z])/gi;

  const found = [];

  for (const match of evidence.matchAll(regex)) {
    found.push(
      ...numberList(match[1] || match[2]).filter(n => n >= 1000)
    );
  }

  return requested.some(n =>
    found.some(v => approximatelyEqual(n, v, 0.025, 100))
  );
}

function verifyText(value, evidence, minimumTokens = 1) {
  const words = normalized(value)
    .split(" ")
    .filter(word => word.length >= 2);

  if (!words.length || !evidence) return false;

  const haystack = normalized(evidence);
  const hits = words.filter(word => haystack.includes(word)).length;

  return (
    hits >= Math.min(minimumTokens, words.length) &&
    hits === words.length
  );
}

function verifyGeneration(value, evidence) {
  const candidate = cleanString(value, 120);
  if (!candidate || !evidence) return false;

  const candidateNorm = normalized(candidate);
  const evidenceNorm = normalized(evidence);

  if (candidateNorm && evidenceNorm.includes(candidateNorm)) {
    return true;
  }

  const codes = candidate.match(/\b[A-Z]{1,3}\d{2,4}\b/gi) || [];

  if (codes.length) {
    return codes.every(code =>
      evidenceNorm.includes(normalized(code))
    );
  }

  const ordinalMatch = candidate.match(
    /\b(1|2|3|4|first|second|third|fourth|1st|2nd|3rd|4th|prv[aáy]?|druh[aáy]?|tret[ií]a?|štvrt[aáy]?)\b/i
  );

  if (ordinalMatch && /generat|generation|generaci|generac/i.test(candidateNorm)) {
    const ordinal = ordinalMatch[1].toLowerCase();

    const variants = {
      "1": ["first generation", "1st generation", "1 generation", "1 generacia", "prva generacia", "i generation", "klasse i"],
      first: ["first generation", "1st generation", "1 generacia", "prva generacia"],
      "1st": ["first generation", "1st generation", "1 generacia", "prva generacia"],
      "2": ["second generation", "2nd generation", "2 generation", "2 generacia", "druha generacia", "ii generation", "klasse ii"],
      second: ["second generation", "2nd generation", "2 generacia", "druha generacia", "ii generation", "klasse ii"],
      "2nd": ["second generation", "2nd generation", "2 generacia", "druha generacia", "ii generation", "klasse ii"],
      "3": ["third generation", "3rd generation", "3 generation", "3 generacia", "tretia generacia", "iii generation", "klasse iii"],
      third: ["third generation", "3rd generation", "3 generacia", "tretia generacia", "iii generation", "klasse iii"],
      "3rd": ["third generation", "3rd generation", "3 generacia", "tretia generacia", "iii generation", "klasse iii"],
      "4": ["fourth generation", "4th generation", "4 generation", "4 generacia", "stvrta generacia", "iv generation", "klasse iv"],
      fourth: ["fourth generation", "4th generation", "4 generacia", "stvrta generacia", "iv generation", "klasse iv"],
      "4th": ["fourth generation", "4th generation", "4 generacia", "stvrta generacia", "iv generation", "klasse iv"]
    };

    return (variants[ordinal] || []).some(variant =>
      evidenceNorm.includes(normalized(variant))
    );
  }

  return verifyText(candidate, evidence, 1);
}

function sourceModelYearFact(car, source) {
  if (!vehicleMatchesSource(car, source)) return null;

  const text =
    `${source.title || ""} ${source.snippet || ""} ${source.url || ""}`;

  const norm = normalized(text);

  const explicitPatterns = [
    /\bmodel\s*year\s*(20\d{2})\b/i,
    /\bmodel\s*yr\s*(20\d{2})\b/i,
    /\bmy\s*(20\d{2})\b/i,
    /\b(20\d{2})\s*model\s*year\b/i,
    /\bmodelovy\s*rok\s*(20\d{2})\b/i,
    /\bmodeljaar\s*(20\d{2})\b/i,
    /\bmodel years?\s*(20\d{2})\b/i
  ];

  for (const pattern of explicitPatterns) {
    const match = norm.match(pattern);
    if (match) {
      return {
        year: Number(match[1]),
        kind: "explicit_model_year"
      };
    }
  }

  const productionContext =
    /production|productie|bouwjaar|bouwperiode|looptijd|model years?/i.test(norm);

  if (productionContext) {
    const patterns = [
      /(?:production\s*period|production|productieperiode|productie\s*periode|bouwperiode|looptijd)\s*(20\d{2})\s*(?:present|current|heden|now|ongoing)/i,
      /(?:model years?|modeljaar|modeljaren)\s*[:\-]?\s*(20\d{2})\s*(?:-|–|—|to)?/i,
      /(?:production\s*started|production\s*from|in production since|productie gestart|looptijd)\s*(?:in\s*)?(20\d{2})/i
    ];

    for (const pattern of patterns) {
      const match = norm.match(pattern);

      if (match) {
        return {
          year: Number(match[1]),
          kind: "production_start_year"
        };
      }
    }
  }

  return null;
}

function verifyModelYear(value, car, sources) {
  const year = parseNumeric(value);

  if (
    !Number.isInteger(year) ||
    year < 1990 ||
    year > 2035
  ) return false;

  return sources.some(source =>
    sourceModelYearFact(car, source)?.year === year
  );
}

function inferModelYearFromSources(car, sources) {
  const facts = sources
    .map(source => sourceModelYearFact(car, source))
    .filter(Boolean);

  if (!facts.length) return null;

  const explicit = facts.filter(
    fact => fact.kind === "explicit_model_year"
  );

  const pool = explicit.length ? explicit : facts;

  const years = [
    ...new Set(pool.map(fact => fact.year))
  ].sort((a, b) => b - a);

  const currentYear = new Date().getUTCFullYear();

  if (years.includes(currentYear)) return currentYear;
  if (years.includes(currentYear + 1)) return currentYear + 1;

  return years[0] || null;
}

function inferGenerationFromSources(car, sources) {
  const relevant = sources
    .filter(source => vehicleMatchesSource(car, source))
    .sort((a, b) =>
      sourceIdentityScore(car, b) -
      sourceIdentityScore(car, a)
    );

  for (const source of relevant) {
    const title = cleanString(source.title, 350);
    const text = `${title} ${source.snippet || ""}`;

    const romanCode = title.match(
      /\b(II|III|IV|I)\s*\(\s*([A-Z]{1,3}\d{2,4})\s*\)/i
    );

    if (romanCode) {
      const roman = romanCode[1].toUpperCase();
      const number = { I: 1, II: 2, III: 3, IV: 4 }[roman];

      return `${number}. generácia`;
    }

    const phraseMatch = text.match(
      /\b(first|second|third|fourth|1st|2nd|3rd|4th|prv[aáy]?|druh[aáy]?|tret[ií]a?|štvrt[aáy]?)\s*(?:generation|gen\.?|generácia|generacia|generatie)\b/i
    );

    if (phraseMatch) return phraseMatch[0];

    const code = title.match(/\b([A-Z]{1,3}\d{2,4})\b/i);

    if (code) return code[1].toUpperCase();
  }

  return null;
}

function verifyOfficialUrl(value, sourceIds, sources) {
  const url = safeHttpsUrl(value);
  if (!url) return "";

  let host;

  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch (_) {
    return "";
  }

  return sources.some(source => {
    if (!sourceIds.includes(source.id)) return false;

    try {
      return (
        new URL(source.url).hostname.replace(/^www\./, "") === host
      );
    } catch (_) {
      return false;
    }
  }) ? url : "";
}

function parsePowerKw(value) {
  const match = String(value || "").match(/(\d+(?:[.,]\d+)?)\s*kW\b/i);

  return match
    ? Number(match[1].replace(",", "."))
    : null;
}

function cleanIdentity(raw) {
  const brand = cleanString(raw.brand, 80);
  const model = cleanString(raw.model, 100);

  if (!brand || !model) {
    throw new Error("AI nevrátila samostatnú značku a model.");
  }

  return {
    brand,
    model,
    name: cleanString(raw.name, 160) || `${brand} ${model}`
  };
}

function normalizeCar(rawCar, allSources, filters) {
  const raw =
    rawCar && typeof rawCar === "object" && !Array.isArray(rawCar)
      ? rawCar
      : {};

  const identity = cleanIdentity(raw);

  const carSources = relevantSourcesForCar(identity, allSources);
  const sourceIds = carSources.map(source => source.id);

  const evidence = carSources
    .map(source =>
      `${source.title}\n${source.snippet}\n${source.url}`
    )
    .join("\n\n");

  if (!evidence) {
    throw new HttpError(
      `Pre ${identity.brand} ${identity.model} neexistuje priradený relevantný zdroj.`,
      502,
      "MODEL_SOURCES_MISSING"
    );
  }

  const rawGeneration = cleanString(raw.generation, 120);
  const rawYear = parseNumeric(raw.modelYear ?? raw.year);

  const inferredGeneration =
    inferGenerationFromSources(identity, carSources);

  const generation =
    rawGeneration && verifyGeneration(rawGeneration, evidence)
      ? rawGeneration
      : inferredGeneration;

  const inferredYear =
    inferModelYearFromSources(identity, carSources);

  const modelYear =
    rawYear !== null &&
    verifyModelYear(rawYear, identity, carSources)
      ? Math.round(rawYear)
      : inferredYear;

  const generationVerified =
    Boolean(generation) &&
    verifyGeneration(generation, evidence);

  const yearVerified =
    Number.isInteger(modelYear) &&
    verifyModelYear(modelYear, identity, carSources);

  if (!generationVerified || !yearVerified) {
    const missing = [
      !generationVerified ? "generáciu" : "",
      !yearVerified ? "modelový rok" : ""
    ].filter(Boolean).join(" a ");

    throw new HttpError(
      `Pri modeli ${identity.brand} ${identity.model} sa ani po doplňujúcom overení nepodarilo potvrdiť ${missing}. Výsledok sa nezobrazí bez dôkazu.`,
      502,
      "MODEL_IDENTITY_NOT_VERIFIED",
      {
        generationReceived: rawGeneration || null,
        generationInferred: inferredGeneration || null,
        modelYearReceived: rawYear || null,
        modelYearInferred: inferredYear || null,
        checkedSources: carSources.map(source => ({
          id: source.id,
          title: source.title,
          url: source.url,
          excerpt: cleanString(source.snippet, 240)
        }))
      }
    );
  }

  const rawPower = cleanString(raw.power, 80);
  const power = verifyPower(rawPower, evidence)
    ? rawPower
    : "Neoverené";

  const rawPrice = cleanString(raw.price, 100);
  const price = verifyPrice(rawPrice, evidence)
    ? rawPrice
    : "Cena neoverená";

  const seats = verifySeats(raw.seats, evidence)
    ? Number(raw.seats)
    : null;

  const trunkRaw =
    raw.trunkLiters ?? raw.trunk ?? raw.bootSpace;

  const trunkLiters = verifyUnitNumber(
    trunkRaw,
    evidence,
    "(?:l|litres?|liters?|litrov|litre)\\b",
    0.02,
    2
  )
    ? parseNumeric(trunkRaw)
    : null;

  const lengthRaw = raw.lengthMm ?? raw.length;

  const lengthMm = verifyUnitNumber(
    lengthRaw,
    evidence,
    "mm\\b",
    0.01,
    5
  )
    ? parseNumeric(lengthRaw)
    : null;

  const consumptionRaw = cleanString(
    raw.consumptionWltp ?? raw.wltpConsumption,
    80
  );

  let consumptionWltp = "Neoverené";

  if (consumptionRaw) {
    const numeric = parseNumeric(consumptionRaw);

    const unitPattern = /kWh/i.test(consumptionRaw)
      ? "kWh(?:\\s*\\/\\s*100\\s*km)?\\b"
      : "l(?:\\s*\\/\\s*100\\s*km)?\\b";

    if (
      numeric !== null &&
      verifyUnitNumber(numeric, evidence, unitPattern, 0.05, 0.1)
    ) {
      consumptionWltp = consumptionRaw;
    }
  }

  const textField = (value, fallback = "Neoverené") => {
    const candidate = cleanString(value, 100);

    return (
      candidate && verifyText(candidate, evidence, 1)
        ? candidate
        : fallback
    );
  };

  const priceSource =
    price !== "Cena neoverená"
      ? verifyOfficialUrl(raw.priceSource, sourceIds, carSources)
      : "";

  const configurator =
    verifyOfficialUrl(raw.configurator, sourceIds, carSources);

  const officialUrl =
    verifyOfficialUrl(raw.officialUrl, sourceIds, carSources);

  return {
    brand: identity.brand,
    model: identity.model,
    name: identity.name,
    generation,
    modelYear,
    year: modelYear,
    trim: textField(raw.trim),
    body: textField(raw.body || raw.bodyType),
    price,
    priceSource,
    power,
    engine: textField(raw.engine),
    consumptionWltp,
    seats,
    trunkLiters,
    drivetrain: textField(raw.drivetrain || raw.drive),
    fuel: textField(raw.fuel),
    transmission: textField(raw.transmission),
    lengthMm,
    reason: cleanString(raw.reason, 650),
    pros: Array.isArray(raw.pros)
      ? raw.pros.slice(0, 3).map(item => cleanString(item, 180)).filter(Boolean)
      : [],
    cons: Array.isArray(raw.cons)
      ? raw.cons.slice(0, 3).map(item => cleanString(item, 180)).filter(Boolean)
      : [],
    maintenance: cleanString(raw.maintenance, 500),
    configurator,
    officialUrl,
    sourceIds
  };
}

function validateFilters(cars, filters) {
  for (const car of cars) {
    if (filters.seats && (car.seats === null || car.seats < filters.seats)) {
      throw new HttpError(
        `${car.name}: počet sedadiel nespĺňa alebo sa nepodarilo overiť zadaný filter.`,
        502,
        "FILTER_NOT_VERIFIED"
      );
    }

    if (
      filters.power &&
      (
        parsePowerKw(car.power) === null ||
        parsePowerKw(car.power) < filters.power
      )
    ) {
      throw new HttpError(
        `${car.name}: výkon nespĺňa alebo sa nepodarilo overiť zadaný filter.`,
        502,
        "FILTER_NOT_VERIFIED"
      );
    }

    if (
      filters.trunk &&
      (car.trunkLiters === null || car.trunkLiters < filters.trunk)
    ) {
      throw new HttpError(
        `${car.name}: objem kufra nespĺňa alebo sa nepodarilo overiť zadaný filter.`,
        502,
        "FILTER_NOT_VERIFIED"
      );
    }

    if (
      filters.length &&
      (car.lengthMm === null || car.lengthMm > filters.length * 1000)
    ) {
      throw new HttpError(
        `${car.name}: dĺžka vozidla nespĺňa alebo sa nepodarilo overiť zadaný filter.`,
        502,
        "FILTER_NOT_VERIFIED"
      );
    }

    if (filters.year && car.modelYear < filters.year) {
      throw new HttpError(
        `${car.name}: modelový rok je starší ako požadovaný filter.`,
        502,
        "FILTER_NOT_VERIFIED"
      );
    }

    if (filters.budget) {
      const priceAmount =
        car.price === "Cena neoverená"
          ? null
          : parseNumeric(car.price);

      if (priceAmount === null || priceAmount > filters.budget) {
        throw new HttpError(
          `${car.name}: cenu sa nepodarilo overiť v rámci zadaného rozpočtu.`,
          502,
          "FILTER_NOT_VERIFIED"
        );
      }
    }

    if (
      filters.avoid &&
      normalized(filters.avoid)
        .split(" ")
        .some(token => token && normalized(car.brand).includes(token))
    ) {
      throw new HttpError(
        `${car.name}: značka je uvedená medzi značkami, ktorým sa chceš vyhnúť.`,
        502,
        "FILTER_NOT_VERIFIED"
      );
    }

    if (
      filters.drive &&
      (
        car.drivetrain === "Neoverené" ||
        !normalized(car.drivetrain).includes(normalized(filters.drive))
      )
    ) {
      throw new HttpError(
        `${car.name}: pohon nespĺňa alebo sa nepodarilo overiť zadaný filter.`,
        502,
        "FILTER_NOT_VERIFIED"
      );
    }

    if (
      filters.fuel &&
      (
        car.fuel === "Neoverené" ||
        !normalized(car.fuel).includes(normalized(filters.fuel))
      )
    ) {
      throw new HttpError(
        `${car.name}: palivo nespĺňa alebo sa nepodarilo overiť zadaný filter.`,
        502,
        "FILTER_NOT_VERIFIED"
      );
    }

    if (
      filters.body &&
      (
        car.body === "Neoverené" ||
        !normalized(car.body).includes(normalized(filters.body))
      )
    ) {
      throw new HttpError(
        `${car.name}: karoséria nespĺňa alebo sa nepodarilo overiť zadaný filter.`,
        502,
        "FILTER_NOT_VERIFIED"
      );
    }
  }
}

/* ---------------------------- PHOTO SEARCH ---------------------------- */

function rejectedPhotoText(value) {
  return /\b(logo|emblem|badge|interior|dashboard|cockpit|steering|brochure|manual|diagram|drawing|illustration|render|toy|model kit|scale model|miniature|poster|screenshot|crash|accident|spare part|technical drawing|wallpaper)\b/i.test(
    normalized(value)
  );
}

function generationPhotoMatch(haystack, car) {
  const generation = cleanString(car.generation, 100);
  if (!generation) return false;

  const hay = normalized(haystack);

  const codes =
    generation.match(/\b[A-Z]{1,3}\d{2,4}\b/gi) || [];

  if (codes.length) {
    return codes.every(code =>
      hay.includes(normalized(code))
    );
  }

  const gen = normalized(generation);

  if (gen.length >= 6 && hay.includes(gen)) {
    return true;
  }

  const ordinalMatch = generation.match(
    /\b(1|2|3|4|first|second|third|fourth|1st|2nd|3rd|4th)\b/i
  );

  if (!ordinalMatch) return false;

  const word = ordinalMatch[1].toLowerCase();

  const alternatives = {
    "1": ["first generation", "1st generation", "1st gen"],
    first: ["first generation", "1st generation", "1st gen"],
    "1st": ["first generation", "1st generation", "1st gen"],

    "2": ["second generation", "2nd generation", "2nd gen"],
    second: ["second generation", "2nd generation", "2nd gen"],
    "2nd": ["second generation", "2nd generation", "2nd gen"],

    "3": ["third generation", "3rd generation", "3rd gen"],
    third: ["third generation", "3rd generation", "3rd gen"],
    "3rd": ["third generation", "3rd generation", "3rd gen"],

    "4": ["fourth generation", "4th generation", "4th gen"],
    fourth: ["fourth generation", "4th generation", "4th gen"],
    "4th": ["fourth generation", "4th generation", "4th gen"]
  };

  return (alternatives[word] || []).some(term =>
    hay.includes(normalized(term))
  );
}

/*
 * OPRAVA v33:
 *
 * 1. Značka a model sa musia zhodovať.
 * 2. Ak metadáta obsahujú presný modelový rok, musí súhlasiť.
 * 3. Ak rok v metadátach chýba, vyžaduje sa zhoda generácie.
 *
 * Poznámka:
 * Zhoda generácie nepreukazuje presný modelový rok.
 * Preto sa táto kontrola používa iba ako bezpečný fallback
 * v prípade, že rok fotografie nie je uvedený.
 */
function photoMetadataMatches(item, car) {
  const title = cleanString(item.title, 350);

  const sourceUrl = safeHttpsUrl(
    item.link ||
    item.source ||
    item.descriptionurl
  );

  const rawHaystack = `${title} ${sourceUrl}`;
  const haystack = normalized(rawHaystack);

  if (!haystack || rejectedPhotoText(title)) {
    return false;
  }

  const modelTokens = tokens(car.model);

  if (!modelTokens.length) {
    return false;
  }

  if (!brandMatchesText(car.brand, rawHaystack)) {
    return false;
  }

  if (!modelTokens.every(token => haystack.includes(token))) {
    return false;
  }

  const modelYear = Number(car.modelYear);

  if (!Number.isInteger(modelYear)) {
    return false;
  }

  // Ak je rok uvedený, musí presne súhlasiť.
  const yearMatch = new RegExp(
    `\\b${modelYear}\\b`
  ).test(haystack);

  if (yearMatch) {
    return true;
  }

  // Ak rok v metadátach chýba, použije sa kód generácie.
  return generationPhotoMatch(rawHaystack, car);
}

async function searchSerperPhotos(car) {
  if (!SERPER_API_KEY) return [];

  // OPRAVA: Rok už nie je povinnou súčasťou dopytu.
  const query =
    `"${car.brand} ${car.model}" "${car.generation}" exterior real production car`;

  const rows = await serperSearch(query, "images", 20);

  const output = [];
  const seen = new Set();

  for (const item of rows) {
    if (!photoMetadataMatches(item, car)) continue;

    const url = safeHttpsUrl(
      item.imageUrl || item.thumbnailUrl
    );

    const source = safeHttpsUrl(item.link);

    if (!url || !source || seen.has(url)) continue;

    seen.add(url);

    output.push({
      url,
      source,
      title: cleanString(item.title, 250),
      width: Number(item.imageWidth) || null,
      height: Number(item.imageHeight) || null
    });

    if (output.length >= MAX_PHOTOS_PER_CAR) break;
  }

  return output;
}

async function searchCommonsPhotos(car) {
  // OPRAVA: Rok už nie je povinnou súčasťou dopytu.
  const query =
    `"${car.brand} ${car.model}" "${car.generation}" exterior`;

  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: query,
    gsrnamespace: "6",
    gsrlimit: "30",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "1400",
    format: "json",
    origin: "*"
  });

  const response = await fetchWithTimeout(
    `https://commons.wikimedia.org/w/api.php?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    },
    IMAGE_TIMEOUT_MS
  );

  if (!response.ok) return [];

  const data = await responseJson(response);
  const pages = Object.values(data?.query?.pages || {});

  const output = [];
  const seen = new Set();

  for (const page of pages) {
    const title = cleanString(page?.title, 300)
      .replace(/^File:/i, "");

    const info = page?.imageinfo?.[0] || {};

    const item = {
      title,
      link: info.descriptionurl || page?.canonicalurl
    };

    if (!photoMetadataMatches(item, car)) continue;

    const url = safeHttpsUrl(
      info.thumburl || info.url
    );

    const source = safeHttpsUrl(
      info.descriptionurl || page?.canonicalurl
    );

    if (!url || !source || seen.has(url)) continue;

    seen.add(url);

    output.push({
      url,
      source,
      title,
      width: Number(info.width) || null,
      height: Number(info.height) || null
    });

    if (output.length >= MAX_PHOTOS_PER_CAR) break;
  }

  return output;
}

async function findPhotosForCar(car) {
  let photos = [];

  if (SERPER_API_KEY) {
    try {
      photos = await searchSerperPhotos(car);
    } catch (error) {
      console.warn(
        `CARMATCH AI: Serper image search failed for ${car.name}:`,
        error.message
      );
    }
  }

  if (!photos.length) {
    try {
      photos = await searchCommonsPhotos(car);
    } catch (error) {
      console.warn(
        `CARMATCH AI: Wikimedia image search failed for ${car.name}:`,
        error.message
      );
    }
  }

  if (!photos.length) {
    throw new HttpError(
      `Pre ${car.name} sa nepodarilo nájsť fotografiu so zhodou značky, modelu a generácie ${car.generation}. Výsledok bez overiteľnej fotografie nezobrazíme.`,
      502,
      "PHOTO_VERIFICATION_FAILED"
    );
  }

  return {
    ...car,
    image: photos[0].url,
    imageUrl: photos[0].url,
    photoSource: photos[0].source,
    imageCandidates: photos,
    images: photos
  };
}

async function supplementIdentitySources(
  candidates,
  rawCars,
  existingSources
) {
  const seen = new Set(
    existingSources.map(source => source.url)
  );

  const additionsByCandidate = await Promise.all(
    candidates.map(async candidate => {
      const raw = rawCars.find(item =>
        normalized(`${item?.brand || ""} ${item?.model || ""}`) ===
        normalized(`${candidate.brand} ${candidate.model}`)
      ) || {};

      const existingForCar =
        relevantSourcesForCar(candidate, existingSources);

      const evidence = existingForCar
        .map(source =>
          `${source.title}\n${source.snippet}\n${source.url}`
        )
        .join("\n\n");

      const hasGeneration =
        (raw.generation &&
          verifyGeneration(raw.generation, evidence)) ||
        inferGenerationFromSources(candidate, existingForCar);

      const rawYear = parseNumeric(
        raw.modelYear ?? raw.year
      );

      const hasYear =
        (rawYear !== null &&
          verifyModelYear(rawYear, candidate, existingForCar)) ||
        inferModelYearFromSources(candidate, existingForCar);

      if (hasGeneration && hasYear) return [];

      const year = new Date().getUTCFullYear();
      const aliases = brandAliases(candidate.brand);
      const shortBrand =
        aliases.length > 1 ? aliases[1] : candidate.brand;

      const queries = [
        `"${candidate.brand}" "${candidate.model}" generation code model years production period ${year} Europe`,
        `"${shortBrand}" "${candidate.model}" chassis code "${year}" OR "${year + 1}" model range`
      ];

      const groups = await Promise.all(
        queries.map(async query => {
          try {
            return await searchSources(query);
          } catch (error) {
            console.warn(
              `CARMATCH AI: identity follow-up search failed for ${candidate.brand} ${candidate.model}:`,
              error.message
            );
            return [];
          }
        })
      );

      const byUrl = new Map();

      for (const source of groups.flat()) {
        if (!source?.url || !vehicleMatchesSource(candidate, source)) {
          continue;
        }

        const old = byUrl.get(source.url);

        if (!old || (source.snippet || "").length > (old.snippet || "").length) {
          byUrl.set(source.url, source);
        }
      }

      return [...byUrl.values()]
        .filter(source => !seen.has(source.url))
        .sort((a, b) =>
          sourceIdentityScore(candidate, b) -
          sourceIdentityScore(candidate, a)
        )
        .slice(0, MAX_IDENTITY_RESEARCH_SOURCES_PER_CAR);
    })
  );

  const combined = [...existingSources];
  const addedUrls = new Set();

  let nextId = combined.reduce((max, source) => {
    const n = Number(
      String(source.id || "").replace(/^S/i, "")
    );

    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 0) + 1;

  for (const rows of additionsByCandidate) {
    for (const source of rows) {
      if (seen.has(source.url) || addedUrls.has(source.url)) {
        continue;
      }

      addedUrls.add(source.url);

      combined.push({
        id: `S${nextId++}`,
        title: source.title,
        url: source.url,
        snippet: source.snippet
      });
    }
  }

  return combined.slice(0, MAX_TOTAL_SOURCES);
}

/* ---------------------------- MAIN SEARCH ---------------------------- */

function canonicalizeFinalCars(candidates, rawCars) {
  if (!Array.isArray(rawCars) || rawCars.length !== 3) {
    throw new HttpError(
      "Finálna odpoveď neobsahuje presne tri autá.",
      502,
      "INVALID_CAR_RESULTS"
    );
  }

  const used = new Set();

  return rawCars.map((raw, index) => {
    const rawBrand = cleanString(raw?.brand, 80);
    const rawModel = cleanString(raw?.model, 100);
    const modelKey = normalized(rawModel);

    const matches = candidates
      .map((candidate, candidateIndex) => ({
        candidate,
        candidateIndex
      }))
      .filter(({ candidate, candidateIndex }) =>
        !used.has(candidateIndex) &&
        Boolean(rawBrand) &&
        brandMatchesText(candidate.brand, rawBrand) &&
        modelKey === normalized(candidate.model)
      );

    if (matches.length !== 1) {
      throw new HttpError(
        `Finálna odpoveď AI zmenila alebo nejednoznačne označila vozidlo č. ${index + 1}. Očakávané modely sa musia zachovať; značka môže mať iba známy oficiálny alias.`,
        502,
        "CAR_IDENTITY_CHANGED",
        {
          expectedCandidates: candidates.map(car =>
            `${car.brand} ${car.model}`
          ),
          received: rawCars.map(car => ({
            brand: cleanString(car?.brand, 80),
            model: cleanString(car?.model, 100)
          }))
        }
      );
    }

    const { candidate, candidateIndex } = matches[0];

    used.add(candidateIndex);

    return {
      ...raw,
      brand: candidate.brand,
      model: candidate.model,
      name: `${candidate.brand} ${candidate.model}`
    };
  });
}

async function buildCars(input) {
  const generalRows = await searchSources(
    buildGeneralQuery(input)
  ).catch(error => {
    console.warn(
      "CARMATCH AI: general web search failed:",
      error.message
    );
    return [];
  });

  const generalSources = assignSourceIds(
    generalRows,
    1,
    4
  );

  const candidateResult = await generateAI(
    candidatePrompt(input, generalSources),
    {
      maxOutputTokens: 350,
      schema: CANDIDATE_SCHEMA,
      schemaName: "carmatch_candidates"
    }
  );

  if (
    !Array.isArray(candidateResult?.cars) ||
    candidateResult.cars.length !== 3
  ) {
    throw new HttpError(
      "AI nedokázala vybrať presne tri kandidátske vozidlá.",
      502,
      "INVALID_CANDIDATES"
    );
  }

  const candidates = candidateResult.cars.map((candidate, index) => {
    const brand = cleanString(candidate?.brand, 80);
    const model = cleanString(candidate?.model, 100);

    if (!brand || !model) {
      throw new HttpError(
        `Pri kandidátovi č. ${index + 1} chýba značka alebo model.`,
        502,
        "CANDIDATE_IDENTITY_INCOMPLETE"
      );
    }

    return { brand, model };
  });

  const unique = new Set(
    candidates.map(car =>
      normalized(`${car.brand} ${car.model}`)
    )
  );

  if (unique.size !== 3) {
    throw new HttpError(
      "AI vybrala duplicitné modely namiesto troch odlišných vozidiel.",
      502,
      "DUPLICATE_CARS"
    );
  }

  const {
    all: modelSources,
    perCar: sourceGroups
  } = await collectModelSources(
    candidates,
    generalSources.length + 1
  );

  const relevantSources = [
    ...generalSources,
    ...modelSources
  ].slice(0, MAX_TOTAL_SOURCES);

  const finalResult = await generateAI(
    detailedPrompt(input, candidates, sourceGroups),
    {
      maxOutputTokens: 2600,
      schema: FINAL_SCHEMA,
      schemaName: "carmatch_vehicle_results"
    }
  );

  if (
    !Array.isArray(finalResult?.cars) ||
    finalResult.cars.length !== 3
  ) {
    throw new HttpError(
      "AI nevrátila presne tri kompletné vozidlá.",
      502,
      "INVALID_CAR_RESULTS"
    );
  }

  const canonicalFinalCars = canonicalizeFinalCars(
    candidates,
    finalResult.cars
  );

  const verifiedSources = await supplementIdentitySources(
    candidates,
    canonicalFinalCars,
    relevantSources
  );

  const cars = canonicalFinalCars.map(raw =>
    normalizeCar(raw, verifiedSources, input.filters)
  );

  const identities = new Set(
    cars.map(car =>
      normalized(`${car.brand} ${car.model}`)
    )
  );

  if (identities.size !== 3) {
    throw new HttpError(
      "Výsledok obsahuje duplicitné modely.",
      502,
      "DUPLICATE_CARS"
    );
  }

  validateFilters(cars, input.filters);

  const withPhotos = await Promise.all(
    cars.map(car => findPhotosForCar(car))
  );

  if (
    withPhotos.length !== 3 ||
    withPhotos.some(car => !car.image || !car.photoSource)
  ) {
    throw new HttpError(
      "Nepodarilo sa zabezpečiť overiteľnú fotografiu pre všetky tri vozidlá.",
      502,
      "THREE_PHOTOS_REQUIRED"
    );
  }

  return {
    cars: withPhotos,
    sources: verifiedSources
  };
}

/* ---------------------------- REQUEST HANDLER ---------------------------- */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return json(res, 405, {
      message: "Method not allowed",
      error: "Method not allowed"
    });
  }

  let token = "";
  let consumed = false;
  let remaining = null;

  try {
    const input = normalizeInput(
      parseBody(req.body)
    );

    if (!SUPABASE_URL || !SUPABASE_API_KEY) {
      throw new HttpError(
        "Supabase nie je nakonfigurovaný vo Vercel Environment Variables.",
        500,
        "SUPABASE_CONFIG"
      );
    }

    if (!GROQ_API_KEY && !OPENROUTER_API_KEY) {
      throw new HttpError(
        "AI poskytovateľ nie je nakonfigurovaný. Nastav GROQ_API_KEY alebo OPENROUTER_API_KEY.",
        500,
        "AI_CONFIG"
      );
    }

    if (!SERPER_API_KEY && !TAVILY_API_KEY) {
      throw new HttpError(
        "Chýba SERPER_API_KEY alebo TAVILY_API_KEY. Bez webového vyhľadávania nie je možné overovať aktuálne údaje.",
        500,
        "WEB_SEARCH_CONFIG"
      );
    }

    token = bearerToken(req);

    await verifyUser(token);

    const quota = await consumeSearch(token);

    consumed = quota.consumed;
    remaining = quota.remaining;

    const result = await buildCars(input);

    return json(res, 200, {
      cars: result.cars,
      sources: result.sources,
      remaining,
      dailyLimit: DAILY_LIMIT,
      warning: null,
      message: "Vybrali sme tri vozidlá; pri každom je priradená fotografia a zdroj."
    });
  } catch (error) {
    console.error("CARMATCH AI backend error:", {
      message: error?.message,
      code: error?.code,
      statusCode: error?.statusCode,
      details: error?.details
    });

    let refund = {
      refunded: false
    };

    if (consumed && token) {
      refund = await refundSearch(token);
    }

    const status = Number(error?.statusCode) || 500;
    const message = cleanString(
      error?.message || "Backend error",
      700
    );

    return json(res, status, {
      message,
      error: message,
      code: error?.code || "BACKEND_ERROR",
      details: error?.details || undefined,
      refunded: Boolean(refund.refunded),
      refundError: refund.refunded
        ? undefined
        : refund.error || undefined
    });
  }
}