// ============================================================
// CARMATCH AI - FINAL FRONTEND v8
// ============================================================
// Production frontend for:
//   /api/search
//
// Features:
//   - Supabase anonymous authentication
//   - 5 searches/day
//   - automatic session recovery
//   - exact 3-car result contract
//   - safe backend-object rendering
//   - no [object Object]
//   - imageCandidates support
//   - Wikimedia image support
//   - official price source
//   - official configurator
//   - data sources
//   - Slovak UI
//   - vibration + ready sound
//   - 429 / 503 handling
//   - robust network error handling
//   - defensive API parsing
// ============================================================


// ============================================================
// CONFIGURATION
// ============================================================

const CARMATCH_CONFIG =
  window.CARMATCH_CONFIG || {
    supabaseUrl:
      "PASTE_YOUR_SUPABASE_URL_HERE",

    supabaseAnonKey:
      "PASTE_YOUR_SUPABASE_ANON_KEY_HERE",

    apiEndpoint:
      "/api/search"
  };


const API_ENDPOINT =
  String(
    CARMATCH_CONFIG.apiEndpoint ||
    "/api/search"
  ).trim();


const SUPABASE_URL =
  String(
    CARMATCH_CONFIG.supabaseUrl || ""
  )
    .trim()
    .replace(/\/+$/, "");


const SUPABASE_ANON_KEY =
  String(
    CARMATCH_CONFIG.supabaseAnonKey || ""
  ).trim();


const SUPABASE_CLIENT_CDN =
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";


const MAX_SEARCH_TEXT = 3000;
const MAX_FILTER_TEXT = 500;

const REQUEST_TIMEOUT_MS = 120000;

const MAX_CARS = 3;
const MAX_LIST_ITEMS = 6;
const MAX_DATA_SOURCES = 6;
const MAX_IMAGE_CANDIDATES = 12;


// ============================================================
// STATE
// ============================================================

let supabaseClient = null;
let supabaseScriptPromise = null;

let activeRequest = false;

let lastSuccessfulSearch = null;

let audioContext = null;


// ============================================================
// BASIC SAFE HELPERS
// ============================================================

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}


function safeString(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  return "";
}


// ============================================================
// CRITICAL OBJECT -> TEXT CONVERTER
// ============================================================
//
// This is the main protection against:
//
//     [object Object]
//
// Backend/AI data can sometimes accidentally contain:
//     {
//       message: "..."
//     }
//
// or:
//     {
//       value: "..."
//     }
//
// Never send such an object directly to String().
// ============================================================

function safeDisplayText(
  value,
  fallback = ""
) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }


  if (typeof value === "string") {
    const result =
      value
        .replace(/\u0000/g, "")
        .trim();

    return result || fallback;
  }


  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }


  if (Array.isArray(value)) {
    const parts = value
      .map(item =>
        safeDisplayText(item, "")
      )
      .filter(Boolean);

    return parts.length
      ? parts.join(", ")
      : fallback;
  }


  if (isPlainObject(value)) {

    const preferredKeys = [
      "message",
      "text",
      "value",
      "name",
      "description",
      "reason",
      "title",
      "label",
      "error"
    ];


    for (const key of preferredKeys) {

      if (
        value[key] !== undefined &&
        value[key] !== null
      ) {

        const result =
          safeDisplayText(
            value[key],
            ""
          );

        if (result) {
          return result;
        }
      }
    }


    try {

      const json =
        JSON.stringify(value);

      if (json) {
        return json.slice(0, 1500);
      }

    } catch (_) {}


    return fallback;
  }


  return fallback;
}


function escapeHTML(value) {
  return safeDisplayText(
    value,
    ""
  )
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function safeNumber(
  value,
  fallback = null
) {
  const number =
    typeof value === "number"
      ? value
      : Number(
          String(value ?? "")
            .replace(",", ".")
            .trim()
        );

  return Number.isFinite(number)
    ? number
    : fallback;
}


function safeInteger(
  value,
  fallback = null
) {
  const number =
    safeNumber(value, fallback);

  return Number.isFinite(number)
    ? Math.round(number)
    : fallback;
}


function safeHTTPSUrl(value) {
  const text =
    safeDisplayText(value, "");

  if (!text) {
    return "";
  }

  try {

    const url =
      new URL(text);

    if (
      url.protocol !== "https:"
    ) {
      return "";
    }

    return url.href;

  } catch (_) {

    return "";
  }
}


// ============================================================
// DISPLAY FORMATTERS
// ============================================================

function formatText(
  value,
  fallback = "—"
) {
  const clean =
    safeDisplayText(
      value,
      ""
    );

  return clean
    ? escapeHTML(clean)
    : fallback;
}


function formatPrice(value) {
  const clean =
    safeDisplayText(
      value,
      ""
    );

  if (!clean) {
    return "Cena na vyžiadanie";
  }

  return escapeHTML(clean);
}


function formatYear(value) {
  const year =
    safeInteger(value, null);

  if (
    year === null ||
    year < 1900 ||
    year > 2100
  ) {
    return "—";
  }

  return escapeHTML(
    String(year)
  );
}


function formatSeats(value) {
  const seats =
    safeInteger(value, null);

  if (
    seats === null ||
    seats < 1 ||
    seats > 100
  ) {
    return "—";
  }

  return escapeHTML(
    String(seats)
  );
}


function formatScore(value) {
  const score =
    safeNumber(value, 0);

  const clean =
    Math.max(
      0,
      Math.min(
        100,
        Math.round(score)
      )
    );

  return clean;
}


// ============================================================
// DOM
// ============================================================

function firstExistingId(ids) {

  for (const id of ids) {

    const element =
      document.getElementById(id);

    if (element) {
      return element;
    }
  }

  return null;
}


function getOutputElement() {
  return (
    document.getElementById(
      "output"
    ) ||
    document.getElementById(
      "results"
    )
  );
}


function getFindButton() {

  return (
    document.querySelector(
      "button.find"
    ) ||

    document.querySelector(
      "button.primary"
    ) ||

    document.querySelector(
      'button[onclick="findCars()"]'
    ) ||

    Array.from(
      document.querySelectorAll(
        "button"
      )
    ).find(button =>
      /nájsť moje auto/i.test(
        button.textContent || ""
      )
    ) ||

    null
  );
}


function readValue(
  ids,
  fallback = ""
) {

  const element =
    firstExistingId(ids);

  if (!element) {
    return fallback;
  }

  return safeDisplayText(
    element.value,
    fallback
  ).trim();
}


function readNumber(
  ids,
  fallback = ""
) {

  const raw =
    readValue(
      ids,
      ""
    );

  if (!raw) {
    return fallback;
  }

  const number =
    Number(
      raw.replace(",", ".")
    );

  return Number.isFinite(number)
    ? number
    : fallback;
}


// ============================================================
// STATUS UI
// ============================================================

function ensureStatusElement() {

  let status =
    document.getElementById(
      "carmatch-status"
    );

  if (status) {
    return status;
  }


  const button =
    getFindButton();

  if (
    !button ||
    !button.parentElement
  ) {
    return null;
  }


  status =
    document.createElement(
      "div"
    );


  status.id =
    "carmatch-status";


  status.setAttribute(
    "aria-live",
    "polite"
  );


  status.style.marginTop =
    "10px";


  status.style.fontSize =
    "13px";


  status.style.color =
    "#6b6b6b";


  status.style.textAlign =
    "center";


  status.style.minHeight =
    "18px";


  button.insertAdjacentElement(
    "afterend",
    status
  );


  return status;
}


function setStatus(
  message = "",
  isError = false
) {

  const status =
    ensureStatusElement();

  if (!status) {
    return;
  }


  status.textContent =
    safeDisplayText(
      message,
      ""
    );


  status.style.color =
    isError
      ? "#9b1c1c"
      : "#6b6b6b";
}


// ============================================================
// BUTTON
// ============================================================

function setButtonBusy(
  busy
) {

  const button =
    getFindButton();

  if (!button) {
    return;
  }


  button.disabled =
    Boolean(busy);


  button.style.opacity =
    busy
      ? "0.65"
      : "1";


  button.style.cursor =
    busy
      ? "wait"
      : "pointer";


  if (busy) {

    if (
      !button.dataset
        .originalText
    ) {
      button.dataset.originalText =
        button.textContent;
    }


    button.textContent =
      "HĽADÁM…";

  } else if (
    button.dataset.originalText
  ) {

    button.textContent =
      button.dataset.originalText;
  }
}


// ============================================================
// FEEDBACK
// ============================================================

function vibrateSuccess() {

  try {

    if (
      navigator.vibrate
    ) {

      navigator.vibrate([
        80,
        45,
        120
      ]);

    }

  } catch (_) {}
}


function playReadySound() {

  try {

    const AudioContextClass =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContextClass) {
      return;
    }


    if (!audioContext) {
      audioContext =
        new AudioContextClass();
    }


    if (
      audioContext.state ===
      "suspended"
    ) {
      audioContext.resume()
        .catch(() => {});
    }


    const now =
      audioContext.currentTime;


    const oscillator =
      audioContext.createOscillator();


    const gain =
      audioContext.createGain();


    oscillator.type =
      "sine";


    oscillator.frequency
      .setValueAtTime(
        660,
        now
      );


    oscillator.frequency
      .setValueAtTime(
        880,
        now + 0.08
      );


    gain.gain
      .setValueAtTime(
        0.0001,
        now
      );


    gain.gain
      .exponentialRampToValueAtTime(
        0.12,
        now + 0.015
      );


    gain.gain
      .exponentialRampToValueAtTime(
        0.0001,
        now + 0.22
      );


    oscillator.connect(
      gain
    );


    gain.connect(
      audioContext.destination
    );


    oscillator.start(
      now
    );


    oscillator.stop(
      now + 0.24
    );

  } catch (_) {}
}


function answerReadyFeedback() {
  vibrateSuccess();
  playReadySound();
}


// ============================================================
// SUPABASE
// ============================================================

function configIsUsable() {

  return Boolean(
    SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    !SUPABASE_URL.includes(
      "PASTE_YOUR_"
    ) &&
    !SUPABASE_ANON_KEY.includes(
      "PASTE_YOUR_"
    )
  );
}


function loadSupabaseScript() {

  if (
    window.supabase &&
    typeof window.supabase
      .createClient ===
      "function"
  ) {
    return Promise.resolve(
      window.supabase
    );
  }


  if (
    supabaseScriptPromise
  ) {
    return supabaseScriptPromise;
  }


  supabaseScriptPromise =
    new Promise(
      (resolve, reject) => {

        const existing =
          document.querySelector(
            'script[data-carmatch-supabase="1"]'
          );


        if (existing) {

          existing.addEventListener(
            "load",
            () => {

              if (
                window.supabase &&
                typeof window
                  .supabase
                  .createClient ===
                  "function"
              ) {

                resolve(
                  window.supabase
                );

              } else {

                reject(
                  new Error(
                    "Supabase JS sa nepodarilo inicializovať."
                  )
                );

              }

            }
          );


          existing.addEventListener(
            "error",
            () => {

              reject(
                new Error(
                  "Supabase JS sa nepodarilo načítať."
                )
              );

            }
          );


          return;
        }


        const script =
          document.createElement(
            "script"
          );


        script.src =
          SUPABASE_CLIENT_CDN;


        script.async =
          true;


        script.dataset
          .carmatchSupabase =
          "1";


        script.onload = () => {

          if (
            window.supabase &&
            typeof window
              .supabase
              .createClient ===
              "function"
          ) {

            resolve(
              window.supabase
            );

          } else {

            reject(
              new Error(
                "Supabase JS sa nepodarilo inicializovať."
              )
            );

          }

        };


        script.onerror = () => {

          reject(
            new Error(
              "Supabase JS sa nepodarilo načítať."
            )
          );

        };


        document.head.appendChild(
          script
        );

      }
    );


  return supabaseScriptPromise;
}


async function getSupabaseClient() {

  if (supabaseClient) {
    return supabaseClient;
  }


  if (!configIsUsable()) {

    throw new Error(
      "CARMATCH AI nemá nastavené Supabase URL a anon key."
    );

  }


  const supabase =
    await loadSupabaseScript();


  supabaseClient =
    supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession:
            true,

          autoRefreshToken:
            true,

          detectSessionInUrl:
            false
        }
      }
    );


  return supabaseClient;
}


async function ensureAnonymousSession() {

  const client =
    await getSupabaseClient();


  const current =
    await client.auth.getSession();


  if (
    current?.data?.session
      ?.access_token
  ) {

    return current.data.session;

  }


  const signIn =
    await client.auth
      .signInAnonymously();


  if (signIn.error) {

    throw new Error(
      safeDisplayText(
        signIn.error.message,
        "Supabase anonymous login zlyhal."
      )
    );

  }


  if (
    !signIn?.data?.session
      ?.access_token
  ) {

    throw new Error(
      "Supabase nevytvoril platnú reláciu."
    );

  }


  return signIn.data.session;
}


async function getAccessToken() {

  const client =
    await getSupabaseClient();


  let sessionResponse =
    await client.auth.getSession();


  let session =
    sessionResponse
      ?.data
      ?.session;


  if (
    session?.access_token
  ) {

    return session.access_token;

  }


  session =
    await ensureAnonymousSession();


  return session.access_token;
}


// ============================================================
// REQUEST BUILDING
// ============================================================

function getNaturalLanguage() {

  const element =
    firstExistingId([
      "naturalLanguage",
      "query",
      "prompt",
      "request",
      "search",
      "message"
    ]);


  if (!element) {
    return "";
  }


  return safeDisplayText(
    element.value,
    ""
  )
    .replace(/\u0000/g, "")
    .trim()
    .slice(
      0,
      MAX_SEARCH_TEXT
    );
}


function normalizeSelectValue(
  value,
  fallback = ""
) {

  const clean =
    safeDisplayText(
      value,
      ""
    ).trim();


  if (
    !clean ||
    /^(ľubovoľn|ľubovoľný|ľubovoľná|any|all)$/i
      .test(clean)
  ) {

    return fallback;
  }


  return clean.slice(
    0,
    MAX_FILTER_TEXT
  );
}


function buildRequestPayload() {

  return {

    naturalLanguage:
      getNaturalLanguage(),

    filters: {

      budget:
        String(
          readNumber(
            ["budget"],
            ""
          )
        ),

      seats:
        String(
          readNumber(
            ["seats"],
            ""
          )
        ),

      power:
        String(
          readNumber(
            ["power"],
            ""
          )
        ),

      trunk:
        String(
          readNumber(
            ["trunk"],
            ""
          )
        ),

      drive:
        normalizeSelectValue(
          readValue(
            ["drive"],
            ""
          )
        ),

      fuel:
        normalizeSelectValue(
          readValue(
            ["fuel"],
            ""
          )
        ),

      body:
        normalizeSelectValue(
          readValue(
            ["body"],
            ""
          )
        ),

      style:
        normalizeSelectValue(
          readValue(
            ["style"],
            ""
          )
        ),

      length:
        String(
          readNumber(
            ["length"],
            ""
          )
        ),

      year:
        String(
          readNumber(
            ["year"],
            ""
          )
        ),

      avoid:
        readValue(
          [
            "avoid",
            "excludedBrands",
            "exclude"
          ],
          ""
        )
          .slice(
            0,
            MAX_FILTER_TEXT
          )
    }
  };
}


// ============================================================
// REQUEST TIMEOUT
// ============================================================

async function fetchWithTimeout(
  url,
  options = {},
  timeout =
    REQUEST_TIMEOUT_MS
) {

  const controller =
    new AbortController();


  const timer =
    setTimeout(
      () =>
        controller.abort(),
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


// ============================================================
// RESPONSE PARSING
// ============================================================

async function parseResponseBody(
  response
) {

  const raw =
    await response.text();


  if (!raw) {
    return {};
  }


  try {

    return JSON.parse(
      raw
    );

  } catch (_) {

    return {
      error:
        "Invalid JSON response",

      message:
        raw.slice(
          0,
          1000
        )
    };

  }
}


function normalizeApiMessage(
  data,
  fallback
) {

  if (
    data &&
    typeof data === "object"
  ) {

    const candidates = [
      data.message,
      data.error,
      data.details,
      data.reason
    ];


    for (
      const candidate
      of candidates
    ) {

      const text =
        safeDisplayText(
          candidate,
          ""
        );

      if (text) {
        return text;
      }
    }

  }


  return fallback;
}


// ============================================================
// MAIN API CALL
// ============================================================

async function performSearch(
  payload
) {

  let token =
    await getAccessToken();


  let response;


  try {

    response =
      await fetchWithTimeout(
        API_ENDPOINT,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${token}`
          },

          body:
            JSON.stringify(
              payload
            ),

          cache:
            "no-store"
        }
      );

  } catch (networkError) {

    if (
      networkError?.name ===
      "AbortError"
    ) {

      const error =
        new Error(
          "Vyhľadávanie trvalo príliš dlho. Skús to znova."
        );

      error.status =
        504;

      error.network =
        true;

      throw error;

    }


    const error =
      new Error(
        "Nepodarilo sa spojiť so serverom CARMATCH AI. Skontroluj pripojenie a skús to znova."
      );


    error.status =
      0;


    error.network =
      true;


    error.original =
      safeDisplayText(
        networkError?.message,
        ""
      );


    throw error;
  }


  let data =
    await parseResponseBody(
      response
    );


  if (
    response.status === 401
  ) {

    try {

      const client =
        await getSupabaseClient();


      await client.auth.signOut();


      token =
        await getAccessToken();


      response =
        await fetchWithTimeout(
          API_ENDPOINT,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${token}`
            },

            body:
              JSON.stringify(
                payload
              ),

            cache:
              "no-store"
          }
        );


      data =
        await parseResponseBody(
          response
        );

    } catch (_) {

      // Keep original 401
      // if session recovery fails.

    }
  }


  if (!response.ok) {

    const fallback =
      `Server vrátil chybu HTTP ${response.status}.`;


    const message =
      normalizeApiMessage(
        data,
        fallback
      );


    const error =
      new Error(
        message
      );


    error.status =
      response.status;


    error.payload =
      data;


    throw error;
  }


  if (
    !data ||
    typeof data !==
      "object"
  ) {

    const error =
      new Error(
        "Server vrátil neplatnú odpoveď."
      );


    error.status =
      502;


    error.payload =
      data;


    throw error;
  }


  if (
    !Array.isArray(
      data.cars
    )
  ) {

    const error =
      new Error(
        "Server nevrátil zoznam vozidiel."
      );


    error.status =
      502;


    error.payload =
      data;


    throw error;
  }


  if (
    data.cars.length !==
    MAX_CARS
  ) {

    const error =
      new Error(
        `Server nevrátil presne ${MAX_CARS} vozidlá.`
      );


    error.status =
      502;


    error.payload =
      data;


    throw error;
  }


  return data;
}


// ============================================================
// CAR NORMALIZATION
// ============================================================

function normalizeCar(
  rawCar
) {

  const car =
    isPlainObject(
      rawCar
    )
      ? rawCar
      : {};


  return {

    ...car,

    name:
      safeDisplayText(
        car.name,
        ""
      ),

    generation:
      safeDisplayText(
        car.generation,
        ""
      ),

    year:
      safeInteger(
        car.year,
        null
      ),

    score:
      formatScore(
        car.score
      ),

    price:
      safeDisplayText(
        car.price,
        ""
      ),

    power:
      safeDisplayText(
        car.power,
        ""
      ),

    seats:
      safeInteger(
        car.seats,
        null
      ),

    trunk:
      safeDisplayText(
        car.trunk,
        ""
      ),

    drive:
      safeDisplayText(
        car.drive,
        ""
      ),

    fuel:
      safeDisplayText(
        car.fuel,
        ""
      ),

    reason:
      safeDisplayText(
        car.reason,
        ""
      ),

    maintenance:
      safeDisplayText(
        car.maintenance,
        ""
      ),

    pros:
      normalizeList(
        car.pros
      ),

    cons:
      normalizeList(
        car.cons
      ),

    image:
      safeHTTPSUrl(
        car.image
      ),

    photoSource:
      safeHTTPSUrl(
        car.photoSource
      ),

    configurator:
      safeHTTPSUrl(
        car.configurator
      ),

    priceSource:
      safeHTTPSUrl(
        car.priceSource
      ),

    dataSources:
      normalizeUrls(
        car.dataSources
      ),

    imageCandidates:
      normalizeImageCandidates(
        car.imageCandidates
      )
  };
}


function normalizeList(
  value
) {

  if (
    !Array.isArray(value)
  ) {

    if (
      value === null ||
      value === undefined
    ) {
      return [];
    }

    const text =
      safeDisplayText(
        value,
        ""
      );

    return text
      ? [text]
      : [];
  }


  return value
    .map(item =>
      safeDisplayText(
        item,
        ""
      )
    )
    .filter(Boolean)
    .slice(
      0,
      MAX_LIST_ITEMS
    );
}


function normalizeUrls(
  value
) {

  if (
    !Array.isArray(value)
  ) {
    return [];
  }


  return value
    .map(item =>
      safeHTTPSUrl(item)
    )
    .filter(Boolean)
    .filter(
      (url, index, all) =>
        all.indexOf(url) ===
        index
    )
    .slice(
      0,
      MAX_DATA_SOURCES
    );
}


function normalizeImageCandidates(
  value
) {

  if (
    !Array.isArray(value)
  ) {
    return [];
  }


  return value
    .map(candidate => {

      if (
        !isPlainObject(
          candidate
        )
      ) {
        return null;
      }


      const url =
        safeHTTPSUrl(
          candidate.url
        );


      if (!url) {
        return null;
      }


      return {

        url,

        source:
          safeHTTPSUrl(
            candidate.source
          ),

        title:
          safeDisplayText(
            candidate.title,
            ""
          )
      };

    })
    .filter(Boolean)
    .filter(
      (candidate, index, all) =>
        all.findIndex(
          item =>
            item.url ===
            candidate.url
        ) === index
    )
    .slice(
      0,
      MAX_IMAGE_CANDIDATES
    );
}


// ============================================================
// IMAGE SELECTION
// ============================================================

function bestImageForCar(
  car
) {

  const direct =
    safeHTTPSUrl(
      car?.image
    );


  if (direct) {
    return direct;
  }


  const candidates =
    Array.isArray(
      car?.imageCandidates
    )
      ? car.imageCandidates
      : [];


  for (
    const candidate
    of candidates
  ) {

    const url =
      safeHTTPSUrl(
        candidate?.url
      );


    if (url) {
      return url;
    }
  }


  return "";
}


function imageCandidateSource(
  car
) {

  const direct =
    safeHTTPSUrl(
      car?.photoSource
    );


  if (direct) {
    return direct;
  }


  const candidates =
    Array.isArray(
      car?.imageCandidates
    )
      ? car.imageCandidates
      : [];


  for (
    const candidate
    of candidates
  ) {

    const source =
      safeHTTPSUrl(
        candidate?.source
      );


    if (source) {
      return source;
    }
  }


  return "";
}


// ============================================================
// IMAGE RENDERING
// ============================================================

function renderImage(
  car
) {

  const image =
    bestImageForCar(
      car
    );


  if (!image) {

    return `
      <div
        class="carmatch-image-placeholder"
        style="
          min-height:220px;
          display:flex;
          align-items:center;
          justify-content:center;
          background:#f1f2f4;
          color:#777;
          font-size:14px;
          text-align:center;
          padding:20px;
        "
      >
        Foto sa nepodarilo nájsť.
      </div>
    `;
  }


  const source =
    imageCandidateSource(
      car
    );


  const sourceLink =
    source
      ? `
        <a
          href="${escapeHTML(source)}"
          target="_blank"
          rel="noopener noreferrer"
          style="
            display:block;
            margin-top:6px;
            font-size:11px;
            color:#666;
            text-decoration:none;
          "
        >
          Zdroj fotografie
        </a>
      `
      : "";


  return `
    <div>

      <img
        src="${escapeHTML(image)}"
        alt="${escapeHTML(
          safeDisplayText(
            car?.name,
            "Vozidlo"
          )
        )}"
        loading="lazy"
        referrerpolicy="no-referrer"
        style="
          width:100%;
          height:220px;
          object-fit:cover;
          display:block;
          background:#f1f2f4;
        "
        onerror="
          this.style.display='none';
          const fallback=this.parentElement.querySelector('.carmatch-image-fallback');
          if(fallback){fallback.style.display='flex';}
        "
      >

      <div
        class="carmatch-image-fallback"
        style="
          min-height:220px;
          display:none;
          align-items:center;
          justify-content:center;
          background:#f1f2f4;
          color:#777;
          font-size:14px;
          text-align:center;
        "
      >
        Foto sa nepodarilo načítať.
      </div>

      ${sourceLink}

    </div>
  `;
}


// ============================================================
// LIST RENDERING
// ============================================================

function renderList(
  items,
  emptyText
) {

  const safeItems =
    normalizeList(
      items
    );


  if (
    safeItems.length ===
    0
  ) {

    return `
      <li>
        ${escapeHTML(
          emptyText
        )}
      </li>
    `;
  }


  return safeItems
    .map(
      item =>
        `<li>${formatText(
          item
        )}</li>`
    )
    .join("");
}


// ============================================================
// CAR CARD
// ============================================================

function renderCarCard(
  rawCar,
  index
) {

  const car =
    normalizeCar(
      rawCar
    );


  const score =
    formatScore(
      car.score
    );


  const officialPriceSource =
    safeHTTPSUrl(
      car.priceSource
    );


  const configurator =
    safeHTTPSUrl(
      car.configurator
    );


  const dataSources =
    normalizeUrls(
      car.dataSources
    );


  return `
    <article
      class="carmatch-car-card"
      style="
        background:#fff;
        border-radius:20px;
        overflow:hidden;
        box-shadow:0 8px 28px rgba(0,0,0,.08);
        border:1px solid #ececec;
      "
    >

      <div class="carmatch-photo-wrap">
        ${renderImage(car)}
      </div>


      <div style="padding:18px">

        <div style="
          font-size:12px;
          font-weight:800;
          letter-spacing:.08em;
          color:#6b6b6b;
          text-transform:uppercase;
        ">
          #${index + 1} NAJLEPŠIA ZHODA
        </div>


        <h3 style="
          margin:7px 0 4px;
          font-size:22px;
          line-height:1.15;
        ">
          ${formatText(
            car.name,
            "Neznáme vozidlo"
          )}
        </h3>


        <div style="
          font-size:13px;
          color:#666;
          margin-bottom:12px;
        ">
          ${formatText(
            car.generation,
            "Generácia neoverená"
          )}

          ·

          ${formatYear(
            car.year
          )}
        </div>


        <div style="
          display:inline-block;
          padding:7px 10px;
          border-radius:999px;
          background:#f0f1f3;
          font-size:14px;
          font-weight:800;
          margin-bottom:12px;
        ">
          Zhoda ${score}%
        </div>


        <div style="
          font-size:14px;
          line-height:1.8;
          color:#3e3e3e;
        ">

          <div>
            <strong>Cena:</strong>
            ${formatPrice(
              car.price
            )}
          </div>


          <div>
            <strong>Výkon:</strong>
            ${formatText(
              car.power
            )}
          </div>


          <div>
            <strong>Sedadlá:</strong>
            ${formatSeats(
              car.seats
            )}
          </div>


          <div>
            <strong>Kufor:</strong>
            ${formatText(
              car.trunk
            )}
          </div>


          <div>
            <strong>Pohon:</strong>
            ${formatText(
              car.drive
            )}
          </div>


          <div>
            <strong>Palivo:</strong>
            ${formatText(
              car.fuel
            )}
          </div>

        </div>


        <div style="margin-top:15px">

          <strong>Prečo:</strong>

          <div style="
            margin-top:5px;
            color:#555;
            line-height:1.6;
          ">
            ${formatText(
              car.reason,
              "Spĺňa zadané požiadavky."
            )}
          </div>

        </div>


        <div style="
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:14px;
          margin-top:16px;
        ">

          <div>

            <strong>
              Výhody
            </strong>

            <ul style="
              padding-left:18px;
              margin:7px 0;
              line-height:1.6;
              color:#555;
            ">
              ${renderList(
                car.pros,
                "Neboli uvedené."
              )}
            </ul>

          </div>


          <div>

            <strong>
              Nevýhody
            </strong>

            <ul style="
              padding-left:18px;
              margin:7px 0;
              line-height:1.6;
              color:#555;
            ">
              ${renderList(
                car.cons,
                "Neboli uvedené."
              )}
            </ul>

          </div>

        </div>


        <div style="
          margin-top:14px;
        ">

          <strong>
            Údržba
          </strong>

          <div style="
            margin-top:5px;
            color:#555;
            line-height:1.6;
          ">
            ${formatText(
              car.maintenance,
              "Údaje o údržbe nie sú uvedené."
            )}
          </div>

        </div>


        <div style="
          display:flex;
          flex-wrap:wrap;
          gap:8px;
          margin-top:16px;
        ">

          ${
            officialPriceSource
              ? `
                <a
                  href="${escapeHTML(
                    officialPriceSource
                  )}"
                  target="_blank"
                  rel="noopener noreferrer"
                  style="
                    display:inline-block;
                    padding:9px 12px;
                    border-radius:10px;
                    background:#111;
                    color:#fff;
                    text-decoration:none;
                    font-size:13px;
                    font-weight:700;
                  "
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
                  href="${escapeHTML(
                    configurator
                  )}"
                  target="_blank"
                  rel="noopener noreferrer"
                  style="
                    display:inline-block;
                    padding:9px 12px;
                    border-radius:10px;
                    background:#ededed;
                    color:#111;
                    text-decoration:none;
                    font-size:13px;
                    font-weight:700;
                  "
                >
                  Konfigurátor
                </a>
              `
              : ""
          }

        </div>


        ${
          dataSources.length
            ? `
              <div style="
                margin-top:12px;
                font-size:12px;
                line-height:1.7;
              ">

                <strong>
                  Zdroje:
                </strong>

                ${dataSources
                  .map(
                    (
                      source,
                      sourceIndex
                    ) =>
                      `
                        <a
                          href="${escapeHTML(
                            source
                          )}"
                          target="_blank"
                          rel="noopener noreferrer"
                          style="
                            margin-left:8px;
                            color:#555;
                          "
                        >
                          ${sourceIndex + 1}
                        </a>
                      `
                  )
                  .join("")}

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

function renderResults(
  data
) {

  const output =
    getOutputElement();


  if (!output) {

    throw new Error(
      "Na stránke sa nenašiel element pre výsledky."
    );

  }


  const cars =
    Array.isArray(
      data?.cars
    )
      ? data.cars
          .slice(
            0,
            MAX_CARS
          )
          .map(
            normalizeCar
          )
      : [];


  if (
    cars.length !==
    MAX_CARS
  ) {

    throw new Error(
      "Výsledok neobsahuje presne 3 vozidlá."
    );

  }


  output.innerHTML = `
    <div
      class="carmatch-results-container"
      style="margin-top:20px;"
    >

      <div
        class="carmatch-results-grid"
        style="
          display:grid;
          grid-template-columns:
            repeat(
              3,
              minmax(0,1fr)
            );
          gap:18px;
        "
      >

        ${cars
          .map(
            (
              car,
              index
            ) =>
              renderCarCard(
                car,
                index
              )
          )
          .join("")}

      </div>

    </div>
  `;


  applyResponsiveResultStyles();


  updateRemaining(
    data?.remaining
  );


  lastSuccessfulSearch =
    Date.now();
}


// ============================================================
// RESPONSIVE STYLES
// ============================================================

function applyResponsiveResultStyles() {

  const styleId =
    "carmatch-results-responsive-v8";


  if (
    document.getElementById(
      styleId
    )
  ) {
    return;
  }


  const style =
    document.createElement(
      "style"
    );


  style.id =
    styleId;


  style.textContent = `

    .carmatch-results-grid {
      width:100%;
    }


    .carmatch-car-card {
      min-width:0;
    }


    .carmatch-car-card img {
      max-width:100%;
    }


    @media (max-width: 1000px) {

      .carmatch-results-grid {
        grid-template-columns:
          1fr 1fr !important;
      }

    }


    @media (max-width: 700px) {

      .carmatch-results-grid {
        grid-template-columns:
          1fr !important;
      }

    }


    @media (max-width: 560px) {

      .carmatch-car-card
      ul {
        font-size:13px;
      }


      .carmatch-car-card
      h3 {
        font-size:20px !important;
      }


      .carmatch-car-card
      > div {
        box-sizing:border-box;
      }

    }

  `;


  document.head.appendChild(
    style
  );
}


// ============================================================
// REMAINING SEARCHES
// ============================================================

function updateRemaining(
  remaining
) {

  const number =
    safeNumber(
      remaining,
      null
    );


  if (
    number === null
  ) {
    return;
  }


  setStatus(
    `Zostáva ${Math.max(
      0,
      Math.round(number)
    )} vyhľadávaní dnes.`
  );
}


// ============================================================
// ERROR UI
// ============================================================

function renderError(
  message,
  status = null,
  payload = null
) {

  const output =
    getOutputElement();


  if (!output) {
    return;
  }


  let textMessage =
    safeDisplayText(
      message,
      "Nastala chyba."
    );


  if (
    status === 429
  ) {

    textMessage =
      safeDisplayText(
        payload?.message,
        "Denný limit vyhľadávaní bol dosiahnutý."
      );

  } else if (
    status === 503
  ) {

    textMessage =
      safeDisplayText(
        payload?.message,
        "AI je momentálne nedostupná. Toto vyhľadávanie sa podľa servera nezapočítalo do limitu."
      );

  } else if (
    status === 401
  ) {

    textMessage =
      "Relácia CARMATCH AI vypršala. Skús vyhľadávanie znova.";

  } else if (
    status === 502
  ) {

    textMessage =
      safeDisplayText(
        message,
        "Server vrátil neúplné alebo neplatné údaje."
      );

  } else if (
    status === 504
  ) {

    textMessage =
      safeDisplayText(
        message,
        "Vyhľadávanie trvalo príliš dlho. Skús to znova."
      );

  } else if (
    status === 0
  ) {

    textMessage =
      "Nepodarilo sa spojiť so serverom CARMATCH AI. Skontroluj internetové pripojenie a skús to znova.";

  }


  output.innerHTML = `
    <div
      class="carmatch-error"
      style="
        margin-top:20px;
        background:#fff;
        border:1px solid #e5e5e5;
        border-radius:18px;
        padding:18px;
        color:#222;
        box-shadow:
          0 6px 22px
          rgba(0,0,0,.06);
      "
    >
      ${escapeHTML(
        textMessage
      )}
    </div>
  `;


  const remaining =
    safeNumber(
      payload?.remaining,
      null
    );


  if (
    remaining !== null
  ) {

    updateRemaining(
      remaining
    );

  } else if (
    status === 503
  ) {

    setStatus(
      ""
    );

  }
}


// ============================================================
// VALIDATION
// ============================================================

function validateRequestPayload(
  payload
) {

  const naturalLanguage =
    safeDisplayText(
      payload?.naturalLanguage,
      ""
    );


  const filters =
    isPlainObject(
      payload?.filters
    )
      ? payload.filters
      : {};


  const hasText =
    Boolean(
      naturalLanguage
    );


  const hasFilter =
    Object.values(
      filters
    ).some(
      value =>
        safeDisplayText(
          value,
          ""
        ).trim() !== ""
    );


  if (
    !hasText &&
    !hasFilter
  ) {

    throw new Error(
      "Zadaj aspoň jednu požiadavku alebo nastav filter."
    );

  }


  if (
    naturalLanguage.length >
    MAX_SEARCH_TEXT
  ) {

    throw new Error(
      "Zadaný text je príliš dlhý."
    );

  }


  return true;
}


// ============================================================
// MAIN SEARCH
// ============================================================

async function findCars() {

  if (activeRequest) {
    return;
  }


  activeRequest =
    true;


  setButtonBusy(
    true
  );


  setStatus(
    "Pripravujem vyhľadávanie…"
  );


  const output =
    getOutputElement();


  if (output) {
    output.innerHTML = "";
  }


  try {

    const payload =
      buildRequestPayload();


    validateRequestPayload(
      payload
    );


    setStatus(
      "Hľadám aktuálne vozidlá…"
    );


    const data =
      await performSearch(
        payload
      );


    setStatus(
      "Spracúvam výsledky…"
    );


    renderResults(
      data
    );


    const remaining =
      safeNumber(
        data?.remaining,
        null
      );


    if (
      remaining !== null
    ) {

      setStatus(
        `Hotovo · zostáva ${Math.max(
          0,
          Math.round(
            remaining
          )
        )} vyhľadávaní dnes.`
      );

    } else {

      setStatus(
        "Hotovo."
      );

    }


    answerReadyFeedback();


  } catch (error) {

    console.error(
      "CARMATCH AI:",
      error
    );


    const message =
      safeDisplayText(
        error?.message,
        "Vyhľadávanie sa nepodarilo dokončiť."
      );


    renderError(
      message,
      error?.status ?? null,
      error?.payload ?? null
    );


  } finally {

    activeRequest =
      false;


    setButtonBusy(
      false
    );

  }
}


// ============================================================
// GLOBAL COMPATIBILITY
// ============================================================

window.findCars =
  findCars;


// ============================================================
// HELPER TEXT
// ============================================================

function addMissingHelperText() {

  const button =
    getFindButton();


  if (
    !button ||
    !button.parentElement
  ) {
    return;
  }


  const existing =
    document.getElementById(
      "carmatch-helper"
    );


  if (existing) {
    return;
  }


  const helper =
    document.createElement(
      "div"
    );


  helper.id =
    "carmatch-helper";


  helper.textContent =
    "Zjednoduš alebo oprav zadaný text.";


  helper.style.marginTop =
    "8px";


  helper.style.fontSize =
    "12px";


  helper.style.color =
    "#777";


  helper.style.textAlign =
    "center";


  button.insertAdjacentElement(
    "afterend",
    helper
  );
}


// ============================================================
// STARTUP
// ============================================================

function startCarmatch() {

  addMissingHelperText();

  ensureStatusElement();

  applyResponsiveResultStyles();

}


if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    startCarmatch
  );

} else {

  startCarmatch();

}