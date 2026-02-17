const MONTHLY_AMOUNT_PER_PERSON = 100;
const PLAN_MONTHS = 10;

// 1) Preencha com suas credenciais no Firebase Console.
// 2) Ative Firestore Database.
const FIREBASE_CONFIG = {
  apiKey: "COLE_SUA_API_KEY",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  projectId: "SEU_PROJECT_ID",
  storageBucket: "SEU_PROJETO.appspot.com",
  messagingSenderId: "SEU_SENDER_ID",
  appId: "SEU_APP_ID"
};

const motivationalMessages = [
  "Vocês estão cada vez mais perto da próxima viagem ❤️",
  "Disciplina hoje, lembranças incríveis amanhã ✨",
  "Cada pagamento é um passo para o próximo destino 🚀",
  "Parceria financeira forte, sonhos reais!",
  "Continuem assim: planejamento em casal é poder 💜"
];

const storageKeys = {
  payments: "planner_payments",
  expenses: "planner_expenses",
  trips: "planner_trips",
  coupleCode: "planner_couple_code",
  lastUpdated: "planner_last_updated"
};

let deferredPrompt = null;
let firestoreDb = null;
let coupleDocRef = null;
let unsubscribeRealtime = null;
let applyingRemoteUpdate = false;

const state = {
  payments: JSON.parse(localStorage.getItem(storageKeys.payments) || "[]"),
  expenses: JSON.parse(localStorage.getItem(storageKeys.expenses) || "[]"),
  trips: JSON.parse(localStorage.getItem(storageKeys.trips) || "[]"),
  coupleCode: localStorage.getItem(storageKeys.coupleCode) || "",
  lastUpdated: Number(localStorage.getItem(storageKeys.lastUpdated) || Date.now())
};

function isFirebaseConfigured() {
  return !Object.values(FIREBASE_CONFIG).some((value) => String(value).startsWith("SEU_") || String(value).startsWith("COLE_"));
}

function formatCurrency(value) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(isoDate) {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("pt-BR");
}

function setSyncStatus(text, mode = "neutral") {
  const el = document.getElementById("syncStatus");
  el.textContent = text;
  el.className = `sync-pill ${mode}`;
}

function hasLocalData() {
  return state.payments.length > 0 || state.expenses.length > 0 || state.trips.length > 0;
}

function getTotals() {
  const totalVini = state.payments
    .filter((entry) => entry.person === "Vini")
    .reduce((sum, entry) => sum + Number(entry.value), 0);

  const totalNina = state.payments
    .filter((entry) => entry.person === "Nina")
    .reduce((sum, entry) => sum + Number(entry.value), 0);

  const totalDeposited = totalVini + totalNina;
  const totalExpenses = state.expenses.reduce((sum, exp) => sum + Number(exp.value), 0);

  return {
    totalVini,
    totalNina,
    totalDeposited,
    totalExpenses,
    balance: totalDeposited - totalExpenses,
    goalAmount: MONTHLY_AMOUNT_PER_PERSON * 2 * PLAN_MONTHS
  };
}

function saveState(markUpdated = true) {
  if (markUpdated) {
    state.lastUpdated = Date.now();
  }

  localStorage.setItem(storageKeys.payments, JSON.stringify(state.payments));
  localStorage.setItem(storageKeys.expenses, JSON.stringify(state.expenses));
  localStorage.setItem(storageKeys.trips, JSON.stringify(state.trips));
  localStorage.setItem(storageKeys.lastUpdated, String(state.lastUpdated));
  localStorage.setItem(storageKeys.coupleCode, state.coupleCode || "");
}

function renderPaymentsCalendar() {
  const list = document.getElementById("paymentsCalendar");
  list.innerHTML = "";

  if (!state.payments.length) {
    list.innerHTML = '<li class="calendar-empty">Nenhum pagamento registrado ainda.</li>';
    return;
  }

  state.payments
    .slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .forEach((payment) => {
      const item = document.createElement("li");
      item.className = "calendar-item pago";
      item.innerHTML = `
        <div>
          <strong>${formatDate(payment.date)}</strong>
          <small>${formatCurrency(payment.value)}</small>
        </div>
        <span class="payment-label paid">✓ Pago por ${payment.person}</span>
      `;
      list.appendChild(item);
    });
}

function renderTrips() {

  const list = document.getElementById("tripsList");
  const tripSelect = document.getElementById("expenseTripId");

  list.innerHTML = "";
  tripSelect.innerHTML = '<option value="">Sem vínculo</option>';

  if (!state.trips.length) {
    list.innerHTML = `<li class="expense-item"><span>Nenhuma viagem cadastrada.</span></li>`;
    return;
  }

  state.trips
    .slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .forEach((trip) => {
      const item = document.createElement("li");
      item.className = "expense-item";
      item.innerHTML = `<div><strong>${trip.name}</strong><small>${formatDate(trip.date)}</small></div>`;
      list.appendChild(item);

      const option = document.createElement("option");
      option.value = trip.id;
      option.textContent = `${trip.name} (${formatDate(trip.date)})`;
      tripSelect.appendChild(option);
    });
}

function renderExpenses() {
  const list = document.getElementById("expensesList");
  list.innerHTML = "";

  if (!state.expenses.length) {
    list.innerHTML = `<li class="expense-item"><span>Nenhum gasto registrado ainda.</span></li>`;
    return;
  }

  state.expenses
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .forEach((expense) => {
      const trip = state.trips.find((t) => t.id === expense.tripId);
      const item = document.createElement("li");
      item.className = "expense-item";
      item.innerHTML = `
        <div>
          <strong>${expense.description}</strong>
          <small>${formatDate(expense.date)}${trip ? ` • ${trip.name}` : ""}</small>
        </div>
        <strong>${formatCurrency(expense.value)}</strong>
      `;
      list.appendChild(item);
    });
}

function drawDepositsChart(totalVini, totalNina) {
  const canvas = document.getElementById("depositsChart");
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const max = Math.max(totalVini, totalNina, 1);
  const chartBottom = height - 40;
  const chartTop = 30;
  const chartHeight = chartBottom - chartTop;
  const barWidth = 120;

  const bars = [
    { x: width * 0.28, val: totalVini, label: "Vini", color: "#820ad1" },
    { x: width * 0.62, val: totalNina, label: "Nina", color: "#b24dff" }
  ];

  ctx.font = "14px Inter, sans-serif";
  bars.forEach((bar) => {
    const h = (bar.val / max) * chartHeight;
    const y = chartBottom - h;
    ctx.fillStyle = bar.color;
    ctx.fillRect(bar.x, y, barWidth, h);
    ctx.fillStyle = "#3c2355";
    ctx.fillText(bar.label, bar.x + 35, chartBottom + 20);
    ctx.fillText(formatCurrency(bar.val), bar.x + 5, y - 8);
  });
}

function drawBalanceChart() {
  const canvas = document.getElementById("balanceChart");
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const events = [
    ...state.payments.map((p) => ({ date: p.date, delta: Number(p.value) })),
    ...state.expenses.map((e) => ({ date: e.date, delta: -Number(e.value) }))
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  let runningBalance = 0;
  const points = events.map((event) => {
    runningBalance += event.delta;
    return { date: event.date, balance: runningBalance };
  });

  if (!points.length) {
    ctx.fillStyle = "#7c6793";
    ctx.font = "15px Inter, sans-serif";
    ctx.fillText("Sem movimentações para exibir evolução.", 130, 140);
    return;
  }

  const max = Math.max(...points.map((p) => p.balance), 1);
  const min = Math.min(...points.map((p) => p.balance), 0);
  const left = 35;
  const top = 25;
  const plotWidth = width - 60;
  const plotHeight = height - 55;

  ctx.strokeStyle = "#eadbff";
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, top + plotHeight);
  ctx.lineTo(left + plotWidth, top + plotHeight);
  ctx.stroke();

  ctx.strokeStyle = "#820ad1";
  ctx.lineWidth = 3;
  ctx.beginPath();

  points.forEach((point, i) => {
    const x = left + (i / Math.max(points.length - 1, 1)) * plotWidth;
    const normalized = (point.balance - min) / Math.max(max - min, 1);
    const y = top + plotHeight - normalized * plotHeight;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);

    ctx.fillStyle = "#820ad1";
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.stroke();
  ctx.fillStyle = "#3c2355";
  ctx.font = "13px Inter, sans-serif";
  ctx.fillText(`Saldo atual: ${formatCurrency(points[points.length - 1].balance)}`, left, height - 12);
}

function updateDashboard() {
  const totals = getTotals();
  document.getElementById("saldoAtual").textContent = formatCurrency(totals.balance);
  document.getElementById("totalVini").textContent = formatCurrency(totals.totalVini);
  document.getElementById("totalNina").textContent = formatCurrency(totals.totalNina);
  document.getElementById("totalGeral").textContent = formatCurrency(totals.totalDeposited);
  document.getElementById("gastoViagens").textContent = formatCurrency(totals.totalExpenses);
  document.getElementById("saldoRestante").textContent = formatCurrency(totals.balance);
  document.getElementById("tripSaved").textContent = formatCurrency(totals.totalDeposited);
  document.getElementById("tripSpent").textContent = formatCurrency(totals.totalExpenses);
  document.getElementById("tripGoal").textContent = formatCurrency(totals.goalAmount);

  const percent = Math.min((totals.totalDeposited / totals.goalAmount) * 100, 100);
  document.getElementById("tripProgressBar").style.width = `${percent.toFixed(1)}%`;
  document.getElementById("tripPercent").textContent = `${percent.toFixed(1)}% atingido`;

  drawDepositsChart(totals.totalVini, totals.totalNina);
  drawBalanceChart();
}

function rerenderAll() {
  renderPaymentsCalendar();
  renderTrips();
  renderExpenses();
  updateDashboard();
}

function normalizedCode(input) {
  return input.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
}

function getPayloadForCloud() {
  return {
    payments: state.payments,
    expenses: state.expenses,
    trips: state.trips,
    balance: getTotals().balance,
    updatedAt: Date.now()
  };
}

async function pushToCloud() {
  if (!coupleDocRef || !navigator.onLine || applyingRemoteUpdate) return;
  try {
    await coupleDocRef.set(getPayloadForCloud(), { merge: true });
    setSyncStatus("Sincronizado em tempo real", "ok");
  } catch (error) {
    console.warn("Falha ao sincronizar com Firebase", error);
    setSyncStatus("Offline/local (sincroniza depois)", "warn");
  }
}

function scheduleCloudSync() {
  if (!coupleDocRef) return;
  if (!navigator.onLine) {
    setSyncStatus("Offline/local (sincroniza depois)", "warn");
    return;
  }
  pushToCloud();
}

async function setupRealtimeSync() {
  if (!state.coupleCode || !firestoreDb) return;

  if (unsubscribeRealtime) unsubscribeRealtime();
  coupleDocRef = firestoreDb.collection("couples").doc(state.coupleCode);

  setSyncStatus("Conectando ao Firebase...", "neutral");

  try {
    const snapshot = await coupleDocRef.get();
    const remoteExists = snapshot.exists;
    const remoteData = remoteExists ? snapshot.data() : null;
    const remoteUpdated = Number(remoteData?.updatedAt || 0);

    if (!remoteExists && hasLocalData()) {
      await pushToCloud();
    } else if (!remoteExists && !hasLocalData()) {
      await coupleDocRef.set(getPayloadForCloud(), { merge: true });
    } else if (remoteExists) {
      if (state.lastUpdated > remoteUpdated && hasLocalData()) {
        await pushToCloud();
      } else {
        applyingRemoteUpdate = true;
        state.payments = remoteData.payments || [];
        state.expenses = remoteData.expenses || [];
        state.trips = remoteData.trips || [];
        state.lastUpdated = remoteUpdated || Date.now();
        saveState(false);
        rerenderAll();
        applyingRemoteUpdate = false;
      }
    }

    unsubscribeRealtime = coupleDocRef.onSnapshot((doc) => {
      if (!doc.exists || applyingRemoteUpdate) return;
      const data = doc.data();
      const remoteUpdatedAt = Number(data.updatedAt || 0);
      if (remoteUpdatedAt <= state.lastUpdated) return;

      applyingRemoteUpdate = true;
      state.payments = data.payments || [];
      state.expenses = data.expenses || [];
      state.trips = data.trips || [];
      state.lastUpdated = remoteUpdatedAt;
      saveState(false);
      rerenderAll();
      applyingRemoteUpdate = false;
      setSyncStatus("Dados atualizados em tempo real", "ok");
    });

    setSyncStatus("Sincronizado em tempo real", "ok");
  } catch (error) {
    console.warn("Erro ao conectar Firebase", error);
    setSyncStatus("Modo local (verifique Firebase)", "warn");
  }
}

function initFirebaseIfPossible() {
  if (!isFirebaseConfigured()) {
    setSyncStatus("Modo local (configure Firebase)", "warn");
    return;
  }

  if (!window.firebase) {
    setSyncStatus("Modo local (Firebase indisponível)", "warn");
    return;
  }

  try {
    if (!window.firebase.apps.length) {
      window.firebase.initializeApp(FIREBASE_CONFIG);
    }
    firestoreDb = window.firebase.firestore();
    firestoreDb.enablePersistence({ synchronizeTabs: true }).catch(() => {});
  } catch (error) {
    console.warn("Falha na inicialização do Firebase", error);
    setSyncStatus("Modo local (erro Firebase)", "warn");
  }
}

function registerEvents() {
  document.getElementById("coupleForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const code = normalizedCode(document.getElementById("coupleCodeInput").value);
    if (!code) return;

    state.coupleCode = code;
    saveState(false);
    document.getElementById("coupleGate").classList.add("hidden");

    await setupRealtimeSync();
  });

  document.getElementById("paymentForm").addEventListener("submit", (event) => {
    event.preventDefault();

    const person = document.getElementById("paymentPerson").value;
    const value = Number(document.getElementById("paymentValue").value);
    const date = document.getElementById("paymentDate").value;
    if (!person || !value || !date) return;

    state.payments.push({ id: crypto.randomUUID(), person, value, date });
    saveState();
    rerenderAll();
    scheduleCloudSync();
    event.target.reset();
  });

  document.getElementById("tripForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = document.getElementById("tripName").value.trim();
    const date = document.getElementById("tripDate").value;
    if (!name || !date) return;

    state.trips.push({ id: crypto.randomUUID(), name, date });
    saveState();
    rerenderAll();
    scheduleCloudSync();
    event.target.reset();
  });

  document.getElementById("expenseForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const description = document.getElementById("expenseDescription").value.trim();
    const value = Number(document.getElementById("expenseValue").value);
    const date = document.getElementById("expenseDate").value;
    const tripId = document.getElementById("expenseTripId").value || null;
    if (!description || !value || !date) return;

    state.expenses.push({ id: crypto.randomUUID(), description, value, date, tripId });
    saveState();
    rerenderAll();
    scheduleCloudSync();
    event.target.reset();
  });

  document.getElementById("resetBtn").addEventListener("click", () => {
    Object.values(storageKeys).forEach((key) => localStorage.removeItem(key));
    location.reload();
  });

  window.addEventListener("online", () => {
    if (state.coupleCode) setupRealtimeSync();
    setSyncStatus("Online: sincronizando...", "neutral");
  });

  window.addEventListener("offline", () => {
    setSyncStatus("Offline/local (sincroniza depois)", "warn");
  });
}

function setupPWAInstall() {
  const installBtn = document.getElementById("installBtn");
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    installBtn.hidden = false;
  });

  installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.hidden = true;
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      console.warn("Falha ao registrar service worker.");
    });
  }
}

function applyMotivationMessage() {
  const randomIndex = Math.floor(Math.random() * motivationalMessages.length);
  document.getElementById("motivationText").textContent = motivationalMessages[randomIndex];
}

function hideLoader() {
  setTimeout(() => document.getElementById("loadingScreen").classList.add("hidden"), 850);
}

async function init() {
  applyMotivationMessage();
  rerenderAll();
  registerEvents();
  setupPWAInstall();
  initFirebaseIfPossible();

  if (state.coupleCode) {
    document.getElementById("coupleGate").classList.add("hidden");
    document.getElementById("coupleCodeInput").value = state.coupleCode;
    await setupRealtimeSync();
  } else {
    setSyncStatus("Informe o código do casal", "neutral");
  }

  hideLoader();
}

init();
