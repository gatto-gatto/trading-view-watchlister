# TradingView Watchlist Bulk Loader

A Chrome extension that works around TradingView's free-plan limit of ~30 symbols
per watchlist. Paste (or fetch) a big list of symbols, and it splits them into
pages of 30 — each click **clears the current watchlist and loads the next 30**
in one shot. Review those charts, hit **Next**, load again, and walk through your
whole universe 30 at a time.

<!-- Add a screenshot of the popup here. Save the image as screenshot.png in this
     folder (next to manifest.json) and it will show up below. -->
![Watchlist Bulk Loader popup](screenshot.png)

---

## Install (unpacked)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and choose this folder (`tradingview-watchlist-extension`).
4. Pin it (puzzle-piece icon → pin) so it's one click away.

After editing any file, click the **↻ reload** icon on the extension's card for
the change to take effect (and refresh the TradingView tab if you changed
`content.js`).

---

## Quick start

1. Open a **TradingView** chart (`https://www.tradingview.com/chart/`) with the
   **watchlist panel visible** on the right.
2. Click the extension icon.
3. Get symbols into the box — type/paste them, click a **preset**, a **saved
   list**, or **⬇ Fetch from Kite**.
4. Click **Clear & load** — the watchlist is wiped and the current page of 30 is
   added.
5. Review the charts, click **Next ▶**, and **Clear & load** again for the next 30.
   (With **Auto-advance** on, it moves to the next page for you after each load.)

---

## Features

### Build your list
Type or paste symbols in the box — one per line or comma-separated. Use the full
`NSE:RELIANCE` form, or just `RELIANCE` and let the **Default exchange** box
(`NSE`) prepend it. Duplicates are removed automatically.

### Presets
One-click fills for common universes: **Nifty Top 30**, **Nifty 50**, and
**Nifty Next 50**. Edit them (or add your own) in `presets.js`. Index members
change over time, so verify against NSE if it matters.

### My lists (save your own)
Type a name → **＋ Save current** to keep whatever's in the box as a reusable
chip under **My lists**. Click a chip to load it; click its **×** to delete it.
Saved lists persist between sessions.

### Backup: export / import
- **⭳ Export lists** downloads all your saved lists as
  `tradingview-watchlists-YYYY-MM-DD.json`.
- **⭱ Import** loads that file back (same-named lists are overwritten) — handy
  after a reinstall or to move lists to another computer.

### Fetch from Kite (Zerodha)
**⬇ Fetch from Kite** reads the instrument symbols straight off an open
`kite.zerodha.com` tab (your **Holdings** / **Positions** table) and fills the
box with them. It reads symbol *names* only — no quantities, balances, or orders.

### Paging into 30s
Any list longer than the page size is split into chunks (90 symbols → `30 / 30 /
30`). The pager shows **Page 1 / N · #1–30** with a preview; **◀ Prev / Next ▶**
move between pages.

### Options
- **Default exchange** — prepended to bare symbols (default `NSE`).
- **Page size** — symbols per page (default `30`).
- **Auto-advance** — jump to the next page automatically after a successful load.

---

## The main action: Clear & load

`Clear & load` sends the current page's symbols to the TradingView tab, which:

1. **Clears** the watchlist — opens the watchlist title menu
   (`watchlists-button`) → **Clear list** → confirms the **"Clear all symbols?"**
   dialog.
2. **Adds** them — pastes the whole comma-separated list into the **+** search in
   a single action.
3. **Verifies** — counts how many of your symbols actually landed and reports it
   in the status line and the page console. If some didn't take, it lists exactly
   which ones (it does **not** retry them one-by-one).

---

## How it works

The popup (`popup.html` / `popup.js`) can't touch the TradingView page directly,
so it sends the current 30 symbols as a message to `content.js`, which runs
inside the TradingView tab and drives the same UI a person would — using real
`PointerEvent`s aimed at the actual elements (TradingView's menus ignore
synthetic mouse events). `presets.js` holds the built-in lists; the **Fetch from
Kite** scraper is injected into the Kite tab on demand via `chrome.scripting`.

---

## Where your data is stored

Everything is offline, in the extension's `chrome.storage.local` (this Chrome
profile, no internet):

- `tvbl` — the current box text and settings (exchange, page size, auto-advance,
  page position).
- `tvbl_lists` — your saved named lists.

This survives browser restarts and extension reloads, but is wiped if you
**uninstall** the extension — use **Export** for a file backup that doesn't.

---

## Troubleshooting

TradingView and Kite change their HTML from time to time. Everything
site-specific for TradingView lives in the `SEL` object at the top of
`content.js` (watchlist rows, the title `watchlists-button`, the search input,
the results, the menus). For Kite it's the selector in `scrapeKiteSymbols`
(`popup.js`).

Open the page console (F12) and look for `[TV-Bulk]` logs — they say which step
ran or failed:

- `opened list menu via watchlists-button` → `cleared via 'Clear list'` — clear worked.
- `pasted all 30 symbols` / `pasted 28/30; 2 did NOT get added: …` — add result.
- `Kite scrape: N […]` (on the **Kite** tab) — what Fetch from Kite found.

Symbol format: TradingView uses underscores for special characters
(`M&M → NSE:M_M`, `BAJAJ-AUTO → NSE:BAJAJ_AUTO`). Kite-fetched symbols keep their
original form; anything that doesn't resolve will be named in the `pasted X/30`
log so you can fix it.

---

## File layout

| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest, permissions, script registration |
| `popup.html` / `popup.css` / `popup.js` | the toolbar popup UI and its logic |
| `presets.js` | built-in symbol lists (Nifty Top 30 / 50 / Next 50) |
| `content.js` | runs on TradingView — clears and bulk-adds the watchlist |
| `icons/` | toolbar icons |
| `generate_icons.py` | regenerates the icons (standard library only) |

---

## Requirements & limits

- Chrome (or any Chromium browser) with Developer mode.
- A TradingView account, logged in, with the watchlist panel open.
- Works on `*.tradingview.com`; Fetch from Kite needs an open `kite.zerodha.com`
  tab.
