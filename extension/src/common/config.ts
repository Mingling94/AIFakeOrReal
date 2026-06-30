import { ext } from "./browser";

export const DEFAULT_API_URL = "https://aifakeorreal.fly.dev/api/v1";
const API_URL_KEY = "apiUrl";
const AUTO_CHECK_KEY = "autoCheck";
const TOKEN_KEY = "token";

export async function getApiUrl(): Promise<string> {
  const result = await ext.storage.local.get(API_URL_KEY);
  return (result[API_URL_KEY] as string) || DEFAULT_API_URL;
}

export async function setApiUrl(url: string): Promise<void> {
  await ext.storage.local.set({ [API_URL_KEY]: url });
}

/**
 * Ensure the extension may call the given API origin. Localhost is already in
 * host_permissions; any other origin is requested at runtime from
 * optional_host_permissions (must be triggered by a user gesture). Returns true
 * if the origin is granted (or no permission API is available).
 */
export async function ensureApiPermission(url: string): Promise<boolean> {
  const perms = ext.permissions;
  if (!perms) return true;
  let origin: string;
  try {
    origin = new URL(url).origin + "/*";
  } catch {
    return false;
  }
  try {
    if (await perms.contains({ origins: [origin] })) return true;
    return await perms.request({ origins: [origin] });
  } catch {
    return false;
  }
}

export async function getAutoCheck(): Promise<boolean> {
  const result = await ext.storage.local.get(AUTO_CHECK_KEY);
  return result[AUTO_CHECK_KEY] !== false; // default on
}

export async function setAutoCheck(enabled: boolean): Promise<void> {
  await ext.storage.local.set({ [AUTO_CHECK_KEY]: enabled });
}

const OVERLAYS_KEY = "overlaysEnabled";

export async function getOverlaysEnabled(): Promise<boolean> {
  const result = await ext.storage.local.get(OVERLAYS_KEY);
  return result[OVERLAYS_KEY] !== false; // on by default
}

export async function setOverlaysEnabled(enabled: boolean): Promise<void> {
  await ext.storage.local.set({ [OVERLAYS_KEY]: enabled });
}

// --- Bring-your-own LLM keys (BYOK) ---
//
// Optional: users can supply their own provider API keys so detection runs on
// their own free-tier / paid quota instead of the shared server keys. Keys are
// stored locally and sent to the configured API server only to make the call;
// the server uses them transiently and never stores them.

const LLM_KEYS_KEY = "llmKeys";
const LLM_PREFERRED_KEY = "llmPreferred";

/** Field names mirror the server's ProviderKeys. */
export interface LlmKeys {
  gemini?: string;
  groq?: string;
  openai?: string;
  anthropic?: string;
  mistral?: string;
  cohere?: string;
  together?: string;
  cloudflareAccountId?: string;
  cloudflareApiToken?: string;
}

export async function getLlmKeys(): Promise<LlmKeys> {
  const result = await ext.storage.local.get(LLM_KEYS_KEY);
  return (result[LLM_KEYS_KEY] as LlmKeys) || {};
}

export async function setLlmKeys(keys: LlmKeys): Promise<void> {
  await ext.storage.local.set({ [LLM_KEYS_KEY]: keys });
}

/** Provider names to try first, in order. Empty means server default order. */
export async function getLlmPreferred(): Promise<string[]> {
  const result = await ext.storage.local.get(LLM_PREFERRED_KEY);
  return (result[LLM_PREFERRED_KEY] as string[]) || [];
}

export async function setLlmPreferred(order: string[]): Promise<void> {
  await ext.storage.local.set({ [LLM_PREFERRED_KEY]: order });
}

// --- Avoidance mode (hide/blur AI content, the "ad blocker" behavior) ---
//
// off  — just badge AI posts (default)
// blur — blur high-confidence AI posts with a "Show anyway" reveal
// hide — collapse high-confidence AI posts to a small placeholder with a reveal

export type AvoidanceMode = "off" | "blur" | "hide";
const AVOIDANCE_MODE_KEY = "avoidanceMode";

export async function getAvoidanceMode(): Promise<AvoidanceMode> {
  const result = await ext.storage.local.get(AVOIDANCE_MODE_KEY);
  const mode = result[AVOIDANCE_MODE_KEY] as AvoidanceMode | undefined;
  return mode === "blur" || mode === "hide" ? mode : "off";
}

export async function setAvoidanceMode(mode: AvoidanceMode): Promise<void> {
  await ext.storage.local.set({ [AVOIDANCE_MODE_KEY]: mode });
}

export async function getToken(): Promise<string | null> {
  const result = await ext.storage.local.get(TOKEN_KEY);
  return (result[TOKEN_KEY] as string) || null;
}

export async function setToken(token: string | null): Promise<void> {
  if (token) {
    await ext.storage.local.set({ [TOKEN_KEY]: token });
  } else {
    await ext.storage.local.remove(TOKEN_KEY);
  }
}
