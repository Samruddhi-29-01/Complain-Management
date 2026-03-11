// ─── Router & Navigation ───────────────────────────────────────────
let currentRoute = '/';
let allComplaints = [];
let categories = [];

async function navigateTo(route) {
  currentRoute = route;
  hideAllPages();
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));

  const user = getCurrentUser();

  if (route === '/' && !isAuthenticated()) {
    showPage('page-landing');
  } else if (route === '/' && isAuthenticated()) {
    showPage('page-dashboard');
    loadDashboard();
    setActiveLink('sidebar-dashboard');
  } else if (route === '/login') {
    showPage('page-login');
    setupLoginPage();
  } else if (route === '/register') {
    showPage('page-register');
    setupRegisterPage();
  } else if (route === '/dashboard') {
    if (!isAuthenticated()) return navigateTo('/login');
    showPage('page-dashboard');
    loadDashboard();
    setActiveLink('sidebar-dashboard');
  } else if (route === '/complaints') {
    if (!isAuthenticated()) return navigateTo('/login');
    showPage('page-complaints');
    loadComplaints();
    setActiveLink('sidebar-complaints');
  } else if (route === '/submit') {
    if (!isAuthenticated()) return navigateTo('/login');
    showPage('page-submit');
    loadSubmitPage();
    setActiveLink('sidebar-submit');
  } else if (route === '/staff') {
    if (!isAuthenticated() || getCurrentUser().role !== 'admin') return navigateTo('/dashboard');
    showPage('page-staff');
    loadStaffManagement();
    setActiveLink('sidebar-staff');
  } else if (route.startsWith('/complaints/')) {
    if (!isAuthenticated()) return window.location.href = '/';
    const id = parseInt(route.split('/')[2]);
    showPage('page-detail');
    loadComplaintDetail(id);
    setActiveLink('sidebar-complaints');
  } else {
    // Default module views
    if (!isAuthenticated()) {
      showPage('page-landing');
    } else {
      showPage('page-dashboard');
      loadDashboard();
      setActiveLink('sidebar-dashboard');
    }
  }
}

function setActiveLink(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function navigateToDetail(id) { navigateTo(`/complaints/${id}`); }

// ─── Setup Navigation Event Listeners ──────────────────────────────
function setupNavigation() {
  const addEvt = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  };

  addEvt('navbar-logo-link', e => { e.preventDefault(); navigateTo('/'); });
  addEvt('navbar-signin-btn', e => { e.preventDefault(); navigateTo('/login'); });
  addEvt('navbar-logout-btn', e => { e.preventDefault(); logout(); window.location.href = '/'; });

  addEvt('landing-report-btn', e => { e.preventDefault(); navigateTo(isAuthenticated() ? '/submit' : '/login'); });
  addEvt('landing-register-btn', e => { e.preventDefault(); navigateTo('/register'); });
  addEvt('landing-cta-btn', e => { e.preventDefault(); navigateTo('/register'); });

  addEvt('dashboard-new-complaint', e => { e.preventDefault(); navigateTo('/submit'); });
  addEvt('dashboard-view-all', e => { e.preventDefault(); navigateTo('/complaints'); });

  addEvt('sidebar-dashboard', e => { e.preventDefault(); navigateTo('/dashboard'); });
  addEvt('sidebar-submit', e => { e.preventDefault(); navigateTo('/submit'); });
  addEvt('sidebar-complaints', e => { e.preventDefault(); navigateTo('/complaints'); });
  addEvt('sidebar-staff', e => { e.preventDefault(); navigateTo('/staff'); });

  addEvt('detail-back-btn', e => { e.preventDefault(); navigateTo('/complaints'); });
  addEvt('submit-cancel', e => { e.preventDefault(); navigateTo('/complaints'); });
  addEvt('register-back-btn', e => { e.preventDefault(); navigateTo('/login'); });

  // Notification bell
  document.getElementById('navbar-notif-btn').addEventListener('click', toggleNotifDropdown);
  document.getElementById('notif-mark-all').addEventListener('click', markAllNotificationsRead);
  document.addEventListener('click', e => {
    if (!document.getElementById('navbar-notif-wrapper').contains(e.target))
      document.getElementById('notif-dropdown').classList.add('hidden');
  });
}

// ─── Update Navbar ──────────────────────────────────────────────────
function updateNavbar() {
  const user = getCurrentUser();
  const badge   = document.getElementById('navbar-user-badge');
  const logout  = document.getElementById('navbar-logout-btn');
  const signIn  = document.getElementById('navbar-signin-btn');
  const notifEl = document.getElementById('navbar-notif-wrapper');

  const toggleHidden = (id, hide) => {
    const el = document.getElementById(id);
    if (el) hide ? el.classList.add('hidden') : el.classList.remove('hidden');
  };

  if (user) {
    if (badge) badge.classList.remove('hidden');
    if (document.getElementById('navbar-user-name')) document.getElementById('navbar-user-name').textContent = user.name;
    if (document.getElementById('navbar-user-role')) document.getElementById('navbar-user-role').textContent = user.role;
    if (document.getElementById('navbar-user-avatar')) document.getElementById('navbar-user-avatar').textContent = user.name.charAt(0).toUpperCase();
    
    if (logout) logout.classList.remove('hidden');
    if (signIn) signIn.classList.add('hidden');
    if (notifEl) notifEl.classList.remove('hidden');

    toggleHidden('sidebar-dashboard', false);
    toggleHidden('sidebar-submit', user.role !== 'user');
    toggleHidden('sidebar-staff', user.role !== 'admin');
    toggleHidden('dashboard-new-complaint', user.role !== 'user');
    toggleHidden('complaint-staff-search', user.role !== 'admin');

    loadNotifications();
  } else {
    if (badge) badge.classList.add('hidden');
    if (logout) logout.classList.add('hidden');
    if (notifEl) notifEl.classList.add('hidden');
    if (signIn) signIn.classList.remove('hidden');
    
    toggleHidden('sidebar-dashboard', true);
    toggleHidden('sidebar-submit', true);
    toggleHidden('sidebar-staff', true);
  }
}

// ─── Notifications ──────────────────────────────────────────────────
async function loadNotifications() {
  try {
    const notifs = await api.get('/notifications');
    const unread = notifs.filter(n => !n.is_read).length;
    const countEl = document.getElementById('notif-count');
    if (unread > 0) {
      countEl.textContent = unread > 9 ? '9+' : unread;
      countEl.classList.remove('hidden');
    } else {
      countEl.classList.add('hidden');
    }
    const list = document.getElementById('notif-list');
    list.innerHTML = notifs.length === 0
      ? '<div class="notif-empty">No notifications yet</div>'
      : notifs.map(n => `
          <div class="notif-item ${n.is_read ? '' : 'notif-unread'}" onclick="navigateToDetail(${n.complaint_id || 0})">
            <div class="notif-msg">${n.message}</div>
            <div class="notif-time">${formatTimeAgo(n.created_at)}</div>
          </div>`).join('');

    // Check pending staff for admin
    if (getCurrentUser()?.role === 'admin' && notifs.length >= 0) {
      try {
        const pending = await api.get('/staff/pending');
        const badge = document.getElementById('sidebar-pending-badge');
        if (pending.length > 0) badge.classList.remove('hidden');
        else badge.classList.add('hidden');
      } catch {}
    }
  } catch {}
}

function toggleNotifDropdown() {
  document.getElementById('notif-dropdown').classList.toggle('hidden');
}

async function markAllNotificationsRead() {
  try {
    await api.patch('/notifications/read-all', {});
    document.getElementById('notif-count').classList.add('hidden');
    document.querySelectorAll('.notif-item').forEach(el => el.classList.remove('notif-unread'));
  } catch {}
}

// ─── Initialize ─────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  updateNavbar();

  const user = getCurrentUser();
  const path = window.location.pathname.toLowerCase();
  
  // Protect routes and enforce physical HTML file separation
  if (!user) {
    if (!path.endsWith('/') && !path.endsWith('index.html') && !path.endsWith('/login') && !path.endsWith('/register')) {
      window.location.href = '/';
      return;
    }
  } else {
    const roleFile = `/${user.role === 'user' ? 'citizen' : user.role}.html`;
    
    // Redirect if they log in and are stuck on index.html
    if (path.endsWith('/') || path.endsWith('index.html')) {
      window.location.href = roleFile;
      return;
    }

    // Guard against navigating to the wrong module HTML file
    if (!path.endsWith(roleFile)) {
      window.location.href = roleFile;
      return;
    }
  }

  // Load appropriate default view inside the module
  if (!user) {
    navigateTo((path === '/' || path === '/index.html') ? '/' : path);
  } else {
    navigateTo('/dashboard');
  }
});
