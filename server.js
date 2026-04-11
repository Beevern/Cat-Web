const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = 3000;

// ── Uploads folder ────────────────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// ── JSON "database" ───────────────────────────────────────────────────────────
const dbPath = path.join(__dirname, 'encounters.json');

function readEncounters() {
  if (!fs.existsSync(dbPath)) return [];
  try { return JSON.parse(fs.readFileSync(dbPath, 'utf8')); }
  catch { return []; }
}

function writeEncounters(encounters) {
  fs.writeFileSync(dbPath, JSON.stringify(encounters, null, 2));
}

// ── Multer (file upload) ──────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

// ── Lost status ───────────────────────────────────────────────────────────────
const statusPath = path.join(__dirname, 'status.json');
const PASSWORD   = 'miao';

function readStatus() {
  if (!fs.existsSync(statusPath)) return { lost: false, lastSeen: '', lastPlace: '' };
  try { return JSON.parse(fs.readFileSync(statusPath, 'utf8')); }
  catch { return { lost: false, lastSeen: '', lastPlace: '' }; }
}

function writeStatus(s) {
  fs.writeFileSync(statusPath, JSON.stringify(s, null, 2));
}

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadsDir));

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/encounters — newest first
app.get('/api/encounters', (_req, res) => {
  res.json(readEncounters());
});

// POST /api/encounters — save new encounter
app.post('/api/encounters', upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'A photo is required.' });
  }

  const encounter = {
    id:         Date.now(),
    name:       (req.body.name    || '').trim() || 'Anonymous',
    caption:    (req.body.caption || '').trim(),
    filename:   req.file.filename,
    created_at: new Date().toISOString()
  };

  const encounters = readEncounters();
  encounters.unshift(encounter);
  writeEncounters(encounters);

  res.status(201).json(encounter);
});

// DELETE /api/encounters/:id — admin delete (password via query param)
app.delete('/api/encounters/:id', (req, res) => {
  if (req.query.pw !== PASSWORD) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }
  const id = Number(req.params.id);
  const encounters = readEncounters();
  const target = encounters.find(e => e.id === id);
  if (!target) return res.status(404).json({ error: 'Encounter not found.' });

  // Delete the image file too
  const filePath = path.join(uploadsDir, target.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  writeEncounters(encounters.filter(e => e.id !== id));
  res.json({ ok: true });
});

// GET /api/status — current lost status (public)
app.get('/api/status', (_req, res) => {
  res.json(readStatus());
});

// POST /api/status — set lost or found (password required)
app.post('/api/status', (req, res) => {
  const { password, lost, lastSeen, lastPlace } = req.body;
  if (password !== PASSWORD) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }
  const status = {
    lost:      !!lost,
    lastSeen:  (lastSeen  || '').trim(),
    lastPlace: (lastPlace || '').trim(),
    updatedAt: new Date().toISOString()
  };
  writeStatus(status);
  res.json(status);
});

// ── Global error handler — always returns JSON, never HTML ───────────────────
app.use((err, _req, res, _next) => {
  console.error(err.message);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Miao's site is running → http://localhost:${PORT}`);
});
