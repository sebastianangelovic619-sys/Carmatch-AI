"use strict";

/* ============================================================
   CARMATCH AI — BACKEND REKONŠTRUKCIA

   Zámer:
   - kompatibilný vstup: { naturalLanguage, filters }
   - presne 3 odlišné odporúčané vozidlá
   - Groq ako hlavný AI poskytovateľ, OpenRouter ako záložný
   - Supabase Auth + limit 5 vyhľadávaní za deň
   - vrátenie vyhľadávania pri chybe backendu/AI
   - voliteľné webové dôkazy (Serper alebo Tavily)
   - kontrola číselných údajov voči získaným zdrojom
   - fotografie z Wikimedia Commons

   Súbor: api/search.js
   ES modules: package.json ("type": "module")
   ============================================================ */

const DAILY_LIMIT = 5;
const MAX_TEXT_LENGTH = 1800;
const AI_TIMEOUT_MS = 45000;
const SEARCH_TIMEOUT_MS = 8500;
const IMAGE_TIMEOUT_MS = 8000;
const MAX_SOURCES = 6;

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

function send(res, status, payload) {
  return res.status(status).json(payload);
}

function getHeader(req, name) {
  const wanted = name.toLowerCase();
  const headers = req.headers || {};
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === wanted) return headers[key];
  }
  return "";
}

function getBearerToken(req) {
  const raw = String(getHeader(req, "authorization") || "").trim();
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function cleanText(value, max = MAX_TEXT_LENGTH) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item, 120)).filter(Boolean).join(", ").slice(0, max);
  }
  if (typeof value === "object") return "";
  return String(value).replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max);
}

function parseRequestBody(body) {
  if (body && typeof body === "object") return body;
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
      return {};
    }
  }
  return {};
}

function normalizeFilters(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const allowed = [
    "budget", "seats", "powerKW", "trunkLitres", "drive", "fuel", "body",
    "style", "maxLength", "length", "year", "avoidBrands", "minPower",
    "minTrunk", "transmission", "condition", "country", "brand"
  ];
  const result = {};
  for (const key of allowed) {
    if (source[key] === undefined || source[key] === null) continue;
    const value = cleanText(source[key], 180);
    if (value) result[key] = value;
  }
  if (!result.maxLength && result.length) result.maxLength = result.length;
  delete result.length;
  return result;
}

function normalizeRequest(body) {
  const naturalLanguage = cleanText(
    body.naturalLanguage || body.query || body.prompt || body.request || ""
  );
  const filters = normalizeFilters(body.filters);
  return { naturalLanguage, filters };
}

function isMissingRpc(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return (
    code === "PGRST202" || code === "42883" || code === "PGRST204" ||
    message.includes("could not find the function") ||
    message.includes("function") && message.includes("does not exist")
  );
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

async function readJsonResponse(response) {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (_) {
    return { raw: raw.slice(0, 1500) };
  }
}

async function verifySupabaseUser(accessToken) {
  if (!SUPABASE_URL || !SUPABASE_API_KEY) {
    throw new Error("Supabase nie je nakonfigurovaný. Skontroluj SUPABASE_URL a SUPABASE_ANON_KEY/SUPABASE_KEY.");
  }
  if (!accessToken) {
    const error = new Error("Prihlásenie vypršalo. Prihlás sa znova.");
    error.statusCode = 401;
    throw error;
  }

  const response = await fetchWithTimeout(
    `${SUPABASE_URL}/auth/v1/user`,
    {
      method: "GET",
      headers: {
        apikey: SUPABASE_API_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    },
    9000
  );
  const data = await readJsonResponse(response);

  if (!response.ok || !data?.id) {
    const error = new Error("Supabase relácia je neplatná alebo expirovaná. Prihlás sa znova.");
    error.statusCode = 401;
    error.details = data?.msg || data?.message || data?.error_description || "Auth user verification failed";
    throw error;
  }
  return data;
}

async function callSupabaseRpc(name, args, accessToken) {
  const response = await fetchWithTimeout(
    `${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(name)}`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_API_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify(args || {})
    },
    9000
  );
  const data = await readJsonResponse(response);
  if (!response.ok) {
    const error = new Error(data?.message || data?.details || data?.hint || `Supabase RPC ${name} failed (${response.status})`);
    error.code = data?.code || "";
    error.statusCode = response.status;
    error.details = data;
    throw error;
  }
  return data;
}

function quotaDenied(data) {
  const value = Array.isArray(data) ? data[0] : data;
  if (value === false) return true;
  if (!value || typeof value !== "object") return false;
  const status = String(value.status || value.code || value.error || "").toLowerCase();
  return (
    value.allowed === false || value.success === false || value.ok === false ||
    value.limit_reached === true || value.daily_limit_reached === true ||
    status.includes("limit") || status.includes("quota")
  );
}

function getRemaining(data) {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== "object") return null;
  const possible = [value.remaining, value.remaining_searches, value.searches_left, value.left];
  for (const item of possible) {
    const number = Number(item);
    if (Number.isFinite(number) && number >= 0) return Math.floor(number);
  }
  if (Number.isFinite(Number(value.search_count))) {
    return Math.max(0, DAILY_LIMIT - Number(value.search_count));
  }
  if (Number.isFinite(Number(value.count))) {
    return Math.max(0, DAILY_LIMIT - Number(value.count));
  }
  return null;
}

async function consumeDailySearch(accessToken) {
  const candidates = [
    { name: "increment_search", args: { daily_limit: DAILY_LIMIT, max_searches: DAILY_LIMIT } },
    { name: "consume_search", args: { daily_limit: DAILY_LIMIT, max_searches: DAILY_LIMIT } },
    { name: "use_search", args: {} }
  ];
  let lastError = null;
  for (const candidate of candidates) {
    try {
      const data = await callSupabaseRpc(candidate.name, candidate.args, accessToken);
      if (quotaDenied(data)) {
        const error = new Error("Dosiahol si denný limit 5 vyhľadávaní. Skús to znova zajtra.");
        error.statusCode = 429;
        error.code = "DAILY_LIMIT_REACHED";
        throw error;
      }
      return { consumed: true, remaining: getRemaining(data), data, rpc: candidate.name };
    } catch (error) {
      if (error.code === "DAILY_LIMIT_REACHED") throw error;
      lastError = error;
      if (!isMissingRpc(error)) throw error;
    }
  }
  const error = new Error("V Supabase sa nenašla funkcia na odpočítanie vyhľadávania. Skontroluj increment_search, consume_search alebo use_search.");
  error.statusCode = 500;
  error.details = lastError?.message || "RPC function not found";
  throw error;
}

async function refundDailySearch(accessToken) {
  const candidates = ["refund_search", "refund_search_usage", "decrement_search"];
  for (const name of candidates) {
    try {
      await callSupabaseRpc(name, {}, accessToken);
      return { refunded: true, rpc: name };
    } catch (error) {
      if (!isMissingRpc(error)) {
        console.error(`CARMATCH AI: ${name} refund failed`, error.message);
        return { refunded: false, error: error.message };
      }
    }
  }
  console.error("CARMATCH AI: refund RPC function not found.");
  return { refunded: false, error: "Refund RPC function not found" };
}

function makeSearchQuery(request) {
  const filterText = Object.entries(request.filters)
    .map(([key, value]) => `${key}: ${value}`)
    .join("; ");
  const base = request.naturalLanguage || "automobil podľa zadaných filtrov";
  return `${base}. ${filterText}. Aktuálne modely, technické údaje, ceny v EUR, výkon kW, počet miest, objem kufra, oficiálne stránky výrobcu.`.slice(0, 1200);
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") return "";
    if (url.username || url.password) return "";
    if (["localhost", "127.0.0.1", "0.0.0.0"].includes(url.hostname)) return "";
    url.hash = "";
    return url.toString();
  } catch (_) {
    return "";
  }
}

function normalizeSources(items) {
  const result = [];
  const seen = new Set();
  for (const item of items || []) {
    const url = safeUrl(item.url || item.link);
    if (!url || seen.has(url)) continue;
    const title = cleanText(item.title || item.name || "Webový zdroj", 180);
    const snippet = cleanText(item.snippet || item.content || item.description || "", 520);
    if (!snippet && !title) continue;
    seen.add(url);
    result.push({ title, url, snippet, id: `S${result.length + 1}` });
    if (result.length >= MAX_SOURCES) break;
  }
  return result;
}

async function searchWithSerper(query) {
  const response = await fetchWithTimeout(
    "https://google.serper.dev/search",
    {
      method: "POST",
      headers: { "X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, gl: "sk", hl: "sk", num: 8 })
    },
    SEARCH_TIMEOUT_MS
  );
  const data = await readJsonResponse(response);
  if (!response.ok) throw new Error(data?.message || `Serper search failed (${response.status})`);
  return (data.organic || []).map((item) => ({
    title: item.title,
    url: item.link,
    snippet: item.snippet
  }));
}

async function searchWithTavily(query) {
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
  const data = await readJsonResponse(response);
  if (!response.ok) throw new Error(data?.message || `Tavily search failed (${response.status})`);
  return (data.results || []).map((item) => ({
    title: item.title,
    url: item.url,
    snippet: item.content
  }));
}

async function collectWebSources(request) {
  if (!SERPER_API_KEY && !TAVILY_API_KEY) return [];
  const query = makeSearchQuery(request);
  try {
    let results = [];
    if (SERPER_API_KEY) results = await searchWithSerper(query);
    else if (TAVILY_API_KEY) results = await searchWithTavily(query);

    if (SERPER_API_KEY && results.length < 4) {
      try {
        const more = await searchWithSerper(`${query} official specifications manufacturer price Europe`);
        results = results.concat(more);
      } catch (error) {
        console.warn("CARMATCH AI: secondary Serper search failed:", error.message);
      }
    }
    return normalizeSources(results);
  } catch (error) {
    console.warn("CARMATCH AI: web search unavailable:", error.message);
    return [];
  }
}

function buildPrompt(request, sources) {
  const sourceText = sources.length
    ? sources.map((source) => `${source.id}\nNÁZOV: ${source.title}\nURL: ${source.url}\nDÔKAZ: ${source.snippet}`).join("\n\n")
    : "WEBOVÉ ZDROJE NIE SÚ DOSTUPNÉ. Nevymýšľaj ceny, presný výkon, objem kufra ani URL. Neoverené číselné údaje označ ako neoverené.";

  return `
Si CARMATCH AI, dôsledný automobilový poradca pre Slovensko a Európu.
Dátum: ${new Date().toISOString().slice(0, 10)}.

POŽIADAVKA POUŽÍVATEĽA:
${request.naturalLanguage || "Používateľ zadal iba filtre."}

FILTRE:
${JSON.stringify(request.filters, null, 2)}

DÔKAZY Z WEBU (AI smie citovať IBA tieto zdroje):
${sourceText}

ÚLOHA:
1. Vyber presne 3 rozdielne skutočné sériové automobily, ktoré najlepšie spĺňajú požiadavku.
2. Zohľadni výrobcov z celého sveta, ale uprednostni reálnu dostupnosť v Európe, ak používateľ neurčí inak.
3. Uprednostni najnovšiu potvrdenú generáciu. Rok 2026/2027 uveď len vtedy, keď to podporujú dôkazy; inak použi posledný potvrdený modelový rok.
4. Nepomiešaj generácie, karosárske verzie, motorizácie ani modelové roky.
5. Dodrž rozpočet, počet miest, minimálny výkon, kufor, pohon, palivo, karosériu, dĺžku a vylúčené značky.
6. Výkon uvádzaj v kW; hp môžeš doplniť v zátvorke. Nepoužívaj PS ani ks.
7. Cenu uvádzaj v EUR. Ak zdroje neuvádzajú porovnateľnú cenu pre daný trh a verziu, napíš "Cena neoverená".
8. Ak zdroje nepotvrdzujú hodnotu výkonu, počtu miest alebo objemu kufra, nepíš odhad. Použi "Neoverené" alebo null.
9. URL konfigurátora uveď iba vtedy, keď je to skutočná HTTPS stránka výrobcu a je podporená zdrojmi. Inak nechaj prázdny reťazec.
10. Ku každému autu priraď sourceIds obsahujúce iba ID S1 až S${sources.length}. Ak nemáš dôkaz pre konkrétne tvrdenie, necituj ho.
11. Neuvádzaj vymyslené fotografie ani URL obrázkov. Polia image a photoSource nechaj prázdne; vhodnú fotografiu doplní backend.
12. Píš prirodzene po slovensky. Výhody a nevýhody musia byť konkrétne, nie reklamné frázy.
13. Každé auto musí byť iný model, nie iba iná motorizácia toho istého modelu.

VRÁŤ IBA VALIDNÝ JSON bez Markdownu, presne v tomto tvare:
{
  "cars": [
    {
      "name": "Značka Model",
      "generation": "Presná generácia",
      "year": 2026,
      "score": 95,
      "price": "od 45 000 €",
      "power": "150 kW (204 hp)",
      "seats": 5,
      "trunk": "600 l",
      "drive": "AWD",
      "fuel": "Benzín / hybrid",
      "image": "",
      "photoSource": "",
      "reason": "Prečo auto spĺňa zadanie.",
      "pros": ["Výhoda 1", "Výhoda 2", "Výhoda 3"],
      "cons": ["Nevýhoda 1", "Nevýhoda 2"],
      "maintenance": "Stručné a realistické náklady/údržba; neuvádzaj vymyslené sumy.",
      "configurator": "",
      "sourceIds": ["S1", "S2"]
    }
  ]
}
`;
}

function extractJson(text) {
  let value = String(text || "").trim();
  value = value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(value);
  } catch (_) {
    const start = value.indexOf("{");
    const end = value.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(value.slice(start, end + 1));
    throw new Error("AI vrátila neplatný JSON.");
  }
}

function getAssistantText(data) {
  const message = data?.choices?.[0]?.message;
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => part?.text || "").join("\n");
  }
  return data?.output_text || "";
}

async function callChatCompletion({ url, apiKey, model, prompt, provider }) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`
  };
  if (provider === "openrouter") {
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
          { role: "system", content: "Si presný automobilový rešeršný asistent. Výstup musí byť iba validný JSON." },
          { role: "user", content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 6000,
        response_format: { type: "json_object" }
      })
    },
    AI_TIMEOUT_MS
  );
  const data = await readJsonResponse(response);
  if (!response.ok) {
    const message = data?.error?.message || data?.message || `AI provider error (${response.status})`;
    const error = new Error(message);
    error.statusCode = response.status;
    error.provider = provider;
    throw error;
  }
  const text = getAssistantText(data);
  if (!text) throw new Error(`${provider} vrátil prázdnu odpoveď.`);
  return extractJson(text);
}

async function generateWithAI(prompt) {
  const errors = [];
  if (GROQ_API_KEY) {
    const models = [
      process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      process.env.GROQ_FALLBACK_MODEL || "openai/gpt-oss-20b"
    ].filter((model, index, list) => model && list.indexOf(model) === index);
    for (const model of models) {
      try {
        return await callChatCompletion({
          url: "https://api.groq.com/openai/v1/chat/completions",
          apiKey: GROQ_API_KEY,
          model,
          prompt,
          provider: "groq"
        });
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
    ].filter((model, index, list) => model && list.indexOf(model) === index);
    for (const model of models) {
      try {
        return await callChatCompletion({
          url: "https://openrouter.ai/api/v1/chat/completions",
          apiKey: OPENROUTER_API_KEY,
          model,
          prompt,
          provider: "openrouter"
        });
      } catch (error) {
        errors.push(`OpenRouter ${model}: ${error.message}`);
        console.error(`CARMATCH AI: OpenRouter ${model} failed:`, error.message);
      }
    }
  }

  const error = new Error(
    errors.length
      ? `Nepodarilo sa získať odpoveď od AI. ${errors.slice(-3).join(" | ")}`
      : "Chýba GROQ_API_KEY aj OPENROUTER_API_KEY vo Vercel Environment Variables."
  );
  error.statusCode = 502;
  throw error;
}

function normalizeSourceIds(value, sources) {
  const valid = new Set(sources.map((source) => source.id));
  const input = Array.isArray(value) ? value : [];
  return [...new Set(input.map((item) => cleanText(item, 8)).filter((id) => valid.has(id)))];
}

function numbersIn(text) {
  return (String(text || "").match(/\d+(?:[\s,.]\d{3})*(?:[,.]\d+)?/g) || [])
    .map((raw) => Number(raw.replace(/[\s]/g, "").replace(/,(?=\d{3}(?:\D|$))/g, "").replace(",", ".")))
    .filter((value) => Number.isFinite(value));
}

function valueHasNumber(value, evidence) {
  const valueNumbers = numbersIn(value);
  const evidenceNumbers = numbersIn(evidence);
  if (!valueNumbers.length || !evidenceNumbers.length) return false;
  return valueNumbers.some((number) => evidenceNumbers.some((candidate) => {
    const tolerance = Math.max(1, Math.abs(number) * 0.015);
    return Math.abs(candidate - number) <= tolerance;
  }));
}

function verifyPower(value, evidence) {
  const match = String(value || "").match(/(\d+(?:[,.]\d+)?)\s*(kW|hp|bhp|PS|ks)/i);
  if (!match) return false;
  const amount = Number(match[1].replace(",", "."));
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(amount)) return false;
  const kwEvidence = [...String(evidence).matchAll(/(\d+(?:[,.]\d+)?)\s*kW\b/gi)].map((m) => Number(m[1].replace(",", ".")));
  const hpEvidence = [...String(evidence).matchAll(/(\d+(?:[,.]\d+)?)\s*(?:hp|bhp|PS)\b/gi)].map((m) => Number(m[1].replace(",", ".")));
  if (unit === "kw") return kwEvidence.some((n) => Math.abs(n - amount) <= Math.max(2, amount * 0.02)) || hpEvidence.some((n) => Math.abs(n / 1.341 - amount) <= Math.max(2, amount * 0.025));
  return hpEvidence.some((n) => Math.abs(n - amount) <= Math.max(3, amount * 0.02)) || kwEvidence.some((n) => Math.abs(n * 1.341 - amount) <= Math.max(3, amount * 0.025));
}

function verifySeats(value, evidence) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 9) return false;
  const text = String(evidence || "");
  const patterns = [
    new RegExp(`\\b${n}\\s*(?:seats?|seater|passengers?|miest|miesta|miestami|sedadiel)\\b`, "i"),
    new RegExp(`(?:seats?|seating|miest|sedadiel)[^\\n]{0,25}\\b${n}\\b`, "i")
  ];
  return patterns.some((pattern) => pattern.test(text));
}

function verifyTrunk(value, evidence) {
  const match = String(value || "").match(/(\d{2,4})\s*(?:l|litres?|liters?|litrov|litra)/i);
  if (!match) return false;
  const amount = Number(match[1]);
  const pattern = new RegExp(`\\b${amount}\\s*(?:l|litres?|liters?|litrov|litra)\\b`, "i");
  return pattern.test(String(evidence || ""));
}

function verifyPrice(value, evidence) {
  const text = String(value || "");
  if (!/[€]|\bEUR\b/i.test(text)) return false;
  const valueNums = numbersIn(text).filter((n) => n >= 1000);
  const evidenceText = String(evidence || "");
  const euroPriceNumbers = [];
  const pricePattern = /(?:€\s*|EUR\s*)(\d[\d\s.,]{2,})|(\d[\d\s.,]{2,})\s*(?:€|EUR)(?![A-Za-z])/gi;
  for (const match of evidenceText.matchAll(pricePattern)) {
    const raw = match[1] || match[2] || "";
    euroPriceNumbers.push(...numbersIn(raw).filter((n) => n >= 1000));
  }
  return valueNums.some((n) => euroPriceNumbers.some((candidate) => Math.abs(candidate - n) <= Math.max(100, n * 0.02)));
}

function verifiedConfigurator(value, sourceIds, sources) {
  const url = safeUrl(value);
  if (!url) return "";
  const allowedSources = sources.filter((source) => sourceIds.includes(source.id));
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const appearsInEvidence = allowedSources.some((source) => {
      try { return new URL(source.url).hostname.replace(/^www\./, "") === host; }
      catch (_) { return false; }
    });
    const looksLikeConfigurator = /config|konfigur|build|configure|vehicle-builder/i.test(url);
    return appearsInEvidence && looksLikeConfigurator ? url : "";
  } catch (_) {
    return "";
  }
}

function normalizeCar(car, index, sources) {
  const name = cleanText(car?.name || car?.model || "", 100);
  if (!name) throw new Error(`AI nevrátila názov auta na pozícii ${index + 1}.`);
  const sourceIds = normalizeSourceIds(car.sourceIds || car.sources, sources);
  const evidence = sources
    .filter((source) => sourceIds.includes(source.id))
    .map((source) => `${source.title} ${source.snippet} ${source.url}`)
    .join("\n");

  const priceRaw = cleanText(car.price, 80);
  const powerRaw = cleanText(car.power, 80);
  const seatsRaw = car.seats === null || car.seats === undefined ? "" : cleanText(car.seats, 12);
  const trunkRaw = cleanText(car.trunk || car.trunkVolume, 60);
  const yearRaw = Number(car.year);
  const yearVerified = Number.isInteger(yearRaw) && yearRaw >= 1990 && yearRaw <= 2035 && valueHasNumber(String(yearRaw), evidence);

  return {
    name,
    generation: cleanText(car.generation, 100),
    year: yearVerified ? yearRaw : null,
    score: Math.max(1, Math.min(100, Math.round(Number(car.score) || 80))),
    price: verifyPrice(priceRaw, evidence) ? priceRaw : "Cena neoverená",
    power: verifyPower(powerRaw, evidence) ? powerRaw : "Neoverený údaj",
    seats: seatsRaw && verifySeats(seatsRaw, evidence) ? Number(seatsRaw) : null,
    trunk: verifyTrunk(trunkRaw, evidence) ? trunkRaw : "Neoverený údaj",
    drive: cleanText(car.drive, 40) || "—",
    fuel: cleanText(car.fuel, 60) || "—",
    image: "",
    photoSource: "",
    reason: cleanText(car.reason, 650),
    pros: Array.isArray(car.pros) ? car.pros.slice(0, 4).map((item) => cleanText(item, 180)).filter(Boolean) : [],
    cons: Array.isArray(car.cons) ? car.cons.slice(0, 4).map((item) => cleanText(item, 180)).filter(Boolean) : [],
    maintenance: cleanText(car.maintenance, 500),
    configurator: verifiedConfigurator(car.configurator, sourceIds, sources),
    sourceIds
  };
}

function imageTitleIsUsable(title, car) {
  const text = String(title || "").toLowerCase();
  if (/logo|emblem|badge|interior|dashboard|steering|engine|wheel|rim|brochure|poster|drawing|render|concept|prototype|toy|model car|truck|bus|van interior/.test(text)) return false;
  const modelTokens = String(car.name || "").toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 3);
  const matched = modelTokens.filter((token) => text.includes(token));
  if (matched.length < Math.min(2, modelTokens.length)) return false;

  const generationCode = String(car.generation || "").match(/\b(?:[a-z]{1,2}\d{2,3}|\d{3})\b/i);
  if (generationCode && !text.includes(generationCode[0].toLowerCase())) return false;
  return true;
}

async function findWikimediaImage(car) {
  const query = `${car.name} ${car.generation || ""} exterior`.trim();
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: query,
    gsrnamespace: "6",
    gsrlimit: "12",
    prop: "imageinfo",
    iiprop: "url|mime",
    iiurlwidth: "1280",
    format: "json"
  });
  try {
    const response = await fetchWithTimeout(
      `https://commons.wikimedia.org/w/api.php?${params.toString()}`,
      { headers: { "User-Agent": "CARMATCHAI/1.0 (vehicle image lookup)" } },
      IMAGE_TIMEOUT_MS
    );
    if (!response.ok) return null;
    const data = await readJsonResponse(response);
    const pages = Object.values(data?.query?.pages || {});
    for (const page of pages) {
      const info = page?.imageinfo?.[0];
      if (!info || !String(info.mime || "").startsWith("image/")) continue;
      if (!imageTitleIsUsable(page.title, car)) continue;
      const image = safeUrl(info.thumburl || info.url);
      if (!image || !/upload\.wikimedia\.org$/i.test(new URL(image).hostname)) continue;
      return {
        image,
        photoSource: `Wikimedia Commons – ${cleanText(page.title, 120)}`
      };
    }
  } catch (error) {
    console.warn(`CARMATCH AI: Wikimedia image lookup failed for ${car.name}:`, error.message);
  }
  return null;
}

async function addImages(cars) {
  return Promise.all(cars.map(async (car) => {
    const found = await findWikimediaImage(car);
    if (found) {
      car.image = found.image;
      car.photoSource = found.photoSource;
    } else {
      car.image = "";
      car.photoSource = "Overená fotografia sa nenašla";
    }
    return car;
  }));
}

function normalizeCars(aiResult, sources) {
  if (!aiResult || !Array.isArray(aiResult.cars)) {
    throw new Error("AI odpoveď neobsahuje pole cars.");
  }
  const unique = [];
  const seen = new Set();
  for (const rawCar of aiResult.cars) {
    const car = normalizeCar(rawCar, unique.length, sources);
    const key = car.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(car);
    if (unique.length === 3) break;
  }
  if (unique.length !== 3) {
    throw new Error(`AI vrátila iba ${unique.length} rozdielne autá namiesto požadovaných 3.`);
  }
  return unique;
}

function publicSourcesForCars(cars, sources) {
  const used = new Set(cars.flatMap((car) => car.sourceIds));
  return sources.filter((source) => used.has(source.id)).map((source) => ({
    id: source.id,
    title: source.title,
    url: source.url,
    snippet: source.snippet
  }));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "Method not allowed" });
  }

  let accessToken = "";
  let searchWasConsumed = false;
  let quotaRemaining = null;

  try {
    const body = parseRequestBody(req.body);
    const request = normalizeRequest(body);

    if (!request.naturalLanguage && Object.keys(request.filters).length === 0) {
      return send(res, 400, { error: "Zadaj požiadavku alebo aspoň jeden filter." });
    }

    if (!GROQ_API_KEY && !OPENROUTER_API_KEY) {
      return send(res, 500, { error: "AI poskytovateľ nie je nakonfigurovaný. Vo Vercel nastav GROQ_API_KEY alebo OPENROUTER_API_KEY." });
    }

    accessToken = getBearerToken(req);
    const user = await verifySupabaseUser(accessToken);

    const quota = await consumeDailySearch(accessToken);
    searchWasConsumed = quota.consumed;
    quotaRemaining = quota.remaining;

    const sources = await collectWebSources(request);
    const prompt = buildPrompt(request, sources);
    const aiResult = await generateWithAI(prompt);
    let cars = normalizeCars(aiResult, sources);
    cars = await addImages(cars);

    return send(res, 200, {
      cars,
      sources: publicSourcesForCars(cars, sources),
      remainingSearches: quotaRemaining,
      dailyLimit: DAILY_LIMIT,
      warning: sources.length
        ? null
        : "Webové zdroje nie sú pripojené alebo neboli dostupné. Neoverené technické údaje a ceny sú označené.",
      message: "Vybrali sme presne 3 najvhodnejšie automobily."
    });
  } catch (error) {
    console.error("CARMATCH AI backend error:", error);

    let refund = { refunded: false };
    if (searchWasConsumed && accessToken) {
      refund = await refundDailySearch(accessToken);
    }

    const status = Number(error.statusCode) || 500;
    return send(res, status, {
      error: error.message || "Backend error",
      code: error.code || undefined,
      details: error.details || undefined,
      refunded: Boolean(refund.refunded),
      refundError: refund.refunded ? undefined : refund.error || undefined
    });
  }
}