const express = require('express');
const mysql = require('mysql2/promise');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: process.env.SESSION_SECRET || 'wayanad', resave: false, saveUninitialized: false }));
const pool = mysql.createPool({ host: process.env.DB_HOST || 'db', user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
function requireLogin(req, res, next) { if (!req.session.dept_code) return res.status(401).json({ error: 'Unauthorized' }); next(); }
function requireAdmin(req, res, next) { if (!req.session.dept_code || !req.session.is_admin) return res.status(403).json({ error: 'Admin required' }); next(); }
app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/public/departments', async (req, res) => {
  const [rows] = await pool.query('SELECT dept_code, dept_name, is_admin FROM departments ORDER BY is_admin DESC, dept_code ASC');
  res.json(rows);
});
app.post('/api/login', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM departments WHERE dept_code = ?', [req.body.dept_code.toUpperCase()]);
  if (!rows.length || !(await bcrypt.compare(req.body.password, rows[0].password_hash))) return res.status(401).json({ error: 'Invalid login' });
  req.session.dept_code = rows[0].dept_code; req.session.dept_name = rows[0].dept_name; req.session.is_admin = Boolean(rows[0].is_admin);
  res.json({ success: true });
});
app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });
app.get('/api/me', requireLogin, (req, res) => res.json({ dept_code: req.session.dept_code, dept_name: req.session.dept_name, is_admin: req.session.is_admin }));
app.get('/api/masters', requireLogin, async (req, res) => {
  const [products] = await pool.query('SELECT * FROM master_products ORDER BY product_name ASC');
  const [vendors] = await pool.query('SELECT * FROM master_vendors ORDER BY vendor_name ASC');
  const [departments] = await pool.query('SELECT id, dept_code, dept_name, is_admin FROM departments ORDER BY dept_code ASC');
  res.json({ products, vendors, departments });
});
app.post('/api/admin/departments', requireAdmin, async (req, res) => {
  try {
    const hash = await bcrypt.hash(req.body.password, 10);
    await pool.query('INSERT INTO departments (dept_code, dept_name, password_hash, is_admin) VALUES (?, ?, ?, ?)', [req.body.dept_code.toUpperCase(), req.body.dept_name, hash, req.body.is_admin ? 1 : 0]);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/admin/products', requireAdmin, async (req, res) => {
  try { await pool.query('INSERT INTO master_products (product_name) VALUES (?)', [req.body.product_name.toUpperCase()]); res.json({ success: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post('/api/admin/vendors', requireAdmin, async (req, res) => {
  try { await pool.query('INSERT INTO master_vendors (vendor_name, contact_info) VALUES (?, ?)', [req.body.vendor_name, req.body.contact_info || '']); res.json({ success: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/amc', requireLogin, async (req, res) => {
  const [rows] = await pool.query(req.session.is_admin ? 'SELECT *, DATEDIFF(amc_end_date, CURDATE()) AS days_remaining FROM amc_assets ORDER BY amc_end_date ASC' : 'SELECT *, DATEDIFF(amc_end_date, CURDATE()) AS days_remaining FROM amc_assets WHERE dept_code = ? ORDER BY amc_end_date ASC', req.session.is_admin ? [] : [req.session.dept_code]);
  res.json(rows);
});
app.post('/api/amc', requireLogin, async (req, res) => {
  const b = req.body, d = (req.session.is_admin && b.dept_code) ? b.dept_code : req.session.dept_code;
  try { await pool.query('INSERT INTO amc_assets (dept_code, product_category, model, serial_number, amc_start_date, amc_end_date, vendor_name, remarks) VALUES (?,?,?,?,?,?,?,?)', [d, b.product_category, b.model, b.serial_number, b.amc_start_date, b.amc_end_date, b.vendor_name, b.remarks]); res.json({ success: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/purchases', requireLogin, async (req, res) => {
  const [rows] = await pool.query(req.session.is_admin ? 'SELECT * FROM section_purchases ORDER BY purchase_date DESC' : 'SELECT * FROM section_purchases WHERE dept_code = ? ORDER BY purchase_date DESC', req.session.is_admin ? [] : [req.session.dept_code]);
  res.json(rows);
});
app.post('/api/purchases', requireLogin, async (req, res) => {
  const b = req.body, d = (req.session.is_admin && b.dept_code) ? b.dept_code : req.session.dept_code;
  try { await pool.query('INSERT INTO section_purchases (dept_code, item_name, purpose, amount, vendor, purchase_date) VALUES (?,?,?,?,?,?)', [d, b.item_name, b.purpose, b.amount, b.vendor, b.purchase_date]); res.json({ success: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/cartridges', requireLogin, async (req, res) => {
  const [rows] = await pool.query(req.session.is_admin ? 'SELECT * FROM cartridge_ledger ORDER BY refill_date DESC' : 'SELECT * FROM cartridge_ledger WHERE dept_code = ? ORDER BY refill_date DESC', req.session.is_admin ? [] : [req.session.dept_code]);
  res.json(rows);
});
app.post('/api/cartridges', requireLogin, async (req, res) => {
  const b = req.body, d = (req.session.is_admin && b.dept_code) ? b.dept_code : req.session.dept_code;
  try { await pool.query('INSERT INTO cartridge_ledger (dept_code, printer_model, cartridge_model, refill_date, vendor, cost, remarks) VALUES (?,?,?,?,?,?,?)', [d, b.printer_model, b.cartridge_model, b.refill_date, b.vendor, b.cost, b.remarks]); res.json({ success: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.listen(3000, () => console.log('Server running on 3000'));
