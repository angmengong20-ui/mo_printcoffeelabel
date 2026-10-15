/**
 * The Day Cha menu, as printed on the shop's menu boards. Names avoid
 * brackets, because a pasted order puts the customer's name in brackets.
 */

export const MENU = [
  ["Brown sugar pearl", [
    "Baked Brown Sugar Pearl Milk Tea + Cream",
    "Baked Brown Sugar Pearl Fresh Milk + Cream",
    "Sweet Potato Brown Sugar Pearl Fresh Milk",
    "Brown Sugar Pearl Milk Tea",
    "Brown Sugar Pearl Fresh Milk",
  ]],
  ["Brown sugar jelly", [
    "Baked Brown Sugar Taiwan Milk Tea Jelly + Cream",
    "Baked Brown Sugar Fresh Milk Jelly + Cream",
    "Brown Sugar Taiwan Milk Tea Jelly",
    "Brown Sugar Fresh Milk Jelly",
  ]],
  ["2 in 1 brown sugar", [
    "Baked Brown Sugar Taiwan Milk Tea Pearl + Jelly + Cream",
    "Baked Brown Sugar Fresh Milk Pearl + Jelly + Cream",
    "Brown Sugar Taiwan Milk Tea Pearl + Jelly",
    "Brown Sugar Fresh Milk Pearl + Jelly",
  ]],
  ["2 in 1 topping", [
    "Taiwan Milk Tea Pearl + Coco Jelly + Cream",
    "Fresh Milk Pearl + Coco Jelly + Cream",
    "Taiwan Milk Tea Pearl + W.Konjack + Cream",
    "Fresh Milk Pearl + W.Konjack + Cream",
    "Taiwan Milk Tea Pearl + B.Konjack + Cream",
    "Fresh Milk Pearl + B.Konjack + Cream",
    "Taiwan Milk Tea Pearl + Grass Jelly + Cream",
    "Fresh Milk Pearl + Grass Jelly + Cream",
  ]],
  ["Day Cha top 6", [
    "Taiwan Milk Tea Jelly + Cream",
    "Brown Sugar Fresh Milk + Jelly + Cream",
    "Taiwan Milk Tea Macchiato",
    "Taiwan Milk Tea Macchiato Oreo",
  ]],
  ["Matcha", [
    "Matcha Latte",
    "Matcha Macchiato",
    "Matcha",
    "Matcha Strawberry",
    "Green Tea with Pearl",
    "Green Tea Frappe with Pearl",
  ]],
  ["Frappe & cream", [
    "Oreo Espresso",
    "Strawberry Oreo",
    "Red Tea Cream",
    "Coffee Frappe Cream",
    "Passion Cream",
    "Strawberry Frappe",
    "Strawberry Frappe Cream",
    "Strawberry Red Tea Cream",
    "Milk Chocolate",
  ]],
  ["Tea & soda", [
    "Passion Soda",
    "Green Lemon Tea",
    "Red Lemon Tea",
  ]],
  ["Iced coffee", [
    "Day Cha Coffee",
    "Traditional Coffee",
    "Iced Latte",
    "Iced Cappuccino",
    "Iced Americano",
    "Coffee Fin",
  ]],
  ["Hot coffee", [
    "Hot Day Cha Coffee",
    "Hot Traditional Coffee",
    "Hot Latte",
    "Hot Cappuccino",
    "Hot Americano",
  ]],
];

export const SUGAR_LEVELS = ["0%", "25%", "50%", "75%", "100%", "125%"];

const byKey = new Map();
for (const [, drinks] of MENU) {
  for (const drink of drinks) byKey.set(key(drink), drink);
}

function key(text) {
  return String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** The menu spelling of a drink typed in any case or spacing, or the text as typed. */
export function menuName(text) {
  return byKey.get(key(text)) || String(text || "").trim();
}
