import { cafeFromSearch, ordersFromHash, pageLink } from "./link.js";
import { fontsReady, renderLabel } from "./label.js";
import { parseOrders, takeLabels } from "./orders.js";
import { isMacAddress, printerFilters, printerNameFromCode } from "./printer-code.js";
import { bluetoothAvailable, printCanvases, printErrorMessage, requestPrinter } from "./protocol.js";

const CAFE_KEY = "mo-print-cafe";
const PRINTER_KEY = "mo-print-printer";
const NO_BLUETOOTH = "This browser can't reach the printer. Open the https page in Chrome, Edge, or Brave on a computer, or in Chrome on Android.";

const statusEl = document.querySelector("#status");
const listEl = document.querySelector("#list");
const headingEl = document.querySelector("#list-heading");
const countEl = document.querySelector("#count");
const cafeEl = document.querySelector("#cafe");
const printerEl = document.querySelector("#printer");
const orderEl = document.querySelector("#order");
const printBtn = document.querySelector("#print");
const scanBox = document.querySelector("#scan");
const camera = document.querySelector("#camera");

let stream = null;
let scanTimer = 0;
let held = null;

cafeEl.value = cafeFromSearch(location.search) || localStorage.getItem(CAFE_KEY) || "";
printerEl.value = localStorage.getItem(PRINTER_KEY)
  || localStorage.getItem("hamster-printer-name")
  || "";

function setStatus(text, bad) {
  statusEl.className = bad ? "status err" : "status";
  statusEl.setAttribute("role", bad ? "alert" : "status");
  statusEl.textContent = text;
}

function saveCafe() {
  const cafe = cafeEl.value.replace(/\s+/g, " ").trim().slice(0, 40);
  localStorage.setItem(CAFE_KEY, cafe);
  document.title = cafe || "Print coffee labels";
  return cafe;
}

function savePrinter() {
  if (isMacAddress(printerEl.value)) {
    printerEl.value = "";
    localStorage.removeItem(PRINTER_KEY);
    setStatus("That is a hardware address. Type the name from the sticker. It starts with P1-.", true);
    return "";
  }
  const name = printerNameFromCode(printerEl.value);
  printerEl.value = name;
  if (name) localStorage.setItem(PRINTER_KEY, name);
  else localStorage.removeItem(PRINTER_KEY);
  return name;
}

function readRow(row) {
  return {
    drink: row.querySelector('[name="drink"]').value.trim(),
    pct: row.querySelector('[name="pct"]').value.trim(),
    who: row.querySelector('[name="who"]').value.trim(),
    size: row.querySelector('[name="size"]').value,
  };
}

function ordersFromDom() {
  return [...listEl.querySelectorAll(".order")]
    .map(readRow)
    .filter((order) => order.drink);
}

function paint(row) {
  const next = renderLabel(readRow(row), cafeEl.value.trim());
  row.querySelector("canvas").replaceWith(next);
}

function labeledInput(caption, name, value) {
  const wrap = document.createElement("label");
  const span = document.createElement("span");
  span.textContent = caption;
  const input = document.createElement("input");
  input.name = name;
  input.value = value;
  input.autocomplete = "off";
  wrap.append(span, input);
  return wrap;
}

function sizeField(value) {
  const wrap = document.createElement("label");
  const span = document.createElement("span");
  span.textContent = "Size";
  const select = document.createElement("select");
  select.name = "size";
  for (const option of ["", "S", "M", "L"]) {
    const node = document.createElement("option");
    node.value = option;
    node.textContent = option;
    if (option === value) node.selected = true;
    select.append(node);
  }
  wrap.append(span, select);
  return wrap;
}

function updateCount() {
  const count = ordersFromDom().length;
  headingEl.hidden = count === 0;
  countEl.textContent = count === 0 ? "No labels yet" : count === 1 ? "1 label" : `${count} labels`;
}

function rowView(order) {
  const row = document.createElement("article");
  row.className = "order";
  const fields = document.createElement("div");
  fields.className = "fields";
  fields.append(
    labeledInput("Drink", "drink", order.drink || ""),
    labeledInput("%", "pct", order.pct || ""),
    labeledInput("Name", "who", order.who || ""),
    sizeField(order.size || ""),
  );
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "ghost remove";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => {
    row.remove();
    updateCount();
  });
  fields.addEventListener("input", () => {
    paint(row);
    updateCount();
  });
  row.append(renderLabel(order, cafeEl.value.trim()), fields);
  fields.append(remove);
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

cafeEl.addEventListener("input", () => {
  saveCafe();
  for (const row of listEl.querySelectorAll(".order")) paint(row);
});

printerEl.addEventListener("change", () => {
  const name = savePrinter();
  if (held && held.name !== name) held = null;
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
      if (name) setStatus(`Printer set to ${name}. Tap Connect and print.`);
    } catch {
      /* keep looking */
    }
  }, 200);
});

document.querySelector("#scan-stop").addEventListener("click", () => {
  void stopScan();
});
window.addEventListener("pagehide", () => {
  void stopScan();
});

document.querySelector("#read").addEventListener("click", async () => {
  const parsed = parseOrders(orderEl.value);
  const batch = takeLabels(parsed);
  if (!batch.orders.length) {
    setStatus("No drinks in that message.", true);
    return;
  }
  try {
    await fontsReady();
  } catch {
    setStatus("The sticker fonts did not load.", true);
    return;
  }
  const extra = batch.omitted
    ? ` The first ${batch.orders.length} are shown. ${batch.omitted} more were left out.`
    : "";
  showOrders(batch.orders, `Check the names, then connect and print.${extra}`);
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

document.querySelector("#copy").addEventListener("click", async () => {
  const orders = ordersFromDom();
  if (!orders.length) {
    setStatus("Read an order first, then copy the link.", true);
    return;
  }
  const link = pageLink(location.href, orders, saveCafe());
  try {
    await navigator.clipboard.writeText(link);
    setStatus("Link copied. Open it in Chrome on the computer next to the printer.");
  } catch {
    setStatus(link, true);
  }
});

printBtn.addEventListener("click", () => {
  if (printBtn.disabled) return;
  const orders = ordersFromDom();
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
  printBtn.disabled = true;
  void finishPrint(picking, orders, reconnecting);
});

async function finishPrint(picking, orders, reconnecting) {
  try {
    await fontsReady();
    const device = picking ? await picking : held;
    if (!device) throw new Error("Choose the printer first.");
    held = device;
    if (device.name && device.name !== printerEl.value) {
      printerEl.value = device.name;
      savePrinter();
    }
    const cafe = saveCafe();
    const canvases = orders.map((order) => renderLabel(order, cafe));
    setStatus(orders.length === 1
      ? "Printing 1 label. Keep this tab open."
      : `Printing ${orders.length} labels. Keep this tab open.`);
    await printCanvases(canvases, device, (index, total) => {
      setStatus(`Printing ${index + 1} of ${total}. Keep this tab open.`);
    });
    setStatus(orders.length === 1 ? "Printed 1 label." : `Printed ${orders.length} labels.`);
  } catch (error) {
    if (!picking) held = null;
    setStatus(printErrorMessage(error, reconnecting && !picking), true);
  } finally {
    printBtn.disabled = false;
  }
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
    setStatus(batch.orders.length
      ? "Order loaded. Check the cafe name and the printer code, then print."
      : "Paste an order, or open a print link.");
  })
  .catch(() => setStatus("The sticker fonts did not load.", true));
