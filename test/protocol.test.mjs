import assert from "node:assert/strict";
import test from "node:test";
import { build, imageToCommands } from "../public/protocol.js";

const DENSITY = "1f430106b5";
const SPEED = "1f440101b9";
const INIT = "1f2008403000000000000067";
const DOTS = "1f20084030000000000000671f27022801ad1f212a000080000000000000000000000000000000000000000000000000000000000000000000000000000000341f21020128b31f21290001200000000000000000000000000000000000000000000000000000000000000000000000000000941f2103c0eb28081f2800d7";
const BLANK = "1f20084030000000000000671f27022801ad1f2103c0ef28041f2800d7";

function dots() {
  const black = new Set(["0,0", "10,3"]);
  return imageToCommands(320, 240, (x, y) => black.has(`${x},${y}`));
}

test("packets match a job the P1 already printed", () => {
  assert.equal(Buffer.from(build(0x43, [0x06])).toString("hex"), DENSITY);
  assert.equal(Buffer.from(build(0x44, [0x01])).toString("hex"), SPEED);
  assert.equal(Buffer.from(build(0x20, [0x40, 0x30, 0, 0, 0, 0, 0, 0])).toString("hex"), INIT);
  assert.equal(Buffer.from(dots()).toString("hex"), DOTS);
  assert.equal(Buffer.from(imageToCommands(320, 240, () => false)).toString("hex"), BLANK);
});
