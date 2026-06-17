// Generate a shareable verdict card as a PNG using the Canvas API.
// The card is designed to look good when shared on social media (1200x630).

export function generateShareCard(
  verdict: string,
  pct: number | null,
  domain: string
): Promise<Blob> {
  const W = 1200;
  const H = 630;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Background: verdict color
  const colors: Record<string, string> = {
    human: "#22c55e",
    mixed: "#f59e0b",
    ai: "#ef4444",
    unknown: "#94a3b8",
  };
  const verdictKey =
    pct === null ? "unknown" : pct <= 30 ? "human" : pct <= 70 ? "mixed" : "ai";
  ctx.fillStyle = colors[verdictKey];
  ctx.fillRect(0, 0, W, H);

  // Slight gradient overlay for depth
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.15)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";

  // Verdict word
  ctx.fillStyle = "white";
  ctx.font = "bold 72px -apple-system, BlinkMacSystemFont, sans-serif";
  const verdictWord =
    pct === null
      ? "NOT CHECKED"
      : pct <= 30
        ? "HUMAN"
        : pct <= 70
          ? "UNCLEAR"
          : "AI GENERATED";
  ctx.fillText(verdictWord, W / 2, 260);

  // Percentage
  if (pct !== null) {
    ctx.font = "36px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.globalAlpha = 0.85;
    ctx.fillText(`${pct}% AI probability`, W / 2, 320);
    ctx.globalAlpha = 1;
  }

  // Domain
  ctx.font = "24px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.globalAlpha = 0.6;
  ctx.fillText(domain, W / 2, 380);
  ctx.globalAlpha = 1;

  // Branding
  ctx.font = "bold 20px -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.globalAlpha = 0.7;
  ctx.fillText("Checked with AI Fake Or Real", W / 2, H - 40);
  ctx.globalAlpha = 1;

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), "image/png");
  });
}

export async function shareVerdict(
  verdict: string,
  pct: number | null,
  domain: string,
  url: string
): Promise<void> {
  const blob = await generateShareCard(verdict, pct, domain);

  // Try native share API first (works on mobile + some desktop browsers)
  if (navigator.share && navigator.canShare) {
    const file = new File([blob], "ai-check.png", { type: "image/png" });
    const shareData = {
      text: `${verdict} — ${pct ?? "?"}% AI probability. Checked with AI Fake Or Real.`,
      url,
      files: [file],
    };
    if (navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // User cancelled or share failed — fall through to clipboard
      }
    }
  }

  // Fallback: copy URL + verdict to clipboard
  const text = `${verdict} (${pct ?? "?"}% AI) — ${url}\nChecked with AI Fake Or Real`;
  await navigator.clipboard.writeText(text);
}
