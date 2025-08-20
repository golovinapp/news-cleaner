// News Cleaner — content script (MV3) — v1.1.0

// ==== Конфиг по умолчанию ====
const DEFAULT_CONFIG = {
  enabled: true,
  mode: "hide",          // "hide" | "blur"
  aggressive: false,     // если true — анализируем больше контейнеров
  keywords: [
    // Trump
    "trump", "donald trump", "дональд трамп", "трамп",
    // Putin
    "putin", "vladimir putin", "владимир путин", "путин", "путін", "володимир путін",
    // Zelensky
    "zelensky", "zelenskiy", "zelenskyy", "volodymyr zelensky",
    "владимир зеленский", "володимир зеленський", "зеленский", "зеленський"
  ],
  // Доменные списки
  allowlist: [], // если непустой — фильтр работает только на доменах из этого списка
  blocklist: []  // домены, где фильтр принудительно отключён
};

// ==== Доменные особенности (селекторы) ====
const SITE_EXTRA_SELECTORS = {
  "lenta.ru": [
    '[class^="card-"]', '[class*=" card-"]',
    '.topnews', '.b-top7', '.b-yellow-box',
    '.rubric__content', '.section', '.columns', '.grid'
  ]
};

let state = {
  enabled: true,
  mode: "hide",
  aggressive: false,
  keywordsLower: DEFAULT_CONFIG.keywords.map(k => k.toLowerCase()),
  allowlist: [],
  blocklist: []
};

// ==== Стили ====
(function injectStyles() {
  if (document.getElementById("tpz-style")) return;
  const style = document.createElement("style");
  style.id = "tpz-style";
  style.textContent = `
    .tpz-hidden { display: none !important; }
    .tpz-blur { filter: blur(8px) !important; pointer-events: none !important; }
    .tpz-reveal-btn {
      position: absolute; top: 8px; right: 8px; z-index: 2147483647;
      padding: 4px 8px; font: 12px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      border: 1px solid #bbb; border-radius: 4px; background: #fff; cursor: pointer;
    }
  `;
  document.documentElement.appendChild(style);
})();

// ==== Загрузка настроек ====
function loadConfig() {
  return new Promise(resolve => {
    chrome.storage.sync.get(DEFAULT_CONFIG, (cfg) => {
      state.enabled = !!cfg.enabled;
      state.mode = cfg.mode === "blur" ? "blur" : "hide";
      state.aggressive = !!cfg.aggressive;
      state.keywordsLower = (cfg.keywords || DEFAULT_CONFIG.keywords).map(k => String(k).toLowerCase());
      state.allowlist = Array.isArray(cfg.allowlist) ? cfg.allowlist : [];
      state.blocklist = Array.isArray(cfg.blocklist) ? cfg.blocklist : [];
      rebuildRegexes();
      resolve();
    });
  });
}

// ==== Доменные правила ====
function currentHost() {
  try { return location.hostname.replace(/^www\./, ""); } catch (_) { return ""; }
}

function isDomainAllowed() {
  const host = currentHost();
  if (state.blocklist.includes(host)) return false;
  if (state.allowlist.length > 0) return state.allowlist.includes(host);
  return true; // по умолчанию разрешаем
}

// ==== Матчинг по regex с границами слова ====
let keywordRegexes = [];
function rebuildRegexes() {
  keywordRegexes = state.keywordsLower.map(k => {
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // границы по буквенно-цифровым символам (Unicode)
    const pattern = `(?<![\\p{L}\\p{M}\\p{N}_])${esc}(?![\\p{L}\\p{M}\\p{N}_])`;
    return new RegExp(pattern, "iu");
  });
}

function textMatches(text) {
  if (!text) return false;
  const s = text.toLowerCase();
  return keywordRegexes.some(rx => rx.test(s));
}

// ==== Поиск текста и контейнеров ====
const processed = new WeakSet();
const HIDE_CLASS = () => (state.mode === "blur" ? "tpz-blur" : "tpz-hidden");

function getRelevantText(el) {
  const heads = el.querySelectorAll('h1, h2, h3, h4, [itemprop="headline"], a[aria-label]');
  for (const h of heads) {
    const t = h.textContent && h.textContent.trim();
    if (t && t.length >= 2) return t;
  }
  const raw = el.innerText || el.textContent || "";
  return raw.slice(0, 8000);
}

function addRevealButton(el) {
  // оборачиваем, чтобы разместить кнопку в относительном контейнере
  if (!el.parentNode) return;
  const wrapper = document.createElement("div");
  wrapper.style.position = "relative";
  el.parentNode.insertBefore(wrapper, el);
  wrapper.appendChild(el);

  const btn = document.createElement("button");
  btn.className = "tpz-reveal-btn";
  btn.textContent = "Показать";
  wrapper.appendChild(btn);

  btn.addEventListener("click", () => {
    el.classList.remove("tpz-hidden", "tpz-blur");
    el.removeAttribute("data-tpz-hidden");
    btn.remove();
  });
}

function markHide(el) {
  if (!el) return;
  if (el.classList.contains("tpz-hidden") || el.classList.contains("tpz-blur")) return;
  el.classList.add(HIDE_CLASS());
  el.dataset.tpzHidden = "1";
  addRevealButton(el);
}

function findContainer(node) {
  const LIMIT = 8;
  let el = node && (node.nodeType === 1 ? node : node.parentElement);
  let steps = 0;
  while (el && steps++ < LIMIT) {
    if (el.matches && el.matches(
      'article, [role="article"], section, ' +
      '.article, .story, .card, .post, .teaser, .news, ' +
      '[class*="article"], [class*="story"], [class*="card"], [class*="post"], [class*="news"]'
    )) return el;

    if (typeof el.className === "string" && /(^|\s)card-/.test(el.className)) return el; // lenta.ru
    el = el.parentElement;
  }
  return node && (node.nodeType === 1 ? node : node.parentElement);
}

function candidates(root = document) {
  const base = [
    "article", '[role="article"]', "section",
    ".article", ".story", ".card", ".post", ".teaser", ".news",
    '[class*="article"]', '[class*="story"]', '[class*="card"]', '[class*="post"]', '[class*="news"]'
  ];

  const host = currentHost();
  if (SITE_EXTRA_SELECTORS[host]) base.push(...SITE_EXTRA_SELECTORS[host]);

  const set = new Set();
  root.querySelectorAll(base.join(",")).forEach(el => set.add(el));

  // заголовки/ссылки -> поднимаемся к контейнеру
  root.querySelectorAll('h1, h2, h3, h4, a[aria-label], a[href*="/news/"], a[href*="/articles/"]').forEach(h => {
    const txt = h.textContent && h.textContent.trim();
    if (txt && textMatches(txt)) set.add(findContainer(h));
  });

  if (state.aggressive) {
    root.querySelectorAll("li, .item, .entry, .result, .tile").forEach(el => set.add(el));
  }
  return Array.from(set);
}

function scan(root = document) {
  if (!state.enabled || !isDomainAllowed()) return;
  for (const el of candidates(root)) {
    if (processed.has(el)) continue;
    processed.add(el);
    try {
      const txt = getRelevantText(el);
      if (textMatches(txt)) markHide(el);
    } catch (_) { /* no-op */ }
  }
}

// ==== Дебаунс для MutationObserver ====
let scheduled = false;
function scheduleScan(target) {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    scan(target || document);
  });
}

// ==== Инициализация ====
loadConfig().then(() => {
  scan(document);

  const mo = new MutationObserver(muts => {
    if (!state.enabled) return;
    for (const m of muts) {
      for (const node of m.addedNodes) {
        if (node && node.nodeType === 1) scheduleScan(node);
      }
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
});

// ==== Горячие изменения настроек ====
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  let needRescan = false;

  if ("enabled" in changes) state.enabled = !!changes.enabled.newValue;
  if ("mode" in changes) { state.mode = changes.mode.newValue === "blur" ? "blur" : "hide"; needRescan = true; }
  if ("aggressive" in changes) { state.aggressive = !!changes.aggressive.newValue; needRescan = true; }

  if ("keywords" in changes) {
    state.keywordsLower = (changes.keywords.newValue || []).map(k => String(k).toLowerCase());
    rebuildRegexes();
    needRescan = true;
  }
  if ("allowlist" in changes) { state.allowlist = changes.allowlist.newValue || []; needRescan = true; }
  if ("blocklist" in changes) { state.blocklist = changes.blocklist.newValue || []; needRescan = true; }

  if (needRescan) {
    document.querySelectorAll(".tpz-hidden, .tpz-blur").forEach(el => {
      el.classList.remove("tpz-hidden", "tpz-blur");
      el.removeAttribute("data-tpz-hidden");
      processed.delete(el);
    });
    scan(document);
  }
});
