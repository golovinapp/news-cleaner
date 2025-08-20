async function send(msg) {
  return new Promise(resolve => chrome.runtime.sendMessage(msg, resolve));
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function setUI({ host, count, enabled, siteDisabled }) {
  document.getElementById('host').textContent = host || '—';
  document.getElementById('count').textContent = count ?? 0;

  const status = document.getElementById('status');
  if (!enabled) status.textContent = 'Disabled globally';
  else if (siteDisabled) status.textContent = 'Paused on this site';
  else status.textContent = 'Enabled';

  const btnGlobal = document.getElementById('toggle-global');
  btnGlobal.textContent = enabled ? 'Disable everywhere' : 'Enable everywhere';

  const btnSite = document.getElementById('toggle-site');
  btnSite.textContent = siteDisabled ? 'Resume on this site' : 'Pause on this site';
}

async function refresh() {
  const tab = await getActiveTab();
  const resp = await send({ type: 'nc_popup_status', tabId: tab?.id, url: tab?.url });
  setUI(resp || {});
}

document.getElementById('toggle-global').addEventListener('click', async () => {
  await send({ type: 'nc_toggle_global' });
  await refresh();
});

document.getElementById('toggle-site').addEventListener('click', async () => {
  const tab = await getActiveTab();
  await send({ type: 'nc_toggle_site', url: tab?.url });
  await refresh();
});

document.getElementById('open-settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

refresh();
