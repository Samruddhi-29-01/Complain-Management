require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const helmet  = require("helmet");
const path    = require("path");
const bcrypt  = require("bcryptjs");
const jwt     = require("jsonwebtoken");
const { DatabaseSync } = require("node:sqlite");

const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "resolveit-secret-key-2024";
const DB_PATH    = process.env.DB_PATH || path.join(__dirname, "resolveit.db");
const db         = new DatabaseSync(DB_PATH);
// ─────────────────────────────────────────────
//  DATABASE SETUP
// ─────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT    NOT NULL,
    email          TEXT    UNIQUE NOT NULL,
    password       TEXT    NOT NULL,
    role           TEXT    DEFAULT 'user',
    phone          TEXT,
    department     TEXT,
    employee_id    TEXT,
    account_status TEXT    DEFAULT 'active',
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    department TEXT
  );

  CREATE TABLE IF NOT EXISTS complaints (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL,
    category_id      INTEGER NOT NULL,
    title            TEXT    NOT NULL,
    description      TEXT    NOT NULL,
    image_url        TEXT,
    location         TEXT,
    priority         TEXT    DEFAULT 'medium',
    status           TEXT    DEFAULT 'pending',
    staff_id         INTEGER,
    resolution_notes TEXT,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id)     REFERENCES users(id),
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (staff_id)    REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    complaint_id INTEGER NOT NULL,
    user_id      INTEGER NOT NULL,
    comment      TEXT    NOT NULL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (complaint_id) REFERENCES complaints(id),
    FOREIGN KEY (user_id)      REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS complaint_history (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    complaint_id INTEGER NOT NULL,
    user_id      INTEGER NOT NULL,
    action       TEXT    NOT NULL,
    details      TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (complaint_id) REFERENCES complaints(id),
    FOREIGN KEY (user_id)      REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    complaint_id INTEGER,
    message      TEXT    NOT NULL,
    is_read      INTEGER DEFAULT 0,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id)      REFERENCES users(id)
  );
`);

// Safe migrations for existing databases
[
  "ALTER TABLE complaints ADD COLUMN priority TEXT DEFAULT 'medium'",
  "ALTER TABLE complaints ADD COLUMN location TEXT",
  "ALTER TABLE users ADD COLUMN phone TEXT",
  "ALTER TABLE users ADD COLUMN department TEXT",
  "ALTER TABLE users ADD COLUMN employee_id TEXT",
  "ALTER TABLE users ADD COLUMN account_status TEXT DEFAULT 'active'",
  "ALTER TABLE categories ADD COLUMN department TEXT",
].forEach(sql => { try { db.exec(sql); } catch {} });

// Seed categories
const catCount = db.prepare("SELECT COUNT(*) AS c FROM categories").get();
if (catCount.c === 0) {
  const ins = db.prepare("INSERT INTO categories (name, department) VALUES (?, ?)");
  [
    ["Electricity & Power",        "Public Works"],
    ["Water Supply",               "Water Department"],
    ["Roads & Infrastructure",     "Public Works"],
    ["Internet / Telecom",         "Telecom Authority"],
    ["Sanitation & Waste",         "Sanitation Dept"],
    ["Public Safety",              "Police & Safety"],
    ["Healthcare",                 "Health Dept"],
    ["Education",                  "Education Dept"],
    ["Other",                      "General"],
  ].forEach(([name, dept]) => ins.run(name, dept));
}

// Seed admin user (password: admin123)
if (!db.prepare("SELECT id FROM users WHERE email = ?").get("admin@resolveit.com")) {
  db.prepare("INSERT INTO users (name, email, password, role, account_status) VALUES (?, ?, ?, ?, ?)")
    .run("System Admin", "admin@resolveit.com", bcrypt.hashSync("admin123", 10), "admin", "active");
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function addHistory(complaint_id, user_id, action, details = null) {
  try {
    db.prepare("INSERT INTO complaint_history (complaint_id, user_id, action, details) VALUES (?, ?, ?, ?)")
      .run(complaint_id, user_id, action, details);
  } catch {}
}

function addNotification(user_id, complaint_id, message) {
  try {
    db.prepare("INSERT INTO notifications (user_id, complaint_id, message) VALUES (?, ?, ?)")
      .run(user_id, complaint_id, message);
  } catch {}
}

// ─────────────────────────────────────────────
//  EXPRESS APP
// ─────────────────────────────────────────────
const app = express();
app.use(helmet({
  contentSecurityPolicy: false, // Disabling CSP so we don't block our own inline scripts/styles unless configured properly
  crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// ─────────────────────────────────────────────
//  AUTH MIDDLEWARE
// ─────────────────────────────────────────────
function authenticate(req, res, next) {
  const token = (req.headers.authorization || "").split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    // Check if account is still active
    const u = db.prepare("SELECT account_status FROM users WHERE id = ?").get(req.user.id);
    if (!u || u.account_status === "suspended")
      return res.status(403).json({ error: "Account suspended" });
    if (u.account_status === "pending")
      return res.status(403).json({ error: "Account pending approval" });
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Forbidden – Admins only" });
  next();
}

// ─────────────────────────────────────────────
//  AUTH — CITIZEN REGISTRATION
// ─────────────────────────────────────────────
app.post("/api/auth/register", (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: "Name, email and password are required" });
  try {
    const result = db
      .prepare("INSERT INTO users (name, email, password, role, phone, account_status) VALUES (?, ?, ?, 'user', ?, 'active')")
      .run(name, email, bcrypt.hashSync(password, 10), phone || null);
    const user  = { id: Number(result.lastInsertRowid), name, email, role: "user", phone };
    const token = jwt.sign(user, JWT_SECRET);
    res.json({ token, user });
  } catch {
    res.status(400).json({ error: "Email already registered" });
  }
});

// ─────────────────────────────────────────────
//  AUTH — AUTHORITY / STAFF REGISTRATION
// ─────────────────────────────────────────────
app.post("/api/auth/register-staff", (req, res) => {
  const { name, email, password, phone, department, employee_id } = req.body;
  if (!name || !email || !password || !department)
    return res.status(400).json({ error: "Name, email, password and department are required" });
  try {
    db.prepare("INSERT INTO users (name, email, password, role, phone, department, employee_id, account_status) VALUES (?, ?, ?, 'staff', ?, ?, ?, 'pending')")
      .run(name, email, bcrypt.hashSync(password, 10), phone || null, department, employee_id || null);
    res.json({ message: "Registration submitted. Awaiting admin approval." });
  } catch {
    res.status(400).json({ error: "Email already registered" });
  }
});

// ─────────────────────────────────────────────
//  AUTH — LOGIN
// ─────────────────────────────────────────────
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: "Invalid email or password" });
  if (user.account_status === "pending")
    return res.status(403).json({ error: "Your account is pending admin approval. Please wait." });
  if (user.account_status === "suspended")
    return res.status(403).json({ error: "Your account has been suspended. Contact admin." });
  const payload = { id: user.id, name: user.name, email: user.email, role: user.role, department: user.department };
  const token   = jwt.sign(payload, JWT_SECRET);
  res.json({ token, user: payload });
});

// ─────────────────────────────────────────────
//  PROFILE
// ─────────────────────────────────────────────
app.get("/api/profile", authenticate, (req, res) => {
  const user = db.prepare("SELECT id, name, email, role, phone, department, employee_id, account_status, created_at FROM users WHERE id = ?")
    .get(req.user.id);
  res.json(user);
});

// ─────────────────────────────────────────────
//  CATEGORIES
// ─────────────────────────────────────────────
app.get("/api/categories", (_req, res) => {
  res.json(db.prepare("SELECT * FROM categories ORDER BY name").all());
});

// ─────────────────────────────────────────────
//  COMPLAINTS
// ─────────────────────────────────────────────
app.get("/api/complaints", authenticate, (req, res) => {
  const { status, priority, staff_name, category_id } = req.query;

  let q = `
    SELECT c.*, cat.name AS category_name, cat.department AS department,
           u.name AS user_name, s.name AS staff_name
    FROM complaints c
    JOIN  categories cat ON c.category_id = cat.id
    JOIN  users      u   ON c.user_id     = u.id
    LEFT JOIN users  s   ON c.staff_id    = s.id
    WHERE 1=1
  `;
  const params = [];

  if (req.user.role === "user")  { q += " AND c.user_id = ?";  params.push(req.user.id); }
  if (req.user.role === "staff") { q += " AND c.staff_id = ?"; params.push(req.user.id); }
  if (status)      { q += " AND c.status = ?";        params.push(status); }
  if (priority)    { q += " AND c.priority = ?";      params.push(priority); }
  if (staff_name)  { q += " AND s.name LIKE ?";       params.push(`%${staff_name}%`); }
  if (category_id) { q += " AND c.category_id = ?";   params.push(Number(category_id)); }

  q += " ORDER BY CASE c.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, c.created_at DESC";
  res.json(db.prepare(q).all(...params));
});

app.post("/api/complaints", authenticate, (req, res) => {
  const { category_id, title, description, image_url, location, priority = "medium" } = req.body;
  if (!category_id || !title || !description)
    return res.status(400).json({ error: "Category, title and description are required" });
  const result = db
    .prepare("INSERT INTO complaints (user_id, category_id, title, description, image_url, location, priority) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(req.user.id, Number(category_id), title, description, image_url || null, location || null, priority);
  const id = Number(result.lastInsertRowid);
  addHistory(id, req.user.id, "Complaint submitted", `Priority: ${priority}`);
  res.json({ id });
});

app.get("/api/complaints/:id", authenticate, (req, res) => {
  const row = db.prepare(`
    SELECT c.*, cat.name AS category_name, cat.department AS department,
           u.name AS user_name, s.name AS staff_name
    FROM complaints c
    JOIN  categories cat ON c.category_id = cat.id
    JOIN  users      u   ON c.user_id     = u.id
    LEFT JOIN users  s   ON c.staff_id    = s.id
    WHERE c.id = ?
  `).get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: "Complaint not found" });
  res.json(row);
});

app.patch("/api/complaints/:id", authenticate, (req, res) => {
  const { status, staff_id, resolution_notes, priority } = req.body;
  const id = Number(req.params.id);
  const current = db.prepare("SELECT * FROM complaints WHERE id = ?").get(id);
  if (!current) return res.status(404).json({ error: "Complaint not found" });

  const sets = [], params = [];
  if (status !== undefined) {
    sets.push("status = ?"); params.push(status);
    if (status !== current.status) {
      addHistory(id, req.user.id, "Status changed", `${current.status} → ${status}`);
      // Notify complaint owner
      addNotification(current.user_id, id, `Your complaint "${current.title}" status changed to ${status}.`);
    }
  }
  if (staff_id !== undefined) {
    sets.push("staff_id = ?"); params.push(staff_id || null);
    if (staff_id) {
      const staff = db.prepare("SELECT name FROM users WHERE id = ?").get(Number(staff_id));
      addHistory(id, req.user.id, "Staff assigned", staff ? staff.name : "Unassigned");
      addNotification(Number(staff_id), id, `You have been assigned to complaint: "${current.title}".`);
    } else {
      addHistory(id, req.user.id, "Staff unassigned", null);
    }
  }
  if (priority !== undefined) {
    sets.push("priority = ?"); params.push(priority);
    if (priority !== current.priority)
      addHistory(id, req.user.id, "Priority changed", `${current.priority} → ${priority}`);
  }
  if (resolution_notes !== undefined) {
    sets.push("resolution_notes = ?"); params.push(resolution_notes);
    if (resolution_notes && resolution_notes !== current.resolution_notes)
      addHistory(id, req.user.id, "Resolution notes updated", null);
  }
  if (sets.length === 0) return res.json({ success: true });
  sets.push("updated_at = CURRENT_TIMESTAMP");
  params.push(id);
  db.prepare(`UPDATE complaints SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  res.json({ success: true });
});

// ─────────────────────────────────────────────
//  COMPLAINT HISTORY
// ─────────────────────────────────────────────
app.get("/api/complaints/:id/history", authenticate, (req, res) => {
  const rows = db.prepare(`
    SELECT h.*, u.name AS user_name, u.role AS user_role
    FROM complaint_history h
    JOIN users u ON h.user_id = u.id
    WHERE h.complaint_id = ?
    ORDER BY h.created_at ASC
  `).all(Number(req.params.id));
  res.json(rows);
});

// ─────────────────────────────────────────────
//  COMMENTS
// ─────────────────────────────────────────────
app.get("/api/complaints/:id/comments", authenticate, (req, res) => {
  res.json(db.prepare(`
    SELECT c.*, u.name AS user_name, u.role AS user_role
    FROM comments c JOIN users u ON c.user_id = u.id
    WHERE c.complaint_id = ?
    ORDER BY c.created_at ASC
  `).all(Number(req.params.id)));
});

app.post("/api/complaints/:id/comments", authenticate, (req, res) => {
  const { comment } = req.body;
  if (!comment) return res.status(400).json({ error: "Comment cannot be empty" });
  const cid = Number(req.params.id);
  const comp = db.prepare("SELECT user_id, title FROM complaints WHERE id = ?").get(cid);
  const result = db.prepare("INSERT INTO comments (complaint_id, user_id, comment) VALUES (?, ?, ?)")
    .run(cid, req.user.id, comment);
  addHistory(cid, req.user.id, "Comment added", comment.substring(0, 80));
  if (comp && comp.user_id !== req.user.id)
    addNotification(comp.user_id, cid, `New comment on your complaint "${comp.title}".`);
  res.json({ id: Number(result.lastInsertRowid) });
});

// ─────────────────────────────────────────────
//  NOTIFICATIONS
// ─────────────────────────────────────────────
app.get("/api/notifications", authenticate, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM notifications WHERE user_id = ?
    ORDER BY created_at DESC LIMIT 20
  `).all(req.user.id);
  res.json(rows);
});

app.patch("/api/notifications/read-all", authenticate, (req, res) => {
  db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?").run(req.user.id);
  res.json({ success: true });
});

// ─────────────────────────────────────────────
//  STAFF MANAGEMENT  (admin only)
// ─────────────────────────────────────────────
app.get("/api/staff", authenticate, requireAdmin, (_req, res) => {
  res.json(db.prepare(`
    SELECT id, name, email, phone, department, employee_id, account_status, created_at
    FROM users WHERE role = 'staff' ORDER BY account_status, name
  `).all());
});

app.get("/api/staff/pending", authenticate, requireAdmin, (_req, res) => {
  res.json(db.prepare(`
    SELECT id, name, email, phone, department, employee_id, created_at
    FROM users WHERE role = 'staff' AND account_status = 'pending'
    ORDER BY created_at ASC
  `).all());
});

app.patch("/api/staff/:id/approve", authenticate, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  db.prepare("UPDATE users SET account_status = 'active' WHERE id = ? AND role = 'staff'").run(id);
  addNotification(id, null, "Your account has been approved! You can now log in.");
  res.json({ success: true });
});

app.patch("/api/staff/:id/reject", authenticate, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  db.prepare("UPDATE users SET account_status = 'suspended' WHERE id = ? AND role = 'staff'").run(id);
  res.json({ success: true });
});

app.patch("/api/staff/:id/toggle", authenticate, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare("SELECT account_status FROM users WHERE id = ? AND role = 'staff'").get(id);
  if (!u) return res.status(404).json({ error: "Staff not found" });
  const newStatus = u.account_status === "active" ? "suspended" : "active";
  db.prepare("UPDATE users SET account_status = ? WHERE id = ?").run(newStatus, id);
  res.json({ success: true, account_status: newStatus });
});

// ─────────────────────────────────────────────
//  ANALYTICS  (admin only)
// ─────────────────────────────────────────────
app.get("/api/analytics", authenticate, requireAdmin, (_req, res) => {
  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'pending'     THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'in-progress' THEN 1 ELSE 0 END) AS in_progress,
      SUM(CASE WHEN status = 'resolved'    THEN 1 ELSE 0 END) AS resolved,
      SUM(CASE WHEN status = 'closed'      THEN 1 ELSE 0 END) AS closed,
      SUM(CASE WHEN priority = 'critical'  THEN 1 ELSE 0 END) AS critical,
      SUM(CASE WHEN priority = 'high'      THEN 1 ELSE 0 END) AS high_priority
    FROM complaints
  `).get();

  const categoryStats = db.prepare(`
    SELECT cat.name, cat.department, COUNT(c.id) AS count
    FROM categories cat
    LEFT JOIN complaints c ON cat.id = c.category_id
    GROUP BY cat.id ORDER BY count DESC
  `).all();

  const staffStats = db.prepare(`
    SELECT u.name, COUNT(c.id) AS assigned,
           SUM(CASE WHEN c.status = 'resolved' THEN 1 ELSE 0 END) AS resolved
    FROM users u
    LEFT JOIN complaints c ON c.staff_id = u.id
    WHERE u.role = 'staff' AND u.account_status = 'active'
    GROUP BY u.id ORDER BY assigned DESC LIMIT 10
  `).all();

  const pendingStaff = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'staff' AND account_status = 'pending'").get();

  res.json({ stats, categoryStats, staffStats, pendingStaffCount: pendingStaff.c });
});

// ─────────────────────────────────────────────
//  FALLBACK → index.html
// ─────────────────────────────────────────────
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ─────────────────────────────────────────────
//  GLOBAL ERROR HANDLER
// ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("[Error]", err);
  res.status(500).json({ error: "Internal Server Error" });
});

// ─────────────────────────────────────────────
//  START SERVER
// ─────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║        ResolveIt — Complaint Management App          ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  🌐  Open : http://localhost:${PORT}                    ║
║                                                      ║
║  👤  Admin : admin@resolveit.com  /  admin123        ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
  `);
});

// ─────────────────────────────────────────────
//  GRACEFUL SHUTDOWN
// ─────────────────────────────────────────────
function gracefulShutdown() {
  console.log("\\n[Server] Shutting down gracefully...");
  server.close(() => {
    console.log("[Server] Closed out remaining connections.");
    try {
      db.close();
      console.log("[Server] Database connection closed.");
    } catch (err) {
      console.error("[Server] Error closing database:", err);
    }
    process.exit(0);
  });
  
  setTimeout(() => {
    console.error("[Server] Forced shutdown after timeout.");
    process.exit(1);
  }, 10000);
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
