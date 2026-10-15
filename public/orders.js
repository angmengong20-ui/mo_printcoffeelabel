/** Read a cafe order the way people write it. No percent, size, or price is invented. */

const LINE_NO = /^\s*\d+\s*[.):\-]\s*/;
const SIZE_RE = /\bsize\s*(small|medium|large|[sml])\b/i;
const NAME_RE = /[(（]([^)）]+)[)）]/;
const PCT_RE = /(\d+)\s*%/;
const HEADER_RE = /\b(order|orders|tomorrow|please)\b/i;

const SIZE_WORDS = {
  s: "S",
  m: "M",
  l: "L",
  small: "S",
  medium: "M",
  large: "L",
};

export const MAX_LABELS = 40;

function squash(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function trimDrink(value) {
  return squash(value).replace(/^[\s\-–—,.:]+|[\s\-–—,.:]+$/g, "");
}

export function normalizeSize(value) {
  if (value == null || value === "") return "";
  return SIZE_WORDS[String(value).trim().toLowerCase()] || "";
}

export function normalizePct(value) {
  if (value == null || value === "") return "";
  const match = String(value).match(/(\d+)/);
  if (!match) return "";
  return `${Number(match[1])}%`;
}

export function cleanOrder(raw) {
  const source = raw || {};
  return {
    drink: trimDrink(source.drink),
    pct: normalizePct(source.pct),
    who: squash(source.who).slice(0, 40),
    size: normalizeSize(source.size),
  };
}

export function parseLine(raw) {
  let line = String(raw ?? "").trim();
  if (!line) return null;
  line = line.replace(LINE_NO, "").trim();
  if (!line) return null;

  let size = "";
  const sizeMatch = line.match(SIZE_RE);
  if (sizeMatch) {
    size = normalizeSize(sizeMatch[1]);
    line = line.replace(SIZE_RE, " ");
  }

  let who = "";
  const nameMatch = line.match(NAME_RE);
  if (nameMatch) {
    who = nameMatch[1].trim();
    line = line.replace(NAME_RE, " ");
  }

  let pct = "";
  const pctMatch = line.match(PCT_RE);
  if (pctMatch) {
    pct = `${Number(pctMatch[1])}%`;
    line = line.replace(PCT_RE, " ");
  }

  const drink = trimDrink(line);
  if (HEADER_RE.test(drink) && !who && !pct) return null;
  if (!drink) return null;
  return cleanOrder({ drink, pct, who, size });
}

export function parseOrders(text) {
  const orders = [];
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const item = parseLine(raw);
    if (item) orders.push(item);
  }
  return orders;
}

/** Keep a printable batch. Extra lines are counted so the page can say they were left out. */
export function takeLabels(orders) {
  const list = (orders || []).map(cleanOrder).filter((order) => order.drink);
  return {
    orders: list.slice(0, MAX_LABELS),
    omitted: Math.max(0, list.length - MAX_LABELS),
  };
}
