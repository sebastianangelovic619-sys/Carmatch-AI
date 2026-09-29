// ============================================================
// CARMATCH AI - FINAL FRONTEND v8
// ============================================================
// Works with:
//   /api/search
//   Supabase anonymous auth
//   5 searches/day RPC limit
//   exact 3-car backend contract
//   imageCandidates / Wikimedia images
//   priceSource / configurator / dataSources
//   frontend handling for 429 + refunded 503 responses
//
// v8 FIXES:
//   - Robust AI object/value normalization
//   - Fixes [object Object] for power
//   - Better car name detection
//   - Better score/match detection
//   - Better reason/explanation detection
//   - Correct Slovak labels
//   - Correct fuel label
//   - Price normalization
//   - Power normalization to kW + hp
//   - Trunk normalization
//   - Seats normalization
//   - Drive/fuel/body normalization
//   - Safer rendering of arrays and objects
//   - Image engine untouched
//
// IMPORTANT:
// Put your PUBLIC Supabase project URL + anon key in the
// CARMATCH_CONFIG block below.
// NEVER put the Supabase service_role key here.
// ============================================================

const CARMATCH_CONFIG = window.CARMATCH_CONFIG || {
  supabaseUrl: "PASTE_YOUR_SUPABASE_URL_HERE",
  supabaseAnonKey: "PASTE_YOUR_SUPABASE_ANON_KEY_HERE",
  apiEndpoint: "/api/search"
};

const API_ENDPOINT =
  CARMATCH_CONFIG.apiEndpoint || "/api/search";

let supabaseClient = null;
let currentSession = null;
let isSearching = false;
let lastSearchText = "";


// ============================================================
// BASIC HELPERS
// ============================================================

function $(id) {
  return document.getElementById(id);
}

function numberValue(id) {
  const element = $(id);

  if (!element) {
    return 0;
  }

  const value = Number(element.value);

  return Number.isFinite(value) ? value : 0;
}

function stringValue(id) {
  const element = $(id);

  return element
    ? String(element.value || "").trim()
    : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


// ============================================================
// UNIVERSAL VALUE HELPERS
// ============================================================

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function firstDefined(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      return value;
    }
  }

  return null;
}

function cleanText(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map(item => cleanText(item))
      .filter(Boolean)
      .join(", ");
  }

  if (isPlainObject(value)) {
    const preferredKeys = [
      "text",
      "value",
      "name",
      "label",
      "description",
      "answer",
      "content",
      "message",
      "title"
    ];

    for (const key of preferredKeys) {
      if (
        value[key] !== undefined &&
        value[key] !== null &&
        value[key] !== ""
      ) {
        const result = cleanText(value[key]);

        if (result) {
          return result;
        }
      }
    }

    return "";
  }

  return String(value).trim();
}

function firstText(...values) {
  for (const value of values) {
    const result = cleanText(value);

    if (result) {
      return result;
    }
  }

  return "";
}

function numericValue(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value
      : null;
  }

  if (isPlainObject(value)) {
    const preferredKeys = [
      "value",
      "number",
      "amount",
      "score",
      "percentage",
      "percent",
      "kw",
      "hp",
      "mechanicalHp"
    ];

    for (const key of preferredKeys) {
      const result =
        numericValue(value[key]);

      if (result !== null) {
        return result;
      }
    }

    return null;
  }

  const text = String(value)
    .replace(",", ".")
    .trim();

  const match =
    text.match(/-?\d+(?:\.\d+)?/);

  if (!match) {
    return null;
  }

  const number = Number(match[0]);

  return Number.isFinite(number)
    ? number
    : null;
}


// ============================================================
// PRICE
// ============================================================

function normalizePrice(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "Cena na vyžiadanie";
  }

  if (isPlainObject(value)) {
    const objectPrice = firstText(
      value.formatted,
      value.display,
      value.price,
      value.value,
      value.amount,
      value.text
    );

    if (!objectPrice) {
      return "Cena na vyžiadanie";
    }

    return normalizePrice(objectPrice);
  }

  let text = cleanText(value);

  if (!text) {
    return "Cena na vyžiadanie";
  }

  if (
    /^unknown$/i.test(text) ||
    /^n\/a$/i.test(text) ||
    /^na$/i.test(text) ||
    text === "-"
  ) {
    return "Cena na vyžiadanie";
  }

  // Ak cena obsahuje číslo, ale chýba mena.
  if (
    /\d/.test(text) &&
    !/[€$£]|EUR|USD|GBP/i.test(text)
  ) {
    text = `${text} €`;
  }

  return text;
}


// ============================================================
// POWER
// ============================================================

function normalizePower(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "";
  }

  // Number
  if (typeof value === "number") {
    return `${Math.round(value)} kW`;
  }

  // Object from AI
  if (isPlainObject(value)) {
    const kw = numericValue(
      firstDefined(
        value.kw,
        value.kW,
        value.powerKw,
        value.powerKW,
        value.electricKw
      )
    );

    const hp = numericValue(
      firstDefined(
        value.hp,
        value.mechanicalHp,
        value.mechanicalHP,
        value.horsepower
      )
    );

    const ps = numericValue(
      firstDefined(
        value.ps,
        value.cv
      )
    );

    if (kw !== null) {
      const kwRounded =
        Math.round(kw);

      if (hp !== null) {
        return `${kwRounded} kW (${Math.round(hp)} hp)`;
      }

      if (ps !== null) {
        return `${kwRounded} kW (${Math.round(ps)} hp)`;
      }

      return `${kwRounded} kW`;
    }

    if (hp !== null) {
      return `${Math.round(hp)} hp`;
    }

    if (ps !== null) {
      return `${Math.round(ps)} hp`;
    }

    const text = firstText(
      value.display,
      value.formatted,
      value.text,
      value.value
    );

    if (text) {
      return normalizePower(text);
    }

    return "";
  }

  let text = String(value).trim();

  if (!text) {
    return "";
  }

  const kwMatch = text.match(
    /(\d+(?:[.,]\d+)?)\s*kW/i
  );

  const hpMatch = text.match(
    /(\d+(?:[.,]\d+)?)\s*(?:hp|bhp|horsepower)/i
  );

  if (kwMatch) {
    const kw = Math.round(
      Number(
        kwMatch[1].replace(",", ".")
      )
    );

    if (hpMatch) {
      const hp = Math.round(
        Number(
          hpMatch[1].replace(",", ".")
        )
      );

      return `${kw} kW (${hp} hp)`;
    }

    return `${kw} kW`;
  }

  return text;
}


// ============================================================
// SCORE / MATCH
// ============================================================

function normalizeScore(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (isPlainObject(value)) {
    const result = numericValue(
      firstDefined(
        value.score,
        value.match,
        value.matchScore,
        value.percentage,
        value.percent,
        value.value
      )
    );

    if (result === null) {
      return null;
    }

    return Math.max(
      0,
      Math.min(100, result)
    );
  }

  const result =
    numericValue(value);

  if (result === null) {
    return null;
  }

  return Math.max(
    0,
    Math.min(100, result)
  );
}

function renderStars(score) {
  const numericScore =
    normalizeScore(score);

  if (numericScore === null) {
    return "";
  }

  return `
    <span class="car-score">
      ${Math.round(numericScore)} % zhoda
    </span>
  `;
}


// ============================================================
// NAME
// ============================================================

function normalizeCarName(car) {
  const name = firstText(
    car.name,
    car.carName,
    car.modelName,
    car.vehicleName,
    car.model,
    car.vehicle,
    car.title,
    car.fullName
  );

  if (name) {
    return name;
  }

  const brand = firstText(
    car.brand,
    car.make,
    car.manufacturer
  );

  const model = firstText(
    car.model,
    car.modelName
  );

  if (brand && model) {
    return `${brand} ${model}`;
  }

  return "Neznáme vozidlo";
}


// ============================================================
// GENERATION
// ============================================================

function normalizeGeneration(car) {
  const value = firstText(
    car.generation,
    car.generationName,
    car.generationInfo,
    car.modelGeneration
  );

  return value;
}


// ============================================================
// SEATS
// ============================================================

function normalizeSeats(value) {
  const numeric = numericValue(value);

  if (numeric !== null) {
    return `${Math.round(numeric)}`;
  }

  return cleanText(value);
}


// ============================================================
// TRUNK
// ============================================================

function normalizeTrunk(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "";
  }

  if (isPlainObject(value)) {
    const liters = numericValue(
      firstDefined(
        value.liters,
        value.l,
        value.value,
        value.amount
      )
    );

    if (liters !== null) {
      return `${Math.round(liters)} l`;
    }

    return firstText(
      value.formatted,
      value.display,
      value.text
    );
  }

  const text = cleanText(value);

  if (!text) {
    return "";
  }

  if (
    /^\d+(?:[.,]\d+)?$/.test(text)
  ) {
    return `${text} l`;
  }

  return text;
}


// ============================================================
// DRIVE
// ============================================================

function normalizeDrive(value) {
  const text =
    cleanText(value);

  if (!text) {
    return "";
  }

  const lower =
    text.toLowerCase();

  if (
    lower.includes("awd") ||
    lower.includes("4wd") ||
    lower.includes("4x4") ||
    lower.includes("all-wheel") ||
    lower.includes("all wheel")
  ) {
    return "AWD (4×4)";
  }

  if (
    lower === "rwd" ||
    lower.includes("rear-wheel") ||
    lower.includes("rear wheel") ||
    lower.includes("zadný náhon")
  ) {
    return "RWD";
  }

  if (
    lower === "fwd" ||
    lower.includes("front-wheel") ||
    lower.includes("front wheel") ||
    lower.includes("predný náhon")
  ) {
    return "FWD";
  }

  return text;
}


// ============================================================
// FUEL
// ============================================================

function normalizeFuel(value) {
  const text =
    cleanText(value);

  if (!text) {
    return "";
  }

  const lower =
    text.toLowerCase();

  if (
    lower.includes("plug-in") ||
    lower.includes("plug in") ||
    lower.includes("phev")
  ) {
    return "Plug-in hybrid";
  }

  if (
    lower.includes("mild hybrid") ||
    lower.includes("mhev")
  ) {
    return "Mild-hybrid";
  }

  if (
    lower === "hybrid" ||
    lower.includes("full hybrid") ||
    lower === "hev"
  ) {
    return "Hybrid";
  }

  if (
    lower === "electric" ||
    lower === "ev" ||
    lower.includes("elektr")
  ) {
    return "Elektrický";
  }

  if (
    lower === "petrol" ||
    lower === "gasoline" ||
    lower === "gas"
  ) {
    return "Benzín";
  }

  if (
    lower === "diesel"
  ) {
    return "Diesel";
  }

  if (
    lower === "hydrogen"
  ) {
    return "Vodík";
  }

  return text;
}


// ============================================================
// BODY
// ============================================================

function normalizeBody(value) {
  const text =
    cleanText(value);

  if (!text) {
    return "";
  }

  const lower =
    text.toLowerCase();

  const map = {
    suv: "SUV",
    crossover: "Crossover",
    sedan: "Sedan",
    saloon: "Sedan",
    hatchback: "Hatchback",
    wagon: "Kombi",
    estate: "Kombi",
    "station wagon": "Kombi",
    coupe: "Kupé",
    coupé: "Kupé",
    convertible: "Kabriolet",
    roadster: "Roadster",
    minivan: "MPV",
    mpv: "MPV"
  };

  return map[lower] || text;
}


// ============================================================
// TEXT TRANSLATION / NORMALIZATION
// ============================================================

function normalizeReason(car) {
  return firstText(
    car.reason,
    car.explanation,
    car.why,
    car.whyChosen,
    car.selectionReason,
    car.aiReason,
    car.aiExplanation
  );
}

function translateCommonText(value) {
  let text = cleanText(value);

  if (!text) {
    return "";
  }

  const exactTranslations = {
    "Most powerful engine in this selection":
      "Najvýkonnejší motor z tohto výberu",

    "Comprehensive standard equipment":
      "Bohatá štandardná výbava",

    "5-year / unlimited km warranty":
      "5-ročná záruka bez obmedzenia kilometrov",

    "Brand dealer network still expanding in Slovakia":
      "Sieť autorizovaných predajcov značky sa na Slovensku stále rozširuje",

    "Fuel consumption higher than mild-hybrid rivals":
      "Spotreba paliva je vyššia ako pri mild-hybridných konkurentoch",

    "Infotainment screen not as large as German competitors":
      "Infotainment nemá taký veľký displej ako niektorí nemeckí konkurenti",

    "Explanation is not available.":
      "Vysvetlenie nie je dostupné.",

    "No information available.":
      "Informácia nie je dostupná.",

    "Automatic source":
      "Automatický zdroj"
  };

  if (exactTranslations[text]) {
    return exactTranslations[text];
  }

  return text;
}

function normalizeList(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map(item =>
        translateCommonText(item)
      )
      .filter(Boolean);
  }

  if (isPlainObject(value)) {
    const possibleArray =
      firstDefined(
        value.items,
        value.list,
        value.values,
        value.data
      );

    if (Array.isArray(possibleArray)) {
      return normalizeList(
        possibleArray
      );
    }

    const text = translateCommonText(
      value.text ||
      value.value ||
      value.description ||
      value.name
    );

    return text
      ? [text]
      : [];
  }

  const text =
    translateCommonText(value);

  if (!text) {
    return [];
  }

  return [text];
}


// ============================================================
// IMAGE ENGINE
// ============================================================
// INTENTIONALLY KEPT COMPATIBLE WITH THE CURRENT BACKEND.
// ============================================================

function getCarImage(car) {
  if (
    Array.isArray(car.imageCandidates) &&
    car.imageCandidates.length > 0
  ) {
    const candidate =
      car.imageCandidates.find(
        item =>
          item &&
          typeof item.url === "string" &&
          item.url.startsWith("https://")
      );

    if (candidate) {
      return candidate.url;
    }
  }

  if (
    typeof car.image === "string" &&
    car.image.startsWith("https://")
  ) {
    return car.image;
  }

  return "";
}


// ============================================================
// CAR NORMALIZATION
// ============================================================

function normalizeCar(rawCar) {
  const car =
    isPlainObject(rawCar)
      ? rawCar
      : {};

  const normalized = {
    ...car,

    name:
      normalizeCarName(car),

    generation:
      normalizeGeneration(car),

    score:
      normalizeScore(
        firstDefined(
          car.score,
          car.matchScore,
          car.match,
          car.percentage,
          car.matchPercentage
        )
      ),

    price:
      normalizePrice(
        firstDefined(
          car.price,
          car.priceFormatted,
          car.startingPrice,
          car.priceFrom
        )
      ),

    power:
      normalizePower(
        firstDefined(
          car.power,
          car.powerKw,
          car.powerKW,
          car.enginePower,
          car.output
        )
      ),

    seats:
      normalizeSeats(
        firstDefined(
          car.seats,
          car.seating,
          car.passengerCapacity
        )
      ),

    trunk:
      normalizeTrunk(
        firstDefined(
          car.trunk,
          car.trunkCapacity,
          car.boot,
          car.bootSpace,
          car.luggageCapacity
        )
      ),

    drive:
      normalizeDrive(
        firstDefined(
          car.drive,
          car.drivetrain,
          car.drivetrainType
        )
      ),

    fuel:
      normalizeFuel(
        firstDefined(
          car.fuel,
          car.fuelType,
          car.powertrain
        )
      ),

    body:
      normalizeBody(
        firstDefined(
          car.body,
          car.bodyType
        )
      ),

    year:
      cleanText(
        firstDefined(
          car.year,
          car.modelYear,
          car.model_year
        )
      ),

    reason:
      normalizeReason(car),

    pros:
      normalizeList(
        firstDefined(
          car.pros,
          car.advantages,
          car.benefits
        )
      ),

    cons:
      normalizeList(
        firstDefined(
          car.cons,
          car.disadvantages,
          car.drawbacks
        )
      ),

    maintenance:
      translateCommonText(
        firstText(
          car.maintenance,
          car.maintenanceInfo,
          car.service,
          car.serviceInfo
        )
      )
  };

  return normalized;
}


// ============================================================
// FILTERS / REQUEST
// ============================================================

function getSearchInput() {
  const possibleIds = [
    "query",
    "search",
    "naturalLanguage",
    "prompt",
    "requirements",
    "carSearch"
  ];

  for (const id of possibleIds) {
    const element = $(id);

    if (
      element &&
      String(element.value || "").trim()
    ) {
      return String(element.value).trim();
    }
  }

  return "";
}

function buildFilters() {
  return {
    budget: numberValue("budget"),
    seats: numberValue("seats"),
    trunk: numberValue("trunk"),
    power: numberValue("power"),
    length: numberValue("length"),
    drive: stringValue("drive"),
    fuel: stringValue("fuel"),
    body: stringValue("body"),
    style: stringValue("style"),
    avoidBrands: stringValue("avoid")
  };
}

function buildRequest() {
  return {
    naturalLanguage:
      getSearchInput(),

    filters:
      buildFilters()
  };
}


// ============================================================
// SUPABASE
// ============================================================

async function initializeSupabase() {
  if (
    typeof window.supabase === "undefined" ||
    typeof window.supabase.createClient !== "function"
  ) {
    console.error(
      "Supabase library is not loaded."
    );

    return false;
  }

  if (
    !CARMATCH_CONFIG.supabaseUrl ||
    CARMATCH_CONFIG.supabaseUrl.includes(
      "PASTE_YOUR"
    ) ||
    !CARMATCH_CONFIG.supabaseAnonKey ||
    CARMATCH_CONFIG.supabaseAnonKey.includes(
      "PASTE_YOUR"
    )
  ) {
    console.error(
      "Supabase configuration is missing."
    );

    return false;
  }

  supabaseClient =
    window.supabase.createClient(
      CARMATCH_CONFIG.supabaseUrl,
      CARMATCH_CONFIG.supabaseAnonKey
    );

  const sessionResult =
    await supabaseClient.auth.getSession();

  currentSession =
    sessionResult?.data?.session || null;

  if (!currentSession) {
    const authResult =
      await supabaseClient.auth.signInAnonymously();

    if (authResult.error) {
      console.error(
        "Anonymous Supabase auth failed:",
        authResult.error
      );

      return false;
    }

    currentSession =
      authResult?.data?.session || null;
  }

  return Boolean(currentSession);
}

async function refreshSession() {
  if (!supabaseClient) {
    return null;
  }

  const result =
    await supabaseClient.auth.getSession();

  currentSession =
    result?.data?.session || null;

  return currentSession;
}

async function getAccessToken() {
  if (!currentSession) {
    await initializeSupabase();
  }

  if (!currentSession) {
    return "";
  }

  return currentSession.access_token || "";
}


// ============================================================
// UI STATE
// ============================================================

function setLoadingState(loading) {
  isSearching = loading;

  const buttons = [
    $("searchButton"),
    $("findButton"),
    $("submitButton")
  ];

  for (const button of buttons) {
    if (!button) continue;

    button.disabled = loading;

    if (loading) {
      button.dataset.originalText =
        button.textContent;

      button.textContent =
        "Hľadám...";
    } else if (
      button.dataset.originalText
    ) {
      button.textContent =
        button.dataset.originalText;
    }
  }
}

function getResultsContainer() {
  const ids = [
    "results",
    "resultsContainer",
    "carResults",
    "output"
  ];

  for (const id of ids) {
    const element = $(id);

    if (element) {
      return element;
    }
  }

  return null;
}

function getStatusContainer() {
  const ids = [
    "status",
    "message",
    "error",
    "searchStatus"
  ];

  for (const id of ids) {
    const element = $(id);

    if (element) {
      return element;
    }
  }

  return null;
}

function showStatus(
  message,
  type = "info"
) {
  const container =
    getStatusContainer();

  if (!container) {
    return;
  }

  container.textContent =
    message;

  container.dataset.type =
    type;

  container.hidden =
    !message;
}

function clearStatus() {
  const container =
    getStatusContainer();

  if (!container) {
    return;
  }

  container.textContent = "";
  container.hidden = true;
}

function showResultsHtml(html) {
  const container =
    getResultsContainer();

  if (!container) {
    return;
  }

  container.innerHTML = html;
  container.hidden = false;
}

function clearResults() {
  const container =
    getResultsContainer();

  if (!container) {
    return;
  }

  container.innerHTML = "";
}

function formatRemaining(remaining) {
  const value =
    Number(remaining);

  if (!Number.isFinite(value)) {
    return "";
  }

  return `Zostávajúce vyhľadávania dnes: ${Math.max(
    0,
    Math.floor(value)
  )}/5`;
}


// ============================================================
// LIST RENDERING
// ============================================================

function renderList(
  items,
  emptyText = ""
) {
  const normalized =
    normalizeList(items);

  if (
    !Array.isArray(normalized) ||
    normalized.length === 0
  ) {
    return emptyText
      ? `<p class="empty-list">${escapeHtml(
          emptyText
        )}</p>`
      : "";
  }

  return `
    <ul>
      ${normalized
        .slice(0, 8)
        .map(
          item =>
            `<li>${escapeHtml(item)}</li>`
        )
        .join("")}
    </ul>
  `;
}


// ============================================================
// CAR CARD
// ============================================================

function renderCarCard(
  rawCar,
  index
) {
  const car =
    normalizeCar(rawCar);

  const image =
    getCarImage(car);

  const price =
    normalizePrice(car.price);

  const power =
    normalizePower(car.power);

  const seats =
    normalizeSeats(car.seats);

  const trunk =
    normalizeTrunk(car.trunk);

  const drive =
    normalizeDrive(car.drive);

  const fuel =
    normalizeFuel(car.fuel);

  const imageHtml =
    image
      ? `
        <div class="car-image">
          <img
            src="${escapeHtml(image)}"
            alt="${escapeHtml(
              car.name
            )}"
            loading="lazy"
            referrerpolicy="no-referrer"
            onerror="this.closest('.car-image').classList.add('image-error')"
          >
        </div>
      `
      : `
        <div class="car-image image-placeholder">
          <span>
            Fotografia nie je dostupná
          </span>
        </div>
      `;

  const sourceHtml =
    car.priceSource &&
    /^https:\/\//i.test(
      String(car.priceSource)
    )
      ? `
        <a
          class="source-link"
          href="${escapeHtml(
            car.priceSource
          )}"
          target="_blank"
          rel="noopener noreferrer"
        >
          Oficiálny zdroj ceny
        </a>
      `
      : "";

  const configuratorHtml =
    car.configurator &&
    /^https:\/\//i.test(
      String(car.configurator)
    )
      ? `
        <a
          class="source-link"
          href="${escapeHtml(
            car.configurator
          )}"
          target="_blank"
          rel="noopener noreferrer"
        >
          Oficiálny konfigurátor
        </a>
      `
      : "";

  const reason =
    normalizeReason(car);

  const maintenance =
    translateCommonText(
      car.maintenance
    );

  return `
    <article class="car-card">

      <div class="car-rank">
        ${index + 1}
      </div>

      ${imageHtml}

      <div class="car-content">

        <div class="car-heading">

          <div>
            <h3>
              ${escapeHtml(
                car.name
              )}
            </h3>

            ${
              car.generation
                ? `
                  <div class="car-generation">
                    ${escapeHtml(
                      car.generation
                    )}
                  </div>
                `
                : ""
            }
          </div>

          ${renderStars(
            car.score
          )}

        </div>

        <div class="car-price">
          💰 ${escapeHtml(
            price
          )}
        </div>

        <div class="car-specs">

          ${
            power
              ? `
                <span>
                  <b>⚡ Výkon:</b>
                  ${escapeHtml(
                    power
                  )}
                </span>
              `
              : ""
          }

          ${
            seats
              ? `
                <span>
                  <b>🪑 Miesta:</b>
                  ${escapeHtml(
                    seats
                  )}
                </span>
              `
              : ""
          }

          ${
            trunk
              ? `
                <span>
                  <b>🧳 Kufor:</b>
                  ${escapeHtml(
                    trunk
                  )}
                </span>
              `
              : ""
          }

          ${
            drive
              ? `
                <span>
                  <b>🚗 Pohon:</b>
                  ${escapeHtml(
                    drive
                  )}
                </span>
              `
              : ""
          }

          ${
            fuel
              ? `
                <span>
                  <b>🔋 Palivo:</b>
                  ${escapeHtml(
                    fuel
                  )}
                </span>
              `
              : ""
          }

          ${
            car.year
              ? `
                <span>
                  <b>📅 Rok:</b>
                  ${escapeHtml(
                    car.year
                  )}
                </span>
              `
              : ""
          }

        </div>

        ${
          reason
            ? `
              <div class="car-reason">

                <h4>
                  🤖 Prečo ho AI vybrala
                </h4>

                <p>
                  ${escapeHtml(
                    reason
                  )}
                </p>

              </div>
            `
            : ""
        }

        <div class="car-columns">

          <div>
            <h4>✅ Výhody</h4>

            ${renderList(
              car.pros
            )}
          </div>

          <div>
            <h4>❌ Nevýhody</h4>

            ${renderList(
              car.cons
            )}
          </div>

        </div>

        ${
          maintenance
            ? `
              <div class="maintenance">

                <h4>
                  🔧 Údržba
                </h4>

                <p>
                  ${escapeHtml(
                    maintenance
                  )}
                </p>

              </div>
            `
            : ""
        }

        <div class="car-links">

          ${sourceHtml}

          ${configuratorHtml}

        </div>

      </div>

    </article>
  `;
}


// ============================================================
// RESULTS
// ============================================================

function renderCars(cars) {
  if (
    !Array.isArray(cars) ||
    cars.length === 0
  ) {
    showResultsHtml(`
      <div class="empty-results">
        Nenašli sa žiadne vhodné vozidlá.
      </div>
    `);

    return;
  }

  const normalizedCars =
    cars
      .slice(0, 3)
      .map(normalizeCar);

  showResultsHtml(`
    <div class="results-header">
      <h2>
        Výsledky CARMATCH AI
      </h2>
    </div>

    <div class="cars-list">
      ${normalizedCars
        .map(
          (car, index) =>
            renderCarCard(
              car,
              index
            )
        )
        .join("")}
    </div>
  `);
}


// ============================================================
// READY FEEDBACK
// ============================================================

function playReadySound() {
  try {
    const AudioContext =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContext) {
      return;
    }

    const context =
      new AudioContext();

    const oscillator =
      context.createOscillator();

    const gain =
      context.createGain();

    oscillator.type =
      "sine";

    oscillator.frequency.setValueAtTime(
      660,
      context.currentTime
    );

    oscillator.frequency.setValueAtTime(
      880,
      context.currentTime + 0.08
    );

    gain.gain.setValueAtTime(
      0.0001,
      context.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      0.08,
      context.currentTime + 0.02
    );

    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      context.currentTime + 0.22
    );

    oscillator.connect(gain);
    gain.connect(
      context.destination
    );

    oscillator.start();

    oscillator.stop(
      context.currentTime + 0.23
    );
  } catch (_) {}
}

function vibrateReady() {
  try {
    if (
      navigator.vibrate &&
      typeof navigator.vibrate ===
        "function"
    ) {
      navigator.vibrate([
        80,
        50,
        120
      ]);
    }
  } catch (_) {}
}

function answerReadyFeedback() {
  vibrateReady();
  playReadySound();
}


// ============================================================
// ERROR HANDLING
// ============================================================

function parseErrorMessage(
  data,
  status
) {
  if (
    data &&
    typeof data.message ===
      "string"
  ) {
    return data.message;
  }

  if (status === 429) {
    return "Denný limit vyhľadávaní bol dosiahnutý.";
  }

  if (status === 401) {
    return "Relácia vypršala. Skús to znova.";
  }

  if (status === 503) {
    return "AI služba je momentálne nedostupná. Vyhľadávanie sa nezapočítalo do limitu.";
  }

  return "Požiadavku sa nepodarilo dokončiť.";
}

async function parseResponse(
  response
) {
  const text =
    await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (_) {
    return {
      message: text
    };
  }
}


// ============================================================
// SEARCH
// ============================================================

async function performSearch() {
  if (isSearching) {
    return;
  }

  const request =
    buildRequest();

  if (
    !request.naturalLanguage
  ) {
    showStatus(
      "Zjednoduš alebo oprav zadaný text.",
      "error"
    );

    return;
  }

  lastSearchText =
    request.naturalLanguage;

  clearStatus();
  clearResults();

  setLoadingState(true);

  try {
    let token =
      await getAccessToken();

    if (!token) {
      const initialized =
        await initializeSupabase();

      if (!initialized) {
        throw new Error(
          "Supabase autentifikácia sa nepodarila."
        );
      }

      token =
        await getAccessToken();
    }

    const response =
      await fetch(
        API_ENDPOINT,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${token}`
          },

          body:
            JSON.stringify(
              request
            )
        }
      );

    const data =
      await parseResponse(
        response
      );

    // ========================================================
    // RETRY AFTER 401
    // ========================================================

    if (
      response.status === 401
    ) {
      currentSession = null;

      const initialized =
        await initializeSupabase();

      if (initialized) {
        const newToken =
          await getAccessToken();

        if (
          newToken &&
          newToken !== token
        ) {
          const retry =
            await fetch(
              API_ENDPOINT,
              {
                method: "POST",

                headers: {
                  "Content-Type":
                    "application/json",

                  Authorization:
                    `Bearer ${newToken}`
                },

                body:
                  JSON.stringify(
                    request
                  )
              }
            );

          const retryData =
            await parseResponse(
              retry
            );

          if (retry.ok) {

            if (
              !Array.isArray(
                retryData.cars
              ) ||
              retryData.cars.length !== 3
            ) {
              throw new Error(
                "Backend nevrátil presne 3 vozidlá."
              );
            }

            renderCars(
              retryData.cars
            );

            showStatus(
              formatRemaining(
                retryData.remaining
              ),
              "success"
            );

            answerReadyFeedback();

            return;
          }

          throw new Error(
            parseErrorMessage(
              retryData,
              retry.status
            )
          );
        }
      }
    }

    // ========================================================
    // NORMAL ERROR
    // ========================================================

    if (!response.ok) {
      throw new Error(
        parseErrorMessage(
          data,
          response.status
        )
      );
    }

    // ========================================================
    // EXACTLY 3 CARS
    // ========================================================

    if (
      !Array.isArray(data.cars) ||
      data.cars.length !== 3
    ) {
      throw new Error(
        "Backend nevrátil presne 3 vozidlá."
      );
    }

    // ========================================================
    // RENDER
    // ========================================================

    renderCars(
      data.cars
    );

    const remainingText =
      formatRemaining(
        data.remaining
      );

    showStatus(
      remainingText,
      "success"
    );

    answerReadyFeedback();

  } catch (error) {

    console.error(
      "CARMATCH AI search error:",
      error
    );

    showStatus(
      error?.message ||
        "Nastala chyba pri vyhľadávaní.",
      "error"
    );

  } finally {

    setLoadingState(
      false
    );
  }
}


// ============================================================
// EVENTS
// ============================================================

function attachSearchEvents() {

  const buttonIds = [
    "searchButton",
    "findButton",
    "submitButton"
  ];

  for (
    const id of buttonIds
  ) {

    const button = $(id);

    if (!button) {
      continue;
    }

    button.addEventListener(
      "click",
      event => {
        event.preventDefault();
        performSearch();
      }
    );
  }

  const form =
    $("searchForm");

  if (form) {

    form.addEventListener(
      "submit",
      event => {
        event.preventDefault();
        performSearch();
      }
    );
  }

  const searchInputIds = [
    "query",
    "search",
    "naturalLanguage",
    "prompt",
    "requirements",
    "carSearch"
  ];

  for (
    const id of searchInputIds
  ) {

    const input = $(id);

    if (!input) {
      continue;
    }

    input.addEventListener(
      "keydown",
      event => {

        if (
          event.key === "Enter" &&
          !event.shiftKey
        ) {
          event.preventDefault();
          performSearch();
        }

      }
    );
  }
}


// ============================================================
// INIT
// ============================================================

function init() {

  attachSearchEvents();

  initializeSupabase().catch(
    error => {
      console.error(
        "CARMATCH AI initialization error:",
        error
      );
    }
  );
}

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    init
  );

} else {

  init();

}