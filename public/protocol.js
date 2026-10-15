/**
 * DETONG P1 packets. Same bytes the desk sender already printed with.
 * Packet shape: 1F <cmd> <len> <data> <checksum>.
 * Checksum is the bitwise NOT of the sum of the bytes after the start byte.
 * Length uses encodeShort: values >= 192 are two bytes with the high byte | 0xC0.
 */

const START = 0x1f;
const CMD_PRINT_INIT = 0x20;
const CMD_PRINT_LINE = 0x21;
const CMD_LINE_WIDTH = 0x27;
const CMD_PRINT_END = 0x28;
const CMD_DENSITY = 0x43;
const CMD_SPEED = 0x44;

export const SERVICE_UUID = "0000ff00-0000-1000-8000-00805f9b34fb";
const WRITE_UUID = "0000ff02-0000-1000-8000-00805f9b34fb";

/** A step above the lightest setting, so the smaller name stays solid. */
export const DENSITY = 0x06;
export const SPEED = 0x01;
export const CHUNK = 180;
const CHUNK_GAP_MS = 20;
const LABEL_GAP_MS = 2200;

export function encodeShort(value) {
  if (value >= 192) return [(value >> 8) | 0xc0, value & 0xff];
  return [value & 0xff];
}

export function build(cmd, data = []) {
  const body = [cmd, ...encodeShort(data.length), ...data];
  let sum = 0;
  for (const byte of body) sum += byte;
  return new Uint8Array([START, ...body, (~sum) & 0xff]);
}

function concat(parts) {
  const size = parts.reduce((n, part) => n + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** isBlack(x, y) is true for a dot that should burn. Width is 320, height 240. */
export function imageToCommands(width, height, isBlack) {
  const lineBytes = (width + 7) >> 3;
  const parts = [
    build(CMD_PRINT_INIT, [0x40, 0x30, 0, 0, 0, 0, 0, 0]),
    build(CMD_LINE_WIDTH, [...encodeShort(lineBytes), 1]),
  ];

  const emit = (line, count) => {
    let offset = 0;
    while (offset < line.length && line[offset] === 0) offset += 1;
    parts.push(build(CMD_PRINT_LINE, [
      ...encodeShort(count - 1),
      ...encodeShort(offset),
      ...line.slice(offset),
    ]));
  };

  let last = null;
  let repeat = 0;
  for (let y = 0; y < height; y += 1) {
    const line = [];
    for (let x = 0; x < lineBytes; x += 1) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit += 1) {
        const px = x * 8 + bit;
        if (px < width && isBlack(px, y)) byte |= 1 << (7 - bit);
      }
      line.push(byte);
    }
    if (last && line.every((byte, i) => byte === last[i])) {
      repeat += 1;
    } else {
      if (last) emit(last, repeat);
      last = line;
      repeat = 1;
    }
  }
  if (last) emit(last, repeat);
  parts.push(build(CMD_PRINT_END, []));
  return concat(parts);
}

export function canvasToCommands(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { width, height, data } = image;
  return imageToCommands(width, height, (x, y) => {
    const i = (y * width + x) * 4;
    const ink = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    return ink < 128;
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function bluetoothAvailable() {
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}

/**
 * Call this in the click turn, before any await. The browser only opens the
 * chooser from a user gesture, and an earlier await spends that gesture.
 */
export function requestPrinter(printerName, filtersFor) {
  if (!bluetoothAvailable()) {
    const error = new Error("This window has no Bluetooth.");
    error.name = "NotSupportedError";
    throw error;
  }
  const filters = filtersFor(printerName);
  return navigator.bluetooth.requestDevice({
    filters,
    optionalServices: [SERVICE_UUID],
  });
}

async function writeChunk(characteristic, bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (characteristic.properties.write) {
    await characteristic.writeValueWithResponse(data);
    return;
  }
  await characteristic.writeValueWithoutResponse(data);
}

async function findWrite(service) {
  const chars = await service.getCharacteristics();
  const found = chars.find((item) => item.uuid.toLowerCase().startsWith("0000ff02"));
  if (found) return found;
  return service.getCharacteristic(WRITE_UUID);
}

async function openService(device) {
  if (!device.gatt) throw new Error("This browser did not open a Bluetooth connection.");
  const server = await device.gatt.connect();
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const service = await server.getPrimaryService(SERVICE_UUID);
      return service;
    } catch (error) {
      lastError = error;
      await sleep(300);
    }
  }
  throw lastError || new Error("The printer connected, but it has no print service.");
}

/** Send finished 320×240 canvases to an already chosen device. */
export async function printCanvases(canvases, device, onLabel) {
  if (!device) throw new Error("Choose the printer first.");
  if (!canvases.length) throw new Error("There is no label to print.");

  let dropped = false;
  let closing = false;
  const onDrop = () => {
    if (!closing) dropped = true;
  };
  device.addEventListener("gattserverdisconnected", onDrop);

  const ensure = () => {
    if (dropped) throw new Error("The printer disconnected before the job finished.");
  };

  try {
    const service = await openService(device);
    ensure();
    const write = await findWrite(service);
    if (!write) throw new Error("The printer connected, but it has no write channel.");

    await writeChunk(write, build(CMD_DENSITY, [DENSITY]));
    await writeChunk(write, build(CMD_SPEED, [SPEED]));
    await sleep(200);

    for (let index = 0; index < canvases.length; index += 1) {
      ensure();
      if (onLabel) onLabel(index, canvases.length);
      const payload = canvasToCommands(canvases[index]);
      for (let i = 0; i < payload.length; i += CHUNK) {
        ensure();
        await writeChunk(write, payload.slice(i, i + CHUNK));
        await sleep(CHUNK_GAP_MS);
      }
      await sleep(LABEL_GAP_MS);
    }
    ensure();
  } finally {
    closing = true;
    device.removeEventListener("gattserverdisconnected", onDrop);
    try {
      if (device.gatt?.connected) device.gatt.disconnect();
    } catch {
      /* the printer may already be gone */
    }
  }
}

export function printErrorMessage(error, duringReconnect) {
  const name = error?.name || "";
  const message = String(error?.message || "");
  if (name === "NotFoundError" || /cancel|not found|no device/i.test(message)) {
    return "Printer not found. Turn it on, close the phone app, and check the code on the sticker.";
  }
  if (name === "NotSupportedError") {
    return "This browser can't use Bluetooth. Open the https page in Chrome, Edge, or Brave.";
  }
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "The browser blocked Bluetooth. Allow it for this site, use the https address, then try again.";
  }
  if (name === "NetworkError" || /disconnect/i.test(message)) {
    return duringReconnect
      ? "The printer did not answer. Tap Connect and print again and pick it in the list. Wake it and close the phone app first."
      : "The printer disconnected. Wake it, close the phone app, and print again.";
  }
  return message || "The printer did not print.";
}
