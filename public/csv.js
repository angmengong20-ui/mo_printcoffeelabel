/**
 * The order as a spreadsheet for WePrint's Excel/CSV printing: one row per
 * sticker, one column per text box on the label template.
 */

export const CSV_COLUMNS = ["No", "Cafe", "Drink", "Sugar", "Name", "Size"];

function cell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** UTF-8 with a byte order mark, so Excel keeps Khmer names, and CRLF line ends. */
export function ordersCsv(orders, cafe = "") {
  const rows = orders.map((order, i) => [i + 1, cafe, order.drink, order.pct, order.who, order.size]);
  return `﻿${[CSV_COLUMNS, ...rows].map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`;
}
