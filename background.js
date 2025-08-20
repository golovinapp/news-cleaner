// background.js — MV3 service worker for News Cleaner
// - Click on the toolbar icon toggles global "enabled"
// - Badge shows OFF when disabled
// - Context menu:
//     • Toggle filtering on this site (allowlist/blocklist)
//     • Open settings

const MENU_TOGGLE_SITE = "news_cleaner_toggle_site";
const MENU_OPEN_SETTINGS = "news_cleaner_open_settings";

function getHostFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return ""; }
}

function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      {
        enabled: true,
        allowlist: [],
        blocklist: [],
      },
      resolve
    );
  });
}

function setConfig(patch) {
  return new Promise((resolve) => chrome.storage.sync.set(patch, resolve));
}

async function toggleHost(host) {
  const cfg = await getConfig();
  const allow = Array.isArray(cfg.allowlist) ? cfg.allowlist.slice() : [];
  const block = Array.isArray(cfg.blocklist) ? cfg.blocklist.slice() : [];

  if (allow.length > 0) {
    const i = allow.indexOf(host);
    if (i >= 0) allow.splice(i, 1); else allow.push(host);
    await setConfig({ allowlist: allow });
  } else {
    const i = block.indexOf(host);
    if (i >= 0) block.splice(i, 1); else block.push(host);
    await setConfig({ blocklist: block });
  }
}

async function isDisabledOnHost(host) {
  const cfg = await getConfig();
  if (cfg.allowlist && cfg.allowlist.length > 0) return !cfg.allowlist.includes(host);
  return Array.isArray(cfg.blocklist) && cfg.blocklist.includes(host);
}

function updateBadge(tabId, host, enabledGlobal = true) {
  if (!enabledGlobal) {
    chrome.action.setBadgeText({ tabId, text: "OFF" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#d32f2f" });
    return;
  }
  isDisabledOnHost(host).then(disabledSite => {
    chrome.action.setBadgeText({ tabId, text: disabledSite ? "OFF" : "" });
    if (disabledSite) chrome.action.setBadgeBackgroundColor({ tabId, color: "#d32f2f" });
  }).catch(() => {});
}

async function updateBadgeForAllTabs() {
  const { enabled } = await getConfig();
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (!tab.id || !tab.url) continue;
      const host = getHostFromUrl(tab.url);
      updateBadge(tab.id, host, enabled);
    }
  });
}

// Create context menu
chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.create({
      id: MENU_TOGGLE_SITE,
      title: "Toggle filtering on this site",
      contexts: ["page"]
    });
  } catch (_) {}
  try {
    chrome.contextMenus.create({
      id: MENU_OPEN_SETTINGS,
      title: "Open settings",
      contexts: ["action", "page"]
    });
  } catch (_) {}
});

// Click on toolbar icon → toggle global enabled
chrome.action.onClicked.addListener(async (tab) => {
  const cfg = await getConfig();
  const next = !cfg.enabled;
  await setConfig({ enabled: next });
  // Badge for current tab
  const host = tab?.url ? getHostFromUrl(tab.url) : "";
  if (tab?.id) updateBadge(tab.id, host, next);
  // And for all tabs
  updateBadgeForAllTabs();
  // content.js сам пересканирует страницу по storage.onChanged
});

// Context menu events
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === MENU_OPEN_SETTINGS) {
    chrome.runtime.openOptionsPage();
    return;
  }
  if (info.menuItemId !== MENU_TOGGLE_SITE || !tab?.url) return;
  const host = getHostFromUrl(tab.url);
  await toggleHost(host);
  if (tab.id) updateBadge(tab.id, host);
});

// React on tab switches / loads
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const cfg = await getConfig();
    const tab = await chrome.tabs.get(tabId);
    const host = getHostFromUrl(tab.url || "");
    updateBadge(tabId, host, cfg.enabled);
  } catch (_) {}
});

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status === "complete" && tab?.url) {
    const cfg = await getConfig();
    const host = getHostFromUrl(tab.url);
    updateBadge(tabId, host, cfg.enabled);
  }
});

// Keep badges in sync when storage changes elsewhere
chrome.storage.onChanged.addListener((_, area) => {
  if (area !== "sync") return;
  updateBadgeForAllTabs();
});
