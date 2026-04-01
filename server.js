/**
 * MBCPOS - Company Canteen POS System
 * Node.js Backend Server
 * Version 3.0.0
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Simple async mutex to prevent concurrent transaction race conditions
class Mutex {
  constructor() { this._queue = []; this._locked = false; }
  lock() {
    return new Promise(resolve => {
      if (!this._locked) { this._locked = true; resolve(); }
      else this._queue.push(resolve);
    });
  }
  unlock() {
    if (this._queue.length > 0) this._queue.shift()();
    else this._locked = false;
  }
}
const transactionMutex = new Mutex();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'mbcpos-secret-key-2024';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));
app.use(express.static('.'));

// Data directory
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// File paths
const FILES = {
  users: path.join(DATA_DIR, 'users.json'),
  products: path.join(DATA_DIR, 'products.json'),
  categories: path.join(DATA_DIR, 'categories.json'),
  customers: path.join(DATA_DIR, 'customers.json'),
  transactions: path.join(DATA_DIR, 'transactions.json'),
  settings: path.join(DATA_DIR, 'settings.json'),
  auditLog: path.join(DATA_DIR, 'audit_log.json'),
  creditLedger: path.join(DATA_DIR, 'credit_ledger.json'),
  accounting: path.join(DATA_DIR, 'accounting.json'),
  stockReceiving: path.join(DATA_DIR, 'stock_receiving.json'),
  taxPayments: path.join(DATA_DIR, 'tax_payments.json'),
  monthlyCogsLog: path.join(DATA_DIR, 'monthly_cogs_log.json'),
  wastageLog: path.join(DATA_DIR, 'wastage_log.json'),
  cashRegisterCounts: path.join(DATA_DIR, 'cash_register_counts.json')
};

// Initialize files with default data
function initDataFiles() {
  // Users - create default admin if not exists
  if (!fs.existsSync(FILES.users)) {
    const defaultUsers = [
      {
        id: 'admin-001',
        username: 'admin',
        password: bcrypt.hashSync('admin123', 10),
        fullName: 'Administrator',
        role: 'admin',
        isActive: true,
        createdAt: new Date().toISOString()
      },
      {
        id: 'cashier-001',
        username: 'cashier',
        password: bcrypt.hashSync('cashier123', 10),
        fullName: 'Cashier',
        role: 'cashier',
        isActive: true,
        createdAt: new Date().toISOString()
      }
    ];
    fs.writeFileSync(FILES.users, JSON.stringify(defaultUsers, null, 2));
  }

  // Products
  if (!fs.existsSync(FILES.products)) {
    fs.writeFileSync(FILES.products, JSON.stringify([], null, 2));
  }

  // Categories
  if (!fs.existsSync(FILES.categories)) {
    fs.writeFileSync(FILES.categories, JSON.stringify([], null, 2));
  }

  // Customers (employees)
  if (!fs.existsSync(FILES.customers)) {
    fs.writeFileSync(FILES.customers, JSON.stringify([], null, 2));
  }

  // Transactions
  if (!fs.existsSync(FILES.transactions)) {
    fs.writeFileSync(FILES.transactions, JSON.stringify([], null, 2));
  }

  // Settings
  if (!fs.existsSync(FILES.settings)) {
    const defaultSettings = {
      canteenName: 'MBC Company Canteen',
      taxRate: 0.08,
      currency: '₱',
      marginAlertThreshold: 30,
      lowStockDefaultThreshold: 10,
      sessionTimeoutMinutes: 30,
      cogsMode: 'per_product'
    };
    fs.writeFileSync(FILES.settings, JSON.stringify(defaultSettings, null, 2));
  }

  // Audit Log
  if (!fs.existsSync(FILES.auditLog)) {
    fs.writeFileSync(FILES.auditLog, JSON.stringify([], null, 2));
  }

  // Credit Ledger
  if (!fs.existsSync(FILES.creditLedger)) {
    fs.writeFileSync(FILES.creditLedger, JSON.stringify([], null, 2));
  }

  // Accounting with standard accounts
  if (!fs.existsSync(FILES.accounting)) {
    const standardAccounts = [
      // Assets (1000-1999)
      { code: '1001', name: 'Cash on Hand', type: 'asset', normal: 'debit', isSystem: true, description: 'Physical cash in register' },
      { code: '1002', name: 'Accounts Receivable - Employees', type: 'asset', normal: 'debit', isSystem: true, description: 'Employee credit balance' },
      { code: '1003', name: 'Inventory', type: 'asset', normal: 'debit', isSystem: true, description: 'Product inventory value' },
      { code: '1004', name: 'Accounts Receivable - Suppliers', type: 'asset', normal: 'debit', isSystem: true, description: 'Amounts owed by suppliers' },
      
      // Liabilities (2000-2999)
      { code: '2001', name: 'Accounts Payable', type: 'liability', normal: 'credit', isSystem: true, description: 'Amounts owed to suppliers' },
      { code: '2002', name: 'VAT / Tax Payable', type: 'liability', normal: 'credit', isSystem: true, description: 'Tax collected from sales' },
      { code: '2003', name: 'Salary Deductions Payable', type: 'liability', normal: 'credit', isSystem: true, description: 'Pending salary deductions' },
      
      // Equity (3000-3999)
      { code: '3001', name: 'Owner\'s Capital', type: 'equity', normal: 'credit', isSystem: true, description: 'Owner investment' },
      { code: '3002', name: 'Retained Earnings', type: 'equity', normal: 'credit', isSystem: true, description: 'Accumulated profits' },
      
      // Revenue (4000-4999)
      { code: '4001', name: 'Sales Revenue', type: 'revenue', normal: 'credit', isSystem: true, description: 'Revenue from cash/card sales' },
      { code: '4002', name: 'Salary Deduction Revenue', type: 'revenue', normal: 'credit', isSystem: true, description: 'Revenue from employee credit sales' },
      
      // Expenses (5000+)
      { code: '5001', name: 'Cost of Goods Sold', type: 'expense', normal: 'debit', isSystem: true, description: 'Direct costs of products sold' },
      { code: '5002', name: 'Discounts Given', type: 'expense', normal: 'debit', isSystem: true, description: 'Discounts applied to sales' },
      { code: '5003', name: 'Operating Expenses', type: 'expense', normal: 'debit', isSystem: true, description: 'General operating expenses' },
      { code: '5004', name: 'Tax Expense', type: 'expense', normal: 'debit', isSystem: true, description: 'Tax remittance expense' },
      { code: '5005', name: 'Wastage Expense', type: 'expense', normal: 'debit', isSystem: true, description: 'Product spoilage and wastage costs' }
    ];
    
    fs.writeFileSync(FILES.accounting, JSON.stringify({
      accounts: standardAccounts,
      journalEntries: []
    }, null, 2));
  }

  // Stock Receiving
  if (!fs.existsSync(FILES.stockReceiving)) {
    fs.writeFileSync(FILES.stockReceiving, JSON.stringify([], null, 2));
  }

  // Tax Payments
  if (!fs.existsSync(FILES.taxPayments)) {
    fs.writeFileSync(FILES.taxPayments, JSON.stringify([], null, 2));
  }

  // Monthly COGS log
  if (!fs.existsSync(FILES.monthlyCogsLog)) {
    fs.writeFileSync(FILES.monthlyCogsLog, JSON.stringify([], null, 2));
  }

  // Wastage log
  if (!fs.existsSync(FILES.wastageLog)) {
    fs.writeFileSync(FILES.wastageLog, JSON.stringify([], null, 2));
  }

  // Ensure 5005 Wastage Expense account exists
  try {
    const acctData = readFile(FILES.accounting);
    if (acctData && acctData.accounts && !acctData.accounts.find(a => a.code === '5005')) {
      acctData.accounts.push({
        code: '5005', name: 'Wastage Expense', type: 'expense', normal: 'debit',
        isSystem: true, description: 'Product spoilage and wastage costs'
      });
      writeFile(FILES.accounting, acctData);
    }
  } catch(e) {}

  // Ensure 5006 Monthly Fixed COGS account exists
  try {
    const acctData = readFile(FILES.accounting);
    if (acctData && acctData.accounts && !acctData.accounts.find(a => a.code === '5006')) {
      acctData.accounts.push({
        code: '5006', name: 'Monthly Fixed COGS', type: 'expense', normal: 'debit',
        isSystem: true, description: 'Fixed monthly cost of goods for per-month COGS products'
      });
      writeFile(FILES.accounting, acctData);
    }
  } catch(e) {}

  // Cash Register Counts
  if (!fs.existsSync(FILES.cashRegisterCounts)) {
    fs.writeFileSync(FILES.cashRegisterCounts, JSON.stringify([], null, 2));
  }
}

initDataFiles();

// Seed cashier account on existing installs
try {
  const _users = readFile(FILES.users);
  if (!_users.find(u => u.role === 'cashier')) {
    _users.push({
      id: 'cashier-001', username: 'cashier',
      password: bcrypt.hashSync('cashier123', 10),
      fullName: 'Cashier', role: 'cashier', isActive: true,
      createdAt: new Date().toISOString()
    });
    writeFile(FILES.users, _users);
  }
} catch(e) {}

// Helper functions
function readFile(filename) {
  try {
    const data = fs.readFileSync(filename, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

function writeFile(filename, data) {
  fs.writeFileSync(filename, JSON.stringify(data, null, 2));
}

function logAudit(action, entityType, entityId, entityName, changeDetails, userId, userFullName) {
  const logs = readFile(FILES.auditLog);
  logs.unshift({
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    action,
    entityType,
    entityId,
    entityName,
    changeDetails,
    userId,
    userFullName
  });
  // Keep only last 5000 entries
  if (logs.length > 5000) logs.length = 5000;
  writeFile(FILES.auditLog, logs);
}

// Auth middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(401).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'accountant') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function requireAdminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Super-admin access required' });
  }
  next();
}

// ═══════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  const users = readFile(FILES.users);
  const user = users.find(u => u.username === username && u.isActive);
  
  if (!user || !await bcrypt.compare(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, fullName: user.fullName },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
  
  logAudit('LOGIN', 'USER', user.id, user.fullName || user.username, null, user.id, user.fullName);
  
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role
    }
  });
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json(req.user);
});


// ═══════════════════════════════════════════════════════════
// USER MANAGEMENT ROUTES (admin only)
// ═══════════════════════════════════════════════════════════

app.get('/api/users', authenticateToken, requireAdminOnly, (req, res) => {
  const users = readFile(FILES.users);
  res.json(users.map(u => ({ id: u.id, username: u.username, fullName: u.fullName, role: u.role, isActive: u.isActive, createdAt: u.createdAt })));
});

app.post('/api/users', authenticateToken, requireAdminOnly, async (req, res) => {
  const { username, password, fullName, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const validRoles = ['admin', 'cashier', 'accountant'];
  if (role && !validRoles.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  const users = readFile(FILES.users);
  if (users.find(u => u.username === username)) return res.status(409).json({ error: 'Username already exists' });
  const newUser = { id: uuidv4(), username, password: await bcrypt.hash(password, 10), fullName: fullName || username, role: role || 'cashier', isActive: true, createdAt: new Date().toISOString() };
  users.push(newUser);
  writeFile(FILES.users, users);
  logAudit('CREATE', 'USER', newUser.id, newUser.username, { role: newUser.role }, req.user.id, req.user.fullName);
  res.status(201).json({ id: newUser.id, username: newUser.username, fullName: newUser.fullName, role: newUser.role, isActive: newUser.isActive });
});

app.put('/api/users/:id', authenticateToken, requireAdminOnly, async (req, res) => {
  const users = readFile(FILES.users);
  const idx = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });
  const { username, password, fullName, role, isActive } = req.body;
  if (users[idx].role === 'admin' && role && role !== 'admin') {
    const adminCount = users.filter(u => u.role === 'admin' && u.isActive && u.id !== req.params.id).length;
    if (adminCount === 0) return res.status(400).json({ error: 'Cannot change role of the last admin account' });
  }
  if (username && username !== users[idx].username && users.find(u => u.username === username && u.id !== req.params.id))
    return res.status(409).json({ error: 'Username already taken' });
  if (username) users[idx].username = username;
  if (password) users[idx].password = await bcrypt.hash(password, 10);
  if (fullName !== undefined) users[idx].fullName = fullName;
  if (role) users[idx].role = role;
  if (isActive !== undefined) users[idx].isActive = isActive;
  users[idx].updatedAt = new Date().toISOString();
  writeFile(FILES.users, users);
  logAudit('UPDATE', 'USER', users[idx].id, users[idx].username, { role: users[idx].role }, req.user.id, req.user.fullName);
  res.json({ id: users[idx].id, username: users[idx].username, fullName: users[idx].fullName, role: users[idx].role, isActive: users[idx].isActive });
});

app.delete('/api/users/:id', authenticateToken, requireAdminOnly, (req, res) => {
  const users = readFile(FILES.users);
  const idx = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });
  if (users[idx].id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });
  if (users[idx].role === 'admin' && users.filter(u => u.role === 'admin' && u.isActive).length <= 1)
    return res.status(400).json({ error: 'Cannot delete the last admin account' });
  const deleted = users.splice(idx, 1)[0];
  writeFile(FILES.users, users);
  logAudit('DELETE', 'USER', deleted.id, deleted.username, null, req.user.id, req.user.fullName);
  res.json({ message: 'User deleted' });
});

// Migration: fix monthly COGS 1003 -> 2001
app.post('/api/monthly-cogs/fix-inventory-credits', authenticateToken, requireAdmin, (req, res) => {
  const accounting = readFile(FILES.accounting);
  let fixed = 0;
  accounting.journalEntries.forEach(entry => {
    if (entry.type !== 'auto' || !entry.reference?.startsWith('MCOGS-')) return;
    entry.lines.forEach(line => {
      if (line.accountCode === '1003' && (line.credit || 0) > 0) { line.accountCode = '2001'; line.accountName = 'Accounts Payable'; fixed++; }
    });
  });
  if (fixed > 0) { writeFile(FILES.accounting, accounting); logAudit('UPDATE', 'JOURNAL_MIGRATION', 'MCOGS-FIX', 'Fixed '+fixed+' monthly COGS line(s)', { fixed }, req.user.id, req.user.fullName); }
  res.json({ message: 'Fixed ' + fixed + ' line(s).', fixed });
});

// Cash register count routes

// IMPORTANT: specific sub-path must be registered BEFORE the generic list route
// Shift comparison: for a given date, return all shifts ordered and compute change between each consecutive pair
app.get('/api/cash-register-counts/shift-comparison', authenticateToken, (req, res) => {
  const { date } = req.query;
  const counts = readFile(FILES.cashRegisterCounts);
  const transactions = readFile(FILES.transactions);
  const targetDate = date || new Date().toISOString().slice(0, 10);

  // All counts for the date, oldest first
  const forDate = counts
    .filter(c => c.date === targetDate)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  // Group by shiftNumber, keep latest count per shift
  const byShift = {};
  forDate.forEach(c => {
    const sn = c.shiftNumber || (c.shift ? parseInt(c.shift.replace('shift','')) : 1);
    byShift[sn] = c;
  });

  // Build sorted array of shifts
  const shifts = Object.keys(byShift)
    .map(Number)
    .sort((a, b) => a - b)
    .map(sn => byShift[sn]);

  // Helper: sum non-salary (physical cash) sales between two timestamps
  const cashSalesBetween = (from, to) => {
    return transactions
      .filter(t => {
        if (t.voided) return false;
        if (t.paymentMethod === 'salary') return false;
        const d = new Date(t.date);
        return d >= new Date(from) && d < new Date(to);
      })
      .reduce((sum, t) => sum + t.total, 0);
  };

  // For each shift, compute:
  //   openingCash  = previous shift's physical count (or 0 if first shift)
  //   cashSales    = sum of non-salary transactions between prev count and this count
  //   expectedCash = openingCash + cashSales
  //   overShort    = physical count (total) - expectedCash
  const shiftsWithAnalysis = shifts.map((s, i) => {
    const sn = s.shiftNumber || parseInt(s.shift.replace('shift',''));
    if (i === 0) {
      // First shift — no prior count to compare against, just show opening float
      return { ...s, shiftNumber: sn, openingCash: null, cashSales: null, expectedCash: null, overShort: null };
    }
    const prev = shifts[i - 1];
    const openingCash = Math.round(prev.total * 100) / 100;
    const sales = Math.round(cashSalesBetween(prev.createdAt, s.createdAt) * 100) / 100;
    const expectedCash = Math.round((openingCash + sales) * 100) / 100;
    const overShort = Math.round((s.total - expectedCash) * 100) / 100;
    return { ...s, shiftNumber: sn, openingCash, cashSales: sales, expectedCash, overShort };
  });

  const existingNums = Object.keys(byShift).map(Number);
  const nextShift = existingNums.length ? Math.max(...existingNums) + 1 : 1;

  res.json({ date: targetDate, shifts: shiftsWithAnalysis, allCounts: forDate, nextShift });
});

app.get('/api/cash-register-counts', authenticateToken, (req, res) => {
  const counts = readFile(FILES.cashRegisterCounts);
  const { limit } = req.query;
  const sorted = [...counts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(limit ? sorted.slice(0, parseInt(limit)) : sorted);
});

app.post('/api/cash-register-counts', authenticateToken, (req, res) => {
  const { date, denomination_counts, notes, postToAccounting, shiftNumber } = req.body;
  if (!denomination_counts || typeof denomination_counts !== 'object') return res.status(400).json({ error: 'denomination_counts is required' });
  const shiftNum = parseInt(shiftNumber) || 1;
  if (shiftNum < 1 || shiftNum > 99) return res.status(400).json({ error: 'shiftNumber must be between 1 and 99' });
  let total = 0;
  const breakdown = [];
  for (const [denom, count] of Object.entries(denomination_counts)) {
    const dv = parseFloat(denom), qty = parseInt(count) || 0;
    if (qty < 0) return res.status(400).json({ error: 'Invalid count' });
    const sub = Math.round(dv * qty * 100) / 100;
    total += sub; breakdown.push({ denomination: dv, count: qty, subtotal: sub });
  }
  total = Math.round(total * 100) / 100;
  const entry = { id: 'CCT-'+Date.now(), date: date||new Date().toISOString().slice(0,10), shift: 'shift'+shiftNum, shiftNumber: shiftNum, denomination_counts, breakdown, total, notes: notes||'', countedBy: req.user.id, countedByName: req.user.fullName||req.user.username, journalEntryId: null, createdAt: new Date().toISOString() };
  const counts = readFile(FILES.cashRegisterCounts);
  counts.unshift(entry);
  writeFile(FILES.cashRegisterCounts, counts);
  if (postToAccounting && total > 0) {
    try {
      const accounting = readFile(FILES.accounting);
      const prev = counts.find(c => c.id !== entry.id && c.journalEntryId);
      const diff = Math.round((total - (prev ? prev.total : 0)) * 100) / 100;
      if (Math.abs(diff) >= 0.01) {
        const je = { id: 'JE-CCT-'+Date.now(), date: entry.date, description: 'Cash Count - '+entry.date+' Shift '+shiftNum+' - ₱'+total.toFixed(2), reference: entry.id, type: 'cash_count',
          lines: diff > 0 ? [{accountCode:'1001',accountName:'Cash on Hand',debit:diff,credit:0},{accountCode:'3002',accountName:'Retained Earnings',debit:0,credit:diff}]
                          : [{accountCode:'1001',accountName:'Cash on Hand',debit:0,credit:Math.abs(diff)},{accountCode:'3002',accountName:'Retained Earnings',debit:Math.abs(diff),credit:0}],
          createdBy: req.user.id, createdAt: new Date().toISOString() };
        accounting.journalEntries.push(je);
        writeFile(FILES.accounting, accounting);
        entry.journalEntryId = je.id;
        const idx = counts.findIndex(c => c.id === entry.id);
        if (idx !== -1) { counts[idx] = entry; writeFile(FILES.cashRegisterCounts, counts); }
      }
    } catch(e) {}
  }
  logAudit('CREATE', 'CASH_COUNT', entry.id, 'Cash count ₱'+total.toFixed(2), { total }, req.user.id, req.user.fullName);
  res.status(201).json(entry);
});

app.put('/api/cash-register-counts/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { date, denomination_counts, notes, shiftNumber } = req.body;
  if (!denomination_counts || typeof denomination_counts !== 'object') return res.status(400).json({ error: 'denomination_counts is required' });
  const shiftNum = parseInt(shiftNumber) || 1;
  if (shiftNum < 1 || shiftNum > 99) return res.status(400).json({ error: 'shiftNumber must be between 1 and 99' });
  const counts = readFile(FILES.cashRegisterCounts);
  const idx = counts.findIndex(c => c.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Cash count not found' });
  let total = 0;
  const breakdown = [];
  for (const [denom, count] of Object.entries(denomination_counts)) {
    const dv = parseFloat(denom), qty = parseInt(count) || 0;
    if (qty < 0) return res.status(400).json({ error: 'Invalid count' });
    const sub = Math.round(dv * qty * 100) / 100;
    total += sub; breakdown.push({ denomination: dv, count: qty, subtotal: sub });
  }
  total = Math.round(total * 100) / 100;
  const existing = counts[idx];
  counts[idx] = { ...existing, date: date || existing.date, shift: 'shift' + shiftNum, shiftNumber: shiftNum, denomination_counts, breakdown, total, notes: notes || '', updatedAt: new Date().toISOString(), updatedBy: req.user.id, updatedByName: req.user.fullName || req.user.username };
  writeFile(FILES.cashRegisterCounts, counts);
  logAudit('UPDATE', 'CASH_COUNT', id, 'Cash count updated ₱' + total.toFixed(2), { total }, req.user.id, req.user.fullName);
  res.json(counts[idx]);
});

// ═══════════════════════════════════════════════════════════
// PRODUCTS ROUTES
// ═══════════════════════════════════════════════════════════

app.get('/api/products', (req, res) => {
  const products = readFile(FILES.products);
  res.json(products);
});

app.post('/api/products', authenticateToken, requireAdmin, (req, res) => {
  const products = readFile(FILES.products);
  const newProduct = {
    id: uuidv4(),
    ...req.body,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  products.push(newProduct);
  writeFile(FILES.products, products);

  // Post opening inventory journal entry if product has stock and cost
  const openingStock = parseFloat(newProduct.stock) || 0;
  const unitCost = parseFloat(newProduct.cost) || 0;
  const openingValue = openingStock * unitCost;
  if (openingValue > 0) {
    const accounting = readFile(FILES.accounting);
    accounting.journalEntries = accounting.journalEntries || [];
    accounting.journalEntries.push({
      id: `JE-${Date.now()}`,
      date: new Date().toISOString(),
      description: `Opening Inventory - ${newProduct.name}`,
      reference: newProduct.id,
      type: 'auto',
      lines: [
        { accountCode: '1003', accountName: 'Inventory', debit: openingValue, credit: 0 },
        { accountCode: '3001', accountName: 'Owner\'s Capital', debit: 0, credit: openingValue }
      ]
    });
    writeFile(FILES.accounting, accounting);
  }
  
  logAudit('CREATE', 'PRODUCT', newProduct.id, newProduct.name, { price: newProduct.price, stock: newProduct.stock }, req.user.id, req.user.fullName);
  
  res.status(201).json(newProduct);
});

app.put('/api/products/:id', authenticateToken, requireAdmin, (req, res) => {
  const products = readFile(FILES.products);
  const index = products.findIndex(p => p.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Product not found' });
  }
  
  const oldProduct = products[index];
  const oldValue = (parseFloat(oldProduct.stock) || 0) * (parseFloat(oldProduct.cost) || 0);

  products[index] = {
    ...oldProduct,
    ...req.body,
    id: oldProduct.id,
    updatedAt: new Date().toISOString()
  };
  const newProduct = products[index];
  const newValue = (parseFloat(newProduct.stock) || 0) * (parseFloat(newProduct.cost) || 0);

  writeFile(FILES.products, products);

  // Post inventory adjustment if value changed
  const delta = newValue - oldValue;
  if (Math.abs(delta) >= 0.01) {
    const accounting = readFile(FILES.accounting);
    accounting.journalEntries = accounting.journalEntries || [];
    accounting.journalEntries.push({
      id: `JE-${Date.now()}`,
      date: new Date().toISOString(),
      description: `Inventory Adjustment - ${newProduct.name}`,
      reference: newProduct.id,
      type: 'auto',
      lines: delta > 0
        ? [
            { accountCode: '1003', accountName: 'Inventory', debit: delta, credit: 0 },
            { accountCode: '3001', accountName: 'Owner\'s Capital', debit: 0, credit: delta }
          ]
        : [
            { accountCode: '3001', accountName: 'Owner\'s Capital', debit: Math.abs(delta), credit: 0 },
            { accountCode: '1003', accountName: 'Inventory', debit: 0, credit: Math.abs(delta) }
          ]
    });
    writeFile(FILES.accounting, accounting);
  }
  
  logAudit('UPDATE', 'PRODUCT', req.params.id, products[index].name, req.body, req.user.id, req.user.fullName);
  
  res.json(products[index]);
});

app.delete('/api/products/:id', authenticateToken, requireAdmin, (req, res) => {
  const products = readFile(FILES.products);
  const index = products.findIndex(p => p.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Product not found' });
  }
  
  const deleted = products.splice(index, 1)[0];
  writeFile(FILES.products, products);
  
  logAudit('DELETE', 'PRODUCT', req.params.id, deleted.name, null, req.user.id, req.user.fullName);
  
  res.json({ message: 'Product deleted' });
});

// ═══════════════════════════════════════════════════════════
// CATEGORIES ROUTES
// ═══════════════════════════════════════════════════════════

app.get('/api/categories', (req, res) => {
  const categories = readFile(FILES.categories);
  res.json(categories);
});

app.post('/api/categories', authenticateToken, requireAdmin, (req, res) => {
  const categories = readFile(FILES.categories);
  const newCategory = {
    id: uuidv4(),
    ...req.body,
    createdAt: new Date().toISOString()
  };
  
  categories.push(newCategory);
  writeFile(FILES.categories, categories);
  
  logAudit('CREATE', 'CATEGORY', newCategory.id, newCategory.name, null, req.user.id, req.user.fullName);
  
  res.status(201).json(newCategory);
});

app.put('/api/categories/:id', authenticateToken, requireAdmin, (req, res) => {
  const categories = readFile(FILES.categories);
  const index = categories.findIndex(c => c.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Category not found' });
  }
  
  categories[index] = { ...categories[index], ...req.body, id: categories[index].id };
  writeFile(FILES.categories, categories);
  
  logAudit('UPDATE', 'CATEGORY', req.params.id, categories[index].name, req.body, req.user.id, req.user.fullName);
  
  res.json(categories[index]);
});

app.delete('/api/categories/:id', authenticateToken, requireAdmin, (req, res) => {
  const categories = readFile(FILES.categories);
  const products = readFile(FILES.products);
  
  const index = categories.findIndex(c => c.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Category not found' });
  }
  
  const deleted = categories.splice(index, 1)[0];
  
  // Remove this tag from all products (don't delete the products)
  const updatedProducts = products.map(p => {
    // Handle new multi-categories array format
    if (Array.isArray(p.categories)) {
      return { ...p, categories: p.categories.filter(id => id !== req.params.id) };
    }
    // Handle legacy single category field
    if (p.category === req.params.id) {
      return { ...p, category: null };
    }
    return p;
  });
  writeFile(FILES.products, updatedProducts);
  writeFile(FILES.categories, categories);
  
  logAudit('DELETE', 'CATEGORY', req.params.id, deleted.name, null, req.user.id, req.user.fullName);
  
  res.json({ message: 'Tag deleted. Products were kept and untagged.' });
});

// ═══════════════════════════════════════════════════════════
// CUSTOMERS (EMPLOYEES) ROUTES
// ═══════════════════════════════════════════════════════════

app.get('/api/customers', authenticateToken, (req, res) => {
  const customers = readFile(FILES.customers);
  res.json(customers);
});

app.post('/api/customers', authenticateToken, requireAdmin, (req, res) => {
  const customers = readFile(FILES.customers);
  
  // Check for duplicate employee ID
  if (customers.some(c => c.employeeId === req.body.employeeId)) {
    return res.status(400).json({ error: 'Employee ID already exists' });
  }
  
  const newCustomer = {
    id: uuidv4(),
    ...req.body,
    totalBalance: 0,
    isActive: true,
    createdAt: new Date().toISOString()
  };
  
  customers.push(newCustomer);
  writeFile(FILES.customers, customers);
  
  logAudit('CREATE', 'EMPLOYEE', newCustomer.id, newCustomer.name || newCustomer.employeeId, { employeeId: newCustomer.employeeId }, req.user.id, req.user.fullName);
  
  res.status(201).json(newCustomer);
});

app.put('/api/customers/:id', authenticateToken, requireAdmin, (req, res) => {
  const customers = readFile(FILES.customers);
  const index = customers.findIndex(c => c.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Employee not found' });
  }
  
  // Check for duplicate employee ID if changing
  if (req.body.employeeId && req.body.employeeId !== customers[index].employeeId) {
    if (customers.some(c => c.employeeId === req.body.employeeId && c.id !== req.params.id)) {
      return res.status(400).json({ error: 'Employee ID already exists' });
    }
  }
  
  customers[index] = { ...customers[index], ...req.body, id: customers[index].id };
  writeFile(FILES.customers, customers);
  
  logAudit('UPDATE', 'EMPLOYEE', req.params.id, customers[index].name || customers[index].employeeId, req.body, req.user.id, req.user.fullName);
  
  res.json(customers[index]);
});

app.delete('/api/customers/:id', authenticateToken, requireAdmin, (req, res) => {
  const customers = readFile(FILES.customers);
  const index = customers.findIndex(c => c.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Employee not found' });
  }
  
  const deleted = customers.splice(index, 1)[0];
  writeFile(FILES.customers, customers);
  
  logAudit('DELETE', 'EMPLOYEE', req.params.id, deleted.name || deleted.employeeId, null, req.user.id, req.user.fullName);
  
  res.json({ message: 'Employee deleted' });
});

// Mark employee as paid - settle all outstanding balance
app.post('/api/customers/:id/pay', authenticateToken, requireAdmin, (req, res) => {
  const customers = readFile(FILES.customers);
  const creditLedger = readFile(FILES.creditLedger);
  const accounting = readFile(FILES.accounting);
  
  const index = customers.findIndex(c => c.id === req.params.id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Employee not found' });
  }
  
  const customer = customers[index];
  const outstandingBalance = customer.totalBalance || 0;
  
  if (outstandingBalance <= 0) {
    return res.status(400).json({ error: 'Employee has no outstanding balance' });
  }
  
  // Mark all unsettled ledger entries as settled
  let settledAmount = 0;
  creditLedger.forEach(entry => {
    if (entry.employeeId === customer.employeeId && entry.type === 'charge' && !entry.isSettled) {
      entry.isSettled = true;
      entry.settledAt = new Date().toISOString();
      entry.settledBy = req.user.id;
      settledAmount += entry.amount;
    }
  });
  
  // Reset customer balance
  customer.totalBalance = 0;
  customer.lastPaymentDate = new Date().toISOString();
  
  // Create journal entry for the payment
  const journalEntry = {
    id: `JE-${Date.now()}`,
    date: new Date().toISOString(),
    description: `Employee Payment - ${customer.name || customer.employeeId}`,
    reference: customer.employeeId,
    type: 'auto',
    lines: [
      { accountCode: '1001', accountName: 'Cash on Hand', debit: outstandingBalance, credit: 0 },
      { accountCode: '1002', accountName: 'Accounts Receivable - Employees', debit: 0, credit: outstandingBalance }
    ]
  };
  
  accounting.journalEntries.push(journalEntry);
  
  writeFile(FILES.customers, customers);
  writeFile(FILES.creditLedger, creditLedger);
  writeFile(FILES.accounting, accounting);
  
  logAudit('PAYMENT', 'EMPLOYEE', req.params.id, customer.name || customer.employeeId, { amount: outstandingBalance }, req.user.id, req.user.fullName);
  
  res.json({ 
    message: 'Employee marked as paid',
    amount: outstandingBalance,
    employee: customer
  });
});

// ═══════════════════════════════════════════════════════════
// CREDIT LEDGER ROUTES
// ═══════════════════════════════════════════════════════════

app.get('/api/credit-ledger/employee/:employeeId', authenticateToken, (req, res) => {
  const ledger = readFile(FILES.creditLedger);
  const employeeLedger = ledger.filter(l => l.employeeId === req.params.employeeId);
  res.json(employeeLedger);
});

// ═══════════════════════════════════════════════════════════
// TRANSACTIONS ROUTES
// ═══════════════════════════════════════════════════════════

app.get('/api/transactions', authenticateToken, (req, res) => {
  const transactions = readFile(FILES.transactions);
  res.json(transactions.sort((a, b) => new Date(b.date) - new Date(a.date)));
});

app.post('/api/transactions', authenticateToken, async (req, res) => {
  const { items, total, paymentMethod, employeeId, discount } = req.body;
  
  if (!items || !items.length) {
    return res.status(400).json({ error: 'No items in transaction' });
  }

  await transactionMutex.lock();
  try {
  const products = readFile(FILES.products);
  const customers = readFile(FILES.customers);
  const transactions = readFile(FILES.transactions);
  const creditLedger = readFile(FILES.creditLedger);
  const accounting = readFile(FILES.accounting);
  const settings = readFile(FILES.settings);
  
  const transaction = {
    id: uuidv4(),
    date: new Date().toISOString(),
    items: [],
    total,
    subtotal: req.body.subtotal || total,
    discount: discount || 0,
    tax: req.body.tax || 0,
    paymentMethod,
    processedBy: req.user.fullName || req.user.username,
    processedById: req.user.id
  };
  
  // Process items and update inventory
  let totalCost = 0;
  for (const item of items) {
    const product = products.find(p => p.id === item.id);
    if (!product) continue;
    
    if (product.stock < item.qty) {
      return res.status(400).json({ error: `Insufficient stock for ${product.name}` });
    }
    
    product.stock -= item.qty;
    product.updatedAt = new Date().toISOString();
    
    // If global cogsMode is per_month, don't charge COGS per transaction
    const cogsMode = settings.cogsMode || 'per_product';
    const unitCost = cogsMode === 'per_product' ? (parseFloat(product.cost) || 0) : 0;

    transaction.items.push({
      id: item.id,
      name: product.name,
      price: item.price,
      cost: unitCost,
      qty: item.qty,
      total: item.price * item.qty
    });

    totalCost += unitCost * item.qty;
  }
  
  // Handle salary deduction
  if (paymentMethod === 'salary') {
    const customer = customers.find(c => c.employeeId === employeeId);
    if (!customer) {
      return res.status(400).json({ error: 'Employee not found' });
    }
    
    transaction.employeeId = employeeId;
    transaction.employeeName = customer.name;
    
    // Update customer balance
    customer.totalBalance = (customer.totalBalance || 0) + total;
    
    // Add to credit ledger
    creditLedger.push({
      id: uuidv4(),
      transactionId: transaction.id,
      employeeId,
      employeeName: customer.name,
      type: 'charge',
      amount: total,
      items: transaction.items.map(i => ({ name: i.name, qty: i.qty })),
      date: transaction.date,
      isSettled: false
    });
    
    writeFile(FILES.customers, customers);
    writeFile(FILES.creditLedger, creditLedger);
  }
  
  // Post to accounting
  const taxRate = settings.taxRate || 0.08;
  const taxableAmount = total / (1 + taxRate);
  const taxAmount = total - taxableAmount;
  
  const journalEntry = {
    id: `JE-${Date.now()}`,
    date: transaction.date,
    description: `Sale - ${paymentMethod} - ${transaction.items.length} items`,
    reference: transaction.id,
    type: 'auto',
    lines: []
  };
  
  if (paymentMethod === 'salary') {
    journalEntry.lines.push(
      { accountCode: '1002', accountName: 'Accounts Receivable - Employees', debit: total, credit: 0 },
      { accountCode: '4002', accountName: 'Salary Deduction Revenue', debit: 0, credit: taxableAmount },
      { accountCode: '2002', accountName: 'VAT / Tax Payable', debit: 0, credit: taxAmount }
    );
  } else {
    journalEntry.lines.push(
      { accountCode: '1001', accountName: 'Cash on Hand', debit: total, credit: 0 },
      { accountCode: '4001', accountName: 'Sales Revenue', debit: 0, credit: taxableAmount },
      { accountCode: '2002', accountName: 'VAT / Tax Payable', debit: 0, credit: taxAmount }
    );
  }
  
  // COGS entry
  if (totalCost > 0) {
    journalEntry.lines.push(
      { accountCode: '5001', accountName: 'Cost of Goods Sold', debit: totalCost, credit: 0 },
      { accountCode: '1003', accountName: 'Inventory', debit: 0, credit: totalCost }
    );
  }
  
  // Discount entry
  if (discount > 0) {
    journalEntry.lines.push(
      { accountCode: '5002', accountName: 'Discounts Given', debit: discount, credit: 0 },
      { accountCode: '1001', accountName: 'Cash on Hand', debit: 0, credit: discount }
    );
  }
  
  accounting.journalEntries.push(journalEntry);
  writeFile(FILES.accounting, accounting);
  
  transactions.push(transaction);
  writeFile(FILES.transactions, transactions);
  writeFile(FILES.products, products);
  
  logAudit('CREATE', 'TRANSACTION', transaction.id, `Sale ${paymentMethod}`, { total, items: items.length }, req.user.id, req.user.fullName);
  
  res.status(201).json(transaction);
  } catch (err) {
    console.error('Transaction error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Transaction failed' });
  } finally {
    transactionMutex.unlock();
  }
});

// Void transaction
app.post('/api/transactions/:id/void', authenticateToken, (req, res) => {
  const transactions = readFile(FILES.transactions);
  const transaction = transactions.find(t => t.id === req.params.id);
  
  if (!transaction) {
    return res.status(404).json({ error: 'Transaction not found' });
  }
  
  if (transaction.voided) {
    return res.status(400).json({ error: 'Transaction already voided' });
  }
  
  const products = readFile(FILES.products);
  const customers = readFile(FILES.customers);
  const creditLedger = readFile(FILES.creditLedger);
  const accounting = readFile(FILES.accounting);
  
  // Restore inventory
  for (const item of transaction.items) {
    const product = products.find(p => p.id === item.id);
    if (product) {
      product.stock += item.qty;
      product.updatedAt = new Date().toISOString();
    }
  }
  
  // Reverse credit if salary deduction
  let arAlreadySettled = false;
  if (transaction.paymentMethod === 'salary') {
    const customer = customers.find(c => c.employeeId === transaction.employeeId);
    if (customer) {
      const prevBalance = customer.totalBalance || 0;
      // If balance is already 0, the AR was previously settled via markEmployeePaid.
      // The payment JE already credited 1002 — reversing it again would make AR go negative.
      arAlreadySettled = prevBalance <= 0;
      customer.totalBalance = Math.max(0, prevBalance - transaction.total);
    }

    const ledgerEntry = creditLedger.find(l => l.transactionId === transaction.id);
    if (ledgerEntry) {
      ledgerEntry.isVoided = true;
      ledgerEntry.isSettled = true; // prevent double-counting in AR summary
    }

    writeFile(FILES.customers, customers);
    writeFile(FILES.creditLedger, creditLedger);
  }

  // Reverse accounting entry — exclude 1002 lines if AR was already settled
  const journalEntry = accounting.journalEntries.find(j => j.reference === transaction.id);
  if (journalEntry) {
    const reversalLines = journalEntry.lines
      .filter(l => !(arAlreadySettled && l.accountCode === '1002'))
      .map(l => ({
        accountCode: l.accountCode,
        accountName: l.accountName,
        debit: l.credit,
        credit: l.debit
      }));

    if (reversalLines.length > 0) {
      const reversalEntry = {
        id: `JE-${Date.now()}`,
        date: new Date().toISOString(),
        description: `VOID - ${journalEntry.description}`,
        reference: transaction.id,
        type: 'auto',
        lines: reversalLines
      };
      accounting.journalEntries.push(reversalEntry);
    }
    writeFile(FILES.accounting, accounting);
  }
  
  transaction.voided = true;
  transaction.voidedAt = new Date().toISOString();
  transaction.voidedBy = req.user.fullName || req.user.username;
  
  writeFile(FILES.transactions, transactions);
  writeFile(FILES.products, products);
  
  logAudit('VOID', 'TRANSACTION', transaction.id, `Voided sale`, { total: transaction.total }, req.user.id, req.user.fullName);
  
  res.json({ message: 'Transaction voided' });
});


// ═══════════════════════════════════════════════════════════
// SETTINGS ROUTES
// ═══════════════════════════════════════════════════════════

app.get('/api/settings', (req, res) => {
  const settings = readFile(FILES.settings);
  res.json(settings);
});

app.put('/api/settings', authenticateToken, requireAdmin, (req, res) => {
  const settings = readFile(FILES.settings);
  const updated = { ...settings, ...req.body };
  writeFile(FILES.settings, updated);
  
  logAudit('UPDATE', 'SETTINGS', 'system', 'System Settings', req.body, req.user.id, req.user.fullName);
  
  res.json(updated);
});

// ═══════════════════════════════════════════════════════════
// STATS ROUTES
// ═══════════════════════════════════════════════════════════

app.get('/api/stats', authenticateToken, (req, res) => {
  const transactions = readFile(FILES.transactions);
  const products = readFile(FILES.products);
  const settings = readFile(FILES.settings);
  const marginThreshold = settings.marginAlertThreshold || 30;
  
  const today = new Date().toISOString().slice(0, 10);
  const todayTransactions = transactions.filter(t => t.date.startsWith(today) && !t.voided);
  
  const todayStats = {
    revenue: todayTransactions.reduce((s, t) => s + t.total, 0),
    profit: todayTransactions.reduce((s, t) => s + (t.items.reduce((is, i) => is + ((i.price - (i.cost || 0)) * i.qty), 0)), 0),
    count: todayTransactions.length
  };
  
  const monthStart = new Date().toISOString().slice(0, 7);
  const monthTransactions = transactions.filter(t => t.date.startsWith(monthStart) && !t.voided);
  
  const monthStats = {
    revenue: monthTransactions.reduce((s, t) => s + t.total, 0),
    profit: monthTransactions.reduce((s, t) => s + (t.items.reduce((is, i) => is + ((i.price - (i.cost || 0)) * i.qty), 0)), 0),
    count: monthTransactions.length
  };
  
  const allTransactions = transactions.filter(t => !t.voided);
  const allStats = {
    revenue: allTransactions.reduce((s, t) => s + t.total, 0),
    profit: allTransactions.reduce((s, t) => s + (t.items.reduce((is, i) => is + ((i.price - (i.cost || 0)) * i.qty), 0)), 0),
    count: allTransactions.length
  };
  
  // Daily data for chart (last 7 days)
  const dailyData = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().slice(0, 10);
    const dayTrans = transactions.filter(t => t.date.startsWith(dateStr) && !t.voided);
    dailyData.push({
      date: dateStr,
      revenue: dayTrans.reduce((s, t) => s + t.total, 0),
      profit: dayTrans.reduce((s, t) => s + (t.items.reduce((is, i) => is + ((i.price - (i.cost || 0)) * i.qty), 0)), 0)
    });
  }
  
  // Low stock items
  const lowStockItems = products.filter(p => p.stock <= (p.lowStockThreshold || 10)).sort((a, b) => a.stock - b.stock);
  
  res.json({
    today: todayStats,
    month: monthStats,
    all: allStats,
    dailyData,
    lowStockItems
  });
});

// ═══════════════════════════════════════════════════════════
// ACCOUNTING ROUTES
// ═══════════════════════════════════════════════════════════

// Get all accounts
app.get('/api/accounting/accounts', authenticateToken, (req, res) => {
  const accounting = readFile(FILES.accounting);
  const { period } = req.query;
  
  let accounts = [...accounting.accounts];
  
  // Calculate totals for each account
  accounts.forEach(account => {
    account.debitTotal = 0;
    account.creditTotal = 0;
    
    accounting.journalEntries.forEach(entry => {
      const line = entry.lines.find(l => l.accountCode === account.code);
      if (line) {
        // Filter by period if specified
        if (period) {
          const entryDate = new Date(entry.date);
          const now = new Date();
          let include = false;
          
          if (period === 'monthly') {
            include = entryDate.getMonth() === now.getMonth() && entryDate.getFullYear() === now.getFullYear();
          } else if (period === 'quarterly') {
            const quarter = Math.floor(now.getMonth() / 3);
            const entryQuarter = Math.floor(entryDate.getMonth() / 3);
            include = entryQuarter === quarter && entryDate.getFullYear() === now.getFullYear();
          } else if (period === 'yearly') {
            include = entryDate.getFullYear() === now.getFullYear();
          }
          
          if (!include) return;
        }
        
        account.debitTotal += line.debit || 0;
        account.creditTotal += line.credit || 0;
      }
    });
  });
  
  res.json(accounts);
});

// Add new account
app.post('/api/accounting/accounts', authenticateToken, requireAdmin, (req, res) => {
  const accounting = readFile(FILES.accounting);
  const { code, name, type, description } = req.body;
  
  if (accounting.accounts.some(a => a.code === code)) {
    return res.status(400).json({ error: 'Account code already exists' });
  }
  
  const normal = ['asset', 'expense'].includes(type) ? 'debit' : 'credit';
  
  const newAccount = {
    code,
    name,
    type,
    normal,
    description,
    isSystem: false,
    createdAt: new Date().toISOString()
  };
  
  accounting.accounts.push(newAccount);
  writeFile(FILES.accounting, accounting);
  
  logAudit('CREATE', 'ACCOUNT', code, name, { type }, req.user.id, req.user.fullName);
  
  res.status(201).json(newAccount);
});

// Update account
app.put('/api/accounting/accounts/:code', authenticateToken, requireAdmin, (req, res) => {
  const accounting = readFile(FILES.accounting);
  const index = accounting.accounts.findIndex(a => a.code === req.params.code);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Account not found' });
  }
  
  const account = accounting.accounts[index];
  if (account.isSystem) {
    return res.status(400).json({ error: 'Cannot modify system account' });
  }
  
  accounting.accounts[index] = {
    ...account,
    name: req.body.name || account.name,
    description: req.body.description || account.description
  };
  
  writeFile(FILES.accounting, accounting);
  
  logAudit('UPDATE', 'ACCOUNT', req.params.code, account.name, req.body, req.user.id, req.user.fullName);
  
  res.json(accounting.accounts[index]);
});

// Delete account
app.delete('/api/accounting/accounts/:code', authenticateToken, requireAdmin, (req, res) => {
  const accounting = readFile(FILES.accounting);
  const index = accounting.accounts.findIndex(a => a.code === req.params.code);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Account not found' });
  }
  
  const account = accounting.accounts[index];
  if (account.isSystem) {
    return res.status(400).json({ error: 'Cannot delete system account' });
  }
  
  // Check if account has journal entries
  const hasEntries = accounting.journalEntries.some(e => e.lines.some(l => l.accountCode === req.params.code));
  if (hasEntries) {
    return res.status(400).json({ error: 'Cannot delete account with journal entries' });
  }
  
  accounting.accounts.splice(index, 1);
  writeFile(FILES.accounting, accounting);
  
  logAudit('DELETE', 'ACCOUNT', req.params.code, account.name, null, req.user.id, req.user.fullName);
  
  res.json({ message: 'Account deleted' });
});

// Get journal entries
app.get('/api/accounting/journal', authenticateToken, (req, res) => {
  const accounting = readFile(FILES.accounting);
  const { from, to, type } = req.query;
  
  let entries = [...accounting.journalEntries];
  
  if (from) {
    entries = entries.filter(e => new Date(e.date) >= new Date(from));
  }
  if (to) {
    entries = entries.filter(e => new Date(e.date) <= new Date(to));
  }
  if (type) {
    entries = entries.filter(e => e.type === type);
  }
  
  entries.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  res.json(entries);
});

// Create manual journal entry
app.post('/api/accounting/journal', authenticateToken, requireAdmin, (req, res) => {
  const accounting = readFile(FILES.accounting);
  const { date, description, reference, lines } = req.body;
  
  const totalDebits = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredits = lines.reduce((s, l) => s + (l.credit || 0), 0);
  
  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    return res.status(400).json({ error: 'Debits must equal credits' });
  }
  
  const entry = {
    id: `JE-${Date.now()}`,
    date: date || new Date().toISOString(),
    description,
    reference,
    type: 'manual',
    lines: lines.filter(l => l.accountCode),
    createdBy: req.user.id,
    createdAt: new Date().toISOString()
  };
  
  accounting.journalEntries.push(entry);
  writeFile(FILES.accounting, accounting);
  
  logAudit('CREATE', 'JOURNAL_ENTRY', entry.id, description, { total: totalDebits }, req.user.id, req.user.fullName);
  
  res.status(201).json(entry);
});

// Trial balance
app.get('/api/accounting/trial-balance', authenticateToken, (req, res) => {
  const accounting = readFile(FILES.accounting);
  
  const accounts = accounting.accounts.map(account => {
    let debitTotal = 0;
    let creditTotal = 0;
    
    accounting.journalEntries.forEach(entry => {
      entry.lines.forEach(line => {
        if (line.accountCode === account.code) {
          debitTotal += line.debit || 0;
          creditTotal += line.credit || 0;
        }
      });
    });
    
    return {
      ...account,
      debitTotal,
      creditTotal,
      balance: account.normal === 'debit' ? debitTotal - creditTotal : creditTotal - debitTotal
    };
  });
  
  const totalDebits = accounts.reduce((s, a) => s + a.debitTotal, 0);
  const totalCredits = accounts.reduce((s, a) => s + a.creditTotal, 0);
  
  res.json({
    accounts,
    totalDebits,
    totalCredits,
    isBalanced: Math.abs(totalDebits - totalCredits) < 0.01
  });
});

// Income statement
app.get('/api/accounting/income-statement', authenticateToken, (req, res) => {
  const accounting = readFile(FILES.accounting);
  const settings   = readFile(FILES.settings);
  const { from, to } = req.query;
  
  const fromDate = from ? new Date(from) : new Date(0);
  const toDate   = to   ? new Date(to)   : new Date();
  if (to && !to.includes('T')) toDate.setHours(23, 59, 59, 999);

  const cogsMode = (settings && settings.cogsMode) || 'per_product';
  const monthsWithMonthlyCogs = new Set();
  if (cogsMode === 'per_month') {
    accounting.journalEntries.forEach(entry => {
      const has5006 = entry.lines.some(l => l.accountCode === '5006' && (l.debit || 0) > 0);
      if (has5006) {
        const d = new Date(entry.date);
        monthsWithMonthlyCogs.add(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
      }
    });
  }

  let cashRevenue = 0, salaryDeductionRevenue = 0, cogsPerProduct = 0, cogsMonthly = 0, discounts = 0;

  accounting.journalEntries.forEach(entry => {
    const entryDate = new Date(entry.date);
    if (entryDate < fromDate || entryDate > toDate) return;
    const mk = entryDate.getFullYear() + '-' + String(entryDate.getMonth() + 1).padStart(2, '0');
    const skipPP = monthsWithMonthlyCogs.has(mk);
    entry.lines.forEach(line => {
      if (line.accountCode === '4001') cashRevenue += line.credit || 0;
      if (line.accountCode === '4002') salaryDeductionRevenue += line.credit || 0;
      if (line.accountCode === '5001' && !skipPP) cogsPerProduct += line.debit || 0;
      if (line.accountCode === '5006') cogsMonthly += line.debit || 0;
      if (line.accountCode === '5002') discounts += line.debit || 0;
    });
  });

  const totalRevenue = cashRevenue + salaryDeductionRevenue;
  const cogs         = cogsPerProduct + cogsMonthly;
  const grossProfit  = totalRevenue - cogs;
  const grossMargin  = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : 0;
  const netIncome    = grossProfit - discounts;

  res.json({
    cashRevenue,
    salaryDeductionRevenue,
    totalRevenue,
    cogs,
    cogsBreakdown: { perProduct: cogsPerProduct, monthly: cogsMonthly },
    grossProfit,
    grossMargin,
    discounts,
    netIncome,
    period: { from, to },
    cogsMode,
    monthsExcludedFromPerProductCogs: [...monthsWithMonthlyCogs].sort()
  });
});

// Reconcile AR — recomputes 1002 balance from actual unsettled charges
// and posts a correcting entry if the journal balance doesn't match reality
app.post('/api/accounting/reconcile-ar', authenticateToken, requireAdmin, (req, res) => {
  const accounting = readFile(FILES.accounting);
  const creditLedger = readFile(FILES.creditLedger);

  // True outstanding AR = sum of all unsettled, non-voided charge entries
  const trueAR = creditLedger
    .filter(l => l.type === 'charge' && !l.isSettled && !l.isVoided)
    .reduce((s, l) => s + l.amount, 0);

  // Current 1002 journal balance
  let ar1002Debit = 0, ar1002Credit = 0;
  accounting.journalEntries.forEach(entry => {
    entry.lines.forEach(line => {
      if (line.accountCode === '1002') {
        ar1002Debit  += line.debit  || 0;
        ar1002Credit += line.credit || 0;
      }
    });
  });
  const journalAR = ar1002Debit - ar1002Credit;
  const diff = trueAR - journalAR;

  if (Math.abs(diff) < 0.01) {
    return res.json({ message: 'AR is already balanced', journalAR, trueAR, diff: 0 });
  }

  // Post a correcting entry
  const correctionEntry = {
    id: `JE-${Date.now()}`,
    date: new Date().toISOString(),
    description: 'AR Reconciliation — correcting entry',
    reference: 'AR-RECON',
    type: 'manual',
    lines: diff > 0
      ? [ // AR understated — debit 1002, credit suspense
          { accountCode: '1002', accountName: 'Accounts Receivable - Employees', debit: diff,  credit: 0    },
          { accountCode: '3999', accountName: 'Reconciliation Suspense',          debit: 0,     credit: diff }
        ]
      : [ // AR overstated (negative) — credit 1002, debit suspense
          { accountCode: '1002', accountName: 'Accounts Receivable - Employees', debit: 0,            credit: Math.abs(diff) },
          { accountCode: '3999', accountName: 'Reconciliation Suspense',          debit: Math.abs(diff), credit: 0 }
        ]
  };

  accounting.journalEntries.push(correctionEntry);
  writeFile(FILES.accounting, accounting);

  logAudit('RECONCILE', 'ACCOUNT', '1002', 'AR Reconciliation', { journalAR, trueAR, diff }, req.user.id, req.user.fullName);

  res.json({
    message: `AR reconciled. Corrected by ${diff > 0 ? '+' : ''}${diff.toFixed(2)}`,
    journalAR,
    trueAR,
    diff,
    entry: correctionEntry.id
  });
});

// Reconcile Tax Payable (2002) — corrects over-remittance
// True tax payable = all credits to 2002 (from sales) minus all debits (payments)
// If negative it means more tax was recorded as paid than was ever collected
app.post('/api/accounting/reconcile-tax', authenticateToken, requireAdmin, (req, res) => {
  const accounting = readFile(FILES.accounting);

  let tax2002Debit = 0, tax2002Credit = 0;
  accounting.journalEntries.forEach(entry => {
    entry.lines.forEach(line => {
      if (line.accountCode === '2002') {
        tax2002Debit  += line.debit  || 0;
        tax2002Credit += line.credit || 0;
      }
    });
  });

  const outstanding = tax2002Credit - tax2002Debit; // positive = still owed, negative = over-remitted

  if (outstanding >= 0) {
    return res.json({ message: 'Tax payable is not negative — no correction needed', outstanding });
  }

  // Over-remitted by Math.abs(outstanding) — post a correcting credit to 1001 (cash refund logic)
  // and debit 2002 to clear the negative, offset against suspense
  const overRemitted = Math.abs(outstanding);
  const correctionEntry = {
    id: `JE-${Date.now()}`,
    date: new Date().toISOString(),
    description: 'Tax Payable Reconciliation — over-remittance correction',
    reference: 'TAX-RECON',
    type: 'manual',
    lines: [
      { accountCode: '2002', accountName: 'VAT / Tax Payable',        debit: 0,            credit: overRemitted },
      { accountCode: '3999', accountName: 'Reconciliation Suspense',   debit: overRemitted, credit: 0 }
    ]
  };

  accounting.journalEntries.push(correctionEntry);
  writeFile(FILES.accounting, accounting);

  logAudit('RECONCILE', 'ACCOUNT', '2002', 'Tax Payable Reconciliation', { outstanding, overRemitted }, req.user.id, req.user.fullName);

  res.json({
    message: `Tax payable reconciled. Cleared over-remittance of ${overRemitted.toFixed(2)}`,
    outstanding,
    overRemitted,
    entry: correctionEntry.id
  });
});

// A/R Summary
app.get('/api/accounting/ar-summary', authenticateToken, (req, res) => {
  const customers = readFile(FILES.customers);
  const creditLedger = readFile(FILES.creditLedger);
  
  const byEmployee = customers
    .filter(c => c.totalBalance > 0)
    .map(c => {
      const empLedger = creditLedger.filter(l => l.employeeId === c.employeeId && l.type === 'charge' && !l.isSettled);
      const totalUnsettled = empLedger.reduce((s, l) => s + l.amount, 0);
      
      return {
        employeeId: c.employeeId,
        name: c.name,
        dept: c.department,
        totalUnsettled
      };
    })
    .filter(e => e.totalUnsettled > 0)
    .sort((a, b) => b.totalUnsettled - a.totalUnsettled);
  
  const totalOutstanding = byEmployee.reduce((s, e) => s + e.totalUnsettled, 0);
  
  res.json({
    totalOutstanding,
    employeeCount: byEmployee.length,
    byEmployee
  });
});

// Tax payments
app.get('/api/accounting/tax-payments', authenticateToken, (req, res) => {
  const payments = readFile(FILES.taxPayments);
  res.json(payments.sort((a, b) => new Date(b.date) - new Date(a.date)));
});

app.post('/api/accounting/tax-payments', authenticateToken, requireAdmin, (req, res) => {
  const payments = readFile(FILES.taxPayments);
  const accounting = readFile(FILES.accounting);
  
  const { date, description, reference, period, amount, lines } = req.body;
  
  const payment = {
    id: uuidv4(),
    date: date || new Date().toISOString(),
    description,
    reference,
    period,
    amount,
    createdBy: req.user.id,
    createdAt: new Date().toISOString()
  };
  
  payments.push(payment);
  writeFile(FILES.taxPayments, payments);
  
  // Create journal entry for tax payment
  const journalEntry = {
    id: `JE-${Date.now()}`,
    date: payment.date,
    description: `Tax Payment - ${reference || 'Remittance'}`,
    reference: payment.id,
    type: 'auto',
    lines: lines || [
      { accountCode: '2002', accountName: 'VAT / Tax Payable', debit: amount, credit: 0 },
      { accountCode: '1001', accountName: 'Cash on Hand', debit: 0, credit: amount }
    ]
  };
  
  accounting.journalEntries.push(journalEntry);
  writeFile(FILES.accounting, accounting);
  
  logAudit('CREATE', 'TAX_PAYMENT', payment.id, `Tax payment ${amount}`, { amount, reference }, req.user.id, req.user.fullName);
  
  res.status(201).json(payment);
});

// Monthly Tax Summary
app.get('/api/accounting/monthly-tax', authenticateToken, (req, res) => {
  const accounting = readFile(FILES.accounting);
  const taxPayments = readFile(FILES.taxPayments);
  
  // Get all months with tax entries (last 12 months)
  const months = new Map();
  const now = new Date();
  
  // Initialize last 12 months
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.set(monthKey, {
      month: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      monthKey,
      collected: 0,
      paid: 0,
      isPaid: false
    });
  }
  
  // Calculate tax collected from journal entries (account 2002 - VAT/Tax Payable credits)
  accounting.journalEntries.forEach(entry => {
    const entryDate = new Date(entry.date);
    const monthKey = `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, '0')}`;
    
    if (months.has(monthKey)) {
      entry.lines.forEach(line => {
        if (line.accountCode === '2002') {
          // Credits to 2002 = tax collected
          if (line.credit > 0) {
            months.get(monthKey).collected += line.credit;
          }
        }
      });
    }
  });
  
  // Calculate tax paid from tax payments
  taxPayments.forEach(payment => {
    const paymentDate = new Date(payment.date);
    const monthKey = `${paymentDate.getFullYear()}-${String(paymentDate.getMonth() + 1).padStart(2, '0')}`;
    
    if (months.has(monthKey)) {
      months.get(monthKey).paid += payment.amount || 0;
    }
  });
  
  // Determine if each month is paid (paid >= collected)
  months.forEach(m => {
    m.isPaid = m.paid >= m.collected;
  });
  
  // Convert to array and sort by month (newest first)
  const result = Array.from(months.values())
    .filter(m => m.collected > 0 || m.paid > 0)
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  
  res.json(result);
});


// ═══════════════════════════════════════════════════════════
// STOCK RECEIVING ROUTES
// ═══════════════════════════════════════════════════════════

app.get('/api/stock-receiving', authenticateToken, (req, res) => {
  const receiving = readFile(FILES.stockReceiving);
  const products = readFile(FILES.products);
  
  const enriched = receiving.map(r => {
    const product = products.find(p => p.id === r.productId);
    return {
      ...r,
      productName: product?.name || 'Unknown'
    };
  });
  
  res.json(enriched.sort((a, b) => new Date(b.date) - new Date(a.date)));
});

app.post('/api/stock-receiving', authenticateToken, requireAdmin, (req, res) => {
  const { productId, quantityReceived, unitCost, paymentMethod, supplierName, referenceNumber, notes } = req.body;
  
  if (!productId || !quantityReceived || !unitCost) {
    return res.status(400).json({ error: 'Product, quantity, and unit cost required' });
  }
  
  const products = readFile(FILES.products);
  const receiving = readFile(FILES.stockReceiving);
  const accounting = readFile(FILES.accounting);
  
  const product = products.find(p => p.id === productId);
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }
  
  const totalCost = quantityReceived * unitCost;
  
  // Update product stock and cost
  product.stock += quantityReceived;
  product.cost = unitCost;
  product.updatedAt = new Date().toISOString();
  
  // Create receiving record
  const record = {
    id: uuidv4(),
    productId,
    quantityReceived,
    unitCost,
    totalCost,
    paymentMethod,
    supplierName,
    referenceNumber,
    notes,
    date: new Date().toISOString(),
    createdBy: req.user.id
  };
  
  receiving.push(record);
  
  // Create journal entry
  const journalEntry = {
    id: `JE-${Date.now()}`,
    date: record.date,
    description: `Stock Receipt - ${product.name} x${quantityReceived}`,
    reference: record.id,
    type: 'auto',
    lines: []
  };
  
  if (paymentMethod === 'cash') {
    journalEntry.lines.push(
      { accountCode: '1003', accountName: 'Inventory', debit: totalCost, credit: 0 },
      { accountCode: '1001', accountName: 'Cash on Hand', debit: 0, credit: totalCost }
    );
  } else {
    // On account
    journalEntry.lines.push(
      { accountCode: '1003', accountName: 'Inventory', debit: totalCost, credit: 0 },
      { accountCode: '2001', accountName: 'Accounts Payable', debit: 0, credit: totalCost }
    );
  }
  
  accounting.journalEntries.push(journalEntry);
  
  writeFile(FILES.products, products);
  writeFile(FILES.stockReceiving, receiving);
  writeFile(FILES.accounting, accounting);
  
  logAudit('CREATE', 'STOCK_RECEIPT', record.id, `Received ${product.name} x${quantityReceived}`, { totalCost }, req.user.id, req.user.fullName);
  
  res.status(201).json(record);
});

// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// WASTAGE ROUTES
// ═══════════════════════════════════════════════════════════

app.get('/api/wastage', authenticateToken, (req, res) => {
  const log = readFile(FILES.wastageLog);
  res.json(log);
});

app.post('/api/wastage', authenticateToken, requireAdmin, (req, res) => {
  const { productId, quantity, reason, notes } = req.body;
  if (!productId || !quantity || quantity <= 0) {
    return res.status(400).json({ error: 'Product and quantity are required' });
  }

  const products = readFile(FILES.products);
  const product  = products.find(p => p.id === productId);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (product.stock < quantity) {
    return res.status(400).json({ error: `Only ${product.stock} units in stock` });
  }

  // Deduct stock
  product.stock -= quantity;
  product.updatedAt = new Date().toISOString();
  writeFile(FILES.products, products);

  const unitCost    = parseFloat(product.cost) || 0;
  const totalCost   = unitCost * quantity;

  // Journal entry: Dr 5005 Wastage Expense / Cr 1003 Inventory
  if (totalCost > 0) {
    const accounting = readFile(FILES.accounting);
    accounting.journalEntries = accounting.journalEntries || [];
    accounting.journalEntries.push({
      id: `JE-WAS-${Date.now()}`,
      date: new Date().toISOString(),
      description: `Wastage — ${product.name} x${quantity}${reason ? ' (' + reason + ')' : ''}`,
      reference: `WAS-${productId}`,
      type: 'auto',
      lines: [
        { accountCode: '5005', accountName: 'Wastage Expense', debit: totalCost, credit: 0 },
        { accountCode: '1003', accountName: 'Inventory',       debit: 0,         credit: totalCost }
      ]
    });
    writeFile(FILES.accounting, accounting);
  }

  const entry = {
    id:          uuidv4(),
    date:        new Date().toISOString(),
    productId,
    productName: product.name,
    quantity,
    unitCost,
    totalCost,
    reason:      reason || '',
    notes:       notes  || '',
    recordedBy:  req.user.fullName || req.user.username
  };

  const log = readFile(FILES.wastageLog);
  log.unshift(entry);
  if (log.length > 2000) log.length = 2000;
  writeFile(FILES.wastageLog, log);

  logAudit('CREATE', 'WASTAGE', entry.id, `Wastage — ${product.name}`,
    { quantity, totalCost }, req.user.id, req.user.fullName);

  res.status(201).json(entry);
});

// ═══════════════════════════════════════════════════════════
// MONTHLY COGS ROUTES
// ═══════════════════════════════════════════════════════════

// Get posting history
app.get('/api/monthly-cogs/history', authenticateToken, (req, res) => {
  const log = readFile(FILES.monthlyCogsLog);
  res.json(log);
});

// Post monthly COGS for all per-month products for a given month
app.post('/api/monthly-cogs/post', authenticateToken, requireAdmin, (req, res) => {
  const { month } = req.body; // 'YYYY-MM'
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: 'Month required in YYYY-MM format' });
  }

  const products     = readFile(FILES.products);
  const accounting   = readFile(FILES.accounting);
  const monthlyLog   = readFile(FILES.monthlyCogsLog);
  accounting.journalEntries = accounting.journalEntries || [];

  const { amount, notes } = req.body;
  if (!amount || parseFloat(amount) <= 0) {
    return res.status(400).json({ error: 'A valid COGS amount is required' });
  }

  const totalCogs = parseFloat(amount);

  const je = {
    id:          `JE-MCOGS-${Date.now()}`,
    date:        new Date(`${month}-01`).toISOString(),
    description: `Monthly COGS - ${month}${notes ? ' — ' + notes : ''}`,
    reference:   `MCOGS-${month}`,
    type:        'auto',
    lines: [
      { accountCode: '5006', accountName: 'Monthly Fixed COGS',  debit: totalCogs, credit: 0         },
      { accountCode: '2001', accountName: 'Accounts Payable',    debit: 0,         credit: totalCogs }
    ]
  };
  accounting.journalEntries.push(je);
  writeFile(FILES.accounting, accounting);

  const logEntry = {
    id:        uuidv4(),
    postedAt:  new Date().toISOString(),
    month,
    totalCogs,
    notes:     notes || '',
    journalId: je.id
  };
  monthlyLog.unshift(logEntry);
  if (monthlyLog.length > 500) monthlyLog.length = 500;
  writeFile(FILES.monthlyCogsLog, monthlyLog);

  logAudit('CREATE', 'MONTHLY_COGS', logEntry.id, `Monthly COGS ${month}`,
    { totalCogs, notes }, req.user.id, req.user.fullName);

  res.json({ message: `Monthly COGS of ${totalCogs.toFixed(2)} posted for ${month}`, posted: 1 });
});

// ═══════════════════════════════════════════════════════════
// REPORTS ROUTES
// ═══════════════════════════════════════════════════════════

// Daily sales report
app.get('/api/reports/daily-sales', authenticateToken, (req, res) => {
  const { date } = req.query;
  const transactions = readFile(FILES.transactions);
  
  const dayTransactions = transactions.filter(t => t.date.startsWith(date) && !t.voided);
  
  const byMethod = {};
  dayTransactions.forEach(t => {
    if (!byMethod[t.paymentMethod]) {
      byMethod[t.paymentMethod] = { count: 0, total: 0 };
    }
    byMethod[t.paymentMethod].count++;
    byMethod[t.paymentMethod].total += t.total;
  });
  
  res.json({
    date,
    totalTransactions: dayTransactions.length,
    totalRevenue: dayTransactions.reduce((s, t) => s + t.total, 0),
    totalProfit: dayTransactions.reduce((s, t) => s + (t.items.reduce((is, i) => is + ((i.price - (i.cost || 0)) * i.qty), 0)), 0),
    byMethod
  });
});

// Product sales report
app.get('/api/reports/product-sales', authenticateToken, (req, res) => {
  const { from, to } = req.query;
  const transactions = readFile(FILES.transactions);
  
  const fromDate = new Date(from);
  const toDate   = new Date(to);
  if (to && !to.includes('T')) toDate.setHours(23, 59, 59, 999);
  
  const filtered = transactions.filter(t => {
    const tDate = new Date(t.date);
    return tDate >= fromDate && tDate <= toDate && !t.voided;
  });
  
  const productSales = {};
  
  filtered.forEach(t => {
    t.items.forEach(item => {
      if (!productSales[item.name]) {
        productSales[item.name] = { name: item.name, qty: 0, revenue: 0, cogs: 0 };
      }
      productSales[item.name].qty += item.qty;
      productSales[item.name].revenue += item.price * item.qty;
      productSales[item.name].cogs += (item.cost || 0) * item.qty;
    });
  });
  
  const result = Object.values(productSales).map(p => ({
    ...p,
    profit: p.revenue - p.cogs,
    margin: p.revenue > 0 ? ((p.revenue - p.cogs) / p.revenue * 100).toFixed(1) : 0
  })).sort((a, b) => b.revenue - a.revenue);
  
  res.json(result);
});

// Peak hours report
app.get('/api/reports/peak-hours', authenticateToken, (req, res) => {
  const { from, to } = req.query;
  const transactions = readFile(FILES.transactions);
  
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (to && !to.includes('T')) toDate.setHours(23, 59, 59, 999);
  
  const filtered = transactions.filter(t => {
    const tDate = new Date(t.date);
    return tDate >= fromDate && tDate <= toDate && !t.voided;
  });
  
  const hours = {};
  
  filtered.forEach(t => {
    const hour = new Date(t.date).getHours();
    const timeBlock = `${String(hour).padStart(2, '0')}:00-${String(hour).padStart(2, '0')}:59`;
    
    if (!hours[timeBlock]) {
      hours[timeBlock] = { timeBlock, transactions: 0, revenue: 0 };
    }
    hours[timeBlock].transactions++;
    hours[timeBlock].revenue += t.total;
  });
  
  const result = Object.values(hours)
    .map(h => ({
      ...h,
      avgOrder: h.transactions > 0 ? h.revenue / h.transactions : 0
    }))
    .sort((a, b) => b.transactions - a.transactions)
    .map((h, i) => ({ ...h, rank: i + 1 }));
  
  res.json(result);
});

// Top products report
app.get('/api/reports/top-products', authenticateToken, (req, res) => {
  const { from, to } = req.query;
  const transactions = readFile(FILES.transactions);
  
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (to && !to.includes('T')) toDate.setHours(23, 59, 59, 999);
  
  const filtered = transactions.filter(t => {
    const tDate = new Date(t.date);
    return tDate >= fromDate && tDate <= toDate && !t.voided;
  });
  
  const productSales = {};
  
  filtered.forEach(t => {
    t.items.forEach(item => {
      if (!productSales[item.name]) {
        productSales[item.name] = { name: item.name, qty: 0, revenue: 0 };
      }
      productSales[item.name].qty += item.qty;
      productSales[item.name].revenue += item.total;
    });
  });
  
  const result = Object.values(productSales)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);
  
  res.json(result);
});

// Best sellers — global and per-category
app.get('/api/bestsellers', (req, res) => {
  const transactions = readFile(FILES.transactions);
  const products     = readFile(FILES.products);

  // Tally qty sold per product id
  const qtySold = {};
  transactions.forEach(t => {
    if (t.voided) return;
    (t.items || []).forEach(item => {
      qtySold[item.id] = (qtySold[item.id] || 0) + (item.qty || 1);
    });
  });

  // Global top product id (most qty sold)
  const globalTopId = Object.entries(qtySold)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)[0] || null;

  // Per-category top: for each category, find the product in that category
  // with the most total qty sold
  const categoryTop = {};
  products.forEach(p => {
    const tags = Array.isArray(p.categories) ? p.categories : (p.category ? [p.category] : []);
    const sold = qtySold[p.id] || 0;
    if (sold === 0) return;
    tags.forEach(catId => {
      if (!categoryTop[catId] || sold > categoryTop[catId].sold) {
        categoryTop[catId] = { id: p.id, sold };
      }
    });
  });

  res.json({
    globalTopId,
    categoryTop, // { [categoryId]: { id: productId, sold: N } }
    qtySold       // full map for reference
  });
});

// Margin alerts
app.get('/api/reports/margin-alerts', authenticateToken, (req, res) => {
  const products = readFile(FILES.products);
  const settings = readFile(FILES.settings);
  const threshold = settings.marginAlertThreshold || 30;
  
  const alerts = products
    .filter(p => p.price > 0)
    .map(p => {
      const margin = ((p.price - (p.cost || 0)) / p.price * 100);
      return { ...p, margin: margin.toFixed(1) };
    })
    .filter(p => parseFloat(p.margin) < threshold)
    .sort((a, b) => parseFloat(a.margin) - parseFloat(b.margin));
  
  res.json({ alerts, threshold });
});

// Salary deductions report
app.get('/api/reports/salary-deductions', authenticateToken, (req, res) => {
  const { from, to } = req.query;
  const transactions = readFile(FILES.transactions);
  const customers = readFile(FILES.customers);
  const creditLedger = readFile(FILES.creditLedger);
  
  const fromDate = new Date(from);
  const toDate = new Date(to);
  if (to && !to.includes('T')) toDate.setHours(23, 59, 59, 999);
  
  // Get salary transactions in date range
  const salaryTransactions = transactions.filter(t => {
    const tDate = new Date(t.date);
    return tDate >= fromDate && tDate <= toDate && t.paymentMethod === 'salary' && !t.voided;
  });
  
  // Group by employee
  const byEmployee = {};
  
  salaryTransactions.forEach(t => {
    if (!byEmployee[t.employeeId]) {
      byEmployee[t.employeeId] = {
        employeeId: t.employeeId,
        name: t.employeeName,
        transactions: 0,
        total: 0
      };
    }
    byEmployee[t.employeeId].transactions++;
    byEmployee[t.employeeId].total += t.total;
  });
  
  // Add department info and settlement status
  const employees = Object.values(byEmployee).map(e => {
    const customer = customers.find(c => c.employeeId === e.employeeId);
    const empLedger = creditLedger.filter(l => 
      l.employeeId === e.employeeId && 
      l.type === 'charge' && 
      new Date(l.date) >= fromDate && 
      new Date(l.date) <= toDate
    );
    const isSettled = empLedger.every(l => l.isSettled);
    
    return {
      ...e,
      name: customer?.name || e.name,
      department: customer?.department,
      isSettled
    };
  }).sort((a, b) => b.total - a.total);
  
  res.json({
    period: { from, to },
    employeeCount: employees.length,
    transactionCount: salaryTransactions.length,
    totalAmount: employees.reduce((s, e) => s + e.total, 0),
    employees
  });
});

// ═══════════════════════════════════════════════════════════
// AUDIT LOG ROUTES
// ═══════════════════════════════════════════════════════════

app.get('/api/audit-log', authenticateToken, (req, res) => {
  const { page = 1, limit = 50, from, to, action, export: exportAll } = req.query;
  
  let logs = readFile(FILES.auditLog);
  
  if (from) {
    logs = logs.filter(l => new Date(l.timestamp) >= new Date(from));
  }
  if (to) {
    logs = logs.filter(l => new Date(l.timestamp) <= new Date(to));
  }
  if (action) {
    logs = logs.filter(l => l.action === action);
  }
  
  if (exportAll === 'all') {
    return res.json({ entries: logs });
  }
  
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const start = (pageNum - 1) * limitNum;
  const end = start + limitNum;
  
  res.json({
    entries: logs.slice(start, end),
    totalPages: Math.ceil(logs.length / limitNum),
    currentPage: pageNum,
    total: logs.length
  });
});

// ═══════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   MBCPOS - Company Canteen POS System                      ║
║   Version 3.0.0                                            ║
║                                                            ║
║   Server running on http://localhost:${PORT}                   ║
║                                                            ║
║   Default Login:                                           ║
║   Username: admin                                          ║
║   Password: admin123                                       ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;