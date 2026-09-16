module.exports = async function handler(req, res) {
  // =========================================================
  // BASIC RESPONSE HEADERS
  // =========================================================

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    // =======================================================
    // OPENROUTER KEY
    // =======================================================

    var apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "OPENROUTER_API_KEY is missing in Vercel"
      });
    }

    // =======================================================
    // INPUT
    // =======================================================

    var input = req.body || {};

    if (typeof input === "string") {
      try {
        input = JSON.parse(input);
      } catch (e) {
        input = {};
      }
    }

    var naturalLanguage = String(
      input.naturalLanguage || ""
    ).trim();

    var filters =
      input.filters &&
      typeof input.filters === "object"
        ? input.filters
        : {};

    if (
      !naturalLanguage &&
      Object.keys(filters).length === 0
    ) {
      return res.status(400).json({
        error: "Missing search request"
      });
    }

    var language = detectLanguage(
      naturalLanguage
    );

    var market = getMarket(language);

    // =======================================================
    // PROMPT
    // =======================================================

    var prompt = createPrompt(
      naturalLanguage,
      filters,
      language,
      market
    );

    // =======================================================
    // FREE MODEL STRATEGY
    // =======================================================
    //
    // 1. OpenRouter Free Router
    // 2. MiniMax M3
    // 3. Gemma 4 26B A4B
    // 4. Gemma 4 31B
    //
    // We deliberately DO NOT use response_format.
    // This keeps compatibility broader across free models.
    // =======================================================

    var models = [
      "openrouter/free",
      "minimax/minimax-m3:free",
      "google/gemma-4-26b-a4b-it:free",
      "google/gemma-4-31b-it:free"
    ];

    var paidEnabled =
      String(
        process.env.PAID_FALLBACK_ENABLED || "false"
      ).toLowerCase() === "true";

    var paidModel =
      process.env.PAID_FALLBACK_MODEL ||
      "openai/gpt-oss-120b";

    var result = null;
    var usedModel = "";
    var errors = [];

    // =======================================================
    // TRY FREE MODELS
    // =======================================================

    for (var i = 0; i < models.length; i++) {
      var attempt = await callAI(
        apiKey,
        models[i],
        prompt
      );

      if (attempt.ok) {
        result = attempt.data;
        usedModel =
          attempt.model || models[i];
        break;
      }

      errors.push({
        model: models[i],
        status: attempt.status || 0,
        error:
          attempt.error ||
          "Unknown error"
      });
    }

    // =======================================================
    // ONE EXTRA FREE RETRY
    // =======================================================

    if (!result) {
      await wait(600);

      var retry = await callAI(
        apiKey,
        "openrouter/free",
        prompt
      );

      if (retry.ok) {
        result = retry.data;
        usedModel =
          retry.model ||
          "openrouter/free";
      } else {
        errors.push({
          model: "openrouter/free-retry",
          status: retry.status || 0,
          error:
            retry.error ||
            "Retry failed"
        });
      }
    }

    // =======================================================
    // OPTIONAL PAID FALLBACK
    // =======================================================
    //
    // Disabled by default.
    // It only works when:
    //
    // PAID_FALLBACK_ENABLED=true
    //
    // =======================================================

    if (!result && paidEnabled) {
      var paidAttempt = await callAI(
        apiKey,
        paidModel,
        prompt,
        true
      );

      if (paidAttempt.ok) {
        result = paidAttempt.data;
        usedModel =
          paidAttempt.model ||
          paidModel;
      } else {
        errors.push({
          model: paidModel,
          status:
            paidAttempt.status || 0,
          error:
            paidAttempt.error ||
            "Paid fallback failed"
        });
      }
    }

    // =======================================================
    // FAILURE
    // =======================================================

    if (!result) {
      console.error(
        "CARMATCH AI ALL MODELS FAILED:",
        JSON.stringify(errors)
      );

      return res.status(503).json({
        error: "AI is temporarily unavailable",

        message:
          paidEnabled
            ? "CARMATCH AI momentálne nedostal použiteľnú odpoveď."
            : "CARMATCH AI momentálne nedostal použiteľnú odpoveď z bezplatných AI modelov.",

        retryable: true,

        paidFallbackEnabled:
          paidEnabled
      });
    }

    // =======================================================
    // TAKE FIRST 3
    // =======================================================

    var selectedCars =
      Array.isArray(result.cars)
        ? result.cars.slice(0, 3)
        : [];

    if (selectedCars.length < 3) {
      return res.status(503).json({
        error:
          "AI returned fewer than 3 cars",

        message:
          "AI nevrátila tri použiteľné vozidlá.",

        retryable: true,

        paidFallbackEnabled:
          paidEnabled
      });
    }

    // =======================================================
    // FIND PHOTOS
    // =======================================================

    var cars = [];

    for (var k = 0; k < 3; k++) {
      var currentCar =
        selectedCars[k];

      var photo =
        await findWikimediaImage(
          currentCar.manufacturer,
          currentCar.name,
          currentCar.generation
        );

      cars.push(
        normalizeCar(
          currentCar,
          photo
        )
      );
    }

    // =======================================================
    // SUCCESS
    // =======================================================

    return res.status(200).json({
      language:
        result.language || language,

      market:
        result.market || market,

      cars: cars,

      ai: {
        model: usedModel,

        paidFallbackEnabled:
          paidEnabled,

        paidFallbackUsed:
          paidEnabled &&
          usedModel === paidModel
      }
    });

  } catch (error) {
    console.error(
      "CARMATCH AI BACKEND ERROR:",
      error
    );

    return res.status(500).json({
      error: "Backend error",

      message:
        error &&
        error.message
          ? error.message
          : "Unknown server error"
    });
  }
};


// ===========================================================
// LANGUAGE DETECTION
// ===========================================================

function detectLanguage(text) {
  var t =
    String(text || "")
      .toLowerCase();

  if (
    /[áäčďéíĺľňóôŕšťúýž]/.test(t) ||
    /\b(chcem|potrebujem|auto|vozidlo|kufor|výkon|pohon|cena|miest|rok|benzín|nafta|elektrické|hybrid)\b/.test(t)
  ) {
    return "sk";
  }

  if (
    /[ěščřžůúďťňóáíé]/.test(t) ||
    /\b(chci|potřebuji|vozidlo|kufr|výkon|pohon|cena|místa|rok)\b/.test(t)
  ) {
    return "cs";
  }

  if (
    /\b(ich|möchte|brauche|fahrzeug|preis|leistung|allrad|sitze|jahr)\b/.test(t)
  ) {
    return "de";
  }

  if (
    /\b(voiture|prix|besoin|puissance|places|année)\b/.test(t)
  ) {
    return "fr";
  }

  if (
    /\b(voglio|macchina|prezzo|potenza|bisogno|posti|anno)\b/.test(t)
  ) {
    return "it";
  }

  if (
    /\b(quiero|coche|precio|potencia|necesito|plazas|año)\b/.test(t)
  ) {
    return "es";
  }

  if (
    /\b(chcę|samochód|cena|moc|potrzebuję|miejsc|rok)\b/.test(t)
  ) {
    return "pl";
  }

  return "en";
}


// ===========================================================
// MARKET
// ===========================================================

function getMarket(language) {
  var map = {
    sk: "Slovakia / European Union",
    cs: "Czech Republic / European Union",
    de: "Germany / European Union",
    fr: "France / European Union",
    it: "Italy / European Union",
    es: "Spain / European Union",
    pl: "Poland / European Union",
    en: "International market"
  };

  return (
    map[language] ||
    "International market"
  );
}


// ===========================================================
// PROMPT
// ===========================================================

function createPrompt(
  naturalLanguage,
  filters,
  language,
  market
) {
  return `
You are CARMATCH AI.

You are a worldwide vehicle recommendation engine.

CURRENT DATE:
September 2026

USER LANGUAGE:
${language}

MARKET:
${market}

USER REQUEST:
${naturalLanguage || "No free text provided."}

FILTERS:
${JSON.stringify(filters