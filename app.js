const API_ENDPOINT = "/api/search";

const button = document.getElementById("searchButton");
const statusBox = document.getElementById("status");
const resultsBox = document.getElementById("results");

button.addEventListener("click", searchCars);

function value(id) {
  const element = document.getElementById(id);
  return element ? element.value.trim() : "";
}

function collectRequest() {
  return {
    naturalLanguage: value("aiRequest"),

    filters: {
      budget: value("budget"),
      seats: value("seats"),
      powerKW: value("power"),
      trunkLitres: value("trunk"),
      drive: value("drive"),
      fuel: value("fuel"),
      body: value("body"),
      style: value("style"),
      maxLength: value("length"),
      year: value("year"),
      avoidBrands: value("avoid")
    },

    resultCount: 3
  };
}

async function searchCars() {
  const request = collectRequest();

  if (
    !request.naturalLanguage &&
    Object.values(request.filters).every(v => !v)
  ) {
    statusBox.textContent =
      "Zadaj požiadavku alebo aspoň jeden filter.";
    return;
  }

  button.disabled = true;
  button.textContent = "🤖 AI VYBERÁ NAJLEPŠIE AUTÁ...";
  statusBox.textContent =
    "AI vyhodnocuje tvoje požiadavky…";
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

    if (!response.ok) {
      throw new Error(
        `Backend ${response.status}: ${responseText}`
      );
    }

    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error("Backend vrátil neplatnú odpoveď.");
    }

    if (!data.cars || !Array.isArray(data.cars)) {
      throw new Error("AI nevrátila platné výsledky.");
    }

    renderResults(data.cars);

    statusBox.textContent =
      "Hotovo — AI vybrala 3 najvhodnejšie vozidlá.";
// 🔔 Oznámenie o dokončení vyhľadávania
try {
  // 📳 Krátka vibrácia na podporovaných telefónoch
  if ("vibrate" in navigator) {
    navigator.vibrate([150, 80, 150]);
  }

  // 🔊 Krátky zvuk
  const audioContext = new (
    window.AudioContext || window.webkitAudioContext
  )();

  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

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
    0.15,
    audioContext.currentTime + 0.02
  );

  gainNode.gain.exponentialRampToValueAtTime(
    0.001,
    audioContext.currentTime + 0.35
  );

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.35);

} catch (notificationError) {
  console.log(
    "Zvuk alebo vibrácia nie sú na tomto zariadení dostupné."
  );
}    

  } catch (error) {
    console.error(error);

    statusBox.textContent = error.message;

    resultsBox.innerHTML = `
      <div class="info">
        <strong>CARMATCH AI sa nepodarilo dokončiť vyhľadávanie.</strong><br><br>
        ${escapeHTML(error.message)}
      </div>
    `;
  } finally {
    button.disabled = false;
    button.innerHTML =
      '🤖 NÁJSŤ MOJE TOP 3 AUTÁ <span>→</span>';
  }
}

function renderResults(cars) {
  resultsBox.innerHTML = `
    <h2 class="results-title">
      Tvoje TOP 3 autá
    </h2>

    <div class="results">
      ${cars.map((car, index) => createCard(car, index)).join("")}
    </div>
  `;
}

function createCard(car, index) {
  const pros = Array.isArray(car.pros)
    ? car.pros.map(x => `<li>${escapeHTML(x)}</li>`).join("")
    : "<li>Údaj nie je dostupný.</li>";

  const cons = Array.isArray(car.cons)
    ? car.cons.map(x => `<li>${escapeHTML(x)}</li>`).join("")
    : "<li>Údaj nie je dostupný.</li>";

  const image =
    car.image ||
    "https://placehold.co/1200x700/e9eaec/555?text=Car";

  return `
    <article class="car">

      <img
        class="car-image"
        src="${escapeAttribute(image)}"
        alt="${escapeAttribute(car.name || "Automobil")}"
        loading="lazy"
        onerror="this.src='https://placehold.co/1200x700/e9eaec/555?text=Car'"
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
          💰 Cena: ${escapeHTML(car.price || "—")}<br>
          ⚡ Výkon: ${escapeHTML(car.power || "—")}<br>
          🪑 Miesta: ${escapeHTML(String(car.seats || "—"))}<br>
          🧳 Kufor: ${escapeHTML(car.trunk || "—")}<br>
          🚗 Pohon: ${escapeHTML(car.drive || "—")}<br>
          🔋 Palivo: ${escapeHTML(car.fuel || "—")}
        </div>

        <div class="section">
          <strong>🤖 Prečo ho AI vybrala</strong>
          ${escapeHTML(
            car.reason || "Vysvetlenie nie je dostupné."
          )}
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
          ${escapeHTML(
            car.maintenance || "Údaj nie je dostupný."
          )}
        </div>

        <div class="section">
          <strong>📸 Zdroj fotografie</strong>
          ${escapeHTML(
            car.photoSource || "Automatický zdroj"
          )}
        </div>

        ${
          car.configurator
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

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHTML(value);
}
