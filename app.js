"use strict";

/* ============================================================
   CARMATCH AI - FINAL FRONTEND v16
   ============================================================
   - Uses Supabase configuration from index.html
   - No old Supabase project fallback
   - Supabase anonymous authentication
   - 5 searches/day
   - Search refund support
   - Exactly 3 cars
   - Image candidates + automatic image fallback
   - Current price display
   - Slovak UI
   - kW + HP
   - Dark / Light mode compatible
   - Premium frontend v15 compatible
   - Fixed search button selectors
   - Better number parsing
   ============================================================ */


/* ============================================================
   CONFIGURATION
   ============================================================ */

const CONFIG = window.CARMATCH_CONFIG || {
  supabaseUrl: "https://ltqjgvrphjinsjvyaxrb.supabase.co",
  supabaseAnonKey: "",
  apiEndpoint: "/api/search"
};

const API_ENDPOINT =
  CONFIG.apiEndpoint || "/api/search";

const MAX_SEARCH_TEXT = 3000;
const MAX_FILTER_TEXT = 500;

let supabaseClient = null;
let searching = false;


/* ============================================================
   BASIC HELPERS
   ============================================================ */

function $(id) {
  return document.getElementById(id);
}


function text(value, fallback = "") {

  if (
    value === null ||
    value === undefined
  ) {
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
      .map(v => text(v))
      .filter(Boolean)
      .join(", ") || fallback;
  }

  if (typeof value === "object") {

    for (
      const key of [
        "message",
        "error",
        "text",
        "value",
        "name",
        "description",
        "reason"
      ]
    ) {

      if (value[key] !== undefined) {

        const result =
          text(value[key]);

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


function esc(value) {

  return text(value).replace(
    /[&<>"']/g,
    char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    }[char])
  );
}


function safeUrl(value) {

  try {

    const url =
      new URL(String(value || ""));

    return url.protocol === "https:"
      ? url.href
      : "";

  } catch (_) {

    return "";
  }
}


/* ============================================================
   NUMBER PARSING
   ============================================================ */

function parseNumber(value) {

  let raw =
    text(value, "")
      .replace(/\u00A0/g, " ")
      .trim();

  if (!raw) {
    return "";
  }

  /*
   Supports examples such as:
   50 000 €
   50.000 €
   50,000 €
   4,8 m
   600 l
   200 kW
  */

  raw =
    raw.replace(
      /[€$£]|EUR|USD|GBP|kW|KW|kw|hp|HP|PS|ks|l|L|m\b/gi,
      ""
    );

  raw =
    raw.replace(/\s+/g, "");

  /*
   European decimal:
   4,8 -> 4.8
  */

  if (
    raw.includes(",") &&
    !raw.includes(".")
  ) {
    raw =
      raw.replace(",", ".");
  }

  /*
   Thousands separator:
   50.000 -> 50000
  */

  if (
    raw.includes(".") &&
    /^\d{1,3}(?:\.\d{3})+$/.test(raw)
  ) {
    raw =
      raw.replace(/\./g, "");
  }

  const number =
    Number(raw);

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

  const raw =
    getValue(id);

  if (!raw) {
    return "";
  }

  const number =
    parseNumber(raw);

  return number === ""
    ? ""
    : String(number);
}


/* ============================================================
   POWER DISPLAY
   ============================================================ */

function formatPowerDisplay(value) {

  const raw =
    text(value, "")
      .replace(/,/g, ".")
      .trim();

  if (!raw) {
    return "—";
  }

  const kwMatch =
    raw.match(
      /(\d+(?:\.\d+)?)\s*kW\b/i
    );

  if (kwMatch) {

    const kw =
      Number(kwMatch[1]);

    if (
      Number.isFinite(kw) &&
      kw > 0
    ) {

      const hp =
        Math.round(
          kw * 1.34102209
        );

      return `${Math.round(kw)} kW (${hp} HP)`;
    }
  }


  const hpMatch =
    raw.match(
      /(\d+(?:\.\d+)?)\s*(?:hp|horsepower|bhp|ps|ks|cv)\b/i
    );

  if (hpMatch) {

    const hp =
      Number(hpMatch[1]);

    if (
      Number.isFinite(hp) &&
      hp > 0
    ) {

      const kw =
        Math.round(
          (hp / 1.34102209) * 10
        ) / 10;

      const mechanicalHp =
        Math.round(
          kw * 1.34102209
        );

      return `${kw} kW (${mechanicalHp} HP)`;
    }
  }


  const bare =
    Number(raw);

  if (
    Number.isFinite(bare) &&
    bare > 0
  ) {

    const hp =
      Math.round(
        bare * 1.34102209
      );

    return `${Math.round(bare)} kW (${hp} HP)`;
  }

  return raw;
}


/* ============================================================
   STATUS
   ============================================================ */

function setStatus(
  message = "",
  type = ""
) {

  const el =
    $("status");

  if (!el) {
    return;
  }

  el.className =
    `status${type ? ` ${type}` : ""}`;

  el.textContent =
    message;
}


/* ============================================================
   CHARACTER COUNTER
   ============================================================ */

function updateCharCount() {

  const input =
    $("aiRequest");

  const counter =
    $("charCount");

  if (
    !input ||
    !counter
  ) {
    return;
  }

  counter.textContent =
    `${input.value.length} / ${MAX_SEARCH_TEXT}`;
}


/* ============================================================
   SEARCH BUTTON
   ============================================================ */

function setButtonBusy(isBusy) {

  const button =
    $("searchButton");

  if (!button) {
    return;
  }

  button.disabled =
    isBusy;


  /*
   New premium HTML uses:
   .search-button-text
   .search-button-arrow
  */

  const label =
    button.querySelector(
      ".search-button-text"
    );

  const arrow =
    button.querySelector(
      ".search-button-arrow"
    );


  if (label) {

    label.textContent =
      isBusy
        ? "Vyhľadávam…"
        : "Nájsť moje auto";
  }


  if (arrow) {

    arrow.textContent =
      isBusy
        ? "•••"
        : "→";
  }


  /*
   Backwards compatibility with older design
  */

  const oldLabel =
    button.querySelector(
      ".button-label"
    );

  const oldIcon =
    button.querySelector(
      ".button-icon"
    );

  if (oldLabel) {

    oldLabel.textContent =
      isBusy
        ? "Vyhľadávam…"
        : "Nájsť moje auto";
  }

  if (oldIcon) {

    oldIcon.textContent =
      isBusy
        ? "•"
        : "⌕";
  }
}


/* ============================================================
   PAYLOAD
   ============================================================ */

function buildPayload() {

  return {

    naturalLanguage:
      getValue("aiRequest")
        .slice(
          0,
          MAX_SEARCH_TEXT
        ),

    filters: {

      budget:
        getNumber("budget"),

      seats:
        getNumber("seats"),

      power:
        getNumber("power"),

      trunk:
        getNumber("trunk"),

      drive:
        getValue("drive"),

      fuel:
        getValue("fuel"),

      body:
        getValue("body"),

      style:
        getValue("style"),

      length:
        getNumber("length"),

      year:
        getNumber("year"),

      avoid:
        getValue("avoidBrands")
          .slice(
            0,
            MAX_FILTER_TEXT
          )
    }
  };
}


function hasSearchInput(payload) {

  if (
    payload.naturalLanguage
  ) {
    return true;
  }

  return Object.values(
    payload.filters
  ).some(
    value =>
      String(value || "")
        .trim() !== ""
  );
}


/* ============================================================
   SUPABASE CLIENT
   ============================================================ */

async function ensureSupabaseClient() {

  if (supabaseClient) {
    return supabaseClient;
  }

  const url =
    String(
      CONFIG.supabaseUrl || ""
    ).trim();

  const key =
    String(
      CONFIG.supabaseAnonKey || ""
    ).trim();


  if (!url) {

    throw new Error(
      "Supabase URL nie je nastavená."
    );
  }


  if (!key) {

    throw new Error(
      "Supabase Publishable key nie je nastavený."
    );
  }


  if (
    !key.startsWith(
      "sb_publishable_"
    )
  ) {

    throw new Error(
      "Supabase používa nesprávny API kľúč. Použi Publishable key zo Supabase."
    );
  }


  if (
    !window.supabase ||
    !window.supabase.createClient
  ) {

    throw new Error(
      "Nepodarilo sa načítať Supabase."
    );
  }


  supabaseClient =
    window.supabase.createClient(
      url,
      key,
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


/* ============================================================
   SUPABASE AUTH
   ============================================================ */

async function getAccessToken() {

  const client =
    await ensureSupabaseClient();


  let current;

  try {

    current =
      await client.auth.getSession();

  } catch (error) {

    throw new Error(
      `Supabase: ${text(
        error?.message,
        "Nepodarilo sa načítať reláciu."
      )}`
    );
  }


  const currentToken =
    current?.data?.session
      ?.access_token;


  if (currentToken) {
    return currentToken;
  }


  let signIn;

  try {

    signIn =
      await client.auth
        .signInAnonymously();

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
    signIn
      ?.data
      ?.session
      ?.access_token;


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

async function postSearch(payload) {

  let token;


  try {

    token =
      await getAccessToken();

  } catch (error) {

    throw Object.assign(
      new Error(
        text(
          error?.message,
          "Nepodarilo sa prihlásiť."
        )
      ),
      {
        code: "AUTH"
      }
    );
  }


  let response;


  try {

    response =
      await fetch(
        API_ENDPOINT,
        {
          method: "POST",

          headers: {

            "Content-Type":
              "application/json",

            "Authorization":
              `Bearer ${token}`
          },

          body:
            JSON.stringify(payload),

          cache:
            "no-store"
        }
      );

  } catch (_) {

    throw Object.assign(
      new Error(
        "Nepodarilo sa spojiť so serverom. Vyhľadávanie sa nemuselo započítať do limitu."
      ),
      {
        code:
          "FETCH_FAILED"
      }
    );
  }


  const raw =
    await response.text();


  let data = {};


  try {

    data =
      raw
        ? JSON.parse(raw)
        : {};

  } catch (_) {

    data = {

      message:
        raw ||
        "Server vrátil neplatnú odpoveď."
    };
  }


  if (!response.ok) {

    const error =
      new Error(
        text(
          data?.message ||
          data?.error,
          `Server vrátil chybu ${response.status}.`
        )
      );

    error.status =
      response.status;

    error.payload =
      data;

    throw error;
  }


  if (
    !Array.isArray(
      data.cars
    ) ||
    data.cars.length !== 3
  ) {

    throw Object.assign(
      new Error(
        "Server nevrátil presne 3 vozidlá."
      ),
      {
        code:
          "BAD_RESULT",

        payload:
          data
      }
    );
  }


  return data;
}


/* ============================================================
   IMAGE HANDLING
   ============================================================ */

function imageUrls(car) {

  const urls = [];


  const direct =
    safeUrl(
      car?.image
    );


  if (direct) {
    urls.push(direct);
  }


  if (
    Array.isArray(
      car?.imageCandidates
    )
  ) {

    for (
      const candidate
      of car.imageCandidates
    ) {

      const url =
        safeUrl(
          candidate?.url
        );


      if (
        url &&
        !urls.includes(url)
      ) {

        urls.push(url);
      }


      if (
        urls.length >= 6
      ) {
        break;
      }
    }
  }


  return urls;
}


function bestImage(car) {

  return imageUrls(car)[0] || "";
}


function sourceUrl(car) {

  const direct =
    safeUrl(
      car?.photoSource
    );


  if (direct) {
    return direct;
  }


  if (
    Array.isArray(
      car?.imageCandidates
    )
  ) {

    for (
      const candidate
      of car.imageCandidates
    ) {

      const source =
        safeUrl(
          candidate?.source
        );


      if (source) {
        return source;
      }
    }
  }


  return "";
}


/* ============================================================
   IMAGE FALLBACK
   ============================================================ */

window.carmatchNextImage =
  function(img) {

    try {

      const candidates =
        JSON.parse(
          img.getAttribute(
            "data-candidates"
          ) || "[]"
        );


      const current =
        Number(
          img.getAttribute(
            "data-image-index"
          ) || "0"
        );


      const next =
        current + 1;


      if (
        Array.isArray(
          candidates
        ) &&
        next <
          candidates.length
      ) {

        img.setAttribute(
          "data-image-index",
          String(next)
        );


        img.src =
          candidates[next];

        return;
      }


      img.style.display =
        "none";


      const fallback =
        img.nextElementSibling;


      if (fallback) {

        fallback.hidden =
          false;
      }

    } catch (_) {

      img.style.display =
        "none";
    }
  };


/* ============================================================
   IMAGE RENDER
   ============================================================ */

function renderImage(car) {

  const urls =
    imageUrls(car);


  if (!urls.length) {

    return `
      <div class="empty-image">
        Fotografia pre túto konkrétnu generáciu nebola spoľahlivo nájdená.
      </div>
    `;
  }


  return `
    <img
      src="${esc(urls[0])}"
      alt="${esc(
        car?.name ||
        "Vozidlo"
      )}"
      loading="lazy"
      decoding="async"
      referrerpolicy="no-referrer"
      data-candidates="${esc(
        JSON.stringify(urls)
      )}"
      data-image-index="0"
      onerror="window.carmatchNextImage(this)"
    >

    <div
      class="empty-image"
      hidden
    >
      Fotografia sa nepodarilo načítať.
    </div>
  `;
}


/* ============================================================
   LIST RENDER
   ============================================================ */

function renderList(
  items,
  empty = "Neboli uvedené."
) {

  const safeItems =
    Array.isArray(items)
      ? items
          .map(
            v => text(v)
          )
          .filter(Boolean)
          .slice(0, 6)
      : [];


  if (
    !safeItems.length
  ) {

    return `
      <li>
        ${esc(empty)}
      </li>
    `;
  }


  return safeItems
    .map(
      item =>
        `<li>${esc(item)}</li>`
    )
    .join("");
}


/* ============================================================
   CAR CARD
   ============================================================ */

function renderCard(
  car,
  index
) {

  const score =
    Math.max(
      0,
      Math.min(
        100,
        Math.round(
          Number(
            car?.score
          ) || 0
        )
      )
    );


  const imageSource =
    sourceUrl(car);


  const priceSource =
    safeUrl(
      car?.priceSource
    );


  const configurator =
    safeUrl(
      car?.configurator
    );


  const year =
    Number.isFinite(
      Number(car?.year)
    )
      ? String(
          car.year
        )
      : "—";


  const seats =
    Number.isFinite(
      Number(car?.seats)
    )
      ? String(
          car.seats
        )
      : "—";


  const brand =
    text(
      car?.brand,
      ""
    );


  const model =
    text(
      car?.model,
      ""
    );


  const category =
    text(
      car?.category,
      ""
    );


  const trim =
    text(
      car?.trim,
      ""
    );


  const engine =
    text(
      car?.engine,
      ""
    );


  const consumption =
    text(
      car?.consumptionWltp,
      ""
    );


  const power =
    formatPowerDisplay(
      car?.power
    );


  const dataSources =
    Array.isArray(
      car?.dataSources
    )
      ? car.dataSources
          .map(
            safeUrl
          )
          .filter(Boolean)
          .filter(
            (v, i, a) =>
              a.indexOf(v) === i
          )
          .slice(0, 6)
      : [];


  const carName =
    brand && model
      ? `${brand} ${model}`
      : text(
          car?.name,
          "Neznáme vozidlo"
        );


  const price =
    text(
      car?.price,
      ""
    );


  return `
    <article
      class="carmatch-car-card"
    >

      <div
        class="carmatch-photo-wrap"
      >
        ${renderImage(car)}
      </div>


      <div class="card-body">

        <div class="card-rank">
          #${index + 1} najlepšia zhoda
        </div>


        <h3 class="card-title">
          ${esc(carName)}
        </h3>


        <div class="card-subtitle">

          ${
            trim
              ? `Výbava: ${esc(trim)}`
              : "Výbava: neoverená"
          }

          ${
            category
              ? ` · Kategória: ${esc(category)}`
              : ""
          }

          ${
            car?.generation
              ? ` · ${esc(car.generation)}`
              : ""
          }

          ${
            year !== "—"
              ? ` · ${esc(year)}`
              : ""
          }

        </div>


        <div class="score-pill">
          Zhoda ${score}%
        </div>


        <div class="spec-grid">


          <div class="spec-item">
            <b>Cena</b>
            <span>
              ${esc(
                price ||
                "Cena na vyžiadanie"
              )}
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
              ${esc(
                consumption ||
                "—"
              )}
            </span>
          </div>


          <div class="spec-item">
            <b>Motor</b>
            <span>
              ${esc(
                engine ||
                "—"
              )}
            </span>
          </div>


          <div class="spec-item">
            <b>Sedadlá</b>
            <span>
              ${esc(seats)}
            </span>
          </div>


          <div class="spec-item">
            <b>Kufor</b>
            <span>
              ${esc(
                car?.trunk ||
                "—"
              )}
            </span>
          </div>


          <div class="spec-item">
            <b>Pohon</b>
            <span>
              ${esc(
                car?.drive ||
                "—"
              )}
            </span>
          </div>


          <div class="spec-item">
            <b>Palivo</b>
            <span>
              ${esc(
                car?.fuel ||
                "—"
              )}
            </span>
          </div>


          <div class="spec-item">
            <b>Prevodovka</b>
            <span>
              ${esc(
                car?.transmission ||
                "—"
              )}
            </span>
          </div>


          <div class="spec-item">
            <b>Karoséria</b>
            <span>
              ${esc(
                car?.body ||
                category ||
                "—"
              )}
            </span>
          </div>


        </div>


        <div class="card-reason">

          <strong>
            Prečo:
          </strong>

          ${esc(
            car?.reason ||
            "Spĺňa zadané požiadavky."
          )}

        </div>


        <div class="card-columns">


          <div>

            <h4>
              Výhody
            </h4>

            <ul>
              ${renderList(
                car?.pros
              )}
            </ul>

          </div>


          <div>

            <h4>
              Nevýhody
            </h4>

            <ul>
              ${renderList(
                car?.cons
              )}
            </ul>

          </div>


        </div>


        <div class="maintenance">

          <h4>
            Údržba
          </h4>

          ${esc(
            car?.maintenance ||
            "Údaje o údržbe nie sú uvedené."
          )}

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
                  Oficiálny konfigurátor
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
                  Zdroj foto
                </a>
              `
              : ""
          }


        </div>


        ${
          dataSources.length
            ? `
              <div class="source-links">

                Zdroje:

                ${
                  dataSources
                    .map(
                      (url, i) =>
                        `
                          <a
                            href="${esc(url)}"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            ${i + 1}
                          </a>
                        `
                    )
                    .join("")
                }

              </div>
            `
            : ""
        }


      </div>

    </article>
  `;
}


/* ============================================================
   RESULTS
   ============================================================ */

function renderResults(data) {

  const section =
    $("resultsSection");

  const results =
    $("results");


  if (
    !section ||
    !results
  ) {
    return;
  }


  results.innerHTML =
    data.cars
      .slice(0, 3)
      .map(
        renderCard
      )
      .join("");


  section.hidden =
    false;


  const count =
    $("resultsCount");


  if (count) {

    count.textContent =
      "3 odporúčania";
  }


  requestAnimationFrame(
    () => {

      section.scrollIntoView({
        behavior:
          "smooth",

        block:
          "start"
      });

    }
  );
}


/* ============================================================
   ERROR DISPLAY
   ============================================================ */

function renderError(error) {

  const results =
    $("results");

  const section =
    $("resultsSection");


  if (
    !results ||
    !section
  ) {
    return;
  }


  let message =
    text(
      error?.message,
      "Vyhľadávanie sa nepodarilo dokončiť."
    );


  if (
    error?.status === 429
  ) {

    message =
      text(
        error?.payload?.message,
        "Denný limit vyhľadávaní bol dosiahnutý."
      );

  } else if (
    error?.status === 503
  ) {

    message =
      text(
        error?.payload?.message,
        "AI je momentálne nedostupná. Toto vyhľadávanie sa podľa servera nezapočítalo do limitu."
      );
  }


  results.innerHTML =
    `
      <div class="inline-error">
        ${esc(message)}
      </div>
    `;


  section.hidden =
    false;
}


/* ============================================================
   SUCCESS FEEDBACK
   ============================================================ */

function successFeedback() {

  try {

    if (
      navigator.vibrate
    ) {

      navigator.vibrate([
        70,
        40,
        100
      ]);
    }

  } catch (_) {}


  try {

    const AudioContextClass =
      window.AudioContext ||
      window.webkitAudioContext;


    if (!AudioContextClass) {
      return;
    }


    const ctx =
      new AudioContextClass();


    const now =
      ctx.currentTime;


    const osc =
      ctx.createOscillator();


    const gain =
      ctx.createGain();


    osc.type =
      "sine";


    osc.frequency.setValueAtTime(
      660,
      now
    );


    osc.frequency.setValueAtTime(
      880,
      now + 0.08
    );


    gain.gain.setValueAtTime(
      0.0001,
      now
    );


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


    osc.stop(
      now + 0.24
    );


    osc.addEventListener(
      "ended",
      () =>
        ctx.close().catch(
          () => {}
        )
    );

  } catch (_) {}
}


/* ============================================================
   MAIN SEARCH
   ============================================================ */

async function findCars() {

  if (searching) {
    return;
  }


  const payload =
    buildPayload();


  if (
    !hasSearchInput(
      payload
    )
  ) {

    setStatus(
      "Napíš požiadavku alebo nastav aspoň jeden filter.",
      "error"
    );


    $("aiRequest")?.focus();


    return;
  }


  searching =
    true;


  setButtonBusy(
    true
  );


  setStatus(
    "Hľadám aktuálne modely, ceny, WLTP a konfigurátory…"
  );


  const results =
    $("results");


  const section =
    $("resultsSection");


  if (results) {

    results.innerHTML =
      `
        <div class="inline-error">

          <span class="loading-inline">

            <span class="loading-dot"></span>

            Hľadám vhodné autá…

          </span>

        </div>
      `;
  }


  if (section) {

    section.hidden =
      false;
  }


  try {

    const data =
      await postSearch(
        payload
      );


    renderResults(
      data
    );


    const remaining =
      Number(
        data?.remaining
      );


    setStatus(

      Number.isFinite(
        remaining
      )

        ? `Hotovo · zostáva ${Math.max(
            0,
            Math.round(
              remaining
            )
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


    renderError(
      error
    );


    if (
      error?.code ===
      "FETCH_FAILED"
    ) {

      setStatus(
        "Server sa neozval. Skús to znova; vyhľadávanie sa nemá započítať do limitu.",
        "error"
      );

    } else {

      setStatus(
        text(
          error?.message,
          "Vyhľadávanie sa nepodarilo dokončiť."
        ),
        "error"
      );
    }


  } finally {

    searching =
      false;


    setButtonBusy(
      false
    );
  }
}


/* ============================================================
   EXAMPLE CHIPS
   ============================================================ */

function setupExampleChips() {

  const input =
    $("aiRequest");


  document
    .querySelectorAll(
      ".example-chip"
    )
    .forEach(
      chip => {

        chip.addEventListener(
          "click",
          () => {

            if (!input) {
              return;
            }


            input.value =
              chip.dataset.example ||
              "";


            updateCharCount();


            input.focus();
          }
        );

      }
    );
}


/* ============================================================
   FILTERS
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
   SETUP
   ============================================================ */

function setup() {

  const input =
    $("aiRequest");


  const button =
    $("searchButton");


  input?.addEventListener(
    "input",
    updateCharCount
  );


  input?.addEventListener(
    "keydown",
    event => {

      if (
        (
          event.ctrlKey ||
          event.metaKey
        ) &&
        event.key === "Enter"
      ) {

        event.preventDefault();

        findCars();
      }
    }
  );


  button?.addEventListener(
    "click",
    findCars
  );


  setupExampleChips();


  setupFilters();


  updateCharCount();


  setStatus(
    "Pripravené na vyhľadávanie."
  );
}


/* ============================================================
   START
   ============================================================ */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    setup
  );

} else {

  setup();
}


/* ============================================================
   GLOBAL ACCESS
   ============================================================ */

window.findCars =
  findCars;