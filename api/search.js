"use strict";

/* ============================================================
   CARMATCH AI - SEARCH API v17
   ============================================================ */

const GROQ_API_KEY =
  process.env.GROQ_API_KEY || "";

const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY || "";

const SUPABASE_URL =
  process.env.SUPABASE_URL || "";

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const SUPABASE_PUBLIC_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";


const IMAGE_TIMEOUT =
  8000;

const AUTH_TIMEOUT =
  8000;

const MAX_IMAGES =
  8;

const MAX_CARS =
  3;


/* ============================================================
   AI PROVIDERS
   ============================================================ */

const PROVIDERS = [

  {
    name:
      "groq",

    url:
      "https://api.groq.com/openai/v1/chat/completions",

    model:
      "openai/gpt-oss-120b",

    timeout:
      55000
  },

  {
    name:
      "groq-mini",

    url:
      "https://api.groq.com/openai/v1/chat/completions",

    model:
      "openai/gpt-oss-20b",

    timeout:
      45000
  }

];


const OPENROUTER_MODELS = [

  "qwen/qwen3.5-397b-a17b",

  "nvidia/nemotron-3-super-120b-a12b:free",

  "openrouter/free"

];


/* ============================================================
   BASIC HELPERS
   ============================================================ */

function json(
  res,
  status,
  data
) {

  return res
    .status(status)
    .json(data);

}


function clean(
  value
) {

  if (
    value === undefined ||
    value === null
  ) {

    return "";

  }

  return String(
    value
  ).trim();

}


function isValidUrl(
  value
) {

  try {

    const url =
      new URL(
        value
      );

    return (
      url.protocol === "http:" ||
      url.protocol === "https:"
    );

  } catch (_) {

    return false;

  }

}


function normalizeUrl(
  value
) {

  let url =
    clean(value);


  if (!url) {
    return "";
  }


  if (
    !/^https?:\/\//i.test(
      url
    )
  ) {

    url =
      `https://${url}`;

  }


  return isValidUrl(
    url
  )
    ? url
    : "";

}


function hpFromKw(
  kw
) {

  const n =
    Number(
      kw
    );


  return (
    Number.isFinite(n) &&
    n > 0
  )

    ? Math.round(
        n * 1.35962
      )

    : null;
}


function kwFromHp(
  hp
) {

  const n =
    Number(
      hp
    );


  return (
    Number.isFinite(n) &&
    n > 0
  )

    ? Math.round(
        (n / 1.35962) *
        10
      ) / 10

    : null;
}


/* ============================================================
   REQUEST BODY
   ============================================================ */

function getRequestBody(
  req
) {

  const body =
    req?.body;


  if (
    body === undefined ||
    body === null
  ) {

    return {};

  }


  if (
    typeof body === "object" &&
    !Buffer.isBuffer(body)
  ) {

    return body;

  }


  const raw =
    Buffer.isBuffer(body)

      ? body.toString(
          "utf8"
        )

      : String(
          body
        );


  const trimmed =
    raw.trim();


  if (!trimmed) {
    return {};
  }


  try {

    const parsed =
      JSON.parse(
        trimmed
      );


    if (
      parsed &&
      typeof parsed === "object"
    ) {

      return parsed;

    }

  } catch (_) {}


  return {
    text:
      trimmed
  };

}


/* ============================================================
   FILTER TEXT
   ============================================================ */

function filtersToText(
  filters
) {

  if (
    !filters ||
    typeof filters !== "object"
  ) {

    return "";

  }


  const parts =
    [];


  function add(
    label,
    value,
    suffix = ""
  ) {

    if (
      value !== undefined &&
      value !== null &&
      String(
        value
      ).trim() !== ""
    ) {

      parts.push(
        `${label}: ${String(
          value
        ).trim()}${suffix}`
      );

    }

  }


  add(
    "maximálny rozpočet",
    filters.budget,
    " €"
  );


  add(
    "počet sedadiel",
    filters.seats
  );


  add(
    "minimálny výkon",
    filters.power,
    " kW"
  );


  add(
    "minimálny kufor",
    filters.trunk,
    " l"
  );


  add(
    "pohon",
    filters.drive
  );


  add(
    "palivo",
    filters.fuel
  );


  add(
    "karoséria",
    filters.body
  );


  add(
    "štýl",
    filters.style
  );


  add(
    "maximálna dĺžka",
    filters.length,
    " m"
  );


  add(
    "minimálny modelový rok",
    filters.year
  );


  add(
    "vynechať značky",
    filters.avoid
  );


  return parts.join(
    "; "
  );

}


/* ============================================================
   USER QUERY
   ============================================================ */

function getUserQuery(
  req
) {

  const body =
    getRequestBody(
      req
    );


  const query =
    req?.query || {};


  const candidates = [

    body.naturalLanguage,

    body.natural_language,

    body.query,

    body.search,

    body.prompt,

    body.text,

    body.userQuery,

    body.user_query,

    body.input,

    body.message,

    body.requirements,

    body.carQuery,

    body.car_query,

    body.request,

    query.naturalLanguage,

    query.query,

    query.search,

    query.prompt,

    query.text,

    query.userQuery,

    query.user_query,

    query.input,

    query.message

  ];


  let naturalLanguage =
    "";


  for (
    const value
    of candidates
  ) {

    const cleaned =
      clean(
        value
      );


    if (
      cleaned
    ) {

      naturalLanguage =
        cleaned;

      break;

    }

  }


  const filterText =
    filtersToText(
      body.filters
    );


  if (
    naturalLanguage &&
    filterText
  ) {

    return `${naturalLanguage}

Doplňujúce filtre: ${filterText}`;

  }


  if (
    naturalLanguage
  ) {

    return naturalLanguage;

  }


  if (
    filterText
  ) {

    return `Používateľ nezadal voľný text. Vyber auto podľa týchto filtrov: ${filterText}`;

  }


  if (
    typeof req?.body === "string"
  ) {

    const plain =
      req.body.trim();


    if (
      plain &&
      !plain.startsWith("{") &&
      !plain.startsWith("[")
    ) {

      return plain;

    }

  }


  return "";

}


/* ============================================================
   BEARER TOKEN
   ============================================================ */

function getBearerToken(
  req
) {

  const value =
    req?.headers?.authorization ||
    req?.headers?.Authorization ||
    "";


  const match =
    String(
      value
    ).match(
      /^Bearer\s+(.+)$/i
    );


  return match
    ? match[1].trim()
    : "";

}


/* ============================================================
   AUTHENTICATED USER
   ============================================================ */

async function getAuthenticatedUserId(
  req
) {

  const token =
    getBearerToken(
      req
    );


  if (!token) {
    return "";
  }


  if (
    !SUPABASE_URL ||
    !SUPABASE_PUBLIC_KEY
  ) {

    throw new Error(
      "Supabase auth configuration missing"
    );

  }


  const controller =
    new AbortController();


  const timer =
    setTimeout(
      () =>
        controller.abort(),
      AUTH_TIMEOUT
    );


  try {

    const response =
      await fetch(
        `${SUPABASE_URL}/auth/v1/user`,
        {
          method:
            "GET",

          headers: {

            "apikey":
              SUPABASE_PUBLIC_KEY,

            "Authorization":
              `Bearer ${token}`,

            "Accept":
              "application/json"

          },

          signal:
            controller.signal

        }
      );


    if (
      !response.ok
    ) {

      return "";

    }


    const data =
      await response.json();


    return clean(
      data?.id
    );

  } catch (_) {

    return "";

  } finally {

    clearTimeout(
      timer
    );

  }

}


/* ============================================================
   SUPABASE RPC
   ============================================================ */

async function supabaseRpc(
  functionName,
  payload
) {

  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY
  ) {

    return {
      ok:
        false,

      error:
        "Supabase configuration missing"
    };

  }


  try {

    const response =
      await fetch(
        `${SUPABASE_URL}/rest/v1/rpc/${functionName}`,
        {

          method:
            "POST",

          headers: {

            "Content-Type":
              "application/json",

            "Accept":
              "application/json",

            "apikey":
              SUPABASE_SERVICE_ROLE_KEY,

            "Authorization":
              `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`

          },

          body:
            JSON.stringify(
              payload || {}
            )

        }
      );


    const raw =
      await response.text();


    let data =
      null;


    try {

      data =
        raw
          ? JSON.parse(
              raw
            )
          : null;

    } catch (_) {

      data =
        raw;

    }


    if (
      !response.ok
    ) {

      return {

        ok:
          false,

        status:
          response.status,

        error:
          data

      };

    }


    return {

      ok:
        true,

      status:
        response.status,

      data

    };

  } catch (error) {

    return {

      ok:
        false,

      error:
        error?.message ||
        "Supabase request failed"

    };

  }

}


/* ============================================================
   CHARGE RESULT
   ============================================================ */

function chargeAllowed(
  data
) {

  if (
    data === false
  ) {

    return false;

  }


  if (
    typeof data === "number" &&
    data < 0
  ) {

    return false;

  }


  if (
    data &&
    typeof data === "object"
  ) {

    if (
      data.allowed === false ||
      data.success === false ||
      data.ok === false ||
      data.can_search === false
    ) {

      return false;

    }

  }


  return true;

}


function extractRemaining(
  data
) {

  if (
    typeof data === "number" &&
    data >= 0
  ) {

    return Math.round(
      data
    );

  }


  if (
    !data ||
    typeof data !== "object"
  ) {

    return null;

  }


  for (
    const key
    of [
      "remaining",
      "searches_remaining",
      "remaining_searches",
      "remainingSearches",
      "left"
    ]
  ) {

    const n =
      Number(
        data[key]
      );


    if (
      Number.isFinite(n) &&
      n >= 0
    ) {

      return Math.round(
        n
      );

    }

  }


  return null;

}


/* ============================================================
   SEARCH CHARGE
   ============================================================ */

async function chargeSearch(
  userId
) {

  const functions = [

    "use_search",

    "consume_search",

    "increment_search"

  ];


  for (
    const functionName
    of functions
  ) {

    const result =
      await supabaseRpc(
        functionName,
        {
          p_user_id:
            userId
        }
      );


    if (
      !result.ok
    ) {

      continue;

    }


    const allowed =
      chargeAllowed(
        result.data
      );


    return {

      ok:
        allowed,

      limited:
        !allowed,

      functionName,

      data:
        result.data,

      remaining:
        extractRemaining(
          result.data
        )

    };

  }


  return {

    ok:
      false,

    error:
      "Search usage function unavailable"

  };

}


/* ============================================================
   SEARCH REFUND
   ============================================================ */

async function refundSearch(
  userId
) {

  const functions = [

    "refund_search",

    "refund_search_usage",

    "decrement_search"

  ];


  for (
    const functionName
    of functions
  ) {

    const result =
      await supabaseRpc(
        functionName,
        {
          p_user_id:
            userId
        }
      );


    if (
      result.ok
    ) {

      return {

        ok:
          true,

        functionName

      };

    }

  }


  return {
    ok:
      false
  };

}


/* ============================================================
   IMAGE FILTER
   ============================================================ */

function rejectedImageUrl(
  url
) {

  const value =
    String(
      url || ""
    ).toLowerCase();


  const blocked = [

    "logo",

    "interior",

    "dashboard",

    "concept",

    "render",

    "truck",

    "bus",

    "motorcycle",

    "motorbike",

    "wallpaper",

    "sketch",

    "blueprint"

  ];


  return blocked.some(
    term =>
      value.includes(
        term
      )
  );

}


/* ============================================================
   TIMED FETCH
   ============================================================ */

async function timedFetch(
  url,
  options = {},
  timeout = IMAGE_TIMEOUT
) {

  const controller =
    new AbortController();


  const timer =
    setTimeout(
      () =>
        controller.abort(),
      timeout
    );


  try {

    return await fetch(
      url,
      {
        ...options,
        signal:
          controller.signal
      }
    );

  } finally {

    clearTimeout(
      timer
    );

  }

}


/* ============================================================
   WIKIPEDIA
   ============================================================ */

async function wikipediaImage(
  brand,
  model,
  generation,
  modelYear
) {

  const title =
    encodeURIComponent(
      `${brand} ${model}`
    );


  const url =
    `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`;


  try {

    const response =
      await timedFetch(
        url,
        {
          headers: {

            "User-Agent":
              "CARMATCH-AI/1.0"

          }
        }
      );


    if (
      !response.ok
    ) {

      return [];

    }


    const data =
      await response.json();


    const images =
      [];


    for (
      const value
      of [
        data?.originalimage?.source,
        data?.thumbnail?.source
      ]
    ) {

      if (
        value &&
        !rejectedImageUrl(
          value
        ) &&
        !images.includes(
          value
        )
      ) {

        images.push(
          value
        );

      }

    }


    return images;

  } catch (_) {

    return [];

  }

}


/* ============================================================
   WIKIMEDIA
   ============================================================ */

async function wikimediaImages(
  brand,
  model,
  generation,
  modelYear
) {

  const search =
    encodeURIComponent(
      `${brand} ${model} ${generation || ""} ${modelYear || ""}`.trim()
    );


  const url =
    `https://commons.wikimedia.org/w/api.php?action=query` +
    `&generator=search` +
    `&gsrsearch=${search}` +
    `&gsrnamespace=6` +
    `&gsrlimit=12` +
    `&prop=imageinfo` +
    `&iiprop=url` +
    `&iiurlwidth=1200` +
    `&format=json` +
    `&origin=*`;


  try {

    const response =
      await timedFetch(
        url,
        {
          headers: {

            "User-Agent":
              "CARMATCH-AI/1.0"

          }
        }
      );


    if (
      !response.ok
    ) {

      return [];

    }


    const data =
      await response.json();


    const pages =
      data?.query?.pages
        ? Object.values(
            data.query.pages
          )
        : [];


    const images =
      [];


    for (
      const page
      of pages
    ) {

      const info =
        page?.imageinfo?.[0];


      const imageUrl =
        info?.thumburl ||
        info?.url ||
        "";


      if (!imageUrl) {
        continue;
      }


      if (
        rejectedImageUrl(
          imageUrl
        )
      ) {

        continue;

      }


      if (
        !images.includes(
          imageUrl
        )
      ) {

        images.push(
          imageUrl
        );

      }


      if (
        images.length >=
        MAX_IMAGES
      ) {

        break;

      }

    }


    return images;

  } catch (_) {

    return [];

  }

}


/* ============================================================
   COMBINED IMAGE SEARCH
   ============================================================ */

async function getImageCandidates(
  brand,
  model,
  generation,
  modelYear
) {

  const [
    wiki,
    commons
  ] =
    await Promise.all([

      wikipediaImage(
        brand,
        model,
        generation,
        modelYear
      ),

      wikimediaImages(
        brand,
        model,
        generation,
        modelYear
      )

    ]);


  const unique =
    [];


  for (
    const image
    of [
      ...wiki,
      ...commons
    ]
  ) {

    if (
      !isValidUrl(
        image
      ) ||
      rejectedImageUrl(
        image
      ) ||
      unique.includes(
        image
      )
    ) {

      continue;

    }


    unique.push(
      image
    );


    if (
      unique.length >=
      MAX_IMAGES
    ) {

      break;

    }

  }


  return unique;

}


/* ============================================================
   AI PROMPT
   ============================================================ */

function buildPrompt(
  userQuery
) {

  return `
You are CARMATCH AI, an automotive research assistant for a Slovak user.

USER REQUEST:
${userQuery}

TASK:
Return EXACTLY 3 real, currently produced passenger cars that best match the request.

Prefer the newest available generation/model year and current European or Slovak-market information when it can be verified.

STRICT RULES:
- Never invent a car, specification, price, URL or source.
- Do not return concept cars unless explicitly requested.
- Use current production models whenever possible.
- Give a numeric current starting price in EUR when verifiable; otherwise use null.
- priceSource should be an official manufacturer/local-market price page when verifiable.
- officialUrl should be an official manufacturer website/configurator when verifiable.
- Power must contain both numeric kW and numeric HP.
- Use only kW and HP in the text.
- Never use ks, k, koní or PS.
- trunkLiters is the normal boot/cargo capacity, not maximum with seats folded.
- Distinguish petrol, diesel, HEV, PHEV and EV correctly.
- Keep modelYear separate from generation.
- reason must explain why the car matches the user's request.
- maintenance must be a concise practical maintenance note.
- Do not invent service intervals.
- consumptionWltp should only be included when reasonably certain it is a WLTP figure.
- Return ONLY valid JSON.
- No Markdown.
- No text outside the JSON.

JSON STRUCTURE:

{
  "cars": [
    {
      "rank": 1,
      "brand": "",
      "model": "",
      "modelYear": null,
      "generation": "",
      "category": "",
      "body": "",
      "trim": "",
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
      "consumptionWltp": "",
      "price": {
        "amount": null,
        "currency": "EUR",
        "type": "starting"
      },
      "priceSource": "",
      "officialUrl": "",
      "reason": "",
      "description": "",
      "maintenance": "",
      "pros": [],
      "cons": [],
      "score": 0
    }
  ]
}
`;

}


/* ============================================================
   AI REQUEST
   ============================================================ */

async function callAI(
  provider,
  prompt
) {

  let apiKey =
    "";


  const headers = {

    "Content-Type":
      "application/json"

  };


  if (
    provider.name.startsWith(
      "groq"
    )
  ) {

    apiKey =
      GROQ_API_KEY;

  }


  if (
    provider.name ===
    "openrouter"
  ) {

    apiKey =
      OPENROUTER_API_KEY;


    headers[
      "HTTP-Referer"
    ] =
      "https://carmatchai.vercel.app";


    headers[
      "X-Title"
    ] =
      "CARMATCH AI";

  }


  if (!apiKey) {

    throw new Error(
      `${provider.name} API key missing`
    );

  }


  const controller =
    new AbortController();


  const timer =
    setTimeout(
      () =>
        controller.abort(),
      provider.timeout ||
      35000
    );


  try {

    const response =
      await fetch(
        provider.url,
        {

          method:
            "POST",

          headers: {

            ...headers,

            "Authorization":
              `Bearer ${apiKey}`

          },

          signal:
            controller.signal,

          body:
            JSON.stringify(
              {
                model:
                  provider.model,

                messages: [

                  {
                    role:
                      "system",

                    content:
                      "You are a precise automotive research assistant. Return valid JSON only."

                  },

                  {
                    role:
                      "user",

                    content:
                      prompt

                  }

                ],

                temperature:
                  0.1,

                max_tokens:
                  7000

              }
            )

        }
      );


    const raw =
      await response.text();


    if (
      !response.ok
    ) {

      throw new Error(
        `${provider.name}: HTTP ${response.status} ${raw.slice(0, 500)}`
      );

    }


    let data;


    try {

      data =
        JSON.parse(
          raw
        );

    } catch (_) {

      throw new Error(
        `${provider.name}: invalid API JSON`
      );

    }


    const content =
      data
        ?.choices
        ?.[0]
        ?.message
        ?.content;


    if (
      !content
    ) {

      throw new Error(
        `${provider.name}: empty AI response`
      );

    }


    return content;

  } finally {

    clearTimeout(
      timer
    );

  }

}


/* ============================================================
   JSON EXTRACTION
   ============================================================ */

function extractJson(
  value
) {

  if (!value) {

    throw new Error(
      "Empty AI result"
    );

  }


  let cleaned =
    String(
      value
    ).trim();


  cleaned =
    cleaned
      .replace(
        /^```json\s*/i,
        ""
      )
      .replace(
        /^```\s*/i,
        ""
      )
      .replace(
        /\s*```$/i,
        ""
      )
      .trim();


  try {

    return JSON.parse(
      cleaned
    );

  } catch (_) {}


  const first =
    cleaned.indexOf(
      "{"
    );


  const last =
    cleaned.lastIndexOf(
      "}"
    );


  if (
    first >= 0 &&
    last > first
  ) {

    try {

      return JSON.parse(
        cleaned.slice(
          first,
          last + 1
        )
      );

    } catch (_) {}

  }


  throw new Error(
    "AI returned invalid JSON"
  );

}


/* ============================================================
   NORMALIZE CAR
   ============================================================ */

function normalizeCar(
  car,
  index
) {

  const result = {

    rank:
      Number(
        car?.rank
      ) ||
      index + 1,


    brand:
      clean(
        car?.brand
      ) ||
      "Unknown",


    model:
      clean(
        car?.model
      ) ||
      "Unknown model",


    modelYear:
      Number.isFinite(
        Number(
          car?.modelYear
        )
      )
        ? Number(
            car.modelYear
          )
        : null,


    generation:
      clean(
        car?.generation
      ),


    category:
      clean(
        car?.category
      ),


    body:
      clean(
        car?.body
      ),


    trim:
      clean(
        car?.trim
      ),


    fuel:
      clean(
        car?.fuel
      ),


    drivetrain:
      clean(
        car?.drivetrain
      ),


    drive:
      clean(
        car?.drivetrain ||
        car?.drive
      ),


    transmission:
      clean(
        car?.transmission
      ),


    power: {

      kw:
        null,

      hp:
        null

    },


    engine:
      clean(
        car?.engine
      ),


    trunkLiters:
      Number.isFinite(
        Number(
          car?.trunkLiters
        )
      )
        ? Number(
            car.trunkLiters
          )
        : null,


    trunk:
      Number.isFinite(
        Number(
          car?.trunkLiters
        )
      )
        ? Number(
            car.trunkLiters
          )
        : null,


    seats:
      Number.isFinite(
        Number(
          car?.seats
        )
      )
        ? Number(
            car.seats
          )
        : null,


    lengthMm:
      Number.isFinite(
        Number(
          car?.lengthMm
        )
      )
        ? Number(
            car.lengthMm
          )
        : null,


    consumptionWltp:
      clean(
        car?.consumptionWltp
      ),


    price: {

      amount:
        null,

      currency:
        "EUR",

      type:
        "starting"

    },


    priceSource:
      normalizeUrl(
        car?.priceSource
      ),


    officialUrl:
      normalizeUrl(
        car?.officialUrl
      ),


    configurator:
      normalizeUrl(
        car?.officialUrl
      ),


    reason:
      clean(
        car?.reason
      ),


    description:
      clean(
        car?.description
      ),


    maintenance:
      clean(
        car?.maintenance
      ),


    pros:
      Array.isArray(
        car?.pros
      )
        ? car.pros
            .map(
              clean
            )
            .filter(
              Boolean
            )
            .slice(
              0,
              5
            )
        : [],


    cons:
      Array.isArray(
        car?.cons
      )
        ? car.cons
            .map(
              clean
            )
            .filter(
              Boolean
            )
            .slice(
              0,
              5
            )
        : [],


    score:
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
      ),


    images:
      [],


    imageCandidates:
      [],


    image:
      "",


    imageSource:
      "",


    photoSource:
      "",


    year:
      Number.isFinite(
        Number(
          car?.modelYear
        )
      )
        ? Number(
            car.modelYear
          )
        : null,


    dataSources:
      []

  };


  /* POWER */

  const kw =
    Number(
      car?.power?.kw
    );


  const hp =
    Number(
      car?.power?.hp
    );


  if (
    Number.isFinite(
      kw
    ) &&
    kw > 0
  ) {

    result.power.kw =
      Math.round(
        kw
      );

  }


  if (
    Number.isFinite(
      hp
    ) &&
    hp > 0
  ) {

    result.power.hp =
      Math.round(
        hp
      );

  }


  if (
    result.power.kw === null &&
    result.power.hp !== null
  ) {

    result.power.kw =
      kwFromHp(
        result.power.hp
      );

  }


  if (
    result.power.hp === null &&
    result.power.kw !== null
  ) {

    result.power.hp =
      hpFromKw(
        result.power.kw
      );

  }


  /* PRICE */

  const amount =
    Number(
      car?.price?.amount
    );


  if (
    Number.isFinite(
      amount
    ) &&
    amount > 0
  ) {

    result.price.amount =
      Math.round(
        amount
      );

  }


  const currency =
    clean(
      car?.price?.currency
    );


  if (
    currency
  ) {

    result.price.currency =
      currency.toUpperCase();

  }


  const type =
    clean(
      car?.price?.type
    );


  if (
    type
  ) {

    result.price.type =
      type;

  }


  return result;

}


/* ============================================================
   VALIDATE CARS
   ============================================================ */

function validateCars(
  parsed
) {

  if (
    !Array.isArray(
      parsed?.cars
    ) ||
    parsed.cars.length <
      MAX_CARS
  ) {

    throw new Error(
      "AI nevrátila aspoň 3 vozidlá."
    );

  }


  const cars =
    parsed.cars
      .slice(
        0,
        MAX_CARS
      )
      .map(
        normalizeCar
      );


  if (
    cars.length !==
    MAX_CARS
  ) {

    throw new Error(
      "AI nevrátila presne 3 vozidlá."
    );

  }


  return cars;

}


/* ============================================================
   OPENROUTER
   ============================================================ */

async function callOpenRouter(
  prompt
) {

  for (
    const model
    of OPENROUTER_MODELS
  ) {

    try {

      return await callAI(
        {

          name:
            "openrouter",

          url:
            "https://openrouter.ai/api/v1/chat/completions",

          model,

          timeout:
            35000

        },

        prompt
      );

    } catch (error) {

      console.error(
        `CARMATCH AI: OpenRouter ${model} failed`,
        error?.message ||
        error
      );

    }

  }


  throw new Error(
    "All OpenRouter providers failed"
  );

}


/* ============================================================
   PROVIDER FALLBACK
   ============================================================ */

async function getCarsFromProviders(
  prompt
) {

  const errors =
    [];


  for (
    const provider
    of PROVIDERS
  ) {

    try {

      const raw =
        await callAI(
          provider,
          prompt
        );


      return validateCars(
        extractJson(
          raw
        )
      );

    } catch (error) {

      errors.push(
        `${provider.name}: ${error?.message || error}`
      );


      console.error(
        "CARMATCH AI provider failed",
        errors.at(
          -1
        )
      );

    }

  }


  try {

    const raw =
      await callOpenRouter(
        prompt
      );


    return validateCars(
      extractJson(
        raw
      )
    );

  } catch (error) {

    errors.push(
      `openrouter: ${error?.message || error}`
    );

  }


  throw new Error(
    errors
      .join(
        " | "
      )
      .slice(
        0,
        3000
      ) ||
      "AI providers failed"
  );

}


/* ============================================================
   MAIN VERCEL FUNCTION
   ============================================================ */

export default async function handler(
  req,
  res
) {

  /* METHOD */

  if (
    req.method !==
    "POST"
  ) {

    return json(
      res,
      405,
      {
        ok:
          false,

        error:
          "Method not allowed"
      }
    );

  }


  /* QUERY */

  const userQuery =
    getUserQuery(
      req
    );


  if (!userQuery) {

    console.error(
      "CARMATCH AI: request without naturalLanguage",
      getRequestBody(
        req
      )
    );


    return json(
      res,
      400,
      {

        ok:
          false,

        error:
          "Zadajte požiadavky na auto."

      }
    );

  }


  /* AUTH */

  let userId;


  try {

    userId =
      await getAuthenticatedUserId(
        req
      );

  } catch (error) {

    console.error(
      "CARMATCH AI auth configuration error",
      error?.message ||
      error
    );


    return json(
      res,
      500,
      {

        ok:
          false,

        error:
          "Supabase autentifikácia nie je správne nastavená na serveri."

      }
    );

  }


  if (!userId) {

    return json(
      res,
      401,
      {

        ok:
          false,

        error:
          "Supabase relácia je neplatná alebo chýba. Obnov stránku a skús znova."

      }
    );

  }


  /* CHARGE */

  const charge =
    await chargeSearch(
      userId
    );


  if (
    !charge.ok
  ) {

    if (
      charge.limited
    ) {

      return json(
        res,
        429,
        {

          ok:
            false,

          error:
            "Denný limit 5 vyhľadávaní bol dosiahnutý.",

          remaining:
            0

        }
      );

    }


    console.error(
      "CARMATCH AI: chargeSearch failed",
      charge.error
    );


    return json(
      res,
      500,
      {

        ok:
          false,

        error:
          "Nepodarilo sa overiť limit vyhľadávaní."

      }
    );

  }


  /* AI + IMAGES */

  try {

    const prompt =
      buildPrompt(
        userQuery
      );


    let cars =
      await getCarsFromProviders(
        prompt
      );


    cars =
      await Promise.all(

        cars.map(
          async car => {

            const images =
              await getImageCandidates(
                car.brand,
                car.model,
                car.generation,
                car.modelYear
              );


            const imageCandidates =
              images.map(
                url => ({

                  url,

                  source:
                    "https://commons.wikimedia.org/"

                })
              );


            return {

              ...car,

              images,

              imageCandidates,

              image:
                images[0] ||
                "",

              imageSource:
                images.length
                  ? "Wikimedia / Wikipedia"
                  : "",

              photoSource:
                images.length
                  ? "https://commons.wikimedia.org/"
                  : "",

              dataSources:
                [
                  car.priceSource,
                  car.officialUrl
                ]
                  .filter(
                    Boolean
                  )
                  .filter(
                    (v, i, a) =>
                      a.indexOf(v) === i
                  )

            };

          }
        )

      );


    return json(
      res,
      200,
      {

        ok:
          true,

        cars,

        remaining:
          charge.remaining,

        usage: {

          charged:
            true,

          remaining:
            charge.remaining

        }

      }
    );


  } catch (error) {

    console.error(
      "CARMATCH AI SEARCH ERROR:",
      error?.message ||
      error
    );


    const refund =
      await refundSearch(
        userId
      );


    if (
      !refund.ok
    ) {

      console.error(
        "CARMATCH AI: refund failed"
      );

    }


    return json(
      res,
      502,
      {

        ok:
          false,

        refunded:
          refund.ok,

        error:
          refund.ok

            ? "Vyhľadávanie sa nepodarilo dokončiť. Spotreba vyhľadávania bola vrátená."

            : "Vyhľadávanie sa nepodarilo dokončiť a automatické vrátenie spotreby zlyhalo."

      }
    );

  }

}