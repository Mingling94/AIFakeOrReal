import { ext } from "./browser";

export const DEFAULT_API_URL = "https://loving-reverence-production.up.railway.app/api/v1";
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
