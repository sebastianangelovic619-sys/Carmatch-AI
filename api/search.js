// ============================================================
// CARMATCH AI - ADVANCED VEHICLE IMAGE ENGINE v8
// ============================================================
// This section ONLY handles vehicle photos.
// AI, pricing, power, Supabase and provider logic stay unchanged.
// ============================================================


// ============================================================
// IMAGE SETTINGS
// ============================================================

const MAX_IMAGE_CANDIDATES = 12;

const IMAGE_SEARCH_LIMIT = 35;

const IMAGE_MIN_WIDTH = 500;

const IMAGE_MIN_HEIGHT = 300;


// ============================================================
// WORDS THAT MUST NEVER BE USED
// ============================================================

const IMAGE_REJECT_WORDS = [
  "logo",
  "logos",
  "icon",
  "icons",
  "flag",
  "emblem",
  "badge",
  "symbol",

  "wheel",
  "wheels",
  "rim",
  "rims",
  "tyre",
  "tire",

  "interior",
  "dashboard",
  "dash",
  "cockpit",
  "steering",
  "steering wheel",
  "seat",
  "seats",

  "engine",
  "motor",
  "engine bay",

  "poster",
  "advertisement",
  "advert",
  "advertising",
  "brochure",
  "catalogue",
  "catalog",
  "flyer",

  "drawing",
  "diagram",
  "blueprint",
  "schematic",

  "model kit",
  "toy",
  "miniature",
  "hot wheels",
  "matchbox",
  "scale model",

  "render",
  "rendering",
  "concept",
  "concept car",
  "prototype",

  "motorcycle",
  "motorbike",
  "scooter",
  "moped",

  "truck",
  "lorry",
  "bus",

  "van",

  "train",
  "aircraft",
  "plane",

  "building",
  "factory",

  "crash",
  "accident",
  "wreck",

  "game",
  "video game",

  "forza",
  "gran turismo",

  "lego"
];


// ============================================================
// BAD IMAGE DOMAIN / FILE WORDS
// ============================================================

const IMAGE_BLOCKED_DOMAINS = [
  "youtube.com",
  "facebook.com",
  "instagram.com",
  "pinterest.com"
];


// ============================================================
// IMAGE TITLE REJECTION
// ============================================================

function isRejectedImageTitle(
  title
) {
  const lower =
    String(
      title || ""
    )
      .toLowerCase()
      .replace(
        /[_-]+/g,
        " "
      );

  return IMAGE_REJECT_WORDS.some(
    word =>
      lower.includes(
        word
      )
  );
}


// ============================================================
// IMAGE URL VALIDATION
// ============================================================

function isWikimediaPhotoURL(
  url
) {
  if (
    !url ||
    typeof url !== "string"
  ) {
    return false;
  }

  try {
    const parsed =
      new URL(url);

    if (
      parsed.protocol !==
      "https:"
    ) {
      return false;
    }

    const hostname =
      parsed.hostname
        .toLowerCase();

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
// BLOCKED IMAGE URL
// ============================================================

function isBlockedImageURL(
  url
) {
  if (
    !url ||
    typeof url !== "string"
  ) {
    return true;
  }

  try {
    const parsed =
      new URL(url);

    const hostname =
      parsed.hostname
        .toLowerCase();

    if (
      IMAGE_BLOCKED_DOMAINS.some(
        domain =>
          hostname === domain ||
          hostname.endsWith(
            `.${domain}`
          )
      )
    ) {
      return true;
    }

    const lower =
      url.toLowerCase();

    return IMAGE_REJECT_WORDS.some(
      word =>
        lower.includes(
          word.replace(
            /\s+/g,
            "_"
          )
        )
    );
  } catch (_) {
    return true;
  }
}


// ============================================================
// IMAGE EXTENSION
// ============================================================

function isImageExtension(
  url
) {
  const lower =
    String(
      url || ""
    ).toLowerCase();

  return (
    lower.includes(".jpg") ||
    lower.includes(".jpeg") ||
    lower.includes(".png") ||
    lower.includes(".webp") ||
    lower.includes(".jfif")
  );
}


// ============================================================
// CLEAN SEARCH TEXT
// ============================================================

function cleanSearchText(
  value
) {
  return String(
    value || ""
  )
    .replace(
      /[()[\]{},:;|]/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


// ============================================================
// NORMALIZE MODEL NAME
// ============================================================

function normalizeVehicleText(
  value
) {
  return cleanSearchText(
    value
  )
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[^a-z0-9\s-]/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


// ============================================================
// COMMON TRIM / PERFORMANCE WORDS
// ============================================================

const VEHICLE_TRIM_WORDS = [
  "competition",
  "comp",
  "performance",
  "touring",
  "avant",
  "estate",
  "wagon",
  "sportback",
  "coupe",
  "coupé",
  "convertible",
  "cabriolet",
  "roadster",
  "turbo",
  "turbo s",
  "gts",
  "gt3",
  "gt4",
  "rs",
  "rs6",
  "rs7",
  "m",
  "m5",
  "m3",
  "amg",
  "63",
  "53",
  "45",
  "35",
  "e performance",
  "e-hybrid",
  "hybrid",
  "plug-in",
  "phev",
  "ev",
  "electric",
  "xdrive",
  "quattro",
  "4matic",
  "4motion",
  "awd",
  "4x4"
];


// ============================================================
// REMOVE NON-ESSENTIAL TRIM TERMS
// ============================================================

function simplifyVehicleName(
  name
) {
  let result =
    normalizeVehicleText(
      name
    );

  for (
    const word
    of VEHICLE_TRIM_WORDS
  ) {
    result =
      result.replace(
        new RegExp(
          `\\b${word.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}\\b`,
          "gi"
        ),
        " "
      );
  }

  return result
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


// ============================================================
// VEHICLE SEARCH TERMS
// ============================================================

function vehicleSearchTerms(
  car
) {
  const originalName =
    cleanSearchText(
      car?.name
    );

  const generation =
    cleanSearchText(
      car?.generation
    );

  const year =
    Number(
      car?.year
    );

  const simplifiedName =
    simplifyVehicleName(
      originalName
    );

  return {
    name:
      originalName,

    normalizedName:
      normalizeVehicleText(
        originalName
      ),

    simplifiedName,

    generation:
      generation,

    normalizedGeneration:
      normalizeVehicleText(
        generation
      ),

    year:
      Number.isFinite(year)
        ? String(year)
        : ""
  };
}


// ============================================================
// BUILD MANY SEARCH QUERIES
// ============================================================

function buildImageSearchQueries(
  car
) {
  const {
    name,
    normalizedName,
    simplifiedName,
    generation,
    normalizedGeneration,
    year
  } =
    vehicleSearchTerms(
      car
    );

  const queries = [];

  function add(
    value
  ) {
    const cleaned =
      cleanSearchText(
        value
      );

    if (
      cleaned.length >= 3
    ) {
      queries.push(
        cleaned
      );
    }
  }


  // ----------------------------------------------------------
  // 1. Exact modern vehicle
  // ----------------------------------------------------------

  if (
    name &&
    generation &&
    year
  ) {
    add(
      `${name} ${generation} ${year}`
    );

    add(
      `${name} ${generation} ${year} car`
    );
  }


  // ----------------------------------------------------------
  // 2. Exact vehicle + generation
  // ----------------------------------------------------------

  if (
    name &&
    generation
  ) {
    add(
      `${name} ${generation}`
    );

    add(
      `${name} ${generation} car`
    );

    add(
      `${name} ${generation} automobile`
    );
  }


  // ----------------------------------------------------------
  // 3. Name + year
  // ----------------------------------------------------------

  if (
    name &&
    year
  ) {
    add(
      `${name} ${year}`
    );

    add(
      `${name} ${year} car`
    );
  }


  // ----------------------------------------------------------
  // 4. Simplified model name
  // ----------------------------------------------------------

  if (
    simplifiedName &&
    simplifiedName !==
      normalizedName
  ) {
    add(
      simplifiedName
    );

    add(
      `${simplifiedName} car`
    );

    if (year) {
      add(
        `${simplifiedName} ${year}`
      );
    }
  }


  // ----------------------------------------------------------
  // 5. Model without year
  // ----------------------------------------------------------

  if (name) {
    add(
      `${name} car`
    );

    add(
      `${name} automobile`
    );

    add(
      `${name} vehicle`
    );
  }


  // ----------------------------------------------------------
  // 6. Generation alone + name
  // ----------------------------------------------------------

  if (
    name &&
    generation
  ) {
    add(
      `${name} ${generation} front`
    );

    add(
      `${name} ${generation} exterior`
    );
  }


  // ----------------------------------------------------------
  // 7. Wikipedia-friendly queries
  // ----------------------------------------------------------

  if (name) {
    add(
      `${name}`
    );
  }

  if (
    simplifiedName
  ) {
    add(
      `${simplifiedName}`
    );
  }


  // ----------------------------------------------------------
  // Remove duplicates
  // ----------------------------------------------------------

  return [
    ...new Set(
      queries
    )
  ];
}


// ============================================================
// VEHICLE TOKEN MATCHING
// ============================================================

function getVehicleTokens(
  value
) {
  return normalizeVehicleText(
    value
  )
    .split(
      /\s+/
    )
    .filter(
      token =>
        token.length >= 2
    );
}


// ============================================================
// CHECK WHETHER IMAGE BELONGS TO VEHICLE
// ============================================================

function vehicleTextMatchScore(
  candidate,
  car
) {
  const {
    name,
    generation,
    year
  } =
    vehicleSearchTerms(
      car
    );

  const title =
    normalizeVehicleText(
      candidate?.title
    );

  const query =
    normalizeVehicleText(
      candidate?.query
    );

  const combined =
    `${title} ${query}`;


  const nameTokens =
    getVehicleTokens(
      name
    );

  const generationTokens =
    getVehicleTokens(
      generation
    );

  const simplifiedTokens =
    getVehicleTokens(
      simplifyVehicleName(
        name
      )
    );


  let score = 0;


  // ----------------------------------------------------------
  // Brand/model name
  // ----------------------------------------------------------

  for (
    const token
    of nameTokens
  ) {
    if (
      combined.includes(
        token
      )
    ) {
      score += 7;
    }
  }


  // ----------------------------------------------------------
  // Simplified model
  // ----------------------------------------------------------

  for (
    const token
    of simplifiedTokens
  ) {
    if (
      combined.includes(
        token
      )
    ) {
      score += 5;
    }
  }


  // ----------------------------------------------------------
  // Generation
  // ----------------------------------------------------------

  for (
    const token
    of generationTokens
  ) {
    if (
      combined.includes(
        token
      )
    ) {
      score += 8;
    }
  }


  // ----------------------------------------------------------
  // Year
  // ----------------------------------------------------------

  if (
    year &&
    combined.includes(
      String(year)
    )
  ) {
    score += 12;
  }


  // ----------------------------------------------------------
  // Automobile keywords
  // ----------------------------------------------------------

  if (
    combined.includes(
      "car"
    ) ||
    combined.includes(
      "automobile"
    ) ||
    combined.includes(
      "vehicle"
    )
  ) {
    score += 2;
  }


  // ----------------------------------------------------------
  // Exterior keywords
  // ----------------------------------------------------------

  if (
    combined.includes(
      "front"
    ) ||
    combined.includes(
      "side"
    ) ||
    combined.includes(
      "exterior"
    )
  ) {
    score += 4;
  }


  // ----------------------------------------------------------
  // Search priority
  // ----------------------------------------------------------

  if (
    candidate?.queryIndex === 0
  ) {
    score += 8;
  } else if (
    candidate?.queryIndex === 1
  ) {
    score += 5;
  } else if (
    candidate?.queryIndex === 2
  ) {
    score += 3;
  }


  return score;
}


// ============================================================
// IMAGE RELEVANCE SCORE
// ============================================================

function imageRelevanceScore(
  candidate,
  car
) {
  if (
    !candidate ||
    !candidate.image
  ) {
    return 0;
  }

  if (
    isRejectedImageTitle(
      candidate.title
    )
  ) {
    return 0;
  }

  if (
    isBlockedImageURL(
      candidate.image
    )
  ) {
    return 0;
  }

  if (
    !isWikimediaPhotoURL(
      candidate.image
    )
  ) {
    return 0;
  }

  return vehicleTextMatchScore(
    candidate,
    car
  );
}


// ============================================================
// DEDUPLICATE IMAGE CANDIDATES
// ============================================================

function dedupeImageCandidates(
  candidates,
  car
) {
  const map =
    new Map();

  for (
    const candidate
    of candidates
  ) {
    if (
      !candidate ||
      !candidate.image
    ) {
      continue;
    }

    if (
      !isWikimediaPhotoURL(
        candidate.image
      )
    ) {
      continue;
    }

    if (
      isBlockedImageURL(
        candidate.image
      )
    ) {
      continue;
    }

    if (
      isRejectedImageTitle(
        candidate.title
      )
    ) {
      continue;
    }

    const score =
      imageRelevanceScore(
        candidate,
        car
      );

    // Much less aggressive than v7.
    // This is important because Wikimedia file names
    // are often completely different from the car model.
    if (
      score < 5
    ) {
      continue;
    }

    const normalizedUrl =
      candidate.image
        .split("?")[0];

    const existing =
      map.get(
        normalizedUrl
      );

    if (
      !existing ||
      score >
        existing.relevance
    ) {
      map.set(
        normalizedUrl,
        {
          ...candidate,
          relevance:
            score
        }
      );
    }
  }

  return [
    ...map.values()
  ]
    .sort(
      (a, b) =>
        b.relevance -
        a.relevance
    )
    .slice(
      0,
      MAX_IMAGE_CANDIDATES
    );
}


// ============================================================
// WIKIMEDIA COMMONS SEARCH
// ============================================================

async function searchWikimediaImages(
  query,
  queryIndex = 0
) {
  const params =
    new URLSearchParams({
      action:
        "query",

      generator:
        "search",

      gsrsearch:
        query,

      gsrnamespace:
        "6",

      gsrlimit:
        String(
          IMAGE_SEARCH_LIMIT
        ),

      prop:
        "imageinfo",

      iiprop:
        "url|mime|size|dimensions|descriptionurl",

      iiurlwidth:
        "1800",

      format:
        "json",

      origin:
        "*"
    });


  const url =
    `${WIKIMEDIA_API}?${params.toString()}`;


  const response =
    await fetchWithTimeout(
      url,
      {
        method:
          "GET",

        headers: {
          Accept:
            "application/json",

          "User-Agent":
            "CARMATCHAI/8.0 vehicle-image-engine"
        }
      },
      WIKIMEDIA_TIMEOUT
    );


  if (
    !response.ok
  ) {
    throw new Error(
      `Wikimedia HTTP ${response.status}`
    );
  }


  const data =
    await response.json();


  const pages =
    Object.values(
      data?.query?.pages ||
        {}
    );


  const candidates = [];


  for (
    const page
    of pages
  ) {
    const title =
      text(
        page?.title,
        700
      );


    if (
      isRejectedImageTitle(
        title
      )
    ) {
      continue;
    }


    const imageInfo =
      page?.imageinfo?.[0];


    if (
      !imageInfo
    ) {
      continue;
    }


    const mime =
      String(
        imageInfo.mime ||
          ""
      ).toLowerCase();


    if (
      mime &&
      !mime.startsWith(
        "image/"
      )
    ) {
      continue;
    }


    const width =
      Number(
        imageInfo.width
      );

    const height =
      Number(
        imageInfo.height
      );


    if (
      Number.isFinite(width) &&
      Number.isFinite(height)
    ) {
      if (
        width <
          IMAGE_MIN_WIDTH ||
        height <
          IMAGE_MIN_HEIGHT
      ) {
        continue;
      }


      const ratio =
        width /
        height;


      // Avoid icons / panoramas / strange crops.
      if (
        ratio <
          0.65 ||
        ratio >
          4.2
      ) {
        continue;
      }
    }


    const imageUrl =
      imageInfo.thumburl ||
      imageInfo.url ||
      "";


    if (
      !isWikimediaPhotoURL(
        imageUrl
      )
    ) {
      continue;
    }


    if (
      !isImageExtension(
        imageUrl
      )
    ) {
      continue;
    }


    candidates.push({
      image:
        imageUrl,

      photoSource:
        imageInfo.descriptionurl ||
        "",

      title,

      query,

      queryIndex,

      width,

      height
    });
  }


  return candidates;
}


// ============================================================
// WIKIPEDIA SEARCH
// ============================================================

async function searchWikipediaImages(
  query,
  queryIndex = 0
) {
  const searchParams =
    new URLSearchParams({
      action:
        "query",

      list:
        "search",

      srsearch:
        query,

      srnamespace:
        "0",

      srlimit:
        "20",

      format:
        "json",

      origin:
        "*"
    });


  const searchUrl =
    `${WIKIPEDIA_API}?${searchParams.toString()}`;


  const searchResponse =
    await fetchWithTimeout(
      searchUrl,
      {
        method:
          "GET",

        headers: {
          Accept:
            "application/json",

          "User-Agent":
            "CARMATCHAI/8.0 vehicle-image-engine"
        }
      },
      WIKIPEDIA_TIMEOUT
    );


  if (
    !searchResponse.ok
  ) {
    throw new Error(
      `Wikipedia search HTTP ${searchResponse.status}`
    );
  }


  const searchData =
    await searchResponse.json();


  const results =
    searchData?.query?.search;


  if (
    !Array.isArray(
      results
    ) ||
    results.length === 0
  ) {
    return [];
  }


  const titles =
    results
      .slice(
        0,
        20
      )
      .map(
        item =>
          item?.title
      )
      .filter(
        Boolean
      )
      .join("|");


  if (!titles) {
    return [];
  }


  const imageParams =
    new URLSearchParams({
      action:
        "query",

      titles,

      prop:
        "pageimages|info",

      inprop:
        "url",

      piprop:
        "thumbnail",

      pithumbsize:
        "1800",

      format:
        "json",

      origin:
        "*"
    });


  const imageUrl =
    `${WIKIPEDIA_API}?${imageParams.toString()}`;


  const imageResponse =
    await fetchWithTimeout(
      imageUrl,
      {
        method:
          "GET",

        headers: {
          Accept:
            "application/json",

          "User-Agent":
            "CARMATCHAI/8.0 vehicle-image-engine"
        }
      },
      WIKIPEDIA_TIMEOUT
    );


  if (
    !imageResponse.ok
  ) {
    throw new Error(
      `Wikipedia image HTTP ${imageResponse.status}`
    );
  }


  const imageData =
    await imageResponse.json();


  const pages =
    Object.values(
      imageData?.query?.pages ||
        {}
    );


  const candidates = [];


  for (
    const page
    of pages
  ) {
    const title =
      text(
        page?.title,
        700
      );


    if (
      isRejectedImageTitle(
        title
      )
    ) {
      continue;
    }


    const thumbnail =
      page?.thumbnail?.source ||
      "";


    if (
      !isWikimediaPhotoURL(
        thumbnail
      )
    ) {
      continue;
    }


    if (
      isBlockedImageURL(
        thumbnail
      )
    ) {
      continue;
    }


    candidates.push({
      image:
        thumbnail,

      photoSource:
        page?.fullurl ||
        "",

      title,

      query,

      queryIndex
    });
  }


  return candidates;
}


// ============================================================
// EXTRA FALLBACK:
// SEARCH WIKIMEDIA USING ONLY THE CORE MODEL
// ============================================================

async function searchCoreVehicleImage(
  car
) {
  const {
    name,
    simplifiedName
  } =
    vehicleSearchTerms(
      car
    );


  const queries = [
    name,
    simplifiedName,
    `${name} car`,
    `${simplifiedName} car`
  ].filter(
    value =>
      value &&
      value.length >= 3
  );


  const unique =
    [
      ...new Set(
        queries
      )
    ];


  const results =
    await Promise.allSettled(
      unique.map(
        (
          query,
          index
        ) =>
          searchWikimediaImages(
            query,
            20 + index
          )
      )
    );


  const candidates = [];


  for (
    const result
    of results
  ) {
    if (
      result.status ===
      "fulfilled"
    ) {
      candidates.push(
        ...result.value
      );
    }
  }


  return candidates;
}


// ============================================================
// EXTRA FALLBACK:
// WIKIPEDIA CORE MODEL
// ============================================================

async function searchCoreWikipediaImage(
  car
) {
  const {
    name,
    simplifiedName
  } =
    vehicleSearchTerms(
      car
    );


  const queries = [
    name,
    simplifiedName,
    `${name} car`,
    `${simplifiedName} car`
  ].filter(
    value =>
      value &&
      value.length >= 3
  );


  const unique =
    [
      ...new Set(
        queries
      )
    ];


  const results =
    await Promise.allSettled(
      unique.map(
        (
          query,
          index
        ) =>
          searchWikipediaImages(
            query,
            30 + index
          )
      )
    );


  const candidates = [];


  for (
    const result
    of results
  ) {
    if (
      result.status ===
      "fulfilled"
    ) {
      candidates.push(
        ...result.value
      );
    }
  }


  return candidates;
}


// ============================================================
// FINAL IMAGE SEARCH
// ============================================================

async function findCarImages(
  car
) {
  const queries =
    buildImageSearchQueries(
      car
    );


  if (
    queries.length === 0
  ) {
    return {
      ...car,

      image:
        "",

      photoSource:
        "",

      imageCandidates:
        []
    };
  }


  let candidates = [];


  // ==========================================================
  // PHASE 1
  // Broad Wikimedia search
  // ==========================================================

  const commonsResults =
    await Promise.allSettled(
      queries.map(
        (
          query,
          index
        ) =>
          searchWikimediaImages(
            query,
            index
          )
      )
    );


  for (
    const result
    of commonsResults
  ) {
    if (
      result.status ===
      "fulfilled"
    ) {
      candidates.push(
        ...result.value
      );
    }
  }


  let deduped =
    dedupeImageCandidates(
      candidates,
      car
    );


  // ==========================================================
  // PHASE 2
  // Wikipedia fallback
  // ==========================================================

  if (
    deduped.length === 0 ||
    deduped.length <
      5
  ) {
    const wikipediaResults =
      await Promise.allSettled(
        queries.map(
          (
            query,
            index
          ) =>
            searchWikipediaImages(
              query,
              index
            )
        )
      );


    for (
      const result
      of wikipediaResults
    ) {
      if (
        result.status ===
        "fulfilled"
      ) {
        candidates.push(
          ...result.value
        );
      }
    }


    deduped =
      dedupeImageCandidates(
        candidates,
        car
      );
  }


  // ==========================================================
  // PHASE 3
  // Core model fallback
  // ==========================================================

  if (
    deduped.length === 0
  ) {
    const coreResults =
      await searchCoreVehicleImage(
        car
      );


    candidates.push(
      ...coreResults
    );


    deduped =
      dedupeImageCandidates(
        candidates,
        car
      );
  }


  // ==========================================================
  // PHASE 4
  // Core Wikipedia fallback
  // ==========================================================

  if (
    deduped.length === 0
  ) {
    const coreWikiResults =
      await searchCoreWikipediaImage(
        car
      );


    candidates.push(
      ...coreWikiResults
    );


    deduped =
      dedupeImageCandidates(
        candidates,
        car
      );
  }


  // ==========================================================
  // FINAL CANDIDATE LIST
  // ==========================================================

  const imageCandidates =
    deduped
      .slice(
        0,
        MAX_IMAGE_CANDIDATES
      )
      .map(
        candidate => ({
          url:
            candidate.image,

          source:
            candidate.photoSource ||
            "",

          title:
            candidate.title ||
            "",

          relevance:
            Number(
              candidate.relevance
            ) || 0
        })
      );


  const first =
    imageCandidates[0];


  // ==========================================================
  // IMPORTANT:
  // Never send an invalid image URL.
  // ==========================================================

  const validFirst =
    first &&
    isWikimediaPhotoURL(
      first.url
    ) &&
    !isBlockedImageURL(
      first.url
    )
      ? first
      : null;


  return {
    ...car,

    image:
      validFirst?.url ||
      "",

    photoSource:
      validFirst?.source ||
      "",

    imageCandidates
  };
}


// ============================================================
// ADD PHOTOS TO ALL CARS
// ============================================================

async function addCarImages(
  cars
) {
  const results =
    await Promise.allSettled(
      cars.map(
        car =>
          findCarImages(
            car
          )
      )
    );


  return results.map(
    (
      result,
      index
    ) => {
      if (
        result.status ===
        "fulfilled"
      ) {
        return result.value;
      }


      console.error(
        `CARMATCH AI image search failed for car ${index + 1}:`,
        result.reason
      );


      // IMPORTANT:
      // If image search fails for one vehicle,
      // the whole AI response does NOT fail.
      return {
        ...cars[index],

        image:
          "",

        photoSource:
          "",

        imageCandidates:
          []
      };
    }
  );
}