# TradingView Watchlist Bulk Loader

A Chrome extension that works around the free-plan limit of ~30 symbols per
watchlist. Paste any list of symbols (Nifty 50, Nifty 100, your own universe),
and it splits them into pages of 30. For each page it **clears the current
watchlist and adds that page's symbols** in one click — so you can flip through
your whole universe 30 at a time.

## Install (unpacked)

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and choose this folder:
   `tradingview-watchlist-extension`
4. Pin the extension (puzzle-piece icon → pin).

## Use

1. Open a **TradingView** chart (`https://www.tradingview.com/chart/`) and make
   sure the **Watchlist panel is visible** on the right.
2. Click the extension icon.
3. Paste your symbols, or hit **Nifty 50** / **Nifty Next 50** to fill them in.
   - One per line or comma-separated. `NSE:RELIANCE` or just `RELIANCE`
     (the **Default exchange** box, `NSE`, is prepended when you omit it).
4. The list is paged into 30s. Use **◀ Prev / Next ▶** to pick a page.
5. Click **Clear & load this page**. The watchlist is wiped and the 30 symbols
   are added.
6. With **Auto-advance** on, it jumps to the next page automatically — review
   your charts, reopen the popup, and click **load** again for the next 30.

Your list, exchange, page size and position are remembered between sessions.

## How it works

The popup sends the current page's symbols to a content script
(`content.js`) running on the TradingView tab. That script drives the same UI
you would: it right-click → **Remove**s each existing row to clear the list,
then opens the watchlist **+** search and adds each symbol.

## If it stops working

TradingView changes its HTML from time to time. Everything site-specific lives
in the `SEL` object at the top of `content.js` (the watchlist rows, the **+**
button, the search input, the results dropdown, the context menu). Open the page
console (F12) and look for `[TV-Bulk]` logs to see which step failed, then adjust
the matching selector. No other file needs to change.

## Notes

- Index constituents change. The built-in **Nifty 50 / Next 50** lists are
  best-effort — verify against NSE and edit `presets.js` (or just paste your
  own list, which is the intended workflow).
- Page size defaults to 30 but is adjustable in the popup.
# trading-view-watchlister
