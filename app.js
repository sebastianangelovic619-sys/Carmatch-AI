// ============================================================
// CARMATCH AI - FINAL FRONTEND v4
// Backend handles vehicle image search.
// Frontend displays backend image candidates and automatically
// switches to the next candidate if an image fails to load.
// ============================================================

const API_ENDPOINT =
  "/api/search";

const button =
  document.getElementById(
    "searchButton"
  );

const statusBox =
  document.getElementById(
    "status"
  );

const resultsBox =
  document.getElementById(
    "results"
  );


// Stores image loading state for each <img>.
const imageStates =
  new WeakMap();


button.addEventListener(
  "click",
  searchCars
);


// ============================================================
// BASIC HELPERS
// ============================================================

function value(id) {
  const element =
    document.getElementById(id);

  return element
    ? element.value.trim()
    : "";
}


function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}


function escapeAttribute(value) {
  return escapeHTML(value);
}


// ============================================================
// IMAGE URL VALIDATION
// ============================================================

function validImageURL(url) {
  if (
    !url ||
    typeof url !== "string"
  ) {
    return false;
  }

  try {
    return (
      new URL(url)
        .protocol ===
      "https:"
    );
  } catch {
    return false;
  }
}


// ============================================================
// WEBSITE URL VALIDATION
// ============================================================

function validWebsiteURL(url) {
  if (
    !url ||
    typeof url !== "string"
  ) {
    return false;
  }

  try {
    return (
      new URL(url)
        .protocol ===
      "https:"
    );
  } catch {
    return false;
  }
}


// ============================================================
// LOCAL PLACEHOLDER
// ============================================================

function placeholderDataURL(
  message =
    "Fotografia vozidla nedostupná"
) {
  const safeMessage =
    String(message)
      .replace(
        /[&<>"]/g,
        ""
      );

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg"
         width="1200"
         height="700"
         viewBox="0 0 1200 700">

      <rect
        width="1200"
        height="700"
        fill="#e9eaec"
      />

      <text
        x="600"
        y="330"
        text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="38"
        fill="#666">

        ${safeMessage}

      </text>

      <text
        x="600"
        y="385"
        text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="22"
        fill="#888">

        CARMATCH AI

      </text>

    </svg>
  `;

  return (
    "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(svg)
  );
}


// ============================================================
// REQUEST
// ============================================================

function collectRequest() {
  return {
    naturalLanguage:
      value("aiRequest"),

    filters: {
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
        value("avoid")
    },

    resultCount: 3
  };
}


// ============================================================
// SEARCH VEHICLES
// ============================================================

async function searchCars() {
  const request =
    collectRequest();

  const hasText =
    Boolean(
      request.naturalLanguage
    );

  const hasFilters =
    Object.values(
      request.filters
    ).some(
      item => item !== ""
    );

  if (
    !hasText &&
    !hasFilters
  ) {
    statusBox.textContent =
      "Zadaj požiadavku alebo vyplň aspoň jeden filter.";

    return;
  }

  button.disabled =
    true;

  button.innerHTML =
    '🤖 AI VYBERÁ NAJLEPŠIE AUTÁ... <span class="loading-dots">● ● ●</span>';

  statusBox.textContent =
    "AI vyhľadáva vhodné vozidlá…";

  resultsBox.innerHTML =
    "";

  try {
    const response =
      await fetch(
        API_ENDPOINT,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(
              request
            )
        }
      );

    const responseText =
      await response.text();

    let data;

    try {
      data =
        JSON.parse(
          responseText
        );
    } catch {
      throw new Error(
        "Server vrátil neplatnú odpoveď."
      );
    }

    if (
      !response.ok
    ) {
      throw new Error(
        data.message ||
        data.error ||
        `Chyba servera (${response.status}).`
      );
    }

    if (
      !Array.isArray(
        data.cars
      )
    ) {
      throw new Error(
        "AI nevrátila platné výsledky."
      );
    }

    renderResults(
      data.cars
    );

    statusBox.textContent =
      "Hotovo — fotografie vozidiel sa načítavajú.";

    await initializeCarImages(
      data.cars
    );

    statusBox.textContent =
      "Hotovo — vyhľadávanie vozidiel bolo dokončené.";

    notifySearchFinished();

  } catch (error) {
    console.error(
      "CARMATCH AI:",
      error
    );

    statusBox.textContent =
      "Vyhľadávanie sa nepodarilo dokončiť.";

    resultsBox.innerHTML = `
      <div class="info">

        <strong>
          CARMATCH AI momentálne nedokázala pripraviť výsledky.
        </strong>

        <br><br>

        ${escapeHTML(
          error.message
        )}

      </div>
    `;

  } finally {
    button.disabled =
      false;

    button.innerHTML =
      '🤖 NÁJSŤ MOJE TOP 3 AUTÁ <span>→</span>';
  }
}


// ============================================================
// NOTIFICATION
// ============================================================

function notifySearchFinished() {
  try {
    if (
      typeof navigator.vibrate ===
      "function"
    ) {
      navigator.vibrate([
        150,
        80,
        150
      ]);
    }

  } catch (_) {}


  try {
    const AudioContextClass =
      window.AudioContext ||
      window.webkitAudioContext;

    if (
      !AudioContextClass
    ) {
      return;
    }

    const audio =
      new AudioContextClass();

    const play = () => {
      const oscillator =
        audio.createOscillator();

      const gain =
        audio.createGain();

      oscillator.type =
        "sine";

      oscillator.frequency.setValueAtTime(
        880,
        audio.currentTime
      );

      gain.gain.setValueAtTime(
        0.001,
        audio.currentTime
      );

      gain.gain.exponentialRampToValueAtTime(
        0.15,
        audio.currentTime +
          0.02
      );

      gain.gain.exponentialRampToValueAtTime(
        0.001,
        audio.currentTime +
          0.3
      );

      oscillator.connect(
        gain
      );

      gain.connect(
        audio.destination
      );

      oscillator.start();

      oscillator.stop(
        audio.currentTime +
          0.3
      );
    };


    if (
      audio.state ===
      "suspended"
    ) {
      audio
        .resume()
        .then(play)
        .catch(() => {});

    } else {
      play();
    }


    setTimeout(() => {
      audio
        .close()
        .catch(() => {});
    }, 500);

  } catch (_) {}
}


// ============================================================
// RENDER RESULTS
// ============================================================

function renderResults(
  cars
) {
  resultsBox.innerHTML = `
    <h2 class="results-title">
      Tvoje TOP 3 autá
    </h2>

    <div class="results">

      ${cars
        .map(
          (car, index) =>
            createCard(
              car,
              index
            )
        )
        .join("")}

    </div>
  `;
}


// ============================================================
// GET IMAGE CANDIDATES
// ============================================================

function getImageCandidates(
  car
) {
  const candidates = [];

  const seen =
    new Set();


  const addCandidate =
    (
      url,
      source = ""
    ) => {

      if (
        !validImageURL(
          url
        )
      ) {
        return;
      }

      if (
        seen.has(url)
      ) {
        return;
      }

      seen.add(url);

      candidates.push({
        url,
        source:
          source || ""
      });
    };


  // First use the primary backend image.
  addCandidate(
    car?.image,
    car?.photoSource
  );


  // Then use backup candidates.
  if (
    Array.isArray(
      car?.imageCandidates
    )
  ) {

    for (
      const candidate
      of car.imageCandidates
    ) {

      if (
        !candidate ||
        typeof candidate !==
          "object"
      ) {
        continue;
      }

      addCandidate(
        candidate.url ||
          candidate.image ||
          "",

        candidate.source ||
          candidate.photoSource ||
          ""
      );
    }
  }


  return candidates;
}


// ============================================================
// INITIALIZE ALL CAR IMAGES
// ============================================================

async function initializeCarImages(
  cars
) {
  const images =
    resultsBox.querySelectorAll(
      ".car-image"
    );

  const tasks = [];


  for (
    let i = 0;
    i < cars.length;
    i++
  ) {

    const img =
      images[i];

    const car =
      cars[i];

    if (
      !img ||
      !car
    ) {
      continue;
    }


    const candidates =
      getImageCandidates(
        car
      );


    const state = {
      candidates,

      nextIndex:
        0,

      finished:
        false
    };


    imageStates.set(
      img,
      state
    );


    tasks.push(
      loadNextImage(
        img
      )
    );
  }


  await Promise.all(
    tasks
  );
}


// ============================================================
// LOAD NEXT IMAGE
// ============================================================

function loadNextImage(
  img
) {
  return new Promise(
    resolve => {

      const state =
        imageStates.get(
          img
        );


      if (!state) {
        resolve(false);
        return;
      }


      if (
        state.nextIndex >=
        state.candidates.length
      ) {

        state.finished =
          true;


        const card =
          img.closest(
            ".car"
          );

        const source =
          card?.querySelector(
            ".photo-source"
          );


        img.src =
          placeholderDataURL(
            "Fotografia vozidla sa nenašla"
          );


        if (source) {
          source.textContent =
            "Fotografiu sa nepodarilo nájsť.";
        }


        resolve(false);
        return;
      }


      const candidate =
        state.candidates[
          state.nextIndex
        ];

      state.nextIndex++;


      const handleLoad =
        () => {

          cleanup();

          state.finished =
            true;


          const card =
            img.closest(
              ".car"
            );

          const source =
            card?.querySelector(
              ".photo-source"
            );


          if (source) {
            source.textContent =
              candidate.source ||
              "Wikimedia Commons / Wikipedia";
          }


          resolve(true);
        };


      const handleError =
        () => {

          cleanup();

          loadNextImage(
            img
          ).then(
            resolve
          );
        };


      const cleanup =
        () => {

          img.removeEventListener(
            "load",
            handleLoad
          );

          img.removeEventListener(
            "error",
            handleError
          );
        };


      img.addEventListener(
        "load",
        handleLoad,
        {
          once: true
        }
      );


      img.addEventListener(
        "error",
        handleError,
        {
          once: true
        }
      );


      img.src =
        candidate.url;
    }
  );
}


// ============================================================
// VEHICLE CARD
// ============================================================

function createCard(
  car,
  index
) {
  const pros =
    Array.isArray(
      car.pros
    )
      ? car.pros
          .map(
            item =>
              `<li>${escapeHTML(
                item
              )}</li>`
          )
          .join("")
      : "<li>Údaj nie je dostupný.</li>";


  const cons =
    Array.isArray(
      car.cons
    )
      ? car.cons
          .map(
            item =>
              `<li>${escapeHTML(
                item
              )}</li>`
          )
          .join("")
      : "<li>Údaj nie je dostupný.</li>";


  const initialImage =
    validImageURL(
      car.image
    )
      ? car.image
      : placeholderDataURL(
          "Načítavam fotografiu vozidla…"
        );


  const hasCandidates =
    Array.isArray(
      car.imageCandidates
    ) &&
    car.imageCandidates.length >
      0;


  const initialSource =
    car.photoSource ||
    (
      hasCandidates
        ? "Načítavam fotografiu vozidla…"
        : "Fotografia sa nenašla."
    );


  return `
    <article class="car">

      <img
        class="car-image"
        src="${escapeAttribute(
          initialImage
        )}"
        alt="${escapeAttribute(
          car.name ||
            "Automobil"
        )}"
        loading="eager"
        decoding="async"
        referrerpolicy="no-referrer"
        data-car-index="${index}"
      >

      <div class="car-body">

        <div class="rank">
          #${index + 1} — NAJLEPŠIA ZHODA
        </div>

        <div class="car-name">
          ${escapeHTML(
            car.name ||
              "Neznáme auto"
          )}
        </div>

        <div class="generation">

          ${escapeHTML(
            car.generation ||
              ""
          )}

          ${
            car.year
              ? " · modelový rok " +
                escapeHTML(
                  car.year
                )
              : ""
          }

        </div>

        <div class="score">
          ${escapeHTML(
            car.score ?? "—"
          )}%
        </div>

        <div class="specs">

          💰 Cena:
          ${escapeHTML(
            car.price ||
              "—"
          )}<br>

          ⚡ Výkon:
          ${escapeHTML(
            car.power ||
              "—"
          )}<br>

          🪑 Miesta:
          ${escapeHTML(
            car.seats ??
              "—"
          )}<br>

          🧳 Kufor:
          ${escapeHTML(
            car.trunk ||
              "—"
          )}<br>

          🚗 Pohon:
          ${escapeHTML(
            car.drive ||
              "—"
          )}<br>

          🔋 Palivo:
          ${escapeHTML(
            car.fuel ||
              "—"
          )}

        </div>


        <div class="section">

          <strong>
            🤖 Prečo ho AI vybrala
          </strong>

          <p>
            ${escapeHTML(
              car.reason ||
                "Vysvetlenie nie je dostupné."
            )}
          </p>

        </div>


        <div class="section pros">

          <strong>
            ✅ Výhody
          </strong>

          <ul>
            ${pros}
          </ul>

        </div>


        <div class="section cons">

          <strong>
            ❌ Nevýhody
          </strong>

          <ul>
            ${cons}
          </ul>

        </div>


        <div class="section">

          <strong>
            🔧 Údržba
          </strong>

          <p>
            ${escapeHTML(
              car.maintenance ||
                "Údaj nie je dostupný."
            )}
          </p>

        </div>


        <div class="section">

          <strong>
            📸 Zdroj fotografie
          </strong>

          <p class="photo-source">
            ${escapeHTML(
              initialSource
            )}
          </p>

        </div>


        ${
          validWebsiteURL(
            car.configurator
          )
            ? `
              <a
                class="configure"
                href="${escapeAttribute(
                  car.configurator
                )}"
                target="_blank"
                rel="noopener noreferrer"
              >
                ⚙️ OFICIÁLNY KONFIGURÁTOR →
              </a>
            `
            : ""
        }

      </div>

    </article>
  `;
}