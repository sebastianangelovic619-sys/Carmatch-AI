// ============================================================
// CARMATCH AI - IMAGE FIX
// Automatické vyhľadávanie fotografií vozidiel
// Wikimedia Commons + Wikipedia fallback
// Zachované vyhľadávanie, filtre a upozornenia
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


function validImageURL(url) {
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
        parsed.hostname.endsWith(".wikipedia.org")
      )
    );
  } catch {
    return false;
  }
}


function validWebsiteURL(url) {
  if (!url || typeof url !== "string") {
    return false;
  }

  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}


// ============================================================
// REQUEST
// ============================================================

function collectRequest() {
  return {
    naturalLanguage: value("aiRequest"),

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
    },

    resultCount: 3
  };
}


// ============================================================
// SEARCH VEHICLES
// ============================================================

async function searchCars() {
  const request = collectRequest();

  const hasText = Boolean(request.naturalLanguage);

  const hasFilters = Object.values(request.filters)
    .some(item => item !== "");

  if (!hasText && !hasFilters) {
    statusBox.textContent =
      "Zadaj požiadavku alebo vyplň aspoň jeden filter.";

    return;
  }

  button.disabled = true;

  button.innerHTML =
    '🤖 AI VYBERÁ NAJLEPŠIE AUTÁ... <span class="loading-dots">● ● ●</span>';

  statusBox.textContent =
    "AI vyhľadáva vhodné vozidlá…";

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
      throw new Error("Server vrátil neplatnú odpoveď.");
    }

    if (!response.ok) {
      throw new Error(
        data.message ||
        data.error ||
        `Chyba servera (${response.status}).`
      );
    }

    if (!Array.isArray(data.cars)) {
      throw new Error("AI nevrátila platné výsledky.");
    }

    renderResults(data.cars);

    statusBox.textContent =
      "Hotovo — vyhľadávajú sa fotografie vozidiel…";

    notifySearchFinished();

  } catch (error) {
    console.error("CARMATCH AI:", error);

    statusBox.textContent =
      "Vyhľadávanie sa nepodarilo dokončiť.";

    resultsBox.innerHTML = `
      <div class="info">
        <strong>
          CARMATCH AI momentálne nedokázala pripraviť výsledky.
        </strong>
        <br><br>
        ${escapeHTML(error.message)}
      </div>
    `;

  } finally {
    button.disabled = false;

    button.innerHTML =
      '🤖 NÁJSŤ MOJE TOP 3 AUTÁ <span>→</span>';
  }
}


// ============================================================
// NOTIFICATION
// ============================================================

function notifySearchFinished() {
  try {
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate([150, 80, 150]);
    }
  } catch (_) {}

  try {
    const AudioContextClass =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContextClass) return;

    const audio = new AudioContextClass();

    const play = () => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();

      oscillator.type = "sine";

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
        audio.currentTime + 0.02
      );

      gain.gain.exponentialRampToValueAtTime(
        0.001,
        audio.currentTime + 0.3
      );

      oscillator.connect(gain);
      gain.connect(audio.destination);

      oscillator.start();
      oscillator.stop(audio.currentTime + 0.3);
    };

    if (audio.state === "suspended") {
      audio.resume().then(play).catch(() => {});
    } else {
      play();
    }

    setTimeout(() => {
      audio.close().catch(() => {});
    }, 500);

  } catch (_) {}
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
      ${cars.map((car, index) => createCard(car, index)).join("")}
    </div>
  `;

  // Vyhľadávanie fotografií sa spustí až po vykreslení kariet.
  findImagesForCars(cars);
}


// ============================================================
// VEHICLE CARD
// ============================================================

function createCard(car, index) {
  const pros = Array.isArray(car.pros)
    ? car.pros.map(item =>
        `<li>${escapeHTML(item)}</li>`
      ).join("")
    : "<li>Údaj nie je dostupný.</li>";

  const cons = Array.isArray(car.cons)
    ? car.cons.map(item =>
        `<li>${escapeHTML(item)}</li>`
      ).join("")
    : "<li>Údaj nie je dostupný.</li>";

  const image = validImageURL(car.image)
    ? car.image
    : "https://placehold.co/1200x700/e9eaec/555?text=Searching+for+vehicle+photo";

  return `
    <article class="car">

      <img
        class="car-image"
        src="${escapeAttribute(image)}"
        alt="${escapeAttribute(car.name || "Automobil")}"
        loading="lazy"
        data-car-index="${index}"
        data-image-found="${validImageURL(car.image) ? "true" : "false"}"
        onerror="imageLoadError(this)"
      >

      <div class="car-body">

        <div class="rank">
          #${index + 1} — NAJLEPŠIA ZHODA
        </div>

        <div class="car-name">
          ${escapeHTML(car.name || "Neznáme auto")}
        </div>

        <div class="generation">
          ${escapeHTML(car.generation || "")}
          ${car.year ? " · modelový rok " + escapeHTML(car.year) : ""}
        </div>

        <div class="score">
          ${escapeHTML(car.score ?? "—")}%
        </div>

        <div class="specs">
          💰 Cena: ${escapeHTML(car.price || "—")}<br>
          ⚡ Výkon: ${escapeHTML(car.power || "—")}<br>
          🪑 Miesta: ${escapeHTML(car.seats ?? "—")}<br>
          🧳 Kufor: ${escapeHTML(car.trunk || "—")}<br>
          🚗 Pohon: ${escapeHTML(car.drive || "—")}<br>
          🔋 Palivo: ${escapeHTML(car.fuel || "—")}
        </div>

        <div class="section">
          <strong>🤖 Prečo ho AI vybrala</strong>
          <p>${escapeHTML(car.reason || "Vysvetlenie nie je dostupné.")}</p>
        </div>

        <div class="section pros">
          <strong>✅ Výhody</strong>
          <ul>${pros}</ul>
        </div>

        <div class="section cons">
          <strong>❌ Nevýhody</strong>
          <ul>${cons}</ul>
        </div>

        <div class="section">
          <strong>🔧 Údržba</strong>
          <p>${escapeHTML(car.maintenance || "Údaj nie je dostupný.")}</p>
        </div>

        <div class="section">
          <strong>📸 Zdroj fotografie</strong>
          <p class="photo-source">
            ${validImageURL(car.image)
              ? "Fotografia poskytnutá AI."
              : "Vyhľadáva sa fotografia vozidla…"}
          </p>
        </div>

        ${
          validWebsiteURL(car.configurator)
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
// IMAGE ERROR
// ============================================================

function imageLoadError(img) {
  if (img.dataset.fallbackUsed === "true") {
    return;
  }

  img.dataset.fallbackUsed = "true";

  img.src =
    "https://placehold.co/1200x700/e9eaec/555?text=Vehicle+photo+unavailable";
}


// ============================================================
// IMAGE SEARCH FOR ALL CARS
// ============================================================

async function findImagesForCars(cars) {
  const images = resultsBox.querySelectorAll(".car-image");

  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    const img = images[i];

    if (!car || !img) continue;

    if (img.dataset.imageFound === "true") {
      continue;
    }

    try {
      statusBox.textContent =
        `Vyhľadávam fotografiu: ${car.name || "vozidlo"}…`;

      let imageURL = await searchVehicleImage(car);

      if (imageURL) {
        img.dataset.imageFound = "true";
        img.dataset.fallbackUsed = "false";
        img.src = imageURL;

        const card = img.closest(".car");
        const source = card?.querySelector(".photo-source");

        if (source) {
          source.textContent =
            "Wikimedia Commons alebo Wikipedia. Skontroluj zhodu generácie.";
        }
      } else {
        const card = img.closest(".car");
        const source = card?.querySelector(".photo-source");

        img.src =
          "https://placehold.co/1200x700/e9eaec/555?text=No+vehicle+photo+found";

        if (source) {
          source.textContent =
            "Fotografiu sa nepodarilo nájsť.";
        }
      }

    } catch (error) {
      console.error("Chyba pri hľadaní fotografie:", error);
    }
  }

  statusBox.textContent =
    "Hotovo — vyhľadávanie vozidiel bolo dokončené.";
}


// ============================================================
// SEARCH IMAGE: COMMONS FIRST, WIKIPEDIA SECOND
// ============================================================

async function searchVehicleImage(car) {
  const name = String(car.name || "").trim();
  const generation = String(car.generation || "").trim();
  const year = String(car.year || "").trim();

  if (!name) return "";

  const queries = [
    `${name} ${generation} ${year}`,
    `${name} ${generation}`,
    `${name} car`
  ];

  // 1. Wikimedia Commons
  for (const query of queries) {
    const image = await searchCommonsImage(query);

    if (image) return image;
  }

  // 2. Wikipedia fallback
  for (const query of queries) {
    const image = await searchWikipediaImage(query);

    if (image) return image;
  }

  return "";
}


// ============================================================
// WIKIMEDIA COMMONS SEARCH
// ============================================================

async function searchCommonsImage(searchTerm) {
  try {
    const params = new URLSearchParams({
      action: "query",
      list: "search",
      srsearch: searchTerm,
      srnamespace: "6",
      srlimit: "10",
      format: "json",
      origin: "*"
    });

    const searchURL =
      "https://commons.wikimedia.org/w/api.php?" +
      params.toString();

    const searchResponse = await fetchWithTimeout(searchURL, 12000);

    if (!searchResponse.ok) return "";

    const searchData = await searchResponse.json();

    const results = searchData?.query?.search;

    if (!Array.isArray(results) || results.length === 0) {
      return "";
    }

    // Exclude likely logos, icons, flags, and diagrams.
    const candidates = results.filter(item => {
      const title = String(item.title || "").toLowerCase();

      return !(
        title.includes("logo") ||
        title.includes("icon") ||
        title.includes("flag") ||
        title.includes("coat of arms") ||
        title.includes("emblem") ||
        title.includes("diagram") ||
        title.includes("map")
      );
    });

    if (candidates.length === 0) return "";

    const titles = candidates
      .slice(0, 8)
      .map(item => item.title)
      .join("|");

    const infoParams = new URLSearchParams({
      action: "query",
      titles,
      prop: "imageinfo",
      iiprop: "url|mime",
      iiurlwidth: "1400",
      format: "json",
      origin: "*"
    });

    const infoURL =
      "https://commons.wikimedia.org/w/api.php?" +
      infoParams.toString();

    const infoResponse = await fetchWithTimeout(infoURL, 12000);

    if (!infoResponse.ok) return "";

    const infoData = await infoResponse.json();

    const pages = infoData?.query?.pages;

    if (!pages) return "";

    for (const page of Object.values(pages)) {
      const info = page?.imageinfo?.[0];

      if (!info) continue;

      if (
        info.mime &&
        !info.mime.startsWith("image/")
      ) {
        continue;
      }

      const url = info.thumburl || info.url || "";

      if (url.startsWith("https://upload.wikimedia.org/")) {
        return url;
      }
    }

    return "";

  } catch (error) {
    console.warn("Commons search failed:", error);
    return "";
  }
}


// ============================================================
// WIKIPEDIA IMAGE FALLBACK
// ============================================================

async function searchWikipediaImage(searchTerm) {
  try {
    const searchParams = new URLSearchParams({
      action: "query",
      list: "search",
      srsearch: searchTerm,
      srlimit: "5",
      format: "json",
      origin: "*"
    });

    const searchURL =
      "https://en.wikipedia.org/w/api.php?" +
      searchParams.toString();

    const searchResponse = await fetchWithTimeout(searchURL, 12000);

    if (!searchResponse.ok) return "";

    const searchData = await searchResponse.json();

    const results = searchData?.query?.search;

    if (!Array.isArray(results) || results.length === 0) {
      return "";
    }

    const titles = results
      .slice(0, 5)
      .map(item => item.title)
      .join("|");

    const imageParams = new URLSearchParams({
      action: "query",
      titles,
      prop: "pageimages",
      piprop: "thumbnail",
      pithumbsize: "1400",
      format: "json",
      origin: "*"
    });

    const imageURL =
      "https://en.wikipedia.org/w/api.php?" +
      imageParams.toString();

    const imageResponse = await fetchWithTimeout(imageURL, 12000);

    if (!imageResponse.ok) return "";

    const imageData = await imageResponse.json();

    const pages = imageData?.query?.pages;

    if (!pages) return "";

    for (const page of Object.values(pages)) {
      const thumbnail = page?.thumbnail?.source;

      if (validImageURL(thumbnail)) {
        return thumbnail;
      }
    }

    return "";

  } catch (error) {
    console.warn("Wikipedia image search failed:", error);
    return "";
  }
}


// ============================================================
// FETCH WITH TIMEOUT
// ============================================================

async function fetchWithTimeout(url, timeout = 12000) {
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    timeout
  );

  try {
    return await fetch(url, {
      method: "GET",
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}