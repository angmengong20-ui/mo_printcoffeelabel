/** 40×30 mm sticker at 203 dpi: 320×240. Black pixels are the ones that burn. */

const W = 320;
const H = 240;

let readyPromise = null;

export function fontsReady() {
  if (!readyPromise) {
    readyPromise = loadFonts().catch((error) => {
      readyPromise = null;
      throw error;
    });
  }
  return readyPromise;
}

async function loadFonts() {
  const black = new FontFace("InterBlack", "url(fonts/Inter-Black.ttf)");
  const bold = new FontFace("InterBold", "url(fonts/Inter-Bold.ttf)");
  await Promise.all([black.load(), bold.load()]);
  document.fonts.add(black);
  document.fonts.add(bold);
}

function face(ctx, size, weight) {
  ctx.font = `${size}px ${weight === "black" ? "InterBlack" : "InterBold"}`;
}

function ink(ctx, text) {
  const box = ctx.measureText(text || " ");
  const ascent = box.actualBoundingBoxAscent || sizeGuess(ctx);
  const descent = box.actualBoundingBoxDescent || 0;
  return {
    width: text ? box.width : 0,
    ascent,
    descent,
    height: text ? ascent + descent : 0,
  };
}

function sizeGuess(ctx) {
  const match = /([\d.]+)px/.exec(ctx.font);
  return match ? Number(match[1]) * 0.72 : 16;
}

function place(ctx, text, x, y, align) {
  if (!text) return;
  const box = ink(ctx, text);
  let left = x;
  if (align === "right") left = x - box.width;
  else if (align === "center") left = x - box.width / 2;
  const baseline = y + (box.ascent - box.descent) / 2;
  ctx.fillText(text, left, baseline);
}

function tracked(ctx, text, cx, y, tracking) {
  if (!text) return;
  const widths = [...text].map((ch) => ink(ctx, ch).width);
  const total = widths.reduce((n, w) => n + w, 0) + tracking * (text.length - 1);
  let x = cx - total / 2;
  const sample = ink(ctx, text);
  const baseline = y + (sample.ascent - sample.descent) / 2;
  [...text].forEach((ch, i) => {
    ctx.fillText(ch, x, baseline);
    x += widths[i] + tracking;
  });
}

function drawCafe(ctx, name) {
  const text = String(name || "").trim().toUpperCase();
  if (!text) return;
  for (const size of [22, 20, 18, 16, 14]) {
    face(ctx, size, "bold");
    const widths = [...text].map((ch) => ink(ctx, ch).width);
    const total = widths.reduce((n, w) => n + w, 0) + Math.max(0, text.length - 1);
    if (total <= W - 28 || size === 14) {
      tracked(ctx, text, W / 2, 18, 1);
      return;
    }
  }
}

function fitDrink(ctx, text, maxW) {
  const words = text.split(/\s+/).filter(Boolean);
  const sizes = words.length <= 1 ? [46, 40, 36, 32, 28, 24, 20] : [46, 40, 36, 32];
  for (const size of sizes) {
    face(ctx, size, "black");
    if (ink(ctx, text).width <= maxW) return { lines: [text], size };
  }
  if (words.length <= 1) return { lines: [text], size: 20 };

  for (const size of [34, 30, 26]) {
    face(ctx, size, "black");
    let best = null;
    for (let i = 1; i < words.length; i += 1) {
      const left = words.slice(0, i).join(" ");
      const right = words.slice(i).join(" ");
      const leftW = ink(ctx, left).width;
      const rightW = ink(ctx, right).width;
      if (leftW <= maxW && rightW <= maxW) {
        const score = Math.abs(leftW - rightW);
        if (!best || score < best.score) best = { score, lines: [left, right] };
      }
    }
    if (best) return { lines: best.lines, size };
  }
  for (const size of [24, 22, 20, 18, 16]) {
    face(ctx, size, "black");
    const lines = wrap(ctx, words, maxW);
    if (lines.length <= 3 && lines.every((line) => ink(ctx, line).width <= maxW)) {
      return { lines, size };
    }
  }
  face(ctx, 16, "black");
  return { lines: wrap(ctx, words, maxW).slice(0, 3), size: 16 };
}

/** Greedy word wrap at the current font. */
function wrap(ctx, words, maxW) {
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ink(ctx, next).width > maxW) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function renderLabel(order, cafe = "") {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000";
  ctx.textBaseline = "alphabetic";

  drawCafe(ctx, cafe);

  const drink = String(order.drink || "").trim();
  const cup = String(order.size || "").trim().toUpperCase();
  let textRight = W - 16;
  if (cup === "S" || cup === "M" || cup === "L") {
    const box = [W - 52, 50, W - 14, 86];
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#000";
    roundRect(ctx, box[0], box[1], box[2] - box[0], box[3] - box[1], 6);
    ctx.stroke();
    face(ctx, 26, "black");
    place(ctx, cup, (box[0] + box[2]) / 2, (box[1] + box[3]) / 2, "center");
    textRight = box[0] - 10;
  }

  const fitted = fitDrink(ctx, drink, textRight - 16);
  face(ctx, fitted.size, "black");
  const heights = fitted.lines.map((line) => ink(ctx, line).height);
  const block = heights.reduce((n, h) => n + h, 0) + 4 * (fitted.lines.length - 1);
  let y = 92 - block / 2;
  fitted.lines.forEach((line, i) => {
    place(ctx, line, 16, y + heights[i] / 2, "left");
    y += heights[i] + 4;
  });

  ctx.fillRect(16, 137, W - 32, 2);

  const who = String(order.who || "").trim();
  const pct = String(order.pct || "").trim();
  const midY = 186;
  if (pct && who) {
    face(ctx, 42, "black");
    const pctW = ink(ctx, pct).width;
    let whoSize = 22;
    for (const size of [28, 26, 24, 22]) {
      face(ctx, size, "bold");
      if (pctW + 16 + ink(ctx, who).width <= W - 32) {
        whoSize = size;
        break;
      }
    }
    face(ctx, 42, "black");
    place(ctx, pct, 16, midY, "left");
    face(ctx, whoSize, "bold");
    place(ctx, who, W - 16, midY, "right");
  } else if (pct) {
    face(ctx, 42, "black");
    place(ctx, pct, 16, midY, "left");
  } else if (who) {
    face(ctx, 32, "bold");
    place(ctx, who, W / 2, midY, "center");
  }
  return canvas;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
