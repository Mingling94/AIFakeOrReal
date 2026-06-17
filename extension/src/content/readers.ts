// Per-platform page readers. These run in the content-script (page) context and
// read what the *user* sees — so they work behind login walls and on SPAs that
// a server cannot fetch. Where comments are collapsed, we click to expand them.
//
// DOM selectors for third-party sites are inherently best-effort and may need
// maintenance as those sites change. Every step is wrapped so extraction never
// throws — it degrades to whatever text is available.

export type Platform =
  | "reddit"
  | "instagram"
  | "facebook"
  | "youtube"
  | "tiktok"
  | "twitter"
  | "generic";

export interface PageContent {
  platform: Platform;
  content_type: string;
  title: string;
  text: string;
  comments: string[];
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function detectPlatform(host: string): Platform {
  const h = host.toLowerCase().replace(/^www\./, "");
  if (h === "instagram.com" || h.endsWith(".instagram.com")) return "instagram";
  if (h === "facebook.com" || h === "fb.com" || h === "fb.watch" || h.endsWith(".facebook.com"))
    return "facebook";
  if (h === "reddit.com" || h === "redd.it" || h.endsWith(".reddit.com")) return "reddit";
  if (h === "youtube.com" || h === "youtu.be" || h.endsWith(".youtube.com")) return "youtube";
  if (h === "tiktok.com" || h.endsWith(".tiktok.com")) return "tiktok";
  if (h === "x.com" || h === "twitter.com" || h.endsWith(".x.com") || h.endsWith(".twitter.com"))
    return "twitter";
  return "generic";
}

function clean(text: string | null | undefined): string {
  return (text || "").replace(/\s+/g, " ").trim();
}

// Click clickable elements whose visible text matches any pattern. Returns the
// number of elements clicked.
function clickByText(patterns: RegExp[]): number {
  let clicks = 0;
  const candidates = document.querySelectorAll<HTMLElement>(
    'button, a, [role="button"], span[role="button"], div[role="button"]'
  );
  candidates.forEach((el) => {
    const label = clean(el.textContent) + " " + clean(el.getAttribute("aria-label"));
    if (label && patterns.some((p) => p.test(label))) {
      try {
        el.click();
        clicks++;
      } catch {
        /* ignore */
      }
    }
  });
  return clicks;
}

async function expandComments(platform: Platform): Promise<void> {
  const patterns: Record<string, RegExp[]> = {
    reddit: [/view (more|entire) (comments|discussion)/i, /\d+ more repl/i, /more comments/i],
    instagram: [/view all \d+ comments/i, /load more comments/i, /view more comments/i, /view replies/i],
    facebook: [/view more comments/i, /view \d+ (more )?comments/i, /view previous comments/i, /\d+ repl/i],
    youtube: [/comments/i],
    tiktok: [/view more/i],
    twitter: [/show (more )?replies/i],
    generic: [],
  };
  const pats = patterns[platform] || [];
  if (pats.length === 0) return;

  // A few rounds: click expanders, let content render, repeat.
  for (let round = 0; round < 4; round++) {
    const clicked = clickByText(pats);
    if (clicked === 0) break;
    await sleep(450);
  }
}

function collectComments(selectors: string[], limit = 200): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const sel of selectors) {
    document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      const t = clean(el.innerText || el.textContent);
      if (t && t.length > 1 && !seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    });
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

function ogDescription(): string {
  const el = document.querySelector('meta[property="og:description"]');
  return clean(el?.getAttribute("content"));
}

function contentTypeFromPath(platform: Platform, path: string): string {
  if (platform === "instagram") {
    if (path.includes("/reel")) return "reel";
    if (path.includes("/stories/")) return "story";
    if (path.includes("/tv/")) return "video";
    return "post";
  }
  if (platform === "facebook") {
    if (path.includes("/videos/") || path.includes("/watch")) return "video";
    if (path.includes("/photo")) return "image";
    if (path.includes("/reel")) return "reel";
    return "post";
  }
  if (platform === "youtube" || platform === "tiktok") return "video";
  return "unknown";
}

export async function extractPage(): Promise<PageContent> {
  const platform = detectPlatform(location.host);
  const path = location.pathname;

  try {
    await expandComments(platform);
  } catch {
    /* extraction continues with whatever rendered */
  }

  let title = clean(document.title);
  let text = "";
  let comments: string[] = [];

  try {
    if (platform === "reddit") {
      title =
        clean(document.querySelector("h1")?.textContent) || title;
      text = [
        title,
        clean(document.querySelector('[slot="text-body"], [data-test-id="post-content"]')?.textContent),
        ogDescription(),
      ]
        .filter(Boolean)
        .join(" ");
      comments = collectComments([
        "shreddit-comment",
        '[data-testid="comment"]',
        ".Comment .md",
        ".usertext-body",
      ]);
    } else if (platform === "instagram") {
      text = [title, ogDescription()].filter(Boolean).join(" ");
      comments = collectComments([
        'ul ul span[dir="auto"]',
        'div[role="dialog"] span[dir="auto"]',
        "article ul li",
      ]);
    } else if (platform === "facebook") {
      text = [title, ogDescription()].filter(Boolean).join(" ");
      comments = collectComments([
        'div[role="article"] div[dir="auto"]',
        'div[aria-label*="Comment"]',
      ]);
    } else if (platform === "youtube") {
      title = clean(document.querySelector("h1.title, h1")?.textContent) || title;
      text = [title, ogDescription()].filter(Boolean).join(" ");
      comments = collectComments(["#content-text", "ytd-comment-renderer #content-text"]);
    } else {
      // generic / twitter / tiktok fallback: visible page text
      const main = document.querySelector("main, article") || document.body;
      text = clean((main as HTMLElement)?.innerText).slice(0, 50000);
    }
  } catch {
    text = clean(document.body?.innerText).slice(0, 50000);
  }

  if (!text) {
    text = clean(document.body?.innerText).slice(0, 50000);
  }

  return {
    platform,
    content_type: contentTypeFromPath(platform, path),
    title,
    text: text.slice(0, 50000),
    comments: comments.slice(0, 200),
  };
}
