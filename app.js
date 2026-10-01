// ============================================================
// CARMATCH AI - FINAL FRONTEND v13
// ============================================================
// IMPORTANT:
// - UI never waits for Supabase initialization
// - Search button is never disabled because of authentication
// - Anonymous authentication is retried when searching
// - Authentication timeout protection
// - API timeout protection
// - Failed fetch protection
// - Exactly 3 cars
// - 5 searches/day UI
// - Search refund support
// - Slovak UI
// - Image candidates
// - € / kW / HP / l formatting
// - Dark / Light mode
// - Saved theme
// - Vibration + sound
// ============================================================

"use strict";

const CONFIG = window.CARMATCH_CONFIG || {
  supabaseUrl: "",
  supabaseAnonKey: "",
  apiEndpoint: "/api/search"
};

let supabaseClient = null;
let currentSession = null;
let isSearching = false;
let supabaseInitialized = false;


// ============================================================
// DOM
// ============================================================

function $(id) {
  return document.getElementById(id);
}


// ============================================================
// SAFE TEXT
// ============================================================

function safeDisplayText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === "string") {
    const result = value.trim();
    return result || fallback;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map(item => safeDisplayText(item, ""))
      .filter(Boolean)
      .join(", ");
  }

  if (typeof value === "object") {
    const preferredKeys = [
      "message",
      "error",
      "text",
      "value",
      "name",
      "description",
      "reason",
      "title"
    ];

    for (const key of preferredKeys) {
      if (
        Object.prototype.hasOwnProperty.call(
          value,
          key
        )
      ) {
        const result = safeDisplayText(
          value[key],
          ""
        );

        if (result) {
          return result;
        }
      }
    }

    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }

  return fallback;
}


// ============================================================
// HTML SAFETY
// ============================================================

function escapeHTML(value) {
  return safeDisplayText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function escapeAttribute(value) {
  return escapeHTML(value);
}


// ============================================================
// URL
// ============================================================

function safeHTTPSUrl(value) {
  const url = safeDisplayText(value, "");

  if (!url) {
    return "";
  }

  try {
    const parsed = new URL(url);

    if (parsed.protocol !== "https:") {
      return "";
    }

    return parsed.href;
  } catch {
    return "";
  }
}


// ============================================================
// NUMBERS
// ============================================================

function numericValue(value) {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value
    .replace(/\s/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");

  if (!cleaned) {
    return null;
  }

  const number = Number(cleaned);

  return Number.isFinite(number)
    ? number
    : null;
}


function formatNumber(value) {
  const number = numericValue(value);

  if (number === null) {
    return "";
  }

  return new Intl.NumberFormat("sk-SK", {
    maximumFractionDigits: 0
  }).format(number);
}


// ============================================================
// FORMATTERS
// ============================================================

function formatPrice(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "Cena nie je dostupná";
  }

  const raw = safeDisplayText(value, "");

  if (!raw) {
    return "Cena nie je dostupná";
  }

  const lowered = raw.toLowerCase();

  if (
    lowered.includes("cena na vyžiadanie") ||
    lowered.includes("cena na vyziadanie")
  ) {
    return "Cena na vyžiadanie";
  }

  if (
    lowered.includes("cena nie je dostupná") ||
    lowered.includes("cena nie je dostupna")
  ) {
    return "Cena nie je dostupná";
  }

  if (
    raw.includes("€") ||
    /\bEUR\b/i.test(raw) ||
    /\$/.test(raw) ||
    /£/.test(raw) ||
    /CHF/i.test(raw)
  ) {
    return raw;
  }

  const number = numericValue(raw);

  if (number !== null) {
    return (
      new Intl.NumberFormat("sk-SK", {
        maximumFractionDigits: 0
      }).format(number) + " €"
    );
  }

  return raw;
}


function formatPower(car) {
  const kw = numericValue(
    car?.powerKw ??
    car?.kw
  );

  const hp = numericValue(
    car?.powerHpMechanical ??
    car?.mechanicalHp ??
    car?.hp
  );

  if (kw !== null && hp !== null) {
    return (
      `${formatNumber(kw)} kW / ` +
      `${formatNumber(hp)} HP`
    );
  }

  if (kw !== null) {
    return `${formatNumber(kw)} kW`;
  }

  if (hp !== null) {
    return `${formatNumber(hp)} HP`;
  }

  const oldPower = safeDisplayText(
    car?.power,
    ""
  );

  if (!oldPower) {
    return "";
  }

  if (
    /kW/i.test(oldPower) ||
    /\bHP\b/i.test(oldPower)
  ) {
    return oldPower;
  }

  const oldNumber = numericValue(oldPower);

  if (oldNumber !== null) {
    return `${formatNumber(oldNumber)} kW`;
  }

  return oldPower;
}


function formatTrunk(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "";
  }

  const raw = safeDisplayText(value, "");

  if (!raw) {
    return "";
  }

  if (
    /\bl\b/i.test(raw) ||
    /litrov/i.test(raw)
  ) {
    return raw;
  }

  const number = numericValue(raw);

  if (number !== null) {
    return `${formatNumber(number)} l`;
  }

  return raw;
}


function formatText(value) {
  const text = safeDisplayText(value, "");

  if (!text) {
    return "";
  }

  return escapeHTML(text)
    .replace(/\n/g, "<br>");
}


// ============================================================
// STATUS
// ============================================================

function setStatus(message, type = "") {
  const status = $("status");

  if (!status) {
    return;
  }

  status.className = "status";

  if (type) {
    status.classList.add(type);
  }

  status.textContent =
    safeDisplayText(message);
}


// ============================================================
// BUTTON
// ============================================================

function setButtonBusy(busy) {
  const button = $("searchButton");

  if (!button) {
    return;
  }

  button.disabled = Boolean(busy);

  if (busy) {
    button.dataset.originalText =
      button.textContent ||
      "Nájsť auto";

    button.textContent =
      "Vyhľadávam...";
  } else {
    button.textContent =
      button.dataset.originalText ||
      "Nájsť auto";

    delete button.dataset.originalText;
  }
}


function enableSearchButton() {
  const button = $("searchButton");

  if (!button) {
    return;
  }

  button.disabled = false;
  button.removeAttribute("disabled");
}


// ============================================================
// USAGE
// ============================================================

function updateUsage(remaining) {
  const usageText = $("usageText");
  const usageDot = $("usageDot");

  let value = Number(remaining);

  if (!Number.isFinite(value)) {
    value = 5;
  }

  value = Math.max(
    0,
    Math.min(5, value)
  );

  if (usageText) {
    usageText.textContent =
      `${value} / 5 vyhľadávaní dnes`;
  }

  if (usageDot) {
    usageDot.className = "usage-dot";

    if (value <= 0) {
      usageDot.classList.add("empty");
    } else if (value <= 1) {
      usageDot.classList.add("low");
    } else {
      usageDot.classList.add("available");
    }
  }
}


// ============================================================
// THEME
// ============================================================

function updateThemeButton(theme) {
  const button = $("themeToggle");

  if (!button) {
    return;
  }

  if (theme === "dark") {
    button.textContent = "☀️";
    button.setAttribute(
      "aria-label",
      "Prepnúť na svetlý režim"
    );
    button.setAttribute(
      "title",
      "Svetlý režim"
    );
  } else {
    button.textContent = "🌙";
    button.setAttribute(
      "aria-label",
      "Prepnúť na tmavý režim"
    );
    button.setAttribute(
      "title",
      "Tmavý režim"
    );
  }
}


function initializeTheme() {
  let savedTheme = null;

  try {
    savedTheme =
      localStorage.getItem(
        "carmatch-theme"
      );
  } catch {
    savedTheme = null;
  }

  let theme;

  if (
    savedTheme === "dark" ||
    savedTheme === "light"
  ) {
    theme = savedTheme;
  } else {
    theme =
      window.matchMedia &&
      window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches
        ? "dark"
        : "light";
  }

  document.documentElement.setAttribute(
    "data-theme",
    theme
  );

  updateThemeButton(theme);
}


function toggleTheme() {
  const currentTheme =
    document.documentElement.getAttribute(
      "data-theme"
    ) || "light";

  const newTheme =
    currentTheme === "dark"
      ? "light"
      : "dark";

  document.documentElement.setAttribute(
    "data-theme",
    newTheme
  );

  try {
    localStorage.setItem(
      "carmatch-theme",
      newTheme
    );
  } catch {
    // Nothing to do.
  }

  updateThemeButton(newTheme);
}


// ============================================================
// TIMEOUT HELPER
// ============================================================

function timeoutPromise(promise, ms, message) {
  return Promise.race([
    promise,

    new Promise((_, reject) => {
      setTimeout(() => {
        const error =
          new Error(message);

        error.code =
          "TIMEOUT";

        reject(error);
      }, ms);
    })
  ]);
}


// ============================================================
// SUPABASE
// ============================================================

async function waitForSupabase() {
  if (
    window.supabase &&
    typeof window.supabase.createClient ===
      "function"
  ) {
    return true;
  }

  const started =
    Date.now();

  while (
    Date.now() - started <
    10000
  ) {
    if (
      window.supabase &&
      typeof window.supabase.createClient ===
        "function"
    ) {
      return true;
    }

    await new Promise(resolve =>
      setTimeout(resolve, 100)
    );
  }

  return false;
}


async function initializeSupabase() {
  if (supabaseClient) {
    return supabaseClient;
  }

  if (
    !CONFIG.supabaseUrl ||
    !CONFIG.supabaseAnonKey
  ) {
    throw new Error(
      "Supabase konfigurácia nie je nastavená."
    );
  }

  const available =
    await waitForSupabase();

  if (!available) {
    throw new Error(
      "Supabase knižnica sa nepodarilo načítať."
    );
  }

  supabaseClient =
    window.supabase.createClient(
      CONFIG.supabaseUrl,
      CONFIG.supabaseAnonKey
    );

  supabaseInitialized = true;

  return supabaseClient;
}


// ============================================================
// ANONYMOUS AUTH
// ============================================================

async function initializeAnonymousUser() {
  const client =
    await timeoutPromise(
      initializeSupabase(),
      12000,
      "Supabase sa nepodarilo inicializovať."
    );

  const sessionResult =
    await timeoutPromise(
      client.auth.getSession(),
      10000,
      "Kontrola relácie trvá príliš dlho."
    );

  if (
    sessionResult?.data?.session
  ) {
    currentSession =
      sessionResult.data.session;

    return currentSession;
  }

  const authResult =
    await timeoutPromise(
      client.auth.signInAnonymously(),
      15000,
      "Anonymné prihlásenie trvá príliš dlho."
    );

  if (authResult.error) {
    throw authResult.error;
  }

  currentSession =
    authResult.data?.session ||
    null;

  if (!currentSession) {
    throw new Error(
      "Supabase nevytvoril používateľskú reláciu."
    );
  }

  return currentSession;
}


// ============================================================
// BACKGROUND AUTH
// ============================================================

async function startBackgroundAuthentication() {
  try {
    await initializeAnonymousUser();

    console.log(
      "CARMATCH AI: Supabase authentication ready."
    );

    if (!isSearching) {
      setStatus(
        "CARMATCH AI je pripravený.",
        "success"
      );
    }

  } catch (error) {
    console.warn(
      "CARMATCH AI: background authentication failed.",
      error
    );

    // Dôležité:
    // UI zostáva použiteľné.
    // Ďalší pokus prebehne pri kliknutí.
    if (!isSearching) {
      setStatus(
        "CARMATCH AI je pripravený. Pri vyhľadávaní sa ešte pripojíme.",
        "loading"
      );
    }
  }
}


// ============================================================
// ACCESS TOKEN
// ============================================================

async function getAccessToken() {
  if (!supabaseClient) {
    return "";
  }

  try {
    const result =
      await supabaseClient.auth.getSession();

    if (result.error) {
      return "";
    }

    currentSession =
      result.data?.session ||
      currentSession ||
      null;

    return (
      result.data?.session?.access_token ||
      ""
    );

  } catch {
    return "";
  }
}


// ============================================================
// REQUEST
// ============================================================

function value(id) {
  const element = $(id);

  if (!element) {
    return "";
  }

  return safeDisplayText(
    element.value,
    ""
  );
}


function collectRequest() {
  return {
    request: value("aiRequest"),

    filters: {
      budget: value("budget"),
      seats: value("seats"),
      power: value("power"),
      trunk: value("trunk"),
      drive: value("drive"),
      fuel: value("fuel"),
      body: value("body"),
      style: value("style"),
      length: value("length"),
      year: value("year"),

      // Podporujeme oba možné ID.
      avoid:
        value("avoidBrands") ||
        value("avoid")
    }
  };
}


// ============================================================
// RESPONSE
// ============================================================

function normalizeCars(data) {
  if (!data) {
    return [];
  }

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data.cars)) {
    return data.cars;
  }

  if (Array.isArray(data.results)) {
    return data.results;
  }

  if (Array.isArray(data.recommendations)) {
    return data.recommendations;
  }

  if (data.data) {
    return normalizeCars(data.data);
  }

  return [];
}


// ============================================================
// IMAGE
// ============================================================

function normalizeImageCandidate(item) {
  if (typeof item === "string") {
    const url =
      safeHTTPSUrl(item);

    if (!url) {
      return null;
    }

    return {
      url,
      title: "",
      source: ""
    };
  }

  if (
    !item ||
    typeof item !== "object"
  ) {
    return null;
  }

  const url =
    safeHTTPSUrl(
      item.url ||
      item.image ||
      item.imageUrl
    );

  if (!url) {
    return null;
  }

  return {
    url,

    title:
      safeDisplayText(
        item.title ||
        item.name ||
        "",
        ""
      ),

    source:
      safeDisplayText(
        item.source ||
        "",
        ""
      )
  };
}


function getCarIdentityTokens(car) {
  const brand =
    safeDisplayText(
      car?.brand,
      ""
    );

  const model =
    safeDisplayText(
      car?.model ||
      car?.name ||
      car?.title,
      ""
    );

  const generation =
    safeDisplayText(
      car?.generation,
      ""
    );

  const year =
    safeDisplayText(
      car?.modelYear ||
      car?.year,
      ""
    );

  return {
    brand,
    model,
    generation,
    year
  };
}


function normalizeSearchText(value) {
  return safeDisplayText(
    value,
    ""
  )
    .toLowerCase()
    .replace(
      /[^a-z0-9áäčďéíĺľňóôŕšťúýž\s-]/gi,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


function tokenList(value) {
  return normalizeSearchText(value)
    .split(/\s+/)
    .filter(
      token => token.length >= 2
    );
}


function scoreImageCandidate(
  candidate,
  car
) {
  const identity =
    getCarIdentityTokens(car);

  const title =
    normalizeSearchText(
      candidate?.title
    );

  const source =
    normalizeSearchText(
      candidate?.source
    );

  if (!title) {
    return 0;
  }

  let score = 0;

  for (
    const token of tokenList(
      identity.brand
    )
  ) {
    if (title.includes(token)) {
      score += 8;
    }
  }

  for (
    const token of tokenList(
      identity.model
    )
  ) {
    if (title.includes(token)) {
      score += 15;
    }
  }

  for (
    const token of tokenList(
      identity.generation
    )
  ) {
    if (title.includes(token)) {
      score += 12;
    }
  }

  for (
    const token of tokenList(
      identity.year
    )
  ) {
    if (title.includes(token)) {
      score += 5;
    }
  }

  const badWords = [
    "logo",
    "icon",
    "interior",
    "dashboard",
    "engine",
    "truck",
    "bus",
    "motorcycle",
    "concept",
    "prototype",
    "sketch",
    "render"
  ];

  for (const word of badWords) {
    if (title.includes(word)) {
      score -= 100;
    }
  }

  if (source.includes("wikimedia")) {
    score += 1;
  }

  if (source.includes("wikipedia")) {
    score += 1;
  }

  return score;
}


function getImageCandidates(car) {
  const candidates = [];

  const possible = [
    car?.image,
    car?.imageUrl,
    car?.photo,
    car?.photoUrl
  ];

  for (const item of possible) {
    const normalized =
      normalizeImageCandidate(item);

    if (normalized) {
      candidates.push(normalized);
    }
  }

  const arrays = [
    car?.images,
    car?.imageCandidates,
    car?.photos
  ];

  for (const array of arrays) {
    if (!Array.isArray(array)) {
      continue;
    }

    for (const item of array) {
      const normalized =
        normalizeImageCandidate(item);

      if (normalized) {
        candidates.push(normalized);
      }
    }
  }

  const unique = [];
  const seen = new Set();

  for (const candidate of candidates) {
    if (seen.has(candidate.url)) {
      continue;
    }

    seen.add(candidate.url);
    unique.push(candidate);
  }

  return unique;
}


function chooseBestImage(car) {
  const candidates =
    getImageCandidates(car);

  if (!candidates.length) {
    return null;
  }

  const scored =
    candidates.map(
      (candidate, index) => ({
        candidate,

        score:
          scoreImageCandidate(
            candidate,
            car
          ),

        index
      })
    );

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    return a.index - b.index;
  });

  const best = scored[0];

  const hasMetadata =
    candidates.some(
      candidate =>
        Boolean(candidate.title)
    );

  if (
    hasMetadata &&
    best.score <= 0
  ) {
    return null;
  }

  return best.candidate;
}


function createImage(car) {
  const best =
    chooseBestImage(car);

  if (!best) {
    return `
      <div class="car-image no-image">
        Fotografia presného modelu nie je dostupná
      </div>
    `;
  }

  const brand =
    safeDisplayText(
      car?.brand,
      ""
    );

  const model =
    safeDisplayText(
      car?.model ||
      car?.name ||
      car?.title,
      "Vozidlo"
    );

  const altText =
    `${brand} ${model}`.trim();

  return `
    <div class="car-image">

      <img
        src="${escapeAttribute(best.url)}"
        alt="${escapeAttribute(altText)}"
        loading="lazy"
        referrerpolicy="no-referrer"
        onerror="this.parentElement.classList.add('image-error'); this.style.display='none';"
      >

    </div>
  `;
}


// ============================================================
// CAR
// ============================================================

function getCarName(car) {
  const brand =
    safeDisplayText(
      car?.brand,
      ""
    );

  const model =
    safeDisplayText(
      car?.model ||
      car?.name ||
      car?.title,
      ""
    );

  if (brand && model) {
    const normalizedBrand =
      normalizeSearchText(brand);

    const normalizedModel =
      normalizeSearchText(model);

    if (
      normalizedModel.startsWith(
        normalizedBrand + " "
      )
    ) {
      return model;
    }

    return `${brand} ${model}`;
  }

  return (
    model ||
    brand ||
    "Neznáme vozidlo"
  );
}


function createCard(car, index) {
  const name =
    getCarName(car);

  const generation =
    safeDisplayText(
      car?.generation ||
      car?.modelYear ||
      car?.year,
      ""
    );

  const description =
    safeDisplayText(
      car?.description,
      ""
    );

  const price =
    formatPrice(
      car?.price ||
      car?.priceText ||
      car?.officialPrice
    );

  const power =
    formatPower(car);

  const trunk =
    formatTrunk(
      car?.trunkLitres ??
      car?.trunk ||
      car?.trunkLiters ||
      car?.boot
    );

  const drive =
    safeDisplayText(
      car?.drive ||
      car?.drivetrain,
      ""
    );

  const fuel =
    safeDisplayText(
      car?.fuel ||
      car?.fuelType,
      ""
    );

  const seats =
    numericValue(car?.seats);

  const score =
    safeDisplayText(
      car?.score ||
      car?.matchScore,
      ""
    );

  const pros =
    Array.isArray(car?.pros)
      ? car.pros
      : [];

  const cons =
    Array.isArray(car?.cons)
      ? car.cons
      : [];

  const configurator =
    safeHTTPSUrl(
      car?.officialConfigurator ||
      car?.configurator ||
      car?.officialConfiguratorUrl
    );

  const sourceUrl =
    safeHTTPSUrl(
      car?.source ||
      car?.sourceUrl ||
      car?.officialSourceUrl
    );

  return `
    <article class="car">

      ${createImage(car)}

      <div class="car-body">

        <div class="rank">
          #${index + 1}
        </div>

        <h2 class="car-name">
          ${escapeHTML(name)}
        </h2>

        ${
          generation
            ? `
              <div class="generation">
                ${escapeHTML(generation)}
              </div>
            `
            : ""
        }

        ${
          score
            ? `
              <div class="score">
                Zhoda:
                ${escapeHTML(score)}
              </div>
            `
            : ""
        }

        <div class="specs">

          <div>
            <strong>Cena:</strong>
            ${escapeHTML(price)}
          </div>

          ${
            power
              ? `
                <div>
                  <strong>Výkon:</strong>
                  ${escapeHTML(power)}
                </div>
              `
              : ""
          }

          ${
            trunk
              ? `
                <div>
                  <strong>Kufor:</strong>
                  ${escapeHTML(trunk)}
                </div>
              `
              : ""
          }

          ${
            seats !== null
              ? `
                <div>
                  <strong>Miesta:</strong>
                  ${escapeHTML(
                    formatNumber(seats)
                  )}
                </div>
              `
              : ""
          }

          ${
            drive
              ? `
                <div>
                  <strong>Pohon:</strong>
                  ${escapeHTML(drive)}
                </div>
              `
              : ""
          }

          ${
            fuel
              ? `
                <div>
                  <strong>Palivo:</strong>
                  ${escapeHTML(fuel)}
                </div>
              `
              : ""
          }

        </div>

        ${
          description
            ? `
              <div class="section">

                <h3>Popis</h3>

                <p>
                  ${formatText(description)}
                </p>

              </div>
            `
            : ""
        }

        ${
          pros.length
            ? `
              <div class="section pros">

                <h3>Výhody</h3>

                <ul>
                  ${pros
                    .map(
                      item => `
                        <li>
                          ${escapeHTML(
                            safeDisplayText(item)
                          )}
                        </li>
                      `
                    )
                    .join("")}
                </ul>

              </div>
            `
            : ""
        }

        ${
          cons.length
            ? `
              <div class="section cons">

                <h3>Nevýhody</h3>

                <ul>
                  ${cons
                    .map(
                      item => `
                        <li>
                          ${escapeHTML(
                            safeDisplayText(item)
                          )}
                        </li>
                      `
                    )
                    .join("")}
                </ul>

              </div>
            `
            : ""
        }

        ${
          configurator
            ? `
              <div class="configure">

                <a
                  href="${escapeAttribute(configurator)}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Oficiálny konfigurátor
                </a>

              </div>
            `
            : ""
        }

        ${
          sourceUrl
            ? `
              <div class="market-info">

                <a
                  class="source-link"
                  href="${escapeAttribute(sourceUrl)}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Zdroj informácií
                </a>

              </div>
            `
            : ""
        }

      </div>

    </article>
  `;
}


// ============================================================
// RESULTS
// ============================================================

function renderResults(cars) {
  const results = $("results");

  if (!results) {
    return;
  }

  if (
    !Array.isArray(cars) ||
    cars.length !== 3
  ) {
    results.innerHTML = "";

    setStatus(
      "Server nevrátil presne 3 vozidlá.",
      "error"
    );

    return;
  }

  results.innerHTML =
    cars
      .slice(0, 3)
      .map(
        (car, index) =>
          createCard(
            car,
            index
          )
      )
      .join("");
}


// ============================================================
// ERROR
// ============================================================

function getErrorMessage(
  error,
  responseData
) {
  const serverMessage =
    safeDisplayText(
      responseData?.message ||
      responseData?.error ||
      responseData?.details,
      ""
    );

  if (serverMessage) {
    return serverMessage;
  }

  if (
    error?.code ===
    "SEARCH_TIMEOUT"
  ) {
    return (
      "Vyhľadávanie trvá príliš dlho. " +
      "Server neodpovedal do 70 sekúnd."
    );
  }

  if (
    error?.code ===
    "FETCH_FAILED"
  ) {
    return (
      "Server sa nepodarilo kontaktovať. " +
      "Vyhľadávanie nebolo úspešne dokončené."
    );
  }

  const message =
    safeDisplayText(
      error?.message,
      ""
    );

  if (
    message
      .toLowerCase()
      .includes("failed to fetch")
  ) {
    return (
      "Server sa nepodarilo kontaktovať. " +
      "Vyhľadávanie nebolo úspešne dokončené."
    );
  }

  return (
    message ||
    "Vyhľadávanie sa nepodarilo dokončiť."
  );
}


// ============================================================
// SOUND + VIBRATION
// ============================================================

function notifySearchFinished() {
  try {
    if (
      navigator.vibrate &&
      typeof navigator.vibrate ===
        "function"
    ) {
      navigator.vibrate([
        80,
        60,
        120
      ]);
    }
  } catch {
    // Ignore.
  }

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

    oscillator.frequency.value =
      660;

    oscillator.type =
      "sine";

    gain.gain.setValueAtTime(
      0.0001,
      context.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      0.05,
      context.currentTime + 0.01
    );

    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      context.currentTime + 0.18
    );

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start();

    oscillator.stop(
      context.currentTime + 0.2
    );

  } catch {
    // Ignore.
  }
}


// ============================================================
// API
// ============================================================

async function performSearch(payload) {
  const token =
    await getAccessToken();

  const headers = {
    "Content-Type":
      "application/json"
  };

  if (token) {
    headers.Authorization =
      `Bearer ${token}`;
  }

  const controller =
    new AbortController();

  const timeoutId =
    setTimeout(
      () => controller.abort(),
      70000
    );

  let response;

  try {
    response =
      await fetch(
        CONFIG.apiEndpoint ||
          "/api/search",
        {
          method: "POST",
          headers,

          body:
            JSON.stringify(payload),

          signal:
            controller.signal
        }
      );

  } catch (error) {
    clearTimeout(timeoutId);

    if (
      error?.name ===
      "AbortError"
    ) {
      const timeoutError =
        new Error(
          "Vyhľadávanie trvá príliš dlho."
        );

      timeoutError.code =
        "SEARCH_TIMEOUT";

      throw timeoutError;
    }

    const fetchError =
      new Error(
        "Server sa nepodarilo kontaktovať."
      );

    fetchError.code =
      "FETCH_FAILED";

    fetchError.originalError =
      error;

    throw fetchError;

  } finally {
    clearTimeout(timeoutId);
  }

  let data = null;

  const contentType =
    response.headers.get(
      "content-type"
    ) || "";

  if (
    contentType.includes(
      "application/json"
    )
  ) {
    try {
      data =
        await response.json();
    } catch {
      data = null;
    }
  } else {
    try {
      const text =
        await response.text();

      data =
        text
          ? { message: text }
          : null;

    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const error =
      new Error(
        safeDisplayText(
          data?.message ||
          data?.error ||
          data?.details,
          `Server error ${response.status}`
        )
      );

    error.status =
      response.status;

    error.responseData =
      data;

    throw error;
  }

  return data;
}


// ============================================================
// SEARCH
// ============================================================

async function findCars() {
  if (isSearching) {
    return;
  }

  const request =
    collectRequest();

  const hasNaturalLanguage =
    Boolean(request.request);

  const hasFilters =
    Object.values(
      request.filters
    ).some(Boolean);

  if (
    !hasNaturalLanguage &&
    !hasFilters
  ) {
    setStatus(
      "Najprv zadajte požiadavky na auto.",
      "error"
    );

    const input =
      $("aiRequest");

    if (input) {
      input.focus();
    }

    return;
  }

  isSearching = true;

  setButtonBusy(true);

  setStatus(
    "Pripravujem vyhľadávanie...",
    "loading"
  );

  const results =
    $("results");

  if (results) {
    results.innerHTML = "";
  }

  try {

    // ========================================================
    // AUTH RETRY
    // ========================================================

    if (!currentSession) {
      setStatus(
        "Pripájam CARMATCH AI...",
        "loading"
      );

      try {
        await initializeAnonymousUser();

      } catch (authError) {
        console.error(
          "Authentication failed:",
          authError
        );

        throw new Error(
          "Nepodarilo sa pripojiť k CARMATCH AI. Skontrolujte anonymné prihlásenie v Supabase."
        );
      }
    }

    setStatus(
      "Vyhľadávanie prebieha...",
      "loading"
    );

    const data =
      await performSearch(
        request
      );

    const cars =
      normalizeCars(data);

    if (cars.length !== 3) {
      const error =
        new Error(
          "Server nevrátil presne 3 vozidlá."
        );

      error.responseData =
        data;

      throw error;
    }

    renderResults(cars);

    if (
      data &&
      data.remaining !==
        undefined
    ) {
      updateUsage(
        data.remaining
      );
    }

    setStatus(
      "Vyhľadávanie dokončené.",
      "success"
    );

    notifySearchFinished();

  } catch (error) {
    console.error(
      "CARMATCH AI search error:",
      error
    );

    const message =
      getErrorMessage(
        error,
        error?.responseData
      );

    setStatus(
      message,
      "error"
    );

    if (results) {
      results.innerHTML = "";
    }

  } finally {
    isSearching = false;

    setButtonBusy(false);

    // Bez ohľadu na stav Supabase
    // musí byť tlačidlo po skončení
    // použiteľné.
    enableSearchButton();
  }
}


// ============================================================
// EVENTS
// ============================================================

function setupEvents() {
  const button =
    $("searchButton");

  if (button) {
    button.addEventListener(
      "click",
      findCars
    );

    // KRITICKÉ:
    // nikdy ho nezablokujeme kvôli Supabase.
    enableSearchButton();
  }

  const themeButton =
    $("themeToggle");

  if (themeButton) {
    themeButton.addEventListener(
      "click",
      toggleTheme
    );
  }

  const textarea =
    $("aiRequest");

  if (textarea) {
    textarea.addEventListener(
      "keydown",
      event => {
        if (
          event.key === "Enter" &&
          (
            event.ctrlKey ||
            event.metaKey
          )
        ) {
          event.preventDefault();
          findCars();
        }
      }
    );
  }
}


// ============================================================
// START
// ============================================================

function startCarmatch() {
  // ==========================================================
  // KRITICKÉ:
  // UI sa inicializuje OKAMŽITE.
  // Nečakáme na Supabase.
  // ==========================================================

  updateUsage(5);

  enableSearchButton();

  setStatus(
    "CARMATCH AI je pripravený.",
    "success"
  );

  // Supabase sa pripája na pozadí.
  startBackgroundAuthentication();
}


// ============================================================
// GLOBAL
// ============================================================

window.findCars =
  findCars;


// ============================================================
// BOOT
// ============================================================

function bootCarmatch() {
  try {
    initializeTheme();

    setupEvents();

    startCarmatch();

    console.log(
      "CARMATCH AI frontend v13 loaded successfully."
    );

  } catch (error) {
    console.error(
      "CARMATCH AI boot error:",
      error
    );

    // Aj pri chybe bootovania
    // sa pokúsime odblokovať tlačidlo.
    enableSearchButton();

    setStatus(
      "CARMATCH AI sa nepodarilo načítať. Skúste obnoviť stránku.",
      "error"
    );
  }
}


if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    bootCarmatch,
    {
      once: true
    }
  );
} else {
  bootCarmatch();
}