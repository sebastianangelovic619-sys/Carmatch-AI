const cars = [

  {
    name: "Porsche 911",
    brand: "Porsche",
    wiki: "Porsche 911",
    price: 150000,
    seats: 2,
    trunk: 264,
    power: 368,
    length: 4.54,
    drive: "4x4",
    fuel: "Benzín",
    body: "Kupé",
    style: "Športový",
    year: 2026,
    maintenance: "Vysoké",
    annualCost: "cca 4 000–8 000 €",
    pros: [
      "výborné jazdné vlastnosti",
      "ikonický dizajn",
      "vysoký výkon"
    ],
    cons: [
      "vyššia cena",
      "menší batožinový priestor"
    ],
    configurator: "https://models.porsche.com/sk-SK/model-start"
  },

  {
    name: "Porsche 718 Cayman",
    brand: "Porsche",
    wiki: "Porsche 718 Cayman",
    price: 85000,
    seats: 2,
    trunk: 425,
    power: 220,
    length: 4.38,
    drive: "4x2",
    fuel: "Benzín",
    body: "Kupé",
    style: "Športový",
    year: 2026,
    maintenance: "Vysoké",
    annualCost: "cca 3 000–6 000 €",
    pros: [
      "nízka hmotnosť",
      "výborná ovládateľnosť",
      "športový charakter"
    ],
    cons: [
      "iba 2 miesta",
      "vyššie servisné náklady"
    ],
    configurator: "https://models.porsche.com/sk-SK/model-start"
  },

  {
    name: "Mercedes-AMG GT",
    brand: "Mercedes-Benz",
    wiki: "Mercedes-AMG GT",
    price: 140000,
    seats: 2,
    trunk: 321,
    power: 430,
    length: 4.73,
    drive: "4x4",
    fuel: "Benzín",
    body: "Kupé",
    style: "Luxusný",
    year: 2026,
    maintenance: "Vysoké",
    annualCost: "cca 4 000–8 000 €",
    pros: [
      "veľmi vysoký výkon",
      "luxusný interiér",
      "4MATIC"
    ],
    cons: [
      "vysoká cena",
      "drahšia údržba"
    ],
    configurator: "https://www.mercedes-benz.sk/passengercars/configurator.html"
  },

  {
    name: "Mercedes-Benz E-Class",
    brand: "Mercedes-Benz",
    wiki: "Mercedes-Benz E-Class",
    price: 65000,
    seats: 5,
    trunk: 540,
    power: 150,
    length: 4.95,
    drive: "4x4",
    fuel: "Hybrid",
    body: "Sedan",
    style: "Luxusný",
    year: 2026,
    maintenance: "Stredné až vysoké",
    annualCost: "cca 2 500–5 000 €",
    pros: [
      "komfort",
      "technológie",
      "luxusný interiér"
    ],
    cons: [
      "vyššia obstarávacia cena",
      "zložitejšia technika"
    ],
    configurator: "https://www.mercedes-benz.sk/passengercars/configurator.html"
  },

  {
    name: "Mercedes-Benz G-Class",
    brand: "Mercedes-Benz",
    wiki: "Mercedes-Benz G-Class",
    price: 150000,
    seats: 5,
    trunk: 640,
    power: 430,
    length: 4.87,
    drive: "4x4",
    fuel: "Benzín",
    body: "SUV",
    style: "Luxusný",
    year: 2026,
    maintenance: "Vysoké",
    annualCost: "cca 4 000–9 000 €",
    pros: [
      "ikonický dizajn",
      "výborná priechodnosť",
      "luxus"
    ],
    cons: [
      "vysoká cena",
      "vyššia spotreba"
    ],
    configurator: "https://www.mercedes-benz.sk/passengercars/configurator.html"
  },

  {
    name: "Audi RS6 Avant",
    brand: "Audi",
    wiki: "Audi RS 6",
    price: 130000,
    seats: 5,
    trunk: 548,
    power: 463,
    length: 4.99,
    drive: "4x4",
    fuel: "Benzín",
    body: "Kombi",
    style: "Športový",
    year: 2026,
    maintenance: "Vysoké",
    annualCost: "cca 3 500–7 000 €",
    pros: [
      "obrovský výkon",
      "praktické kombi",
      "quattro"
    ],
    cons: [
      "vysoká cena",
      "vyššia spotreba"
    ],
    configurator: "https://www.audi.sk/"
  },

  {
    name: "BMW M5",
    brand: "BMW",
    wiki: "BMW M5",
    price: 130000,
    seats: 5,
    trunk: 466,
    power: 535,
    length: 5.10,
    drive: "4x4",
    fuel: "Hybrid",
    body: "Sedan",
    style: "Športový",
    year: 2026,
    maintenance: "Vysoké",
    annualCost: "cca 3 000–7 000 €",
    pros: [
      "extrémny výkon",
      "praktické 4 dvere",
      "xDrive"
    ],
    cons: [
      "vyššia hmotnosť",
      "vysoká cena"
    ],
    configurator: "https://www.bmw.sk/"
  },

  {
    name: "Lamborghini Revuelto",
    brand: "Lamborghini",
    wiki: "Lamborghini Revuelto",
    price: 500000,
    seats: 2,
    trunk: 86,
    power: 747,
    length: 4.95,
    drive: "4x4",
    fuel: "Hybrid",
    body: "Superšport",
    style: "Športový",
    year: 2026,
    maintenance: "Veľmi vysoké",
    annualCost: "cca 8 000–15 000 €",
    pros: [
      "extrémny výkon",
      "V12",
      "unikátny dizajn"
    ],
    cons: [
      "extrémna cena",
      "malý kufor"
    ],
    configurator: "https://www.lamborghini.com/"
  },

  {
    name: "Lamborghini Temerario",
    brand: "Lamborghini",
    wiki: "Lamborghini Temerario",
    price: 300000,
    seats: 2,
    trunk: 100,
    power: 677,
    length: 4.71,
    drive: "4x4",
    fuel: "Hybrid",
    body: "Superšport",
    style: "Športový",
    year: 2026,
    maintenance: "Veľmi vysoké",
    annualCost: "cca 7 000–13 000 €",
    pros: [
      "vysoký výkon",
      "moderný hybridný systém",
      "Lamborghini dizajn"
    ],
    cons: [
      "vysoká cena",
      "iba 2 miesta"
    ],
    configurator: "https://www.lamborghini.com/"
  },

  {
    name: "Ferrari 296 GTB",
    brand: "Ferrari",
    wiki: "Ferrari 296 GTB",
    price: 320000,
    seats: 2,
    trunk: 197,
    power: 610,
    length: 4.57,
    drive: "4x2",
    fuel: "Hybrid",
    body: "Superšport",
    style: "Športový",
    year: 2026,
    maintenance: "Veľmi vysoké",
    annualCost: "cca 7 000–14 000 €",
    pros: [
      "výborná dynamika",
      "V6 hybrid",
      "Ferrari dizajn"
    ],
    cons: [
      "veľmi vysoká cena",
      "málo priestoru"
    ],
    configurator: "https://www.ferrari.com/"
  },

  {
    name: "Ferrari Purosangue",
    brand: "Ferrari",
    wiki: "Ferrari Purosangue",
    price: 390000,
    seats: 4,
    trunk: 473,
    power: 533,
    length: 4.97,
    drive: "4x4",
    fuel: "Benzín",
    body: "SUV",
    style: "Luxusný",
    year: 2026,
    maintenance: "Veľmi vysoké",
    annualCost: "cca 7 000–14 000 €",
    pros: [
      "V12",
      "4 miesta",
      "unikátny dizajn"
    ],
    cons: [
      "extrémna cena",
      "drahá údržba"
    ],
    configurator: "https://www.ferrari.com/"
  },

  {
    name: "McLaren Artura",
    brand: "McLaren",
    wiki: "McLaren Artura",
    price: 250000,
    seats: 2,
    trunk: 160,
    power: 500,
    length: 4.54,
    drive: "4x2",
    fuel: "Hybrid",
    body: "Superšport",
    style: "Športový",
    year: 2026,
    maintenance: "Veľmi vysoké",
    annualCost: "cca 6 000–12 000 €",
    pros: [
      "nízka hmotnosť",
      "výkon",
      "výborná aerodynamika"
    ],
    cons: [
      "málo priestoru",
      "vysoká cena"
    ],
    configurator: "https://cars.mclaren.com/"
  },

  {
    name: "Aston Martin Vantage",
    brand: "Aston Martin",
    wiki: "Aston Martin Vantage",
    price: 180000,
    seats: 2,
    trunk: 235,
    power: 489,
    length: 4.49,
    drive: "4x2",
    fuel: "Benzín",
    body: "Kupé",
    style: "Luxusný",
    year: 2026,
    maintenance: "Veľmi vysoké",
    annualCost: "cca 5 000–10 000 €",
    pros: [
      "luxusný dizajn",
      "výkon",
      "exkluzivita"
    ],
    cons: [
      "vyššia cena",
      "2 miesta"
    ],
    configurator: "https://www.astonmartin.com/"
  },

  {
    name: "Bentley Continental GT",
    brand: "Bentley",
    wiki: "Bentley Continental GT",
    price: 250000,
    seats: 4,
    trunk: 358,
    power: 575,
    length: 4.90,
    drive: "4x4",
    fuel: "Hybrid",
    body: "Kupé",
    style: "Luxusný",
    year: 2026,
    maintenance: "Veľmi vysoké",
    annualCost: "cca 7 000–15 000 €",
    pros: [
      "extrémny luxus",
      "výkon",
      "komfort"
    ],
    cons: [
      "veľmi vysoká cena",
      "drahá údržba"
    ],
    configurator: "https://www.bentleymotors.com/"
  },

  {
    name: "Range Rover Sport",
    brand: "Land Rover",
    wiki: "Range Rover Sport",
    price: 120000,
    seats: 5,
    trunk: 647,
    power: 294,
    length: 4.95,
    drive: "4x4",
    fuel: "Hybrid",
    body: "SUV",
    style: "Luxusný",
    year: 2026,
    maintenance: "Vysoké",
    annualCost: "cca 3 000–7 000 €",
    pros: [
      "luxus",
      "4x4",
      "komfort"
    ],
    cons: [
      "drahšia údržba",
      "vyššia hmotnosť"
    ],
    configurator: "https://www.landrover.sk/"
  },

  {
    name: "Volvo EX90",
    brand: "Volvo",
    wiki: "Volvo EX90",
    price: 95000,
    seats: 7,
    trunk: 310,
    power: 380,
    length: 5.04,
    drive: "4x4",
    fuel: "Elektrické",
    body: "SUV",
    style: "Elegantný",
    year: 2026,
    maintenance: "Stredné",
    annualCost: "cca 1 500–3 500 €",
    pros: [
      "7 miest",
      "bezpečnosť",
      "elektrický pohon"
    ],
    cons: [
      "veľké rozmery",
      "vyššia cena"
    ],
    configurator: "https://www.volvocars.com/sk/"
  },

  {
    name: "Škoda Superb Combi",
    brand: "Škoda",
    wiki: "Škoda Superb",
    price: 48000,
    seats: 5,
    trunk: 690,
    power: 195,
    length: 4.90,
    drive: "4x4",
    fuel: "Benzín",
    body: "Kombi",
    style: "Elegantný",
    year: 2026,
    maintenance: "Stredné",
    annualCost: "cca 1 200–2 500 €",
    pros: [
      "obrovský kufor",
      "komfort",
      "dobrý pomer ceny a priestoru"
    ],
    cons: [
      "menej exkluzívny dizajn",
      "nižší výkon oproti superšportom"
    ],
    configurator: "https://www.skoda-auto.sk/"
  },

  {
    name: "Škoda Kodiaq",
    brand: "Škoda",
    wiki: "Škoda Kodiaq",
    price: 52000,
    seats: 7,
    trunk: 910,
    power: 142,
    length: 4.76,
    drive: "4x4",
    fuel: "Diesel",
    body: "SUV",
    style: "Elegantný",
    year: 2026,
    maintenance: "Stredné",
    annualCost: "cca 1 300–2 700 €",
    pros: [
      "veľký kufor",
      "7 miest",
      "praktickosť"
    ],
    cons: [
      "nižší výkon",
      "väčšie rozmery"
    ],
    configurator: "https://www.skoda-auto.sk/"
  },

  {
    name: "Tesla Model S",
    brand: "Tesla",
    wiki: "Tesla Model S",
    price: 95000,
    seats: 5,
    trunk: 793,
    power: 500,
    length: 5.02,
    drive: "4x4",
    fuel: "Elektrické",
    body: "Sedan",
    style: "Športový",
    year: 2026,
    maintenance: "Nízke až stredné",
    annualCost: "cca 1 000–2 500 €",
    pros: [
      "vysoký výkon",
      "elektrický pohon",
      "veľký úložný priestor"
    ],
    cons: [
      "veľké rozmery",
      "závislosť od nabíjania"
    ],
    configurator: "https://www.tesla.com/"
  },

  {
    name: "Lucid Air",
    brand: "Lucid",
    wiki: "Lucid Air",
    price: 90000,
    seats: 5,
    trunk: 456,
    power: 500,
    length: 4.98,
    drive: "4x4",
    fuel: "Elektrické",
    body: "Sedan",
    style: "Luxusný",
    year: 2026,
    maintenance: "Stredné",
    annualCost: "cca 1 500–3 000 €",
    pros: [
      "výkon",
      "luxus",
      "veľký dojazd"
    ],
    cons: [
      "menšia dostupnosť servisu",
      "vyššia cena"
    ],
    configurator: "https://lucidmotors.com/"
  }

];


function getNumber(id) {
  return Number(document.getElementById(id).value);
}

function getValue(id) {
  return document.getElementById(id).value;
}


async function loadCarImage(car, imageElement, loadingElement) {

  try {

    const url =
      "https://en.wikipedia.org/api/rest_v1/page/summary/" +
      encodeURIComponent(car.wiki);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("Image not found");
    }

    const data = await response.json();

    if (
      data.thumbnail &&
      data.thumbnail.source
    ) {

      imageElement.src =
        data.thumbnail.source;

      imageElement.style.display =
        "block";

      loadingElement.style.display =
        "none";

    } else {

      throw new Error("No image");

    }

  } catch (error) {

    imageElement.src =
      "https://placehold.co/1200x700/e9eaec/555?text=" +
      encodeURIComponent(car.name);

    imageElement.style.display =
      "block";

    loadingElement.style.display =
      "none";
  }
}


function calculateScore(car, req) {

  let score = 0;

  const reasons = [];
  const misses = [];


  if (car.price <= req.budget) {

    score += 20;
    reasons.push("zmestí sa do rozpočtu");

  } else {

    const difference =
      (car.price - req.budget) /
      Math.max(req.budget, 1);

    score += Math.max(
      0,
      20 - difference * 20
    );

    misses.push(
      "prekračuje rozpočet"
    );
  }


  if (car.seats >= req.seats) {

    score += 15;
    reasons.push(
      "spĺňa počet miest"
    );

  } else {

    misses.push(
      "má menej miest"
    );
  }


  if (car.trunk >= req.trunk) {

    score += 15;
    reasons.push(
      "spĺňa požadovaný kufor"
    );

  } else {

    const ratio =
      car.trunk /
      Math.max(req.trunk, 1);

    score +=
      Math.max(0, ratio * 15);

    misses.push(
      "má menší kufor"
    );
  }


  if (car.power >= req.power) {

    score += 15;
    reasons.push(
      "spĺňa požadovaný výkon"
    );

  } else {

    const ratio =
      car.power /
      Math.max(req.power, 1);

    score +=
      Math.max(0, ratio * 15);

    misses.push(
      "nedosahuje požadovaný výkon"
    );
  }


  if (car.length <= req.length) {

    score += 10;
    reasons.push(
      "vyhovuje maximálnej dĺžke"
    );

  } else {

    misses.push(
      "je dlhšie než požadovaná dĺžka"
    );
  }


  if (
    req.drive === "Ľubovoľný" ||
    car.drive === req.drive
  ) {

    score += 7;
    reasons.push(
      "vyhovuje pohonu"
    );

  } else {

    misses.push(
      "nevyhovuje požadovanému pohonu"
    );
  }


  if (
    req.fuel === "Ľubovoľný" ||
    car.fuel === req.fuel
  ) {

    score += 5;
    reasons.push(
      "vyhovuje typu pohonu"
    );

  } else {

    misses.push(
      "nevyhovuje typu pohonu"
    );
  }


  if (
    req.body === "Ľubovoľná" ||
    car.body === req.body
  ) {

    score += 5;
    reasons.push(
      "vyhovuje karosériou"
    );

  } else {

    misses.push(
      "iná karoséria"
    );
  }


  if (
    req.style === "Ľubovoľný" ||
    car.style === req.style
  ) {

    score += 5;
    reasons.push(
      "zodpovedá požadovanému vzhľadu"
    );
  }


  if (req.year === "Najnovší") {

    if (car.year >= 2026) {

      score += 3;
      reasons.push(
        "patrí medzi najnovšie modely"
      );
    }

  } else {

    if (
      String(car.year) ===
      req.year
    ) {

      score += 3;

    }

  }


  return {

    score:
      Math.max(
        0,
        Math.min(
          100,
          Math.round(score)
        )
      ),

    reasons,
    misses
  };
}


function findCars() {

  const req = {

    budget: getNumber("budget"),

    seats: getNumber("seats"),

    trunk: getNumber("trunk"),

    power: getNumber("power"),

    length: getNumber("length"),

    drive: getValue("drive"),

    fuel: getValue("fuel"),

    body: getValue("body"),

    style: getValue("style"),

    year: getValue("year")
  };


  const avoid =
    getValue("avoid")
      .toLowerCase()
      .split(",")
      .map(
        x => x.trim()
      )
      .filter(Boolean);


  const results =
    cars
      .filter(car => {

        return !avoid.some(
          brand =>
            car.brand
              .toLowerCase()
              .includes(brand)
        );

      })
      .map(car => {

        const result =
          calculateScore(
            car,
            req
          );

        return {

          ...car,

          score:
            result.score,

          reasons:
            result.reasons,

          misses:
            result.misses

        };

      })
      .sort(
        (a, b) =>
          b.score - a.score
      )
      .slice(0, 3);


  renderResults(results);
}


function renderResults(results) {

  const output =
    document.getElementById(
      "output"
    );


  if (!results.length) {

    output.innerHTML = `
      <div class="info">
        Nenašli sa žiadne autá.
      </div>
    `;

    return;
  }


  const cards =
    results
      .map(
        (car, index) => {

          const reasons =
            car.reasons
              .slice(0, 5)
              .join(", ");


          const misses =
            car.misses.length
              ? car.misses
                  .slice(0, 3)
                  .join(", ")
              : "Žiadne významné nedostatky.";


          return `

          <article class="car">

            <div
              class="image-loading"
              id="loading-${index}"
            >
              Načítavam fotografiu…
            </div>

            <img
              class="car-image"
              id="image-${index}"
              alt="${car.name}"
              style="display:none"
            >

            <div class="body">

              <div class="rank">
                #${index + 1}
                NAJLEPŠIA ZHODA
              </div>

              <div class="name">
                ${car.name}
              </div>

              <div class="year">
                Modelový rok
                ${car.year}
              </div>

              <div class="score">
                ${car.score}%
              </div>

              <div class="score-label">
                ZHODA S POŽIADAVKAMI
              </div>

              <div class="spec">

                💰 Cena:
                €${car.price.toLocaleString("sk-SK")}

                <br>

                ⚡ Výkon:
                ${car.power} kW

                <br>

                🪑 Miesta:
                ${car.seats}

                <br>

                🧳 Kufor:
                ${car.trunk} l

                <br>

                📏 Dĺžka:
                ${car.length.toFixed(2)} m

                <br>

                🚗 Pohon:
                ${car.drive}

                <br>

                🔋 Typ:
                ${car.fuel}

              </div>


              <span class="tag">
                ${car.body}
              </span>

              <span class="tag">
                ${car.style}
              </span>


              <div class="reason">

                <p>

                  <b>
                    💡 Prečo bolo auto vybrané:
                  </b>

                  <br>

                  ${reasons}

                </p>


                <p>

                  <b>
                    ⚠️ Čo treba zvážiť:
                  </b>

                  <br>

                  ${misses}

                </p>

              </div>


              <div class="pros">

                <strong>
                  ✅ Výhody
                </strong>

                <ul>

                  ${car.pros
                    .map(
                      item =>
                        `<li>${item}</li>`
                    )
                    .join("")}

                </ul>

              </div>


              <div class="cons">

                <strong>
                  ❌ Nevýhody
                </strong>

                <ul>

                  ${car.cons
                    .map(
                      item =>
                        `<li>${item}</li>`
                    )
                    .join("")}

                </ul>

              </div>


              <div class="maintenance">

                <strong>
                  🔧 Náklady na údržbu
                </strong>

                <p>

                  Úroveň:
                  ${car.maintenance}

                  <br>

                  Odhad ročných nákladov:
                  ${car.annualCost}

                </p>

              </div>


              <a
                class="configure"
                href="${car.configurator}"
                target="_blank"
                rel="noopener noreferrer"
              >
                ⚙️ KONFIGUROVAŤ AUTO →
              </a>

            </div>

          </article>

          `;
        }
      )
      .join("");


  output.innerHTML = `

    <h2 class="title">
      Tvoje najlepšie zhody
    </h2>

    <div class="results">
      ${cards}
    </div>

    ${createComparison(results)}

    <div class="info">

      📸 Pri každom aute sa aplikácia
      pokúsi načítať fotografiu konkrétneho modelu.

      <br><br>

      ⚙️ Tlačidlo „Konfigurovať auto“
      otvorí oficiálnu stránku automobilky.

    </div>

  `;


  results.forEach(
    (car, index) => {

      const image =
        document.getElementById(
          `image-${index}`
        );

      const loading =
        document.getElementById(
          `loading-${index}`
        );


      loadCarImage(
        car,
        image,
        loading
      );

    }
  );
}


function createComparison(cars) {

  return `

    <div class="compare">

      <h2>
        Porovnanie TOP 3
      </h2>

      <table>

        <tr>

          <th>
            Parameter
          </th>

          ${cars
            .map(
              car =>
                `<th>${car.name}</th>`
            )
            .join("")}

        </tr>


        <tr>

          <td>
            Zhoda
          </td>

          ${cars
            .map(
              car =>
                `<td><b>${car.score}%</b></td>`
            )
            .join("")}

        </tr>


        <tr>

          <td>
            Cena
          </td>

          ${cars
            .map(
              car =>
                `<td>€${car.price.toLocaleString("sk-SK")}</td>`
            )
            .join("")}

        </tr>


        <tr>

          <td>
            Výkon
          </td>

          ${cars
            .map(
              car =>
                `<td>${car.power} kW</td>`
            )
            .join("")}

        </tr>


        <tr>

          <td>
            Miesta
          </td>

          ${cars
            .map(
              car =>
                `<td>${car.seats}</td>`
            )
            .join("")}

        </tr>


        <tr>

          <td>
            Kufor
          </td>

          ${cars
            .map(
              car =>
                `<td>${car.trunk} l</td>`
            )
            .join("")}

        </tr>


        <tr>

          <td>
            Pohon
          </td>

          ${cars
            .map(
              car =>
                `<td>${car.drive}</td>`
            )
            .join("")}

        </tr>


        <tr>

          <td>
            Údržba
          </td>

          ${cars
            .map(
              car =>
                `<td>${car.maintenance}</td>`
            )
            .join("")}

        </tr>

      </table>

    </div>

  `;
}


window.addEventListener(
  "load",
  () => {
    findCars();
  }
);
