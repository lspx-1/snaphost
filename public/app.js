// SnapHost Client Controller (Enterprise Edition)
let currentApps = [];
let systemInfo = {};
let selectedFile = null;
let activeTab = 'tab-file';
let currentFilter = 'all';

// DOM Elements
const loginView = document.getElementById('login-view');
const appView = document.getElementById('app-view');
const loginForm = document.getElementById('login-form');
const loginPassword = document.getElementById('login-password');
const btnLogout = document.getElementById('btn-logout');

// Mode Switcher Tabs
const tabBtnFile = document.getElementById('tab-btn-file');
const tabBtnCode = document.getElementById('tab-btn-code');
const tabFileContent = document.getElementById('tab-file');
const tabCodeContent = document.getElementById('tab-code');
const rawHtmlInput = document.getElementById('raw-html-input');

// Deployment Creation Controls
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const fileSelectedName = document.getElementById('file-selected-name');
const deployForm = document.getElementById('deploy-form');
const btnDeploySubmit = document.getElementById('btn-deploy-submit');
const deploySubdomain = document.getElementById('deploy-subdomain');
const deployTtl = document.getElementById('deploy-ttl');
const deployType = document.getElementById('deploy-type');
const sectionDeploy = document.getElementById('section-deploy');
const btnToggleDeployPanel = document.getElementById('btn-toggle-deploy-panel');

// View Mode Switcher (Table vs Cards) - Default is 'cards'
let currentViewMode = localStorage.getItem('snaphost_view_mode') || 'cards';
const settingBtnCards = document.getElementById('setting-btn-cards');
const settingBtnTable = document.getElementById('setting-btn-table');
const settingKeepDeployOpen = document.getElementById('setting-keep-deploy-open');

// Deployments Directory & Filters
const appsList = document.getElementById('apps-list');
const appsEmpty = document.getElementById('apps-empty');
const appsSearch = document.getElementById('apps-search');
const btnRefreshApps = document.getElementById('btn-refresh-apps');
const appsCountPill = document.getElementById('apps-count-pill');
const filterBtns = document.querySelectorAll('.filter-group .filter-btn');

// Dedicated Fullpage Detail View Elements
const fullpageAppDetail = document.getElementById('fullpage-app-detail');
const fullpageContentHost = document.getElementById('fullpage-content-host');
const inspectorModalWindow = document.getElementById('inspector-modal-window');
const btnDetailsExpandFullpage = document.getElementById('btn-details-expand-fullpage');
const btnFullpageBack = document.getElementById('btn-fullpage-back');
const btnFullpageClose = document.getElementById('btn-fullpage-close');
const fullpageTitle = document.getElementById('fullpage-title');
const fullpageStatusPill = document.getElementById('fullpage-status-pill');
const fullpageExternalLink = document.getElementById('fullpage-external-link');
const pageContainer = document.querySelector('.page-container');

// Top Metrics
const navRootDomain = document.getElementById('nav-root-domain');
const statTotalApps = document.getElementById('stat-total-apps');
const statStaticApps = document.getElementById('stat-static-apps');
const statDockerApps = document.getElementById('stat-docker-apps');
const statExpiringApps = document.getElementById('stat-expiring-apps');

// Live Preview Inspector Elements
const modalPreview = document.getElementById('modal-preview');
const previewIframe = document.getElementById('preview-iframe');
const previewTitle = document.getElementById('preview-title');
const btnPreviewReload = document.getElementById('btn-preview-reload');
const btnPreviewExternal = document.getElementById('btn-preview-external');
const deviceFrameContainer = document.getElementById('device-frame-container');
const viewportBtns = document.querySelectorAll('.viewport-btn');

// QR Code Modal Elements
const modalQrcode = document.getElementById('modal-qrcode');
const qrImage = document.getElementById('qr-image');
const qrAppName = document.getElementById('qr-app-name');
const qrUrlText = document.getElementById('qr-url-text');
const btnQrCopy = document.getElementById('btn-qr-copy');

// Inline SVGs for crisp professional rendering
const ICONS = {
  copy: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
  external: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`,
  preview: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
  qr: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`,
  edit: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`,
  clock: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
  logs: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>`,
  trash: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
  check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  alert: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
};

// -------------------------------------------------------------
// Toast & Utility Helpers
// -------------------------------------------------------------
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'success' ? ICONS.check : ICONS.alert}</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 200);
  }, 3000);
}

async function copyToClipboard(text, successMsg = 'In Zwischenablage kopiert') {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMsg, 'success');
  } catch (err) {
    showToast('Kopieren fehlgeschlagen', 'error');
  }
}

function triggerConfetti() {
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 50,
      spread: 50,
      origin: { y: 0.7 },
      colors: ['#ffffff', '#a1a1aa', '#38bdf8']
    });
  }
}

function formatRemainingTime(expiresAt) {
  if (!expiresAt) return { text: 'Dauerhaft', isPermanent: true };
  const diff = new Date(expiresAt) - new Date();
  if (diff <= 0) return { text: 'Abgelaufen', isExpired: true };

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const days = Math.floor(hours / 24);

  if (days > 1) return { text: `Verbleibend: ${days} Tage`, isPermanent: false };
  if (hours > 0) return { text: `Verbleibend: ${hours}h ${minutes}m`, isPermanent: false };
  return { text: `Verbleibend: ${minutes}m`, isPermanent: false, isUrgent: true };
}

// -------------------------------------------------------------
// Authentication & Initialization
// -------------------------------------------------------------
async function checkAuth() {
  try {
    const res = await fetch('/auth/me');
    const data = await res.json();
    if (data.authenticated) {
      showAppView();
    } else {
      showLoginView();
    }
  } catch (_) {
    showLoginView();
  }
}

function showLoginView() {
  loginView.classList.remove('hidden');
  appView.classList.add('hidden');
}

async function showAppView() {
  loginView.classList.add('hidden');
  appView.classList.remove('hidden');
  loadSystemInfo();
  await loadApps();
  if (window.location.hash.startsWith('#/app/')) {
    handleHashRoute();
  }
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = loginPassword.value;
  try {
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Erfolgreich autorisiert', 'success');
      loginPassword.value = '';
      showAppView();
    } else {
      showToast(data.error || 'Ungültiges Kennwort', 'error');
    }
  } catch (err) {
    showToast('Verbindungsfehler zum Server', 'error');
  }
});

btnLogout.addEventListener('click', async () => {
  await fetch('/auth/logout', { method: 'POST' });
  showToast('Abgemeldet');
  showLoginView();
});

// -------------------------------------------------------------
// Mode Switcher (File Archive vs Raw Code)
// -------------------------------------------------------------
tabBtnFile.addEventListener('click', () => switchTab('tab-file'));
tabBtnCode.addEventListener('click', () => switchTab('tab-code'));

function deriveBaseSlug(filename) {
  if (!filename || typeof filename !== 'string') return '';
  const raw = filename.split(/[/\\]/).pop().trim();
  const stripped = raw.replace(/\.(tar\.(gz|bz2|xz)|zip|tgz|tar|html|htm)$/i, '').trim();
  let slug = stripped.toLowerCase()
    .replace(/[\s_.]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length < 3) return '';
  if (slug.length > 48) slug = slug.substring(0, 48).replace(/-+$/, '');
  return slug;
}

function switchTab(tabId) {
  activeTab = tabId;
  const hintEl = document.getElementById('deploy-subdomain-hint');
  if (tabId === 'tab-file') {
    tabBtnFile.classList.add('active');
    tabBtnCode.classList.remove('active');
    tabFileContent.classList.remove('hidden');
    tabCodeContent.classList.add('hidden');
    btnDeploySubmit.disabled = !selectedFile;
    if (selectedFile) {
      const baseSlug = deriveBaseSlug(selectedFile.name);
      if (baseSlug) {
        deploySubdomain.placeholder = `Standard: ${baseSlug} (oder eigene Subdomain)`;
        if (hintEl) hintEl.textContent = `(Standard: ${baseSlug})`;
      }
    } else {
      deploySubdomain.placeholder = 'z. B. mein-spiel (leer = Standard wie Dateiname)';
      if (hintEl) hintEl.textContent = '(leer = Standard aus Dateiname)';
    }
  } else {
    tabBtnCode.classList.add('active');
    tabBtnFile.classList.remove('active');
    tabCodeContent.classList.remove('hidden');
    tabFileContent.classList.add('hidden');
    deployType.value = 'static';
    btnDeploySubmit.disabled = !rawHtmlInput.value.trim();
    deploySubdomain.placeholder = 'z. B. mein-snippet (leer = Zufallslink)';
    if (hintEl) hintEl.textContent = '(leer = Zufallslink)';
  }
}

rawHtmlInput.addEventListener('input', () => {
  if (activeTab === 'tab-code') {
    btnDeploySubmit.disabled = !rawHtmlInput.value.trim();
  }
});

// -------------------------------------------------------------
// System Metadata Loader
// -------------------------------------------------------------
async function loadSystemInfo() {
  try {
    const res = await fetch('/api/info');
    systemInfo = await res.json();
    if (systemInfo.success) {
      navRootDomain.textContent = systemInfo.rootDomain === 'localhost'
        ? '*.localhost:3000'
        : `*.${systemInfo.rootDomain}`;
      updateAiPromptGuide();
    }
  } catch (err) {
    console.error('Systeminfo nicht verfügbar', err);
  }
}

// -------------------------------------------------------------
// File Drag & Drop & Upload Handling
// -------------------------------------------------------------
['dragenter', 'dragover'].forEach(name => {
  dropzone.addEventListener(name, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach(name => {
  dropzone.addEventListener(name, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  });
});

dropzone.addEventListener('drop', (e) => {
  const files = e.dataTransfer.files;
  if (files.length > 0) handleFileSelect(files[0]);
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) handleFileSelect(e.target.files[0]);
});

function handleFileSelect(file) {
  const name = file.name.toLowerCase();
  const isArchive = name.endsWith('.zip') || name.endsWith('.tar.gz');
  const isHtml = name.endsWith('.html') || name.endsWith('.htm');

  if (!isArchive && !isHtml) {
    showToast('Nur .zip, .tar.gz oder .html Dateien unterstützt', 'error');
    return;
  }

  selectedFile = file;

  if (isHtml) {
    deployType.value = 'static';
    fileSelectedName.innerHTML = `Ausgewählt: <strong>${file.name}</strong> (HTML Dokument)`;
  } else {
    fileSelectedName.innerHTML = `Ausgewählt: <strong>${file.name}</strong> (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
  }

  fileSelectedName.style.color = 'var(--text-primary)';
  btnDeploySubmit.disabled = false;

  const baseSlug = deriveBaseSlug(file.name);
  const hintEl = document.getElementById('deploy-subdomain-hint');
  if (baseSlug) {
    deploySubdomain.placeholder = `Standard: ${baseSlug} (oder eigene Subdomain)`;
    if (hintEl) hintEl.textContent = `(Standard: ${baseSlug})`;
  } else {
    deploySubdomain.placeholder = 'z. B. mein-spiel (leer = Zufallslink)';
    if (hintEl) hintEl.textContent = '(optional)';
  }
}

deployForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  btnDeploySubmit.disabled = true;
  btnDeploySubmit.innerHTML = `<span>Bereitstellung läuft...</span>`;

  const formData = new FormData();
  if (deploySubdomain.value.trim()) formData.append('subdomain', deploySubdomain.value.trim());
  formData.append('ttl', deployTtl.value);
  formData.append('type', deployType.value);

  if (activeTab === 'tab-file') {
    if (!selectedFile) return;
    formData.append('file', selectedFile);
  } else {
    const rawHtml = rawHtmlInput.value.trim();
    if (!rawHtml) return;
    formData.append('html', rawHtml);
  }

  try {
    const res = await fetch('/api/deploy', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Bereitgestellt: ${data.subdomain}`, 'success');
      triggerConfetti();

      // Reset form
      selectedFile = null;
      fileInput.value = '';
      rawHtmlInput.value = '';
      deploySubdomain.value = '';
      deploySubdomain.placeholder = 'z. B. mein-spiel (leer = Standard wie Dateiname)';
      const hintEl = document.getElementById('deploy-subdomain-hint');
      if (hintEl) hintEl.textContent = '(leer = Standard aus Dateiname)';
      fileSelectedName.textContent = 'Unterstützt ZIP-Dateien (Builds, Node.js Server) sowie einzelne .html Dokumente';
      fileSelectedName.style.color = '';
      btnDeploySubmit.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> <span>Bereitstellen</span>`;
      loadApps();
    } else {
      showToast(data.error || 'Bereitstellungsfehler', 'error');
      btnDeploySubmit.disabled = false;
      btnDeploySubmit.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> <span>Bereitstellen</span>`;
    }
  } catch (err) {
    showToast('Netzwerkfehler beim Upload', 'error');
    btnDeploySubmit.disabled = false;
    btnDeploySubmit.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> <span>Bereitstellen</span>`;
  }
});

// -------------------------------------------------------------
// Filter Controls
// -------------------------------------------------------------
filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.getAttribute('data-filter');
    renderApps(currentApps);
  });
});

// View Mode (Table vs Cards) Management - Settings Driven
function setViewMode(mode, showFeedback = false) {
  currentViewMode = mode;
  try {
    localStorage.setItem('snaphost_view_mode', mode);
  } catch (_) {}
  if (settingBtnCards) settingBtnCards.classList.toggle('active', mode === 'cards');
  if (settingBtnTable) settingBtnTable.classList.toggle('active', mode === 'table');
  renderApps(currentApps);
  if (showFeedback) {
    showToast(`Standard-Ansicht auf "${mode === 'cards' ? 'Karten' : 'Tabelle'}" gesetzt`, 'info');
  }
}

if (settingBtnCards) settingBtnCards.addEventListener('click', () => setViewMode('cards', true));
if (settingBtnTable) settingBtnTable.addEventListener('click', () => setViewMode('table', true));

// Initialize active class on switcher
if (settingBtnCards && settingBtnTable) {
  settingBtnCards.classList.toggle('active', currentViewMode === 'cards');
  settingBtnTable.classList.toggle('active', currentViewMode === 'table');
}

// Collapsible Deploy Panel logic
let hasAutoCollapsed = false;
if (settingKeepDeployOpen) {
  const savedKeepOpen = localStorage.getItem('snaphost_keep_deploy_open');
  settingKeepDeployOpen.checked = savedKeepOpen !== 'false';
  settingKeepDeployOpen.addEventListener('change', () => {
    localStorage.setItem('snaphost_keep_deploy_open', settingKeepDeployOpen.checked ? 'true' : 'false');
    showToast(settingKeepDeployOpen.checked ? 'Upload-Panel bleibt dauerhaft geöffnet' : 'Upload-Panel klappt bei Deployments automatisch ein', 'info');
  });
}

if (btnToggleDeployPanel && sectionDeploy) {
  btnToggleDeployPanel.addEventListener('click', (e) => {
    e.stopPropagation();
    sectionDeploy.classList.toggle('collapsed');
  });
  const header = sectionDeploy.querySelector('.panel-header');
  if (header) {
    header.addEventListener('click', (e) => {
      if (sectionDeploy.classList.contains('collapsed') && !e.target.closest('button')) {
        sectionDeploy.classList.remove('collapsed');
      }
    });
  }
}

// -------------------------------------------------------------
// Deployments Directory Management
// -------------------------------------------------------------
async function loadApps() {
  try {
    const res = await fetch('/api/apps');
    const data = await res.json();
    if (data.success) {
      currentApps = data.apps;
      renderApps(currentApps);
      updateMetrics(currentApps);

      const keepOpen = localStorage.getItem('snaphost_keep_deploy_open') !== 'false';
      if (!keepOpen && !hasAutoCollapsed && currentApps.length > 0 && sectionDeploy) {
        sectionDeploy.classList.add('collapsed');
        hasAutoCollapsed = true;
      }
    }
  } catch (err) {
    console.error('Fehler beim Abrufen der Bereitstellungen', err);
  }
}

function updateMetrics(apps) {
  const activeApps = apps.filter(a => a.status !== 'expired');
  statTotalApps.textContent = activeApps.length;
  statStaticApps.textContent = activeApps.filter(a => a.type === 'static').length;
  statDockerApps.textContent = activeApps.filter(a => a.type === 'docker').length;

  const now = Date.now();
  const next24h = now + 24 * 60 * 60 * 1000;
  const expiringSoon = activeApps.filter(a => a.expires_at && new Date(a.expires_at).getTime() < next24h).length;
  statExpiringApps.textContent = expiringSoon;
  appsCountPill.textContent = activeApps.length.toString();
}

function renderApps(apps) {
  const query = (appsSearch.value || '').toLowerCase().trim();
  const now = Date.now();
  const next24h = now + 24 * 60 * 60 * 1000;

  // Filter category
  let filtered = apps.filter(a => {
    if (currentFilter === 'running') return a.status === 'running';
    if (currentFilter === 'static') return a.type === 'static';
    if (currentFilter === 'docker') return a.type === 'docker';
    if (currentFilter === 'expiring') return a.expires_at && new Date(a.expires_at).getTime() < next24h && a.status !== 'expired';
    if (currentFilter === 'error') return a.status === 'error' || a.status === 'stopped';
    return true;
  });

  // Search filter
  if (query) {
    filtered = filtered.filter(a => a.subdomain.toLowerCase().includes(query) || a.title?.toLowerCase().includes(query));
  }

  if (filtered.length === 0) {
    appsList.innerHTML = '';
    appsList.className = 'deployments-grid';
    appsEmpty.classList.remove('hidden');
    return;
  }

  appsEmpty.classList.add('hidden');

  // Mobile fallback: cards if viewport width < 768px
  const effectiveMode = window.innerWidth < 768 ? 'cards' : currentViewMode;

  if (effectiveMode === 'table') {
    appsList.className = 'deployments-table-wrapper';
    const rows = filtered.map(app => {
      const timeInfo = formatRemainingTime(app.expires_at);
      const isError = app.status === 'error' || (app.status_message && app.status !== 'running');
      let statusText = 'Online';
      let statusClass = 'running';
      if (app.status === 'stopped') { statusText = 'Offline'; statusClass = 'stopped'; }
      else if (app.status === 'error') { statusText = 'Fehler'; statusClass = 'error'; }
      else if (app.status === 'building') { statusText = 'Baut...'; statusClass = 'building'; }
      else if (app.status === 'expired') { statusText = 'Abgelaufen'; statusClass = 'expired'; }

      const lastActive = app.last_hit_at 
        ? new Date(app.last_hit_at).toLocaleString('de-DE') 
        : (app.created_at ? new Date(app.created_at).toLocaleDateString('de-DE') : '--');

      return `
        <tr data-id="${app.id}" class="deployment-table-row">
          <td>
            <span class="status-badge ${statusClass}" style="font-size:0.72rem;padding:0.15rem 0.5rem;display:inline-flex;align-items:center;gap:0.35rem;">
              <span class="status-dot ${statusClass}"></span>
              <span>${statusText}</span>
            </span>
          </td>
          <td>
            <div class="table-cell-title">
              <div style="display:flex;align-items:center;gap:0.4rem;min-width:0;">
                <span class="table-title-link" onclick="openAppDetails('${app.id}')">${escapeHtml(app.title || app.subdomain)}</span>
                ${app.password ? `
                  <span class="badge-lock" title="Passwortgeschützt – Klicken zum Bearbeiten" style="cursor:pointer;" onclick="event.stopPropagation(); openAppDetails('${app.id}', 'tab-details-settings')">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                    <span>Geschützt</span>
                  </span>
                ` : ''}
                ${isError ? `<span style="color:#f87171;font-size:0.7rem;font-weight:600;">(Fehler)</span>` : ''}
              </div>
              <a href="${app.url}" target="_blank" rel="noopener" class="table-url-sub" onclick="event.stopPropagation()">${app.url}</a>
            </div>
          </td>
          <td>
            <span class="type-pill ${app.type}">${app.type === 'static' ? 'Static' : 'Container'}</span>
          </td>
          <td>
            <span class="badge-tag font-mono">v${app.version || 1}</span>
          </td>
          <td>
            <span class="ttl-indicator ${timeInfo.isPermanent ? 'permanent' : timeInfo.isUrgent ? 'urgent' : ''}">
              ${ICONS.clock} <span>${timeInfo.text}</span>
            </span>
          </td>
          <td>
            <span style="font-size:0.75rem;color:var(--text-secondary);">${lastActive}</span>
          </td>
          <td>
            <div class="table-actions" onclick="event.stopPropagation()">
              <button class="btn btn-secondary btn-xs" onclick="openAppDetails('${app.id}')" title="Verwalten, Versionen, Logs">Verwalten</button>
              <button class="icon-action-btn" onclick="openLivePreview('${app.url}', '${app.subdomain}')" title="Live Vorschau">${ICONS.preview}</button>
              <button class="icon-action-btn" onclick="openQrModal('${app.url}', '${app.subdomain}')" title="QR-Code">${ICONS.qr}</button>
              <a href="${app.url}" target="_blank" rel="noopener" class="icon-action-btn" title="Im Tab öffnen">${ICONS.external}</a>
              <button class="icon-action-btn" style="color:#ef4444;" onclick="deleteApp('${app.id}', '${app.subdomain}')" title="Löschen">${ICONS.trash}</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    appsList.innerHTML = `
      <table class="deployments-table">
        <thead>
          <tr>
            <th style="width:115px;">Status</th>
            <th>Name / Subdomain</th>
            <th style="width:110px;">Typ</th>
            <th style="width:75px;">Version</th>
            <th style="width:165px;">Restlaufzeit</th>
            <th style="width:145px;">Zuletzt aktiv</th>
            <th style="width:170px;text-align:right;">Aktionen</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;

    appsList.querySelectorAll('.deployment-table-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('a') || e.target.closest('button')) return;
        const id = row.getAttribute('data-id');
        if (id) openAppDetails(id);
      });
    });
  } else {
    // Cards Mode
    appsList.className = 'deployments-grid';
    appsList.innerHTML = filtered.map(app => {
      const timeInfo = formatRemainingTime(app.expires_at);
      const isError = app.status === 'error' || (app.status_message && app.status !== 'running');
      const isStopped = app.status === 'stopped';

      let statusText = 'Online';
      let statusClass = 'running';
      if (app.status === 'stopped') { statusText = 'Offline'; statusClass = 'stopped'; }
      else if (app.status === 'error') { statusText = 'Fehler'; statusClass = 'error'; }
      else if (app.status === 'building') { statusText = 'Baut...'; statusClass = 'building'; }
      else if (app.status === 'expired') { statusText = 'Abgelaufen'; statusClass = 'expired'; }

      return `
        <div class="deployment-card" data-id="${app.id}">
          <div class="card-top-row">
            <div class="status-badge-inline">
              <span class="status-dot ${statusClass}"></span>
              <span style="font-weight:600;">${escapeHtml(app.title || app.subdomain)}</span>
              ${app.password ? `
                <span class="badge-lock" title="Passwortgeschützt – Klicken zum Bearbeiten" style="cursor:pointer;" onclick="event.stopPropagation(); openAppDetails('${app.id}', 'tab-details-settings')">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                  <span>Geschützt</span>
                </span>
              ` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:0.4rem;">
              <span class="badge-tag font-mono" style="font-size:0.68rem;">v${app.version || 1}</span>
              <span class="type-pill ${app.type}">${app.type === 'static' ? 'Static' : 'Container'}</span>
            </div>
          </div>

          <div class="url-display-box">
            <a href="${app.url}" target="_blank" rel="noopener" class="url-link font-mono" style="font-size:0.8rem;">${app.url}</a>
            <div class="url-actions">
              <button class="icon-action-btn" onclick="copyToClipboard('${app.url}')" title="URL kopieren">
                ${ICONS.copy}
              </button>
              <a href="${app.url}" target="_blank" rel="noopener" class="icon-action-btn" title="In neuem Tab öffnen">
                ${ICONS.external}
              </a>
            </div>
          </div>

          ${isError ? `
            <div class="card-build-error">
              <div style="display:flex;align-items:center;gap:0.35rem;min-width:0;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex:none;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(app.status_message || 'Build- oder Startfehler aufgetreten')}</span>
              </div>
              <button type="button" onclick="openAppDetails('${app.id}', 'overview')">Details &amp; Logs &rarr;</button>
            </div>
          ` : ''}

          <div class="card-metadata">
            <span class="ttl-indicator ${timeInfo.isPermanent ? 'permanent' : timeInfo.isUrgent ? 'urgent' : ''}">
              ${ICONS.clock} <span>${timeInfo.text}</span>
            </span>
            <span class="status-badge ${statusClass}" style="font-size:0.72rem;padding:0.1rem 0.45rem;">${statusText}</span>
          </div>

          <div class="card-actions-row">
            <div class="actions-cluster">
              <button class="btn btn-secondary btn-sm" onclick="openAppDetails('${app.id}')" title="Verwalten, Versionen, Logs &amp; Einstellungen">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                <span>Verwalten</span>
              </button>
              <button class="btn btn-secondary btn-sm btn-icon-only" onclick="openLivePreview('${app.url}', '${app.subdomain}')" title="Vorschau im Browser">
                ${ICONS.preview}
              </button>
              <button class="btn btn-secondary btn-sm btn-icon-only" onclick="openQrModal('${app.url}', '${app.subdomain}')" title="Mobiles Scannen via QR">
                ${ICONS.qr}
              </button>
            </div>
            <button class="btn btn-ghost btn-sm btn-danger btn-icon-only" onclick="deleteApp('${app.id}', '${app.subdomain}')" title="Deployment löschen">
              ${ICONS.trash}
            </button>
          </div>
        </div>
      `;
    }).join('');
  }
}

appsSearch.addEventListener('input', () => renderApps(currentApps));
btnRefreshApps.addEventListener('click', loadApps);

// Interval tick for TTL countdowns every 10s
setInterval(() => {
  if (currentApps.length > 0) {
    document.querySelectorAll('.deployment-card, .deployment-table-row').forEach(card => {
      const id = card.getAttribute('data-id');
      const app = currentApps.find(a => a.id === id);
      if (app) {
        const timeInfo = formatRemainingTime(app.expires_at);
        const indicator = card.querySelector('.ttl-indicator');
        if (indicator) {
          indicator.innerHTML = `${ICONS.clock} <span>${timeInfo.text}</span>`;
          if (timeInfo.isPermanent) indicator.className = 'ttl-indicator permanent';
          else if (timeInfo.isUrgent) indicator.className = 'ttl-indicator urgent';
          else indicator.className = 'ttl-indicator';
        }
      }
    });
  }
}, 10000);

// -------------------------------------------------------------
// Live Inspector Preview Modal
// -------------------------------------------------------------
window.openLivePreview = function(url, subdomain) {
  previewTitle.textContent = `Vorschau: ${subdomain}`;
  previewIframe.src = url;
  btnPreviewExternal.href = url;
  setPreviewDevice('desktop');
  modalPreview.classList.remove('hidden');
};

btnPreviewReload.addEventListener('click', () => {
  const current = previewIframe.src;
  previewIframe.src = 'about:blank';
  setTimeout(() => previewIframe.src = current, 40);
});

viewportBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const device = btn.getAttribute('data-device');
    setPreviewDevice(device);
  });
});

function setPreviewDevice(device) {
  viewportBtns.forEach(b => b.classList.remove('active'));
  document.querySelector(`.viewport-btn[data-device="${device}"]`)?.classList.add('active');

  deviceFrameContainer.className = 'device-frame ' + device;
}

// -------------------------------------------------------------
// QR Code Display Modal
// -------------------------------------------------------------
window.openQrModal = function(url, subdomain) {
  qrAppName.textContent = `Scannen Sie diesen Code, um ${subdomain} auf Mobilgeräten zu öffnen:`;
  qrUrlText.textContent = url;
  // High contrast clean QR code for phone cameras
  const encoded = encodeURIComponent(url);
  qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encoded}`;

  btnQrCopy.onclick = () => copyToClipboard(url, 'Link kopiert');
  modalQrcode.classList.remove('hidden');
};

// -------------------------------------------------------------
// App Management Actions (Rename, TTL, Logs, Delete)
// -------------------------------------------------------------
window.openRenameModal = function(id, currentSubdomain) {
  document.getElementById('rename-app-id').value = id;
  document.getElementById('rename-subdomain').value = currentSubdomain;
  document.getElementById('modal-rename').classList.remove('hidden');
};

document.getElementById('rename-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('rename-app-id').value;
  const subdomain = document.getElementById('rename-subdomain').value.trim();

  try {
    const res = await fetch(`/api/apps/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subdomain })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Subdomain aktualisiert', 'success');
      document.getElementById('modal-rename').classList.add('hidden');
      loadApps();
    } else {
      showToast(data.error || 'Fehler beim Aktualisieren', 'error');
    }
  } catch (_) {
    showToast('Netzwerkfehler', 'error');
  }
});

window.openTtlModal = function(id) {
  document.getElementById('ttl-app-id').value = id;
  document.getElementById('modal-ttl').classList.remove('hidden');
};

document.getElementById('ttl-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('ttl-app-id').value;
  const ttl = document.getElementById('ttl-select').value;

  try {
    const res = await fetch(`/api/apps/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Gültigkeitsdauer aktualisiert', 'success');
      document.getElementById('modal-ttl').classList.add('hidden');
      loadApps();
    } else {
      showToast(data.error || 'Fehler beim Anpassen', 'error');
    }
  } catch (_) {
    showToast('Netzwerkfehler', 'error');
  }
});

window.openLogsModal = async function(id, subdomain) {
  document.getElementById('logs-title').textContent = `Container Protokoll: ${subdomain}`;
  document.getElementById('logs-content').textContent = 'Lade Protokoll-Stream...';
  document.getElementById('modal-logs').classList.remove('hidden');

  try {
    const res = await fetch(`/api/apps/${id}/logs`);
    const data = await res.json();
    document.getElementById('logs-content').textContent = data.logs || 'Keine Log-Einträge vorhanden.';
  } catch (err) {
    document.getElementById('logs-content').textContent = 'Fehler beim Abrufen der Logs.';
  }
};

window.deleteApp = async function(id, subdomain) {
  if (!confirm(`Möchten Sie das Deployment '${subdomain}' unwiderruflich löschen?`)) return;

  try {
    const res = await fetch(`/api/apps/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast(`'${subdomain}' wurde entfernt`, 'success');
      loadApps();
    } else {
      showToast(data.error || 'Löschvorgang fehlgeschlagen', 'error');
    }
  } catch (_) {
    showToast('Netzwerkfehler', 'error');
  }
};

// -------------------------------------------------------------
// AI Guide Modal & Specification Prompt
// -------------------------------------------------------------
const btnCopyAiPrompt = document.getElementById('btn-copy-ai-prompt');
const btnCopyAiLabel = document.getElementById('btn-copy-ai-label');
const btnDownloadAiPrompt = document.getElementById('btn-download-ai-prompt');
const codeAiPrompt = document.getElementById('code-ai-prompt');
const btnPromptModeCli = document.getElementById('btn-prompt-mode-cli');
const btnPromptModeApi = document.getElementById('btn-prompt-mode-api');
const aiPromptModeHint = document.getElementById('ai-prompt-mode-hint');

let currentAiPromptMode = 'cli'; // 'cli' (default) or 'api'
let cachedDeployMd = '';
let cachedDeployCliMd = '';

document.getElementById('btn-ai-guide')?.addEventListener('click', () => {
  updateAiPromptGuide();
  document.getElementById('modal-ai-guide')?.classList.remove('hidden');
});

function getQuickstartServerUrl() {
  if (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin !== 'null') {
    return window.location.origin;
  }
  if (systemInfo.deployEndpoint) {
    return systemInfo.deployEndpoint.replace(/\/api\/deploy$/, '');
  }
  if (systemInfo.adminSubdomain && systemInfo.rootDomain && systemInfo.rootDomain !== 'localhost') {
    return `https://${systemInfo.adminSubdomain}.${systemInfo.rootDomain}`;
  }
  const root = systemInfo.rootDomain || 'localhost:3000';
  const protocol = (root.includes('localhost') || root.includes('127.0.0.1')) ? 'http://' : 'https://';
  return `${protocol}${root}`;
}

function generateCliPrompt(serverUrl, appsDomain, rawDeployCliMd) {
  if (rawDeployCliMd) {
    let text = rawDeployCliMd;
    const hostOnly = serverUrl.replace(/^https?:\/\//, '');
    text = text.replace(/https:\/\/DEINE_SNAPHOST_DOMAIN/g, serverUrl);
    text = text.replace(/<slug>\.DEINE_SNAPHOST_DOMAIN/g, `<slug>.${appsDomain}`);
    text = text.replace(/DEINE_SNAPHOST_DOMAIN/g, hostOnly);
    return text;
  }

  return `# SnapHost – Dokumentation & CLI-Leitfaden

SnapHost ist eine private Self-Hosted Cloud- & Deployment-Plattform (ähnlich wie Vercel, Railway oder Coolify) auf eigenem Server.
Web-Projekte und Container werden hierüber direkt per Terminal mit der SnapHost CLI (\`npx snaphost\` oder global \`snaphost\`) bereitgestellt und verwaltet.

- **Server Basis-URL:** ${serverUrl}
- **Bereitgestellte Apps laufen unter:** https://<slug>.${appsDomain}

---

## 🚀 1. Projekt bereitstellen (Deploy)

Die CLI erkennt automatisch den Build-Ordner (\`./dist\`, \`./build\`, \`./out\`) oder nutzt das aktuelle Verzeichnis:

### Frontend / Statische Webseiten (HTML, CSS, JS, Vite, React, Vue, Svelte):
\`\`\`bash
# Projekt bauen (falls nötig):
npm run build

# Automatischer Deploy (sucht dist/ oder aktuelles Verzeichnis):
npx snaphost deploy

# Gezielt den Build-Ordner mit Subdomain und dauerhafter Laufzeit bereitstellen:
npx snaphost deploy ./dist --slug mein-projekt --ttl permanent

# Optional mit HTTP Basic Auth Passwortschutz:
npx snaphost deploy ./dist --slug mein-projekt --password geheim
\`\`\`

### Fullstack / Backend / Multiplayer (Node.js, Express, WebSockets, Docker):
\`\`\`bash
# Im Projektverzeichnis ausführen (package.json mit "start"-Script erforderlich):
npx snaphost deploy . --slug mein-backend --ttl permanent
\`\`\`

---

## 🔍 2. Logs & Debugging (Fehleranalyse)

Falls ein Container oder eine Web-App nach dem Start Fehler meldet oder nicht erreichbar ist, können die Logs direkt über die CLI ausgelesen werden:

\`\`\`bash
# Live-Logs der Anwendung / des Containers abrufen (letzte 100 Zeilen):
npx snaphost logs mein-projekt --tail 100

# Status, Port, Version, interne URL und Container-ID prüfen:
npx snaphost status mein-projekt
\`\`\`

---

## 🔄 3. Verwaltung & Lifecycle

\`\`\`bash
# Container neu starten (z. B. nach Konfigurationsanpassungen):
npx snaphost restart mein-projekt

# Container komplett neu bauen (Rebuild aus hochgeladenem Code):
npx snaphost rebuild mein-projekt

# Sofortiges Rollback zur vorherigen stabilen Version:
npx snaphost rollback mein-projekt

# Quellcode herunterladen & entpacken (z. B. für Weiterentwicklung oder KI-Bearbeitung):
npx snaphost pull mein-projekt
# Optional in einen bestimmten Zielordner:
npx snaphost pull mein-projekt ./zielordner

# Persistente Datenbank (/data) prüfen & SQLite-Tabellen anzeigen:
npx snaphost data mein-projekt

# Datenbank & Daten lokal herunterladen:
npx snaphost data pull mein-projekt

# Speicher zurücksetzen (leeren):
npx snaphost data reset mein-projekt

# App / Container anhalten (offline nehmen):
npx snaphost stop mein-projekt

# Angehaltene App wieder online schalten:
npx snaphost start mein-projekt

# Bereitstellung endgültig löschen:
npx snaphost delete mein-projekt

# Alle aktiven Bereitstellungen auflisten:
npx snaphost list

# Live-URL direkt im Browser öffnen:
npx snaphost open mein-projekt
\`\`\`

---

## ⚙️ 4. Projektkonfiguration (\`deploy.json\`)

Im Projektverzeichnis kann optional eine \`deploy.json\` hinterlegt werden:

\`\`\`json
{
  "name": "mein-projekt",
  "type": "docker",
  "port": 3000,
  "spa": true,
  "env": {
    "NODE_ENV": "production"
  }
}
\`\`\`

### Technische Vorgaben für Apps & Container:
- **Port:** Node.js-Server lauschen auf \`process.env.PORT\` (Fallback: \`3000\`) und binden an \`0.0.0.0\`:
  \`const port = process.env.PORT || 3000; server.listen(port, '0.0.0.0');\`
- **Persistente Datenbank / Speicher:** Der Ordner \`/data\` bzw. \`./data\` (und Umgebungsvariable \`process.env.DATA_DIR\`, \`process.env.DATABASE_PATH = /app/data/app.db\`) ist dauerhaft persistent gemountet. Alle Daten (z. B. SQLite-Tabellen oder JSON-Dateien) bleiben bei jedem Deploy und Rebuild erhalten. Keine Passwörter oder externe Datenbanken nötig!
- **WebSockets:** Nutzen denselben HTTP-Server und Port wie die Web-App.
- **Dateipfade:** In HTML/CSS stets relative Pfade verwenden (z. B. \`./app.js\`, nicht \`/app.js\`).
- \`node_modules\` und \`.git\` werden von der CLI automatisch vom Upload ausgeschlossen.

---

## 🔐 5. Authentifizierung & CLI-Setup

Die SnapHost CLI liest Zugangsdaten automatisch aus der lokalen Konfiguration (\`~/.snaphost/config.json\`) oder Umgebungsvariablen.

- **Status prüfen:**
  \`\`\`bash
  npx snaphost whoami
  \`\`\`
- **Einmalig anmelden:**
  \`\`\`bash
  npx snaphost login --server ${serverUrl}
  \`\`\`
  *(Alternativ über Umgebungsvariablen: \`SNAPHOST_SERVER=${serverUrl}\` und \`SNAPHOST_TOKEN=<token>\`)*

Nach erfolgreichem Deployment ist das Projekt unter \`https://<slug>.${appsDomain}\` erreichbar.
`;
}

function generateApiPrompt(serverUrl, appsDomain, apiKey, rawDeployMd) {
  if (rawDeployMd) {
    let text = rawDeployMd;
    const hostOnly = serverUrl.replace(/^https?:\/\//, '');
    text = text.replace(/https:\/\/DEINE_SNAPHOST_DOMAIN/g, serverUrl);
    text = text.replace(/<slug>\.DEINE_SNAPHOST_DOMAIN/g, `<slug>.${appsDomain}`);
    text = text.replace(/DEINE_SNAPHOST_DOMAIN/g, hostOnly);
    if (apiKey && apiKey !== '$DEPLOY_TOKEN') {
      text = text.replace(/DEIN_API_KEY/g, apiKey);
    }
    return text;
  }

  const endpoint = `${serverUrl}/api/deploy`;
  const baseApi = `${serverUrl}/api`;

  return `# SnapHost – REST-API Dokumentation & Deployment-Referenz

SnapHost ist eine private Self-Hosted Cloud-Plattform auf eigenem Server (\`${serverUrl}\`).
Bereitgestellte Apps laufen unter: \`https://<slug>.${appsDomain}\`
Header für Authentifizierung: \`Authorization: Bearer ${apiKey}\`

---

## 1. Bereitstellen per cURL (POST /api/deploy)

### A. ZIP-Archiv hochladen:
curl -sS -X POST "${endpoint}" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -F "file=@bundle.zip" \\
  -F "slug=mein-spiel" \\
  -F "type=auto" \\
  -F "ttl=permanent"

### B. Einzelne HTML-Datei:
curl -sS -X POST "${endpoint}" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -F "file=@index.html" \\
  -F "slug=mein-spiel"

---

## 2. Debugging & Wartung per API

### Live-Logs lesen (Debugging bei Fehlern oder 502 Bad Gateway):
curl -sS -X GET "${baseApi}/apps/mein-spiel/logs?tail=150" \\
  -H "Authorization: Bearer ${apiKey}"

### Container neu starten:
curl -sS -X POST "${baseApi}/apps/mein-spiel/restart" \\
  -H "Authorization: Bearer ${apiKey}"

### Container neu bauen (Rebuild):
curl -sS -X POST "${baseApi}/apps/mein-spiel/rebuild" \\
  -H "Authorization: Bearer ${apiKey}"

### Rollback zur vorherigen Version:
curl -sS -X POST "${baseApi}/apps/mein-spiel/rollback" \\
  -H "Authorization: Bearer ${apiKey}"

### Status abrufen:
curl -sS -X GET "${baseApi}/apps/mein-spiel" \\
  -H "Authorization: Bearer ${apiKey}"

### Alle Apps auflisten:
curl -sS -X GET "${baseApi}/apps" \\
  -H "Authorization: Bearer ${apiKey}"

### Quellcode als ZIP herunterladen:
curl -sS -O -J -H "Authorization: Bearer ${apiKey}" "${baseApi}/apps/mein-spiel/download"

### App löschen:
curl -sS -X DELETE "${baseApi}/apps/mein-spiel" \\
  -H "Authorization: Bearer ${apiKey}"

---

## 3. PowerShell Skript (Alternative):
# Windows PowerShell
Invoke-WebRequest ${serverUrl}/deploy.ps1 -OutFile deploy.ps1
.\\deploy.ps1 .\\dist -Slug mein-spiel -Ttl permanent
`;
}

function setAiPromptMode(mode) {
  currentAiPromptMode = mode;
  if (btnPromptModeCli) btnPromptModeCli.classList.toggle('active', mode === 'cli');
  if (btnPromptModeApi) btnPromptModeApi.classList.toggle('active', mode === 'api');

  if (aiPromptModeHint) {
    if (mode === 'cli') {
      aiPromptModeHint.innerHTML = '<strong style="color:var(--text-primary);">Empfohlen:</strong> CLI-Dokumentation für <code>npx snaphost</code>. Das Token wird automatisch lokal aus <code>~/.snaphost/config.json</code> geladen.';
    } else {
      aiPromptModeHint.innerHTML = '<strong style="color:var(--text-primary);">Klassische REST-API:</strong> Direkte HTTP-Aufrufe mit cURL. Der API-Schlüssel wird im Authorization-Header übergeben.';
    }
  }

  renderAiPrompt();
}

btnPromptModeCli?.addEventListener('click', () => setAiPromptMode('cli'));
btnPromptModeApi?.addEventListener('click', () => setAiPromptMode('api'));

function renderAiPrompt() {
  const codeEl = document.getElementById('code-ai-prompt');
  if (!codeEl) return;
  const serverUrl = getQuickstartServerUrl();
  const hostOnly = serverUrl.replace(/^https?:\/\//, '');
  const appsDomain = systemInfo.rootDomain || hostOnly;
  const apiKey = systemInfo.sampleApiKey || '$DEPLOY_TOKEN';

  if (currentAiPromptMode === 'cli') {
    codeEl.textContent = generateCliPrompt(serverUrl, appsDomain, cachedDeployCliMd);
  } else {
    codeEl.textContent = generateApiPrompt(serverUrl, appsDomain, apiKey, cachedDeployMd);
  }
}

async function updateAiPromptGuide() {
  renderAiPrompt();

  const fetches = [];
  if (!cachedDeployCliMd) {
    fetches.push(
      fetch('/DEPLOY-CLI.md')
        .then(r => r.ok ? r.text() : '')
        .then(t => { if (t) cachedDeployCliMd = t; })
        .catch(() => {})
    );
  }
  if (!cachedDeployMd) {
    fetches.push(
      fetch('/DEPLOY.md')
        .then(r => r.ok ? r.text() : '')
        .then(t => { if (t) cachedDeployMd = t; })
        .catch(() => {})
    );
  }

  if (fetches.length > 0) {
    await Promise.all(fetches);
    renderAiPrompt();
  }
}

if (btnCopyAiPrompt) {
  btnCopyAiPrompt.addEventListener('click', () => {
    const text = codeAiPrompt ? codeAiPrompt.textContent : '';
    if (!text) return;
    const modeLabel = currentAiPromptMode === 'cli' ? 'CLI-Prompt' : 'API-Prompt';
    copyToClipboard(text, `${modeLabel} in Zwischenablage kopiert`);
    if (btnCopyAiLabel) {
      const origText = btnCopyAiLabel.textContent;
      btnCopyAiLabel.textContent = 'Kopiert!';
      setTimeout(() => { btnCopyAiLabel.textContent = origText; }, 2000);
    }
  });
}

if (btnDownloadAiPrompt) {
  btnDownloadAiPrompt.addEventListener('click', () => {
    const text = codeAiPrompt ? codeAiPrompt.textContent : '';
    if (!text) return;
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentAiPromptMode === 'cli' ? 'DEPLOY-CLI.md' : 'DEPLOY.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`${a.download} heruntergeladen`, 'success');
  });
}

// -------------------------------------------------------------
// Tokens Management
// -------------------------------------------------------------
const newKeySuccessBox = document.getElementById('new-key-success-box');
const newKeyTokenDisplay = document.getElementById('new-key-token-display');
const btnCopyNewKey = document.getElementById('btn-copy-new-key');
const btnCloseKeyAlert = document.getElementById('btn-close-key-alert');

if (btnCloseKeyAlert && newKeySuccessBox) {
  btnCloseKeyAlert.addEventListener('click', () => {
    newKeySuccessBox.classList.add('hidden');
  });
}

document.getElementById('btn-api-keys')?.addEventListener('click', () => {
  loadApiKeys();
  document.getElementById('modal-api-keys').classList.remove('hidden');
});

async function loadApiKeys() {
  const list = document.getElementById('api-keys-list');
  try {
    const res = await fetch('/api/keys');
    const data = await res.json();
    if (data.success) {
      if (!data.keys || data.keys.length === 0) {
        list.innerHTML = '<p class="text-subdued" style="text-align:center;padding:1.5rem 0;">Keine API-Tokens hinterlegt. Erstellen Sie oben einen neuen Schlüssel für Automatisierungen.</p>';
        return;
      }
      list.innerHTML = data.keys.map(k => {
        const createdDate = k.created_at ? new Date(k.created_at).toLocaleDateString('de-DE') : '--';
        const lastUsed = k.last_used_at ? new Date(k.last_used_at).toLocaleString('de-DE') : 'Noch nie';
        const displayPrefix = k.prefix || (k.key ? k.key.slice(0, 16) + '...' : 'sh_live_...');

        return `
          <div class="token-row">
            <div class="token-meta">
              <div class="token-name">
                <span>${escapeHtml(k.name)}</span>
              </div>
              <span class="token-hash">${escapeHtml(displayPrefix)}</span>
              <div class="token-usage-info">
                <span>Erstellt: ${createdDate}</span>
                <span>&bull;</span>
                <span>Zuletzt verwendet: ${lastUsed}</span>
              </div>
            </div>
            <div class="token-actions">
              <button class="btn btn-danger btn-sm" onclick="deleteApiKey('${k.id}', '${escapeHtml(k.name)}')">
                <span>Widerrufen</span>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    list.innerHTML = '<p class="text-subdued">Fehler beim Laden der Schlüssel.</p>';
  }
}

document.getElementById('create-key-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nameInput = document.getElementById('new-key-name');
  const name = nameInput.value.trim();
  if (!name) return;

  try {
    const res = await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (data.success && data.key) {
      showToast('API-Schlüssel erfolgreich generiert', 'success');
      nameInput.value = '';

      // Show one-time plaintext token alert
      if (data.key.rawToken && newKeySuccessBox && newKeyTokenDisplay) {
        newKeyTokenDisplay.textContent = data.key.rawToken;
        newKeySuccessBox.classList.remove('hidden');
        if (btnCopyNewKey) {
          btnCopyNewKey.onclick = () => copyToClipboard(data.key.rawToken, 'API-Schlüssel kopiert');
        }
      }

      loadApiKeys();
      loadSystemInfo();
    } else {
      showToast(data.error || 'Fehler beim Generieren', 'error');
    }
  } catch (_) {
    showToast('Fehler beim Generieren', 'error');
  }
});

window.deleteApiKey = async function(id, name = 'diesen') {
  if (!confirm(`Möchten Sie den API-Schlüssel '${name}' wirklich unwiderruflich widerrufen / sperren? Alle Skripte und Agenten, die diesen Schlüssel nutzen, verlieren sofort den Zugriff.`)) return;
  try {
    const res = await fetch(`/api/keys/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('API-Schlüssel widerrufen', 'info');
      loadApiKeys();
      loadSystemInfo();
    } else {
      showToast(data.error || 'Fehler beim Widerrufen', 'error');
    }
  } catch (_) {
    showToast('Fehler beim Widerrufen', 'error');
  }
};

// -------------------------------------------------------------
// Comprehensive Site Inspector & Settings Modal
// -------------------------------------------------------------
let activeInspectorApp = null;
let logRefreshInterval = null;

window.openAppDetails = async function(appId, initialTab = 'overview') {
  try {
    const res = await fetch(`/api/apps/${appId}`);
    const data = await res.json();
    if (!data.success || !data.app) {
      showToast(data.error || 'Deployment nicht gefunden', 'error');
      return;
    }

    const app = data.app;
    activeInspectorApp = app;

    // Populate Inspector Header
    document.getElementById('details-app-title').textContent = app.title || app.subdomain;
    
    const pill = document.getElementById('details-status-pill');
    let statusText = 'Online';
    let statusClass = 'running';
    if (app.status === 'stopped') { statusText = 'Offline'; statusClass = 'stopped'; }
    else if (app.status === 'error') { statusText = 'Fehler'; statusClass = 'error'; }
    else if (app.status === 'building') { statusText = 'Baut...'; statusClass = 'building'; }
    else if (app.status === 'expired') { statusText = 'Abgelaufen'; statusClass = 'expired'; }
    pill.className = `status-badge ${statusClass}`;
    pill.textContent = statusText;

    const typeTag = document.getElementById('details-type-tag');
    typeTag.className = `badge-tag ${app.type}`;
    typeTag.textContent = app.type === 'static' ? 'Statische Seite' : 'Container (Node/WS)';

    document.getElementById('details-version-badge').textContent = `v${app.version || 1}`;

    const lockBadge = document.getElementById('details-lock-badge');
    if (app.password) {
      lockBadge.classList.remove('hidden');
    } else {
      lockBadge.classList.add('hidden');
    }

    const link = document.getElementById('details-app-link');
    link.href = app.url;
    link.textContent = app.url;

    document.getElementById('btn-details-copy-url').onclick = () => copyToClipboard(app.url, 'URL kopiert');

    // Populate Overview Tab
    const errorBox = document.getElementById('details-error-box');
    const errorText = document.getElementById('details-error-text');
    if (app.status === 'error' || (app.status_message && app.status !== 'running')) {
      errorBox.classList.remove('hidden');
      errorText.textContent = app.status_message || 'Beim Build- oder Startprozess ist ein Fehler aufgetreten.';
    } else {
      errorBox.classList.add('hidden');
    }

    document.getElementById('kv-status').innerHTML = `<span class="status-dot ${statusClass}"></span> ${statusText}`;
    const timeInfo = formatRemainingTime(app.expires_at);
    document.getElementById('kv-ttl').textContent = timeInfo.text;
    document.getElementById('kv-version').textContent = `v${app.version || 1}`;
    document.getElementById('kv-password').textContent = app.password ? 'Aktiv (Geschützt)' : 'Öffentlich';
    document.getElementById('kv-last-hit').textContent = app.last_hit_at ? new Date(app.last_hit_at).toLocaleString('de-DE') : 'Noch nie';
    document.getElementById('kv-created-at').textContent = app.created_at ? new Date(app.created_at).toLocaleString('de-DE') : '--';
    document.getElementById('kv-container-id').textContent = app.container_id ? app.container_id.slice(0, 12) : (app.type === 'static' ? 'Keiner (Statisch)' : '--');
    document.getElementById('kv-port').textContent = app.type === 'static' ? 'N/A' : (app.internal_port || app.port || 3000);

    const powerLabel = document.getElementById('btn-action-power-label');
    powerLabel.textContent = app.status === 'stopped' ? 'Wieder online stellen' : 'Offline nehmen';
    document.getElementById('btn-action-open').href = app.url;

    const downloadBtn = document.getElementById('btn-action-download');
    if (downloadBtn) {
      downloadBtn.href = `/api/apps/${app.id}/download`;
      downloadBtn.download = `${app.subdomain}-v${app.version || 1}.zip`;
    }

    const dataDownloadBtn = document.getElementById('btn-data-download');
    if (dataDownloadBtn) {
      dataDownloadBtn.href = `/api/apps/${app.id}/data/download`;
      dataDownloadBtn.download = `${app.subdomain}-data.zip`;
    }

    // Populate Settings Tab Fields
    document.getElementById('settings-title').value = app.title || '';
    document.getElementById('settings-subdomain').value = app.subdomain || '';
    document.getElementById('settings-ttl').value = '';
    document.getElementById('settings-password').value = app.password || '';
    document.getElementById('settings-spa').checked = !!app.spa;

    const dockerGroup = document.getElementById('details-docker-settings-group');
    if (app.type === 'docker') {
      dockerGroup.classList.remove('hidden');
      document.getElementById('settings-port').value = app.internal_port || app.port || '';
      document.getElementById('settings-start').value = app.start_cmd || '';
      document.getElementById('settings-build').value = app.build_cmd || '';
      document.getElementById('settings-env').value = app.env_vars || '';
    } else {
      dockerGroup.classList.add('hidden');
    }

    // Switch tab and display modal or fullpage
    switchInspectorTab(initialTab);
    if (!isFullpageActive) {
      document.getElementById('modal-app-details').classList.remove('hidden');
    } else {
      if (fullpageTitle) fullpageTitle.textContent = app.title || app.subdomain;
      if (fullpageExternalLink) fullpageExternalLink.href = app.url;
      if (fullpageStatusPill) {
        fullpageStatusPill.className = `status-badge ${statusClass}`;
        fullpageStatusPill.textContent = statusText;
      }
    }
  } catch (err) {
    showToast('Fehler beim Laden der App-Details', 'error');
  }
};

function switchInspectorTab(targetKey) {
  const targetId = targetKey.startsWith('tab-details-') ? targetKey : `tab-details-${targetKey}`;

  document.querySelectorAll('.inspector-tab-btn').forEach(btn => {
    if (btn.getAttribute('data-tab-target') === targetId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  document.querySelectorAll('.inspector-tab-pane').forEach(pane => {
    if (pane.id === targetId) {
      pane.classList.remove('hidden');
    } else {
      pane.classList.add('hidden');
    }
  });

  if (targetId === 'tab-details-versions' && activeInspectorApp) {
    loadInspectorVersions(activeInspectorApp.id);
  } else if (targetId === 'tab-details-logs' && activeInspectorApp) {
    loadInspectorLogs(activeInspectorApp.id);
    startLogPolling();
  } else if (targetId === 'tab-details-data' && activeInspectorApp) {
    stopLogPolling();
    loadAppData(activeInspectorApp.id);
  } else {
    stopLogPolling();
  }
}

document.querySelectorAll('.inspector-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.getAttribute('data-tab-target');
    switchInspectorTab(target);
  });
});

document.getElementById('btn-details-open-logs').addEventListener('click', () => {
  switchInspectorTab('tab-details-logs');
});

// Inspector Overview Actions (Power, Restart, Rebuild, Preview, QR)
document.getElementById('btn-action-power').addEventListener('click', async () => {
  if (!activeInspectorApp) return;
  const isStopped = activeInspectorApp.status === 'stopped';
  const endpoint = isStopped ? `/api/apps/${activeInspectorApp.id}/restart` : `/api/apps/${activeInspectorApp.id}/stop`;
  try {
    const res = await fetch(endpoint, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(isStopped ? 'Anwendung wieder online gestellt' : 'Anwendung offline genommen', 'success');
      await openAppDetails(activeInspectorApp.id, 'overview');
      loadApps();
    } else {
      showToast(data.error || 'Aktion fehlgeschlagen', 'error');
    }
  } catch (_) {
    showToast('Netzwerkfehler', 'error');
  }
});

document.getElementById('btn-action-restart').addEventListener('click', async () => {
  if (!activeInspectorApp) return;
  try {
    const res = await fetch(`/api/apps/${activeInspectorApp.id}/restart`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Neustart erfolgreich initiiert', 'success');
      await openAppDetails(activeInspectorApp.id, 'overview');
      loadApps();
    } else {
      showToast(data.error || 'Neustart fehlgeschlagen', 'error');
    }
  } catch (_) {
    showToast('Netzwerkfehler', 'error');
  }
});

document.getElementById('btn-action-rebuild').addEventListener('click', async () => {
  if (!activeInspectorApp) return;
  try {
    showToast('Rebuild wird im Hintergrund ausgeführt...', 'info');
    const res = await fetch(`/api/apps/${activeInspectorApp.id}/rebuild`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Rebuild abgeschlossen', 'success');
      await openAppDetails(activeInspectorApp.id, 'tab-details-logs');
      loadApps();
    } else {
      showToast(data.error || 'Rebuild fehlgeschlagen', 'error');
      switchInspectorTab('tab-details-logs');
    }
  } catch (_) {
    showToast('Netzwerkfehler', 'error');
  }
});

document.getElementById('btn-action-preview').addEventListener('click', () => {
  if (!activeInspectorApp) return;
  openLivePreview(activeInspectorApp.url, activeInspectorApp.subdomain);
});

document.getElementById('btn-action-qr').addEventListener('click', () => {
  if (!activeInspectorApp) return;
  openQrModal(activeInspectorApp.url, activeInspectorApp.subdomain);
});

// Inspector Versions Management
async function loadInspectorVersions(appId) {
  const listEl = document.getElementById('details-versions-list');
  const countEl = document.getElementById('details-versions-count');
  listEl.innerHTML = '<div class="text-subdued" style="padding:0.5rem 0;">Lade Versionen...</div>';

  try {
    const res = await fetch(`/api/apps/${appId}/deployments`);
    const data = await res.json();
    if (data.success) {
      const list = data.deployments || [];
      countEl.textContent = list.length || (activeInspectorApp ? 1 : 0);

      if (list.length === 0) {
        listEl.innerHTML = `
          <div class="version-item active">
            <div class="version-meta">
              <span class="version-dot"></span>
              <div>
                <div style="display:flex;align-items:center;gap:0.5rem;">
                  <span class="version-tag">v${activeInspectorApp.version || 1}</span>
                  <span class="badge-tag" style="background:rgba(16,185,129,0.15);color:#34d399;border-color:rgba(16,185,129,0.3);">Live</span>
                </div>
                <div class="version-details">Erstes Deployment &bull; ${new Date(activeInspectorApp.created_at || Date.now()).toLocaleString('de-DE')}</div>
              </div>
            </div>
            <div>
              <span class="text-subdued" style="font-size:0.75rem;">Aktiv</span>
            </div>
          </div>
        `;
        return;
      }

      listEl.innerHTML = list.map(v => {
        const isCurrent = activeInspectorApp && (v.version === activeInspectorApp.version);
        const sizeStr = v.size_bytes ? (v.size_bytes < 1024 * 1024 ? `${(v.size_bytes / 1024).toFixed(1)} KB` : `${(v.size_bytes / (1024 * 1024)).toFixed(2)} MB`) : '';
        const dateStr = v.created_at ? new Date(v.created_at).toLocaleString('de-DE') : '';

        return `
          <div class="version-item ${isCurrent ? 'active' : ''}">
            <div class="version-meta">
              <span class="version-dot"></span>
              <div>
                <div style="display:flex;align-items:center;gap:0.5rem;">
                  <span class="version-tag">v${v.version}</span>
                  ${isCurrent ? `
                    <span class="badge-tag" style="background:rgba(16,185,129,0.15);color:#34d399;border-color:rgba(16,185,129,0.3);">Live</span>
                  ` : ''}
                </div>
                <div class="version-details">${dateStr}${sizeStr ? ' &bull; ' + sizeStr : ''}</div>
              </div>
            </div>
            <div>
              ${!isCurrent ? `
                <button type="button" class="btn btn-secondary btn-xs" onclick="rollbackToVersion('${appId}', ${v.version})">
                  Rollback aktivieren
                </button>
              ` : `
                <span class="text-subdued" style="font-size:0.75rem;">Aktiv</span>
              `}
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    listEl.innerHTML = '<div class="text-subdued">Fehler beim Laden der Versionen.</div>';
  }
}

window.rollbackToVersion = async function(appId, version) {
  if (!confirm(`Möchten Sie wirklich auf Version v${version} zurücksetzen? Die Dateien werden sofort live geschaltet.`)) return;
  try {
    const res = await fetch(`/api/apps/${appId}/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Erfolgreich auf Version v${version} zurückgesetzt!`, 'success');
      await openAppDetails(appId, 'versions');
      loadApps();
    } else {
      showToast(data.error || 'Rollback fehlgeschlagen', 'error');
    }
  } catch (_) {
    showToast('Netzwerkfehler beim Rollback', 'error');
  }
};

document.getElementById('details-version-upload-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!activeInspectorApp) return;
  const fileInput = document.getElementById('details-version-file');
  if (!fileInput.files || fileInput.files.length === 0) return;
  const file = fileInput.files[0];

  const submitBtn = document.getElementById('btn-upload-version-submit');
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span>Lade hoch &amp; deploye...</span>`;

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(`/api/apps/${activeInspectorApp.id}/deploy`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Neue Version ${data.version ? 'v' + data.version : ''} erfolgreich aktiviert!`, 'success');
      fileInput.value = '';
      await openAppDetails(activeInspectorApp.id, 'versions');
      loadApps();
    } else {
      showToast(data.error || 'Upload fehlgeschlagen', 'error');
    }
  } catch (_) {
    showToast('Netzwerkfehler beim Hochladen', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg> <span>Version hochladen &amp; aktivieren</span>`;
  }
});

// Inspector Logs Management
async function loadInspectorLogs(appId) {
  if (!appId) return;
  const logsContent = document.getElementById('details-logs-content');
  const tail = document.getElementById('details-log-tail').value || 150;
  try {
    const res = await fetch(`/api/apps/${appId}/logs?tail=${tail}`);
    const data = await res.json();
    if (data.success) {
      logsContent.textContent = data.logs || 'Keine Log-Einträge vorhanden.';
      logsContent.scrollTop = logsContent.scrollHeight;
    }
  } catch (err) {
    logsContent.textContent = 'Fehler beim Abrufen der Logs.';
  }
}

function startLogPolling() {
  stopLogPolling();
  const autoCheckbox = document.getElementById('details-log-autorefresh');
  if (!autoCheckbox || !autoCheckbox.checked) return;
  logRefreshInterval = setInterval(() => {
    const modal = document.getElementById('modal-app-details');
    const logsPane = document.getElementById('tab-details-logs');
    if (!modal.classList.contains('hidden') && !logsPane.classList.contains('hidden') && activeInspectorApp) {
      loadInspectorLogs(activeInspectorApp.id);
    } else {
      stopLogPolling();
    }
  }, 3000);
}

function stopLogPolling() {
  if (logRefreshInterval) {
    clearInterval(logRefreshInterval);
    logRefreshInterval = null;
  }
}

document.getElementById('details-log-tail').addEventListener('change', () => {
  if (activeInspectorApp) loadInspectorLogs(activeInspectorApp.id);
});

document.getElementById('details-log-autorefresh').addEventListener('change', (e) => {
  if (e.target.checked) startLogPolling();
  else stopLogPolling();
});

document.getElementById('btn-details-logs-refresh').addEventListener('click', () => {
  if (activeInspectorApp) loadInspectorLogs(activeInspectorApp.id);
});

document.getElementById('btn-details-logs-copy').addEventListener('click', () => {
  const content = document.getElementById('details-logs-content').textContent;
  copyToClipboard(content, 'Logs kopiert');
});

// -------------------------------------------------------------
// Inspector Data & Database Management
// -------------------------------------------------------------
window.loadAppData = async function(appId) {
  if (!appId) return;
  const sizeEl = document.getElementById('data-total-size');
  const countEl = document.getElementById('data-file-count');
  const statusEl = document.getElementById('data-sqlite-status');
  const filesListEl = document.getElementById('data-files-list');
  const sqliteCard = document.getElementById('data-sqlite-card');

  try {
    const res = await fetch(`/api/apps/${appId}/data`);
    const data = await res.json();
    if (!data.ok && !data.success) {
      if (statusEl) statusEl.textContent = 'Fehler beim Laden';
      return;
    }

    const st = data.storage;
    const kb = (st.totalSizeBytes / 1024).toFixed(1);
    if (sizeEl) sizeEl.textContent = st.totalSizeBytes < 1024 * 1024 ? `${kb} KB` : `${(st.totalSizeBytes / (1024 * 1024)).toFixed(2)} MB`;
    if (countEl) countEl.textContent = `${st.fileCount} Datei${st.fileCount === 1 ? '' : 'en'}`;

    // Render Files List
    if (filesListEl) {
      if (!st.files || st.files.length === 0) {
        filesListEl.innerHTML = '<div class="text-subdued" style="font-size:0.85rem;padding:0.5rem 0;">Noch keine Dateien im <code>/data</code>-Verzeichnis abgelegt.</div>';
      } else {
        filesListEl.innerHTML = `
          <table class="apps-table" style="font-size:0.8rem;margin:0;">
            <thead>
              <tr>
                <th>Datei</th>
                <th>Pfad</th>
                <th>Größe</th>
                <th>Zuletzt geändert</th>
              </tr>
            </thead>
            <tbody>
              ${st.files.map(f => {
                const sz = f.sizeBytes < 1024 ? `${f.sizeBytes} B` : (f.sizeBytes < 1024 * 1024 ? `${(f.sizeBytes / 1024).toFixed(1)} KB` : `${(f.sizeBytes / (1024 * 1024)).toFixed(2)} MB`);
                const dt = new Date(f.mtime).toLocaleString('de-DE');
                const badge = f.isSqlite ? '<span class="badge-tag node" style="margin-left:6px;font-size:0.65rem;">SQLite</span>' : (f.isJson ? '<span class="badge-tag static" style="margin-left:6px;font-size:0.65rem;">JSON</span>' : '');
                return `
                  <tr>
                    <td class="font-mono"><strong>${escapeHtml(f.name)}</strong>${badge}</td>
                    <td class="text-subdued font-mono">${escapeHtml(f.path)}</td>
                    <td class="font-mono">${sz}</td>
                    <td class="text-subdued">${dt}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `;
      }
    }

    // Render SQLite Database Explorer
    if (st.sqlite && st.sqlite.hasDb) {
      if (statusEl) {
        const tCount = st.sqlite.tables?.length || 0;
        statusEl.innerHTML = `<span class="status-dot running"></span> ${tCount} Tabelle${tCount === 1 ? '' : 'n'} (${escapeHtml(st.sqlite.file)})`;
      }

      if (sqliteCard) {
        sqliteCard.classList.remove('hidden');
        document.getElementById('data-sqlite-filename').textContent = `${st.sqlite.file} • ${st.sqlite.tables?.length || 0} Tabelle(n)`;
        const pillsEl = document.getElementById('data-sqlite-table-pills');
        if (pillsEl) {
          if (!st.sqlite.tables || st.sqlite.tables.length === 0) {
            pillsEl.innerHTML = '<span class="text-subdued" style="font-size:0.8rem;">Keine Tabellen angelegt</span>';
            document.getElementById('data-sqlite-thead').innerHTML = '';
            document.getElementById('data-sqlite-tbody').innerHTML = '<tr><td class="text-subdued" style="padding:1rem;">Die Datenbankdatei existiert, enthält aber noch keine Tabellen.</td></tr>';
            document.getElementById('data-sqlite-pagination-info').textContent = '0 Tabellen';
          } else {
            pillsEl.innerHTML = st.sqlite.tables.map((t, idx) => `
              <button type="button" class="btn btn-secondary btn-xs ${idx === 0 ? 'active' : ''}" id="btn-tbl-${escapeHtml(t.name)}" onclick="loadSqliteTable('${appId}', '${escapeHtml(st.sqlite.file)}', '${escapeHtml(t.name)}')">
                ${escapeHtml(t.name)} (${t.rowCount})
              </button>
            `).join('');

            // Load first table by default
            loadSqliteTable(appId, st.sqlite.file, st.sqlite.tables[0].name);
          }
        }
      }
    } else {
      if (statusEl) statusEl.textContent = 'Keine SQLite-DB';
      if (sqliteCard) sqliteCard.classList.add('hidden');
    }
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Fehler beim Laden';
  }
};

window.loadSqliteTable = async function(appId, file, tableName) {
  if (!appId || !tableName) return;
  document.querySelectorAll('#data-sqlite-table-pills button').forEach(b => {
    b.classList.toggle('active', b.id === `btn-tbl-${tableName}`);
  });

  const thead = document.getElementById('data-sqlite-thead');
  const tbody = document.getElementById('data-sqlite-tbody');
  const pagInfo = document.getElementById('data-sqlite-pagination-info');

  tbody.innerHTML = '<tr><td colspan="10" class="text-subdued" style="padding:1rem;text-align:center;">Lade Datensätze...</td></tr>';

  try {
    const res = await fetch(`/api/apps/${appId}/data/table?file=${encodeURIComponent(file)}&table=${encodeURIComponent(tableName)}&limit=50`);
    const data = await res.json();
    if (!data.ok && !data.success) {
      tbody.innerHTML = `<tr><td class="text-subdued" style="padding:1rem;color:#f87171;">${escapeHtml(data.error || 'Fehler beim Laden')}</td></tr>`;
      return;
    }

    const columns = data.columns || [];
    const rows = data.rows || [];

    if (columns.length === 0) {
      thead.innerHTML = '';
      tbody.innerHTML = '<tr><td class="text-subdued" style="padding:1rem;">Tabelle enthält keine Spalten.</td></tr>';
      pagInfo.textContent = '0 Spalten';
      return;
    }

    thead.innerHTML = `<tr>${columns.map(c => `<th>${escapeHtml(c.name)} ${c.pk ? '<span style="color:var(--primary);font-size:0.7rem;">(PK)</span>' : ''}</th>`).join('')}</tr>`;

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${columns.length}" class="text-subdued" style="padding:1rem;text-align:center;">Tabelle ist leer (0 Einträge).</td></tr>`;
    } else {
      tbody.innerHTML = rows.map(r => `
        <tr>
          ${columns.map(c => {
            const val = r[c.name];
            const str = (val === null || val === undefined) ? '<span class="text-subdued">NULL</span>' : escapeHtml(typeof val === 'object' ? JSON.stringify(val) : String(val));
            return `<td class="font-mono">${str}</td>`;
          }).join('')}
        </tr>
      `).join('');
    }

    pagInfo.textContent = `Tabelle '${tableName}': ${rows.length} von ${data.total} Einträgen (Limit: 50)`;
  } catch (err) {
    tbody.innerHTML = `<tr><td class="text-subdued" style="padding:1rem;color:#f87171;">Netzwerkfehler: ${escapeHtml(err.message)}</td></tr>`;
  }
};

document.getElementById('btn-data-refresh')?.addEventListener('click', () => {
  if (activeInspectorApp) loadAppData(activeInspectorApp.id);
});

document.getElementById('btn-data-reset')?.addEventListener('click', async () => {
  if (!activeInspectorApp) return;
  if (!confirm(`Möchten Sie wirklich den gesamten persistenten Speicher (/data) von '${activeInspectorApp.subdomain}' unwiderruflich leeren? Alle SQLite-Tabellen und Dateien werden gelöscht.`)) {
    return;
  }
  try {
    const res = await fetch(`/api/apps/${activeInspectorApp.id}/data`, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok || data.success) {
      showToast('Speicher erfolgreich zurückgesetzt', 'success');
      loadAppData(activeInspectorApp.id);
    } else {
      showToast(data.error || 'Fehler beim Zurücksetzen', 'error');
    }
  } catch (_) {
    showToast('Netzwerkfehler', 'error');
  }
});

// Inspector Settings Form Submission
document.getElementById('details-settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!activeInspectorApp) return;

  const updates = {
    title: document.getElementById('settings-title').value.trim(),
    subdomain: document.getElementById('settings-subdomain').value.trim(),
    password: document.getElementById('settings-password').value,
    spa: document.getElementById('settings-spa').checked
  };

  const ttlVal = document.getElementById('settings-ttl').value;
  if (ttlVal) updates.ttl = ttlVal;

  if (activeInspectorApp.type === 'docker') {
    const portVal = document.getElementById('settings-port').value.trim();
    if (portVal) updates.port = portVal;
    updates.start = document.getElementById('settings-start').value.trim();
    updates.build = document.getElementById('settings-build').value.trim();
    updates.env = document.getElementById('settings-env').value.trim();
  }

  try {
    const res = await fetch(`/api/apps/${activeInspectorApp.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    const data = await res.json();
    if (data.success) {
      showToast('Einstellungen erfolgreich gespeichert', 'success');
      await openAppDetails(activeInspectorApp.id, 'settings');
      loadApps();
    } else {
      showToast(data.error || 'Speichern fehlgeschlagen', 'error');
    }
  } catch (_) {
    showToast('Netzwerkfehler beim Speichern', 'error');
  }
});

document.getElementById('btn-details-delete-app').addEventListener('click', () => {
  if (!activeInspectorApp) return;
  const id = activeInspectorApp.id;
  const sub = activeInspectorApp.subdomain;
  deleteApp(id, sub);
  if (isFullpageActive) {
    closeFullpageApp();
  } else {
    document.getElementById('modal-app-details').classList.add('hidden');
  }
  stopLogPolling();
});

// -------------------------------------------------------------
// Fullpage Dedicated Detail View & Hash Routing
// -------------------------------------------------------------
let isFullpageActive = false;

window.openFullpageApp = async function(appId, tab = 'overview') {
  await openAppDetails(appId, tab);
  if (!activeInspectorApp) return;

  // Dock inspector modal window into fullpage host
  if (inspectorModalWindow && fullpageContentHost) {
    fullpageContentHost.appendChild(inspectorModalWindow);
    inspectorModalWindow.classList.add('is-fullpage');
  }

  // Update topbar elements
  if (fullpageTitle) fullpageTitle.textContent = activeInspectorApp.title || activeInspectorApp.subdomain;
  if (fullpageExternalLink) fullpageExternalLink.href = activeInspectorApp.url;

  const pill = document.getElementById('details-status-pill');
  if (fullpageStatusPill && pill) {
    fullpageStatusPill.className = pill.className;
    fullpageStatusPill.textContent = pill.textContent;
  }

  // Hide modal container & regular page, show fullpage container
  const modalOverlay = document.getElementById('modal-app-details');
  if (modalOverlay) modalOverlay.classList.add('hidden');
  if (pageContainer) pageContainer.classList.add('hidden');
  if (fullpageAppDetail) fullpageAppDetail.classList.remove('hidden');

  isFullpageActive = true;
  window.location.hash = `#/app/${activeInspectorApp.subdomain || activeInspectorApp.id}`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.closeFullpageApp = function() {
  if (!isFullpageActive) return;

  // Undock inspector modal window back to modal overlay
  const modalOverlay = document.getElementById('modal-app-details');
  if (inspectorModalWindow && modalOverlay) {
    modalOverlay.appendChild(inspectorModalWindow);
    inspectorModalWindow.classList.remove('is-fullpage');
  }

  if (fullpageAppDetail) fullpageAppDetail.classList.add('hidden');
  if (pageContainer) pageContainer.classList.remove('hidden');

  isFullpageActive = false;
  if (window.location.hash.startsWith('#/app/')) {
    history.pushState(null, '', window.location.pathname);
  }
};

if (btnDetailsExpandFullpage) {
  btnDetailsExpandFullpage.addEventListener('click', () => {
    if (activeInspectorApp) {
      openFullpageApp(activeInspectorApp.id);
    }
  });
}

if (btnFullpageBack) {
  btnFullpageBack.addEventListener('click', (e) => {
    e.preventDefault();
    closeFullpageApp();
  });
}

if (btnFullpageClose) {
  btnFullpageClose.addEventListener('click', (e) => {
    e.preventDefault();
    closeFullpageApp();
  });
}

// Hash Routing Handler
async function handleHashRoute() {
  const hash = window.location.hash;
  if (hash.startsWith('#/app/')) {
    const slugOrId = hash.replace('#/app/', '').trim();
    if (slugOrId) {
      await openFullpageApp(slugOrId);
    }
  } else if (isFullpageActive) {
    closeFullpageApp();
  }
}

window.addEventListener('hashchange', handleHashRoute);

// Sidebar Navigation Items
document.getElementById('nav-item-apps')?.addEventListener('click', (e) => {
  e.preventDefault();
  if (isFullpageActive) closeFullpageApp();
  document.querySelectorAll('.sidebar-nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById('nav-item-apps').classList.add('active');
  document.querySelector('.deployments-section')?.scrollIntoView({ behavior: 'smooth' });
});

document.getElementById('nav-item-deploy')?.addEventListener('click', (e) => {
  e.preventDefault();
  if (isFullpageActive) closeFullpageApp();
  document.querySelectorAll('.sidebar-nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById('nav-item-deploy').classList.add('active');
  if (sectionDeploy) sectionDeploy.classList.remove('collapsed');
  switchTab('tab-file');
  sectionDeploy?.scrollIntoView({ behavior: 'smooth' });
  document.getElementById('file-input')?.click();
});

document.getElementById('nav-item-keys')?.addEventListener('click', () => {
  loadApiKeys();
  document.getElementById('modal-api-keys').classList.remove('hidden');
});

document.getElementById('nav-item-ai')?.addEventListener('click', () => {
  updateAiPromptGuide();
  document.getElementById('modal-ai-guide').classList.remove('hidden');
});

document.getElementById('nav-item-settings')?.addEventListener('click', () => {
  document.getElementById('modal-dashboard-settings')?.classList.remove('hidden');
});

// -------------------------------------------------------------
// Administrator Password Change Modal
// -------------------------------------------------------------
window.openChangePasswordModal = function() {
  const modal = document.getElementById('modal-change-password');
  if (!modal) return;
  const currentInput = document.getElementById('input-current-password');
  const newInput = document.getElementById('input-new-password');
  const confirmInput = document.getElementById('input-confirm-password');
  const errBox = document.getElementById('password-change-error');
  if (currentInput) currentInput.value = '';
  if (newInput) newInput.value = '';
  if (confirmInput) confirmInput.value = '';
  if (errBox) { errBox.textContent = ''; errBox.classList.add('hidden'); }
  modal.classList.remove('hidden');
  setTimeout(() => currentInput?.focus(), 80);
};

window.submitPasswordChange = async function() {
  const currentInput = document.getElementById('input-current-password');
  const newInput = document.getElementById('input-new-password');
  const confirmInput = document.getElementById('input-confirm-password');
  const errBox = document.getElementById('password-change-error');
  const btn = document.getElementById('btn-submit-change-password');

  const showError = (msg) => {
    if (errBox) {
      errBox.textContent = msg;
      errBox.classList.remove('hidden');
    } else {
      showToast(msg, 'error');
    }
  };

  const currentPassword = currentInput?.value;
  const newPassword = newInput?.value;
  const confirmPassword = confirmInput?.value;

  if (!currentPassword) {
    showError('Bitte aktuelles Passwort eingeben');
    currentInput?.focus();
    return;
  }
  if (!newPassword || newPassword.trim().length < 4) {
    showError('Neues Passwort muss mindestens 4 Zeichen lang sein');
    newInput?.focus();
    return;
  }
  if (confirmPassword !== undefined && newPassword !== confirmPassword) {
    showError('Die Passwörter stimmen nicht überein');
    confirmInput?.focus();
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Speichere...';
  }

  try {
    const res = await fetch('/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword: newPassword.trim() })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast(data.message || 'Passwort erfolgreich geändert!', 'success');
      document.getElementById('modal-change-password')?.classList.add('hidden');
      if (currentInput) currentInput.value = '';
      if (newInput) newInput.value = '';
      if (confirmInput) confirmInput.value = '';
      if (errBox) { errBox.textContent = ''; errBox.classList.add('hidden'); }
    } else {
      showError(data.error || 'Fehler beim Ändern des Passworts');
    }
  } catch (err) {
    showError('Verbindungsfehler zum Server');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Passwort speichern';
    }
  }
};

document.getElementById('btn-sidebar-password')?.addEventListener('click', () => {
  openChangePasswordModal();
});

document.getElementById('btn-nav-password')?.addEventListener('click', () => {
  openChangePasswordModal();
});

document.getElementById('btn-submit-change-password')?.addEventListener('click', () => {
  submitPasswordChange();
});

document.getElementById('btn-sidebar-logout')?.addEventListener('click', async () => {
  await fetch('/auth/logout', { method: 'POST' });
  showToast('Abgemeldet');
  showLoginView();
});

// -------------------------------------------------------------
// Keyboard Shortcuts & Modal Dismissal
// -------------------------------------------------------------
document.addEventListener('keydown', (e) => {
  // Esc to close active modals
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(modal => {
      modal.classList.add('hidden');
    });
    previewIframe.src = 'about:blank';
    stopLogPolling();
  }

  // Ctrl+K or / to search
  if ((e.ctrlKey && e.key === 'k') || (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA')) {
    e.preventDefault();
    appsSearch.focus();
  }
});

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.getAttribute('data-close');
    document.getElementById(targetId)?.classList.add('hidden');
    if (targetId === 'modal-preview') previewIframe.src = 'about:blank';
    if (targetId === 'modal-app-details') stopLogPolling();
  });
});

document.querySelectorAll('.modal-overlay').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
      if (modal.id === 'modal-preview') previewIframe.src = 'about:blank';
      if (modal.id === 'modal-app-details') stopLogPolling();
    }
  });
});

// Utility
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Initialize
checkAuth();
