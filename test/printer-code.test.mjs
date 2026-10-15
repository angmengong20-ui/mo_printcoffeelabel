import assert from "node:assert/strict";
import test from "node:test";
import { isMacAddress, printerFilters, printerNameFromCode } from "../public/printer-code.js";
import { printErrorMessage } from "../public/protocol.js";

test("a sticker code becomes the printer name", () => {
  assert.equal(printerNameFromCode("P1-6081215065"), "P1-6081215065");
  assert.equal(printerNameFromCode("p1 6081215065"), "P1-6081215065");
  assert.equal(printerNameFromCode("P1_6081215065"), "P1-6081215065");
  assert.equal(
    printerNameFromCode("https://example.com/p?name=P1-6081215065"),
    "P1-6081215065",
  );
});

test("a hardware address is not used as the bluetooth name", () => {
  assert.equal(isMacAddress("28:D4:1E:3D:DC:AB"), true);
  assert.equal(isMacAddress("28D41E3DDCAB"), true);
  assert.equal(printerNameFromCode("28:D4:1E:3D:DC:AB"), "");
  assert.equal(printerNameFromCode("28D41E3DDCAB"), "");
});

test("filters stay on the named printer", () => {
  assert.deepEqual(printerFilters("P1-6081215065"), [
    { name: "P1-6081215065" },
    { name: "P16081215065" },
    { name: "P1_6081215065" },
  ]);
  assert.deepEqual(printerFilters(""), [{ namePrefix: "P1" }]);
});

test("printer errors stay usable", () => {
  const missed = new Error("User cancelled the requestDevice() chooser.");
  missed.name = "NotFoundError";
  assert.match(printErrorMessage(missed), /Printer not found/);
  const blocked = new Error("blocked");
  blocked.name = "NotAllowedError";
  assert.match(printErrorMessage(blocked), /blocked Bluetooth/);
  const dropped = new Error("disconnected");
  dropped.name = "NetworkError";
  assert.match(printErrorMessage(dropped, true), /Tap Connect and print again/);
});
