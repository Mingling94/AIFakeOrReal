// In-page overlay system. Injects small AI-detection badges onto posts as the
// user scrolls through social media feeds. Uses the local scanner (no network)
// and only badges posts scoring above the threshold. Silence = it's fine.

import { ext } from "../common/browser";
import { getAvoidanceMode, type AvoidanceMode } from "../common/config";
import { scanText, type ScanResult } from "./local-scanner";
import { detectPlatform, type Platform } from "./readers";
import { AI_LABEL_THRESHOLD, AVOIDANCE_THRESHOLD, BADGE_THRESHOLD } from "./thresholds";

const BADGE_ATTR = "data-afor-scanned";
const DEBOUNCE_MS = 200;
const MAX_SCAN_BATCH = 20;

// Set once per page from settings; controls hide/blur behavior.
let avoidanceMode: AvoidanceMode = "off";

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
  const isAI = score >= AI_LABEL_THRESHOLD;
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

function styleRevealButton(btn: HTMLButtonElement): void {
  Object.assign(btn.style, {
    background: "rgba(255,255,255,0.18)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.4)",
    borderRadius: "6px",
    padding: "5px 12px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  });
}

// Avoidance: blur or collapse a high-confidence AI post, with a reversible reveal.
function applyAvoidance(post: HTMLElement, score: number, mode: AvoidanceMode): void {
  const pct = Math.round(score * 100);

  if (mode === "hide") {
    const placeholder = document.createElement("div");
    placeholder.setAttribute("data-afor-placeholder", "true");
    Object.assign(placeholder.style, {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "8px 12px",
      margin: "4px 0",
      border: "1px dashed rgba(148,163,184,0.6)",
      borderRadius: "8px",
      fontSize: "12px",
      color: "#64748b",
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    });
    const text = document.createElement("span");
    text.textContent = `🥸 AI-generated content hidden (${pct}%)`;
    const show = document.createElement("button");
    show.textContent = "Show";
    Object.assign(show.style, {
      background: "transparent",
      border: "none",
      color: "#3b82f6",
      cursor: "pointer",
      fontSize: "12px",
      fontWeight: "600",
      padding: "0",
    });
    const prevDisplay = post.style.display;
    show.addEventListener("click", () => {
      post.style.display = prevDisplay;
      placeholder.remove();
    });
    placeholder.append(text, show);
    post.style.display = "none";
    post.parentElement?.insertBefore(placeholder, post);
    return;
  }

  // blur
  if (getComputedStyle(post).position === "static") post.style.position = "relative";
  const cover = document.createElement("div");
  cover.setAttribute("data-afor-cover", "true");
  Object.assign(cover.style, {
    position: "absolute",
    inset: "0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    background: "rgba(15,23,42,0.35)",
    color: "#fff",
    zIndex: "9999",
    borderRadius: "8px",
    textAlign: "center",
    padding: "12px",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  });
  const label = document.createElement("div");
  label.textContent = `🥸 Likely AI-generated (${pct}%)`;
  label.style.fontWeight = "600";
  label.style.fontSize = "13px";
  const show = document.createElement("button");
  show.textContent = "Show anyway";
  styleRevealButton(show);
  show.addEventListener("click", (e) => {
    e.stopPropagation();
    cover.remove();
  });
  cover.append(label, show);
  post.appendChild(cover);
}

function scanPost(post: HTMLElement, config: PlatformConfig): void {
  if (post.hasAttribute(BADGE_ATTR)) return;
  post.setAttribute(BADGE_ATTR, "true");

  const { text, comments } = extractPostText(post, config);
  if (!text && comments.length === 0) return;

  const result = scanText(text, comments);

  // Avoidance takes priority over the badge: if enabled and the post clears the
  // (higher) avoidance bar, blur/hide it instead of just labeling it.
  if (avoidanceMode !== "off" && result.score >= AVOIDANCE_THRESHOLD) {
    applyAvoidance(post, result.score, avoidanceMode);
    return;
  }

  if (result.score >= BADGE_THRESHOLD) {
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

  avoidanceMode = await getAvoidanceMode();

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
