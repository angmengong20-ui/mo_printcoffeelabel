import assert from "node:assert/strict";
import test from "node:test";
import { ordersCsv } from "../public/csv.js";

test("one row per sticker with quoted commas and quotes", () => {
  const csv = ordersCsv([
    { drink: "Iced Latte", pct: "50%", who: "Aya", size: "L" },
    { drink: "Taiwan Milk Tea Pearl + Coco Jelly, Cream", pct: "", who: 'Rith "R"', size: "" },
  ], "Day Cha");
  assert.equal(csv,
    "﻿No,Cafe,Drink,Sugar,Name,Size\r\n"
    + "1,Day Cha,Iced Latte,50%,Aya,L\r\n"
    + '2,Day Cha,"Taiwan Milk Tea Pearl + Coco Jelly, Cream",,"Rith ""R""",\r\n');
});

test("Khmer names pass through unchanged", () => {
  assert.match(ordersCsv([{ drink: "Iced Latte", pct: "25%", who: "សុភា", size: "M" }]), /,សុភា,M\r\n$/);
});
