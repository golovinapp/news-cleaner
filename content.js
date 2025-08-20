// News Cleaner — content script (MV3)
}


return Array.from(result);
}


function scan(root = document) {
if (!state.enabled) return;
for (const el of candidates(root)) {
if (processed.has(el)) continue;
processed.add(el);
try {
const txt = getRelevantText(el);
if (textMatches(txt)) {
markHide(el);
}
} catch (e) {
// no-op
}
}
}


// Дебаунсер для MutationObserver
let scheduled = false;
function scheduleScan(target) {
if (scheduled) return;
scheduled = true;
requestAnimationFrame(() => {
scheduled = false;
scan(target || document);
});
}


// Первичная загрузка и запуск наблюдателя
loadConfig().then(() => {
scan(document);


const mo = new MutationObserver(muts => {
if (!state.enabled) return;
for (const m of muts) {
for (const node of m.addedNodes) {
if (node.nodeType === 1) scheduleScan(node);
}
}
});


mo.observe(document.documentElement, { childList: true, subtree: true });
});


// Реагируем на изменения настроек в реальном времени
chrome.storage.onChanged.addListener((changes, area) => {
if (area !== 'sync') return;
let needRescan = false;
if (changes.enabled) state.enabled = changes.enabled.newValue;
if (changes.mode) { state.mode = changes.mode.newValue; needRescan = true; }
if (changes.aggressive) { state.aggressive = changes.aggressive.newValue; needRescan = true; }
if (changes.keywords) { state.keywordsLower = changes.keywords.newValue.map(k => String(k).toLowerCase()); needRescan = true; }


if (needRescan && state.enabled) {
// Снимаем старые классы и пересканируем
document.querySelectorAll('.tpz-hidden, .tpz-blur').forEach(el => {
el.classList.remove('tpz-hidden', 'tpz-blur');
delete el.dataset.tpzHidden;
processed.delete(el);
});
scan(document);
}
});