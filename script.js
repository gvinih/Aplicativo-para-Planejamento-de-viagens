const MONTHLY_AMOUNT_PER_PERSON = 100;
const DEPOSIT_DAY_VALUES = [
  { day: 5, amount: 50 },
  { day: 20, amount: 50 }
];
const PLAN_MONTHS = 10;
const START_DATE = new Date(2025, 0, 1); // data inicial corrigida

const motivationalMessages = [
  "Vocês estão cada vez mais perto da próxima viagem ❤️",
  "Disciplina hoje, lembranças incríveis amanhã ✨",
  "Cada pagamento é um passo para o próximo destino 🚀",
  "Parceria financeira forte, sonhos reais!",
  "Continuem assim: planejamento em casal é poder 💜"
  "Isso ai minha gata, ainda vamos conhecer esse mundo juntos!"
];

const storageKeys = {
  payments: "planner_payments",
  expenses: "planner_expenses",
  trips: "planner_trips"
};

let deferredPrompt = null;

const state = {
  schedule: [],
  payments: JSON.parse(localStorage.getItem(storageKeys.payments) || "[]"),
  expenses: JSON.parse(localStorage.getItem(storageKeys.expenses) || "[]"),
  trips: JSON.parse(localStorage.getItem(storageKeys.trips) || "[]")
};

function formatCurrency(value) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(isoDate) {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("pt-BR");
}

function generateSchedule() {
  const rows = [];

  for (let i = 0; i < PLAN_MONTHS; i++) {
    const currentDate = new Date(START_DATE.getFullYear(), START_DATE.getMonth() + i, 1);

    DEPOSIT_DAY_VALUES.forEach(({ day, amount }) => {
      ["Vini", "Nina"].forEach((person) => {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        rows.push({
          id: `${date.toISOString().slice(0, 10)}-${person.toLowerCase()}`,
          date: date.toISOString().slice(0, 10),
          person,
          amount
        });
      });
    });
  }

  return rows.sort((a, b) => new Date(a.date) - new Date(b.date));
}

function saveState() {
  localStorage.setItem(storageKeys.payments, JSON.stringify(state.payments));
  localStorage.setItem(storageKeys.expenses, JSON.stringify(state.expenses));
  localStorage.setItem(storageKeys.trips, JSON.stringify(state.trips));
}

function totalPaymentsByPerson(person) {
  return state.payments
    .filter((entry) => entry.person === person)
    .reduce((sum, entry) => sum + Number(entry.value), 0);
}

function getTotals() {
  const totalVini = totalPaymentsByPerson("Vini");
  const totalNina = totalPaymentsByPerson("Nina");
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

function getPaymentByDate(date) {
  const payment = state.payments
    .filter((entry) => entry.date === date)
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  return payment || null;
}

function renderSchedule() {
  const table = document.getElementById("depositsTable");
  table.innerHTML = "";

  state.schedule.forEach((entry) => {
    const payment = getPaymentByDate(entry.date);
    const isPaid = Boolean(payment);
    const paidText = isPaid ? `✓ Pago por ${payment.person}` : "Sem registro";

    const row = document.createElement("tr");
    row.className = isPaid ? "schedule-row paid" : "schedule-row";
    row.innerHTML = `
      <td>${formatDate(entry.date)}</td>
      <td>${entry.person}</td>
      <td>${formatCurrency(entry.amount)}</td>
      <td class="payment-label ${isPaid ? "paid" : "neutral"}">${paidText}</td>
    `;
    table.appendChild(row);
  });
}

// ... restante do código permanece igual ...

function init() {
  state.schedule = generateSchedule();
  applyMotivationMessage();
  renderSchedule();
  renderTrips();
  renderExpenses();
  updateDashboard();
  registerEvents();
  setupPWAInstall();
  hideLoader();
}

init();

