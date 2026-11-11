"use strict";

/* ============================================================
   CARMATCH AI — BACKEND v30
   Kompatibilita: frontend app.js v20
   Endpoint: POST /api/search
   package.json: { "type": "module" }

   OPRAVY v30:
   - Nižšia spotreba tokenov; max_completion_tokens pre Groq.
   - Rozpoznanie HTTP 429 a rozumný prechod na záložný model.
   - Kandidáti sa najprv vyberú podľa značky/modelu; generácia a rok
     sa overujú až po samostatnom webovom prieskume každého auta.
   - Modelový rok sa overuje v kontexte konkrétneho auta, nie podľa
     ľubovoľného čísla v texte zdroja.
   - Generácia podporuje aj zápisy ako 2nd generation / second generation.
   - Zdroje sa priraďujú ku konkrétnemu modelu na strane backendu.
   - Serper má záložné vyhľadávanie cez Tavily.
   - Zachováva presne 3 autá, filtre, fotografie, zdroje a refund.
   ============================================================ */

const DAILY_LIMIT = 5;
const MAX_QUERY_LENGTH = 1000;
const MAX_SOURCES_PER_CAR = 4;
const MAX_TOTAL_SOURCES = 16;
const MAX_SOURCE_SNIPPET = 520;
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
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }
  return {};
}

function parseNumeric(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  let raw = cleanString(value, 100).replace(/\u00A0/g, " ").replace(/\s/g, "");
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
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const keys = ["budget", "seats", "power", "trunk", "drive", "fuel", "body", "style", "length", "year", "avoid"];
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
    throw new HttpError("Zadaj požiadavku alebo nastav aspoň jeden filter.", 400, "EMPTY_SEARCH");
  }
  return { naturalLanguage, filters };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
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
    if (url.protocol !== "https:" || url.username || url.password) return "";
    if (["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname)) return "";
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
  if (!token) throw new HttpError("Prihlásenie vypršalo. Prihlás sa znova.", 401, "UNAUTHORIZED");

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
    throw new HttpError("Nepodarilo sa overiť Supabase reláciu.", 503, "SUPABASE_AUTH_UNAVAILABLE", error.message);
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
    throw new HttpError(`Supabase RPC ${name} sa nepodarilo kontaktovať.`, 503, "SUPABASE_RPC_UNAVAILABLE", error.message);
  }

  const data = await responseJson(response);
  if (!response.ok) {
    const error = new Error(cleanString(
      data?.message || data?.details || data?.hint || data?.error || `RPC ${name} failed`,
      500
    ));
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
  return ["PGRST202", "42883", "PGRST204"].includes(code) ||
    message.includes("could not find the function") ||
    (message.includes("function") && message.includes("does not exist"));
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

  for (const key of ["remaining", "remaining_searches", "searches_left", "remainingSearches", "left"]) {
    const number = Number(value[key]);
    if (value[key] !== undefined && Number.isFinite(number)) {
      return Math.max(0, Math.min(DAILY_LIMIT, Math.floor(number)));
    }
  }
  for (const key of ["search_count", "count", "used", "usage_count", "used_searches"]) {
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
  const status = String(value.status || value.code || value.error || "").toLowerCase();
  return value.allowed === false || value.success === false || value.ok === false ||
    value.limit_reached === true || value.daily_limit_reached === true || /limit|quota|exceed/.test(status);
}

async function consumeSearch(token) {
  const attempts = [
    { name: "increment_search", args: { daily_limit: DAILY_LIMIT, max_searches: DAILY_LIMIT } },
    { name: "consume_search", args: { daily_limit: DAILY_LIMIT, max_searches: DAILY_LIMIT } },
    { name: "use_search", args: {} }
  ];
  let lastMissing = null;

  for (const attempt of attempts) {
    try {
      const data = await callRpc(attempt.name, attempt.args, token);
      if (resultDenied(data)) {
        throw new HttpError("Dosiahol si denný limit 5 vyhľadávaní. Skús to znova zajtra.", 429, "DAILY_LIMIT_REACHED");
      }
      return { consumed: true, remaining: readRemaining(data), rpc: attempt.name };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (isLimitError(error)) {
        throw new HttpError("Dosiahol si denný limit 5 vyhľadávaní. Skús to znova zajtra.", 429, "DAILY_LIMIT_REACHED");
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
  for (const name of ["refund_search", "refund_search_usage", "decrement_search"]) {
    try {
      await callRpc(name, {}, token);
      return { refunded: true, function: name };
    } catch (error) {
      if (isMissingRpc(error)) continue;
      console.error(`CARMATCH AI: ${name} failed:`, error.message);
      return { refunded: false, error: error.message };
    }
  }
  return { refunded: false, error: "Refund RPC function not found" };
}

/* ---------------------------- WEB SEARCH ---------------------------- */

function buildGeneralQuery(input) {
  const f = input.filters;
  const parts = [input.naturalLanguage, "production cars Europe Slovakia official specifications EUR"];
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
      headers: { "X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, gl: "sk", hl: "en", num })
    },
    type === "images" ? IMAGE_TIMEOUT_MS : SEARCH_TIMEOUT_MS
  );
  const data = await responseJson(response);
  if (!response.ok) throw new Error(data?.message || data?.error || `Serper ${endpoint} HTTP ${response.status}`);
  return type === "images" ? (data.images || []) : (data.organic || []);
}

async function tavilySearch(query) {
  if (!TAVILY_API_KEY) return [];
  const response = await fetchWithTimeout(
    "https://api.tavily.com/search",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
  if (!response.ok) throw new Error(data?.message || `Tavily HTTP ${response.status}`);
  return (data.results || []).map(item => ({ title: item.title, link: item.url, snippet: item.content }));
}

function normalizeSource(item) {
  const url = safeHttpsUrl(item?.link || item?.url);
  if (!url) return null;
  const title = cleanString(item?.title || "Webový zdroj", 180);
  const snippet = cleanString(item?.snippet || item?.content || item?.description || "", MAX_SOURCE_SNIPPET);
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
      console.warn("CARMATCH AI: Serper search failed; trying Tavily:", error.message);
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

/* ---------------------------- AI PROVIDERS ---------------------------- */

function extractJson(value) {
  let raw = String(value || "").trim();
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(raw);
  } catch (_) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error("AI vrátila neplatný JSON.");
  }
}

function assistantContent(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(part => part?.text || "").join("\n");
  return data?.output_text || "";
}

function isRateLimitError(error) {
  return Number(error?.statusCode) === 429 ||
    /rate.?limit|tokens per minute|too many requests|tpm limit/i.test(String(error?.message || ""));
}

function retryAfterSeconds(headers) {
  const value = headers?.get?.("retry-after");
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}

async function callChat(provider, apiKey, model, prompt, maxOutputTokens) {
  const openrouter = provider === "openrouter";
  const url = openrouter
    ? "https://openrouter.ai/api/v1/chat/completions"
    : "https://api.groq.com/openai/v1/chat/completions";

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json"
  };
  if (openrouter) {
    headers["HTTP-Referer"] = process.env.APP_URL || "https://carmatchai.vercel.app";
    headers["X-Title"] = "CARMATCH AI";
  }

  const body = {
    model,
    messages: [
      {
        role: "system",
        content: "Si dôsledný automobilový rešeršný asistent. Nevymýšľaj fakty. Vráť iba validný JSON."
      },
      { role: "user", content: prompt }
    ],
    temperature: 0.1,
    response_format: { type: "json_object" }
  };

  // Groq používa max_completion_tokens; OpenRouter kompatibilný max_tokens.
  if (openrouter) body.max_tokens = maxOutputTokens;
  else body.max_completion_tokens = maxOutputTokens;

  const response = await fetchWithTimeout(
    url,
    { method: "POST", headers, body: JSON.stringify(body) },
    AI_TIMEOUT_MS
  );
  const data = await responseJson(response);

  if (!response.ok) {
    const error = new Error(data?.error?.message || data?.message || `${provider} HTTP ${response.status}`);
    error.statusCode = response.status;
    error.retryAfter = retryAfterSeconds(response.headers);

    // Niektoré OpenRouter modely nemusia podporovať JSON mode.
    if (openrouter && response.status === 400 && /response_format|json_object|structured output/i.test(error.message)) {
      delete body.response_format;
      const retry = await fetchWithTimeout(
        url,
        { method: "POST", headers, body: JSON.stringify(body) },
        AI_TIMEOUT_MS
      );
      const retryData = await responseJson(retry);
      if (!retry.ok) {
        const retryError = new Error(retryData?.error?.message || retryData?.message || `OpenRouter HTTP ${retry.status}`);
        retryError.statusCode = retry.status;
        retryError.retryAfter = retryAfterSeconds(retry.headers);
        throw retryError;
      }
      const retryContent = assistantContent(retryData);
      if (!retryContent) throw new Error("OpenRouter vrátil prázdnu odpoveď.");
      return extractJson(retryContent);
    }
    throw error;
  }

  const content = assistantContent(data);
  if (!content) throw new Error(`${provider} vrátil prázdnu odpoveď.`);
  return extractJson(content);
}

async function generateAI(prompt, options = {}) {
  const maxOutputTokens = Math.max(200, Math.min(3000, Number(options.maxOutputTokens) || 2200));
  const errors = [];
  let groqRateLimited = false;

  if (GROQ_API_KEY) {
    const primaryModel = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
    const fallbackModel = process.env.GROQ_FALLBACK_MODEL || "openai/gpt-oss-20b";
    const models = [...new Set([primaryModel, fallbackModel])];

    for (const model of models) {
      try {
        return await callChat("groq", GROQ_API_KEY, model, prompt, maxOutputTokens);
      } catch (error) {
        const limited = isRateLimitError(error);
        if (limited) groqRateLimited = true;
        errors.push(`Groq ${model}: ${error.message}`);
        console.error(`CARMATCH AI: Groq ${model}${limited ? " (rate limit)" : ""}:`, error.message);
        // Žiadne čakanie vo Vercel funkcii. Skúsime iný model alebo poskytovateľa.
      }
    }
  }

  if (OPENROUTER_API_KEY) {
    const models = [...new Set([
      process.env.OPENROUTER_MODEL || "qwen/qwen3.5-397b-a17b:free",
      process.env.OPENROUTER_FALLBACK_MODEL || "nvidia/nemotron-3-super-120b-a12b:free",
      "openrouter/free"
    ])];

    for (const model of models) {
      try {
        return await callChat("openrouter", OPENROUTER_API_KEY, model, prompt, maxOutputTokens);
      } catch (error) {
        errors.push(`OpenRouter ${model}: ${error.message}`);
        console.error(`CARMATCH AI: OpenRouter ${model}:`, error.message);
      }
    }
  }

  const lastErrors = errors.slice(-3).join(" | ");
  if (groqRateLimited && !OPENROUTER_API_KEY) {
    throw new HttpError(
      "Groq dočasne dosiahol limit tokenov. Skús vyhľadávanie znova o chvíľu alebo nastav OPENROUTER_API_KEY ako záložného poskytovateľa.",
      503,
      "AI_RATE_LIMITED",
      lastErrors
    );
  }
  throw new HttpError(
    errors.length
      ? `Nepodarilo sa získať odpoveď od AI. ${lastErrors}`
      : "Chýba GROQ_API_KEY aj OPENROUTER_API_KEY vo Vercel Environment Variables.",
    502,
    "AI_UNAVAILABLE",
    lastErrors || undefined
  );
}

function candidatePrompt(input, sources) {
  const sourceText = sources.map(s => `${s.id} | ${s.title}\n${s.snippet}`).join("\n\n");
  return `
Vyber presne TRI odlišné sériové automobily, ktoré najlepšie spĺňajú zadanie. Vráť výhradne JSON.
Dátum: ${new Date().toISOString().slice(0, 10)}.
Požiadavka: ${input.naturalLanguage || "Používateľ zadal iba filtre."}
Filtre: ${JSON.stringify(input.filters)}
Krátke všeobecné podklady:
${sourceText || "Žiadne."}
Pravidlá: vyber reálne sériové autá dostupné alebo relevantné pre európsky trh; rešpektuj filtre a značky, ktorým sa používateľ chce vyhnúť. Zatiaľ NEUVÁDZAJ generáciu, modelový rok, výkon ani cenu. Vyber iba značku a presný názov modelu. Nevyberaj koncepty.
Výstup: {"cars":[{"brand":"...","model":"..."}]}
`;
}

function modelResearchQueries(candidate) {
  const brand = cleanString(candidate.brand, 80);
  const model = cleanString(candidate.model, 100);
  const year = new Date().getUTCFullYear();
  return [
    `"${brand} ${model}" current generation code model year ${year} ${year + 1} official manufacturer Europe`,
    `"${brand} ${model}" generation launch year model year ${year} technical specifications Europe official`
  ];
}

async function collectModelSources(candidates, firstSourceId = 1) {
  const results = await Promise.all(candidates.map(async candidate => {
    const queries = modelResearchQueries(candidate);
    const pair = await Promise.all(queries.map(query =>
      searchSources(query).catch(error => {
        console.warn("CARMATCH AI: model source search failed:", error.message);
        return [];
      })
    ));

    const seen = new Set();
    const rows = [];
    for (const item of pair.flat()) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      rows.push(item);
      if (rows.length >= MAX_SOURCES_PER_CAR) break;
    }
    return rows;
  }));

  const all = [];
  const perCar = [];
  let next = firstSourceId;
  for (const rows of results) {
    const assigned = assignSourceIds(rows, next, MAX_SOURCES_PER_CAR);
    perCar.push(assigned);
    all.push(...assigned);
    next += assigned.length;
  }
  return { all: all.slice(0, MAX_TOTAL_SOURCES), perCar };
}

function detailedPrompt(input, candidates, sourceGroups) {
  const evidence = candidates.map((candidate, index) => {
    const sources = sourceGroups[index] || [];
    return `AUTO ${index + 1}: ${candidate.brand} ${candidate.model}\n` +
      (sources.length
        ? sources.map(s => `${s.id} | ${s.title}\n${s.snippet}\nURL: ${s.url}`).join("\n\n")
        : "Žiadne použiteľné zdroje sa nenašli.");
  }).join("\n\n----------------\n\n");

  return `
Si automobilový rešeršný asistent pre Slovensko. Odpovedaj po slovensky a vráť výhradne validný JSON.
Dátum: ${new Date().toISOString().slice(0, 10)}.
POŽIADAVKA: ${input.naturalLanguage || "Používateľ zadal iba filtre."}
FILTRE: ${JSON.stringify(input.filters)}

SAMOSTATNÉ PODKLADY PRE KAŽDÉ Z TROCH ÁUT:
${evidence}

PRAVIDLÁ:
- Vráť presne tieto 3 značky a modely. Nemeň ich a nepridávaj ďalšie.
- Pre každé auto vyber konkrétnu generáciu (napr. kód generácie alebo jasné označenie generácie) a modelový rok iba vtedy, keď to podporuje jeho vlastný zdroj.
- Modelový rok nie je automaticky rok publikovania článku. Nezamieňaj rok výroby, rok článku a modelový rok.
- Ak generáciu alebo modelový rok nemožno spoľahlivo potvrdiť, pre dané pole vráť null. Nevymýšľaj ich.
- sourceIds uveď ako ID zdrojov priradených k danému autu, ktoré skutočne podporujú jeho identitu.
- Výkon iba v kW. Spotreba iba WLTP. Kufor musí patriť konkrétnej karosérii/verzii.
- Cena v EUR iba pri dôkaze pre konkrétnu verziu/trh; inak "Cena neoverená". Nevypočítavaj odhadom.
- Nezamieňaj systémový výkon hybridu s výkonom spaľovacieho motora.
- Motor, palivo, prevodovka, pohon, karoséria a sedadlá iba pri zdroji, ktorý ich potvrdzuje.
- officialUrl a configurator musia byť presné URL výrobcu prítomné v zdrojoch daného modelu. priceSource musí podporovať konkrétnu EUR cenu.
- Žiadne vymyslené skóre, URL, ceny ani servisné sumy. Neznáme údaje nastav na null alebo "Neoverené".
- reason, pros, cons a maintenance píš stručne a realisticky; nevymýšľaj špecifické poruchy ani servisné náklady.

JSON:
{"cars":[{"brand":"...","model":"...","name":"...","generation":"... alebo null","modelYear":2026,"trim":"...","body":"...","price":"od 45 000 € alebo Cena neoverená","priceSource":"https://... alebo prázdne","power":"150 kW alebo Neoverené","engine":"...","consumptionWltp":"...","seats":5,"trunkLiters":600,"drivetrain":"...","fuel":"...","transmission":"...","lengthMm":4800,"reason":"...","pros":["..."],"cons":["..."],"maintenance":"...","configurator":"...","officialUrl":"...","sourceIds":["S1"]}]}
`;
}

/* ---------------------------- EVIDENCE VALIDATION ---------------------------- */

function tokens(value) {
  return normalized(value).split(" ").filter(token => token.length >= 2);
}

function vehicleMatchesSource(car, source) {
  const haystack = normalized(`${source.title} ${source.snippet} ${source.url}`);
  const brandTokens = tokens(car.brand);
  const modelTokens = tokens(car.model);
  return brandTokens.length > 0 && modelTokens.length > 0 &&
    brandTokens.every(token => haystack.includes(token)) &&
    modelTokens.every(token => haystack.includes(token));
}

function relevantSourcesForCar(car, sources) {
  return sources.filter(source => vehicleMatchesSource(car, source));
}

function approximatelyEqual(a, b, percent = 0.02, minimum = 1) {
  return Math.abs(a - b) <= Math.max(minimum, Math.abs(a) * percent);
}

function numberList(value) {
  const matches = String(value || "").match(/\d+(?:[\s.,]\d{3})*(?:[.,]\d+)?/g) || [];
  return matches.map(item => {
    let raw = item.replace(/\s/g, "");
    if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(raw)) raw = raw.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(raw)) raw = raw.replace(/,/g, "");
    else if (raw.includes(",") && !raw.includes(".")) raw = raw.replace(",", ".");
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }).filter(n => n !== null);
}

function verifyPower(value, evidence) {
  const match = String(value || "").match(/(\d+(?:[.,]\d+)?)\s*kW\b/i);
  if (!match || !evidence) return false;
  const amount = Number(match[1].replace(",", "."));
  const kws = [...evidence.matchAll(/(\d+(?:[.,]\d+)?)\s*kW\b/gi)].map(m => Number(m[1].replace(",", ".")));
  const hps = [...evidence.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:hp|bhp)\b/gi)].map(m => Number(m[1].replace(",", ".")));
  return kws.some(n => approximatelyEqual(amount, n, 0.02, 2)) ||
    hps.some(n => approximatelyEqual(amount * 1.341022, n, 0.025, 3));
}

function verifyUnitNumber(value, evidence, unitPattern, tolerance = 0.02, minimum = 1) {
  const amount = parseNumeric(value);
  if (amount === null || !evidence) return false;
  const regex = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${unitPattern}`, "gi");
  return [...evidence.matchAll(regex)].some(match =>
    approximatelyEqual(amount, Number(match[1].replace(",", ".")), tolerance, minimum)
  );
}

function verifySeats(value, evidence) {
  const n = parseNumeric(value);
  if (n === null || !Number.isInteger(n) || n < 1 || n > 9 || !evidence) return false;
  return new RegExp(`\\b${n}\\s*(?:seats?|seater|passengers?|miest(?:a|ami)?|sedadiel)\\b`, "i").test(evidence) ||
    new RegExp(`(?:seats?|seating|miest|sedadiel)[^\\n]{0,45}\\b${n}\\b`, "i").test(evidence);
}

function verifyPrice(value, evidence) {
  if (!value || !evidence || !/(?:€|\bEUR\b)/i.test(String(value))) return false;
  const requested = numberList(value).filter(n => n >= 1000);
  if (!requested.length) return false;
  const regex = /(?:€\s*|EUR\s*)(\d[\d\s.,]{2,})|(\d[\d\s.,]{2,})\s*(?:€|EUR)(?![A-Za-z])/gi;
  const found = [];
  for (const match of evidence.matchAll(regex)) {
    found.push(...numberList(match[1] || match[2]).filter(n => n >= 1000));
  }
  return requested.some(n => found.some(v => approximatelyEqual(n, v, 0.025, 100)));
}

function verifyText(value, evidence, minimumTokens = 1) {
  const words = normalized(value).split(" ").filter(word => word.length >= 2);
  if (!words.length || !evidence) return false;
  const haystack = normalized(evidence);
  const hits = words.filter(word => haystack.includes(word)).length;
  return hits >= Math.min(minimumTokens, words.length) && hits === words.length;
}

function verifyGeneration(value, evidence) {
  const candidate = cleanString(value, 100);
  if (!candidate || !evidence) return false;
  const rawNorm = normalized(candidate);
  const evidenceNorm = normalized(evidence);
  if (rawNorm && evidenceNorm.includes(rawNorm)) return true;

  // Kódy generácií typu X247, W206, G70 musia byť v zdroji doslova.
  const codes = candidate.match(/\b[A-Z]{1,3}\d{2,4}\b/gi) || [];
  if (codes.length) return codes.every(code => evidenceNorm.includes(normalized(code)));

  // Ekvivalentné zápisy poradového čísla generácie v SK/EN zdrojoch.
  const ordinalMatch = candidate.match(/\b(1|2|3|4|first|second|third|fourth|1st|2nd|3rd|4th|prv[aáy]?|druh[aáy]?|tret[ií]a?|štvrt[aáy]?)\b/i);
  if (ordinalMatch && /generat|generation|generaci|generac/i.test(candidate)) {
    const ordinal = ordinalMatch[1].toLowerCase();
    const variants = {
      "1": ["first generation", "1st generation", "1 generation", "1 generacia", "prva generacia"],
      "first": ["first generation", "1st generation", "1 generacia", "prva generacia"],
      "1st": ["first generation", "1st generation", "1 generacia", "prva generacia"],
      "2": ["second generation", "2nd generation", "2 generation", "2 generacia", "druha generacia"],
      "second": ["second generation", "2nd generation", "2 generacia", "druha generacia"],
      "2nd": ["second generation", "2nd generation", "2 generacia", "druha generacia"],
      "3": ["third generation", "3rd generation", "3 generation", "3 generacia", "tretia generacia"],
      "third": ["third generation", "3rd generation", "3 generacia", "tretia generacia"],
      "3rd": ["third generation", "3rd generation", "3 generacia", "tretia generacia"],
      "4": ["fourth generation", "4th generation", "4 generation", "4 generacia", "stvrta generacia"],
      "fourth": ["fourth generation", "4th generation", "4 generacia", "stvrta generacia"],
      "4th": ["fourth generation", "4th generation", "4 generacia", "stvrta generacia"]
    };
    return (variants[ordinal] || []).some(variant => evidenceNorm.includes(normalized(variant)));
  }
  return verifyText(candidate, evidence, 1);
}

function verifyModelYear(value, car, sources) {
  const year = parseNumeric(value);
  if (!Number.isInteger(year) || year < 1990 || year > 2035) return false;
  const brandTokens = tokens(car.brand);
  const modelTokens = tokens(car.model);

  return sources.some(source => {
    const title = normalized(source.title);
    const snippet = normalized(source.snippet);
    const url = normalized(source.url);
    const all = `${title} ${snippet} ${url}`;
    const yearText = String(year);
    if (!all.includes(yearText)) return false;
    if (!brandTokens.every(token => all.includes(token))) return false;
    if (!modelTokens.every(token => all.includes(token))) return false;

    // Silná zhoda: rok v titulku spolu s konkrétnou značkou a modelom.
    const titleHasVehicle = brandTokens.every(token => title.includes(token)) &&
      modelTokens.every(token => title.includes(token));
    if (titleHasVehicle && title.includes(yearText)) return true;

    // Alebo explicitné označenie modelového roku v tom istom zdroji.
    const explicitYearContext = new RegExp(
      `(?:model\\s*year|model-year|model\\s*yr|my\\s*)\\s*${yearText}\\b|\\b${yearText}\\s*(?:model\\s*year|model\\s*yr|model)\\b`,
      "i"
    ).test(`${source.title} ${source.snippet} ${source.url}`);
    return explicitYearContext;
  });
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
      return new URL(source.url).hostname.replace(/^www\./, "") === host;
    } catch (_) {
      return false;
    }
  }) ? url : "";
}

function parsePowerKw(value) {
  const match = String(value || "").match(/(\d+(?:[.,]\d+)?)\s*kW\b/i);
  return match ? Number(match[1].replace(",", ".")) : null;
}

function cleanIdentity(raw) {
  const brand = cleanString(raw.brand, 80);
  const model = cleanString(raw.model, 100);
  if (!brand || !model) throw new Error("AI nevrátila samostatnú značku a model.");
  return { brand, model, name: cleanString(raw.name, 160) || `${brand} ${model}` };
}

function normalizeCar(rawCar, allSources, filters) {
  const raw = rawCar && typeof rawCar === "object" && !Array.isArray(rawCar) ? rawCar : {};
  const identity = cleanIdentity(raw);

  // Zdroje vyberá backend podľa značky a modelu. AI nemôže omylom
  // odkázať iba na jeden neúplný zdroj alebo na zdroj iného auta.
  const carSources = relevantSourcesForCar(identity, allSources);
  const sourceIds = carSources.map(source => source.id);
  const evidence = carSources.map(source => `${source.title}\n${source.snippet}\n${source.url}`).join("\n\n");

  if (!evidence) {
    throw new HttpError(`Pre ${identity.brand} ${identity.model} neexistuje priradený relevantný zdroj.`, 502, "MODEL_SOURCES_MISSING");
  }

  const generation = cleanString(raw.generation, 100);
  const yearValue = parseNumeric(raw.modelYear ?? raw.year);
  const generationVerified = verifyGeneration(generation, evidence);
  const yearVerified = verifyModelYear(yearValue, identity, carSources);

  if (!generationVerified || !yearVerified) {
    const missing = [
      !generationVerified ? "generáciu" : "",
      !yearVerified ? "modelový rok" : ""
    ].filter(Boolean).join(" a ");
    throw new HttpError(
      `Pri modeli ${identity.brand} ${identity.model} sa v jeho zdrojoch nepodarilo dostatočne potvrdiť ${missing}. Skús vyhľadávanie zopakovať.`,
      502,
      "MODEL_IDENTITY_NOT_VERIFIED",
      {
        generationReceived: generation || null,
        modelYearReceived: yearValue || null,
        checkedSources: carSources.map(source => ({ id: source.id, title: source.title }))
      }
    );
  }

  const modelYear = Math.round(yearValue);
  const rawPower = cleanString(raw.power, 80);
  const power = verifyPower(rawPower, evidence) ? rawPower : "Neoverené";
  const rawPrice = cleanString(raw.price, 100);
  const price = verifyPrice(rawPrice, evidence) ? rawPrice : "Cena neoverená";
  const seats = verifySeats(raw.seats, evidence) ? Number(raw.seats) : null;

  const trunkRaw = raw.trunkLiters ?? raw.trunk ?? raw.bootSpace;
  const trunkLiters = verifyUnitNumber(
    trunkRaw,
    evidence,
    "(?:l|litres?|liters?|litrov|litre)\\b",
    0.02,
    2
  ) ? parseNumeric(trunkRaw) : null;

  const lengthRaw = raw.lengthMm ?? raw.length;
  const lengthMm = verifyUnitNumber(lengthRaw, evidence, "mm\\b", 0.01, 5)
    ? parseNumeric(lengthRaw)
    : null;

  const consumptionRaw = cleanString(raw.consumptionWltp ?? raw.wltpConsumption, 80);
  let consumptionWltp = "Neoverené";
  if (consumptionRaw) {
    const numeric = parseNumeric(consumptionRaw);
    const unitPattern = /kWh/i.test(consumptionRaw)
      ? "kWh(?:\\s*\\/\\s*100\\s*km)?\\b"
      : "l(?:\\s*\\/\\s*100\\s*km)?\\b";
    if (numeric !== null && verifyUnitNumber(numeric, evidence, unitPattern, 0.05, 0.1)) {
      consumptionWltp = consumptionRaw;
    }
  }

  const textField = (value, fallback = "Neoverené") => {
    const candidate = cleanString(value, 100);
    return candidate && verifyText(candidate, evidence, 1) ? candidate : fallback;
  };

  const priceSource = price !== "Cena neoverená" ? verifyOfficialUrl(raw.priceSource, sourceIds, carSources) : "";
  const configurator = verifyOfficialUrl(raw.configurator, sourceIds, carSources);
  const officialUrl = verifyOfficialUrl(raw.officialUrl, sourceIds, carSources);

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
    pros: Array.isArray(raw.pros) ? raw.pros.slice(0, 5).map(item => cleanString(item, 180)).filter(Boolean) : [],
    cons: Array.isArray(raw.cons) ? raw.cons.slice(0, 5).map(item => cleanString(item, 180)).filter(Boolean) : [],
    maintenance: cleanString(raw.maintenance, 500),
    configurator,
    officialUrl,
    sourceIds
  };
}

function validateFilters(cars, filters) {
  for (const car of cars) {
    if (filters.seats && (car.seats === null || car.seats < filters.seats)) {
      throw new HttpError(`${car.name}: počet sedadiel nespĺňa alebo sa nepodarilo overiť zadaný filter.`, 502, "FILTER_NOT_VERIFIED");
    }
    if (filters.power && (parsePowerKw(car.power) === null || parsePowerKw(car.power) < filters.power)) {
      throw new HttpError(`${car.name}: výkon nespĺňa alebo sa nepodarilo overiť zadaný filter.`, 502, "FILTER_NOT_VERIFIED");
    }
    if (filters.trunk && (car.trunkLiters === null || car.trunkLiters < filters.trunk)) {
      throw new HttpError(`${car.name}: objem kufra nespĺňa alebo sa nepodarilo overiť zadaný filter.`, 502, "FILTER_NOT_VERIFIED");
    }
    if (filters.length && (car.lengthMm === null || car.lengthMm > filters.length * 1000)) {
      throw new HttpError(`${car.name}: dĺžka vozidla nespĺňa alebo sa nepodarilo overiť zadaný filter.`, 502, "FILTER_NOT_VERIFIED");
    }
    if (filters.budget) {
      const priceAmount = car.price === "Cena neoverená" ? null : parseNumeric(car.price);
      if (priceAmount === null || priceAmount > filters.budget) {
        throw new HttpError(`${car.name}: cenu sa nepodarilo overiť v rámci zadaného rozpočtu.`, 502, "FILTER_NOT_VERIFIED");
      }
    }
    if (filters.avoid && normalized(filters.avoid).split(" ").some(token => token && normalized(car.brand).includes(token))) {
      throw new HttpError(`${car.name}: značka je uvedená medzi značkami, ktorým sa chceš vyhnúť.`, 502, "FILTER_NOT_VERIFIED");
    }
  }
}

/* ---------------------------- PHOTO SEARCH ---------------------------- */

function rejectedPhotoText(value) {
  return /\b(logo|emblem|badge|interior|dashboard|cockpit|steering|brochure|manual|diagram|drawing|illustration|render|toy|model kit|scale model|miniature|poster|screenshot|crash|accident|spare part|technical drawing|wallpaper)\b/i.test(normalized(value));
}

function generationPhotoMatch(haystack, car) {
  const generation = cleanString(car.generation, 100);
  if (!generation) return false;
  const normalizedHaystack = normalized(haystack);
  const codes = generation.match(/\b[A-Z]{1,3}\d{2,4}\b/gi) || [];
  if (codes.length) return codes.every(code => normalizedHaystack.includes(normalized(code)));
  const gen = normalized(generation);
  if (gen.length >= 6 && normalizedHaystack.includes(gen)) return true;
  const ordinalMatch = generation.match(/\b(1|2|3|4|first|second|third|fourth|1st|2nd|3rd|4th)\b/i);
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
  return (alternatives[word] || []).some(term => normalizedHaystack.includes(normalized(term)));
}

function photoMetadataMatches(item, car) {
  const title = cleanString(item.title, 350);
  const sourceUrl = safeHttpsUrl(item.link || item.source || item.descriptionurl);
  const haystack = normalized(`${title} ${sourceUrl}`);
  if (!haystack || rejectedPhotoText(title)) return false;

  const brandTokens = tokens(car.brand);
  const modelTokens = tokens(car.model);
  if (!brandTokens.length || !modelTokens.length) return false;
  if (!brandTokens.every(token => haystack.includes(token))) return false;
  if (!modelTokens.every(token => haystack.includes(token))) return false;

  // Prijmeme presný modelový rok alebo overiteľný kód/názov generácie.
  const yearMatch = haystack.includes(String(car.modelYear));
  const generationMatch = generationPhotoMatch(`${title} ${sourceUrl}`, car);
  return yearMatch || generationMatch;
}

async function searchSerperPhotos(car) {
  if (!SERPER_API_KEY) return [];
  const query = `"${car.brand} ${car.model}" "${car.generation}" ${car.modelYear} exterior real production car`;
  const rows = await serperSearch(query, "images", 20);
  const output = [];
  const seen = new Set();

  for (const item of rows) {
    if (!photoMetadataMatches(item, car)) continue;
    const url = safeHttpsUrl(item.imageUrl || item.thumbnailUrl);
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
  const query = `"${car.brand} ${car.model}" "${car.generation}" ${car.modelYear} exterior`;
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
    { method: "GET", headers: { Accept: "application/json" } },
    IMAGE_TIMEOUT_MS
  );
  if (!response.ok) return [];
  const data = await responseJson(response);
  const pages = Object.values(data?.query?.pages || {});
  const output = [];
  const seen = new Set();

  for (const page of pages) {
    const title = cleanString(page?.title, 300).replace(/^File:/i, "");
    const info = page?.imageinfo?.[0] || {};
    const item = { title, link: info.descriptionurl || page?.canonicalurl };
    if (!photoMetadataMatches(item, car)) continue;

    const url = safeHttpsUrl(info.thumburl || info.url);
    const source = safeHttpsUrl(info.descriptionurl || page?.canonicalurl);
    if (!url || !source || seen.has(url)) continue;
    seen.add(url);
    output.push({ url, source, title, width: Number(info.width) || null, height: Number(info.height) || null });
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
      console.warn(`CARMATCH AI: Serper image search failed for ${car.name}:`, error.message);
    }
  }
  if (!photos.length) {
    try {
      photos = await searchCommonsPhotos(car);
    } catch (error) {
      console.warn(`CARMATCH AI: Wikimedia image search failed for ${car.name}:`, error.message);
    }
  }
  if (!photos.length) {
    throw new HttpError(
      `Pre ${car.name} sa nepodarilo nájsť fotografiu, ktorej názov alebo zdroj potvrdzuje model a jeho generáciu/rok. Výsledok bez fotografie nezobrazíme.`,
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

/* ---------------------------- MAIN SEARCH ---------------------------- */

async function buildCars(input) {
  const generalRows = await searchSources(buildGeneralQuery(input)).catch(error => {
    console.warn("CARMATCH AI: general web search failed:", error.message);
    return [];
  });
  const generalSources = assignSourceIds(generalRows, 1, 4);

  // 1. AI vyberá iba značku a model. Generáciu/rok nehádame bez zdrojov.
  const candidateResult = await generateAI(candidatePrompt(input, generalSources), { maxOutputTokens: 300 });
  if (!Array.isArray(candidateResult?.cars) || candidateResult.cars.length !== 3) {
    throw new HttpError("AI nedokázala vybrať presne tri kandidátske vozidlá.", 502, "INVALID_CANDIDATES");
  }

  const candidates = candidateResult.cars.map((candidate, index) => {
    const brand = cleanString(candidate?.brand, 80);
    const model = cleanString(candidate?.model, 100);
    if (!brand || !model) {
      throw new HttpError(`Pri kandidátovi č. ${index + 1} chýba značka alebo model.`, 502, "CANDIDATE_IDENTITY_INCOMPLETE");
    }
    return { brand, model };
  });

  const unique = new Set(candidates.map(car => normalized(`${car.brand} ${car.model}`)));
  if (unique.size !== 3) {
    throw new HttpError("AI vybrala duplicitné modely namiesto troch odlišných vozidiel.", 502, "DUPLICATE_CARS");
  }

  // 2. Každé auto má vlastné vyhľadávacie otázky a vlastnú skupinu zdrojov.
  const { all: modelSources, perCar: sourceGroups } = await collectModelSources(candidates, generalSources.length + 1);
  const relevantSources = [...generalSources, ...modelSources].slice(0, MAX_TOTAL_SOURCES);

  // 3. Finálny model dostane krátke, oddelené podklady ku každému autu.
  const finalResult = await generateAI(detailedPrompt(input, candidates, sourceGroups), { maxOutputTokens: 2600 });
  if (!Array.isArray(finalResult?.cars) || finalResult.cars.length !== 3) {
    throw new HttpError("AI nevrátila presne tri kompletné vozidlá.", 502, "INVALID_CAR_RESULTS");
  }

  const cars = finalResult.cars.map(raw => normalizeCar(raw, relevantSources, input.filters));
  const identities = new Set(cars.map(car => normalized(`${car.brand} ${car.model}`)));
  if (identities.size !== 3) throw new HttpError("Výsledok obsahuje duplicitné modely.", 502, "DUPLICATE_CARS");

  for (const candidate of candidates) {
    const expected = normalized(`${candidate.brand} ${candidate.model}`);
    if (!cars.some(car => normalized(`${car.brand} ${car.model}`) === expected)) {
      throw new HttpError("Finálna odpoveď zmenila niektorý z preskúmaných modelov. Výsledok bol odmietnutý.", 502, "CAR_IDENTITY_CHANGED");
    }
  }

  validateFilters(cars, input.filters);

  const withPhotos = await Promise.all(cars.map(car => findPhotosForCar(car)));
  if (withPhotos.length !== 3 || withPhotos.some(car => !car.image || !car.photoSource)) {
    throw new HttpError("Nepodarilo sa zabezpečiť overiteľnú fotografiu pre všetky tri vozidlá.", 502, "THREE_PHOTOS_REQUIRED");
  }

  return { cars: withPhotos, sources: relevantSources };
}

/* ---------------------------- REQUEST HANDLER ---------------------------- */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { message: "Method not allowed", error: "Method not allowed" });
  }

  let token = "";
  let consumed = false;
  let remaining = null;

  try {
    const input = normalizeInput(parseBody(req.body));

    if (!SUPABASE_URL || !SUPABASE_API_KEY) {
      throw new HttpError("Supabase nie je nakonfigurovaný vo Vercel Environment Variables.", 500, "SUPABASE_CONFIG");
    }
    if (!GROQ_API_KEY && !OPENROUTER_API_KEY) {
      throw new HttpError("AI poskytovateľ nie je nakonfigurovaný. Nastav GROQ_API_KEY alebo OPENROUTER_API_KEY.", 500, "AI_CONFIG");
    }
    if (!SERPER_API_KEY && !TAVILY_API_KEY) {
      throw new HttpError("Chýba SERPER_API_KEY alebo TAVILY_API_KEY. Bez webového vyhľadávania nie je možné overovať aktuálne údaje.", 500, "WEB_SEARCH_CONFIG");
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

    let refund = { refunded: false };
    if (consumed && token) refund = await refundSearch(token);

    const status = Number(error?.statusCode) || 500;
    const message = cleanString(error?.message || "Backend error", 700);
    return json(res, status, {
      message,
      error: message,
      code: error?.code || "BACKEND_ERROR",
      details: error?.details || undefined,
      refunded: Boolean(refund.refunded),
      refundError: refund.refunded ? undefined : refund.error || undefined
    });
  }
}
