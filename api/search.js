export default async function handler(req, res) {
  /* =====================================================
     CARMATCH AI - FINAL STABLE BACKEND
     
     FREE:
       openrouter/free
       ↓
       retry

     PAID FALLBACK:
       openai/gpt-oss-120b
       ↓
       retry

     Images:
       Wikimedia Commons

     ===================================================== */

  /* =====================================================
     CORS
     ===================================================== */

  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

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

  /* =====================================================
     API KEY
     ===================================================== */

  const apiKey =
    process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error:
        "OPENROUTER_API_KEY is missing in Vercel"
    });
  }

  try {

    /* ===================================================
       REQUEST DATA
       =================================================== */

    const {
      naturalLanguage = "",
      filters = {}
    } = req.body || {};

    const userText =
      String(
        naturalLanguage || ""
      ).trim();

    /* ===================================================
       LANGUAGE DETECTION
       =================================================== */

    function detectLanguage(text) {

      const t =
        String(text || "")
          .toLowerCase();

      if (
        /[áäčďéíĺľňóôŕšťúýž]/.test(t) ||
        /\b(chcem|potrebujem|auto|vozidlo|kufor|výkon|pohon|cena|miest|rok|benzín|nafta|elektrické|hybrid)\b/.test(t)
      ) {
        return "sk";
      }

      if (
        /\b(chci|potřebuji|auto|vozidlo|kufr|výkon|pohon|cena|místa|rok)\b/.test(t)
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

    const language =
      detectLanguage(userText);

    /* ===================================================
       MARKET
       =================================================== */

    const marketMap = {
      sk: "Slovakia / European Union",
      cs: "Czech Republic / European Union",
      de: "Germany / European Union",
      fr: "France / European Union",
      it: "Italy / European Union",
      es: "Spain / European Union",
      pl: "Poland / European Union",
      en: "International market"
    };

    const market =
      marketMap[language] ||
      "International market";

    /* ===================================================
       PROMPT
       =================================================== */

    const prompt = `
You are CARMATCH AI, a professional worldwide automotive recommendation assistant.

CURRENT DATE:
August 31, 2026

USER LANGUAGE:
${language}

USER MARKET:
${market}

USER REQUEST:
${userText}

FILTERS:
${JSON.stringify(filters, null, 2)}

Your task is to recommend EXACTLY 3 vehicles that best match the user's requirements.

IMPORTANT RULES:

1. Consider manufacturers worldwide.
2. Prefer the newest genuinely available generation.
3. Never confuse different generations.
4. Never invent specifications.
5. Never invent model years.
6. Never invent prices.
7. Never invent URLs.
8. Match the user's market whenever possible.
9. Return EXACTLY 3 vehicles.
10. Rank them from #1 to #3.
11. Give a realistic score from 0 to 100.
12. Include advantages.
13. Include disadvantages.
14. Include maintenance information.
15. Include trunk capacity when known.
16. Include dimensions when known.
17. Include manufacturer.
18. Include an official manufacturer configurator URL only when genuinely known.
19. Do not generate image URLs.
20. Images are searched separately by the backend.
21. All descriptive text must use the user's language.
22. Do not output reasoning.
23. Do not output thinking.
24. Do not output markdown.
25. Do not output safety labels.
26. Never output "User Safety: safe".
27. Do not write anything before the JSON.
28. Do not write anything after the JSON.
29. Return exactly ONE JSON object.
30. The JSON object must contain exactly 3 cars.

PRICE RULE:

Never guess a price.

If a reliable price is genuinely known:

"price": "actual known price"
"priceVerified": true

If no reliable price is known:

"price": "Cena nie je dostupná"
"priceVerified": false

Never use approximate prices.

Never use:
- around
- approximately
- about
- roughly
- estimated
- similar price

If you cannot confidently verify a price, use:

"price": "Cena nie je dostupná"
"priceVerified": false

JSON FORMAT:

{
  "language": "string",
  "market": "string",
  "cars": [
    {
      "name": "string",
      "generation": "string",
      "year": "string",
      "score": 0,
      "price": "string",
      "priceVerified": false,
      "priceSource": "string",
      "priceType": "string",
      "power": "string",
      "seats": "string",
      "trunk": "string",
      "drive": "string",
      "fuel": "string",
      "body": "string",
      "dimensions": "string",
      "reason": "string",
      "pros": [
        "string"
      ],
      "cons": [
        "string"
      ],
      "maintenance": "string",
      "manufacturer": "string",
      "configurator": "string"
    }
  ]
}

RETURN ONLY JSON.
`;

    /* ===================================================
       MODEL CONFIGURATION
       =================================================== */

    const FREE_MODEL =
      "openrouter/free";

    const PAID_MODEL =
      process.env.PAID_FALLBACK_MODEL ||
      "openai/gpt-oss-120b";

    const PAID_FALLBACK_ENABLED =
      String(
        process.env.PAID_FALLBACK_ENABLED ||
        "false"
      ).toLowerCase() === "true";

    /* ===================================================
       TIMEOUT
       =================================================== */

    const REQUEST_TIMEOUT =
      30000;

    /* ===================================================
       SLEEP
       =================================================== */

    const sleep =
      (ms) =>
        new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              ms
            )
        );

    /* ===================================================
       CLEAN AI OUTPUT
       =================================================== */

    function cleanAIText(input) {

      let text =
        String(
          input || ""
        ).trim();

      /*
        Remove markdown fences.
      */

      text =
        text.replace(
          /```json/gi,
          ""
        );

      text =
        text.replace(
          /```/g,
          ""
        );

      /*
        Remove accidental safety messages.
      */

      text =
        text.replace(
          /^\s*User\s+Safety\s*:\s*safe\s*/i,
          ""
        );
