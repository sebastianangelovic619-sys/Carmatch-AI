"use strict";

/* ============================================================
   CARMATCH AI - SEARCH API v18 FINAL
   ============================================================
   - Vercel ES Module compatible
   - Compatible with current frontend app.js
   - Reads naturalLanguage + filters
   - Reads Authorization: Bearer <Supabase access token>
   - Verifies token through Supabase Auth
   - Uses verified Supabase user.id
   - 5 searches/day via existing RPC functions
   - Automatic refund if complete AI search fails
   - Groq primary + Groq mini
   - OpenRouter FREE fallbacks
   - Exactly 3 cars
   - Current price / official URL
   - kW + HP
   - Wikimedia + Wikipedia images
   ============================================================ */

const GROQ_API_KEY =
  process.env.GROQ_API_KEY || "";

const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY || "";

const SUPABASE_URL =
  String(process.env.SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "");

/*
 * New Supabase server key first.
 * Legacy service_role key remains supported.
 */
const SUPABASE_SERVER_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "";

/*
 * New publishable key first.
 * Legacy anon key remains supported.
 */
const SUPABASE_PUBLIC_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

const AUTH_TIMEOUT = 8000;
const IMAGE_TIMEOUT = 8000;

const MAX_IMAGES = 8;
const MAX_CARS = 3;

const PROVIDERS = [
  {
    name: "groq",
    url:
      "https://api.groq.com/openai/v1/chat/completions",
    model:
      "openai/gpt-oss-120b",
    timeout: 55000
  },
  {
    name: "groq-mini",
    url:
      "https://api.groq.com/openai/v1/chat/completions",
    model:
      "openai/gpt-oss-20b",
    timeout: 45000
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

function json(res, status, data) {
  return res.status(status).json(data);
}

function clean(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return "";
  }

  return String(value).trim();
}

function isValidUrl(value) {
  try {
    const url = new URL(value);

    return (
      url.protocol === "http:" ||
      url.protocol === "https:"
    );
  } catch (_) {
    return false;
  }
}

function normalizeUrl(value) {
  let url = clean(value);

  if (!url) {
    return "";
  }

  if (
    !/^https?:\/\//i.test(url)
  ) {
    url = `https://${url}`;
  }

  return isValidUrl(url)
    ? url
    : "";
}

function hpFromKw(kw) {
  const value =
    Number(kw);

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return null;
  }

  return Math.round(
    value * 1.35962
  );
}

function kwFromHp(hp) {
  const value =
    Number(hp);

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return null;
  }

  return Math.round(
    (value / 1.35962) * 10
  ) / 10;
}

/* ============================================================
   REQUEST BODY
   ============================================================ */

function getRequestBody(req) {
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
      ? body.toString("utf8")
      : String(body);

  const trimmed =
    raw.trim();

  if (!trimmed) {
    return {};
  }

  try {
    const parsed =
      JSON.parse(trimmed);

    if (
      parsed &&
      typeof parsed === "object"
    ) {
      return parsed;
    }
  } catch (_) {}

  return {
    text: trimmed
  };
}

/* ============================================================
   FILTERS
   ============================================================ */

function filtersToText(filters) {
  if (
    !filters ||
    typeof filters !== "object"
  ) {
    return "";
  }

  const parts = [];

  function add(
    label,
    value,
    suffix = ""
  ) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      parts.push(
        `${label}: ${String(value).trim()}${suffix}`
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

function getUserQuery(req) {
  const body =
    getRequestBody(req);

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
    query.natural_language,
    query.query,
    query.search,
    query.prompt,
    query.text,
    query.userQuery,
    query.user_query,
    query.input,
    query.message
  ];

  let naturalLanguage = "";

  for (
    const value of candidates
  ) {
    const cleaned =
      clean(value);

    if (cleaned) {
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

  if (filterText) {
    return `Používateľ nezadal voľný text. Vyber auto podľa týchto filtrov: ${filterText}`;
  }

  if (
    typeof req?.body ===
    "string"
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
   SUPABASE AUTH
   ============================================================ */

function getBearerToken(req) {
  const raw =
    req?.headers?.authorization ||
    req?.headers?.Authorization ||
    "";

  const match =
    String(raw).match(
      /^Bearer\s+(.+)$/i
    );

  return match
    ? match[1].trim()
    : "";
}

function isSupabaseUrl(url) {
  try {
    const parsed =
      new URL(url);

    if (
      parsed.protocol !==
      "https:"
    ) {
      return false;
    }

    return parsed.hostname.endsWith(
      ".supabase.co"
    );
  } catch (_) {
    return false;
  }
}

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

async function verifySupabaseAccessToken(
  req
) {
  const token =
    getBearerToken(req);

  if (!token) {
    return {
      ok: false,
      status: 401,
      code: "missing_token",
      error:
        "Chýba Supabase access token."
    };
  }

  if (
    !SUPABASE_URL ||
    !isSupabaseUrl(
      SUPABASE_URL
    )
  ) {
    return {
      ok: false,
      status: 500,
      code: "bad_supabase_url",
      error:
        "SUPABASE_URL nie je správne nastavená."
    };
  }

  if (
    !SUPABASE_PUBLIC_KEY
  ) {
    return {
      ok: false,
      status: 500,
      code: "missing_supabase_key",
      error:
        "Na serveri chýba Supabase publishable/anon key."
    };
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
    /*
     * Supabase recommended verification:
     * apikey = publishable/anon key
     * Authorization = user's JWT
     */
    const response =
      await fetch(
        `${SUPABASE_URL}/auth/v1/user`,
        {
          method: "GET",

          headers: {
            apikey:
              SUPABASE_PUBLIC_KEY,

            Authorization:
              `Bearer ${token}`,

            Accept:
              "application/json"
          },

          cache:
            "no-store",

          signal:
            controller.signal
        }
      );

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

    if (
      response.status === 401 ||
      response.status === 403
    ) {
      return {
        ok: false,
        status: 401,
        code: "invalid_token",
        error:
          "Supabase access token je neplatný alebo expirovaný."
      };
    }

    if (
      !response.ok
    ) {
      console.error(
        "CARMATCH AI: Supabase Auth verification failed",
        {
          status:
            response.status,

          response:
            data ||
            raw?.slice(
              0,
              500
            )
        }
      );

      return {
        ok: false,
        status: 500,
        code:
          "auth_server_error",
        error:
          "Supabase Auth server odmietol overenie. Skontroluj, že SUPABASE_URL a Supabase kľúč patria k rovnakému projektu."
      };
    }

    const userId =
      clean(
        data?.id ||
        data?.user?.id
      );

    if (
      !looksLikeUuid(
        userId
      )
    ) {
      console.error(
        "CARMATCH AI: Supabase Auth returned no valid user id",
        data
      );

      return {
        ok: false,
        status: 500,
        code:
          "missing_user_id",
        error:
          "Supabase Auth nevrátil platné ID používateľa."
      };
    }

    return {
      ok: true,
      userId,
      user: data
    };
  } catch (error) {
    console.error(
      "CARMATCH AI: Supabase Auth request failed",
      error?.message ||
        error
    );

    return {
      ok: false,
      status: 500,
      code:
        error?.name ===
        "AbortError"
          ? "auth_timeout"
          : "auth_network_error",

      error:
        error?.name ===
        "AbortError"
          ? "Supabase Auth server neodpovedal včas."
          : "Nepodarilo sa spojiť so Supabase Auth serverom."
    };
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
    !SUPABASE_SERVER_KEY
  ) {
    return {
      ok: false,
      status: 500,
      error:
        "Supabase server configuration missing"
    };
  }

  try {
    const response =
      await fetch(
        `${SUPABASE_URL}/rest/v1/rpc/${functionName}`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Accept:
              "application/json",

            /*
             * IMPORTANT:
             * New sb_secret_* keys are NOT JWTs.
             * They belong in apikey only.
             */
            apikey:
              SUPABASE_SERVER_KEY
          },

          body:
            JSON.stringify(
              payload || {}
            ),

          cache:
            "no-store"
        }
      );

    const raw =
      await response.text();

    let data = null;

    try {
      data =
        raw
          ? JSON.parse(raw)
          : null;
    } catch (_) {
      data = raw;
    }

    if (
      !response.ok
    ) {
      return {
        ok: false,
        status:
          response.status,
        error: data
      };
    }

    return {
      ok: true,
      status:
        response.status,
      data
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error:
        error?.message ||
        "Supabase request failed"
    };
  }
}

/* ============================================================
   RPC RESULT HELPERS
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
    typeof data ===
      "number" &&
    data < 0
  ) {
    return false;
  }

  if (
    data &&
    typeof data ===
      "object"
  ) {
    if (
      data.allowed ===
        false ||
      data.success ===
        false ||
      data.ok ===
        false ||
      data.can_search ===
        false ||
      data.canSearch ===
        false
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
    typeof data ===
      "number" &&
    data >= 0
  ) {
    return Math.round(
      data
    );
  }

  if (
    !data ||
    typeof data !==
      "object"
  ) {
    return null;
  }

  const keys = [
    "remaining",
    "searches_remaining",
    "remaining_searches",
    "remainingSearches",
    "left"
  ];

  for (
    const key of keys
  ) {
    const number =
      Number(
        data[key]
      );

    if (
      Number.isFinite(
        number
      ) &&
      number >= 0
    ) {
      return Math.round(
        number
      );
    }
  }

  return null;
}

async function tryRpcFunctionNames(
  functionNames,
  userId
) {
  /*
   * Supports the common parameter names
   * used by the existing saved RPCs.
   */
  const payloads = [
    {
      p_user_id:
        userId
    },
    {
      user_id:
        userId
    }
  ];

  for (
    const functionName
    of functionNames
  ) {
    for (
      const payload
      of payloads
    ) {
      const result =
        await supabaseRpc(
          functionName,
          payload
        );

      if (
        result.ok
      ) {
        return {
          ...result,
          functionName,
          payload
        };
      }
    }
  }

  return {
    ok: false
  };
}

/* ============================================================
   CHARGE SEARCH
   ============================================================ */

async function chargeSearch(
  userId
) {
  const result =
    await tryRpcFunctionNames(
      [
        "use_search",
        "consume_search",
        "increment_search"
      ],
      userId
    );

  if (
    !result.ok
  ) {
    return {
      ok: false,
      error:
        "Search usage function unavailable"
    };
  }

  const allowed =
    chargeAllowed(
      result.data
    );

  return {
    ok: allowed,

    limited:
      !allowed,

    functionName:
      result.functionName,

    data:
      result.data,

    remaining:
      extractRemaining(
        result.data
      )
  };
}

/* ============================================================
   REFUND SEARCH
   ============================================================ */

async function refundSearch(
  userId
) {
  const result =
    await tryRpcFunctionNames(
      [
        "refund_search",
        "refund_search_usage",
        "decrement_search"
      ],
      userId
    );

  if (
    result.ok
  ) {
    return {
      ok: true,
      functionName:
        result.functionName
    };
  }

  return {
    ok: false
  };
}

/* ============================================================
   IMAGE FILTERING
   ============================================================ */

function rejectedImageUrl(
  url
) {
  const value =
    String(url || "")
      .toLowerCase();

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
    "blueprint",
    "icon",
    "badge",
    "emblem"
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
  timeout =
    IMAGE_TIMEOUT
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
   WIKIPEDIA IMAGE
   ============================================================ */

async function wikipediaImage(
  brand,
  model
) {
  const title =
    encodeURIComponent(
      `${brand} ${model}`.trim()
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

    const images = [];

    const candidates = [
      data?.originalimage?.source,
      data?.thumbnail?.source
    ];

    for (
      const image
      of candidates
    ) {
      if (
        image &&
        isValidUrl(
          image
        ) &&
        !rejectedImageUrl(
          image
        ) &&
        !images.includes(
          image
        )
      ) {
        images.push(
          image
        );
      }
    }

    return images;
  } catch (_) {
    return [];
  }
}

/* ============================================================
   WIKIMEDIA COMMONS
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
    `https://commons.wikimedia.org/w/api.php` +
    `?action=query` +
    `&generator=search` +
    `&gsrsearch=${search}` +
    `&gsrnamespace=6` +
    `&gsrlimit=20` +
    `&prop=imageinfo` +
    `&iiprop=url|extmetadata` +
    `&iiurlwidth=1600` +
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

    const images = [];

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

      const title =
        clean(
          page?.title
        ).toLowerCase();

      const description =
        clean(
          info?.extmetadata
            ?.ImageDescription
            ?.value ||
            info
              ?.extmetadata
              ?.ObjectName
              ?.value ||
            ""
        ).toLowerCase();

      if (
        !imageUrl ||
        !isValidUrl(
          imageUrl
        )
      ) {
        continue;
      }

      if (
        rejectedImageUrl(
          imageUrl
        ) ||
        rejectedImageUrl(
          title
        ) ||
        rejectedImageUrl(
          description
        )
      ) {
        continue;
      }

      const haystack =
        `${title} ${description}`;

      const brandText =
        String(
          brand || ""
        ).toLowerCase();

      const brandOk =
        haystack.includes(
          brandText
        );

      const modelWords =
        String(
          model || ""
        )
          .toLowerCase()
          .split(
            /\s+/
          )
          .map(
            word =>
              word.replace(
                /[^a-z0-9-]/g,
                ""
              )
          )
          .filter(
            Boolean
          )
          .slice(
            0,
            3
          );

      const modelOk =
        modelWords.length === 0 ||
        modelWords.some(
          word =>
            haystack.includes(
              word
            )
        );

      if (
        !brandOk ||
        !modelOk
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
   IMAGE CANDIDATES
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
        model
      ),

      wikimediaImages(
        brand,
        model,
        generation,
        modelYear
      )
    ]);

  const unique = [];

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
      )
    ) {
      continue;
    }

    if (
      rejectedImageUrl(
        image
      )
    ) {
      continue;
    }

    if (
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
  return `You are CARMATCH AI, an automotive research assistant for a Slovak user.

USER REQUEST:
${userQuery}

TASK:
Return EXACTLY 3 real, currently produced passenger cars that best match the request.

Prefer:
- newest available generation
- newest real model year
- current European or Slovak-market information
- official manufacturer information
- verifiable current prices

STRICT RULES:

1. Return exactly 3 cars.
2. Cars must be real production passenger cars.
3. Do not invent cars.
4. Do not invent specifications.
5. Do not invent prices.
6. Do not invent URLs.
7. Do not return concept cars unless explicitly requested.
8. Prefer currently produced models.
9. Give a numeric current starting price in EUR when verifiable.
10. If the current price cannot be reliably verified, price.amount must be null.
11. priceSource must be an actual source URL when available.
12. officialUrl must be an actual official manufacturer URL when available.
13. Power must contain both numeric kW and HP.
14. Use only kW and HP.
15. Never use ks, k, koní or PS.
16. trunkLiters means normal boot capacity with normal seats in place.
17. Distinguish petrol, diesel, HEV, PHEV and EV correctly.
18. Keep modelYear separate from generation.
19. reason must explain why the car matches the request.
20. description should be useful and factual.
21. maintenance should be practical and should not invent service intervals.
22. consumptionWltp must only be included when reasonably verified.
23. pros and cons must be factual.
24. score must be between 0 and 100.
25. Return ONLY valid JSON.
26. No Markdown.
27. No explanation outside JSON.

JSON FORMAT:

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
}`;
}

/* ============================================================
   AI CALL
   ============================================================ */

async function callAI(
  provider,
  prompt
) {
  let apiKey = "";

  const headers = {
    "Content-Type":
      "application/json"
  };

  if (
    provider.name ===
      "groq" ||
    provider.name ===
      "groq-mini"
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

            Authorization:
              `Bearer ${apiKey}`
          },

          signal:
            controller.signal,

          body:
            JSON.stringify({
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
            })
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
        ?.choices?.[0]
        ?.message
        ?.content;

    if (!content) {
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
   EXTRACT JSON
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
    String(value)
      .trim();

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
      kw: null,
      hp: null
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
      amount: null,
      currency: "EUR",
      type: "starting"
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

    images: [],

    imageCandidates: [],

    image: "",

    imageSource: "",

    photoSource: "",

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

    dataSources: []
  };

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
    result.power.kw ===
      null &&
    result.power.hp !==
      null
  ) {
    result.power.kw =
      kwFromHp(
        result.power.hp
      );
  }

  if (
    result.power.hp ===
      null &&
    result.power.kw !==
      null
  ) {
    result.power.hp =
      hpFromKw(
        result.power.kw
      );
  }

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

  if (currency) {
    result.price.currency =
      currency.toUpperCase();
  }

  const type =
    clean(
      car?.price?.type
    );

  if (type) {
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
        (
          car,
          index
        ) =>
          normalizeCar(
            car,
            index
          )
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
   OPENROUTER FALLBACKS
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
   PROVIDER FALLBACK LOGIC
   ============================================================ */

async function getCarsFromProviders(
  prompt
) {
  const errors = [];

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
      const message =
        `${provider.name}: ${error?.message || error}`;

      errors.push(
        message
      );

      console.error(
        "CARMATCH AI provider failed",
        message
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
   MAIN VERCEL HANDLER
   ============================================================ */

export default async function handler(
  req,
  res
) {
  /* ----------------------------------------------------------
     METHOD CHECK
     ---------------------------------------------------------- */

  if (
    req.method !==
    "POST"
  ) {
    return json(
      res,
      405,
      {
        ok: false,
        error:
          "Method not allowed"
      }
    );
  }

  /* ----------------------------------------------------------
     USER REQUEST
     ---------------------------------------------------------- */

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
        ok: false,
        error:
          "Zadajte požiadavky na auto."
      }
    );
  }

  /* ----------------------------------------------------------
     SUPABASE AUTHENTICATION
     ---------------------------------------------------------- */

  const auth =
    await verifySupabaseAccessToken(
      req
    );

  if (
    !auth.ok
  ) {
    let publicError =
      "Supabase autentifikácia nie je správne nastavená na serveri.";

    if (
      auth.code ===
      "missing_token"
    ) {
      publicError =
        "Supabase relácia chýba. Obnov stránku a skús znova.";
    }

    if (
      auth.code ===
      "invalid_token"
    ) {
      publicError =
        "Supabase relácia je neplatná alebo expirovaná. Obnov stránku a skús znova.";
    }

    console.error(
      "CARMATCH AI auth error",
      {
        code:
          auth.code,
        error:
          auth.error
      }
    );

    return json(
      res,
      auth.status ||
        500,
      {
        ok: false,
        error:
          publicError
      }
    );
  }

  /*
   * VERY IMPORTANT:
   * Only the verified user ID from Supabase is used.
   * We do NOT trust userId sent from the browser.
   */

  const userId =
    auth.userId;

  /* ----------------------------------------------------------
     CHARGE ONE SEARCH
     ---------------------------------------------------------- */

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
          ok: false,
          error:
            "Denný limit 5 vyhľadávaní bol dosiahnutý.",
          remaining: 0
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
        ok: false,
        error:
          "Nepodarilo sa overiť limit vyhľadávaní."
      }
    );
  }

  /* ----------------------------------------------------------
     AI SEARCH
     ---------------------------------------------------------- */

  try {
    const prompt =
      buildPrompt(
        userQuery
      );

    let cars =
      await getCarsFromProviders(
        prompt
      );

    /* --------------------------------------------------------
       IMAGE SEARCH
       -------------------------------------------------------- */

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

            const dataSources =
              [
                car.priceSource,
                car.officialUrl
              ]
                .filter(
                  Boolean
                )
                .filter(
                  (
                    value,
                    index,
                    array
                  ) =>
                    array.indexOf(
                      value
                    ) ===
                    index
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

              dataSources
            };
          }
        )
      );

    /* --------------------------------------------------------
       SUCCESS
       -------------------------------------------------------- */

    return json(
      res,
      200,
      {
        ok: true,

        cars,

        remaining:
          charge.remaining,

        usage: {
          charged: true,

          remaining:
            charge.remaining
        }
      }
    );
  } catch (error) {
    /* --------------------------------------------------------
       COMPLETE FAILURE -> REFUND
       -------------------------------------------------------- */

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
        ok: false,

        refunded:
          refund.ok,

        remaining:
          refund.ok
            ? charge.remaining
            : null,

        error:
          refund.ok
            ? "Vyhľadávanie sa nepodarilo dokončiť. Spotreba vyhľadávania bola vrátená."
            : "Vyhľadávanie sa nepodarilo dokončiť a automatické vrátenie spotreby zlyhalo."
      }
    );
  }
}