// ============================================================
// THORE INDIA PORTAL — attendance.js v1.1
// Attendance, Calendar, Leave Management, Reports
// Include this AFTER script.js in index.html
// ============================================================

// ── ATTENDANCE API URL ────────────────────────────────────────
const ATTENDANCE_API_URL = 'https://script.google.com/macros/s/AKfycbyUbovfTpc9eTGxr5ZnurDrATyvYq3-x0dgYy2k6YpsP_bScNrBisV-0DLgs2Y1_X7ABQ/exec';

async function attApiCall(action, params = {}) {
  try {
    const allParams = { action, ...params };
    const qs = Object.keys(allParams)
      .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(allParams[k]))
      .join('&');
    const res = await fetch(`${ATTENDANCE_API_URL}?${qs}`, { method: 'GET', redirect: 'follow' });
    return await res.json();
  } catch (err) {
    console.error(`Attendance API error [${action}]:`, err);
    throw err;
  }
}

// ── STATE ────────────────────────────────────────────────────
let attCalendarYear  = new Date().getFullYear();
let attCalendarMonth = new Date().getMonth() + 1;
let attMonthData     = null;
let leaveTeamData    = [];

// ── CACHED today record (used for optimistic UI) ─────────────
let _cachedTodayRecord = null;

// ── SHOW ATTENDANCE VIEW ──────────────────────────────────────
function showAttendanceView() {
  closeMenu();
  showView('attendanceView');
  renderAttendanceModule();
}

async function renderAttendanceModule() {
  const container = document.getElementById('attendanceView');
  if (!container) return;

  container.innerHTML = `
    <div class="att-page">
      <!-- Page Header -->
      <div class="page-header">
        <button onclick="showLinksView()" class="back-btn">← Back</button>
        <h1>Attendance</h1>
        <p>Track your daily attendance & leaves</p>
      </div>

      <!-- Tab Bar -->
      <div class="att-tabs">
        <button class="att-tab active" id="tab-checkin"   onclick="switchAttTab('checkin')">Check In/Out</button>
        <button class="att-tab"        id="tab-calendar"  onclick="switchAttTab('calendar')">Calendar</button>
        <button class="att-tab"        id="tab-leave"     onclick="switchAttTab('leave')">Leave</button>
        <button class="att-tab"        id="tab-reports"   onclick="switchAttTab('reports')">Reports</button>
        ${canSeeTeam() ? '<button class="att-tab" id="tab-team-att" onclick="switchAttTab(\'team-att\')">Team</button>' : ''}
      </div>

      <!-- Tab Panels -->
      <div id="att-panel-checkin"   class="att-panel att-panel-active"></div>
      <div id="att-panel-calendar"  class="att-panel" style="display:none"></div>
      <div id="att-panel-leave"     class="att-panel" style="display:none"></div>
      <div id="att-panel-reports"   class="att-panel" style="display:none"></div>
      ${canSeeTeam() ? '<div id="att-panel-team-att" class="att-panel" style="display:none"></div>' : ''}
    </div>
  `;

  loadCheckinPanel();
}

function switchAttTab(tab) {
  document.querySelectorAll('.att-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.att-panel').forEach(p => p.style.display = 'none');

  const tabEl   = document.getElementById('tab-' + tab);
  const panelEl = document.getElementById('att-panel-' + tab);
  if (tabEl)   tabEl.classList.add('active');
  if (panelEl) panelEl.style.display = 'block';

  switch (tab) {
    case 'checkin':  loadCheckinPanel();  break;
    case 'calendar': loadCalendarPanel(); break;
    case 'leave':    loadLeavePanel();    break;
    case 'reports':  loadReportsPanel();  break;
    case 'team-att': loadTeamAttPanel();  break;
  }
}

// ════════════════════════════════════════════════════════════
// TAB 1: CHECK IN / OUT
// ════════════════════════════════════════════════════════════
async function loadCheckinPanel(optimisticRecord) {
  const panel = document.getElementById('att-panel-checkin');
  if (!panel) return;

  // If we have an optimistic record passed in, use it immediately — don't flash spinner
  if (!optimisticRecord) {
    panel.innerHTML = `<div class="att-loading"><div class="spinner"></div></div>`;
  }

  try {
    let record, balance;

    if (optimisticRecord) {
      // Use the result we already have; fetch balance in parallel silently
      record = optimisticRecord;
      _cachedTodayRecord = record;
      const balResult = await attApiCall('getLeaveBalance', { userEmail: currentUser.email });
      balance = balResult.balance || {};
    } else {
      // Normal load: fetch both; add cache-busting param to avoid stale GAS response
      const [todayResult, balResult] = await Promise.all([
        attApiCall('getTodayAttendance', { userEmail: currentUser.email, _t: Date.now() }),
        attApiCall('getLeaveBalance',    { userEmail: currentUser.email })
      ]);
      // Prefer the fetched record, but fall back to cache if API returns null
      // (handles the GAS execution-delay window)
      record  = todayResult.record || _cachedTodayRecord || null;
      balance = balResult.balance || {};
      if (todayResult.record) _cachedTodayRecord = todayResult.record;
    }

    renderCheckinPanel(panel, record, balance);

  } catch (err) {
    panel.innerHTML = `<div class="empty-state">Error loading attendance. Please try again.</div>`;
  }
}

function renderCheckinPanel(panel, record, balance) {
  const now     = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const hasCheckedIn  = record && record.checkInTime;
  const hasCheckedOut = record && record.checkOutTime;

  panel.innerHTML = `
    <!-- Date & Time Banner -->
    <div class="att-date-banner">
      <div class="att-date-text">${dateStr}</div>
      <div class="att-live-time" id="attLiveTime">${formatLiveTime(now)}</div>
    </div>

    <!-- Status Card -->
    <div class="att-status-card ${hasCheckedIn ? (hasCheckedOut ? 'status-done' : 'status-in') : 'status-out'}">
      <div class="att-status-icon">${hasCheckedIn ? (hasCheckedOut ? '✅' : '🟢') : '🔴'}</div>
      <div class="att-status-info">
        <div class="att-status-title">
          ${hasCheckedIn ? (hasCheckedOut ? 'Day Complete' : 'Currently Checked In') : 'Not Checked In'}
        </div>
        <div class="att-status-sub">
          ${hasCheckedIn
            ? `Check-in: <strong>${record.checkInTime}</strong>${hasCheckedOut ? ` &nbsp;·&nbsp; Check-out: <strong>${record.checkOutTime}</strong>` : ''}`
            : 'Tap below to mark your attendance'}
        </div>
        ${hasCheckedOut
          ? `<div class="att-hours-chip">⏱ ${record.workingHours}h worked today</div>`
          : ''}
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="att-actions">
      ${!hasCheckedIn ? `
        <div class="att-geo-note">📍 Location will be captured automatically</div>
        <div class="form-group" style="margin-bottom:12px">
          <label style="font-size:13px;color:var(--text-muted)">Optional note</label>
          <input type="text" id="checkInRemarks" class="form-input" placeholder="e.g. WFH, Field visit...">
        </div>
        <button class="att-action-btn btn-checkin" onclick="doCheckIn()">
          <span class="att-btn-icon">👆</span> Check In Now
        </button>
      ` : !hasCheckedOut ? `
        <div class="att-time-running">
          <span id="timeWorkedDisplay">Calculating...</span>
        </div>
        <div class="form-group" style="margin-bottom:12px">
          <label style="font-size:13px;color:var(--text-muted)">Optional note</label>
          <input type="text" id="checkOutRemarks" class="form-input" placeholder="e.g. End of day...">
        </div>
        <button class="att-action-btn btn-checkout" onclick="doCheckOut()">
          <span class="att-btn-icon">👋</span> Check Out Now
        </button>
      ` : `
        <div class="att-done-msg">
          🎉 Great job! You've completed today's attendance.<br>
          <small style="color:var(--text-muted)">Status: <strong>${record.status}</strong></small>
        </div>
      `}
    </div>

    <!-- Leave Balance Cards -->
    <div class="att-balance-section">
      <div class="att-section-title">Leave Balance (${now.getFullYear()})</div>
      <div class="att-balance-grid">
        ${renderBalanceCard('Sick', balance.sick ?? 6, '#ef4444')}
        ${renderBalanceCard('Casual', balance.casual ?? 6, '#3b82f6')}
        ${renderBalanceCard('Earned', balance.earned ?? 12, '#22c55e')}
        ${renderBalanceCard('Comp-Off', balance.compOff ?? 0, '#f59e0b')}
      </div>
    </div>

    <div id="checkin-error" class="error-message"></div>
    <div id="checkin-success" class="success-message"></div>
  `;

  startLiveClock(record);
}

function renderBalanceCard(label, value, color) {
  return `
    <div class="att-bal-card" style="border-left:3px solid ${color}">
      <div class="att-bal-num" style="color:${color}">${value}</div>
      <div class="att-bal-label">${label}</div>
    </div>`;
}

function formatLiveTime(d) {
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
}

function startLiveClock(record) {
  clearInterval(window._attClockInterval);
  window._attClockInterval = setInterval(() => {
    const now = new Date();
    const el  = document.getElementById('attLiveTime');
    if (el) el.textContent = formatLiveTime(now);

    if (record && record.checkInTime && !record.checkOutTime) {
      const elapsed = document.getElementById('timeWorkedDisplay');
      if (elapsed) {
        const parseTime = (t) => {
          const [time, period] = t.split(' ');
          let [h, m] = time.split(':').map(Number);
          if (period === 'PM' && h !== 12) h += 12;
          if (period === 'AM' && h === 12) h = 0;
          return h * 60 + m;
        };
        try {
          const ciMins  = parseTime(record.checkInTime);
          const nowMins = now.getHours() * 60 + now.getMinutes();
          const diff    = Math.max(0, nowMins - ciMins);
          const h = Math.floor(diff / 60);
          const m = diff % 60;
          elapsed.textContent = `⏱ ${h}h ${m}m worked since check-in`;
        } catch(e) {}
      }
    }
  }, 1000);
}

async function doCheckIn() {
  const btn     = document.querySelector('.btn-checkin');
  const errDiv  = document.getElementById('checkin-error');
  const remarks = document.getElementById('checkInRemarks')?.value.trim();

  if (btn) { btn.disabled = true; btn.textContent = 'Getting location...'; }
  errDiv?.classList.remove('show');

  try {
    let lat = '', lng = '';
    try {
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000 }));
      lat = pos.coords.latitude.toFixed(6);
      lng = pos.coords.longitude.toFixed(6);
    } catch (e) {
      // Location optional
    }

    if (btn) btn.textContent = 'Checking in...';

    const result = await attApiCall('checkIn', {
      userEmail: currentUser.email,
      userName:  currentUser.name,
      userRole:  currentUser.role,
      lat, lng, remarks
    });

    if (result.success) {
      showToast('Check-in successful! ✅', 'success');

      // ── FIX: Build an optimistic record from the API response
      // and render immediately — don't wait for a slow re-fetch.
      const optimistic = {
        recordId:     result.recordId,
        date:         result.date,
        checkInTime:  result.checkInTime,
        checkOutTime: '',
        status:       'Present',
        workingHours: 0,
        remarks:      remarks
      };
      _cachedTodayRecord = optimistic;
      const balResult = await attApiCall('getLeaveBalance', { userEmail: currentUser.email });
      const panel = document.getElementById('att-panel-checkin');
      if (panel) renderCheckinPanel(panel, optimistic, balResult.balance || {});

    } else {
      if (errDiv) { errDiv.textContent = result.message; errDiv.classList.add('show'); }
      if (btn) { btn.disabled = false; btn.innerHTML = '<span class="att-btn-icon">👆</span> Check In Now'; }
    }
  } catch (err) {
    if (errDiv) { errDiv.textContent = 'Check-in failed. Please try again.'; errDiv.classList.add('show'); }
    if (btn) { btn.disabled = false; btn.innerHTML = '<span class="att-btn-icon">👆</span> Check In Now'; }
  }
}

async function doCheckOut() {
  const btn     = document.querySelector('.btn-checkout');
  const errDiv  = document.getElementById('checkin-error');
  const remarks = document.getElementById('checkOutRemarks')?.value.trim();

  if (!confirm('Confirm check-out?')) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Getting location...'; }
  errDiv?.classList.remove('show');

  try {
    let lat = '', lng = '';
    try {
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000 }));
      lat = pos.coords.latitude.toFixed(6);
      lng = pos.coords.longitude.toFixed(6);
    } catch (e) {}

    if (btn) btn.textContent = 'Checking out...';

    const result = await attApiCall('checkOut', {
      userEmail: currentUser.email, lat, lng, remarks
    });

    if (result.success) {
      showToast(`Check-out done! ${result.workingHours}h worked 🎉`, 'success');

      // ── FIX: Build optimistic record for immediate UI update
      const optimistic = {
        ...(  _cachedTodayRecord || {}),
        checkOutTime: result.checkOutTime,
        workingHours: result.workingHours,
        status:       result.status
      };
      _cachedTodayRecord = optimistic;
      const balResult = await attApiCall('getLeaveBalance', { userEmail: currentUser.email });
      const panel = document.getElementById('att-panel-checkin');
      if (panel) renderCheckinPanel(panel, optimistic, balResult.balance || {});

    } else {
      if (errDiv) { errDiv.textContent = result.message; errDiv.classList.add('show'); }
      if (btn) { btn.disabled = false; btn.innerHTML = '<span class="att-btn-icon">👋</span> Check Out Now'; }
    }
  } catch (err) {
    if (errDiv) { errDiv.textContent = 'Check-out failed. Please try again.'; errDiv.classList.add('show'); }
    if (btn) { btn.disabled = false; btn.innerHTML = '<span class="att-btn-icon">👋</span> Check Out Now'; }
  }
}

// ════════════════════════════════════════════════════════════
// TAB 2: CALENDAR VIEW
// ════════════════════════════════════════════════════════════
async function loadCalendarPanel() {
  const panel = document.getElementById('att-panel-calendar');
  if (!panel) return;

  panel.innerHTML = `<div class="att-loading"><div class="spinner"></div><p>Loading calendar...</p></div>`;

  try {
    const result = await attApiCall('getMonthSummary', {
      userEmail: currentUser.email,
      year:  attCalendarYear,
      month: attCalendarMonth
    });

    if (!result.success) throw new Error(result.message);
    attMonthData = result;
    renderCalendar(result);
  } catch (err) {
    panel.innerHTML = `<div class="empty-state">Error loading calendar.</div>`;
  }
}

function renderCalendar(data) {
  const panel = document.getElementById('att-panel-calendar');
  if (!panel) return;

  const { summary, days } = data;
  const monthName = new Date(attCalendarYear, attCalendarMonth - 1, 1)
    .toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  const dayMap = {};
  days.forEach(d => dayMap[d.date] = d);

  const firstDay = new Date(attCalendarYear, attCalendarMonth - 1, 1).getDay();
  const totalDays = new Date(attCalendarYear, attCalendarMonth, 0).getDate();

  let calCells = '';
  for (let i = 0; i < firstDay; i++) {
    calCells += `<div class="cal-cell cal-empty"></div>`;
  }
  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${attCalendarYear}-${String(attCalendarMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayInfo = dayMap[dateStr];
    const status  = dayInfo ? dayInfo.status : 'Upcoming';
    const cls     = getCalCellClass(status);
    const dot     = getStatusDot(status);

    calCells += `
      <div class="cal-cell ${cls}" onclick="showDayDetail('${dateStr}')">
        <div class="cal-day-num">${d}</div>
        <div class="cal-status-dot">${dot}</div>
      </div>`;
  }

  panel.innerHTML = `
    <div class="cal-nav">
      <button class="cal-nav-btn" onclick="changeCalMonth(-1)">‹</button>
      <div class="cal-month-title">${monthName}</div>
      <button class="cal-nav-btn" onclick="changeCalMonth(1)">›</button>
    </div>

    <div class="cal-summary-row">
      ${renderSummaryPill('Present',  summary.present,  '#22c55e')}
      ${renderSummaryPill('Absent',   summary.absent,   '#ef4444')}
      ${renderSummaryPill('Leave',    summary.leave,    '#3b82f6')}
      ${renderSummaryPill('Half-Day', summary.halfDay,  '#f59e0b')}
    </div>

    <div class="cal-legend">
      <span><span class="cal-dot dot-present"></span>Present</span>
      <span><span class="cal-dot dot-absent"></span>Absent</span>
      <span><span class="cal-dot dot-leave"></span>Leave</span>
      <span><span class="cal-dot dot-halfday"></span>Half-Day</span>
      <span><span class="cal-dot dot-weekend"></span>Weekend</span>
    </div>

    <div class="cal-grid">
      ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => `<div class="cal-header-cell">${d}</div>`).join('')}
      ${calCells}
    </div>

    <div class="cal-stats">
      <div class="cal-stat-item">
        <span class="cal-stat-num">${summary.totalWorkingDays}</span>
        <span class="cal-stat-label">Working Days</span>
      </div>
      <div class="cal-stat-item">
        <span class="cal-stat-num">${summary.totalWorkHours}h</span>
        <span class="cal-stat-label">Hours Worked</span>
      </div>
      <div class="cal-stat-item">
        <span class="cal-stat-num">${summary.present + summary.halfDay * 0.5}</span>
        <span class="cal-stat-label">Effective Days</span>
      </div>
    </div>

    <div id="dayDetailPopup"></div>
  `;
}

function getCalCellClass(status) {
  const map = {
    'Present':  'cal-present',
    'Absent':   'cal-absent',
    'Leave':    'cal-leave',
    'Half-Day': 'cal-halfday',
    'Weekend':  'cal-weekend',
    'Upcoming': 'cal-upcoming'
  };
  return map[status] || 'cal-upcoming';
}

function getStatusDot(status) {
  const map = {
    'Present':  '🟢', 'Absent': '🔴', 'Leave': '🔵',
    'Half-Day': '🟡', 'Weekend': '⚪', 'Upcoming': ''
  };
  return map[status] || '';
}

function renderSummaryPill(label, value, color) {
  return `<div class="cal-summary-pill" style="border-color:${color};color:${color}">
    <strong>${value}</strong><span>${label}</span>
  </div>`;
}

function changeCalMonth(delta) {
  attCalendarMonth += delta;
  if (attCalendarMonth > 12) { attCalendarMonth = 1;  attCalendarYear++; }
  if (attCalendarMonth < 1)  { attCalendarMonth = 12; attCalendarYear--; }
  loadCalendarPanel();
}

function showDayDetail(dateStr) {
  if (!attMonthData) return;
  const day = attMonthData.days.find(d => d.date === dateStr);
  if (!day) return;

  const popup = document.getElementById('dayDetailPopup');
  if (!popup) return;

  const d = new Date(dateStr);
  const label = d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  popup.innerHTML = `
    <div class="day-detail-card">
      <div class="day-detail-header">
        <div class="day-detail-date">${label}</div>
        <span class="request-status ${getStatusClass(day.status)}">${day.status}</span>
      </div>
      ${day.checkInTime  ? `<div class="day-detail-row">🟢 Check-in: <strong>${day.checkInTime}</strong></div>` : ''}
      ${day.checkOutTime ? `<div class="day-detail-row">🔴 Check-out: <strong>${day.checkOutTime}</strong></div>` : ''}
      ${day.workingHours ? `<div class="day-detail-row">⏱ Hours worked: <strong>${day.workingHours}h</strong></div>` : ''}
      ${day.leaveType    ? `<div class="day-detail-row">📋 Leave type: <strong>${day.leaveType}</strong></div>` : ''}
    </div>`;
}

function getStatusClass(status) {
  if (status === 'Present') return 'status-completed';
  if (status === 'Absent')  return 'status-rejected';
  if (status === 'Leave')   return 'status-pending';
  return 'status-pending';
}

// ════════════════════════════════════════════════════════════
// TAB 3: LEAVE MANAGEMENT
// ════════════════════════════════════════════════════════════
async function loadLeavePanel() {
  const panel = document.getElementById('att-panel-leave');
  if (!panel) return;

  panel.innerHTML = `<div class="att-loading"><div class="spinner"></div></div>`;

  try {
    const [leavesRes, balRes, pendingRes] = await Promise.all([
      attApiCall('getMyLeaves',    { userEmail: currentUser.email }),
      attApiCall('getLeaveBalance',{ userEmail: currentUser.email }),
      canSeeTeam() ? attApiCall('getPendingLeaves', { managerEmail: currentUser.email }) : Promise.resolve({ leaves: [] })
    ]);

    renderLeavePanel(leavesRes.leaves || [], balRes.balance || {}, pendingRes.leaves || []);
  } catch (err) {
    panel.innerHTML = `<div class="empty-state">Error loading leave data.</div>`;
  }
}

function renderLeavePanel(myLeaves, balance, pendingLeaves) {
  const panel = document.getElementById('att-panel-leave');

  const today   = new Date();
  const minDate = today.toISOString().split('T')[0];

  panel.innerHTML = `
    <!-- Apply Leave Form -->
    <div class="leave-form-card">
      <div class="att-section-title">📝 Apply for Leave</div>
      <div class="form-row-2">
        <div class="form-group">
          <label>Leave Type <span class="req">*</span></label>
          <select id="leaveType" class="form-input form-select">
            <option value="">Select type</option>
            <option value="Sick Leave">Sick Leave</option>
            <option value="Casual Leave">Casual Leave</option>
            <option value="Earned Leave">Earned Leave</option>
            <option value="Comp-Off">Comp-Off</option>
            <option value="Unpaid Leave">Unpaid Leave</option>
          </select>
        </div>
        <div class="form-group">
          <label>Reason <span class="req">*</span></label>
          <input type="text" id="leaveReason" class="form-input" placeholder="Brief reason">
        </div>
      </div>
      <div class="form-row-2">
        <div class="form-group">
          <label>From Date <span class="req">*</span></label>
          <input type="date" id="leaveFrom" class="form-input" min="${minDate}">
        </div>
        <div class="form-group">
          <label>To Date <span class="req">*</span></label>
          <input type="date" id="leaveTo" class="form-input" min="${minDate}">
        </div>
      </div>
      <div id="leave-day-count" class="leave-day-count"></div>
      <div id="leave-apply-error"   class="error-message"></div>
      <div id="leave-apply-success" class="success-message"></div>
      <button class="btn-primary" onclick="submitLeaveApplication()">
        Apply for Leave
      </button>
    </div>

    <!-- Leave Balance -->
    <div class="att-balance-section">
      <div class="att-section-title">Leave Balance</div>
      <div class="att-balance-grid">
        ${renderBalanceCard('Sick', balance.sick ?? 6, '#ef4444')}
        ${renderBalanceCard('Casual', balance.casual ?? 6, '#3b82f6')}
        ${renderBalanceCard('Earned', balance.earned ?? 12, '#22c55e')}
        ${renderBalanceCard('Comp-Off', balance.compOff ?? 0, '#f59e0b')}
      </div>
    </div>

    <!-- Pending Approvals (managers) -->
    ${pendingLeaves.length > 0 ? `
    <div class="leave-pending-section">
      <div class="att-section-title">⏳ Pending Team Leaves (${pendingLeaves.length})</div>
      ${pendingLeaves.map(l => renderPendingLeaveCard(l)).join('')}
    </div>` : ''}

    <!-- My Leave History -->
    <div class="leave-history-section">
      <div class="att-section-title">My Leave History</div>
      ${myLeaves.length === 0
        ? `<div class="empty-state"><div class="empty-icon">🌴</div><p>No leave requests this year</p></div>`
        : myLeaves.map(l => renderMyLeaveCard(l)).join('')
      }
    </div>
  `;

  document.getElementById('leaveFrom')?.addEventListener('change', updateLeaveCount);
  document.getElementById('leaveTo')?.addEventListener('change', updateLeaveCount);
}

function updateLeaveCount() {
  const from = document.getElementById('leaveFrom')?.value;
  const to   = document.getElementById('leaveTo')?.value;
  const el   = document.getElementById('leave-day-count');
  if (!from || !to || !el) return;

  if (to < from) {
    el.innerHTML = `<span style="color:var(--danger)">To date must be after From date</span>`;
    return;
  }

  const dates    = getDatesInRange(from, to);
  const workDays = dates.filter(d => !isWeekendDate(d)).length;
  el.innerHTML   = `<span style="color:var(--gold)">📅 ${workDays} working day${workDays !== 1 ? 's' : ''}</span>`;
}

function getDatesInRange(from, to) {
  const dates = [], start = new Date(from), end = new Date(to);
  const cur = new Date(start);
  while (cur <= end) {
    const yyyy = cur.getFullYear();
    const mm   = String(cur.getMonth() + 1).padStart(2, '0');
    const dd   = String(cur.getDate()).padStart(2, '0');
    dates.push(`${yyyy}-${mm}-${dd}`);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function isWeekendDate(dateStr) {
  const d = new Date(dateStr);
  return d.getDay() === 0 || d.getDay() === 6;
}

function renderMyLeaveCard(l) {
  const statusCls = l.status === 'Approved' ? 'status-completed' : l.status === 'Rejected' ? 'status-rejected' : 'status-pending';
  return `
    <div class="leave-card">
      <div class="leave-card-header">
        <span class="leave-type-badge">${escapeHtml(l.leaveType)}</span>
        <span class="request-status ${statusCls}">${escapeHtml(l.status)}</span>
      </div>
      <div class="leave-card-dates">📅 ${escapeHtml(l.fromDate)} → ${escapeHtml(l.toDate)} &nbsp;·&nbsp; <strong>${l.totalDays} day${l.totalDays !== 1 ? 's' : ''}</strong></div>
      <div class="leave-card-reason">📝 ${escapeHtml(l.reason || '—')}</div>
      ${l.approvalNote ? `<div class="leave-card-note">💬 ${escapeHtml(l.approvalNote)}</div>` : ''}
      <div class="leave-card-meta">Applied: ${escapeHtml(l.appliedOn)}</div>
      ${l.status === 'Pending' ? `<button class="btn-small btn-reject" style="margin-top:10px;max-width:120px" onclick="cancelMyLeave('${escapeHtml(l.leaveId)}')">Cancel</button>` : ''}
    </div>`;
}

function renderPendingLeaveCard(l) {
  return `
    <div class="leave-card leave-pending-card">
      <div class="leave-card-header">
        <span class="leave-emp-name">👤 ${escapeHtml(l.userName)} (${escapeHtml(l.userRole)})</span>
        <span class="leave-type-badge">${escapeHtml(l.leaveType)}</span>
      </div>
      <div class="leave-card-dates">📅 ${escapeHtml(l.fromDate)} → ${escapeHtml(l.toDate)} &nbsp;·&nbsp; <strong>${l.totalDays} days</strong></div>
      <div class="leave-card-reason">📝 ${escapeHtml(l.reason)}</div>
      <div class="leave-card-meta">Applied: ${escapeHtml(l.appliedOn)}</div>
      <div class="leave-approval-actions">
        <button class="btn-small btn-complete" onclick="approveTeamLeave('${escapeHtml(l.leaveId)}')">✓ Approve</button>
        <button class="btn-small btn-reject"   onclick="rejectTeamLeave('${escapeHtml(l.leaveId)}')">✗ Reject</button>
      </div>
    </div>`;
}

async function submitLeaveApplication() {
  const type    = document.getElementById('leaveType')?.value;
  const reason  = document.getElementById('leaveReason')?.value.trim();
  const from    = document.getElementById('leaveFrom')?.value;
  const to      = document.getElementById('leaveTo')?.value;
  const errDiv  = document.getElementById('leave-apply-error');
  const sucDiv  = document.getElementById('leave-apply-success');

  errDiv?.classList.remove('show');
  sucDiv?.classList.remove('show');

  if (!type)   { if (errDiv) { errDiv.textContent = 'Please select leave type.'; errDiv.classList.add('show'); } return; }
  if (!reason) { if (errDiv) { errDiv.textContent = 'Please enter a reason.';    errDiv.classList.add('show'); } return; }
  if (!from)   { if (errDiv) { errDiv.textContent = 'Please select From date.';  errDiv.classList.add('show'); } return; }
  if (!to)     { if (errDiv) { errDiv.textContent = 'Please select To date.';    errDiv.classList.add('show'); } return; }
  if (to < from){ if (errDiv) { errDiv.textContent = 'To date must be after From date.'; errDiv.classList.add('show'); } return; }

  const btn = document.querySelector('.leave-form-card .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }

  try {
    const result = await attApiCall('applyLeave', {
      userEmail:    currentUser.email,
      userName:     currentUser.name,
      userRole:     currentUser.role,
      managerEmail: currentUser.managedBy || '',
      leaveType:    type,
      fromDate:     from,
      toDate:       to,
      reason
    });

    if (btn) { btn.disabled = false; btn.textContent = 'Apply for Leave'; }

    if (result.success) {
      showToast('Leave applied successfully! 🌴', 'success');
      loadLeavePanel();
    } else {
      if (errDiv) { errDiv.textContent = result.message; errDiv.classList.add('show'); }
    }
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Apply for Leave'; }
    if (errDiv) { errDiv.textContent = 'Error submitting. Please try again.'; errDiv.classList.add('show'); }
  }
}

async function cancelMyLeave(leaveId) {
  if (!confirm('Cancel this leave request?')) return;
  try {
    const result = await attApiCall('cancelLeave', { leaveId, userEmail: currentUser.email });
    if (result.success) { showToast('Leave cancelled.', 'info'); loadLeavePanel(); }
    else alert(result.message);
  } catch { alert('Error cancelling leave.'); }
}

async function approveTeamLeave(leaveId) {
  const note = prompt('Approval note (optional):') || 'Approved';
  try {
    const result = await attApiCall('approveLeave', { leaveId, approvedBy: currentUser.name, note });
    if (result.success) { showToast('Leave approved! ✅', 'success'); loadLeavePanel(); }
    else alert(result.message);
  } catch { alert('Error approving leave.'); }
}

async function rejectTeamLeave(leaveId) {
  const reason = prompt('Reason for rejection:');
  if (!reason) return;
  try {
    const result = await attApiCall('rejectLeave', { leaveId, rejectedBy: currentUser.name, reason });
    if (result.success) { showToast('Leave rejected.', 'error'); loadLeavePanel(); }
    else alert(result.message);
  } catch { alert('Error rejecting leave.'); }
}

// ════════════════════════════════════════════════════════════
// TAB 4: REPORTS
// ════════════════════════════════════════════════════════════
async function loadReportsPanel() {
  const panel = document.getElementById('att-panel-reports');
  if (!panel) return;

  const now = new Date();
  panel.innerHTML = `
    <div class="report-controls">
      <div class="att-section-title">📊 Monthly Attendance Report</div>
      <div class="form-row-2">
        <div class="form-group">
          <label>Year</label>
          <select id="reportYear" class="form-input form-select">
            ${[now.getFullYear(), now.getFullYear() - 1].map(y =>
              `<option value="${y}" ${y === now.getFullYear() ? 'selected' : ''}>${y}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Month</label>
          <select id="reportMonth" class="form-input form-select">
            ${Array.from({ length: 12 }, (_, i) => {
              const m = i + 1;
              const name = new Date(2000, i, 1).toLocaleString('en-IN', { month: 'long' });
              return `<option value="${m}" ${m === now.getMonth() + 1 ? 'selected' : ''}>${name}</option>`;
            }).join('')}
          </select>
        </div>
      </div>
      <button class="btn-primary" onclick="generateReport()" style="margin-bottom:0">
        📋 Generate Report
      </button>
    </div>
    <div id="reportOutput"></div>
  `;
}

async function generateReport() {
  const year  = document.getElementById('reportYear')?.value;
  const month = document.getElementById('reportMonth')?.value;
  const out   = document.getElementById('reportOutput');

  if (!out) return;
  out.innerHTML = `<div class="att-loading"><div class="spinner"></div><p>Generating report...</p></div>`;

  try {
    const result = await attApiCall('getMonthlyReport', {
      userEmail: currentUser.email,
      userName:  currentUser.name,
      year, month
    });

    if (!result.success) { out.innerHTML = `<div class="empty-state">${result.message}</div>`; return; }
    renderReport(result.report, out);
  } catch (err) {
    out.innerHTML = `<div class="empty-state">Error generating report.</div>`;
  }
}

function renderReport(report, container) {
  const { summary, days, leaves, balance } = report;
  const attPct = summary.totalWorkingDays > 0
    ? Math.round((summary.present + summary.halfDay * 0.5) / summary.totalWorkingDays * 100)
    : 0;

  container.innerHTML = `
    <div class="report-card">
      <div class="report-title">${report.monthName} ${report.year} — Attendance Report</div>
      <div class="report-emp">👤 ${escapeHtml(report.userName)}</div>

      <div class="report-metrics">
        <div class="rep-metric rep-present">
          <div class="rep-metric-num">${summary.present}</div>
          <div class="rep-metric-label">Present</div>
        </div>
        <div class="rep-metric rep-absent">
          <div class="rep-metric-num">${summary.absent}</div>
          <div class="rep-metric-label">Absent</div>
        </div>
        <div class="rep-metric rep-leave">
          <div class="rep-metric-num">${summary.leave}</div>
          <div class="rep-metric-label">Leave</div>
        </div>
        <div class="rep-metric rep-halfday">
          <div class="rep-metric-num">${summary.halfDay}</div>
          <div class="rep-metric-label">Half Day</div>
        </div>
      </div>

      <div class="report-att-bar-wrap">
        <div class="report-att-bar-label">Attendance: <strong>${attPct}%</strong></div>
        <div class="report-att-bar-bg">
          <div class="report-att-bar-fill" style="width:${attPct}%;background:${attPct>=80?'#22c55e':attPct>=60?'#f59e0b':'#ef4444'}"></div>
        </div>
      </div>

      <div class="report-stats-row">
        <span>🗓 Working Days: <strong>${summary.totalWorkingDays}</strong></span>
        <span>⏱ Hours Worked: <strong>${summary.totalWorkHours}h</strong></span>
      </div>

      <div class="att-section-title" style="margin-top:20px">Daily Breakdown</div>
      <div class="report-table-wrap">
        <table class="report-table">
          <thead>
            <tr><th>Date</th><th>Day</th><th>Status</th><th>In</th><th>Out</th><th>Hrs</th></tr>
          </thead>
          <tbody>
            ${days.filter(d => d.status !== 'Upcoming').map(d => {
              const wd = new Date(d.date).toLocaleString('en-IN', { weekday: 'short' });
              const sc = d.status === 'Present' ? 'status-completed'
                       : d.status === 'Absent'  ? 'status-rejected'
                       : d.status === 'Leave'   ? 'status-pending'
                       : '';
              return `<tr>
                <td>${d.date}</td>
                <td>${wd}</td>
                <td><span class="request-status ${sc}" style="font-size:10px;padding:2px 8px">${d.status}${d.leaveType ? ' (' + d.leaveType + ')' : ''}</span></td>
                <td>${d.checkInTime  || '—'}</td>
                <td>${d.checkOutTime || '—'}</td>
                <td>${d.workingHours ? d.workingHours + 'h' : '—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>

      <div class="report-download-btns">
        <button class="btn-download-excel" onclick="downloadReportExcel()">
          📊 Download Excel
        </button>
        <button class="btn-download-pdf" onclick="downloadReportPDF()">
          📄 Download PDF
        </button>
      </div>
    </div>
  `;

  window._currentReport = report;
}

function downloadReportExcel() {
  const report = window._currentReport;
  if (!report) return;

  const { summary, days } = report;

  let csv = `THORE India — Attendance Report\n`;
  csv += `Employee,${report.userName}\n`;
  csv += `Month,${report.monthName} ${report.year}\n\n`;
  csv += `Summary\n`;
  csv += `Present,${summary.present}\n`;
  csv += `Absent,${summary.absent}\n`;
  csv += `Leave,${summary.leave}\n`;
  csv += `Half Day,${summary.halfDay}\n`;
  csv += `Total Working Days,${summary.totalWorkingDays}\n`;
  csv += `Total Hours Worked,${summary.totalWorkHours}\n\n`;
  csv += `Date,Day,Status,Check In,Check Out,Hours\n`;

  days.filter(d => d.status !== 'Upcoming').forEach(d => {
    const wd = new Date(d.date).toLocaleString('en-IN', { weekday: 'long' });
    csv += `${d.date},${wd},${d.status}${d.leaveType ? ' (' + d.leaveType + ')' : ''},${d.checkInTime || ''},${d.checkOutTime || ''},${d.workingHours || ''}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `Attendance_${report.userName.replace(/ /g, '_')}_${report.monthName}_${report.year}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Excel report downloaded! 📊', 'success');
}

function downloadReportPDF() {
  const report = window._currentReport;
  if (!report) return;

  const { summary, days } = report;
  const attPct = summary.totalWorkingDays > 0
    ? Math.round((summary.present + summary.halfDay * 0.5) / summary.totalWorkingDays * 100) : 0;

  const printWin = window.open('', '_blank');
  printWin.document.write(`
    <!DOCTYPE html><html><head>
    <title>Attendance Report — ${report.monthName} ${report.year}</title>
    <style>
      body { font-family: Arial, sans-serif; color: #1e293b; padding: 30px; }
      h1   { color: #b8950e; margin-bottom: 4px; }
      .meta{ color: #64748b; font-size: 14px; margin-bottom: 20px; }
      .summary { display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
      .sum-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 20px; text-align: center; min-width: 90px; }
      .sum-num  { font-size: 24px; font-weight: 700; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th { background: #f8fafc; text-align: left; padding: 8px 10px; border: 1px solid #e2e8f0; }
      td { padding: 7px 10px; border: 1px solid #e2e8f0; }
      tr:nth-child(even) { background: #f8fafc; }
      .footer { margin-top: 30px; font-size: 11px; color: #94a3b8; text-align: center; }
      @media print { button { display: none; } }
    </style>
    </head><body>
    <h1>📋 Attendance Report</h1>
    <div class="meta">Employee: <strong>${report.userName}</strong> &nbsp;|&nbsp; Period: <strong>${report.monthName} ${report.year}</strong></div>
    <div class="summary">
      <div class="sum-card"><div class="sum-num" style="color:#22c55e">${summary.present}</div><div>Present</div></div>
      <div class="sum-card"><div class="sum-num" style="color:#ef4444">${summary.absent}</div><div>Absent</div></div>
      <div class="sum-card"><div class="sum-num" style="color:#3b82f6">${summary.leave}</div><div>Leave</div></div>
      <div class="sum-card"><div class="sum-num" style="color:#f59e0b">${summary.halfDay}</div><div>Half Day</div></div>
      <div class="sum-card"><div class="sum-num">${summary.totalWorkingDays}</div><div>Working Days</div></div>
      <div class="sum-card"><div class="sum-num">${attPct}%</div><div>Attendance</div></div>
      <div class="sum-card"><div class="sum-num">${summary.totalWorkHours}h</div><div>Hours Worked</div></div>
    </div>
    <table>
      <thead><tr><th>Date</th><th>Day</th><th>Status</th><th>Check In</th><th>Check Out</th><th>Hours</th></tr></thead>
      <tbody>
        ${days.filter(d => d.status !== 'Upcoming').map(d => {
          const wd = new Date(d.date).toLocaleString('en-IN', { weekday: 'short' });
          return `<tr><td>${d.date}</td><td>${wd}</td><td>${d.status}${d.leaveType ? ' (' + d.leaveType + ')' : ''}</td><td>${d.checkInTime || '—'}</td><td>${d.checkOutTime || '—'}</td><td>${d.workingHours ? d.workingHours + 'h' : '—'}</td></tr>`;
        }).join('')}
      </tbody>
    </table>
    <div class="footer">Generated by THORE India Portal · ${new Date().toLocaleDateString('en-IN')}</div>
    <br><button onclick="window.print()">🖨 Print / Save as PDF</button>
    </body></html>
  `);
  printWin.document.close();
  showToast('PDF report opened for printing! 📄', 'success');
}

// ════════════════════════════════════════════════════════════
// TAB 5: TEAM ATTENDANCE (managers)
// ════════════════════════════════════════════════════════════
async function loadTeamAttPanel() {
  const panel = document.getElementById('att-panel-team-att');
  if (!panel) return;

  const today = new Date().toISOString().split('T')[0];
  panel.innerHTML = `
    <div class="att-section-title">Team Attendance</div>
    <div class="form-row-2" style="margin-bottom:14px">
      <div class="form-group">
        <label>Date</label>
        <input type="date" id="teamAttDate" class="form-input" value="${today}">
      </div>
      <div class="form-group" style="display:flex;align-items:flex-end">
        <button class="btn-primary" style="width:100%;padding:12px" onclick="loadTeamAttDate()">View</button>
      </div>
    </div>
    <div id="teamAttContainer"><div class="empty-state">Select a date and tap View</div></div>
  `;
}

async function loadTeamAttDate() {
  const date = document.getElementById('teamAttDate')?.value;
  const cont = document.getElementById('teamAttContainer');
  if (!date || !cont) return;

  cont.innerHTML = `<div class="att-loading"><div class="spinner"></div></div>`;

  try {
    const result = await attApiCall('getTeamAttendance', { managerEmail: currentUser.email, date });
    const records = result.records || [];

    if (!records.length) {
      cont.innerHTML = `<div class="empty-state">No attendance data for ${date}</div>`;
      return;
    }

    cont.innerHTML = records.map(r => `
      <div class="team-att-card">
        <div class="team-att-avatar">${r.userName.charAt(0).toUpperCase()}</div>
        <div class="team-att-info">
          <div class="team-att-name">${escapeHtml(r.userName)}</div>
          <div class="team-att-role">${escapeHtml(r.userRole)}</div>
        </div>
        <div class="team-att-times">
          <div class="team-att-in">🟢 ${r.checkInTime || '—'}</div>
          <div class="team-att-out">🔴 ${r.checkOutTime || '—'}</div>
        </div>
        <span class="request-status ${getStatusClass(r.status || 'Absent')}" style="font-size:11px">${r.status || 'Absent'}</span>
      </div>`).join('');
  } catch {
    cont.innerHTML = `<div class="empty-state">Error loading team attendance.</div>`;
  }
}
