/**
 * MBCPOS - Register Page JavaScript
 * Version 3.0.0
 */

// ═══════════════════════════════════════════════════════════
// GLOBAL 401 INTERCEPTOR
// ═══════════════════════════════════════════════════════════

let _redirecting401 = false;
const _origFetch = window.fetch.bind(window);
window.fetch = async function(...args) {
  const res = await _origFetch(...args);
  if (res.status === 401 && !_redirecting401) {
    _redirecting401 = true;
    localStorage.removeItem('mbcpos_token');
    localStorage.removeItem('mbcpos_user');
    window.location.href = '/login.html?reason=timeout';
    return res.clone();
  }
  return res;
};

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════

const state = {
  token: localStorage.getItem('mbcpos_token'),
  user: JSON.parse(localStorage.getItem('mbcpos_user') || '{}'),
  settings: {},
  products: [],
  categories: [],
  cart: [],
  currentEmployee: null,
  currentPaymentMethod: null,
  bestsellers: { globalTopId: null, categoryTop: {}, qtySold: {} }
};

// ═══════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════

async function init() {
  if (!state.token) {
    window.location.href = '/login.html';
    return;
  }

  document.getElementById('userName').textContent =
    state.user.fullName || state.user.username || 'Cashier';

  await loadSettings();
  await loadProducts();
  await loadCategories();
  await loadBestsellers();

  console.log('Register initialized');
  REGISTER_AUTO_UPDATE.start();
}

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    if (res.ok) state.settings = await res.json();
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

async function loadProducts() {
  try {
    const res = await fetch('/api/products');
    if (res.ok) {
      state.products = await res.json();
      renderProducts();
    }
  } catch (err) {
    console.error('Failed to load products:', err);
    showToast('Failed to load products', 'error');
  }
}

async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    if (res.ok) {
      state.categories = await res.json();
      renderCategoryTabs();
    }
  } catch (err) {
    console.error('Failed to load categories:', err);
  }
}

async function loadBestsellers() {
  try {
    const res = await fetch('/api/bestsellers');
    if (res.ok) state.bestsellers = await res.json();
  } catch (err) {
    console.error('Failed to load bestsellers:', err);
  }
}

// ═══════════════════════════════════════════════════════════
// RENDER FUNCTIONS
// ═══════════════════════════════════════════════════════════

function renderCategoryTabs() {
  const container = document.getElementById('categoryTabs');
  container.innerHTML = `
    <button class="category-tab active" data-category="" onclick="filterByCategory('')">All</button>
    ${state.categories.map(c => `
      <button class="category-tab" data-category="${c.id}" onclick="filterByCategory('${c.id}')">${c.name}</button>
    `).join('')}
  `;
}

function filterByCategory(categoryId) {
  document.querySelectorAll('.category-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.category === categoryId);
  });
  renderProducts(categoryId);
}

function getBestSellerLabel(productId, categoryFilter) {
  const bs = state.bestsellers;
  if (!bs) return null;
  // Category best seller takes priority when a category is active
  if (categoryFilter && bs.categoryTop[categoryFilter]?.id === productId) {
    const cat = state.categories.find(c => c.id === categoryFilter);
    return cat ? `🏆 Best in ${cat.name}` : '🏆 Category Best Seller';
  }
  // Global best seller shown when viewing All or when no category badge applies
  if (bs.globalTopId === productId) {
    return '🏆 Best Seller';
  }
  return null;
}

function renderProducts(categoryFilter = '') {
  const container = document.getElementById('productGrid');
  let filtered = state.products;
  if (categoryFilter) filtered = filtered.filter(p => {
    const tags = Array.isArray(p.categories) ? p.categories : (p.category ? [p.category] : []);
    return tags.includes(categoryFilter);
  });

  // Sort: best seller(s) first within the current view
  filtered = [...filtered].sort((a, b) => {
    const aLabel = getBestSellerLabel(a.id, categoryFilter);
    const bLabel = getBestSellerLabel(b.id, categoryFilter);
    if (aLabel && !bLabel) return -1;
    if (!aLabel && bLabel) return 1;
    return 0;
  });

  container.innerHTML = filtered.map(p => {
    const outOfStock = p.stock <= 0;
    const lowStock = p.stock <= (p.lowStockThreshold || 10) && p.stock > 0;
    const bsLabel = getBestSellerLabel(p.id, categoryFilter);
    return `
      <div class="product-card ${outOfStock ? 'out-of-stock' : ''} ${bsLabel ? 'best-seller' : ''}"
           onclick="${outOfStock ? '' : `addToCart('${p.id}')`}">
        ${bsLabel ? `<div class="best-seller-badge">${bsLabel}</div>` : ''}
        <div class="product-image">
          ${p.image
            ? `<img src="${p.image}" alt="${p.name}">`
            : `<div class="no-image">${p.name.charAt(0)}</div>`}
        </div>
        <div class="product-info">
          <div class="name">${p.name}</div>
          <div class="price">${formatCurrency(p.price)}</div>
        </div>
        ${lowStock ? '<div class="stock-indicator" title="Low stock"></div>' : ''}
      </div>
    `;
  }).join('');
}

function renderCart() {
  const container = document.getElementById('cartItems');

  if (state.cart.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>No items in cart</p></div>`;
    updateCartTotals();
    return;
  }

  container.innerHTML = state.cart.map((item, index) => `
    <div class="cart-item">
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">${formatCurrency(item.price)} each</div>
      </div>
      <div class="cart-item-qty">
        <button class="qty-btn" onclick="updateQty(${index}, -1)">−</button>
        <span>${item.qty}</span>
        <button class="qty-btn" onclick="updateQty(${index}, 1)">+</button>
      </div>
      <div class="cart-item-total">${formatCurrency(item.price * item.qty)}</div>
      <button class="cart-item-remove" onclick="removeFromCart(${index})">×</button>
    </div>
  `).join('');

  updateCartTotals();
}

function updateCartTotals() {
  const subtotal = state.cart.reduce((s, item) => s + (item.price * item.qty), 0);
  const discountPercent = parseFloat(document.getElementById('discountInput').value) || 0;
  const discountAmount = subtotal * (discountPercent / 100);
  const afterDiscount = subtotal - discountAmount;
  const taxRate = state.settings.taxRate || 0.08;
  const tax = afterDiscount * taxRate;
  const total = afterDiscount + tax;

  document.getElementById('subtotal').textContent = formatCurrency(subtotal);
  document.getElementById('tax').textContent = formatCurrency(tax);
  document.getElementById('total').textContent = formatCurrency(total);
  document.getElementById('itemCount').textContent =
    `${state.cart.reduce((s, i) => s + i.qty, 0)} items`;
}

// ═══════════════════════════════════════════════════════════
// CART OPERATIONS
// ═══════════════════════════════════════════════════════════

function addToCart(productId) {
  const product = state.products.find(p => p.id === productId);
  if (!product) return;

  if (product.stock <= 0) { showToast('Product out of stock', 'error'); return; }

  const existingIndex = state.cart.findIndex(item => item.id === productId);

  if (existingIndex >= 0) {
    if (state.cart[existingIndex].qty >= product.stock) {
      showToast('Maximum stock reached', 'warning');
      return;
    }
    state.cart[existingIndex].qty++;
  } else {
    state.cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      cost: product.cost || 0,
      qty: 1
    });
  }

  renderCart();
}

function updateQty(index, change) {
  const item = state.cart[index];
  const product = state.products.find(p => p.id === item.id);
  const newQty = item.qty + change;

  if (newQty <= 0) { removeFromCart(index); return; }
  if (newQty > product.stock) { showToast('Maximum stock reached', 'warning'); return; }

  item.qty = newQty;
  renderCart();
}

function removeFromCart(index) {
  state.cart.splice(index, 1);
  renderCart();
}

function updateCart() { updateCartTotals(); }

function clearCart() {
  state.cart = [];
  state.currentEmployee = null;
  document.getElementById('discountInput').value = '0';
  document.getElementById('employeeIdInput').value = '';
  document.getElementById('employeeResult').innerHTML = '';
  hideEmployeeLookup();
  renderCart();
}

// ═══════════════════════════════════════════════════════════
// PAYMENT PROCESSING
// ═══════════════════════════════════════════════════════════

function processPayment(method) {
  if (state.cart.length === 0) { showToast('Cart is empty', 'error'); return; }
  state.currentPaymentMethod = method;
  if (method === 'cash') showCashModal();
  else if (method === 'card' || method === 'digital') processCardOrDigital(method);
}

function showCashModal() {
  const total = calculateTotal();
  document.getElementById('paymentTotal').textContent = formatCurrency(total);
  document.getElementById('tenderedAmount').value = '';
  document.getElementById('changeAmount').textContent = formatCurrency(0);
  document.getElementById('confirmPaymentBtn').disabled = true;
  document.getElementById('paymentModal').classList.add('active');
  document.getElementById('tenderedAmount').focus();
}

function calculateChange() {
  const total = calculateTotal();
  const tendered = parseFloat(document.getElementById('tenderedAmount').value) || 0;
  document.getElementById('changeAmount').textContent = formatCurrency(Math.max(0, tendered - total));
  document.getElementById('confirmPaymentBtn').disabled = tendered < total;
}

async function confirmCashPayment() {
  const total = calculateTotal();
  const tendered = parseFloat(document.getElementById('tenderedAmount').value) || 0;
  await completeTransaction('cash', { tendered, change: tendered - total });
  closeModal('paymentModal');
}

async function processCardOrDigital(method) {
  await completeTransaction(method);
}

// ═══════════════════════════════════════════════════════════
// EMPLOYEE LOOKUP (SALARY DEDUCTION)
// ═══════════════════════════════════════════════════════════

function showEmployeeLookup() {
  if (state.cart.length === 0) { showToast('Cart is empty', 'error'); return; }
  document.getElementById('employeeLookup').classList.add('active');
  document.getElementById('employeeIdInput').value = '';
  document.getElementById('employeeResult').innerHTML = '';
  // Small delay so the modal is visible before focusing
  setTimeout(() => document.getElementById('employeeIdInput').focus(), 80);
}

function hideEmployeeLookup() {
  document.getElementById('employeeLookup').classList.remove('active');
  state.currentEmployee = null;
}

async function lookupEmployee() {
  const employeeId = document.getElementById('employeeIdInput').value.trim();
  if (!employeeId) { showToast('Enter employee ID', 'error'); return; }

  try {
    const res = await fetch('/api/customers', {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    if (!res.ok) throw new Error('Failed to lookup employee');

    const employees = await res.json();
    const employee = employees.find(e => e.employeeId.toLowerCase() === employeeId.toLowerCase());

    if (!employee) {
      showAddEmployeeForm(employeeId);
      return;
    }

    if (!employee.isActive) {
      document.getElementById('employeeResult').innerHTML =
        `<div class="alert alert-danger" style="margin-top:10px;">Employee account is inactive</div>`;
      return;
    }

    state.currentEmployee = employee;

    document.getElementById('employeeResult').innerHTML = `
      <div class="employee-card">
        <div class="employee-card-header">
          <div class="avatar" style="background:var(--red);color:white;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;">
            ${(employee.name || employee.employeeId).charAt(0)}
          </div>
          <div>
            <div class="name">${employee.name || '(no name)'}</div>
            <div class="id">${employee.employeeId}</div>
          </div>
        </div>
        <div class="employee-card-details">
          ${employee.department ? `<div>Department: ${employee.department}</div>` : ''}
          ${employee.position  ? `<div>Position: ${employee.position}</div>`    : ''}
        </div>
        <div class="employee-balance">
          <div class="employee-balance-row">
            <span>Current Balance</span><span>${formatCurrency(employee.totalBalance || 0)}</span>
          </div>
          <div class="employee-balance-row">
            <span>This Purchase</span><span>${formatCurrency(calculateTotal())}</span>
          </div>
          <div class="employee-balance-row">
            <span>New Balance</span>
            <span>${formatCurrency((employee.totalBalance || 0) + calculateTotal())}</span>
          </div>
        </div>
        <button class="btn btn-primary" style="width:100%;margin-top:10px;" onclick="showSalaryConfirm()">Proceed</button>
      </div>
    `;
  } catch (err) {
    console.error('Failed to lookup employee:', err);
    showToast('Failed to lookup employee', 'error');
  }
}

// ═══════════════════════════════════════════════════════════
// ADD NEW EMPLOYEE (inline, when not found)
// ═══════════════════════════════════════════════════════════

function showAddEmployeeForm(prefillId) {
  document.getElementById('addEmpIdDisplay').textContent = prefillId;
  document.getElementById('newEmpId').value = prefillId;
  document.getElementById('newEmpName').value = '';
  document.getElementById('newEmpDept').value = '';
  document.getElementById('newEmpPos').value = '';
  document.getElementById('addEmpSaveBtn').disabled = false;
  document.getElementById('addEmpSaveBtn').textContent = 'Add & Charge';
  document.getElementById('addEmployeeModal').classList.add('active');
  setTimeout(() => {
    const nameInput = document.getElementById('newEmpName');
    if (nameInput) nameInput.focus();
  }, 100);
}

function closeAddEmployeeModal() {
  document.getElementById('addEmployeeModal').classList.remove('active');
}

async function saveNewEmployee() {
  const employeeId = document.getElementById('newEmpId').value.trim();
  const name       = document.getElementById('newEmpName').value.trim();
  const department = document.getElementById('newEmpDept').value.trim();
  const position   = document.getElementById('newEmpPos').value.trim();

  if (!name) {
    showToast('Full name is required', 'error');
    document.getElementById('newEmpName').focus();
    return;
  }

  const btn = document.getElementById('addEmpSaveBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  try {
    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ employeeId, name, department, position })
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Failed to add employee', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Add & Charge'; }
      return;
    }

    // Employee created — close modal, show their card and proceed
    state.currentEmployee = data;
    closeAddEmployeeModal();
    showToast(`${name} added successfully`, 'success');

    document.getElementById('employeeResult').innerHTML = `
      <div class="employee-card">
        <div class="employee-card-header">
          <div class="avatar" style="background:var(--red);color:white;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;">
            ${name.charAt(0)}
          </div>
          <div>
            <div class="name">${name} <span style="font-size:11px;background:#22c55e;color:white;border-radius:4px;padding:1px 6px;margin-left:4px;">NEW</span></div>
            <div class="id">${employeeId}</div>
          </div>
        </div>
        <div class="employee-card-details">
          ${department ? `<div>Department: ${department}</div>` : ''}
          ${position   ? `<div>Position: ${position}</div>`    : ''}
        </div>
        <div class="employee-balance">
          <div class="employee-balance-row">
            <span>This Purchase</span><span>${formatCurrency(calculateTotal())}</span>
          </div>
        </div>
        <button class="btn btn-primary" style="width:100%;margin-top:10px;" onclick="showSalaryConfirm()">Proceed to Charge</button>
      </div>
    `;
  } catch (err) {
    console.error('Failed to add employee:', err);
    showToast('Network error. Please try again.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Add & Charge'; }
  }
}

function showSalaryConfirm() {
  if (!state.currentEmployee) return;
  const employee = state.currentEmployee;
  const total = calculateTotal();

  document.getElementById('salaryEmployeeInfo').innerHTML = `
    <div class="employee-info-row"><span>Employee</span><span>${employee.name || employee.employeeId}</span></div>
    <div class="employee-info-row"><span>ID</span><span>${employee.employeeId}</span></div>
    ${employee.department ? `<div class="employee-info-row"><span>Department</span><span>${employee.department}</span></div>` : ''}
  `;

  document.getElementById('salaryItemsList').innerHTML = state.cart.map(item => `
    <div class="item-row">
      <span>${item.name} x${item.qty}</span>
      <span>${formatCurrency(item.price * item.qty)}</span>
    </div>
  `).join('');

  const subtotal = state.cart.reduce((s, item) => s + (item.price * item.qty), 0);
  const discountPercent = parseFloat(document.getElementById('discountInput').value) || 0;
  const discountAmount = subtotal * (discountPercent / 100);
  const afterDiscount = subtotal - discountAmount;
  const taxRate = state.settings.taxRate || 0.08;
  const tax = afterDiscount * taxRate;

  document.getElementById('salaryTotals').innerHTML = `
    <div class="total-row"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
    ${discountAmount > 0 ? `
      <div class="total-row"><span>Discount (${discountPercent}%)</span><span>-${formatCurrency(discountAmount)}</span></div>
    ` : ''}
    <div class="total-row"><span>Tax (${(taxRate * 100).toFixed(0)}%)</span><span>${formatCurrency(tax)}</span></div>
    <div class="total-row grand-total"><span>Total to Deduct</span><span>${formatCurrency(total)}</span></div>
  `;

  document.getElementById('salaryModal').classList.add('active');
}

async function confirmSalaryPayment() {
  await completeTransaction('salary', { employeeId: state.currentEmployee.employeeId });
  closeModal('salaryModal');
  document.getElementById('employeeLookup').classList.remove('active');
  state.currentEmployee = null;
}

// ═══════════════════════════════════════════════════════════
// TRANSACTION COMPLETION
// ═══════════════════════════════════════════════════════════

function calculateTotal() {
  const subtotal = state.cart.reduce((s, item) => s + (item.price * item.qty), 0);
  const discountPercent = parseFloat(document.getElementById('discountInput').value) || 0;
  const discountAmount = subtotal * (discountPercent / 100);
  const afterDiscount = subtotal - discountAmount;
  const taxRate = state.settings.taxRate || 0.08;
  return afterDiscount + (afterDiscount * taxRate);
}

async function completeTransaction(paymentMethod, extraData = {}) {
  const subtotal = state.cart.reduce((s, item) => s + (item.price * item.qty), 0);
  const discountPercent = parseFloat(document.getElementById('discountInput').value) || 0;
  const discountAmount = subtotal * (discountPercent / 100);
  const afterDiscount = subtotal - discountAmount;
  const taxRate = state.settings.taxRate || 0.08;
  const tax = afterDiscount * taxRate;
  const total = afterDiscount + tax;

  const transactionData = {
    items: state.cart.map(item => ({
      id: item.id, name: item.name, price: item.price, cost: item.cost, qty: item.qty
    })),
    subtotal, discount: discountAmount, tax, total, paymentMethod, ...extraData
  };

  try {
    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
      body: JSON.stringify(transactionData)
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Transaction failed');
    }
    const transaction = await res.json();
    await loadProducts();
    showReceipt(transaction, paymentMethod, extraData);
    showToast('Transaction completed!', 'success');
  } catch (err) {
    console.error('Transaction failed:', err);
    showToast(err.message || 'Transaction failed', 'error');
  }
}

// ═══════════════════════════════════════════════════════════
// RECEIPT
// ═══════════════════════════════════════════════════════════

function showReceipt(transaction, paymentMethod, extraData) {
  const settings = state.settings;

  let paymentInfo = '';
  if (paymentMethod === 'cash') {
    paymentInfo = `
      <div class="receipt-total-row"><span>Tendered</span><span>${formatCurrency(extraData.tendered)}</span></div>
      <div class="receipt-total-row"><span>Change</span><span>${formatCurrency(extraData.change)}</span></div>
    `;
  } else if (paymentMethod === 'salary') {
    paymentInfo = `
      <div class="receipt-total-row">
        <span>Employee</span>
        <span>${transaction.employeeName || state.currentEmployee?.name || extraData.employeeId}</span>
      </div>
      <div class="receipt-total-row"><span>Employee ID</span><span>${extraData.employeeId}</span></div>
    `;
  }

  document.getElementById('receiptContent').innerHTML = `
    <div class="receipt">
      <div class="receipt-header">
        <h3>${settings.canteenName || 'MBC Canteen'}</h3>
        <p>${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</p>
        <p>Transaction #${transaction.id.slice(-8)}</p>
      </div>
      <div class="receipt-type ${paymentMethod}">
        ${paymentMethod === 'salary' ? 'SALARY DEDUCTION' : paymentMethod.toUpperCase()}
      </div>
      <div class="receipt-items">
        ${transaction.items.map(item => `
          <div class="receipt-item">
            <span class="name">${item.name}</span>
            <span class="qty">x${item.qty}</span>
            <span class="price">${formatCurrency(item.price * item.qty)}</span>
          </div>
        `).join('')}
      </div>
      <div class="receipt-totals">
        <div class="receipt-total-row"><span>Subtotal</span><span>${formatCurrency(transaction.subtotal)}</span></div>
        ${transaction.discount > 0 ? `
          <div class="receipt-total-row"><span>Discount</span><span>-${formatCurrency(transaction.discount)}</span></div>
        ` : ''}
        <div class="receipt-total-row">
          <span>Tax (${((settings.taxRate || 0.08) * 100).toFixed(0)}%)</span>
          <span>${formatCurrency(transaction.tax)}</span>
        </div>
        <div class="receipt-total-row grand-total">
          <span>TOTAL</span><span>${formatCurrency(transaction.total)}</span>
        </div>
        ${paymentInfo}
      </div>
      <div class="receipt-footer">
        <p>Thank you for your purchase!</p>
        <p>Processed by: ${state.user.fullName || state.user.username}</p>
      </div>
    </div>
  `;

  document.getElementById('receiptModal').classList.add('active');
}

function printReceipt() {
  const receiptContent = document.getElementById('receiptContent').innerHTML;
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html>
      <head>
        <title>Receipt</title>
        <style>body{font-family:'Courier New',monospace;margin:20px;}.receipt{max-width:300px;margin:0 auto;}</style>
      </head>
      <body>${receiptContent}</body>
    </html>
  `);
  printWindow.document.close();
  printWindow.print();
}

function closeReceipt() {
  closeModal('receiptModal');
  clearCart();
  // Refresh bestsellers so badges update after each sale
  loadBestsellers().then(() => renderProducts(
    document.querySelector('.category-tab.active')?.dataset.category || ''
  ));
}

// ═══════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════

function formatCurrency(amount) {
  const symbol = state.settings.currency || '₱';
  return symbol + parseFloat(amount || 0).toFixed(2);
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '' : type === 'error' ? '' : ''}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

function logout() {
  localStorage.removeItem('mbcpos_token');
  localStorage.removeItem('mbcpos_user');
  window.location.href = '/login.html';
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', init);
const REGISTER_AUTO_UPDATE = {
  interval: 30000, _timer: null,
  start() {
    this._timer = setInterval(() => this._tick(), this.interval);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { clearInterval(this._timer); this._timer = null; }
      else { this._tick(); this._timer = setInterval(() => this._tick(), this.interval); }
    });
  },
  async _tick() {
    try {
      const [pr, cr] = await Promise.all([fetch('/api/products'), fetch('/api/categories')]);
      let changed = false;
      if (pr.ok) { const f = await pr.json(); if (JSON.stringify(f) !== JSON.stringify(state.products)) { state.products = f; changed = true; } }
      if (cr.ok) { const f = await cr.json(); if (JSON.stringify(f) !== JSON.stringify(state.categories)) { state.categories = f; changed = true; } }
      if (changed) { renderProducts(); renderCategories(); }
    } catch(e) {}
  }
};