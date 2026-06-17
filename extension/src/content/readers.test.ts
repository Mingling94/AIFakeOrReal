import { describe, expect, it } from "vitest";
import {
  contentTypeFromPath,
  detectPlatform,
  extractFromDocument,
} from "./readers";

function doc(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("detectPlatform", () => {
  it.each([
    ["www.instagram.com", "instagram"],
    ["instagram.com", "instagram"],
    ["www.facebook.com", "facebook"],
    ["fb.watch", "facebook"],
    ["www.reddit.com", "reddit"],
    ["old.reddit.com", "reddit"],
    ["youtu.be", "youtube"],
    ["www.tiktok.com", "tiktok"],
    ["x.com", "twitter"],
    ["twitter.com", "twitter"],
    ["example.com", "generic"],
  ])("maps %s -> %s", (host, expected) => {
    expect(detectPlatform(host)).toBe(expected);
  });
});

describe("contentTypeFromPath", () => {
  it("instagram reel", () => {
    expect(contentTypeFromPath("instagram", "/reel/abc/")).toBe("reel");
  });
  it("instagram story", () => {
    expect(contentTypeFromPath("instagram", "/stories/u/1/")).toBe("story");
  });
  it("facebook video", () => {
    expect(contentTypeFromPath("facebook", "/u/videos/123")).toBe("video");
  });
  it("youtube is video", () => {
    expect(contentTypeFromPath("youtube", "/watch")).toBe("video");
  });
  it("generic unknown", () => {
    expect(contentTypeFromPath("generic", "/news/article")).toBe("unknown");
  });
});

describe("extractFromDocument", () => {
  it("reads a Reddit post title and comments", () => {
    const d = doc(`
      <html><head><title>reddit</title></head><body>
        <h1>Beautiful sunset I painted</h1>
        <shreddit-comment>this is clearly AI generated</shreddit-comment>
        <shreddit-comment>nice work, love the colors</shreddit-comment>
      </body></html>`);
    const out = extractFromDocument(d, "www.reddit.com", "/r/art/comments/a/t/");
    expect(out.platform).toBe("reddit");
    expect(out.title).toContain("Beautiful sunset");
    expect(out.comments).toContain("this is clearly AI generated");
    expect(out.comments.length).toBe(2);
  });

  it("reads Instagram caption from og:description and comments", () => {
    const d = doc(`
      <html><head><title>Login • Instagram</title>
        <meta property="og:description" content="A calm evening by the sea" />
      </head><body>
        <div role="dialog">
          <ul><ul><span dir="auto">obvious AI slop</span></ul></ul>
        </div>
      </body></html>`);
    const out = extractFromDocument(d, "www.instagram.com", "/p/abc/");
    expect(out.platform).toBe("instagram");
    expect(out.content_type).toBe("post");
    expect(out.text).toContain("calm evening by the sea");
    expect(out.comments).toContain("obvious AI slop");
  });

  it("falls back to main text for generic pages", () => {
    const d = doc(`
      <html><head><title>News</title></head><body>
        <main><p>A human-written article about local events.</p></main>
      </body></html>`);
    const out = extractFromDocument(d, "example.com", "/news/x");
    expect(out.platform).toBe("generic");
    expect(out.text).toContain("human-written article");
    expect(out.comments).toEqual([]);
  });

  it("never throws on an empty document", () => {
    const out = extractFromDocument(doc("<html></html>"), "example.com", "/");
    expect(out.platform).toBe("generic");
    expect(Array.isArray(out.comments)).toBe(true);
  });
});
