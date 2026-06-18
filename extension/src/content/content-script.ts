import { ext } from "../common/browser";
import { initOverlays } from "./overlays";
import { extractPage } from "./readers";
import { scanText } from "./local-scanner";

// Initialize in-page overlays (scans posts on supported platforms).
initOverlays().catch(() => {});

// Handle messages from the popup and background service worker.
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

    // Background requests a quick local scan (no comment expansion, no network).
    if (message?.type === "LOCAL_SCAN") {
      (async () => {
        try {
          const content = await extractPage();
          const scan = scanText(content.text, content.comments);
          sendResponse({ ok: true, scan });
        } catch {
          sendResponse({ ok: false });
        }
      })();
      return true;
    }

    return false;
  }
);
