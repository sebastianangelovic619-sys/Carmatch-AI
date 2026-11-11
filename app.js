
"use strict";

/* ============================================================
   CARMATCH AI - FRONTEND v21
   - Kompatibilita s api/search.js v29
   - Bez falošného skóre zhody
   - Presné názvy značiek a modelov
   - Prísnejšie vyhľadávanie fotografií
   - Kontrola karosérie a interiérových fotografií
   - Slovenské zobrazovanie technických údajov
   - Supabase anonymná autentifikácia
   - Povinná fotografia a zdroj pre každé z 3 vozidiel
   ============================================================ */

const CONFIG = window.CARMATCH_CONFIG || {};
const API_ENDPOINT = CONFIG.apiEndpoint || "/api/search";

const MAX_SEARCH_TEXT = 1000;
const MAX_FILTER_TEXT = 500;
const MAX_IMAGES_PER_CAR = 8;
const IMAGE_SEARCH_TIMEOUT = 9000;
const API_TIMEOUT = 70000;

const WIKIMEDIA_API =
  "https://commons.wikimedia.org/w/api.php";

let supabaseClient = null;
let searching = false;
let initialized = false;
let currentCars = [];

const imageSearchCache = new Map();


/* ============================================================
   ZÁKLADNÉ FUNKCIE
   ============================================================ */

function $(id) {
  return document.getElementById(id);
}

function text(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === "string") {
    return value.trim() || fallback;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map(item => text(item))
      .filter(Boolean)
      .join(", ") || fallback;
  }

  if (typeof value === "object") {
    for (const key of [
      "message",
      "error",
      "text",
      "value",
      "name",
      "description",
      "reason",
      "formatted",
      "display",
      "label"
    ]) {
      if (value[key] !== undefined && value[key] !== null) {
        const result = text(value[key]);

        if (result) return result;
      }
    }

    try {
      return JSON.stringify(value);
    } catch (_) {
      return fallback;
    }
  }

  return fallback;
}

function firstValue(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;

    if (
      typeof value === "string" &&
      !value.trim()
    ) {
      continue;
    }

    if (
      typeof value === "number" &&
      !Number.isFinite(value)
    ) {
      continue;
    }

    return value;
  }

  return "";
}

function esc(value) {
  return text(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function safeUrl(value) {
  try {
    const url = new URL(
      String(value || "").trim()
    );

    return url.protocol === "https:"
      ? url.href
      : "";
  } catch (_) {
    return "";
  }
}

function isPlainObject(value) {
  return Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function normalizedSearchText(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}


/* ============================================================
   ČÍSELNÉ ÚDAJE
   ============================================================ */

function parseNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : "";
  }

  let raw = text(value)
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, "")
    .trim();

  if (!raw) return "";

  raw = raw.replace(
    /[€$£]|EUR|USD|GBP|kW|KW|kw|hp|HP|PS|ks|bhp|l|L|m\b/gi,
    ""
  );

  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(raw)) {
    raw = raw
      .replace(/\./g, "")
      .replace(",", ".");
  } else if (
    /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(raw)
  ) {
    raw = raw.replace(/,/g, "");
  } else if (
    raw.includes(",") &&
    !raw.includes(".")
  ) {
    raw = raw.replace(",", ".");
  }

  const match = raw.match(/-?\d+(?:\.\d+)?/);

  if (!match) return "";

  const number = Number(match[0]);

  return Number.isFinite(number)
    ? number
    : "";
}

function getValue(id) {
  const element = $(id);

  return element
    ? String(element.value || "").trim()
    : "";
}

function getNumber(id) {
  const raw = getValue(id);

  if (!raw) return "";

  const number = parseNumber(raw);

  return number === ""
    ? ""
    : String(number);
}


/* ============================================================
   VÝKON MOTORA
   ============================================================ */

function formatPowerDisplay(power) {
  const KW_TO_HP = 1.34102209;
  const HP_TO_KW = 1 / KW_TO_HP;

  let kw = null;
  let hp = null;

  if (typeof power === "string") {
    const raw = power.replace(/\u00A0/g, " ");

    const kwMatch = raw.match(
      /(\d+(?:[.,]\d+)?)\s*kW\b/i
    );

    const hpMatch = raw.match(
      /(\d+(?:[.,]\d+)?)\s*(?:HP|BHP|horsepower)\b/i
    );

    if (kwMatch) {
      kw = Number(
        kwMatch[1].replace(",", ".")
      );
    }

    if (hpMatch) {
      hp = Number(
        hpMatch[1].replace(",", ".")
      );
    }

    if (
      (!Number.isFinite(kw) || kw <= 0) &&
      (!Number.isFinite(hp) || hp <= 0)
    ) {
      const metricMatch = raw.match(
        /(\d+(?:[.,]\d+)?)\s*(?:PS|CV|KS|koni|koní)\b/i
      );

      if (metricMatch) {
        const metric = Number(
          metricMatch[1].replace(",", ".")
        );

        if (
          Number.isFinite(metric) &&
          metric > 0
        ) {
          kw = Math.round(
            metric * 0.73549875
          );
        }
      }
    }

  } else if (typeof power === "number") {

    return "Neoverené";

  } else if (isPlainObject(power)) {

    const nested = firstValue(
      power.power,
      power.output,
      power.maximum,
      power.max,
      power.value
    );

    kw = Number(firstValue(
      power.kw,
      power.kW,
      power.kilowatts
    ));

    hp = Number(firstValue(
      power.hp,
      power.HP,
      power.bhp,
      power.horsepower
    ));

    if (
      (!Number.isFinite(kw) || kw <= 0) &&
      nested
    ) {
      return formatPowerDisplay(nested);
    }
  }

  if (
    Number.isFinite(kw) &&
    kw > 0
  ) {
    const finalHp =
      Number.isFinite(hp) && hp > 0
        ? Math.round(hp)
        : Math.round(kw * KW_TO_HP);

    return `${Math.round(kw)} kW / ${finalHp} HP`;
  }

  if (
    Number.isFinite(hp) &&
    hp > 0
  ) {
    return `${Math.round(hp * HP_TO_KW)} kW / ${Math.round(hp)} HP`;
  }

  return "Neoverené";
}


/* ============================================================
   CENA
   ============================================================ */

function formatPrice(price) {
  if (
    price === null ||
    price === undefined ||
    price === ""
  ) {
    return "Cena neoverená";
  }

  if (isPlainObject(price)) {
    const amount = Number(firstValue(
      price.amount,
      price.price,
      price.value
    ));

    const currency = text(firstValue(
      price.currency,
      price.currencyCode,
      "EUR"
    )).toUpperCase();

    const type = text(firstValue(
      price.type,
      price.from ? "from" : ""
    )).toLowerCase();

    if (
      Number.isFinite(amount) &&
      amount > 0
    ) {
      const formatted = new Intl.NumberFormat(
        "sk-SK",
        {
          maximumFractionDigits: 0
        }
      ).format(Math.round(amount));

      return `${
        ["starting", "from", "od"].includes(type)
          ? "od "
          : ""
      }${formatted}${
        currency === "EUR"
          ? " €"
          : ` ${currency}`
      }`;
    }

    return text(
      firstValue(
        price.formatted,
        price.display,
        price.label
      ),
      "Cena neoverená"
    );
  }

  if (typeof price === "number") {
    if (
      !Number.isFinite(price) ||
      price <= 0
    ) {
      return "Cena neoverená";
    }

    return `${new Intl.NumberFormat(
      "sk-SK",
      {
        maximumFractionDigits: 0
      }
    ).format(Math.round(price))} €`;
  }

  const raw = text(price);

  if (!raw) return "Cena neoverená";

  if (
    /cena na vyžiadanie|na vyžiadanie|price on request|price upon request/i.test(raw)
  ) {
    return "Cena na vyžiadanie";
  }

  if (
    /neoveren|nedostupn|unknown|n\/a/i.test(raw)
  ) {
    return "Cena neoverená";
  }

  const match = raw.match(
    /(\d{1,3}(?:[ .\u00A0]\d{3})+(?:[,.]\d{1,2})?|\d{4,8}(?:[,.]\d{1,2})?)/
  );

  if (!match) return raw.slice(0, 100);

  const amount = parseNumber(match[1]);

  if (
    amount === "" ||
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return raw.slice(0, 100);
  }

  const formatted = new Intl.NumberFormat(
    "sk-SK",
    {
      maximumFractionDigits: 0
    }
  ).format(Math.round(amount));

  const prefix = /^\s*(?:od|from|starting)/i.test(raw)
    ? "od "
    : "";

  const currency =
    /\bUSD\b|\$/i.test(raw)
      ? " USD"
      : /\bGBP\b|£/i.test(raw)
        ? " GBP"
        : " €";

  return `${prefix}${formatted}${currency}`;
}


/* ============================================================
   ZOBRAZENIE TECHNICKÝCH ÚDAJOV
   ============================================================ */

function displayText(
  value,
  fallback = "Neoverené"
) {
  const result = text(value);

  return result || fallback;
}

function displayTrunk(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "Neoverené";
  }

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return `${Math.round(value)} l`;
  }

  const raw = text(value);

  if (!raw) return "Neoverené";

  if (
    /\b(l|litrov|liter|litres)\b/i.test(raw)
  ) {
    return raw;
  }

  const number = parseNumber(raw);

  return number !== ""
    ? `${Math.round(number)} l`
    : raw;
}

function displayLength(car) {
  const raw = firstValue(
    car?.lengthMm,
    car?.lengthMM,
    car?.length,
    car?.vehicleLength
  );

  if (raw === "") return "Neoverené";

  const number = parseNumber(raw);

  if (number === "") {
    return text(raw, "Neoverené");
  }

  if (
    /mm/i.test(String(raw)) ||
    number > 1000
  ) {
    return `${Math.round(number)} mm`;
  }

  if (/m/i.test(String(raw))) {
    return `${number} m`;
  }

  return `${number} m`;
}

function displaySeats(value) {
  const number = parseNumber(value);

  if (
    number !== "" &&
    number > 0 &&
    number <= 20
  ) {
    return String(Math.round(number));
  }

  return text(value, "Neoverené");
}

function getCarPower(car) {
  return firstValue(
    car?.power,
    car?.enginePower,
    car?.output,
    car?.maximumPower,
    car?.powerOutput,
    car?.technicalData?.power
  );
}

function getCarConsumption(car) {
  return firstValue(
    car?.consumptionWltp,
    car?.wltpConsumption,
    car?.wltp,
    car?.fuelConsumption,
    car?.electricConsumption,
    car?.consumption,
    car?.technicalData?.consumptionWltp
  );
}

function getCarEngine(car) {
  return firstValue(
    car?.engine,
    car?.engineVersion,
    car?.motor,
    car?.powertrain,
    car?.technicalData?.engine
  );
}


/* ============================================================
   STATUS A POČÍTADLO
   ============================================================ */

function setStatus(message = "", type = "") {
  const el = $("status");

  if (!el) return;

  el.className =
    `status${type ? ` ${type}` : ""}`;

  el.textContent = message;
}

function updateCharCount() {
  const input = $("aiRequest");
  const counter = $("charCount");

  if (!input || !counter) return;

  counter.textContent =
    `${input.value.length} / ${MAX_SEARCH_TEXT}`;
}


/* ============================================================
   TLAČIDLO VYHĽADÁVANIA
   ============================================================ */

function setButtonBusy(isBusy) {
  const button = $("searchButton");

  if (!button) return;

  button.disabled = isBusy;

  const label = button.querySelector(
    ".search-button-text, .button-label"
  );

  const arrow = button.querySelector(
    ".search-button-arrow, .button-arrow"
  );

  const oldIcon = button.querySelector(".button-icon");

  if (label) {
    label.textContent = isBusy
      ? "Vyhľadávam…"
      : "Nájsť moje auto";
  }

  if (arrow) {
    arrow.textContent = isBusy
      ? "•••"
      : "→";
  }

  if (oldIcon) {
    oldIcon.textContent = isBusy
      ? "•"
      : "⌕";
  }
}


/* ============================================================
   FILTRE A PAYLOAD
   ============================================================ */

function buildPayload() {
  return {
    naturalLanguage: getValue("aiRequest").slice(
      0,
      MAX_SEARCH_TEXT
    ),

    filters: {
      budget: getNumber("budget"),
      seats: getNumber("seats"),
      power: getNumber("power"),
      trunk: getNumber("trunk"),
      drive: getValue("drive"),
      fuel: getValue("fuel"),
      body: getValue("body"),
      style: getValue("style"),
      length: getNumber("length"),
      year: getNumber("year"),
      avoid: getValue("avoidBrands").slice(
        0,
        MAX_FILTER_TEXT
      )
    }
  };
}

function hasSearchInput(payload) {
  return Boolean(payload.naturalLanguage) ||
    Object.values(payload.filters || {}).some(
      value => String(value || "").trim() !== ""
    );
}


/* ============================================================
   SUPABASE CLIENT
   ============================================================ */

async function ensureSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  const url = String(
    CONFIG.supabaseUrl || ""
  ).trim();

  const key = String(
    CONFIG.supabaseAnonKey ||
    CONFIG.supabasePublishableKey ||
    ""
  ).trim();

  if (!url) {
    throw new Error(
      "Supabase URL nie je nastavená v index.html."
    );
  }

  if (!key) {
    throw new Error(
      "Supabase Publishable key nie je nastavený v index.html."
    );
  }

  if (!window.supabase?.createClient) {
    throw new Error(
      "Nepodarilo sa načítať Supabase knižnicu."
    );
  }

  supabaseClient = window.supabase.createClient(
    url,
    key,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    }
  );

  return supabaseClient;
}


/* ============================================================
   SUPABASE AUTH
   ============================================================ */

async function getAccessToken() {
  const client = await ensureSupabaseClient();

  let sessionResult;

  try {
    sessionResult = await client.auth.getSession();
  } catch (error) {
    throw new Error(
      `Supabase: ${text(
        error?.message,
        "Nepodarilo sa načítať reláciu."
      )}`
    );
  }

  const currentToken =
    sessionResult?.data?.session?.access_token;

  if (currentToken) return currentToken;

  let signIn;

  try {
    signIn = await client.auth.signInAnonymously();
  } catch (error) {
    throw new Error(
      `Supabase: ${text(
        error?.message,
        "Anonymné prihlásenie zlyhalo."
      )}`
    );
  }

  if (signIn?.error) {
    throw new Error(
      `Supabase: ${signIn.error.message}`
    );
  }

  const token =
    signIn?.data?.session?.access_token;

  if (!token) {
    throw new Error(
      "Supabase nevytvoril platnú reláciu."
    );
  }

  return token;
}


/* ============================================================
   API REQUEST
   ============================================================ */

async function postSearch(payload, authRetry = false) {
  let token;

  try {
    token = await getAccessToken();
  } catch (error) {
    throw Object.assign(
      new Error(
        text(error?.message, "Nepodarilo sa prihlásiť.")
      ),
      {
        code: "AUTH"
      }
    );
  }

  let response;

  const controller = new AbortController();

  const timeoutId = window.setTimeout(
    () => controller.abort(),
    API_TIMEOUT
  );

  try {
    response = await fetch(
      API_ENDPOINT,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "Accept": "application/json"
        },
        body: JSON.stringify(payload),
        cache: "no-store",
        signal: controller.signal
      }
    );

  } catch (error) {
    if (error?.name === "AbortError") {
      throw Object.assign(
        new Error(
          "Vyhľadávanie trvalo príliš dlho. Skús to znova."
        ),
        {
          code: "API_TIMEOUT"
        }
      );
    }

    throw Object.assign(
      new Error(
        "Nepodarilo sa spojiť so serverom. Vyhľadávanie sa nemuselo započítať do limitu."
      ),
      {
        code: "FETCH_FAILED"
      }
    );

  } finally {
    window.clearTimeout(timeoutId);
  }

  const raw = await response.text();

  let data = {};

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (_) {
    data = {
      error: raw || "Server vrátil neplatnú odpoveď."
    };
  }

  const serverErrorText = text(
    data?.message || data?.error,
    ""
  );

  const invalidSessionResponse =
    !response.ok && (
      data?.code === "invalid_token" ||
      /Supabase relácia je neplatná alebo expirovaná/i.test(serverErrorText) ||
      /Supabase session is invalid or expired/i.test(serverErrorText) ||
      (
        response.status === 401 &&
        /^Unauthorized$/i.test(serverErrorText)
      )
    );

  if (invalidSessionResponse) {
    if (!authRetry) {
      const client = await ensureSupabaseClient();

      try {
        await client.auth.signOut({
          scope: "local"
        });
      } catch (_) {}

      let freshSignIn;

      try {
        freshSignIn =
          await client.auth.signInAnonymously();
      } catch (error) {
        throw Object.assign(
          new Error(
            `Obnovenie Supabase relácie zlyhalo: ${text(
              error?.message,
              "Anonymné prihlásenie sa nepodarilo."
            )}`
          ),
          {
            code: "AUTH_REFRESH_FAILED"
          }
        );
      }

      if (freshSignIn?.error) {
        throw Object.assign(
          new Error(
            `Obnovenie Supabase relácie zlyhalo: ${text(
              freshSignIn.error.message,
              "Anonymné prihlásenie sa nepodarilo."
            )}`
          ),
          {
            code: "AUTH_REFRESH_FAILED"
          }
        );
      }

      const freshToken =
        freshSignIn?.data?.session?.access_token;

      if (!freshToken) {
        throw Object.assign(
          new Error(
            "Supabase nevytvoril novú reláciu. Skontroluj anonymné prihlasovanie."
          ),
          {
            code: "AUTH_REFRESH_FAILED"
          }
        );
      }

      return postSearch(payload, true);
    }

    throw Object.assign(
      new Error(
        "Server odmietol aj novú Supabase reláciu. Skontroluj nastavenie Supabase vo Verceli."
      ),
      {
        status: response.status,
        code: "SUPABASE_BACKEND_CONFIG",
        payload: data
      }
    );
  }

  if (!response.ok) {
    const error = new Error(
      text(
        data?.message || data?.error,
        `Server vrátil chybu ${response.status}.`
      )
    );

    error.status = response.status;
    error.payload = data;

    throw error;
  }

  const result = Array.isArray(data?.cars)
    ? data
    : (
        Array.isArray(data?.data?.cars)
          ? {
              ...data.data,
              remaining:
                data.remaining ?? data.data.remaining
            }
          : data
      );

  if (
    !Array.isArray(result?.cars) ||
    result.cars.length !== 3
  ) {
    throw Object.assign(
      new Error(
        "Server nevrátil presne tri vozidlá."
      ),
      {
        code: "BAD_RESULT",
        payload: data
      }
    );
  }

  /* ==========================================================
     NOVÉ: POVINNÁ FOTOGRAFIA A ZDROJ PRE VŠETKY 3 AUTÁ
     ========================================================== */

  const missingPhoto = result.cars.findIndex(car => {
    return imageUrls(car).length === 0 || !sourceUrl(car);
  });

  if (missingPhoto !== -1) {
    throw Object.assign(
      new Error(
        `Server nevrátil fotografiu so zdrojom pre vozidlo č. ${missingPhoto + 1}. Výsledky bez troch fotografií sa nezobrazia.`
      ),
      {
        code: "MISSING_PHOTO",
        payload: data
      }
    );
  }

  return result;
}


/* ============================================================
   SPRACOVANIE FOTOGRAFIÍ
   ============================================================ */

function imageUrls(car) {
  const urls = [];

  function add(value) {
    const url = safeUrl(value);

    if (
      url &&
      !urls.includes(url) &&
      urls.length < MAX_IMAGES_PER_CAR
    ) {
      urls.push(url);
    }
  }

  add(car?.image);
  add(car?.imageUrl);
  add(car?.photoUrl);
  add(car?.photo);
  add(car?.primaryImage);

  for (const collection of [
    car?.images,
    car?.imageCandidates,
    car?.photos
  ]) {
    if (!Array.isArray(collection)) continue;

    for (const item of collection) {
      if (typeof item === "string") {
        add(item);
      } else if (isPlainObject(item)) {
        add(firstValue(
          item.url,
          item.image,
          item.src,
          item.thumbnail,
          item.thumburl
        ));
      }
    }
  }

  return urls;
}

function sourceUrl(car) {
  for (const value of [
    car?.photoSource,
    car?.imageSource,
    car?.imagePage,
    car?.photoPage
  ]) {
    const url = safeUrl(value);

    if (url) return url;
  }

  for (const collection of [
    car?.imageCandidates,
    car?.images,
    car?.photos
  ]) {
    if (!Array.isArray(collection)) continue;

    for (const item of collection) {
      if (!isPlainObject(item)) continue;

      const url = safeUrl(firstValue(
        item.source,
        item.page,
        item.descriptionUrl,
        item.descriptionurl
      ));

      if (url) return url;
    }
  }

  return "";
}

function imagePlaceholder(message, index) {
  return `
    <div
      class="empty-image photo-placeholder"
      data-photo-placeholder="${index}"
    >
      ${esc(message)}
    </div>
  `;
}

function renderImage(car, index) {
  const urls = imageUrls(car);

  if (!urls.length) {
    return imagePlaceholder(
      "Vyhľadávam fotografiu konkrétneho modelu…",
      index
    );
  }

  return `
    <img
      src="${esc(urls[0])}"
      alt="${esc(firstValue(
        car?.name,
        `${car?.brand || ""} ${car?.model || "vozidlo"}`
      ))}"
      loading="lazy"
      decoding="async"
      referrerpolicy="no-referrer"
      data-candidates="${esc(JSON.stringify(urls))}"
      data-image-index="0"
      data-car-index="${index}"
      onerror="window.carmatchImageError(this)"
    >

    ${imagePlaceholder(
      "Fotografia sa nepodarilo načítať.",
      index
    )}
  `;
}

function setPhotoSourceLinks(card, source) {
  const url = safeUrl(source);

  if (!url || !card) return;

  const actions = card.querySelector(".card-actions");
  const links = card.querySelector(".source-links");

  if (
    actions &&
    !actions.querySelector("[data-dynamic-photo-source]")
  ) {
    const a = document.createElement("a");

    a.className = "card-action card-action-soft";
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "Zdroj fotografie";
    a.dataset.dynamicPhotoSource = "true";

    actions.appendChild(a);
  }

  if (
    links &&
    !links.querySelector("[data-dynamic-photo-source]")
  ) {
    const a = document.createElement("a");

    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "Fotografia";
    a.dataset.dynamicPhotoSource = "true";

    links.appendChild(a);
  }
}

function setCarImage(card, candidates) {
  const wrap = card?.querySelector(
    ".carmatch-photo-wrap"
  );

  if (
    !wrap ||
    !Array.isArray(candidates) ||
    !candidates.length
  ) {
    return;
  }

  const clean = candidates
    .map(item => ({
      url: safeUrl(
        typeof item === "string"
          ? item
          : item?.url
      ),
      source: safeUrl(
        typeof item === "object"
          ? item?.source
          : ""
      )
    }))
    .filter(item => item.url)
    .slice(0, MAX_IMAGES_PER_CAR);

  if (!clean.length) return;

  wrap.innerHTML = "";

  const img = document.createElement("img");

  img.alt = text(
    card.dataset.carName,
    "Fotografia vozidla"
  );

  img.loading = "lazy";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";

  img.dataset.candidates = JSON.stringify(
    clean.map(item => item.url)
  );

  img.dataset.imageIndex = "0";
  img.dataset.carIndex =
    card.dataset.carIndex || "0";

  img.onerror = function () {
    window.carmatchImageError(this);
  };

  img.src = clean[0].url;

  wrap.appendChild(img);

  if (clean[0].source) {
    setPhotoSourceLinks(
      card,
      clean[0].source
    );
  }
}


/* ============================================================
   PRÍSNE ODMIETANIE NESPRÁVNYCH FOTOGRAFIÍ
   ============================================================ */

function imageTitleIsRejected(title, car = {}) {
  const value = normalizedSearchText(title);

  const rejected =
    /\b(logo|emblem|badge|interior|dashboard|cockpit|steering|brochure|manual|diagram|drawing|illustration|render|toy|model kit|scale model|miniature|poster|screenshot|crash|accident|spare part|technical drawing)\b/;

  if (rejected.test(value)) {
    return true;
  }

  const body = normalizedSearchText(car?.body);

  if (
    body === "suv" ||
    body.includes("crossover")
  ) {
    if (
      /\b(wagon|estate|touring|avant|sedan|saloon|hatchback|limousine|coupe|cabriolet|convertible)\b/.test(value)
    ) {
      return true;
    }
  }

  if (
    /\b(interior|cockpit|dashboard|salon interior)\b/.test(value)
  ) {
    return true;
  }

  return false;
}


/* ============================================================
   PRESNÁ ZHODA ZNAČKY A MODELU PRI FOTOGRAFII
   ============================================================ */

function modelTokens(car) {
  const model = normalizedSearchText(
    firstValue(car?.model, car?.name)
  );

  const stop = new Set([
    "the",
    "and",
    "car",
    "auto",
    "model",
    "new",
    "all",
    "series",
    "generation",
    "vehicle"
  ]);

  return model
    .split(" ")
    .filter(token =>
      token.length >= 2 &&
      !stop.has(token)
    );
}

function scoreImageTitle(title, car) {
  const normalizedTitle =
    normalizedSearchText(title);

  if (
    !normalizedTitle ||
    imageTitleIsRejected(title, car)
  ) {
    return -1;
  }

  const brandTokens = normalizedSearchText(
    car?.brand
  )
    .split(" ")
    .filter(token => token.length >= 3);

  const tokens = modelTokens(car);

  if (!brandTokens.length || !tokens.length) {
    return -1;
  }

  const titleTokens = new Set(
    normalizedTitle.split(" ")
  );

  const brandHits = brandTokens.filter(
    token => titleTokens.has(token)
  ).length;

  if (brandHits === 0) {
    return -1;
  }

  const modelHits = tokens.filter(
    token => titleTokens.has(token)
  ).length;

  if (modelHits !== tokens.length) {
    return -1;
  }

  let score =
    brandHits * 5 +
    modelHits * 10;

  const generationTokens = normalizedSearchText(
    car?.generation
  )
    .split(" ")
    .filter(token => token.length >= 3);

  const generationHits = generationTokens.filter(
    token => titleTokens.has(token)
  ).length;

  score += generationHits * 2;

  if (
    /\b(exterior|front|side|rear|road|fahrzeug|automobile)\b/.test(normalizedTitle)
  ) {
    score += 2;
  }

  return score;
}


/* ============================================================
   VYHĽADÁVANIE FOTOGRAFIÍ NA WIKIMEDIA
   ============================================================ */

async function fetchWithTimeout(
  url,
  timeout = IMAGE_SEARCH_TIMEOUT
) {
  const controller = new AbortController();

  const timer = window.setTimeout(
    () => controller.abort(),
    timeout
  );

  try {
    return await fetch(
      url,
      {
        method: "GET",
        headers: {
          Accept: "application/json"
        },
        mode: "cors",
        cache: "force-cache",
        signal: controller.signal
      }
    );
  } finally {
    window.clearTimeout(timer);
  }
}

async function searchCommonsForCar(car) {
  const brand = text(car?.brand);
  const model = text(car?.model);
  const generation = text(car?.generation);
  const body = text(car?.body);

  if (!brand || !model) return [];

  const cacheKey = normalizedSearchText(
    `${brand} ${model} ${generation} ${body}`
  );

  if (imageSearchCache.has(cacheKey)) {
    return imageSearchCache.get(cacheKey);
  }

  const queries = [
    `${brand} ${model} ${generation} ${body} exterior`,
    `${brand} ${model} ${body} car`,
    `${brand} ${model} automobile exterior`
  ]
    .map(q => q.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const uniqueQueries = [
    ...new Set(queries)
  ];

  const all = [];
  const seen = new Set();

  for (const query of uniqueQueries) {
    const params = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: query,
      gsrnamespace: "6",
      gsrlimit: "20",
      prop: "imageinfo",
      iiprop: "url",
      iiurlwidth: "1400",
      format: "json",
      origin: "*"
    });

    try {
      const response = await fetchWithTimeout(
        `${WIKIMEDIA_API}?${params.toString()}`
      );

      if (!response.ok) continue;

      const data = await response.json();

      const pages = Object.values(
        data?.query?.pages || {}
      );

      for (const page of pages) {
        const title = text(
          page?.title,
          500
        ).replace(/^File:/i, "");

        const score = scoreImageTitle(
          title,
          car
        );

        if (score < 15) continue;

        const info = page?.imageinfo?.[0] || {};

        const url = safeUrl(
          info.thumburl || info.url
        );

        if (
          !url ||
          !/\.(jpe?g|png|webp)(\?|$)/i.test(url)
        ) {
          continue;
        }

        if (seen.has(url)) continue;

        seen.add(url);

        all.push({
          url,
          source: safeUrl(
            info.descriptionurl ||
            page?.canonicalurl
          ),
          title,
          score
        });
      }

    } catch (error) {
      console.warn(
        "CARMATCH AI: Wikimedia fallback failed",
        error?.message || error
      );
    }

    if (all.length >= 4) break;
  }

  all.sort((a, b) => b.score - a.score);

  const result = all.slice(
    0,
    MAX_IMAGES_PER_CAR
  );

  imageSearchCache.set(cacheKey, result);

  return result;
}


async function fillMissingImage(index) {
  const card = document.querySelector(
    `.carmatch-car-card[data-car-index="${Number(index)}"]`
  );

  const wrap = card?.querySelector(
    ".carmatch-photo-wrap"
  );

  const car = currentCars[Number(index)];

  if (
    !card ||
    !wrap ||
    !car ||
    wrap.dataset.commonsAttempted === "true"
  ) {
    return;
  }

  wrap.dataset.commonsAttempted = "true";

  const placeholder = wrap.querySelector(
    ".photo-placeholder"
  );

  if (placeholder) {
    placeholder.textContent =
      "Hľadám presnú fotografiu modelu…";
  }

  const candidates = await searchCommonsForCar(car);

  if (candidates.length) {
    setCarImage(card, candidates);

  } else if (placeholder) {
    placeholder.textContent =
      "Nepodarilo sa nájsť dostatočne presvedčivú fotografiu. Nechceme zobraziť nesprávne auto.";
  }
}


window.carmatchImageError = function (img) {
  if (!img) return;

  let candidates = [];

  try {
    candidates = JSON.parse(
      img.dataset.candidates || "[]"
    );
  } catch (_) {}

  const current = Number(
    img.dataset.imageIndex || "0"
  );

  const next = current + 1;

  if (
    Array.isArray(candidates) &&
    next < candidates.length
  ) {
    img.dataset.imageIndex = String(next);
    img.src = candidates[next];
    return;
  }

  img.style.display = "none";

  const placeholder =
    img.parentElement?.querySelector(
      ".photo-placeholder"
    );

  if (placeholder) {
    placeholder.hidden = false;
  }

  fillMissingImage(
    img.dataset.carIndex
  ).catch(() => {});
};

window.carmatchNextImage =
  window.carmatchImageError;


/* ============================================================
   ZOZNAMY VÝHOD A NEVÝHOD
   ============================================================ */

function renderList(
  items,
  empty = "Údaj nie je overený."
) {
  const safeItems = Array.isArray(items)
    ? items
        .map(item => text(item))
        .filter(Boolean)
        .slice(0, 6)
    : [];

  if (!safeItems.length) {
    return `<li>${esc(empty)}</li>`;
  }

  return safeItems
    .map(item => `<li>${esc(item)}</li>`)
    .join("");
}


/* ============================================================
   KARTA AUTOMOBILU
   ============================================================ */

function renderCard(car, index) {
  const safeCar = isPlainObject(car)
    ? car
    : {};

  const scoreValue = Number(safeCar.score);

  const hasScore =
    safeCar.score !== null &&
    safeCar.score !== undefined &&
    safeCar.score !== "" &&
    Number.isFinite(scoreValue) &&
    scoreValue >= 0 &&
    scoreValue <= 100;

  const score = hasScore
    ? Math.round(scoreValue)
    : null;

  const imageSource = sourceUrl(safeCar);

  const priceSource = safeUrl(
    safeCar.priceSource ||
    safeCar.officialPriceUrl
  );

  const configurator = safeUrl(
    safeCar.configurator ||
    safeCar.officialUrl ||
    safeCar.configuratorUrl
  );

  const yearValue = firstValue(
    safeCar.modelYear,
    safeCar.year
  );

  const seatsValue = firstValue(
    safeCar.seats,
    safeCar.seatCount,
    safeCar.technicalData?.seats
  );

  const trunkValue = firstValue(
    safeCar.trunkLiters,
    safeCar.trunk,
    safeCar.boot,
    safeCar.bootSpace
  );

  const driveValue = firstValue(
    safeCar.drivetrain,
    safeCar.drive,
    safeCar.drivetrainType
  );

  const bodyValue = firstValue(
    safeCar.body,
    safeCar.bodyType,
    safeCar.category
  );

  const fuelValue = firstValue(
    safeCar.fuel,
    safeCar.fuelType,
    safeCar.engineFuel
  );

  const transmissionValue = firstValue(
    safeCar.transmission,
    safeCar.gearbox
  );

  const carName =
    safeCar.brand && safeCar.model
      ? `${safeCar.brand} ${safeCar.model}`
      : text(
          safeCar.name,
          "Neznáme vozidlo"
        );

  const power = formatPowerDisplay(
    getCarPower(safeCar)
  );

  const consumption = displayText(
    getCarConsumption(safeCar)
  );

  const engine = displayText(
    getCarEngine(safeCar)
  );

  const trunk = displayTrunk(trunkValue);

  return `
    <article
      class="carmatch-car-card"
      data-car-index="${index}"
      data-car-name="${esc(carName)}"
    >

      <div class="carmatch-photo-wrap">
        ${renderImage(safeCar, index)}
      </div>

      <div class="card-body">

        <div class="card-rank">
          Odporúčanie č. ${index + 1}
        </div>

        <h3 class="card-title">
          ${esc(carName)}
        </h3>

        <div class="card-subtitle">

          ${
            safeCar.trim
              ? `Výbava: ${esc(safeCar.trim)}`
              : "Výbava: neoverená"
          }

          ${
            bodyValue
              ? ` · Karoséria: ${esc(bodyValue)}`
              : ""
          }

          ${
            safeCar.generation
              ? ` · ${esc(safeCar.generation)}`
              : ""
          }

          ${
            yearValue
              ? ` · ${esc(yearValue)}`
              : ""
          }

        </div>

        ${
          hasScore
            ? `
              <div class="score-pill">
                Zhoda ${score}%
              </div>
            `
            : ""
        }

        <div class="spec-grid">

          <div class="spec-item">
            <b>Cena</b>
            <span>
              ${esc(formatPrice(safeCar.price))}
            </span>
          </div>

          <div class="spec-item">
            <b>Výkon</b>
            <span>
              ${esc(power)}
            </span>
          </div>

          <div class="spec-item">
            <b>Spotreba WLTP</b>
            <span>
              ${esc(consumption)}
            </span>
          </div>

          <div class="spec-item">
            <b>Motor</b>
            <span>
              ${esc(engine)}
            </span>
          </div>

          <div class="spec-item">
            <b>Sedadlá</b>
            <span>
              ${esc(displaySeats(seatsValue))}
            </span>
          </div>

          <div class="spec-item">
            <b>Kufor</b>
            <span>
              ${esc(trunk)}
            </span>
          </div>

          <div class="spec-item">
            <b>Pohon</b>
            <span>
              ${esc(displayText(driveValue))}
            </span>
          </div>

          <div class="spec-item">
            <b>Palivo</b>
            <span>
              ${esc(displayText(fuelValue))}
            </span>
          </div>

          <div class="spec-item">
            <b>Prevodovka</b>
            <span>
              ${esc(displayText(transmissionValue))}
            </span>
          </div>

          <div class="spec-item">
            <b>Dĺžka</b>
            <span>
              ${esc(displayLength(safeCar))}
            </span>
          </div>

        </div>

        <div class="card-reason">

          <strong>Prečo:</strong>

          ${esc(firstValue(
            safeCar.reason,
            safeCar.description,
            "Dôvod odporúčania nebol podrobne uvedený."
          ))}

        </div>

        <div class="card-columns">

          <div>
            <h4>Výhody</h4>
            <ul>
              ${renderList(safeCar.pros)}
            </ul>
          </div>

          <div>
            <h4>Nevýhody</h4>
            <ul>
              ${renderList(safeCar.cons)}
            </ul>
          </div>

        </div>

        <div class="maintenance">

          <h4>Údržba</h4>

          ${esc(firstValue(
            safeCar.maintenance,
            "Informácie o údržbe nie sú overené."
          ))}

        </div>

        <div class="card-actions">

          ${
            priceSource
              ? `
                <a
                  class="card-action card-action-dark"
                  href="${esc(priceSource)}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Oficiálna cena
                </a>
              `
              : ""
          }

          ${
            configurator
              ? `
                <a
                  class="card-action card-action-soft"
                  href="${esc(configurator)}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Oficiálny web
                </a>
              `
              : ""
          }

          ${
            imageSource
              ? `
                <a
                  class="card-action card-action-soft"
                  href="${esc(imageSource)}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Zdroj fotografie
                </a>
              `
              : ""
          }

        </div>

        <div class="source-links">

          ${
            priceSource
              ? `
                <a
                  href="${esc(priceSource)}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Cena
                </a>
              `
              : ""
          }

          ${
            configurator
              ? `
                <a
                  href="${esc(configurator)}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Výrobca
                </a>
              `
              : ""
          }

          ${
            imageSource
              ? `
                <a
                  href="${esc(imageSource)}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Fotografia
                </a>
              `
              : ""
          }

        </div>

      </div>

    </article>
  `;
}


/* ============================================================
   ZOBRAZENIE VÝSLEDKOV
   ============================================================ */

function renderResults(data) {
  const section = $("resultsSection");
  const results = $("results");

  if (!section || !results) return;

  currentCars = Array.isArray(data.cars)
    ? data.cars.slice(0, 3)
    : [];

  imageSearchCache.clear();

  results.innerHTML = currentCars
    .map((car, index) =>
      renderCard(car, index)
    )
    .join("");

  section.hidden = false;

  const count = $("resultsCount");

  if (count) {
    count.textContent =
      `${currentCars.length} odporúčania`;
  }

  updateUsage(data);

  currentCars.forEach((car, index) => {
    if (!imageUrls(car).length) {
      fillMissingImage(index).catch(() => {});
    }
  });

  window.requestAnimationFrame(() => {
    section.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });
}


/* ============================================================
   DENNÝ LIMIT
   ============================================================ */

function updateUsage(data) {
  const rawRemaining = data?.remaining;

  if (
    rawRemaining === null ||
    rawRemaining === undefined ||
    rawRemaining === ""
  ) {
    return;
  }

  const remaining = Number(rawRemaining);

  if (!Number.isFinite(remaining)) return;

  const safeRemaining = Math.max(
    0,
    Math.min(5, Math.round(remaining))
  );

  for (const id of [
    "remainingSearches",
    "searchesRemaining",
    "usageRemaining"
  ]) {
    const el = $(id);

    if (el) {
      el.textContent = String(safeRemaining);
    }
  }

  for (const id of [
    "usageCount",
    "searchUsage"
  ]) {
    const el = $(id);

    if (el) {
      el.textContent =
        `${5 - safeRemaining} / 5 vyhľadávaní dnes`;
    }
  }
}


/* ============================================================
   CHYBOVÉ HLÁSENIA
   ============================================================ */

function renderError(error) {
  const results = $("results");
  const section = $("resultsSection");

  if (!results || !section) return;

  let message = text(
    error?.message,
    "Vyhľadávanie sa nepodarilo dokončiť."
  );

  if (error?.status === 429) {
    message = text(
      error?.payload?.message ||
      error?.payload?.error,
      "Denný limit vyhľadávaní bol dosiahnutý."
    );
  }

  if (
    error?.status === 503 ||
    error?.status === 502
  ) {
    message = text(
      error?.payload?.message ||
      error?.payload?.error,
      "AI je momentálne nedostupná. Skús to znova neskôr."
    );
  }

  results.innerHTML = `
    <div class="inline-error">
      ${esc(message)}
    </div>
  `;

  section.hidden = false;
}


/* ============================================================
   SPÄTNÁ VÄZBA
   ============================================================ */

function successFeedback() {
  try {
    if (navigator.vibrate) {
      navigator.vibrate([70, 40, 100]);
    }
  } catch (_) {}

  try {
    const AudioContextClass =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";

    osc.frequency.setValueAtTime(660, now);
    osc.frequency.setValueAtTime(880, now + 0.08);

    gain.gain.setValueAtTime(0.0001, now);

    gain.gain.exponentialRampToValueAtTime(
      0.08,
      now + 0.02
    );

    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + 0.22
    );

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.24);

    osc.addEventListener(
      "ended",
      () => ctx.close().catch(() => {})
    );

  } catch (_) {}
}


/* ============================================================
   HLAVNÉ VYHĽADÁVANIE
   ============================================================ */

async function findCars() {
  if (searching) return;

  const payload = buildPayload();

  if (!hasSearchInput(payload)) {
    setStatus(
      "Napíš požiadavku alebo nastav aspoň jeden filter.",
      "error"
    );

    $("aiRequest")?.focus();

    return;
  }

  searching = true;

  setButtonBusy(true);

  setStatus(
    "Hľadám vhodné modely a technické údaje…"
  );

  const results = $("results");
  const section = $("resultsSection");

  if (results) {
    results.innerHTML = `
      <div class="inline-error">

        <span class="loading-inline">

          <span class="loading-dot"></span>

          Hľadám vhodné autá…

        </span>

      </div>
    `;
  }

  if (section) {
    section.hidden = false;
  }

  try {
    const data = await postSearch(payload);

    renderResults(data);

    const remaining = Number(data?.remaining);

    setStatus(
      Number.isFinite(remaining)
        ? `Hotovo · zostáva ${Math.max(
            0,
            Math.round(remaining)
          )} vyhľadávaní dnes.`
        : "Hotovo.",
      "success"
    );

    successFeedback();

  } catch (error) {
    console.error(
      "CARMATCH AI search error:",
      error
    );

    renderError(error);

    setStatus(
      error?.code === "FETCH_FAILED"
        ? "Server sa neozval. Vyhľadávanie sa nemuselo započítať do limitu."
        : text(
            error?.message,
            "Vyhľadávanie sa nepodarilo dokončiť."
          ),
      "error"
    );

  } finally {
    searching = false;

    setButtonBusy(false);
  }
}


/* ============================================================
   UKÁŽKOVÉ POŽIADAVKY
   ============================================================ */

function setupExampleChips() {
  const input = $("aiRequest");

  document
    .querySelectorAll(".example-chip")
    .forEach(chip => {
      chip.addEventListener("click", () => {
        if (!input) return;

        input.value =
          chip.dataset.example || "";

        updateCharCount();

        input.focus();
      });
    });
}


/* ============================================================
   FILTRE
   ============================================================ */

function setupFilters() {
  document
    .querySelectorAll(".filters-details")
    .forEach(details => {
      details.addEventListener("toggle", () => {
        const arrow = details.querySelector(
          ".summary-arrow"
        );

        if (arrow) {
          arrow.textContent =
            details.open ? "−" : "+";
        }
      });
    });
}


/* ============================================================
   INICIALIZÁCIA
   ============================================================ */

function setup() {
  if (initialized) return;

  initialized = true;

  const input = $("aiRequest");
  const button = $("searchButton");

  input?.addEventListener(
    "input",
    updateCharCount
  );

  input?.addEventListener(
    "keydown",
    event => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key === "Enter"
      ) {
        event.preventDefault();
        findCars();
      }
    }
  );

  button?.addEventListener(
    "click",
    event => {
      event.preventDefault();
      findCars();
    }
  );

  document
    .querySelectorAll("form")
    .forEach(form => {
      if (button && form.contains(button)) {
        form.addEventListener(
          "submit",
          event => {
            event.preventDefault();
            findCars();
          }
        );
      }
    });

  setupExampleChips();
  setupFilters();
  updateCharCount();

  setStatus("Pripravené na vyhľadávanie.");
}


/* ============================================================
   SPUSTENIE
   ============================================================ */

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    setup,
    {
      once: true
    }
  );
} else {
  setup();
}


/* ============================================================
   GLOBÁLNE FUNKCIE
   ============================================================ */

window.findCars = findCars;
