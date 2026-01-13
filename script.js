// ============================================
// CONFIGURATION - UPDATE THIS WITH YOUR APPS SCRIPT URL
// ============================================
const API_URL = 'https://script.google.com/macros/s/AKfycbwUV81uoiyjN8s7R-iZT4UfL806LcCWDlWwXJ_YAjzeOyyz4UiLUU7ILZlK9MG4i8UwfQ/exec';
// Example: 'https://script.google.com/macros/s/AKfycbxxx.../exec'

// ============================================
// GLOBAL VARIABLES
// ============================================
let currentUser = null;
let deferredPrompt;
let notificationCheckInterval;

// ============================================
// API CALL FUNCTION
// ============================================
async function apiCall(action, params = {}) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: action,
        ...params
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
}

// ============================================
// INITIALIZATION
// ============================================
window.addEventListener('load', function() {
  // Show welcome screen for 2 seconds
  setTimeout(function() {
    checkAuth();
  }, 2000);
  
  // PWA Install listener
  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredPrompt = e;
  });

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
      .then(registration => console.log('Service Worker registered'))
      .catch(error => console.log('Service Worker registration failed:', error));
  }

  // Request notification permission
  if ("Notification" in window) {
    Notification.requestPermission().then(function(permission) {
      if(permission === "granted"){
        console.log("User allowed notifications");
      }
    });
  }
});

// ============================================
// AUTHENTICATION
// ============================================
function checkAuth() {
  const savedUser = localStorage.getItem('currentUser');
  
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    checkForAnnouncement();
  } else {
    showScreen('loginScreen');
  }
}

document.addEventListener('DOMContentLoaded', function() {
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', function(e) {
      e.preventDefault();
      handleLogin();
    });
  }
  
  const dataRequestForm = document.getElementById('dataRequestForm');
  if (dataRequestForm) {
    dataRequestForm.addEventListener('submit', function(e) {
      e.preventDefault();
      handleDataRequestSubmit();
    });
  }
});

async function handleLogin() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const errorDiv = document.getElementById('loginError');
  const loginBtn = document.getElementById('loginBtn');
  const loginBtnText = document.getElementById('loginBtnText');
  const loginBtnLoader = document.getElementById('loginBtnLoader');
  
  errorDiv.classList.remove('show');
  errorDiv.textContent = '';
  
  loginBtn.disabled = true;
  loginBtnText.style.display = 'none';
  loginBtnLoader.style.display = 'inline-flex';
  
  try {
    const result = await apiCall('validateLogin', { email, password });
    
    loginBtn.disabled = false;
    loginBtnText.style.display = 'inline';
    loginBtnLoader.style.display = 'none';
    
    if (result.success) {
      currentUser = result.user;
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
      checkForAnnouncement();
    } else {
      errorDiv.textContent = result.message;
      errorDiv.classList.add('show');
    }
  } catch (error) {
    loginBtn.disabled = false;
    loginBtnText.style.display = 'inline';
    loginBtnLoader.style.display = 'none';
    errorDiv.textContent = 'Login failed. Please check your connection and try again.';
    errorDiv.classList.add('show');
    console.error(error);
  }
}

// ============================================
// SCREEN MANAGEMENT
// ============================================
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(function(screen) {
    screen.classList.remove('active');
  });
  document.getElementById(screenId).classList.add('active');
}

// ============================================
// ANNOUNCEMENTS
// ============================================
async function checkForAnnouncement() {
  try {
    const announcement = await apiCall('getActiveAnnouncement');
    
    if (announcement && !sessionStorage.getItem('announcementShown')) {
      showAnnouncement(announcement);
    } else {
      showMainApp();
    }
  } catch (error) {
    console.error('Error loading announcement:', error);
    showMainApp();
  }
}

function showAnnouncement(announcement) {
  const content = document.getElementById('announcementContent');
  let html = '';
  
  if (announcement.imageUrl) {
    html += '<img src="' + escapeHtml(announcement.imageUrl) + '" alt="Announcement">';
  }
  
  if (announcement.message) {
    html += '<p>' + escapeHtml(announcement.message) + '</p>';
  }
  
  content.innerHTML = html;
  showScreen('announcementScreen');
}

function closeAnnouncement() {
  sessionStorage.setItem('announcementShown', 'true');
  showMainApp();
}

async function showAnnouncements() {
  toggleMenu();
  try {
    const announcement = await apiCall('getActiveAnnouncement');
    
    if (announcement) {
      sessionStorage.removeItem('announcementShown');
      showAnnouncement(announcement);
    } else {
      alert('No announcements at this time.');
    }
  } catch (error) {
    console.error('Error loading announcement:', error);
    alert('Error loading announcements.');
  }
}

// ============================================
// MAIN APP
// ============================================
function showMainApp() {
  updateUserInfo();
  showScreen('mainScreen');
  loadLinks();
  checkIfOperationsTeam();
  startNotificationPolling();
  
  if (!window.matchMedia('(display-mode: standalone)').matches) {
    setTimeout(function() {
      document.getElementById('installPrompt').classList.add('show');
    }, 2000);
  }
}

function updateUserInfo() {
  if (currentUser) {
    document.getElementById('userName').textContent = currentUser.name;
    document.getElementById('userEmail').textContent = currentUser.email;
    document.getElementById('userAvatar').textContent = currentUser.name.charAt(0).toUpperCase();
    
    document.getElementById('reqUserName').textContent = currentUser.name;
    document.getElementById('reqUserRole').textContent = currentUser.role;
    updateDateTime();
  }
}

function updateDateTime() {
  const now = new Date();
  const options = { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  };
  document.getElementById('reqDateTime').textContent = now.toLocaleString('en-IN', options);
}

// ============================================
// OPERATIONS TEAM CHECK
// ============================================
async function checkIfOperationsTeam() {
  if (!currentUser) return;
  
  try {
    const result = await apiCall('isOperationsTeam', { userEmail: currentUser.email });
    
    if (result.isOperationsTeam) {
      document.getElementById('opsMenuBtn').style.display = 'block';
    }
  } catch (error) {
    console.error('Error checking operations team:', error);
  }
}

// ============================================
// LINKS
// ============================================
async function loadLinks() {
  if (!currentUser) return;
  
  document.getElementById('loadingSpinner').classList.remove('hide');
  document.getElementById('linksContainer').innerHTML = '';
  
  try {
    const links = await apiCall('getLinksForUser', { userEmail: currentUser.email });
    displayLinks(links);
  } catch (error) {
    showError(error);
  }
}

function displayLinks(links) {
  document.getElementById('loadingSpinner').classList.add('hide');
  const container = document.getElementById('linksContainer');
  
  if (links.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;">No links available for you</div>';
    return;
  }
  
  links.forEach(function(link) {
    const card = document.createElement('div');
    card.className = 'link-card';
    card.setAttribute('data-url', link.url);
    
    card.innerHTML = `
      <div class="link-info">
        <div class="link-title">${escapeHtml(link.title)}</div>
        <div class="link-url">${escapeHtml(link.url)}</div>
      </div>
      <div class="link-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>
        </svg>
      </div>
    `;
    
    card.addEventListener('click', function() {
      openLink(this.getAttribute('data-url'));
    });
    
    container.appendChild(card);
  });
}

function showError(error) {
  document.getElementById('loadingSpinner').classList.add('hide');
  document.getElementById('linksContainer').innerHTML = 
    '<div style="text-align:center;padding:40px;color:#ef4444;">Error loading links. Please refresh.</div>';
  console.error(error);
}

function openLink(url) {
  var link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ============================================
// VIEW NAVIGATION
// ============================================
function showLinksView() {
  document.getElementById('linksView').style.display = 'block';
  document.getElementById('dataRequestView').style.display = 'none';
  document.getElementById('myRequestsView').style.display = 'none';
  document.getElementById('operationsView').style.display = 'none';
  toggleMenu();
}

function showDataRequestPortal() {
  document.getElementById('linksView').style.display = 'none';
  document.getElementById('dataRequestView').style.display = 'block';
  document.getElementById('myRequestsView').style.display = 'none';
  document.getElementById('operationsView').style.display = 'none';
  
  updateDateTime();
  document.getElementById('remarks').value = '';
  document.getElementById('requestError').classList.remove('show');
  document.getElementById('requestSuccess').classList.remove('show');
  
  toggleMenu();
}

function showMyRequests() {
  document.getElementById('linksView').style.display = 'none';
  document.getElementById('dataRequestView').style.display = 'none';
  document.getElementById('myRequestsView').style.display = 'block';
  document.getElementById('operationsView').style.display = 'none';
  
  toggleMenu();
  setTimeout(loadMyRequests, 50);
}

function showOperationsPanel() {
  document.getElementById('linksView').style.display = 'none';
  document.getElementById('dataRequestView').style.display = 'none';
  document.getElementById('myRequestsView').style.display = 'none';
  document.getElementById('operationsView').style.display = 'block';
  
  loadOperationsPanel();
  toggleMenu();
}

// ============================================
// DATA REQUEST SUBMISSION
// ============================================
async function handleDataRequestSubmit() {
  const remarks = document.getElementById('remarks').value.trim();
  const errorDiv = document.getElementById('requestError');
  const successDiv = document.getElementById('requestSuccess');
  const submitBtn = document.getElementById('submitRequestBtn');
  const submitBtnText = document.getElementById('submitBtnText');
  const submitBtnLoader = document.getElementById('submitBtnLoader');
  
  if (!remarks) {
    errorDiv.textContent = 'Please enter request details';
    errorDiv.classList.add('show');
    return;
  }
  
  errorDiv.classList.remove('show');
  successDiv.classList.remove('show');
  
  submitBtn.disabled = true;
  submitBtnText.style.display = 'none';
  submitBtnLoader.style.display = 'inline-flex';
  
  try {
    const result = await apiCall('submitDataRequest', {
      userEmail: currentUser.email,
      userName: currentUser.name,
      userRole: currentUser.role,
      remarks: remarks
    });
    
    submitBtn.disabled = false;
    submitBtnText.style.display = 'inline';
    submitBtnLoader.style.display = 'none';
    
    if (result.success) {
      successDiv.innerHTML = `
        <strong>✓ Request Submitted Successfully!</strong><br>
        Request ID: ${result.requestId}<br>
        Estimated Time: ${result.estimatedTime}
      `;
      successDiv.classList.add('show');
      document.getElementById('remarks').value = '';
      
      document.getElementById('estimatedTime').textContent = result.estimatedTime;
      
      setTimeout(function() {
        successDiv.classList.remove('show');
      }, 5000);
    } else {
      errorDiv.textContent = result.message;
      errorDiv.classList.add('show');
    }
  } catch (error) {
    submitBtn.disabled = false;
    submitBtnText.style.display = 'inline';
    submitBtnLoader.style.display = 'none';
    errorDiv.textContent = 'Error submitting request. Please try again.';
    errorDiv.classList.add('show');
    console.error(error);
  }
}

// ============================================
// MY REQUESTS
// ============================================
async function loadMyRequests() {
  if (!currentUser) return;
  
  document.getElementById('myRequestsLoading').classList.remove('hide');
  document.getElementById('myRequestsContainer').classList.remove('hide');
  document.getElementById('myRequestsContainer').innerHTML = '';
  
  try {
    const requests = await apiCall('getUserRequests', { userEmail: currentUser.email });
    document.getElementById('myRequestsLoading').classList.add('hide');
    displayMyRequests(requests);
  } catch (error) {
    document.getElementById('myRequestsLoading').classList.add('hide');
    document.getElementById('myRequestsContainer').innerHTML = 
      '<div class="empty-state">Error loading requests. Please try again.</div>';
    console.error(error);
  }
}

function displayMyRequests(requests) {
  const container = document.getElementById('myRequestsContainer');
  
  if (requests.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        <p>No requests yet</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = '';
  
  requests.forEach(function(req) {
    const card = document.createElement('div');
    card.className = 'request-card';
    
    let statusClass = 'status-pending';
    if (req.status === 'Completed') statusClass = 'status-completed';
    if (req.status === 'Rejected') statusClass = 'status-rejected';
    
    let detailsHtml = `
      <div class="request-card-header">
        <span class="request-id">${escapeHtml(req.requestId)}</span>
        <span class="request-status ${statusClass}">${escapeHtml(req.status)}</span>
      </div>
      <div class="request-detail">
        <strong>Requested:</strong>
        <span>${escapeHtml(req.requestDate)} at ${escapeHtml(req.requestTime)}</span>
      </div>
      <div class="request-detail">
        <strong>Estimated:</strong>
        <span>${escapeHtml(req.estimatedTime)}</span>
      </div>
    `;
    
    if (req.status === 'Completed' && req.actualCompleteTime) {
      detailsHtml += `
        <div class="request-detail">
          <strong>Completed:</strong>
          <span>${escapeHtml(req.actualCompleteTime)}</span>
        </div>
        <div class="request-detail">
          <strong>Handled By:</strong>
          <span>${escapeHtml(req.handledBy)}</span>
        </div>
      `;
    }
    
    if (req.status === 'Rejected' && req.rejectReason) {
      detailsHtml += `
        <div class="request-detail">
          <strong>Reason:</strong>
          <span style="color: #fca5a5;">${escapeHtml(req.rejectReason)}</span>
        </div>
      `;
    }
    
    detailsHtml += `
      <div class="request-remarks">
        <strong>Details:</strong><br>
        ${escapeHtml(req.remarks)}
      </div>
    `;
    
    card.innerHTML = detailsHtml;
    container.appendChild(card);
  });
}

// ============================================
// OPERATIONS PANEL
// ============================================
async function loadOperationsPanel() {
  document.getElementById('operationsLoading').classList.remove('hide');
  document.getElementById('operationsContainer').innerHTML = '';
  
  try {
    const stats = await apiCall('getOperationsStats');
    displayOperationsStats(stats);
    
    const requests = await apiCall('getAllPendingRequests');
    document.getElementById('operationsLoading').classList.add('hide');
    displayOperationsRequests(requests);
  } catch (error) {
    document.getElementById('operationsLoading').classList.add('hide');
    document.getElementById('operationsContainer').innerHTML = 
      '<div class="empty-state">Error loading requests. Please try again.</div>';
    console.error(error);
  }
}

function displayOperationsStats(stats) {
  const container = document.getElementById('operationsStatsContainer');
  let html = '';
  
  for (var member in stats) {
    html += `
      <div class="stat-card">
        <div class="stat-number">${stats[member]}</div>
        <div class="stat-label">${escapeHtml(member)}</div>
      </div>
    `;
  }
  
  container.innerHTML = html;
}

function displayOperationsRequests(requests) {
  const container = document.getElementById('operationsContainer');
  
  if (requests.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <p>No pending requests</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = '';
  
  requests.forEach(function(req) {
    const card = document.createElement('div');
    card.className = 'request-card';
    
    card.innerHTML = `
      <div class="request-card-header">
        <span class="request-id">${escapeHtml(req.requestId)}</span>
        <span class="request-status status-pending">${escapeHtml(req.status)}</span>
      </div>
      <div class="request-detail">
        <strong>Requested By:</strong>
        <span>${escapeHtml(req.requestedBy)} (${escapeHtml(req.role)})</span>
      </div>
      <div class="request-detail">
        <strong>Email:</strong>
        <span>${escapeHtml(req.email)}</span>
      </div>
      <div class="request-detail">
        <strong>Requested:</strong>
        <span>${escapeHtml(req.requestDate)} at ${escapeHtml(req.requestTime)}</span>
      </div>
      <div class="request-detail">
        <strong>Estimated:</strong>
        <span>${escapeHtml(req.estimatedTime)}</span>
      </div>
      <div class="request-remarks">
        <strong>Request Details:</strong><br>
        ${escapeHtml(req.remarks)}
      </div>
      <div class="request-actions">
        <button class="btn-small btn-complete" onclick="completeRequest('${escapeHtml(req.requestId)}')">
          ✓ Complete
        </button>
        <button class="btn-small btn-pending" onclick="updateTimeline('${escapeHtml(req.requestId)}')">
          ⏱ Update Timeline
        </button>
        <button class="btn-small btn-reject" onclick="rejectRequest('${escapeHtml(req.requestId)}')">
          ✗ Reject
        </button>
      </div>
    `;
    
    container.appendChild(card);
  });
}

async function completeRequest(requestId) {
  if (!confirm('Mark this request as completed?')) return;
  
  try {
    const result = await apiCall('updateRequestStatus', {
      requestId: requestId,
      status: 'Completed',
      handledBy: currentUser.name,
      rejectReason: ''
    });
    
    if (result.success) {
      alert('Request marked as completed!');
      loadOperationsPanel();
    } else {
      alert('Error: ' + result.message);
    }
  } catch (error) {
    alert('Error completing request');
    console.error(error);
  }
}

async function updateTimeline(requestId) {
  var reason = prompt('Enter reason for delay or updated timeline:');
  if (!reason) return;
  
  try {
    const result = await apiCall('updateRequestStatus', {
      requestId: requestId,
      status: 'Pending',
      handledBy: currentUser.name,
      rejectReason: reason
    });
    
    if (result.success) {
      alert('Timeline updated!');
      loadOperationsPanel();
    } else {
      alert('Error: ' + result.message);
    }
  } catch (error) {
    alert('Error updating timeline');
    console.error(error);
  }
}

async function rejectRequest(requestId) {
  var reason = prompt('Enter reason for rejection:');
  if (!reason) return;
  
  if (!confirm('Reject this request? User will need management approval to resubmit.')) return;
  
  try {
    const result = await apiCall('updateRequestStatus', {
      requestId: requestId,
      status: 'Rejected',
      handledBy: currentUser.name,
      rejectReason: reason
    });
    
    if (result.success) {
      alert('Request rejected!');
      loadOperationsPanel();
    } else {
      alert('Error: ' + result.message);
    }
  } catch (error) {
    alert('Error rejecting request');
    console.error(error);
  }
}

// ============================================
// NOTIFICATIONS
// ============================================
function startNotificationPolling() {
  loadNotifications();
  notificationCheckInterval = setInterval(loadNotifications, 30000);
}

async function loadNotifications() {
  if (!currentUser) return;
  
  try {
    const notifications = await apiCall('getUnreadNotifications', { userEmail: currentUser.email });
    updateNotificationBadge(notifications.length);
    
    // Show browser notification if there are new ones
    if (notifications.length > 0 && Notification.permission === 'granted') {
      new Notification('THORE India Portal', {
        body: `You have ${notifications.length} new notification(s)`,
        icon: 'https://i.postimg.cc/HW6BvgGS/android-icon-192x192.png'
      });
    }
  } catch (error) {
    console.error('Error loading notifications:', error);
  }
}

function updateNotificationBadge(count) {
  const badge = document.getElementById('notificationBadge');
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'block';
  } else {
    badge.style.display = 'none';
  }
}

async function showNotifications() {
  const panel = document.getElementById('notificationsPanel');
  panel.classList.add('open');
  
  const container = document.getElementById('notificationsContent');
  container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading...</p></div>';

  setTimeout(async function() {
    try {
      const notifications = await apiCall('getUnreadNotifications', { userEmail: currentUser.email });
      displayNotifications(notifications);
    } catch (error) {
      container.innerHTML = '<div class="no-notifications">Error loading notifications</div>';
      console.error(error);
    }
  }, 50);
}

function closeNotifications() {
  document.getElementById('notificationsPanel').classList.remove('open');
}

function displayNotifications(notifications) {
  const container = document.getElementById('notificationsContent');
  
  if (notifications.length === 0) {
    container.innerHTML = '<div class="no-notifications">No new notifications</div>';
    return;
  }
  
  container.innerHTML = '';
  
  notifications.forEach(function(notif) {
    const item = document.createElement('div');
    item.className = 'notification-item unread';
    item.onclick = function() {
      markAsRead(notif.notifId);
    };
    
    item.innerHTML = `
      <div class="notification-message">${escapeHtml(notif.message)}</div>
      <div class="notification-time">${escapeHtml(notif.createdAt)}</div>
    `;
    
    container.appendChild(item);
  });
}

async function markAsRead(notifId) {
  try {
    await apiCall('markNotificationAsRead', { notifId: notifId });
    loadNotifications();
    showNotifications();
  } catch (error) {
    console.error('Error marking notification as read:', error);
  }
}

// ============================================
// MENU FUNCTIONS
// ============================================
function toggleMenu() {
  const menu = document.getElementById('sideMenu');
  const menuIcon = document.getElementById('menuIcon');
  const closeIcon = document.getElementById('closeIcon');
  
  menu.classList.toggle('open');
  
  if (menu.classList.contains('open')) {
    menuIcon.style.display = 'none';
    closeIcon.style.display = 'block';
  } else {
    menuIcon.style.display = 'block';
    closeIcon.style.display = 'none';
  }
}

function showSettings() {
  alert('Settings feature coming soon!');
  toggleMenu();
}

function showAbout() {
  alert('Company Links Portal v2.0\n\nSecure access to company resources with Data Request Management.');
  toggleMenu();
}

function logout() {
  if (confirm('Are you sure you want to logout?')) {
    localStorage.removeItem('currentUser');
    sessionStorage.clear();
    currentUser = null;
    if (notificationCheckInterval) {
      clearInterval(notificationCheckInterval);
    }
    showScreen('loginScreen');
    toggleMenu();
  }
}

// ============================================
// PWA FUNCTIONS
// ============================================
function installApp() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function(choiceResult) {
      if (choiceResult.outcome === 'accepted') {
        dismissInstall();
      }
      deferredPrompt = null;
    });
  } else {
    alert('To install:\n1. Open browser menu\n2. Select "Add to Home screen"\n3. Tap "Add"');
  }
}

function dismissInstall() {
  document.getElementById('installPrompt').classList.remove('show');
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text.toString();
  return div.innerHTML;
}
