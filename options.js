const DEFAULT_CONFIG = {
enabled: true,
mode: 'hide',
aggressive: false,
keywords: [
'trump', 'donald trump', 'дональд трамп', 'трамп',
'putin', 'vladimir putin', 'владимир путин', 'путин', 'путін', 'володимир путін',
'zelensky', 'zelenskiy', 'zelenskyy', 'volodymyr zelensky',
'владимир зеленский', 'володимир зеленський', 'зеленский', 'зеленський'
]
};


function $(id){ return document.getElementById(id); }


function load(){
chrome.storage.sync.get(DEFAULT_CONFIG, (cfg) => {
$('enabled').checked = cfg.enabled;
$('mode').value = cfg.mode;
$('aggressive').checked = cfg.aggressive;
$('keywords').value = (cfg.keywords || DEFAULT_CONFIG.keywords).join('\n');
});
}


function save(){
const cfg = {
enabled: $('enabled').checked,
mode: $('mode').value,
aggressive: $('aggressive').checked,
keywords: $('keywords').value
.split(/\n+/)
.map(s => s.trim())
.filter(Boolean)
};
chrome.storage.sync.set(cfg, () => {
$('save').textContent = 'Сохранено ✓';
setTimeout(() => $('save').textContent = 'Сохранить', 1200);
});
}


function reset(){
chrome.storage.sync.set(DEFAULT_CONFIG, load);
}


addEventListener('DOMContentLoaded', () => {
load();
$('save').addEventListener('click', save);
$('reset').addEventListener('click', reset);
});