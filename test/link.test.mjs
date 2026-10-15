import assert from "node:assert/strict";
import test from "node:test";
import { cafeFromSearch, ordersFromHash, pageLink } from "../public/link.js";

test("a link carries the order and the cafe", () => {
  const orders = [
    { drink: "Ice latte", pct: "20%", who: "chamnan", size: "" },
    { drink: "Ice latte", pct: "50%", who: "chhat", size: "L" },
    { drink: "Red lemon tea", pct: "", who: "MengOng’s", size: "" },
  ];
  const link = pageLink("https://labels.example/index.html?old=1#j=stale", orders, "Hamster Coffe");
  const url = new URL(link);
  assert.equal(url.origin, "https://labels.example");
  assert.equal(url.pathname, "/index.html");
  assert.equal(cafeFromSearch(url.search), "Hamster Coffe");
  assert.deepEqual(ordersFromHash(url.hash), orders);
});

test("the older pipe link still opens", () => {
  const body = ["Ice latte|20%|chamnan|", "Ice latte|50%|chhat|L"].join("\n");
  const orders = ordersFromHash(`#o=${encodeURIComponent(body)}`);
  assert.deepEqual(orders, [
    { drink: "Ice latte", pct: "20%", who: "chamnan", size: "" },
    { drink: "Ice latte", pct: "50%", who: "chhat", size: "L" },
  ]);
});
