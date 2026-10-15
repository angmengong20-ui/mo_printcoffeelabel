import assert from "node:assert/strict";
import test from "node:test";
import { parseOrders, takeLabels } from "../public/orders.js";

const SAMPLE = `Please order for tomorrow :
1. Ice latte 20%(chamnan)
2. Ice latte 50% (chhat) Size L
3. Ice latte 0% (Leab) Size L
4.Ice Americano 30% (channa)
5.Ice Americano 0% (MengOng’s)
6. Day cha 30% (Molina)
7. Strawberry frappe 40% (Ney)
8. Ice Latte 20% (ZaZa)
9. Red lemon tea (chhean)
`;

test("sample order", () => {
  const orders = parseOrders(SAMPLE);
  assert.equal(orders.length, 9);
  assert.deepEqual(orders[0], { drink: "Ice latte", pct: "20%", who: "chamnan", size: "" });
  assert.equal(orders[1].who, "chhat");
  assert.equal(orders[1].size, "L");
  assert.equal(orders[1].pct, "50%");
  assert.equal(orders[2].pct, "0%");
  assert.equal(orders[2].who, "Leab");
  assert.equal(orders[3].drink, "Ice Americano");
  assert.equal(orders[4].who, "MengOng’s");
  assert.equal(orders[4].pct, "0%");
  assert.equal(orders[6].drink, "Strawberry frappe");
  assert.equal(orders[7].drink, "Ice Latte");
  assert.equal(orders[8].drink, "Red lemon tea");
  assert.equal(orders[8].pct, "");
  assert.equal(orders[8].who, "chhean");
  assert.equal(orders[8].size, "");
});

test("header only is empty", () => {
  assert.deepEqual(parseOrders("Please order for tomorrow :\n"), []);
});

test("size large is read, and latte is not a size", () => {
  const [mocha] = parseOrders("Iced mocha 10% (Aya) Size large");
  assert.equal(mocha.size, "L");
  assert.equal(mocha.drink, "Iced mocha");
  const [latte] = parseOrders("Ice latte (Ney)");
  assert.equal(latte.size, "");
  assert.equal(latte.drink, "Ice latte");
});

test("a batch stops at 40 labels", () => {
  const lines = Array.from({ length: 41 }, (_, i) => `Latte ${i} (Aya)`);
  const batch = takeLabels(parseOrders(lines.join("\n")));
  assert.equal(batch.orders.length, 40);
  assert.equal(batch.omitted, 1);
});

test("menu spelling is restored and sugar levels run 0 to 125", async () => {
  const { MENU, SUGAR_LEVELS, menuName } = await import("../public/menu.js");
  assert.equal(menuName("iced  latte"), "Iced Latte");
  assert.equal(menuName("HOT AMERICANO"), "Hot Americano");
  assert.equal(menuName("Mango smoothie"), "Mango smoothie");
  assert.deepEqual(SUGAR_LEVELS, ["0%", "25%", "50%", "75%", "100%", "125%"]);
  const all = MENU.flatMap(([, drinks]) => drinks);
  assert.equal(new Set(all).size, all.length);
  assert.ok(all.every((drink) => !/[()（）]/.test(drink)));
});
