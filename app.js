// ============================================================
// CARMATCH AI - FRONTEND
// Improved image handling
// Fixed HTML interpolation
// Correct backend filter names
// Slovak response instructions
// Safe rendering
// ============================================================

const API_ENDPOINT = "/api/search";

const button = document.getElementById("searchButton");
const statusBox = document.getElementById("status");
const resultsBox = document.getElementById("results");

button.addEventListener("click", searchCars);


// ============================================================
// BASIC HELPERS
// ============================================================

function value(id) {
  const element = document.getElementById(id);
  return element ? element.value.trim() : "";
}


function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function escapeAttribute(value) {
  return escapeHTML(value);
}


function isValidImageURL(url) {
  if (!url || typeof url !== "string") {
    return false;
  }

  try {
    const parsed = new URL(url);

    return (
      parsed.protocol === "https:" &&
      (
        parsed.hostname === "upload.wikimedia.org" ||
        parsed.hostname.endsWith(".wikimedia.org") ||
        parsed.hostname.endsWith(".wikipedia.org") ||
        parsed.hostname.endsWith(".wikia.nocookie.net") ||
        parsed.hostname.endsWith(".cloudinary.com") ||
        parsed.hostname.endsWith(".vercel.app")
      )
    );
  } catch {
    return false;
  }
}


// ============================================================
// REQUEST COLLECTION
// ============================================================

function collectRequest() {
  const originalRequest = value("aiRequest");

  // Explicit language instruction for the AI.
  const languageInstruction =
    "Odpovedaj spisovnou, gramaticky správnou a prirodzenou slovenčinou. " +
    "Používaj správne slovenské skloňovanie, diakritiku a odborné automobilové výrazy. " +
    "Výhody, nevýhody, dôvody výberu a informácie o údržbe formuluj jasne a zrozumiteľne.";

  return {
    naturalLanguage: originalRequest
      ? `${originalRequest}\n\n${languageInstruction}`
      : languageInstruction,

    filters: {
      budget: value("budget"),
      seats: value("seats"),

      // Names must match the backend's normalizeRequest().
      power: value("power"),
      trunk: value("trunk"),

      drive: value("drive"),
      fuel: value("fuel"),
      body: value("body"),
      style: value("style"),

      length: value("length"),
      year: value("year"),
      avoid: value("avoid")
    },

    resultCount: 3
  };
}


// ============================================================
// SEARCH
// ============================================================

async function searchCars() {
  const request = collectRequest();

  const hasNaturalLanguage = value("aiRequest") !== "";

  const hasFilters = Object.values(request.filters)
    .some(item => item !== "");

  if (!hasNaturalLanguage && !hasFilters) {
    statusBox.textContent =
      "Zadaj požiadavku alebo vyplň aspoň jeden filter.";

    return;
  }

  button.disabled = true;

  button.innerHTML =
    '🤖 AI VYBERÁ NAJLEPŠIE AUTÁ... <span class="loading-dots">● ● ●</span>';

  statusBox.textContent =
    "AI vyhodnocuje tvoje požiadavky a hľadá vhodné vozidlá…";

  resultsBox.innerHTML = "";

  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify(request)
    });

    const responseText = await response.text();

    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(
        "Backend vrátil neplatnú odpoveď."
      );
    }

    if (!response.ok) {
      const message =
        data.message ||
        data.error ||
        `Chyba servera (${response.status}).`;

      throw new Error(message);
    }

    if (!data.cars || !Array.isArray(data.cars)) {
      throw new Error(
        "AI nevrátila platné výsledky."
      );
    }

    if (data.cars.length === 0) {
      throw new Error(
        "AI nenašla žiadne vozidlá."
      );
    }

    renderResults(data.cars);

    statusBox.textContent =
      `Hotovo — AI vybrala ${data.cars.length} vozidlá.`;

    notifySearchFinished();

  } catch (error) {
    console.error("CARMATCH AI search error:", error);

    statusBox.textContent =
      "Vyhľadávanie sa nepodarilo dokončiť.";

    resultsBox.innerHTML = `
      <div class="info">
        <strong>
          CARMATCH AI momentálne nedokázala pripraviť výsledky.
        </strong>

        <br><br>

        ${escapeHTML(
          error.message ||
          "Skús vyhľadávanie zopakovať."
        )}

        <br><br>

        Skontroluj internetové pripojenie a skús to znova.
      </div>
    `;

  } finally {
    button.disabled = false;

    button.innerHTML =
      '🤖 NÁJSŤ MOJE TOP 3 AUTÁ <span>→</span>';
  }
}


// ============================================================
// VIBRATION + SOUND
// ============================================================

function notifySearchFinished() {

  // Vibration

  try {
    if (
      "vibrate" in navigator &&
      typeof navigator.vibrate === "function"
    ) {
      navigator.vibrate([150, 80, 150]);
    }
  } catch (error) {
    console.log("Vibrácia nie je dostupná.");
  }


  // Sound

  try {
    const AudioContextClass =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContextClass) {
      return;
    }

    const audioContext = new AudioContextClass();

    const playTone = () => {
      const oscillator =
        audioContext.createOscillator();

      const gainNode =
        audioContext.createGain();

      oscillator.type = "sine";

      oscillator.frequency.setValueAtTime(
        880,
        audioContext.currentTime
      );

      gainNode.gain.setValueAtTime(
        0.001,
        audioContext.currentTime
      );

      gainNode.gain.exponentialRampToValueAtTime(
        0.18,
        audioContext.currentTime + 0.02
      );

      gainNode.gain.exponentialRampToValueAtTime(
        0.001,
        audioContext.currentTime + 0.35
      );

      oscillator.connect(gainNode);

      gainNode.connect(
        audioContext.destination
      );

      oscillator.start();

      oscillator.stop(
        audioContext.currentTime + 0.35
      );
    };

    if (audioContext.state === "suspended") {
      audioContext.resume()
        .then(playTone)
        .catch(() => {});
    } else {
      playTone();
    }

    setTimeout(() => {
      audioContext.close().catch(() => {});
    }, 500);

  } catch (error) {
    console.log("Zvuk nie je dostupný.");
  }
}


// ============================================================
// RENDER RESULTS
// ============================================================

function renderResults(cars) {
  resultsBox.innerHTML = `
    <h2 class="results-title">
      Tvoje TOP 3 autá
    </h2>

    <div class="results">
      ${cars
        .map((car, index) => createCard(car, index))
        .join("")}
    </div>
  `;

  // Start image loading after cards have been rendered.
  loadMissingImages(cars);
}


// ============================================================
// VEHICLE CARD
// ============================================================

function createCard(car, index) {

  const pros = Array.isArray(car.pros)
    ? car.pros
        .map(item => `<li>${escapeHTML(item)}</li>`)
        .join("")
    : "<li>Údaj nie je dostupný.</li>";


  const cons = Array.isArray(car.cons)
    ? car.cons
        .map(item => `<li>${escapeHTML(item)}</li>`)
        .join("")
    : "<li>Údaj nie je dostupný.</li>";


  const suppliedImage =
    isValidImageURL(car.image)
      ? car.image
      : "";


  const initialImage =
    suppliedImage ||
    "https://placehold.co/1200x700/e9eaec/555?text=Loading+car+image";


  const name =
    car.name || "Neznáme auto";


  return `
    <article class="car">

      <img
        class="car-image"
        src="${escapeAttribute(initialImage)}"
        alt="${escapeAttribute(name)}"
        loading="lazy"
        data-car-name="${escapeAttribute(name)}"
        data-car-generation="${escapeAttribute(car.generation || "")}"
        data-image-found="${suppliedImage ? "true" : "false"}"
        onerror="handleImageError(this)"
      >

      <div class="car-body">

        <div class="rank">
          #${index + 1} — NAJLEPŠIA ZHODA
        </div>


        <div class="car-name">
          ${escapeHTML(name)}
        </div>


        <div class="generation">

          ${escapeHTML(car.generation || "")}

          ${
            car.year
              ? " · modelový rok " +
                escapeHTML(String(car.year))
              : ""
          }

        </div>


        <div class="score">

          ${escapeHTML(String(car.score ?? "—"))}%

        </div>


        <div class="specs">

          💰 Cena:
          ${escapeHTML(car.price || "—")}
          <br>

          ⚡ Výkon:
          ${escapeHTML(car.power || "—")}
          <br>

          🪑 Miesta:
          ${escapeHTML(String(car.seats ?? "—"))}
          <br>

          🧳 Kufor:
          ${escapeHTML(car.trunk || "—")}
          <br>

          🚗 Pohon:
          ${escapeHTML(car.drive || "—")}
          <br>

          🔋 Palivo:
          ${escapeHTML(car.fuel || "—")}

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
              car.photoSource ||
              (
                suppliedImage
                  ? "Fotografia poskytnutá AI."
                  : "Vyhľadáva sa fotografia vozidla…"
              )
            )}
          </p>

        </div>


        ${
          car.configurator &&
          isValidWebsiteURL(car.configurator)
            ? `
              <a
                class="configure"
                href="${escapeAttribute(car.configurator)}"
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


// ============================================================
// URL VALIDATION
// ============================================================

function isValidWebsiteURL(url) {
  if (!url || typeof url !== "string") {
    return false;
  }

  try {
    const parsed = new URL(url);

    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}


// ============================================================
// IMAGE ERROR HANDLER
// ============================================================

function handleImageError(img) {
  if (img.dataset.fallbackUsed === "true") {
    return;
  }

  img.dataset.fallbackUsed = "true";

  img.src =
    "https://placehold.co/1200x700/e9eaec/555?text=Image+not+available";
}


// ============================================================
// LOAD MISSING VEHICLE IMAGES
// ============================================================

async function loadMissingImages(cars) {
  const images =
    resultsBox.querySelectorAll(".car-image");

  for (let index = 0; index < images.length; index++) {
    const img = images[index];

    if (img.dataset.imageFound === "true") {
      continue;
    }

    const car = cars[index];

    if (!car) {
      continue;
    }

    try {
      const imageURL =
        await findVehicleImage(
          car.name,
          car.generation,
          car.year
        );

      if (imageURL) {
        img.dataset.imageFound = "true";
        img.dataset.fallbackUsed = "false";

        img.src = imageURL;

        const card =
          img.closest(".car");

        const source =
          card?.querySelector(".photo-source");

        if (source) {
          source.textContent =
            "Wikimedia Commons — automaticky vyhľadaná fotografia. Over, či zodpovedá presnej generácii vozidla.";
        }
      } else {
        img.src =
          "https://placehold.co/1200x700/e9eaec/555?text=Image+not+available";

        const card =
          img.closest(".car");

        const source =
          card?.querySelector(".photo-source");

        if (source) {
          source.textContent =
            "Vhodnú fotografiu sa nepodarilo automaticky nájsť.";
        }
      }

    } catch (error) {
      console.error(
        "Image search failed:",
        error
      );

      img.src =
        "https://placehold.co/1200x700/e9eaec/555?text=Image+not+available";
    }
  }
}


// ============================================================
// WIKIMEDIA COMMONS IMAGE SEARCH
// ============================================================

async function findVehicleImage(
  name,
  generation,
  year
) {

  if (!name) {
    return "";
  }

  const queries = [];

  const exactQuery = [
    name,
    generation,
    year
  ]
    .filter(Boolean)
    .join(" ");

  queries.push(exactQuery);

  if (generation) {
    queries.push(
      `${name} ${generation}`
    );
  }

  queries.push(name);


  for (const query of queries) {
    const imageURL =
      await searchCommons(query);

    if (imageURL) {
      return imageURL;
    }
  }

  return "";
}


// ============================================================
// COMMONS API
// ============================================================

async function searchCommons(searchTerm) {

  const params = new URLSearchParams({
    action: "query",

    generator: "search",

    gsrsearch: searchTerm,

    gsrnamespace: "6",

    gsrlimit: "8",

    prop: "imageinfo",

    iiprop: "url",

    iiurlwidth: "1200",

    format: "json",

    origin: "*"
  });


  const url =
    "https://commons.wikimedia.org/w/api.php?" +
    params.toString();


  const controller =
    new AbortController();


  const timeout =
    setTimeout(
      () => controller.abort(),
      12000
    );


  try {
    const response =
      await fetch(
        url,
        {
          method: "GET",
          signal: controller.signal
        }
      );


    if (!response.ok) {
      return "";
    }


    const data =
      await response.json();


    const pages =
      data?.query?.pages;


    if (!pages) {
      return "";
    }


    const results =
      Object.values(pages);


    // Prefer files with a usable thumbnail URL.
    for (const item of results) {

      const info =
        item?.imageinfo?.[0];


      if (!info) {
        continue;
      }


      const imageURL =
        info.thumburl ||
        info.url ||
        "";


      if (
        imageURL.startsWith(
          "https://upload.wikimedia.org/"
        )
      ) {
        return imageURL;
      }
    }


    return "";

  } catch (error) {

    console.error(
      "Wikimedia Commons request failed:",
      error
    );

    return "";

  } finally {

    clearTimeout(timeout);
  }
}