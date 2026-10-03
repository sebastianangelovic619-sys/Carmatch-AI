// ============================================================
// CARMATCH AI - SEARCH API
// ============================================================
// - Supabase anonymous authentication
// - 5 searches / day
// - Search refund protection
// - Groq web research
// - OpenRouter fallback
// - Exactly 3 cars
// - Current price research
// - Official manufacturer URLs
// - Image candidates
// - Power in kW + HP
// - Slovak output
// ============================================================

"use strict";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const MAX_SEARCH_TIME = 55000;

const IMAGE_TIMEOUT = 8000;

const PROVIDERS = [
  {
    name: "groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: "openai/gpt-oss-120b"
  },
  {
    name: "groq-mini",
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: "openai/gpt-oss-20b"
  }
];

const OPENROUTER_MODELS = [
  "qwen/qwen3.5-397b-a17b",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "openrouter/free"
];


// ============================================================
// BASIC HELPERS
// ============================================================

function json(res, status, data) {
  res.status(status).json(data);
}

function clean(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function isValidUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeUrl(value) {
  if (!value) return "";

  let url = String(value).trim();

  if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url;
  }

  return isValidUrl(url) ? url : "";
}

function hpFromKw(kw) {
  const number = Number(kw);

  if (!Number.isFinite(number)) return null;

  return Math.round(number * 1.35962);
}

function kwFromHp(hp) {
  const number = Number(hp);

  if (!Number.isFinite(number)) return null;

  return Math.round(number / 1.35962);
}


// ============================================================
// REQUEST BODY
// ============================================================

function getUserQuery(req) {
  const body = req.body || {};

  return clean(
    body.query ||
    body.search ||
    body.prompt ||
    body.text
  );
}


// ============================================================
// SUPABASE
// ============================================================

async function supabaseRpc(functionName, payload) {

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return {
      ok: false,
      error: "Supabase configuration missing"
    };
  }

  try {

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/${functionName}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify(payload || {})
      }
    );

    const text = await response.text();

    let data = null;

    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: data
      };
    }

    return {
      ok: true,
      data
    };

  } catch (error) {

    return {
      ok: false,
      error: error.message
    };

  }
}


// ============================================================
// SEARCH USAGE
// ============================================================

async function chargeSearch(userId) {

  const functions = [
    "use_search",
    "consume_search",
    "increment_search"
  ];

  for (const functionName of functions) {

    const result = await supabaseRpc(
      functionName,
      {
        p_user_id: userId
      }
    );

    if (result.ok) {

      return {
        ok: true,
        functionName,
        data: result.data
      };

    }
  }

  return {
    ok: false,
    error: "Search usage function unavailable"
  };
}


async function refundSearch(userId) {

  const functions = [
    "refund_search",
    "refund_search_usage",
    "decrement_search"
  ];

  for (const functionName of functions) {

    const result = await supabaseRpc(
      functionName,
      {
        p_user_id: userId
      }
    );

    if (result.ok) {

      return {
        ok: true,
        functionName
      };

    }
  }

  return {
    ok: false
  };
}


// ============================================================
// IMAGE SEARCH
// ============================================================

function rejectedImageUrl(url) {

  const value = String(url || "").toLowerCase();

  const blocked = [
    "logo",
    "logos",
    "interior",
    "dashboard",
    "concept",
    "render",
    "truck",
    "bus",
    "motorcycle",
    "motorbike",
    "wallpaper",
    "sketch"
  ];

  return blocked.some(term => value.includes(term));
}


async function wikipediaImage(brand, model) {

  const title = encodeURIComponent(
    `${brand} ${model}`
  );

  const url =
    `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`;

  try {

    const controller = new AbortController();

    const timer = setTimeout(
      () => controller.abort(),
      IMAGE_TIMEOUT
    );

    const response = await fetch(
      url,
      {
        signal: controller.signal,
        headers: {
          "User-Agent": "CARMATCH-AI/1.0"
        }
      }
    );

    clearTimeout(timer);

    if (!response.ok) {
      return [];
    }

    const data = await response.json();

    const images = [];

    if (
      data &&
      data.originalimage &&
      data.originalimage.source &&
      !rejectedImageUrl(data.originalimage.source)
    ) {

      images.push(
        data.originalimage.source
      );
    }

    if (
      data &&
      data.thumbnail &&
      data.thumbnail.source &&
      !rejectedImageUrl(data.thumbnail.source)
    ) {

      if (!images.includes(data.thumbnail.source)) {
        images.push(data.thumbnail.source);
      }
    }

    return images;

  } catch {
    return [];
  }
}


async function wikimediaImages(brand, model) {

  const query = encodeURIComponent(
    `${brand} ${model}`
  );

  const url =
    `https://commons.wikimedia.org/w/api.php` +
    `?action=query` +
    `&generator=search` +
    `&gsrsearch=${query}` +
    `&gsrnamespace=6` +
    `&gsrlimit=8` +
    `&prop=imageinfo` +
    `&iiprop=url` +
    `&iiurlwidth=1200` +
    `&format=json` +
    `&origin=*`;

  try {

    const controller = new AbortController();

    const timer = setTimeout(
      () => controller.abort(),
      IMAGE_TIMEOUT
    );

    const response = await fetch(
      url,
      {
        signal: controller.signal,
        headers: {
          "User-Agent": "CARMATCH-AI/1.0"
        }
      }
    );

    clearTimeout(timer);

    if (!response.ok) {
      return [];
    }

    const data = await response.json();

    const pages =
      data &&
      data.query &&
      data.query.pages
        ? Object.values(data.query.pages)
        : [];

    const images = [];

    for (const page of pages) {

      const imageInfo =
        page &&
        page.imageinfo &&
        page.imageinfo[0];

      if (!imageInfo) continue;

      const imageUrl =
        imageInfo.thumburl ||
        imageInfo.url ||
        "";

      if (!imageUrl) continue;

      if (rejectedImageUrl(imageUrl)) {
        continue;
      }

      if (!images.includes(imageUrl)) {
        images.push(imageUrl);
      }
    }

    return images;

  } catch {
    return [];
  }
}


async function getImageCandidates(brand, model) {

  const [wiki, commons] =
    await Promise.all([
      wikipediaImage(brand, model),
      wikimediaImages(brand, model)
    ]);

  const combined = [
    ...wiki,
    ...commons
  ];

  const unique = [];

  for (const image of combined) {

    if (!image) continue;

    if (!isValidUrl(image)) continue;

    if (rejectedImageUrl(image)) continue;

    if (!unique.includes(image)) {
      unique.push(image);
    }

    if (unique.length >= 8) {
      break;
    }
  }

  return unique;
}


// ============================================================
// AI PROMPT
// ============================================================

function buildPrompt(userQuery) {

  return `
You are CARMATCH AI, an automotive research assistant.

The user is Slovak.

USER REQUEST:
${userQuery}

Your task is to research CURRENT, REAL production cars and return EXACTLY 3
real cars that match the user's requirements as closely as possible.

IMPORTANT:
- Do not invent cars.
- Do not invent prices.
- Do not invent specifications.
- Do not invent official URLs.
- Do not use concept cars unless the user explicitly requests concepts.
- Prefer currently sold or officially announced production models.
- Prefer the newest available generation/model year.
- Research current prices whenever possible.
- Prices must be for the requested market if the user specifies a market.
- If the exact current price cannot be verified, use null rather than inventing one.
- Try to provide a real current price for every car.
- Use EUR when appropriate for European users.
- Power must contain both kW and HP.
- Never use "ks", "k", "koní" or "PS" as the power unit.
- Use kW and HP only.
- Use liters for trunk volume.
- Use real drivetrain information.
- Distinguish petrol, diesel, hybrid, plug-in hybrid and electric correctly.
- Do not confuse horsepower with kilowatts.
- Do not confuse boot/trunk capacity with maximum cargo capacity.
- Do not confuse model year with generation year.

PRICE:
The price field should be a numeric starting price when a current verifiable
price exists.

PRICE SOURCE:
Provide the URL of the official manufacturer or official local-market
configuration/pricing page whenever possible.

OFFICIAL URL:
Use the official manufacturer's website or official configurator.
Do not invent URLs.

IMAGE:
Do not invent image URLs.
Images will be searched separately by the backend.

Return ONLY valid JSON.

Use this exact structure:

{
  "cars": [
    {
      "rank": 1,
      "brand": "",
      "model": "",
      "modelYear": null,
      "generation": "",
      "body": "",
      "fuel": "",
      "drivetrain": "",
      "transmission": "",
      "power": {
        "kw": null,
        "hp": null
      },
      "engine": "",
      "trunkLiters": null,
      "seats": null,
      "lengthMm": null,
      "price": {
        "amount": null,
        "currency": "EUR",
        "type": "starting"
      },
      "priceSource": "",
      "officialUrl": "",
      "description": "",
      "pros": [],
      "cons": []
    }
  ]
}
`;
}


// ============================================================
// AI REQUEST
// ============================================================

async function callAI(provider, prompt) {

  const headers = {
    "Content-Type": "application/json"
  };

  let apiKey = "";

  if (provider.name.startsWith("groq")) {
    apiKey = GROQ_API_KEY;
  }

  if (provider.name === "openrouter") {
    apiKey = OPENROUTER_API_KEY;

    headers.Authorization =
      `Bearer ${OPENROUTER_API_KEY}`;

    headers["HTTP-Referer"] =
      "https://carmatchai.vercel.app";

    headers["X-Title"] =
      "CARMATCH AI";
  }

  if (!apiKey) {
    throw new Error(
      `${provider.name} API key missing`
    );
  }

  const controller = new AbortController();

  const timeout =
    provider.name === "groq"
      ? 55000
      : provider.name === "groq-mini"
        ? 45000
        : 35000;

  const timer = setTimeout(
    () => controller.abort(),
    timeout
  );

  try {

    const response = await fetch(
      provider.url,
      {
        method: "POST",
        headers: {
          ...headers,
          Authorization:
            headers.Authorization ||
            `Bearer ${apiKey}`
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: provider.model,
          messages: [
            {
              role: "system",
              content:
                "You are a precise automotive research assistant. Return valid JSON only."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.1,
          max_tokens: 6000
        })
      }
    );

    clearTimeout(timer);

    const text = await response.text();

    if (!response.ok) {

      throw new Error(
        `${provider.name}: HTTP ${response.status} ${text.slice(0, 500)}`
      );
    }

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(
        `${provider.name}: invalid API JSON`
      );
    }

    const content =
      data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content;

    if (!content) {
      throw new Error(
        `${provider.name}: empty AI response`
      );
    }

    return content;

  } catch (error) {

    clearTimeout(timer);

    throw error;
  }
}


// ============================================================
// OPENROUTER FALLBACK
// ============================================================

async function callOpenRouter(prompt) {

  if (!OPENROUTER_API_KEY) {
    throw new Error(
      "OpenRouter API key missing"
    );
  }

  for (const model of OPENROUTER_MODELS) {

    try {

      const provider = {
        name: "openrouter",
        url: "https://openrouter.ai/api/v1/chat/completions",
        model
      };

      const result =
        await callAI(
          provider,
          prompt
        );

      return result;

    } catch {
      // Continue with next free model.
    }
  }

  throw new Error(
    "All OpenRouter providers failed"
  );
}


// ============================================================
// JSON EXTRACTION
// ============================================================

function extractJson(text) {

  if (!text) {
    throw new Error(
      "Empty AI result"
    );
  }

  let cleaned = String(text).trim();

  cleaned =
    cleaned
      .replace(/^```json/i, "")
      .replace(/^```/i, "")
      .replace(/```$/i, "")
      .trim();

  try {
    return JSON.parse(cleaned);
  } catch {}

  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");

  if (
    first !== -1 &&
    last !== -1 &&
    last > first
  ) {

    const possible =
      cleaned.slice(
        first,
        last + 1
      );

    try {
      return JSON.parse(possible);
    } catch {}
  }

  throw new Error(
    "AI returned invalid JSON"
  );
}


// ============================================================
// NORMALIZE CAR
// ============================================================

function normalizeCar(car, index) {

  const result = {
    rank:
      Number(car?.rank) ||
      index + 1,

    brand:
      clean(car?.brand),

    model:
      clean(car?.model),

    modelYear:
      Number.isFinite(Number(car?.modelYear))
        ? Number(car.modelYear)
        : null,

    generation:
      clean(car?.generation),

    body:
      clean(car?.body),

    fuel:
      clean(car?.fuel),

    drivetrain:
      clean(car?.drivetrain),

    transmission:
      clean(car?.transmission),

    power: {
      kw: null,
      hp: null
    },

    engine:
      clean(car?.engine),

    trunkLiters:
      Number.isFinite(Number(car?.trunkLiters))
        ? Number(car.trunkLiters)
        : null,

    seats:
      Number.isFinite(Number(car?.seats))
        ? Number(car.seats)
        : null,

    lengthMm:
      Number.isFinite(Number(car?.lengthMm))
        ? Number(car.lengthMm)
        : null,

    price: {
      amount: null,
      currency: "EUR",
      type: "starting"
    },

    priceSource:
      normalizeUrl(car?.priceSource),

    officialUrl:
      normalizeUrl(car?.officialUrl),

    description:
      clean(car?.description),

    pros:
      Array.isArray(car?.pros)
        ? car.pros
            .map(clean)
            .filter(Boolean)
            .slice(0, 5)
        : [],

    cons:
      Array.isArray(car?.cons)
        ? car.cons
            .map(clean)
            .filter(Boolean)
            .slice(0, 5)
        : [],

    images: [],
    imageSource: ""
  };


  // ----------------------------------------------------------
  // POWER
  // ----------------------------------------------------------

  const kw =
    Number(car?.power?.kw);

  const hp =
    Number(car?.power?.hp);

  if (Number.isFinite(kw) && kw > 0) {
    result.power.kw = Math.round(kw);
  }

  if (Number.isFinite(hp) && hp > 0) {
    result.power.hp = Math.round(hp);
  }

  if (
    result.power.kw === null &&
    result.power.hp !== null
  ) {
    result.power.kw =
      kwFromHp(result.power.hp);
  }

  if (
    result.power.hp === null &&
    result.power.kw !== null
  ) {
    result.power.hp =
      hpFromKw(result.power.kw);
  }


  // ----------------------------------------------------------
  // PRICE
  // ----------------------------------------------------------

  const amount =
    Number(car?.price?.amount);

  if (
    Number.isFinite(amount) &&
    amount > 0
  ) {
    result.price.amount =
      Math.round(amount);
  }

  const currency =
    clean(car?.price?.currency);

  if (currency) {
    result.price.currency =
      currency.toUpperCase();
  }


  // ----------------------------------------------------------
  // BASIC VALIDATION
  // ----------------------------------------------------------

  if (!result.brand) {
    result.brand = "Unknown";
  }

  if (!result.model) {
    result.model = "Unknown model";
  }

  return result;
}


// ============================================================
// SEARCH MAIN
// ============================================================

module.exports = async function handler(req, res) {

  if (req.method !== "POST") {

    return json(
      res,
      405,
      {
        ok: false,
        error: "Method not allowed"
      }
    );
  }


  const userQuery =
    getUserQuery(req);

  if (!userQuery) {

    return json(
      res,
      400,
      {
        ok: false,
        error:
          "Zadajte požiadavky na auto."
      }
    );
  }


  // ----------------------------------------------------------
  // USER ID
  // ----------------------------------------------------------

  const userId =
    clean(
      req.headers["x-user-id"] ||
      req.body?.userId ||
      req.body?.user_id
    );

  if (!userId) {

    return json(
      res,
      401,
      {
        ok: false,
        error:
          "Chýba identifikácia používateľa."
      }
    );
  }


  // ----------------------------------------------------------
  // CHARGE SEARCH
  // ----------------------------------------------------------

  const charge =
    await chargeSearch(userId);

  if (!charge.ok) {

    return json(
      res,
      500,
      {
        ok: false,
        error:
          "Nepodarilo sa overiť limit vyhľadávaní."
      }
    );
  }


  let success = false;

  try {

    const prompt =
      buildPrompt(userQuery);

    let rawResult = null;


    // --------------------------------------------------------
    // GROQ PRIMARY
    // --------------------------------------------------------

    for (const provider of PROVIDERS) {

      try {

        rawResult =
          await callAI(
            provider,
            prompt
          );

        if (rawResult) {
          break;
        }

      } catch {
        // Continue to fallback.
      }
    }


    // --------------------------------------------------------
    // OPENROUTER FALLBACK
    // --------------------------------------------------------

    if (!rawResult) {

      rawResult =
        await callOpenRouter(
          prompt
        );
    }


    // --------------------------------------------------------
    // PARSE
    // --------------------------------------------------------

    const parsed =
      extractJson(rawResult);

    let cars =
      Array.isArray(parsed?.cars)
        ? parsed.cars
        : [];


    if (!cars.length) {

      throw new Error(
        "AI nenašla žiadne vozidlá."
      );
    }


    // Exactly 3 cars.
    cars =
      cars
        .slice(0, 3)
        .map(normalizeCar);


    // --------------------------------------------------------
    // IMAGE SEARCH
    // --------------------------------------------------------

    cars =
      await Promise.all(
        cars.map(async car => {

          const images =
            await getImageCandidates(
              car.brand,
              car.model
            );

          return {
            ...car,
            images,
            imageSource:
              images.length
                ? "Wikimedia / Wikipedia"
                : ""
          };

        })
      );


    success = true;


    return json(
      res,
      200,
      {
        ok: true,
        cars,
        usage: {
          charged: true
        }
      }
    );


  } catch (error) {

    // --------------------------------------------------------
    // REFUND
    // --------------------------------------------------------

    if (!success) {
      await refundSearch(userId);
    }


    return json(
      res,
      502,
      {
        ok: false,
        refunded: true,
        error:
          "Vyhľadávanie sa nepodarilo dokončiť. Vyhľadávanie bolo vrátené."
      }
    );
  }
};