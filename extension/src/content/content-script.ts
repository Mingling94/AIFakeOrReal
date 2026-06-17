import { ext } from "../common/browser";
import { initOverlays } from "./overlays";
import { extractPage } from "./readers";

// Respond to the popup's request to read the current page (expanding comments
// where needed). Async work is supported by returning `true` to keep the
// message channel open until sendResponse is called.
// Initialize in-page overlays (scans posts on supported platforms).
initOverlays().catch(() => {});

// Respond to the popup's request to read the current page.
ext.runtime.onMessage.addListener(
  (
    message: { type?: string },
    _sender: unknown,
    sendResponse: (response: unknown) => void
  ): boolean => {
    if (message?.type === "EXTRACT_CONTENT") {
      extractPage()
        .then((content) => sendResponse({ ok: true, content }))
        .catch((err) =>
          sendResponse({ ok: false, error: String(err?.message || err) })
        );
      return true;
    }
    return false;
  }
);
