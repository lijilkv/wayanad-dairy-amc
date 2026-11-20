const express = require('express');
const mysql = require('mysql2/promise');
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: process.env.SESSION_SECRET || 'wayanad', resave: false, saveUninitialized: false }));
const pool = mysql.createPool({ host: process.env.DB_HOST || 'db', user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
function requireLogin(req, res, next) { if (!req.session.username) return res.status(401).json({ error: 'Unauthorized' }); next(); }
function requireAdmin(req, res, next) { if (!req.session.username || !req.session.is_admin) return res.status(403).json({ error: 'Admin required' }); next(); }
app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/public/users', async (req, res) => {
  const [rows] = await pool.query('SELECT username, full_name, dept_code, is_admin FROM users ORDER BY is_admin DESC, username ASC');
  res.json(rows);
});
app.post('/api/login', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [req.body.username]);
  if (!rows.length || !(await bcrypt.compare(req.body.password, rows[0].password_hash))) return res.status(401).json({ error: 'Invalid login' });
  req.session.username = rows[0].username; req.session.full_name = rows[0].full_name;
  req.session.dept_code = rows[0].dept_code; req.session.is_admin = Boolean(rows[0].is_admin);
  res.json({ success: true });
});
app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });
app.get('/api/me', requireLogin, (req, res) => res.json({ username: req.session.username, full_name: req.session.full_name, dept_code: req.session.dept_code, is_admin: req.session.is_admin }));
app.get('/api/masters', requireLogin, async (req, res) => {
  const [units] = await pool.query('SELECT * FROM master_units ORDER BY unit_name ASC');
  const [sub_units] = await pool.query('SELECT * FROM master_sub_units ORDER BY sub_unit_name ASC');
  const [products] = await pool.query('SELECT * FROM master_products ORDER BY product_name ASC');
  const [amc_names] = await pool.query('SELECT * FROM master_amc_names ORDER BY amc_name ASC');
  const [vendors] = await pool.query('SELECT * FROM master_vendors ORDER BY vendor_name ASC');
  const [departments] = await pool.query('SELECT dept_code, dept_name FROM departments WHERE dept_code != "ADMIN" ORDER BY dept_code ASC');
  const [users] = await pool.query('SELECT id, username, full_name, dept_code, is_admin FROM users ORDER BY username ASC');
  res.json({ units, sub_units, products, amc_names, vendors, departments, users });
});
app.post('/api/admin/master/:type', requireAdmin, async (req, res) => {
  const t = req.params.type, v = (req.body.value || '').trim();
  const map = {
    unit: ['master_units', 'unit_name'],
    subunit: ['master_sub_units', 'sub_unit_name'],
    product: ['master_products', 'product_name'],
    amcname: ['master_amc_names', 'amc_name'],
    vendor: ['master_vendors', 'vendor_name']
  };
  if (!map[t] || !v) return res.status(400).json({ error: 'Invalid input' });
  try { await pool.query(`INSERT INTO ${map[t][0]} (${map[t][1]}) VALUES (?)`, [v]); res.json({ success: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/admin/departments', requireAdmin, async (req, res) => {
  try { await pool.query('INSERT INTO departments (dept_code, dept_name, password_hash, is_admin) VALUES (?, ?, "", 0)', [req.body.dept_code.toUpperCase().trim(), req.body.dept_name.trim()]); res.json({ success: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/admin/users', requireAdmin, async (req, res) => {
  try { const h = await bcrypt.hash(req.body.password, 10); await pool.query('INSERT INTO users (username, full_name, dept_code, password_hash, is_admin) VALUES (?,?,?,?,?)', [req.body.username.trim(), req.body.full_name.trim(), req.body.dept_code, h, req.body.is_admin ? 1 : 0]); res.json({ success: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
function parseExcelDate(val) {
  if (!val) return null;
  if (typeof val === 'number') {
    const d = xlsx.SSF.parse_date_code(val);
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const dt = new Date(val);
  return isNaN(dt) ? null : dt.toISOString().slice(0, 10);
}
app.get('/api/amc', requireLogin, async (req, res) => {
  const [rows] = await pool.query('SELECT *, DATEDIFF(contract_to, CURDATE()) AS days_remaining FROM amc_assets ORDER BY contract_to ASC');
  res.json(rows);
});
app.post('/api/amc', requireLogin, async (req, res) => {
  const b = req.body;
  try {
    await pool.query('INSERT INTO amc_assets (unit, sub_unit, product, model, serial_number, contract_from, contract_to, total, amc_name) VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE unit=VALUES(unit), sub_unit=VALUES(sub_unit), product=VALUES(product), model=VALUES(model), contract_from=VALUES(contract_from), contract_to=VALUES(contract_to), total=VALUES(total), amc_name=VALUES(amc_name)',
      [b.unit, b.sub_unit, b.product, b.model, b.serial_number, b.contract_from, b.contract_to, b.total || 0, b.amc_name]);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/amc/upload', requireLogin, upload.single('excelFile'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No Excel file uploaded' });
  try {
    const wb = xlsx.read(req.file.buffer, { type: 'buffer' });
    const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    let count = 0;
    for (const r of rows) {
      const norm = {};
      for (const k of Object.keys(r)) norm[k.trim().toLowerCase()] = r[k];
      const serial = String(norm['serial number'] || norm['serial_number'] || '').trim();
      if (!serial) continue;
      const cFrom = parseExcelDate(norm['contract from'] || norm['contract_from']);
      const cTo = parseExcelDate(norm['contract to'] || norm['contract_to']);
      if (!cFrom || !cTo) continue;
      const u = String(norm['unit'] || '').trim(), su = String(norm['sub unit'] || norm['sub_unit'] || '').trim();
      const pr = String(norm['product'] || '').trim(), md = String(norm['model'] || '').trim();
      const tot = parseFloat(norm['total'] || 0) || 0, amc = String(norm['amc name'] || norm['amc_name'] || '').trim();
      await pool.query('INSERT INTO amc_assets (unit, sub_unit, product, model, serial_number, contract_from, contract_to, total, amc_name) VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE unit=VALUES(unit), sub_unit=VALUES(sub_unit), product=VALUES(product), model=VALUES(model), contract_from=VALUES(contract_from), contract_to=VALUES(contract_to), total=VALUES(total), amc_name=VALUES(amc_name)',
        [u, su, pr, md, serial, cFrom, cTo, tot, amc]);
      if (u) await pool.query('INSERT IGNORE INTO master_units (unit_name) VALUES (?)', [u]);
      if (su) await pool.query('INSERT IGNORE INTO master_sub_units (sub_unit_name) VALUES (?)', [su]);
      if (pr) await pool.query('INSERT IGNORE INTO master_products (product_name) VALUES (?)', [pr]);
      if (amc) await pool.query('INSERT IGNORE INTO master_amc_names (amc_name) VALUES (?)', [amc]);
      count++;
    }
    res.json({ success: true, imported: count });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/purchases', requireLogin, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM section_purchases ORDER BY purchase_date DESC'); res.json(rows);
});
app.post('/api/purchases', requireLogin, async (req, res) => {
  const b = req.body;
  try { await pool.query('INSERT INTO section_purchases (dept_code, item_name, purpose, amount, vendor, purchase_date) VALUES (?,?,?,?,?,?)', [req.session.dept_code, b.item_name, b.purpose, b.amount, b.vendor, b.purchase_date]); res.json({ success: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/cartridges', requireLogin, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM cartridge_ledger ORDER BY refill_date DESC'); res.json(rows);
});
app.post('/api/cartridges', requireLogin, async (req, res) => {
  const b = req.body;
  try { await pool.query('INSERT INTO cartridge_ledger (dept_code, printer_model, cartridge_model, refill_date, vendor, cost, remarks) VALUES (?,?,?,?,?,?,?)', [req.session.dept_code, b.printer_model, b.cartridge_model, b.refill_date, b.vendor, b.cost, b.remarks]); res.json({ success: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.listen(3000, () => console.log('Server running on 3000'));
