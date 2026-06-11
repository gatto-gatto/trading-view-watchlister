"use strict";
/*
 * Runs inside tradingview.com. Clears the active watchlist and adds a list of
 * symbols by driving the same UI a human uses (the watchlist "+" search box and
 * the right-click "Remove" menu). All selectors are grouped in SEL so they are
 * easy to repair if TradingView changes its markup. Verbose logs go to the
 * page console under the [TV-Bulk] tag.
 */
(() => {
  if (window.__tvBulkLoaded) return;        // avoid double-injection
  window.__tvBulkLoaded = true;

  const TAG = "%c[TV-Bulk]";
  const CSS = "color:#2962ff;font-weight:bold";
  const log = (...a) => console.log(TAG, CSS, ...a);
  const warn = (...a) => console.warn(TAG, CSS, ...a);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitFor(fn, { timeout = 5000, interval = 80 } = {}) {
    const start = Date.now();
    for (;;) {
      let v;
      try { v = fn(); } catch (_) { v = null; }
      if (v) return v;
      if (Date.now() - start >= timeout) return null;
      await sleep(interval);
    }
  }

  // ---- Selectors (the only TradingView-specific knowledge) ----------------
  const SEL = {
    // Container of the watchlist widget in the right sidebar. We anchor it by
    // climbing up from a real symbol row (always present) to the widget wrapper,
    // so the title/header is guaranteed to be inside the returned root.
    watchlistRoot: () => {
      const row = document.querySelector("[data-symbol-full]");
      if (row) {
        let n = row;
        for (let i = 0; i < 14 && n.parentElement; i++) {
          n = n.parentElement;
          if (/widgetbar-widget-watchlist|watchlist/i.test(n.className || "")) return n;
        }
      }
      return (
        document.querySelector('[class*="widgetbar-widget-watchlist"], [class*="watchlist" i]') ||
        document
      );
    },

    // Rows: each watchlist symbol carries data-symbol-full="NSE:RELIANCE".
    rows: () => {
      const root = SEL.watchlistRoot();
      const rows = Array.from(root.querySelectorAll("[data-symbol-full]"));
      // Keep only visible list rows (exclude hidden / detached nodes).
      return rows.filter((r) => r.offsetParent !== null);
    },

    // The "+" button that opens the add-symbol search inside the watchlist.
    addButton: () =>
      document.querySelector(
        'button[data-name="add-symbol-button"], [data-name="add-symbol-button"], ' +
          'button[aria-label*="Add symbol" i], div[data-name="add-symbol-button"]'
      ),

    // Candidate elements that might open the list dropdown (the menu holding
    // "Clear list" / "Create new list" / "Upload list", see screenshot). We can't
    // rely on one fixed selector across TradingView builds, so we gather a broad,
    // de-duped, ordered set of likely triggers and let openWatchlistMenu try each,
    // confirming the right one by the menu's text. Most specific guesses go first.
    menuTriggers: () => {
      const root = SEL.watchlistRoot();
      const set = [];
      // The title dropdown is data-name="watchlists-button" (confirmed). Skip
      // symbol rows (would change the chart) and the two buttons with side effects
      // (add-symbol opens search, advanced-view toggles the layout).
      const SKIP = /add-symbol|advanced-view/i;
      const push = (e) => {
        if (!e || e.offsetParent === null || set.includes(e)) return;
        if (e.hasAttribute("data-symbol-full") || e.closest("[data-symbol-full]")) return;
        if (SKIP.test(e.getAttribute("data-name") || "")) return;
        set.push(e);
      };
      [
        '[data-name="watchlists-button"]', '[data-name="watchlist-title"]',
        '[data-name="watchlist-menu"]', '[data-name="watchlists-dialog-button"]',
      ].forEach((s) => push(document.querySelector(s)));
      root.querySelectorAll('[aria-haspopup]').forEach(push);
      root.querySelectorAll('button, [role="button"], [class*="button" i]').forEach(push);
      root.querySelectorAll("[data-name]").forEach(push); // catch-all: plain-div anchors
      return set.slice(0, 28);
    },

    // The text input of the add-symbol search.
    searchInput: () => {
      const cands = document.querySelectorAll(
        'input[data-role="search"], input[placeholder*="Search" i], ' +
          'input[class*="search" i], [role="dialog"] input[type="text"]'
      );
      for (const c of cands) if (c.offsetParent !== null) return c;
      return null;
    },

    // Rows inside the search-results dropdown.
    searchResults: () =>
      document.querySelectorAll(
        '[data-name="symbol-search-items-dialog-content"] [data-symbol-short], ' +
          '[role="listbox"] [role="option"], [class*="symbol-search"] [data-symbol-short], ' +
          '[data-name="popup-menu-container"] [data-symbol-short]'
      ),

    // Any popup/context menu currently open.
    menu: () =>
      document.querySelector(
        '[data-name="context-menu-container"], [data-name="menu-inner"], ' +
          '[class*="menuWrap"], [role="menu"]'
      ),
  };

  // ---- Synthetic events -----------------------------------------------------
  function fireMouse(el, type, button = 0) {
    const r = el.getBoundingClientRect();
    el.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true, cancelable: true, view: window, button,
        buttons: button === 2 ? 2 : 1,
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
      })
    );
  }

  // Dispatch one event of the correct class at (x,y).
  function fireAt(el, type, x, y) {
    const o = { bubbles: true, cancelable: true, view: window, composed: true, clientX: x, clientY: y };
    if (type.startsWith("pointer")) {
      el.dispatchEvent(new PointerEvent(type, { ...o, pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, buttons: type === "pointerup" ? 0 : 1 }));
    } else {
      el.dispatchEvent(new MouseEvent(type, { ...o, button: 0, buttons: type === "mouseup" || type === "click" ? 0 : 1 }));
    }
  }

  // Click exactly like a real user: aim at the topmost element under the target's
  // centre and fire a single, proper PointerEvent sequence. TradingView's menu
  // items listen for real PointerEvents, so fake MouseEvent-typed "pointerdown"s
  // were silently ignored — this is what makes "Clear list" actually activate.
  function click(el) {
    if (!el) return;
    try { el.scrollIntoView({ block: "center" }); } catch (_) {}
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const target = document.elementFromPoint(x, y) || el;
    for (const t of ["pointerover", "pointerenter", "pointermove", "pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      fireAt(target, t, x, y);
    }
  }

  function rightClick(el) {
    if (!el) return;
    fireMouse(el, "mousedown", 2);
    fireMouse(el, "mouseup", 2);
    fireMouse(el, "contextmenu", 2);
  }

  function pressKey(el, key, keyCode) {
    const opts = { key, code: key, keyCode, which: keyCode, bubbles: true, cancelable: true };
    (el || document.activeElement || document.body).dispatchEvent(new KeyboardEvent("keydown", opts));
    (el || document.activeElement || document.body).dispatchEvent(new KeyboardEvent("keypress", opts));
    (el || document.activeElement || document.body).dispatchEvent(new KeyboardEvent("keyup", opts));
  }
  const pressEnter = (el) => pressKey(el, "Enter", 13);
  const pressEscape = (el) => pressKey(el, "Escape", 27);

  // Set a value on a React-controlled input so its onChange actually fires.
  function setNativeValue(input, value) {
    const proto = window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Simulate pasting text into an input. TradingView's add-symbol box detects a
  // comma-separated list and adds them all at once, but some builds only do that
  // on a real paste event — so we fire a synthetic paste AND set the value.
  function pasteInto(input, text) {
    input.focus();
    try {
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    } catch (_) {}
    setNativeValue(input, text);
  }

  // ---- Menu helpers ---------------------------------------------------------
  // Find the entry inside `container` whose text matches `match`, preferring the
  // SHORTEST match so we hit the actual leaf item ("Clear list") and not a wrapper
  // whose textContent concatenates every entry in the menu.
  function findItemByText(container, match) {
    if (!container) return null;
    let best = null;
    for (const it of container.querySelectorAll("*")) {
      if (it.offsetParent === null) continue;
      const txt = (it.textContent || "").trim();
      if (txt && match.test(txt) && (!best || txt.length < best.txt.length)) best = { el: it, txt };
    }
    return best ? best.el : null;
  }

  // Click an item in the currently-open context menu (the right-click menu).
  async function clickMenuItem(match, { timeout = 2000 } = {}) {
    const menu = await waitFor(SEL.menu, { timeout });
    const item = findItemByText(menu, match);
    if (item) { click(item); return true; }
    return false;
  }

  // Locate an OPEN menu/popup by one of its entries' text — independent of the
  // container's class. Climbs from the matching leaf to its menu/popup ancestor.
  // This is how we recognise the list dropdown even though its markup differs
  // from the right-click context menu.
  function findMenuByItemText(match) {
    for (const e of document.querySelectorAll('div,span,a,li,button,[role="menuitem"]')) {
      if (e.offsetParent === null) continue;
      const txt = (e.textContent || "").trim();
      if (txt.length > 40 || !match.test(txt)) continue; // skip big wrappers
      let m = e;
      for (let i = 0; i < 8 && m.parentElement; i++) {
        m = m.parentElement;
        const dn = m.getAttribute("data-name") || "";
        if (m.getAttribute("role") === "menu" || /menu|popup|dropdown/i.test(dn) ||
            /menu|popup|dropdown/i.test(typeof m.className === "string" ? m.className : "")) return m;
      }
      return e.parentElement;
    }
    return null;
  }

  // Open the watchlist's list dropdown (the one with "Clear list"). Returns the
  // menu element or null. Detection is by the menu's TEXT, so it survives markup
  // differences between TradingView builds.
  async function openWatchlistMenu() {
    const sig = /^clear list$|^create new list$|^upload list$|^make a copy$/i;
    const idOf = (e) => e.getAttribute("data-name") || (typeof e.className === "string" && e.className) || e.tagName;

    let m = findMenuByItemText(sig);
    if (m) return m;

    const triggers = SEL.menuTriggers();
    log(`looking for list menu — ${triggers.length} candidate triggers`);
    for (const trigger of triggers) {
      click(trigger);
      m = await waitFor(() => findMenuByItemText(sig), { timeout: 450 });
      if (m) { log("opened list menu via", idOf(trigger)); return m; }
      // Some other menu/dialog may have opened — close it before the next try.
      if (SEL.menu() || document.querySelector('[role="dialog"]')) { pressEscape(document.body); await sleep(110); }
    }
    return null;
  }

  // "Clear list" pops a confirmation: "Clear all symbols? Doing this will remove
  // all symbols from your watchlist." with Cancel / Clear buttons. Detect it by
  // its text and click the affirmative "Clear" (the shortest exact-"Clear" leaf,
  // never "Cancel").
  async function confirmIfPrompted() {
    const seen = await waitFor(
      () => [...document.querySelectorAll("*")].some(
        (e) => e.offsetParent !== null &&
          /clear all symbols|remove all symbols/i.test(e.textContent || "") &&
          (e.textContent || "").length < 140
      ),
      { timeout: 1500 }
    );
    if (!seen) return false;
    const btn = [...document.querySelectorAll('button,[role="button"],span,div')]
      .filter((e) => e.offsetParent !== null && /^\s*clear\s*$/i.test(e.textContent || ""))
      .sort((a, b) => a.textContent.length - b.textContent.length)[0];
    if (btn) { click(btn); return true; }
    return false;
  }

  // ---- Watchlist reading ----------------------------------------------------
  const norm = (s) => (s || "").toUpperCase().replace(/^[A-Z]+:/, "").replace(/[^A-Z0-9]/g, "");

  function currentSymbols() {
    return SEL.rows().map((r) => r.getAttribute("data-symbol-full"));
  }

  // ---- Clear ---------------------------------------------------------------
  async function clearWatchlist(send) {
    const initial = SEL.rows().length;
    if (!initial) { log("watchlist already empty"); return 0; }

    // Fast path: open the watchlist title dropdown and hit "Clear list" — one
    // action wipes the whole list (instead of removing 30 rows one by one).
    const menu = await openWatchlistMenu();
    if (menu) {
      const item = findItemByText(menu, /^\s*clear list\s*$|^\s*clear all\s*$|^\s*remove all\s*$/i);
      if (item) {
        click(item);
        await sleep(500); // let the "Clear all symbols?" dialog render
        await confirmIfPrompted();
        const emptied = await waitFor(() => SEL.rows().length === 0, { timeout: 4000 });
        if (emptied) { log("cleared via 'Clear list'"); return initial; }
      } else {
        warn("opened list menu but no 'Clear list' item matched");
      }
      pressEscape(document.body);
      await sleep(200);
    } else {
      warn("watchlist menu not found — falling back to per-row removal");
    }

    // Slow path: remove the first row, then wait for THAT row to actually leave
    // the list before moving on. Waiting on the specific node (rather than a fixed
    // sleep + count check) is what makes this reliable despite TradingView's row
    // fade-out animation and its virtualised, node-reusing list. Bail only after
    // several genuine failures in a row, not on one slow render.
    let removed = 0;
    let fails = 0;
    while (fails < 4) {
      const list = SEL.rows();
      if (!list.length) break;
      const row = list[0];
      const sym = row.getAttribute("data-symbol-full");
      const count = list.length;

      rightClick(row);
      const clicked = await clickMenuItem(/^\s*remove(?!\s+all)\b|^\s*delete\b/i, { timeout: 1500 });
      if (!clicked) {
        pressEscape(document.body);
        await sleep(200);
        fails++;
        continue;
      }

      // "Gone" = the node detached, OR a reused node now shows a different symbol,
      // OR the overall row count dropped — whichever happens first.
      const gone = await waitFor(() => {
        if (!document.contains(row)) return true;
        if (row.getAttribute("data-symbol-full") !== sym) return true;
        return SEL.rows().length < count;
      }, { timeout: 2500 });

      if (gone) {
        removed++;
        fails = 0;
        if (send) send(`Clearing… ${removed}/${initial}`);
      } else {
        fails++;
      }
      await sleep(120);
    }
    log(`cleared ${removed}/${initial}`);
    return removed;
  }

  // ---- Add -----------------------------------------------------------------
  async function openSearch() {
    let input = SEL.searchInput();
    if (input) return input;
    const btn = SEL.addButton();
    if (!btn) { warn("add-symbol button not found"); return null; }
    click(btn);
    input = await waitFor(SEL.searchInput, { timeout: 3000 });
    return input;
  }

  async function addOne(symbol) {
    let input = SEL.searchInput();
    if (!input) input = await openSearch();
    if (!input) return false;

    input.focus();
    setNativeValue(input, symbol);
    // Wait for the results dropdown to populate, then commit the top match.
    await waitFor(() => SEL.searchResults().length > 0, { timeout: 2500 });
    await sleep(200);

    const results = SEL.searchResults();
    if (results.length) {
      // Prefer an exact full-symbol match if present, else the first row.
      const want = norm(symbol);
      let target = results[0];
      for (const r of results) {
        const full = r.getAttribute("data-symbol-full") || r.getAttribute("data-symbol-short") || r.textContent;
        if (norm(full) === want) { target = r; break; }
      }
      click(target);
    } else {
      pressEnter(input);
    }
    await sleep(250);
    return true;
  }

  // Paste the whole comma-separated list into the add box and commit once —
  // TradingView parses the commas and adds every symbol in a single action.
  async function addAllAtOnce(symbols, send) {
    const input = await openSearch();
    if (!input) return false;
    send(`Adding ${symbols.length} symbols in one go…`, { added: 0, total: symbols.length });
    pasteInto(input, symbols.join(","));
    await sleep(700);
    pressEnter(input); // commit the list
    await sleep(1300);
    return true;
  }

  const matchedCount = (symbols) => {
    const have = new Set(currentSymbols().map(norm));
    return symbols.filter((s) => have.has(norm(s))).length;
  };

  // ---- Orchestrate ---------------------------------------------------------
  async function run(symbols, send) {
    log("run", symbols);
    send(`Clearing current watchlist…`);
    const cleared = await clearWatchlist(send);

    // Preferred: one-shot paste of the entire comma-separated list.
    await addAllAtOnce(symbols, send);
    let matched = matchedCount(symbols);
    log(`bulk paste landed ${matched}/${symbols.length}`);

    // Fallback: add whatever didn't land, one at a time.
    if (matched < symbols.length) {
      const have = new Set(currentSymbols().map(norm));
      const missing = symbols.filter((s) => !have.has(norm(s)));
      send(`Adding ${missing.length} remaining individually…`);
      let done = 0;
      for (const sym of missing) {
        try { await addOne(sym); } catch (e) { warn("add failed", sym, e); }
        done++;
        send(`Adding remaining ${done}/${missing.length}… (${sym})`, {
          added: symbols.length - missing.length + done, total: symbols.length,
        });
      }
      matched = matchedCount(symbols);
    }

    pressEscape(SEL.searchInput() || document.body);
    await sleep(400);
    log(`finished: ${matched}/${symbols.length} verified on watchlist`);
    return { cleared, added: matched, total: symbols.length, matched };
  }

  // ---- Messaging -----------------------------------------------------------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg) return;
    if (msg.type === "PING") { sendResponse({ ok: true }); return; }
    if (msg.type === "RUN") {
      const send = (text, extra) => {
        try { chrome.runtime.sendMessage({ type: "PROGRESS", text, ...extra }); } catch (_) {}
      };
      run(msg.symbols || [], send)
        .then((res) => sendResponse({ ok: true, ...res }))
        .catch((err) => { warn(err); sendResponse({ ok: false, error: String((err && err.message) || err) }); });
      return true; // keep the channel open for the async response
    }
  });

  log("content script ready");
})();
