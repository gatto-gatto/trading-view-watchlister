"use strict";

const $ = (id) => document.getElementById(id);
const el = {
  symbols: $("symbols"),
  count: $("count"),
  exchange: $("exchange"),
  pageSize: $("pageSize"),
  autoAdvance: $("autoAdvance"),
  prev: $("prev"),
  next: $("next"),
  pageInfo: $("pageInfo"),
  pagePreview: $("pagePreview"),
  load: $("load"),
  status: $("status"),
  bar: $("bar"),
  clearText: $("clearText"),
  listName: $("listName"),
  saveList: $("saveList"),
  myLists: $("myLists"),
};

let page = 0; // current page index

// ---- Symbol parsing -------------------------------------------------------
function parseSymbols(text, defExchange) {
  const ex = (defExchange || "").trim().toUpperCase();
  const seen = new Set();
  const out = [];
  text.split(/[\n,;]+/).forEach((raw) => {
    let s = raw.trim().toUpperCase();
    if (!s) return;
    if (ex && !s.includes(":")) s = `${ex}:${s}`;
    if (!seen.has(s)) { seen.add(s); out.push(s); }
  });
  return out;
}

function pageSize() {
  const n = parseInt(el.pageSize.value, 10);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

function allSymbols() {
  return parseSymbols(el.symbols.value, el.exchange.value);
}

function pageCount() {
  return Math.max(1, Math.ceil(allSymbols().length / pageSize()));
}

function currentPageSymbols() {
  const ps = pageSize();
  return allSymbols().slice(page * ps, page * ps + ps);
}

// ---- UI sync --------------------------------------------------------------
function render() {
  const total = allSymbols().length;
  const pages = pageCount();
  if (page >= pages) page = pages - 1;
  if (page < 0) page = 0;

  el.count.textContent = `${total} symbol${total === 1 ? "" : "s"}`;
  el.count.style.color = total > 0 ? "var(--blue)" : "var(--muted)";

  const cur = currentPageSymbols();
  const ps = pageSize();
  el.pageInfo.textContent = total
    ? `Page ${page + 1} / ${pages}  ·  #${page * ps + 1}–${page * ps + cur.length}`
    : "Page 0 / 0";
  el.pagePreview.textContent = cur.length ? cur.join(", ") : "—";

  el.prev.disabled = page <= 0;
  el.next.disabled = page >= pages - 1;
  el.load.disabled = cur.length === 0;
  el.load.textContent = cur.length
    ? `Clear & load ${cur.length} symbol${cur.length === 1 ? "" : "s"}`
    : "Clear & load this page";

  saveState();
}

function setStatus(text, kind) {
  el.status.className = "status" + (kind ? " " + kind : "");
  el.status.innerHTML = text;
}

// ---- Persistence ----------------------------------------------------------
function saveState() {
  chrome.storage.local.set({
    tvbl: {
      text: el.symbols.value,
      exchange: el.exchange.value,
      pageSize: el.pageSize.value,
      autoAdvance: el.autoAdvance.checked,
      page,
    },
  });
}

function loadState() {
  return new Promise((resolve) => {
    chrome.storage.local.get("tvbl", (data) => {
      const s = data && data.tvbl;
      if (s) {
        el.symbols.value = s.text || "";
        el.exchange.value = s.exchange ?? "NSE";
        el.pageSize.value = s.pageSize || 30;
        el.autoAdvance.checked = s.autoAdvance !== false;
        page = s.page || 0;
      }
      resolve();
    });
  });
}

// ---- Run the loader on the active TradingView tab -------------------------
async function getTradingViewTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https:\/\/[^/]*tradingview\.com\//.test(tab.url || "")) return null;
  return tab;
}

async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING" });
  } catch (_) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  }
}

function onProgress(msg) {
  if (!msg || msg.type !== "PROGRESS") return;
  setStatus(msg.text, "work");
  if (msg.total) {
    el.bar.hidden = false;
    el.bar.max = msg.total;
    el.bar.value = msg.added || 0;
  }
}

async function loadCurrentPage() {
  const symbols = currentPageSymbols();
  if (!symbols.length) return;

  const tab = await getTradingViewTab();
  if (!tab) {
    setStatus("Active tab is not TradingView. Open a <b>tradingview.com</b> chart and try again.", "err");
    return;
  }

  el.load.disabled = true;
  el.bar.hidden = true;
  el.bar.value = 0;
  setStatus("Connecting to the page…", "work");
  chrome.runtime.onMessage.addListener(onProgress);

  try {
    await ensureContentScript(tab.id);
    const res = await chrome.tabs.sendMessage(tab.id, { type: "RUN", symbols });

    if (!res || !res.ok) throw new Error((res && res.error) || "No response from page.");

    const { added, total, matched } = res;
    const ok = matched ?? added;
    setStatus(
      `Done — <b>${ok}/${total}</b> on the watchlist (cleared ${res.cleared || 0}).` +
        (ok < total ? " Some symbols may not exist on this exchange." : ""),
      ok < total ? "err" : "ok"
    );

    if (el.autoAdvance.checked && page < pageCount() - 1) {
      page += 1;
      render();
    }
  } catch (err) {
    setStatus("Failed: " + (err.message || err) + " — make sure a watchlist panel is open on the right.", "err");
  } finally {
    chrome.runtime.onMessage.removeListener(onProgress);
    el.load.disabled = false;
    setTimeout(() => (el.bar.hidden = true), 1500);
  }
}

// ---- Saved custom lists ---------------------------------------------------
function loadCustomLists() {
  return new Promise((res) => chrome.storage.local.get("tvbl_lists", (d) => res(d.tvbl_lists || {})));
}
function saveCustomLists(obj) {
  return new Promise((res) => chrome.storage.local.set({ tvbl_lists: obj }, res));
}

async function renderCustomChips() {
  const lists = await loadCustomLists();
  const names = Object.keys(lists);
  el.myLists.textContent = "";
  if (!names.length) return;
  const label = document.createElement("span");
  label.className = "muted small";
  label.textContent = "My lists:";
  el.myLists.appendChild(label);
  for (const name of names) {
    const chip = document.createElement("span");
    chip.className = "chip custom";
    chip.dataset.list = name;
    chip.title = `${lists[name].length} symbols — click to load`;
    chip.textContent = name + " ";
    const x = document.createElement("b");
    x.className = "x";
    x.dataset.del = name;
    x.title = "Delete this list";
    x.textContent = "×";
    chip.appendChild(x);
    el.myLists.appendChild(chip);
  }
}

async function saveCurrentList() {
  const name = (el.listName.value || "").trim();
  const symbols = allSymbols();
  if (!name) { setStatus("Type a name first, then Save.", "err"); el.listName.focus(); return; }
  if (!symbols.length) { setStatus("Nothing to save — the box is empty.", "err"); return; }
  const lists = await loadCustomLists();
  const existed = name in lists;
  lists[name] = symbols;
  await saveCustomLists(lists);
  el.listName.value = "";
  await renderCustomChips();
  setStatus(`${existed ? "Updated" : "Saved"} “${name}” (${symbols.length} symbols).`, "ok");
}

async function deleteCustomList(name) {
  const lists = await loadCustomLists();
  delete lists[name];
  await saveCustomLists(lists);
  await renderCustomChips();
  setStatus(`Deleted “${name}”.`);
}

async function fillFromCustomList(name) {
  const lists = await loadCustomLists();
  if (lists[name]) { el.symbols.value = lists[name].join("\n"); page = 0; render(); }
}

el.myLists.addEventListener("click", (e) => {
  const del = e.target.closest("[data-del]");
  if (del) { deleteCustomList(del.dataset.del); return; }
  const fill = e.target.closest("[data-list]");
  if (fill) fillFromCustomList(fill.dataset.list);
});
el.saveList.addEventListener("click", saveCurrentList);
el.listName.addEventListener("keydown", (e) => { if (e.key === "Enter") saveCurrentList(); });

// ---- Wire up --------------------------------------------------------------
el.symbols.addEventListener("input", () => { page = 0; render(); });
el.exchange.addEventListener("input", render);
el.pageSize.addEventListener("input", () => { page = 0; render(); });
el.autoAdvance.addEventListener("change", saveState);
el.prev.addEventListener("click", () => { page -= 1; render(); });
el.next.addEventListener("click", () => { page += 1; render(); });
el.load.addEventListener("click", loadCurrentPage);
el.clearText.addEventListener("click", () => { el.symbols.value = ""; page = 0; render(); });

document.querySelectorAll(".chip[data-preset]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const list = (window.PRESETS || {})[btn.dataset.preset];
    if (list) { el.symbols.value = list.join("\n"); page = 0; render(); }
  });
});

loadState().then(render);
renderCustomChips();
