/** Orders packed into a link, so one computer can read and another can print. */

import { cleanOrder } from "./orders.js";

export function ordersFromHash(hash) {
  const raw = String(hash || "");
  if (raw.startsWith("#o=")) {
    const text = decodeURIComponent(raw.slice(3));
    return text.split(/\r?\n/).map(unpackLine).filter(Boolean);
  }
  if (raw.startsWith("#j=")) {
    try {
      const parsed = JSON.parse(decodeURIComponent(raw.slice(3)));
      return Array.isArray(parsed) ? parsed.map(cleanOrder).filter((order) => order.drink) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function unpackLine(line) {
  if (!line.trim()) return null;
  const [drink, pct, who, size] = line.split("|");
  return cleanOrder({ drink, pct, who, size });
}

export function cafeFromSearch(search) {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  return String(params.get("cafe") || "").replace(/\s+/g, " ").trim().slice(0, 40);
}

export function hashForOrders(orders) {
  const body = (orders || []).map(cleanOrder).filter((order) => order.drink);
  return `#j=${encodeURIComponent(JSON.stringify(body))}`;
}

/** Build a link on whatever origin is hosting the page. The printer stays on that browser. */
export function pageLink(href, orders, cafe) {
  const url = new URL(href, "https://labels.invalid");
  url.search = "";
  url.hash = "";
  const name = String(cafe || "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (name) url.searchParams.set("cafe", name);
  return `${url.origin}${url.pathname}${url.search}${hashForOrders(orders)}`;
}
