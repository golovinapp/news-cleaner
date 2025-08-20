const DEFAULT_CONFIG = {
  enabled: true,
  mode: "hide",
  aggressive: true,
  keywords: [
    "trump", "donald trump", "дональд трамп", "трамп",
    "putin", "vladimir putin", "владимир путин", "путин", "путін", "володимир путін",
    "zelensky", "zelenskiy", "zelenskyy", "volodymyr zelensky",
    "владимир зеленский", "володимир зеленський", "зеленский", "зеленський",
    "Украина", "Украины", "Україна", "ukraine", "ukrainian"
  ],
  allowlist: [],
  blocklist: []
};

function $(id){ return document.getElementById(id); }

function parseLines(text) {
  return (text || "")
    .split(/\n+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function load() {
  chrome.storage.sync.get(DEFAULT_CONFIG, (cfg) => {
    $("enabled").checked = !!cfg.enabled;
    $("mode").value = cfg.mode === "blur" ? "blur" : "hide";
    $("aggressive").checked = !!cfg.aggressive;
    $("keywords").value = (cfg.keywords || DEFAULT_CONFIG.keywords).join("\n");
    $("allowlist").value = (cfg.allowlist || []).join("\n");
    $("blocklist").value = (cfg.blocklist || []).join("\n");
  });
}

function save() {
  const cfg = {
    enabled: $("enabled").checked,
    mode: $("mode").value,
    aggressive: $("aggressive").checked,
    keywords: parseLines($("keywords").value),
    allowlist: parseLines($("allowlist").value).map(host => host.replace(/^https?:\/\//, "").replace(/^www\./, "")),
    blocklist: parseLines($("blocklist").value).map(host => host.replace(/^https?:\/\//, "").replace(/^www\./, ""))
  };
  chrome.storage.sync.set(cfg, () => {
    const btn = $("save");
    const old = btn.textContent;
    btn.textContent = "Saved ✓";
    setTimeout(() => (btn.textContent = old), 1200);
  });
}

function reset() {
  chrome.storage.sync.set(DEFAULT_CONFIG, load);
}

document.addEventListener("DOMContentLoaded", () => {
  load();
  $("save").addEventListener("click", save);
  $("reset").addEventListener("click", reset);
});
