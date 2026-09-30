// ============================================================
// CARMATCH AI - FINAL FRONTEND v9
// ============================================================
// - Presne 3 výsledné autá
// - Supabase anonymous auth
// - 5 vyhľadávaní denne cez backend
// - Oprava [object Object]
// - Robustné chybové hlášky
// - Obrázky / imageCandidates
// - Cena / výkon / kufor / pohon / palivo
// - Oficiálna cena / konfigurátor / zdroje
// - Vibrácia + zvuk po dokončení
// - Mobilné zobrazenie
// ============================================================


// ============================================================
// SUPABASE CONFIG
// ============================================================
// MUSIA tu byť tvoje EXISTUJÚCE PUBLIC hodnoty.
// Nikdy sem nedávaj service_role key.

const CARMATCH_CONFIG = window.CARMATCH_CONFIG || {
  supabaseUrl: "PASTE_YOUR_SUPABASE_URL_HERE",
  supabaseAnonKey: "PASTE_YOUR_SUPABASE_ANON_KEY_HERE",
  apiEndpoint: "/api/search"
};


const API_ENDPOINT =
  String(CARMATCH_CONFIG.apiEndpoint || "/api/search").trim();


const SUPABASE_URL =
  String(CARMATCH_CONFIG.supabaseUrl || "")
    .trim()
    .replace(/\/+$/, "");


const SUPABASE_ANON_KEY =
  String(CARMATCH_CONFIG.supabaseAnonKey || "").trim();


const SUPABASE_CLIENT_CDN =
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";


const REQUEST_TIMEOUT = 70000;


let supabaseClient = null;
let supabaseScriptPromise = null;
let activeRequest = false;


// ============================================================
// SAFE VALUE HELPERS
// ============================================================

function safeDisplayText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === "string") {
    const clean = value.trim();
    return clean || fallback;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  if (Array.isArray(value)) {
    const parts = value
      .map(item => safeDisplayText(item, ""))
      .filter(Boolean);

    return parts.length
      ? parts.join(", ")
      : fallback;
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
        Object.prototype.hasOwnProperty.call(value, key) &&
        value[key] !== null &&
        value[key] !== undefined
      ) {
        const result =
          safeDisplayText(value[key], "");

        if (result) {
          return result;
        }
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


function escapeHTML(value) {
  return safeDisplayText(value, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function formatText(value, fallback = "—") {
  const clean =
    safeDisplayText(value, "").trim();

  return clean
    ? escapeHTML(clean)
    : fallback;
}


function formatPrice(value) {
  const clean =
    safeDisplayText(value, "").trim();

  if (!clean) {
    return "Cena na vyžiadanie";
  }

  return escapeHTML(clean);
}


function safeNumber(value, fallback = null) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}


function safeHTTPSUrl(value) {
  const clean =
    safeDisplayText(value, "").trim();

  if (!clean) {
    return "";
  }

  try {
    const url = new URL(clean);

    if (url.protocol !== "https:") {
      return "";
    }

    return url.href;
  } catch (_) {
    return "";
  }
}


function clampScore(value) {
  const number = safeNumber(value, 0);

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(number)
    )
  );
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


function readValue(ids, fallback = "") {
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


function readNumber(ids, fallback = "") {
  const raw =
    readValue(ids, "");

  if (!raw) {
    return fallback;
  }

  const number =
    Number(raw);

  return Number.isFinite(number)
    ? number
    : fallback;
}


function getOutputElement() {
  return (
    document.getElementById("output") ||
    document.getElementById("results")
  );
}


function getFindButton() {
  return (
    document.querySelector("button.find") ||
    document.querySelector("button.primary") ||
    document.querySelector(
      'button[onclick="findCars()"]'
    ) ||
    Array.from(
      document.querySelectorAll("button")
    ).find(button =>
      /nájsť moje auto/i.test(
        button.textContent || ""
      )
    ) ||
    null
  );
}


// ============================================================
// STATUS
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
    document.createElement("div");

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


function setButtonBusy(busy) {
  const button =
    getFindButton();

  if (!button) {
    return;
  }

  button.disabled =
    Boolean(busy);

  button.style.opacity =
    busy ? "0.65" : "1";

  button.style.cursor =
    busy ? "wait" : "pointer";

  if (busy) {
    if (
      !button.dataset.originalText
    ) {
      button.dataset.originalText =
        button.textContent;
    }

    button.textContent =
      "HĽADÁM…";
  } else {
    if (
      button.dataset.originalText
    ) {
      button.textContent =
        button.dataset.originalText;
    }
  }
}


// ============================================================
// FEEDBACK
// ============================================================

function vibrateSuccess() {
  try {
    if (
      "vibrate" in navigator
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

    const context =
      new AudioContextClass();

    const now =
      context.currentTime;

    const oscillator =
      context.createOscillator();

    const gain =
      context.createGain();

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

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start(now);
    oscillator.stop(
      now + 0.24
    );

    oscillator.addEventListener(
      "ended",
      () => {
        context.close()
          .catch(() => {});
      }
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
  return (
    Boolean(SUPABASE_URL) &&
    Boolean(SUPABASE_ANON_KEY) &&
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
    typeof window.supabase.createClient ===
      "function"
  ) {
    return Promise.resolve(
      window.supabase
    );
  }

  if (supabaseScriptPromise) {
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
                typeof window.supabase.createClient ===
                  "function"
              ) {
                resolve(
                  window.supabase
                );
              } else {
                reject(
                  new Error(
                    "Supabase JS sa nespustil."
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

        script.async = true;

        script.dataset.carmatchSupabase =
          "1";

        script.onload = () => {
          if (
            window.supabase &&
            typeof window.supabase.createClient ===
              "function"
          ) {
            resolve(
              window.supabase
            );
          } else {
            reject(
              new Error(
                "Supabase JS sa nespustil."
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
      "Supabase URL alebo anon key nie sú nastavené."
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
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false
        }
      }
    );

  return supabaseClient;
}


async function ensureAnonymousSession() {
  const client =
    await getSupabaseClient();

  const existing =
    await client.auth.getSession();

  const existingSession =
    existing?.data?.session;

  if (
    existingSession &&
    existingSession.access_token
  ) {
    return existingSession;
  }

  const signIn =
    await client.auth.signInAnonymously();

  if (signIn?.error) {
    throw new Error(
      safeDisplayText(
        signIn.error.message,
        "Anonymné prihlásenie do Supabase zlyhalo."
      )
    );
  }

  const session =
    signIn?.data?.session;

  if (
    !session ||
    !session.access_token
  ) {
    throw new Error(
      "Supabase nevytvoril platnú reláciu."
    );
  }

  return session;
}


async function getAccessToken() {
  const client =
    await getSupabaseClient();

  const current =
    await client.auth.getSession();

  const currentSession =
    current?.data?.session;

  if (
    currentSession &&
    currentSession.access_token
  ) {
    return currentSession.access_token;
  }

  const session =
    await ensureAnonymousSession();

  return session.access_token;
}


// ============================================================
// REQUEST
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
    .slice(0, 3000);
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
    /^(ľubovoľn|ľubovoľný|ľubovoľná|ľubovoľné|any|all)$/i.test(
      clean
    )
  ) {
    return fallback;
  }

  return clean.slice(
    0,
    500
  );
}


function buildRequestPayload() {
  const budget =
    readNumber(
      ["budget"],
      ""
    );

  const seats =
    readNumber(
      ["seats"],
      ""
    );

  const power =
    readNumber(
      ["power"],
      ""
    );

  const trunk =
    readNumber(
      ["trunk"],
      ""
    );

  const length =
    readNumber(
      ["length"],
      ""
    );

  return {
    naturalLanguage:
      getNaturalLanguage(),

    filters: {
      budget:
        budget === ""
          ? ""
          : String(budget),

      seats:
        seats === ""
          ? ""
          : String(seats),

      power:
        power === ""
          ? ""
          : String(power),

      trunk:
        trunk === ""
          ? ""
          : String(trunk),

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
        length === ""
          ? ""
          : String(length),

      year:
        readValue(
          ["year"],
          ""
        ),

      avoid:
        readValue(
          [
            "avoid",
            "excludedBrands",
            "exclude"
          ],
          ""
        ).slice(0, 500)
    }
  };
}


// ============================================================
// FETCH HELPERS
// ============================================================

function fetchWithTimeout(
  url,
  options = {},
  timeout = REQUEST_TIMEOUT
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      timeout
    );

  return fetch(
    url,
    {
      ...options,
      signal:
        controller.signal
    }
  ).finally(() => {
    clearTimeout(timer);
  });
}


async function parseResponseBody(
  response
) {
  const raw =
    await response.text();

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch (_) {
    return {
      error:
        "Invalid JSON response",
      message:
        raw.slice(0, 1000)
    };
  }
}


function createApiError(
  response,
  data
) {
  const status =
    response.status;

  const message =
    safeDisplayText(
      data?.message ??
      data?.error ??
      data?.detail ??
      data,
      `Server vrátil chybu HTTP ${status}.`
    );

  const error =
    new Error(message);

  error.status =
    status;

  error.payload =
    data;

  return error;
}


// ============================================================
// API SEARCH
// ============================================================

async function performSearch(
  payload
) {
  let token =
    await getAccessToken();

  let response =
    await fetchWithTimeout(
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
          JSON.stringify(payload),

        cache:
          "no-store"
      }
    );


  // Retry once with a fresh token.
  if (response.status === 401) {
    try {
      const client =
        await getSupabaseClient();

      await client.auth.signOut();

      const session =
        await ensureAnonymousSession();

      token =
        session.access_token;

      response =
        await fetchWithTimeout(
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
              JSON.stringify(payload),

            cache:
              "no-store"
          }
        );
    } catch (retryError) {
      throw retryError;
    }
  }


  const data =
    await parseResponseBody(
      response
    );


  if (!response.ok) {
    throw createApiError(
      response,
      data
    );
  }


  if (
    !Array.isArray(data?.cars)
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


  if (data.cars.length !== 3) {
    const error =
      new Error(
        "Server nevrátil presne 3 vozidlá."
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
// IMAGES
// ============================================================

function bestImageForCar(car) {
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


function imageSourceForCar(car) {
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


function renderImage(car) {
  const image =
    bestImageForCar(car);

  if (!image) {
    return `
      <div
        style="
          min-height:220px;
          display:flex;
          align-items:center;
          justify-content:center;
          background:#f1f2f4;
          color:#777;
          font-size:14px;
        "
      >
        Foto sa nepodarilo nájsť
      </div>
    `;
  }


  const source =
    imageSourceForCar(car);


  const sourceHtml =
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
        "
        onerror="
          this.style.display='none';
          this.parentElement.classList.add('carmatch-photo-error');
        "
      >

      ${sourceHtml}
    </div>
  `;
}


// ============================================================
// LISTS
// ============================================================

function renderList(
  items,
  emptyText
) {
  const safeItems =
    Array.isArray(items)
      ? items
          .map(item =>
            safeDisplayText(
              item,
              ""
            )
          )
          .filter(Boolean)
          .slice(0, 6)
      : [];


  if (!safeItems.length) {
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
        `<li>${escapeHTML(item)}</li>`
    )
    .join("");
}


// ============================================================
// CAR CARD
// ============================================================

function renderCarCard(
  car,
  index
) {
  const score =
    clampScore(
      car?.score
    );


  const year =
    safeNumber(
      car?.year,
      null
    );


  const seats =
    safeNumber(
      car?.seats,
      null
    );


  const image =
    renderImage(car);


  const priceSource =
    safeHTTPSUrl(
      car?.priceSource
    );


  const configurator =
    safeHTTPSUrl(
      car?.configurator
    );


  const dataSources =
    Array.isArray(
      car?.dataSources
    )
      ? car.dataSources
          .map(
            source =>
              safeHTTPSUrl(
                source
              )
          )
          .filter(Boolean)
          .filter(
            (
              source,
              i,
              all
            ) =>
              all.indexOf(
                source
              ) === i
          )
          .slice(0, 6)
      : [];


  return `
    <article
      class="carmatch-car-card"
      style="
        background:#fff;
        border-radius:20px;
        overflow:hidden;
        box-shadow:
          0 8px 28px
          rgba(0,0,0,.08);
        border:
          1px solid #ececec;
      "
    >

      <div
        class="carmatch-photo-wrap"
      >
        ${image}
      </div>


      <div
        style="
          padding:18px;
        "
      >

        <div
          style="
            font-size:12px;
            font-weight:800;
            letter-spacing:.08em;
            color:#6b6b6b;
            text-transform:uppercase;
          "
        >
          #${index + 1}
          NAJLEPŠIA ZHODA
        </div>


        <h3
          style="
            margin:
              7px 0 4px;
            font-size:22px;
            line-height:1.15;
          "
        >
          ${formatText(
            car?.name,
            "Neznáme vozidlo"
          )}
        </h3>


        <div
          style="
            font-size:13px;
            color:#666;
            margin-bottom:12px;
          "
        >
          ${formatText(
            car?.generation,
            "Generácia neoverená"
          )}

          ·

          ${
            year !== null
              ? escapeHTML(
                  String(
                    Math.round(year)
                  )
                )
              : "—"
          }
        </div>


        <div
          style="
            display:inline-block;
            padding:
              7px 10px;
            border-radius:
              999px;
            background:#f0f1f3;
            font-size:14px;
            font-weight:800;
            margin-bottom:12px;
          "
        >
          Zhoda ${score}%
        </div>


        <div
          style="
            font-size:14px;
            line-height:1.8;
            color:#3e3e3e;
          "
        >
          <div>
            <strong>Cena:</strong>
            ${formatPrice(
              car?.price
            )}
          </div>

          <div>
            <strong>Výkon:</strong>
            ${formatText(
              car?.power
            )}
          </div>

          <div>
            <strong>Sedadlá:</strong>
            ${
              seats !== null
                ? escapeHTML(
                    String(
                      Math.round(
                        seats
                      )
                    )
                  )
                : "—"
            }
          </div>

          <div>
            <strong>Kufor:</strong>
            ${formatText(
              car?.trunk
            )}
          </div>

          <div>
            <strong>Pohon:</strong>
            ${formatText(
              car?.drive
            )}
          </div>

          <div>
            <strong>Palivo:</strong>
            ${formatText(
              car?.fuel
            )}
          </div>
        </div>


        <div
          style="
            margin-top:15px;
          "
        >
          <strong>
            Prečo:
          </strong>

          <div
            style="
              margin-top:5px;
              color:#555;
              line-height:1.6;
            "
          >
            ${formatText(
              car?.reason,
              "Spĺňa zadané požiadavky."
            )}
          </div>
        </div>


        <div
          style="
            display:grid;
            grid-template-columns:
              1fr 1fr;
            gap:14px;
            margin-top:16px;
          "
        >

          <div>
            <strong>
              Výhody
            </strong>

            <ul
              style="
                padding-left:18px;
                margin:
                  7px 0;
                line-height:1.6;
                color:#555;
              "
            >
              ${renderList(
                car?.pros,
                "Neboli uvedené."
              )}
            </ul>
          </div>


          <div>
            <strong>
              Nevýhody
            </strong>

            <ul
              style="
                padding-left:18px;
                margin:
                  7px 0;
                line-height:1.6;
                color:#555;
              "
            >
              ${renderList(
                car?.cons,
                "Neboli uvedené."
              )}
            </ul>
          </div>

        </div>


        <div
          style="
            margin-top:14px;
          "
        >
          <strong>
            Údržba
          </strong>

          <div
            style="
              margin-top:5px;
              color:#555;
              line-height:1.6;
            "
          >
            ${formatText(
              car?.maintenance,
              "Údaje o údržbe nie sú uvedené."
            )}
          </div>
        </div>


        <div
          style="
            display:flex;
            flex-wrap:wrap;
            gap:8px;
            margin-top:16px;
          "
        >

          ${
            priceSource
              ? `
                <a
                  href="${escapeHTML(
                    priceSource
                  )}"
                  target="_blank"
                  rel="noopener noreferrer"
                  style="
                    display:inline-block;
                    padding:
                      9px 12px;
                    border-radius:
                      10px;
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
                    padding:
                      9px 12px;
                    border-radius:
                      10px;
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
              <div
                style="
                  margin-top:12px;
                  font-size:12px;
                  line-height:1.7;
                "
              >
                <strong>
                  Zdroje:
                </strong>

                ${dataSources
                  .map(
                    (
                      source,
                      sourceIndex
                    ) => `
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

function applyResponsiveStyles() {
  const styleId =
    "carmatch-results-responsive";

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
    @media (max-width: 900px) {
      #output .carmatch-results-grid {
        grid-template-columns:1fr !important;
      }
    }

    @media (max-width: 560px) {
      #output .carmatch-car-card ul {
        font-size:13px;
      }

      #output .carmatch-car-card h3 {
        font-size:20px !important;
      }
    }
  `;

  document.head.appendChild(
    style
  );
}


function updateRemaining(
  remaining
) {
  const number =
    safeNumber(
      remaining,
      null
    );

  if (number === null) {
    return;
  }

  setStatus(
    `Zostáva ${Math.max(
      0,
      Math.round(number)
    )} vyhľadávaní dnes.`
  );
}


function renderResults(data) {
  const output =
    getOutputElement();

  if (!output) {
    return;
  }

  const cars =
    Array.isArray(
      data?.cars
    )
      ? data.cars.slice(0, 3)
      : [];


  if (cars.length !== 3) {
    renderError(
      "Server nevrátil presne 3 vozidlá.",
      502,
      data
    );

    return;
  }


  output.innerHTML = `
    <div
      style="
        margin-top:20px;
      "
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


  applyResponsiveStyles();

  updateRemaining(
    data?.remaining
  );
}


// ============================================================
// ERROR
// ============================================================

function renderError(
  message,
  status = null,
  payload = null
) {
  const output =
    getOutputElement();

  const safeMessage =
    safeDisplayText(
      message,
      "Nastala chyba."
    );


  if (!output) {
    setStatus(
      safeMessage,
      true
    );

    return;
  }


  let finalMessage =
    safeMessage;


  if (status === 429) {
    finalMessage =
      safeDisplayText(
        payload?.message,
        "Denný limit vyhľadávaní bol dosiahnutý."
      );
  }


  if (status === 503) {
    finalMessage =
      safeDisplayText(
        payload?.message,
        "AI je momentálne nedostupná. Vyhľadávanie sa podľa servera nezapočítalo do limitu."
      );
  }


  output.innerHTML = `
    <div
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
        finalMessage
      )}
    </div>
  `;


  if (
    status === 429 ||
    status === 503
  ) {
    updateRemaining(
      payload?.remaining
    );
  } else {
    setStatus(
      finalMessage,
      true
    );
  }
}


// ============================================================
// MAIN
// ============================================================

async function findCars() {
  if (activeRequest) {
    return;
  }


  activeRequest = true;

  setButtonBusy(
    true
  );

  setStatus(
    "Pripravujem vyhľadávanie…"
  );


  const output =
    getOutputElement();

  if (output) {
    output.innerHTML =
      "";
  }


  try {
    const payload =
      buildRequestPayload();


    const hasAnyFilter =
      Object.values(
        payload.filters
      ).some(
        value =>
          safeDisplayText(
            value,
            ""
          ).trim() !== ""
      );


    if (
      !payload.naturalLanguage &&
      !hasAnyFilter
    ) {
      throw new Error(
        "Zadaj aspoň jednu požiadavku alebo nastav filter."
      );
    }


    setStatus(
      "Vyhľadávam vhodné autá…"
    );


    const data =
      await performSearch(
        payload
      );


    renderResults(
      data
    );


    updateRemaining(
      data?.remaining
    );


    setStatus(
      Number.isFinite(
        Number(
          data?.remaining
        )
      )
        ? `Hotovo · zostáva ${Math.max(
            0,
            Math.round(
              Number(
                data.remaining
              )
            )
          )} vyhľadávaní dnes.`
        : "Hotovo."
    );


    answerReadyFeedback();

  } catch (error) {
    console.error(
      "CARMATCH AI:",
      error
    );


    const status =
      safeNumber(
        error?.status,
        null
      );


    const message =
      safeDisplayText(
        error?.message,
        "Vyhľadávanie sa nepodarilo dokončiť."
      );


    renderError(
      message,
      status,
      error?.payload
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


  if (
    document.getElementById(
      "carmatch-helper"
    )
  ) {
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
// START
// ============================================================

function startCarmatch() {
  addMissingHelperText();
  ensureStatusElement();
}


window.findCars =
  findCars;


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