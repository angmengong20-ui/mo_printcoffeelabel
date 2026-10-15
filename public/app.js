import { cafeFromSearch, ordersFromHash, pageLink } from "./link.js";
import { fontsReady, renderLabel } from "./label.js";
import { MAX_LABELS, parseOrders, takeLabels } from "./orders.js";
import { isMacAddress, printerFilters, printerNameFromCode } from "./printer-code.js";
import { bluetoothAvailable, printCanvases, printErrorMessage, requestPrinter } from "./protocol.js";

const CAFE_KEY = "mo-print-cafe";
const PRINTER_KEY = "mo-print-printer";
const NO_BLUETOOTH = "This browser can't reach the printer. Open the https page in Chrome, Edge, or Brave on a computer, or in Chrome on Android.";
const SIZES = [["", "–"], ["S", "S"], ["M", "M"], ["L", "L"]];

const statusEl = document.querySelector("#status");
const progressEl = document.querySelector("#progress");
const progressBar = document.querySelector("#progress-bar");
const listEl = document.querySelector("#list");
const listCount = document.querySelector("#list-count");
const clearLabelsBtn = document.querySelector("#clear-labels");
const cafeEl = document.querySelector("#cafe");
const printerEl = document.querySelector("#printer");
const orderEl = document.querySelector("#order");
const printBtn = document.querySelector("#print");
const copyBtn = document.querySelector("#copy");
const setupEl = document.querySelector("#setup");
const setupNote = document.querySelector("#setup-note");
const chip = document.querySelector("#printer-chip");
const chipText = document.querySelector("#printer-chip-text");
const scanBox = document.querySelector("#scan");
const camera = document.querySelector("#camera");

let stream = null;
let scanTimer = 0;
let held = null;
let printing = false;
let rowId = 0;

cafeEl.value = cafeFromSearch(location.search) || localStorage.getItem(CAFE_KEY) || "";
printerEl.value = localStorage.getItem(PRINTER_KEY)
  || localStorage.getItem("hamster-printer-name")
  || "";
setupEl.open = !cafeEl.value || !printerEl.value;

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
  const printer = printerEl.value.trim();
  setupNote.textContent = `${cafe || "No cafe name"} · ${printer || "any P1 printer"}`;
  chip.classList.toggle("set", Boolean(printer));
  chip.classList.toggle("live", Boolean(held));
  chipText.textContent = held
    ? `${held.name || printer || "Printer"} · connected`
    : printer || "Any P1 printer";
}

function saveCafe() {
  const cafe = cafeEl.value.replace(/\s+/g, " ").trim().slice(0, 40);
  localStorage.setItem(CAFE_KEY, cafe);
  document.title = cafe ? `${cafe} · labels` : "Print coffee labels";
  updateSetup();
  return cafe;
}

function savePrinter() {
  if (isMacAddress(printerEl.value)) {
    printerEl.value = "";
    localStorage.removeItem(PRINTER_KEY);
    setupEl.open = true;
    setStatus("That is a hardware address. Type the name from the sticker. It starts with P1-.", true);
    updateSetup();
    return "";
  }
  const name = printerNameFromCode(printerEl.value);
  printerEl.value = name;
  if (name) localStorage.setItem(PRINTER_KEY, name);
  else localStorage.removeItem(PRINTER_KEY);
  updateSetup();
  return name;
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
  const drink = labeledInput("Drink", "drink", order.drink || "", { placeholder: "Ice latte" });
  drink.className = "wide";
  fields.append(
    drink,
    labeledInput("Name", "who", order.who || "", { placeholder: "Optional" }),
    labeledInput("Sweetness", "pct", order.pct || "", { placeholder: "e.g. 50%", inputMode: "decimal" }),
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
  orders.forEach((order) => listEl.appendChild(rowView(order)));
  updateCount();
  if (note) setStatus(note);
}

async function stopScan() {
  if (scanTimer) clearInterval(scanTimer);
  scanTimer = 0;
  scanBox.style.display = "none";
  if (stream) stream.getTracks().forEach((track) => track.stop());
  stream = null;
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

printerEl.addEventListener("change", () => {
  const name = savePrinter();
  if (held && held.name !== name) held = null;
  updateSetup();
});

chip.addEventListener("click", () => {
  setupEl.open = true;
  setupEl.scrollIntoView({ behavior: "smooth", block: "start" });
  printerEl.focus({ preventScroll: true });
});

document.querySelector("#scan-start").addEventListener("click", async () => {
  if (!("BarcodeDetector" in window)) {
    setStatus("This browser can't scan. Type the code printed on the printer.", true);
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
  } catch {
    setStatus("The camera did not open. Type the printer code instead.", true);
    return;
  }
  camera.srcObject = stream;
  await camera.play();
  scanBox.style.display = "block";
  setStatus("Point the camera at the barcode on the printer.", "busy");
  const detector = new BarcodeDetector({
    formats: ["qr_code", "code_128", "code_39", "ean_13", "data_matrix", "upc_a"],
  });
  scanTimer = setInterval(async () => {
    if (!stream) return;
    try {
      const codes = await detector.detect(camera);
      if (!codes.length) return;
      printerEl.value = codes[0].rawValue;
      const name = savePrinter();
      await stopScan();
      if (name) setStatus(`Printer set to ${name}.`, "ok");
    } catch {
      /* keep looking */
    }
  }, 200);
});

document.querySelector("#scan-stop").addEventListener("click", () => {
  void stopScan();
  setStatus("Scanning stopped.");
});
window.addEventListener("pagehide", () => {
  void stopScan();
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

printBtn.addEventListener("click", () => {
  if (printing) return;
  const rows = filledRows();
  const orders = rows.map(readRow);
  if (!orders.length) {
    setStatus("There is no label to print.", true);
    return;
  }
  if (isMacAddress(printerEl.value)) {
    savePrinter();
    return;
  }
  const name = savePrinter();
  if (!bluetoothAvailable()) {
    setStatus(NO_BLUETOOTH, true);
    return;
  }
  if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    setStatus("Open the https address. Bluetooth does not run from a plain http page.", true);
    return;
  }
  void stopScan();
  let picking = null;
  const reconnecting = Boolean(held && held.name === name);
  try {
    if (!reconnecting) picking = requestPrinter(name, printerFilters);
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
    held = device;
    if (device.name && device.name !== printerEl.value) {
      printerEl.value = device.name;
      savePrinter();
    }
    updateSetup();
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
  const name = printerNameFromCode(printerEl.value);
  if (!name) return;
  try {
    const list = await navigator.bluetooth.getDevices();
    held = list.find((device) => device.name === name) || null;
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
