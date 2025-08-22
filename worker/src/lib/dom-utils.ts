// dom-utils.ts
// Minimal HTML parsing helpers for Cloudflare Workers using linkedom
// Only import what is needed for scraping

// Use the built-in DOMParser API available in Cloudflare Workers
export function parseDocument(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

// Helper to query selector text content
export function getTextContent(element: Element | null): string {
  return element ? (element.textContent || "").trim() : "";
}

// Helper to query selector attribute
export function getAttr(
  element: Element | null,
  attr: string,
): string | undefined {
  return element ? element.getAttribute(attr) || undefined : undefined;
}
