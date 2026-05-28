// ============================================================
// SUPABASE CLIENT — CarDekho BI Dashboard
// ============================================================
// Fetch manual per tabel lalu JOIN di JavaScript (client-side)
// Tidak butuh foreign key di database
// ============================================================

let supabaseClient = null;

function initSupabase() {
  if (!window.SUPABASE_CONFIG) { console.error("SUPABASE_CONFIG tidak ditemukan."); return null; }
  const { url, anonKey } = window.SUPABASE_CONFIG;
  try {
    supabaseClient = window.supabase.createClient(url, anonKey);
    console.log("✅ Supabase connected:", url);
    return supabaseClient;
  } catch (err) {
    console.error("❌ Gagal init Supabase:", err);
    showDbError("Gagal terhubung ke database: " + err.message);
    return null;
  }
}

function getSupabase() {
  if (!supabaseClient) supabaseClient = initSupabase();
  return supabaseClient;
}

// ─── FETCH SELURUH TABEL (handle > 1000 rows) ────────────────
async function fetchTable(table, select = '*') {
  const db = getSupabase();
  let all = [], from = 0;
  const BATCH = 1000;
  while (true) {
    const { data, error } = await db.from(table).select(select).range(from, from + BATCH - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    from += BATCH;
    if (data.length < BATCH) break;
  }
  return all;
}

// ─── FETCH SEMUA & JOIN DI JAVASCRIPT ────────────────────────
// Return flat rows: { id, name, brand, year, selling_price, km_driven,
//                     fuel, transmission, seller_type, owner, decade, era_label }
let _joinedCache = null;

async function fetchJoined() {
  if (_joinedCache) return _joinedCache;

  // Fetch semua tabel paralel
  const [facts, cars, fuels, transmissions, sellers, times] = await Promise.all([
    fetchTable('fact_sales',        'sale_id,car_id,time_id,fuel_id,trans_id,seller_id,selling_price,km_driven'),
    fetchTable('dim_car',           'car_id,name,brand'),
    fetchTable('dim_fuel',          'fuel_id,fuel_type'),
    fetchTable('dim_transmission',  'trans_id,trans_type'),
    fetchTable('dim_seller',        'seller_id,seller_type,owner'),
    fetchTable('dim_time',          'time_id,year,decade,era_label'),
  ]);

  // Build lookup maps
  const carMap   = Object.fromEntries(cars.map(r => [r.car_id,   r]));
  const fuelMap  = Object.fromEntries(fuels.map(r => [r.fuel_id,  r]));
  const transMap = Object.fromEntries(transmissions.map(r => [r.trans_id, r]));
  const sellerMap= Object.fromEntries(sellers.map(r => [r.seller_id,r]));
  const timeMap  = Object.fromEntries(times.map(r => [r.time_id,  r]));

  // Flatten / JOIN
  _joinedCache = facts.map(f => ({
    id:            f.sale_id,
    name:          carMap[f.car_id]?.name          ?? '—',
    brand:         carMap[f.car_id]?.brand         ?? '—',
    year:          timeMap[f.time_id]?.year        ?? null,
    decade:        timeMap[f.time_id]?.decade      ?? null,
    era_label:     timeMap[f.time_id]?.era_label   ?? null,
    selling_price: f.selling_price                 ?? 0,
    km_driven:     f.km_driven                     ?? 0,
    fuel:          fuelMap[f.fuel_id]?.fuel_type   ?? '—',
    transmission:  transMap[f.trans_id]?.trans_type ?? '—',
    seller_type:   sellerMap[f.seller_id]?.seller_type ?? 'Individual',
    owner:         sellerMap[f.seller_id]?.owner       ?? 'First Owner',
  }));

  return _joinedCache;
}

// ─── fetchAll — kompatibel dengan kode lama ──────────────────
async function fetchAll(_column) {
  return await fetchJoined();
}

// ─── FORMATTERS ──────────────────────────────────────────────
function formatPrice(v) {
  if (!v && v !== 0) return "—";
  return "₹ " + Number(v).toLocaleString("en-IN");
}
function formatRupee(v) {
  if (!v && v !== 0) return "—";
  if (v >= 100000) return "₹" + (v / 100000).toFixed(1) + "L";
  if (v >= 1000)   return "₹" + (v / 1000).toFixed(0) + "K";
  return "₹" + v;
}
function formatNumber(v) {
  if (!v && v !== 0) return "—";
  return Number(v).toLocaleString("en-IN");
}

// ─── ERROR BANNER ────────────────────────────────────────────
function showDbError(msg) {
  const existing = document.getElementById("db-error-banner");
  if (existing) return;
  const el = document.createElement("div");
  el.id = "db-error-banner";
  el.style.cssText = `position:fixed;bottom:20px;right:20px;z-index:9999;
    background:#1e1e2e;border:1px solid rgba(248,113,113,0.4);
    color:#f87171;padding:14px 18px;border-radius:10px;
    font-family:'Outfit',sans-serif;font-size:13px;
    max-width:360px;box-shadow:0 8px 32px rgba(0,0,0,0.5);`;
  el.innerHTML = `<div style="display:flex;gap:10px;align-items:flex-start;">
    <span style="font-size:18px;">⚠️</span>
    <div><strong style="display:block;margin-bottom:4px;">Database Error</strong>${msg}</div>
    <button onclick="this.parentElement.parentElement.remove()" style="background:none;border:none;color:#64748b;cursor:pointer;padding:0 0 0 8px;font-size:16px;">✕</button>
  </div>`;
  document.body.appendChild(el);
}

// ─── LOADING / EMPTY ─────────────────────────────────────────
function setLoading(id, cols = 7) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `<tr class="loading-row"><td colspan="${cols}">
    <div class="spinner"></div><div>Memuat dari database…</div></td></tr>`;
}
function setEmpty(id, msg = "Tidak ada data", cols = 7) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `<tr class="empty-row"><td colspan="${cols}">
    <div class="empty-icon">🚗</div><div>${msg}</div></td></tr>`;
}

// ─── COUNTER ANIMATION ───────────────────────────────────────
function animateCounter(id, target, prefix = "") {
  const el = document.getElementById(id);
  if (!el) return;
  const steps = 50, duration = 1200, step = target / steps;
  let current = 0, i = 0;
  const timer = setInterval(() => {
    i++; current = Math.min(current + step, target);
    el.textContent = prefix + Math.round(current).toLocaleString("en-IN");
    if (i >= steps) clearInterval(timer);
  }, duration / steps);
}
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ─── CHART STYLE HELPERS ─────────────────────────────────────
function tooltipStyle() {
  return {
    backgroundColor: "#1e1e2e", titleColor: "#e2e8f0", bodyColor: "#94a3b8",
    borderColor: "rgba(255,255,255,0.08)", borderWidth: 1, padding: 10,
    titleFont: { family: "'Outfit', sans-serif", size: 13, weight: 600 },
    bodyFont:  { family: "'Outfit', sans-serif", size: 12 },
  };
}
function scaleStyle() {
  return { grid: { color: "rgba(255,255,255,0.04)", drawBorder: false }, border: { display: false } };
}
function tickStyle() {
  return { color: "#64748b", font: { family: "'Outfit', sans-serif", size: 11 } };
}
