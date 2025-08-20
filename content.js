// News Cleaner — content script (MV3) — v1.3.0 (inflections RU/UK + possessive EN + auto-indeclinable)

// ==== Default config ====
const DEFAULT_CONFIG = {
  enabled: true,
  mode: "hide",          // "hide" | "blur"
  aggressive: false,     // scan more container types
  keywords: [
    // Trump
    "trump", "donald trump", "дональд трамп", "трамп",
    // Putin
    "putin", "vladimir putin", "владимир путин", "путин", "путін", "володимир путін",
    // Zelensky
    "zelensky", "zelenskiy", "zelenskyy", "volodymyr zelensky",
    "владимир зеленский", "володимир зеленський", "зеленский", "зеленський"
  ],
  allowlist: [],
  blocklist: []
};

// ==== Site-specific selectors ====
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

// ==== Styles ====
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

// ==== Load config ====
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

// ==== Domain rules ====
function currentHost() {
  try { return location.hostname.replace(/^www\./, ""); } catch (_) { return ""; }
}
function isDomainAllowed() {
  const host = currentHost();
  if (state.blocklist.includes(host)) return false;
  if (state.allowlist.length > 0) return state.allowlist.includes(host);
  return true;
}

// ==== Matching with inflections ====
let keywordRegexes = [];

function reEscape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function isLatin(s) { return /^[\p{Script=Latin}\s'’.-]+$/u.test(s); }
function isCyrillicWord(s) { return /^[\p{Script=Cyrillic}-]+$/u.test(s); }

// Indeclinable Cyrillic heuristic
function isLikelyIndeclinableCyrillic(base) {
  if (base === base.toUpperCase() && /^[\p{Lu}\d\-.]+$/u.test(base)) return true; // acronyms like США
  const w = base.toLowerCase();
  if (/[оёеёэииіую]$/u.test(w)) return true; // ends with vowels typical for indeclinables
  if (/[оёеэиію]$/u.test(w)) return true;
  return false;
}

// Nouns
function buildNounCyrillicPattern(base) {
  if (isLikelyIndeclinableCyrillic(base)) {
    return reEscape(base);
  }
  const endings = "(а|я|у|ю|ом|ем|е|і|ы|и|ой|ою|ях|ям|ями|ах|ам|ами|ов|ев)?";
  return reEscape(base) + endings;
}

// Adjectives like "Зеленский / Зеленський / Зький"
function looksLikeAdjCyr(word) {
  return /(ский|ський|зький)$/u.test(word);
}
function buildAdjectiveCyrillicPattern(word) {
  const stem = word
    .replace(/ский$/u, "ск")
    .replace(/зький$/u, "зьк")
    .replace(/ський$/u, "ськ");
  const endings =
    "(ий|ого|ому|ым|им|ом|ая|ую|ое|ие|ые|ых|ыми|ими|" +  // RU
    "ій|ього|ьому|ім|им|ому|а|у|е|і|ої|ою|ими|их)?";     // UK simplified
  return reEscape(stem) + endings;
}

// Latin: allow possessive 's / ’s
function buildLatinPattern(word) {
  const esc = reEscape(word);
  return esc + "(?:'s|’s)?";
}

function rebuildRegexes() {
  keywordRegexes = state.keywordsLower.map(raw => {
    const kw = raw.trim();
    if (!kw) return null;

    if (/\s/.test(kw)) {
      const esc = reEscape(kw);
      return new RegExp(`(?<![\\p{L}\\p{M}\\p{N}_])${esc}(?![\\p{L}\\p{M}\\p{N}_])`, "iu");
    }

    let body;
    if (isLatin(kw)) {
      body = buildLatinPattern(kw);
    } else if (isCyrillicWord(kw)) {
      body = looksLikeAdjCyr(kw)
        ? buildAdjectiveCyrillicPattern(kw)
        : buildNounCyrillicPattern(kw);
    } else {
      body = reEscape(kw);
    }

    return new RegExp(
      `(?<![\\p{L}\\p{M}\\p{N}_])${body}(?![\\p{L}\\p{M}\\p{N}_])`,
      "iu"
    );
  }).filter(Boolean);
}

function textMatches(text) {
  if (!text) return false;
  const s = text.toLowerCase();
  return keywordRegexes.some(rx => rx.test(s));
}

// ==== Extraction & hiding ====
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
  if (!el.parentNode) return;
  const wrapper = document.createElement("div");
  wrapper.style.position = "relative";
  el.parentNode.insertBefore(wrapper, el);
  wrapper.appendChild(el);

  const btn = document.createElement("button");
  btn.className = "tpz-reveal-btn";
  btn.textContent = "Show";
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

// ==== MutationObserver debounce ====
let scheduled = false;
function scheduleScan(target) {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    scan(target || document);
  });
}

// ==== Init ====
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

// ==== Hot config updates ====
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
