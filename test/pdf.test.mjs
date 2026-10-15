import assert from "node:assert/strict";
import test from "node:test";
import { bitsFromPixels, labelsPdf } from "../public/pdf.js";

const text = (bytes) => Buffer.from(bytes).toString("latin1");

test("ink is a 0 bit and rows pad to whole bytes", () => {
  const page = bitsFromPixels(10, 2, (x, y) => x === 0 || (y === 1 && x === 9));
  assert.deepEqual([...page.bits], [0x7f, 0xff, 0x7f, 0xbf]);
});

test("one 40x30 mm page per label with a valid xref", async () => {
  const label = bitsFromPixels(320, 240, (x) => x < 16);
  const pdf = text(await labelsPdf([label, label]));
  assert.ok(pdf.startsWith("%PDF-1.4"));
  assert.ok(pdf.trimEnd().endsWith("%%EOF"));
  assert.match(pdf, /\/Count 2 /);
  assert.equal(pdf.match(/\/MediaBox \[0 0 113\.39 85\.04\]/g).length, 2);
  assert.match(pdf, /\/BitsPerComponent 1 \/Filter \/FlateDecode/);

  const start = Number(/startxref\n(\d+)/.exec(pdf)[1]);
  assert.equal(pdf.slice(start, start + 4), "xref");
  const rows = pdf.slice(start).split("\n").slice(3).filter((row) => / n $/.test(row));
  rows.forEach((row, i) => {
    const at = Number(row.slice(0, 10));
    assert.equal(pdf.slice(at, at + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`);
  });
});

test("an empty batch is refused", async () => {
  await assert.rejects(labelsPdf([]), /no label/);
});
