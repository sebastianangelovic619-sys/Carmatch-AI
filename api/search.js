"use strict";

/* ============================================================
   CARMATCH AI — BACKEND v28 (REKONŠTRUKCIA)

   Kompatibilita: frontend app.js v20
   Endpoint: /api/search
   Modul: ES modules (package.json: "type": "module")

   Vstup:
     { naturalLanguage: string, filters: { budget, seats, power,
       trunk, drive, fuel, body, style, length, year, avoid } }

   Úspešná odpoveď:
     { cars: [3 vozidlá], remaining: number|null,
       dailyLimit: 5, sources: [], warning: string|null }

   Funkcie:
   - Supabase Auth cez Bearer token
   - limit 5 vyhľadávaní/deň cez Supabase RPC
   - refund pri chybe po odpočítaní vyhľadávania
   - Groq 120B -> 20B, potom OpenRouter fallback
   - Serper alebo Tavily webové zdroje (ak je nastavený kľúč)
   - zdroje S1...S6 a konzervatívna kontrola číselných údajov
   - presné oddelenie brand/model pre vyhľadávanie fotografií vo fronte
   - nikdy nevytvára vlastné skóre zhody ani vymyslené URL obrázkov
   ============================================================ */

const DAILY_LIMIT = 5;
const MAX_QUERY_LENGTH = 1000;
const MAX_SOURCE_COUNT = 6;
const MAX_SOURCE_SNIPPET = 650;
const AUTH_TIMEOUT_MS = 8000;
const RPC_TIMEOUT_MS = 8000;
const SEARCH_TIMEOUT_MS = 8000;
const AI_TIMEOUT_MS = 42000;

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_API_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "";

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
  const value = String(header(req, "authorization") || "").trim();
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function cleanString(value, maxLength = 500) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return "";
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
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
  let raw = cleanString(value, 80).replace(/\u00A0/g, " ").trim();
  if (!raw) return null;
  raw = raw.replace(/\s/g, "");
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
      const valueText = cleanString(value, key === "avoid" ? 500 : 120);
      if (valueText) filters[key] = valueText;
    }
  }
  return filters;
}

function normalizeInput(body) {
  const naturalLanguage = cleanString(
    body.naturalLanguage ?? body.query ?? body.prompt ?? body.request ?? "",
    MAX_QUERY_LENGTH
  );
  const filters = normalizeFilters(body.filters);
  if (!naturalLanguage && Object.keys(filters).length === 0) {
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
  if (!token) {
    throw new HttpError("Prihlásenie vypršalo. Prihlás sa znova.", 401, "UNAUTHORIZED");
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
    throw new HttpError("Nepodarilo sa overiť Supabase reláciu.", 503, "SUPABASE_AUTH_UNAVAILABLE", error.message);
  }

  const data = await responseJson(response);
  if (!response.ok || !data?.id) {
    throw new HttpError(
      "Supabase relácia je neplatná alebo expirovaná. Prihlás sa znova.",
      401,
      "invalid_token",
      data?.message || data?.msg || data?.error_description || undefined
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
    const message = cleanString(data?.message || data?.details || data?.hint || data?.error || `RPC ${name} failed`, 500);
    const error = new Error(message);
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
  const message = String(error?.message || "").toLowerCase();
  return /daily.?limit|limit.?reached|quota|too many|maximum.*search|search limit|denn.{0,8}limit|limit vyhľad/.test(message);
}

function firstObject(data) {
  return Array.isArray(data) ? (data[0] ?? null) : data;
}

function readRemaining(data) {
  const value = firstObject(data);
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(DAILY_LIMIT, Math.floor(value)));
  }
  if (typeof value === "boolean" || value === null || value === undefined) return null;
  if (typeof value !== "object") return null;

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
    value.limit_reached === true || value.daily_limit_reached === true ||
    /limit|quota|exceed/.test(status);
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
      return {
        consumed: true,
        remaining: readRemaining(data),
        rpc: attempt.name
      };
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

/* ---------------------------- WEB SOURCES ---------------------------- */

function buildSearchQuery(input) {
  const f = input.filters;
  const pieces = [input.naturalLanguage];
  if (f.budget) pieces.push(`budget up to ${f.budget} EUR`);
  if (f.seats) pieces.push(`${f.seats} seats`);
  if (f.power) pieces.push(`minimum power ${f.power} kW`);
  if (f.trunk) pieces.push(`minimum trunk ${f.trunk} litres`);
  if (f.drive) pieces.push(`drive ${f.drive}`);
  if (f.fuel) pieces.push(`fuel ${f.fuel}`);
  if (f.body) pieces.push(`body ${f.body}`);
  if (f.style) pieces.push(`style ${f.style}`);
  if (f.length) pieces.push(`maximum length ${f.length} m`);
  if (f.year) pieces.push(`model year from ${f.year}`);
  if (f.avoid) pieces.push(`exclude brands ${f.avoid}`);
  pieces.push("official manufacturer specifications European price EUR dimensions WLTP boot capacity power kW");
  return pieces.filter(Boolean).join("; ").slice(0, 1400);
}

async function serperSearch(query) {
  const response = await fetchWithTimeout(
    "https://google.serper.dev/search",
    {
      method: "POST",
      headers: { "X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, gl: "sk", hl: "en", num: 8 })
    },
    SEARCH_TIMEOUT_MS
  );
  const data = await responseJson(response);
  if (!response.ok) throw new Error(data?.message || `Serper error ${response.status}`);
  return (data.organic || []).map((item) => ({
    title: item.title,
    url: item.link,
    snippet: item.snippet
  }));
}

async function tavilySearch(query) {
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
        max_results: 8,
        include_answer: false,
        include_raw_content: false
      })
    },
    SEARCH_TIMEOUT_MS
  );
  const data = await responseJson(response);
  if (!response.ok) throw new Error(data?.message || `Tavily error ${response.status}`);
  return (data.results || []).map((item) => ({
    title: item.title,
    url: item.url,
    snippet: item.content
  }));
}

function normalizeSources(items) {
  const sources = [];
  const seen = new Set();
  for (const item of items || []) {
    const url = safeHttpsUrl(item.url || item.link);
    if (!url || seen.has(url)) continue;
    const title = cleanString(item.title || "Webový zdroj", 180);
    const snippet = cleanString(item.snippet || item.content || item.description || "", MAX_SOURCE_SNIPPET);
    if (!title && !snippet) continue;
    seen.add(url);
    sources.push({ id: `S${sources.length + 1}`, title, url, snippet });
    if (sources.length >= MAX_SOURCE_COUNT) break;
  }
  return sources;
}

async function collectSources(input) {
  if (!SERPER_API_KEY && !TAVILY_API_KEY) return [];
  const query = buildSearchQuery(input);
  try {
    const results = SERPER_API_KEY
      ? await serperSearch(query)
      : await tavilySearch(query);
    return normalizeSources(results);
  } catch (error) {
    console.warn("CARMATCH AI: web search unavailable:", error.message);
    return [];
  }
}

/* ---------------------------- AI PROVIDERS ---------------------------- */

function promptFor(input, sources) {
  const sourceBlock = sources.length
    ? sources.map((s) => `${s.id}\nTITLE: ${s.title}\nURL: ${s.url}\nEXCERPT: ${s.snippet}`).join("\n\n")
    : "No web evidence was retrieved. Do not invent current prices, dimensions, power, seating, boot capacity, consumption, years or URLs. Return null or 'Neoverené' for unsupported fields.";

  return `
Si CARMATCH AI, automobilový rešeršný asistent. Odpovedaj po slovensky.
Dátum: ${new Date().toISOString().slice(0, 10)}.

POŽIADAVKA:
${input.naturalLanguage || "Používateľ zadal iba filtre."}

FILTRE (tieto kľúče zodpovedajú priamo frontend app.js v20):
${JSON.stringify(input.filters, null, 2)}

WEBOVÉ DÔKAZY:
${sourceBlock}

PRAVIDLÁ:
- Navrhni presne 3 odlišné skutočné sériové modely áut. Nie koncepty ani prototypy.
- Dodrž všetky filtre. 'power' znamená minimálny výkon v kW; 'trunk' je minimálny objem kufra v litroch; 'length' je maximálna dĺžka v metroch; 'avoid' sú značky, ktorým sa treba vyhnúť.
- Brand a model musia byť oddelené polia. Napr. brand='BMW', model='X5'. Nevracaj celý názov iba v name.
- Uveď konkrétnu generáciu a modelový rok len vtedy, keď sú podložené dôkazmi.
- Neuvádzaj falošné skóre zhody. Pole score úplne vynechaj.
- Číselné technické údaje a ceny uvádzaj iba vtedy, ak ich dôkazy skutočne podporujú. Inak vráť null alebo 'Neoverené'.
- Výkon píš ako '150 kW' (front-end dopočíta HP). Nepoužívaj PS ani ks.
- Cena musí byť v EUR. Ak je zdroj v inej mene, cenu neprepočítavaj odhadom; vráť 'Cena neoverená'.
- consumptionWltp musí byť presný údaj WLTP, nie odhad ani reálna spotreba.
- Rozlišuj objem kufra podľa karosérie a verzie. Pri nejasnosti vráť null.
- SourceIds obsahuje len ID zdrojov S1 až S${sources.length}. Priraď zdroje iba vtedy, keď podporujú údaje o konkrétnom vozidle.
- configurator/officialUrl musí byť URL výrobcu uvedená alebo priamo potvrdená zdrojmi. Nevymýšľaj URL.
- Nevracaj obrázky ani image URL; fotografie vyhľadá frontend podľa samostatných polí brand a model.
- Výhody, nevýhody, dôvod výberu a údržbu formuluj realisticky. Neuvádzaj vymyslené sumy servisných nákladov.
- Ak webové dôkazy nestačia, nepredstieraj overenie. Nevyplňuj neznáme technické parametre odhadom.

VRÁŤ IBA VALIDNÝ JSON bez Markdownu v nasledujúcom tvare:
{
  "cars": [
    {
      "brand": "Značka",
      "model": "Model",
      "name": "Značka Model",
      "generation": "Generácia alebo null",
      "modelYear": null,
      "trim": "Verzia alebo null",
      "body": "Karoséria alebo null",
      "price": "od 45 000 € alebo Cena neoverená",
      "priceSource": "https://... alebo prázdny reťazec",
      "power": "150 kW alebo Neoverené",
      "engine": "Presné označenie motora alebo Neoverené",
      "consumptionWltp": "6,5 l/100 km alebo Neoverené",
      "seats": 5,
      "trunkLiters": 600,
      "drivetrain": "AWD alebo Neoverené",
      "fuel": "Benzín/hybrid/elektrina alebo Neoverené",
      "transmission": "Automatická alebo Neoverené",
      "lengthMm": 4800,
      "reason": "Prečo model vyhovuje zadaniu.",
      "pros": ["Výhoda 1", "Výhoda 2"],
      "cons": ["Nevýhoda 1"],
      "maintenance": "Realistický opis údržby bez vymyslených cien.",
      "configurator": "https://... alebo prázdny reťazec",
      "officialUrl": "https://... alebo prázdny reťazec",
      "sourceIds": ["S1", "S2"]
    }
  ]
}
`;
}

function extractJson(text) {
  let raw = String(text || "").trim();
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
  if (Array.isArray(content)) return content.map((part) => part?.text || "").join("\n");
  return data?.output_text || "";
}

async function callChat({ provider, apiKey, model, prompt }) {
  const isOpenRouter = provider === "openrouter";
  const url = isOpenRouter
    ? "https://openrouter.ai/api/v1/chat/completions"
    : "https://api.groq.com/openai/v1/chat/completions";
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json"
  };
  if (isOpenRouter) {
    headers["HTTP-Referer"] = process.env.APP_URL || "https://carmatchai.sk";
    headers["X-Title"] = "CARMATCH AI";
  }

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "Si dôsledný automobilový rešeršný asistent. Výstup musí byť validný JSON." },
          { role: "user", content: prompt }
        ],
        temperature: 0.15,
        max_tokens: 6500,
        response_format: { type: "json_object" }
      })
    },
    AI_TIMEOUT_MS
  );
  const data = await responseJson(response);
  if (!response.ok) {
    const error = new Error(data?.error?.message || data?.message || `${provider} HTTP ${response.status}`);
    error.statusCode = response.status;
    throw error;
  }
  const content = assistantContent(data);
  if (!content) throw new Error(`${provider} vrátil prázdnu odpoveď.`);
  return extractJson(content);
}

async function generateAI(prompt) {
  const errors = [];
  if (GROQ_API_KEY) {
    const models = [
      process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      process.env.GROQ_FALLBACK_MODEL || "openai/gpt-oss-20b"
    ].filter((value, index, array) => value && array.indexOf(value) === index);
    for (const model of models) {
      try {
        return await callChat({ provider: "groq", apiKey: GROQ_API_KEY, model, prompt });
      } catch (error) {
        errors.push(`Groq ${model}: ${error.message}`);
        console.error(`CARMATCH AI: Groq ${model} failed:`, error.message);
      }
    }
  }
  if (OPENROUTER_API_KEY) {
    const models = [
      process.env.OPENROUTER_MODEL || "qwen/qwen3.5-397b-a17b:free",
      "nvidia/nemotron-3-super-120b-a12b:free",
      "openrouter/free"
    ].filter((value, index, array) => value && array.indexOf(value) === index);
    for (const model of models) {
      try {
        return await callChat({ provider: "openrouter", apiKey: OPENROUTER_API_KEY, model, prompt });
      } catch (error) {
        errors.push(`OpenRouter ${model}: ${error.message}`);
        console.error(`CARMATCH AI: OpenRouter ${model} failed:`, error.message);
      }
    }
  }
  const detail = errors.slice(-4).join(" | ");
  throw new HttpError(
    detail
      ? `Nepodarilo sa získať odpoveď od AI. ${detail}`
      : "Chýba GROQ_API_KEY aj OPENROUTER_API_KEY vo Vercel Environment Variables.",
    502,
    "AI_UNAVAILABLE"
  );
}

/* ---------------------------- SOURCE VALIDATION ---------------------------- */

function normalizeSourceIds(ids, sources) {
  const valid = new Set(sources.map((source) => source.id));
  const input = Array.isArray(ids) ? ids : [];
  return [...new Set(input.map((id) => cleanString(id, 8)).filter((id) => valid.has(id)))];
}

function numberList(value) {
  const matches = String(value || "").match(/\d+(?:[\s.,]\d{3})*(?:[.,]\d+)?/g) || [];
  return matches.map((item) => {
    let raw = item.replace(/\s/g, "");
    if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(raw)) raw = raw.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(raw)) raw = raw.replace(/,/g, "");
    else if (raw.includes(",") && !raw.includes(".")) raw = raw.replace(",", ".");
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }).filter((n) => n !== null);
}

function approximatelyEqual(a, b, percent = 0.02, minimum = 1) {
  return Math.abs(a - b) <= Math.max(minimum, Math.abs(a) * percent);
}

function citedEvidence(car, sourceIds, sources) {
  const selected = sources.filter((source) => sourceIds.includes(source.id));
  const brand = cleanString(car.brand, 80).toLowerCase();
  const model = cleanString(car.model, 100).toLowerCase();
  const tokens = `${brand} ${model}`.split(/[^a-z0-9]+/i).filter((token) => token.length >= 2);
  const relevant = selected.filter((source) => {
    const haystack = `${source.title} ${source.snippet} ${source.url}`.toLowerCase();
    const hasBrand = brand && haystack.includes(brand);
    const modelTokens = model.split(/[^a-z0-9]+/i).filter((token) => token.length >= 2);
    const hasModel = modelTokens.length
      ? modelTokens.some((token) => haystack.includes(token))
      : false;
    return Boolean(hasBrand || hasModel || tokens.length === 0);
  });
  // If the search provider returned a source that is clearly about the exact model,
  // keep it. Otherwise do not use unrelated sources to validate technical figures.
  return relevant.map((source) => `${source.title}\n${source.snippet}\n${source.url}`).join("\n");
}

function verifyPower(value, evidence) {
  const match = String(value || "").match(/(\d+(?:[.,]\d+)?)\s*kW\b/i);
  if (!match || !evidence) return false;
  const amount = Number(match[1].replace(",", "."));
  const evidenceKw = [...String(evidence).matchAll(/(\d+(?:[.,]\d+)?)\s*kW\b/gi)]
    .map((item) => Number(item[1].replace(",", ".")));
  const evidenceHp = [...String(evidence).matchAll(/(\d+(?:[.,]\d+)?)\s*(?:hp|bhp)\b/gi)]
    .map((item) => Number(item[1].replace(",", ".")));
  return evidenceKw.some((number) => approximatelyEqual(amount, number, 0.02, 2)) ||
    evidenceHp.some((number) => approximatelyEqual(amount * 1.341022, number, 0.025, 3));
}

function verifyUnitNumber(value, evidence, unitPattern, tolerance = 0.02, minimum = 1) {
  if (value === null || value === undefined || value === "" || !evidence) return false;
  const amount = parseNumeric(value);
  if (amount === null) return false;
  const regex = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${unitPattern}`, "gi");
  const matches = [...String(evidence).matchAll(regex)].map((item) => Number(item[1].replace(",", ".")));
  return matches.some((number) => approximatelyEqual(amount, number, tolerance, minimum));
}

function verifySeats(value, evidence) {
  const amount = parseNumeric(value);
  if (amount === null || !Number.isInteger(amount) || amount < 1 || amount > 9 || !evidence) return false;
  const patterns = [
    new RegExp(`\\b${amount}\\s*(?:seats?|seater|passengers?|miest(?:a|ami)?|sedadiel)\\b`, "i"),
    new RegExp(`(?:seats?|seating|miest|sedadiel)[^\\n]{0,35}\\b${amount}\\b`, "i")
  ];
  return patterns.some((pattern) => pattern.test(evidence));
}

function verifyPrice(value, evidence) {
  if (!value || !evidence || !/(?:€|\bEUR\b)/i.test(String(value))) return false;
  const candidates = numberList(value).filter((number) => number >= 1000);
  if (!candidates.length) return false;
  const priceRegex = /(?:€\s*|EUR\s*)(\d[\d\s.,]{2,})|(\d[\d\s.,]{2,})\s*(?:€|EUR)(?![A-Za-z])/gi;
  const sourcePrices = [];
  for (const match of String(evidence).matchAll(priceRegex)) {
    sourcePrices.push(...numberList(match[1] || match[2] || "").filter((number) => number >= 1000));
  }
  return candidates.some((amount) => sourcePrices.some((sourceAmount) => approximatelyEqual(amount, sourceAmount, 0.025, 100)));
}

function cleanBrandModel(car) {
  let brand = cleanString(car.brand, 80);
  let model = cleanString(car.model, 100);
  const name = cleanString(car.name, 160);

  if ((!brand || !model) && name) {
    const knownBrands = [
      "Mercedes-Benz", "Land Rover", "Alfa Romeo", "Aston Martin", "Rolls-Royce",
      "Volkswagen", "Škoda", "Skoda", "Porsche", "Ferrari", "Lamborghini",
      "Maserati", "McLaren", "BMW", "Audi", "Volvo", "Toyota", "Lexus",
      "Genesis", "Hyundai", "Kia", "Honda", "Nissan", "Mazda", "Subaru",
      "Mitsubishi", "Peugeot", "Renault", "Citroën", "Citroen", "Opel",
      "Ford", "Tesla", "BYD", "Polestar", "Lucid", "Rivian", "Jeep",
      "Dodge", "Cadillac", "Chevrolet", "GMC", "Buick", "Acura", "Infiniti",
      "Mini", "Cupra", "Dacia", "Fiat", "Smart", "Suzuki", "MG", "XPeng",
      "Zeekr", "Nio", "Leapmotor", "Chery", "Jaecoo", "Omoda"
    ];
    const found = knownBrands.find((candidate) => name.toLowerCase().startsWith(candidate.toLowerCase() + " "));
    if (!brand && found) brand = found;
    if (!model && found) model = name.slice(found.length).trim();
    if (!brand && !model) {
      const parts = name.split(/\s+/);
      brand = parts.shift() || "";
      model = parts.join(" ");
    }
  }
  if (!brand || !model) return { brand, model, name: name || `${brand} ${model}`.trim() };
  return { brand, model, name: name || `${brand} ${model}` };
}

function verifiedOfficialUrl(value, sourceIds, sources) {
  const url = safeHttpsUrl(value);
  if (!url) return "";
  let host;
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch (_) { return ""; }
  const cited = sources.filter((source) => sourceIds.includes(source.id));
  const sourceHostMatch = cited.some((source) => {
    try { return new URL(source.url).hostname.replace(/^www\./, "") === host; } catch (_) { return false; }
  });
  return sourceHostMatch ? url : "";
}

function normalizeCar(rawCar, sources) {
  const raw = rawCar && typeof rawCar === "object" && !Array.isArray(rawCar) ? rawCar : {};
  const identity = cleanBrandModel(raw);
  if (!identity.brand || !identity.model) throw new Error("AI nevrátila oddelenú značku a model vozidla.");

  const sourceIds = normalizeSourceIds(raw.sourceIds || raw.sources, sources);
  const evidence = citedEvidence(identity, sourceIds, sources);

  const rawPower = cleanString(raw.power, 80);
  const power = verifyPower(rawPower, evidence) ? rawPower : "Neoverené";

  const rawPrice = cleanString(raw.price, 100);
  const price = verifyPrice(rawPrice, evidence) ? rawPrice : "Cena neoverená";

  const rawSeats = raw.seats;
  const seats = verifySeats(rawSeats, evidence) ? Number(rawSeats) : null;

  const rawTrunk = raw.trunkLiters ?? raw.trunk ?? raw.bootSpace;
  const trunkLiters = verifyUnitNumber(rawTrunk, evidence, "(?:l|litres?|liters?|litrov|litre)\\b", 0.02, 2)
    ? Number(parseNumeric(rawTrunk))
    : null;

  const rawLength = raw.lengthMm ?? raw.length;
  const lengthMm = verifyUnitNumber(rawLength, evidence, "mm\\b", 0.01, 5)
    ? Number(parseNumeric(rawLength))
    : null;

  const rawYear = raw.modelYear ?? raw.year;
  const yearNumber = parseNumeric(rawYear);
  const modelYear = yearNumber && yearNumber >= 1990 && yearNumber <= 2035 && numberList(evidence).some((n) => n === yearNumber)
    ? Math.round(yearNumber)
    : null;

  const rawConsumption = cleanString(raw.consumptionWltp ?? raw.wltpConsumption, 80);
  let consumptionWltp = "Neoverené";
  if (rawConsumption) {
    const number = parseNumeric(rawConsumption);
    const unit = /kWh/i.test(rawConsumption) ? "kWh" : "l";
    const unitPattern = unit === "kWh" ? "kWh(?:\\s*\\/\\s*100\\s*km)?\\b" : "l(?:\\s*\\/\\s*100\\s*km)?\\b";
    if (number !== null && verifyUnitNumber(number, evidence, unitPattern, 0.05, 0.1)) consumptionWltp = rawConsumption;
  }

  const priceSource = price !== "Cena neoverená"
    ? verifiedOfficialUrl(raw.priceSource || raw.officialPriceUrl, sourceIds, sources)
    : "";
  const configurator = verifiedOfficialUrl(raw.configurator, sourceIds, sources);
  const officialUrl = verifiedOfficialUrl(raw.officialUrl, sourceIds, sources);

  return {
    brand: identity.brand,
    model: identity.model,
    name: identity.name,
    generation: cleanString(raw.generation, 100),
    modelYear,
    year: modelYear,
    trim: cleanString(raw.trim, 100),
    body: cleanString(raw.body || raw.bodyType, 60),
    price,
    priceSource,
    power,
    engine: cleanString(raw.engine, 100) || "Neoverené",
    consumptionWltp,
    seats,
    trunkLiters,
    drivetrain: cleanString(raw.drivetrain || raw.drive, 50) || "Neoverené",
    fuel: cleanString(raw.fuel, 60) || "Neoverené",
    transmission: cleanString(raw.transmission, 60) || "Neoverené",
    lengthMm,
    reason: cleanString(raw.reason, 650),
    pros: Array.isArray(raw.pros) ? raw.pros.slice(0, 5).map((item) => cleanString(item, 180)).filter(Boolean) : [],
    cons: Array.isArray(raw.cons) ? raw.cons.slice(0, 5).map((item) => cleanString(item, 180)).filter(Boolean) : [],
    maintenance: cleanString(raw.maintenance, 500),
    configurator,
    officialUrl,
    image: "",
    photoSource: "",
    images: [],
    sourceIds
  };
}

function normalizeCars(aiResult, sources) {
  if (!aiResult || !Array.isArray(aiResult.cars)) {
    throw new Error("AI odpoveď neobsahuje pole cars.");
  }
  const cars = [];
  const seen = new Set();
  for (const raw of aiResult.cars) {
    const car = normalizeCar(raw, sources);
    const key = `${car.brand} ${car.model}`.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    cars.push(car);
    if (cars.length === 3) break;
  }
  if (cars.length !== 3) {
    throw new HttpError(`AI vrátila iba ${cars.length} rozdielne modely namiesto požadovaných 3. Skús spresniť požiadavku.`, 502, "INVALID_CAR_RESULTS");
  }
  return cars;
}

function sourcesUsedBy(cars, sources) {
  const ids = new Set(cars.flatMap((car) => car.sourceIds));
  return sources.filter((source) => ids.has(source.id));
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
      throw new HttpError("AI poskytovateľ nie je nakonfigurovaný. Nastav GROQ_API_KEY alebo OPENROUTER_API_KEY vo Verceli.", 500, "AI_CONFIG");
    }

    token = bearerToken(req);
    await verifyUser(token);

    const quota = await consumeSearch(token);
    consumed = quota.consumed;
    remaining = quota.remaining;

    const sources = await collectSources(input);
    const prompt = promptFor(input, sources);
    const aiResult = await generateAI(prompt);
    const cars = normalizeCars(aiResult, sources);

    return json(res, 200, {
      cars,
      sources: sourcesUsedBy(cars, sources),
      remaining,
      dailyLimit: DAILY_LIMIT,
      warning: sources.length
        ? null
        : "Webové zdroje neboli dostupné. Neoverené ceny a technické údaje sú označené.",
      message: "Vybrali sme presne 3 automobily."
    });
  } catch (error) {
    console.error("CARMATCH AI backend error:", {
      message: error?.message,
      code: error?.code,
      statusCode: error?.statusCode,
      details: error?.details
    });

    let refund = { refunded: false };
    if (consumed && token) {
      refund = await refundSearch(token);
    }

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