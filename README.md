# Print coffee labels

A page for a DETONG P1 (德佟 / WePrint) label printer. Paste a coffee order, check the stickers, and print them over Bluetooth from the browser.

Cloudflare hosts the page. Printing happens on the computer or Android phone next to the printer. A server cannot see Bluetooth, so there is no account and no print queue in the cloud.

The sticker is 40×30 mm, 320×240 dots. It shows the cafe name, the drink, a sweetness percent only when the order wrote one, the person's name, and an outline S, M, or L only when the order wrote a size. It does not add a price.

## Use it

Open the https address in **Chrome, Edge, or Brave** on a computer, or in **Chrome on Android**. Safari and every iPhone browser cannot reach a Bluetooth printer, so on an iPhone use **Save PDF** below.

1. Type the cafe name you want at the top of the sticker.
2. Turn the printer on, close its phone app, and tap **Connect printer**. Pick the printer whose name starts with `P1`. The page remembers it.
3. Paste the order. One drink per line, for example `Ice latte 50% (Rith) Size L`. Pasting makes the labels.
4. Check every sticker, then tap **Print**. Each sticker has a drink dropdown with the Day Cha menu (`public/menu.js`), a sugar level from 0% to 125%, and S/M/L. A drink that is not on the menu stays as typed, and **Other…** lets you type one.

If no printer is connected yet, **Print** opens the same chooser. Only one Bluetooth connection works at a time, and the printer sleeps after about 15 minutes.

**Save PDF** makes one 40×30 mm page per sticker, the same picture the printer would burn. Print it from the printer's own app or any app that prints PDFs at 40×30 mm. On a phone it opens the share sheet.

**Copy link** makes a link to this same page with the order in it. Open that link on the machine that will print.

The type on the sticker is [Inter](https://rsms.me/inter/), under the SIL Open Font License. The license is in `public/fonts/LICENSE.txt`. Khmer letters are not in that font.

## Put it on Cloudflare

The site is the `public` folder. There is no build.

In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**. Choose this repo. Leave the build command empty. Set the output directory to `public`.

Or from this folder, after `npx wrangler login`:

```bash
npm run deploy
```

That runs `wrangler pages deploy public --project-name mo-printcoffeelabel`. Add a custom domain on the project. Bluetooth only works on https, which Pages already serves.

`public/_headers` allows Bluetooth for this site and keeps the page from being cached as a stale copy.

## Order links

A link this page writes looks like:

```text
https://your-domain/?cafe=Your%20Cafe#j=%5B%7B%22drink%22%3A%22Ice%20latte%22%2C%22pct%22%3A%2220%25%22%2C%22who%22%3A%22Aya%22%2C%22size%22%3A%22%22%7D%5D
```

`#j=` is a JSON list of `{ drink, pct, who, size }`. An older `#o=` link still opens. Each line is `drink|pct|who|size`.

## Checks

```bash
node --test
npm run preview
```

`npm run preview` serves the page at `http://127.0.0.1:8787`. Localhost can use Bluetooth. A plain `http` address on another host cannot.

## What this printer accepts

The bytes are the DothanTech LPAPI packets already printed on a P1: density 6, speed 1, writes of 180 bytes, then a short wait for each label. The write channel is the GATT characteristic whose UUID starts with `0000ff02`.
