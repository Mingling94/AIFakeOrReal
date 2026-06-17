// In-page overlay system. Injects small AI-detection badges onto posts as the
// user scrolls through social media feeds. Uses the local scanner (no network)
// and only badges posts scoring above the threshold. Silence = it's fine.

import { ext } from "../common/browser";
import { scanText, type ScanResult } from "./local-scanner";
import { detectPlatform, type Platform } from "./readers";

const BADGE_ATTR = "data-afor-scanned";
const THRESHOLD = 0.5;
const DEBOUNCE_MS = 200;
const MAX_SCAN_BATCH = 20;

// Per-platform config: how to find posts, extract text, and where to inject badges.
interface PlatformConfig {
  postSelector: string;
  textSelector: string;
  commentSelectors: string[];
  badgePosition: "after-title" | "corner" | "after-meta" | "floating";
}

const CONFIGS: Record<Platform, PlatformConfig | null> = {
  reddit: {
    postSelector: 'shreddit-post, [data-testid="post-container"], .Post',
    textSelector: 'h3, [slot="title"], a[slot="full-post-link"]',
    commentSelectors: ['shreddit-comment', '[data-testid="comment"]'],
    badgePosition: "after-title",
  },
  instagram: {
    postSelector: "article",
    textSelector: 'span[dir="auto"]',
    commentSelectors: ['ul ul span[dir="auto"]'],
    badgePosition: "corner",
  },
  youtube: {
    postSelector: "ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer",
    textSelector: "#video-title",
    commentSelectors: [],
    badgePosition: "after-title",
  },
  facebook: {
    postSelector: 'div[role="article"]',
    textSelector: 'div[dir="auto"]',
    commentSelectors: [],
    badgePosition: "after-meta",
  },
  twitter: {
    postSelector: 'article[data-testid="tweet"]',
    textSelector: '[data-testid="tweetText"]',
    commentSelectors: [],
    badgePosition: "after-meta",
  },
  tiktok: {
    postSelector: '[data-e2e="recommend-list-item-container"]',
    textSelector: '[data-e2e="browse-video-desc"]',
    commentSelectors: [],
    badgePosition: "corner",
  },
  generic: null,
};

function isDarkMode(): boolean {
  if (window.matchMedia("(prefers-color-scheme: dark)").matches) return true;
  const html = document.documentElement;
  if (html.hasAttribute("dark") || html.classList.contains("dark")) return true;
  const bg = getComputedStyle(document.body).backgroundColor;
  if (bg) {
    const match = bg.match(/\d+/g);
    if (match && match.length >= 3) {
      const [r, g, b] = match.map(Number);
      return (r + g + b) / 3 < 128;
    }
  }
  return false;
}

function createBadge(score: number, result: ScanResult): HTMLElement {
  const badge = document.createElement("span");
  badge.className = "afor-badge";
  badge.setAttribute("data-afor-badge", "true");

  const pct = Math.round(score * 100);
  const isAI = score > 0.7;
  const color = isAI ? "#ef4444" : "#f59e0b";
  const bgColor = isAI ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)";
  const dark = isDarkMode();

  badge.textContent = isAI ? `AI ${pct}%` : `AI? ${pct}%`;
  badge.title = "AI Fake Or Real: Click for details";

  Object.assign(badge.style, {
    display: "inline-flex",
    alignItems: "center",
    gap: "3px",
    padding: "2px 8px",
    borderRadius: "10px",
    fontSize: "11px",
    fontWeight: "600",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: dark ? color : color,
    backgroundColor: dark ? "rgba(0,0,0,0.3)" : bgColor,
    border: `1px solid ${color}40`,
    cursor: "pointer",
    marginLeft: "6px",
    verticalAlign: "middle",
    lineHeight: "1",
    whiteSpace: "nowrap",
    zIndex: "999",
    transition: "opacity 0.3s",
  });

  // Dismiss × on hover
  badge.addEventListener("mouseenter", () => {
    if (!badge.querySelector(".afor-dismiss")) {
      const x = document.createElement("span");
      x.className = "afor-dismiss";
      x.textContent = " ×";
      x.style.cursor = "pointer";
      x.style.opacity = "0.6";
      x.addEventListener("click", (e) => {
        e.stopPropagation();
        badge.remove();
      });
      badge.appendChild(x);
    }
  });

  // Click → tell service worker to highlight this URL in popup
  badge.addEventListener("click", () => {
    ext.runtime.sendMessage({ type: "BADGE_CLICKED", url: window.location.href });
  });

  return badge;
}

function extractPostText(post: HTMLElement, config: PlatformConfig): { text: string; comments: string[] } {
  const textEl = post.querySelector(config.textSelector);
  const text = (textEl?.textContent || "").replace(/\s+/g, " ").trim();

  const comments: string[] = [];
  for (const sel of config.commentSelectors) {
    post.querySelectorAll(sel).forEach((el) => {
      const t = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (t.length > 2) comments.push(t);
    });
    if (comments.length >= 50) break;
  }

  return { text, comments: comments.slice(0, 50) };
}

function injectBadge(post: HTMLElement, badge: HTMLElement, config: PlatformConfig): void {
  switch (config.badgePosition) {
    case "after-title": {
      const title = post.querySelector(config.textSelector);
      if (title) {
        title.parentElement?.insertBefore(badge, title.nextSibling);
      } else {
        post.prepend(badge);
      }
      break;
    }
    case "corner": {
      badge.style.position = "absolute";
      badge.style.top = "8px";
      badge.style.right = "8px";
      const container = post.querySelector("img, video")?.parentElement || post;
      if (getComputedStyle(container).position === "static") {
        (container as HTMLElement).style.position = "relative";
      }
      container.appendChild(badge);
      break;
    }
    case "after-meta":
    default: {
      post.prepend(badge);
      break;
    }
  }
}

function scanPost(post: HTMLElement, config: PlatformConfig): void {
  if (post.hasAttribute(BADGE_ATTR)) return;
  post.setAttribute(BADGE_ATTR, "true");

  const { text, comments } = extractPostText(post, config);
  if (!text && comments.length === 0) return;

  const result = scanText(text, comments);
  if (result.score >= THRESHOLD) {
    const badge = createBadge(result.score, result);
    injectBadge(post, badge, config);
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function scanVisiblePosts(config: PlatformConfig): void {
  const posts = document.querySelectorAll<HTMLElement>(config.postSelector);
  let scanned = 0;
  posts.forEach((post) => {
    if (scanned >= MAX_SCAN_BATCH) return;
    if (post.hasAttribute(BADGE_ATTR)) return;
    scanPost(post, config);
    scanned++;
  });
}

function debouncedScan(config: PlatformConfig): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => scanVisiblePosts(config), DEBOUNCE_MS);
}

export async function initOverlays(): Promise<void> {
  // Check if overlays are enabled
  const result = await ext.storage.local.get("overlaysEnabled");
  if (result.overlaysEnabled === false) return;

  const platform = detectPlatform(location.host);
  const config = CONFIGS[platform];
  if (!config) return; // generic pages: no auto-overlay

  // Initial scan
  scanVisiblePosts(config);

  // Watch for new posts (infinite scroll)
  const observer = new MutationObserver(() => debouncedScan(config));
  observer.observe(document.body, { childList: true, subtree: true });

  // Re-scan on scroll
  window.addEventListener("scroll", () => debouncedScan(config), { passive: true });
}
