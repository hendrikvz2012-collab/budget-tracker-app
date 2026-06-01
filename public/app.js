// ── State ────────────────────────────────────────────────────────────────
const state = {
  token: localStorage.getItem('bt_token') || sessionStorage.getItem('bt_token') || '',
  user: null,
  subStatus: null,
  view: 'dashboard',
  categories: [],
  transactions: [],
  payouts: [],
  dashboard: null,
  charts: {},
  filters: { type: '', category_id: '', search: '', month: '', year: '' },
  paypalSdkLoaded: false,
};

// ── API Client ──────────────────────────────────────────────────────────
// ── Config ──────────────────────────────────────────────────────────────
// Set API_BASE to your deployed backend URL for mobile builds.
// Leave empty for web (same-origin requests).
const API_BASE = '';

const API = {
  _url(url) { return API_BASE + url; },
  headers() {
    const h = { 'Content-Type': 'application/json' };
    if (state.token) h['Authorization'] = `Bearer ${state.token}`;
    return h;
  },
  async get(url) {
    const r = await fetch(this._url(url), { headers: this.headers() });
    if (r.status === 401) { logout(); throw new Error('Unauthorized'); }
    if (!r.ok) throw new Error((await r.json()).error || 'Request failed');
    return r.json();
  },
  async post(url, body) {
    const r = await fetch(this._url(url), { method: 'POST', headers: this.headers(), body: JSON.stringify(body) });
    if (r.status === 401) { logout(); throw new Error('Unauthorized'); }
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || data.details?.message || 'Request failed');
    return data;
  },
  async put(url, body) {
    const r = await fetch(this._url(url), { method: 'PUT', headers: this.headers(), body: JSON.stringify(body) });
    if (r.status === 401) { logout(); throw new Error('Unauthorized'); }
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Request failed');
    return data;
  },
  async del(url) {
    const r = await fetch(this._url(url), { method: 'DELETE', headers: this.headers() });
    if (r.status === 401) { logout(); throw new Error('Unauthorized'); }
    if (!r.ok) throw new Error((await r.json()).error || 'Request failed');
    return r.json();
  }
};

// ── Toast ───────────────────────────────────────────────────────────────
function toast(msg, type = '') {
  let c = document.getElementById('toast-container');
  if (!c) { c = document.createElement('div'); c.id = 'toast-container'; c.className = 'toast-container'; document.body.appendChild(c); }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
}

// ── Auth ────────────────────────────────────────────────────────────────
async function login(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const remember = document.getElementById('login-remember')?.checked;
  try {
    const data = await API.post('/api/auth/login', { email, password });
    state.token = data.token;
    state.user = data.user;
    if (remember) {
      localStorage.setItem('bt_token', data.token);
      sessionStorage.removeItem('bt_token');
    } else {
      sessionStorage.setItem('bt_token', data.token);
      localStorage.removeItem('bt_token');
    }
    applyTheme(state.user.theme || 'auto');
    initApp();
  } catch (err) { showAuthError(err.message); }
}

async function signup(e) {
  e.preventDefault();
  const name = document.getElementById('signup-name').value;
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  try {
    const data = await API.post('/api/auth/signup', { name, email, password });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('bt_token', data.token);
    sessionStorage.removeItem('bt_token');
    applyTheme('auto');
    initApp();
  } catch (err) { showAuthError(err.message); }
}

function logout() {
  state.token = '';
  state.user = null;
  localStorage.removeItem('bt_token');
  sessionStorage.removeItem('bt_token');
  Object.values(state.charts).forEach(c => { try { c.destroy(); } catch {} });
  state.charts = {};
  renderAuth();
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
  else toast(msg, 'error');
}

async function initApp() {
  try {
    state.user = await API.get('/api/auth/me');
    state.subStatus = await API.get('/api/subscription/status');
    applyTheme(state.user.theme || 'auto');
    if (state.subStatus.active) {
      renderApp();
    } else {
      renderPaywall();
    }
  } catch { logout(); }
}

// ── Theme ───────────────────────────────────────────────────────────────
function applyTheme(t) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = t === 'auto' ? (prefersDark ? 'dark' : 'light') : t;
  document.documentElement.setAttribute('data-theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  if (state.user) {
    const theme = next === (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') ? 'auto' : next;
    API.put('/api/user/profile', { theme });
    state.user.theme = theme;
  }
}

// ── Router ──────────────────────────────────────────────────────────────
function navigate(view) {
  state.view = view;
  renderPage();
  document.querySelectorAll('.sidebar nav a').forEach(a => {
    a.classList.toggle('active', a.dataset.view === view);
  });
}

function renderPage() {
  const main = document.getElementById('page-content');
  if (!main) return;
  switch (state.view) {
    case 'dashboard': renderDashboard(main); break;
    case 'transactions': renderTransactions(main); break;
    case 'budgets': renderBudgets(main); break;
    case 'subscription': renderSubscription(main); break;
    case 'settings': renderSettings(main); break;
    default: renderDashboard(main);
  }
}

// ── Render: Landing Page ───────────────────────────────────────────────
function renderAuth() {
  document.getElementById('app').innerHTML = `
    <div class="landing">
      <header class="landing-header" id="landing-header">
        <div class="landing-header-inner">
          <div class="landing-logo">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect width="28" height="28" rx="8" fill="url(#lg)"/><path d="M14 6v16M6 14h16" stroke="#fff" stroke-width="3" stroke-linecap="round"/><defs><linearGradient id="lg" x1="0" y1="0" x2="28" y2="28"><stop stop-color="#059669"/><stop offset="1" stop-color="#10B981"/></linearGradient></defs></svg>
            Budget Tracker
          </div>
          <nav class="landing-nav">
            <a href="#features" onclick="scrollToSection('features')">Features</a>
            <a href="#pricing" onclick="scrollToSection('pricing')">Pricing</a>
            <a href="#" onclick="openAuthModal('login');return false">Log in</a>
            <a href="#" class="btn btn-primary btn-sm" onclick="openAuthModal('signup');return false">Start free trial</a>
          </nav>
          <button class="mobile-menu-btn" onclick="document.querySelector('.landing-nav').classList.toggle('open')" aria-label="Menu">☰</button>
        </div>
      </header>

      <section class="hero">
        <div class="hero-bg">
          <div class="hero-shape hero-shape-1"></div>
          <div class="hero-shape hero-shape-2"></div>
          <div class="hero-shape hero-shape-3"></div>
        </div>
        <div class="hero-content reveal">
          <div class="hero-badge reveal" data-delay="0">✨ Free 7-day trial — no credit card</div>
          <h1 class="reveal" data-delay="100">Take control of your<br><span class="gradient-text">finances</span></h1>
          <p class="hero-sub reveal" data-delay="200">Track every rand, set smart budgets, and grow your savings. The simplest way to master your money.</p>
          <div class="hero-cta reveal" data-delay="300">
            <button class="btn btn-primary btn-lg btn-glow" onclick="openAuthModal('signup')">Get started free →</button>
            <button class="btn btn-secondary btn-lg" onclick="scrollToSection('features')">Explore features</button>
          </div>
          <div class="hero-stats reveal" data-delay="400">
            <div class="stat-item"><strong class="counter" data-target="7">0</strong><span>Days free trial</span></div>
            <div class="stat-item"><strong>$2.50</strong><span>Per month after</span></div>
            <div class="stat-item"><strong class="counter" data-target="100">0</strong><span>% secure</span></div>
          </div>
        </div>
        <div class="hero-scroll" onclick="scrollToSection('features')">
          <div class="scroll-mouse"><div class="scroll-dot"></div></div>
        </div>
      </section>

      <div class="divider-wave"><svg viewBox="0 0 1440 60" preserveAspectRatio="none"><path d="M0,30 C360,60 1080,0 1440,30 L1440,60 L0,60 Z" fill="var(--surface2)"/></svg></div>

      <section class="section" id="features">
        <div class="section-inner">
          <div class="section-label reveal">Features</div>
          <h2 class="section-title reveal" data-delay="100">Everything you need to<br class="hide-mobile"> master your money</h2>
          <div class="features-grid">
            <div class="feature-card reveal" data-delay="0">
              <div class="feature-icon" style="background:var(--green-light);color:var(--green)">📊</div>
              <h3>Dashboard</h3>
              <p>See your income, expenses, and balance at a glance. Beautiful charts show where your money goes.</p>
            </div>
            <div class="feature-card reveal" data-delay="100">
              <div class="feature-icon" style="background:var(--blue-light);color:var(--blue)">💳</div>
              <h3>Transactions</h3>
              <p>Log every transaction with categories. Search, filter, and export your data anytime.</p>
            </div>
            <div class="feature-card reveal" data-delay="200">
              <div class="feature-icon" style="background:var(--amber-light);color:var(--amber)">🎯</div>
              <h3>Budgets</h3>
              <p>Set monthly spending limits per category. Get visual alerts when you're close to your limit.</p>
            </div>
            <div class="feature-card reveal" data-delay="0">
              <div class="feature-icon" style="background:var(--purple-light);color:var(--purple)">💸</div>
              <h3>PayPal Payouts</h3>
              <p>Withdraw your savings directly to your PayPal account. Your money, your control.</p>
            </div>
            <div class="feature-card reveal" data-delay="100">
              <div class="feature-icon" style="background:var(--pink);color:#fff">📱</div>
              <h3>Works everywhere</h3>
              <p>Responsive design works on desktop, tablet, and phone. Access your budget anywhere.</p>
            </div>
            <div class="feature-card reveal" data-delay="200">
              <div class="feature-icon" style="background:var(--green-light);color:var(--green)">🔒</div>
              <h3>Private & secure</h3>
              <p>Your data is encrypted and stored securely. Password-protected with JWT authentication.</p>
            </div>
          </div>
        </div>
      </section>

      <div class="divider-wave flipped"><svg viewBox="0 0 1440 60" preserveAspectRatio="none"><path d="M0,30 C360,60 1080,0 1440,30 L1440,60 L0,60 Z" fill="var(--bg)"/></svg></div>

      <section class="section section-dark" id="pricing">
        <div class="section-inner">
          <div class="section-label reveal">Pricing</div>
          <h2 class="section-title reveal" data-delay="100">Simple, transparent pricing</h2>
          <p class="section-sub reveal" data-delay="150">Start free, then only $2.50/month. No hidden fees.</p>
          <div class="pricing-grid">
            <div class="pricing-card reveal" data-delay="0">
              <div class="pricing-name">Free Trial</div>
              <div class="pricing-price"><span class="currency">$</span>0</div>
              <div class="pricing-period">for 7 days</div>
              <ul class="pricing-features">
                <li><span class="check">✓</span> All features included</li>
                <li><span class="check">✓</span> Full dashboard access</li>
                <li><span class="check">✓</span> Unlimited transactions</li>
                <li><span class="check">✓</span> Budget tracking</li>
                <li><span class="check">✓</span> No credit card needed</li>
              </ul>
              <button class="btn btn-secondary btn-block" onclick="openAuthModal('signup')">Get started</button>
            </div>
            <div class="pricing-card pricing-featured reveal" data-delay="100">
              <div class="pricing-badge">POPULAR</div>
              <div class="pricing-name">Monthly</div>
              <div class="pricing-price"><span class="currency">$</span>2.50</div>
              <div class="pricing-period">per month</div>
              <ul class="pricing-features">
                <li><span class="check">✓</span> Everything in Free</li>
                <li><span class="check">✓</span> PayPal payouts</li>
                <li><span class="check">✓</span> Data export (CSV/JSON)</li>
                <li><span class="check">✓</span> Priority support</li>
                <li><span class="check">✓</span> Cancel anytime</li>
              </ul>
              <button class="btn btn-primary btn-block btn-glow" onclick="openAuthModal('signup')">Subscribe now</button>
            </div>
            <div class="pricing-card reveal" data-delay="200">
              <div class="pricing-name">Lifetime</div>
              <div class="pricing-price"><span class="currency">$</span>49</div>
              <div class="pricing-period">one-time</div>
              <ul class="pricing-features">
                <li><span class="check">✓</span> Everything in Monthly</li>
                <li><span class="check">✓</span> Never pay again</li>
                <li><span class="check">✓</span> Early access to features</li>
                <li><span class="check">✓</span> VIP support</li>
                <li><span class="check">✓</span> Lifetime updates</li>
              </ul>
              <button class="btn btn-secondary btn-block" onclick="openAuthModal('signup')">Get lifetime</button>
            </div>
          </div>
        </div>
      </section>

      <footer class="landing-footer">
        <div class="section-inner">
          <div class="footer-grid">
            <div>
              <div class="landing-logo" style="margin-bottom:12px">
                <svg width="24" height="24" viewBox="0 0 28 28" fill="none" style="vertical-align:middle;margin-right:6px"><rect width="28" height="28" rx="8" fill="url(#lg2)"/><path d="M14 6v16M6 14h16" stroke="#fff" stroke-width="3" stroke-linecap="round"/><defs><linearGradient id="lg2" x1="0" y1="0" x2="28" y2="28"><stop stop-color="#059669"/><stop offset="1" stop-color="#10B981"/></linearGradient></defs></svg>
                Budget Tracker
              </div>
              <p style="color:var(--text2);font-size:14px">The simplest way to track your money.</p>
            </div>
            <div>
              <h4>Product</h4>
              <a href="#features" onclick="scrollToSection('features')">Features</a>
              <a href="#pricing" onclick="scrollToSection('pricing')">Pricing</a>
            </div>
            <div>
              <h4>Company</h4>
              <a href="mailto:support@budgettracker.app">Contact</a>
              <a href="#">Privacy</a>
              <a href="#">Terms</a>
            </div>
          </div>
          <div class="footer-bottom">© ${new Date().getFullYear()} Budget Tracker. All rights reserved.</div>
        </div>
      </footer>
    </div>

    <div class="modal-overlay hidden" id="auth-modal" onclick="if(event.target===this)closeAuthModal()">
      <div class="modal">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <h3 id="auth-modal-title" style="margin:0">Log in</h3>
          <button class="btn btn-ghost btn-icon" onclick="closeAuthModal()">✕</button>
        </div>
        <div id="auth-error" class="auth-error"></div>
        <div id="auth-forms">${authLoginForm()}</div>
        <div class="auth-switch" style="margin-top:16px">
          <span id="auth-switch-text">Don't have an account?</span>
          <a id="auth-switch-btn" onclick="toggleAuthMode()">Start free trial</a>
        </div>
      </div>
    </div>
  `;

  // Scroll reveal animation
  setTimeout(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const delay = parseInt(entry.target.dataset.delay) || 0;
          setTimeout(() => entry.target.classList.add('visible'), delay);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

    // Counter animation
    document.querySelectorAll('.counter').forEach(el => {
      const target = parseInt(el.dataset.target);
      const dur = 1500; const step = Math.max(1, Math.floor(target / 40));
      let cur = 0;
      const interval = setInterval(() => {
        cur += step;
        if (cur >= target) { cur = target; clearInterval(interval); }
        el.textContent = cur + (target === 100 ? '%' : '');
      }, dur / (target / step));
    });

    // Header scroll effect
    const header = document.getElementById('landing-header');
    window.addEventListener('scroll', () => {
      header.classList.toggle('scrolled', window.scrollY > 50);
    }, { passive: true });
  }, 50);
}

let authMode = 'login';

function openAuthModal(mode) {
  authMode = mode || 'login';
  const modal = document.getElementById('auth-modal');
  const title = document.getElementById('auth-modal-title');
  const forms = document.getElementById('auth-forms');
  const switchText = document.getElementById('auth-switch-text');
  const switchBtn = document.getElementById('auth-switch-btn');

  if (authMode === 'login') {
    title.textContent = 'Log in';
    forms.innerHTML = authLoginForm();
    switchText.textContent = "Don't have an account?";
    switchBtn.textContent = 'Start free trial';
  } else {
    title.textContent = 'Start your free trial';
    forms.innerHTML = authSignupForm();
    switchText.textContent = 'Already have an account?';
    switchBtn.textContent = 'Log in';
  }

  document.getElementById('auth-error').style.display = 'none';
  modal.classList.remove('hidden');
}

function closeAuthModal() {
  document.getElementById('auth-modal').classList.add('hidden');
}

function toggleAuthMode() {
  openAuthModal(authMode === 'login' ? 'signup' : 'login');
}

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
}

function authLoginForm() {
  return `
    <form onsubmit="login(event)">
      <div class="form-group">
        <label>Email</label>
        <input id="login-email" type="email" placeholder="you@example.com" required autocomplete="email">
      </div>
      <div class="form-group">
        <label>Password</label>
        <input id="login-password" type="password" placeholder="Enter your password" required autocomplete="current-password">
      </div>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text2);margin:12px 0;cursor:pointer">
        <input id="login-remember" type="checkbox" checked />
        Remember me
      </label>
      <button type="submit" class="btn btn-primary btn-block">Log in</button>
    </form>
  `;
}

function authSignupForm() {
  return `
    <form onsubmit="signup(event)">
      <div class="form-group">
        <label>Full name</label>
        <input id="signup-name" type="text" placeholder="Your name" required>
      </div>
      <div class="form-group">
        <label>Email</label>
        <input id="signup-email" type="email" placeholder="you@example.com" required autocomplete="email">
      </div>
      <div class="form-group">
        <label>Password</label>
        <input id="signup-password" type="password" placeholder="Create a password (min 6 chars)" required minlength="6" autocomplete="new-password">
      </div>
      <p style="font-size:12px;color:var(--text3);margin-top:-8px;margin-bottom:12px">Free 7-day trial. No credit card needed.</p>
      <button type="submit" class="btn btn-primary btn-block">Start free trial</button>
    </form>
  `;
}

// ── Render: App Shell ───────────────────────────────────────────────────
function renderApp() {
  const initial = state.view;
  document.getElementById('app').innerHTML = `
    <div class="app-layout">
      <aside class="sidebar" id="sidebar">
        <div class="logo">💰 Budget</div>
        <nav>
          <a data-view="dashboard" onclick="navigate('dashboard')" class="active">📊 Dashboard</a>
          <a data-view="transactions" onclick="navigate('transactions')">💳 Transactions</a>
          <a data-view="budgets" onclick="navigate('budgets')">🎯 Budgets</a>
          <a data-view="subscription" onclick="navigate('subscription')">🔑 Subscription</a>
          <a data-view="settings" onclick="navigate('settings')">⚙️ Settings</a>
        </nav>
        <div class="user-section" onclick="navigate('settings')">
          <div class="avatar">${(state.user?.name || '?')[0].toUpperCase()}</div>
          <div class="user-info">
            <div class="user-name">${escHtml(state.user?.name || '')}</div>
            <div class="user-email">${escHtml(state.user?.email || '')}</div>
          </div>
        </div>
      </aside>
      <main class="main-content">
        <div class="topbar">
          <button class="mobile-menu-btn" onclick="document.getElementById('sidebar').classList.toggle('open')">☰</button>
          <h2 id="page-title">Dashboard</h2>
          <div class="actions">
            <button class="theme-btn" onclick="toggleTheme()" title="Toggle theme">🌓</button>
            <button class="btn btn-ghost btn-sm" onclick="logout()">Log out</button>
          </div>
        </div>
        <div class="page-content" id="page-content"></div>
      </main>
    </div>
  `;
  navigate(initial);
}

// ── Render: Dashboard ───────────────────────────────────────────────────
let categoryChart = null, trendChart = null;

async function renderDashboard(el) {
  document.getElementById('page-title').textContent = 'Dashboard';
  el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text2)">Loading...</div>';

  try {
    const data = await API.get('/api/dashboard');
    state.dashboard = data;

    el.innerHTML = `
      <div class="summary-grid">
        <div class="card stat-card income">
          <div class="icon">💰</div>
          <div class="label">Income</div>
          <div class="value">${fmt(data.income)}</div>
        </div>
        <div class="card stat-card expense">
          <div class="icon">💸</div>
          <div class="label">Expenses</div>
          <div class="value">${fmt(data.expenses)}</div>
        </div>
        <div class="card stat-card balance">
          <div class="icon">🏦</div>
          <div class="label">Balance</div>
          <div class="value">${fmt(data.balance)}</div>
          <div class="sub">${data.balance >= 0 ? '✓ On track' : '⚠ Overspent'}</div>
        </div>
      </div>

      <div class="grid-2" style="margin-bottom:24px">
        <div class="card">
          <div class="card-header"><h3>Spending by Category</h3></div>
          <div class="chart-wrap"><canvas id="chart-category"></canvas></div>
        </div>
        <div class="card">
          <div class="card-header"><h3>Monthly Trend</h3></div>
          <div class="chart-wrap"><canvas id="chart-trend"></canvas></div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>Recent Transactions</h3>
          <a class="btn btn-secondary btn-sm" onclick="navigate('transactions')">View all</a>
        </div>
        ${data.recent?.length ? renderTxTable(data.recent) : '<div class="empty-state" style="padding:24px"><p>No transactions yet</p></div>'}
      </div>
    `;

    renderCategoryChart(data.by_category);
    renderTrendChart(data.monthly);
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><p style="color:var(--red)">${escHtml(err.message)}</p></div>`;
  }
}

function renderCategoryChart(data) {
  const canvas = document.getElementById('chart-category');
  if (!canvas) return;
  if (categoryChart) { categoryChart.destroy(); }

  const total = data.reduce((s, c) => s + c.spent, 0);
  if (!total) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.parentElement.innerHTML = '<div style="color:var(--text2);text-align:center;width:100%">No data yet</div>';
    return;
  }

  categoryChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: data.map(c => c.name),
      datasets: [{
        data: data.map(c => c.spent),
        backgroundColor: data.map(c => c.color),
        borderWidth: 0,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true, font: { size: 12 } } }
      }
    }
  });
}

function renderTrendChart(data) {
  const canvas = document.getElementById('chart-trend');
  if (!canvas) return;
  if (trendChart) { trendChart.destroy(); }

  if (!data?.length) {
    canvas.parentElement.innerHTML = '<div style="color:var(--text2);text-align:center;width:100%">No data yet</div>';
    return;
  }

  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  trendChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.map(d => monthNames[parseInt(d.m) - 1]),
      datasets: [
        { label: 'Income', data: data.map(d => d.income), backgroundColor: 'rgba(5,150,105,.7)', borderRadius: 4 },
        { label: 'Expenses', data: data.map(d => d.expenses), backgroundColor: 'rgba(220,38,38,.7)', borderRadius: 4 },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { usePointStyle: true, font: { size: 11 } } } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { beginAtZero: true, ticks: { font: { size: 11 }, callback: v => 'R' + v.toLocaleString() } }
      }
    }
  });
}

// ── Render: Transactions ────────────────────────────────────────────────
async function renderTransactions(el) {
  document.getElementById('page-title').textContent = 'Transactions';
  el.innerHTML = `
    <div class="filters">
      <input id="tx-search" placeholder="Search..." oninput="debounce(loadTransactions, 300)()" />
      <select id="tx-type" onchange="loadTransactions()">
        <option value="">All types</option>
        <option value="income">Income</option>
        <option value="expense">Expense</option>
      </select>
      <select id="tx-category" onchange="loadTransactions()">
        <option value="">All categories</option>
      </select>
      <button class="btn btn-primary" onclick="openTxModal()">+ Add</button>
    </div>
    <div id="tx-list"><div style="text-align:center;padding:40px;color:var(--text2)">Loading...</div></div>
  `;

  try {
    state.categories = await API.get('/api/categories');
    const catSelect = document.getElementById('tx-category');
    state.categories.filter(c => c.type === 'expense').forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id; opt.textContent = `${c.icon} ${c.name}`;
      catSelect.appendChild(opt);
    });
    await loadTransactions();
  } catch (err) { document.getElementById('tx-list').innerHTML = `<div style="color:var(--red);padding:20px">${escHtml(err.message)}</div>`; }
}

async function loadTransactions() {
  const search = document.getElementById('tx-search')?.value || '';
  const type = document.getElementById('tx-type')?.value || '';
  const category_id = document.getElementById('tx-category')?.value || '';
  try {
    state.transactions = await API.get(`/api/transactions?search=${encodeURIComponent(search)}&type=${type}&category_id=${category_id}&limit=200`);
    const list = document.getElementById('tx-list');
    if (!list) return;
    if (!state.transactions.length) {
      list.innerHTML = `<div class="empty-state"><div class="icon">📋</div><h3>No transactions</h3><p>Add your first transaction to get started</p></div>`;
      return;
    }
    list.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th><th></th></tr></thead>
          <tbody>
            ${state.transactions.map(t => `
              <tr>
                <td style="white-space:nowrap;color:var(--text2);font-size:13px">${t.date}</td>
                <td>${escHtml(t.description)}</td>
                <td>${t.category_icon || ''} ${escHtml(t.category_name || '—')}</td>
                <td class="amount ${t.type === 'income' ? 'positive' : 'negative'}">${t.type === 'income' ? '+' : '−'}${fmt(t.amount)}</td>
                <td style="text-align:right">
                  <button class="btn btn-ghost btn-icon" onclick="editTx(${t.id})" title="Edit">✏️</button>
                  <button class="btn btn-ghost btn-icon" onclick="deleteTx(${t.id})" title="Delete">🗑️</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) { /* silently handle */ }
}

function openTxModal(tx) {
  const isEdit = !!tx;
  const cats = state.categories || [];
  document.getElementById('app').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="tx-modal" onclick="if(event.target===this)closeTxModal()">
      <div class="modal">
        <h3>${isEdit ? 'Edit' : 'Add'} Transaction</h3>
        <form onsubmit="saveTx(event, ${isEdit ? tx.id : 'null'})">
          <div class="form-group">
            <label>Description</label>
            <input id="tx-desc" value="${isEdit ? escHtml(tx.description) : ''}" placeholder="e.g. Groceries" required />
          </div>
          <div class="form-group">
            <label>Amount (R)</label>
            <input id="tx-amount" type="number" step="0.01" value="${isEdit ? tx.amount : ''}" placeholder="0.00" required />
          </div>
          <div class="grid-2" style="gap:12px">
            <div class="form-group">
              <label>Type</label>
              <select id="tx-type-modal" onchange="updateTxCatOptions()">
                <option value="expense" ${isEdit && tx.type === 'expense' ? 'selected' : ''}>Expense</option>
                <option value="income" ${isEdit && tx.type === 'income' ? 'selected' : ''}>Income</option>
              </select>
            </div>
            <div class="form-group">
              <label>Category</label>
              <select id="tx-cat-modal"></select>
            </div>
          </div>
          <div class="form-group">
            <label>Date</label>
            <input id="tx-date" type="date" value="${isEdit ? tx.date : new Date().toISOString().slice(0,10)}" required />
          </div>
          <div class="form-group">
            <label>Note (optional)</label>
            <input id="tx-note" value="${isEdit ? escHtml(tx.note || '') : ''}" placeholder="Add a note" />
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" onclick="closeTxModal()">Cancel</button>
            <button type="submit" class="btn btn-primary">${isEdit ? 'Save' : 'Add'}</button>
          </div>
        </form>
      </div>
    </div>
  `);
  updateTxCatOptions(isEdit ? tx.category_id : null);
  if (!isEdit) document.getElementById('tx-desc').focus();
}

function updateTxCatOptions(selectedId) {
  const type = document.getElementById('tx-type-modal')?.value || 'expense';
  const sel = document.getElementById('tx-cat-modal');
  if (!sel) return;
  const cats = state.categories.filter(c => c.type === type);
  sel.innerHTML = cats.map(c => `<option value="${c.id}" ${c.id == selectedId ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('');
}

function closeTxModal() {
  const el = document.getElementById('tx-modal');
  if (el) el.remove();
}

async function saveTx(e, id) {
  e.preventDefault();
  const body = {
    description: document.getElementById('tx-desc').value.trim(),
    amount: parseFloat(document.getElementById('tx-amount').value),
    type: document.getElementById('tx-type-modal').value,
    category_id: parseInt(document.getElementById('tx-cat-modal').value),
    date: document.getElementById('tx-date').value,
    note: document.getElementById('tx-note').value.trim(),
  };
  try {
    if (id) await API.put(`/api/transactions/${id}`, body);
    else await API.post('/api/transactions', body);
    closeTxModal();
    toast(id ? 'Transaction updated' : 'Transaction added', 'success');
    loadTransactions();
    if (state.view === 'dashboard') navigate('dashboard');
  } catch (err) { toast(err.message, 'error'); }
}

async function editTx(id) {
  const tx = state.transactions.find(t => t.id === id);
  if (tx) openTxModal(tx);
}

async function deleteTx(id) {
  if (!confirm('Delete this transaction?')) return;
  try {
    await API.del(`/api/transactions/${id}`);
    toast('Transaction deleted');
    loadTransactions();
  } catch (err) { toast(err.message, 'error'); }
}

// ── Render: Budgets ─────────────────────────────────────────────────────
async function renderBudgets(el) {
  document.getElementById('page-title').textContent = 'Budgets';
  el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text2)">Loading...</div>';

  try {
    const cats = state.categories = await API.get('/api/categories');
    const expenseCats = cats.filter(c => c.type === 'expense');

    if (!expenseCats.length) {
      el.innerHTML = '<div class="empty-state"><div class="icon">🎯</div><h3>No categories</h3><p>Create categories to set budgets</p></div>';
      return;
    }

    el.innerHTML = `
      <div class="card" style="margin-bottom:16px">
        <div class="card-header">
          <h3>Monthly Budgets</h3>
          <button class="btn btn-primary btn-sm" onclick="openBudgetModal()">Set budgets</button>
        </div>
      </div>
      <div class="grid-2" id="budget-list">
        ${expenseCats.map(c => `
          <div class="card budget-card">
            <div class="cat-header">
              <span style="font-size:24px">${c.icon}</span>
              <span class="cat-name">${escHtml(c.name)}</span>
              <span class="budget-numbers">
                <strong>${fmt(getCategorySpend(c.id))}</strong> / ${fmt(c.budget || 0)}
              </span>
            </div>
            <div class="progress-wrap">
              <div class="progress">
                <div class="progress-fill" style="width:${getBudgetPercent(c)}%;background:${getBudgetColor(c)}"></div>
              </div>
              <span class="progress-text">${getBudgetPercent(c)}%</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) { el.innerHTML = `<div style="color:var(--red);padding:20px">${escHtml(err.message)}</div>`; }
}

function getCategorySpend(catId) {
  if (!state.dashboard?.by_category) return 0;
  const found = state.dashboard.by_category.find(c => c.id === catId);
  return found ? found.spent : 0;
}

function getBudgetPercent(cat) {
  if (!cat.budget) return 0;
  return Math.min(100, Math.round((getCategorySpend(cat.id) / cat.budget) * 100));
}

function getBudgetColor(cat) {
  const pct = getBudgetPercent(cat);
  if (pct > 100) return '#DC2626';
  if (pct > 80) return '#D97706';
  return '#059669';
}

function openBudgetModal() {
  const cats = state.categories.filter(c => c.type === 'expense');
  document.getElementById('app').insertAdjacentHTML('beforeend', `
    <div class="modal-overlay" id="budget-modal" onclick="if(event.target===this)this.remove()">
      <div class="modal" style="max-width:520px">
        <h3>Set Monthly Budgets</h3>
        <form onsubmit="saveBudgets(event)">
          ${cats.map(c => `
            <div class="form-group">
              <label>${c.icon} ${escHtml(c.name)}</label>
              <input type="number" step="0.01" data-cat-id="${c.id}" value="${c.budget || 0}" placeholder="0" />
            </div>
          `).join('')}
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
            <button type="submit" class="btn btn-primary">Save budgets</button>
          </div>
        </form>
      </div>
    </div>
  `);
}

async function saveBudgets(e) {
  e.preventDefault();
  const inputs = e.target.querySelectorAll('input[data-cat-id]');
  try {
    for (const inp of inputs) {
      await API.put(`/api/categories/${inp.dataset.catId}`, { budget: parseFloat(inp.value) || 0 });
    }
    e.target.closest('.modal-overlay').remove();
    toast('Budgets saved', 'success');
    navigate('budgets');
  } catch (err) { toast(err.message, 'error'); }
}

// ── Render: Settings ────────────────────────────────────────────────────
async function renderSettings(el) {
  document.getElementById('page-title').textContent = 'Settings';
  try {
    const ppConfig = await API.get('/api/paypal/config');
    const payouts = await API.get('/api/paypal/payouts');
    const payCfg = await API.get('/api/payments/config');
    state.payouts = payouts;

    el.innerHTML = `
      <div class="settings-section">
        <h3>Profile</h3>
        <div class="setting-row">
          <label>Name</label>
          <div class="control"><input id="set-name" value="${escHtml(state.user?.name || '')}" class="form-group" style="margin:0" /></div>
          <button class="btn btn-primary btn-sm" onclick="saveProfile()">Save</button>
        </div>
        <div class="setting-row">
          <label>Email</label>
          <div class="control" style="color:var(--text2);font-size:14px">${escHtml(state.user?.email || '')}</div>
        </div>
        <div class="setting-row">
          <label>Currency</label>
          <div class="control">
            <select id="set-currency" class="form-group" style="margin:0" onchange="saveProfile()">
              <option value="ZAR" ${state.user?.currency === 'ZAR' ? 'selected' : ''}>R - South African Rand</option>
              <option value="USD" ${state.user?.currency === 'USD' ? 'selected' : ''}>$ - US Dollar</option>
              <option value="EUR" ${state.user?.currency === 'EUR' ? 'selected' : ''}>€ - Euro</option>
              <option value="GBP" ${state.user?.currency === 'GBP' ? 'selected' : ''}>£ - British Pound</option>
            </select>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <h3>💳 PayPal Integration</h3>
        <div class="payout-card">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
            <span class="payout-status ${ppConfig.has_credentials ? 'online' : 'offline'}">
              ${ppConfig.has_credentials ? '✓ PayPal Connected' : '⚠ Demo Mode'}
            </span>
            <span style="font-size:12px;color:var(--text2)">${ppConfig.mode === 'live' ? 'LIVE' : 'Sandbox'}</span>
          </div>

          <div class="setting-row">
            <label>PayPal Email</label>
            <div class="control"><input id="set-paypal-email" value="${escHtml(ppConfig.paypal_email || '')}" placeholder="your-paypal@email.com" class="form-group" style="margin:0" /></div>
            <button class="btn btn-primary btn-sm" onclick="savePaypalEmail()">Save</button>
          </div>

          ${ppConfig.has_credentials ? `
            <div style="margin-top:16px;padding:16px;background:var(--surface2);border-radius:var(--radius);border:1px solid var(--border)">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <span style="font-weight:600">Available Balance</span>
                <span style="font-size:20px;font-weight:700;color:var(--green)">${fmt(state.dashboard?.balance || 0)}</span>
              </div>
              <button class="btn btn-primary btn-block" onclick="sendPayout()" ${state.dashboard?.balance <= 0 ? 'disabled' : ''}>
                ${ppConfig.demo_mode ? '📤 Record withdrawal (demo)' : '📤 Withdraw to PayPal'}
              </button>
              ${state.dashboard?.balance <= 0 ? '<div style="font-size:12px;color:var(--text2);margin-top:4px">No funds available</div>' : ''}
            </div>
          ` : `
            <div style="margin-top:12px;padding:12px;background:var(--amber-light);border-radius:var(--radius);font-size:13px;color:var(--amber)">
              ⚠ Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env to enable real payouts. Currently in demo mode.
            </div>
          `}

          <div style="margin-top:20px">
            <div style="font-size:14px;font-weight:600;margin-bottom:8px">Payout History</div>
            <div class="payout-list">
              ${payouts.length ? payouts.map(p => `
                <div class="payout-item">
                  <div>
                    <strong>${fmt(p.amount)}</strong>
                    <span style="color:var(--text2);font-size:12px"> · ${p.created_at?.slice(0,10)}</span>
                  </div>
                  <div>
                    <span style="font-size:12px;color:var(--text2)">${escHtml(p.paypal_email)}</span>
                    <span class="payout-status ${p.status === 'SUCCESS' ? 'online' : p.status === 'PENDING' ? 'offline' : 'offline'}" style="margin-left:8px">
                      ${p.status === 'SUCCESS' ? '✓ Sent' : p.status === 'PENDING' ? '⏳ Pending' : '✕ ' + p.status}
                    </span>
                  </div>
                </div>
              `).join('') : '<div style="color:var(--text2);font-size:13px;padding:8px 0">No payouts yet</div>'}
            </div>
          </div>
        </div>
      </div>

      ${state.subStatus?.is_owner ? `
      <div class="settings-section">
        <h3>🔑 Subscription Settings (Owner)</h3>
        <div class="setting-row">
          <label>Price (USD)</label>
          <div class="control"><input id="set-sub-price" type="number" step="0.5" value="${payCfg.price}" class="form-group" style="margin:0" /></div>
        </div>
        <div class="setting-row">
          <label>Label</label>
          <div class="control"><input id="set-sub-label" value="${payCfg.label}" class="form-group" style="margin:0" /></div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="saveSubSettings()">Save Subscription Settings</button>
      </div>
      ` : ''}

      <div class="settings-section">
        <h3>📤 Export Data</h3>
        <div style="display:flex;gap:10px">
          <button class="btn btn-secondary" onclick="exportData('json')">Export JSON</button>
          <button class="btn btn-secondary" onclick="exportData('csv')">Export CSV</button>
        </div>
      </div>

      <div class="settings-section">
        <h3>Account</h3>
        <button class="btn btn-danger btn-sm" onclick="if(confirm('Log out?'))logout()">Log out</button>
      </div>
    `;
  } catch (err) { el.innerHTML = `<div style="color:var(--red);padding:20px">${escHtml(err.message)}</div>`; }
}

// ── Render: Paywall ─────────────────────────────────────────────────────
async function renderPaywall() {
  document.getElementById('app').innerHTML = `
    <div class="auth-page" style="flex-direction:column;gap:20px">
      <div class="auth-card" style="text-align:center;max-width:480px">
        <span style="font-size:48px;display:block;margin-bottom:8px">⏰</span>
        <h1>Trial expired</h1>
        <p style="color:var(--text2);font-size:14px;margin-bottom:20px">Your free trial has ended. Subscribe to keep using Budget Tracker.</p>
        <div id="paywall-box" style="min-height:60px">
          <p style="color:var(--text2);font-size:14px">Loading...</p>
        </div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="logout()" style="margin:0 auto">Log out</button>
    </div>
  `;
  try {
    const cfg = await API.get('/api/payments/config');
    document.getElementById('paywall-box').innerHTML = `
      <div class="pricing-grid" style="grid-template-columns:1fr;max-width:360px;margin:0 auto">
        <div class="pricing-card pricing-featured" style="text-align:center">
          <div class="pricing-name">${cfg.label}</div>
          <div class="pricing-price" style="font-size:40px">$${cfg.price}</div>
          <div class="pricing-period">per month</div>
          <ul class="pricing-features" style="text-align:left;margin:16px 0">
            <li>✓ Full dashboard access</li>
            <li>✓ Unlimited transactions</li>
            <li>✓ Budget tracking</li>
            <li>✓ PayPal payouts</li>
            <li>✓ Cancel anytime</li>
          </ul>
          <div style="font-size:13px;font-weight:600;margin:12px 0 6px;color:var(--text1)">Pay with PayPal</div>
          <div id="paypal-button-container" style="margin-top:4px"></div>
          <div style="font-size:13px;font-weight:600;margin:12px 0 6px;color:var(--text1)">Pay with Card</div>
          <div id="card-button-container" style="margin-top:4px"></div>
          <div id="payment-status" style="margin-top:10px;font-size:13px"></div>
        </div>
      </div>
    `;
    loadPaypalSDK(cfg.client_id, cfg.currency);
  } catch (err) {
    document.getElementById('paywall-box').innerHTML = `<div style="color:var(--red);font-size:13px">${escHtml(err.message)}</div>`;
  }
}

function loadPaypalSDK(clientId, currency) {
  if (state.paypalSdkLoaded) { renderPaypalButtons(); return; }
  const script = document.createElement('script');
  script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=${currency || 'USD'}&enable-funding=card`;
  script.onload = () => { state.paypalSdkLoaded = true; renderPaypalButtons(); };
  script.onerror = () => { document.getElementById('payment-status').textContent = 'Failed to load PayPal. Please try again.'; };
  document.body.appendChild(script);
}

function renderPaypalButtons() {
  if (typeof paypal === 'undefined') return;
  const statusEl = document.getElementById('payment-status');
  const opts = {
    createOrder: async () => {
      statusEl.textContent = 'Creating order...';
      try {
        const data = await API.post('/api/payments/create-order', {});
        return data.id;
      } catch (err) { statusEl.textContent = 'Error: ' + err.message; throw err; }
    },
    onApprove: async (data) => {
      statusEl.textContent = 'Processing payment...';
      try {
        const result = await API.post('/api/payments/capture-order', { order_id: data.orderID });
        statusEl.innerHTML = '✅ Payment successful! <a href="/" style="font-weight:600">Reload app →</a>';
        setTimeout(() => location.reload(), 2000);
      } catch (err) { statusEl.textContent = 'Error: ' + err.message; }
    },
    onError: (err) => { statusEl.textContent = 'PayPal error. Please try again.'; },
  };
  paypal.Buttons({ ...opts, fundingSource: paypal.FUNDING.PAYPAL }).render('#paypal-button-container');
  try { paypal.Buttons({ ...opts, fundingSource: paypal.FUNDING.CARD }).render('#card-button-container'); } catch (e) {}
}

// ── Render: Subscription (in-app page) ─────────────────────────────────
async function renderSubscription(el) {
  document.getElementById('page-title').textContent = 'Subscription';
  el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text2)">Loading...</div>';
  try {
    const sub = await API.get('/api/subscription/status');
    const cfg = await API.get('/api/payments/config');
    el.innerHTML = `
      <div class="card" style="max-width:480px;margin:0 auto;text-align:center">
        <div style="font-size:48px;margin-bottom:12px">${sub.active ? '✅' : '⏸️'}</div>
        <h3 style="margin-bottom:4px">${sub.active ? 'Subscription Active' : 'No Active Subscription'}</h3>
        ${sub.expires_at ? `<p style="color:var(--text2);font-size:13px;margin-bottom:16px">Expires: ${new Date(sub.expires_at).toLocaleDateString()}</p>` : ''}
        ${!sub.active && !sub.is_owner ? `
          <div style="margin-top:16px">
            <div style="font-size:28px;font-weight:700;color:var(--primary)">$${cfg.price}</div>
            <p style="font-size:13px;color:var(--text2);margin-bottom:16px">${cfg.label} subscription · 30 days</p>
            <div style="font-size:13px;font-weight:600;margin:12px 0 6px;color:var(--text1)">Pay with PayPal</div>
            <div id="paypal-button-container-sub"></div>
            <div style="font-size:13px;font-weight:600;margin:12px 0 6px;color:var(--text1)">Pay with Card</div>
            <div id="card-button-container-sub"></div>
          </div>
        ` : ''}
      </div>
    `;
    if (!sub.active && !sub.is_owner && cfg.client_id) {
      if (state.paypalSdkLoaded) renderPaypalButtonsSub();
      else loadPaypalSDKSub(cfg.client_id, cfg.currency);
    }
  } catch (err) { el.innerHTML = `<div style="color:var(--red);padding:20px">${escHtml(err.message)}</div>`; }
}

function loadPaypalSDKSub(clientId, currency) {
  if (state.paypalSdkLoaded) { renderPaypalButtonsSub(); return; }
  const script = document.createElement('script');
  script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=${currency || 'USD'}&enable-funding=card`;
  script.onload = () => { state.paypalSdkLoaded = true; renderPaypalButtonsSub(); };
  document.body.appendChild(script);
}

function renderPaypalButtonsSub() {
  if (typeof paypal === 'undefined') return;
  const opts = {
    createOrder: async () => { const d = await API.post('/api/payments/create-order', {}); return d.id; },
    onApprove: async (data) => {
      await API.post('/api/payments/capture-order', { order_id: data.orderID });
      toast('Subscription activated!', 'success');
      setTimeout(() => location.reload(), 1500);
    },
    onError: () => toast('Payment failed. Please try again.', 'error'),
  };
  paypal.Buttons({ ...opts, fundingSource: paypal.FUNDING.PAYPAL }).render('#paypal-button-container-sub');
  try { paypal.Buttons({ ...opts, fundingSource: paypal.FUNDING.CARD }).render('#card-button-container-sub'); } catch (e) {}
}

async function saveProfile() {
  const name = document.getElementById('set-name')?.value;
  const currency = document.getElementById('set-currency')?.value;
  if (!name) return;
  try {
    await API.put('/api/user/profile', { name, currency });
    state.user.name = name;
    state.user.currency = currency;
    document.querySelector('.user-name').textContent = name;
    toast('Profile updated', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

async function savePaypalEmail() {
  const email = document.getElementById('set-paypal-email')?.value.trim();
  try {
    await API.put('/api/user/paypal', { paypal_email: email });
    state.user.paypal_email = email;
    toast('PayPal email saved', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

async function saveSubSettings() {
  const price = document.getElementById('set-sub-price')?.value;
  const label = document.getElementById('set-sub-label')?.value;
  try {
    await API.put('/api/admin/settings', { price, label });
    toast('Subscription settings saved', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

async function sendPayout() {
  const amount = state.dashboard?.balance;
  if (!amount || amount <= 0) { toast('No funds available', 'error'); return; }

  if (!confirm(`Withdraw ${fmt(amount)} to your PayPal?`)) return;

  try {
    const data = await API.post('/api/paypal/payout', { amount, note: 'Settings withdrawal' });
    toast(data.demo ? 'Demo withdrawal recorded' : `Payout sent!`, 'success');
    navigate('settings');
  } catch (err) { toast(err.message, 'error'); }
}

async function exportData(format) {
  try {
    const url = `/api/export?format=${format}`;
    const r = await fetch(API._url(url), { headers: API.headers() });
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `budget_export.${format}`;
    a.click();
    URL.revokeObjectURL(blob);
    toast('Exported successfully', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

// ── Helpers ─────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmt(n) {
  const c = state.user?.currency || 'ZAR';
  const symbols = { ZAR: 'R', USD: '$', EUR: '€', GBP: '£' };
  return (symbols[c] || c) + Math.round(parseFloat(n || 0)).toLocaleString();
}

function renderTxTable(txs) {
  if (!txs?.length) return '';
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th></tr></thead>
        <tbody>
          ${txs.map(t => `
            <tr>
              <td style="white-space:nowrap;color:var(--text2);font-size:13px">${t.date}</td>
              <td>${escHtml(t.description)}</td>
              <td>${t.category_icon || ''} ${escHtml(t.category_name || '—')}</td>
              <td class="amount ${t.type === 'income' ? 'positive' : 'negative'}">${t.type === 'income' ? '+' : '−'}${fmt(t.amount)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

let debounceTimers = {};
function debounce(fn, ms) {
  return function(...args) {
    clearTimeout(debounceTimers[fn]);
    debounceTimers[fn] = setTimeout(() => fn.apply(this, args), ms);
  };
}

// ── AI Chat Widget ──────────────────────────────────────────────────────
let chatOpen = false;
let chatHistory = [];
let aiEnabled = false;

async function initChat() {
  try {
    const cfg = await API.get('/api/ai/config');
    aiEnabled = cfg.enabled;
  } catch {}
}

function toggleChat() {
  chatOpen = !chatOpen;
  document.getElementById('chat-panel').classList.toggle('open', chatOpen);
  document.getElementById('chat-bubble').classList.toggle('open', chatOpen);
  if (chatOpen) document.getElementById('chat-input').focus();
}

function addChatMsg(text, role) {
  const el = document.createElement('div');
  el.className = 'chat-msg ' + role;
  el.textContent = text;
  document.getElementById('chat-messages').appendChild(el);
  el.scrollIntoView({ behavior: 'smooth' });
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const question = input.value.trim();
  if (!question) return;
  input.value = '';

  addChatMsg(question, 'user');
  const loading = document.createElement('div');
  loading.className = 'chat-msg loading';
  loading.textContent = 'Thinking...';
  document.getElementById('chat-messages').appendChild(loading);

  try {
    const res = await API.post('/api/ai/ask', { question, history: chatHistory.slice(-6) });
    loading.remove();
    addChatMsg(res.answer, 'bot');
    chatHistory.push({ role: 'user', content: question }, { role: 'assistant', content: res.answer });
  } catch (err) {
    loading.remove();
    addChatMsg('Sorry, something went wrong. Please try again.', 'error');
  }
}

function renderChatWidget() {
  const html = `
    <button class="chat-bubble" id="chat-bubble" onclick="toggleChat()">💬</button>
    <div class="chat-panel" id="chat-panel">
      <div class="chat-header">
        <span>🤖 Support</span>
        <button class="chat-close" onclick="toggleChat()">×</button>
      </div>
      <div class="chat-messages" id="chat-messages">
        <div class="chat-msg bot">Hi! Ask me anything about Budget Tracker — transactions, budgets, payouts, or how to get started.</div>
      </div>
      <div class="chat-input-wrap">
        <input id="chat-input" placeholder="Type your question..." onkeydown="if(event.key==='Enter')sendChat()" />
        <button class="chat-send" onclick="sendChat()">Ask</button>
      </div>
    </div>
  `;
  const wrap = document.createElement('div');
  wrap.id = 'chat-widget';
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
}

// ── Init ────────────────────────────────────────────────────────────────
if (state.token) {
  initApp();
} else {
  renderAuth();
}
initChat();
renderChatWidget();
