"use strict";

/* ============================================================
   CARMATCH AI — BACKEND v42
   Kompatibilita: frontend app.js v21
   Endpoint: POST /api/search
   package.json: { "type": "module" }

   OPRAVY v42:
   - Groq 429 už neopakuje požiadavku po svojvoľných 3 sekundách;
     pri rate limite sa okamžite presunie na OpenRouter.
   - Groq retry-after a reset informácie sa zaznamenajú do diagnostiky.
   - Finálny prompt je úspornejší: menšie úryvky, menší počet zdrojov,
     stručnejšie inštrukcie a nižší výstupný rozpočet.
   - OpenRouter používa overené bezplatné modely so Structured Outputs;
     Nemotron má vypnuté reasoning tokeny, aby zostal priestor na JSON.
   - OpenRouter fallback pokračuje aj po prázdnom alebo skrátenom výstupe.
   - Skrátený JSON sa nikdy nepoužije ako platný výsledok.
   - Diagnostika uvádza model, finish_reason a spotrebu tokenov bez API kľúčov.
   - Finálne údaje sú rozdelené do troch pevných slotov vehicle1/2/3;
     AI už nemôže zmeniť poradie, vynechať vozidlo ani duplikovať identitu.
   - Identitu značky a modelu dopĺňa výhradne backend z kandidáta.
   - Rok začiatku výroby sa nikdy nepovažuje za modelový rok.
   - Budúce renderované/špekulatívne generácie sa nepoužijú ako dôkaz.
   - Neoverená generácia/rok/technický údaj sa zobrazí ako neoverený;
     nezhodí celé vyhľadávanie, ak nejde o povinný filter.
   - Zdroje a následné kontroly majú obmedzenú súbežnosť kvôli 429 limitom.
   - Chýbajúca fotografia nezhodí správne overené vozidlá; vráti sa stav bez fotky.
   - Presná zhoda celého názvu modelu; odvodené verzie (napr. Q5 L) sa
     už nezamieňajú so základným modelom (Q5).
   - Všeobecná doména .com sama osebe nedokazuje európsku ponuku. Aktuálnosť
     sa opiera o oficiálne európske domény alebo výslovne lokalizované stránky.
   - Historické roky a archívne modelové záznamy nemajú prednosť pred
     dôkazom aktuálnej ponuky; pri nedostatku dôkazu sa použije existujúci
     kontrolovaný náhradný výber kandidátov.
   - Fotografia môže byť použitá aj bez potvrdenej generácie/modelového roka,
     ak je kandidát overený pre Európu a titulok obrázka presne identifikuje
     značku a celý model. Známa generácia alebo rok však musia súhlasiť.
   - Zachované: Supabase Auth, denná kvóta/refund, 3 vozidlá, fotografie,
     Serper/Tavily a kompatibilita app.js v21.
   - Mercedes a Mercedes-Benz sa normalizujú na rovnakú oficiálnu značku;
  - Aktuálnosť vyžaduje modelovo špecifickú oficiálnu európsku stránku; všeobecný konfigurátor nestačí;
  - Vyhľadávanie používa cielené európske domény podľa značky;
  - Kandidáti sa kontrolujú podľa aktuálnej európskej ponuky; pri nepreukázanom modeli sa raz automaticky vyberú náhradní kandidáti.
   - Presné označenia variantov (napr. Q5 L) sa nesmú zhodovať s obyčajným Q5.
   - Fotografie bez potvrdenej generácie sa prijmú iba z oficiálnej stránky výrobcu aktuálneho modelu alebo s jasným dôkazom modelového roka; inak sa nezobrazia.
   ============================================================ */

const DAILY_LIMIT = 5;
const MAX_QUERY_LENGTH = 1000;
const MAX_SOURCES_PER_CAR = 5;
const MAX_TOTAL_SOURCES = 22;
const MAX_SOURCE_SNIPPET = 950;
const MAX_IDENTITY_RESEARCH_SOURCES_PER_CAR = 2;
const AUTH_TIMEOUT_MS = 8000;
const RPC_TIMEOUT_MS = 8000;
const SEARCH_TIMEOUT_MS = 9000;
const IMAGE_TIMEOUT_MS = 10000;
const AI_TIMEOUT_MS = 22000;
const MAX_PHOTOS_PER_CAR = 5;
const MAX_AI_OUTPUT_TOKENS = 2800;

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

function createSearchState() {
  return { disabled: { serper: false, tavily: false, serperImages: false }, failures: [] };
}

function recordSearchFailure(state, provider, error) {
  if (!state || !state.disabled || !state.failures) return;
  const statusCode = Number(error?.statusCode) || null;
  const message = cleanString(error?.message || "Neznáma chyba", 260);
  state.failures.push({ provider, statusCode, message });
  if (state.failures.length > 12) state.failures.shift();
  if ([401, 403, 429].includes(statusCode)) state.disabled[provider] = true;
}

function searchFailureSummary(state) {
  return (state?.failures || []).slice(-8).map(item => ({
    provider: item.provider,
    statusCode: item.statusCode,
    message: item.message
  }));
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
  const match = String(header(req, "authorization") || "").trim().match(/^Bearer\s+(.+)$/i);
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
    } catch (_) { return {}; }
  }
  return {};
}

function parseNumeric(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let raw = cleanString(value, 100).replace(/\u00A0/g, " ").replace(/\s/g, "");
  if (!raw) return null;
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(raw)) raw = raw.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(raw)) raw = raw.replace(/,/g, "");
  else if (raw.includes(",") && !raw.includes(".")) raw = raw.replace(",", ".");
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
  const naturalLanguage = cleanString(body.naturalLanguage ?? body.query ?? body.prompt ?? "", MAX_QUERY_LENGTH);
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
  try { return JSON.parse(raw); }
  catch (_) { return { raw: raw.slice(0, 1200) }; }
}

async function mapWithConcurrency(items, concurrency, worker) {
  const input = Array.isArray(items) ? items : [];
  const output = new Array(input.length);
  let next = 0;
  const count = Math.max(1, Math.min(input.length || 1, Number(concurrency) || 1));
  await Promise.all(Array.from({ length: count }, async () => {
    while (true) {
      const index = next++;
      if (index >= input.length) return;
      output[index] = await worker(input[index], index);
    }
  }));
  return output;
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.username || url.password) return "";
    if (["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname)) return "";
    url.hash = "";
    return url.toString();
  } catch (_) { return ""; }
}

/* ---------------------------- SUPABASE AUTH ---------------------------- */

async function verifyUser(token) {
  if (!SUPABASE_URL || !SUPABASE_API_KEY) {
    throw new HttpError("Supabase nie je nakonfigurovaný. Skontroluj SUPABASE_URL a SUPABASE_ANON_KEY alebo SUPABASE_PUBLISHABLE_KEY.", 500, "SUPABASE_CONFIG");
  }
  if (!token) throw new HttpError("Prihlásenie vypršalo. Prihlás sa znova.", 401, "UNAUTHORIZED");
  let response;
  try {
    response = await fetchWithTimeout(`${SUPABASE_URL}/auth/v1/user`, {
      method: "GET",
      headers: { apikey: SUPABASE_API_KEY, Authorization: `Bearer ${token}`, Accept: "application/json" }
    }, AUTH_TIMEOUT_MS);
  } catch (error) {
    throw new HttpError("Nepodarilo sa overiť Supabase reláciu.", 503, "SUPABASE_AUTH_UNAVAILABLE", error.message);
  }
  const data = await responseJson(response);
  if (!response.ok || !data?.id) {
    throw new HttpError("Supabase relácia je neplatná alebo expirovaná. Prihlás sa znova.", 401, "invalid_token", data?.message || data?.msg || undefined);
  }
  return data;
}

async function callRpc(name, args, token) {
  let response;
  try {
    response = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(name)}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_API_KEY,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify(args || {})
    }, RPC_TIMEOUT_MS);
  } catch (error) {
    throw new HttpError(`Supabase RPC ${name} sa nepodarilo kontaktovať.`, 503, "SUPABASE_RPC_UNAVAILABLE", error.message);
  }
  const data = await responseJson(response);
  if (!response.ok) {
    const error = new Error(cleanString(data?.message || data?.details || data?.hint || data?.error || `RPC ${name} failed`, 500));
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
  return ["PGRST202", "42883", "PGRST204"].includes(code) || message.includes("could not find the function") || (message.includes("function") && message.includes("does not exist"));
}

function isLimitError(error) {
  return /daily.?limit|limit.?reached|quota|too many|maximum.*search|search limit|denn.{0,8}limit|limit vyhľad/i.test(String(error?.message || "").toLowerCase());
}

function firstObject(data) {
  return Array.isArray(data) ? (data[0] ?? null) : data;
}

function readRemaining(data) {
  const value = firstObject(data);
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.min(DAILY_LIMIT, Math.floor(value)));
  if (!value || typeof value !== "object") return null;
  for (const key of ["remaining", "remaining_searches", "searches_left", "remainingSearches", "left"]) {
    const number = Number(value[key]);
    if (value[key] !== undefined && Number.isFinite(number)) return Math.max(0, Math.min(DAILY_LIMIT, Math.floor(number)));
  }
  for (const key of ["search_count", "count", "used", "usage_count", "used_searches"]) {
    const number = Number(value[key]);
    if (value[key] !== undefined && Number.isFinite(number)) return Math.max(0, DAILY_LIMIT - Math.floor(number));
  }
  return null;
}

function resultDenied(data) {
  const value = firstObject(data);
  if (value === false) return true;
  if (!value || typeof value !== "object") return false;
  const status = String(value.status || value.code || value.error || "").toLowerCase();
  return value.allowed === false || value.success === false || value.ok === false || value.limit_reached === true || value.daily_limit_reached === true || /limit|quota|exceed/.test(status);
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
      if (resultDenied(data)) throw new HttpError("Dosiahol si denný limit 5 vyhľadávaní. Skús to znova zajtra.", 429, "DAILY_LIMIT_REACHED");
      return { consumed: true, remaining: readRemaining(data), rpc: attempt.name };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (isLimitError(error)) throw new HttpError("Dosiahol si denný limit 5 vyhľadávaní. Skús to znova zajtra.", 429, "DAILY_LIMIT_REACHED");
      if (isMissingRpc(error)) { lastMissing = error; continue; }
      throw new HttpError(`Nepodarilo sa odpočítať vyhľadávanie v Supabase: ${error.message}`, error.statusCode === 401 ? 401 : 500, "SEARCH_QUOTA_ERROR", error.data || undefined);
    }
  }
  throw new HttpError("V Supabase sa nenašla RPC funkcia increment_search, consume_search ani use_search.", 500, "SEARCH_RPC_MISSING", lastMissing?.message);
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
  const response = await fetchWithTimeout(`https://google.serper.dev/${endpoint}`, {
    method: "POST",
    headers: { "X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, gl: "sk", hl: "en", num })
  }, type === "images" ? IMAGE_TIMEOUT_MS : SEARCH_TIMEOUT_MS);
  const data = await responseJson(response);
  if (!response.ok) {
    const error = new Error(cleanString(data?.message || data?.error || `Serper ${endpoint} HTTP ${response.status}`, 400));
    error.statusCode = response.status;
    error.provider = "serper";
    throw error;
  }
  return type === "images" ? (data.images || []) : (data.organic || []);
}

async function tavilySearch(query, options = {}) {
  if (!TAVILY_API_KEY) return [];
  const deep = options.deep === true;
  const response = await fetchWithTimeout("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: TAVILY_API_KEY,
      query,
      search_depth: deep ? "advanced" : "basic",
      topic: "general",
      max_results: deep ? 5 : 6,
      include_answer: false,
      include_raw_content: deep ? "text" : false,
      ...(deep ? { chunks_per_source: 2 } : {})
    })
  }, SEARCH_TIMEOUT_MS);
  const data = await responseJson(response);
  if (!response.ok) {
    const error = new Error(cleanString(data?.message || `Tavily HTTP ${response.status}`, 400));
    error.statusCode = response.status;
    error.provider = "tavily";
    throw error;
  }
  return (data.results || []).map(item => ({ title: item.title, link: item.url, snippet: item.content, raw_content: item.raw_content }));
}

function normalizeSource(item) {
  const url = safeHttpsUrl(item?.link || item?.url);
  if (!url) return null;
  const title = cleanString(item?.title || "Webový zdroj", 180);
  const primary = cleanString(item?.snippet || item?.content || item?.description || "", MAX_SOURCE_SNIPPET);
  const raw = cleanString(item?.raw_content || item?.rawContent || "", MAX_SOURCE_SNIPPET);
  const combined = primary && raw && !raw.includes(primary) ? `${primary} ${raw}` : (primary || raw);
  const snippet = cleanString(combined, MAX_SOURCE_SNIPPET);
  if (!title && !snippet) return null;
  return { title, url, snippet };
}

async function searchSources(query, state = createSearchState(), options = {}) {
  let serperRows = [];
  let tavilyRows = [];
  let providerSucceeded = false;
  let attempted = 0;

  const runSerper = async () => {
    if (!SERPER_API_KEY || state.disabled.serper) return [];
    attempted++;
    try { const rows = await serperSearch(query, "search", 8); providerSucceeded = true; return rows || []; }
    catch (error) {
      recordSearchFailure(state, "serper", error);
      console.warn("CARMATCH AI: Serper search failed", { statusCode: Number(error?.statusCode) || null, message: cleanString(error?.message, 300) });
      return [];
    }
  };

  const runTavily = async () => {
    if (!TAVILY_API_KEY || state.disabled.tavily) return [];
    attempted++;
    try { const rows = await tavilySearch(query, options); providerSucceeded = true; return rows || []; }
    catch (error) {
      recordSearchFailure(state, "tavily", error);
      console.warn("CARMATCH AI: Tavily search failed", { statusCode: Number(error?.statusCode) || null, deepSearch: options.deep === true, message: cleanString(error?.message, 300) });
      return [];
    }
  };

  if (options.deep === true) [serperRows, tavilyRows] = await Promise.all([runSerper(), runTavily()]);
  else {
    serperRows = await runSerper();
    if (!serperRows.length) tavilyRows = await runTavily();
  }

  const noProviderAvailable = (!SERPER_API_KEY || state.disabled.serper) && (!TAVILY_API_KEY || state.disabled.tavily);
  if (!providerSucceeded && (attempted > 0 || noProviderAvailable)) {
    throw new HttpError("Webové vyhľadávanie nie je momentálne dostupné. Skontroluj API kľúče Serper a Tavily vo Verceli.", 503, "WEB_SEARCH_UNAVAILABLE", {
      attemptedProviders: attempted,
      disabledProviders: { ...state.disabled },
      providerFailures: searchFailureSummary(state),
      query: cleanString(query, 220)
    });
  }

  const unique = [];
  const seen = new Set();
  for (const item of [...(serperRows || []), ...(tavilyRows || [])]) {
    const source = normalizeSource(item);
    if (!source || seen.has(source.url)) continue;
    seen.add(source.url);
    unique.push(source);
    if (unique.length >= 10) break;
  }
  console.info("CARMATCH AI: web source search", {
    mode: options.deep === true ? "advanced-combined" : "standard-fallback",
    serperReceived: serperRows.length,
    tavilyReceived: tavilyRows.length,
    accepted: unique.length
  });
  return unique;
}

function assignSourceIds(items, startAt = 1, limit = MAX_TOTAL_SOURCES) {
  return items.slice(0, limit).map((source, index) => ({ id: `S${startAt + index}`, title: source.title, url: source.url, snippet: source.snippet }));
}

/* ---------------------------- AI JSON SCHEMAS ---------------------------- */

const CANDIDATE_SCHEMA = {
  type: "object",
  properties: {
    cars: {
      type: "array",
      items: {
        type: "object",
        properties: { brand: { type: "string" }, model: { type: "string" } },
        required: ["brand", "model"],
        additionalProperties: false
      }
    }
  },
  required: ["cars"],
  additionalProperties: false
};

const FINAL_CAR_DATA_SCHEMA = {
  type: "object",
  properties: {
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
    "generation", "modelYear", "trim", "body", "price", "priceSource", "power",
    "engine", "consumptionWltp", "seats", "trunkLiters", "drivetrain", "fuel",
    "transmission", "lengthMm", "reason", "pros", "cons", "maintenance",
    "configurator", "officialUrl", "sourceIds"
  ],
  additionalProperties: false
};

// Kľúče vehicle1/2/3 sú pevne naviazané na kandidátov v rovnakom poradí.
// Schéma zámerne neobsahuje brand/model/name; tieto hodnoty nikdy negeneruje AI.
const FINAL_SCHEMA = {
  type: "object",
  properties: {
    vehicle1: FINAL_CAR_DATA_SCHEMA,
    vehicle2: FINAL_CAR_DATA_SCHEMA,
    vehicle3: FINAL_CAR_DATA_SCHEMA
  },
  required: ["vehicle1", "vehicle2", "vehicle3"],
  additionalProperties: false
};

/* ---------------------------- AI PROVIDERS ---------------------------- */

function extractJson(value) {
  let raw = String(value || "").trim();
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(raw); }
  catch (_) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(raw.slice(start, end + 1)); }
      catch (_) { /* pokračuj na diagnostickú chybu */ }
    }
    throw new Error(`AI nevrátila parsovateľný JSON. Začiatok odpovede: ${raw.slice(0, 180) || "<prázdne>"}`);
  }
}

function assistantContent(data) {
  const choice = data?.choices?.[0];
  const message = choice?.message;
  const content = message?.content;
  if (typeof content === "string") return content.trim();
  if (content && typeof content === "object" && !Array.isArray(content)) return JSON.stringify(content);
  if (Array.isArray(content)) {
    return content.map(part => typeof part === "string" ? part : (part?.text || part?.content || "")).join("\n").trim();
  }
  if (typeof choice?.text === "string") return choice.text.trim();
  if (typeof data?.output_text === "string") return data.output_text.trim();
  return "";
}

function isRateLimitError(error) {
  return Number(error?.statusCode) === 429 || /rate.?limit|tokens per minute|too many requests|tpm limit/i.test(String(error?.message || ""));
}

function retryAfterSeconds(headers) {
  const value = headers?.get?.("retry-after");
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(1, Math.ceil((date - Date.now()) / 1000)) : null;
}

function parseProviderWaitSeconds(message) {
  const text = String(message || "");
  const patterns = [
    /try again in\s+([0-9]+(?:\.[0-9]+)?)\s*s/i,
    /retry after\s+([0-9]+(?:\.[0-9]+)?)\s*s/i,
    /reset(?:s)? in\s+([0-9]+(?:\.[0-9]+)?)\s*s/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Math.max(1, Math.ceil(Number(match[1])));
  }
  return null;
}

function isGroqStrictModel(model) {
  return /^openai\/gpt-oss-(?:20b|120b)$/i.test(String(model || "").trim());
}

function jsonSchemaResponseFormat(schema, name) {
  return { type: "json_schema", json_schema: { name, strict: true, schema } };
}

async function callChat(provider, apiKey, model, prompt, maxOutputTokens, schema, schemaName) {
  const openrouter = provider === "openrouter";
  const url = openrouter ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.groq.com/openai/v1/chat/completions";
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json"
  };
  const strictSchemaSupported = openrouter || isGroqStrictModel(model);
  const userPrompt = strictSchemaSupported ? prompt : `${prompt}\n\nJSON SCHEMA (dodrž presne všetky názvy a typy polí):\n${JSON.stringify(schema)}`;
  const body = {
    model,
    messages: [
      { role: "system", content: "Si presný automobilový rešeršný asistent. Rešpektuj iba dodané dôkazy. Nikdy nevymýšľaj fakty. Vráť iba požadovaný JSON." },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.1,
    response_format: strictSchemaSupported ? jsonSchemaResponseFormat(schema, schemaName) : { type: "json_object" }
  };

  if (openrouter) {
    headers["HTTP-Referer"] = process.env.APP_URL || "https://carmatchai.vercel.app";
    headers["X-Title"] = "CARMATCH AI";
    body.max_tokens = maxOutputTokens;
    body.provider = { require_parameters: true };
    body.plugins = [{ id: "response-healing" }];
    // Nemotron 3.5 Super VL používa reasoning predvolene. Vypnutie reasoning
    // ponechá výstupný rozpočet na JSON a znižuje riziko finish_reason=length.
    if (/^nvidia\/nemotron-3\.5-super-vl(?::free)?$/i.test(model)) {
      body.reasoning = { enabled: false };
    }
  } else {
    body.max_completion_tokens = maxOutputTokens;
    if (isGroqStrictModel(model)) body.reasoning_effort = "low";
  }

  const response = await fetchWithTimeout(url, { method: "POST", headers, body: JSON.stringify(body) }, AI_TIMEOUT_MS);
  const data = await responseJson(response);
  if (!response.ok) {
    const message = data?.error?.message || data?.message || data?.raw || `${provider} HTTP ${response.status}`;
    const error = new Error(cleanString(message, 700));
    error.statusCode = response.status;
    error.retryAfter = retryAfterSeconds(response.headers);
    error.provider = provider;
    error.model = model;
    error.usage = data?.usage || null;
    throw error;
  }

  const choice = data?.choices?.[0];
  const content = assistantContent(data);
  const usage = data?.usage || null;
  if (choice?.finish_reason === "length") {
    const error = new Error(`${provider} ${model} skrátil výstup (finish_reason=length).`);
    error.statusCode = 502;
    error.code = "AI_OUTPUT_TRUNCATED";
    error.provider = provider;
    error.model = model;
    error.finishReason = choice.finish_reason;
    error.usage = usage;
    throw error;
  }
  if (!content) {
    const reason = cleanString(choice?.message?.refusal || choice?.finish_reason || data?.error?.message || "bez textového obsahu", 220);
    const error = new Error(`${provider} ${model} vrátil prázdny textový výstup (${reason}).`);
    error.statusCode = 502;
    error.code = "AI_EMPTY_OUTPUT";
    error.provider = provider;
    error.model = model;
    error.finishReason = choice?.finish_reason || null;
    error.usage = usage;
    throw error;
  }

  try {
    return extractJson(content);
  } catch (error) {
    error.statusCode = 502;
    error.code = "AI_INVALID_JSON";
    error.provider = provider;
    error.model = model;
    error.finishReason = choice?.finish_reason || null;
    error.usage = usage;
    throw error;
  }
}

async function callChatWithRecovery(provider, apiKey, model, prompt, maxOutputTokens, schema, schemaName) {
  try {
    return await callChat(provider, apiKey, model, prompt, maxOutputTokens, schema, schemaName);
  } catch (error) {
    // Pri Groq 429 sa neopakuje tá istá organizácia. V logu bolo potvrdené,
    // že reset bol 11,8 s; opakovanie po 3 s iba míňalo čas a ďalšiu požiadavku.
    if (provider === "groq" && isRateLimitError(error)) {
      error.retryWaitSeconds = Number(error.retryAfter) || parseProviderWaitSeconds(error.message) || null;
      console.warn("CARMATCH AI: Groq rate limit; skipping same-organization retry and switching provider.", {
        retryWaitSeconds: error.retryWaitSeconds,
        model
      });
      throw error;
    }

    // Len jedna kontrolovaná obnova výstupu. Pri reasoning modeli je prvý
    // pokus už bez reasoning; pri druhom pokuse sa zvýši výstupný limit.
    if (provider !== "groq" && error?.code === "AI_OUTPUT_TRUNCATED" && maxOutputTokens < MAX_AI_OUTPUT_TOKENS) {
      const increased = Math.min(MAX_AI_OUTPUT_TOKENS, Math.max(maxOutputTokens + 400, Math.ceil(maxOutputTokens * 1.35)));
      console.warn(`CARMATCH AI: ${provider} ${model} output truncated; one bounded retry with ${increased} output tokens.`);
      return await callChat(provider, apiKey, model, prompt, increased, schema, schemaName);
    }
    throw error;
  }
}

function allowedOpenRouterModels() {
  // V poradí sú konkrétne bezplatné endpointy, ktoré deklarujú JSON Schema.
  // Dynamický router je posledný fallback a vyberá model podľa podporovaných parametrov.
  return [
    "nvidia/nemotron-3.5-super-vl:free",
    "baidu/ernie-5.5-flash-preview:free",
    "openrouter/free"
  ];
}

async function generateAI(prompt, options = {}) {
  const maxOutputTokens = Math.max(200, Math.min(MAX_AI_OUTPUT_TOKENS, Number(options.maxOutputTokens) || 1800));
  const schema = options.schema || CANDIDATE_SCHEMA;
  const schemaName = options.schemaName || "carmatch_response";
  const errors = [];
  let groqRateLimited = false;

  if (GROQ_API_KEY) {
    const primaryModel = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
    const fallbackModel = process.env.GROQ_FALLBACK_MODEL || "openai/gpt-oss-20b";
    for (const model of [...new Set([primaryModel, fallbackModel])]) {
      try {
        const result = await callChatWithRecovery("groq", GROQ_API_KEY, model, prompt, maxOutputTokens, schema, schemaName);
        console.info("CARMATCH AI: model response accepted", { provider: "groq", model });
        return result;
      } catch (error) {
        const limited = isRateLimitError(error);
        if (limited) groqRateLimited = true;
        const message = `Groq ${model}: ${error.message}`;
        errors.push(message);
        console.error("CARMATCH AI: Groq model failed", {
          model,
          statusCode: Number(error?.statusCode) || null,
          code: error?.code || null,
          retryWaitSeconds: Number(error?.retryAfter) || error?.retryWaitSeconds || parseProviderWaitSeconds(error?.message) || null,
          finishReason: error?.finishReason || null,
          usage: error?.usage || null,
          message: cleanString(error?.message, 420)
        });
        if (limited || [401, 403].includes(Number(error?.statusCode))) break;
      }
    }
  }

  if (OPENROUTER_API_KEY) {
    for (const model of allowedOpenRouterModels()) {
      try {
        const result = await callChatWithRecovery("openrouter", OPENROUTER_API_KEY, model, prompt, maxOutputTokens, schema, schemaName);
        console.info("CARMATCH AI: model response accepted", { provider: "openrouter", model });
        return result;
      } catch (error) {
        const message = `OpenRouter ${model}: ${error.message}`;
        errors.push(message);
        console.error("CARMATCH AI: OpenRouter model failed", {
          model,
          statusCode: Number(error?.statusCode) || null,
          code: error?.code || null,
          finishReason: error?.finishReason || null,
          usage: error?.usage || null,
          message: cleanString(error?.message, 420)
        });
        if ([401, 403].includes(Number(error?.statusCode))) break;
      }
    }
  }

  const lastErrors = errors.slice(-5).join(" | ");
  if (groqRateLimited && !OPENROUTER_API_KEY) {
    throw new HttpError("Groq dočasne dosiahol limit tokenov a nie je nastavený záložný OPENROUTER_API_KEY. Vyhľadávanie nebolo dokončené.", 503, "AI_RATE_LIMITED", lastErrors);
  }
  throw new HttpError(
    errors.length ? `Nepodarilo sa získať validnú odpoveď od AI. ${lastErrors}` : "Chýba GROQ_API_KEY aj OPENROUTER_API_KEY vo Vercel Environment Variables.",
    502,
    "AI_UNAVAILABLE",
    lastErrors || undefined
  );
}

/* ---------------------------- AI PROMPTS ---------------------------- */

function candidatePrompt(input, sources, excludedCandidates = []) {
  const sourceText = sources.map(s => `${s.id} | ${s.title}\n${cleanString(s.snippet, 650)}\nURL: ${s.url}`).join("\n\n");
  const currentYear = new Date().getUTCFullYear();
  const excludedText = excludedCandidates.length ? `\nModely odmietnuté pre nedostatočný dôkaz aktuálnej európskej ponuky; NESMIEŠ ich znovu vybrať: ${excludedCandidates.join("; ")}.\n` : "";
  return `Vyber presne TRI navzájom odlišné sériové automobily, ktoré najlepšie spĺňajú zadanie a sú relevantné pre aktuálny európsky/slovenský trh. Vráť iba JSON podľa schémy.\n` +
    `Dátum: ${new Date().toISOString().slice(0, 10)} (aktuálny rok ${currentYear}).\n` +
    `Požiadavka: ${input.naturalLanguage || "Používateľ zadal iba filtre."}\nFiltre: ${JSON.stringify(input.filters)}\n` +
    `Všeobecné webové podklady (nie sú automatickým dôkazom parametrov konkrétneho auta):\n${sourceText || "Žiadne."}\n` + excludedText +
    "Pravidlá: vyber iba reálne sériové modely s aktuálnou európskou/slovenskou ponukou. Každý model musí mať presnú zhodu s európskou verziou na oficiálnom webe výrobcu; všeobecná globálna stránka .com, starý cenník, archívna stránka ani ponuka mimo Európy nestačia. Nerekomenduj koncepty, prototypy, ukončené modely, iba pripravované nástupnícke generácie ani regionálne verzie pre Čínu/USA/Austráliu, ktoré sa nepredávajú v Európe. Nezamieňaj odvodené verzie a dlhé rázvory (napr. označenie L) s bežným modelom. Rešpektuj filtre a vylúčené značky. Vyber tri rôzne modely bez duplicít. Používaj kanonické názvy značiek (Mercedes-Benz, Volkswagen, DS Automobiles, Land Rover; nie iba Mercedes alebo VW). Uveď iba presnú značku a model, bez technických údajov, ceny, generácie a roku. Ak si nie si istý aktuálnou dostupnosťou v Európe, zvoľ iný lepšie doložený model. Bez textu mimo JSON.";
}

function modelResearchQueries(candidate) {
  const brand = cleanString(candidate.brand, 80);
  const model = cleanString(candidate.model, 100);
  const currentYear = new Date().getUTCFullYear();
  const nextYear = currentYear + 1;
  const domains = europeanOfficialSearchSites(brand);
  const siteQuery = domains.length
    ? `(${domains.map(domain => `site:${domain}`).join(" OR ")}) `
    : "";
  return [
    { type: "current-market-eu", deep: false, query: `${siteQuery}"${brand}" "${model}" current model available to order configure official Europe ${currentYear} ${nextYear}` },
    { type: "technical-specifications", deep: true, query: `"${brand}" "${model}" official European technical specifications power kW drivetrain boot capacity seats WLTP` },
    { type: "generation-and-model-year", deep: false, query: `"${brand}" "${model}" official current generation chassis code model year ${currentYear} ${nextYear} Europe` },
    { type: "market-price", deep: false, query: `${siteQuery}"${brand}" "${model}" official price list EUR Europe ${currentYear} ${nextYear}` }
  ];
}

function canonicalizeBrand(brand) {
  const value = cleanString(brand, 80);
  const key = normalized(value);
  if (key === "mercedes" || key === "mercedes benz") return "Mercedes-Benz";
  if (key === "vw") return "Volkswagen";
  if (key === "landrover") return "Land Rover";
  if (key === "ds") return "DS Automobiles";
  return value;
}

function europeanOfficialSearchSites(brand) {
  const key = normalized(brand).replace(/\s+/g, "");
  const sites = {
    mercedesbenz: ["mercedes-benz.co.uk", "mercedes-benz.ie", "mercedes-benz.de", "mercedes-benz.fr", "mercedes-benz.sk"],
    mercedes: ["mercedes-benz.co.uk", "mercedes-benz.ie", "mercedes-benz.de", "mercedes-benz.fr", "mercedes-benz.sk"],
    volkswagen: ["volkswagen.co.uk", "volkswagen.ie", "volkswagen.de", "volkswagen.fr", "volkswagen.sk"],
    vw: ["volkswagen.co.uk", "volkswagen.ie", "volkswagen.de", "volkswagen.fr", "volkswagen.sk"],
    bmw: ["bmw.co.uk", "bmw.ie", "bmw.de", "bmw.fr", "bmw.sk"],
    audi: ["audi.co.uk", "audi.ie", "audi.de", "audi.fr", "audi.sk"],
    skoda: ["skoda-auto.co.uk", "skoda-auto.ie", "skoda-auto.de", "skoda-auto.cz", "skoda-auto.sk"],
    toyota: ["toyota.co.uk", "toyota.ie", "toyota.de", "toyota.fr", "toyota.sk"],
    hyundai: ["hyundai.co.uk", "hyundai.ie", "hyundai.de", "hyundai.fr", "hyundai.sk"],
    kia: ["kia.com/uk", "kia.com/ie", "kia.com/de", "kia.com/fr", "kia.com/sk"],
    porsche: ["porsche.com/uk", "porsche.com/ireland", "porsche.com/germany", "porsche.com/slovakia"],
    ford: ["ford.co.uk", "ford.ie", "ford.de", "ford.fr", "ford.sk"],
    renault: ["renault.co.uk", "renault.ie", "renault.de", "renault.fr", "renault.sk"],
    peugeot: ["peugeot.co.uk", "peugeot.ie", "peugeot.de", "peugeot.fr", "peugeot.sk"],
    citroen: ["citroen.co.uk", "citroen.ie", "citroen.de", "citroen.fr", "citroen.sk"],
    volvo: ["volvocars.com/uk", "volvocars.com/ie", "volvocars.com/de", "volvocars.com/sk"],
    tesla: ["tesla.com/en_gb", "tesla.com/en_ie", "tesla.com/de_de", "tesla.com/sk_sk"],
    lexus: ["lexus.co.uk", "lexus.ie", "lexus.de", "lexus.fr", "lexus.sk"],
    mazda: ["mazda.co.uk", "mazda.ie", "mazda.de", "mazda.fr", "mazda.sk"],
    nissan: ["nissan.co.uk", "nissan.ie", "nissan.de", "nissan.fr", "nissan.sk"],
    honda: ["honda.co.uk", "honda.ie", "honda.de", "honda.fr", "honda.sk"],
    opel: ["opel.co.uk", "opel.ie", "opel.de", "opel.fr", "opel.sk"],
    fiat: ["fiat.co.uk", "fiat.ie", "fiat.de", "fiat.fr", "fiat.sk"],
    byd: ["byd.com/uk", "byd.com/ie", "byd.com/de", "byd.com/sk"],
    cupra: ["cupraofficial.co.uk", "cupraofficial.ie", "cupraofficial.de", "cupraofficial.sk"],
    seat: ["seat.co.uk", "seat.ie", "seat.de", "seat.fr", "seat.sk"]
  };
  return sites[key] || [];
}

function brandAliases(brand) {
  const key = normalized(brand);
  const aliases = {
    "mercedes benz": ["mercedes benz", "mercedes"],
    "mercedes": ["mercedes", "mercedes benz"], "land rover": ["land rover", "landrover"],
    "alfa romeo": ["alfa romeo"], "aston martin": ["aston martin"], "rolls royce": ["rolls royce", "rolls-royce"],
    "volkswagen": ["volkswagen", "vw"], "vw": ["vw", "volkswagen"], "ds automobiles": ["ds automobiles", "ds"],
    "citroen": ["citroen", "citroën"], "skoda": ["skoda", "škoda"]
  };
  return aliases[key] || [key];
}

function phrasePresent(haystack, phrase) {
  const hay = ` ${normalized(haystack)} `;
  const needle = ` ${normalized(phrase)} `;
  return needle.trim().length > 2 && hay.includes(needle);
}

function brandMatchesText(brand, text) {
  return brandAliases(brand).some(alias => phrasePresent(text, alias));
}

function tokens(value) {
  return normalized(value).split(" ").filter(token => token.length >= 2);
}

function modelMatchesText(model, text) {
  const modelNorm = normalized(model);
  const hayNorm = normalized(text);
  if (!modelNorm || !hayNorm) return false;
  // The complete contiguous model designation is required. In particular,
  // Q5 L must not match Q5. A compact official spelling such as Q5L is allowed
  // only when the complete compact designation is present as its own token.
  if (` ${hayNorm} `.includes(` ${modelNorm} `)) return true;
  const parts = modelNorm.split(" ").filter(Boolean);
  if (parts.length > 1 && parts[parts.length - 1].length === 1) {
    const compact = parts.join("");
    return new RegExp(`\\b${compact}\\b`, "i").test(hayNorm);
  }
  return false;
}

function vehicleMatchesSource(car, source) {
  const haystack = `${source.title || ""} ${source.snippet || ""} ${source.url || ""}`;
  return brandMatchesText(car.brand, haystack) && modelMatchesText(car.model, haystack);
}

function sourceHost(source) {
  try { return new URL(source?.url || "").hostname.toLowerCase().replace(/^www\./, ""); }
  catch (_) { return ""; }
}

function isSpeculativeSource(source) {
  const text = normalized(`${source?.title || ""} ${source?.snippet || ""}`);
  return /\b(render|rendering|rendered|spy shot|spy shots|spyshot|artist impression|independent artist|imagined|unofficial|rumour|rumor|rumored|rendering shows|could look|might look|expected redesign|future generation|future model|next gen|next generation|upcoming|spied|test mule|successor|will debut|concept car|digital illustration|fan made)\b/.test(text);
}

function isLowTrustSource(source) {
  const host = sourceHost(source);
  return /(^|\.)(scribd\.com|batmangarage\.com|oembmwpart\.com|pinterest\.com|facebook\.com|instagram\.com|tiktok\.com|quora\.com)$/.test(host) ||
    /\b(forum|discussion|classified|marketplace|used cars|for sale|parts catalog)\b/.test(normalized(source?.title || ""));
}

function isOfficialManufacturerSource(brand, source) {
  const host = sourceHost(source);
  if (!host) return false;
  const key = normalized(brand).replace(/\s+/g, "");
  const officialRoots = {
    mercedesbenz: ["mercedes-benz"],
    mercedes: ["mercedes-benz", "mercedes"],
    volkswagen: ["volkswagen", "volkswagen-newsroom"],
    vw: ["volkswagen", "volkswagen-newsroom"],
    bmw: ["bmw"],
    audi: ["audi", "audi-mediacenter"],
    skoda: ["skoda", "skoda-storyboard"],
    toyota: ["toyota"],
    hyundai: ["hyundai"],
    kia: ["kia"],
    porsche: ["porsche"],
    ford: ["ford"],
    renault: ["renault"],
    peugeot: ["peugeot"],
    citroen: ["citroen"],
    volvo: ["volvocars", "volvo"],
    tesla: ["tesla"],
    jaguar: ["jaguar"],
    landrover: ["landrover"],
    lexus: ["lexus"],
    mazda: ["mazda"],
    nissan: ["nissan"],
    honda: ["honda"],
    opel: ["opel"],
    fiat: ["fiat"],
    byd: ["byd"],
    cupra: ["cupra"],
    seat: ["seat"],
    dsautomobiles: ["dsautomobiles"]
  };
  const roots = officialRoots[key] || [key];
  const suffixes = [
    "com", "eu", "sk", "cz", "de", "fr", "ie", "co.uk", "uk", "at", "be", "nl", "it", "es", "pl", "pt", "se", "no", "dk", "fi", "ch", "hu", "ro", "gr", "hr", "si", "bg", "lt", "lv", "ee", "is", "lu", "mt", "cy",
    "com.au", "com.cn", "cn", "co.jp", "co.kr", "co.in", "com.my", "com.us", "us", "co.nz"
  ];
  return roots.some(root => host === root || suffixes.some(suffix => host === `${root}.${suffix}` || host.endsWith(`.${root}.${suffix}`)));
}

function isEuropeanManufacturerSource(brand, source) {
  if (!isOfficialManufacturerSource(brand, source)) return false;
  let url;
  try { url = new URL(source?.url || ""); } catch (_) { return false; }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  // Block clearly non-European market domains before checking locale.
  if (/\.(?:com\.my|com\.au|com\.cn|cn|co\.jp|co\.kr|co\.in|com\.us)$/.test(host)) return false;
  const europeanDomain = /\.(?:eu|at|be|bg|hr|cy|cz|dk|ee|fi|fr|de|gr|hu|ie|it|lv|lt|lu|mt|nl|pl|pt|ro|sk|si|es|se|uk|gb|ch|no|is)$/.test(host) || /\.co\.uk$/.test(host);
  const localizedPath = /\/(?:sk|cz|de|fr|it|es|pl|nl|be|at|ie|pt|se|no|dk|fi|hu|ro|hr|si|bg|gr|uk|gb|ch)(?:[-_][a-z]{2})?(?:\/|$)|\/(?:[a-z]{2}[-_](?:eu|gb|ie|sk|cz|de|fr|it|es|pl|nl|be|at|ch|se|no|dk|fi|pt|hu|ro|gr|hr|si|bg))(?:\/|$)/i.test(url.pathname);
  // Bare .com is global, not proof of an EU offer. It counts only when the
  // actual URL explicitly enters a European country/language section.
  return europeanDomain || localizedPath;
}

function isCurrentModelEvidence(brand, source, model) {
  if (!source || !model || !isTrustedVehicleSource(brand, source) || !isOfficialManufacturerSource(brand, source) || !isEuropeanManufacturerSource(brand, source)) return false;
  const title = cleanString(source?.title || "", 300);
  const text = normalized(`${title} ${source?.snippet || ""}`);
  let url;
  try { url = new URL(source?.url || ""); } catch (_) { return false; }
  const hostAndUrl = `${sourceHost(source)} ${url.pathname}`.toLowerCase();

  // Dôkaz musí pomenovať presný model v titulku alebo produktovej URL.
  // Všeobecný konfigurátor značky ani snippet, ktorý iba spomína model, nestačí.
  const exactModelInTitle = modelMatchesText(model, title);
  const exactModelInPath = modelMatchesText(model, url.pathname.replace(/[\/_-]+/g, " "));
  if (!exactModelInTitle && !exactModelInPath) return false;

  if (/\b(discontinued|no longer available|out of production|production ended|end of production|ended production|replaced by its successor|withdrawn from sale|ceased production)\b/.test(text)) return false;
  if (/newsroom|press|media|motorsport|heritage|classic|archive|used-cars|\.pdf(?:$|[?#])/.test(hostAndUrl)) return false;
  if (isSpeculativeSource(source)) return false;

  const currentYear = new Date().getUTCFullYear();
  const explicitCurrent = /\b(current model|current generation|currently available|currently on sale|still on sale|current lineup|current range|new car configurator|order now|available to order|all new model|all new|latest model|configure now|build and price)\b/.test(text);
  const explicitSale = /\b(currently available|currently on sale|still on sale|available to order|order now|configure now|in stock|available now)\b/.test(text);
  const explicitOffer = /\b(price list|prices and specifications|price and specification|starting price|build your|configure|configurator|official price|available now|in stock)\b/.test(text);
  const historicalRange = [...`${source?.title || ""} ${source?.snippet || ""}`.matchAll(/\b(20\d{2})\s*(?:-|–|—|to)\s*(20\d{2})\b/g)].some(match => Number(match[2]) < currentYear - 1);
  const productPath = /\/(?:models?|all-models|vehicles?|passengercars|passenger-cars|new-cars|configurator)(?:\/|[-_.?]|$)/.test(url.pathname.toLowerCase());
  const modelSpecificProductPage = exactModelInTitle && exactModelInPath && productPath;
  const modelListingTitle = /\bmodels?\b|\bmodel overview\b|\bmodel range\b/.test(normalized(title));
  const nextYearMention = new RegExp(`\\b${currentYear + 1}\\b`).test(text);

  // Budúci kalendárny rok bez jasného potvrdenia objednávania nie je dôkaz
  // aktuálnej ponuky. Všeobecný konfigurátor ani stránka technických údajov
  // bez produktového kontextu sa nesmie považovať za predajný dôkaz.
  if (nextYearMention && !explicitSale) return false;
  if (historicalRange && !explicitSale) return false;
  return explicitSale || (explicitOffer && exactModelInTitle) || (modelSpecificProductPage && modelListingTitle && !historicalRange) || (modelSpecificProductPage && /\ball new\b/.test(text) && !historicalRange);
}

function hasCurrentEuropeanEvidence(candidate, sources) {
  const relevant = (sources || []).filter(source => vehicleMatchesSource(candidate, source));
  const currentOfficial = relevant.filter(source => isCurrentModelEvidence(candidate.brand, source, candidate.model));
  if (!currentOfficial.length) return false;

  // Contradictory evidence of a discontinued production run requires an
  // explicit current sale/order statement on an official European page.
  const currentYear = new Date().getUTCFullYear();
  const historicalRange = relevant.some(source => {
    const rawText = `${source.title || ""} ${source.snippet || ""}`;
    const text = normalized(rawText);
    const matches = [...rawText.matchAll(/\b(20\d{2})\s*(?:-|–|—|to)\s*(20\d{2})\b/g)];
    return matches.some(match => Number(match[2]) < currentYear - 1 &&
      /\b(spec|specification|dimensions|technical data|review|production|model)\b/.test(text));
  });
  if (historicalRange) {
    const unmistakablyCurrent = currentOfficial.some(source => {
      const text = normalized(`${source.title || ""} ${source.snippet || ""}`);
      return /\b(currently available|currently on sale|available to order|order now|still on sale|configure now|in stock|available now)\b/.test(text);
    });
    if (!unmistakablyCurrent) return false;
  }
  return true;
}

function isTrustedVehicleSource(brand, source) {
  if (!source || isLowTrustSource(source) || isSpeculativeSource(source)) return false;
  if (isOfficialManufacturerSource(brand, source)) return true;
  const host = sourceHost(source);
  return /(^|\.)(carwow\.com|autocar\.co\.uk|autoexpress\.co\.uk|motor1\.com|carscoops\.com|topgear\.com|autobild\.de|caranddriver\.com|edmunds\.com|whatcar\.com|autoevolution\.com|auto-data\.net|automoli\.com|automobiledimension\.com|parkers\.co\.uk|honestjohn\.co\.uk|autoblog\.com|insideevs\.com|drivingelectric\.com|bmwblog\.com|mercedesblog\.com)$/.test(host);
}

function sourceIdentityScore(car, source) {
  const title = `${source.title || ""}`;
  const body = `${source.title || ""} ${source.snippet || ""}`;
  const titleNorm = normalized(title);
  const bodyNorm = normalized(body);
  let score = 0;
  if (brandMatchesText(car.brand, title)) score += 7;
  else if (brandMatchesText(car.brand, body)) score += 3;
  for (const token of tokens(car.model)) {
    if (titleNorm.includes(token)) score += 6;
    else if (bodyNorm.includes(token)) score += 2;
  }
  if (isOfficialManufacturerSource(car.brand, source)) score += 12;
  else if (isTrustedVehicleSource(car.brand, source)) score += 5;
  if (/\b(?:technical data|technical specifications|specifications|price list|configurator|model overview|current model|model year)\b/i.test(body)) score += 2;
  if (isSpeculativeSource(source)) score -= 30;
  return score;
}

async function collectModelSources(candidates, firstSourceId = 1, searchState = createSearchState()) {
  const results = await mapWithConcurrency(candidates, 2, async candidate => {
    const queries = modelResearchQueries(candidate);
    const queryErrors = [];
    // Najviac dve súbežné požiadavky chránia vyhľadávacie API pred nárazovým 429.
    const groups = await mapWithConcurrency(queries, 2, async item => {
      try { return await searchSources(item.query, searchState, { deep: item.deep, type: item.type }); }
      catch (error) {
        queryErrors.push({ type: item.type, code: error?.code || "SEARCH_ERROR", message: cleanString(error?.message, 200) });
        console.warn(`CARMATCH AI: model source search failed for ${candidate.brand} ${candidate.model} (${item.type}):`, error.message);
        return [];
      }
    });

    const byUrl = new Map();
    for (const item of groups.flat()) {
      if (!item?.url || !vehicleMatchesSource(candidate, item)) continue;
      const old = byUrl.get(item.url);
      if (!old || (item.snippet || "").length > (old.snippet || "").length) byUrl.set(item.url, item);
    }
    const relevant = [...byUrl.values()].filter(item => !isLowTrustSource(item) && !isSpeculativeSource(item));
    const trusted = relevant.filter(item => isTrustedVehicleSource(candidate.brand, item));
    const matched = trusted
      .sort((a, b) => Number(isCurrentModelEvidence(candidate.brand, b, candidate.model)) - Number(isCurrentModelEvidence(candidate.brand, a, candidate.model)) ||
        sourceIdentityScore(candidate, b) - sourceIdentityScore(candidate, a) || (b.snippet || "").length - (a.snippet || "").length)
      .slice(0, MAX_SOURCES_PER_CAR);

    if (!matched.length) {
      const providerFailures = searchFailureSummary(searchState);
      const unavailable = queryErrors.some(item => item.code === "WEB_SEARCH_UNAVAILABLE") || (providerFailures.length > 0 && searchState.disabled.serper && searchState.disabled.tavily);
      if (unavailable) {
        throw new HttpError(`Webové vyhľadávanie je dočasne nedostupné pri overovaní ${candidate.brand} ${candidate.model}.`, 503, "WEB_SEARCH_UNAVAILABLE", {
          brand: candidate.brand, model: candidate.model, queryErrors, providerFailures, disabledProviders: { ...searchState.disabled }
        });
      }
      console.warn("CARMATCH AI: candidate rejected because no reliable model sources were found", {
        car: `${candidate.brand} ${candidate.model}`, queryErrors: queryErrors.length
      });
      return [];
    }

    console.info("CARMATCH AI: model source coverage", {
      car: `${candidate.brand} ${candidate.model}`,
      queries: queries.length,
      accepted: matched.length,
      sources: matched.map(source => ({
        title: cleanString(source.title, 100),
        host: sourceHost(source),
        official: isOfficialManufacturerSource(candidate.brand, source),
        trusted: isTrustedVehicleSource(candidate.brand, source),
        excerptLength: (source.snippet || "").length
      }))
    });
    return matched;
  });

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
  const labels = ["vehicle1", "vehicle2", "vehicle3"];
  const evidence = candidates.map((candidate, index) => {
    const sources = sourceGroups[index] || [];
    return `${labels[index]} – PEVNE PRIRADENÉ AUTO: ${candidate.brand} ${candidate.model}\n` +
      (sources.length ? sources.map(source => `${source.id} | ${source.title}\n${cleanString(source.snippet, 850)}\nURL: ${source.url}`).join("\n\n") : "Žiadne použiteľné zdroje.");
  }).join("\n\n==============================\n\n");

  return `Si automobilový rešeršný asistent pre Slovensko. Odpovedaj po slovensky a vráť iba JSON presne podľa schémy.\n` +
    `Dátum: ${new Date().toISOString().slice(0, 10)}\nPožiadavka: ${input.naturalLanguage || "Iba filtre"}\nFiltre: ${JSON.stringify(input.filters)}\n\n` +
    `DÔLEŽITÉ: vehicle1 patrí výhradne k ${candidates[0].brand} ${candidates[0].model}; vehicle2 výhradne k ${candidates[1].brand} ${candidates[1].model}; vehicle3 výhradne k ${candidates[2].brand} ${candidates[2].model}. Tieto tri pevné kľúče sa nesmú zamieňať. Každý blok dôkazov patrí iba svojmu vozidlu. Schéma nemá polia brand/model/name – identitu doplní backend.\n\n` +
    `DÔKAZY:\n${evidence}\n\n` +
    "Pravidlá: nepouži údaj z bloku iného vozidla. Nevymýšľaj hodnoty. Generáciu uveď len vtedy, ak ju dôveryhodný zdroj priamo pomenúva a dôkaz sa týka aktuálneho modelu; inak null. Modelový rok uveď iba pri výslovnom označení ‘model year/modelový rok’ pre konkrétne vozidlo; rok článku ani začiatok výroby nie sú modelový rok. Budúce rendery, špionážne fotografie, dohady a plánované nástupnícke generácie ignoruj. Výkon v kW; PS/CV/hp možno matematicky previesť na kW, nikdy neodhaduj podľa názvu motora. Cenu EUR uveď iba pre konkrétnu verziu a európsky trh s dôkazom, inak Cena neoverená. Spotreba iba WLTP. Kufor, rozmery a sedadlá musia patriť konkrétnej karosérii/verzii. Rozlišuj AWD/4x4 od FWD/RWD. Nemiešaj motorizácie. officialUrl, configurator a priceSource musia byť presné URL výrobcu, ktoré sú medzi zdrojmi; priceSource iba pri overenej cene. sourceIds uveď len relevantné ID zdrojov daného auta. Neznáme textové údaje označ Neoverené, neznáme čísla a generáciu/rok null. maintenance nikdy neodhaduj; ak zdroj neuvádza konkrétny údaj, použi Neoverené. reason stručne a vecne. pros a cons uveď iba ak sú podložené zdrojmi, inak prázdne polia. Bez textu mimo JSON.";
}

/* ---------------------------- EVIDENCE VALIDATION ---------------------------- */

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
  const metricPowers = [...evidence.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:PS|CV)\b/gi)].map(m => Number(m[1].replace(",", ".")));
  return kws.some(n => approximatelyEqual(amount, n, 0.02, 2)) ||
    hps.some(n => approximatelyEqual(amount * 1.341022, n, 0.025, 3)) ||
    metricPowers.some(n => approximatelyEqual(amount * 1.35962, n, 0.025, 3));
}

function verifyUnitNumber(value, evidence, unitPattern, tolerance = 0.02, minimum = 1) {
  const amount = parseNumeric(value);
  if (amount === null || !evidence) return false;
  const regex = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${unitPattern}`, "gi");
  return [...evidence.matchAll(regex)].some(match => approximatelyEqual(amount, Number(match[1].replace(",", ".")), tolerance, minimum));
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
  for (const match of evidence.matchAll(regex)) found.push(...numberList(match[1] || match[2]).filter(n => n >= 1000));
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
  const candidate = cleanString(value, 120);
  if (!candidate || !evidence) return false;
  const candidateNorm = normalized(candidate);
  const evidenceNorm = normalized(evidence);
  if (candidateNorm.length >= 4 && evidenceNorm.includes(candidateNorm)) return true;
  const codeMatch = candidate.match(/\b[A-Z]{1,3}\d{2,4}\b/i);
  if (codeMatch) {
    const code = normalized(codeMatch[0]);
    return new RegExp(`(?:generation|gen(?:eration)? code|chassis|platform|baureihe)[^\n]{0,70}\\b${code}\\b`, "i").test(evidenceNorm) ||
      new RegExp(`\\b${code}\\b[^\n]{0,50}(?:generation|gen(?:eration)?|chassis|platform|baureihe)`, "i").test(evidenceNorm);
  }
  const ordinal = candidate.match(/\b(1|2|3|4|first|second|third|fourth|1st|2nd|3rd|4th|prv[aáy]?|druh[aáy]?|tret[ií]a?|štvrt[aáy]?)\b/i);
  if (!ordinal || !/generat|generation|generaci|generac/i.test(candidateNorm)) return false;
  const terms = {
    "1": "(?:first|1st|1|prva)\\s+generation|(?:i)\\s+generation",
    first: "(?:first|1st|1|prva)\\s+generation|(?:i)\\s+generation",
    "1st": "(?:first|1st|1|prva)\\s+generation|(?:i)\\s+generation",
    "2": "(?:second|2nd|2|druha)\\s+generation|(?:ii)\\s+generation",
    second: "(?:second|2nd|2|druha)\\s+generation|(?:ii)\\s+generation",
    "2nd": "(?:second|2nd|2|druha)\\s+generation|(?:ii)\\s+generation",
    "3": "(?:third|3rd|3|tretia)\\s+generation|(?:iii)\\s+generation",
    third: "(?:third|3rd|3|tretia)\\s+generation|(?:iii)\\s+generation",
    "3rd": "(?:third|3rd|3|tretia)\\s+generation|(?:iii)\\s+generation",
    "4": "(?:fourth|4th|4|stv[r]?ta)\\s+generation|(?:iv)\\s+generation",
    fourth: "(?:fourth|4th|4|stv[r]?ta)\\s+generation|(?:iv)\\s+generation",
    "4th": "(?:fourth|4th|4|stv[r]?ta)\\s+generation|(?:iv)\\s+generation"
  };
  const pattern = terms[ordinal[1].toLowerCase()];
  return Boolean(pattern && new RegExp(pattern, "i").test(evidenceNorm));
}

function corroboratedFact(facts, brand, yearOrLabel) {
  const matching = facts.filter(item => item && item.value === yearOrLabel);
  const official = matching.some(item => isOfficialManufacturerSource(brand, item.source));
  const hosts = new Set(matching.map(item => sourceHost(item.source)).filter(Boolean));
  return official || hosts.size >= 2;
}

function sourceModelYearFact(car, source) {
  if (!vehicleMatchesSource(car, source) || !isCurrentModelEvidence(car.brand, source, car.model)) return null;
  const text = `${source.title || ""} ${source.snippet || ""}`;
  const norm = normalized(text);
  const patterns = [
    /\bmodel\s*year\s*(20\d{2})\b/i,
    /\bmodel\s*yr\s*(20\d{2})\b/i,
    /\bmy\s*(20\d{2})\b/i,
    /\b(20\d{2})\s*model\s*year\b/i,
    /\bmodelovy\s*rok\s*(20\d{2})\b/i,
    /\bmodeljaar\s*(20\d{2})\b/i
  ];
  for (const pattern of patterns) {
    const match = norm.match(pattern);
    if (match) {
      const year = Number(match[1]);
      if (year >= 1990 && year <= new Date().getUTCFullYear() + 1) return { value: year, source, kind: "explicit_model_year" };
    }
  }
  // Produkčné roky, dátum uvedenia a rok publikovania nikdy nepovažujeme za MY.
  return null;
}

function verifyModelYear(value, car, sources) {
  const year = parseNumeric(value);
  if (!Number.isInteger(year) || year < 1990 || year > new Date().getUTCFullYear() + 1) return false;
  const facts = sources.map(source => sourceModelYearFact(car, source)).filter(Boolean).map(item => ({ value: item.value, source: item.source }));
  return corroboratedFact(facts, car.brand, year);
}

function inferModelYearFromSources(car, sources) {
  const facts = sources.map(source => sourceModelYearFact(car, source)).filter(Boolean).map(item => ({ value: item.value, source: item.source }));
  const years = [...new Set(facts.map(item => item.value))].sort((a, b) => b - a);
  for (const year of years) if (corroboratedFact(facts, car.brand, year)) return year;
  return null;
}

function inferGenerationFromSources(car, sources) {
  const relevant = sources
    .filter(source => vehicleMatchesSource(car, source) && isCurrentModelEvidence(car.brand, source, car.model))
    .sort((a, b) => sourceIdentityScore(car, b) - sourceIdentityScore(car, a));
  const phrases = [
    { pattern: /\b(?:second|2nd) generation\b|\bII\s*generation\b|\bdruha generacia\b/i, value: "2. generácia" },
    { pattern: /\b(?:third|3rd) generation\b|\bIII\s*generation\b|\btretia generacia\b/i, value: "3. generácia" },
    { pattern: /\b(?:fourth|4th) generation\b|\bIV\s*generation\b|\bstvrta generacia\b/i, value: "4. generácia" },
    { pattern: /\b(?:first|1st) generation\b|\bI\s*generation\b|\bprva generacia\b/i, value: "1. generácia" }
  ];
  for (const phrase of phrases) {
    const matching = relevant.filter(source => phrase.pattern.test(normalized(`${source.title || ""} ${source.snippet || ""}`)));
    const official = matching.some(source => isOfficialManufacturerSource(car.brand, source));
    const hosts = new Set(matching.map(sourceHost).filter(Boolean));
    if (official || hosts.size >= 2) return phrase.value;
  }

  // Some manufacturers identify generations by chassis/series codes rather
  // than ordinal numbers (e.g. a model code in brackets). Accept a code only
  // when it is explicitly tied to this model and either published by the
  // manufacturer or independently repeated by two trusted domains.
  const codeFacts = new Map();
  for (const source of relevant) {
    const rawText = `${source.title || ""} ${source.snippet || ""}`;
    const codes = [...rawText.matchAll(/\b([A-Z]{1,3}\d{2,4})\b/g)];
    for (const match of codes) {
      const code = match[1].toUpperCase();
      const before = rawText.slice(Math.max(0, match.index - 90), match.index);
      const after = rawText.slice(match.index + match[0].length, match.index + match[0].length + 90);
      const normalizedText = normalized(rawText);
      const modelAndCode = normalized(`${car.brand} ${car.model} ${code}`);
      const explicitAssociation = /\b(generation|chassis|model code|series|baureihe|platform|internal designation|type code)\b/i.test(`${before} ${after}`) ||
        ` ${normalizedText} `.includes(` ${modelAndCode} `);
      if (!explicitAssociation) continue;
      const fact = codeFacts.get(code) || { hosts: new Set(), official: false };
      fact.hosts.add(sourceHost(source));
      fact.official = fact.official || isOfficialManufacturerSource(car.brand, source);
      codeFacts.set(code, fact);
    }
  }
  for (const [code, fact] of codeFacts) if (fact.official || fact.hosts.size >= 2) return code;
  return null;
}

function verifyOfficialUrl(value, sourceIds, sources, brand) {
  const url = safeHttpsUrl(value);
  if (!url) return "";
  // URL musí byť presne medzi zdrojmi a hostiteľ musí patriť výrobcovi.
  return sources.some(source =>
    sourceIds.includes(source.id) &&
    safeHttpsUrl(source.url) === url &&
    isEuropeanManufacturerSource(brand, source)
  ) ? url : "";
}

function verifyConfiguratorUrl(value, sourceIds, sources, brand) {
  const url = verifyOfficialUrl(value, sourceIds, sources, brand);
  if (!url) return "";
  const source = sources.find(item => sourceIds.includes(item.id) && safeHttpsUrl(item.url) === url);
  const evidence = normalized(`${source?.title || ""} ${source?.snippet || ""} ${url}`);
  return /\b(configurator|configure|konfigurator|konfigurovat|build your|build and price|build your own)\b/.test(evidence) ? url : "";
}

function verifyPriceSource(value, price, sourceIds, sources, brand) {
  const url = safeHttpsUrl(value);
  if (!url || !price || price === "Cena neoverená") return "";
  return sources.some(source => {
    if (!sourceIds.includes(source.id) || safeHttpsUrl(source.url) !== url) return false;
    if (!isEuropeanManufacturerSource(brand, source)) return false;
    return verifyPrice(price, `${source.title || ""}\n${source.snippet || ""}`);
  }) ? url : "";
}

function drivetrainMatches(actual, requested) {
  const a = normalized(actual);
  const r = normalized(requested);
  if (!a || !r) return false;
  const groups = [
    { keys: ["4x4", "4wd", "awd", "4motion", "quattro", "xdrive", "4matic", "all wheel drive", "four wheel drive"], label: "awd" },
    { keys: ["fwd", "front wheel drive", "predny nahon", "predny pohon"], label: "fwd" },
    { keys: ["rwd", "rear wheel drive", "zadny nahon", "zadny pohon"], label: "rwd" }
  ];
  const groupFor = value => groups.find(group => group.keys.some(key => value.includes(normalized(key))))?.label || "";
  const actualGroup = groupFor(a);
  const requestedGroup = groupFor(r);
  return actualGroup && requestedGroup ? actualGroup === requestedGroup : a.includes(r) || r.includes(a);
}

function parsePowerKw(value) {
  const match = String(value || "").match(/(\d+(?:[.,]\d+)?)\s*kW\b/i);
  return match ? Number(match[1].replace(",", ".")) : null;
}

function normalizeCar(rawCar, candidate, allSources, filters) {
  const raw = rawCar && typeof rawCar === "object" && !Array.isArray(rawCar) ? rawCar : {};
  // Identita pochádza iba z kandidátskeho výberu, nikdy z finálnej odpovede AI.
  const identity = {
    brand: cleanString(candidate?.brand, 80),
    model: cleanString(candidate?.model, 100),
    name: `${cleanString(candidate?.brand, 80)} ${cleanString(candidate?.model, 100)}`.trim()
  };
  if (!identity.brand || !identity.model) throw new HttpError("Kandidát nemá platnú značku a model.", 502, "CANDIDATE_IDENTITY_INCOMPLETE");
  const carSources = relevantSourcesForCar(identity, allSources)
    .filter(source => isTrustedVehicleSource(identity.brand, source));
  const sourceIds = carSources.map(source => source.id);
  const evidenceSources = carSources.filter(source => !isSpeculativeSource(source) && !isLowTrustSource(source));
  const evidence = evidenceSources.map(source => `${source.title}\n${source.snippet}\n${source.url}`).join("\n\n");

  const rawGeneration = cleanString(raw.generation, 120);
  const rawYear = parseNumeric(raw.modelYear ?? raw.year);
  const inferredGeneration = inferGenerationFromSources(identity, evidenceSources);
  const generationEvidence = evidenceSources.filter(source => isCurrentModelEvidence(identity.brand, source, identity.model))
    .map(source => `${source.title}\n${source.snippet}\n${source.url}`).join("\n\n");
  const generation = rawGeneration && verifyGeneration(rawGeneration, generationEvidence) ? rawGeneration : inferredGeneration;
  const inferredYear = inferModelYearFromSources(identity, evidenceSources);
  const modelYear = rawYear !== null && verifyModelYear(rawYear, identity, evidenceSources) ? Math.round(rawYear) : inferredYear;
  const generationVerified = Boolean(generation) && verifyGeneration(generation, generationEvidence);
  const yearVerified = Number.isInteger(modelYear) && verifyModelYear(modelYear, identity, evidenceSources);
  // Neoverená identita generácie/roka nie je dôvod na pád celého vyhľadávania.
  const safeGeneration = generationVerified ? generation : null;
  const safeModelYear = yearVerified ? modelYear : null;

  const rawEngine = cleanString(raw.engine, 100);
  const rawTrim = cleanString(raw.trim, 100);
  const variantAnchors = [rawEngine, rawTrim].filter(value => value && normalized(value) !== "neoverene");
  const variantSources = evidenceSources.filter(source => {
    const sourceText = `${source.title}\n${source.snippet}\n${source.url}`;
    return variantAnchors.some(anchor => verifyText(anchor, sourceText, 1));
  });
  const variantEvidence = variantSources.map(source => `${source.title}\n${source.snippet}\n${source.url}`).join("\n\n");

  const rawPower = cleanString(raw.power, 80);
  const power = variantSources.length && verifyPower(rawPower, variantEvidence) ? rawPower : "Neoverené";
  const rawPrice = cleanString(raw.price, 100);
  const officialPriceSources = evidenceSources.filter(source =>
    isEuropeanManufacturerSource(identity.brand, source) &&
    (!variantAnchors.length || variantAnchors.some(anchor => verifyText(anchor, `${source.title}\n${source.snippet}\n${source.url}`, 1)))
  );
  const officialPriceEvidence = officialPriceSources.map(source => `${source.title}\n${source.snippet}\n${source.url}`).join("\n\n");
  const price = verifyPrice(rawPrice, officialPriceEvidence) ? rawPrice : "Cena neoverená";
  const seats = verifySeats(raw.seats, evidence) ? Number(raw.seats) : null;
  const trunkRaw = raw.trunkLiters ?? raw.trunk ?? raw.bootSpace;
  const trunkLiters = verifyUnitNumber(trunkRaw, evidence, "(?:l|litres?|liters?|litrov|litre)\\b", 0.02, 2) ? parseNumeric(trunkRaw) : null;
  const lengthRaw = raw.lengthMm ?? raw.length;
  const lengthMm = verifyUnitNumber(lengthRaw, evidence, "mm\\b", 0.01, 5) ? parseNumeric(lengthRaw) : null;

  const consumptionRaw = cleanString(raw.consumptionWltp ?? raw.wltpConsumption, 80);
  let consumptionWltp = "Neoverené";
  if (consumptionRaw && variantSources.length && /\bWLTP\b/i.test(variantEvidence)) {
    const numeric = parseNumeric(consumptionRaw);
    const unitPattern = /kWh/i.test(consumptionRaw) ? "kWh(?:\\s*\\/\\s*100\\s*km)?\\b" : "l(?:\\s*\\/\\s*100\\s*km)?\\b";
    if (numeric !== null && verifyUnitNumber(numeric, variantEvidence, unitPattern, 0.05, 0.1)) consumptionWltp = consumptionRaw;
  }

  const textField = (value, fieldEvidence = evidence, fallback = "Neoverené") => {
    const candidateText = cleanString(value, 100);
    return candidateText && verifyText(candidateText, fieldEvidence, 1) ? candidateText : fallback;
  };
  const officialPriceSourceIds = officialPriceSources.map(source => source.id);
  const verifiedPriceSource = price !== "Cena neoverená" ? verifyPriceSource(raw.priceSource, price, officialPriceSourceIds, officialPriceSources, identity.brand) : "";
  const finalPrice = verifiedPriceSource ? price : "Cena neoverená";
  const priceSource = verifiedPriceSource;
  const configurator = verifyConfiguratorUrl(raw.configurator, sourceIds, carSources, identity.brand);
  const officialUrl = verifyOfficialUrl(raw.officialUrl, sourceIds, carSources, identity.brand);

  const supportedList = (value) => Array.isArray(value)
    ? value.slice(0, 3).map(item => cleanString(item, 150)).filter(item => item && verifyText(item, evidence, 1))
    : [];

  return {
    brand: identity.brand,
    model: identity.model,
    name: identity.name,
    generation: safeGeneration,
    generationStatus: safeGeneration ? "verified" : "unverified",
    currentModelVerified: hasCurrentEuropeanEvidence(identity, carSources),
    marketStatus: hasCurrentEuropeanEvidence(identity, carSources) ? "verified" : "unverified",
    modelYear: safeModelYear,
    modelYearStatus: safeModelYear ? "verified" : "unverified",
    year: safeModelYear,
    trim: textField(raw.trim, variantEvidence),
    body: textField(raw.body || raw.bodyType),
    price: finalPrice,
    priceSource,
    power,
    engine: textField(raw.engine, variantEvidence),
    consumptionWltp,
    seats,
    trunkLiters,
    drivetrain: textField(raw.drivetrain || raw.drive, variantEvidence),
    fuel: textField(raw.fuel, variantEvidence),
    transmission: textField(raw.transmission, variantEvidence),
    lengthMm,
    reason: cleanString(raw.reason, 500),
    pros: supportedList(raw.pros),
    cons: supportedList(raw.cons),
    maintenance: "Neoverené",
    configurator,
    officialUrl,
    sourceIds
  };
}

function validateFilters(cars, filters) {
  for (const car of cars) {
    if (filters.seats && (car.seats === null || car.seats < filters.seats)) throw new HttpError(`${car.name}: požadovaný počet sedadiel sa nepodarilo potvrdiť alebo ho auto nespĺňa.`, 502, "FILTER_NOT_VERIFIED");
    if (filters.power && (parsePowerKw(car.power) === null || parsePowerKw(car.power) < filters.power)) throw new HttpError(`${car.name}: požadovaný výkon sa nepodarilo potvrdiť alebo ho auto nespĺňa.`, 502, "FILTER_NOT_VERIFIED");
    if (filters.trunk && (car.trunkLiters === null || car.trunkLiters < filters.trunk)) throw new HttpError(`${car.name}: požadovaný objem kufra sa nepodarilo potvrdiť alebo ho auto nespĺňa.`, 502, "FILTER_NOT_VERIFIED");
    if (filters.length && (car.lengthMm === null || car.lengthMm > filters.length * 1000)) throw new HttpError(`${car.name}: požadovanú dĺžku sa nepodarilo potvrdiť alebo ju auto prekračuje.`, 502, "FILTER_NOT_VERIFIED");
    if (filters.year && (car.modelYear === null || car.modelYear < filters.year)) throw new HttpError(`${car.name}: modelový rok sa nepodarilo potvrdiť alebo je starší než požadovaný rok.`, 502, "FILTER_NOT_VERIFIED");
    if (filters.budget) {
      const priceAmount = car.price === "Cena neoverená" ? null : parseNumeric(car.price);
      if (priceAmount === null || priceAmount > filters.budget) throw new HttpError(`${car.name}: cenu sa nepodarilo potvrdiť v rámci zadaného rozpočtu.`, 502, "FILTER_NOT_VERIFIED");
    }
    if (filters.avoid && normalized(filters.avoid).split(" ").some(token => token && normalized(car.brand).includes(token))) throw new HttpError(`${car.name}: značka je uvedená medzi značkami, ktorým sa chceš vyhnúť.`, 502, "FILTER_NOT_VERIFIED");
    if (filters.drive && (car.drivetrain === "Neoverené" || !drivetrainMatches(car.drivetrain, filters.drive))) throw new HttpError(`${car.name}: pohon sa nepodarilo potvrdiť alebo nespĺňa filter.`, 502, "FILTER_NOT_VERIFIED");
    if (filters.fuel && (car.fuel === "Neoverené" || !normalized(car.fuel).includes(normalized(filters.fuel)))) throw new HttpError(`${car.name}: palivo sa nepodarilo potvrdiť alebo nespĺňa filter.`, 502, "FILTER_NOT_VERIFIED");
    if (filters.body && (car.body === "Neoverené" || !normalized(car.body).includes(normalized(filters.body)))) throw new HttpError(`${car.name}: karosériu sa nepodarilo potvrdiť alebo nespĺňa filter.`, 502, "FILTER_NOT_VERIFIED");
  }
}

/* ---------------------------- PHOTO SEARCH ---------------------------- */

function rejectedPhotoText(value) {
  return /\b(logo|emblem|badge|interior|dashboard|cockpit|steering|brochure|manual|diagram|drawing|illustration|render|toy|model kit|scale model|miniature|poster|screenshot|crash|accident|spare part|technical drawing|wallpaper)\b/i.test(normalized(value));
}

function generationPhotoMatch(haystack, car) {
  const generation = cleanString(car.generation, 100);
  if (!generation) return false;
  const hay = normalized(haystack);
  const codes = generation.match(/\b[A-Z]{1,3}\d{2,4}\b/gi) || [];
  if (codes.length) return codes.every(code => hay.includes(normalized(code)));
  const gen = normalized(generation);
  if (gen.length >= 6 && hay.includes(gen)) return true;
  const ordinalMatch = generation.match(/\b(1|2|3|4|first|second|third|fourth|1st|2nd|3rd|4th)\b/i);
  if (!ordinalMatch) return false;
  const word = ordinalMatch[1].toLowerCase();
  const alternatives = {
    "1": ["first generation", "1st generation", "1st gen"], first: ["first generation", "1st generation", "1st gen"], "1st": ["first generation", "1st generation", "1st gen"],
    "2": ["second generation", "2nd generation", "2nd gen", "ii generation", "2 generation", "druha generacia", "2 generacia"], second: ["second generation", "2nd generation", "2nd gen", "ii generation", "druha generacia"], "2nd": ["second generation", "2nd generation", "2nd gen", "ii generation", "druha generacia"],
    "3": ["third generation", "3rd generation", "3rd gen", "iii generation", "3 generation", "tretia generacia", "3 generacia"], third: ["third generation", "3rd generation", "3rd gen", "iii generation", "tretia generacia"], "3rd": ["third generation", "3rd generation", "3rd gen", "iii generation", "tretia generacia"],
    "4": ["fourth generation", "4th generation", "4th gen", "iv generation", "4 generation", "stv rta generacia", "4 generacia"], fourth: ["fourth generation", "4th generation", "4th gen", "iv generation"], "4th": ["fourth generation", "4th generation", "4th gen", "iv generation"]
  };
  return (alternatives[word] || []).some(term => hay.includes(normalized(term)));
}

function photoMetadataMatches(item, car) {
  const title = cleanString(item?.title, 350);
  const sourceUrl = safeHttpsUrl(item?.link || item?.source || item?.descriptionurl);
  const haystack = normalized(`${title} ${sourceUrl}`);
  if (!haystack || rejectedPhotoText(title) || isSpeculativeSource({ title, snippet: sourceUrl })) return false;
  if (!brandMatchesText(car.brand, title) || !modelMatchesText(car.model, title)) return false;

  const years = [...haystack.matchAll(/\b(20\d{2})\b/g)].map(match => Number(match[1]));
  const yearMatched = Number.isInteger(car.modelYear) && years.includes(car.modelYear);
  const generationMatched = Boolean(car.generation) && generationPhotoMatch(title, car);
  if (car.generation && !generationMatched && !yearMatched) return false;
  if (Number.isInteger(car.modelYear) && !yearMatched && !generationMatched) return false;
  if (Number.isInteger(car.modelYear) && years.some(year => year !== car.modelYear) && !generationMatched) return false;

  const expectedCodes = cleanString(car.generation, 100).match(/\b[A-Z]{1,3}\d{2,4}\b/gi) || [];
  const foundCodes = title.match(/\b[A-Z]{1,3}\d{2,4}\b/gi) || [];
  if (expectedCodes.length && (!foundCodes.length || !expectedCodes.some(code => foundCodes.some(found => normalized(found) === normalized(code))))) return false;

  // Generation/model year can be unavailable even when the European model
  // itself is confirmed. In that case accept only a photo title with the exact
  // brand+full model name; an old dated image is still rejected. The response
  // keeps photoStatus=model_matched so this is not mislabelled as generation proof.
  if (!yearMatched && !generationMatched) {
    const currentYear = new Date().getUTCFullYear();
    if (car.marketStatus !== "verified") return false;
    if (years.some(year => year < currentYear - 2)) return false;
  }
  return true;
}

async function searchSerperPhotos(car, searchState = null) {
  if (!SERPER_API_KEY) return [];
  const identityHint = car.generation || (car.modelYear ? `model year ${car.modelYear}` : `current European model ${new Date().getUTCFullYear()}`);
  const queries = [
    `${car.brand} ${car.model} ${identityHint} official press image exterior`,
    `${car.brand} ${car.model} official manufacturer media gallery current model exterior`
  ];
  const output = [];
  const seen = new Set();
  let lastError = null;
  let received = 0;
  for (const query of queries) {
    let rows = [];
    try { rows = await serperSearch(query, "images", 10); received += rows.length; }
    catch (error) {
      lastError = error;
      recordSearchFailure(searchState, "serper", error);
      if (Number(error?.statusCode) === 400 && searchState?.disabled) searchState.disabled.serperImages = true;
      console.warn(`CARMATCH AI: Serper image query failed for ${car.name}:`, { statusCode: Number(error?.statusCode) || null, message: cleanString(error?.message, 300) });
      if (searchState?.disabled?.serper || searchState?.disabled?.serperImages) break;
      continue;
    }
    for (const item of rows) {
      if (!photoMetadataMatches(item, car)) continue;
      const url = safeHttpsUrl(item.imageUrl || item.thumbnailUrl);
      const source = safeHttpsUrl(item.link);
      if (!url || !source || seen.has(url)) continue;
      seen.add(url);
      const photoTitle = cleanString(item.title, 250);
      const photoYears = [...normalized(photoTitle).matchAll(/\b(20\d{2})\b/g)].map(match => Number(match[1]));
      output.push({
        url,
        source,
        title: photoTitle,
        width: Number(item.imageWidth) || null,
        height: Number(item.imageHeight) || null,
        modelYearMatched: photoYears.includes(Number(car.modelYear)),
        generationMatched: generationPhotoMatch(photoTitle, car)
      });
      if (output.length >= MAX_PHOTOS_PER_CAR) break;
    }
    if (output.length > 0) break;
  }
  if (!output.length && lastError) console.warn(`CARMATCH AI: Serper returned no usable photos for ${car.name}; last error:`, lastError.message);
  console.info("CARMATCH AI: Serper photo search", { car: car.name, queries: queries.length, received, accepted: output.length, configured: true });
  return output;
}

function commonsRetryDelay(response) {
  const value = response?.headers?.get?.("retry-after");
  if (!value) return 1500;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 1500;
}

async function fetchCommonsWithRetry(url) {
  let response;
  for (let attempt = 0; attempt < 2; attempt++) {
    response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "CARMATCH-AI/1.0 (https://carmatchai.vercel.app)",
        "Api-User-Agent": "CARMATCH-AI/1.0 (https://carmatchai.vercel.app)"
      }
    }, IMAGE_TIMEOUT_MS);
    if (response.status !== 429 && response.status !== 503) return response;
    if (attempt === 1) return response;
    const delay = commonsRetryDelay(response);
    if (delay > 2500) return response;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  return response;
}

async function searchCommonsPhotos(car) {
  const identityHint = car.generation || (car.modelYear ? ` ${car.modelYear}` : "");
  const query = `${car.brand} ${car.model}${identityHint}`;
  const params = new URLSearchParams({
    action: "query", generator: "search", gsrsearch: query, gsrnamespace: "6", gsrlimit: "30",
    prop: "imageinfo", iiprop: "url|extmetadata", iiurlwidth: "1400", format: "json", origin: "*"
  });
  const response = await fetchCommonsWithRetry(`https://commons.wikimedia.org/w/api.php?${params.toString()}`);
  if (!response.ok) throw new Error(`Wikimedia HTTP ${response.status} for ${car.name}`);
  const data = await responseJson(response);
  if (data?.error) throw new Error(`Wikimedia API: ${cleanString(data.error.info || data.error.code, 250)}`);
  const pages = Object.values(data?.query?.pages || {});
  const output = [];
  const seen = new Set();
  for (const page of pages) {
    const title = cleanString(page?.title, 300).replace(/^File:/i, "");
    const info = page?.imageinfo?.[0] || {};
    if (info.mime && !String(info.mime).startsWith("image/")) continue;
    const item = { title, link: info.descriptionurl || page?.canonicalurl };
    if (!photoMetadataMatches(item, car)) continue;
    const url = safeHttpsUrl(info.thumburl || info.url);
    const source = safeHttpsUrl(info.descriptionurl || page?.canonicalurl);
    if (!url || !source || seen.has(url)) continue;
    seen.add(url);
    output.push({
      url, source, title, width: Number(info.width) || null, height: Number(info.height) || null,
      modelYearMatched: [...normalized(title).matchAll(/\b(20\d{2})\b/g)].some(match => Number(match[1]) === Number(car.modelYear)),
      generationMatched: generationPhotoMatch(title, car)
    });
    if (output.length >= MAX_PHOTOS_PER_CAR) break;
  }
  console.info("CARMATCH AI: Wikimedia photo search", { car: car.name, queries: 1, received: pages.length, accepted: output.length });
  return output;
}

async function findPhotosForCar(car, searchState = null) {
  let photos = [];
  if (SERPER_API_KEY && !searchState?.disabled?.serper && !searchState?.disabled?.serperImages) {
    try { photos = await searchSerperPhotos(car, searchState); }
    catch (error) { console.warn(`CARMATCH AI: Serper image search failed for ${car.name}:`, cleanString(error?.message, 250)); }
  }
  if (!photos.length) {
    try { photos = await searchCommonsPhotos(car); }
    catch (error) { console.warn(`CARMATCH AI: Wikimedia image search failed for ${car.name}:`, cleanString(error?.message, 250)); }
  }
  if (!photos.length) {
    console.warn("CARMATCH AI: no sufficiently matching photo; returning car without an image", {
      car: car.name, generation: car.generation, modelYear: car.modelYear
    });
    return { ...car, image: "", imageUrl: "", photoSource: "", imageCandidates: [], images: [], photoStatus: "unavailable" };
  }
  const photo = photos[0];
  const photoIdentityMatched = Boolean(car.generation && generationPhotoMatch(photo.title, car));
  const photoYearMatched = Boolean(car.modelYear && photo.modelYearMatched);
  return {
    ...car,
    image: photo.url,
    imageUrl: photo.url,
    photoSource: photo.source,
    imageCandidates: photos,
    images: photos,
    photoStatus: photoIdentityMatched ? "generation_matched" : photoYearMatched ? "model_year_matched" : "model_matched"
  };
}

async function supplementIdentitySources(candidates, rawCars, existingSources, searchState = createSearchState()) {
  const seen = new Set(existingSources.map(source => source.url));
  const additionsByCandidate = await mapWithConcurrency(candidates, 2, async candidate => {
    const raw = rawCars.find(item => normalized(`${item?.brand || ""} ${item?.model || ""}`) === normalized(`${candidate.brand} ${candidate.model}`)) || {};
    const existingForCar = relevantSourcesForCar(candidate, existingSources).filter(source => !isSpeculativeSource(source) && !isLowTrustSource(source));
    const currentGenerationEvidence = existingForCar.filter(source => isCurrentModelEvidence(candidate.brand, source, candidate.model))
      .map(source => `${source.title}\n${source.snippet}\n${source.url}`).join("\n");
    const hasGeneration = (raw.generation && verifyGeneration(raw.generation, currentGenerationEvidence)) || inferGenerationFromSources(candidate, existingForCar);
    const hasYear = inferModelYearFromSources(candidate, existingForCar);
    if (hasGeneration && hasYear) return [];
    const year = new Date().getUTCFullYear();
    const queries = [
      `"${candidate.brand}" "${candidate.model}" official current generation chassis code and explicit model year ${year} ${year + 1} Europe`
    ];
    const groups = await mapWithConcurrency(queries, 2, async query => {
      try { return await searchSources(query, searchState); }
      catch (error) { console.warn(`CARMATCH AI: identity follow-up search failed for ${candidate.brand} ${candidate.model}:`, cleanString(error?.message, 200)); return []; }
    });
    const byUrl = new Map();
    for (const source of groups.flat()) {
      if (!source?.url || !vehicleMatchesSource(candidate, source) || isSpeculativeSource(source) || isLowTrustSource(source)) continue;
      const old = byUrl.get(source.url);
      if (!old || (source.snippet || "").length > (old.snippet || "").length) byUrl.set(source.url, source);
    }
    return [...byUrl.values()].filter(source => !seen.has(source.url) && isTrustedVehicleSource(candidate.brand, source))
      .sort((a, b) => sourceIdentityScore(candidate, b) - sourceIdentityScore(candidate, a))
      .slice(0, MAX_IDENTITY_RESEARCH_SOURCES_PER_CAR);
  });

  const combined = [...existingSources];
  const addedUrls = new Set();
  let nextId = combined.reduce((max, source) => {
    const n = Number(String(source.id || "").replace(/^S/i, ""));
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 0) + 1;
  for (const rows of additionsByCandidate) {
    for (const source of rows) {
      if (seen.has(source.url) || addedUrls.has(source.url)) continue;
      addedUrls.add(source.url);
      combined.push({ id: `S${nextId++}`, title: source.title, url: source.url, snippet: source.snippet });
    }
  }
  return combined.slice(0, MAX_TOTAL_SOURCES);
}

/* ---------------------------- MAIN SEARCH ---------------------------- */

async function buildCars(input, searchState = createSearchState()) {
  const generalRows = await searchSources(buildGeneralQuery(input), searchState).catch(error => {
    console.warn("CARMATCH AI: general web search failed:", { code: error?.code || "SEARCH_ERROR", statusCode: Number(error?.statusCode) || null, message: cleanString(error?.message, 300) });
    if (error?.code === "WEB_SEARCH_UNAVAILABLE") throw error;
    return [];
  });
  const generalSources = assignSourceIds(generalRows, 1, 4);
  const rejectedCandidates = [];
  let candidates = null;
  let modelSources = [];
  let sourceGroups = [];
  let currentnessPassed = false;

  // Dva pokusy maximum: druhý vyberie náhrady, ak prvý výber nemá dôkaz
  // aktuálnej európskej ponuky. Zastarané/regionálne modely sa nezobrazia.
  for (let attempt = 0; attempt < 2; attempt++) {
    const candidateResult = await generateAI(candidatePrompt(input, generalSources, rejectedCandidates), {
      maxOutputTokens: 850,
      schema: CANDIDATE_SCHEMA,
      schemaName: `carmatch_candidates_v42_attempt_${attempt + 1}`
    });
    if (!Array.isArray(candidateResult?.cars) || candidateResult.cars.length !== 3) {
      throw new HttpError("AI nedokázala vybrať presne tri kandidátske vozidlá.", 502, "INVALID_CANDIDATES");
    }
    const proposed = candidateResult.cars.map((candidate, index) => {
      const brand = canonicalizeBrand(candidate?.brand);
      const model = cleanString(candidate?.model, 100);
      if (!brand || !model) throw new HttpError(`Pri kandidátovi č. ${index + 1} chýba značka alebo model.`, 502, "CANDIDATE_IDENTITY_INCOMPLETE");
      return { brand, model };
    });
    const unique = new Set(proposed.map(car => normalized(`${car.brand} ${car.model}`)));
    if (unique.size !== 3) throw new HttpError("AI vybrala duplicitné modely namiesto troch odlišných vozidiel.", 502, "DUPLICATE_CARS");

    const research = await collectModelSources(proposed, generalSources.length + 1, searchState);
    const invalid = proposed.filter((candidate, index) => !hasCurrentEuropeanEvidence(candidate, research.perCar[index]));
    if (!invalid.length) {
      candidates = proposed;
      modelSources = research.all;
      sourceGroups = research.perCar;
      currentnessPassed = true;
      break;
    }
    for (const candidate of invalid) {
      const label = `${candidate.brand} ${candidate.model}`;
      if (!rejectedCandidates.includes(label)) rejectedCandidates.push(label);
    }
    console.warn("CARMATCH AI: candidate set rejected; current European offer not verified", {
      attempt: attempt + 1,
      rejected: invalid.map(car => `${car.brand} ${car.model}`),
      evidenceCounts: proposed.map((car, index) => ({ car: `${car.brand} ${car.model}`, relevantSources: (research.perCar[index] || []).filter(source => vehicleMatchesSource(car, source)).length, currentEuropeanProof: hasCurrentEuropeanEvidence(car, research.perCar[index]) }))
    });
  }

  if (!currentnessPassed || !candidates) {
    throw new HttpError(
      "Nepodarilo sa spoľahlivo potvrdiť aktuálnu európsku ponuku všetkých troch vybraných áut. Aplikácia radšej nezobrazí zastarané alebo regionálne nesprávne modely.",
      502,
      "CURRENT_EU_MODELS_NOT_VERIFIED",
      { rejectedCandidates }
    );
  }

  const relevantSources = [...generalSources, ...modelSources].slice(0, MAX_TOTAL_SOURCES);
  const finalResult = await generateAI(detailedPrompt(input, candidates, sourceGroups), {
    maxOutputTokens: 2400,
    schema: FINAL_SCHEMA,
    schemaName: "carmatch_vehicle_results_v42"
  });

  const finalSlots = [finalResult?.vehicle1, finalResult?.vehicle2, finalResult?.vehicle3];
  if (finalSlots.some(item => !item || typeof item !== "object" || Array.isArray(item))) {
    throw new HttpError("AI nevrátila všetky tri pevne priradené dátové bloky vozidiel.", 502, "INVALID_CAR_RESULTS");
  }
  // Identita sa nikdy nepreberá z AI výstupu. Každý slot patrí len svojmu kandidátovi.
  const canonicalFinalCars = finalSlots.map((raw, index) => ({
    ...raw,
    brand: candidates[index].brand,
    model: candidates[index].model,
    name: `${candidates[index].brand} ${candidates[index].model}`
  }));

  const verifiedSources = await supplementIdentitySources(candidates, canonicalFinalCars, relevantSources, searchState);
  const cars = canonicalFinalCars.map((raw, index) => {
    try { return normalizeCar(raw, candidates[index], verifiedSources, input.filters); }
    catch (error) {
      if (error instanceof HttpError) {
        const prior = error.details && typeof error.details === "object" && !Array.isArray(error.details) ? error.details : { originalDetails: error.details };
        error.details = { ...prior, searchProviderFailures: searchFailureSummary(searchState), disabledSearchProviders: { ...searchState.disabled } };
      }
      throw error;
    }
  });
  const identities = new Set(cars.map(car => normalized(`${car.brand} ${car.model}`)));
  if (identities.size !== 3) throw new HttpError("Výsledok obsahuje duplicitné modely.", 502, "DUPLICATE_CARS");

  console.info("CARMATCH AI: technical verification summary", cars.map(car => ({
    car: car.name,
    sourceCount: car.sourceIds.length,
    currentModelVerified: car.currentModelVerified === true,
    generationVerified: Boolean(car.generation),
    modelYearVerified: Number.isInteger(car.modelYear),
    powerVerified: car.power !== "Neoverené",
    priceVerified: car.price !== "Cena neoverená",
    drivetrainVerified: car.drivetrain !== "Neoverené",
    trunkVerified: car.trunkLiters !== null,
    seatsVerified: car.seats !== null
  })));

  validateFilters(cars, input.filters);
  const firstPhoto = await findPhotosForCar(cars[0], searchState);
  const remainingPhotos = await mapWithConcurrency(cars.slice(1), 2, car => findPhotosForCar(car, searchState));
  const finalCars = [firstPhoto, ...remainingPhotos];
  console.info("CARMATCH AI: final photo summary", finalCars.map(car => ({
    car: car.name,
    photoStatus: car.photoStatus,
    hasImage: Boolean(car.image),
    currentModelVerified: car.currentModelVerified === true,
    generationVerified: Boolean(car.generation),
    modelYearVerified: Number.isInteger(car.modelYear)
  })));
  return { cars: finalCars, sources: verifiedSources };
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
  console.info("CARMATCH AI: runtime provider configuration", {
    supabaseUrlConfigured: Boolean(SUPABASE_URL),
    supabaseKeyConfigured: Boolean(SUPABASE_API_KEY),
    groqConfigured: Boolean(GROQ_API_KEY),
    openrouterConfigured: Boolean(OPENROUTER_API_KEY),
    serperConfigured: Boolean(SERPER_API_KEY),
    tavilyConfigured: Boolean(TAVILY_API_KEY),
    deploymentEnvironment: cleanString(process.env.VERCEL_ENV || "unknown", 30)
  });

  try {
    const input = normalizeInput(parseBody(req.body));
    if (!SUPABASE_URL || !SUPABASE_API_KEY) throw new HttpError("Supabase nie je nakonfigurovaný vo Vercel Environment Variables.", 500, "SUPABASE_CONFIG");
    if (!GROQ_API_KEY && !OPENROUTER_API_KEY) throw new HttpError("AI poskytovateľ nie je nakonfigurovaný. Nastav GROQ_API_KEY alebo OPENROUTER_API_KEY.", 500, "AI_CONFIG");
    if (!SERPER_API_KEY && !TAVILY_API_KEY) throw new HttpError("Chýba SERPER_API_KEY alebo TAVILY_API_KEY. Bez webového vyhľadávania nie je možné overovať aktuálne údaje.", 500, "WEB_SEARCH_CONFIG");
    if (!SERPER_API_KEY) console.warn("CARMATCH AI: SERPER_API_KEY is not available in this deployment; image search will use Wikimedia fallback only.");

    token = bearerToken(req);
    await verifyUser(token);
    const quota = await consumeSearch(token);
    consumed = quota.consumed;
    remaining = quota.remaining;

    const searchState = createSearchState();
    const result = await buildCars(input, searchState);
    return json(res, 200, {
      cars: result.cars,
      sources: result.sources,
      remaining,
      dailyLimit: DAILY_LIMIT,
      warning: null,
      message: "Vybrali sme tri vozidlá s overiteľnou aktuálnou európskou ponukou. Zobrazené údaje sú overené podľa dostupných zdrojov; neoverené hodnoty sú výslovne označené a fotografia sa zobrazí iba pri dostatočnej zhode."
    });
  } catch (error) {
    console.error("CARMATCH AI backend error:", {
      message: error?.message,
      code: error?.code,
      statusCode: error?.statusCode,
      details: error?.details,
      detailsJson: error?.details ? JSON.stringify(error.details).slice(0, 7000) : undefined
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
