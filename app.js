/* ============================================================
   BUDGET FAMIGLIA — App engine
   - Single-user, localStorage-only
   - Mese di riferimento: chiusura automatica passando di mese
   - PYF + 50/30/20 ibrido + sinking funds
   ============================================================ */

const STORAGE_KEY = "budget_app_v1";

// ---------- DEFAULT STATE (vuoto, vero setup nel wizard) ----------
const DEFAULT_STATE = () => ({
  version: 1,
  income: 0,
  savingsTarget: 0,
  categories: [
    { id: "cibo",      name: "Cibo & Casa",          icon: "🛒", color: "#34c759", budget: 0, type: "needs" },
    { id: "michelle",  name: "Michelle",             icon: "💕", color: "#ff2d55", budget: 0, type: "wants" },
    { id: "auto-mese", name: "Auto carburante",      icon: "⛽", color: "#5e5ce6", budget: 0, type: "needs" },
    { id: "abbon",     name: "Abbonamenti+Telefono", icon: "📺", color: "#0a84ff", budget: 0, type: "needs" },
    { id: "gatti",     name: "Gatti",                icon: "🐱", color: "#ff9f0a", budget: 0, type: "needs" },
    { id: "salute",    name: "Personale & Salute",   icon: "💊", color: "#30d158", budget: 0, type: "needs" },
    { id: "vestiti",   name: "Vestiti",              icon: "👕", color: "#bf5af2", budget: 0, type: "wants" },
    { id: "varie",     name: "Varie / Buffer",       icon: "✨", color: "#64d2ff", budget: 0, type: "wants" },
  ],
  sinkingFunds: [
    { id: "auto-anno", name: "Auto annuale", icon: "🚗", color: "#5e5ce6", monthly: 0, balance: 0, note: "Assicurazione + bollo + manutenzione + revisione" },
    { id: "regali",    name: "Regali",       icon: "🎁", color: "#ff375f", monthly: 0, balance: 0, note: "Compleanni + Natale" },
  ],
  // Spese fisse ricorrenti: applicate automaticamente il giorno 1 di ogni mese
  recurring: [],
  expenses: [],
  history: [],
  currentMonth: monthKey(new Date()),
  // Mesi in cui le ricorrenti sono già state applicate (evita doppi addebiti)
  recurringApplied: [],
  savingsThisMonth: 0,
  liquidity: 0,
  createdAt: new Date().toISOString(),
});

// ---------- PRESET PERSONALE (caricato solo se utente sceglie "Default Mattia") ----------
function PRESET_MATTIA() {
  const s = DEFAULT_STATE();
  s.income = 1700;
  s.savingsTarget = 200;
  // Budget categorie: TOTALE inclusivo delle ricorrenti che ci cadono
  const setBudget = (id, v) => { const c = s.categories.find(x=>x.id===id); if (c) c.budget = v; };
  setBudget("cibo",      589);  // 64 zia (ricorrente) + 525 spesa/contanti/ristoranti (manuale)
  setBudget("michelle",  140);  // 100 mensili (ricorrente) + 40 unghie (manuale)
  setBudget("auto-mese", 70);   // benzina manuale
  setBudget("abbon",     97);   // tutto ricorrenti (12 voci)
  setBudget("gatti",     110);  // cibo+lettiera+vet manuale
  setBudget("salute",    130);  // farmacia, barbiere, cinema, cura manuale
  setBudget("vestiti",   100);  // manuale
  setBudget("varie",     104);  // imprevisti+amazon+fineco
  s.sinkingFunds[0].monthly = 96; // Auto annuale
  s.sinkingFunds[1].monthly = 64; // Regali
  s.recurring = [
    { id: "r1",  name: "Pulizia casa (zia)",  amount: 64, categoryId: "cibo",     dayOfMonth: 1, active: true },
    { id: "r2",  name: "Soldi Michelle",      amount: 100,categoryId: "michelle", dayOfMonth: 1, active: true },
    { id: "r3",  name: "ChatGPT Michelle",    amount: 20, categoryId: "abbon",    dayOfMonth: 1, active: true },
    { id: "r4",  name: "CapCut",              amount: 12, categoryId: "abbon",    dayOfMonth: 1, active: true },
    { id: "r5",  name: "Suno AI",             amount: 10, categoryId: "abbon",    dayOfMonth: 1, active: true },
    { id: "r6",  name: "iCloud Mattia",       amount: 10, categoryId: "abbon",    dayOfMonth: 1, active: true },
    { id: "r7",  name: "iCloud Michelle",     amount: 10, categoryId: "abbon",    dayOfMonth: 1, active: true },
    { id: "r8",  name: "Netflix",             amount: 7,  categoryId: "abbon",    dayOfMonth: 1, active: true },
    { id: "r9",  name: "Disney+",             amount: 7,  categoryId: "abbon",    dayOfMonth: 1, active: true },
    { id: "r10", name: "Amazon Prime",        amount: 4,  categoryId: "abbon",    dayOfMonth: 1, active: true },
    { id: "r11", name: "TIM (Mattia)",        amount: 9,  categoryId: "abbon",    dayOfMonth: 1, active: true },
    { id: "r12", name: "Iliad (Michelle)",    amount: 8,  categoryId: "abbon",    dayOfMonth: 1, active: true },
  ];
  return s;
}

// ---------- UTILS ----------
function monthKey(d) {
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0");
}
function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  const months = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
  return `${months[m-1]} ${y}`;
}
function fmt(n) {
  const v = Math.round(n);
  return "€" + v.toLocaleString("it-IT");
}
function fmt2(n) {
  return "€" + (Math.round(n*100)/100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0,10);
}
function uuid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}

// ---------- STATE ----------
let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s.version) return null;
    return s;
  } catch (e) {
    console.error("loadState fail", e);
    return null;
  }
}
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    toast("Errore salvataggio");
  }
}

// ---------- MONTH ROLLOVER ----------
function checkMonthRollover() {
  const now = monthKey(new Date());
  if (state.currentMonth !== now) {
    // chiudi il mese corrente -> spostalo in history
    const closed = closeCurrentMonth();
    state.history.unshift(closed);
    // accumula sinking funds (al rollover spostiamo i monthly nel balance)
    state.sinkingFunds.forEach(f => {
      f.balance = (f.balance || 0) + f.monthly;
    });
    // azzera spese del mese
    state.expenses = [];
    state.savingsThisMonth = 0;
    state.currentMonth = now;
    saveState();
    toast(`Nuovo mese: ${monthLabel(now)}`);
  }
  // Applica ricorrenti del mese corrente se non già fatto
  applyRecurring();
}

function applyRecurring() {
  if (!state.recurring || state.recurring.length === 0) return;
  if (!state.recurringApplied) state.recurringApplied = [];
  if (state.recurringApplied.includes(state.currentMonth)) return;

  const today = new Date();
  const day = today.getDate();
  const [yr, mo] = state.currentMonth.split("-").map(Number);

  let added = 0;
  state.recurring.forEach(r => {
    if (!r.active) return;
    // Solo se siamo già al/oltre il dayOfMonth
    if (day < (r.dayOfMonth || 1)) return;
    state.expenses.push({
      id: uuid(),
      amount: +r.amount || 0,
      categoryId: r.categoryId,
      date: `${yr}-${String(mo).padStart(2,"0")}-${String(r.dayOfMonth||1).padStart(2,"0")}`,
      note: r.name,
      auto: true,
      recurringId: r.id,
      createdAt: new Date().toISOString(),
    });
    added++;
  });
  if (added > 0) {
    state.recurringApplied.push(state.currentMonth);
    saveState();
    setTimeout(() => toast(`${added} ricorrenti applicate`), 300);
  }
}

function closeCurrentMonth() {
  const totalsByCat = {};
  let totalSpent = 0;
  state.expenses.forEach(e => {
    totalsByCat[e.categoryId] = (totalsByCat[e.categoryId]||0) + e.amount;
    totalSpent += e.amount;
  });
  const categoriesSnap = state.categories.map(c => ({
    id: c.id, name: c.name, icon: c.icon,
    budget: c.budget, spent: totalsByCat[c.id] || 0
  }));
  return {
    month: state.currentMonth,
    income: state.income,
    savings: state.savingsThisMonth,
    totalSpent,
    savingsRate: state.income > 0 ? (state.savingsThisMonth/state.income) : 0,
    categories: categoriesSnap,
    closedAt: new Date().toISOString(),
  };
}

// ---------- INIT ----------
function init() {
  if (!state) {
    document.getElementById("wizard").classList.remove("hidden");
    bindWizard();
  } else {
    checkMonthRollover();
    showApp();
  }
  bindGlobal();
}

function showApp() {
  document.getElementById("wizard").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  bindApp();
  renderAll();
}

// ---------- WIZARD ----------
function bindWizard() {
  const inc = document.getElementById("w-income");
  const sav = document.getElementById("w-savings");
  const sum = document.getElementById("w-summary");
  const update = () => {
    const i = +inc.value || 0;
    const s = +sav.value || 0;
    const fixedNeeds = 589+70+97+110+130; // somma needs default = 996
    const wants = 140+100+104; // 344
    const sinking = 96+64; // 160
    const allocated = fixedNeeds + wants + sinking + s;
    const left = i - allocated;
    sum.innerHTML = `
      Entrate: <strong>${fmt(i)}</strong><br>
      Risparmio (PYF): <strong>${fmt(s)}</strong><br>
      Bisogni fissi: <strong>${fmt(fixedNeeds)}</strong><br>
      Desideri/variabili: <strong>${fmt(wants)}</strong><br>
      Sinking funds: <strong>${fmt(sinking)}</strong><br>
      <span style="color:${left>=0?'var(--tint-strong)':'var(--danger)'}">Margine: <strong>${fmt(left)}</strong></span>
    `;
  };
  inc.addEventListener("input", update);
  sav.addEventListener("input", update);
  update();

  document.getElementById("w-default").addEventListener("click", () => {
    state = PRESET_MATTIA();
    saveState();
    applyRecurring();
    showApp();
    setTimeout(() => toast("Preset Mattia caricato"), 200);
  });
  document.getElementById("w-start").addEventListener("click", () => {
    state = DEFAULT_STATE();
    state.income = +inc.value || 0;
    state.savingsTarget = +sav.value || 0;
    saveState();
    showApp();
  });
}

// ---------- APP BINDINGS ----------
function bindApp() {
  // Tab navigation
  document.querySelectorAll(".tab[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      const t = btn.dataset.tab;
      if (t === "settings-tab") return switchTab("review"); // simplification
      switchTab(t);
    });
  });

  // FAB
  document.getElementById("fab").addEventListener("click", () => switchTab("add"));

  // Add screen
  document.getElementById("add-cancel").addEventListener("click", () => {
    resetAddForm();
    switchTab("dashboard");
  });
  document.querySelectorAll(".numpad button").forEach(b => {
    b.addEventListener("click", () => onNumpad(b.dataset.key));
  });
  document.getElementById("add-save").addEventListener("click", saveExpense);

  // Settings/Reset
  document.getElementById("btn-settings").addEventListener("click", () => switchTab("review"));

  // Export/Import/Reset
  document.getElementById("btn-export").addEventListener("click", exportData);
  document.getElementById("btn-import").addEventListener("click", () => document.getElementById("import-file").click());
  document.getElementById("import-file").addEventListener("change", importData);
  document.getElementById("btn-reset").addEventListener("click", () => {
    confirmDialog("Reset completo?", "Cancellerà tutto: budget, spese, storico. Operazione irreversibile.", () => {
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
    });
  });

  // Add category
  document.getElementById("btn-add-cat").addEventListener("click", addCategoryPrompt);

  // Add recurring
  document.getElementById("btn-add-recurring").addEventListener("click", addRecurringPrompt);

  // Numpad keyboard support (desktop dev)
  document.addEventListener("keydown", e => {
    const screen = document.querySelector(".screen[data-screen=add]");
    if (!screen || screen.classList.contains("hidden")) return;
    if (/^[0-9]$/.test(e.key)) onNumpad(e.key);
    if (e.key === "," || e.key === ".") onNumpad(".");
    if (e.key === "Backspace") onNumpad("back");
    if (e.key === "Enter") saveExpense();
  });
}

function bindGlobal() {
  // Service worker (registrato solo in https/file)
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  }
}

// ---------- TAB SWITCH ----------
let activeTab = "dashboard";
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".screen").forEach(s => {
    s.classList.toggle("hidden", s.dataset.screen !== tab);
  });
  document.querySelectorAll(".tab[data-tab]").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  // Re-render specific screens
  if (tab === "add")     renderAddScreen();
  if (tab === "budgets") renderBudgets();
  if (tab === "review")  renderReview();
  if (tab === "dashboard") renderDashboard();
  window.scrollTo(0, 0);
}

// ============================================================
//   RENDER: DASHBOARD
// ============================================================
function renderAll() {
  renderDashboard();
  renderBudgets();
  renderReview();
  renderAddScreen();
}

function renderDashboard() {
  document.getElementById("month-label").textContent = monthLabel(state.currentMonth);

  const totalBudget = state.categories.reduce((s,c) => s + (+c.budget||0), 0);
  const totalSpent = state.expenses.reduce((s,e) => s + e.amount, 0);
  const remaining = totalBudget - totalSpent;
  const pct = totalBudget > 0 ? Math.min(100, (totalSpent/totalBudget)*100) : 0;

  document.getElementById("hero-amount").textContent = fmt(remaining);
  document.getElementById("hero-spent").textContent = fmt(totalSpent);
  document.getElementById("hero-budget").textContent = fmt(totalBudget);
  document.getElementById("hero-bar-fill").style.width = (100-pct) + "%";

  // Tasso risparmio: usiamo target come accantonato pianificato
  const savingsRate = state.income > 0 ? (state.savingsTarget / state.income) * 100 : 0;
  document.getElementById("kpi-savings").textContent = savingsRate.toFixed(0) + "%";
  document.getElementById("kpi-savings-sub").textContent = `target ${fmt(state.savingsTarget)}`;

  // Semaforo settimanale Desideri
  renderWeekTraffic();

  // Runway: liquidità / spese mensili medie
  const avgMonthly = avgMonthlyOutflow();
  const runway = avgMonthly > 0 ? state.liquidity / avgMonthly : 0;
  document.getElementById("kpi-runway").textContent = state.liquidity > 0 ? runway.toFixed(1) : "—";

  // Cat list
  const catList = document.getElementById("cat-list");
  catList.innerHTML = "";
  state.categories.forEach(c => {
    const spent = state.expenses.filter(e => e.categoryId === c.id).reduce((s,e)=>s+e.amount,0);
    const pct = c.budget > 0 ? (spent / c.budget) * 100 : 0;
    const left = c.budget - spent;
    const cls = pct >= 100 ? "over" : pct >= 75 ? "warn" : "";
    const row = document.createElement("div");
    row.className = "cat-row";
    row.innerHTML = `
      <div class="cat-icon" style="background:${c.color}22;color:${c.color}">${c.icon}</div>
      <div class="cat-info">
        <div class="cat-name">
          <span>${c.name}</span>
          <span class="amount">${fmt(spent)} <span class="muted">/ ${fmt(c.budget)}</span></span>
        </div>
        <div class="cat-bar"><div class="cat-bar-fill ${cls}" style="width:${Math.min(100,pct)}%; background:${pct<75?c.color:''}"></div></div>
        <div class="cat-meta">${left >= 0 ? `Rimangono ${fmt(left)}` : `Sforato di ${fmt(-left)}`} · ${pct.toFixed(0)}%</div>
      </div>
    `;
    catList.appendChild(row);
  });

  // Sinking funds
  const sinkList = document.getElementById("sinking-list");
  sinkList.innerHTML = "";
  state.sinkingFunds.forEach(f => {
    const row = document.createElement("div");
    row.className = "sinking-row";
    row.innerHTML = `
      <div class="cat-icon" style="background:${f.color}22;color:${f.color}">${f.icon}</div>
      <div class="cat-info">
        <div class="cat-name">
          <span>${f.name}</span>
          <span class="amount">${fmt(f.balance||0)}</span>
        </div>
        <div class="cat-meta">${fmt(f.monthly)}/mese · ${f.note||""}</div>
      </div>
    `;
    sinkList.appendChild(row);
  });

  // Ultime spese
  const expList = document.getElementById("expense-list");
  expList.innerHTML = "";
  const recent = [...state.expenses].sort((a,b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 12);
  if (recent.length === 0) {
    expList.innerHTML = `<div class="cat-row"><div class="cat-info"><div class="cat-meta">Nessuna spesa registrata. Premi <strong>+</strong> per aggiungerne una.</div></div></div>`;
  } else {
    recent.forEach(e => {
      const c = getCat(e.categoryId);
      const row = document.createElement("div");
      row.className = "expense-row";
      const autoBadge = e.auto ? `<span class="badge-auto">AUTO</span>` : "";
      row.innerHTML = `
        <div class="cat-icon" style="background:${c?.color||'#888'}22;color:${c?.color||'#888'}">${c?.icon||'•'}</div>
        <div class="expense-info">
          <div class="expense-cat">${c?.name||'—'} ${autoBadge}</div>
          <div class="expense-meta">${formatDate(e.date)}${e.note?' · '+escapeHtml(e.note):''}</div>
        </div>
        <div class="expense-amount">${fmt2(e.amount)}</div>
        <button class="expense-delete" data-id="${e.id}" aria-label="Cancella">✕</button>
      `;
      row.querySelector(".expense-delete").addEventListener("click", () => {
        if (e.auto) {
          confirmDialog("Cancellare ricorrente?", `"${e.note||c?.name}" è stata aggiunta automaticamente. Cancellarla qui non la rimuove dalle ricorrenti del prossimo mese.`, () => deleteExpense(e.id));
        } else {
          deleteExpense(e.id);
        }
      });
      expList.appendChild(row);
    });
  }
}

function renderWeekTraffic() {
  const wantsCats = state.categories.filter(c => c.type === "wants");
  const totalWants = wantsCats.reduce((s,c) => s + c.budget, 0);
  const spentWants = state.expenses
    .filter(e => wantsCats.some(c => c.id === e.categoryId))
    .reduce((s,e) => s + e.amount, 0);
  const left = totalWants - spentWants;
  const pctLeft = totalWants > 0 ? (left/totalWants)*100 : 100;

  // Quanto del mese è passato? Stimiamo soglia attesa
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
  const monthProgress = dayOfMonth / daysInMonth; // 0..1
  // expected left ≈ 1 - monthProgress
  const expectedLeft = (1 - monthProgress) * 100;

  let cls, text;
  if (pctLeft >= expectedLeft - 5) {
    cls = "green"; text = "OK";
  } else if (pctLeft >= expectedLeft - 20) {
    cls = "yellow"; text = "Attenzione";
  } else {
    cls = "red"; text = "Rallenta";
  }
  const dot = document.getElementById("week-dot");
  dot.className = "dot " + cls;
  document.getElementById("week-status").textContent = text;
  document.getElementById("week-sub").textContent = `${fmt(left)} su Desideri (${pctLeft.toFixed(0)}%)`;
}

function avgMonthlyOutflow() {
  if (state.history.length === 0) {
    return state.categories.reduce((s,c)=>s+c.budget,0);
  }
  const last3 = state.history.slice(0,3);
  const sum = last3.reduce((s,h) => s + h.totalSpent, 0);
  return sum / last3.length;
}

// ============================================================
//   RENDER: ADD EXPENSE
// ============================================================
let addAmount = "0";
let addCategory = null;

function renderAddScreen() {
  // Pre-fill data
  const dateInput = document.getElementById("add-date");
  if (!dateInput.value) dateInput.value = todayISO();
  // Pre-select prima categoria
  if (!addCategory && state.categories.length) addCategory = state.categories[0].id;
  // Render picker
  const picker = document.getElementById("cat-picker");
  picker.innerHTML = "";
  state.categories.forEach(c => {
    const chip = document.createElement("button");
    chip.className = "cat-chip" + (c.id === addCategory ? " selected" : "");
    chip.dataset.id = c.id;
    chip.innerHTML = `
      <span class="ic" style="background:${c.color}22;color:${c.color}">${c.icon}</span>
      <span>${c.name}</span>
    `;
    chip.addEventListener("click", () => {
      addCategory = c.id;
      renderAddScreen();
    });
    picker.appendChild(chip);
  });
  document.getElementById("amount-value").textContent = addAmount.replace(".", ",");
}

function onNumpad(k) {
  if (k === "back") {
    addAmount = addAmount.length > 1 ? addAmount.slice(0, -1) : "0";
  } else if (k === ".") {
    if (!addAmount.includes(".")) addAmount += ".";
  } else {
    if (addAmount === "0" && k !== ".") addAmount = k;
    else {
      // limita a 2 decimali
      if (addAmount.includes(".") && addAmount.split(".")[1].length >= 2) return;
      addAmount += k;
    }
  }
  document.getElementById("amount-value").textContent = addAmount.replace(".", ",");
  vibrate(8);
}

function saveExpense() {
  const amount = parseFloat(addAmount) || 0;
  if (amount <= 0) { toast("Inserisci un importo"); return; }
  if (!addCategory) { toast("Scegli una categoria"); return; }
  const date = document.getElementById("add-date").value || todayISO();
  const note = document.getElementById("add-note").value.trim();
  state.expenses.push({
    id: uuid(),
    amount,
    categoryId: addCategory,
    date,
    note: note || null,
    createdAt: new Date().toISOString(),
  });
  saveState();
  vibrate(20);
  resetAddForm();
  switchTab("dashboard");
  toast("Spesa registrata");
}

function resetAddForm() {
  addAmount = "0";
  document.getElementById("add-note").value = "";
  document.getElementById("add-date").value = todayISO();
  document.querySelector(".optional-fields")?.removeAttribute("open");
}

function deleteExpense(id) {
  state.expenses = state.expenses.filter(e => e.id !== id);
  saveState();
  renderDashboard();
  toast("Spesa cancellata");
}

// ============================================================
//   RENDER: BUDGETS
// ============================================================
function renderBudgets() {
  const totalBudget = state.categories.reduce((s,c)=>s+c.budget,0);
  const totalSink = state.sinkingFunds.reduce((s,f)=>s+f.monthly,0);
  const allocated = totalBudget + totalSink + state.savingsTarget;
  const balance = state.income - allocated;

  document.getElementById("b-income").textContent = fmt(state.income);
  document.getElementById("b-savings").textContent = fmt(state.savingsTarget);
  document.getElementById("b-sinking").textContent = fmt(totalSink);
  document.getElementById("b-available").textContent = fmt(state.income - state.savingsTarget - totalSink);
  const bal = document.getElementById("b-balance");
  bal.textContent = (balance >= 0 ? "+" : "") + fmt(balance);
  bal.className = balance >= 0 ? "positive" : "negative";

  // Income/savings inline edit row
  const list = document.getElementById("budget-edit-list");
  list.innerHTML = "";
  // Income editable
  list.appendChild(makeEditableRow({
    icon: "💰", color: "#0a84ff", name: "Entrate mensili",
    value: state.income,
    onChange: v => { state.income = v; saveState(); renderBudgets(); renderDashboard(); }
  }));
  // Savings editable
  list.appendChild(makeEditableRow({
    icon: "🏦", color: "#34c759", name: "Risparmio (PYF)",
    value: state.savingsTarget,
    onChange: v => { state.savingsTarget = v; saveState(); renderBudgets(); renderDashboard(); }
  }));
  // Categorie
  state.categories.forEach((c, idx) => {
    list.appendChild(makeEditableRow({
      icon: c.icon, color: c.color, name: c.name,
      value: c.budget,
      onChange: v => { c.budget = v; saveState(); renderBudgets(); renderDashboard(); },
      onDelete: () => {
        confirmDialog("Cancella categoria?", `"${c.name}" verrà rimossa. Le spese già registrate restano.`, () => {
          state.categories.splice(idx, 1);
          saveState();
          renderBudgets();
          renderDashboard();
          toast("Categoria rimossa");
        });
      }
    }));
  });

  // Spese fisse ricorrenti
  renderRecurringList();

  // Sinking funds
  const sinkList = document.getElementById("sinking-edit-list");
  sinkList.innerHTML = "";
  state.sinkingFunds.forEach((f, idx) => {
    const row = document.createElement("div");
    row.className = "budget-edit-row";
    row.innerHTML = `
      <div class="budget-edit-head">
        <div class="cat-icon" style="background:${f.color}22;color:${f.color}">${f.icon}</div>
        <div class="cat-info">
          <div class="cat-name"><span>${f.name}</span></div>
          <div class="cat-meta">${f.note||""} · saldo: <strong>${fmt(f.balance||0)}</strong></div>
        </div>
        <input class="budget-edit-input" type="number" step="1" inputmode="decimal" value="${f.monthly}">
      </div>
      <div class="budget-edit-actions">
        <button class="btn-mini" data-act="use">Usa fondo</button>
        <button class="btn-mini" data-act="reset">Azzera saldo</button>
        <button class="btn-mini danger" data-act="del">Elimina</button>
      </div>
    `;
    const inp = row.querySelector(".budget-edit-input");
    inp.addEventListener("change", () => { f.monthly = +inp.value || 0; saveState(); renderBudgets(); });
    row.querySelector("[data-act=use]").addEventListener("click", () => useSinking(idx));
    row.querySelector("[data-act=reset]").addEventListener("click", () => {
      f.balance = 0; saveState(); renderBudgets(); renderDashboard();
    });
    row.querySelector("[data-act=del]").addEventListener("click", () => {
      confirmDialog("Elimina fondo?", `"${f.name}" sarà rimosso.`, () => {
        state.sinkingFunds.splice(idx,1);
        saveState();
        renderBudgets();
        renderDashboard();
      });
    });
    sinkList.appendChild(row);
  });
}

function makeEditableRow({icon, color, name, value, onChange, onDelete}) {
  const row = document.createElement("div");
  row.className = "budget-edit-row";
  row.innerHTML = `
    <div class="budget-edit-head">
      <div class="cat-icon" style="background:${color}22;color:${color}">${icon}</div>
      <div class="cat-info"><div class="cat-name"><span>${name}</span></div></div>
      <input class="budget-edit-input" type="number" step="1" inputmode="decimal" value="${value}">
    </div>
    ${onDelete ? `<div class="budget-edit-actions"><button class="btn-mini danger" data-act="del">Rimuovi</button></div>` : ""}
  `;
  const inp = row.querySelector(".budget-edit-input");
  inp.addEventListener("change", () => onChange(+inp.value || 0));
  if (onDelete) row.querySelector("[data-act=del]").addEventListener("click", onDelete);
  return row;
}

function useSinking(idx) {
  const f = state.sinkingFunds[idx];
  const amount = prompt(`Quanto stai usando dal fondo "${f.name}"?\nSaldo attuale: ${fmt(f.balance||0)}`, "0");
  const v = parseFloat(String(amount).replace(",","."));
  if (!v || v <= 0) return;
  f.balance = (f.balance || 0) - v;
  saveState();
  renderBudgets();
  renderDashboard();
  toast(`Usati ${fmt(v)} dal fondo`);
}

function renderRecurringList() {
  const list = document.getElementById("recurring-edit-list");
  list.innerHTML = "";
  if (!state.recurring || state.recurring.length === 0) {
    list.innerHTML = `<div class="cat-row"><div class="cat-info"><div class="cat-meta">Nessuna ricorrente. Aggiungi abbonamenti, telefono, spese fisse.</div></div></div>`;
    return;
  }
  const total = state.recurring.filter(r=>r.active).reduce((s,r)=>s+(+r.amount||0),0);

  state.recurring.forEach((r, idx) => {
    const c = getCat(r.categoryId);
    const row = document.createElement("div");
    row.className = "budget-edit-row";
    row.innerHTML = `
      <div class="budget-edit-head">
        <div class="cat-icon" style="background:${(c?.color||'#888')}22;color:${c?.color||'#888'};opacity:${r.active?1:0.4}">${c?.icon||'📌'}</div>
        <div class="cat-info">
          <div class="cat-name"><span style="opacity:${r.active?1:0.5}">${escapeHtml(r.name)}</span></div>
          <div class="cat-meta">${c?.name||'—'} · giorno ${r.dayOfMonth||1}${r.active?'':' · disattivata'}</div>
        </div>
        <input class="budget-edit-input" type="number" step="0.5" inputmode="decimal" value="${r.amount}">
      </div>
      <div class="budget-edit-actions">
        <button class="btn-mini" data-act="cat">Categoria</button>
        <button class="btn-mini" data-act="toggle">${r.active?'Disattiva':'Attiva'}</button>
        <button class="btn-mini danger" data-act="del">Elimina</button>
      </div>
    `;
    const inp = row.querySelector(".budget-edit-input");
    inp.addEventListener("change", () => {
      r.amount = +inp.value || 0;
      saveState();
      renderRecurringList();
    });
    row.querySelector("[data-act=toggle]").addEventListener("click", () => {
      r.active = !r.active;
      saveState();
      renderRecurringList();
    });
    row.querySelector("[data-act=cat]").addEventListener("click", () => {
      const ids = state.categories.map(c=>c.id);
      const names = state.categories.map(c=>c.name);
      const choice = prompt("Categoria? Inserisci numero:\n" + names.map((n,i)=>`${i+1}. ${n}`).join("\n"), "1");
      const n = parseInt(choice);
      if (n>=1 && n<=ids.length) {
        r.categoryId = ids[n-1];
        saveState();
        renderRecurringList();
      }
    });
    row.querySelector("[data-act=del]").addEventListener("click", () => {
      confirmDialog("Elimina ricorrente?", `"${r.name}" non sarà più aggiunta automaticamente.`, () => {
        state.recurring.splice(idx,1);
        saveState();
        renderRecurringList();
      });
    });
    list.appendChild(row);
  });

  const totRow = document.createElement("div");
  totRow.className = "budget-edit-row";
  totRow.innerHTML = `<div class="budget-edit-head"><div class="cat-info"><div class="cat-name"><span><strong>Totale ricorrenti attive</strong></span><span style="font-variant-numeric:tabular-nums"><strong>${fmt(total)}/mese</strong></span></div></div></div>`;
  list.appendChild(totRow);
}

function addRecurringPrompt() {
  const name = prompt("Nome ricorrente (es. Netflix):");
  if (!name) return;
  const amt = parseFloat((prompt("Importo mensile (€):", "10") || "0").replace(",","."));
  if (!amt) return;
  const ids = state.categories.map(c=>c.id);
  const names = state.categories.map(c=>c.name);
  const choice = prompt("Categoria? Numero:\n" + names.map((n,i)=>`${i+1}. ${n}`).join("\n"), "1");
  const n = parseInt(choice);
  const catId = (n>=1 && n<=ids.length) ? ids[n-1] : ids[0];
  if (!state.recurring) state.recurring = [];
  state.recurring.push({
    id: "r_" + uuid(),
    name, amount: amt, categoryId: catId, dayOfMonth: 1, active: true,
  });
  saveState();
  renderRecurringList();
  toast("Ricorrente aggiunta");
}

function addCategoryPrompt() {
  const name = prompt("Nome categoria:");
  if (!name) return;
  const budget = parseFloat((prompt("Budget mensile (€):", "50") || "0").replace(",","."));
  if (!budget) return;
  const colors = ["#34c759","#ff2d55","#5e5ce6","#0a84ff","#ff9f0a","#bf5af2","#64d2ff","#ff375f","#30d158"];
  state.categories.push({
    id: "c_" + uuid(),
    name, icon: "📁", color: colors[state.categories.length % colors.length],
    budget, type: "wants",
  });
  saveState();
  renderBudgets();
  renderDashboard();
}

// ============================================================
//   RENDER: REVIEW
// ============================================================
function renderReview() {
  // Mese corrente parziale
  const totalSpent = state.expenses.reduce((s,e)=>s+e.amount,0);
  const totalBudget = state.categories.reduce((s,c)=>s+c.budget,0);

  // Top sfori
  const overs = state.categories
    .map(c => {
      const sp = state.expenses.filter(e=>e.categoryId===c.id).reduce((s,e)=>s+e.amount,0);
      return { name: c.name, diff: sp - c.budget, spent: sp, budget: c.budget };
    })
    .sort((a,b) => b.diff - a.diff);
  const overOnly = overs.filter(o => o.diff > 0).slice(0,5);
  const underOnly = overs.filter(o => o.diff < 0).sort((a,b)=>a.diff-b.diff).slice(0,3);

  const card = document.getElementById("review-month-card");
  card.innerHTML = `
    <h3>${monthLabel(state.currentMonth)} <span class="muted-small">in corso</span></h3>
    <div class="review-q">
      <div class="review-q-label">1. Quanto avevo</div>
      <div class="review-q-value">${fmt(state.income)}</div>
    </div>
    <div class="review-q">
      <div class="review-q-label">2. Quanto ho speso</div>
      <div class="review-q-value">${fmt(totalSpent)} <span class="muted-small">su ${fmt(totalBudget)} budget</span></div>
    </div>
    <div class="review-q">
      <div class="review-q-label">3. Dove ho sforato</div>
      <div class="review-q-value">${overOnly.length === 0 ? '<span class="muted-small">Nessuno sforo finora</span>' : ''}</div>
      <div class="over-list">
        ${overOnly.map(o => `<div class="over-item"><span>${o.name}</span><span class="neg">+${fmt(o.diff)}</span></div>`).join("")}
        ${underOnly.length ? `<div class="review-q-label" style="margin-top:8px">Sotto budget</div>` : ""}
        ${underOnly.map(o => `<div class="over-item"><span>${o.name}</span><span class="pos">${fmt(o.diff)}</span></div>`).join("")}
      </div>
    </div>
    <div class="review-q">
      <div class="review-q-label">4. Tasso di risparmio mese</div>
      <div class="review-q-value">${state.income>0 ? ((state.savingsTarget/state.income)*100).toFixed(0) : 0}% <span class="muted-small">target ${fmt(state.savingsTarget)}</span></div>
    </div>
  `;

  // History
  const hist = document.getElementById("history-list");
  hist.innerHTML = "";
  if (state.history.length === 0) {
    hist.innerHTML = `<div class="cat-row"><div class="cat-info"><div class="cat-meta">Nessun mese chiuso ancora.</div></div></div>`;
  } else {
    state.history.slice(0,12).forEach(h => {
      const rate = h.savingsRate ? (h.savingsRate*100).toFixed(0) : 0;
      const row = document.createElement("div");
      row.className = "history-row";
      row.innerHTML = `
        <span class="h-month">${monthLabel(h.month)}</span>
        <span class="h-spent">${fmt(h.totalSpent)}</span>
        <span class="h-rate">${rate}%</span>
      `;
      hist.appendChild(row);
    });
  }
}

// ============================================================
//   EXPORT / IMPORT
// ============================================================
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const dt = new Date().toISOString().slice(0,10);
  a.href = url;
  a.download = `budget-backup-${dt}.json`;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
  toast("Backup esportato");
}

function importData(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed.version) throw new Error("Formato non valido");
      confirmDialog("Sovrascrivere?", "I dati attuali verranno sostituiti dal backup.", () => {
        state = parsed;
        saveState();
        renderAll();
        toast("Backup importato");
      });
    } catch (err) {
      toast("File non valido");
    }
  };
  reader.readAsText(file);
  ev.target.value = "";
}

// ============================================================
//   UTILITIES
// ============================================================
function getCat(id) { return state.categories.find(c=>c.id===id); }

function formatDate(iso) {
  const [y,m,d] = iso.split("-");
  return `${d}/${m}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[ch]));
}

function vibrate(ms) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add("hidden"), 2200);
}

function confirmDialog(title, msg, onOk) {
  const d = document.getElementById("dialog");
  document.getElementById("dialog-title").textContent = title;
  document.getElementById("dialog-msg").textContent = msg;
  d.classList.remove("hidden");
  const ok = document.getElementById("dialog-ok");
  const cancel = document.getElementById("dialog-cancel");
  const close = () => d.classList.add("hidden");
  const okHandler = () => { close(); onOk(); cleanup(); };
  const cancelHandler = () => { close(); cleanup(); };
  function cleanup() {
    ok.removeEventListener("click", okHandler);
    cancel.removeEventListener("click", cancelHandler);
  }
  ok.addEventListener("click", okHandler);
  cancel.addEventListener("click", cancelHandler);
}

// ============================================================
//   BOOT
// ============================================================
document.addEventListener("DOMContentLoaded", init);
