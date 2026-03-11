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
    if (!isAuthenticated()) return navigateTo('/login');
    const id = parseInt(route.split('/')[2]);
    showPage('page-detail');
    loadComplaintDetail(id);
    setActiveLink('sidebar-complaints');
  } else {
    navigateTo('/');
  }
}

function setActiveLink(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function navigateToDetail(id) { navigateTo(`/complaints/${id}`); }

// ─── Setup Navigation Event Listeners ──────────────────────────────
function setupNavigation() {
  document.getElementById('navbar-logo-link').addEventListener('click', e => { e.preventDefault(); navigateTo('/'); });
  document.getElementById('navbar-signin-btn').addEventListener('click', e => { e.preventDefault(); navigateTo('/login'); });
  document.getElementById('navbar-logout-btn').addEventListener('click', e => { e.preventDefault(); logout(); navigateTo('/'); });

  document.getElementById('landing-report-btn').addEventListener('click', e => { e.preventDefault(); navigateTo(isAuthenticated() ? '/submit' : '/login'); });
  document.getElementById('landing-register-btn').addEventListener('click', e => { e.preventDefault(); navigateTo('/register'); });
  document.getElementById('landing-cta-btn').addEventListener('click',  e => { e.preventDefault(); navigateTo('/register'); });

  document.getElementById('dashboard-new-complaint').addEventListener('click', e => { e.preventDefault(); navigateTo('/submit'); });
  document.getElementById('dashboard-view-all').addEventListener('click', e => { e.preventDefault(); navigateTo('/complaints'); });

  document.getElementById('sidebar-dashboard').addEventListener('click',  e => { e.preventDefault(); navigateTo('/dashboard'); });
  document.getElementById('sidebar-submit').addEventListener('click',     e => { e.preventDefault(); navigateTo('/submit'); });
  document.getElementById('sidebar-complaints').addEventListener('click', e => { e.preventDefault(); navigateTo('/complaints'); });
  document.getElementById('sidebar-staff').addEventListener('click',      e => { e.preventDefault(); navigateTo('/staff'); });

  document.getElementById('detail-back-btn').addEventListener('click',   e => { e.preventDefault(); navigateTo('/complaints'); });
  document.getElementById('submit-cancel').addEventListener('click',     e => { e.preventDefault(); navigateTo('/complaints'); });
  document.getElementById('register-back-btn').addEventListener('click', e => { e.preventDefault(); navigateTo('/login'); });

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

  if (user) {
    badge.classList.remove('hidden');
    document.getElementById('navbar-user-name').textContent = user.name;
    document.getElementById('navbar-user-role').textContent = user.role;
    document.getElementById('navbar-user-avatar').textContent = user.name.charAt(0).toUpperCase();
    logout.classList.remove('hidden');
    signIn.classList.add('hidden');
    notifEl.classList.remove('hidden');

    document.getElementById('sidebar-dashboard').classList.remove('hidden');
    document.getElementById('sidebar-submit').classList.toggle('hidden', user.role !== 'user');
    document.getElementById('sidebar-staff').classList.toggle('hidden', user.role !== 'admin');
    document.getElementById('dashboard-new-complaint').classList.toggle('hidden', user.role !== 'user');
    document.getElementById('complaint-staff-search').classList.toggle('hidden', user.role !== 'admin');

    loadNotifications();
  } else {
    badge.classList.add('hidden');
    logout.classList.add('hidden');
    notifEl.classList.add('hidden');
    signIn.classList.remove('hidden');
    document.getElementById('sidebar-dashboard').classList.add('hidden');
    document.getElementById('sidebar-submit').classList.add('hidden');
    document.getElementById('sidebar-staff').classList.add('hidden');
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
  navigateTo('/');
});
