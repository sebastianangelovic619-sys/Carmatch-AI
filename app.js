// ============================================================
// CARMATCH AI - FINAL FRONTEND v10
// ============================================================
// - Exactly 3 cars
// - Supabase anonymous authentication
// - 5 searches/day
// - Search refund support
// - Robust API error handling
// - No [object Object]
// - Slovak UI
// - Image candidates
// - Vibration + sound
// - aiRequest support
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
    const text = value.trim();
    return text || fallback;
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
        Object.prototype.hasOwnProperty.call(value, key)
      ) {
        const result = safeDisplayText(value[key], "");

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
// URL SAFETY
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
// FORMATTERS
// ============================================================

function formatPrice(value) {
  const text = safeDisplayText(value, "");

  if (!text) {
    return "Cena nie je dostupná";
  }

  if (
    text.toLowerCase().includes("na vyžiadanie") ||
    text.toLowerCase().includes("nie je dostupná")
  ) {
    return text;
  }

  return text;
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

  status.textContent = safeDisplayText(message);
}


// ============================================================
// BUTTON
// ============================================================

function setButtonBusy(busy) {
  const button = $("searchButton");

  if (!button) {
    return;
  }

  button.disabled = busy || !currentSession;

  if (busy) {
    button.dataset.originalText =
      button.textContent || "Nájsť auto";

    button.textContent = "Vyhľadávam...";
  } else {
    button.textContent =
      button.dataset.originalText || "Nájsť auto";
  }
}


// ============================================================
// USAGE
// ============================================================

function updateUsage(remaining) {
  const usageText = $("usageText");
  const usageDot = $("usageDot");

  if (!usageText) {
    return;
  }

  let value = Number(remaining);

  if (!Number.isFinite(value)) {
    value = 5;
  }

  value = Math.max(0, Math.min(5, value));

  usageText.textContent =
    `${value} / 5 vyhľadávaní dnes`;

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
// SUPABASE
// ============================================================

async function waitForSupabase() {
  const maxAttempts = 100;

  for (let i = 0; i < maxAttempts; i++) {
    if (
      window.supabase &&
      typeof window.supabase.createClient === "function"
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
  if (
    !CONFIG.supabaseUrl ||
    !CONFIG.supabaseAnonKey
  ) {
    throw new Error(
      "Supabase konfigurácia nie je nastavená."
    );
  }

  const available = await waitForSupabase();

  if (!available) {
    throw new Error(
      "Supabase sa nepodarilo načítať."
    );
  }

  if (!supabaseClient) {
    supabaseClient =
      window.supabase.createClient(
        CONFIG.supabaseUrl,
        CONFIG.supabaseAnonKey
      );
  }

  return supabaseClient;
}


// ============================================================
// ANONYMOUS AUTH
// ============================================================

async function initializeAnonymousUser() {
  const client = await initializeSupabase();

  const sessionResult =
    await client.auth.getSession();

  if (
    sessionResult &&
    sessionResult.data &&
    sessionResult.data.session
  ) {
    currentSession =
      sessionResult.data.session;

    return currentSession;
  }

  const authResult =
    await client.auth.signInAnonymously();

  if (authResult.error) {
    throw authResult.error;
  }

  currentSession =
    authResult.data?.session || null;

  if (!currentSession) {
    throw new Error(
      "Nepodarilo sa vytvoriť anonymnú reláciu."
    );
  }

  return currentSession;
}


// ============================================================
// TOKEN
// ============================================================

async function getAccessToken() {
  if (!supabaseClient) {
    return "";
  }

  const result =
    await supabaseClient.auth.getSession();

  if (result.error) {
    return "";
  }

  return (
    result.data?.session?.access_token || ""
  );
}


// ============================================================
// REQUEST DATA
// ============================================================

function value(id) {
  const element = $(id);

  if (!element) {
    return "";
  }

  return safeDisplayText(element.value, "");
}


function getNaturalLanguage() {
  return value("aiRequest");
}


function collectRequest() {
  return {
    request: getNaturalLanguage(),

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
      avoid: value("avoid")
    }
  };
}


// ============================================================
// RESPONSE NORMALIZATION
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
// IMAGE HELPERS
// ============================================================

function getImageCandidates(car) {
  const candidates = [];

  const possible = [
    car?.image,
    car?.imageUrl,
    car?.photo,
    car?.photoUrl
  ];

  for (const item of possible) {
    const url = safeHTTPSUrl(item);

    if (url) {
      candidates.push(url);
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
      const url = safeHTTPSUrl(
        typeof item === "string"
          ? item
          : item?.url || item?.image
      );

      if (url) {
        candidates.push(url);
      }
    }
  }

  return [...new Set(candidates)];
}


function createImage(car) {
  const images =
    getImageCandidates(car);

  if (!images.length) {
    return `
      <div class="car-image no-image">
        Fotografia nie je dostupná
      </div>
    `;
  }

  const first =
    escapeAttribute(images[0]);

  return `
    <div class="car-image">
      <img
        src="${first}"
        alt="${escapeAttribute(
          safeDisplayText(
            car?.name,
            "Vozidlo"
          )
        )}"
        loading="lazy"
        referrerpolicy="no-referrer"
        onerror="this.parentElement.classList.add('image-error'); this.style.display='none';"
      >
    </div>
  `;
}


// ============================================================
// CAR CARD
// ============================================================

function createCard(car, index) {
  const name =
    safeDisplayText(
      car?.name ||
      car?.model ||
      car?.title,
      "Neznáme vozidlo"
    );

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
    safeDisplayText(
      car?.power ||
      car?.powerKw ||
      car?.kw,
      ""
    );

  const trunk =
    safeDisplayText(
      car?.trunk ||
      car?.trunkLiters ||
      car?.boot,
      ""
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

  const officialPriceUrl =
    safeHTTPSUrl(
      car?.officialPriceUrl ||
      car?.priceSource
    );

  const sourceUrl =
    safeHTTPSUrl(
      car?.source ||
      car?.sourceUrl
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
            ? `<div class="generation">
                ${escapeHTML(generation)}
              </div>`
            : ""
        }

        ${
          score
            ? `<div class="score">
                Zhoda: ${escapeHTML(score)}
              </div>`
            : ""
        }

        <div class="specs">

          ${
            price
              ? `<div>
                  <strong>Cena:</strong>
                  ${escapeHTML(price)}
                </div>`
              : ""
          }

          ${
            power
              ? `<div>
                  <strong>Výkon:</strong>
                  ${escapeHTML(power)}
                </div>`
              : ""
          }

          ${
            trunk
              ? `<div>
                  <strong>Kufor:</strong>
                  ${escapeHTML(trunk)}
                </div>`
              : ""
          }

          ${
            drive
              ? `<div>
                  <strong>Pohon:</strong>
                  ${escapeHTML(drive)}
                </div>`
              : ""
          }

          ${
            fuel
              ? `<div>
                  <strong>Palivo:</strong>
                  ${escapeHTML(fuel)}
                </div>`
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
                      item =>
                        `<li>${escapeHTML(
                          safeDisplayText(item)
                        )}</li>`
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
                      item =>
                        `<li>${escapeHTML(
                          safeDisplayText(item)
                        )}</li>`
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
                  href="${escapeAttribute(
                    configurator
                  )}"
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
          officialPriceUrl
            ? `
              <div class="market-info">
                <a
                  class="source-link"
                  href="${escapeAttribute(
                    officialPriceUrl
                  )}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Zdroj ceny
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
                  href="${escapeAttribute(
                    sourceUrl
                  )}"
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

  if (!Array.isArray(cars) || cars.length !== 3) {
    results.innerHTML = "";

    setStatus(
      "Nepodarilo sa získať presne 3 vhodné vozidlá.",
      "error"
    );

    return;
  }

  results.innerHTML = cars
    .slice(0, 3)
    .map((car, index) =>
      createCard(car, index)
    )
    .join("");
}


// ============================================================
// ERROR
// ============================================================

function getErrorMessage(error, responseData) {
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

  const errorMessage =
    safeDisplayText(
      error?.message,
      ""
    );

  if (
    errorMessage
      .toLowerCase()
      .includes("failed to fetch")
  ) {
    return (
      "Server sa nepodarilo kontaktovať. " +
      "Vyhľadávanie nebolo úspešne dokončené."
    );
  }

  return (
    errorMessage ||
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
      typeof navigator.vibrate === "function"
    ) {
      navigator.vibrate([
        80,
        60,
        120
      ]);
    }
  } catch {
    // ignore
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

    oscillator.frequency.value = 660;
    oscillator.type = "sine";

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
    // Audio may be blocked by browser.
  }
}


// ============================================================
// API REQUEST
// ============================================================

async function performSearch(payload) {
  const token =
    await getAccessToken();

  const headers = {
    "Content-Type": "application/json"
  };

  if (token) {
    headers.Authorization =
      `Bearer ${token}`;
  }

  const response =
    await fetch(
      CONFIG.apiEndpoint || "/api/search",
      {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      }
    );

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error =
      new Error(
        safeDisplayText(
          data?.message ||
          data?.error,
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
// MAIN SEARCH
// ============================================================

async function findCars() {
  if (isSearching) {
    return;
  }

  const request =
    collectRequest();

  if (
    !request.request &&
    !Object.values(request.filters)
      .some(Boolean)
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
    "Vyhľadávam vhodné vozidlá...",
    "loading"
  );

  const results =
    $("results");

  if (results) {
    results.innerHTML = "";
  }

  try {
    const data =
      await performSearch(request);

    const cars =
      normalizeCars(data);

    if (cars.length !== 3) {
      throw new Error(
        "Server nevrátil presne 3 vozidlá."
      );
    }

    renderResults(cars);

    if (
      data &&
      data.remaining !== undefined
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
  }
}


// ============================================================
// EVENT LISTENERS
// ============================================================

function setupEvents() {
  const button =
    $("searchButton");

  if (button) {
    button.addEventListener(
      "click",
      findCars
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
          (event.ctrlKey || event.metaKey)
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

async function startCarmatch() {
  try {

    setStatus(
      "Inicializujem CARMATCH AI...",
      "loading"
    );

    updateUsage(5);

    await initializeAnonymousUser();

    updateUsage(5);

    const button =
      $("searchButton");

    if (button) {
      button.disabled = false;
    }

    setStatus(
      "CARMATCH AI je pripravený.",
      "success"
    );

  } catch (error) {

    console.error(
      "CARMATCH initialization error:",
      error
    );

    const button =
      $("searchButton");

    if (button) {
      button.disabled = true;
    }

    setStatus(
      "CARMATCH AI sa nepodarilo inicializovať. Obnovte stránku.",
      "error"
    );
  }
}


// ============================================================
// GLOBAL
// ============================================================

window.findCars =
  findCars;


// ============================================================
// INIT
// ============================================================

document.addEventListener(
  "DOMContentLoaded",
  () => {

    setupEvents();

    startCarmatch();

  }
);