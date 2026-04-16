// ============================================================
// THORE INDIA PORTAL — script.js v4.0
// Dual-API architecture: Main Sheet + Sensitive Sheet
// ============================================================

// ── API ENDPOINTS ────────────────────────────────────────────
const MAIN_API_URL = 'https://script.google.com/macros/s/AKfycbw2XDf03HVFPIILNHNZe_RJe4drUhHndLf-5zZS69E56s9ks-_mpYJ849_I0mccjoByhA/exec';
const SENSITIVE_API_URL = 'https://script.google.com/macros/s/AKfycbwlyFZlsszFP-poaAu2cyZ7qdFouT14r7njYFDpsJRZQTw76ztsJYxcAD248yEnil4gUQ/exec';
const SENSITIVE_API_KEY = 'g7Kx4Qp9Zt2Lm8Vd3Rj5Hy6Nc1WsFa0B';

// ── GLOBALS ──────────────────────────────────────────────────
let currentUser = null;
let deferredPrompt;
let notificationSyncInterval;

// ── API HELPERS ───────────────────────────────────────────────
async function apiCall(action, params = {}) {
  return _apiGet(MAIN_API_URL, action, params);
}

async function secureApiCall(action, params = {}) {
  return _apiGet(SENSITIVE_API_URL, action, { ...params, apiKey: SENSITIVE_API_KEY });
}

async function _apiGet(baseUrl, action, params) {
  try {
    const allParams = { action, ...params };
    const qs = Object.keys(allParams)
      .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(allParams[k]))
      .join('&');
    const res = await fetch(`${baseUrl}?${qs}`, { method: 'GET', redirect: 'follow' });
    return await res.json();
  } catch (err) {
    console.error(`API error [${action}]:`, err);
    throw err;
  }
}

// ── INIT ──────────────────────────────────────────────────────
window.addEventListener('load', () => {
  setTimeout(checkAuth, 2000);

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
      .then(r => console.log('SW registered:', r.scope))
      .catch(e => console.log('SW failed:', e));

    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type === 'FCM_TOKEN_REFRESH' && currentUser) {
        registerFCMToken(currentUser.email);
      }
    });
  }

  // Track online presence
  trackUserPresence();
});

// ── SCREEN MANAGER ────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}

// ── AUTH ──────────────────────────────────────────────────────
function checkAuth() {
  const saved = localStorage.getItem('currentUser');
  if (saved) {
    currentUser = JSON.parse(saved);
    checkForAnnouncement();
  } else {
    showScreen('loginScreen');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('loginForm')?.addEventListener('submit', e => { e.preventDefault(); handleLogin(); });
  document.getElementById('dataRequestForm')?.addEventListener('submit', e => { e.preventDefault(); handleDataRequestSubmit(); });
  document.getElementById('registerForm')?.addEventListener('submit', e => { e.preventDefault(); handleRegisterSubmit(); });
});

async function handleLogin() {
  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const errorDiv = document.getElementById('loginError');
  const btn      = document.getElementById('loginBtn');
  const btnText  = document.getElementById('loginBtnText');
  const btnLoad  = document.getElementById('loginBtnLoader');

  errorDiv.classList.remove('show');
  btn.disabled = true;
  btnText.style.display = 'none';
  btnLoad.style.display = 'inline-flex';

  try {
    const result = await secureApiCall('validateLogin', { email, password });
    btn.disabled = false;
    btnText.style.display = 'inline';
    btnLoad.style.display = 'none';

    if (result.success) {
      currentUser = result.user;
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
      // Record login time for presence tracking
      localStorage.setItem('loginTime', Date.now().toString());
      registerFCMToken(currentUser.email);
      // Notify presence (ping main API)
      pingPresence();
      checkForAnnouncement();
    } else {
      errorDiv.textContent = result.message;
      errorDiv.classList.add('show');
    }
  } catch {
    btn.disabled = false;
    btnText.style.display = 'inline';
    btnLoad.style.display = 'none';
    errorDiv.textContent = 'Login failed. Please check your connection.';
    errorDiv.classList.add('show');
  }
}

// ── PRESENCE TRACKING ─────────────────────────────────────────
// We store presence in localStorage with a timestamp.
// The ops settings panel reads all users and checks last ping time.
function trackUserPresence() {
  // Ping every 2 minutes while app is open
  setInterval(() => {
    if (currentUser) pingPresence();
  }, 2 * 60 * 1000);

  // Ping on visibility change
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentUser) pingPresence();
  });
}

async function pingPresence() {
  if (!currentUser) return;
  try {
    await apiCall('pingUserPresence', {
      userEmail: currentUser.email,
      userName: currentUser.name,
      userRole: currentUser.role
    });
  } catch {}
}

// ── FCM ───────────────────────────────────────────────────────
async function registerFCMToken(userEmail) {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    if (!window.firebaseReady) {
      document.addEventListener('firebaseReady', () => registerFCMToken(userEmail));
      return;
    }
    if (typeof window.firebaseRequestToken !== 'function') return;

    const token = await window.firebaseRequestToken();
    if (token) {
      await secureApiCall('saveFCMToken', { userEmail, fcmToken: token });
    }
  } catch (err) {
    console.error('FCM token registration failed:', err);
  }
}

// ── ANNOUNCEMENTS ─────────────────────────────────────────────
async function checkForAnnouncement() {
  try {
    const ann = await apiCall('getActiveAnnouncement');
    if (ann && !sessionStorage.getItem('announcementShown')) {
      showAnnouncement(ann);
    } else {
      showMainApp();
    }
  } catch {
    showMainApp();
  }
}

function showAnnouncement(ann) {
  const content = document.getElementById('announcementContent');
  let html = '';
  if (ann.imageUrl) html += `<img src="${escapeHtml(ann.imageUrl)}" alt="Announcement">`;
  if (ann.message)  html += `<p>${escapeHtml(ann.message)}</p>`;
  content.innerHTML = html;
  showScreen('announcementScreen');
}

function closeAnnouncement() {
  sessionStorage.setItem('announcementShown', 'true');
  showMainApp();
}

async function showAnnouncements() {
  closeMenu();
  try {
    const ann = await apiCall('getActiveAnnouncement');
    if (ann) { sessionStorage.removeItem('announcementShown'); showAnnouncement(ann); }
    else alert('No announcements at this time.');
  } catch { alert('Error loading announcements.'); }
}

// ── MAIN APP ──────────────────────────────────────────────────
function showMainApp() {
  updateUserInfo();
  showScreen('mainScreen');
  loadLinks();
  checkIfOperationsTeam();
  checkTeamAccess();
  loadDashboardStats();
  loadNotifications();
  notificationSyncInterval = setInterval(loadNotifications, 5 * 60 * 1000);

  if (!window.matchMedia('(display-mode: standalone)').matches) {
    setTimeout(() => document.getElementById('installPrompt')?.classList.add('show'), 2000);
  }
}

function updateUserInfo() {
  if (!currentUser) return;
  document.getElementById('userName').textContent   = currentUser.name;
  document.getElementById('userEmail').textContent  = currentUser.email;
  document.getElementById('userAvatar').textContent = currentUser.name.charAt(0).toUpperCase();
  document.getElementById('reqUserName').textContent = currentUser.name;
  document.getElementById('reqUserRole').textContent = currentUser.role;
  const roleBadge = document.getElementById('userRoleBadge');
  if (roleBadge) roleBadge.textContent = currentUser.role;
  const greetEl = document.getElementById('greetingName');
  if (greetEl) greetEl.textContent = currentUser.name ? currentUser.name.split(' ')[0] : '';
  updateDateTime();
}

function updateDateTime() {
  const now = new Date();
  const opts = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  const el = document.getElementById('reqDateTime');
  if (el) el.textContent = now.toLocaleString('en-IN', opts);
}

// ── ROLE HELPERS ──────────────────────────────────────────────
function getRoleTier(role) {
  const r = (role || '').toLowerCase().trim();
  if (r === 'executive' || r === 'sales executive') return 1;
  if (r === 'team leader' || r === 'tl') return 2;
  if (r === 'manager') return 3;
  if (r === 'admin') return 4;
  return 0;
}

function canSeeTeam() {
  return currentUser && getRoleTier(currentUser.role) >= 2;
}

// ── OPERATIONS CHECK ──────────────────────────────────────────
async function checkIfOperationsTeam() {
  if (!currentUser) return;
  try {
    const result = await secureApiCall('isOperationsTeam', { userEmail: currentUser.email });
    if (result.isOperationsTeam) {
      document.getElementById('opsMenuBtn').style.display = 'flex';
      document.getElementById('opsSettingsMenuBtn').style.display = 'flex';
    }
  } catch {}
}

async function checkTeamAccess() {
  if (!currentUser) return;
  if (canSeeTeam()) {
    document.getElementById('teamMenuBtn').style.display = 'flex';
  }
}

// ── DASHBOARD STATS ───────────────────────────────────────────
async function loadDashboardStats() {
  if (!currentUser) return;
  try {
    const [sensitiveStats, requests, yssrData] = await Promise.all([
      secureApiCall('getDashboardStats', { userEmail: currentUser.email }),
      apiCall('getUserRequests', { userEmail: currentUser.email }),
      apiCall('getYSSR', { userEmail: currentUser.email })
    ]);

    if (sensitiveStats.success) {
      const t = sensitiveStats.incentiveTotals || {};
      setEl('dashIncentiveGenerated', '₹' + formatNum(t.generated || 0));
      setEl('dashIncentivePaid',      '₹' + formatNum(t.paid || 0));
      setEl('dashIncentivePending',   '₹' + formatNum(t.pending || 0));
    }

    if (Array.isArray(requests)) {
      const pending = requests.filter(r => r.status === 'Pending').length;
      setEl('dashPendingReq', pending + ' pending');
    }

    // YSSR card
    if (yssrData && yssrData.success) {
      setEl('dashYSSRValue', yssrData.value || '—');
      setEl('dashYSSRLabel', yssrData.label || 'YSSR');
    }
  } catch (err) {
    console.error('Dashboard stats error:', err);
  }
}

function formatNum(n) {
  return Number(n).toLocaleString('en-IN');
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── LINKS ─────────────────────────────────────────────────────
async function loadLinks() {
  if (!currentUser) return;
  const spinner   = document.getElementById('loadingSpinner');
  const container = document.getElementById('linksContainer');
  if (spinner) spinner.classList.add('show');
  container.innerHTML = '';

  try {
    const links = await apiCall('getLinksForUser', { userRole: currentUser.role });
    if (spinner) spinner.classList.remove('show');
    displayLinks(links);
  } catch (err) {
    if (spinner) spinner.classList.remove('show');
    container.innerHTML = '<div class="empty-state">Error loading links. Please refresh.</div>';
  }
}

function displayLinks(links) {
  const container = document.getElementById('linksContainer');

  if (!links || links.length === 0) {
    container.innerHTML = '<div class="empty-state">No links available for you</div>';
    return;
  }

  links.forEach(link => {
    const card = document.createElement('div');
    card.className = 'link-chip';

    const logoHtml = link.logoUrl
      ? `<img src="${escapeHtml(link.logoUrl)}" alt="${escapeHtml(link.title)}" class="link-logo-img" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
      : '';

    const initials = link.title.substring(0, 2).toUpperCase();
    const fallback = `<div class="link-logo-fallback" ${link.logoUrl ? 'style="display:none"' : ''}>${initials}</div>`;

    card.innerHTML = `
      <div class="link-logo-wrap">
        ${logoHtml}
        ${fallback}
      </div>
      <span class="link-chip-name">${escapeHtml(link.title)}</span>
    `;

    card.addEventListener('click', () => openLink(link.url));
    container.appendChild(card);
  });
}

// ── SEARCH ────────────────────────────────────────────────────
function toggleSearch() {
  const bar   = document.getElementById('searchBar');
  const input = document.getElementById('globalSearch');
  bar.classList.toggle('search-bar-open');
  if (bar.classList.contains('search-bar-open')) {
    input.focus();
    input.oninput = e => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('.link-chip').forEach(card => {
        card.style.display = card.innerText.toLowerCase().includes(q) ? 'flex' : 'none';
      });
    };
  } else {
    input.value = '';
    document.querySelectorAll('.link-chip').forEach(c => c.style.display = 'flex');
  }
}

function openLink(url) {
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// ── VIEW NAVIGATION ───────────────────────────────────────────
const VIEWS = ['linksView','dataRequestView','myRequestsView','operationsView','teamView','incentiveView','payslipView','profileView','opsSettingsView','attendanceView'];

function showView(id) {
  VIEWS.forEach(v => {
    const el = document.getElementById(v);
    if (el) el.style.display = v === id ? 'block' : 'none';
  });
}

function showLinksView()         { showView('linksView');       closeMenu(); loadDashboardStats(); }
function showDataRequestPortal() { showView('dataRequestView'); closeMenu(); updateDateTime(); resetRequestForm(); }
function showMyRequests()        { showView('myRequestsView');  closeMenu(); setTimeout(loadMyRequests, 50); }
function showOperationsPanel()   { showView('operationsView');  closeMenu(); loadOperationsPanel(); }
function showTeamView()          { showView('teamView');        closeMenu(); loadTeamView(); }
function showIncentiveView()     { showView('incentiveView');   closeMenu(); loadIncentiveView(); }
function showPayslipView()       { showView('payslipView');     closeMenu(); loadPayslips(); }
function showProfileView()       { showView('profileView');     closeMenu(); loadProfile(); }
function showOpsSettings()       { showView('opsSettingsView'); closeMenu(); loadOpsSettings(); }

function resetRequestForm() {
  document.getElementById('remarks').value = '';
  document.getElementById('requestError').classList.remove('show');
  document.getElementById('requestSuccess').classList.remove('show');
}

// ── DATA REQUEST ──────────────────────────────────────────────
async function handleDataRequestSubmit() {
  const remarks    = document.getElementById('remarks').value.trim();
  const errorDiv   = document.getElementById('requestError');
  const successDiv = document.getElementById('requestSuccess');
  const btn        = document.getElementById('submitRequestBtn');
  const btnText    = document.getElementById('submitBtnText');
  const btnLoad    = document.getElementById('submitBtnLoader');

  if (!remarks) { errorDiv.textContent = 'Please enter request details'; errorDiv.classList.add('show'); return; }

  errorDiv.classList.remove('show');
  successDiv.classList.remove('show');
  btn.disabled = true; btnText.style.display = 'none'; btnLoad.style.display = 'inline-flex';

  try {
    const result = await apiCall('submitDataRequest', {
      userEmail: currentUser.email, userName: currentUser.name,
      userRole: currentUser.role, remarks
    });
    btn.disabled = false; btnText.style.display = 'inline'; btnLoad.style.display = 'none';
    if (result.success) {
      successDiv.innerHTML = `<strong>✓ Request Submitted!</strong><br>ID: ${result.requestId} | Est: ${result.estimatedTime}`;
      successDiv.classList.add('show');
      document.getElementById('remarks').value = '';
      setTimeout(() => successDiv.classList.remove('show'), 5000);
    } else {
      errorDiv.textContent = result.message; errorDiv.classList.add('show');
    }
  } catch {
    btn.disabled = false; btnText.style.display = 'inline'; btnLoad.style.display = 'none';
    errorDiv.textContent = 'Error submitting. Please try again.'; errorDiv.classList.add('show');
  }
}

// ── MY REQUESTS ───────────────────────────────────────────────
async function loadMyRequests() {
  if (!currentUser) return;
  const loading   = document.getElementById('myRequestsLoading');
  const container = document.getElementById('myRequestsContainer');
  loading.classList.remove('hide'); container.innerHTML = '';

  try {
    const requests = await apiCall('getUserRequests', { userEmail: currentUser.email });
    loading.classList.add('hide');
    displayMyRequests(requests);
  } catch {
    loading.classList.add('hide');
    container.innerHTML = '<div class="empty-state">Error loading requests.</div>';
  }
}

function displayMyRequests(requests) {
  const container = document.getElementById('myRequestsContainer');
  if (!requests.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>No requests yet</p></div>`;
    return;
  }
  container.innerHTML = '';
  requests.forEach(req => {
    const card = document.createElement('div');
    card.className = 'request-card';
    let sc = req.status === 'Completed' ? 'status-completed' : req.status === 'Rejected' ? 'status-rejected' : 'status-pending';
    let extra = '';
    if (req.status === 'Completed' && req.actualCompleteTime)
      extra += `<div class="request-detail"><strong>Completed:</strong><span>${escapeHtml(req.actualCompleteTime)}</span></div>
                <div class="request-detail"><strong>Handled By:</strong><span>${escapeHtml(req.handledBy)}</span></div>`;
    if (req.status === 'Rejected' && req.rejectReason)
      extra += `<div class="request-detail"><strong>Reason:</strong><span style="color:#fca5a5">${escapeHtml(req.rejectReason)}</span></div>`;
    card.innerHTML = `
      <div class="request-card-header">
        <span class="request-id">${escapeHtml(req.requestId)}</span>
        <span class="request-status ${sc}">${escapeHtml(req.status)}</span>
      </div>
      <div class="request-detail"><strong>Date:</strong><span>${escapeHtml(req.requestDate)} ${escapeHtml(req.requestTime)}</span></div>
      <div class="request-detail"><strong>Est. Time:</strong><span>${escapeHtml(req.estimatedTime)}</span></div>
      ${extra}
      <div class="request-remarks"><strong>Details:</strong><br>${escapeHtml(req.remarks)}</div>`;
    container.appendChild(card);
  });
}

// ── OPERATIONS PANEL ──────────────────────────────────────────
async function loadOperationsPanel() {
  document.getElementById('operationsLoading').classList.remove('hide');
  document.getElementById('operationsContainer').innerHTML = '';
  try {
    const stats    = await apiCall('getOperationsStats');
    displayOperationsStats(stats);
    const requests = await apiCall('getAllPendingRequests');
    document.getElementById('operationsLoading').classList.add('hide');
    displayOperationsRequests(requests);
  } catch {
    document.getElementById('operationsLoading').classList.add('hide');
    document.getElementById('operationsContainer').innerHTML = '<div class="empty-state">Error loading requests.</div>';
  }
}

function displayOperationsStats(stats) {
  const container = document.getElementById('operationsStatsContainer');
  let html = '';
  for (const member in stats) {
    html += `<div class="stat-card"><div class="stat-number">${stats[member]}</div><div class="stat-label">${escapeHtml(member)}</div></div>`;
  }
  container.innerHTML = html;
}

function displayOperationsRequests(requests) {
  const container = document.getElementById('operationsContainer');
  if (!requests.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><p>No pending requests</p></div>`;
    return;
  }
  container.innerHTML = '';
  requests.forEach(req => {
    const card = document.createElement('div');
    card.className = 'request-card';
    card.innerHTML = `
      <div class="request-card-header">
        <span class="request-id">${escapeHtml(req.requestId)}</span>
        <span class="request-status status-pending">${escapeHtml(req.status)}</span>
      </div>
      <div class="request-detail"><strong>By:</strong><span>${escapeHtml(req.requestedBy)} (${escapeHtml(req.role)})</span></div>
      <div class="request-detail"><strong>Email:</strong><span>${escapeHtml(req.email)}</span></div>
      <div class="request-detail"><strong>Date:</strong><span>${escapeHtml(req.requestDate)} ${escapeHtml(req.requestTime)}</span></div>
      <div class="request-detail"><strong>Est. Time:</strong><span>${escapeHtml(req.estimatedTime)}</span></div>
      <div class="request-remarks"><strong>Details:</strong><br>${escapeHtml(req.remarks)}</div>
      <div class="request-actions">
        <button class="btn-small btn-complete" onclick="completeRequest('${escapeHtml(req.requestId)}')">✓ Complete</button>
        <button class="btn-small btn-pending"  onclick="updateTimeline('${escapeHtml(req.requestId)}')">⏱ Timeline</button>
        <button class="btn-small btn-reject"   onclick="rejectRequest('${escapeHtml(req.requestId)}')">✗ Reject</button>
      </div>`;
    container.appendChild(card);
  });
}

async function completeRequest(id) {
  if (!confirm('Mark as completed?')) return;
  const r = await apiCall('updateRequestStatus', { requestId: id, status: 'Completed', handledBy: currentUser.name, rejectReason: '' });
  if (r.success) { showToast('Request marked complete!', 'success'); loadOperationsPanel(); }
  else alert('Error: ' + r.message);
}
async function updateTimeline(id) {
  const reason = prompt('Enter reason for delay / updated timeline:');
  if (!reason) return;
  const r = await apiCall('updateRequestStatus', { requestId: id, status: 'Pending', handledBy: currentUser.name, rejectReason: reason });
  if (r.success) { showToast('Timeline updated!', 'success'); loadOperationsPanel(); }
  else alert('Error: ' + r.message);
}
async function rejectRequest(id) {
  const reason = prompt('Enter reason for rejection:');
  if (!reason) return;
  if (!confirm('Reject this request?')) return;
  const r = await apiCall('updateRequestStatus', { requestId: id, status: 'Rejected', handledBy: currentUser.name, rejectReason: reason });
  if (r.success) { showToast('Request rejected', 'error'); loadOperationsPanel(); }
  else alert('Error: ' + r.message);
}

// ── OPS SETTINGS ─────────────────────────────────────────────
async function loadOpsSettings() {
  const container = document.getElementById('opsSettingsContainer');
  if (!container) return;
  container.innerHTML = `<div class="loading"><div class="spinner"></div><p>Loading...</p></div>`;

  try {
    const [presenceData, allUsers] = await Promise.all([
      apiCall('getOnlineUsers', {}),
      secureApiCall('getAllActiveUsers', {})
    ]);

    renderOpsSettings(presenceData, allUsers);
  } catch (err) {
    container.innerHTML = '<div class="empty-state">Error loading settings.</div>';
  }
}

function renderOpsSettings(presenceData, allUsers) {
  const container = document.getElementById('opsSettingsContainer');

  const onlineEmails = new Set((presenceData?.users || []).map(u => u.email.toLowerCase()));
  const users = allUsers?.users || [];

  const onlineUsers  = users.filter(u => onlineEmails.has(u.email.toLowerCase()));
  const offlineUsers = users.filter(u => !onlineEmails.has(u.email.toLowerCase()));

  container.innerHTML = `
    <!-- ── ONLINE PEOPLE ── -->
    <div class="ops-settings-section">
      <div class="ops-settings-section-title">
        <span>🟢 Online Now</span>
        <span class="ops-settings-badge">${onlineUsers.length}</span>
      </div>
      <div class="presence-list">
        ${onlineUsers.length ? onlineUsers.map(u => `
          <div class="presence-item presence-online">
            <div class="presence-avatar">${u.name.charAt(0).toUpperCase()}</div>
            <div class="presence-info">
              <div class="presence-name">${escapeHtml(u.name)}</div>
              <div class="presence-role">${escapeHtml(u.role)}</div>
            </div>
            <div class="presence-dot online-dot"></div>
          </div>`).join('') : '<div class="empty-state" style="padding:16px">No users currently online</div>'}
      </div>

      <div class="ops-settings-section-title" style="margin-top:20px">
        <span>⚫ Offline</span>
        <span class="ops-settings-badge">${offlineUsers.length}</span>
      </div>
      <div class="presence-list">
        ${offlineUsers.length ? offlineUsers.map(u => `
          <div class="presence-item presence-offline">
            <div class="presence-avatar" style="opacity:.5">${u.name.charAt(0).toUpperCase()}</div>
            <div class="presence-info">
              <div class="presence-name" style="color:var(--text-muted)">${escapeHtml(u.name)}</div>
              <div class="presence-role">${escapeHtml(u.role)}</div>
            </div>
            <div class="presence-dot offline-dot"></div>
          </div>`).join('') : '<div class="empty-state" style="padding:16px">All users are online</div>'}
      </div>

      <button class="btn-danger-full" onclick="forceLogoutAll()" style="margin-top:16px">
        🔴 Force Logout All Users
      </button>
      <p style="font-size:11px;color:var(--text-muted);text-align:center;margin-top:8px">
        This will log out all users. Use before pushing updates.
      </p>
    </div>

    <!-- ── PUSH NOTIFICATIONS ── -->
    <div class="ops-settings-section">
      <div class="ops-settings-section-title">📣 Send Push Notification</div>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">
        Send a push notification to all active users. Use for announcements and updates.
      </p>
      <div class="form-group">
        <label>Notification Title</label>
        <input type="text" id="pushNotifTitle" class="form-input" placeholder="e.g. New Update Available" maxlength="80">
      </div>
      <div class="form-group">
        <label>Message</label>
        <textarea id="pushNotifMessage" class="form-textarea" rows="4" placeholder="Enter your announcement or update message here..." style="min-height:100px"></textarea>
      </div>
      <div class="form-group">
        <label>Target Audience</label>
        <select id="pushNotifTarget" class="form-input form-select">
          <option value="all">All Users</option>
          <option value="executive">Sales Executives Only</option>
          <option value="team leader">Team Leaders Only</option>
          <option value="manager">Managers Only</option>
          <option value="operations">Operations Team Only</option>
        </select>
      </div>
      <div id="pushNotifStatus" class="success-message"></div>
      <div id="pushNotifError" class="error-message"></div>
      <button class="btn-primary" onclick="sendBroadcastNotification()" style="margin-top:8px">
        📤 Send Notification
      </button>
    </div>
  `;
}

async function forceLogoutAll() {
  if (!confirm('⚠️ This will log out ALL users from the portal. They will need to sign in again.\n\nAre you sure?')) return;
  try {
    const result = await apiCall('forceLogoutAll', { requestedBy: currentUser.name });
    if (result.success) {
      showToast('Force logout signal sent to all users.', 'success');
    } else {
      showToast('Error: ' + result.message, 'error');
    }
  } catch {
    showToast('Failed to send force logout.', 'error');
  }
}

async function sendBroadcastNotification() {
  const title   = document.getElementById('pushNotifTitle')?.value.trim();
  const message = document.getElementById('pushNotifMessage')?.value.trim();
  const target  = document.getElementById('pushNotifTarget')?.value;
  const statusEl = document.getElementById('pushNotifStatus');
  const errorEl  = document.getElementById('pushNotifError');

  statusEl?.classList.remove('show');
  errorEl?.classList.remove('show');

  if (!title) { if (errorEl) { errorEl.textContent = 'Please enter a notification title.'; errorEl.classList.add('show'); } return; }
  if (!message) { if (errorEl) { errorEl.textContent = 'Please enter a message.'; errorEl.classList.add('show'); } return; }

  try {
    const result = await apiCall('sendBroadcastNotification', {
      title, message, target, sentBy: currentUser.name
    });
    if (result.success) {
      if (statusEl) { statusEl.textContent = `✓ Notification sent to ${result.count || 'all'} users!`; statusEl.classList.add('show'); }
      document.getElementById('pushNotifTitle').value = '';
      document.getElementById('pushNotifMessage').value = '';
      setTimeout(() => statusEl?.classList.remove('show'), 4000);
    } else {
      if (errorEl) { errorEl.textContent = result.message; errorEl.classList.add('show'); }
    }
  } catch {
    if (errorEl) { errorEl.textContent = 'Failed to send notification.'; errorEl.classList.add('show'); }
  }
}

// Poll for force-logout signal
setInterval(async () => {
  if (!currentUser) return;
  try {
    const result = await apiCall('checkForceLogout', {});
    if (result && result.forceLogout) {
      localStorage.removeItem('currentUser');
      sessionStorage.clear();
      currentUser = null;
      if (notificationSyncInterval) clearInterval(notificationSyncInterval);
      showScreen('loginScreen');
      showToast('Session ended by admin. Please sign in again.', 'info');
    }
  } catch {}
}, 3 * 60 * 1000);

// ── TEAM VIEW ─────────────────────────────────────────────────
async function loadTeamView() {
  if (!currentUser) return;
  const container = document.getElementById('teamContainer');
  container.innerHTML = `<div class="loading"><div class="spinner"></div><p>Loading team...</p></div>`;

  try {
    const result = await secureApiCall('getTeamForUser', { userEmail: currentUser.email });
    if (!result.success) { container.innerHTML = '<div class="empty-state">Error loading team.</div>'; return; }
    displayTeam(result.team);
  } catch {
    container.innerHTML = '<div class="empty-state">Error loading team.</div>';
  }
}

function displayTeam(team) {
  const container = document.getElementById('teamContainer');
  if (!team || !team.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><p>No team members found</p></div>`;
    return;
  }

  const tier = (r) => getRoleTier(r);
  const roleColor = { 1: '#22c55e', 2: '#f59e0b', 3: '#6366f1' };

  container.innerHTML = `<div class="team-count-badge">${team.length} member${team.length !== 1 ? 's' : ''}</div>`;

  team.forEach(member => {
    const card = document.createElement('div');
    card.className = 'team-card';
    const t     = tier(member.role);
    const color = roleColor[t] || '#94a3b8';
    card.innerHTML = `
      <div class="team-card-left">
        <div class="team-avatar" style="background:${color}20;color:${color};border:2px solid ${color}40">
          ${member.name.charAt(0).toUpperCase()}
        </div>
        <div class="team-info">
          <div class="team-name">${escapeHtml(member.name)}</div>
          <div class="team-role" style="color:${color}">${escapeHtml(member.role)}</div>
          <div class="team-dept">${escapeHtml(member.department || '—')}</div>
        </div>
      </div>
      <div class="team-card-right">
        <div class="team-detail-row">📧 <a href="mailto:${escapeHtml(member.email)}" class="team-email">${escapeHtml(member.email)}</a></div>
        ${member.phone ? `<div class="team-detail-row">📞 <a href="tel:${escapeHtml(member.phone)}" class="team-phone">${escapeHtml(member.phone)}</a></div>` : ''}
        ${member.joinDate ? `<div class="team-detail-row">📅 Joined ${escapeHtml(member.joinDate)}</div>` : ''}
        ${member.designation ? `<div class="team-detail-row">🏷️ ${escapeHtml(member.designation)}</div>` : ''}
      </div>
    `;
    container.appendChild(card);
  });
}

// ── INCENTIVE VIEW ────────────────────────────────────────────
// Stores fetched team data for filtering
let _teamIncentiveData = null;

async function loadIncentiveView() {
  if (!currentUser) return;
  const mySection   = document.getElementById('myIncentiveSection');
  const teamSection = document.getElementById('teamIncentiveSection');
  _teamIncentiveData = null;

  mySection.innerHTML   = `<div class="loading"><div class="spinner"></div></div>`;
  teamSection.innerHTML = '';

  try {
    const myData = await secureApiCall('getMyIncentives', { userEmail: currentUser.email });
    displayMyIncentives(myData);

    if (canSeeTeam()) {
      teamSection.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
      const teamData = await secureApiCall('getTeamIncentives', { userEmail: currentUser.email });
      _teamIncentiveData = teamData;
      displayTeamIncentives(teamData, null);
    }
  } catch (err) {
    mySection.innerHTML = '<div class="empty-state">Error loading incentives.</div>';
  }
}

function displayMyIncentives(data) {
  const section = document.getElementById('myIncentiveSection');
  if (!data.success) { section.innerHTML = '<div class="empty-state">Error loading incentives.</div>'; return; }

  const t = data.totals || {};
  let html = `
    <div class="incentive-summary">
      <div class="inc-card inc-generated">
        <div class="inc-label">Total Generated</div>
        <div class="inc-amount">₹${formatNum(t.generated || 0)}</div>
      </div>
      <div class="inc-card inc-paid">
        <div class="inc-label">Paid</div>
        <div class="inc-amount">₹${formatNum(t.paid || 0)}</div>
      </div>
      <div class="inc-card inc-pending">
        <div class="inc-label">Pending</div>
        <div class="inc-amount">₹${formatNum(t.pending || 0)}</div>
      </div>
    </div>`;

  if (data.incentives && data.incentives.length) {
    html += '<div class="incentive-list">';
    data.incentives.forEach(inc => {
      const sc = inc.status === 'Paid' ? 'status-completed' : 'status-pending';
      html += `
        <div class="incentive-row">
          <div class="incentive-row-left">
            <div class="incentive-month">${escapeHtml(inc.month)}</div>
            <div class="incentive-desc">${escapeHtml(inc.description || '—')}</div>
          </div>
          <div class="incentive-row-right">
            <div class="incentive-amt">₹${formatNum(inc.amount)}</div>
            <span class="request-status ${sc}">${escapeHtml(inc.status)}</span>
          </div>
        </div>`;
    });
    html += '</div>';
  } else {
    html += `<div class="empty-state"><div class="empty-icon">💰</div><p>No incentive records yet</p></div>`;
  }
  section.innerHTML = html;
}

// ── TEAM INCENTIVES (with member filter) ─────────────────────
function displayTeamIncentives(data, filterEmail) {
  const section = document.getElementById('teamIncentiveSection');
  if (!data || !data.success || !data.members || !data.members.length) {
    section.innerHTML = `<div class="section-title">Team Incentives</div><div class="empty-state">No team incentive data</div>`;
    return;
  }

  // Build member dropdown options
  const memberOptions = data.members.map(m =>
    `<option value="${escapeHtml(m.email)}" ${filterEmail === m.email ? 'selected' : ''}>${escapeHtml(m.name)} (${escapeHtml(m.role)})</option>`
  ).join('');

  // Filter to selected member or show all
  const displayMembers = filterEmail
    ? data.members.filter(m => m.email === filterEmail)
    : data.members;

  const teamTotal = displayMembers.reduce((s, m) => s + m.generated, 0);

  let html = `
    <div class="section-title">Team Incentives
      <span class="team-total-badge">Total: ₹${formatNum(teamTotal)}</span>
    </div>
    <div class="team-incentive-filter">
      <label style="font-size:13px;color:var(--text-muted);margin-bottom:6px;display:block">Filter by Team Member</label>
      <select class="form-input form-select" onchange="filterTeamIncentive(this.value)" style="margin-bottom:16px">
        <option value="">— All Members —</option>
        ${memberOptions}
      </select>
    </div>`;

  displayMembers.forEach((member, idx) => {
    html += `
      <div class="team-incentive-card">
        <div class="ti-rank">#${idx + 1}</div>
        <div class="ti-info">
          <div class="ti-name">${escapeHtml(member.name)}</div>
          <div class="ti-role">${escapeHtml(member.role)}</div>
        </div>
        <div class="ti-amounts">
          <div class="ti-gen">₹${formatNum(member.generated)}</div>
          <div class="ti-sub">
            <span class="ti-paid">Paid: ₹${formatNum(member.paid)}</span>
            <span class="ti-pend">Pending: ₹${formatNum(member.pending)}</span>
          </div>
        </div>
      </div>`;

    // Show individual incentive breakdown if filtered to one member
    if (filterEmail && member.incentives && member.incentives.length) {
      html += `<div class="incentive-list" style="margin-left:12px;margin-bottom:16px">`;
      member.incentives.forEach(inc => {
        const sc = inc.status === 'Paid' ? 'status-completed' : 'status-pending';
        html += `
          <div class="incentive-row">
            <div class="incentive-row-left">
              <div class="incentive-month">${escapeHtml(inc.month)}</div>
              <div class="incentive-desc">${escapeHtml(inc.description || '—')}</div>
            </div>
            <div class="incentive-row-right">
              <div class="incentive-amt">₹${formatNum(inc.amount)}</div>
              <span class="request-status ${sc}">${escapeHtml(inc.status)}</span>
            </div>
          </div>`;
      });
      html += `</div>`;
    }
  });

  section.innerHTML = html;
}

function filterTeamIncentive(email) {
  if (_teamIncentiveData) {
    displayTeamIncentives(_teamIncentiveData, email || null);
  }
}

// ── PAYSLIP VIEW ──────────────────────────────────────────────
async function loadPayslips() {
  if (!currentUser) return;
  const container = document.getElementById('payslipContainer');
  container.innerHTML = `<div class="loading"><div class="spinner"></div><p>Loading payslips...</p></div>`;

  try {
    const result = await secureApiCall('getPayslips', { userEmail: currentUser.email });
    if (!result.success) { container.innerHTML = '<div class="empty-state">Error loading payslips.</div>'; return; }

    if (!result.payslips.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-icon">📄</div><p>No payslips available</p><small>Your payslips will appear here once uploaded by HR</small></div>`;
      return;
    }

    const byYear = {};
    result.payslips.forEach(p => {
      const yr = p.year || '—';
      if (!byYear[yr]) byYear[yr] = [];
      byYear[yr].push(p);
    });

    let html = '';
    Object.keys(byYear).sort((a, b) => b - a).forEach(yr => {
      html += `<div class="payslip-year-header">${yr}</div><div class="payslip-grid">`;
      byYear[yr].forEach(p => {
        const icon = p.type === 'TaxSlip' ? '🧾' : '💼';
        html += `
          <div class="payslip-card">
            <div class="payslip-icon">${icon}</div>
            <div class="payslip-info">
              <div class="payslip-month">${escapeHtml(p.month)} ${escapeHtml(p.year)}</div>
              <div class="payslip-type">${escapeHtml(p.type)}</div>
            </div>
            ${p.fileUrl
              ? `<a href="${escapeHtml(p.fileUrl)}" target="_blank" rel="noopener" class="payslip-download">⬇ Download</a>`
              : `<span class="payslip-unavailable">Unavailable</span>`}
          </div>`;
      });
      html += '</div>';
    });
    container.innerHTML = html;
  } catch {
    container.innerHTML = '<div class="empty-state">Error loading payslips.</div>';
  }
}

// ── PROFILE VIEW ──────────────────────────────────────────────
async function loadProfile() {
  if (!currentUser) return;
  const container = document.getElementById('profileContainer');
  container.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;

  try {
    const result = await secureApiCall('getUserProfile', { userEmail: currentUser.email });
    if (!result.success) { container.innerHTML = '<div class="empty-state">Error loading profile.</div>'; return; }
    displayProfile(result.profile);
  } catch {
    container.innerHTML = '<div class="empty-state">Error loading profile.</div>';
  }
}

function displayProfile(profile) {
  const container = document.getElementById('profileContainer');
  container.innerHTML = `
    <div class="profile-card">
      <div class="profile-avatar-wrap">
        <div class="profile-avatar">${(profile.name || 'U').charAt(0).toUpperCase()}</div>
        <div class="profile-name">${escapeHtml(profile.name)}</div>
        <div class="profile-designation">${escapeHtml(profile.designation || profile.role)}</div>
      </div>
      <div class="profile-details">
        <div class="profile-row"><span class="pd-label">Email</span><span class="pd-value">${escapeHtml(profile.email)}</span></div>
        <div class="profile-row"><span class="pd-label">Role</span><span class="pd-value">${escapeHtml(profile.role)}</span></div>
        <div class="profile-row"><span class="pd-label">Department</span><span class="pd-value">${escapeHtml(profile.department || '—')}</span></div>
        <div class="profile-row"><span class="pd-label">Phone</span><span class="pd-value">${escapeHtml(profile.phone || '—')}</span></div>
        <div class="profile-row"><span class="pd-label">Joined</span><span class="pd-value">${escapeHtml(profile.joinDate || '—')}</span></div>
        <div class="profile-row"><span class="pd-label">Status</span><span class="pd-value status-badge status-completed">${escapeHtml(profile.status)}</span></div>
        <div class="profile-row"><span class="pd-label">Manager</span><span class="pd-value">${escapeHtml(profile.managedBy || '—')}</span></div>
      </div>
    </div>

    <div class="password-card">
      <div class="password-card-title">🔐 Change Password</div>
      <div class="form-group">
        <label>Current Password</label>
        <input type="password" id="oldPassword" class="form-input" placeholder="Enter current password">
      </div>
      <div class="form-group">
        <label>New Password</label>
        <input type="password" id="newPassword" class="form-input" placeholder="Min. 6 characters">
      </div>
      <div class="form-group">
        <label>Confirm New Password</label>
        <input type="password" id="confirmPassword" class="form-input" placeholder="Repeat new password">
      </div>
      <div id="pwError" class="error-message"></div>
      <div id="pwSuccess" class="success-message"></div>
      <button class="btn-primary" onclick="handleChangePassword()">Change Password</button>
    </div>`;
}

async function handleChangePassword() {
  const old     = document.getElementById('oldPassword').value;
  const newPw   = document.getElementById('newPassword').value;
  const confirm = document.getElementById('confirmPassword').value;
  const errDiv  = document.getElementById('pwError');
  const sucDiv  = document.getElementById('pwSuccess');

  errDiv.classList.remove('show'); sucDiv.classList.remove('show');

  if (!old) { errDiv.textContent = 'Please enter current password.'; errDiv.classList.add('show'); return; }
  if (newPw.length < 6) { errDiv.textContent = 'New password must be at least 6 characters.'; errDiv.classList.add('show'); return; }
  if (newPw !== confirm) { errDiv.textContent = 'Passwords do not match.'; errDiv.classList.add('show'); return; }

  try {
    const result = await secureApiCall('changePassword', { userEmail: currentUser.email, oldPassword: old, newPassword: newPw });
    if (result.success) {
      sucDiv.textContent = '✓ Password changed successfully!'; sucDiv.classList.add('show');
      document.getElementById('oldPassword').value = '';
      document.getElementById('newPassword').value = '';
      document.getElementById('confirmPassword').value = '';
    } else {
      errDiv.textContent = result.message; errDiv.classList.add('show');
    }
  } catch {
    errDiv.textContent = 'Error changing password. Please try again.'; errDiv.classList.add('show');
  }
}

// ── NOTIFICATIONS ─────────────────────────────────────────────
async function loadNotifications() {
  if (!currentUser) return;
  try {
    const notifs = await apiCall('getUnreadNotifications', { userEmail: currentUser.email });
    updateNotificationBadge(notifs.length);
  } catch {}
}

function updateNotificationBadge(count) {
  const badge = document.getElementById('notificationBadge');
  if (count > 0) { badge.textContent = count; badge.style.display = 'block'; }
  else badge.style.display = 'none';
}

async function showNotifications() {
  const panel     = document.getElementById('notificationsPanel');
  const container = document.getElementById('notificationsContent');
  panel.classList.add('open');
  container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading...</p></div>';

  setTimeout(async () => {
    try {
      const notifs = await apiCall('getUnreadNotifications', { userEmail: currentUser.email });
      displayNotifications(notifs);
    } catch {
      container.innerHTML = '<div class="no-notifications">Error loading notifications</div>';
    }
  }, 50);
}

function closeNotifications() {
  document.getElementById('notificationsPanel').classList.remove('open');
}

function displayNotifications(notifs) {
  const container = document.getElementById('notificationsContent');
  if (!notifs.length) { container.innerHTML = '<div class="no-notifications">No new notifications</div>'; return; }

  // Mark all read button
  let html = `
    <div class="notif-actions-bar">
      <button class="btn-mark-all-read" onclick="markAllNotificationsRead()">✓ Mark All Read</button>
    </div>`;

  container.innerHTML = html;

  notifs.forEach(notif => {
    const item = document.createElement('div');
    item.className = 'notification-item unread';
    item.id = `notif-${notif.notifId}`;

    // Determine tap destination based on notification type
    const navTarget = getNotifNavTarget(notif.type);
    item.onclick = () => handleNotifTap(notif.notifId, navTarget);

    item.innerHTML = `
      <div class="notification-message">${escapeHtml(notif.message)}</div>
      <div class="notification-time">${escapeHtml(notif.createdAt)}</div>
      ${navTarget ? `<div class="notif-tap-hint">Tap to view →</div>` : ''}
    `;
    container.appendChild(item);
  });
}

function getNotifNavTarget(type) {
  if (!type) return null;
  const t = type.toLowerCase();
  if (t === 'new_request') return 'operations';          // ops team: new data request submitted
  if (t === 'request_completed') return 'my_requests';   // user: request done
  if (t === 'request_rejected') return 'my_requests';    // user: request rejected
  if (t === 'request_pending') return 'my_requests';     // user: timeline update
  if (t === 'broadcast') return null;                    // general announcement
  // Catch-all pattern: anything with "request_" -> my requests
  if (t.startsWith('request_')) return 'my_requests';
  return null;
}

async function handleNotifTap(notifId, navTarget) {
  await markAsRead(notifId);
  closeNotifications();
  if (navTarget === 'operations') showOperationsPanel();
  else if (navTarget === 'my_requests') showMyRequests();
}

async function markAsRead(notifId) {
  try {
    await apiCall('markNotificationAsRead', { notifId });
    loadNotifications();
  } catch {}
}

async function markAllNotificationsRead() {
  const btn = document.querySelector('.btn-mark-all-read');
  if (btn) btn.disabled = true;
  try {
    await apiCall('markAllNotificationsRead', { userEmail: currentUser.email });
    loadNotifications();
    const container = document.getElementById('notificationsContent');
    if (container) container.innerHTML = '<div class="no-notifications">All notifications marked as read ✓</div>';
    showToast('All notifications marked as read', 'success');
  } catch {
    showToast('Failed to mark all as read', 'error');
    if (btn) btn.disabled = false;
  }
}

// ── REGISTER ─────────────────────────────────────────────────
function showRegisterScreen() {
  showScreen('registerScreen');
  const dobInput = document.getElementById('reg_dateOfBirth');
  if (dobInput) {
    const today = new Date();
    const yyyy  = today.getFullYear() - 18;
    const mm    = String(today.getMonth() + 1).padStart(2, '0');
    const dd    = String(today.getDate()).padStart(2, '0');
    dobInput.max = `${yyyy}-${mm}-${dd}`;
  }
}

function showLoginFromRegister() {
  showScreen('loginScreen');
}

async function handleRegisterSubmit() {
  const errDiv = document.getElementById('regError');
  const sucDiv = document.getElementById('regSuccess');
  const btn    = document.getElementById('regSubmitBtn');
  const btnTxt = document.getElementById('regBtnText');
  const btnLdr = document.getElementById('regBtnLoader');

  errDiv.classList.remove('show');
  sucDiv.classList.remove('show');

  const fields = {
    fullName:         document.getElementById('reg_fullName')?.value.trim(),
    personalEmail:    document.getElementById('reg_personalEmail')?.value.trim(),
    phone:            document.getElementById('reg_phone')?.value.trim(),
    altPhone:         document.getElementById('reg_altPhone')?.value.trim(),
    dateOfBirth:      document.getElementById('reg_dateOfBirth')?.value,
    gender:           document.getElementById('reg_gender')?.value,
    address:          document.getElementById('reg_address')?.value.trim(),
    city:             document.getElementById('reg_city')?.value.trim(),
    state:            document.getElementById('reg_state')?.value.trim(),
    pinCode:          document.getElementById('reg_pinCode')?.value.trim(),
    education:        document.getElementById('reg_education')?.value.trim(),
    experienceYears:  document.getElementById('reg_experienceYears')?.value.trim(),
    previousCompany:  document.getElementById('reg_previousCompany')?.value.trim(),
    positionApplied:  document.getElementById('reg_positionApplied')?.value,
    linkedin:         document.getElementById('reg_linkedin')?.value.trim(),
    referredBy:       document.getElementById('reg_referredBy')?.value.trim(),
    emergencyContact: document.getElementById('reg_emergencyContact')?.value.trim(),
    emergencyPhone:   document.getElementById('reg_emergencyPhone')?.value.trim(),
    aadhar:           document.getElementById('reg_aadhar')?.value.trim(),
    pan:              document.getElementById('reg_pan')?.value.trim(),
    bankAccount:      document.getElementById('reg_bankAccount')?.value.trim(),
    bankIFSC:         document.getElementById('reg_bankIFSC')?.value.trim(),
    bankName:         document.getElementById('reg_bankName')?.value.trim()
  };

  const required = ['fullName','personalEmail','phone','dateOfBirth','gender','address','city','state','pinCode','positionApplied'];
  for (const f of required) {
    if (!fields[f]) {
      errDiv.textContent = 'Please fill in all required fields.';
      errDiv.classList.add('show');
      return;
    }
  }

  const terms = document.getElementById('reg_terms');
  if (terms && !terms.checked) {
    errDiv.textContent = 'Please agree to the terms and conditions.';
    errDiv.classList.add('show');
    return;
  }

  btn.disabled = true; btnTxt.style.display = 'none'; btnLdr.style.display = 'inline-flex';

  try {
    const result = await secureApiCall('registerNewEmployee', fields);
    btn.disabled = false; btnTxt.style.display = 'inline'; btnLdr.style.display = 'none';

    if (result.success) {
      sucDiv.innerHTML = `<strong>🎉 ${escapeHtml(result.message)}</strong>`;
      sucDiv.classList.add('show');
      document.getElementById('registerForm').reset();
      setTimeout(() => {
        if (confirm('Registration successful! Go back to Login?')) {
          showLoginFromRegister();
        }
      }, 3000);
    } else {
      errDiv.textContent = result.message;
      errDiv.classList.add('show');
    }
  } catch {
    btn.disabled = false; btnTxt.style.display = 'inline'; btnLdr.style.display = 'none';
    errDiv.textContent = 'Registration failed. Please check your connection and try again.';
    errDiv.classList.add('show');
  }
}

// ── ABOUT / DOCUMENTATION ────────────────────────────────────
function showAbout() {
  closeMenu();
  const existing = document.getElementById('aboutModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'aboutModal';
  modal.className = 'about-modal-overlay';
  modal.innerHTML = `
    <div class="about-modal">
      <div class="about-modal-header">
        <h2>📖 THORE India Portal</h2>
        <p style="color:var(--text-muted);font-size:13px">v4.0 · User Guide</p>
        <button class="close-notif-btn" onclick="document.getElementById('aboutModal').remove()" style="position:absolute;top:16px;right:16px">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>

      <div class="about-toc">
        <div class="about-toc-title">Jump to Section</div>
        <div class="about-toc-links">
          <button onclick="scrollToSection('about-login')">🔐 Login</button>
          <button onclick="scrollToSection('about-home')">🏠 Home</button>
          <button onclick="scrollToSection('about-links')">🔗 Quick Links</button>
          <button onclick="scrollToSection('about-datareq')">📤 Data Request</button>
          <button onclick="scrollToSection('about-incentive')">💰 Incentives</button>
          <button onclick="scrollToSection('about-payslip')">📄 Payslips</button>
          <button onclick="scrollToSection('about-team')">👥 Team</button>
          <button onclick="scrollToSection('about-notif')">🔔 Notifications</button>
          <button onclick="scrollToSection('about-ops')">⚙️ Operations</button>
          <button onclick="scrollToSection('about-managers')">👔 Managers</button>
          <button onclick="scrollToSection('about-profile')">👤 Profile</button>
        </div>
      </div>

      <div class="about-modal-body">

        <div class="about-section" id="about-login">
          <div class="about-section-title">🔐 Logging In</div>
          <div class="about-section-body">
            <p>Use your company email (<strong>name.surname@thoreindia.com</strong>) and the password given to you by HR.</p>
            <ul>
              <li>If you forget your password, contact your manager or HR.</li>
              <li>You can change your password anytime from the <strong>Profile</strong> section.</li>
              <li>New joiners must complete registration first — tap <strong>"New Joinee? Register Here"</strong> on the login page.</li>
            </ul>
          </div>
        </div>

        <div class="about-section" id="about-home">
          <div class="about-section-title">🏠 Home Dashboard</div>
          <div class="about-section-body">
            <p>The home screen shows your key stats at a glance:</p>
            <ul>
              <li><strong>Request Data</strong> — how many of your data requests are pending.</li>
              <li><strong>Incentive Earned</strong> — your total incentive generated so far.</li>
              <li><strong>Incentive Paid</strong> — amount already credited to you.</li>
              <li><strong>Incentive Pending</strong> — amount yet to be paid.</li>
              <li><strong>YSSR</strong> — Your Sales Score / Rating as updated by management.</li>
            </ul>
            <p>Tap any card to go directly to that section.</p>
          </div>
        </div>

        <div class="about-section" id="about-links">
          <div class="about-section-title">🔗 Quick Links</div>
          <div class="about-section-body">
            <p>Quick Links are shortcuts to important portals, forms, and tools relevant to your role.</p>
            <ul>
              <li>Links are personalised — you only see links for your role.</li>
              <li>Use the 🔍 search icon in the header to find a link quickly.</li>
              <li>Links open in a new tab / window.</li>
            </ul>
          </div>
        </div>

        <div class="about-section" id="about-datareq">
          <div class="about-section-title">📤 Requesting Data</div>
          <div class="about-section-body">
            <p>Use <strong>Request Data</strong> to ask the operations team for leads, reports, or any business data.</p>
            <ul>
              <li>Fill in the <strong>Request Details</strong> box with specifics: location, date range, project names, lead type (new / old / visited), and employee names if needed.</li>
              <li>After submitting, you'll get a <strong>Request ID</strong> and an estimated completion time.</li>
              <li>Track status under <strong>My Requests</strong> — statuses are <em>Pending</em>, <em>Completed</em>, or <em>Rejected</em>.</li>
              <li>You'll receive a push notification when your request is updated.</li>
            </ul>
          </div>
        </div>

        <div class="about-section" id="about-incentive">
          <div class="about-section-title">💰 Incentives</div>
          <div class="about-section-body">
            <p>The Incentives section shows all incentive records for your account.</p>
            <ul>
              <li><strong>Total Generated</strong> — sum of all incentives added for you.</li>
              <li><strong>Paid</strong> — incentives marked as credited.</li>
              <li><strong>Pending</strong> — incentives awaiting payment.</li>
              <li>Each record shows the <strong>month</strong>, a <strong>description/remarks</strong>, the <strong>amount</strong>, and payment <strong>status</strong>.</li>
              <li>If you are a Team Leader or Manager, scroll down to see <strong>Team Incentives</strong>. Use the dropdown to filter by a specific team member.</li>
            </ul>
          </div>
        </div>

        <div class="about-section" id="about-payslip">
          <div class="about-section-title">📄 Payslips</div>
          <div class="about-section-body">
            <p>Your salary slips and tax certificates are available here once uploaded by HR.</p>
            <ul>
              <li>Payslips are grouped by year.</li>
              <li>Tap <strong>⬇ Download</strong> to open or save a payslip.</li>
              <li>If a payslip shows "Unavailable", contact HR.</li>
            </ul>
          </div>
        </div>

        <div class="about-section" id="about-team">
          <div class="about-section-title">👥 Manage Team <span style="font-size:12px;color:var(--gold)">(TL & above)</span></div>
          <div class="about-section-body">
            <p>Team Leaders, Managers, and Admins can view their team members here.</p>
            <ul>
              <li>Shows each member's name, role, department, email, phone, and joining date.</li>
              <li>Tap an email or phone number to contact them directly.</li>
              <li>Members are sorted by role (Managers → Team Leaders → Executives).</li>
            </ul>
          </div>
        </div>

        <div class="about-section" id="about-notif">
          <div class="about-section-title">🔔 Notifications</div>
          <div class="about-section-body">
            <p>The bell icon (top right) shows your unread notifications. A red badge shows the count.</p>
            <ul>
              <li>Tap a notification to go directly to the relevant section (e.g., request update → My Requests).</li>
              <li>Tap <strong>"Mark All Read"</strong> to clear all at once.</li>
              <li>Push notifications are sent to your device even when the app is closed (if notifications are allowed).</li>
              <li>To enable notifications: when prompted, tap <strong>Allow</strong>. If you missed the prompt, enable notifications for this site in your browser or phone settings.</li>
            </ul>
          </div>
        </div>

        <div class="about-section" id="about-ops">
          <div class="about-section-title">⚙️ Operations Panel <span style="font-size:12px;color:var(--gold)">(Ops Team only)</span></div>
          <div class="about-section-body">
            <p>The Operations Panel is visible only to operations team members.</p>
            <ul>
              <li><strong>Stats</strong> — shows how many requests each ops member has completed.</li>
              <li><strong>Pending Requests</strong> — lists all open data requests.</li>
              <li>Actions: <strong>✓ Complete</strong> (done), <strong>⏱ Timeline</strong> (update ETA with reason), <strong>✗ Reject</strong> (with reason).</li>
              <li>The requester receives a push notification on every status change.</li>
            </ul>
            <p><strong>Ops Settings</strong> (⚙️ icon in the menu):</p>
            <ul>
              <li><strong>Online People</strong> — see who is currently active in the app.</li>
              <li><strong>Force Logout All</strong> — signs everyone out (use before major updates).</li>
              <li><strong>Send Push Notification</strong> — broadcast a message to all users or a specific role group.</li>
            </ul>
          </div>
        </div>

        <div class="about-section" id="about-managers">
          <div class="about-section-title">👔 For Managers & Team Leaders</div>
          <div class="about-section-body">
            <ul>
              <li><strong>Manage Team</strong> — appears in the menu for TL and above. View all direct reports and their sub-teams.</li>
              <li><strong>Team Incentives</strong> — inside the Incentives section. Filter by a team member to see their individual incentive breakdown.</li>
              <li>When requesting data, mention team member names in the remarks if the data is for your executives.</li>
            </ul>
          </div>
        </div>

        <div class="about-section" id="about-profile">
          <div class="about-section-title">👤 Profile & Settings</div>
          <div class="about-section-body">
            <ul>
              <li>View your personal details, department, manager, and joining date.</li>
              <li>Change your password under <strong>🔐 Change Password</strong>.</li>
              <li>If any profile info is incorrect, contact HR to update it.</li>
            </ul>
            <p style="margin-top:12px;font-size:12px;color:var(--text-muted)">THORE India Portal v4.0 · Built with ❤️ by THORE Tech</p>
          </div>
        </div>

      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close on backdrop click
  modal.addEventListener('click', e => {
    if (e.target === modal) modal.remove();
  });
}

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── MENU ──────────────────────────────────────────────────────
function toggleMenu() {
  const menu      = document.getElementById('sideMenu');
  const menuIcon  = document.getElementById('menuIcon');
  const closeIcon = document.getElementById('closeIcon');
  menu.classList.toggle('open');
  menuIcon.style.display  = menu.classList.contains('open') ? 'none'  : 'block';
  closeIcon.style.display = menu.classList.contains('open') ? 'block' : 'none';
}

function closeMenu() {
  const menu      = document.getElementById('sideMenu');
  const menuIcon  = document.getElementById('menuIcon');
  const closeIcon = document.getElementById('closeIcon');
  menu.classList.remove('open');
  menuIcon.style.display  = 'block';
  closeIcon.style.display = 'none';
}

// ── TOAST ─────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  let toast = document.getElementById('toastEl');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toastEl';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = `toast toast-${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── PWA ───────────────────────────────────────────────────────
function installApp() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(r => { if (r.outcome === 'accepted') dismissInstall(); deferredPrompt = null; });
  } else {
    alert('To install:\n1. Open browser menu (⋮)\n2. Select "Add to Home screen"\n3. Tap "Add"');
  }
}
function dismissInstall() { document.getElementById('installPrompt')?.classList.remove('show'); }

// ── SETTINGS ──────────────────────────────────────────────────
function showSettings() { closeMenu(); showToast('Settings coming soon! 🚀', 'info'); }

// ── LOGOUT ────────────────────────────────────────────────────
function logout() {
  if (!confirm('Are you sure you want to logout?')) return;
  localStorage.removeItem('currentUser');
  sessionStorage.clear();
  currentUser = null;
  if (notificationSyncInterval) clearInterval(notificationSyncInterval);
  closeMenu();
  showScreen('loginScreen');
}

// ── UTILS ─────────────────────────────────────────────────────
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text.toString();
  return div.innerHTML;
}

window.addEventListener('offline', () => showScreen('offlineScreen'));
window.addEventListener('online',  () => location.reload());

let startY = 0;
document.addEventListener('touchstart', e => { if (window.scrollY === 0) startY = e.touches[0].clientY; });
document.addEventListener('touchend',   e => { const endY = e.changedTouches[0].clientY; if (window.scrollY === 0 && endY - startY > 140) loadLinks(); });
