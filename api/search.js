// ============================================================
// CARMATCH AI - PRODUCTION BACKEND v10
// ============================================================
//
// Core features
// - Supabase anonymous auth
// - 5 searches / day via Supabase RPC
// - Groq GPT-OSS with live browser search
// - Official-manufacturer price priority
// - Server-side validation of official price URLs
// - kW + mechanical HP output (never PS / ks / bhp)
// - Current generation / model-year guardrails
// - 3-car exact output contract
// - OpenRouter FREE multi-fallback
// - Search refund when every provider fails
// - Wikimedia Commons + Wikipedia image fallback
// - Image rejection / relevance ranking
// - Strong SSRF-safe URL validation
// - Defensive parsing and normalization
// - Robust top-level error handling
// ============================================================

const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const OPENROUTER_URL =
  "https://openrouter.ai/api/v1/chat/completions";

const WIKIMEDIA_API =
  "https://commons.wikimedia.org/w/api.php";

const WIKIPEDIA_API =
  "https://en.wikipedia.org/w/api.php";

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY;

const GROQ_API_KEY =
  process.env.GROQ_API_KEY;

const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY;


// ============================================================
// SETTINGS
// ============================================================

const MAX_SEARCHES_PER_DAY = 5;

const REQUEST_TIMEOUT = 55000;
const GROQ_PRIMARY_TIMEOUT = 52000;
const GROQ_REPAIR_TIMEOUT = 24000;
const OPENROUTER_TIMEOUT = 30000;

const SUPABASE_TIMEOUT = 10000;
const OFFICIAL_PAGE_TIMEOUT = 6500;
const WIKIMEDIA_TIMEOUT = 7000;
const WIKIPEDIA_TIMEOUT = 7000;

const MAX_IMAGE_CANDIDATES = 8;
const MAX_DATA_SOURCES = 12;
const MAX_BODY_TEXT = 7000;

const POWER_KW_TO_HP = 1.34102209;
const POWER_HP_TO_KW = 1 / POWER_KW_TO_HP;


// ============================================================
// GROQ MODELS
// ============================================================

const GROQ_MODELS = [
  {
    model: "openai/gpt-oss-120b",
    timeout: GROQ_PRIMARY_TIMEOUT,
    purpose: "research"
  },
  {
    model: "openai/gpt-oss-20b",
    timeout: GROQ_REPAIR_TIMEOUT,
    purpose: "repair"
  }
];


// ============================================================
// OPENROUTER FREE MODELS
// ============================================================

const OPENROUTER_FREE_MODELS = [
  "qwen/qwen3.8-27b:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3.5-lightning:free",
  "openrouter/free"
];


// ============================================================
// OFFICIAL / THIRD-PARTY DOMAIN RULES
// ============================================================

const OBVIOUS_THIRD_PARTY_HOSTS = [
  "autoscout24.com",
  "autoscout24.de",
  "autoscout24.at",
  "mobile.de",
  "sauto.cz",
  "tipcars.com",
  "cars.com",
  "cargurus.com",
  "autotrader.com",
  "autobazar.eu",
  "bazos.sk",
  "bazaar.sk",
  "autobazar.sk",
  "carvago.com",
  "hey.car",
  "carwow.co.uk",
  "topgear.com",
  "autocar.co.uk",
  "motor1.com",
  "wikipedia.org",
  "reddit.com",
  "youtube.com",
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "x.com",
  "twitter.com"
];

const OFFICIAL_DOMAIN_HINTS = {
  audi: [
    "audi.com",
    "audi.sk",
    "audi.de",
    "audi.at"
  ],
  bmw: [
    "bmw.com",
    "bmw.sk",
    "bmw.de",
    "bmw.at"
  ],
  mercedes: [
    "mercedes-benz.com",
    "mercedes-benz.sk",
    "mercedes-benz.de",
    "mercedes-benz.at"
  ],
  porsche: [
    "porsche.com",
    "porsche.sk",
    "porsche.de",
    "porsche.at"
  ],
  volkswagen: [
    "volkswagen.com",
    "volkswagen.sk",
    "volkswagen.de",
    "vw.com",
    "vw.sk"
  ],
  skoda: [
    "skoda-auto.com",
    "skoda-auto.sk",
    "skoda-auto.de",
    "skoda-auto.at"
  ],
  seat: [
    "seat.com",
    "seat.sk",
    "seat.de"
  ],
  cupra: [
    "cupraofficial.com",
    "cupra.com",
    "cupra.sk",
    "cupra.de"
  ],
  volvo: [
    "volvocars.com",
    "volvocars.sk",
    "volvocars.de"
  ],
  lexus: [
    "lexus.com",
    "lexus.sk",
    "lexus.eu"
  ],
  toyota: [
    "toyota.com",
    "toyota.sk",
    "toyota-europe.com"
  ],
  landrover: [
    "landrover.com",
    "landrover.sk"
  ],
  jaguar: [
    "jaguar.com",
    "jaguar.sk"
  ],
  ferrari: [
    "ferrari.com"
  ],
  lamborghini: [
    "lamborghini.com"
  ],
  maserati: [
    "maserati.com"
  ],
  bentley: [
    "bentleymotors.com"
  ],
  astonmartin: [
    "astonmartin.com"
  ],
  mclaren: [
    "cars.mclaren.com",
    "mclaren.com"
  ],
  ford: [
    "ford.com",
    "ford.sk",
    "ford.de"
  ],
  opel: [
    "opel.com",
    "opel.sk",
    "opel.de"
  ],
  peugeot: [
    "peugeot.com",
    "peugeot.sk",
    "peugeot.de"
  ],
  citroen: [
    "citroen.com",
    "citroen.sk",
    "citroen.de"
  ],
  renault: [
    "renault.com",
    "renault.sk",
    "renault.de"
  ],
  nissan: [
    "nissan-global.com",
    "nissan.com",
    "nissan.sk",
    "nissan.de"
  ],
  honda: [
    "honda.com",
    "honda.sk",
    "honda.de"
  ],
  mazda: [
    "mazda.com",
    "mazda.sk",
    "mazda.de"
  ],
  hyundai: [
    "hyundai.com",
    "hyundai.sk",
    "hyundai.de"
  ],
  kia: [
    "kia.com",
    "kia.sk",
    "kia.de"
  ],
  genesis: [
    "genesis.com"
  ],
  tesla: [
    "tesla.com"
  ],
  polestar: [
    "polestar.com"
  ],
  smart: [
    "smart.com"
  ],
  mini: [
    "mini.com",
    "mini.sk",
    "mini.de"
  ],
  fiat: [
    "fiat.com",
    "fiat.sk",
    "fiat.de"
  ],
  alfa: [
    "alfaromeo.com",
    "alfaromeo.sk"
  ],
  jeep: [
    "jeep.com",
    "jeep.sk"
  ],
  dodge: [
    "dodge.com"
  ],
  chrysler: [
    "chrysler.com"
  ],
  ram: [
    "ramtrucks.com"
  ],
  chevrolet: [
    "chevrolet.com"
  ],
  cadillac: [
    "cadillac.com"
  ],
  genesis: [
    "genesis.com"
  ],
  suzuki: [
    "suzuki.com",
    "suzuki.sk"
  ],
  subaru: [
    "subaru.com",
    "subaru.sk"
  ],
  mitsubishi: [
    "mitsubishi-motors.com",
    "mitsubishi-motors.sk"
  ],
  dacia: [
    "dacia.com",
    "dacia.sk"
  ],
  mg: [
    "mgmotor.eu",
    "mgmotor.com"
  ],
  byd