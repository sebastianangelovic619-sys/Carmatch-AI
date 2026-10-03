// ============================================================
// ENVIRONMENT
// ============================================================

const GROQ_API_KEY =
  process.env.GROQ_API_KEY || "";

const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY || "";

// ============================================================
// SUPABASE
// ============================================================
// DÔLEŽITÉ:
// Používame správny projekt:
// frmhjjzgvmitdgcvgfuk
// ============================================================

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://frmhjjzgvmitdgcvgfuk.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_53FDnkTuv2C6rhZIVDJVxQ_MOAg_80E";