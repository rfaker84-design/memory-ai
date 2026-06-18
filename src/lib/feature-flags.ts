/* =========================================================================
   忆见 MemoryAI — Feature Flags
   Production Safe · Control experimental modules at runtime
   ========================================================================= */

export const FEATURES = {
  /* ── Production Core (always ON) ─────────────────────── */
  productionMode:   true,
  homePage:         true,
  chatPage:         true,
  memoriesPage:     true,
  profilePage:      true,
  mobileAppShell:   true,

  /* ── Stable AI (production-safe) ─────────────────────── */
  openAIChat:       true,    // POST /api/memory-chat
  supabaseMemories: true,    // GET /api/memories-mvp

  /* ── Experimental Modules (OFF in production) ─────────── */
  emotionEngine:    false,
  emotionAdvanced:  false,   // /api/emotion/*
  consciousness:    false,   // /app/consciousness/*
  ontology:         false,   // /app/ontology/*
  multiUniverse:    false,   // /app/memory-universe/*
  ecosystem:        false,   // /api/memory-ecosystem/*
  infinite:         false,   // /app/infinite/*
  digitalHuman:     false,   // realtime avatar/voice
  realtimeChat:     false,   // WebSocket chat
  viral:            false,   // /api/viral/*
  revenue:          false,   // /api/revenue/*
  analytics:        false,   // /api/analytics/*
  adminPanels:      false,   // /app/admin/*

  /* ── Future (OFF until stable) ───────────────────────── */
  voiceClone:       false,
  avatarGeneration: false,
  ttsStreaming:     false,
} as const;

/* ── Helper ──────────────────────────────────────────────── */
export function isEnabled(key: keyof typeof FEATURES): boolean {
  return FEATURES[key] === true;
}

export function isProduction(): boolean {
  return FEATURES.productionMode === true;
}

/* ── Production-safe module allowlist ────────────────────── */
export const PRODUCTION_PAGES = [
  "/",              // homepage
  "/chat",          // chat
  "/memories",      // memories
  "/profile",       // profile
  "/create-memory", // create memory
  "/login",         // login
  "/signup",        // signup
  "/landing",       // landing/onboarding
  "/about",         // about
  "/privacy",       // privacy
  "/terms",         // terms
  "/app-store-preview", // App Store preview
] as const;

export const PRODUCTION_APIS = [
  "/api/memories-mvp",
  "/api/memory-chat",
  "/api/chat-mvp",
  "/api/send-code",
  "/api/verify-code",
  "/api/health",
  "/api/upload",
  "/api/memories",
] as const;
