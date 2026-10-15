/** Turn a typed code or a scanned sticker into the Bluetooth name. */

const MAC_COLON = /^[0-9A-F]{2}(?::[0-9A-F]{2}){5}$/;
const MAC_PLAIN = /^[0-9A-F]{12}$/;

export function isMacAddress(raw) {
  const text = String(raw || "").trim().toUpperCase();
  const compact = text.replace(/[^0-9A-F]/g, "");
  return MAC_COLON.test(text) || MAC_PLAIN.test(compact);
}

export function printerNameFromCode(raw) {
  let text = String(raw || "").trim();
  if (!text) return "";

  if (/^https?:/i.test(text)) {
    try {
      const url = new URL(text);
      text = url.searchParams.get("name")
        || url.searchParams.get("id")
        || url.searchParams.get("sn")
        || url.pathname.split("/").filter(Boolean).pop()
        || text;
    } catch {
      /* keep the raw text */
    }
  }

  if (isMacAddress(text)) return "";

  const named = text.match(/P1[-_\s]?(\d{6,})/i);
  if (named) return `P1-${named[1]}`;
  return text.replace(/\s+/g, " ").slice(0, 40);
}

/** Web Bluetooth filters are OR. A known P1 code also tries the dashless names some units advertise. */
export function printerFilters(name) {
  const text = String(name || "").trim();
  if (!text) return [{ namePrefix: "P1" }];
  const filters = [{ name: text }];
  const match = text.match(/^P1-(\d{6,})$/);
  if (match) {
    filters.push({ name: `P1${match[1]}` });
    filters.push({ name: `P1_${match[1]}` });
  }
  return filters;
}
