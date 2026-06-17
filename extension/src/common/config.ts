import { ext } from "./browser";

export const DEFAULT_API_URL = "http://localhost:8000/api/v1";
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

export async function getAutoCheck(): Promise<boolean> {
  const result = await ext.storage.local.get(AUTO_CHECK_KEY);
  return result[AUTO_CHECK_KEY] !== false; // default on
}

export async function setAutoCheck(enabled: boolean): Promise<void> {
  await ext.storage.local.set({ [AUTO_CHECK_KEY]: enabled });
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
