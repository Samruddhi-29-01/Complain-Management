// ─── LOGIN PAGE ─────────────────────────────────────────────────────
function setupLoginPage() {
  const form    = document.getElementById('login-form');
  const errEl   = document.getElementById('login-error');
  const toggleEl= document.getElementById('login-toggle');

  errEl.classList.add('hidden');

  const newForm = form.cloneNode(true);
  form.parentNode.replaceChild(newForm, form);

  newForm.addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn      = document.getElementById('login-submit-btn');
    btn.textContent = 'Signing in…'; btn.disabled = true;
    errEl.classList.add('hidden');
    try {
      const data = await api.login(email, password);
      setCurrentUser(data.user);
      
      const role = data.user.role;
      if (role === 'admin') window.location.href = '/admin.html';
      else if (role === 'staff') window.location.href = '/staff.html';
      else window.location.href = '/citizen.html';
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    } finally {
      btn.textContent = 'Sign In'; btn.disabled = false;
    }
  });

  toggleEl.addEventListener('click', () => navigateTo('/register'));
}

// ─── REGISTER PAGE ───────────────────────────────────────────────────
function setupRegisterPage() {
  // Role card selection
  document.getElementById('role-card-citizen').addEventListener('click', () => {
    document.getElementById('register-form-citizen').classList.remove('hidden');
    document.getElementById('register-form-authority').classList.add('hidden');
    document.getElementById('role-card-citizen').classList.add('role-card-selected');
    document.getElementById('role-card-authority').classList.remove('role-card-selected');
    document.getElementById('register-form-citizen').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  document.getElementById('role-card-authority').addEventListener('click', () => {
    document.getElementById('register-form-authority').classList.remove('hidden');
    document.getElementById('register-form-citizen').classList.add('hidden');
    document.getElementById('role-card-authority').classList.add('role-card-selected');
    document.getElementById('role-card-citizen').classList.remove('role-card-selected');
    document.getElementById('register-form-authority').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  // Citizen registration
  document.getElementById('citizen-form').addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = document.getElementById('register-citizen-error');
    const name  = document.getElementById('citizen-name').value.trim();
    const phone = document.getElementById('citizen-phone').value.trim();
    const email = document.getElementById('citizen-email').value.trim();
    const pass  = document.getElementById('citizen-password').value;
    const conf  = document.getElementById('citizen-confirm').value;
    const btn   = e.target.querySelector('[type=submit]');

    errEl.classList.add('hidden');
    if (pass !== conf) { errEl.textContent = 'Passwords do not match.'; errEl.classList.remove('hidden'); return; }
    if (pass.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.classList.remove('hidden'); return; }

    btn.textContent = 'Creating account…'; btn.disabled = true;
    try {
      const data = await api.register(name, email, pass, 'user', phone);
      setCurrentUser(data.user);
      updateNavbar();
      showToast(`Welcome to ResolveIt, ${data.user.name}! 🎉`, 'success');
      setTimeout(() => window.location.href = '/citizen.html', 1000);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    } finally {
      btn.textContent = 'Create Citizen Account'; btn.disabled = false;
    }
  });

  // Authority registration
  document.getElementById('authority-form').addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = document.getElementById('register-authority-error');
    const name  = document.getElementById('authority-name').value.trim();
    const phone = document.getElementById('authority-phone').value.trim();
    const email = document.getElementById('authority-email').value.trim();
    const dept  = document.getElementById('authority-department').value;
    const empId = document.getElementById('authority-employee-id').value.trim();
    const pass  = document.getElementById('authority-password').value;
    const conf  = document.getElementById('authority-confirm').value;
    const btn   = e.target.querySelector('[type=submit]');

    errEl.classList.add('hidden');
    if (pass !== conf) { errEl.textContent = 'Passwords do not match.'; errEl.classList.remove('hidden'); return; }
    if (pass.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.classList.remove('hidden'); return; }

    btn.textContent = 'Submitting…'; btn.disabled = true;
    try {
      await api.registerStaff(name, email, pass, phone, dept, empId);
      showToast('Registration submitted! Await admin approval.', 'success');
      navigateTo('/login');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    } finally {
      btn.textContent = 'Submit for Approval'; btn.disabled = false;
    }
  });
}

// ─── DASHBOARD ───────────────────────────────────────────────────────
async function loadDashboard() {
  const user = getCurrentUser();
  document.getElementById('dashboard-welcome').textContent = `Welcome back, ${user?.name || 'User'}`;

  if (user?.role === 'admin') {
    try {
      const { stats, categoryStats, staffStats, pendingStaffCount } = await api.get('/analytics');
      document.getElementById('dashboard-stats').classList.remove('hidden');
      document.getElementById('dashboard-charts').classList.remove('hidden');
      document.getElementById('stat-total').textContent    = stats.total    || 0;
      document.getElementById('stat-pending').textContent  = stats.pending  || 0;
      document.getElementById('stat-progress').textContent = stats.in_progress || 0;
      document.getElementById('stat-resolved').textContent = stats.resolved  || 0;

      if (stats.critical > 0) {
        document.getElementById('stat-critical').textContent = stats.critical;
        document.getElementById('stat-card-critical').classList.remove('hidden');
      }

      renderBarChart('category-chart', categoryStats.filter(d => d.count > 0));

      if (pendingStaffCount > 0) {
        showToast(`⚠ ${pendingStaffCount} staff registration(s) pending approval.`, 'error');
      }
    } catch {}
  }

  // Recent complaints
  try {
    const complaints = await api.get('/complaints');
    const tbody = document.getElementById('dashboard-complaints-body');
    tbody.innerHTML = complaints.slice(0, 8).map(createDashboardRow).join('') ||
      '<tr><td colspan="4" style="text-align:center;color:var(--neutral-400);padding:2rem;">No complaints yet.</td></tr>';
  } catch {}
}

// ─── COMPLAINTS LIST ─────────────────────────────────────────────────
let sortField = 'created_at', sortDir = -1;

async function loadComplaints() {
  try {
    const complaints = await api.get('/complaints');
    allComplaints = complaints;
    renderComplaintsTable(complaints);
    setupComplaintFilters(complaints);
  } catch (err) {
    showToast('Failed to load complaints: ' + err.message, 'error');
  }
}

function renderComplaintsTable(data) {
  const tbody = document.getElementById('complaints-body');
  const filtered = applyClientFilters(data);
  tbody.innerHTML = filtered.length
    ? filtered.map(createComplaintRow).join('')
    : '<tr><td colspan="7" style="text-align:center;color:var(--neutral-400);padding:2.5rem;">No complaints found.</td></tr>';
}

function applyClientFilters(data) {
  const search   = document.getElementById('complaint-search').value.toLowerCase();
  const status   = document.getElementById('complaint-status-filter').value;
  const priority = document.getElementById('complaint-priority-filter').value;
  const staff    = document.getElementById('complaint-staff-search').value.toLowerCase();

  return data.filter(c => {
    if (search   && !c.title.toLowerCase().includes(search) && !c.description.toLowerCase().includes(search)) return false;
    if (status   && status !== 'all'   && c.status   !== status)   return false;
    if (priority && priority !== 'all' && c.priority !== priority)  return false;
    if (staff    && !(c.staff_name || '').toLowerCase().includes(staff)) return false;
    return true;
  }).sort((a, b) => {
    let va = a[sortField], vb = b[sortField];
    if (typeof va === 'string') va = va.toLowerCase(), vb = vb.toLowerCase();
    return va < vb ? sortDir : va > vb ? -sortDir : 0;
  });
}

function setupComplaintFilters(complaints) {
  const debounced = debounce(() => renderComplaintsTable(allComplaints), 250);
  ['complaint-search', 'complaint-status-filter', 'complaint-priority-filter', 'complaint-staff-search']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.oninput = debounced; el.onchange = debounced; }
    });

  document.querySelectorAll('.sort-link').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const f = a.dataset.sort;
      if (sortField === f) sortDir = -sortDir; else { sortField = f; sortDir = -1; }
      renderComplaintsTable(allComplaints);
    });
  });
}

// ─── SUBMIT COMPLAINT ────────────────────────────────────────────────
async function loadSubmitPage() {
  const catSel = document.getElementById('submit-category');
  catSel.innerHTML = '<option value="">Loading…</option>';
  try {
    const cats = await api.get('/categories');
    catSel.innerHTML = '<option value="">Select a category</option>' +
      cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  } catch {
    catSel.innerHTML = '<option value="">Failed to load</option>';
  }

  const form = document.getElementById('submit-form');
  const newForm = form.cloneNode(true);
  form.parentNode.replaceChild(newForm, form);

  // Re-load cat select since cloneNode copies it blank
  const newCatSel = document.getElementById('submit-category');
  try {
    const cats = await api.get('/categories');
    newCatSel.innerHTML = '<option value="">Select a category</option>' +
      cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  } catch {}

  newForm.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('submit-btn');
    btn.textContent = 'Submitting…'; btn.disabled = true;
    try {
      await api.post('/complaints', {
        category_id:  document.getElementById('submit-category').value,
        priority:     document.getElementById('submit-priority').value,
        title:        document.getElementById('submit-title').value.trim(),
        location:     document.getElementById('submit-location').value.trim(),
        description:  document.getElementById('submit-description').value.trim(),
        image_url:    document.getElementById('submit-image').value.trim() || null,
      });
      showToast('Complaint submitted successfully!', 'success');
      navigateTo('/complaints');
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      btn.textContent = 'Submit Complaint'; btn.disabled = false;
    }
  });
}

// ─── COMPLAINT DETAIL ────────────────────────────────────────────────
async function loadComplaintDetail(id) {
  try {
    const [complaint, comments, history] = await Promise.all([
      api.get(`/complaints/${id}`),
      api.get(`/complaints/${id}/comments`),
      api.get(`/complaints/${id}/history`),
    ]);
    renderDetail(complaint);
    renderComments(comments);
    renderTimeline(history);

    const user = getCurrentUser();
    if (user?.role === 'admin' || user?.role === 'staff') {
      setupManagePanel(complaint);
    }
    setupCommentForm(id);
  } catch (err) {
    showToast('Failed to load complaint: ' + err.message, 'error');
  }
}

function renderDetail(c) {
  document.getElementById('detail-title').textContent   = c.title;
  document.getElementById('detail-status').className    = getStatusBadgeClass(c.status);
  document.getElementById('detail-status').textContent  = c.status;

  const pb = document.getElementById('detail-priority-badge');
  pb.className = `priority-badge priority-${c.priority || 'medium'}`;
  pb.textContent = c.priority || 'medium';

  document.getElementById('detail-meta').textContent =
    `Submitted by ${c.user_name} · ${formatDate(c.created_at)} · Last updated ${formatDate(c.updated_at)}`;

  document.getElementById('detail-category').textContent   = c.category_name || '—';
  document.getElementById('detail-department').textContent = c.department || '—';
  document.getElementById('detail-user').textContent       = c.user_name || '—';
  document.getElementById('detail-staff').textContent      = c.staff_name || 'Unassigned';

  document.getElementById('detail-description').textContent = c.description;

  const img = document.getElementById('detail-image');
  if (c.image_url) { img.src = c.image_url; img.classList.remove('hidden'); }
  else img.classList.add('hidden');

  const locRow = document.getElementById('detail-location-row');
  if (c.location) {
    document.getElementById('detail-location-text').textContent = c.location;
    locRow.style.display = 'flex';
  } else locRow.style.display = 'none';

  const resBox = document.getElementById('detail-resolution-box');
  if (c.resolution_notes) {
    document.getElementById('detail-resolution-text').textContent = c.resolution_notes;
    resBox.classList.remove('hidden');
  } else resBox.classList.add('hidden');
}

function renderComments(comments) {
  const list = document.getElementById('comments-list');
  list.innerHTML = comments.length
    ? comments.map(createCommentHtml).join('')
    : '<p style="color:var(--neutral-400);font-size:0.875rem;padding:1rem 0;">No comments yet. Be the first to comment.</p>';
  document.getElementById('comment-count').textContent = `(${comments.length})`;
}

function renderTimeline(history) {
  const list = document.getElementById('timeline-list');
  list.innerHTML = history.length
    ? history.map(createTimelineItem).join('')
    : '<p style="color:var(--neutral-400);font-size:0.875rem;padding:0.5rem 0;">No history yet.</p>';
}

async function setupManagePanel(complaint) {
  const panel = document.getElementById('detail-manage');
  panel.classList.remove('hidden');

  document.getElementById('detail-status-select').value   = complaint.status   || 'pending';
  document.getElementById('detail-priority-select').value = complaint.priority || 'medium';

  const resNotes = document.getElementById('detail-resolution');
  resNotes.value = complaint.resolution_notes || '';

  const user = getCurrentUser();
  const staffGroup = document.getElementById('detail-staff-group');
  if (user?.role === 'admin') {
    staffGroup.classList.remove('hidden');
    try {
      const staff = await api.get('/staff');
      const sel = document.getElementById('detail-staff-select');
      sel.innerHTML = '<option value="">Unassigned</option>' +
        staff.filter(s => s.account_status === 'active').map(s =>
          `<option value="${s.id}" ${s.id == complaint.staff_id ? 'selected' : ''}>${s.name} – ${s.department || ''}</option>`
        ).join('');
    } catch {}
  }

  const btn = document.getElementById('detail-save-btn');
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);

  newBtn.addEventListener('click', async () => {
    newBtn.textContent = 'Saving…'; newBtn.disabled = true;
    try {
      const payload = {
        status:           document.getElementById('detail-status-select').value,
        priority:         document.getElementById('detail-priority-select').value,
        resolution_notes: document.getElementById('detail-resolution').value.trim(),
      };
      if (user?.role === 'admin')
        payload.staff_id = document.getElementById('detail-staff-select').value || null;
      await api.patch(`/complaints/${complaint.id}`, payload);
      showToast('Complaint updated!', 'success');
      loadComplaintDetail(complaint.id);
    } catch (err) {
      showToast('Update failed: ' + err.message, 'error');
    } finally {
      newBtn.textContent = 'Save Changes'; newBtn.disabled = false;
    }
  });
}

function setupCommentForm(complaintId) {
  const form = document.getElementById('comment-form');
  const newForm = form.cloneNode(true);
  form.parentNode.replaceChild(newForm, form);
  newForm.addEventListener('submit', async e => {
    e.preventDefault();
    const input = document.getElementById('comment-input');
    const text  = input.value.trim();
    if (!text) return;
    try {
      await api.post(`/complaints/${complaintId}/comments`, { comment: text });
      input.value = '';
      const [comments, history] = await Promise.all([
        api.get(`/complaints/${complaintId}/comments`),
        api.get(`/complaints/${complaintId}/history`),
      ]);
      renderComments(comments);
      renderTimeline(history);
    } catch (err) {
      showToast('Failed to post comment: ' + err.message, 'error');
    }
  });
}

// ─── STAFF MANAGEMENT ────────────────────────────────────────────────
async function loadStaffManagement() {
  try {
    const [allStaff, pending] = await Promise.all([
      api.get('/staff'),
      api.get('/staff/pending'),
    ]);

    // Pending approvals
    const pendingSection = document.getElementById('pending-approvals-section');
    if (pending.length > 0) {
      pendingSection.classList.remove('hidden');
      document.getElementById('pending-list').innerHTML = pending.map(s => `
        <div class="staff-approval-card">
          <div class="staff-approval-avatar">${s.name.charAt(0).toUpperCase()}</div>
          <div class="staff-approval-info">
            <div class="staff-approval-name">${s.name}</div>
            <div class="staff-approval-email">${s.email}</div>
            <div class="staff-approval-dept">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
              ${s.department || 'Department not set'}
              ${s.employee_id ? `· ID: ${s.employee_id}` : ''}
            </div>
            <div class="staff-approval-time">Applied ${formatTimeAgo(s.created_at)}</div>
          </div>
          <div class="staff-approval-actions">
            <button class="btn btn-success btn-small" onclick="approveStaff(${s.id})">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              Approve
            </button>
            <button class="btn btn-danger btn-small" onclick="rejectStaff(${s.id})">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              Reject
            </button>
          </div>
        </div>`).join('');
    } else {
      pendingSection.classList.add('hidden');
    }

    // All staff table
    const activeStaff = allStaff.filter(s => s.account_status !== 'pending');
    document.getElementById('staff-body').innerHTML = activeStaff.length
      ? activeStaff.map(s => `
          <tr>
            <td>
              <div style="display:flex;align-items:center;gap:0.75rem;">
                <div class="staff-avatar">${s.name.charAt(0).toUpperCase()}</div>
                <div>
                  <div style="font-weight:600;font-size:0.875rem;color:var(--neutral-900);">${s.name}</div>
                  <div style="font-size:0.775rem;color:var(--neutral-400);">${s.email}</div>
                </div>
              </div>
            </td>
            <td><span class="category-pill">${s.department || '—'}</span></td>
            <td style="font-size:0.8rem;color:var(--neutral-500);">${s.employee_id || '—'}</td>
            <td><span class="account-status-badge status-${s.account_status}">${s.account_status}</span></td>
            <td style="font-size:0.775rem;color:var(--neutral-400);">${formatDate(s.created_at)}</td>
            <td>
              <button class="btn btn-small ${s.account_status === 'active' ? 'btn-danger' : 'btn-success'}"
                      onclick="toggleStaff(${s.id}, this)">
                ${s.account_status === 'active' ? 'Suspend' : 'Activate'}
              </button>
            </td>
          </tr>`).join('')
      : '<tr><td colspan="6" style="text-align:center;color:var(--neutral-400);padding:2.5rem;">No staff members yet.</td></tr>';
  } catch (err) {
    showToast('Failed to load staff: ' + err.message, 'error');
  }
}

async function approveStaff(id) {
  try {
    await api.patch(`/staff/${id}/approve`, {});
    showToast('Staff approved successfully!', 'success');
    loadStaffManagement();
    loadNotifications();
  } catch (err) { showToast(err.message, 'error'); }
}

async function rejectStaff(id) {
  showModal('Reject Application', 'Are you sure you want to reject this staff application?', async () => {
    try {
      await api.patch(`/staff/${id}/reject`, {});
      showToast('Application rejected.', 'success');
      loadStaffManagement();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

async function toggleStaff(id, btn) {
  const action = btn.textContent.trim() === 'Suspend' ? 'suspend' : 'activate';
  showModal(`${action.charAt(0).toUpperCase() + action.slice(1)} Staff`, `Are you sure you want to ${action} this staff member?`, async () => {
    try {
      const res = await api.patch(`/staff/${id}/toggle`, {});
      showToast(`Staff ${res.account_status === 'active' ? 'activated' : 'suspended'}!`, 'success');
      loadStaffManagement();
    } catch (err) { showToast(err.message, 'error'); }
  });
}
