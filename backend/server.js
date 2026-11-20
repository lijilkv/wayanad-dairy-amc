const express = require('express');
const mysql = require('mysql2/promise');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'wayanad_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 }
}));

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'db',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

function requireDeptLogin(req, res, next) {
  if (!req.session.dept_code) {
    return res.status(401).json({ error: 'Unauthorized. Please login with your Department.' });
  }
  next();
}

app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/login', async (req, res) => {
  const { dept_code, password } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM departments WHERE dept_code = ?', [dept_code.toUpperCase()]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid Department Code' });

    const valid = await bcrypt.compare(password, rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid Password' });

    req.session.dept_code = rows[0].dept_code;
    req.session.dept_name = rows[0].dept_name;
    res.json({ success: true, dept_code: rows[0].dept_code, dept_name: rows[0].dept_name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', requireDeptLogin, (req, res) => {
  res.json({ dept_code: req.session.dept_code, dept_name: req.session.dept_name });
});

app.get('/api/amc', requireDeptLogin, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT *, DATEDIFF(amc_end_date, CURDATE()) AS days_remaining 
     FROM amc_assets WHERE dept_code = ? ORDER BY amc_end_date ASC`,
    [req.session.dept_code]
  );
  res.json(rows);
});

app.post('/api/amc', requireDeptLogin, async (req, res) => {
  const { product_category, model, serial_number, amc_start_date, amc_end_date, vendor_name, remarks } = req.body;
  try {
    await pool.query(
      `INSERT INTO amc_assets (dept_code, product_category, model, serial_number, amc_start_date, amc_end_date, vendor_name, remarks)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.session.dept_code, product_category, model, serial_number, amc_start_date, amc_end_date, vendor_name, remarks]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/purchases', requireDeptLogin, async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM section_purchases WHERE dept_code = ? ORDER BY purchase_date DESC',
    [req.session.dept_code]
  );
  res.json(rows);
});

app.post('/api/purchases', requireDeptLogin, async (req, res) => {
  const { item_name, purpose, amount, vendor, purchase_date } = req.body;
  try {
    await pool.query(
      `INSERT INTO section_purchases (dept_code, item_name, purpose, amount, vendor, purchase_date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.session.dept_code, item_name, purpose, amount, vendor, purchase_date]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/cartridges', requireDeptLogin, async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM cartridge_ledger WHERE dept_code = ? ORDER BY refill_date DESC',
    [req.session.dept_code]
  );
  res.json(rows);
});

app.post('/api/cartridges', requireDeptLogin, async (req, res) => {
  const { printer_model, cartridge_model, refill_date, vendor, cost, remarks } = req.body;
  try {
    await pool.query(
      `INSERT INTO cartridge_ledger (dept_code, printer_model, cartridge_model, refill_date, vendor, cost, remarks)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.session.dept_code, printer_model, cartridge_model, refill_date, vendor, cost, remarks]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.listen(3000, () => console.log('Wayanad Dairy AMC Server running on port 3000'));
