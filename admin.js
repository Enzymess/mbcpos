/**
 * MBCPOS - Admin Panel JavaScript
 * Version 3.2.0 — consolidated, no duplicates
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
  customers: [],
  accounts: [],
  currentTab: 'dashboard',
  auditPage: 1,
  currentLedgerEmployee: null,
  currentLedgerData: null,
  employeePaymentFilter: 'all'
};

// ═══════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════

async function init() {
  try {
    const user = JSON.parse(localStorage.getItem('mbcpos_user') || '{}');
    const displayName = user.fullName || user.username || 'Admin';
    const el = id => document.getElementById(id);
    if (el('sidebarUserName')) el('sidebarUserName').textContent = displayName;
    if (el('sidebarUserRole') && user.role) el('sidebarUserRole').textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);
    if (el('sidebarAvatar')) el('sidebarAvatar').textContent = displayName.charAt(0).toUpperCase();
    if (el('adminName')) el('adminName').textContent = displayName;
  } catch(e) {}

  if (!state.token) { window.location.href = '/login.html'; return; }
  // All authenticated users can access this page; role determines which tabs are visible.

  await loadSettings();

  // ── Role-based UI ────────────────────────────────────────
  const _role = state.user.role || 'cashier';
  if (_role === 'cashier') {
    // Hide admin-only sidebar items
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
    // Cashier default landing tab
    await loadProducts();
    await loadCategories();
    switchTab('products');
    return; // skip admin-only dashboard load
  }

  const today = new Date().toISOString().slice(0, 10);
  const lastWeek = new Date(Date.now() - 7*86400000).toISOString().slice(0, 10);
  const el = id => document.getElementById(id);

  if (el('dailyReportDate')) el('dailyReportDate').value = today;
  if (el('productReportFrom')) el('productReportFrom').value = lastWeek;
  if (el('productReportTo')) el('productReportTo').value = today;
  if (el('peakHoursFrom')) el('peakHoursFrom').value = lastWeek;
  if (el('peakHoursTo')) el('peakHoursTo').value = today;
  if (el('topProductsFrom')) el('topProductsFrom').value = lastWeek;
  if (el('topProductsTo')) el('topProductsTo').value = today;
  if (el('journalDate')) el('journalDate').value = today;
  if (el('taxPaymentDate')) el('taxPaymentDate').value = today;
  if (el('salaryMonth')) el('salaryMonth').value = today.slice(0, 7);

  await loadDashboardData();
  console.log('Admin panel initialized');
}

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    if (res.ok) {
      state.settings = await res.json();
      const el = id => document.getElementById(id);
      if (el('settingCanteenName')) el('settingCanteenName').value = state.settings.canteenName || '';
      if (el('settingTaxRate')) el('settingTaxRate').value = (state.settings.taxRate || 0.08) * 100;
      if (el('settingMarginThreshold')) el('settingMarginThreshold').value = state.settings.marginAlertThreshold || 30;
      if (el('settingSessionTimeout')) el('settingSessionTimeout').value = state.settings.sessionTimeoutMinutes || 30;
      if (el('settingLowStockThreshold')) el('settingLowStockThreshold').value = state.settings.lowStockDefaultThreshold || 10;
      if (el('settingCurrency')) el('settingCurrency').value = state.settings.currency || '₱';
      if (el('settingCogsMode')) el('settingCogsMode').value = state.settings.cogsMode || 'per_product';
      // Update cost field hint in product modal based on global mode
      const hint = document.getElementById('costModeHint');
      if (hint) hint.textContent = (state.settings.cogsMode || 'per_product') === 'per_month'
        ? '— fixed monthly amount'
        : '— per unit sold';
    }
  } catch (err) { console.error('Failed to load settings:', err); }
}

// ═══════════════════════════════════════════════════════════
// TAB SWITCHING
// ═══════════════════════════════════════════════════════════

function switchTab(tab) {
  const _role = state.user?.role || 'cashier';
  const _cashierAllowed = ['products', 'categories', 'cashCount'];
  if (_role === 'cashier' && !_cashierAllowed.includes(tab)) {
    showToast('Access restricted for your role', 'error');
    return;
  }
  state.currentTab = tab;
  document.querySelectorAll('.sidebar-item').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById(tab + 'Tab').classList.add('active');

  switch (tab) {
    case 'dashboard':    loadDashboardData(); break;
    case 'products':     loadProducts(); break;
    case 'categories':   loadCategories(); break;
    case 'employees':    loadEmployees(); break;
    case 'accounting':   loadAccountingSummary(); break;
    case 'transactions': loadTransactions(); break;
    case 'audit':        loadAuditLog(); break;
    case 'cogsWastage':  loadCogsWastage(); break;
    case 'cashCount':    loadCashCountTab(); break;
    case 'users':        loadUsers(); break;
  }
}

function switchAccountingTab(subtab) {
  document.querySelectorAll('#accountingTab .tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.subtab === subtab));
  document.querySelectorAll('.accounting-subtab').forEach(c => c.classList.remove('active'));

  const panel = document.getElementById('accounting' + subtab.charAt(0).toUpperCase() + subtab.slice(1));
  if (panel) panel.classList.add('active');

  if (subtab === 'accounts')      loadAccounts();
  else if (subtab === 'journal')  loadJournalEntries();
  else if (subtab === 'tax')      loadTaxManagement();
  else if (subtab === 'balancesheet') loadBalanceSheet();
  else if (subtab === 'margins')  loadMarginAnalysis();
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════

async function loadDashboardData() {
  const dateEl = document.getElementById('dashboardDate');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  try {
    const [statsRes, arRes, marginRes] = await Promise.all([
      fetch('/api/stats', { headers: { 'Authorization': `Bearer ${state.token}` } }),
      fetch('/api/accounting/ar-summary', { headers: { 'Authorization': `Bearer ${state.token}` } }),
      fetch('/api/reports/margin-alerts', { headers: { 'Authorization': `Bearer ${state.token}` } })
    ]);
    if (statsRes.ok) { const s = await statsRes.json(); renderDashboardStats(s); renderRevenueChart(s.dailyData); renderLowStockWidget(s.lowStockItems); }
    if (arRes.ok)    { renderARWidget(await arRes.json()); }
    if (marginRes.ok){ const m = await marginRes.json(); renderMarginAlerts(m.alerts); }
  } catch (err) { console.error('Failed to load dashboard:', err); }
}

function renderDashboardStats(stats) {
  const c = state.settings.currency || '₱';
  document.getElementById('dashboardStats').innerHTML = `
    <div class="stat-card accent">
      <div class="label">TODAY REVENUE</div>
      <div class="value">${c}${(stats.today?.revenue||0).toFixed(2)}</div>
      <div class="sublabel">${stats.today?.count||0} transactions</div>
    </div>
    <div class="stat-card success">
      <div class="label">TODAY PROFIT</div>
      <div class="value">${c}${(stats.today?.profit||0).toFixed(2)}</div>
      <div class="sublabel">Margin: ${stats.today?.revenue>0?((stats.today.profit/stats.today.revenue)*100).toFixed(1):0}%</div>
    </div>
    <div class="stat-card navy">
      <div class="label">MONTHLY REVENUE</div>
      <div class="value">${c}${(stats.month?.revenue||0).toFixed(2)}</div>
      <div class="sublabel">${stats.month?.count||0} transactions</div>
    </div>
    <div class="stat-card warning">
      <div class="label">TOTAL PROFIT</div>
      <div class="value">${c}${(stats.all?.profit||0).toFixed(2)}</div>
      <div class="sublabel">All-time: ${c}${(stats.all?.revenue||0).toFixed(2)}</div>
    </div>`;
}

function renderRevenueChart(dailyData) {
  const ctx = document.getElementById('revenueChart');
  if (!ctx) return;
  if (window.revenueChartInstance) window.revenueChartInstance.destroy();
  window.revenueChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: dailyData.map(d => d.date),
      datasets: [
        { label: 'Revenue', data: dailyData.map(d => d.revenue), backgroundColor: 'rgba(232,25,44,0.8)', borderColor: '#E8192C', borderWidth: 1 },
        { label: 'Profit',  data: dailyData.map(d => d.profit),  backgroundColor: 'rgba(27,39,64,0.8)',  borderColor: '#1B2740', borderWidth: 1 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true }, x: { grid: { display: false } } } }
  });
}

function renderARWidget(data) {
  const c = state.settings.currency || '₱';
  document.getElementById('arWidgetBody').innerHTML = `
    <div class="period-widget-stats">
      <div class="period-widget-stat"><div class="value">${c}${(data.totalOutstanding||0).toFixed(2)}</div><div class="label">Total Outstanding</div></div>
      <div class="period-widget-stat"><div class="value">${data.employeeCount||0}</div><div class="label">Employees w/ Balance</div></div>
    </div>
    ${data.byEmployee?.length ? `
      <div class="period-top-employees"><h4>Top Balances</h4>
        ${data.byEmployee.slice(0,5).map((e,i) => `
          <div class="top-employee-row">
            <span>${i+1}. ${e.employeeId} · ${e.name||'(no name)'}</span>
            <span class="amount">${c}${e.totalUnsettled.toFixed(2)}</span>
          </div>`).join('')}
      </div>` : '<p style="color:#6B7280;text-align:center;">No outstanding receivables.</p>'}`;
}

function renderLowStockWidget(items) {
  const count = document.getElementById('lowStockCount');
  if (count) count.textContent = items?.length || 0;
  const container = document.getElementById('lowStockBody');
  if (!items?.length) { container.innerHTML = '<div class="empty-state"><p>No low stock items</p></div>'; return; }
  container.innerHTML = items.map(item => `
    <div class="low-stock-row ${item.stock===0?'critical':''}">
      <span>${item.name}</span>
      <span class="stock" style="color:${item.stock===0?'#DC2626':'#D97706'}">${item.stock}</span>
      <span style="color:#6B7280;">/ ${item.lowStockThreshold||10}</span>
      <button class="btn btn-primary btn-sm" onclick="showStockReceivingModal('${item.id}')">Restock</button>
    </div>`).join('');
}

function renderMarginAlerts(alerts) {
  const count = document.getElementById('marginAlertCount');
  if (count) count.textContent = alerts?.length || 0;
  const container = document.getElementById('marginAlertBody');
  if (!alerts?.length) { container.innerHTML = '<div class="empty-state"><p>No margin alerts</p></div>'; return; }
  container.innerHTML = alerts.slice(0,5).map(item => `
    <div class="low-stock-row">
      <span>${item.name}</span>
      <span>${formatCurrency(item.price)}</span>
      <span style="color:${item.margin<15?'#DC2626':'#D97706'};font-weight:600;">${item.margin}%</span>
      <button class="btn btn-secondary btn-sm" onclick="editProduct('${item.id}')">Edit</button>
    </div>`).join('');
}

// ═══════════════════════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════════════════════

async function loadProducts() {
  try {
    const [pr, cr] = await Promise.all([
      fetch('/api/products', { headers: { 'Authorization': `Bearer ${state.token}` } }),
      fetch('/api/categories')
    ]);
    if (pr.ok) state.products   = await pr.json();
    if (cr.ok) state.categories = await cr.json();
    renderProductsGrid();
    populateCategoryFilters();
    loadReceivingHistory();
  } catch (err) { console.error('Failed to load products:', err); }
}

function renderProductsGrid() {
  const search = document.getElementById('productSearch')?.value?.toLowerCase() || '';
  const catFilter = document.getElementById('productCategoryFilter')?.value || '';
  let filtered = state.products;
  if (search) filtered = filtered.filter(p => p.name.toLowerCase().includes(search));
  if (catFilter) filtered = filtered.filter(p => p.category === catFilter);

  document.getElementById('productsGridView').innerHTML = filtered.map(p => {
    const cat      = state.categories.find(c => c.id === p.category);
    const margin = p.price > 0 ? (((p.price - (p.cost || 0)) / p.price) * 100).toFixed(1) : 0;
    return `
      <div class="product-square-card ${margin < 30 ? 'low-margin' : ''}" onclick="editProduct('${p.id}')">
        <div class="product-card-image">
          ${p.image ? `<img src="${p.image}" alt="${p.name}">` : `<div class="no-image">${p.name.charAt(0)}</div>`}
        </div>
        <div class="product-card-content">
          <div class="product-card-name">${p.name}</div>
          <div class="product-card-category" style="background:${cat?.color || '#ccc'}">${cat?.name || 'N/A'}</div>
          <div class="product-card-price">${formatCurrency(p.price)}</div>
          <div style="font-size:11px;color:var(--text-3);margin-top:2px;">Cost: ${formatCurrency(p.cost || 0)} · ${margin}% margin</div>
          <div class="product-card-stock ${p.stock <= (p.lowStockThreshold || 10) ? 'low' : ''}">Stock: ${p.stock}</div>
        </div>
        <div class="product-card-actions">
          <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();editProduct('${p.id}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();deleteProduct('${p.id}')">Delete</button>
        </div>
      </div>`;
  }).join('');
}

function filterProducts() { renderProductsGrid(); }

function populateCategoryFilters() {
  const sel = document.getElementById('productCategoryFilter');
  if (sel) sel.innerHTML = '<option value="">All Categories</option>' + state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  const modalSel = document.getElementById('productCategory');
  if (modalSel) modalSel.innerHTML = state.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  const recSel = document.getElementById('receivingProduct');
  if (recSel) recSel.innerHTML = state.products.map(p => `<option value="${p.id}">${p.name} (Stock: ${p.stock})</option>`).join('');
}

function previewProductImage(input) {
  const preview = document.getElementById('productImagePreview');
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = e => { preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`; preview.dataset.image = e.target.result; };
    reader.readAsDataURL(input.files[0]);
  }
}

function showAddProductModal() {
  ['productId','productName','productPrice','productCost'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('productStock').value = '0';
  document.getElementById('productThreshold').value = state.settings.lowStockDefaultThreshold || 10;
  document.getElementById('productModalTitle').textContent = 'Add Product';
  document.getElementById('productImagePreview').innerHTML = '<span>No image</span>';
  delete document.getElementById('productImagePreview').dataset.image;
  document.getElementById('productImage').value = '';
  document.getElementById('productModal').classList.add('active');
}

function editProduct(id) {
  const p = state.products.find(p => p.id === id);
  if (!p) return;
  document.getElementById('productId').value = p.id;
  document.getElementById('productModalTitle').textContent = 'Edit Product';
  document.getElementById('productName').value = p.name;
  document.getElementById('productCategory').value = p.category;
  document.getElementById('productPrice').value = p.price;
  document.getElementById('productCost').value = p.cost || 0;
  document.getElementById('productStock').value = p.stock;
  document.getElementById('productThreshold').value = p.lowStockThreshold || 10;
  if (p.image) { document.getElementById('productImagePreview').innerHTML = `<img src="${p.image}" alt="Preview">`; document.getElementById('productImagePreview').dataset.image = p.image; }
  else { document.getElementById('productImagePreview').innerHTML = '<span>No image</span>'; delete document.getElementById('productImagePreview').dataset.image; }
  document.getElementById('productImage').value = '';
  document.getElementById('productModal').classList.add('active');
}

async function saveProduct() {
  const id = document.getElementById('productId').value;
  const data = {
    name:              document.getElementById('productName').value,
    category:          document.getElementById('productCategory').value,
    price:             parseFloat(document.getElementById('productPrice').value),
    cost:              parseFloat(document.getElementById('productCost').value) || 0,
    stock:             parseInt(document.getElementById('productStock').value),
    lowStockThreshold: parseInt(document.getElementById('productThreshold').value),
    image:             document.getElementById('productImagePreview').dataset.image || null
  };
  if (!data.name || !data.price) { showToast('Name and price are required', 'error'); return; }
  try {
    const res = await fetch(id ? `/api/products/${id}` : '/api/products', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
      body: JSON.stringify(data)
    });
    if (res.ok) { showToast(id ? 'Product updated' : 'Product added', 'success'); closeModal('productModal'); loadProducts(); }
    else { const e = await res.json(); showToast(e.error || 'Failed to save product', 'error'); }
  } catch (err) { showToast('Failed to save product', 'error'); }
}

async function deleteProduct(id) {
  if (!confirm('Delete this product?')) return;
  try {
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${state.token}` } });
    if (res.ok) { showToast('Product deleted', 'success'); loadProducts(); }
    else showToast('Failed to delete product', 'error');
  } catch (err) { showToast('Failed to delete product', 'error'); }
}

// ═══════════════════════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════════════════════

async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    if (res.ok) { state.categories = await res.json(); renderCategoriesGrid(); }
  } catch (err) { console.error('Failed to load categories:', err); }
}

function renderCategoriesGrid() {
  document.getElementById('categoriesGridView').innerHTML = state.categories.map(c => `
    <div class="category-square-card" onclick="editCategory('${c.id}')">
      <div class="category-card-image" style="background:${c.color}">
        ${c.image?`<img src="${c.image}" alt="${c.name}">`:`<div class="no-image">${c.name.charAt(0)}</div>`}
      </div>
      <div class="category-card-content">
        <div class="category-card-name">${c.name}</div>
        <div class="category-card-color" style="background:${c.color}"></div>
      </div>
      <div class="category-card-actions">
        <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();editCategory('${c.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();deleteCategory('${c.id}')">Delete</button>
      </div>
    </div>`).join('');
}

function previewCategoryImage(input) {
  const preview = document.getElementById('categoryImagePreview');
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = e => { preview.innerHTML = `<img src="${e.target.result}" alt="Preview">`; preview.dataset.image = e.target.result; };
    reader.readAsDataURL(input.files[0]);
  }
}

function showAddCategoryModal() {
  document.getElementById('categoryId').value = '';
  document.getElementById('categoryModalTitle').textContent = 'Add Category';
  document.getElementById('categoryName').value = '';
  document.getElementById('categoryColor').value = '#E8192C';
  document.getElementById('categoryImagePreview').innerHTML = '<span>No image</span>';
  delete document.getElementById('categoryImagePreview').dataset.image;
  document.getElementById('categoryImage').value = '';
  document.getElementById('categoryModal').classList.add('active');
}

function editCategory(id) {
  const cat = state.categories.find(c => c.id === id);
  if (!cat) return;
  document.getElementById('categoryId').value = cat.id;
  document.getElementById('categoryModalTitle').textContent = 'Edit Category';
  document.getElementById('categoryName').value = cat.name;
  document.getElementById('categoryColor').value = cat.color;
  if (cat.image) { document.getElementById('categoryImagePreview').innerHTML = `<img src="${cat.image}" alt="Preview">`; document.getElementById('categoryImagePreview').dataset.image = cat.image; }
  else { document.getElementById('categoryImagePreview').innerHTML = '<span>No image</span>'; delete document.getElementById('categoryImagePreview').dataset.image; }
  document.getElementById('categoryImage').value = '';
  document.getElementById('categoryModal').classList.add('active');
}

async function saveCategory() {
  const id = document.getElementById('categoryId').value;
  const data = { name: document.getElementById('categoryName').value, color: document.getElementById('categoryColor').value, image: document.getElementById('categoryImagePreview').dataset.image || null };
  if (!data.name) { showToast('Name is required', 'error'); return; }
  try {
    const res = await fetch(id ? `/api/categories/${id}` : '/api/categories', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
      body: JSON.stringify(data)
    });
    if (res.ok) { showToast(id ? 'Category updated' : 'Category added', 'success'); closeModal('categoryModal'); loadCategories(); }
    else showToast('Failed to save category', 'error');
  } catch (err) { showToast('Failed to save category', 'error'); }
}

async function deleteCategory(id) {
  if (!confirm('Delete this category? All products in this category will also be deleted.')) return;
  try {
    const res = await fetch(`/api/categories/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${state.token}` } });
    if (res.ok) { showToast('Category deleted', 'success'); loadCategories(); }
    else showToast('Failed to delete category', 'error');
  } catch (err) { showToast('Failed to delete category', 'error'); }
}

// ═══════════════════════════════════════════════════════════
// EMPLOYEES — live balances from AR summary
// ═══════════════════════════════════════════════════════════

async function loadEmployees() {
  try {
    const res = await fetch('/api/customers', { headers: { 'Authorization': `Bearer ${state.token}` } });
    if (res.ok) state.customers = await res.json();

    // totalBalance on the customer record is the authoritative live balance —
    // it is incremented on every salary transaction and zeroed on markEmployeePaid.
    state.customers = state.customers.map(c => {
      const balance = parseFloat(c.totalBalance) || 0;
      return { ...c, liveBalance: balance, liveIsPaid: balance <= 0 };
    });

    populateDepartmentFilter();
    renderEmployeesTable();
  } catch (err) { console.error('Failed to load employees:', err); }
}

function renderEmployeesTable() {
  const search      = document.getElementById('employeeSearch')?.value?.toLowerCase() || '';
  const deptFilter  = document.getElementById('employeeDeptFilter')?.value || '';
  const payFilter   = state.employeePaymentFilter;

  let filtered = state.customers;
  if (search)    filtered = filtered.filter(e => e.employeeId.toLowerCase().includes(search) || (e.name&&e.name.toLowerCase().includes(search)) || (e.department&&e.department.toLowerCase().includes(search)));
  if (deptFilter) filtered = filtered.filter(e => e.department === deptFilter);
  if (payFilter === 'paid')   filtered = filtered.filter(e => e.liveIsPaid);
  if (payFilter === 'unpaid') filtered = filtered.filter(e => !e.liveIsPaid);

  const tbody = document.getElementById('employeesTableBody');
  tbody.innerHTML = filtered.map(e => {
    const balance = e.liveBalance;
    const isPaid  = e.liveIsPaid;
    const paidBadge   = `<span style="display:inline-flex;align-items:center;gap:5px;background:var(--green-bg);color:#0A7A46;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:600;"><span style="width:6px;height:6px;border-radius:50%;background:#0A7A46;display:inline-block;"></span>Paid</span>`;
    const unpaidBadge = `<span style="display:inline-flex;align-items:center;gap:5px;background:var(--red-bg);color:var(--red);padding:3px 10px;border-radius:999px;font-size:11px;font-weight:600;"><span style="width:6px;height:6px;border-radius:50%;background:var(--red);display:inline-block;"></span>Unpaid</span>`;
    return `
      <tr>
        <td><strong>${e.employeeId}</strong></td>
        <td>${e.name||'(no name)'}</td>
        <td>${e.department||'-'}</td>
        <td>${e.position||'-'}</td>
        <td><strong style="color:${isPaid?'var(--green)':'var(--red)'};">${formatCurrency(balance)}</strong></td>
        <td>${isPaid ? paidBadge : unpaidBadge}</td>
        <td><span class="badge ${e.isActive?'badge-success':'badge-danger'}">${e.isActive?'Active':'Inactive'}</span></td>
        <td class="table-actions">
          <button class="btn btn-secondary btn-sm" onclick="editEmployee('${e.id}')">Edit</button>
          <button class="btn btn-secondary btn-sm" onclick="viewEmployeeLedger('${e.id}')">Ledger</button>
          ${!isPaid?`<button class="btn btn-primary btn-sm" onclick="markEmployeePaid('${e.id}')">Mark Paid</button>`:''}
          <button class="btn btn-danger btn-sm" onclick="toggleEmployee('${e.id}')">${e.isActive?'Deactivate':'Activate'}</button>
        </td>
      </tr>`;
  }).join('');
}

function filterEmployees() { renderEmployeesTable(); }

function setEmployeePaymentFilter(filter) {
  state.employeePaymentFilter = filter;
  document.querySelectorAll('.payment-filter-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.filter === filter));
  renderEmployeesTable();
}

function populateDepartmentFilter() {
  const select = document.getElementById('employeeDeptFilter');
  if (!select) return;
  const depts = [...new Set(state.customers.map(e => e.department).filter(Boolean))];
  select.innerHTML = '<option value="">All Departments</option>' + depts.map(d => `<option value="${d}">${d}</option>`).join('');
}

function showAddEmployeeModal() {
  ['employeeDbId','employeeId','employeeName','employeeDepartment','employeePosition','employeePhone','employeeEmail','employeeNotes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('employeeModalTitle').textContent = 'Add Employee';
  document.getElementById('employeeId').disabled = false;
  document.getElementById('employeeModal').classList.add('active');
}

function editEmployee(id) {
  const emp = state.customers.find(e => e.id === id);
  if (!emp) return;
  document.getElementById('employeeDbId').value       = emp.id;
  document.getElementById('employeeModalTitle').textContent = 'Edit Employee';
  document.getElementById('employeeId').value         = emp.employeeId;
  document.getElementById('employeeName').value       = emp.name || '';
  document.getElementById('employeeDepartment').value = emp.department || '';
  document.getElementById('employeePosition').value   = emp.position || '';
  document.getElementById('employeePhone').value      = emp.phone || '';
  document.getElementById('employeeEmail').value      = emp.email || '';
  document.getElementById('employeeNotes').value      = emp.notes || '';
  document.getElementById('employeeId').disabled = true;
  document.getElementById('employeeModal').classList.add('active');
}

async function saveEmployee() {
  const id = document.getElementById('employeeDbId').value;
  const data = {
    employeeId:  document.getElementById('employeeId').value,
    name:        document.getElementById('employeeName').value,
    department:  document.getElementById('employeeDepartment').value,
    position:    document.getElementById('employeePosition').value,
    phone:       document.getElementById('employeePhone').value,
    email:       document.getElementById('employeeEmail').value,
    notes:       document.getElementById('employeeNotes').value
  };
  if (!data.employeeId) { showToast('Employee ID is required', 'error'); return; }
  try {
    const res = await fetch(id ? `/api/customers/${id}` : '/api/customers', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
      body: JSON.stringify(data)
    });
    if (res.ok) { showToast(id ? 'Employee updated' : 'Employee added', 'success'); closeModal('employeeModal'); loadEmployees(); }
    else { const e = await res.json(); showToast(e.error || 'Failed to save employee', 'error'); }
  } catch (err) { showToast('Failed to save employee', 'error'); }
}

async function toggleEmployee(id) {
  const emp = state.customers.find(e => e.id === id);
  if (!emp) return;
  const action = emp.isActive ? 'deactivate' : 'activate';
  if (!confirm(`${action.charAt(0).toUpperCase()+action.slice(1)} this employee?`)) return;
  try {
    const res = await fetch(`/api/customers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
      body: JSON.stringify({ isActive: !emp.isActive })
    });
    if (res.ok) { showToast(`Employee ${action}d`, 'success'); loadEmployees(); }
    else showToast('Failed to update employee', 'error');
  } catch (err) { showToast('Failed to update employee', 'error'); }
}

async function markEmployeePaid(id) {
  const emp = state.customers.find(e => e.id === id);
  if (!emp) return;
  const balance = emp.liveBalance || 0;
  if (balance === 0) { showToast('No outstanding balance', 'info'); return; }
  if (!confirm(`Mark ${emp.name||emp.employeeId} as paid? This clears ${formatCurrency(balance)}.`)) return;
  try {
    const res = await fetch(`/api/customers/${id}/pay`, { method: 'POST', headers: { 'Authorization': `Bearer ${state.token}` } });
    if (res.ok) { showToast('Employee marked as paid', 'success'); loadEmployees(); }
    else { const e = await res.json(); showToast(e.error || 'Failed to mark as paid', 'error'); }
  } catch (err) { showToast('Failed to mark as paid', 'error'); }
}

async function viewEmployeeLedger(id) {
  const emp = state.customers.find(e => e.id === id);
  if (!emp) return;
  state.currentLedgerEmployee = emp;

  try {
    const res = await fetch(`/api/credit-ledger/employee/${emp.employeeId}`, { headers: { 'Authorization': `Bearer ${state.token}` } });
    if (!res.ok) throw new Error('Failed to load ledger');
    const ledger = await res.json();
    state.currentLedgerData = ledger;

    const displayName    = emp.name || emp.employeeId;
    const pendingEntries = ledger.filter(l => l.type === 'charge' && !l.isSettled);
    const totalPending   = pendingEntries.reduce((s, l) => s + l.amount, 0);
    const totalSettled   = ledger.filter(l => l.type === 'charge' && l.isSettled).reduce((s, l) => s + l.amount, 0);
    const isPaid         = totalPending === 0;

    document.getElementById('ledgerModalBody').innerHTML = `
      <div style="margin-bottom:20px;">
        <h3>${displayName}</h3>
        <p style="color:var(--text-3);">${emp.employeeId}${emp.department ? ' · ' + emp.department : ''}</p>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:15px;">
          <div style="background:var(--red-bg);padding:15px;border-radius:var(--r-lg);text-align:center;border:1px solid #fca5a5;">
            <div style="font-size:11px;color:var(--text-3);margin-bottom:4px;">AMOUNT OWED</div>
            <div style="font-size:22px;font-weight:700;color:${isPaid?'var(--green)':'var(--red)'};">${formatCurrency(totalPending)}</div>
          </div>
          <div style="background:var(--green-bg);padding:15px;border-radius:var(--r-lg);text-align:center;border:1px solid #86efac;">
            <div style="font-size:11px;color:var(--text-3);margin-bottom:4px;">TOTAL SETTLED</div>
            <div style="font-size:22px;font-weight:700;color:var(--green);">${formatCurrency(totalSettled)}</div>
          </div>
          <div style="background:var(--bg);padding:15px;border-radius:var(--r-lg);text-align:center;border:1px solid var(--border);">
            <div style="font-size:11px;color:var(--text-3);margin-bottom:4px;">TOTAL CHARGED</div>
            <div style="font-size:22px;font-weight:700;">${formatCurrency(totalPending+totalSettled)}</div>
          </div>
        </div>
        <div style="margin-top:10px;text-align:center;">
          <span class="badge ${isPaid?'badge-success':'badge-warning'}" style="font-size:13px;padding:5px 14px;">
            ${isPaid?'FULLY PAID':'HAS OUTSTANDING BALANCE'}
          </span>
        </div>
      </div>

      ${pendingEntries.length ? `
        <h4 style="margin-bottom:10px;color:var(--red);">Outstanding / Unpaid Charges</h4>
        <div class="table-container">
          <table class="data-table">
            <thead><tr><th>Date</th><th>Items</th><th>Amount Owed</th></tr></thead>
            <tbody>
              ${pendingEntries.map(l => `
                <tr>
                  <td>${new Date(l.date).toLocaleDateString()}</td>
                  <td>${l.items.map(i => `${i.name} x${i.qty}`).join(', ')}</td>
                  <td><strong style="color:var(--red);">${formatCurrency(l.amount)}</strong></td>
                </tr>`).join('')}
              <tr style="background:var(--red-bg);">
                <td colspan="2"><strong>Total Amount Owed</strong></td>
                <td><strong style="color:var(--red);">${formatCurrency(totalPending)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>` : `<p style="color:var(--green);text-align:center;padding:20px;">No outstanding charges.</p>`}`;

    document.getElementById('ledgerModal').classList.add('active');
  } catch (err) { showToast('Failed to load ledger', 'error'); }
}

function printEmployeeLedger() {
  if (!state.currentLedgerEmployee || !state.currentLedgerData) return;
  const emp         = state.currentLedgerEmployee;
  const ledger      = state.currentLedgerData;
  const displayName = emp.name || emp.employeeId;
  const c           = state.settings.currency || '₱';

  // Only print unpaid/pending charges
  const pendingEntries = ledger.filter(l => l.type === 'charge' && !l.isSettled);
  const totalOwed      = pendingEntries.reduce((s, l) => s + l.amount, 0);

  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html><head>
      <title>Ledger - ${displayName}</title>
      <style>
        body{font-family:Arial,sans-serif;margin:24px;color:#111;}
        h2{color:#1B2740;margin:0;}
        .header{margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #E8192C;}
        .meta{color:#555;font-size:13px;margin-top:6px;}
        .summary{display:flex;gap:16px;margin:20px 0;}
        .summary-box{flex:1;padding:14px;border-radius:8px;text-align:center;}
        .owed{background:#FFF0F1;border:1px solid #fca5a5;}
        .owed .val{font-size:22px;font-weight:700;color:#E8192C;}
        .label{font-size:11px;color:#888;text-transform:uppercase;margin-bottom:4px;}
        table{width:100%;border-collapse:collapse;margin-top:16px;}
        th{background:#1B2740;color:white;padding:10px 12px;text-align:left;font-size:12px;}
        td{padding:9px 12px;border-bottom:1px solid #eee;font-size:13px;}
        .total-row td{background:#FFF0F1;font-weight:700;color:#E8192C;}
        .footer{margin-top:40px;padding-top:16px;border-top:1px solid #ddd;font-size:12px;color:#555;}
        .no-outstanding{text-align:center;padding:20px;color:green;font-size:14px;}
      </style>
    </head><body>
      <div class="header">
        <h2>EMPLOYEE LEDGER — AMOUNT OWED</h2>
        <p style="font-weight:600;margin:4px 0;">${state.settings.canteenName||'Company Canteen'}</p>
        <p class="meta">Generated: ${new Date().toLocaleString()}</p>
      </div>

      <p><strong>Employee:</strong> ${displayName} &nbsp;|&nbsp; <strong>ID:</strong> ${emp.employeeId}${emp.department?` &nbsp;|&nbsp; <strong>Dept:</strong> ${emp.department}`:''}</p>

      <div class="summary">
        <div class="summary-box owed">
          <div class="label">Total Amount Owed</div>
          <div class="val">${c}${totalOwed.toFixed(2)}</div>
        </div>
      </div>

      ${pendingEntries.length ? `
        <h3 style="margin-bottom:8px;">Outstanding Charges</h3>
        <table>
          <thead><tr><th>Date</th><th>Items Purchased</th><th>Amount Owed</th></tr></thead>
          <tbody>
            ${pendingEntries.map(l => `
              <tr>
                <td>${new Date(l.date).toLocaleDateString()}</td>
                <td>${l.items.map(i => `${i.name} x${i.qty}`).join(', ')}</td>
                <td>${c}${l.amount.toFixed(2)}</td>
              </tr>`).join('')}
            <tr class="total-row">
              <td colspan="2">TOTAL AMOUNT OWED</td>
              <td>${c}${totalOwed.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>` : `<p class="no-outstanding">No outstanding charges — fully paid.</p>`}

      <div class="footer">
        <p><strong>Prepared by:</strong> ${state.user.fullName||state.user.username}</p>
        <p><strong>Employee Signature:</strong> _________________________</p>
        <p><strong>Authorized by:</strong> _________________________</p>
      </div>
    </body></html>`);
  printWindow.document.close();
  printWindow.print();
}

// ═══════════════════════════════════════════════════════════
// STOCK RECEIVING
// ═══════════════════════════════════════════════════════════

function showStockReceivingModal(productId = null) {
  ['receivingQty','receivingCost','receivingSupplier','receivingReference','receivingNotes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('receivingPayment').value = 'cash';
  if (productId) document.getElementById('receivingProduct').value = productId;
  document.getElementById('receivingModal').classList.add('active');
}

async function saveReceiving() {
  const data = {
    productId:        document.getElementById('receivingProduct').value,
    quantityReceived: parseInt(document.getElementById('receivingQty').value),
    unitCost:         parseFloat(document.getElementById('receivingCost').value),
    paymentMethod:    document.getElementById('receivingPayment').value,
    supplierName:     document.getElementById('receivingSupplier').value,
    referenceNumber:  document.getElementById('receivingReference').value,
    notes:            document.getElementById('receivingNotes').value
  };
  if (!data.productId || !data.quantityReceived || !data.unitCost) { showToast('Product, quantity, and unit cost are required', 'error'); return; }
  try {
    const res = await fetch('/api/stock-receiving', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
      body: JSON.stringify(data)
    });
    if (res.ok) { showToast('Stock received and journal entry posted', 'success'); closeModal('receivingModal'); loadProducts(); loadReceivingHistory(); }
    else { const e = await res.json(); showToast(e.error || 'Failed to record receipt', 'error'); }
  } catch (err) { showToast('Failed to record receipt', 'error'); }
}

async function loadReceivingHistory() {
  try {
    const res = await fetch('/api/stock-receiving', { headers: { 'Authorization': `Bearer ${state.token}` } });
    if (res.ok) {
      const receiving = await res.json();
      document.getElementById('receivingTableBody').innerHTML = receiving.slice(0,10).map(r => `
        <tr>
          <td>${new Date(r.date).toLocaleDateString()}</td>
          <td>${r.productName}</td>
          <td>${r.quantityReceived}</td>
          <td>${formatCurrency(r.unitCost)}</td>
          <td>${formatCurrency(r.totalCost)}</td>
          <td>${r.paymentMethod==='cash'?'Cash':'Account'}</td>
          <td>${r.supplierName||'-'}</td>
        </tr>`).join('');
    }
  } catch (err) { console.error('Failed to load receiving history:', err); }
}

// ═══════════════════════════════════════════════════════════
// ACCOUNTING
// ═══════════════════════════════════════════════════════════

async function loadAccountingSummary() {
  try {
    const [accountsRes, tbRes, arRes] = await Promise.all([
      fetch('/api/accounting/accounts',      { headers: { 'Authorization': `Bearer ${state.token}` } }),
      fetch('/api/accounting/trial-balance', { headers: { 'Authorization': `Bearer ${state.token}` } }),
      fetch('/api/accounting/ar-summary',    { headers: { 'Authorization': `Bearer ${state.token}` } })
    ]);
    if (accountsRes.ok) state.accounts = await accountsRes.json();
    if (tbRes.ok) renderAccountingSummaryCards(await tbRes.json());
    if (arRes.ok) renderARSummary(await arRes.json());
    await loadIncomeStatement();
  } catch (err) { console.error('Failed to load accounting summary:', err); }
}

function renderAccountingSummaryCards(tb) {
  const c = state.settings.currency || '₱';
  const a = code => tb.accounts.find(a => a.code === code);
  const rev4001 = a('4001')?.creditTotal || 0;
  const rev4002 = a('4002')?.creditTotal || 0;
  const cogs    = a('5001')?.debitTotal  || 0;
  const disc    = a('5002')?.debitTotal  || 0;
  const arD     = a('1002')?.debitTotal  || 0;
  const arC     = a('1002')?.creditTotal || 0;
  const taxC    = a('2002')?.creditTotal || 0;
  const taxD    = a('2002')?.debitTotal  || 0;

  const totalRevenue  = rev4001 + rev4002;
  const netIncome     = totalRevenue - cogs - disc;
  const arOutstanding = arD - arC;
  const taxOutstanding= taxC - taxD;

  document.getElementById('accountingSummaryCards').innerHTML = `
    <div class="accounting-summary-card" onclick="switchAccountingTab('accounts')">
      <div class="card-label">Total Revenue</div><div class="card-value">${c}${totalRevenue.toFixed(2)}</div>
      <div class="card-sub">Chart of Accounts</div><span class="nav-hint">→</span>
    </div>
    <div class="accounting-summary-card navy" onclick="switchAccountingTab('journal')">
      <div class="card-label">Net Income</div><div class="card-value">${c}${netIncome.toFixed(2)}</div>
      <div class="card-sub">Journal Entries</div><span class="nav-hint">→</span>
    </div>
    <div class="accounting-summary-card" onclick="switchAccountingTab('accounts')">
      <div class="card-label">Total COGS</div><div class="card-value">${c}${cogs.toFixed(2)}</div>
      <div class="card-sub">Chart of Accounts</div><span class="nav-hint">→</span>
    </div>
    <div class="accounting-summary-card warning" onclick="switchAccountingTab('accounts')">
      <div class="card-label">A/R Balance</div><div class="card-value">${c}${arOutstanding.toFixed(2)}</div>
      <div class="card-sub">Chart of Accounts</div><span class="nav-hint">→</span>
    </div>
    <div class="accounting-summary-card tax" onclick="switchAccountingTab('tax')">
      <div class="card-label">Tax Payable</div><div class="card-value">${c}${taxOutstanding.toFixed(2)}</div>
      <div class="card-sub">Click to Remit</div><span class="nav-hint">→</span>
    </div>`;
}

function renderARSummary(ar) {
  const c = state.settings.currency || '₱';
  document.getElementById('arSummaryBody').innerHTML = `
    <div style="margin-bottom:16px;"><strong>Total Outstanding: ${c}${(ar.totalOutstanding||0).toFixed(2)}</strong></div>
    ${ar.byEmployee?.length ? `
      <div class="table-container">
        <table class="data-table">
          <thead><tr><th>Employee</th><th>Department</th><th>Amount</th></tr></thead>
          <tbody>${ar.byEmployee.slice(0,10).map(e => `
            <tr><td>${e.name||e.employeeId}</td><td>${e.dept||'-'}</td><td>${c}${(e.totalUnsettled||0).toFixed(2)}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>` : '<p style="color:#6B7280;">No outstanding receivables.</p>'}`;
}

async function loadIncomeStatement() {
  const period = document.getElementById('incomePeriod').value;
  const today  = new Date();
  let from, to;
  const showCustom = period === 'custom';
  document.getElementById('incomeFrom').style.display = showCustom ? 'inline-block' : 'none';
  document.getElementById('incomeTo').style.display   = showCustom ? 'inline-block' : 'none';
  if (period === 'monthly')   { from = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0,10); to = today.toISOString().slice(0,10); }
  else if (period === 'quarterly') { const q = Math.floor(today.getMonth()/3); from = new Date(today.getFullYear(), q*3, 1).toISOString().slice(0,10); to = today.toISOString().slice(0,10); }
  else if (period === 'yearly') { from = new Date(today.getFullYear(), 0, 1).toISOString().slice(0,10); to = today.toISOString().slice(0,10); }
  else { from = document.getElementById('incomeFrom').value; to = document.getElementById('incomeTo').value; if (!from||!to) return; }

  try {
    const res = await fetch(`/api/accounting/income-statement?from=${from}&to=${to}`, { headers: { 'Authorization': `Bearer ${state.token}` } });
    if (!res.ok) throw new Error();
    const d = await res.json();
    const c = state.settings.currency || '₱';
    document.getElementById('incomeStatementBody').innerHTML = `
      <div class="income-statement">
        <div class="income-row"><span><strong>Revenue</strong></span><span></span></div>
        <div class="income-row indent"><span>Cash / Card / Digital</span><span>${c}${(d.cashRevenue||0).toFixed(2)}</span></div>
        <div class="income-row indent"><span>Salary Deduction</span><span>${c}${(d.salaryDeductionRevenue||0).toFixed(2)}</span></div>
        <div class="income-row total"><span>Total Revenue</span><span>${c}${(d.totalRevenue||0).toFixed(2)}</span></div>
        <div class="income-row indent negative"><span>Cost of Goods Sold</span><span>(${c}${(d.cogs||0).toFixed(2)})</span></div>
        <div class="income-row grand-total"><span>Gross Profit</span><span>${c}${(d.grossProfit||0).toFixed(2)}</span></div>
        <div class="income-row"><span style="color:#6B7280;">Gross Margin: ${d.grossMargin||0}%</span><span></span></div>
        <div class="income-row indent negative"><span>Discounts Given</span><span>(${c}${(d.discounts||0).toFixed(2)})</span></div>
        <div class="income-row grand-total" style="border-top:2px solid var(--navy);"><span>Net Income</span><span>${c}${(d.netIncome||0).toFixed(2)}</span></div>
      </div>`;
  } catch (err) { showToast('Failed to load income statement', 'error'); }
}

// ═══════════════════════════════════════════════════════════
// CHART OF ACCOUNTS
// ═══════════════════════════════════════════════════════════

async function loadAccounts() {
  try {
    const period = document.getElementById('coaPeriod').value;
    const url = '/api/accounting/accounts' + (period !== 'all' ? `?period=${period}` : '');
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${state.token}` } });
    if (res.ok) { state.accounts = await res.json(); renderAccountsTable(); }
  } catch (err) { console.error('Failed to load accounts:', err); }
}

function renderAccountsTable() {
  const tbody = document.getElementById('accountsTableBody');
  const c = state.settings.currency || '₱';
  const typeColors = { asset:'badge-info', liability:'badge-warning', equity:'badge-navy', revenue:'badge-success', expense:'badge-danger' };
  const typeLabels = { asset:'ASSETS (1000-1999)', liability:'LIABILITIES (2000-2999)', equity:'EQUITY (3000-3999)', revenue:'REVENUE (4000-4999)', expense:'EXPENSES (5000+)' };
  const grouped = { asset:[], liability:[], equity:[], revenue:[], expense:[] };
  state.accounts.forEach(a => { if (grouped[a.type]) grouped[a.type].push(a); });

  let html = '';
  ['asset','liability','equity','revenue','expense'].forEach(type => {
    const accounts = grouped[type];
    if (!accounts.length) return;
    const groupDebit   = accounts.reduce((s,a) => s+(a.debitTotal||0), 0);
    const groupCredit  = accounts.reduce((s,a) => s+(a.creditTotal||0), 0);
    const groupBalance = accounts.reduce((s,a) => s+(a.normal==='debit'?(a.debitTotal||0)-(a.creditTotal||0):(a.creditTotal||0)-(a.debitTotal||0)), 0);
    html += `<tr class="account-group-header"><td colspan="8" style="background:var(--navy);color:white;font-weight:700;padding:10px 16px;">${typeLabels[type]}</td></tr>`;
    accounts.forEach(a => {
      const balance = a.normal==='debit'?(a.debitTotal||0)-(a.creditTotal||0):(a.creditTotal||0)-(a.debitTotal||0);
      html += `<tr>
        <td><strong>${a.code}</strong></td>
        <td>${a.name} ${a.isSystem?'<span class="badge">System</span>':''}</td>
        <td><span class="badge ${typeColors[a.type]}">${a.type}</span></td>
        <td>${a.normal}</td>
        <td>${c}${(a.debitTotal||0).toFixed(2)}</td>
        <td>${c}${(a.creditTotal||0).toFixed(2)}</td>
        <td><strong>${c}${balance.toFixed(2)}</strong></td>
        <td class="table-actions">
          ${!a.isSystem?`<button class="btn btn-secondary btn-sm" onclick="editAccount('${a.code}')">Edit</button><button class="btn btn-danger btn-sm" onclick="deleteAccount('${a.code}')">Delete</button>`:'<span class="badge">System</span>'}
        </td></tr>`;
    });
    html += `<tr class="account-group-total">
      <td colspan="4" style="text-align:right;font-weight:700;background:var(--bg);">Total ${type.charAt(0).toUpperCase()+type.slice(1)}:</td>
      <td style="font-weight:700;background:var(--bg);">${c}${groupDebit.toFixed(2)}</td>
      <td style="font-weight:700;background:var(--bg);">${c}${groupCredit.toFixed(2)}</td>
      <td style="font-weight:700;background:var(--bg);color:var(--navy);">${c}${groupBalance.toFixed(2)}</td>
      <td style="background:var(--bg);"></td></tr>
    <tr><td colspan="8" style="height:10px;"></td></tr>`;
  });
  tbody.innerHTML = html || '<tr><td colspan="8" class="empty-state">No accounts found</td></tr>';
}

function showAddAccountModal() {
  document.getElementById('accountModalTitle').textContent = 'Add Account';
  document.getElementById('accountDbId').value        = '';
  document.getElementById('accountCode').value        = '';
  document.getElementById('accountCode').disabled     = false;
  document.getElementById('accountName').value        = '';
  document.getElementById('accountType').value        = 'expense';
  document.getElementById('accountType').disabled     = false;
  document.getElementById('accountDescription').value = '';
  window._isEditingAccount = false;
  window._editingAccountCode = null;
  document.getElementById('accountModal').classList.add('active');
}

function editAccount(code) {
  const account = state.accounts.find(a => a.code === code);
  if (!account) return;
  document.getElementById('accountModalTitle').textContent = 'Edit Account';
  document.getElementById('accountDbId').value        = account.code;
  document.getElementById('accountCode').value        = account.code;
  document.getElementById('accountCode').disabled     = true;
  document.getElementById('accountName').value        = account.name;
  document.getElementById('accountType').value        = account.type;
  document.getElementById('accountType').disabled     = !!account.isSystem;
  document.getElementById('accountDescription').value = account.description || '';
  window._isEditingAccount   = true;
  window._editingAccountCode = code;
  document.getElementById('accountModal').classList.add('active');
}

async function saveAccount() {
  const isEdit = !!window._isEditingAccount;
  const code   = isEdit ? window._editingAccountCode : document.getElementById('accountCode').value;
  const name   = document.getElementById('accountName').value.trim();
  const desc   = document.getElementById('accountDescription').value.trim();
  const type   = document.getElementById('accountType').value;

  if (!code || !name) { showToast('Code and name are required', 'error'); return; }

  try {
    const res = await fetch(isEdit ? `/api/accounting/accounts/${code}` : '/api/accounting/accounts', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
      body: JSON.stringify(isEdit ? { name, description: desc } : { code, name, type, description: desc })
    });
    if (res.ok) {
      showToast(isEdit ? 'Account updated' : 'Account added', 'success');
      closeModal('accountModal');
      window._isEditingAccount = false;
      window._editingAccountCode = null;
      loadAccounts();
    } else { const e = await res.json(); showToast(e.error || 'Failed to save account', 'error'); }
  } catch (err) { showToast('Failed to save account', 'error'); }
}

async function deleteAccount(code) {
  if (!confirm('Delete this account?')) return;
  try {
    const res = await fetch(`/api/accounting/accounts/${code}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${state.token}` } });
    if (res.ok) { showToast('Account deleted', 'success'); loadAccounts(); }
    else { const e = await res.json(); showToast(e.error || 'Failed to delete account', 'error'); }
  } catch (err) { showToast('Failed to delete account', 'error'); }
}

// ═══════════════════════════════════════════════════════════
// BALANCE SHEET
// ═══════════════════════════════════════════════════════════

(function injectBSStyles() {
  if (document.getElementById('bs-styles')) return;
  const s = document.createElement('style');
  s.id = 'bs-styles';
  s.textContent = `
    .bs-wrapper{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:4px;}
    @media(max-width:900px){.bs-wrapper{grid-template-columns:1fr;}}
    .bs-section{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden;margin-bottom:16px;}
    .bs-section-title{background:var(--navy);color:#fff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:10px 16px;}
    .bs-table{width:100%;border-collapse:collapse;}
    .bs-table thead th{background:var(--bg);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3);padding:8px 16px;border-bottom:1px solid var(--border);}
    .bs-table thead th:last-child{text-align:right;}
    .bs-table tbody td{padding:10px 16px;font-size:13px;border-bottom:1px solid var(--border-light);color:var(--text);vertical-align:middle;}
    .bs-table tbody tr:last-child td{border-bottom:none;}
    .bs-table tbody tr:hover{background:var(--bg);}
    .bs-code{font-family:monospace;font-size:11px;color:var(--text-3);width:52px;}
    .bs-name{color:var(--text-2);}
    .bs-balance-cell{text-align:right;width:160px;}
    .bs-balance-display{display:inline-flex;align-items:center;gap:6px;cursor:pointer;padding:4px 8px;border-radius:var(--r-sm);transition:background var(--t-fast);font-variant-numeric:tabular-nums;font-weight:500;}
    .bs-balance-display:hover{background:var(--blue-bg);}
    .bs-edit-icon{opacity:0;font-size:10px;color:var(--blue);transition:opacity var(--t-fast);}
    .bs-balance-display:hover .bs-edit-icon{opacity:1;}
    .bs-balance-input-wrap{display:none;align-items:center;gap:4px;justify-content:flex-end;}
    .bs-balance-input-wrap.active{display:flex;}
    .bs-balance-input{width:88px;padding:4px 8px;border:1.5px solid var(--blue);border-radius:var(--r-sm);font-size:13px;font-family:inherit;font-variant-numeric:tabular-nums;text-align:right;outline:none;color:var(--text);background:var(--surface);}
    .bs-save-btn{background:var(--blue);color:#fff;border:none;border-radius:var(--r-sm);padding:4px 8px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:inherit;}
    .bs-save-btn:hover{opacity:.88;}
    .bs-cancel-btn{background:none;border:none;color:var(--text-3);cursor:pointer;font-size:13px;padding:2px 4px;line-height:1;}
    .bs-cancel-btn:hover{color:var(--red);}
    .bs-tfoot td{padding:10px 16px;font-size:13px;font-weight:700;background:var(--bg);border-top:2px solid var(--border);color:var(--text);}
    .bs-tfoot td:last-child{text-align:right;font-variant-numeric:tabular-nums;}
    .bs-check{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-radius:var(--r-lg);font-size:13px;font-weight:600;border:1px solid;margin-top:4px;}
    .bs-check.balanced{background:var(--green-bg);color:#0A7A46;border-color:#86efac;}
    .bs-check.unbalanced{background:var(--red-bg);color:var(--red-dark);border-color:#fca5a5;}
    .bs-status{font-weight:700;font-size:13px;}
    .bs-negative-row{background:var(--red-bg)!important;}
    .bs-negative-row:hover{background:#ffe4e6!important;}
    .bs-reconcile-btn{display:inline-flex;align-items:center;gap:4px;margin-left:8px;background:var(--red);color:#fff;border:none;border-radius:var(--r-sm);padding:3px 9px;font-size:10px;font-weight:700;cursor:pointer;font-family:inherit;}
    .bs-reconcile-btn:hover{background:var(--red-dark);}`;
  document.head.appendChild(s);
})();

async function loadBalanceSheet() {
  const body = document.getElementById('balanceSheetBody');
  if (!body) return;
  body.innerHTML = '<div class="empty-state"><p>Loading...</p></div>';
  try {
    // Fetch trial balance and all-time income statement in parallel
    const [tbRes, incRes] = await Promise.all([
      fetch('/api/accounting/trial-balance',      { headers: { Authorization: `Bearer ${state.token}` } }),
      fetch('/api/accounting/income-statement',    { headers: { Authorization: `Bearer ${state.token}` } })
    ]);
    if (!tbRes.ok) throw new Error('Failed to load trial balance');
    const tb  = await tbRes.json();
    const inc = incRes.ok ? await incRes.json() : null;

    const c   = state.settings.currency || '\u20b1';
    const fmt = n => c + parseFloat(n||0).toFixed(2);

    const assets      = tb.accounts.filter(a => a.type === 'asset');
    const liabilities = tb.accounts.filter(a => a.type === 'liability');
    // Equity rows except 3002 — we'll render RE separately with the formula
    const equityOther = tb.accounts.filter(a => a.type === 'equity' && a.code !== '3002');
    const re3002      = tb.accounts.find(a => a.code === '3002');

    // ── Retained Earnings formula ─────────────────────────────
    // RE = Opening Balance (journal entries to 3002) + Current Period Net Income
    // Net Income = Total Revenue − COGS − Discounts  (from income statement)
    const reOpening   = re3002 ? (re3002.balance || 0) : 0;
    const netIncome   = inc ? (inc.netIncome || 0) : 0;
    const totalRevenue= inc ? (inc.totalRevenue || 0) : 0;
    const cogs        = inc ? (inc.cogs || 0) : 0;
    const discounts   = inc ? (inc.discounts || 0) : 0;
    const reComputed  = reOpening + netIncome;

    const excludedMonths = inc?.monthsExcludedFromPerProductCogs || [];
    const cogsMode_bs    = inc?.cogsMode || 'per_product';
    const cogsNote = (cogsMode_bs === 'per_month' && excludedMonths.length > 0)
      ? `<div style="background:var(--bg);border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:var(--r-sm);padding:8px 12px;font-size:12px;color:var(--text-2);margin-bottom:14px;"><strong style="color:var(--accent);">Monthly COGS Mode</strong> — Per-product COGS (Acct 5001) excluded for ${excludedMonths.length} month(s) with a posted Monthly Fixed COGS (Acct 5006): <strong>${excludedMonths.join(', ')}</strong>.</div>`
      : '';

    // Full equity including computed RE
    const allEquity   = [...equityOther, { code:'3002', name:'Retained Earnings', balance: reComputed, normal:'credit', isSystem:true, _isRE: true }];
    const sum         = arr => arr.reduce((s,a) => s+(a.balance||0), 0);
    const tA          = sum(assets);
    const tL          = sum(liabilities);
    const tE          = sum(allEquity);
    const lE          = tL + tE;
    const isOk        = Math.abs(tA - lE) < 0.01;

    // ── Row renderers ─────────────────────────────────────────
    const renderNormalRow = a => {
      const isNegativeAsset = a.type === 'asset' && (a.balance || 0) < 0;
      const warningBadge = isNegativeAsset
        ? `<span style="display:inline-flex;align-items:center;gap:4px;background:var(--red-bg);color:var(--red);font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;margin-left:6px;">Negative</span>`
        : '';
      const reconcileBtn = a.code === '1002' && isNegativeAsset
        ? `<button class="bs-reconcile-btn" onclick="bsReconcileAR()" title="Reconcile AR balance against actual unsettled charges">Reconcile AR</button>`
        : '';
      return `
        <tr data-code="${a.code}" data-balance="${a.balance||0}" data-normal="${a.normal}" ${isNegativeAsset ? 'class="bs-negative-row"' : ''}>
          <td class="bs-code">${a.code}</td>
          <td class="bs-name">${a.name}${warningBadge}${reconcileBtn}</td>
          <td class="bs-balance-cell">
            <span class="bs-balance-display" onclick="bsStartEdit(this)" style="color:${isNegativeAsset?'var(--red)':''};">${fmt(a.balance)}<span class="bs-edit-icon"></span></span>
            <span class="bs-balance-input-wrap">
              <input class="bs-balance-input" type="number" step="0.01" value="${parseFloat(a.balance||0).toFixed(2)}">
              <button class="bs-save-btn" onclick="bsSaveEdit(this,'${a.code}','${a.normal}')">Save</button>
              <button class="bs-cancel-btn" onclick="bsCancelEdit(this)">&#x2715;</button>
            </span>
          </td>
        </tr>`;
    };

    const renderRERow = () => `
      <tr data-code="3002" data-balance="${reComputed}" data-normal="credit" class="bs-re-row">
        <td class="bs-code">3002</td>
        <td class="bs-name">
          <div style="font-weight:600;color:var(--text);margin-bottom:4px;">Retained Earnings</div>
          <div class="bs-re-formula">
            <div class="bs-re-formula-line">
              <span class="bs-re-label">Opening Balance</span>
              <span class="bs-re-value">${fmt(reOpening)}</span>
            </div>
            <div class="bs-re-formula-line bs-re-income ${netIncome >= 0 ? 'positive' : 'negative'}">
              <span class="bs-re-label">+ Net Income <a class="bs-re-link" onclick="switchTab('accounting');setTimeout(()=>switchAccountingTab('margins'),200)">View Margins</a></span>
              <span class="bs-re-value">${fmt(netIncome)}</span>
            </div>
            <div class="bs-re-formula-breakdown">
              <div class="bs-re-breakdown-line"><span>Revenue</span><span>${fmt(totalRevenue)}</span></div>
              <div class="bs-re-breakdown-line"><span>− COGS</span><span>(${fmt(cogs)})</span></div>
              <div class="bs-re-breakdown-line"><span>− Discounts</span><span>(${fmt(discounts)})</span></div>
            </div>
            <div class="bs-re-formula-line bs-re-total">
              <span class="bs-re-label">= Retained Earnings</span>
              <span class="bs-re-value" id="bs-re-computed">${fmt(reComputed)}</span>
            </div>
          </div>
        </td>
        <td class="bs-balance-cell" style="vertical-align:top;padding-top:14px;">
          <strong style="font-variant-numeric:tabular-nums;color:${reComputed>=0?'var(--green)':'var(--red)'};" id="bs-re-balance">${fmt(reComputed)}</strong>
        </td>
      </tr>`;

    const renderSection = (title, accs, total, isEquity = false) => {
      let rows;
      if (isEquity) {
        rows = accs.map(a => a._isRE ? renderRERow() : renderNormalRow(a)).join('');
        if (!accs.length) rows = `<tr><td colspan="3" style="text-align:center;padding:14px;color:var(--text-3);font-size:12px;">No accounts</td></tr>`;
      } else {
        rows = accs.length
          ? accs.map(renderNormalRow).join('')
          : `<tr><td colspan="3" style="text-align:center;padding:14px;color:var(--text-3);font-size:12px;">No accounts</td></tr>`;
      }
      return `<div class="bs-section"><div class="bs-section-title">${title}</div>
        <table class="bs-table">
          <thead><tr><th style="text-align:left;">Code</th><th style="text-align:left;">Account</th><th style="text-align:right;">Balance</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot class="bs-tfoot"><tr><td colspan="2">Total ${title}</td><td id="bs-total-${title.toLowerCase()}">${fmt(total)}</td></tr></tfoot>
        </table></div>`;
    };

    body.innerHTML = `
      <style>
        .bs-re-formula{margin-top:6px;padding:10px 12px;background:var(--bg);border-radius:var(--r-md);border:1px solid var(--border);font-size:12px;}
        .bs-re-formula-line{display:flex;justify-content:space-between;align-items:center;padding:3px 0;}
        .bs-re-formula-line.bs-re-income{color:var(--text-2);border-top:1px solid var(--border);margin-top:4px;padding-top:6px;}
        .bs-re-formula-line.bs-re-income.positive .bs-re-value{color:var(--green);font-weight:600;}
        .bs-re-formula-line.bs-re-income.negative .bs-re-value{color:var(--red);font-weight:600;}
        .bs-re-formula-line.bs-re-total{font-weight:700;border-top:2px solid var(--border);margin-top:4px;padding-top:6px;color:var(--text);}
        .bs-re-label{color:var(--text-2);}
        .bs-re-value{font-variant-numeric:tabular-nums;font-weight:500;}
        .bs-re-link{font-size:10px;color:var(--blue);cursor:pointer;margin-left:6px;text-decoration:none;font-weight:600;}
        .bs-re-link:hover{text-decoration:underline;}
        .bs-re-formula-breakdown{background:var(--surface);border-radius:var(--r-sm);padding:6px 8px;margin:4px 0;border:1px solid var(--border-light);}
        .bs-re-breakdown-line{display:flex;justify-content:space-between;font-size:11px;color:var(--text-3);padding:2px 0;}
        .bs-re-row td{vertical-align:top;}
      </style>
      ${cogsNote}
      <div class="bs-wrapper">
        <div class="bs-column">${renderSection('Assets', assets, tA)}</div>
        <div class="bs-column">
          ${renderSection('Liabilities', liabilities, tL)}
          ${renderSection('Equity', allEquity, tE, true)}
          <div class="bs-check ${isOk?'balanced':'unbalanced'}" id="bs-check">
            <span>Liabilities + Equity: <strong id="bs-liab-equity">${fmt(lE)}</strong></span>
            <span class="bs-status" id="bs-status">${isOk?'Balanced':'Out of balance'}</span>
          </div>
        </div>
      </div>`;
  } catch (err) {
    console.error(err);
    body.innerHTML = `<div class="empty-state"><p>Error loading balance sheet</p></div>`;
  }
}

function bsStartEdit(el) {
  const wrap = el.nextElementSibling;
  el.style.display = 'none';
  wrap.classList.add('active');
  wrap.querySelector('.bs-balance-input').focus();
}
function bsCancelEdit(btn) {
  const wrap = btn.closest('.bs-balance-input-wrap');
  wrap.classList.remove('active');
  wrap.previousElementSibling.style.display = '';
}
async function bsSaveEdit(saveBtn, code, normal) {
  const wrap = saveBtn.closest('.bs-balance-input-wrap');
  const input = wrap.querySelector('.bs-balance-input');
  const display = wrap.previousElementSibling;
  const row = wrap.closest('tr');
  const c   = state.settings.currency || '₱';
  const fmt = n => c + parseFloat(n||0).toFixed(2);
  const newBal = parseFloat(input.value) || 0;
  const oldBal = parseFloat(row.dataset.balance) || 0;
  const diff   = newBal - oldBal;
  if (Math.abs(diff) < 0.001) { bsCancelEdit(saveBtn); return; }
  saveBtn.textContent = '...'; saveBtn.disabled = true;
  const isDebitNormal = normal === 'debit';
  const abs = Math.abs(diff), inc = diff > 0;
  const lines = [
    { accountCode: code,   debit: (isDebitNormal===inc)?abs:0, credit: (isDebitNormal===inc)?0:abs },
    { accountCode: '3999', debit: (isDebitNormal===inc)?0:abs, credit: (isDebitNormal===inc)?abs:0 }
  ];
  try {
    const res = await fetch('/api/accounting/journal', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', Authorization:`Bearer ${state.token}` },
      body: JSON.stringify({ date: new Date().toISOString(), description: `Balance adjustment — account ${code}`, reference: 'BS-ADJ', lines })
    });
    if (!res.ok) { const e = await res.json(); showToast(e.error||'Failed to save','error'); saveBtn.textContent='Save'; saveBtn.disabled=false; return; }
    row.dataset.balance = newBal;
    display.childNodes[0].nodeValue = fmt(newBal);
    wrap.classList.remove('active');
    display.style.display = '';
    bsRecalcTotals();
    showToast('Balance updated','success');
  } catch (e) { showToast('Network error','error'); saveBtn.textContent='Save'; saveBtn.disabled=false; }
}
function bsRecalcTotals() {
  const c   = state.settings.currency || '\u20b1';
  const fmt = n => c + parseFloat(n||0).toFixed(2);
  // Sum balances per section keyword — RE row (3002) is included via data-balance on the tr
  const getTotal = kw => {
    let t = 0;
    document.querySelectorAll('#balanceSheetBody .bs-section').forEach(s => {
      if ((s.querySelector('.bs-section-title')?.textContent||'').toLowerCase().includes(kw))
        s.querySelectorAll('tr[data-code]').forEach(r => { t += parseFloat(r.dataset.balance)||0; });
    });
    return t;
  };
  const tA=getTotal('assets'), tL=getTotal('liabilities'), tE=getTotal('equity'), lE=tL+tE, ok=Math.abs(tA-lE)<0.01;
  const el = id => document.getElementById(id);
  if(el('bs-total-assets'))      el('bs-total-assets').textContent=fmt(tA);
  if(el('bs-total-liabilities')) el('bs-total-liabilities').textContent=fmt(tL);
  if(el('bs-total-equity'))      el('bs-total-equity').textContent=fmt(tE);
  if(el('bs-liab-equity'))       el('bs-liab-equity').textContent=fmt(lE);
  if(el('bs-status'))            el('bs-status').textContent=ok?'Balanced':'Out of balance';
  const ch=el('bs-check'); if(ch){ch.classList.toggle('balanced',ok);ch.classList.toggle('unbalanced',!ok);}
}

async function bsReconcileAR() {
  if (!confirm('Reconcile Accounts Receivable?\n\nThis will compare the journal balance of account 1002 against the actual unsettled credit ledger charges and post a correcting entry if they differ.')) return;
  try {
    const res = await fetch('/api/accounting/reconcile-ar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.token}` }
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Reconciliation failed', 'error'); return; }
    showToast(data.message, 'success');
    loadBalanceSheet();
  } catch (err) {
    showToast('Network error during reconciliation', 'error');
  }
}


// ═══════════════════════════════════════════════════════════
// PROFIT MARGINS
// ═══════════════════════════════════════════════════════════

async function loadMarginAnalysis() {
  const period = document.getElementById('marginPeriod')?.value || 'monthly';
  const fi = document.getElementById('marginFrom'), ti = document.getElementById('marginTo');
  if (fi) fi.style.display = period==='custom'?'':'none';
  if (ti) ti.style.display = period==='custom'?'':'none';
  const now = new Date(); let from, to;
  if (period==='custom') { from=fi?.value; to=ti?.value; if(!from||!to) return; }
  else if (period==='monthly')   { from=new Date(now.getFullYear(),now.getMonth(),1).toISOString().split('T')[0]; to=now.toISOString().split('T')[0]; }
  else if (period==='quarterly') { const qs=new Date(now.getFullYear(),Math.floor(now.getMonth()/3)*3,1); from=qs.toISOString().split('T')[0]; to=now.toISOString().split('T')[0]; }
  else if (period==='yearly')    { from=new Date(now.getFullYear(),0,1).toISOString().split('T')[0]; to=now.toISOString().split('T')[0]; }

  const summaryEl=document.getElementById('marginSummaryCards'), incomeEl=document.getElementById('marginIncomeBody'), tableBody=document.getElementById('marginProductBody');
  if (summaryEl) summaryEl.innerHTML='<p>Loading...</p>';
  if (incomeEl)  incomeEl.innerHTML='<p>Loading...</p>';
  if (tableBody) tableBody.innerHTML='<tr><td colspan="7" style="text-align:center;">Loading...</td></tr>';

  const c = state.settings.currency || '₱';
  const fmt = n => c + parseFloat(n||0).toFixed(2);
  const fmtPct = n => parseFloat(n||0).toFixed(1)+'%';

  try {
    const [iR, pR] = await Promise.all([
      fetch(`/api/accounting/income-statement?from=${from}&to=${to}`, { headers: { Authorization:`Bearer ${state.token}` } }),
      fetch(`/api/reports/product-sales?from=${from}&to=${to}`,       { headers: { Authorization:`Bearer ${state.token}` } })
    ]);
    if (!iR.ok||!pR.ok) throw new Error();
    const income=await iR.json(), products=await pR.json();

    if (summaryEl) summaryEl.innerHTML = [
      { label:'Total Revenue', value:fmt(income.totalRevenue),   color:'var(--green)' },
      { label:'Gross Profit',  value:fmt(income.grossProfit),    color:'var(--blue)'  },
      { label:'Gross Margin',  value:fmtPct(income.grossMargin), color:'#8b5cf6'      },
      { label:'Net Income',    value:fmt(income.netIncome),      color:income.netIncome>=0?'var(--green)':'var(--red)' }
    ].map(c => `<div class="stat-card"><div class="stat-label">${c.label}</div><div class="stat-value" style="color:${c.color};">${c.value}</div></div>`).join('');

    if (incomeEl) incomeEl.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div>
          <div class="income-row indent"><span>Cash Revenue</span><span>${fmt(income.cashRevenue)}</span></div>
          <div class="income-row indent"><span>Salary Deduction</span><span>${fmt(income.salaryDeductionRevenue)}</span></div>
          <div class="income-row total"><span>Total Revenue</span><span>${fmt(income.totalRevenue)}</span></div>
        </div>
        <div>
          <div class="income-row indent negative"><span>COGS</span><span>(${fmt(income.cogs)})</span></div>
          <div class="income-row total"><span>Gross Profit</span><span>${fmt(income.grossProfit)}</span></div>
          <div class="income-row indent negative"><span>Discounts</span><span>(${fmt(income.discounts)})</span></div>
          <div class="income-row grand-total ${income.netIncome>=0?'':'negative'}"><span>Net Income</span><span>${fmt(income.netIncome)}</span></div>
        </div>
      </div>`;

    if (tableBody) {
      if (!products.length) { tableBody.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--text-3);">No sales data for this period</td></tr>'; }
      else tableBody.innerHTML = products.map(p => {
        const mv = parseFloat(p.margin);
        const status = mv>=40?'<span class="badge badge-success">Healthy</span>':mv>=20?'<span class="badge badge-warning">Low</span>':'<span class="badge badge-danger">Critical</span>';
        return `<tr>
          <td style="text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.name}</td>
          <td style="text-align:right;">${p.qty}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums;">${fmt(p.revenue)}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums;">${fmt(p.cogs)}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums;">${fmt(p.profit)}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums;">${fmtPct(p.margin)}</td>
          <td style="text-align:center;">${status}</td></tr>`;
      }).join('');
    }
  } catch (err) {
    if (incomeEl)  incomeEl.innerHTML=`<p style="color:var(--red);">Error loading data</p>`;
    if (tableBody) tableBody.innerHTML=`<tr><td colspan="7">Error loading data</td></tr>`;
  }
}

// ═══════════════════════════════════════════════════════════
// JOURNAL ENTRIES
// ═══════════════════════════════════════════════════════════

let journalLines = [];

async function loadJournalEntries() {
  const from = document.getElementById('journalFrom').value;
  const to   = document.getElementById('journalTo').value;
  const type = document.getElementById('journalType').value;
  let url = '/api/accounting/journal?';
  if (from) url += `from=${from}&`;
  if (to)   url += `to=${to}&`;
  if (type) url += `type=${type}&`;
  try {
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${state.token}` } });
    if (!res.ok) throw new Error();
    const entries = await res.json();
    document.getElementById('journalTableBody').innerHTML = entries.map(e => {
      const td = e.lines.reduce((s,l) => s+(l.debit||0), 0);
      const tc = e.lines.reduce((s,l) => s+(l.credit||0), 0);
      return `<tr>
        <td>${new Date(e.date).toLocaleDateString()}</td>
        <td>${e.id}</td><td>${e.description}</td><td>${e.reference||'-'}</td>
        <td>${formatCurrency(td)}</td><td>${formatCurrency(tc)}</td>
        <td><span class="badge ${e.type==='auto'?'badge-info':'badge-navy'}">${e.type}</span></td></tr>`;
    }).join('');
  } catch (err) { console.error('Failed to load journal entries:', err); }
}

function showAddJournalModal() {
  journalLines = [{ accountCode:'', debit:'', credit:'' }, { accountCode:'', debit:'', credit:'' }];
  document.getElementById('journalDate').value = new Date().toISOString().slice(0,10);
  document.getElementById('journalDescription').value = '';
  document.getElementById('journalReference').value = '';
  renderJournalLines(); updateJournalTotals();
  document.getElementById('journalModal').classList.add('active');
}

function renderJournalLines() {
  document.getElementById('journalLines').innerHTML = journalLines.map((line, i) => `
    <div class="journal-line">
      <select class="form-select" onchange="updateJournalLine(${i},'accountCode',this.value)">
        <option value="">Select Account</option>
        ${state.accounts.map(a => `<option value="${a.code}" ${line.accountCode===a.code?'selected':''}>${a.code} - ${a.name}</option>`).join('')}
      </select>
      <input type="number" class="form-input" placeholder="Debit"  value="${line.debit}"  oninput="updateJournalLine(${i},'debit',this.value)">
      <input type="number" class="form-input" placeholder="Credit" value="${line.credit}" oninput="updateJournalLine(${i},'credit',this.value)">
      <button class="btn btn-danger btn-sm" onclick="removeJournalLine(${i})">×</button>
    </div>`).join('');
}
function updateJournalLine(i, field, val) { journalLines[i][field] = val; updateJournalTotals(); }
function addJournalLine() { journalLines.push({ accountCode:'', debit:'', credit:'' }); renderJournalLines(); }
function removeJournalLine(i) {
  if (journalLines.length <= 2) { showToast('At least 2 lines required','error'); return; }
  journalLines.splice(i, 1); renderJournalLines(); updateJournalTotals();
}
function updateJournalTotals() {
  const td = journalLines.reduce((s,l) => s+(parseFloat(l.debit)||0), 0);
  const tc = journalLines.reduce((s,l) => s+(parseFloat(l.credit)||0), 0);
  document.getElementById('totalDebits').textContent  = td.toFixed(2);
  document.getElementById('totalCredits').textContent = tc.toFixed(2);
  const unbalanced = Math.abs(td-tc) > 0.01;
  document.getElementById('journalTotals').classList.toggle('unbalanced', unbalanced);
  document.getElementById('saveJournalBtn').disabled = unbalanced;
}
async function saveJournalEntry() {
  const td = journalLines.reduce((s,l) => s+(parseFloat(l.debit)||0), 0);
  const tc = journalLines.reduce((s,l) => s+(parseFloat(l.credit)||0), 0);
  if (Math.abs(td-tc) > 0.01) { showToast('Debits must equal credits','error'); return; }
  const data = {
    date:        document.getElementById('journalDate').value,
    description: document.getElementById('journalDescription').value,
    reference:   document.getElementById('journalReference').value,
    lines: journalLines.filter(l => l.accountCode).map(l => {
      const acc = state.accounts.find(a => a.code === l.accountCode);
      return { accountCode: l.accountCode, accountName: acc?.name||'', debit: parseFloat(l.debit)||0, credit: parseFloat(l.credit)||0 };
    })
  };
  try {
    const res = await fetch('/api/accounting/journal', {
      method: 'POST', headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${state.token}` }, body: JSON.stringify(data)
    });
    if (res.ok) { showToast('Journal entry posted','success'); closeModal('journalModal'); loadJournalEntries(); }
    else { const e = await res.json(); showToast(e.error||'Failed to post entry','error'); }
  } catch (err) { showToast('Failed to post entry','error'); }
}

// ═══════════════════════════════════════════════════════════
// TAX MANAGEMENT
// ═══════════════════════════════════════════════════════════

async function loadTaxManagement() {
  try {
    const tbRes = await fetch('/api/accounting/trial-balance', { headers: { 'Authorization': `Bearer ${state.token}` } });
    if (tbRes.ok) {
      const tb  = await tbRes.json();
      const tax = tb.accounts.find(a => a.code === '2002');
      const c   = state.settings.currency || '₱';
      if (tax) {
        const collected   = tax.creditTotal || 0;
        const remitted    = tax.debitTotal  || 0;
        const outstanding = collected - remitted;
        const isOverRemitted = outstanding < -0.009;

        document.getElementById('taxSummaryBody').innerHTML = `
          <div class="tax-payable-row"><span>Total Collected:</span><span>${c}${collected.toFixed(2)}</span></div>
          <div class="tax-payable-row"><span>Total Remitted:</span><span>${c}${remitted.toFixed(2)}</span></div>
          <div class="tax-payable-row outstanding" style="color:${isOverRemitted ? 'var(--red)' : ''};">
            <span>Outstanding:</span>
            <span>${c}${outstanding.toFixed(2)}</span>
          </div>
          ${isOverRemitted ? `
          <div style="margin-top:16px;padding:14px 16px;background:var(--red-bg);border:1px solid #fca5a5;border-radius:var(--r-lg);">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
              <div>
                <div style="font-weight:700;color:var(--red);margin-bottom:4px;">Over-Remittance Detected</div>
                <div style="font-size:12px;color:var(--text-2);line-height:1.6;">
                  More tax has been recorded as paid (<strong>${c}${remitted.toFixed(2)}</strong>) than was ever collected
                  (<strong>${c}${collected.toFixed(2)}</strong>).<br>
                  This usually happens when a tax payment was recorded twice, or when transactions
                  that generated the tax were later voided but the payment wasn't reversed.<br>
                  <strong>Over-remitted by: ${c}${Math.abs(outstanding).toFixed(2)}</strong>
                </div>
              </div>
              <button
                onclick="reconcileTax()"
                style="flex-shrink:0;background:var(--red);color:#fff;border:none;border-radius:var(--r-md);padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;">
                Reconcile Tax
              </button>
            </div>
          </div>` : ''}`;
      }
    }
    await Promise.all([loadTaxPayments(), loadMonthlyTaxSummary()]);
  } catch (err) { console.error('Failed to load tax management:', err); }
}

async function loadTaxPayments() {
  try {
    const res = await fetch('/api/accounting/tax-payments', { headers: { 'Authorization': `Bearer ${state.token}` } });
    if (res.ok) {
      const payments = await res.json();
      const c = state.settings.currency || '₱';
      document.getElementById('taxPaymentsTableBody').innerHTML = payments.map(p => `
        <tr>
          <td>${new Date(p.date).toLocaleDateString()}</td>
          <td>${p.period}</td>
          <td>${c}${(p.amount||0).toFixed(2)}</td>
          <td>${p.reference||'-'}</td>
          <td><span class="badge badge-success">Paid</span></td>
        </tr>`).join('');
    }
  } catch (err) { console.error('Failed to load tax payments:', err); }
}

async function reconcileTax() {
  if (!confirm('Reconcile Tax Payable?\n\nThis will post a correcting journal entry to clear the over-remittance. The excess amount will be moved to a reconciliation suspense account (3999).')) return;
  try {
    const res = await fetch('/api/accounting/reconcile-tax', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Reconciliation failed', 'error'); return; }
    showToast(data.message, 'success');
    loadTaxManagement();
  } catch (err) {
    showToast('Network error during reconciliation', 'error');
  }
}

async function loadMonthlyTaxSummary() {
  try {
    const res = await fetch('/api/accounting/monthly-tax', { headers: { 'Authorization': `Bearer ${state.token}` } });
    if (!res.ok) throw new Error();
    const data = await res.json();
    const c = state.settings.currency || '₱';
    document.getElementById('monthlyTaxBody').innerHTML = `
      <div class="table-container">
        <table class="data-table">
          <thead><tr><th>Month</th><th>Collected</th><th>Paid</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>${data.map(m => {
            const isOverPaid = m.paid > m.collected + 0.009;
            const statusBadge = isOverPaid
              ? `<span class="badge badge-danger" title="More paid than collected — possible duplicate payment">Over-paid</span>`
              : m.isPaid
                ? `<span class="badge badge-success">Paid</span>`
                : `<span class="badge badge-warning">Unpaid</span>`;
            const actionCell = isOverPaid
              ? `<span style="font-size:11px;color:var(--red);">Over by ${c}${(m.paid - m.collected).toFixed(2)}</span>`
              : !m.isPaid
                ? `<button class="btn btn-primary btn-sm" onclick="payMonthlyTax('${m.month}',${m.collected})">Pay Now</button>`
                : '-';
            return `<tr ${isOverPaid ? 'style="background:var(--red-bg);"' : ''}>
              <td>${m.month}</td>
              <td>${c}${(m.collected||0).toFixed(2)}</td>
              <td style="color:${isOverPaid?'var(--red)':''};">${c}${(m.paid||0).toFixed(2)}</td>
              <td>${statusBadge}</td>
              <td>${actionCell}</td>
            </tr>`;
          }).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (err) { console.error('Failed to load monthly tax:', err); }
}

async function payMonthlyTax(month, amount) {
  if (!confirm(`Record tax payment for ${month} — ${formatCurrency(amount)}?`)) return;
  document.getElementById('taxDescription').value  = `Tax payment for ${month}`;
  document.getElementById('taxAmount').value       = amount.toFixed(2);
  document.getElementById('taxPeriod').value       = 'monthly';
  document.getElementById('taxPaymentDate').value  = new Date().toISOString().slice(0,10);
  document.getElementById('taxModal').classList.add('active');
}

async function showTaxRemittanceModal() {
  document.getElementById('taxDescription').value = `Tax remittance - ${new Date().toLocaleDateString()}`;
  document.getElementById('taxAmount').value      = '';
  document.getElementById('taxReference').value   = '';
  document.getElementById('taxPaymentDate').value = new Date().toISOString().slice(0,10);
  document.getElementById('taxModal').classList.add('active');
}

async function saveTaxRemittance() {
  const amount = parseFloat(document.getElementById('taxAmount').value);
  if (!amount||amount<=0) { showToast('Valid amount required','error'); return; }
  const data = {
    date: document.getElementById('taxPaymentDate').value,
    description: document.getElementById('taxDescription').value,
    reference: document.getElementById('taxReference').value,
    period: document.getElementById('taxPeriod').value,
    amount,
    lines: [
      { accountCode:'2002', accountName:'VAT / Tax Payable', debit:amount, credit:0 },
      { accountCode:'1001', accountName:'Cash on Hand',      debit:0,      credit:amount }
    ]
  };
  try {
    const res = await fetch('/api/accounting/tax-payments', {
      method: 'POST', headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${state.token}` }, body: JSON.stringify(data)
    });
    if (res.ok) { showToast('Tax payment recorded','success'); closeModal('taxModal'); loadTaxManagement(); }
    else { const e = await res.json(); showToast(e.error||'Failed to record payment','error'); }
  } catch (err) { showToast('Failed to record payment','error'); }
}

// ═══════════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════════

function onSalaryPeriodChange() {
  const period = document.getElementById('salaryReportPeriod').value;
  ['salaryMonthGroup','salaryQuarterGroup','salaryQuarterYearGroup','salaryYearGroup','salaryCustomFromGroup','salaryCustomToGroup'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  document.getElementById('salaryMonthGroup').style.display         = period==='monthly'   ? '' : 'none';
  document.getElementById('salaryQuarterGroup').style.display       = period==='quarterly' ? '' : 'none';
  document.getElementById('salaryQuarterYearGroup').style.display   = period==='quarterly' ? '' : 'none';
  document.getElementById('salaryYearGroup').style.display          = period==='yearly'    ? '' : 'none';
  document.getElementById('salaryCustomFromGroup').style.display    = period==='custom'    ? '' : 'none';
  document.getElementById('salaryCustomToGroup').style.display      = period==='custom'    ? '' : 'none';
}


// ═══════════════════════════════════════════════════════════
// REPORTS - NAV & HELPERS
// ═══════════════════════════════════════════════════════════

function switchReport(type) {
  document.querySelectorAll('.report-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.report === type));
  document.querySelectorAll('.report-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('reportPanel-' + type);
  if (panel) panel.classList.add('active');
}

function setQuickDate(fieldId, preset) {
  const d = new Date();
  if (preset === 'yesterday') d.setDate(d.getDate() - 1);
  document.getElementById(fieldId).value = d.toISOString().slice(0, 10);
}

function setQuickRange(fromId, toId, preset) {
  const now = new Date();
  let from = new Date(), to = new Date();
  if (preset === 'today') {
    // from = to = today
  } else if (preset === 'yesterday') {
    from.setDate(now.getDate() - 1);
    to.setDate(now.getDate() - 1);
  } else if (preset === 'week') {
    from.setDate(now.getDate() - now.getDay());
  } else if (preset === 'month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  document.getElementById(fromId).value = from.toISOString().slice(0, 10);
  document.getElementById(toId).value   = to.toISOString().slice(0, 10);
}

async function generateDailyReport() {
  const date = document.getElementById('dailyReportDate').value;
  if (!date) { showToast('Please select a date', 'error'); return; }
  const resultEl = document.getElementById('dailyReportResult');
  resultEl.innerHTML = '<div class="report-loading">Loading…</div>';
  try {
    const res = await fetch(`/api/reports/daily-sales?date=${date}`, { headers: { 'Authorization': `Bearer ${state.token}` } });
    if (!res.ok) throw new Error();
    const data = await res.json();
    const c = state.settings.currency || '₱';
    const fmt = n => c + parseFloat(n||0).toFixed(2);
    const methodRows = Object.entries(data.byMethod||{}).map(([m, i]) => `
      <tr>
        <td><span class="method-badge method-${m.toLowerCase()}">${m.charAt(0).toUpperCase()+m.slice(1)}</span></td>
        <td class="num">${i.count||0}</td>
        <td class="num">${fmt(i.total)}</td>
      </tr>`).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--text-3);">No transactions</td></tr>';

    resultEl.innerHTML = `
      <div class="report-result">
        <div class="report-result-header">
          <span class="report-result-title">Daily Report</span>
          <span class="report-result-date">${new Date(date + 'T12:00:00').toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</span>
        </div>
        <div class="report-stat-row">
          <div class="report-stat">
            <div class="report-stat-label">Transactions</div>
            <div class="report-stat-value">${data.totalTransactions||0}</div>
          </div>
          <div class="report-stat">
            <div class="report-stat-label">Revenue</div>
            <div class="report-stat-value green">${fmt(data.totalRevenue)}</div>
          </div>
          <div class="report-stat">
            <div class="report-stat-label">Gross Profit</div>
            <div class="report-stat-value blue">${fmt(data.totalProfit)}</div>
          </div>
          <div class="report-stat">
            <div class="report-stat-label">Avg Order</div>
            <div class="report-stat-value">${data.totalTransactions ? fmt((data.totalRevenue||0)/data.totalTransactions) : fmt(0)}</div>
          </div>
        </div>
        <div class="report-section-title">By Payment Method</div>
        <div class="table-container">
          <table class="data-table">
            <thead><tr><th>Method</th><th class="num">Transactions</th><th class="num">Revenue</th></tr></thead>
            <tbody>${methodRows}</tbody>
          </table>
        </div>
      </div>`;
  } catch (err) { resultEl.innerHTML = '<div class="report-error">Failed to generate report. Please try again.</div>'; }
}

async function generateProductReport() {
  const from = document.getElementById('productReportFrom').value;
  const to   = document.getElementById('productReportTo').value;
  if (!from || !to) { showToast('Please select a date range', 'error'); return; }
  const resultEl = document.getElementById('productReportResult');
  resultEl.innerHTML = '<div class="report-loading">Loading…</div>';
  try {
    const fromTs = from + 'T00:00:00.000Z', toTs = to + 'T23:59:59.999Z';
    const res = await fetch(`/api/reports/product-sales?from=${fromTs}&to=${toTs}`, { headers: { 'Authorization': `Bearer ${state.token}` } });
    if (!res.ok) throw new Error();
    const data = await res.json();
    const c = state.settings.currency || '₱';
    const fmt = n => c + parseFloat(n||0).toFixed(2);
    if (!data?.length) {
      resultEl.innerHTML = '<div class="report-empty"><div class="report-empty-icon"></div><div class="report-empty-text">No sales data for this period</div></div>';
      return;
    }
    const totalRev  = data.reduce((s,p) => s + p.revenue, 0);
    const totalCogs = data.reduce((s,p) => s + p.cogs, 0);
    const totalProfit = data.reduce((s,p) => s + p.profit, 0);
    resultEl.innerHTML = `
      <div class="report-result">
        <div class="report-result-header">
          <span class="report-result-title">Product Sales</span>
          <span class="report-result-date">${from} → ${to}</span>
        </div>
        <div class="report-stat-row">
          <div class="report-stat"><div class="report-stat-label">Products Sold</div><div class="report-stat-value">${data.length}</div></div>
          <div class="report-stat"><div class="report-stat-label">Total Revenue</div><div class="report-stat-value green">${fmt(totalRev)}</div></div>
          <div class="report-stat"><div class="report-stat-label">Total COGS</div><div class="report-stat-value red">${fmt(totalCogs)}</div></div>
          <div class="report-stat"><div class="report-stat-label">Gross Profit</div><div class="report-stat-value blue">${fmt(totalProfit)}</div></div>
        </div>
        <div class="table-container">
          <table class="data-table">
            <thead><tr><th>Product</th><th class="num">Qty</th><th class="num">Revenue</th><th class="num">COGS</th><th class="num">Profit</th><th class="num">Margin</th></tr></thead>
            <tbody>${data.map((p,i) => {
              const mv = parseFloat(p.margin);
              const mc = mv >= 40 ? 'var(--green)' : mv >= 20 ? '#F59E0B' : 'var(--red)';
              return `<tr>
                <td><span class="rank-badge">${i+1}</span> ${p.name||'Unknown'}</td>
                <td class="num">${p.qty||0}</td>
                <td class="num">${fmt(p.revenue)}</td>
                <td class="num">${fmt(p.cogs)}</td>
                <td class="num">${fmt(p.profit)}</td>
                <td class="num" style="color:${mc};font-weight:600;">${p.margin||0}%</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>
      </div>`;
  } catch (err) { resultEl.innerHTML = '<div class="report-error">Failed to generate report. Please try again.</div>'; }
}

async function generatePeakHoursReport() {
  const from = document.getElementById('peakHoursFrom').value;
  const to   = document.getElementById('peakHoursTo').value;
  if (!from || !to) { showToast('Please select a date range', 'error'); return; }
  const resultEl = document.getElementById('peakHoursResult');
  resultEl.innerHTML = '<div class="report-loading">Loading…</div>';
  try {
    const fromTs = from + 'T00:00:00.000Z', toTs = to + 'T23:59:59.999Z';
    const res = await fetch(`/api/reports/peak-hours?from=${fromTs}&to=${toTs}`, { headers: { 'Authorization': `Bearer ${state.token}` } });
    if (!res.ok) throw new Error();
    const data = await res.json();
    const c = state.settings.currency || '₱';
    const fmt = n => c + parseFloat(n||0).toFixed(2);
    if (!data?.length) {
      resultEl.innerHTML = '<div class="report-empty"><div class="report-empty-icon"></div><div class="report-empty-text">No data for this period</div></div>';
      return;
    }
    const busiest = data[0];
    const maxTx = busiest.transactions;
    resultEl.innerHTML = `
      <div class="report-result">
        <div class="report-result-header">
          <span class="report-result-title">Peak Hours</span>
          <span class="report-result-date">${from} → ${to}</span>
        </div>
        <div class="report-stat-row">
          <div class="report-stat"><div class="report-stat-label">Busiest Block</div><div class="report-stat-value" style="font-size:15px;">${busiest.timeBlock}</div></div>
          <div class="report-stat"><div class="report-stat-label">Peak Transactions</div><div class="report-stat-value">${busiest.transactions}</div></div>
          <div class="report-stat"><div class="report-stat-label">Peak Revenue</div><div class="report-stat-value green">${fmt(busiest.revenue)}</div></div>
        </div>
        <div class="table-container">
          <table class="data-table">
            <thead><tr><th>Time Block</th><th class="num">Transactions</th><th class="num">Revenue</th><th class="num">Avg Order</th><th>Activity</th></tr></thead>
            <tbody>${data.map(d => {
              const pct = maxTx > 0 ? Math.round((d.transactions / maxTx) * 100) : 0;
              const barColor = d.rank === 1 ? 'var(--red)' : d.rank <= 3 ? 'var(--navy)' : 'var(--border)';
              return `<tr ${d.rank===1 ? 'class="peak-row"' : ''}>
                <td><strong>${d.timeBlock}</strong>${d.rank===1 ? ' <span class="badge badge-danger">Busiest</span>' : ''}</td>
                <td class="num">${d.transactions}</td>
                <td class="num">${fmt(d.revenue)}</td>
                <td class="num">${fmt(d.avgOrder)}</td>
                <td><div class="activity-bar"><div class="activity-bar-fill" style="width:${pct}%;background:${barColor};"></div></div></td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>
      </div>`;
  } catch (err) { resultEl.innerHTML = '<div class="report-error">Failed to generate report. Please try again.</div>'; }
}

async function generateTopProductsReport() {
  const from = document.getElementById('topProductsFrom').value;
  const to   = document.getElementById('topProductsTo').value;
  if (!from || !to) { showToast('Please select a date range', 'error'); return; }
  const resultEl = document.getElementById('topProductsResult');
  resultEl.innerHTML = '<div class="report-loading">Loading…</div>';
  try {
    const fromTs = from + 'T00:00:00.000Z', toTs = to + 'T23:59:59.999Z';
    const res = await fetch(`/api/reports/top-products?from=${fromTs}&to=${toTs}`, { headers: { 'Authorization': `Bearer ${state.token}` } });
    if (!res.ok) throw new Error();
    const data = await res.json();
    const c = state.settings.currency || '₱';
    const fmt = n => c + parseFloat(n||0).toFixed(2);
    if (!data?.length) {
      resultEl.innerHTML = '<div class="report-empty"><div class="report-empty-icon"></div><div class="report-empty-text">No sales data for this period</div></div>';
      return;
    }
    const maxQty = data[0].qty;
    const medals = ['1','2','3'];
    resultEl.innerHTML = `
      <div class="report-result">
        <div class="report-result-header">
          <span class="report-result-title">Best Sellers</span>
          <span class="report-result-date">${from} → ${to}</span>
        </div>
        <div class="report-stat-row">
          <div class="report-stat"><div class="report-stat-label">Top Product</div><div class="report-stat-value" style="font-size:14px;">${data[0].name}</div></div>
          <div class="report-stat"><div class="report-stat-label">Units Sold</div><div class="report-stat-value">${data[0].qty}</div></div>
          <div class="report-stat"><div class="report-stat-label">Top Revenue</div><div class="report-stat-value green">${fmt(data[0].revenue)}</div></div>
        </div>
        <div class="table-container">
          <table class="data-table">
            <thead><tr><th>Rank</th><th>Product</th><th class="num">Qty Sold</th><th class="num">Revenue</th><th>Popularity</th></tr></thead>
            <tbody>${data.map((p,i) => {
              const pct = maxQty > 0 ? Math.round((p.qty / maxQty) * 100) : 0;
              return `<tr ${i===0?'class="peak-row"':''}>
                <td style="font-size:18px;text-align:center;">${medals[i] || '#'+(i+1)}</td>
                <td><strong>${p.name||'Unknown'}</strong></td>
                <td class="num">${p.qty||0}</td>
                <td class="num">${fmt(p.revenue)}</td>
                <td><div class="activity-bar"><div class="activity-bar-fill" style="width:${pct}%;background:${i===0?'var(--red)':i<3?'var(--navy)':'var(--border)'};"></div></div></td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>
      </div>`;
  } catch (err) { resultEl.innerHTML = '<div class="report-error">Failed to generate report. Please try again.</div>'; }
}

async function previewSalaryReport() {
  const period = document.getElementById('salaryReportPeriod').value;
  const today  = new Date();
  let from, to, label;
  switch(period) {
    case 'monthly': {
      const mv = document.getElementById('salaryMonth').value;
      if (!mv) { showToast('Please select a month','error'); return; }
      const [y,m] = mv.split('-');
      from = `${mv}-01`; to = new Date(+y,+m,0).toISOString().slice(0,10);
      label = new Date(+y,+m-1).toLocaleDateString('en-US',{month:'long',year:'numeric'}); break;
    }
    case 'quarterly': {
      const q = document.getElementById('salaryQuarter').value;
      const qy = document.getElementById('salaryQuarterYear').value;
      if (!qy) { showToast('Please enter a year','error'); return; }
      const qm = {Q1:[0,2],Q2:[3,5],Q3:[6,8],Q4:[9,11]};
      from = `${qy}-${String(qm[q][0]+1).padStart(2,'0')}-01`; to = new Date(+qy,qm[q][1]+1,0).toISOString().slice(0,10); label = `${q} ${qy}`; break;
    }
    case 'yearly': {
      const yv = document.getElementById('salaryYear').value;
      if (!yv) { showToast('Please enter a year','error'); return; }
      from = `${yv}-01-01`; to = `${yv}-12-31`; label = yv; break;
    }
    case 'custom': {
      from = document.getElementById('salaryFrom').value; to = document.getElementById('salaryTo').value;
      if (!from||!to) { showToast('Please select date range','error'); return; }
      label = `${from} to ${to}`; break;
    }
  }
  try {
    const res = await fetch(`/api/reports/salary-deductions?from=${from}&to=${to}`, { headers: { 'Authorization': `Bearer ${state.token}` } });
    if (!res.ok) throw new Error();
    const data = await res.json();
    const c = state.settings.currency || '₱';
    document.getElementById('salaryReportPreview').innerHTML = `
      <div class="card"><div class="card-header"><span class="card-title">Salary Deduction Report - ${label}</span></div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:15px;margin-bottom:20px;">
          <div style="background:var(--bg);padding:15px;border-radius:8px;text-align:center;"><div style="font-size:12px;color:var(--text-3);">Total Employees</div><div style="font-size:24px;font-weight:700;">${data.employeeCount||0}</div></div>
          <div style="background:var(--bg);padding:15px;border-radius:8px;text-align:center;"><div style="font-size:12px;color:var(--text-3);">Total Transactions</div><div style="font-size:24px;font-weight:700;">${data.transactionCount||0}</div></div>
          <div style="background:var(--bg);padding:15px;border-radius:8px;text-align:center;"><div style="font-size:12px;color:var(--text-3);">Total Amount</div><div style="font-size:24px;font-weight:700;color:var(--red);">${c}${(data.totalAmount||0).toFixed(2)}</div></div>
        </div>
        <div class="table-container"><table class="data-table">
          <thead><tr><th>Emp ID</th><th>Name</th><th>Department</th><th>Transactions</th><th>Total Amount</th><th>Status</th></tr></thead>
          <tbody>${(data.employees||[]).map(e => `<tr><td>${e.employeeId}</td><td>${e.name||'-'}</td><td>${e.department||'-'}</td><td>${e.transactions}</td><td>${c}${(e.total||0).toFixed(2)}</td><td><span class="badge ${e.isSettled?'badge-success':'badge-warning'}">${e.isSettled?'Settled':'Pending'}</span></td></tr>`).join('')}</tbody>
        </table></div>
      </div></div>`;
  } catch (err) { showToast('Failed to generate salary report','error'); }
}

function printSalaryReport() {
  const preview = document.getElementById('salaryReportPreview');
  if (!preview.innerHTML.trim()) { showToast('Please preview the report first','error'); return; }
  const pw = window.open('','_blank');
  pw.document.write(`<html><head><title>Salary Deduction Report</title><style>body{font-family:Arial,sans-serif;margin:20px;}h2{color:#1B2740;}table{width:100%;border-collapse:collapse;margin-top:20px;}th,td{border:1px solid #ddd;padding:10px;text-align:left;}th{background:#1B2740;color:white;}.header{margin-bottom:30px;padding-bottom:20px;border-bottom:2px solid #E8192C;}</style></head><body>
    <div class="header"><h2>SALARY DEDUCTION REPORT</h2><p><strong>${state.settings.canteenName||'Company Canteen'}</strong></p><p>Generated: ${new Date().toLocaleString()}</p></div>
    ${preview.innerHTML}
    <div style="margin-top:40px;padding-top:20px;border-top:1px solid #ddd;"><p><strong>Prepared by:</strong> ${state.user.fullName||state.user.username}</p><p><strong>Signature:</strong> _________________________</p></div>
  </body></html>`);
  pw.document.close(); pw.print();
}

async function downloadSalaryCSV() {
  const preview = document.getElementById('salaryReportPreview');
  if (!preview.innerHTML.trim()) { showToast('Please preview the report first','error'); return; }
  const rows = preview.querySelectorAll('table tbody tr');
  let csv = 'Employee ID,Name,Department,Transactions,Total Amount,Status\n';
  rows.forEach(row => { const cells = row.querySelectorAll('td'); if (cells.length>=6) csv += `${cells[0].textContent},${cells[1].textContent},${cells[2].textContent},${cells[3].textContent},${cells[4].textContent},${cells[5].textContent}\n`; });
  const blob = new Blob([csv],{type:'text/csv'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `salary-deduction-${new Date().toISOString().slice(0,10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════
// TRANSACTIONS
// ═══════════════════════════════════════════════════════════

async function loadTransactions() {
  try {
    const res = await fetch('/api/transactions', { headers: { 'Authorization': `Bearer ${state.token}` } });
    if (res.ok) {
      const transactions = await res.json();
      document.getElementById('transactionsTableBody').innerHTML = transactions.slice(0,100).map(t => `
        <tr>
          <td>${new Date(t.date).toLocaleDateString()}</td>
          <td>${t.id.slice(-8)}</td>
          <td>${t.items.map(i => `${i.name} x${i.qty}`).join(', ')}</td>
          <td>${formatCurrency(t.total)}</td>
          <td>${t.paymentMethod}</td>
          <td>${t.processedBy}</td>
        </tr>`).join('');
    }
  } catch (err) { console.error('Failed to load transactions:', err); }
}

// ═══════════════════════════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════════════════════════

async function loadAuditLog() {
  try {
    const from   = document.getElementById('auditFrom').value;
    const to     = document.getElementById('auditTo').value;
    const action = document.getElementById('auditAction').value;
    let url = `/api/audit-log?page=${state.auditPage}`;
    if (from)   url += `&from=${from}`;
    if (to)     url += `&to=${to}`;
    if (action) url += `&action=${action}`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${state.token}` } });
    if (res.ok) {
      const data = await res.json();
      document.getElementById('auditTableBody').innerHTML = data.entries.map(e => `
        <tr>
          <td>${new Date(e.timestamp).toLocaleString()}</td>
          <td>${e.userFullName||e.userId}</td>
          <td>${e.action}</td>
          <td>${e.entityType}</td>
          <td>${e.entityName||'-'}</td>
        </tr>`).join('');
      renderAuditPagination(data.totalPages);
    }
  } catch (err) { console.error('Failed to load audit log:', err); }
}

function renderAuditPagination(totalPages) {
  let html = '';
  for (let i=1; i<=totalPages; i++) html += `<button class="page-btn ${i===state.auditPage?'active':''}" onclick="goToAuditPage(${i})">${i}</button>`;
  document.getElementById('auditPagination').innerHTML = html;
}
function goToAuditPage(page) { state.auditPage = page; loadAuditLog(); }

async function exportAuditLog() {
  try {
    const res = await fetch('/api/audit-log?export=all', { headers: { 'Authorization': `Bearer ${state.token}` } });
    if (res.ok) {
      const data = await res.json();
      let csv = 'Timestamp,User,Action,Entity Type,Entity Name,Details\n';
      data.entries.forEach(e => { csv += `"${e.timestamp}","${e.userFullName||e.userId}","${e.action}","${e.entityType}","${e.entityName||''}","${JSON.stringify(e.changeDetails||{}).replace(/"/g,'""')}"\n`; });
      const blob = new Blob([csv],{type:'text/csv'});
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `audit-log-${new Date().toISOString().slice(0,10)}.csv`; a.click();
      URL.revokeObjectURL(url);
    }
  } catch (err) { showToast('Failed to export audit log','error'); }
}

// ═══════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════

async function saveSettings() {
  const data = {
    canteenName:             document.getElementById('settingCanteenName').value,
    taxRate:                 parseFloat(document.getElementById('settingTaxRate').value) / 100,
    marginAlertThreshold:    parseInt(document.getElementById('settingMarginThreshold').value),
    sessionTimeoutMinutes:   parseInt(document.getElementById('settingSessionTimeout').value),
    lowStockDefaultThreshold:parseInt(document.getElementById('settingLowStockThreshold').value),
    currency:                document.getElementById('settingCurrency').value,
    cogsMode:                document.getElementById('settingCogsMode').value
  };
  try {
    const res = await fetch('/api/settings', {
      method: 'PUT', headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${state.token}` }, body: JSON.stringify(data)
    });
    if (res.ok) { showToast('Settings saved','success'); state.settings = data; }
    else showToast('Failed to save settings','error');
  } catch (err) { showToast('Failed to save settings','error'); }
}

// ═══════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════
// COGS & WASTAGE
// ═══════════════════════════════════════════════════════════

async function loadCogsWastage() {
  const c = state.settings.currency || '₱';

  // ensure products and categories are loaded
  if (!state.products.length) {
    try {
      const [pr, cr] = await Promise.all([
        fetch('/api/products', { headers: { Authorization: `Bearer ${state.token}` } }),
        fetch('/api/categories')
      ]);
      if (pr.ok) state.products   = await pr.json();
      if (cr.ok) state.categories = await cr.json();
    } catch(e) {}
  }

  // ── Monthly COGS posting history ──────────────────────────
  try {
    const res = await fetch('/api/monthly-cogs/history', { headers: { Authorization: `Bearer ${state.token}` } });
    if (res.ok) {
      const history = await res.json();
      const tbody = document.getElementById('monthlyCogsHistoryBody');
      if (tbody) {
        if (!history.length) {
          tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-3);">No monthly COGS posted yet</td></tr>';
        } else {
          tbody.innerHTML = history.map(h => `
            <tr>
              <td>${new Date(h.postedAt).toLocaleDateString()}</td>
              <td><strong>${h.month}</strong></td>
              <td style="font-weight:600;">${c}${(h.totalCogs || 0).toFixed(2)}</td>
              <td style="font-size:12px;color:var(--text-3);">${h.notes || '—'}</td>
            </tr>`).join('');
        }
      }
    }
  } catch (e) { console.error('Failed to load monthly COGS history', e); }

  // ── Wastage log ───────────────────────────────────────────
  await loadWastageLog();
}

async function loadWastageLog() {
  const c = state.settings.currency || '₱';
  const tbody = document.getElementById('wastageLogBody');
  if (!tbody) return;
  try {
    const res = await fetch('/api/wastage', { headers: { Authorization: `Bearer ${state.token}` } });
    if (!res.ok) return;
    const log = await res.json();
    if (!log.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-3);">No wastage recorded yet</td></tr>';
      return;
    }
    tbody.innerHTML = log.map(w => `
      <tr>
        <td>${new Date(w.date).toLocaleDateString()}</td>
        <td><strong>${w.productName}</strong></td>
        <td>${w.quantity}</td>
        <td>${c}${(w.unitCost || 0).toFixed(2)}</td>
        <td style="color:var(--red);font-weight:600;">${c}${(w.totalCost || 0).toFixed(2)}</td>
        <td style="color:var(--text-3);">${w.reason || '—'}</td>
        <td style="font-size:12px;color:var(--text-3);">${w.recordedBy || '—'}</td>
      </tr>`).join('');
  } catch (e) { console.error('Failed to load wastage log', e); }
}

function showAddWastageModal() {
  const sel = document.getElementById('wastageProductSel');
  if (sel) {
    sel.innerHTML = state.products.map(p =>
      `<option value="${p.id}" data-cost="${p.cost || 0}" data-stock="${p.stock}">${p.name} (Stock: ${p.stock})</option>`
    ).join('');
  }
  document.getElementById('wastageQty').value    = '';
  document.getElementById('wastageNotes').value  = '';
  document.getElementById('wastageReason').value = 'Spoilage';
  document.getElementById('wastageCostPreview').style.display = 'none';
  document.getElementById('addWastageModal').classList.add('active');
}

function updateWastageCostPreview() {
  const sel = document.getElementById('wastageProductSel');
  const qty = parseFloat(document.getElementById('wastageQty').value) || 0;
  const preview = document.getElementById('wastageCostPreview');
  const amtEl   = document.getElementById('wastageCostAmt');
  if (!sel?.selectedOptions[0]) return;
  const unitCost = parseFloat(sel.selectedOptions[0].dataset.cost) || 0;
  const c = state.settings.currency || '₱';
  if (qty > 0 && unitCost > 0) {
    preview.style.display = 'block';
    amtEl.textContent = `${c}${(unitCost * qty).toFixed(2)}`;
  } else {
    preview.style.display = 'none';
  }
}

async function saveWastage() {
  const sel      = document.getElementById('wastageProductSel');
  const productId = sel?.value;
  const quantity  = parseInt(document.getElementById('wastageQty').value);
  const reason    = document.getElementById('wastageReason').value;
  const notes     = document.getElementById('wastageNotes').value;

  if (!productId || !quantity || quantity <= 0) {
    showToast('Product and quantity are required', 'error'); return;
  }
  const stock = parseInt(sel.selectedOptions[0]?.dataset.stock || 0);
  if (quantity > stock) {
    showToast(`Only ${stock} units in stock`, 'error'); return;
  }
  try {
    const res = await fetch('/api/wastage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.token}` },
      body: JSON.stringify({ productId, quantity, reason, notes })
    });
    if (res.ok) {
      showToast('Wastage recorded', 'success');
      closeModal('addWastageModal');
      // refresh product list so stock counts update
      const pr = await fetch('/api/products', { headers: { Authorization: `Bearer ${state.token}` } });
      if (pr.ok) state.products = await pr.json();
      loadWastageLog();
    } else {
      const e = await res.json();
      showToast(e.error || 'Failed to record wastage', 'error');
    }
  } catch (e) { showToast('Failed to record wastage', 'error'); }
}

function showAddMonthlyCogs() {
  const mpEl = document.getElementById('monthlyCogsPeriod');
  if (mpEl) mpEl.value = new Date().toISOString().slice(0, 7);
  const amtEl = document.getElementById('monthlyCOGSAmount');
  if (amtEl) amtEl.value = '';
  const notesEl = document.getElementById('monthlyCOGSNotes');
  if (notesEl) notesEl.value = '';
  document.getElementById('addMonthlyCogModal').classList.add('active');
}

async function postMonthlyCogs() {
  const month  = document.getElementById('monthlyCogsPeriod').value;
  const amount = parseFloat(document.getElementById('monthlyCOGSAmount').value);
  const notes  = document.getElementById('monthlyCOGSNotes').value.trim();
  const c = state.settings.currency || '₱';

  if (!month)           { showToast('Please select a month', 'error'); return; }
  if (!amount || amount <= 0) { showToast('Please enter a valid COGS amount', 'error'); return; }

  try {
    const res = await fetch('/api/monthly-cogs/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.token}` },
      body: JSON.stringify({ month, amount, notes })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`Monthly COGS of ${c}${amount.toFixed(2)} posted for ${month}`, 'success');
      closeModal('addMonthlyCogModal');
      loadCogsWastage();
    } else {
      showToast(data.error || 'Failed to post monthly COGS', 'error');
    }
  } catch (e) { showToast('Failed to post monthly COGS', 'error'); }
}


function formatCurrency(amount) {
  const symbol = state.settings.currency || '₱';
  return symbol + parseFloat(amount||0).toFixed(2);
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type==='success'?'':type==='error'?'':''}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.animation = 'fadeOut 0.3s ease forwards'; setTimeout(() => toast.remove(), 300); }, 3000);
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

function logout() {
  localStorage.removeItem('mbcpos_token');
  localStorage.removeItem('mbcpos_user');
  window.location.href = '/login.html';
}

// ═══════════════════════════════════════════════════════════
// USER MANAGEMENT
// ═══════════════════════════════════════════════════════════

async function loadUsers() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-3);">Loading...</td></tr>';
  try {
    const res = await fetch('/api/users', { headers: { Authorization: `Bearer ${state.token}` } });
    if (!res.ok) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--red);">Access denied</td></tr>'; return; }
    const users = await res.json();
    if (!users.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-3);">No users found</td></tr>'; return; }
    tbody.innerHTML = users.map(u => `
      <tr>
        <td style="font-weight:600;">${u.username}</td>
        <td>${u.fullName || '—'}</td>
        <td><span class="role-${u.role}">${u.role.charAt(0).toUpperCase() + u.role.slice(1)}</span></td>
        <td><span class="badge ${u.isActive ? 'badge-success' : ''}" style="${!u.isActive ? 'background:var(--border);color:var(--text-3);' : ''}font-size:11px;">${u.isActive ? 'Active' : 'Inactive'}</span></td>
        <td style="font-size:12px;color:var(--text-3);">${new Date(u.createdAt).toLocaleDateString()}</td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="editUser('${u.id}','${u.username}','${(u.fullName||'').replace(/'/g,"\\'")}','${u.role}',${u.isActive})">Edit</button>
          ${u.id !== state.user.id ? `<button class="btn btn-sm btn-danger" style="margin-left:4px;" onclick="deleteUser('${u.id}','${u.username}')">Delete</button>` : '<span style="font-size:11px;color:var(--text-3);margin-left:6px;">(you)</span>'}
        </td>
      </tr>`).join('');
  } catch(e) { if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--red);">Failed to load users</td></tr>'; }
}

function showUserModal() {
  document.getElementById('userModalId').value = '';
  document.getElementById('userModalTitle').textContent = 'Add User';
  document.getElementById('userModalUsername').value = '';
  document.getElementById('userModalFullName').value = '';
  document.getElementById('userModalRole').value = 'cashier';
  document.getElementById('userModalPassword').value = '';
  document.getElementById('userModalPwLabel').textContent = 'Password *';
  document.getElementById('userModalStatusGroup').style.display = 'none';
  document.getElementById('userModal').classList.add('active');
}

function editUser(id, username, fullName, role, isActive) {
  document.getElementById('userModalId').value = id;
  document.getElementById('userModalTitle').textContent = 'Edit User';
  document.getElementById('userModalUsername').value = username;
  document.getElementById('userModalFullName').value = fullName;
  document.getElementById('userModalRole').value = role;
  document.getElementById('userModalPassword').value = '';
  document.getElementById('userModalPwLabel').textContent = 'New Password (leave blank to keep current)';
  document.getElementById('userModalStatus').value = String(isActive);
  document.getElementById('userModalStatusGroup').style.display = '';
  document.getElementById('userModal').classList.add('active');
}

async function saveUser() {
  const id       = document.getElementById('userModalId').value;
  const username = document.getElementById('userModalUsername').value.trim();
  const fullName = document.getElementById('userModalFullName').value.trim();
  const role     = document.getElementById('userModalRole').value;
  const password = document.getElementById('userModalPassword').value;
  const isActive = document.getElementById('userModalStatus')?.value !== 'false';
  if (!username) { showToast('Username is required', 'error'); return; }
  if (!id && !password) { showToast('Password is required for new users', 'error'); return; }
  const body = { username, fullName, role };
  if (password) body.password = password;
  if (id) body.isActive = isActive;
  try {
    const res = await fetch(id ? `/api/users/${id}` : '/api/users', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.token}` },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (res.ok) { showToast(id ? 'User updated' : 'User created', 'success'); closeModal('userModal'); loadUsers(); }
    else { showToast(data.error || 'Failed to save user', 'error'); }
  } catch(e) { showToast('Network error', 'error'); }
}

async function deleteUser(id, username) {
  if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;
  try {
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${state.token}` } });
    const data = await res.json();
    if (res.ok) { showToast('User deleted', 'success'); loadUsers(); }
    else { showToast(data.error || 'Failed to delete', 'error'); }
  } catch(e) { showToast('Network error', 'error'); }
}

// ═══════════════════════════════════════════════════════════
// AUTO-UPDATE ENGINE
// ═══════════════════════════════════════════════════════════

const AUTO_UPDATE = {
  interval: 15000, _timer: null, _paused: false,
  start() {
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); else this.resume(); });
    this._tick();
    this._timer = setInterval(() => this._tick(), this.interval);
    this._setDot('live');
  },
  pause()  { this._paused = true;  this._setDot('paused'); },
  resume() { this._paused = false; this._tick(); },
  _tick() {
    if (this._paused) return;
    this._setDot('loading');
    this._refresh().then(() => this._setDot('live')).catch(() => this._setDot('error'));
  },
  async _refresh() {
    const tab  = state.currentTab || 'dashboard';
    const role = state.user?.role || 'cashier';
    switch (tab) {
      case 'dashboard':    if (role !== 'cashier') await loadDashboardData(); break;
      case 'products':     await loadProducts(); break;
      case 'categories':   await loadCategories(); break;
      case 'employees':    if (role !== 'cashier') await loadEmployees(); break;
      case 'transactions': if (role !== 'cashier') await loadTransactions(); break;
      case 'cashCount':    await loadCashCountTab(); break;
      case 'users':        if (role === 'admin') await loadUsers(); break;
      case 'accounting':
        if (role !== 'cashier') {
          try {
            const sub = document.querySelector('#accountingTab .tabs .tab.active')?.dataset?.subtab;
            if      (sub === 'accounts')     await loadAccounts();
            else if (sub === 'journal')      await loadJournalEntries();
            else if (sub === 'tax')          await loadTaxManagement();
            else if (sub === 'balancesheet') await loadBalanceSheet();
            else if (sub === 'margins')      await loadMarginAnalysis();
            else await loadAccountingSummary();
          } catch(e) { await loadAccountingSummary(); }
        }
        break;
    }
  },
  _setDot(s) {
    const dot = document.getElementById('autoUpdateDot');
    const lbl = document.getElementById('autoUpdateLabel');
    if (!dot) return;
    dot.className = 'au-dot au-' + s;
    if (lbl) lbl.textContent = s === 'live' ? 'Live' : s === 'loading' ? 'Updating…' : s === 'paused' ? 'Paused' : 'Error';
  }
};

// ═══════════════════════════════════════════════════════════
// CASH REGISTER COUNT
// ═══════════════════════════════════════════════════════════

const PH_BILLS = [
  { value: 1000, label: '₱1,000', type: 'bill' }, { value: 500,  label: '₱500',   type: 'bill' },
  { value: 200,  label: '₱200',   type: 'bill' }, { value: 100,  label: '₱100',   type: 'bill' },
  { value: 50,   label: '₱50',    type: 'bill' }, { value: 20,   label: '₱20',    type: 'bill' }
];
const PH_COINS = [
  { value: 20,   label: '₱20',  type: 'coin' }, { value: 10,   label: '₱10',  type: 'coin' },
  { value: 5,    label: '₱5',   type: 'coin' }, { value: 1,    label: '₱1',   type: 'coin' },
  { value: 0.25, label: '25¢',  type: 'coin' }, { value: 0.10, label: '10¢',  type: 'coin' },
  { value: 0.05, label: '5¢',   type: 'coin' }, { value: 0.01, label: '1¢',   type: 'coin' }
];
let _currentCashCountDetail = null;

async function loadCashCountTab() {
  const c = state.settings.currency || '₱';
  try {
    const res = await fetch('/api/cash-register-counts?limit=100', { headers: { Authorization: `Bearer ${state.token}` } });
    if (!res.ok) return;
    const counts = await res.json();
    const se = document.getElementById('cashCountSummaryCards');
    if (se) {
      const latest = counts[0];
      const today = new Date().toISOString().slice(0,10);
      const todayShifts = counts.filter(e=>e.date===today);
      // Group today's by shift number, latest per shift
      const todayByShift = {};
      todayShifts.forEach(e => { const sn = e.shiftNumber||parseInt((e.shift||'shift1').replace('shift','')); todayByShift[sn]=e; });
      const todayShiftNums = Object.keys(todayByShift).map(Number).sort((a,b)=>a-b);
      const totalToday = todayShiftNums.reduce((s,sn)=>s+todayByShift[sn].total,0);
      se.innerHTML = `
        <div class="stat-card accent"><div class="label">LATEST COUNT</div><div class="value">${latest?c+latest.total.toFixed(2):'—'}</div><div class="sublabel">${latest?latest.date+' · Shift '+(latest.shiftNumber||parseInt((latest.shift||'shift1').replace('shift','')))+' · '+latest.countedByName:'No counts yet'}</div></div>
        <div class="stat-card navy"><div class="label">TODAY'S SHIFTS</div><div class="value">${todayShiftNums.length}</div><div class="sublabel">${todayShiftNums.length?'Shifts: '+todayShiftNums.map(n=>'S'+n).join(', '):'None today'}</div></div>
        <div class="stat-card success"><div class="label">TODAY LAST SHIFT</div><div class="value">${todayShiftNums.length?c+todayByShift[todayShiftNums[todayShiftNums.length-1]].total.toFixed(2):'—'}</div><div class="sublabel">${todayShiftNums.length?'Shift '+todayShiftNums[todayShiftNums.length-1]:'Not recorded'}</div></div>`;
    }
    const tbody = document.getElementById('cashCountHistoryBody');
    if (!tbody) return;
    if (!counts.length) { tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-3);">No counts recorded yet</td></tr>'; return; }
    tbody.innerHTML = counts.map(e => {
      const bt = (e.breakdown||[]).filter(b=>PH_BILLS.some(bi=>bi.value===b.denomination)).reduce((s,b)=>s+b.subtotal,0);
      const ct = (e.breakdown||[]).filter(b=>PH_COINS.some(ci=>ci.value===b.denomination)).reduce((s,b)=>s+b.subtotal,0);
      const sn = e.shiftNumber || parseInt((e.shift||'shift1').replace('shift',''));
      const hue = ((sn - 1) * 67) % 360;
      const shiftBadge = `<span class="badge" style="background:hsl(${hue},55%,38%);color:#fff;font-size:11px;">Shift ${sn}</span>`;
      return `<tr><td>${e.date}</td><td>${shiftBadge}</td><td>${e.countedByName||'—'}</td><td>${c}${bt.toFixed(2)}</td><td>${c}${ct.toFixed(2)}</td><td style="font-weight:700;color:var(--accent);">${c}${e.total.toFixed(2)}</td><td>${e.journalEntryId?'<span class="badge badge-success" style="font-size:11px;">Posted</span>':'<span class="badge" style="font-size:11px;background:var(--border);color:var(--text-3);">None</span>'}</td><td style="color:var(--text-3);font-size:13px;">${e.notes||'—'}</td><td><button class="btn btn-sm btn-secondary" onclick="viewCashCountDetail('${e.id}')">View</button></td></tr>`;
    }).join('');

    // Auto-load today's shift comparison
    const dateEl = document.getElementById('shiftCompareDate');
    if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0,10);
    await loadShiftComparison();
  } catch(e) { console.error('Failed to load cash counts:', e); }
}

async function showCashCountModal() {
  const de = document.getElementById('cashCountDate'); if (de) de.value = new Date().toISOString().slice(0,10);
  const ne = document.getElementById('cashCountNotes'); if (ne) ne.value = '';
  const bg = document.getElementById('billsGrid'); if (bg) bg.innerHTML = PH_BILLS.map(_denomCard).join('');
  const cg = document.getElementById('coinsGrid'); if (cg) cg.innerHTML = PH_COINS.map(_denomCard).join('');
  recalcCashCount();
  // Auto-suggest next shift number for today
  try {
    const today = new Date().toISOString().slice(0,10);
    const r = await fetch(`/api/cash-register-counts/shift-comparison?date=${today}`, { headers: { Authorization: `Bearer ${state.token}` } });
    if (r.ok) {
      const d = await r.json();
      const sn = document.getElementById('cashCountShiftNumber');
      const hint = document.getElementById('cashCountShiftHint');
      if (sn) sn.value = d.nextShift || 1;
      if (hint) hint.textContent = d.shifts.length ? `Today has ${d.shifts.length} shift(s) recorded. Next suggested: Shift ${d.nextShift}.` : 'No shifts recorded today yet.';
    }
  } catch(e) {}
  document.getElementById('cashCountModal').classList.add('active');
}
function _denomCard(d) {
  const k = 'denom_'+String(d.value).replace('.','_');
  return `<div class="cash-denom-card"><div class="cash-denom-label">${d.label} <small>${d.type}</small></div><input type="number" min="0" class="cash-denom-input form-input" id="${k}" placeholder="0" oninput="recalcCashCount()" value=""><div class="cash-denom-subtotal" id="${k}_sub">₱0.00</div></div>`;
}
function recalcCashCount() {
  const c = state.settings.currency||'₱'; let bt=0,ct=0;
  PH_BILLS.forEach(d=>{const k='denom_'+String(d.value).replace('.','_'),qty=parseInt(document.getElementById(k)?.value)||0,sub=d.value*qty;bt+=sub;const se=document.getElementById(k+'_sub');if(se)se.textContent=c+sub.toFixed(2);});
  PH_COINS.forEach(d=>{const k='denom_'+String(d.value).replace('.','_'),qty=parseInt(document.getElementById(k)?.value)||0,sub=Math.round(d.value*qty*100)/100;ct+=sub;const se=document.getElementById(k+'_sub');if(se)se.textContent=c+sub.toFixed(2);});
  const el=id=>document.getElementById(id);
  if(el('ccBillsTotal'))el('ccBillsTotal').textContent=c+bt.toFixed(2);
  if(el('ccCoinsTotal'))el('ccCoinsTotal').textContent=c+ct.toFixed(2);
  if(el('ccGrandTotal'))el('ccGrandTotal').textContent=c+(bt+ct).toFixed(2);
}
async function saveCashCount() {
  const date=document.getElementById('cashCountDate').value,notes=document.getElementById('cashCountNotes').value.trim(),postToAccounting=document.getElementById('cashCountPostAccounting').checked;
  const shiftNumber=parseInt(document.getElementById('cashCountShiftNumber')?.value)||1;
  if(shiftNumber<1||shiftNumber>99){showToast('Shift number must be between 1 and 99','error');return;}
  const dc={};[...PH_BILLS,...PH_COINS].forEach(d=>{const k='denom_'+String(d.value).replace('.','_'),qty=parseInt(document.getElementById(k)?.value)||0;if(qty>0)dc[d.value]=qty;});
  if(!Object.keys(dc).length){showToast('Please enter at least one denomination count','error');return;}
  try {
    const res=await fetch('/api/cash-register-counts',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${state.token}`},body:JSON.stringify({date,denomination_counts:dc,notes,postToAccounting,shiftNumber})});
    const data=await res.json();
    if(res.ok){showToast(`Shift ${shiftNumber} count saved — ${state.settings.currency||'₱'}${data.total.toFixed(2)}`,'success');closeModal('cashCountModal');loadCashCountTab();}
    else showToast(data.error||'Failed to save cash count','error');
  }catch(e){showToast('Failed to save cash count','error');}
}
async function loadShiftComparison() {
  const c = state.settings.currency || '₱';
  const dateEl = document.getElementById('shiftCompareDate');
  const date = dateEl ? dateEl.value : new Date().toISOString().slice(0, 10);
  const body = document.getElementById('shiftComparisonBody');
  if (!body) return;
  body.innerHTML = '<div style="color:var(--text-3);padding:16px;text-align:center;">Loading…</div>';
  try {
    const res = await fetch(`/api/cash-register-counts/shift-comparison?date=${date}`, { headers: { Authorization: `Bearer ${state.token}` } });
    if (!res.ok) { body.innerHTML = '<div style="color:var(--red);padding:16px;">Failed to load shift data</div>'; return; }
    const data = await res.json();
    const shifts = data.shifts;

    if (!shifts.length) {
      body.innerHTML = '<div style="text-align:center;color:var(--text-3);padding:24px;">No shifts recorded for this date.</div>';
      return;
    }

    const shiftColors = ['#1e3a5f','#16a34a','#b45309','#7c3aed','#db2777','#0369a1','#be123c','#065f46'];
    const fmt = v => c + Math.abs(v).toFixed(2);
    const osColor = v => v > 0.005 ? 'var(--green,#16a34a)' : v < -0.005 ? 'var(--red,#dc2626)' : 'var(--text-3)';
    const osLabel = v => Math.abs(v) < 0.01 ? '✓ Balanced' : v > 0 ? `Over +${fmt(v)}` : `Short −${fmt(v)}`;
    const osBadge = v => `<span style="display:inline-block;margin-top:6px;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700;background:${Math.abs(v)<0.01?'var(--green,#16a34a)':v>0?'var(--green,#16a34a)':'var(--red,#dc2626)'};color:#fff;">${osLabel(v)}</span>`;

    const shiftCard = (entry) => {
      const sn = entry.shiftNumber;
      const col = shiftColors[(sn-1) % shiftColors.length];
      const bt = (entry.breakdown||[]).filter(b=>PH_BILLS.some(bi=>bi.value===b.denomination)).reduce((s,b)=>s+b.subtotal,0);
      const ct = (entry.breakdown||[]).filter(b=>PH_COINS.some(ci=>ci.value===b.denomination)).reduce((s,b)=>s+b.subtotal,0);
      const hasAnalysis = entry.openingCash !== null;
      return `
        <div style="flex:1;min-width:220px;background:var(--surface);border:2px solid ${col};border-radius:var(--r-md);padding:18px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:${col};margin-bottom:12px;">Shift ${sn}</div>

          <div style="font-size:12px;color:var(--text-3);margin-bottom:2px;">Physical Count</div>
          <div style="font-size:26px;font-weight:800;color:var(--accent);margin-bottom:8px;">${c}${entry.total.toFixed(2)}</div>
          <div style="display:flex;gap:12px;font-size:12px;margin-bottom:8px;">
            <div><span style="color:var(--text-3);">Bills:</span> <strong>${c}${bt.toFixed(2)}</strong></div>
            <div><span style="color:var(--text-3);">Coins:</span> <strong>${c}${ct.toFixed(2)}</strong></div>
          </div>

          ${hasAnalysis ? `
          <div style="border-top:1px solid var(--border);margin:10px 0;padding-top:10px;">
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
              <span style="color:var(--text-3);">Opening (Shift ${sn-1})</span>
              <strong>${c}${entry.openingCash.toFixed(2)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
              <span style="color:var(--text-3);">+ Cash Sales</span>
              <strong>${c}${entry.cashSales.toFixed(2)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;border-top:1px dashed var(--border);padding-top:4px;margin-top:4px;">
              <span>Expected</span>
              <span>${c}${entry.expectedCash.toFixed(2)}</span>
            </div>
            <div style="text-align:center;margin-top:8px;">${osBadge(entry.overShort)}</div>
          </div>` : `
          <div style="font-size:11px;color:var(--text-3);font-style:italic;margin-top:4px;">Opening shift — no prior count to compare</div>`}

          <div style="font-size:12px;color:var(--text-3);margin-top:10px;">By: ${entry.countedByName||'—'}</div>
          ${entry.notes?`<div style="margin-top:4px;font-size:11px;color:var(--text-3);font-style:italic;">${entry.notes}</div>`:''}
          <button class="btn btn-sm btn-secondary" style="margin-top:10px;width:100%;" onclick="viewCashCountDetail('${entry.id}')">View Detail</button>
        </div>`;
    };

    // Summary table for shifts with analysis
    const analysisFShifts = shifts.filter(s => s.openingCash !== null);
    const summaryRows = analysisFShifts.map(s => {
      const os = s.overShort;
      return `<tr>
        <td><strong>Shift ${s.shiftNumber}</strong></td>
        <td style="text-align:right;">${c}${s.openingCash.toFixed(2)}</td>
        <td style="text-align:right;">${c}${s.cashSales.toFixed(2)}</td>
        <td style="text-align:right;font-weight:700;">${c}${s.expectedCash.toFixed(2)}</td>
        <td style="text-align:right;font-weight:700;">${c}${s.total.toFixed(2)}</td>
        <td style="text-align:right;font-weight:700;color:${osColor(os)};">${Math.abs(os)<0.01?'—':(os>0?'+':'-')+fmt(os)}</td>
        <td style="text-align:center;">${Math.abs(os)<0.01
          ?'<span class="badge badge-success" style="font-size:11px;">✓ OK</span>'
          :os>0
            ?'<span class="badge" style="font-size:11px;background:var(--green,#16a34a);color:#fff;">Over</span>'
            :'<span class="badge" style="font-size:11px;background:var(--red,#dc2626);color:#fff;">Short</span>'
        }</td>
      </tr>`;
    }).join('');

    body.innerHTML = `
      <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:stretch;margin-bottom:${analysisFShifts.length?'20px':'0'};">
        ${shifts.map(shiftCard).join('')}
      </div>
      ${analysisFShifts.length ? `
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--r-md);overflow:hidden;">
        <div style="padding:10px 16px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-2);border-bottom:1px solid var(--border);">
          Cash Accountability Summary
          <span style="font-size:11px;font-weight:400;color:var(--text-3);margin-left:8px;">(Opening + Cash Sales = Expected → vs Physical Count)</span>
        </div>
        <table class="data-table" style="margin:0;">
          <thead><tr>
            <th>Shift</th>
            <th style="text-align:right;">Opening</th>
            <th style="text-align:right;">+ Cash Sales</th>
            <th style="text-align:right;">Expected</th>
            <th style="text-align:right;">Physical Count</th>
            <th style="text-align:right;">Over / Short</th>
            <th style="text-align:center;">Status</th>
          </tr></thead>
          <tbody>${summaryRows}</tbody>
        </table>
      </div>` : ''}`;
  } catch(e) { body.innerHTML = '<div style="color:var(--red);padding:16px;">Error loading shift comparison</div>'; }
}

async function viewCashCountDetail(id) {
  const c=state.settings.currency||'₱';
  try {
    const res=await fetch('/api/cash-register-counts',{headers:{Authorization:`Bearer ${state.token}`}});
    if(!res.ok)return;
    const counts=await res.json(),entry=counts.find(x=>x.id===id);if(!entry)return;
    _currentCashCountDetail=entry;
    const bb=(entry.breakdown||[]).filter(b=>PH_BILLS.some(bi=>bi.value===b.denomination));
    const cb=(entry.breakdown||[]).filter(b=>PH_COINS.some(ci=>ci.value===b.denomination));
    const allD=[...PH_BILLS,...PH_COINS],dL=val=>allD.find(d=>d.value===val)?.label||('₱'+val);
    const rows=arr=>arr.filter(b=>b.count>0).map(b=>`<tr><td style="font-weight:600;">${dL(b.denomination)}</td><td style="text-align:center;">${b.count}</td><td style="text-align:right;font-weight:600;">${c}${b.subtotal.toFixed(2)}</td></tr>`).join('');
    const sn = entry.shiftNumber || parseInt((entry.shift||'shift1').replace('shift',''));
    document.getElementById('cashCountDetailBody').innerHTML=`
      <div style="margin-bottom:12px;"><div style="font-size:12px;color:var(--text-3);">Date: <strong>${entry.date}</strong> | Shift: <strong>${sn}</strong> | By: <strong>${entry.countedByName}</strong></div>${entry.notes?`<div style="font-size:12px;color:var(--text-3);">${entry.notes}</div>`:''}${entry.journalEntryId?`<div style="margin-top:6px;"><span class="badge badge-success" style="font-size:11px;">Journal: ${entry.journalEntryId}</span></div>`:''}</div>
      <table class="data-table" style="margin-bottom:16px;"><thead><tr><th>Denomination</th><th style="text-align:center;">Count</th><th style="text-align:right;">Subtotal</th></tr></thead><tbody>
        <tr><td colspan="3" style="font-weight:700;font-size:12px;text-transform:uppercase;background:var(--bg);color:var(--text-3);padding:6px 12px;">Bills</td></tr>
        ${rows(bb)||'<tr><td colspan="3" style="color:var(--text-3);text-align:center;padding:8px;">None</td></tr>'}
        <tr><td colspan="3" style="font-weight:700;font-size:12px;text-transform:uppercase;background:var(--bg);color:var(--text-3);padding:6px 12px;">Coins</td></tr>
        ${rows(cb)||'<tr><td colspan="3" style="color:var(--text-3);text-align:center;padding:8px;">None</td></tr>'}
      </tbody></table>
      <div style="display:flex;gap:16px;justify-content:flex-end;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:12px 16px;">
        <div style="text-align:right;"><div style="font-size:11px;color:var(--text-3);">Bills</div><div style="font-weight:700;">${c}${bb.reduce((s,b)=>s+b.subtotal,0).toFixed(2)}</div></div>
        <div style="text-align:right;"><div style="font-size:11px;color:var(--text-3);">Coins</div><div style="font-weight:700;">${c}${cb.reduce((s,b)=>s+b.subtotal,0).toFixed(2)}</div></div>
        <div style="text-align:right;border-left:2px solid var(--border);padding-left:16px;"><div style="font-size:11px;color:var(--text-3);">Grand Total</div><div style="font-size:22px;font-weight:800;color:var(--accent);">${c}${entry.total.toFixed(2)}</div></div>
      </div>`;
    document.getElementById('cashCountDetailModal').classList.add('active');
  }catch(e){showToast('Failed to load detail','error');}
}
function printCashCount() {
  const entry=_currentCashCountDetail;if(!entry)return;
  const c=state.settings.currency||'₱',allD=[...PH_BILLS,...PH_COINS],dL=val=>allD.find(d=>d.value===val)?.label||('₱'+val);
  const sn = entry.shiftNumber || parseInt((entry.shift||'shift1').replace('shift',''));
  const bb=(entry.breakdown||[]).filter(b=>PH_BILLS.some(bi=>bi.value===b.denomination)&&b.count>0);
  const cb=(entry.breakdown||[]).filter(b=>PH_COINS.some(ci=>ci.value===b.denomination)&&b.count>0);
  const bT=bb.reduce((s,b)=>s+b.subtotal,0),cT=cb.reduce((s,b)=>s+b.subtotal,0);
  const rows=arr=>arr.map(b=>`<tr><td>${dL(b.denomination)}</td><td style="text-align:center;">${b.count}</td><td style="text-align:right;">${c}${b.subtotal.toFixed(2)}</td></tr>`).join('');
  const win=window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>Cash Count</title><style>body{font-family:Arial,sans-serif;max-width:400px;margin:20px auto;font-size:13px;}h2{text-align:center;font-size:16px;}p{text-align:center;margin:2px 0;color:#555;font-size:12px;}table{width:100%;border-collapse:collapse;margin-top:12px;}th,td{border-bottom:1px solid #ddd;padding:5px 8px;}th{background:#f5f5f5;font-size:11px;text-transform:uppercase;}.sh td{background:#f0f0f0;font-weight:700;font-size:11px;text-transform:uppercase;color:#555;}.tr td{font-weight:700;}.gt{text-align:right;font-size:18px;font-weight:800;margin-top:16px;border-top:2px solid #333;padding-top:8px;}.sig{margin-top:40px;display:flex;justify-content:space-between;}.sig div{width:45%;border-top:1px solid #333;padding-top:4px;font-size:11px;text-align:center;}</style></head><body><h2>${state.settings.canteenName||'MBC Canteen'}</h2><p>CASH REGISTER COUNT SHEET</p><p>Date: ${entry.date} | Shift ${sn} | By: ${entry.countedByName}</p>${entry.notes?`<p>${entry.notes}</p>`:''}<table><thead><tr><th>Denomination</th><th>Count</th><th>Amount</th></tr></thead><tbody><tr class="sh"><td colspan="3">Bills</td></tr>${rows(bb)||'<tr><td colspan="3" style="text-align:center;color:#999;">None</td></tr>'}<tr class="tr"><td colspan="2">Bills Subtotal</td><td style="text-align:right;">${c}${bT.toFixed(2)}</td></tr><tr class="sh"><td colspan="3">Coins</td></tr>${rows(cb)||'<tr><td colspan="3" style="text-align:center;color:#999;">None</td></tr>'}<tr class="tr"><td colspan="2">Coins Subtotal</td><td style="text-align:right;">${c}${cT.toFixed(2)}</td></tr></tbody></table><div class="gt">Grand Total: ${c}${entry.total.toFixed(2)}</div><div class="sig"><div>Counted by<br><br>${entry.countedByName}</div><div>Verified by<br><br>&nbsp;</div></div></body></html>`);
  win.document.close();win.print();
}

async function fixMonthlyCOGSInventoryCredits() {
  if (!confirm('Replace Inventory (1003) credits in Monthly COGS entries with Accounts Payable (2001)?\n\nThis fixes the negative Inventory and Out-of-Balance error.\n\nProceed?')) return;
  try {
    const res=await fetch('/api/monthly-cogs/fix-inventory-credits',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${state.token}`}});
    const data=await res.json();
    if(res.ok){showToast(data.message,data.fixed>0?'success':'info');if(state.currentTab==='accounting')loadBalanceSheet();}
    else showToast(data.error||'Migration failed','error');
  }catch(e){showToast('Network error','error');}
}

document.addEventListener('DOMContentLoaded', () => { init().then(() => AUTO_UPDATE.start()); });