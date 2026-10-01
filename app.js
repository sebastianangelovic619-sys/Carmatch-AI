/* ============================================================
   CARMATCH AI — FRONTEND v15
   ============================================================
   - Supabase anonymous authentication
   - Correct naturalLanguage API payload
   - Bearer authentication
   - 5 searches/day
   - Search refund supported by backend
   - Robust fetch/error handling
   - Exactly 3 cars
   - Slovak UI
   - Image candidates
   - Vibration + sound
   - No dark mode
   - Premium UI
   ============================================================ */

"use strict";


/* ============================================================
   CONFIG
   ============================================================ */

const CONFIG = window.CARMATCH_CONFIG || {
  supabaseUrl: "",
  supabaseAnonKey: "",
  apiEndpoint: "/api/search"
};


/* ============================================================
   STATE
   ============================================================ */

let supabaseClient = null;
let currentSession = null;

let isSearching = false;
let supabaseInitialized = false;

let lastSearchRequest = null;


/* ============================================================
   DOM HELPERS
   ============================================================ */

function $(selector) {
  return document.querySelector(selector);
}

function byId(id) {
  return document.getElementById(id);
}

function value(id) {
  const element = byId(id);

  if (!element) {
    return "";
  }

  return String(element.value || "").trim();
}


/* ============================================================
   DOM ELEMENTS
   ============================================================ */

const searchButton =
  byId("searchButton");

const aiRequest =
  byId("aiRequest");

const statusElement =
  byId("status");

const usageText =
  byId("usageText");

const usageDot =
  byId("usageDot");

const resultsSection =
  byId("resultsSection");

const resultsContainer =
  byId("results");

const resultsCount =
  byId("resultsCount");

const helperText =
  byId("helperText");


/* ============================================================
   STATUS
   ============================================================ */

function setStatus(message, type = "") {

  if (!statusElement) {
    return;
  }

  statusElement.textContent =
    message || "";

  statusElement.className =
    "status";

  if (type) {
    statusElement.classList.add(type);
  }
}


/* ============================================================
   BUTTON
   ============================================================ */

function setButtonBusy(busy) {

  if (!searchButton) {
    return;
  }

  isSearching = Boolean(busy);

  searchButton.disabled =
    Boolean(busy);

  searchButton.classList.toggle(
    "is-loading",
    Boolean(busy)
  );
}


/* ============================================================
   USAGE
   ============================================================ */

function updateUsage(remaining) {

  if (!usageText) {
    return;
  }

  const number =
    Number(remaining);

  if (!Number.isFinite(number)) {
    usageText.textContent =
      "Denný limit vyhľadávania";
    return;
  }

  const safe =
    Math.max(
      0,
      Math.floor(number)
    );

  if (safe === 1) {

    usageText.textContent =
      "1 vyhľadávanie zostáva dnes";

  } else {

    usageText.textContent =
      `${safe} vyhľadávania zostávajú dnes`;

  }

  if (usageDot) {

    usageDot.style.background =
      safe === 0
        ? "#d33b3b"
        : safe <= 1
          ? "#e19a28"
          : "#15945b";

  }
}


/* ============================================================
   SUPABASE INITIALIZATION
   ============================================================ */

async function initializeSupabase() {

  if (supabaseInitialized) {
    return supabaseClient;
  }

  if (
    !CONFIG.supabaseUrl ||
    !CONFIG.supabaseAnonKey
  ) {

    console.error(
      "CARMATCH AI: Supabase configuration is missing."
    );

    return null;
  }


  /*
   * The CDN script is loaded with defer.
   * Wait briefly if window.supabase is not ready yet.
   */

  let attempts = 0;

  while (
    !window.supabase &&
    attempts < 100
  ) {

    await sleep(50);

    attempts++;

  }


  if (
    !window.supabase ||
    typeof window.supabase.createClient !== "function"
  ) {

    console.error(
      "CARMATCH AI: Supabase library could not be loaded."
    );

    return null;
  }


  try {

    supabaseClient =
      window.supabase.createClient(
        CONFIG.supabaseUrl,
        CONFIG.supabaseAnonKey,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false
          }
        }
      );

    supabaseInitialized = true;

    return supabaseClient;

  } catch (error) {

    console.error(
      "CARMATCH AI: Supabase initialization failed.",
      error
    );

    return null;
  }
}


/* ============================================================
   ANONYMOUS USER
   ============================================================ */

async function initializeAnonymousUser() {

  const client =
    await initializeSupabase();

  if (!client) {
    return null;
  }


  /*
   * First check whether a session already exists.
   */

  try {

    const {
      data,
      error
    } = await client.auth.getSession();

    if (!error && data?.session) {

      currentSession =
        data.session;

      return currentSession;
    }

  } catch (error) {

    console.warn(
      "CARMATCH AI: getSession failed.",
      error
    );

  }


  /*
   * No session.
   * Create an anonymous account.
   */

  try {

    const {
      data,
      error
    } = await client.auth.signInAnonymously();

    if (error) {

      console.error(
        "CARMATCH AI: anonymous sign-in failed.",
        error
      );

      return null;
    }

    currentSession =
      data?.session || null;

    return currentSession;

  } catch (error) {

    console.error(
      "CARMATCH AI: anonymous authentication error.",
      error
    );

    return null;
  }
}


/* ============================================================
   REFRESH SESSION
   ============================================================ */

async function refreshSession() {

  if (!supabaseClient) {
    return null;
  }

  try {

    const {
      data,
      error
    } = await supabaseClient.auth.refreshSession();

    if (error) {
      return null;
    }

    currentSession =
      data?.session || null;

    return currentSession;

  } catch (error) {

    console.warn(
      "CARMATCH AI: session refresh failed.",
      error
    );

    return null;
  }
}


/* ============================================================
   COLLECT REQUEST
   ============================================================ */

function collectRequest() {

  /*
   * IMPORTANT:
   * Backend expects "naturalLanguage".
   * The previous frontend used "request",
   * which could cause the search to fail.
   */

  const naturalLanguage =
    value("aiRequest");


  const filters = {

    budget:
      value("budget"),

    seats:
      value("seats"),

    power:
      value("power"),

    trunk:
      value("trunk"),

    drive:
      value("drive"),

    fuel:
      value("fuel"),

    body:
      value("body"),

    style:
      value("style"),

    length:
      value("length"),

    year:
      value("year"),

    avoid:
      value("avoidBrands") ||
      value("avoid")

  };


  return {
    naturalLanguage,
    filters
  };
}


/* ============================================================
   CHECK REQUEST
   ============================================================ */

function hasSearchCriteria(request) {

  if (!request) {
    return false;
  }

  if (
    request.naturalLanguage &&
    request.naturalLanguage.trim()
  ) {
    return true;
  }

  const filters =
    request.filters || {};

  return Object.values(filters)
    .some(
      item =>
        String(item || "").trim().length > 0
    );
}


/* ============================================================
   FETCH WITH TIMEOUT
   ============================================================ */

async function fetchWithTimeout(
  url,
  options = {},
  timeout = 70000
) {

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      timeout
    );


  try {

    return await fetch(
      url,
      {
        ...options,
        signal:
          controller.signal
      }
    );

  } finally {

    clearTimeout(timer);

  }
}


/* ============================================================
   PERFORM SEARCH
   ============================================================ */

async function performSearch(
  request,
  retryAfterRefresh = true
) {

  /*
   * Make sure Supabase exists.
   */

  const session =
    currentSession ||
    await initializeAnonymousUser();


  if (!session?.access_token) {

    throw new Error(
      "AUTH_REQUIRED"
    );
  }


  const endpoint =
    CONFIG.apiEndpoint ||
    "/api/search";


  let response;


  try {

    response =
      await fetchWithTimeout(
        endpoint,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "Accept":
              "application/json",

            "Authorization":
              `Bearer ${session.access_token}`
          },

          body:
            JSON.stringify(request)
        },
        70000
      );

  } catch (error) {

    if (
      error?.name ===
      "AbortError"
    ) {

      const timeoutError =
        new Error(
          "REQUEST_TIMEOUT"
        );

      timeoutError.code =
        "REQUEST_TIMEOUT";

      throw timeoutError;
    }


    const fetchError =
      new Error(
        "FETCH_FAILED"
      );

    fetchError.code =
      "FETCH_FAILED";

    fetchError.original =
      error;

    throw fetchError;
  }


  /*
   * 401:
   * Refresh the Supabase session once
   * and retry the request.
   */

  if (
    response.status === 401 &&
    retryAfterRefresh
  ) {

    const refreshed =
      await refreshSession();

    if (
      refreshed?.access_token
    ) {

      return performSearch(
        request,
        false
      );

    }
  }


  let data = null;

  const contentType =
    response.headers.get(
      "content-type"
    ) || "";


  try {

    if (
      contentType.includes(
        "application/json"
      )
    ) {

      data =
        await response.json();

    } else {

      const text =
        await response.text();

      data = {
        error:
          text || "Unknown server response"
      };

    }

  } catch (error) {

    throw new Error(
      "INVALID_SERVER_RESPONSE"
    );
  }


  if (!response.ok) {

    const serverError =
      new Error(
        data?.message ||
        data?.error ||
        `HTTP_${response.status}`
      );

    serverError.status =
      response.status;

    serverError.code =
      data?.code ||
      data?.errorCode ||
      `HTTP_${response.status}`;

    serverError.data =
      data;

    throw serverError;
  }


  return data;
}


/* ============================================================
   SAFE TEXT
   ============================================================ */

function safeText(value, fallback = "") {

  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  if (
    typeof value === "string" ||
    typeof value === "number"
  ) {

    const text =
      String(value).trim();

    return text ||
      fallback;
  }

  if (
    typeof value === "object"
  ) {

    if (
      typeof value.text ===
      "string"
    ) {
      return value.text;
    }

    if (
      typeof value.value ===
      "string"
    ) {
      return value.value;
    }

    if (
      typeof value.name ===
      "string"
    ) {
      return value.name;
    }

    return fallback;
  }

  return fallback;
}


/* ============================================================
   ARRAY NORMALIZER
   ============================================================ */

function normalizeArray(value) {

  if (Array.isArray(value)) {
    return value;
  }

  if (
    typeof value === "string" &&
    value.trim()
  ) {

    return [
      value.trim()
    ];

  }

  return [];
}


/* ============================================================
   CAR NORMALIZATION
   ============================================================ */

function normalizeCar(
  car,
  index
) {

  const item =
    car && typeof car === "object"
      ? car
      : {};


  const title =
    safeText(
      item.title ||
      item.name ||
      item.model ||
      item.vehicle,
      `Auto ${index + 1}`
    );


  const subtitle =
    safeText(
      item.subtitle ||
      item.variant ||
      item.generation ||
      item.trim,
      ""
    );


  const description =
    safeText(
      item.description ||
      item.summary ||
      item.reason,
      ""
    );


  const image =
    safeText(
      item.image ||
      item.photo ||
      item.photoUrl ||
      item.imageUrl,
      ""
    );


  const imageSource =
    safeText(
      item.imageSource ||
      item.photoSource,
      ""
    );


  const stats =
    item.stats &&
    typeof item.stats === "object"
      ? item.stats
      : {};


  const power =
    safeText(
      item.power ||
      item.powerKw ||
      item.kw ||
      stats.power,
      "—"
    );


  const price =
    safeText(
      item.price ||
      item.priceEUR ||
      item.priceEur ||
      stats.price,
      "Cena nie je dostupná"
    );


  const trunk =
    safeText(
      item.trunk ||
      item.trunkLitres ||
      item.trunkL ||
      stats.trunk,
      "—"
    );


  const seats =
    safeText(
      item.seats ||
      stats.seats,
      "—"
    );


  const drive =
    safeText(
      item.drive ||
      item.drivetrain ||
      stats.drive,
      "—"
    );


  const fuel =
    safeText(
      item.fuel ||
      stats.fuel,
      "—"
    );


  const year =
    safeText(
      item.year ||
      item.modelYear ||
      stats.year,
      "—"
    );


  const pros =
    normalizeArray(
      item.pros ||
      item.advantages ||
      item.strengths
    )
      .map(
        item =>
          safeText(item, "")
      )
      .filter(Boolean)
      .slice(0, 3);


  const cons =
    normalizeArray(
      item.cons ||
      item.disadvantages ||
      item.weaknesses
    )
      .map(
        item =>
          safeText(item, "")
      )
      .filter(Boolean)
      .slice(0, 3);


  const officialUrl =
    safeText(
      item.officialUrl ||
      item.configuratorUrl ||
      item.officialConfigurator ||
      item.url,
      ""
    );


  const maintenance =
    safeText(
      item.maintenance ||
      item.maintenanceInfo,
      ""
    );


  return {

    title,
    subtitle,
    description,

    image,
    imageSource,

    power,
    price,
    trunk,
    seats,
    drive,
    fuel,
    year,

    pros,
    cons,

    officialUrl,

    maintenance,

    index

  };
}


/* ============================================================
   IMAGE CANDIDATE EXTRACTION
   ============================================================ */

function getImageCandidates(car) {

  if (!car) {
    return [];
  }


  const candidates = [];


  const possibleValues = [

    car.image,

    car.photo,

    car.photoUrl,

    car.imageUrl,

    ...(Array.isArray(car.images)
      ? car.images
      : []),

    ...(Array.isArray(car.imageCandidates)
      ? car.imageCandidates
      : []),

    ...(Array.isArray(car.photos)
      ? car.photos
      : [])

  ];


  for (
    const candidate
    of possibleValues
  ) {

    const url =
      safeText(
        candidate,
        ""
      );

    if (
      !url ||
      !/^https?:\/\//i.test(url)
    ) {
      continue;
    }

    if (
      !candidates.includes(url)
    ) {

      candidates.push(url);

    }

  }


  return candidates
    .slice(0, 8);
}


/* ============================================================
   IMAGE ERROR FALLBACK
   ============================================================ */

function handleImageError(
  image
) {

  if (!image) {
    return;
  }


  const next =
    image.dataset.nextImage;

  if (next) {

    image.dataset.nextImage =
      "";

    image.src =
      next;

    return;
  }


  const wrapper =
    image.parentElement;

  if (!wrapper) {
    return;
  }


  image.remove();


  const placeholder =
    document.createElement(
      "div"
    );

  placeholder.className =
    "car-image-placeholder";

  placeholder.textContent =
    "Fotografia nie je dostupná";

  wrapper.appendChild(
    placeholder
  );
}


/* ============================================================
   ESCAPE HTML
   ============================================================ */

function escapeHtml(value) {

  return String(
    value ?? ""
  )
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* ============================================================
   SAFE URL
   ============================================================ */

function safeUrl(value) {

  const url =
    safeText(
      value,
      ""
    );

  if (
    !/^https?:\/\//i.test(url)
  ) {
    return "";
  }

  return url;
}


/* ============================================================
   CAR CARD
   ============================================================ */

function createCarCard(
  car,
  index
) {

  const imageCandidates =
    getImageCandidates(car);


  const firstImage =
    imageCandidates[0] || "";


  const secondImage =
    imageCandidates[1] || "";


  const title =
    escapeHtml(car.title);


  const subtitle =
    escapeHtml(car.subtitle);


  const description =
    escapeHtml(
      car.description
    );


  const imageHtml =
    firstImage
      ? `
        <img
          class="car-image"
          src="${escapeHtml(firstImage)}"
          ${secondImage
            ? `data-next-image="${escapeHtml(secondImage)}"`
            : ""}
          alt="${title}"
          loading="lazy"
          referrerpolicy="no-referrer"
        >
      `
      : `
        <div class="car-image-placeholder">
          Fotografia nie je dostupná
        </div>
      `;


  const prosHtml =
    car.pros
      .map(
        item => `
          <div class="car-point pro">
            <span class="car-point-icon">+</span>
            <span>${escapeHtml(item)}</span>
          </div>
        `
      )
      .join("");


  const consHtml =
    car.cons
      .map(
        item => `
          <div class="car-point con">
            <span class="car-point-icon">−</span>
            <span>${escapeHtml(item)}</span>
          </div>
        `
      )
      .join("");


  const officialUrl =
    safeUrl(
      car.officialUrl
    );


  const officialButton =
    officialUrl
      ? `
        <a
          class="car-link primary"
          href="${escapeHtml(officialUrl)}"
          target="_blank"
          rel="noopener noreferrer"
        >
          Oficiálna stránka
        </a>
      `
      : `
        <span class="car-link">
          Oficiálny odkaz nie je dostupný
        </span>
      `;


  return `
    <article class="car-card">

      <div class="car-image-wrap">

        ${imageHtml}

        <div class="car-rank">
          ${index + 1}. ODPORÚČANIE
        </div>

      </div>


      <div class="car-body">

        <h3 class="car-title">
          ${title}
        </h3>

        ${
          subtitle
            ? `
              <div class="car-subtitle">
                ${subtitle}
              </div>
            `
            : ""
        }


        ${
          description
            ? `
              <p class="car-description">
                ${description}
              </p>
            `
            : ""
        }


        <div class="car-stats">

          <div class="car-stat">
            <span class="car-stat-label">
              Výkon
            </span>

            <span class="car-stat-value">
              ${escapeHtml(car.power)}
            </span>
          </div>


          <div class="car-stat">
            <span class="car-stat-label">
              Cena
            </span>

            <span class="car-stat-value">
              ${escapeHtml(car.price)}
            </span>
          </div>


          <div class="car-stat">
            <span class="car-stat-label">
              Kufor
            </span>

            <span class="car-stat-value">
              ${escapeHtml(car.trunk)}
            </span>
          </div>


          <div class="car-stat">
            <span class="car-stat-label">
              Pohon
            </span>

            <span class="car-stat-value">
              ${escapeHtml(car.drive)}
            </span>
          </div>

        </div>


        ${
          prosHtml || consHtml
            ? `
              <div class="car-points">
                ${prosHtml}
                ${consHtml}
              </div>
            `
            : ""
        }


        ${
          car.maintenance
            ? `
              <div class="car-description">
                <strong>Údržba:</strong>
                ${escapeHtml(car.maintenance)}
              </div>
            `
            : ""
        }


        <div class="car-actions">

          ${officialButton}

          ${
            car.imageSource
              ? `
                <a
                  class="car-link"
                  href="${escapeHtml(
                    safeUrl(car.imageSource)
                  )}"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Zdroj fotografie
                </a>
              `
              : `
                <span class="car-link">
                  Zdroj fotografie
                </span>
              `
          }

        </div>

      </div>

    </article>
  `;
}


/* ============================================================
   RENDER RESULTS
   ============================================================ */

function renderResults(
  cars
) {

  if (!resultsContainer) {
    return;
  }


  resultsContainer.innerHTML =
    "";


  const normalizedCars =
    Array.isArray(cars)
      ? cars
          .slice(0, 3)
          .map(
            (car, index) =>
              normalizeCar(
                car,
                index
              )
          )
      : [];


  if (
    normalizedCars.length !== 3
  ) {

    resultsContainer.innerHTML = `
      <div class="empty-results">
        CARMATCH AI nedostal kompletné 3 odporúčania.
        Skús vyhľadávanie zopakovať.
      </div>
    `;

  } else {

    resultsContainer.innerHTML =
      normalizedCars
        .map(
          (car, index) =>
            createCarCard(
              car,
              index
            )
        )
        .join("");

  }


  /*
   * Important:
   * The HTML starts with resultsSection hidden.
   * We explicitly show it after rendering.
   */

  if (resultsSection) {

    resultsSection.hidden =
      false;

    resultsSection.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

  }


  if (resultsCount) {

    resultsCount.textContent =
      normalizedCars.length === 3
        ? "3 autá"
        : `${normalizedCars.length} autá`;

  }


  /*
   * Image fallback handling.
   */

  resultsContainer
    .querySelectorAll(
      "img.car-image"
    )
    .forEach(
      image => {

        image.addEventListener(
          "error",
          () => {
            handleImageError(
              image
            );
          },
          {
            once: true
          }
        );

      }
    );
}


/* ============================================================
   CLEAR RESULTS
   ============================================================ */

function clearResults() {

  if (resultsContainer) {
    resultsContainer.innerHTML =
      "";
  }

  if (resultsSection) {
    resultsSection.hidden =
      true;
  }

}


/* ============================================================
   SUCCESS FEEDBACK
   ============================================================ */

function successFeedback() {

  /*
   * Vibration
   */

  try {

    if (
      "vibrate" in navigator
    ) {

      navigator.vibrate(
        [40, 45, 70]
      );

    }

  } catch (_) {}


  /*
   * Small confirmation sound.
   * Generated locally — no external file.
   */

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
      620,
      context.currentTime
    );

    oscillator.frequency.exponentialRampToValueAtTime(
      880,
      context.currentTime + 0.12
    );


    gain.gain.setValueAtTime(
      0.0001,
      context.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      0.045,
      context.currentTime + 0.015
    );

    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      context.currentTime + 0.18
    );


    oscillator.connect(gain);
    gain.connect(
      context.destination
    );


    oscillator.start();

    oscillator.stop(
      context.currentTime + 0.2
    );


    setTimeout(
      () => {
        try {
          context.close();
        } catch (_) {}
      },
      300
    );

  } catch (_) {}

}


/* ============================================================
   ERROR MESSAGE
   ============================================================ */

function getFriendlyError(
  error
) {

  const code =
    error?.code ||
    "";


  const status =
    Number(
      error?.status
    );


  if (
    code ===
    "FETCH_FAILED"
  ) {

    return {
      message:
        "Vyhľadávanie sa nepodarilo spojiť so serverom. Skontroluj internetové pripojenie a skús to znova.",

      type:
        "error"
    };

  }


  if (
    code ===
    "REQUEST_TIMEOUT"
  ) {

    return {
      message:
        "Vyhľadávanie trvá príliš dlho. Skús to znova.",

      type:
        "error"
    };

  }


  if (
    code ===
    "AUTH_REQUIRED" ||
    status === 401
  ) {

    return {
      message:
        "Nepodarilo sa overiť tvoje pripojenie. Obnov stránku a skús to znova.",

      type:
        "error"
    };

  }


  /*
   * Backend's provider failure.
   * The backend handles the refund.
   */

  if (
    status === 503
  ) {

    return {
      message:
        error?.message ||
        "AI služba je momentálne nedostupná. Vyhľadávanie sa nezapočítalo do denného limitu.",

      type:
        "error"
    };

  }


  if (
    status === 429
  ) {

    return {
      message:
        "Dosiahol si dnešný limit 5 vyhľadávaní.",

      type:
        "error"
    };

  }


  if (
    status >= 500
  ) {

    return {
      message:
        "Server CARMATCH AI momentálne neodpovedá správne. Skús to znova.",

      type:
        "error"
    };

  }


  return {
    message:
      error?.message ||
      "Vyhľadávanie sa nepodarilo dokončiť. Skús to znova.",

    type:
      "error"
  };
}


/* ============================================================
   MAIN SEARCH
   ============================================================ */

async function findCars() {

  if (isSearching) {
    return;
  }


  const request =
    collectRequest();


  if (
    !hasSearchCriteria(request)
  ) {

    setStatus(
      "Najprv napíš, aké auto hľadáš, alebo nastav aspoň jeden filter.",
      "error"
    );

    if (aiRequest) {
      aiRequest.focus();
    }

    return;
  }


  clearResults();

  setButtonBusy(true);

  setStatus(
    "Pripravujem vyhľadávanie…",
    "loading"
  );


  lastSearchRequest =
    request;


  try {

    /*
     * Make sure anonymous authentication exists.
     */

    const session =
      await initializeAnonymousUser();


    if (!session?.access_token) {

      const authError =
        new Error(
          "AUTH_REQUIRED"
        );

      authError.code =
        "AUTH_REQUIRED";

      throw authError;
    }


    setStatus(
      "Hľadám aktuálne modely a porovnávam ich s tvojimi požiadavkami…",
      "loading"
    );


    const data =
      await performSearch(
        request
      );


    /*
     * Backend should return:
     * {
     *   cars: [...],
     *   remaining: number
     * }
     */

    const cars =
      Array.isArray(data?.cars)
        ? data.cars
        : [];


    if (
      cars.length !== 3
    ) {

      const resultError =
        new Error(
          "CARMATCH AI nedostal presne 3 autá."
        );

      resultError.code =
        "INVALID_RESULTS";

      throw resultError;
    }


    /*
     * Update usage only after
     * successful search.
     */

    if (
      data?.remaining !== undefined
    ) {

      updateUsage(
        data.remaining
      );

    }


    renderResults(
      cars
    );


    setStatus(
      "Hotovo — našiel som 3 autá podľa tvojich požiadaviek.",
      "success"
    );


    successFeedback();


  } catch (error) {

    console.error(
      "CARMATCH AI search error:",
      error
    );


    const friendly =
      getFriendlyError(
        error
      );


    setStatus(
      friendly.message,
      friendly.type
    );


    /*
     * Do not deduct anything
     * on the frontend.
     *
     * Backend is responsible for
     * refunding failed AI searches.
     */

    clearResults();


  } finally {

    setButtonBusy(false);

  }

}


/* ============================================================
   EXAMPLE BUTTONS
   ============================================================ */

function setupExampleButtons() {

  document
    .querySelectorAll(
      ".example-chip"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            const example =
              button.dataset.example ||
              "";

            if (!aiRequest) {
              return;
            }

            aiRequest.value =
              example;


            aiRequest.dispatchEvent(
              new Event(
                "input",
                {
                  bubbles: true
                }
              )
            );


            aiRequest.focus();

          }
        );

      }
    );

}


/* ============================================================
   CHARACTER COUNTER
   ============================================================ */

function setupCharacterCounter() {

  if (
    !aiRequest
  ) {
    return;
  }


  const counter =
    byId("charCount");


  if (!counter) {
    return;
  }


  function update() {

    counter.textContent =
      `${aiRequest.value.length} / 3000`;

  }


  aiRequest.addEventListener(
    "input",
    update
  );


  update();

}


/* ============================================================
   FILTER DETAILS
   ============================================================ */

function setupFilters() {

  document
    .querySelectorAll(
      ".filters-details"
    )
    .forEach(
      details => {

        details.addEventListener(
          "toggle",
          () => {

            const arrow =
              details.querySelector(
                ".summary-arrow"
              );

            if (!arrow) {
              return;
            }

            arrow.textContent =
              details.open
                ? "−"
                : "+";

          }
        );

      }
    );

}


/* ============================================================
   KEYBOARD SHORTCUT
   ============================================================ */

function setupKeyboard() {

  if (!aiRequest) {
    return;
  }


  aiRequest.addEventListener(
    "keydown",
    event => {

      if (
        (event.ctrlKey ||
          event.metaKey) &&
        event.key === "Enter"
      ) {

        event.preventDefault();

        findCars();

      }

    }
  );

}


/* ============================================================
   SEARCH BUTTON
   ============================================================ */

function setupSearchButton() {

  if (!searchButton) {
    return;
  }


  searchButton.disabled =
    false;


  searchButton.addEventListener(
    "click",
    event => {

      event.preventDefault();

      findCars();

    }
  );

}


/* ============================================================
   INITIAL START
   ============================================================ */

async function startCarmatch() {

  /*
   * The button must NOT start disabled
   * while authentication loads.
   */

  if (searchButton) {
    searchButton.disabled =
      false;
  }


  updateUsage(5);


  setStatus(
    "Pripravené na vyhľadávanie."
  );


  setupSearchButton();

  setupExampleButtons();

  setupCharacterCounter();

  setupFilters();

  setupKeyboard();


  /*
   * Authentication happens in the background.
   * The UI does not need to wait for it.
   */

  initializeAnonymousUser()
    .then(
      session => {

        if (session) {

          setStatus(
            "Pripravené na vyhľadávanie."
          );

        }

      }
    )
    .catch(
      error => {

        console.warn(
          "CARMATCH AI authentication:",
          error
        );

      }
    );

}


/* ============================================================
   SLEEP
   ============================================================ */

function sleep(
  milliseconds
) {

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        milliseconds
      )
  );

}


/* ============================================================
   GLOBAL API
   ============================================================ */

window.findCars =
  findCars;


/* ============================================================
   START
   ============================================================ */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    startCarmatch,
    {
      once: true
    }
  );

} else {

  startCarmatch();

}