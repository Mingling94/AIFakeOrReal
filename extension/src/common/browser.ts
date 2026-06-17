// Cross-browser WebExtension API access.
//
// Firefox exposes a promise-based `browser`; Chrome exposes `chrome` (which is
// also promise-based for most APIs under Manifest V3). Preferring `browser`
// when present gives us one promise-based surface that works on both.

type AnyExt = typeof chrome;

const globalAny = globalThis as unknown as {
  browser?: AnyExt;
  chrome?: AnyExt;
};

export const ext: AnyExt = (globalAny.browser ?? globalAny.chrome) as AnyExt;

export const isFirefox = typeof globalAny.browser !== "undefined";
