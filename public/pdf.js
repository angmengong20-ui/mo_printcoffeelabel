/**
 * A PDF with one 40×30 mm page per sticker. The page holds the sticker as a
 * plain JPEG, which every PDF reader, label apps included, can draw.
 */

const MM = 72 / 25.4;

/** A sticker as rows of bits: 0 is ink, 1 is paper (DeviceGray, 1 bit). */
export function bitsFromPixels(width, height, isBlack) {
  const stride = Math.ceil(width / 8);
  const bits = new Uint8Array(stride * height).fill(0xff);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (isBlack(x, y)) bits[y * stride + (x >> 3)] &= ~(0x80 >> (x & 7));
    }
  }
  return { width, height, bits };
}

export function bitsFromCanvas(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height, data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return bitsFromPixels(width, height, (x, y) => {
    const i = (y * width + x) * 4;
    return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114 < 128;
  });
}

async function deflate(bytes) {
  if (typeof CompressionStream === "undefined") return null;
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const ascii = (text) => new TextEncoder().encode(text);

/** A sticker canvas as a JPEG, scaled up with hard pixel edges so text stays sharp. */
export async function jpegFromCanvas(canvas, scale = 3) {
  const big = document.createElement("canvas");
  big.width = canvas.width * scale;
  big.height = canvas.height * scale;
  const ctx = big.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, big.width, big.height);
  ctx.drawImage(canvas, 0, 0, big.width, big.height);
  const blob = await new Promise((resolve) => big.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) throw new Error("The sticker picture could not be made.");
  return { width: big.width, height: big.height, jpeg: new Uint8Array(await blob.arrayBuffer()) };
}

function imageObject(page, packed) {
  if (page.jpeg) {
    return [
      ascii(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height}`
        + ` /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`),
      page.jpeg,
      ascii("\nendstream"),
    ];
  }
  const data = packed || page.bits;
  const filter = packed ? " /Filter /FlateDecode" : "";
  return [
    ascii(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height}`
      + ` /ColorSpace /DeviceGray /BitsPerComponent 1${filter} /Length ${data.length} >>\nstream\n`),
    data,
    ascii("\nendstream"),
  ];
}

/** pages: [{ width, height, jpeg }] or [{ width, height, bits }]. Returns the PDF file as bytes. */
export async function labelsPdf(pages, { widthMm = 40, heightMm = 30, title = "Coffee labels" } = {}) {
  if (!pages.length) throw new Error("There is no label to save.");
  const w = (widthMm * MM).toFixed(2);
  const h = (heightMm * MM).toFixed(2);
  const objects = [];
  const add = (parts) => {
    objects.push(parts);
    return objects.length;
  };

  const catalog = add(null);
  const tree = add(null);
  const info = add([ascii(`<< /Title (${title.replace(/[()\\]/g, "")}) /Producer (printcoffeelabel) >>`)]);
  const kids = [];

  for (const page of pages) {
    const packed = page.jpeg ? null : await deflate(page.bits);
    const image = add(imageObject(page, packed));
    const draw = ascii(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`);
    const content = add([ascii(`<< /Length ${draw.length} >>\nstream\n`), draw, ascii("\nendstream")]);
    kids.push(add([ascii(`<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 ${w} ${h}]`
      + ` /Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${content} 0 R >>`)]));
  }

  objects[catalog - 1] = [ascii(`<< /Type /Catalog /Pages ${tree} 0 R >>`)];
  objects[tree - 1] = [ascii(`<< /Type /Pages /Count ${kids.length} /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] >>`)];

  const chunks = [ascii("%PDF-1.4\n"), new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])];
  let offset = chunks[0].length + chunks[1].length;
  const offsets = [];
  objects.forEach((parts, index) => {
    offsets.push(offset);
    const piece = [ascii(`${index + 1} 0 obj\n`), ...parts, ascii("\nendobj\n")];
    for (const part of piece) {
      chunks.push(part);
      offset += part.length;
    }
  });
  const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`]
    .concat(offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`))
    .join("");
  chunks.push(ascii(`${xref}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${offset}\n%%EOF\n`));

  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
