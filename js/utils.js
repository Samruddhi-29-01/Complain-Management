// ─── Toast ──────────────────────────────────────────────────────────
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icon = type === 'success'
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
  el.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-message">${message}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0'; el.style.transform = 'translateX(100px)';
    el.style.transition = 'all 0.3s ease';
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

// ─── Modal ──────────────────────────────────────────────────────────
function showModal(title, message, onConfirm, onCancel) {
  const modal = document.getElementById('modal-overlay');
  document.getElementById('modal-title').textContent   = title;
  document.getElementById('modal-message').textContent = message;
  document.getElementById('modal-confirm').onclick = () => { modal.classList.remove('active'); if (onConfirm) onConfirm(); };
  document.getElementById('modal-cancel').onclick  = () => { modal.classList.remove('active'); if (onCancel) onCancel(); };
  modal.onclick = e => { if (e.target === modal) { modal.classList.remove('active'); if (onCancel) onCancel(); } };
  modal.classList.add('active');
}

// ─── Date Helpers ────────────────────────────────────────────────────
function formatDate(s) {
  return new Date(s).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}
function formatDateTime(s) {
  const d = new Date(s);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}
function formatTimeAgo(s) {
  const diff = Date.now() - new Date(s).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m/60)}h ago`;
  return `${Math.floor(m/1440)}d ago`;
}

// ─── Status & Priority Badges ────────────────────────────────────────
function getStatusBadgeClass(status) { return `status-badge status-${status}`; }
function getStatusBadgeHtml(status) {
  const labels = { pending: 'Pending', 'in-progress': 'In Progress', resolved: 'Resolved', closed: 'Closed' };
  return `<span class="${getStatusBadgeClass(status)}">${labels[status] || status}</span>`;
}

function getPriorityBadgeHtml(priority) {
  return `<span class="priority-badge priority-${priority}">${priority}</span>`;
}

// ─── Page Helpers ────────────────────────────────────────────────────
function hideAllPages() {
  document.querySelectorAll('[id^="page-"]').forEach(p => p.classList.remove('page-active'));
}
function showPage(id) {
  hideAllPages();
  const p = document.getElementById(id);
  if (p) { p.classList.add('page-active'); window.scrollTo({ top: 0 }); }
}
function isAuthenticated() { return !!localStorage.getItem('token') && !!localStorage.getItem('user'); }
function getCurrentUser()  { const u = localStorage.getItem('user'); return u ? JSON.parse(u) : null; }
function setCurrentUser(u) { localStorage.setItem('user', JSON.stringify(u)); }
function logout()          { localStorage.removeItem('token'); localStorage.removeItem('user'); api.clearToken(); }

// ─── Complaint Row ───────────────────────────────────────────────────
function createComplaintRow(c) {
  return `
    <tr onclick="navigateToDetail(${c.id})">
      <td style="color:var(--neutral-400);font-size:0.8rem;font-weight:600;">#${c.id}</td>
      <td>
        <div style="font-weight:600;color:var(--neutral-900);font-size:0.875rem;margin-bottom:0.15rem;">${c.title}</div>
        <div style="font-size:0.775rem;color:var(--neutral-400);max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.description}</div>
      </td>
      <td><span class="category-pill">${c.category_name || '—'}</span></td>
      <td>${getPriorityBadgeHtml(c.priority || 'medium')}</td>
      <td>${getStatusBadgeHtml(c.status)}</td>
      <td style="font-size:0.8rem;color:var(--neutral-500);">${c.staff_name || '<span style="color:var(--neutral-300)">Unassigned</span>'}</td>
      <td style="font-size:0.775rem;color:var(--neutral-400);white-space:nowrap;">${formatDate(c.created_at)}</td>
    </tr>`;
}

// ─── Comment HTML ────────────────────────────────────────────────────
function createCommentHtml(c) {
  const roleColors = { admin: 'var(--brand-primary)', staff: 'var(--color-warning)', user: 'var(--neutral-400)' };
  const roleBg     = { admin: 'rgba(79,70,229,0.1)', staff: 'rgba(217,119,6,0.1)', user: 'var(--neutral-100)' };
  const roleLabel  = { admin: 'Admin', staff: 'Staff', user: 'Citizen' };
  const color = roleColors[c.user_role] || roleColors.user;
  const bg    = roleBg[c.user_role]    || roleBg.user;
  const label = roleLabel[c.user_role] || 'User';
  return `
    <div class="comment" id="comment-${c.id}">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.4rem;margin-bottom:0.5rem;">
        <div style="display:flex;align-items:center;gap:0.5rem;">
          <div style="width:1.6rem;height:1.6rem;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;flex-shrink:0;">${c.user_name.charAt(0).toUpperCase()}</div>
          <span class="comment-author">${c.user_name}</span>
          <span style="font-size:0.65rem;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;color:${color};background:${bg};padding:0.1rem 0.45rem;border-radius:9999px;">${label}</span>
        </div>
        <span class="comment-time">${formatTimeAgo(c.created_at)}</span>
      </div>
      <p class="comment-text">${c.comment}</p>
    </div>`;
}

// ─── Timeline Item ───────────────────────────────────────────────────
function createTimelineItem(h) {
  const icons = {
    'Complaint submitted': `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
    'Status changed':      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
    'Staff assigned':      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`,
    'Priority changed':    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>`,
    'Comment added':       `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  };
  const icon = icons[h.action] || icons['Status changed'];
  return `
    <div class="timeline-item">
      <div class="timeline-dot">${icon}</div>
      <div class="timeline-content">
        <div class="timeline-action">${h.action}${h.details ? ` <span class="timeline-detail">${h.details}</span>` : ''}</div>
        <div class="timeline-meta">${h.user_name} · ${formatTimeAgo(h.created_at)}</div>
      </div>
    </div>`;
}

// ─── Complaint Card (dashboard quick) ────────────────────────────────
function createDashboardRow(c) {
  return `
    <tr onclick="navigateToDetail(${c.id})">
      <td>
        <div style="font-weight:600;color:var(--neutral-900);font-size:0.875rem;">${c.title}</div>
        <div style="font-size:0.775rem;color:var(--neutral-400);">${c.category_name}</div>
      </td>
      <td>${getPriorityBadgeHtml(c.priority || 'medium')}</td>
      <td>${getStatusBadgeHtml(c.status)}</td>
      <td style="font-size:0.775rem;color:var(--neutral-400);white-space:nowrap;">${formatDate(c.created_at)}</td>
    </tr>`;
}

// ─── Bar Chart Renderer ──────────────────────────────────────────────
function renderBarChart(containerId, data) {
  const container = document.getElementById(containerId);
  if (!container || !data.length) return;
  const max = Math.max(...data.map(d => d.count), 1);
  container.innerHTML = `
    <div class="bar-chart-inner">
      ${data.map((d, i) => `
        <div class="bar-item">
          <div class="bar-labels">
            <span class="bar-count">${d.count}</span>
          </div>
          <div class="bar-fill" style="height:${Math.max((d.count/max)*140, d.count > 0 ? 6 : 2)}px;animation-delay:${i*60}ms"></div>
          <div class="bar-name">${d.name.split(' ')[0]}</div>
        </div>`).join('')}
    </div>`;
}

// ─── Debounce ────────────────────────────────────────────────────────
function debounce(fn, wait) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}
