const API_ENDPOINT = "/api/search";

const button = document.getElementById("searchButton");
const statusBox = document.getElementById("status");
const resultsBox = document.getElementById("results");

button.addEventListener("click", searchCars);

function value(id) {
  return document.getElementById(id).value.trim();
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

    resultCount: 3,

    requirements: [
      "Use current vehicle information.",
      "Prefer the newest available generation.",
      "The photograph must match the exact generation/model year.",
      "Use high-quality vehicle photographs.",
      "Consider vehicles worldwide.",
      "Return exactly three best matches.",
      "Prefer official manufacturer information for specifications.",
      "Provide an official manufacturer configurator when available."
    ]
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
  button.textContent = "🤖 AI HĽADÁ NAJLEPŠIE AUTÁ...";
  statusBox.textContent =
    "Vyhodnocujem požiadavky a hľadám aktuálne vozidlá…";
  resultsBox.innerHTML = "";

  try {
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
  const errorText = await response.text();
  throw new Error(`Backend ${response.status}: ${errorText}`);
}

    const data = await response.json();

    if (!data.cars || !Array.isArray(data.cars)) {
      throw new Error("AI nevrátila platné výsledky.");
    }

    renderResults(data.cars);

    statusBox.textContent =
      "Hotovo — AI vybrala 3 najvhodnejšie vozidlá.";

  } catch (error) {

    statusBox.textContent =
      "AI backend zatiaľ nie je pripojený.";

    resultsBox.innerHTML = `
      <div class="info">
        <strong>CARMATCH AI je pripravený.</strong><br><br>
        Frontend je pripravený na skutočné AI
        vyhľadávanie. Ďalším krokom je pripojenie
        bezpečného backendu a webového vyhľadávania.
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
    : "<li>Údaje doplní AI.</li>";

  const cons = Array.isArray(car.cons)
    ? car.cons.map(x => `<li>${escapeHTML(x)}</li>`).join("")
    : "<li>Údaje doplní AI.</li>";

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
          ${car.year ? " · modelový rok " + escapeHTML(String(car.year)) : ""}
        </div>

        <div class="score">
          ${escapeHTML(String(car.score ?? "—"))}%
        </div>

        <div class="specs">
          💰 Cena: ${escapeHTML(car.price || "—")}<br>
          ⚡ Výkon: ${escapeHTML(car.power || "—")}<br>
          🪑 Miesta: ${escapeHTML(car.seats || "—")}<br>
          🧳 Kufor: ${escapeHTML(car.trunk || "—")}<br>
          🚗 Pohon: ${escapeHTML(car.drive || "—")}<br>
          🔋 Palivo: ${escapeHTML(car.fuel || "—")}
        </div>

        <div class="section">
          <strong>🤖 Prečo ho AI vybrala</strong>
          ${escapeHTML(car.reason || "AI doplní vysvetlenie.")}
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
          ${escapeHTML(car.maintenance || "Údaje nie sú dostupné.")}
        </div>

        <div class="section">
          <strong>📸 Fotografia</strong>
          ${escapeHTML(car.photoSource || "Aktuálny zdroj fotografie")}
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
