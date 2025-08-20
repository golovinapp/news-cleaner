// background.js — service worker
// - stores per-tab blocked count (from content.js)
// - popup asks for status / toggles global / toggles site
// - badge shows OFF when disabled (global or per-site)

const MENU_TOGGLE_SITE = "news_cleaner_toggle_site";
const MENU_OPEN_SETTINGS = "news_cleaner_open_settings";

const tabCounts = new Map(); // tabId -> number

function getHostFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch (_) { return ""; }
}

function getConfig() {
  return new Promise(r => chrome.storage.sync.get({
    enabled: true, allowlist: [], blocklist: []
  }, r));
}
function setConfig(patch) { return new Promise(r => chrome.storage.sync.set(patch, r)); }

async function isDisabledOnHost(host) {
  const cfg = await getConfig();
  if (!cfg.enabled) return true;
  if (cfg.allowlist && cfg.allowlist.length > 0) return !cfg.allowlist.includes(host);
  return (cfg.blocklist || []).includes(host);
}
async function toggleHost(host) {
  const cfg = await getConfig();
  if (cfg.allowlist && cfg.allowlist.length > 0) {
    const a = new Set(cfg.allowlist);
    a.has(host) ? a.delete(host) : a.add(host);
    await setConfig({ allowlist: Array.from(a) });
  } else {
    const b = new Set(cfg.blocklist || []);
    b.has(host) ? b.delete(host) : b.add(host);
    await setConfig({ blocklist: Array.from(b) });
  }
}

function updateBadge(tabId, host) {
  getConfig().then(cfg => {
    if (!cfg.enabled) {
      chrome.action.setBadgeText({ tabId, text: "OFF" });
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#d32f2f" });
      return;
    }
    isDisabledOnHost(host).then(disabled => {
      chrome.action.setBadgeText({ tabId, text: disabled ? "OFF" : "" });
      if (disabled) chrome.action.setBadgeBackgroundColor({ tabId, color: "#d32f2f" });
    });
  });
}
function refreshBadgesAll() {
  chrome.tabs.query({}, (tabs) => tabs.forEach(t => {
    if (!t.id || !t.url) return;
    updateBadge(t.id, getHostFromUrl(t.url));
  }));
}

// Context menu items
chrome.runtime.onInstalled.addListener(() => {
  try { chrome.contextMenus.create({ id: MENU_TOGGLE_SITE, title: "Toggle filtering on this site", contexts: ["page"] }); } catch(_) {}
  try { chrome.contextMenus.create({ id: MENU_OPEN_SETTINGS, title: "Open settings", contexts: ["action","page"] }); } catch(_) {}
});

// Messages from content & popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg.type === 'nc_count' && sender.tab?.id != null) {
      tabCounts.set(sender.tab.id, msg.count|0);
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === 'nc_popup_status') {
      const cfg = await getConfig();
      let tabId = msg.tabId || sender.tab?.id;
      let url = msg.url || sender.tab?.url || "";
      const host = getHostFromUrl(url);
      const siteDisabled = await isDisabledOnHost(host);
      const count = tabCounts.get(tabId) || 0;
      sendResponse({ host, count, enabled: !!cfg.enabled, siteDisabled });
      return;
    }
    if (msg.type === 'nc_toggle_global') {
      const cfg = await getConfig();
      await setConfig({ enabled: !cfg.enabled });
      refreshBadgesAll();
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === 'nc_toggle_site') {
      const host = getHostFromUrl(msg.url || sender.tab?.url || "");
      if (host) await toggleHost(host);
      if (sender.tab?.id) updateBadge(sender.tab.id, host);
      sendResponse({ ok: true });
      return;
    }
  })();
  // keep channel open for async sendResponse
  return true;
});

// Keep badges in sync
chrome.tabs.onActivated.addListener(({tabId}) => {
  chrome.tabs.get(tabId, tab => tab && updateBadge(tabId, getHostFromUrl(tab.url||"")));
});
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === "complete" && tab?.url) updateBadge(tabId, getHostFromUrl(tab.url));
});
chrome.storage.onChanged.addListener((_, area) => { if (area==="sync") refreshBadgesAll(); });

// Optional context menu handlers
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_OPEN_SETTINGS) chrome.runtime.openOptionsPage();
  if (info.menuItemId === MENU_TOGGLE_SITE && tab?.url) {
    toggleHost(getHostFromUrl(tab.url)).then(() => updateBadge(tab.id, getHostFromUrl(tab.url)));
  }
});
