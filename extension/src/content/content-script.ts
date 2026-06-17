function extractPageContent(): { text: string; imageUrls: string[]; title: string } {
  const title = document.title || "";

  const cloned = document.body.cloneNode(true) as HTMLElement;
  const stripSelectors = "script, style, nav, footer, header, aside, noscript, iframe";
  cloned.querySelectorAll(stripSelectors).forEach((el) => el.remove());

  let text = cloned.innerText || cloned.textContent || "";
  text = text.replace(/\s+/g, " ").trim();
  if (text.length > 50000) {
    text = text.substring(0, 50000);
  }

  const imageUrls: string[] = [];
  document.querySelectorAll("img[src]").forEach((img) => {
    const src = img.getAttribute("src");
    if (src && src.startsWith("http")) {
      imageUrls.push(src);
    }
  });

  return { text, imageUrls: imageUrls.slice(0, 20), title };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "EXTRACT_CONTENT") {
    const content = extractPageContent();
    sendResponse(content);
  }
  return true;
});
