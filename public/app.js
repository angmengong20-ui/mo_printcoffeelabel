import { cafeFromSearch, ordersFromHash, pageLink } from "./link.js";
import { fontsReady, renderLabel } from "./label.js";
import { MAX_LABELS, parseOrders, takeLabels } from "./orders.js";
import { MENU, SUGAR_LEVELS, menuName } from "./menu.js";
import { bitsFromCanvas, labelsPdf } from "./pdf.js";
import { printerFilters } from "./printer-code.js";
import { bluetoothAvailable, printCanvases, printErrorMessage, requestPrinter } from "./protocol.js";

const CAFE_KEY = "mo-print-cafe";
const PRINTER_KEY = "mo-print-printer";
const NO_BLUETOOTH = "This browser can't reach the printer over Bluetooth (iPhone and Safari can't). Use Save PDF and print it from the printer's app, or open this page in Chrome on Android or a computer.";
const SIZES = [["", "–"], ["S", "S"], ["M", "M"], ["L", "L"]];
const OTHER = "__other";
const ON_MENU = new Set(MENU.flatMap(([, drinks]) => drinks));

const statusEl = document.querySelector("#status");
const progressEl = document.querySelector("#progress");
const progressBar = document.querySelector("#progress-bar");
const listEl = document.querySelector("#list");
const listCount = document.querySelector("#list-count");
const clearLabelsBtn = document.querySelector("#clear-labels");
const cafeEl = document.querySelector("#cafe");
const orderEl = document.querySelector("#order");
const printBtn = document.querySelector("#print");
const copyBtn = document.querySelector("#copy");
const pdfBtn = document.querySelector("#pdf");
const connectBtn = document.querySelector("#connect");
const forgetBtn = document.querySelector("#forget");
const printerNameEl = document.querySelector("#printer-name");
const printerDetail = document.querySelector("#printer-detail");
const printerBox = document.querySelector("#printer-box");
const setupEl = document.querySelector("#setup");
const setupNote = document.querySelector("#setup-note");
const chip = document.querySelector("#printer-chip");
const chipText = document.querySelector("#printer-chip-text");
let held = null;
let savedName = localStorage.getItem(PRINTER_KEY) || localStorage.getItem("hamster-printer-name") || "";
let printing = false;
let rowId = 0;

cafeEl.value = cafeFromSearch(location.search) || localStorage.getItem(CAFE_KEY) || "";
setupEl.open = !cafeEl.value || !savedName;

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
document.querySelector("#read kbd").textContent = isMac ? "⌘↵" : "Ctrl↵";

/** tone: true or "err" for a problem, "ok" for done, "busy" while working. */
function setStatus(text, tone) {
  const kind = tone === true ? "err" : tone || "";
  statusEl.className = kind ? `status ${kind}` : "status";
  statusEl.setAttribute("role", kind === "err" ? "alert" : "status");
  statusEl.textContent = text;
}

function setProgress(done, total) {
  progressEl.hidden = !total;
  progressBar.style.width = total ? `${Math.round((done / total) * 100)}%` : "0";
}

function updateSetup() {
  const cafe = cafeEl.value.trim();
  const name = held?.name || savedName;
  const ready = Boolean(held);
  setupNote.textContent = `${cafe || "No cafe name"} · ${name || "no printer yet"}`;
  chip.classList.toggle("set", Boolean(name));
  chip.classList.toggle("live", ready);
  chipText.textContent = ready ? `${name || "Printer"} · ready` : name || "Not connected";
  printerBox.classList.toggle("ready", ready);
  printerNameEl.textContent = name || "Not connected";
  printerDetail.textContent = ready
    ? "Ready. Print sends straight to this printer."
    : name
      ? "Saved. Print will ask to reconnect once."
      : bluetoothAvailable()
        ? "Turn the printer on, then connect it once."
        : "This browser can't connect. Use Save PDF instead.";
  connectBtn.textContent = name ? "Change printer" : "Connect printer";
  connectBtn.disabled = !bluetoothAvailable();
  forgetBtn.hidden = !name;
}

function saveCafe() {
  const cafe = cafeEl.value.replace(/\s+/g, " ").trim().slice(0, 40);
  localStorage.setItem(CAFE_KEY, cafe);
  document.title = cafe ? `${cafe} · labels` : "Print coffee labels";
  updateSetup();
  return cafe;
}

function keepPrinter(device) {
  held = device;
  if (device?.name) {
    savedName = device.name;
    localStorage.setItem(PRINTER_KEY, savedName);
  }
  updateSetup();
}

function readRow(row) {
  const size = row.querySelector(".sizes input:checked");
  return {
    drink: row.querySelector('[name="drink"]').value.trim(),
    pct: row.querySelector('[name="pct"]').value.trim(),
    who: row.querySelector('[name="who"]').value.trim(),
    size: size ? size.value : "",
  };
}

function filledRows() {
  return [...listEl.querySelectorAll(".order")].filter((row) => readRow(row).drink);
}

function ordersFromDom() {
  return filledRows().map(readRow);
}

function paint(row) {
  const next = renderLabel(readRow(row), cafeEl.value.trim());
  next.setAttribute("role", "img");
  next.setAttribute("aria-label", "Sticker preview");
  row.querySelector("canvas").replaceWith(next);
}

function labeledInput(caption, name, value, extra = {}) {
  const wrap = document.createElement("label");
  const span = document.createElement("span");
  span.textContent = caption;
  const input = document.createElement("input");
  input.name = name;
  input.value = value;
  input.autocomplete = "off";
  Object.assign(input, extra);
  wrap.append(span, input);
  return wrap;
}

function option(value, text) {
  const node = document.createElement("option");
  node.value = value;
  node.textContent = text ?? value;
  return node;
}

function typedDrink(value) {
  const input = document.createElement("input");
  input.name = "drink";
  input.value = value;
  input.autocomplete = "off";
  input.placeholder = "Type the drink";
  return input;
}

/** A menu dropdown. A drink that is not on the menu stays as typed, and Other lets you type one. */
function drinkField(value) {
  const wrap = document.createElement("label");
  wrap.className = "wide";
  const span = document.createElement("span");
  span.textContent = "Drink";
  const select = document.createElement("select");
  select.name = "drink";
  select.append(option("", "Choose a drink…"));
  if (value && !ON_MENU.has(value)) {
    const group = document.createElement("optgroup");
    group.label = "From the order";
    group.append(option(value));
    select.append(group);
  }
  for (const [title, drinks] of MENU) {
    const group = document.createElement("optgroup");
    group.label = title;
    for (const drink of drinks) group.append(option(drink));
    select.append(group);
  }
  select.append(option(OTHER, "Other… type a drink"));
  select.value = value || "";
  select.addEventListener("change", () => {
    if (select.value !== OTHER) return;
    const input = typedDrink("");
    select.replaceWith(input);
    input.focus();
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  wrap.append(span, select);
  return wrap;
}

function sugarField(value) {
  const wrap = document.createElement("label");
  const span = document.createElement("span");
  span.textContent = "Sugar";
  const select = document.createElement("select");
  select.name = "pct";
  select.append(option("", "Not printed"));
  if (value && !SUGAR_LEVELS.includes(value)) select.append(option(value));
  for (const level of SUGAR_LEVELS) select.append(option(level));
  select.value = value || "";
  wrap.append(span, select);
  return wrap;
}

function sizeField(value, id) {
  const set = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = "Size";
  const row = document.createElement("div");
  row.className = "sizes";
  for (const [option, text] of SIZES) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = `size-${id}`;
    input.value = option;
    input.checked = option === value;
    const face = document.createElement("span");
    face.textContent = text;
    if (!option) face.title = "No size";
    label.append(input, face);
    row.append(label);
  }
  set.append(legend, row);
  return set;
}

function updateCount() {
  const count = ordersFromDom().length;
  const rows = listEl.querySelectorAll(".order").length;
  listCount.hidden = count === 0;
  listCount.textContent = String(count);
  clearLabelsBtn.hidden = rows === 0;
  if (!printing) {
    printBtn.disabled = count === 0;
    printBtn.textContent = count === 0 ? "Print" : count === 1 ? "Print 1 label" : `Print ${count} labels`;
  }
  copyBtn.disabled = count === 0;
  pdfBtn.disabled = count === 0;
}

function clearMarks() {
  for (const row of listEl.querySelectorAll(".order")) {
    row.classList.remove("printing", "printed");
    row.querySelector(".badge")?.remove();
  }
}

function rowView(order) {
  const id = ++rowId;
  const row = document.createElement("article");
  row.className = "order";
  const preview = document.createElement("div");
  preview.className = "preview";
  const canvas = renderLabel(order, cafeEl.value.trim());
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "Sticker preview");
  preview.append(canvas);
  const fields = document.createElement("div");
  fields.className = "fields";
  fields.append(
    drinkField(order.drink || ""),
    labeledInput("Name", "who", order.who || "", { placeholder: "Optional" }),
    sugarField(order.pct || ""),
  );
  const size = sizeField(order.size || "", id);
  size.classList.add("wide");
  fields.append(size);
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "remove";
  remove.textContent = "×";
  remove.setAttribute("aria-label", "Remove this label");
  remove.title = "Remove";
  remove.addEventListener("click", () => {
    row.remove();
    updateCount();
  });
  fields.addEventListener("input", () => {
    paint(row);
    clearMarks();
    updateCount();
  });
  row.append(preview, remove, fields);
  return row;
}

function showOrders(orders, note) {
  listEl.replaceChildren();
  orders.forEach((order) => listEl.appendChild(rowView({ ...order, drink: menuName(order.drink) })));
  updateCount();
  if (note) setStatus(note);
}

async function makeLabels() {
  const parsed = parseOrders(orderEl.value);
  const batch = takeLabels(parsed);
  if (!batch.orders.length) {
    setStatus("No drinks found. Put one drink on each line.", true);
    return;
  }
  try {
    await fontsReady();
  } catch {
    setStatus("The sticker fonts did not load.", true);
    return;
  }
  const extra = batch.omitted
    ? ` Only the first ${MAX_LABELS} fit; ${batch.omitted} more were left out.`
    : "";
  const made = batch.orders.length === 1 ? "1 label" : `${batch.orders.length} labels`;
  showOrders(batch.orders, `Made ${made}. Check the names, then print.${extra}`);
  listEl.closest("section").scrollIntoView({ behavior: "smooth", block: "start" });
}

cafeEl.addEventListener("input", () => {
  saveCafe();
  for (const row of listEl.querySelectorAll(".order")) paint(row);
});

chip.addEventListener("click", () => {
  setupEl.open = true;
  setupEl.scrollIntoView({ behavior: "smooth", block: "start" });
  connectBtn.focus({ preventScroll: true });
});

connectBtn.addEventListener("click", () => {
  if (!bluetoothAvailable()) {
    setStatus(NO_BLUETOOTH, true);
    return;
  }
  let picking;
  try {
    picking = requestPrinter("", printerFilters);
  } catch (error) {
    setStatus(printErrorMessage(error), true);
    return;
  }
  connectBtn.disabled = true;
  setStatus("Pick the printer in the box that opened.", "busy");
  void (async () => {
    try {
      const device = await picking;
      setStatus(`Connecting to ${device.name || "the printer"}…`, "busy");
      await device.gatt.connect();
      keepPrinter(device);
      setStatus(`Connected to ${device.name || "the printer"}. Ready to print.`, "ok");
    } catch (error) {
      setStatus(printErrorMessage(error), true);
    } finally {
      updateSetup();
    }
  })();
});

forgetBtn.addEventListener("click", async () => {
  try {
    if (held?.gatt?.connected) held.gatt.disconnect();
    await held?.forget?.();
  } catch {
    /* the browser may not support forget */
  }
  held = null;
  savedName = "";
  localStorage.removeItem(PRINTER_KEY);
  localStorage.removeItem("hamster-printer-name");
  updateSetup();
  setStatus("Printer forgotten. Connect it again before printing.");
});

document.querySelector("#read").addEventListener("click", () => {
  void makeLabels();
});

orderEl.addEventListener("paste", () => {
  setTimeout(() => void makeLabels(), 0);
});

orderEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    void makeLabels();
  }
});

document.querySelector("#clear-order").addEventListener("click", () => {
  orderEl.value = "";
  orderEl.focus();
});

clearLabelsBtn.addEventListener("click", () => {
  listEl.replaceChildren();
  updateCount();
  setStatus("Labels removed.");
});

document.querySelector("#add").addEventListener("click", async () => {
  try {
    await fontsReady();
  } catch {
    setStatus("The sticker fonts did not load.", true);
    return;
  }
  listEl.appendChild(rowView({ drink: "", pct: "", who: "", size: "" }));
  updateCount();
  const drink = listEl.lastElementChild.querySelector('[name="drink"]');
  drink.focus();
  try {
    drink.showPicker?.();
  } catch {
    /* the browser only opens it from a direct tap */
  }
});

copyBtn.addEventListener("click", async () => {
  const orders = ordersFromDom();
  if (!orders.length) {
    setStatus("Make the labels first, then copy the link.", true);
    return;
  }
  const link = pageLink(location.href, orders, saveCafe());
  try {
    await navigator.clipboard.writeText(link);
    setStatus("Link copied. Open it in Chrome on the computer next to the printer.", "ok");
  } catch {
    setStatus(link, true);
  }
});

function pdfName(cafe) {
  const now = new Date();
  const two = (n) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}`;
  const base = (cafe || "coffee").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "coffee";
  return `${base}-labels-${stamp}.pdf`;
}

pdfBtn.addEventListener("click", async () => {
  const orders = ordersFromDom();
  if (!orders.length) {
    setStatus("Make the labels first, then save the PDF.", true);
    return;
  }
  pdfBtn.disabled = true;
  try {
    await fontsReady();
    const cafe = saveCafe();
    const pages = orders.map((order) => bitsFromCanvas(renderLabel(order, cafe)));
    const bytes = await labelsPdf(pages, { title: cafe ? `${cafe} labels` : "Coffee labels" });
    const file = new File([bytes], pdfName(cafe), { type: "application/pdf" });
    const count = orders.length === 1 ? "1 label" : `${orders.length} labels`;
    if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: file.name });
        setStatus(`PDF with ${count} shared. Print it from the label app at 40×30 mm.`, "ok");
        return;
      } catch (error) {
        if (error?.name === "AbortError") {
          setStatus("Sharing cancelled.");
          return;
        }
      }
    }
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    setStatus(`Saved ${file.name} (${count}). Open it in the label app and print at 40×30 mm.`, "ok");
  } catch (error) {
    setStatus(error?.message || "The PDF could not be made.", true);
  } finally {
    updateCount();
  }
});

printBtn.addEventListener("click", () => {
  if (printing) return;
  const rows = filledRows();
  const orders = rows.map(readRow);
  if (!orders.length) {
    setStatus("There is no label to print.", true);
    return;
  }
  if (!bluetoothAvailable()) {
    setStatus(NO_BLUETOOTH, true);
    return;
  }
  if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    setStatus("Open the https address. Bluetooth does not run from a plain http page.", true);
    return;
  }
  let picking = null;
  const reconnecting = Boolean(held);
  try {
    if (!reconnecting) picking = requestPrinter(savedName, printerFilters);
  } catch (error) {
    setStatus(printErrorMessage(error), true);
    return;
  }
  printing = true;
  printBtn.classList.add("busy");
  printBtn.textContent = reconnecting ? "Connecting…" : "Choose printer…";
  setStatus(reconnecting ? "Connecting to the printer…" : "Pick the printer in the box that opened.", "busy");
  void finishPrint(picking, orders, rows, reconnecting);
});

async function finishPrint(picking, orders, rows, reconnecting) {
  clearMarks();
  try {
    await fontsReady();
    const device = picking ? await picking : held;
    if (!device) throw new Error("Choose the printer first.");
    keepPrinter(device);
    const cafe = saveCafe();
    const canvases = orders.map((order) => renderLabel(order, cafe));
    const total = orders.length;
    printBtn.textContent = "Printing…";
    setStatus(total === 1 ? "Printing 1 label. Keep this tab open." : `Printing ${total} labels. Keep this tab open.`, "busy");
    setProgress(0, total);
    let last = -1;
    await printCanvases(canvases, device, (index) => {
      mark(rows[last], "printed");
      mark(rows[index], "printing");
      last = index;
      setProgress(index, total);
      printBtn.textContent = `Printing ${index + 1} of ${total}…`;
      setStatus(`Printing ${index + 1} of ${total}. Keep this tab open.`, "busy");
    });
    mark(rows[last], "printed");
    setProgress(total, total);
    setStatus(total === 1 ? "Printed 1 label." : `Printed ${total} labels.`, "ok");
  } catch (error) {
    if (!picking) held = null;
    setStatus(printErrorMessage(error, reconnecting && !picking), true);
    for (const row of rows) row.classList.remove("printing");
  } finally {
    printing = false;
    printBtn.classList.remove("busy");
    setTimeout(() => setProgress(0, 0), 1500);
    updateSetup();
    updateCount();
  }
}

function mark(row, state) {
  if (!row || !row.isConnected) return;
  row.classList.remove("printing", "printed");
  row.classList.add(state);
  let badge = row.querySelector(".badge");
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "badge";
    row.prepend(badge);
  }
  badge.textContent = state === "printed" ? "✓ Printed" : "Printing…";
}

async function loadRemembered() {
  if (!navigator.bluetooth?.getDevices) return;
  if (!savedName) return;
  try {
    const list = await navigator.bluetooth.getDevices();
    held = list.find((device) => device.name === savedName) || null;
  } catch {
    held = null;
  }
}

updateSetup();
updateCount();

fontsReady()
  .then(async () => {
    const linked = ordersFromHash(location.hash);
    const batch = takeLabels(linked);
    if (batch.orders.length) showOrders(batch.orders);
    saveCafe();
    if (!bluetoothAvailable()) {
      setStatus(batch.orders.length
        ? `Order loaded. ${NO_BLUETOOTH}`
        : NO_BLUETOOTH, true);
      return;
    }
    await loadRemembered();
    updateSetup();
    setStatus(batch.orders.length
      ? "Order loaded. Check the cafe name and labels, then print."
      : "Ready. Paste an order to start.");
  })
  .catch(() => setStatus("The sticker fonts did not load.", true));
