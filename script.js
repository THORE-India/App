// ============================================================
// THORE INDIA PORTAL — script.js v3.0
// Dual-API architecture: Main Sheet + Sensitive Sheet
// ============================================================

// ── API ENDPOINTS ────────────────────────────────────────────
// Main sheet handles: Links, Announcements, DataRequests, Notifications
const MAIN_API_URL = 'https://script.google.com/macros/s/AKfycbw2XDf03HVFPIILNHNZe_RJe4drUhHndLf-5zZS69E56s9ks-_mpYJ849_I0mccjoByhA/exec';

// Sensitive sheet handles: Auth, Users, Incentives, Payslips, FCMTokens, Registration
// IMPORTANT: Replace this with your NEW sensitive sheet deployment URL
const SENSITIVE_API_URL = 'https://script.google.com/macros/s/AKfycbwlyFZlsszFP-poaAu2cyZ7qdFouT14r7njYFDpsJRZQTw76ztsJYxcAD248yEnil4gUQ/exec';
const SENSITIVE_API_KEY = 'g7Kx4Qp9Zt2Lm8Vd3Rj5Hy6Nc1WsFa0B'; // Must match the key in sensitive-sheet-api.gs

// ── GLOBALS ──────────────────────────────────────────────────
let currentUser = null;
let deferredPrompt;
let notificationSyncInterval;
 
// ── API HELPERS ───────────────────────────────────────────────
// WHY GET + query params?
// Google Apps Script reads e.parameter from the URL query string.
// POST with Content-Type header triggers a CORS preflight (OPTIONS)
// that GAS never responds to, causing ERR_FAILED on every call.
// A plain GET with query params is a "simple request" — no preflight,
// no CORS issue, and GAS handles it perfectly via doGet().
// Both doGet() and doPost() are kept in the .gs files so either works,
// but the frontend always uses GET for reliability.
 
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
    const res = await fetch(`${baseUrl}?${qs}`, {
      method: 'GET',
      redirect: 'follow'   // GAS returns a redirect — must follow it
    });
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
    // Auth lives in the SENSITIVE sheet
    const result = await secureApiCall('validateLogin', { email, password });
    btn.disabled = false;
    btnText.style.display = 'inline';
    btnLoad.style.display = 'none';
 
    if (result.success) {
      currentUser = result.user;
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
      registerFCMToken(currentUser.email);
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
      // FCM tokens go to the SENSITIVE sheet
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
  // Greeting
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
    // Incentive data from SENSITIVE API; request counts from MAIN API
    const [sensitiveStats, requests] = await Promise.all([
      secureApiCall('getDashboardStats', { userEmail: currentUser.email }),
      apiCall('getUserRequests', { userEmail: currentUser.email })
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
    // Links only need the user's ROLE, not any sensitive data
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
const VIEWS = ['linksView','dataRequestView','myRequestsView','operationsView','teamView','incentiveView','payslipView','profileView'];
 
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
function showAttendanceView()    { closeMenu(); showToast('Attendance feature coming soon! 🚀', 'info'); }
 
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
async function loadIncentiveView() {
  if (!currentUser) return;
  const mySection   = document.getElementById('myIncentiveSection');
  const teamSection = document.getElementById('teamIncentiveSection');
 
  mySection.innerHTML   = `<div class="loading"><div class="spinner"></div></div>`;
  teamSection.innerHTML = '';
 
  try {
    const myData = await secureApiCall('getMyIncentives', { userEmail: currentUser.email });
    displayMyIncentives(myData);
 
    if (canSeeTeam()) {
      teamSection.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
      const teamData = await secureApiCall('getTeamIncentives', { userEmail: currentUser.email });
      displayTeamIncentives(teamData);
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
 
function displayTeamIncentives(data) {
  const section = document.getElementById('teamIncentiveSection');
  if (!data.success || !data.members || !data.members.length) {
    section.innerHTML = `<div class="section-title">Team Incentives</div><div class="empty-state">No team incentive data</div>`;
    return;
  }
 
  const teamTotal = data.members.reduce((s, m) => s + m.generated, 0);
  let html = `
    <div class="section-title">Team Incentives
      <span class="team-total-badge">Team Total: ₹${formatNum(teamTotal)}</span>
    </div>`;
 
  data.members.forEach((member, idx) => {
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
  });
 
  section.innerHTML = html;
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
  container.innerHTML = '';
  notifs.forEach(notif => {
    const item = document.createElement('div');
    item.className = 'notification-item unread';
    item.onclick = () => markAsRead(notif.notifId);
    item.innerHTML = `<div class="notification-message">${escapeHtml(notif.message)}</div><div class="notification-time">${escapeHtml(notif.createdAt)}</div>`;
    container.appendChild(item);
  });
}
 
async function markAsRead(notifId) {
  try {
    await apiCall('markNotificationAsRead', { notifId });
    loadNotifications(); showNotifications();
  } catch {}
}
 
// ── REGISTER ─────────────────────────────────────────────────
function showRegisterScreen() {
  showScreen('registerScreen');
  // Set today's date as max for DOB
  const dobInput = document.getElementById('reg_dateOfBirth');
  if (dobInput) {
    const today = new Date();
    const yyyy  = today.getFullYear() - 18; // Must be 18+
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
 
  // Collect all fields
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
 
  // Client-side required check
  const required = ['fullName','personalEmail','phone','dateOfBirth','gender','address','city','state','pinCode','positionApplied'];
  for (const f of required) {
    if (!fields[f]) {
      errDiv.textContent = 'Please fill in all required fields.';
      errDiv.classList.add('show');
      return;
    }
  }
 
  // Terms checkbox
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
      // Show return to login after 5s
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
 
// ── SETTINGS / ABOUT ─────────────────────────────────────────
function showSettings() { closeMenu(); showToast('Settings coming soon! 🚀', 'info'); }
function showAbout()    { closeMenu(); alert('THORE India Portal v3.0\nSecure dual-API architecture.'); }
 
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
