// Per-platform page readers. These run in the content-script (page) context and
// read what the *user* sees — so they work behind login walls and on SPAs that
// a server cannot fetch. Where comments are collapsed, we click to expand them.
//
// DOM selectors for third-party sites are inherently best-effort and may need
// maintenance as those sites change. The DOM-reading core (`extractFromDocument`)
// is a pure function of a Document so it can be unit-tested with jsdom; the only
// non-testable part is the click-to-expand interaction.

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

export function contentTypeFromPath(platform: Platform, path: string): string {
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

// Comment selectors per platform, tried in order. Kept here (not inline) so they
// are easy to find and update when a site changes its markup.
const COMMENT_SELECTORS: Record<Platform, string[]> = {
  reddit: ['shreddit-comment', '[data-testid="comment"]', ".Comment .md", ".usertext-body"],
  instagram: ['ul ul span[dir="auto"]', 'div[role="dialog"] span[dir="auto"]', "article ul li"],
  facebook: ['div[role="article"] div[dir="auto"]', 'div[aria-label*="Comment"]'],
  youtube: ["#content-text", "ytd-comment-renderer #content-text"],
  tiktok: ['[data-e2e="comment-level-1"]', '[data-e2e="comment-text"]'],
  twitter: ['[data-testid="tweetText"]'],
  generic: [],
};

const EXPAND_PATTERNS: Record<Platform, RegExp[]> = {
  reddit: [/view (more|entire) (comments|discussion)/i, /\d+ more repl/i, /more comments/i],
  instagram: [/view all \d+ comments/i, /load more comments/i, /view more comments/i, /view replies/i],
  facebook: [/view more comments/i, /view \d+ (more )?comments/i, /view previous comments/i, /\d+ repl/i],
  youtube: [],
  tiktok: [/view more/i, /view \d+ repl/i],
  twitter: [/show (more )?replies/i],
  generic: [],
};

function clean(text: string | null | undefined): string {
  return (text || "").replace(/\s+/g, " ").trim();
}

function clickByText(doc: Document, patterns: RegExp[]): number {
  let clicks = 0;
  doc
    .querySelectorAll<HTMLElement>(
      'button, a, [role="button"], span[role="button"], div[role="button"]'
    )
    .forEach((el) => {
      const label = clean(el.textContent) + " " + clean(el.getAttribute("aria-label"));
      if (label.trim() && patterns.some((p) => p.test(label))) {
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

async function expandComments(doc: Document, platform: Platform): Promise<void> {
  const pats = EXPAND_PATTERNS[platform] || [];
  if (pats.length === 0) return;
  for (let round = 0; round < 4; round++) {
    if (clickByText(doc, pats) === 0) break;
    await sleep(450);
  }
}

function collectComments(doc: Document, selectors: string[], limit = 200): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const sel of selectors) {
    doc.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      const t = clean(el.textContent);
      if (t.length > 1 && !seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    });
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

function ogDescription(doc: Document): string {
  return clean(
    doc.querySelector('meta[property="og:description"]')?.getAttribute("content")
  );
}

/** Pure extraction from a Document — unit-testable with jsdom. */
export function extractFromDocument(
  doc: Document,
  host: string,
  path: string
): PageContent {
  const platform = detectPlatform(host);
  let title = clean(doc.title);
  let text = "";
  let comments: string[] = [];

  try {
    if (platform === "reddit") {
      title = clean(doc.querySelector("h1")?.textContent) || title;
      text = [
        title,
        clean(
          doc.querySelector('[slot="text-body"], [data-test-id="post-content"]')
            ?.textContent
        ),
        ogDescription(doc),
      ]
        .filter(Boolean)
        .join(" ");
    } else if (platform === "youtube") {
      title = clean(doc.querySelector("h1.title, h1")?.textContent) || title;
      text = [title, ogDescription(doc)].filter(Boolean).join(" ");
    } else if (
      platform === "instagram" ||
      platform === "facebook" ||
      platform === "tiktok" ||
      platform === "twitter"
    ) {
      text = [title, ogDescription(doc)].filter(Boolean).join(" ");
    } else {
      const main = doc.querySelector("main, article") || doc.body;
      text = clean((main as HTMLElement | null)?.textContent).slice(0, 50000);
    }
    comments = collectComments(doc, COMMENT_SELECTORS[platform]);
  } catch {
    text = clean(doc.body?.textContent).slice(0, 50000);
  }

  if (!text) {
    text = clean(doc.body?.textContent).slice(0, 50000);
  }

  return {
    platform,
    content_type: contentTypeFromPath(platform, path),
    title,
    text: text.slice(0, 50000),
    comments: comments.slice(0, 200),
  };
}

/** Full live extraction: expand comments (interaction), then read the DOM. */
export async function extractPage(): Promise<PageContent> {
  const platform = detectPlatform(location.host);
  try {
    await expandComments(document, platform);
  } catch {
    /* continue with whatever rendered */
  }
  return extractFromDocument(document, location.host, location.pathname);
}
