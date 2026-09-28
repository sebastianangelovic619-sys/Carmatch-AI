// ============================================================
// CARMATCH AI - FINAL FRONTEND v6.1
// ============================================================
// - Exactly 3 vehicle results
// - Supabase authentication
// - 5 searches/day
// - Network-error refund support
// - Protection against duplicate frontend refunds
// - Multiple Wikimedia image candidates
// - Automatic fallback between vehicle images
// - Broken image skipping
// - Vibration + sound when result is ready
// ============================================================


// ============================================================
// API
// ============================================================

const API_ENDPOINT = "/api/search";


// ============================================================
// DOM
// ============================================================

const searchButton =
  document.getElementById("searchButton");

const statusElement =
  document.getElementById("status");

const resultsElement =
  document.getElementById("results");


// ============================================================
// IMAGE STATE
// ============================================================

const imageStates =
  new WeakMap();


// ============================================================
// FRONTEND REFUND STATE
// ============================================================
//
// Prevents the same browser request from triggering
// the frontend refund more than once.
//

let refundInProgress = false;
let refundCompleted = false;


// ============================================================
// BASIC HELPERS
// ============================================================

function value(id) {
  const element =
    document.getElementById(id);

  if (!element) {
    return "";
  }

  return String(
    element.value ?? ""
  ).trim();
}


function escapeHTML(input) {
  return String(
    input ?? ""
  )
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function escapeAttribute(input) {
  return escapeHTML(input);
}


// ============================================================
// URL VALIDATION
// ============================================================

function isValidImageURL(url) {
  if (!url) {
    return false;
  }

  try {
    const parsed =
      new URL(url);

    if (
      parsed.protocol !== "https:"
    ) {
      return false;
    }

    const hostname =
      parsed.hostname.toLowerCase();

    return (
      hostname ===
        "upload.wikimedia.org" ||
      hostname.endsWith(
        ".wikimedia.org"
      )
    );

  } catch (_) {
    return false;
  }
}


// ============================================================
// PLACEHOLDER
// ============================================================

const PLACEHOLDER_IMAGE =
  "data:image/svg+xml;charset=UTF-8," +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg"
         width="1200"
         height="700"
         viewBox="0 0 1200 700">
      <rect width="1200" height="700" fill="#f1f1f1"/>
      <text
        x="600"
        y="350"
        text-anchor="middle"
        dominant-baseline="middle"
        font-family="Arial, sans-serif"
        font-size="42"
        fill="#777">
        Obrázok vozidla nie je dostupný
      </text>
    </svg>
  `);


// ============================================================
// REQUEST COLLECTION
// ============================================================

function collectRequest() {
  return {
    naturalLanguage:
      value("naturalLanguage") ||
      value("searchInput") ||
      value("query"),

    filters: {
      budget:
        value("budget"),

      seats:
        value("seats"),

      minPower:
        value("minPower"),

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

      avoidBrands:
        value("avoidBrands")
          ? value("avoidBrands")
              .split(",")
              .map(item =>
                item.trim()
              )
              .filter(Boolean)
          : []
    },

    resultCount: 3
  };
}


// ============================================================
// SUPABASE ACCESS TOKEN
// ============================================================

async function getSupabaseAccessToken() {
  try {
    if (
      window.supabaseClient &&
      window.supabaseClient.auth &&
      typeof
        window.supabaseClient.auth.getSession ===
        "function"
    ) {
      const result =
        await window.supabaseClient.auth.getSession();

      const token =
        result?.data?.session?.access_token;

      if (token) {
        return token;
      }
    }
  } catch (error) {
    console.warn(
      "supabaseClient session failed:",
      error
    );
  }


  try {
    if (
      window.supabase &&
      window.supabase.auth &&
      typeof
        window.supabase.auth.getSession ===
        "function"
    ) {
      const result =
        await window.supabase.auth.getSession();

      const token =
        result?.data?.session?.access_token;

      if (token) {
        return token;
      }
    }
  } catch (error) {
    console.warn(
      "supabase session failed:",
      error
    );
  }


  // ----------------------------------------------------------
  // LOCAL STORAGE FALLBACK
  // ----------------------------------------------------------

  const possibleKeys = [
    "carmatch_access_token",
    "supabase_access_token",
    "access_token"
  ];

  for (
    const key of possibleKeys
  ) {
    try {
      const token =
        localStorage.getItem(key);

      if (token) {
        return token;
      }
    } catch (_) {
      // Ignore storage errors.
    }
  }


  return null;
}


// ============================================================
// GENERATE SEARCH REQUEST ID
// ============================================================

function generateRequestId() {
  if (
    window.crypto &&
    typeof
      window.crypto.randomUUID ===
      "function"
  ) {
    return window.crypto.randomUUID();
  }

  return (
    Date.now().toString(36) +
    "-" +
    Math.random()
      .toString(36)
      .slice(2, 12)
  );
}


// ============================================================
// FRONTEND REFUND
// ============================================================
//
// Called ONLY when the original request receives no HTTP
// response, e.g. browser-level "Failed to fetch".
//
// Normal HTTP 4xx / 5xx responses are NOT refunded here,
// because the backend handles those itself.
//

async function refundFailedNetworkSearch(
  accessToken
) {
  if (
    refundInProgress ||
    refundCompleted
  ) {
    return null;
  }

  if (!accessToken) {
    return null;
  }

  refundInProgress = true;

  try {
    const response =
      await fetch(
        API_ENDPOINT,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${accessToken}`,

            "X-Search-Request-Id":
              generateRequestId()
          },

          body:
            JSON.stringify({
              action:
                "refund_search"
            }),

          cache: "no-store"
        }
      );

    const raw =
      await response.text();

    let data = {};

    try {
      data =
        raw
          ? JSON.parse(raw)
          : {};
    } catch (_) {
      data = {};
    }

    if (
      response.ok &&
      data.refunded === true
    ) {
      refundCompleted = true;

      return data;
    }

    return null;

  } catch (error) {
    console.warn(
      "Network refund failed:",
      error
    );

    return null;

  } finally {
    refundInProgress = false;
  }
}


// ============================================================
// NETWORK ERROR DETECTION
// ============================================================

function isNetworkError(error) {
  if (!error) {
    return false;
  }

  if (
    error.name ===
    "AbortError"
  ) {
    return false;
  }

  const message =
    String(
      error.message ||
      error
    ).toLowerCase();

  return (
    message.includes(
      "failed to fetch"
    ) ||
    message.includes(
      "networkerror"
    ) ||
    message.includes(
      "network error"
    ) ||
    message.includes(
      "load failed"
    ) ||
    message.includes(
      "connection refused"
    ) ||
    message.includes(
      "connection reset"
    ) ||
    message.includes(
      "fetch failed"
    )
  );
}


// ============================================================
// SAFE JSON RESPONSE
// ============================================================

async function readJSONResponse(
  response
) {
  const raw =
    await response.text();

  let data = null;

  try {
    data =
      raw
        ? JSON.parse(raw)
        : null;
  } catch (_) {
    data = null;
  }

  return {
    raw,
    data
  };
}


// ============================================================
// SEARCH
// ============================================================

async function searchCars() {
  if (!searchButton) {
    return;
  }


  // ----------------------------------------------------------
  // RESET REFUND STATE FOR THIS SEARCH
  // ----------------------------------------------------------

  refundInProgress = false;
  refundCompleted = false;


  // ----------------------------------------------------------
  // COLLECT REQUEST
  // ----------------------------------------------------------

  const request =
    collectRequest();


  const hasNaturalLanguage =
    Boolean(
      request.naturalLanguage
    );


  const hasFilters =
    Object.values(
      request.filters
    ).some(value => {
      if (
        Array.isArray(value)
      ) {
        return value.length > 0;
      }

      return Boolean(
        String(value || "").trim()
      );
    });


  if (
    !hasNaturalLanguage &&
    !hasFilters
  ) {
    setStatus(
      "Zadaj požiadavku na auto alebo vyplň filtre.",
      true
    );

    return;
  }


  // ----------------------------------------------------------
  // UI LOCK
  // ----------------------------------------------------------

  searchButton.disabled = true;

  setStatus(
    "Hľadám vhodné vozidlá…",
    false
  );


  let accessToken = null;

  let requestReceivedHTTPResponse =
    false;


  try {
    // --------------------------------------------------------
    // AUTH
    // --------------------------------------------------------

    accessToken =
      await getSupabaseAccessToken();


    if (!accessToken) {
      throw new Error(
        "Nepodarilo sa overiť používateľa. Skús stránku obnoviť."
      );
    }


    // --------------------------------------------------------
    // UNIQUE REQUEST ID
    // --------------------------------------------------------

    const searchRequestId =
      generateRequestId();


    // --------------------------------------------------------
    // API REQUEST
    // --------------------------------------------------------

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

              Authorization:
                `Bearer ${accessToken}`,

              "X-Search-Request-Id":
                searchRequestId
            },

            body:
              JSON.stringify(request),

            cache: "no-store"
          }
        );

      requestReceivedHTTPResponse =
        true;

    } catch (error) {
      // ------------------------------------------------------
      // IMPORTANT:
      // No HTTP response reached the browser.
      // This is the ONLY situation where frontend refund
      // is attempted.
      // ------------------------------------------------------

      if (
        isNetworkError(error)
      ) {
        await refundFailedNetworkSearch(
          accessToken
        );
      }

      throw error;
    }


    // --------------------------------------------------------
    // READ RESPONSE
    // --------------------------------------------------------

    const {
      raw,
      data
    } =
      await readJSONResponse(
        response
      );


    // --------------------------------------------------------
    // HTTP ERROR
    // --------------------------------------------------------

    if (!response.ok) {
      const serverMessage =
        data?.error ||
        data?.message ||
        (
          raw
            ? raw.slice(0, 300)
            : ""
        );


      if (
        response.status === 429
      ) {
        throw new Error(
          serverMessage ||
          "Denný limit 5 vyhľadávaní bol dosiahnutý."
        );
      }


      if (
        response.status === 401
      ) {
        throw new Error(
          serverMessage ||
          "Relácia vypršala. Obnov stránku a skús to znova."
        );
      }


      throw new Error(
        serverMessage ||
        "Vyhľadávanie sa nepodarilo dokončiť."
      );
    }


    // --------------------------------------------------------
    // VALIDATE RESPONSE
    // --------------------------------------------------------

    if (
      !data ||
      !Array.isArray(data.cars)
    ) {
      throw new Error(
        "Server nevrátil platné výsledky."
      );
    }


    if (
      data.cars.length !== 3
    ) {
      throw new Error(
        "Server nevrátil presne 3 vozidlá."
      );
    }


    // --------------------------------------------------------
    // VALIDATE EACH CAR
    // --------------------------------------------------------

    for (
      const car of data.cars
    ) {
      if (
        !car ||
        !car.name
      ) {
        throw new Error(
          "Jeden z výsledkov vozidla je neplatný."
        );
      }
    }


    // --------------------------------------------------------
    // RENDER RESULTS
    // --------------------------------------------------------

    renderResults(
      data.cars
    );


    // --------------------------------------------------------
    // LOAD VEHICLE IMAGES
    // --------------------------------------------------------

    await initializeCarImages(
      data.cars
    );


    // --------------------------------------------------------
    // SUCCESS
    // --------------------------------------------------------

    const remaining =
      Number.isFinite(
        Number(data.remaining)
      )
        ? Number(data.remaining)
        : null;


    if (
      remaining !== null
    ) {
      setStatus(
        `Hotovo. Zostáva ${remaining} ${remaining === 1 ? "vyhľadávanie" : "vyhľadávaní"}.`,
        false
      );
    } else {
      setStatus(
        "Hotovo.",
        false
      );
    }


    notifySearchFinished();

  } catch (error) {
    console.error(
      "CARMATCH AI search error:",
      error
    );


    // --------------------------------------------------------
    // ERROR MESSAGE
    // --------------------------------------------------------

    const message =
      getFriendlyErrorMessage(
        error,
        requestReceivedHTTPResponse
      );


    setStatus(
      message,
      true
    );

  } finally {
    // --------------------------------------------------------
    // UI UNLOCK
    // --------------------------------------------------------

    searchButton.disabled = false;
  }
}


// ============================================================
// FRIENDLY ERROR MESSAGE
// ============================================================

function getFriendlyErrorMessage(
  error,
  hadHTTPResponse
) {
  if (
    isNetworkError(error)
  ) {
    return "Vyhľadávanie sa nepodarilo dokončiť. Ak sa pokus dostal na server, bol vrátený späť.";
  }


  const message =
    String(
      error?.message ||
      ""
    ).trim();


  if (!hadHTTPResponse) {
    return (
      message ||
      "Vyhľadávanie sa nepodarilo dokončiť."
    );
  }


  return (
    message ||
    "Vyhľadávanie sa nepodarilo dokončiť."
  );
}


// ============================================================
// STATUS
// ============================================================

function setStatus(
  message,
  isError = false
) {
  if (!statusElement) {
    return;
  }

  statusElement.textContent =
    message || "";

  statusElement.classList.toggle(
    "error",
    Boolean(isError)
  );

  statusElement.classList.toggle(
    "success",
    !isError
  );
}


// ============================================================
// SEARCH FINISHED NOTIFICATION
// ============================================================

function notifySearchFinished() {
  // ----------------------------------------------------------
  // VIBRATION
  // ----------------------------------------------------------

  try {
    if (
      "vibrate" in navigator
    ) {
      navigator.vibrate(
        [60, 40, 100]
      );
    }
  } catch (_) {
    // Ignore vibration errors.
  }


  // ----------------------------------------------------------
  // SOUND
  // ----------------------------------------------------------

  try {
    const AudioContextClass =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContextClass) {
      return;
    }

    const audioContext =
      new AudioContextClass();

    const oscillator =
      audioContext.createOscillator();

    const gain =
      audioContext.createGain();

    oscillator.type =
      "sine";

    oscillator.frequency.setValueAtTime(
      720,
      audioContext.currentTime
    );

    oscillator.frequency.exponentialRampToValueAtTime(
      980,
      audioContext.currentTime + 0.12
    );

    gain.gain.setValueAtTime(
      0.0001,
      audioContext.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      0.08,
      audioContext.currentTime + 0.02
    );

    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      audioContext.currentTime + 0.18
    );

    oscillator.connect(
      gain
    );

    gain.connect(
      audioContext.destination
    );

    oscillator.start();

    oscillator.stop(
      audioContext.currentTime +
      0.2
    );

    setTimeout(() => {
      try {
        audioContext.close();
      } catch (_) {
        // Ignore.
      }
    }, 500);

  } catch (_) {
    // Browser may block audio.
  }
}


// ============================================================
// RENDER RESULTS
// ============================================================

function renderResults(cars) {
  if (!resultsElement) {
    return;
  }

  resultsElement.innerHTML =
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
// IMAGE CANDIDATES
// ============================================================

function getImageCandidates(car) {
  const candidates = [];

  // ----------------------------------------------------------
  // PRIMARY IMAGE
  // ----------------------------------------------------------

  if (
    isValidImageURL(
      car?.image
    )
  ) {
    candidates.push(
      car.image
    );
  }


  // ----------------------------------------------------------
  // IMAGE CANDIDATES
  // ----------------------------------------------------------

  if (
    Array.isArray(
      car?.imageCandidates
    )
  ) {
    for (
      const url of
      car.imageCandidates
    ) {
      if (
        isValidImageURL(url)
      ) {
        candidates.push(url);
      }
    }
  }


  // ----------------------------------------------------------
  // DEDUPLICATE
  // ----------------------------------------------------------

  return [
    ...new Set(
      candidates
    )
  ];
}


// ============================================================
// INITIALIZE ALL CAR IMAGES
// ============================================================

async function initializeCarImages(
  cars
) {
  if (!resultsElement) {
    return;
  }


  const imageElements =
    Array.from(
      resultsElement.querySelectorAll(
        ".car-image"
      )
    );


  const tasks =
    imageElements.map(
      async (
        imageElement,
        index
      ) => {
        const car =
          cars[index];

        if (!car) {
          return;
        }

        await loadNextImage(
          imageElement,
          car
        );
      }
    );


  await Promise.allSettled(
    tasks
  );
}


// ============================================================
// LOAD NEXT IMAGE
// ============================================================

async function loadNextImage(
  imageElement,
  car
) {
  if (!imageElement) {
    return;
  }


  const candidates =
    getImageCandidates(
      car
    );


  const state = {
    index: 0,
    candidates,
    finished: false
  };


  imageStates.set(
    imageElement,
    state
  );


  // ----------------------------------------------------------
  // NO CANDIDATES
  // ----------------------------------------------------------

  if (
    candidates.length === 0
  ) {
    setPlaceholderImage(
      imageElement
    );

    return;
  }


  // ----------------------------------------------------------
  // TRY FIRST IMAGE
  // ----------------------------------------------------------

  await tryNextImage(
    imageElement
  );
}


// ============================================================
// TRY NEXT IMAGE
// ============================================================

function tryNextImage(
  imageElement
) {
  return new Promise(
    resolve => {
      const state =
        imageStates.get(
          imageElement
        );


      if (!state) {
        setPlaceholderImage(
          imageElement
        );

        resolve();

        return;
      }


      if (
        state.index >=
        state.candidates.length
      ) {
        state.finished = true;

        setPlaceholderImage(
          imageElement
        );

        resolve();

        return;
      }


      const url =
        state.candidates[
          state.index
        ];


      state.index += 1;


      const testImage =
        new Image();


      let completed =
        false;


      // ------------------------------------------------------
      // SUCCESS
      // ------------------------------------------------------

      testImage.onload =
        () => {
          if (completed) {
            return;
          }

          completed = true;

          imageElement.src =
            url;

          imageElement.dataset.loaded =
            "true";

          imageElement.dataset.source =
            url;

          resolve();
        };


      // ------------------------------------------------------
      // FAILURE
      // ------------------------------------------------------

      testImage.onerror =
        async () => {
          if (completed) {
            return;
          }

          completed = true;

          await tryNextImage(
            imageElement
          );

          resolve();
        };


      // ------------------------------------------------------
      // TIMEOUT
      // ------------------------------------------------------

      const timeout =
        setTimeout(
          async () => {
            if (completed) {
              return;
            }

            completed = true;

            testImage.onload =
              null;

            testImage.onerror =
              null;

            await tryNextImage(
              imageElement
            );

            resolve();

          },
          7000
        );


      // ------------------------------------------------------
      // CLEAR TIMEOUT ON LOAD
      // ------------------------------------------------------

      const originalOnLoad =
        testImage.onload;

      const originalOnError =
        testImage.onerror;


      testImage.onload =
        event => {
          clearTimeout(
            timeout
          );

          originalOnLoad(
            event
          );
        };


      testImage.onerror =
        event => {
          clearTimeout(
            timeout
          );

          originalOnError(
            event
          );
        };


      // ------------------------------------------------------
      // START LOADING
      // ------------------------------------------------------

      testImage.decoding =
        "async";

      testImage.referrerPolicy =
        "no-referrer";

      testImage.src =
        url;
    }
  );
}


// ============================================================
// PLACEHOLDER IMAGE
// ============================================================

function setPlaceholderImage(
  imageElement
) {
  if (!imageElement) {
    return;
  }

  imageElement.src =
    PLACEHOLDER_IMAGE;

  imageElement.dataset.loaded =
    "false";
}


// ============================================================
// CREATE CAR CARD
// ============================================================

function createCard(
  car,
  index
) {
  const safeName =
    escapeHTML(
      car?.name ||
      "Neznáme vozidlo"
    );

  const brand =
    escapeHTML(
      car?.brand ||
      ""
    );

  const model =
    escapeHTML(
      car?.model ||
      ""
    );

  const generation =
    escapeHTML(
      car?.generation ||
      ""
    );

  const year =
    escapeHTML(
      car?.year ||
      ""
    );

  const price =
    escapeHTML(
      car?.price ||
      "Cena nie je dostupná"
    );

  const currency =
    escapeHTML(
      car?.currency ||
      ""
    );

  const powerHP =
    car?.powerHP !== null &&
    car?.powerHP !== undefined &&
    car?.powerHP !== ""
      ? `${escapeHTML(car.powerHP)} HP`
      : "";

  const powerKW =
    car?.powerKW !== null &&
    car?.powerKW !== undefined &&
    car?.powerKW !== ""
      ? `${escapeHTML(car.powerKW)} kW`
      : "";

  const power =
    [powerHP, powerKW]
      .filter(Boolean)
      .join(" / ");


  const seats =
    car?.seats
      ? escapeHTML(
          car.seats
        )
      : "";

  const trunk =
    escapeHTML(
      car?.trunk ||
      ""
    );

  const drive =
    escapeHTML(
      car?.drive ||
      ""
    );

  const fuel =
    escapeHTML(
      car?.fuel ||
      ""
    );

  const body =
    escapeHTML(
      car?.body ||
      ""
    );

  const length =
    escapeHTML(
      car?.length ||
      ""
    );

  const maintenance =
    escapeHTML(
      car?.maintenance ||
      ""
    );

  const reason =
    escapeHTML(
      car?.reason ||
      ""
    );

  const score =
    Number.isFinite(
      Number(car?.score)
    )
      ? Math.round(
          Number(car.score)
        )
      : 0;


  const pros =
    Array.isArray(car?.pros)
      ? car.pros
          .filter(Boolean)
          .map(
            item =>
              `<li>${escapeHTML(item)}</li>`
          )
          .join("")
      : "";


  const cons =
    Array.isArray(car?.cons)
      ? car.cons
          .filter(Boolean)
          .map(
            item =>
              `<li>${escapeHTML(item)}</li>`
          )
          .join("")
      : "";


  const configurator =
    isValidExternalURL(
      car?.officialConfigurator
    )
      ? car.officialConfigurator
      : "";


  const configuratorHTML =
    configurator
      ? `
        <a
          class="car-configurator"
          href="${escapeAttribute(configurator)}"
          target="_blank"
          rel="noopener noreferrer">
          Oficiálny konfigurátor
        </a>
      `
      : "";


  return `
    <article
      class="car-card"
      data-car-index="${index}">

      <div class="car-image-wrapper">

        <img
          class="car-image"
          src="${PLACEHOLDER_IMAGE}"
          alt="${escapeAttribute(safeName)}"
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
        />

      </div>


      <div class="car-card-content">

        <div class="car-rank">
          #${index + 1}
        </div>


        <h2 class="car-name">
          ${safeName}
        </h2>


        ${
          brand ||
          model ||
          generation ||
          year
            ? `
              <div class="car-subtitle">
                ${[
                  brand,
                  model,
                  generation,
                  year
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            `
            : ""
        }


        <div class="car-score">
          Zhoda s požiadavkou:
          <strong>
            ${score}/100
          </strong>
        </div>


        <div class="car-main-data">

          ${
            price
              ? `
                <div class="car-data-row">
                  <span>Cena</span>
                  <strong>
                    ${price}
                    ${
                      currency
                        ? ` ${currency}`
                        : ""
                    }
                  </strong>
                </div>
              `
              : ""
          }


          ${
            power
              ? `
                <div class="car-data-row">
                  <span>Výkon</span>
                  <strong>
                    ${power}
                  </strong>
                </div>
              `
              : ""
          }


          ${
            seats
              ? `
                <div class="car-data-row">
                  <span>Sedadlá</span>
                  <strong>
                    ${seats}
                  </strong>
                </div>
              `
              : ""
          }


          ${
            trunk
              ? `
                <div class="car-data-row">
                  <span>Kufor</span>
                  <strong>
                    ${trunk}
                  </strong>
                </div>
              `
              : ""
          }


          ${
            drive
              ? `
                <div class="car-data-row">
                  <span>Pohon</span>
                  <strong>
                    ${drive}
                  </strong>
                </div>
              `
              : ""
          }


          ${
            fuel
              ? `
                <div class="car-data-row">
                  <span>Pohon / palivo</span>
                  <strong>
                    ${fuel}
                  </strong>
                </div>
              `
              : ""
          }


          ${
            body
              ? `
                <div class="car-data-row">
                  <span>Karoséria</span>
                  <strong>
                    ${body}
                  </strong>
                </div>
              `
              : ""
          }


          ${
            length
              ? `
                <div class="car-data-row">
                  <span>Dĺžka</span>
                  <strong>
                    ${length}
                  </strong>
                </div>
              `
              : ""
          }

        </div>


        ${
          reason
            ? `
              <div class="car-section">
                <h3>Prečo toto auto?</h3>
                <p>
                  ${reason}
                </p>
              </div>
            `
            : ""
        }


        ${
          maintenance
            ? `
              <div class="car-section">
                <h3>Údržba</h3>
                <p>
                  ${maintenance}
                </p>
              </div>
            `
            : ""
        }


        ${
          pros
            ? `
              <div class="car-section">
                <h3>Výhody</h3>
                <ul>
                  ${pros}
                </ul>
              </div>
            `
            : ""
        }


        ${
          cons
            ? `
              <div class="car-section">
                <h3>Nevýhody</h3>
                <ul>
                  ${cons}
                </ul>
              </div>
            `
            : ""
        }


        ${configuratorHTML}

      </div>

    </article>
  `;
}


// ============================================================
// EXTERNAL URL VALIDATION
// ============================================================

function isValidExternalURL(
  url
) {
  if (!url) {
    return false;
  }

  try {
    const parsed =
      new URL(url);

    return (
      parsed.protocol ===
        "https:" ||
      parsed.protocol ===
        "http:"
    );

  } catch (_) {
    return false;
  }
}


// ============================================================
// ENTER KEY SUPPORT
// ============================================================

function setupEnterKey() {
  const possibleInputs = [
    "naturalLanguage",
    "searchInput",
    "query"
  ];

  for (
    const id of
    possibleInputs
  ) {
    const element =
      document.getElementById(id);

    if (!element) {
      continue;
    }

    element.addEventListener(
      "keydown",
      event => {
        if (
          event.key ===
          "Enter" &&
          !event.shiftKey
        ) {
          event.preventDefault();

          if (
            searchButton &&
            !searchButton.disabled
          ) {
            searchCars();
          }
        }
      }
    );

    break;
  }
}


// ============================================================
// SEARCH BUTTON
// ============================================================

if (searchButton) {
  searchButton.addEventListener(
    "click",
    searchCars
  );
}


// ============================================================
// INITIALIZATION
// ============================================================

setupEnterKey();


// ============================================================
// OPTIONAL GLOBAL ACCESS
// ============================================================

window.searchCars =
  searchCars;