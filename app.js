// ============================================================
// CARMATCH AI - FINAL FRONTEND v7
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

function $(id) {
  return document.getElementById(id);
}

function numberValue(id) {
  const element = $(id);
  if (!element) return 0;

  const value = Number(element.value);
  return Number.isFinite(value) ? value : 0;
}

function stringValue(id) {
  const element = $(id);
  return element ? String(element.value || "").trim() : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizePrice(value) {
  if (value === null || value === undefined) {
    return "Cena na vyžiadanie";
  }

  const text = String(value).trim();

  if (!text) {
    return "Cena na vyžiadanie";
  }

  return text;
}

function normalizePower(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

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

    if (element && String(element.value || "").trim()) {
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
    naturalLanguage: getSearchInput(),
    filters: buildFilters()
  };
}

async function initializeSupabase() {
  if (
    typeof window.supabase === "undefined" ||
    typeof window.supabase.createClient !== "function"
  ) {
    console.error("Supabase library is not loaded.");
    return false;
  }

  if (
    !CARMATCH_CONFIG.supabaseUrl ||
    CARMATCH_CONFIG.supabaseUrl.includes("PASTE_YOUR") ||
    !CARMATCH_CONFIG.supabaseAnonKey ||
    CARMATCH_CONFIG.supabaseAnonKey.includes("PASTE_YOUR")
  ) {
    console.error("Supabase configuration is missing.");
    return false;
  }

  supabaseClient = window.supabase.createClient(
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
      button.textContent = "Hľadám...";
    } else if (button.dataset.originalText) {
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

function showStatus(message, type = "info") {
  const container = getStatusContainer();

  if (!container) {
    return;
  }

  container.textContent = message;
  container.dataset.type = type;
  container.hidden = !message;
}

function clearStatus() {
  const container = getStatusContainer();

  if (!container) {
    return;
  }

  container.textContent = "";
  container.hidden = true;
}

function showResultsHtml(html) {
  const container = getResultsContainer();

  if (!container) {
    return;
  }

  container.innerHTML = html;
  container.hidden = false;
}

function clearResults() {
  const container = getResultsContainer();

  if (!container) {
    return;
  }

  container.innerHTML = "";
}

function formatRemaining(remaining) {
  const value = Number(remaining);

  if (!Number.isFinite(value)) {
    return "";
  }

  return `Zostávajúce vyhľadávania dnes: ${Math.max(
    0,
    Math.floor(value)
  )}/5`;
}

function renderStars(score) {
  const numericScore = Number(score);

  if (!Number.isFinite(numericScore)) {
    return "";
  }

  const rounded =
    Math.max(0, Math.min(100, numericScore));

  return `
    <span class="car-score">
      ${Math.round(rounded)} % zhoda
    </span>
  `;
}

function renderList(items, emptyText = "") {
  if (!Array.isArray(items) || items.length === 0) {
    return emptyText
      ? `<p class="empty-list">${escapeHtml(emptyText)}</p>`
      : "";
  }

  return `
    <ul>
      ${items
        .slice(0, 8)
        .map(
          item =>
            `<li>${escapeHtml(item)}</li>`
        )
        .join("")}
    </ul>
  `;
}

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

function renderCarCard(car, index) {
  const image = getCarImage(car);
  const price = normalizePrice(car.price);
  const power = normalizePower(car.power);

  const imageHtml = image
    ? `
      <div class="car-image">
        <img
          src="${escapeHtml(image)}"
          alt="${escapeHtml(car.name || "Auto")}"
          loading="lazy"
          referrerpolicy="no-referrer"
          onerror="this.closest('.car-image').classList.add('image-error')"
        >
      </div>
    `
    : `
      <div class="car-image image-placeholder">
        <span>Fotografia nie je dostupná</span>
      </div>
    `;

  const sourceHtml =
    car.priceSource &&
    /^https:\/\//i.test(String(car.priceSource))
      ? `
        <a
          class="source-link"
          href="${escapeHtml(car.priceSource)}"
          target="_blank"
          rel="noopener noreferrer"
        >
          Oficiálny zdroj ceny
        </a>
      `
      : "";

  const configuratorHtml =
    car.configurator &&
    /^https:\/\//i.test(String(car.configurator))
      ? `
        <a
          class="source-link"
          href="${escapeHtml(car.configurator)}"
          target="_blank"
          rel="noopener noreferrer"
        >
          Oficiálny konfigurátor
        </a>
      `
      : "";

  return `
    <article class="car-card">
      <div class="car-rank">${index + 1}</div>

      ${imageHtml}

      <div class="car-content">
        <div class="car-heading">
          <div>
            <h3>${escapeHtml(car.name || "Neznáme vozidlo")}</h3>
            ${
              car.generation
                ? `<div class="car-generation">${escapeHtml(
                    car.generation
                  )}</div>`
                : ""
            }
          </div>

          ${renderStars(car.score)}
        </div>

        <div class="car-price">
          ${escapeHtml(price)}
        </div>

        <div class="car-specs">
          ${
            power
              ? `<span><b>Výkon:</b> ${escapeHtml(power)}</span>`
              : ""
          }

          ${
            car.trunk !== undefined &&
            car.trunk !== null &&
            String(car.trunk).trim()
              ? `<span><b>Kufor:</b> ${escapeHtml(
                  car.trunk
                )}</span>`
              : ""
          }

          ${
            car.seats
              ? `<span><b>Miesta:</b> ${escapeHtml(
                  car.seats
                )}</span>`
              : ""
          }

          ${
            car.drive
              ? `<span><b>Pohon:</b> ${escapeHtml(
                  car.drive
                )}</span>`
              : ""
          }

          ${
            car.fuel
              ? `<span><b>Pohon:</b> ${escapeHtml(
                  car.fuel
                )}</span>`
              : ""
          }

          ${
            car.year
              ? `<span><b>Rok:</b> ${escapeHtml(
                  car.year
                )}</span>`
              : ""
          }
        </div>

        ${
          car.reason
            ? `
              <div class="car-reason">
                <h4>Prečo toto auto?</h4>
                <p>${escapeHtml(car.reason)}</p>
              </div>
            `
            : ""
        }

        <div class="car-columns">
          <div>
            <h4>Výhody</h4>
            ${renderList(car.pros)}
          </div>

          <div>
            <h4>Nevýhody</h4>
            ${renderList(car.cons)}
          </div>
        </div>

        ${
          car.maintenance
            ? `
              <div class="maintenance">
                <h4>Údržba</h4>
                <p>${escapeHtml(
                  car.maintenance
                )}</p>
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

function renderCars(cars) {
  if (!Array.isArray(cars) || cars.length === 0) {
    showResultsHtml(`
      <div class="empty-results">
        Nenašli sa žiadne vhodné vozidlá.
      </div>
    `);
    return;
  }

  showResultsHtml(`
    <div class="results-header">
      <h2>Výsledky CARMATCH AI</h2>
    </div>

    <div class="cars-list">
      ${cars
        .slice(0, 3)
        .map(renderCarCard)
        .join("")}
    </div>
  `);
}

function playReadySound() {
  try {
    const AudioContext =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContext) {
      return;
    }

    const context = new AudioContext();

    const oscillator =
      context.createOscillator();

    const gain =
      context.createGain();

    oscillator.type = "sine";
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
    gain.connect(context.destination);

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
      typeof navigator.vibrate === "function"
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

function parseErrorMessage(data, status) {
  if (data && typeof data.message === "string") {
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

async function parseResponse(response) {
  const text = await response.text();

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

async function performSearch() {
  if (isSearching) {
    return;
  }

  const request = buildRequest();

  if (!request.naturalLanguage) {
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

    const response = await fetch(
      API_ENDPOINT,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(request)
      }
    );

    const data =
      await parseResponse(response);

    if (response.status === 401) {
      currentSession = null;

      const initialized =
        await initializeSupabase();

      if (initialized) {
        const newToken =
          await getAccessToken();

        if (newToken && newToken !== token) {
          const retry =
            await fetch(
              API_ENDPOINT,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${newToken}`
                },
                body: JSON.stringify(request)
              }
            );

          const retryData =
            await parseResponse(retry);

          if (retry.ok) {
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

    if (!response.ok) {
      throw new Error(
        parseErrorMessage(
          data,
          response.status
        )
      );
    }

    if (
      !Array.isArray(data.cars) ||
      data.cars.length !== 3
    ) {
      throw new Error(
        "Backend nevrátil presne 3 vozidlá."
      );
    }

    renderCars(data.cars);

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
    setLoadingState(false);
  }
}

function attachSearchEvents() {
  const buttonIds = [
    "searchButton",
    "findButton",
    "submitButton"
  ];

  for (const id of buttonIds) {
    const button = $(id);

    if (!button) continue;

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

  for (const id of searchInputIds) {
    const input = $(id);

    if (!input) continue;

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