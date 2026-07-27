"use client";
import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart,
} from "recharts";
import {
  Wallet, TrendingUp, TrendingDown, PiggyBank, Target,
  Search, Filter, Download, ChevronRight, ChevronLeft, X, Plus,
  Home, Utensils, Car, Zap, HeartPulse, GraduationCap, Popcorn,
  ShoppingBag, Repeat, MoreHorizontal, Sparkles, Check, Trash2,
  Calendar, Bell, ArrowUpRight, ArrowDownRight, Settings2, Globe,
  Pencil, Coins, AlertTriangle, CreditCard, Minus, Landmark,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
/* ---------------------------------------------------------------
   TOKENS
------------------------------------------------------------------ */
const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MONTHS_FULL = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
// Cuántos años hacia el futuro se puede navegar desde Resumen/Ingresos/Gastos/
// Ahorros/Presupuestos — para ver de antemano ingresos fijos, gastos fijos y
// planes de pago que ya están programados para esos años.
const MAX_FUTURE_YEARS = 10;
const CATEGORY_META = {
  Vivienda: { icon: Home, color: "#EF4444" },
  Alimentación: { icon: Utensils, color: "#F97316" },
  Transporte: { icon: Car, color: "#EAB308" },
  Servicios: { icon: Zap, color: "#84CC16" },
  Salud: { icon: HeartPulse, color: "#14B8A6" },
  Educación: { icon: GraduationCap, color: "#3B82F6" },
  Entretenimiento: { icon: Popcorn, color: "#8B5CF6" },
  Compras: { icon: ShoppingBag, color: "#EC4899" },
  Suscripciones: { icon: Repeat, color: "#F43F5E" },
  "Compras a plazos": { icon: CreditCard, color: "#DB2777" },
  Otros: { icon: MoreHorizontal, color: "#64748B" },
};
const CATEGORY_NAMES = Object.keys(CATEGORY_META);
// Clasificación por defecto de cada categoría para la regla 50/30/20
// (necesidades básicas vs. gustos personales). Es una guía general para dar
// consejos aproximados, no algo que la persona haya configurado — por eso
// "Compras a plazos" y "Otros" quedan del lado de "gusto" por precaución.
const CATEGORY_BUDGET_BUCKET = {
  Vivienda: "necesidad",
  Alimentación: "necesidad",
  Transporte: "necesidad",
  Servicios: "necesidad",
  Salud: "necesidad",
  Educación: "necesidad",
  Entretenimiento: "gusto",
  Compras: "gusto",
  Suscripciones: "gusto",
  "Compras a plazos": "gusto",
  Otros: "gusto",
};
const CURRENCIES = {
  CRC: { symbol: "₡", rate: 1, locale: "es-CR" },
  USD: { symbol: "$", rate: 1 / 520, locale: "en-US" },
  EUR: { symbol: "€", rate: 1 / 560, locale: "es-ES" },
};
// Un presupuesto puede ser "por defecto" (year=0, month=0 → aplica a todos
// los meses) o "específico" de un mes puntual (year real, month 1-12). A
// partir de todas las filas de "budgets" de una categoría, esto resuelve
// cuál aplica de verdad para el año/mes pedido: el específico gana si
// existe; si no, se usa el de por defecto. Se comparte entre Presupuestos y
// los consejos del detalle mensual para no repetir esta lógica dos veces. (Se usa 0 en
// vez de null para year/month porque así el UNIQUE + upsert de Supabase es
// trivial — con null, dos presupuestos "por defecto" de la misma categoría
// no chocarían entre sí en la base de datos.)
function resolveEffectiveBudgets(allBudgets, year, month1to12) {
  const byCategory = {};
  (allBudgets || []).forEach((b) => {
    const by = Number(b.year) || 0;
    const bm = Number(b.month) || 0;
    const isDefault = by === 0 && bm === 0;
    const isSpecific = by === year && bm === month1to12;
    if (!isDefault && !isSpecific) return;
    const entry = byCategory[b.category_id] || {};
    if (isDefault) entry.default = b;
    if (isSpecific) entry.specific = b;
    byCategory[b.category_id] = entry;
  });
  const result = {};
  Object.entries(byCategory).forEach(([catId, entry]) => {
    result[catId] = entry.specific
      ? { row: entry.specific, isOverride: true }
      : { row: entry.default, isOverride: false };
  });
  return result;
}
/* ---------------------------------------------------------------
   DATOS REALES — agrupa incomes/expenses/savings por mes
------------------------------------------------------------------ */
// Genera, solo para el año pedido, una entrada virtual por cada mes (o cada
// quincena, si item.frequency === "quincenal") en que un ítem "fijo" (plan
// de pago con total_months, o gasto/ingreso fijo sin fecha de fin) aplica.
// Nunca se guarda como fila real en expenses/incomes.
function synthesizeRecurringEntries(item, year, { totalMonths } = {}) {
  const out = [];
  const isQuincenal = !totalMonths && item.frequency === "quincenal";
  if (isQuincenal) {
    // Lo quincenal SIEMPRE cae en el día 15 y el día 30 de cada mes (o el
    // último día del mes, en los meses que no llegan a 30, como febrero) —
    // igual que una planilla real. Antes se sumaban 15 días de calendario a
    // partir de la fecha de inicio, lo que con el tiempo iba corriendo esa
    // fecha por todos los días del mes; ahora se ancla siempre al 15/30.
    // `item.start_date` solo decide desde qué fecha empieza a contar (se
    // descartan las ocurrencias de 15/30 anteriores a esa fecha).
    let index = 0;
    // 1200 meses = 100 años, tope de seguridad para ítems sin fecha de fin
    for (let i = 0; i < 1200; i++) {
      const monthAnchor = addMonthsToDateString(item.start_date, i);
      const [anchorYear, anchorMonth] = monthAnchor.split("-").map(Number);
      if (anchorYear > year) break;
      const lastDayOfMonth = new Date(anchorYear, anchorMonth, 0).getDate();
      const secondDay = Math.min(30, lastDayOfMonth);
      const mm = String(anchorMonth).padStart(2, "0");
      const candidates = [`${anchorYear}-${mm}-15`, `${anchorYear}-${mm}-${String(secondDay).padStart(2, "0")}`];
      candidates.forEach((d) => {
        if (d < item.start_date) return;
        if (anchorYear === year) out.push({ date: d, index });
        index += 1;
      });
    }
    return out;
  }
  // 1200 meses = 100 años, tope de seguridad para ítems sin fecha de fin
  const cap = totalMonths ?? 1200;
  for (let i = 0; i < cap; i++) {
    const d = addMonthsToDateString(item.start_date, i);
    const dy = Number(d.slice(0, 4));
    if (dy > year) break;
    if (dy === year) out.push({ date: d, index: i });
  }
  return out;
}
async function fetchYearData(year) {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const [
    { data: incomes, error: incError },
    { data: expenses, error: expError },
    { data: savings, error: savError },
    { data: plans, error: planError },
    { data: recExpenses, error: recExpError },
    { data: recIncomes, error: recIncError },
  ] = await Promise.all([
    supabase.from("incomes").select("*").gte("date", start).lte("date", end),
    supabase.from("expenses").select("*, categories(name, color, icon), credit_cards(name)").gte("date", start).lte("date", end),
    supabase.from("savings").select("*").gte("date", start).lte("date", end),
    supabase.from("installment_plans").select("*, categories(name, color, icon), credit_cards(name, cutoff_day, payment_day)"),
    supabase.from("recurring_expenses").select("*, categories(name, color, icon)"),
    supabase.from("recurring_incomes").select("*"),
  ]);
  if (incError) console.error("Error incomes:", incError.message);
  if (expError) console.error("Error expenses:", expError.message);
  if (savError) console.error("Error savings:", savError.message);
  if (planError) console.error("Error planes de pago:", planError.message);
  if (recExpError) console.error("Error gastos fijos:", recExpError.message);
  if (recIncError) console.error("Error ingresos fijos:", recIncError.message);
  // Los planes de pago no se guardan como una fila por cuota: se sintetizan
  // aquí, solo para el año consultado, a partir de start_date + total_months.
  const planExpenses = [];
  (plans || []).forEach((p) => {
    const totalMonths = Number(p.total_months) || 0;
    const anchoredPlan = { ...p, start_date: planAnchorDate(p) };
    synthesizeRecurringEntries(anchoredPlan, year, { totalMonths }).forEach(({ date, index }) => {
      planExpenses.push({
        id: `plan-${p.id}-${index}`,
        amount: Number(p.monthly_amount),
        date,
        description: `${p.description || "Plan de pago"} (cuota ${index + 1}/${totalMonths})`,
        is_recurring: false,
        categories: p.categories,
      });
    });
  });
  // Gastos e ingresos fijos mensuales: igual que los planes de pago, pero
  // sin fecha de fin (se repiten indefinidamente desde start_date).
  const recurringExpenseEntries = [];
  (recExpenses || []).forEach((r) => {
    const freqLabel = r.frequency === "quincenal" ? "quincenal" : "fijo";
    synthesizeRecurringEntries(r, year).forEach(({ date, index }) => {
      recurringExpenseEntries.push({
        id: `recexp-${r.id}-${index}`,
        amount: Number(r.amount),
        date,
        description: `${r.description || "Gasto fijo"} (${freqLabel})`,
        is_recurring: true,
        categories: r.categories,
      });
    });
  });
  const recurringIncomeEntries = [];
  (recIncomes || []).forEach((r) => {
    const freqLabel = r.frequency === "quincenal" ? "quincenal" : "fijo";
    synthesizeRecurringEntries(r, year).forEach(({ date, index }) => {
      recurringIncomeEntries.push({
        id: `recinc-${r.id}-${index}`,
        amount: Number(r.amount),
        date,
        type: r.type || "Ingreso fijo",
        description: r.description ? `${r.description} (${freqLabel})` : `(${freqLabel})`,
      });
    });
  });
  const allExpenses = [...(expenses || []), ...planExpenses, ...recurringExpenseEntries];
  const allIncomes = [...(incomes || []), ...recurringIncomeEntries];
  const monthsData = MONTHS.map((m, i) => {
    const monthNum = i + 1;
    const monthIncomes = allIncomes.filter((r) => dateStringMonth(r.date) === monthNum);
    const monthExpenses = allExpenses.filter((r) => dateStringMonth(r.date) === monthNum);
    const monthSavings = (savings || []).filter((r) => dateStringMonth(r.date) === monthNum);
    const ingresoTotal = monthIncomes.reduce((a, r) => a + Number(r.amount), 0);
    const gastoTotal = monthExpenses.reduce((a, r) => a + Number(r.amount), 0);
    const ahorroTotal = monthSavings.reduce((a, r) => a + Number(r.amount), 0);
    const balance = ingresoTotal - gastoTotal - ahorroTotal;
    const gastosFormateados = monthExpenses.map((e) => ({
      id: e.id,
      categoria: e.categories?.name || "Otros",
      descripcion: e.description || e.categories?.name || "Gasto",
      fecha: e.date,
      fechaCompra: e.purchase_date || null,
      tarjeta: e.credit_cards?.name || null,
      monto: Number(e.amount),
    }));
    return {
      mes: m,
      mesFull: MONTHS_FULL[i],
      incomes: monthIncomes,
      gastos: gastosFormateados,
      savings: monthSavings,
      ingresoTotal,
      gastoTotal,
      ahorroTotal,
      balance,
    };
  });
  return monthsData;
}
/* ---------------------------------------------------------------
   HELPERS
------------------------------------------------------------------ */
function useCurrency() {
  const [code, setCode] = useState("CRC");
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("finanzas_currency") : null;
    if (saved && CURRENCIES[saved]) setCode(saved);
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("finanzas_currency", code);
  }, [code]);
  const cfg = CURRENCIES[code];
  const format = useCallback((crcAmount) => {
    const value = crcAmount * cfg.rate;
    return new Intl.NumberFormat(cfg.locale, {
      style: "currency", currency: code, maximumFractionDigits: 0,
    }).format(value);
  }, [code, cfg]);
  return { code, setCode, format };
}
function exportToCSV(filename, rows) {
  if (typeof window === "undefined" || !rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function sortCategories(cats) {
  const rank = (name) => {
    const n = (name || "").trim().toLowerCase();
    if (n === "compras a plazos") return 0;
    if (n === "otros") return 2;
    return 1;
  };
  return [...cats].sort((a, b) => rank(a.name) - rank(b.name));
}
// Sacan año/mes de un string de fecha "YYYY-MM-DD" (lo que guarda Supabase
// en las columnas de fecha) sin pasar nunca por un objeto Date. Hacerlo con
// `new Date(str).getMonth()` es una trampa clásica de JavaScript: un string
// de solo fecha se interpreta como medianoche UTC, y getMonth()/getDate()/
// getFullYear() la convierten después a la hora LOCAL del navegador — en
// Costa Rica (UTC-6) eso resta 6 horas y empuja la fecha un día atrás, así
// que un ahorro fechado el 1 de agosto terminaba contado en julio. Parsear
// el string directo evita el problema por completo.
function dateStringYear(dateStr) {
  return Number(String(dateStr).slice(0, 4));
}
function dateStringMonth(dateStr) {
  // 1-12
  return Number(String(dateStr).slice(5, 7));
}
function dateStringDay(dateStr) {
  return Number(String(dateStr).slice(8, 10));
}
// Fecha de HOY en el calendario LOCAL (no UTC) como "YYYY-MM-DD". Evita el
// mismo problema pero al revés: `new Date().toISOString()` convierte la
// hora actual a UTC antes de cortarla, así que en la noche (hora de Costa
// Rica) ya cuenta como el día siguiente en UTC.
function localDateString(d) {
  const dt = d || new Date();
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
function addMonthsToDateString(dateStr, monthsToAdd) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const targetIndex = m - 1 + monthsToAdd;
  const targetYear = y + Math.floor(targetIndex / 12);
  const targetMonth = ((targetIndex % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const targetDay = Math.min(d, lastDayOfTargetMonth);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}
// A partir de la fecha real de una compra con tarjeta de crédito, calcula la
// fecha en la que realmente toca pagarla (según el día de corte y el día de
// pago de la tarjeta) — esa es la fecha que se usa para los totales
// mensuales, no la fecha de la compra.
function computeCardPaymentDate(purchaseDateStr, cutoffDay, paymentDay) {
  const [y, m, d] = purchaseDateStr.split("-").map(Number);
  let statementYear = y, statementMonth = m;
  if (d > cutoffDay) {
    statementMonth += 1;
    if (statementMonth > 12) { statementMonth = 1; statementYear += 1; }
  }
  let paymentYear = statementYear, paymentMonth = statementMonth;
  if (paymentDay <= cutoffDay) {
    paymentMonth += 1;
    if (paymentMonth > 12) { paymentMonth = 1; paymentYear += 1; }
  }
  const lastDay = new Date(paymentYear, paymentMonth, 0).getDate();
  const day = Math.min(paymentDay, lastDay);
  return `${paymentYear}-${String(paymentMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
// Fecha por defecto para prellenar el formulario de "Agregar" (gasto/
// ingreso/ahorro) según el mes que la persona ya tiene seleccionado con las
// flechitas de navegación: si es el mes real actual, usa el día de hoy; si
// es otro mes (pasado o futuro), usa el día 1 de ese mes. Así el formulario
// no pide una fecha desconectada del mes que se está viendo.
function defaultDateForMonth(month, year) {
  const now = new Date();
  if (month === now.getMonth() && year === now.getFullYear()) {
    return localDateString(now);
  }
  return `${year}-${String(month + 1).padStart(2, "0")}-01`;
}
// Fecha real desde la que corre el plan. Si el plan está vinculado a una
// tarjeta de crédito, "start_date" es la fecha de la compra y aquí se
// calcula la fecha real de la 1ª cuota según el corte/pago de esa tarjeta
// (las cuotas siguientes simplemente siguen ese mismo día cada mes, como en
// cualquier estado de cuenta). Si no hay tarjeta, se usa "start_date" tal cual.
function planAnchorDate(plan) {
  if (plan.card_id && plan.credit_cards) {
    return computeCardPaymentDate(plan.start_date, Number(plan.credit_cards.cutoff_day), Number(plan.credit_cards.payment_day));
  }
  return plan.start_date;
}
// Cuántas cuotas de un plan de pago ya se cumplieron a una fecha de
// referencia. Por defecto usa la fecha real de hoy (así se sigue calculando
// el checklist de cuotas realmente pagadas, en "Ver cuotas"). Si se pasan
// refYear/refMonth (0-indexed, igual que Date.getMonth()), se usa esa fecha
// en su lugar — así, en la lista de Gastos, el número de cuota puede seguir
// el mes que se está viendo con las flechitas en vez de la fecha real de hoy.
// 0 = aún no empieza a correr ninguna cuota completa; clamp a total_months.
function planElapsedMonths(plan, refYear, refMonth) {
  const [sy, sm] = planAnchorDate(plan).split("-").map(Number);
  let ry, rm;
  if (refYear != null && refMonth != null) {
    ry = refYear;
    rm = refMonth + 1;
  } else {
    const now = new Date();
    ry = now.getFullYear();
    rm = now.getMonth() + 1;
  }
  let elapsed = (ry - sy) * 12 + (rm - sm);
  if (elapsed < 0) elapsed = 0;
  const total = Number(plan.total_months) || 0;
  if (elapsed > total) elapsed = total;
  return elapsed;
}
// Número de cuota actual (1-indexed), sin pasarse del total.
function planCurrentCuota(plan, refYear, refMonth) {
  const total = Number(plan.total_months) || 0;
  const elapsed = planElapsedMonths(plan, refYear, refMonth);
  return Math.min(elapsed + 1, total);
}
// Monto total del préstamo/plan (todas las cuotas).
function planTotalAmount(plan) {
  return Number(plan.monthly_amount) * (Number(plan.total_months) || 0);
}
// Cuántas cuotas, de las que ya deberían estar pagadas, se marcaron
// manualmente como "no_pagada" (las "atrasada" sí cuentan como pagadas,
// solo quedan marcadas como pago tardío).
function planUnpaidCount(overrides, planId) {
  return overrides.filter((o) => o.plan_id === planId && o.status === "no_pagada").length;
}
// Saldo pendiente: el cálculo automático por fecha sigue igual (cuántas
// cuotas ya "tocaba" pagar), y a eso se le resta lo marcado manualmente
// como no pagado en el checklist de cuotas.
function planSaldoPendiente(plan, overrides, refYear, refMonth) {
  const elapsed = planElapsedMonths(plan, refYear, refMonth);
  const unpaid = planUnpaidCount(overrides, plan.id);
  const paidCount = Math.max(0, elapsed - unpaid);
  const total = Number(plan.total_months) || 0;
  return (total - paidCount) * Number(plan.monthly_amount);
}
function cuotaStatus(overrides, planId, cuotaNumber) {
  const found = overrides.find((o) => o.plan_id === planId && o.cuota_number === cuotaNumber);
  return found ? found.status : "pagada";
}
const CUOTA_STATUS_LABEL = { pagada: "Pagada", atrasada: "Pagada tarde", no_pagada: "No pagada" };
// Suma (o resta, si delta es negativo) al monto actual de una meta, leyendo
// el valor más reciente de la base antes de escribir. Se usa cuando un
// ahorro vinculado a una meta se crea, edita o elimina.
async function adjustGoalAmount(goalId, delta) {
  if (!goalId || !delta) return;
  const { data } = await supabase.from("goals").select("current_amount").eq("id", goalId).single();
  if (!data) return;
  await supabase.from("goals").update({ current_amount: Number(data.current_amount) + delta }).eq("id", goalId);
}
function statusOf(balance, ingreso) {
  if (ingreso === 0) return "gris";
  const ratio = balance / ingreso;
  if (ratio >= 0.15) return "verde";
  if (ratio >= 0) return "amarillo";
  return "rojo";
}
const STATUS_COLOR = {
  verde: "bg-emerald-500", amarillo: "bg-amber-400", rojo: "bg-red-500", gris: "bg-slate-400",
};
const STATUS_LABEL = { verde: "Saludable", amarillo: "Ajustado", rojo: "En déficit", gris: "Sin datos" };
/* ---------------------------------------------------------------
   PRIMITIVES
------------------------------------------------------------------ */
function Card({ children, className = "" }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(15,23,42,0.12)] dark:border-slate-800 dark:bg-slate-900 dark:shadow-none transition-colors ${className}`}>
      {children}
    </div>
  );
}
function Eyebrow({ children }) {
  return <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">{children}</p>;
}
function StatCard({ label, value, icon: Icon, accent, delta, deltaGood }) {
  const accents = {
    slate: "text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800",
    green: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10",
    red: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10",
    blue: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10",
    amber: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10",
  };
  return (
    <Card className="p-5 hover:-translate-y-0.5 transition-transform duration-300">
      <div className="flex items-start justify-between">
        <div>
          <Eyebrow>{label}</Eyebrow>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{value}</p>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accents[accent]}`}>
          <Icon size={18} strokeWidth={2} />
        </div>
      </div>
      {delta !== undefined && (
        <div className={`mt-3 inline-flex items-center gap-1 text-xs font-medium ${deltaGood ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
          {deltaGood ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {delta}
        </div>
      )}
    </Card>
  );
}
function ProgressRing({ percent, color, size = 56 }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(percent, 100) / 100) * c;
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-slate-100 dark:text-slate-800" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6"
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 900ms cubic-bezier(.4,0,.2,1)" }}
      />
    </svg>
  );
}
/* ---------------------------------------------------------------
   CONFIRMACIÓN DE ELIMINAR (compartido)
------------------------------------------------------------------ */
function ConfirmDeleteModal({ title, message, onCancel, onConfirm }) {
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  async function handleConfirm() {
    setDeleting(true);
    setErrorMsg("");
    try {
      await onConfirm();
    } catch (err) {
      setErrorMsg("Error al eliminar: " + (err?.message || "intenta de nuevo."));
      setDeleting(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-500 dark:bg-red-500/10">
            <Trash2 size={18} />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
        </div>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{message}</p>
        {errorMsg && <p className="mt-2 text-xs text-red-500">{errorMsg}</p>}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={deleting}
            className="flex-1 rounded-lg bg-red-500 py-2.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
          >
            {deleting ? "Eliminando..." : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}
function RowActions({ onEdit, onDelete }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={onEdit}
        aria-label="Editar"
        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <Pencil size={14} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Eliminar"
        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
// Selector de mes minimalista, fijo arriba en el encabezado (junto al
// selector de moneda), no pegado al título de cada pestaña — así se ve
// siempre en el mismo lugar sin importar en qué pestaña estés, y se siente
// como un solo control global en vez de algo distinto por pantalla. Se
// muestra en Resumen, Ingresos, Gastos, Ahorros y Presupuestos (en Ingresos/
// Gastos/Ahorros/Presupuestos sí filtra los datos; en Resumen no cambia nada
// todavía, ver el dashboard más abajo). No aparece en Metas. El mes es un
// estado compartido (ver FinanceApp), igual que ya pasa con el año. Reemplaza
// la barra de flechitas "‹ Mes Año ›" que antes vivía dentro de cada pestaña.
function MonthTitleSelect({ month, onChange }) {
  return (
    <select
      value={month}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label="Cambiar de mes"
      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
    >
      {MONTHS_FULL.map((m, i) => (
        <option key={m} value={i}>{m}</option>
      ))}
    </select>
  );
}
/* ---------------------------------------------------------------
   DASHBOARD
------------------------------------------------------------------ */
function Dashboard({ fmt, onSelectMonth, yearData, year, month }) {
  const [goals, setGoals] = useState([]);
  useEffect(() => {
    supabase.from("goals").select("*").then(({ data, error }) => {
      if (error) console.error("Error cargando metas:", error.message);
      setGoals(data || []);
    });
  }, []);
  const totals = useMemo(() => {
    const ingresos = yearData.reduce((a, m) => a + m.ingresoTotal, 0);
    const gastos = yearData.reduce((a, m) => a + m.gastoTotal, 0);
    const ahorros = yearData.reduce((a, m) => a + m.ahorroTotal, 0);
    const balance = ingresos - gastos - ahorros;
    return { ingresos, gastos, ahorros, balance, saldo: ingresos - gastos };
  }, [yearData]);
  // El progreso mostrado aquí viene de tus metas reales (pestaña Metas), no
  // de un número fijo — así los dos lados de la app siempre concuerdan.
  const totalMetaObjetivo = useMemo(() => goals.reduce((a, g) => a + Number(g.target_amount), 0), [goals]);
  const totalMetaActual = useMemo(() => goals.reduce((a, g) => a + Number(g.current_amount), 0), [goals]);
  const metaProgreso = totalMetaObjetivo > 0 ? Math.min(100, Math.round((totalMetaActual / totalMetaObjetivo) * 100)) : 0;
  const barData = yearData.map((m) => ({ mes: m.mes, Ingresos: m.ingresoTotal, Gastos: m.gastoTotal }));
  const lineData = useMemo(() => {
    let acc = 0;
    return yearData.map((m) => { acc += m.ahorroTotal; return { mes: m.mes, Ahorro: acc }; });
  }, [yearData]);
  // Estos dos venían de la pestaña "Estadísticas", que se fusionó aquí en
  // Resumen (2026-07-27) — no se trajo el tercer gráfico de esa pestaña
  // ("Evolución de ingresos, gastos y ahorro") porque repetía lo mismo que
  // "Ingresos vs gastos" y "Evolución del ahorro acumulado" de arriba.
  const catTotalsYear = useMemo(() => {
    const expensesForCat = yearData.flatMap((m) => m.gastos);
    const categoriasUsadas = [...new Set(expensesForCat.map((e) => e.categoria))];
    return categoriasUsadas.map((cat) => ({
      name: cat,
      value: expensesForCat.filter((e) => e.categoria === cat).reduce((a, e) => a + e.monto, 0),
      color: CATEGORY_META[cat]?.color || "#64748B",
    }));
  }, [yearData]);
  const monthCompare = yearData.map((m) => ({ mes: m.mes, Balance: m.balance }));
  const now = new Date();
  const isCurrentYear = year === now.getFullYear();
  // La tarjeta "Tu mes" y su frase destacada ahora siguen el mes elegido en
  // el selector del encabezado (compartido con Ingresos/Gastos/Ahorros/
  // Presupuestos), no siempre el mes real de hoy — así se ve la información
  // del mes que la persona realmente está mirando. "isRealCurrentMonth"
  // distingue si ese mes elegido coincide con hoy, solo para decidir si la
  // frase dice "Este mes..." o "En {mes}..." (y el título de la tarjeta).
  const currentIdx = month;
  const prevIdx = Math.max(0, currentIdx - 1);
  const currentMonth = yearData[currentIdx];
  const prevMonth = yearData[prevIdx];
  const isRealCurrentMonth = isCurrentYear && month === now.getMonth();
  const insights = [];
  if (prevMonth.gastoTotal > 0) {
    const pct = Math.abs(Math.round((1 - currentMonth.gastoTotal / prevMonth.gastoTotal) * 100));
    insights.push(`En ${currentMonth.mesFull.toLowerCase()} gastaste ${pct}% ${currentMonth.gastoTotal < prevMonth.gastoTotal ? "menos" : "más"} que en ${prevMonth.mesFull.toLowerCase()}.`);
  }
  const allExpenses = yearData.flatMap((m) => m.gastos);
  if (allExpenses.length > 0) {
    const byCat = allExpenses.reduce((a, e) => (a[e.categoria] = (a[e.categoria] || 0) + e.monto, a), {});
    const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
    if (top) insights.push(`Tu categoría con mayor gasto en ${year} fue ${top[0]}.`);
  }
  if (currentMonth.ingresoTotal > 0) {
    insights.push(`${isRealCurrentMonth ? "Este mes has" : `En ${currentMonth.mesFull.toLowerCase()}`} ahorrado un ${Math.round((currentMonth.ahorroTotal / currentMonth.ingresoTotal) * 100)}% de tus ingresos.`);
  }
  // Este cálculo de ritmo de ahorro es sobre el AÑO real transcurrido hasta
  // hoy (no sobre el mes elegido en la tarjeta de arriba), así que usa
  // now.getMonth() directo en vez de currentIdx.
  if (isCurrentYear && totals.ahorros > 0 && totalMetaObjetivo > totalMetaActual) {
    const promedioMensual = totals.ahorros / (now.getMonth() + 1);
    if (promedioMensual > 0) {
      insights.push(`Si mantienes este ritmo de ahorro, alcanzarías tus metas pendientes en ${Math.max(1, Math.ceil((totalMetaObjetivo - totalMetaActual) / promedioMensual))} meses.`);
    }
  }
  if (insights.length === 0) {
    insights.push("Registra ingresos, gastos y ahorros para ver análisis automáticos aquí.");
  }
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Saldo disponible" value={fmt(totals.saldo)} icon={Wallet} accent="slate" />
        <StatCard label="Ingresos del año" value={fmt(totals.ingresos)} icon={TrendingUp} accent="green" />
        <StatCard label="Gastos del año" value={fmt(totals.gastos)} icon={TrendingDown} accent="red" />
        <StatCard label="Ahorros del año" value={fmt(totals.ahorros)} icon={PiggyBank} accent="blue" />
        <StatCard label="Balance neto" value={fmt(totals.balance)} icon={Wallet} accent={totals.balance >= 0 ? "green" : "red"} />
        <Card className="p-5 flex items-center gap-4">
          {totalMetaObjetivo > 0 ? (
            <>
              <ProgressRing percent={metaProgreso} color="#F59E0B" size={56} />
              <div>
                <Eyebrow>Progreso de tus metas</Eyebrow>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{metaProgreso}%</p>
                <p className="text-xs text-slate-400">{fmt(totalMetaActual)} de {fmt(totalMetaObjetivo)}</p>
              </div>
            </>
          ) : (
            <div>
              <Eyebrow>Progreso de tus metas</Eyebrow>
              <p className="mt-1 text-sm text-slate-400">Crea una meta en la pestaña Metas para ver tu progreso aquí.</p>
            </div>
          )}
        </Card>
      </div>
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <Eyebrow>Panorama del año</Eyebrow>
          <span className="text-xs text-slate-400">Clic en un mes para ver el detalle</span>
        </div>
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-12">
          {yearData.map((m, i) => {
            const st = statusOf(m.balance, m.ingresoTotal);
            return (
              <button
                key={m.mes}
                onClick={() => onSelectMonth(i)}
                className="group flex flex-col items-center gap-2 rounded-xl p-2 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <div className={`h-16 w-full rounded-lg ${STATUS_COLOR[st]} opacity-80 transition-all duration-300 group-hover:opacity-100 group-hover:-translate-y-0.5`} />
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{m.mes}</span>
              </button>
            );
          })}
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <Eyebrow>Ingresos vs gastos</Eyebrow>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v) => fmt(v)} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Ingresos" fill="#22C55E" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Gastos" fill="#EF4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <Eyebrow>Evolución del ahorro acumulado</Eyebrow>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={lineData}>
                <defs>
                  <linearGradient id="ahorroGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v) => fmt(v)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Area type="monotone" dataKey="Ahorro" stroke="#3B82F6" strokeWidth={2} fill="url(#ahorroGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <Eyebrow>Gastos por categoría (año completo)</Eyebrow>
          <div className="mt-4 h-64">
            {catTotalsYear.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={catTotalsYear} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                    {catTotalsYear.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmt(v)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} layout="vertical" align="right" verticalAlign="middle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-slate-400">Aún no hay gastos registrados este año.</p>
            )}
          </div>
        </Card>
        <Card className="p-5">
          <Eyebrow>Balance mensual (comparación entre meses)</Eyebrow>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthCompare}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v) => fmt(v)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="Balance" radius={[4, 4, 0, 0]}>
                  {monthCompare.map((d, i) => <Cell key={i} fill={d.Balance >= 0 ? "#22C55E" : "#EF4444"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles size={16} className="text-amber-500" />
          <Eyebrow>Análisis automático</Eyebrow>
        </div>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {insights.map((t, i) => (
            <li key={i} className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">{t}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
/* ---------------------------------------------------------------
   CALENDARIO
------------------------------------------------------------------ */
const WEEKDAYS_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
// Calendario del mes elegido con lo "programado" — cuotas de planes de pago,
// gastos fijos e ingresos fijos, sintetizados dentro de fetchYearData (sus id
// empiezan con "plan-"/"recexp-"/"recinc-", ver ahí). A propósito NO incluye
// los gastos ni ingresos sueltos que se registran a mano (ni los gastos
// pagados con tarjeta): la idea es ver de un vistazo lo que ya sabes que
// viene ese mes, no un registro completo de todo lo que entra y sale. No
// hace falta ninguna consulta nueva a Supabase: reutiliza el yearData que ya
// carga el resto de la app. Cada ítem se normaliza a { id, kind, label, sub,
// amount, date } para poder mezclar gastos e ingresos en una sola lista por
// día — "kind" ("gasto"/"ingreso") es lo que decide el color (rojo/verde),
// en vez del color de categoría que se usaba antes de agregar los ingresos.
function CalendarView({ fmt, year, month, yearData }) {
  const [viewingDay, setViewingDay] = useState(null);
  const monthData = yearData[month];
  const scheduledItems = useMemo(() => {
    const gastos = monthData.gastos
      .filter((g) => String(g.id).startsWith("plan-") || String(g.id).startsWith("recexp-"))
      .map((g) => ({
        id: g.id,
        kind: "gasto",
        label: g.descripcion,
        sub: g.categoria + (g.tarjeta ? ` · ${g.tarjeta}` : ""),
        amount: g.monto,
        date: g.fecha,
      }));
    const ingresos = monthData.incomes
      .filter((i) => String(i.id).startsWith("recinc-"))
      .map((i) => ({
        id: i.id,
        kind: "ingreso",
        label: i.description || i.type || "Ingreso fijo",
        sub: i.type || "",
        amount: Number(i.amount),
        date: i.date,
      }));
    return [...gastos, ...ingresos];
  }, [monthData]);
  const byDay = useMemo(() => {
    const map = {};
    scheduledItems.forEach((it) => {
      const day = dateStringDay(it.date);
      if (!map[day]) map[day] = [];
      map[day].push(it);
    });
    return map;
  }, [scheduledItems]);
  const totalGastos = scheduledItems.filter((it) => it.kind === "gasto").reduce((a, it) => a + it.amount, 0);
  const totalIngresos = scheduledItems.filter((it) => it.kind === "ingreso").reduce((a, it) => a + it.amount, 0);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const now = new Date();
  const isRealToday = (day) => year === now.getFullYear() && month === now.getMonth() && day === now.getDate();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Eyebrow>Programado en {MONTHS_FULL[month]} {year}</Eyebrow>
          <p className="max-w-xs text-xs text-slate-400">
            Cuotas de planes de pago, gastos fijos e ingresos fijos. Lo que registras a mano (gastos e ingresos sueltos) no aparece aquí.
          </p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:max-w-xs">
          <StatMini label="Vas a recibir" value={fmt(totalIngresos)} color="text-emerald-600" />
          <StatMini label="Vas a pagar" value={fmt(totalGastos)} color="text-red-500" />
        </div>
      </Card>
      <Card className="p-5">
        <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-medium text-slate-400">
          {WEEKDAYS_SHORT.map((w) => <div key={w} className="py-1">{w}</div>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1.5">
          {cells.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} />;
            const items = byDay[day] || [];
            const dayTotal = items.reduce((a, it) => a + (it.kind === "ingreso" ? it.amount : -it.amount), 0);
            const today = isRealToday(day);
            return (
              <button
                key={day}
                onClick={() => items.length > 0 && setViewingDay({ day, items })}
                disabled={items.length === 0}
                className={`flex min-h-[64px] flex-col items-start gap-1 rounded-lg border p-1.5 text-left transition-colors ${
                  items.length > 0
                    ? "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                    : "border-transparent"
                } ${today ? "ring-2 ring-slate-900 dark:ring-white" : ""}`}
                title={items.length > 0 ? `Neto del día: ${fmt(dayTotal)}` : undefined}
              >
                <span className={`text-xs ${today ? "font-semibold text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400"}`}>{day}</span>
                {items.slice(0, 2).map((it) => (
                  <span
                    key={it.id}
                    className={`w-full truncate rounded px-1 py-0.5 text-[10px] font-medium text-white ${
                      it.kind === "ingreso" ? "bg-emerald-500" : "bg-red-500"
                    }`}
                  >
                    {fmt(it.amount)}
                  </span>
                ))}
                {items.length > 2 && (
                  <span className="text-[10px] text-slate-400">+{items.length - 2} más</span>
                )}
              </button>
            );
          })}
        </div>
      </Card>
      {viewingDay && (
        <CalendarDayModal
          day={viewingDay.day}
          items={viewingDay.items}
          fmt={fmt}
          monthLabel={`${MONTHS_FULL[month]} ${year}`}
          onClose={() => setViewingDay(null)}
        />
      )}
    </div>
  );
}
// Solo lectura: detalle de lo programado para un día puntual del calendario.
function CalendarDayModal({ day, items, fmt, monthLabel, onClose }) {
  const total = items.reduce((a, it) => a + (it.kind === "ingreso" ? it.amount : -it.amount), 0);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-8" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{day} de {monthLabel}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>
        <p className="mb-4 text-xs text-slate-400">Lo programado para este día.</p>
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
          {items.map((it) => (
            <div key={it.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <div>
                <p className="font-medium text-slate-700 dark:text-slate-200">{it.label}</p>
                {it.sub && <p className="text-xs text-slate-400">{it.sub}</p>}
              </div>
              <span className={`tabular-nums font-medium ${it.kind === "ingreso" ? "text-emerald-600" : "text-red-500"}`}>
                {it.kind === "ingreso" ? "+" : "-"}{fmt(it.amount)}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-right text-xs text-slate-400">
          Neto del día: <span className="font-medium text-slate-600 dark:text-slate-300">{fmt(total)}</span>
        </p>
      </div>
    </div>
  );
}
/* ---------------------------------------------------------------
   VISTA MENSUAL
------------------------------------------------------------------ */
// Genera hasta 3 consejos financieros para un mes concreto, priorizando lo
// más urgente primero (balance negativo, presupuesto excedido, desviaciones
// de la regla 50/30/20, una categoría muy concentrada, ahorro en cero, y
// comparación contra el mes anterior). No es una lista fija de tips: cambia
// según los números reales de ESE mes, por eso vive junto al detalle mensual.
function buildMonthlyTips(month, prevMonth, budgetsByCategoryName, fmt) {
  const tips = [];
  const { ingresoTotal, gastoTotal, ahorroTotal, balance, gastos } = month;

  if (balance < 0) {
    tips.push({ level: "red", text: `Este mes gastaste y ahorraste más de lo que ingresó: te faltaron ${fmt(Math.abs(balance))}.` });
  }

  if (budgetsByCategoryName) {
    const overBudget = Object.entries(budgetsByCategoryName)
      .map(([catName, budgetAmount]) => {
        const spent = gastos.filter((g) => g.categoria === catName).reduce((a, g) => a + g.monto, 0);
        return { catName, over: spent - budgetAmount };
      })
      .filter((r) => r.over > 0)
      .sort((a, b) => b.over - a.over);
    if (overBudget.length > 0) {
      tips.push({ level: "red", text: `Te pasaste del presupuesto de ${overBudget[0].catName} por ${fmt(overBudget[0].over)}.` });
    }
  }

  // Regla general de endeudamiento: las cuotas de planes de pago (préstamos,
  // compras a plazos) no deberían superar ~35% de los ingresos del mes.
  if (ingresoTotal > 0) {
    const deudaTotal = gastos
      .filter((g) => String(g.id).startsWith("plan-"))
      .reduce((a, g) => a + g.monto, 0);
    const deudaPct = Math.round((deudaTotal / ingresoTotal) * 100);
    if (deudaPct > 35) {
      tips.push({ level: "red", text: `Tus cuotas de planes de pago representaron el ${deudaPct}% de tus ingresos este mes (regla general: no más de 35%). Evita sumar más deudas por ahora.` });
    }
  }

  if (ingresoTotal > 0) {
    const necesidadTotal = gastos
      .filter((g) => (CATEGORY_BUDGET_BUCKET[g.categoria] || "gusto") === "necesidad")
      .reduce((a, g) => a + g.monto, 0);
    const necesidadPct = Math.round((necesidadTotal / ingresoTotal) * 100);
    const ahorroPct = Math.round((ahorroTotal / ingresoTotal) * 100);
    if (necesidadPct > 55) {
      tips.push({ level: "amber", text: `Destinaste ${necesidadPct}% de tus ingresos a necesidades básicas (la regla 50/30/20 recomienda 50%). Revisa si hay algo ajustable ahí.` });
    }
    if (ahorroPct < 15) {
      tips.push({ level: "amber", text: `Ahorraste ${ahorroPct}% de tus ingresos este mes (la regla 50/30/20 recomienda 20%). Intenta subirlo el próximo mes.` });
    } else if (ahorroPct >= 20) {
      tips.push({ level: "green", text: `Ahorraste ${ahorroPct}% de tus ingresos, cumpliendo la regla 50/30/20 (20%). ¡Sigue así!` });
    }
  }

  if (gastoTotal > 0) {
    const byCat = {};
    gastos.forEach((g) => { byCat[g.categoria] = (byCat[g.categoria] || 0) + g.monto; });
    const [topCat, topAmount] = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
    const topPct = Math.round((topAmount / gastoTotal) * 100);
    if (topPct >= 40) {
      tips.push({ level: "amber", text: `${topCat} representó el ${topPct}% de tus gastos este mes — la categoría con más peso, de lejos.` });
    }
  }

  if (ingresoTotal > 0 && ahorroTotal === 0) {
    tips.push({ level: "amber", text: "No registraste ahorro este mes — considera apartar aunque sea un poco, incluso si es pequeño." });
  }

  if (prevMonth && prevMonth.gastoTotal > 0) {
    const pct = Math.round(((gastoTotal - prevMonth.gastoTotal) / prevMonth.gastoTotal) * 100);
    if (Math.abs(pct) >= 15) {
      tips.push({ level: pct > 0 ? "amber" : "green", text: `Gastaste ${Math.abs(pct)}% ${pct > 0 ? "más" : "menos"} que en ${prevMonth.mesFull}.` });
    }
  }

  if (tips.length === 0) {
    tips.push({ level: "green", text: "Tus finanzas este mes se ven equilibradas. ¡Sigue así!" });
  }
  const severity = { red: 0, amber: 1, green: 2 };
  tips.sort((a, b) => severity[a.level] - severity[b.level]);
  return tips.slice(0, 3);
}
function MonthDetail({ index, year, fmt, onClose, onNav, yearData }) {
  const m = yearData[index];
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("Todas");
  const [tipsOpen, setTipsOpen] = useState(false);
  // Presupuestos por nombre de categoría, para poder avisar si este mes se
  // pasó del límite. Un presupuesto puede tener un monto específico para
  // ESTE año/mes (ver Presupuestos → "presupuestos por mes") o usar el monto
  // por defecto — se resuelve con resolveEffectiveBudgets, igual que en
  // Presupuestos, así ambos lados de la app concuerdan.
  const [budgetsByCategoryName, setBudgetsByCategoryName] = useState(null);
  useEffect(() => {
    let cancelled = false;
    async function fetchBudgets() {
      const [{ data: buds }, { data: cats }] = await Promise.all([
        supabase.from("budgets").select("*"),
        supabase.from("categories").select("id, name"),
      ]);
      if (cancelled) return;
      const catNameById = {};
      (cats || []).forEach((c) => { catNameById[c.id] = c.name; });
      const effective = resolveEffectiveBudgets(buds, year, index + 1);
      const map = {};
      Object.entries(effective).forEach(([catId, { row }]) => {
        const name = catNameById[catId];
        if (name) map[name] = Number(row.monthly_amount);
      });
      setBudgetsByCategoryName(map);
    }
    fetchBudgets();
    return () => { cancelled = true; };
  }, [year, index]);
  const prevMonthData = index > 0 ? yearData[index - 1] : null;
  const tips = useMemo(
    () => buildMonthlyTips(m, prevMonthData, budgetsByCategoryName, fmt),
    [m, prevMonthData, budgetsByCategoryName, fmt]
  );
  const filteredExpenses = m.gastos.filter((e) =>
    (catFilter === "Todas" || e.categoria === catFilter) &&
    e.descripcion.toLowerCase().includes(search.toLowerCase())
  );
  const categoriasDelMes = [...new Set(m.gastos.map((e) => e.categoria))];
  const pieData = categoriasDelMes.map((cat) => ({
    name: cat,
    value: m.gastos.filter((e) => e.categoria === cat).reduce((a, e) => a + e.monto, 0),
    color: CATEGORY_META[cat]?.color || "#64748B",
  })).filter((d) => d.value > 0);
  const tipToneClasses = {
    red: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
    green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-8" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl animate-[fadeIn_.25s_ease] rounded-2xl bg-white shadow-2xl dark:bg-slate-900"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <button onClick={() => onNav(-1)} disabled={index === 0} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"><ChevronLeft size={18} /></button>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{m.mesFull}</h2>
            <button onClick={() => onNav(1)} disabled={index === 11} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"><ChevronRight size={18} /></button>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatMini label="Ingresos" value={fmt(m.ingresoTotal)} color="text-emerald-600" />
            <StatMini label="Gastos" value={fmt(m.gastoTotal)} color="text-red-500" />
            <StatMini label="Ahorros" value={fmt(m.ahorroTotal)} color="text-blue-500" />
            <StatMini label="Balance" value={fmt(m.balance)} color={m.balance >= 0 ? "text-emerald-600" : "text-red-500"} />
          </div>
          {tips.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setTipsOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-2 rounded-lg py-1 text-left hover:opacity-80"
              >
                <span className="flex items-center gap-2">
                  <Sparkles size={16} className="text-amber-500" />
                  <Eyebrow>Consejos para este mes</Eyebrow>
                </span>
                <ChevronRight size={16} className={`shrink-0 text-slate-400 transition-transform ${tipsOpen ? "rotate-90" : ""}`} />
              </button>
              {tipsOpen && (
                <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {tips.map((t, i) => (
                    <li key={i} className={`rounded-xl px-4 py-3 text-sm ${tipToneClasses[t.level]}`}>
                      {t.text}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <Eyebrow>Ingresos del mes</Eyebrow>
              <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                {m.incomes.length === 0 && <p className="px-4 py-4 text-sm text-slate-400">Sin ingresos registrados.</p>}
                {m.incomes.map((inc) => (
                  <Row key={inc.id} label={inc.description || inc.type} value={fmt(inc.amount)} />
                ))}
              </div>
              <Eyebrow>
                <span className="mt-6 block">Ahorros del mes</span>
              </Eyebrow>
              <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                {m.savings.length === 0 && <p className="px-4 py-4 text-sm text-slate-400">Sin ahorros registrados.</p>}
                {m.savings.map((s) => (
                  <Row key={s.id} label={SAVINGS_TYPES.find((t) => t.value === s.type)?.label || s.type} value={fmt(s.amount)} />
                ))}
                <Row label="Total del mes" value={fmt(m.ahorroTotal)} bold />
              </div>
            </div>
            <div>
              <Eyebrow>Gastos por categoría</Eyebrow>
              <div className="mt-2 h-52">
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                        {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip formatter={(v) => fmt(v)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-slate-400">Sin gastos este mes.</p>
                )}
              </div>
            </div>
          </div>
          <div>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Eyebrow>Detalle de gastos</Eyebrow>
              <div className="flex flex-wrap gap-2">
                <div className="relative">
                  <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar gasto..."
                    className="rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <select
                  value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option>Todas</option>
                  {categoriasDelMes.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
              {filteredExpenses.map((e) => {
                const Icon = CATEGORY_META[e.categoria]?.icon || MoreHorizontal;
                const color = CATEGORY_META[e.categoria]?.color || "#64748B";
                return (
                  <div key={e.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}1a`, color }}>
                        <Icon size={15} />
                      </div>
                      <div>
                        <p className="font-medium text-slate-700 dark:text-slate-200">{e.descripcion}</p>
                        <p className="text-xs text-slate-400">
                          {e.categoria} · {e.fechaCompra || e.fecha}
                          {e.fechaCompra && e.fechaCompra !== e.fecha && ` · pago: ${e.fecha}`}
                          {e.tarjeta && ` · ${e.tarjeta}`}
                        </p>
                      </div>
                    </div>
                    <span className="tabular-nums font-medium text-slate-700 dark:text-slate-200">{fmt(e.monto)}</span>
                  </div>
                );
              })}
              {filteredExpenses.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-slate-400">Sin resultados para este filtro.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
function StatMini({ label, value, color }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-sm font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
function Row({ label, value, bold }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-sm">
      <span className={bold ? "font-medium text-slate-800 dark:text-white" : "text-slate-500 dark:text-slate-400"}>{label}</span>
      <span className={`tabular-nums ${bold ? "font-semibold text-slate-900 dark:text-white" : "text-slate-700 dark:text-slate-200"}`}>{value}</span>
    </div>
  );
}
/* ---------------------------------------------------------------
   METAS
------------------------------------------------------------------ */
function GoalsView({ fmt }) {
  const [goals, setGoals] = useState([]);
  const [contributions, setContributions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [deletingGoal, setDeletingGoal] = useState(null);
  const [contributingGoal, setContributingGoal] = useState(null);
  const [viewingContributionsGoal, setViewingContributionsGoal] = useState(null);
  async function refetchGoals() {
    const { data } = await supabase.from("goals").select("*");
    setGoals(data || []);
  }
  useEffect(() => {
    async function fetchAll() {
      const [{ data: gls, error }, { data: contribs, error: contribError }] = await Promise.all([
        supabase.from("goals").select("*"),
        supabase.from("savings").select("*").not("goal_id", "is", null).order("date", { ascending: false }),
      ]);
      if (error) console.error("Error cargando metas:", error.message);
      if (contribError) console.error("Error cargando aportes:", contribError.message);
      setGoals(gls || []);
      setContributions(contribs || []);
      setLoading(false);
    }
    fetchAll();
  }, []);
  async function handleDelete(id) {
    const { error } = await supabase.from("goals").delete().eq("id", id);
    if (error) throw error;
    setGoals((prev) => prev.filter((g) => g.id !== id));
    setDeletingGoal(null);
  }
  if (loading) {
    return <p className="text-sm text-slate-400">Cargando metas...</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {goals.map((g) => {
        const pct = Math.min(100, Math.round((g.current_amount / g.target_amount) * 100));
        const Icon = Target;
        return (
          <Card key={g.id} className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${g.color}1a`, color: g.color }}>
                  <Icon size={18} />
                </div>
                <div>
                  <p className="font-medium text-slate-800 dark:text-white">{g.name}</p>
                  <p className="text-xs text-slate-400">{fmt(g.current_amount)} de {fmt(g.target_amount)}</p>
                </div>
              </div>
              <RowActions onEdit={() => setEditingGoal(g)} onDelete={() => setDeletingGoal(g)} />
            </div>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{ width: `${pct}%`, backgroundColor: g.color }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="font-medium" style={{ color: g.color }}>{pct}% completado</span>
              {pct >= 100 && <span className="inline-flex items-center gap-1 text-emerald-600"><Check size={12} /> Meta alcanzada</span>}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => setContributingGoal(g)}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Actualizar monto
              </button>
              <button
                onClick={() => setViewingContributionsGoal(g)}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Ver aportes
              </button>
            </div>
          </Card>
        );
      })}
      <button
        onClick={() => setShowModal(true)}
        className="flex min-h-[152px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 transition-colors hover:border-slate-300 hover:text-slate-500 dark:border-slate-700 dark:hover:border-slate-600"
      >
        <Plus size={20} />
        <span className="text-sm font-medium">Crear nueva meta</span>
      </button>
      {showModal && (
        <GoalModal onClose={() => setShowModal(false)} onSaved={refetchGoals} />
      )}
      {editingGoal && (
        <GoalModal goal={editingGoal} onClose={() => setEditingGoal(null)} onSaved={refetchGoals} />
      )}
      {deletingGoal && (
        <ConfirmDeleteModal
          title="Eliminar meta"
          message={`¿Seguro que quieres eliminar la meta "${deletingGoal.name}"? Esta acción no se puede deshacer.`}
          onCancel={() => setDeletingGoal(null)}
          onConfirm={() => handleDelete(deletingGoal.id)}
        />
      )}
      {contributingGoal && (
        <GoalContributionModal
          goal={contributingGoal}
          fmt={fmt}
          onClose={() => setContributingGoal(null)}
          onSaved={refetchGoals}
        />
      )}
      {viewingContributionsGoal && (
        <GoalContributionsListModal
          goal={viewingContributionsGoal}
          contributions={contributions.filter((c) => c.goal_id === viewingContributionsGoal.id)}
          fmt={fmt}
          onClose={() => setViewingContributionsGoal(null)}
        />
      )}
    </div>
  );
}
function GoalContributionModal({ goal, fmt, onClose, onSaved }) {
  const [mode, setMode] = useState("agregar"); // "agregar" | "rebajar"
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const delta = amount && !Number.isNaN(Number(amount))
    ? (mode === "agregar" ? Number(amount) : -Number(amount))
    : null;
  const preview = delta !== null ? Number(goal.current_amount) + delta : null;
  async function handleSubmit(e) {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      setErrorMsg("Ingresa un monto mayor a cero.");
      return;
    }
    setSaving(true);
    setErrorMsg("");
    const nuevoActual = Number(goal.current_amount) + delta;
    const { error } = await supabase.from("goals").update({ current_amount: nuevoActual }).eq("id", goal.id);
    setSaving(false);
    if (error) {
      setErrorMsg("Error al guardar: " + error.message);
    } else {
      onSaved();
      onClose();
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Actualizar monto</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>
        <p className="mb-4 text-xs text-slate-400">
          {goal.name} · llevas {fmt(goal.current_amount)} de {fmt(goal.target_amount)}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setMode("agregar")}
              className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-colors ${
                mode === "agregar"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              <Plus size={14} /> Agregar
            </button>
            <button
              type="button"
              onClick={() => setMode("rebajar")}
              className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-colors ${
                mode === "rebajar"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              <Minus size={14} /> Rebajar
            </button>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {mode === "agregar" ? "Monto a agregar" : "Monto a rebajar"}
            </label>
            <input
              type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus
              placeholder="25000"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            <p className="mt-1.5 text-xs text-slate-400">
              {mode === "agregar"
                ? "Se suma a lo que ya tienes ahorrado para esta meta."
                : "Se resta de lo que ya tienes ahorrado (por ejemplo, si retiraste dinero de la meta)."}
              {preview !== null && <> Nuevo monto actual: <span className="font-medium text-slate-600 dark:text-slate-300">{fmt(preview)}</span>.</>}
            </p>
          </div>
          {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}
          <button
            type="submit" disabled={saving}
            className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
          >
            {saving ? "Guardando..." : mode === "agregar" ? "Agregar aporte" : "Rebajar monto"}
          </button>
        </form>
      </div>
    </div>
  );
}
// Solo lectura: muestra los ahorros de la pestaña Ahorros que se vincularon
// a esta meta. Para editarlos o borrarlos, se hace desde Ahorros (ahí vive
// el registro real); esto evita duplicar esa lógica en dos lugares.
function GoalContributionsListModal({ goal, contributions, fmt, onClose }) {
  const total = contributions.reduce((a, c) => a + Number(c.amount), 0);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-8" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Aportes · {goal.name}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>
        <p className="mb-4 text-xs text-slate-400">
          Ahorros de la pestaña Ahorros vinculados a esta meta. Para editar o eliminar alguno, hazlo desde ahí.
        </p>
        <div className="max-h-[55vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
          {contributions.map((c) => {
            const label = SAVINGS_TYPES.find((t) => t.value === c.type)?.label || c.type;
            return (
              <div key={c.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div>
                  <p className="font-medium text-slate-700 dark:text-slate-200">{label}</p>
                  <p className="text-xs text-slate-400">{c.date}</p>
                </div>
                <span className="tabular-nums font-medium text-blue-500">{fmt(c.amount)}</span>
              </div>
            );
          })}
          {contributions.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-slate-400">
              Aún no hay ahorros vinculados a esta meta. Agrega uno desde la pestaña Ahorros y elige esta meta ahí.
            </p>
          )}
        </div>
        {contributions.length > 0 && (
          <p className="mt-3 text-right text-xs text-slate-400">
            Total aportado: <span className="font-medium text-slate-600 dark:text-slate-300">{fmt(total)}</span>
          </p>
        )}
      </div>
    </div>
  );
}
function GoalModal({ goal, onClose, onSaved }) {
  const isEditing = Boolean(goal);
  const [nombre, setNombre] = useState(goal?.name || "");
  const [objetivo, setObjetivo] = useState(goal ? String(goal.target_amount) : "");
  const [actual, setActual] = useState(goal ? String(goal.current_amount) : "0");
  const [color, setColor] = useState(goal?.color || "#3B82F6");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  async function handleSubmit(e) {
    e.preventDefault();
    if (!nombre || !objetivo) {
      setErrorMsg("Completa al menos el nombre y el monto objetivo.");
      return;
    }
    setSaving(true);
    setErrorMsg("");
    if (isEditing) {
      const { error } = await supabase.from("goals").update({
        name: nombre,
        target_amount: Number(objetivo),
        current_amount: Number(actual) || 0,
        color,
      }).eq("id", goal.id);
      setSaving(false);
      if (error) {
        setErrorMsg("Error al guardar: " + error.message);
      } else {
        onSaved();
        onClose();
      }
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    const { error } = await supabase.from("goals").insert({
      name: nombre,
      target_amount: Number(objetivo),
      current_amount: Number(actual) || 0,
      color,
      icon: "target",
      user_id: userId || null,
    });
    setSaving(false);
    if (error) {
      setErrorMsg("Error al guardar: " + error.message);
    } else {
      onSaved();
      onClose();
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{isEditing ? "Editar meta" : "Nueva meta"}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Nombre de la meta</label>
            <input
              value={nombre} onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Viajar a Japón"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Monto objetivo</label>
              <input
                type="number" value={objetivo} onChange={(e) => setObjetivo(e.target.value)}
                placeholder="1000000"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Monto actual</label>
              <input
                type="number" value={actual} onChange={(e) => setActual(e.target.value)}
                placeholder="0"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Color</label>
            <input
              type="color" value={color} onChange={(e) => setColor(e.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-slate-200 dark:border-slate-700"
            />
          </div>
          {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}
          <button
            type="submit" disabled={saving}
            className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
          >
            {saving ? "Guardando..." : isEditing ? "Guardar cambios" : "Crear meta"}
          </button>
        </form>
      </div>
    </div>
  );
}
/* ---------------------------------------------------------------
   INGRESOS
------------------------------------------------------------------ */
function IncomesView({ fmt, onDataChanged, year, month }) {
  const [incomes, setIncomes] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingIncome, setEditingIncome] = useState(null);
  const [deletingIncome, setDeletingIncome] = useState(null);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState(null);
  const [deletingRecurring, setDeletingRecurring] = useState(null);
  // La lista de "Ingresos fijos" es retráctil (empieza cerrada) para no
  // ocupar espacio de entrada — mismo patrón que "Consejos para este mes".
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [search, setSearch] = useState("");
  async function refetchIncomes() {
    const { data } = await supabase.from("incomes").select("*")
      .gte("date", `${year}-01-01`).lte("date", `${year}-12-31`)
      .order("date", { ascending: false });
    setIncomes(data || []);
    if (onDataChanged) onDataChanged();
  }
  async function refetchRecurring() {
    const { data } = await supabase.from("recurring_incomes").select("*").order("start_date", { ascending: false });
    setRecurring(data || []);
    if (onDataChanged) onDataChanged();
  }
  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      const [{ data: inc, error }, { data: rec, error: recError }] = await Promise.all([
        supabase.from("incomes").select("*")
          .gte("date", `${year}-01-01`).lte("date", `${year}-12-31`)
          .order("date", { ascending: false }),
        supabase.from("recurring_incomes").select("*").order("start_date", { ascending: false }),
      ]);
      if (error) console.error("Error cargando ingresos:", error.message);
      if (recError) console.error("Error cargando ingresos fijos:", recError.message);
      setIncomes(inc || []);
      setRecurring(rec || []);
      setLoading(false);
    }
    fetchAll();
  }, [year]);
  async function handleDelete(id) {
    const { error } = await supabase.from("incomes").delete().eq("id", id);
    if (error) throw error;
    setIncomes((prev) => prev.filter((i) => i.id !== id));
    if (onDataChanged) onDataChanged();
    setDeletingIncome(null);
  }
  async function handleDeleteRecurring(id) {
    const { error } = await supabase.from("recurring_incomes").delete().eq("id", id);
    if (error) throw error;
    setRecurring((prev) => prev.filter((r) => r.id !== id));
    if (onDataChanged) onDataChanged();
    setDeletingRecurring(null);
  }
  const monthIncomes = incomes.filter((i) => dateStringMonth(i.date) - 1 === month);
  const total = monthIncomes.reduce((a, i) => a + Number(i.amount), 0);
  const filteredIncomes = monthIncomes.filter((i) =>
    `${i.type || ""} ${i.description || ""}`.toLowerCase().includes(search.toLowerCase())
  );
  if (loading) {
    return <p className="text-sm text-slate-400">Cargando ingresos...</p>;
  }
  return (
    <div className="space-y-4">
      <Card className="p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Eyebrow>Ingresos en {MONTHS_FULL[month]} {year}</Eyebrow>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-600">{fmt(total)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => exportToCSV("ingresos.csv", filteredIncomes.map((i) => ({ Tipo: i.type, Descripcion: i.description || "", Monto: i.amount, Fecha: i.date })))}
            disabled={filteredIncomes.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Download size={15} /> Exportar CSV
          </button>
          <button
            onClick={() => setShowRecurringModal(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Repeat size={15} /> Ingreso fijo
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900"
          >
            <Plus size={15} /> Agregar ingreso
          </button>
        </div>
      </Card>
      {recurring.length > 0 && (
        <Card className="p-5">
          <button
            type="button"
            onClick={() => setRecurringOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <div>
              <Eyebrow>Ingresos fijos</Eyebrow>
              <p className="mt-1 text-xs text-slate-400">
                Salario u otro ingreso fijo. Se cuenta automáticamente cada mes o cada quincena desde su fecha de inicio, sin tener que volver a registrarlo.
              </p>
            </div>
            <ChevronRight size={16} className={`shrink-0 text-slate-400 transition-transform ${recurringOpen ? "rotate-90" : ""}`} />
          </button>
          {recurringOpen && (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {recurring.map((r) => {
                const isQuincenal = r.frequency === "quincenal";
                return (
                  <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 p-4 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10">
                        <Repeat size={16} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-800 dark:text-white">{r.description || r.type || "Ingreso fijo"}</p>
                        <p className="text-xs text-slate-400">
                          {r.type} · {fmt(r.amount)} {isQuincenal ? "c/quincena" : "/mes"} · desde {r.start_date}
                        </p>
                      </div>
                    </div>
                    <RowActions onEdit={() => setEditingRecurring(r)} onDelete={() => setDeletingRecurring(r)} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
          <div className="relative max-w-xs">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por tipo o descripción..."
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {filteredIncomes.map((i) => (
            <div key={i.id} className="flex items-center justify-between px-5 py-3 text-sm">
              <div>
                <p className="font-medium text-slate-700 dark:text-slate-200">{i.description || i.type}</p>
                <p className="text-xs text-slate-400">{i.type} · {i.date}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="tabular-nums font-medium text-emerald-600">{fmt(i.amount)}</span>
                <RowActions onEdit={() => setEditingIncome(i)} onDelete={() => setDeletingIncome(i)} />
              </div>
            </div>
          ))}
          {filteredIncomes.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-slate-400">
              {monthIncomes.length === 0 ? `Aún no has registrado ingresos en ${MONTHS_FULL[month]} ${year}.` : "Sin resultados para tu búsqueda."}
            </p>
          )}
        </div>
      </Card>
      {showModal && (
        <IncomeModal defaultDate={defaultDateForMonth(month, year)} onClose={() => setShowModal(false)} onSaved={refetchIncomes} />
      )}
      {editingIncome && (
        <IncomeModal income={editingIncome} onClose={() => setEditingIncome(null)} onSaved={refetchIncomes} />
      )}
      {deletingIncome && (
        <ConfirmDeleteModal
          title="Eliminar ingreso"
          message={`¿Seguro que quieres eliminar este ingreso de ${fmt(deletingIncome.amount)}? Esta acción no se puede deshacer.`}
          onCancel={() => setDeletingIncome(null)}
          onConfirm={() => handleDelete(deletingIncome.id)}
        />
      )}
      {showRecurringModal && (
        <RecurringIncomeModal onClose={() => setShowRecurringModal(false)} onSaved={refetchRecurring} />
      )}
      {editingRecurring && (
        <RecurringIncomeModal item={editingRecurring} onClose={() => setEditingRecurring(null)} onSaved={refetchRecurring} />
      )}
      {deletingRecurring && (
        <ConfirmDeleteModal
          title="Eliminar ingreso fijo"
          message={`¿Seguro que quieres eliminar "${deletingRecurring.description || deletingRecurring.type || "este ingreso fijo"}"? Ya no se contará en tus ingresos de los próximos meses. Esta acción no se puede deshacer.`}
          onCancel={() => setDeletingRecurring(null)}
          onConfirm={() => handleDeleteRecurring(deletingRecurring.id)}
        />
      )}
    </div>
  );
}
function IncomeModal({ income, onClose, onSaved, defaultDate }) {
  const isEditing = Boolean(income);
  const today = localDateString();
  const [type, setType] = useState(income?.type || "");
  const [description, setDescription] = useState(income?.description || "");
  const [amount, setAmount] = useState(income ? String(income.amount) : "");
  const [date, setDate] = useState(income?.date || defaultDate || today);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  async function handleSubmit(e) {
    e.preventDefault();
    if (!type || !amount || !date) {
      setErrorMsg("Completa al menos el tipo, el monto y la fecha.");
      return;
    }
    setSaving(true);
    setErrorMsg("");
    if (isEditing) {
      const { error } = await supabase.from("incomes").update({
        year: dateStringYear(date),
        month: dateStringMonth(date),
        type,
        description,
        amount: Number(amount),
        date,
      }).eq("id", income.id);
      setSaving(false);
      if (error) {
        setErrorMsg("Error al guardar: " + error.message);
      } else {
        onSaved();
        onClose();
      }
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    const { error } = await supabase.from("incomes").insert({
      user_id: userId || null,
      year: dateStringYear(date),
      month: dateStringMonth(date),
      type,
      description,
      amount: Number(amount),
      date,
    });
    setSaving(false);
    if (error) {
      setErrorMsg("Error al guardar: " + error.message);
    } else {
      onSaved();
      onClose();
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{isEditing ? "Editar ingreso" : "Nuevo ingreso"}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Tipo de ingreso</label>
            <input
              value={type} onChange={(e) => setType(e.target.value)}
              placeholder="Ej. Salario, Freelance, Regalo"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Descripción (opcional)</label>
            <input
              value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej. Pago quincena julio"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Monto</label>
              <input
                type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                placeholder="500000"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Fecha</label>
              <input
                type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>
          {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}
          <button
            type="submit" disabled={saving}
            className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
          >
            {saving ? "Guardando..." : isEditing ? "Guardar cambios" : "Agregar ingreso"}
          </button>
        </form>
      </div>
    </div>
  );
}
function RecurringIncomeModal({ item, onClose, onSaved }) {
  const isEditing = Boolean(item);
  const today = localDateString();
  const [type, setType] = useState(item?.type || "");
  const [description, setDescription] = useState(item?.description || "");
  const [amount, setAmount] = useState(item ? String(item.amount) : "");
  const [startDate, setStartDate] = useState(item?.start_date || today);
  const [frequency, setFrequency] = useState(item?.frequency || "mensual");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const isQuincenal = frequency === "quincenal";

  async function handleSubmit(e) {
    e.preventDefault();
    if (!type || !amount || !startDate) {
      setErrorMsg("Completa el tipo, el monto y la fecha de inicio.");
      return;
    }
    setSaving(true);
    setErrorMsg("");
    const payload = { type, description, amount: Number(amount), start_date: startDate, frequency };
    if (isEditing) {
      const { error } = await supabase.from("recurring_incomes").update(payload).eq("id", item.id);
      setSaving(false);
      if (error) {
        setErrorMsg("Error al guardar: " + error.message);
      } else {
        onSaved();
        onClose();
      }
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    const { error } = await supabase.from("recurring_incomes").insert({
      user_id: userId || null,
      ...payload,
    });
    setSaving(false);
    if (error) {
      setErrorMsg("Error al guardar: " + error.message);
    } else {
      onSaved();
      onClose();
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{isEditing ? "Editar ingreso fijo" : "Nuevo ingreso fijo"}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>
        <p className="mb-4 text-xs text-slate-400">
          Para un salario u otro ingreso que se repite por tiempo indefinido. Se cuenta automáticamente cada mes o cada quincena desde la fecha de inicio, hasta que lo elimines.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Tipo de ingreso</label>
            <input
              value={type} onChange={(e) => setType(e.target.value)}
              placeholder="Ej. Salario"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Descripción (opcional)</label>
            <input
              value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej. Salario quincenal empresa X"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Frecuencia</label>
            <select
              value={frequency} onChange={(e) => setFrequency(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="mensual">Mensual</option>
              <option value="quincenal">Quincenal (días 15 y 30)</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{isQuincenal ? "Monto por quincena" : "Monto mensual"}</label>
              <input
                type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                placeholder="500000"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{isQuincenal ? "A partir de" : "Empieza el"}</label>
              <input
                type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>
          {isQuincenal && (
            <p className="text-xs text-slate-400">
              Siempre se va a contar los días 15 y 30 de cada mes (el último día del mes en los meses más cortos, como febrero), empezando en la primera de esas fechas que sea igual o posterior a la que pongas aquí.
            </p>
          )}
          {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}
          <button
            type="submit" disabled={saving}
            className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
          >
            {saving ? "Guardando..." : isEditing ? "Guardar cambios" : "Crear ingreso fijo"}
          </button>
        </form>
      </div>
    </div>
  );
}
/* ---------------------------------------------------------------
   GASTOS
------------------------------------------------------------------ */
function ExpensesView({ fmt, onDataChanged, year, month }) {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [plans, setPlans] = useState([]);
  const [paymentOverrides, setPaymentOverrides] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [deletingExpense, setDeletingExpense] = useState(null);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [deletingPlan, setDeletingPlan] = useState(null);
  const [viewingPlanPayments, setViewingPlanPayments] = useState(null);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState(null);
  const [deletingRecurring, setDeletingRecurring] = useState(null);
  // "Gastos fijos", "Planes de pago activos" y "Planes pagados" se unieron
  // en una sola sección colapsable ("Fijo y programado", empieza cerrada)
  // para no llenar la pantalla de tarjetas antes de llegar a la lista real
  // de gastos del mes — antes eran 3 tarjetas separadas (2 de ellas sin
  // poder cerrarse) y esa fue la queja concreta que motivó este cambio.
  const [programmedOpen, setProgrammedOpen] = useState(false);
  const [cards, setCards] = useState([]);
  const [showCardsManager, setShowCardsManager] = useState(false);
  // "Tarjetas" y "Plan de pago" son los botones que menos se usan día a día,
  // así que quedan escondidos detrás de "Más opciones" (empieza cerrado) —
  // deja la fila de botones de Gastos menos cargada por defecto.
  const [moreOpen, setMoreOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("Todas");
  async function refetchExpenses() {
    const { data } = await supabase
      .from("expenses")
      .select("*, categories(name, color, icon), credit_cards(name)")
      .gte("date", `${year}-01-01`).lte("date", `${year}-12-31`)
      .order("date", { ascending: false });
    setExpenses(data || []);
    if (onDataChanged) onDataChanged();
  }
  async function refetchCards() {
    const { data } = await supabase.from("credit_cards").select("*").order("name", { ascending: true });
    setCards(data || []);
  }
  async function refetchPlans() {
    const { data } = await supabase
      .from("installment_plans")
      .select("*, categories(name, color, icon), credit_cards(name, cutoff_day, payment_day)")
      .order("start_date", { ascending: false });
    setPlans(data || []);
    if (onDataChanged) onDataChanged();
  }
  async function refetchOverrides() {
    const { data } = await supabase.from("installment_payment_status").select("*");
    setPaymentOverrides(data || []);
  }
  async function refetchRecurring() {
    const { data } = await supabase
      .from("recurring_expenses")
      .select("*, categories(name, color, icon)")
      .order("start_date", { ascending: false });
    setRecurring(data || []);
    if (onDataChanged) onDataChanged();
  }
  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      const [
        { data: exp, error: expError },
        { data: cats, error: catError },
        { data: pls, error: planError },
        { data: overrides, error: overrideError },
        { data: rec, error: recError },
        { data: crds, error: cardError },
      ] = await Promise.all([
        supabase.from("expenses").select("*, categories(name, color, icon), credit_cards(name)")
          .gte("date", `${year}-01-01`).lte("date", `${year}-12-31`)
          .order("date", { ascending: false }),
        supabase.from("categories").select("*"),
        supabase.from("installment_plans").select("*, categories(name, color, icon), credit_cards(name, cutoff_day, payment_day)").order("start_date", { ascending: false }),
        supabase.from("installment_payment_status").select("*"),
        supabase.from("recurring_expenses").select("*, categories(name, color, icon)").order("start_date", { ascending: false }),
        supabase.from("credit_cards").select("*").order("name", { ascending: true }),
      ]);
      if (expError) console.error("Error cargando gastos:", expError.message);
      if (catError) console.error("Error cargando categorías:", catError.message);
      if (planError) console.error("Error cargando planes de pago:", planError.message);
      if (overrideError) console.error("Error cargando estado de cuotas:", overrideError.message);
      if (recError) console.error("Error cargando gastos fijos:", recError.message);
      if (cardError) console.error("Error cargando tarjetas:", cardError.message);
      setExpenses(exp || []);
      setCategories(sortCategories(cats || []));
      setPlans(pls || []);
      setPaymentOverrides(overrides || []);
      setRecurring(rec || []);
      setCards(crds || []);
      setLoading(false);
    }
    fetchAll();
  }, [year]);
  async function handleDelete(id) {
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) throw error;
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    if (onDataChanged) onDataChanged();
    setDeletingExpense(null);
  }
  async function handleDeletePlan(id) {
    const { error } = await supabase.from("installment_plans").delete().eq("id", id);
    if (error) throw error;
    setPlans((prev) => prev.filter((p) => p.id !== id));
    if (onDataChanged) onDataChanged();
    setDeletingPlan(null);
  }
  async function handleDeleteRecurring(id) {
    const { error } = await supabase.from("recurring_expenses").delete().eq("id", id);
    if (error) throw error;
    setRecurring((prev) => prev.filter((r) => r.id !== id));
    if (onDataChanged) onDataChanged();
    setDeletingRecurring(null);
  }
  async function handleDeleteCard(id) {
    const { error } = await supabase.from("credit_cards").delete().eq("id", id);
    if (error) throw error;
    setCards((prev) => prev.filter((c) => c.id !== id));
    refetchExpenses();
  }
  const monthExpenses = expenses.filter((e) => dateStringMonth(e.date) - 1 === month);
  const total = monthExpenses.reduce((a, e) => a + Number(e.amount), 0);
  const categoriasDisponibles = [...new Set(monthExpenses.map((e) => e.categories?.name).filter(Boolean))];
  const filteredExpenses = monthExpenses.filter((e) =>
    (catFilter === "Todas" || e.categories?.name === catFilter) &&
    `${e.description || ""} ${e.categories?.name || ""}`.toLowerCase().includes(search.toLowerCase())
  );
  // Un plan pasa a "Planes pagados" cuando, para el mes que se está viendo
  // arriba, ya no le queda ninguna cuota pendiente (elapsed >= total_months).
  // Como esto se calcula contra el mes elegido (no la fecha real de hoy), un
  // plan puede ir y venir entre las dos listas según el mes que se navegue —
  // eso es intencional, para que se vea "como estaba" en cualquier momento.
  const activePlans = plans.filter((p) => planElapsedMonths(p, year, month) < (Number(p.total_months) || 0));
  const finishedPlans = plans.filter((p) => planElapsedMonths(p, year, month) >= (Number(p.total_months) || 0));
  function renderPlanCard(p) {
    const color = p.categories?.color || "#64748B";
    const total = Number(p.total_months) || 0;
    const cuota = planCurrentCuota(p, year, month);
    const elapsed = planElapsedMonths(p, year, month);
    const pct = total > 0 ? Math.min(100, Math.round((elapsed / total) * 100)) : 0;
    const finished = elapsed >= total;
    const unpaid = planUnpaidCount(paymentOverrides, p.id);
    const saldoPendiente = planSaldoPendiente(p, paymentOverrides, year, month);
    return (
      <div key={p.id} className="rounded-xl border border-slate-100 p-4 dark:border-slate-800">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold"
              style={{ backgroundColor: `${color}1a`, color }}
            >
              <CreditCard size={16} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-white">{p.description || p.categories?.name || "Plan de pago"}</p>
              <p className="text-xs text-slate-400">
                {p.categories?.name} · {fmt(p.monthly_amount)}/mes
                {p.credit_cards?.name && ` · ${p.credit_cards.name}`}
              </p>
            </div>
          </div>
          <RowActions onEdit={() => setEditingPlan(p)} onDelete={() => setDeletingPlan(p)} />
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${finished ? "bg-emerald-500" : "bg-blue-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {finished ? `Plan finalizado · ${total} de ${total} cuotas` : `Cuota ${cuota} de ${total}`}
          </p>
          {unpaid > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500">
              <AlertTriangle size={11} /> {unpaid} sin pagar
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-400">Saldo pendiente: <span className="font-medium text-slate-600 dark:text-slate-300">{fmt(saldoPendiente)}</span></p>
        <button
          onClick={() => setViewingPlanPayments(p)}
          className="mt-3 w-full rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Ver cuotas
        </button>
      </div>
    );
  }
  if (loading) {
    return <p className="text-sm text-slate-400">Cargando gastos...</p>;
  }
  return (
    <div className="space-y-4">
      <Card className="p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Eyebrow>Gastos en {MONTHS_FULL[month]} {year}</Eyebrow>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-red-500">{fmt(total)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => exportToCSV("gastos.csv", filteredExpenses.map((e) => ({ Categoria: e.categories?.name || "", Descripcion: e.description || "", Monto: e.amount, Fecha: e.date, FechaCompra: e.purchase_date || "", Tarjeta: e.credit_cards?.name || "" })))}
            disabled={filteredExpenses.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Download size={15} /> Exportar CSV
          </button>
          <button
            onClick={() => setShowRecurringModal(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Repeat size={15} /> Gasto fijo
          </button>
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <MoreHorizontal size={15} /> Más opciones
          </button>
          {moreOpen && (
            <>
              <button
                onClick={() => setShowCardsManager(true)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Landmark size={15} /> Tarjetas
              </button>
              <button
                onClick={() => setShowPlanModal(true)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <CreditCard size={15} /> Plan de pago
              </button>
            </>
          )}
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900"
          >
            <Plus size={15} /> Agregar gasto
          </button>
        </div>
      </Card>
      {(recurring.length > 0 || activePlans.length > 0 || finishedPlans.length > 0) && (
        <Card className="p-5">
          <button
            type="button"
            onClick={() => setProgrammedOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <div>
              <Eyebrow>Fijo y programado</Eyebrow>
              <p className="mt-1 text-xs text-slate-400">
                Gastos fijos y planes de pago: lo que ya sabes que viene, sin tener que revisarlo cada mes.
              </p>
              <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                {[
                  recurring.length > 0 && `${recurring.length} gasto${recurring.length === 1 ? "" : "s"} fijo${recurring.length === 1 ? "" : "s"}`,
                  activePlans.length > 0 && `${activePlans.length} plan${activePlans.length === 1 ? "" : "es"} activo${activePlans.length === 1 ? "" : "s"}`,
                  finishedPlans.length > 0 && `${finishedPlans.length} plan${finishedPlans.length === 1 ? "" : "es"} pagado${finishedPlans.length === 1 ? "" : "s"}`,
                ].filter(Boolean).join(" · ")}
              </p>
            </div>
            <ChevronRight size={16} className={`shrink-0 text-slate-400 transition-transform ${programmedOpen ? "rotate-90" : ""}`} />
          </button>
          {programmedOpen && (
            <div className="mt-4 space-y-6">
              {recurring.length > 0 && (
                <div>
                  <Eyebrow>Gastos fijos</Eyebrow>
                  <p className="mt-1 text-xs text-slate-400">
                    Alquiler, suscripciones, gimnasio y similares. Se cuentan automáticamente cada mes o cada quincena desde su fecha de inicio, sin tener que volver a registrarlos.
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {recurring.map((r) => {
                      const color = r.categories?.color || "#64748B";
                      const isQuincenal = r.frequency === "quincenal";
                      return (
                        <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 p-4 dark:border-slate-800">
                          <div className="flex items-center gap-3">
                            <div
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold"
                              style={{ backgroundColor: `${color}1a`, color }}
                            >
                              <Repeat size={16} />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-800 dark:text-white">{r.description || r.categories?.name || "Gasto fijo"}</p>
                              <p className="text-xs text-slate-400">
                                {r.categories?.name} · {fmt(r.amount)} {isQuincenal ? "c/quincena" : "/mes"} · desde {r.start_date}
                              </p>
                            </div>
                          </div>
                          <RowActions onEdit={() => setEditingRecurring(r)} onDelete={() => setDeletingRecurring(r)} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {activePlans.length > 0 && (
                <div>
                  <Eyebrow>Planes de pago activos</Eyebrow>
                  <p className="mt-1 text-xs text-slate-400">
                    Préstamos y compras a plazos. La cuota del mes que estás viendo arriba se suma automáticamente a tus gastos, sin llenar esta lista de filas repetidas.
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {activePlans.map(renderPlanCard)}
                  </div>
                </div>
              )}
              {finishedPlans.length > 0 && (
                <div>
                  <Eyebrow>Planes pagados</Eyebrow>
                  <p className="mt-1 text-xs text-slate-400">
                    Ya no les queda ninguna cuota pendiente en {MONTHS_FULL[month]} {year}. Puedes eliminarlos de tu lista cuando quieras.
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {finishedPlans.map(renderPlanCard)}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      )}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
          <div className="relative min-w-[160px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por descripción o categoría..."
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <select
            value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option>Todas</option>
            {categoriasDisponibles.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {filteredExpenses.map((e) => (
            <div key={e.id} className="flex items-center justify-between px-5 py-3 text-sm">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold"
                  style={{ backgroundColor: `${e.categories?.color || "#64748B"}1a`, color: e.categories?.color || "#64748B" }}
                >
                  {(e.categories?.name || "?").charAt(0)}
                </div>
                <div>
                  <p className="font-medium text-slate-700 dark:text-slate-200">{e.description || e.categories?.name}</p>
                  <p className="text-xs text-slate-400">
                    {e.categories?.name} · {e.purchase_date || e.date}
                    {e.purchase_date && e.purchase_date !== e.date && ` · pago: ${e.date}`}
                    {e.credit_cards?.name && ` · ${e.credit_cards.name}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="tabular-nums font-medium text-red-500">{fmt(e.amount)}</span>
                <RowActions onEdit={() => setEditingExpense(e)} onDelete={() => setDeletingExpense(e)} />
              </div>
            </div>
          ))}
          {filteredExpenses.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-slate-400">
              {monthExpenses.length === 0 ? `Aún no has registrado gastos en ${MONTHS_FULL[month]} ${year}.` : "Sin resultados para tu búsqueda."}
            </p>
          )}
        </div>
      </Card>
      {showModal && (
        <ExpenseModal categories={categories} cards={cards} defaultDate={defaultDateForMonth(month, year)} onClose={() => setShowModal(false)} onSaved={refetchExpenses} />
      )}
      {editingExpense && (
        <ExpenseModal
          categories={categories}
          cards={cards}
          expense={editingExpense}
          onClose={() => setEditingExpense(null)}
          onSaved={refetchExpenses}
        />
      )}
      {deletingExpense && (
        <ConfirmDeleteModal
          title="Eliminar gasto"
          message={`¿Seguro que quieres eliminar el gasto "${deletingExpense.description || deletingExpense.categories?.name || "sin descripción"}" de ${fmt(deletingExpense.amount)}? Esta acción no se puede deshacer.`}
          onCancel={() => setDeletingExpense(null)}
          onConfirm={() => handleDelete(deletingExpense.id)}
        />
      )}
      {showPlanModal && (
        <PlanModal categories={categories} cards={cards} onClose={() => setShowPlanModal(false)} onSaved={refetchPlans} />
      )}
      {editingPlan && (
        <PlanModal
          categories={categories}
          cards={cards}
          plan={editingPlan}
          onClose={() => setEditingPlan(null)}
          onSaved={refetchPlans}
        />
      )}
      {deletingPlan && (
        <ConfirmDeleteModal
          title="Eliminar plan de pago"
          message={`¿Seguro que quieres eliminar el plan "${deletingPlan.description || deletingPlan.categories?.name || "sin descripción"}"? Las cuotas ya no se contarán en tus gastos futuros. Esta acción no se puede deshacer.`}
          onCancel={() => setDeletingPlan(null)}
          onConfirm={() => handleDeletePlan(deletingPlan.id)}
        />
      )}
      {viewingPlanPayments && (
        <PlanPaymentsModal
          plan={viewingPlanPayments}
          overrides={paymentOverrides}
          fmt={fmt}
          onClose={() => setViewingPlanPayments(null)}
          onChanged={refetchOverrides}
        />
      )}
      {showRecurringModal && (
        <RecurringExpenseModal categories={categories} onClose={() => setShowRecurringModal(false)} onSaved={refetchRecurring} />
      )}
      {editingRecurring && (
        <RecurringExpenseModal
          categories={categories}
          item={editingRecurring}
          onClose={() => setEditingRecurring(null)}
          onSaved={refetchRecurring}
        />
      )}
      {deletingRecurring && (
        <ConfirmDeleteModal
          title="Eliminar gasto fijo"
          message={`¿Seguro que quieres eliminar "${deletingRecurring.description || deletingRecurring.categories?.name || "este gasto fijo"}"? Ya no se contará en tus gastos de los próximos meses. Esta acción no se puede deshacer.`}
          onCancel={() => setDeletingRecurring(null)}
          onConfirm={() => handleDeleteRecurring(deletingRecurring.id)}
        />
      )}
      {showCardsManager && (
        <CreditCardsManagerModal
          cards={cards}
          onClose={() => setShowCardsManager(false)}
          onChanged={refetchCards}
          onDeleteCard={handleDeleteCard}
        />
      )}
    </div>
  );
}
function ExpenseModal({ categories, cards, expense, onClose, onSaved, defaultDate }) {
  const cardsList = cards || [];
  const isEditing = Boolean(expense);
  const today = localDateString();
  const [categoryId, setCategoryId] = useState(expense?.category_id || categories[0]?.id || "");
  const [description, setDescription] = useState(expense?.description || "");
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [date, setDate] = useState(expense?.purchase_date || expense?.date || defaultDate || today);
  const [cardId, setCardId] = useState(expense?.card_id || "");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const selectedCard = cardsList.find((c) => c.id === cardId) || null;
  const computedPaymentDate = selectedCard && date
    ? computeCardPaymentDate(date, Number(selectedCard.cutoff_day), Number(selectedCard.payment_day))
    : null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!categoryId || !amount || !date) {
      setErrorMsg("Completa al menos la categoría, el monto y la fecha.");
      return;
    }
    setSaving(true);
    setErrorMsg("");
    const payload = selectedCard
      ? {
          category_id: categoryId,
          description,
          amount: Number(amount),
          date: computedPaymentDate,
          purchase_date: date,
          card_id: selectedCard.id,
          is_recurring: false,
        }
      : {
          category_id: categoryId,
          description,
          amount: Number(amount),
          date,
          purchase_date: null,
          card_id: null,
          is_recurring: false,
        };
    if (isEditing) {
      const { error } = await supabase.from("expenses").update(payload).eq("id", expense.id);
      setSaving(false);
      if (error) {
        setErrorMsg("Error al guardar: " + error.message);
      } else {
        onSaved();
        onClose();
      }
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    const { error } = await supabase.from("expenses").insert({
      user_id: userId || null,
      ...payload,
    });
    setSaving(false);
    if (error) {
      setErrorMsg("Error al guardar: " + error.message);
    } else {
      onSaved();
      onClose();
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{isEditing ? "Editar gasto" : "Nuevo gasto"}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Categoría</label>
            <select
              value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Descripción (opcional)</label>
            <input
              value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej. Supermercado semana"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Monto</label>
              <input
                type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                placeholder="25000"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{selectedCard ? "Fecha de la compra" : "Fecha"}</label>
              <input
                type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>
          {cardsList.length > 0 && (
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Método de pago</label>
              <select
                value={cardId} onChange={(e) => setCardId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">Efectivo / débito</option>
                {cardsList.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {selectedCard && computedPaymentDate && (
                <p className="mt-1.5 text-xs text-slate-400">
                  Corte el día {selectedCard.cutoff_day} y pago el día {selectedCard.payment_day}: este gasto se contará en tu balance con fecha de pago <span className="font-medium text-slate-600 dark:text-slate-300">{computedPaymentDate}</span>.
                </p>
              )}
            </div>
          )}
          <p className="text-xs text-slate-400">
            ¿Es un gasto fijo que se repite todos los meses (alquiler, suscripción, gimnasio)? Usa el botón "Gasto fijo" en vez de este formulario, así no tienes que volver a registrarlo cada mes.
          </p>
          {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}
          <button
            type="submit" disabled={saving}
            className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
          >
            {saving ? "Guardando..." : isEditing ? "Guardar cambios" : "Agregar gasto"}
          </button>
        </form>
      </div>
    </div>
  );
}
function CreditCardsManagerModal({ cards, onClose, onChanged, onDeleteCard }) {
  const [showCardModal, setShowCardModal] = useState(false);
  const [editingCard, setEditingCard] = useState(null);
  const [deletingCard, setDeletingCard] = useState(null);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Tarjetas de crédito</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>
        <p className="mb-4 text-xs text-slate-400">
          Registra el día de corte y el día de pago de cada tarjeta. Al agregar un gasto con esa tarjeta, la app calcula sola en qué mes realmente vas a pagarlo, en vez de contarlo en el mes de la compra.
        </p>
        <div className="space-y-2">
          {cards.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400 dark:border-slate-700">
              Aún no has registrado tarjetas.
            </p>
          )}
          {cards.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 p-3 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                  <Landmark size={16} />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-white">{c.name}</p>
                  <p className="text-xs text-slate-400">Corte día {c.cutoff_day} · Pago día {c.payment_day}</p>
                </div>
              </div>
              <RowActions onEdit={() => setEditingCard(c)} onDelete={() => setDeletingCard(c)} />
            </div>
          ))}
        </div>
        <button
          onClick={() => setShowCardModal(true)}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Plus size={15} /> Agregar tarjeta
        </button>
      </div>
      {showCardModal && (
        <CreditCardModal onClose={() => setShowCardModal(false)} onSaved={onChanged} />
      )}
      {editingCard && (
        <CreditCardModal card={editingCard} onClose={() => setEditingCard(null)} onSaved={onChanged} />
      )}
      {deletingCard && (
        <ConfirmDeleteModal
          title="Eliminar tarjeta"
          message={`¿Seguro que quieres eliminar la tarjeta "${deletingCard.name}"? Los gastos ya registrados con esta tarjeta no se borran, pero dejarán de mostrar su nombre. Esta acción no se puede deshacer.`}
          onCancel={() => setDeletingCard(null)}
          onConfirm={async () => { await onDeleteCard(deletingCard.id); setDeletingCard(null); }}
        />
      )}
    </div>
  );
}
function CreditCardModal({ card, onClose, onSaved }) {
  const isEditing = Boolean(card);
  const [name, setName] = useState(card?.name || "");
  const [cutoffDay, setCutoffDay] = useState(card ? String(card.cutoff_day) : "");
  const [paymentDay, setPaymentDay] = useState(card ? String(card.payment_day) : "");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    const cutoff = Number(cutoffDay);
    const payment = Number(paymentDay);
    if (!name || !cutoffDay || !paymentDay || cutoff < 1 || cutoff > 31 || payment < 1 || payment > 31) {
      setErrorMsg("Completa el nombre y días válidos (entre 1 y 31).");
      return;
    }
    setSaving(true);
    setErrorMsg("");
    if (isEditing) {
      const { error } = await supabase.from("credit_cards").update({
        name, cutoff_day: cutoff, payment_day: payment,
      }).eq("id", card.id);
      setSaving(false);
      if (error) {
        setErrorMsg("Error al guardar: " + error.message);
      } else {
        onSaved();
        onClose();
      }
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    const { error } = await supabase.from("credit_cards").insert({
      user_id: userId || null, name, cutoff_day: cutoff, payment_day: payment,
    });
    setSaving(false);
    if (error) {
      setErrorMsg("Error al guardar: " + error.message);
    } else {
      onSaved();
      onClose();
    }
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{isEditing ? "Editar tarjeta" : "Nueva tarjeta"}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Nombre de la tarjeta</label>
            <input
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Ej. BAC Visa"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Día de corte</label>
              <input
                type="number" min="1" max="31" value={cutoffDay} onChange={(e) => setCutoffDay(e.target.value)}
                placeholder="3"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Día de pago</label>
              <input
                type="number" min="1" max="31" value={paymentDay} onChange={(e) => setPaymentDay(e.target.value)}
                placeholder="18"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>
          {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}
          <button
            type="submit" disabled={saving}
            className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
          >
            {saving ? "Guardando..." : isEditing ? "Guardar cambios" : "Agregar tarjeta"}
          </button>
        </form>
      </div>
    </div>
  );
}
function PlanModal({ categories, cards, plan, onClose, onSaved }) {
  const cardsList = cards || [];
  const isEditing = Boolean(plan);
  const today = localDateString();
  const [categoryId, setCategoryId] = useState(plan?.category_id || categories[0]?.id || "");
  const [description, setDescription] = useState(plan?.description || "");
  const [monthlyAmount, setMonthlyAmount] = useState(plan ? String(plan.monthly_amount) : "");
  const [startDate, setStartDate] = useState(plan?.start_date || today);
  const [totalMonths, setTotalMonths] = useState(plan ? String(plan.total_months) : "12");
  const [cardId, setCardId] = useState(plan?.card_id || "");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const selectedCard = cardsList.find((c) => c.id === cardId) || null;
  const anchorDate = selectedCard && startDate
    ? computeCardPaymentDate(startDate, Number(selectedCard.cutoff_day), Number(selectedCard.payment_day))
    : null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!categoryId || !monthlyAmount || !startDate || !totalMonths || Number(totalMonths) < 1) {
      setErrorMsg("Completa la categoría, el monto de la cuota, la fecha de inicio y a cuántos meses es.");
      return;
    }
    setSaving(true);
    setErrorMsg("");
    const payload = {
      category_id: categoryId,
      description,
      monthly_amount: Number(monthlyAmount),
      start_date: startDate,
      total_months: Number(totalMonths),
      card_id: selectedCard ? selectedCard.id : null,
    };
    if (isEditing) {
      const { error } = await supabase.from("installment_plans").update(payload).eq("id", plan.id);
      setSaving(false);
      if (error) {
        setErrorMsg("Error al guardar: " + error.message);
      } else {
        onSaved();
        onClose();
      }
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    const { error } = await supabase.from("installment_plans").insert({
      user_id: userId || null,
      ...payload,
    });
    setSaving(false);
    if (error) {
      setErrorMsg("Error al guardar: " + error.message);
    } else {
      onSaved();
      onClose();
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{isEditing ? "Editar plan de pago" : "Nuevo plan de pago"}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>
        <p className="mb-4 text-xs text-slate-400">
          Para préstamos o compras a plazos. Se guarda como un solo plan; la cuota del mes correspondiente se suma automáticamente a tus gastos cada mes, sin crear una fila por cuota.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Categoría</label>
            <select
              value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Descripción</label>
            <input
              value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej. Préstamo Conape"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          {cardsList.length > 0 && (
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Tarjeta asociada</label>
              <select
                value={cardId} onChange={(e) => setCardId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">Ninguna / pago directo</option>
                {cardsList.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-slate-400">
                Elige una tarjeta si esto es una compra a plazos que se cobra en el estado de cuenta (como Conape, elige "Ninguna").
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Monto de la cuota mensual</label>
              <input
                type="number" value={monthlyAmount} onChange={(e) => setMonthlyAmount(e.target.value)}
                placeholder="25000"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{selectedCard ? "Fecha de la compra" : "Fecha de la 1ª cuota"}</label>
              <input
                type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">¿A cuántos meses (cuotas)?</label>
            <input
              type="number" min="1" value={totalMonths} onChange={(e) => setTotalMonths(e.target.value)}
              placeholder="72"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            {monthlyAmount && totalMonths && Number(totalMonths) > 0 && !selectedCard && (
              <p className="mt-1.5 text-xs text-slate-400">
                Se cobrará {Number(monthlyAmount).toLocaleString("es-CR")} cada mes durante {totalMonths} meses, empezando el {startDate}.
              </p>
            )}
            {monthlyAmount && totalMonths && Number(totalMonths) > 0 && selectedCard && anchorDate && (
              <p className="mt-1.5 text-xs text-slate-400">
                Corte el día {selectedCard.cutoff_day} y pago el día {selectedCard.payment_day}: la 1ª cuota se contará con fecha de pago <span className="font-medium text-slate-600 dark:text-slate-300">{anchorDate}</span>, y las siguientes {Number(totalMonths) - 1} cuotas seguirán ese mismo día cada mes.
              </p>
            )}
          </div>
          {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}
          <button
            type="submit" disabled={saving}
            className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
          >
            {saving ? "Guardando..." : isEditing ? "Guardar cambios" : "Crear plan de pago"}
          </button>
        </form>
      </div>
    </div>
  );
}
function RecurringExpenseModal({ categories, item, onClose, onSaved }) {
  const isEditing = Boolean(item);
  const today = localDateString();
  const [categoryId, setCategoryId] = useState(item?.category_id || categories[0]?.id || "");
  const [description, setDescription] = useState(item?.description || "");
  const [amount, setAmount] = useState(item ? String(item.amount) : "");
  const [startDate, setStartDate] = useState(item?.start_date || today);
  const [frequency, setFrequency] = useState(item?.frequency || "mensual");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const isQuincenal = frequency === "quincenal";

  async function handleSubmit(e) {
    e.preventDefault();
    if (!categoryId || !amount || !startDate) {
      setErrorMsg("Completa la categoría, el monto y la fecha de inicio.");
      return;
    }
    setSaving(true);
    setErrorMsg("");
    const payload = {
      category_id: categoryId,
      description,
      amount: Number(amount),
      start_date: startDate,
      frequency,
    };
    if (isEditing) {
      const { error } = await supabase.from("recurring_expenses").update(payload).eq("id", item.id);
      setSaving(false);
      if (error) {
        setErrorMsg("Error al guardar: " + error.message);
      } else {
        onSaved();
        onClose();
      }
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    const { error } = await supabase.from("recurring_expenses").insert({
      user_id: userId || null,
      ...payload,
    });
    setSaving(false);
    if (error) {
      setErrorMsg("Error al guardar: " + error.message);
    } else {
      onSaved();
      onClose();
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{isEditing ? "Editar gasto fijo" : "Nuevo gasto fijo"}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>
        <p className="mb-4 text-xs text-slate-400">
          Para alquiler, suscripciones, gimnasio y otros pagos que se repiten por tiempo indefinido. Se cuenta automáticamente cada mes o cada quincena desde la fecha de inicio, hasta que lo elimines.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Categoría</label>
            <select
              value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Descripción</label>
            <input
              value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej. Alquiler apartamento"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Frecuencia</label>
            <select
              value={frequency} onChange={(e) => setFrequency(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="mensual">Mensual</option>
              <option value="quincenal">Quincenal (días 15 y 30)</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{isQuincenal ? "Monto por quincena" : "Monto mensual"}</label>
              <input
                type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                placeholder="150000"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{isQuincenal ? "A partir de" : "Empieza el"}</label>
              <input
                type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>
          {isQuincenal && (
            <p className="text-xs text-slate-400">
              Siempre se va a contar los días 15 y 30 de cada mes (el último día del mes en los meses más cortos, como febrero), empezando en la primera de esas fechas que sea igual o posterior a la que pongas aquí.
            </p>
          )}
          {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}
          <button
            type="submit" disabled={saving}
            className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
          >
            {saving ? "Guardando..." : isEditing ? "Guardar cambios" : "Crear gasto fijo"}
          </button>
        </form>
      </div>
    </div>
  );
}
// Checklist de cuotas de un plan: el cálculo automático por fecha (cuota
// actual, progreso, gastos mensuales) no cambia. Esto solo permite marcar
// manualmente si una cuota puntual se pagó tarde o no se pagó, para que el
// saldo pendiente refleje la realidad y no solo la fecha.
function PlanPaymentsModal({ plan, overrides, fmt, onClose, onChanged }) {
  const [updatingCuota, setUpdatingCuota] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const total = Number(plan.total_months) || 0;
  const cuotasAVencer = planCurrentCuota(plan); // 1..cuotasAVencer ya deberían estar pagándose
  const cuotas = Array.from({ length: cuotasAVencer }, (_, i) => i + 1).reverse();

  async function handleSetStatus(cuotaNumber, status) {
    setUpdatingCuota(cuotaNumber);
    setErrorMsg("");
    try {
      if (status === "pagada") {
        const { error } = await supabase
          .from("installment_payment_status")
          .delete()
          .eq("plan_id", plan.id)
          .eq("cuota_number", cuotaNumber);
        if (error) throw error;
      } else {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id;
        const { error } = await supabase
          .from("installment_payment_status")
          .upsert(
            { user_id: userId || null, plan_id: plan.id, cuota_number: cuotaNumber, status },
            { onConflict: "plan_id,cuota_number" }
          );
        if (error) throw error;
      }
      onChanged();
    } catch (err) {
      setErrorMsg("Error al actualizar: " + (err?.message || "intenta de nuevo."));
    }
    setUpdatingCuota(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-8" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Cuotas · {plan.description || plan.categories?.name || "Plan de pago"}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>
        <p className="mb-4 text-xs text-slate-400">
          El número de cuota y el progreso se siguen calculando solos por fecha. Marca aquí una cuota si se pagó tarde o si no se pagó.
        </p>
        {errorMsg && <p className="mb-3 text-xs text-red-500">{errorMsg}</p>}
        <div className="max-h-[55vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
          {cuotas.map((cuotaNumber) => {
            const cuotaDate = addMonthsToDateString(planAnchorDate(plan), cuotaNumber - 1);
            const status = cuotaStatus(overrides, plan.id, cuotaNumber);
            return (
              <div key={cuotaNumber} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div>
                  <p className="font-medium text-slate-700 dark:text-slate-200">Cuota {cuotaNumber} de {total}</p>
                  <p className="text-xs text-slate-400">{cuotaDate} · {fmt(plan.monthly_amount)}</p>
                </div>
                <select
                  value={status}
                  disabled={updatingCuota === cuotaNumber}
                  onChange={(e) => handleSetStatus(cuotaNumber, e.target.value)}
                  className={`rounded-lg border px-2 py-1.5 text-xs outline-none disabled:opacity-50 dark:bg-slate-800 dark:text-white ${
                    status === "pagada"
                      ? "border-emerald-200 text-emerald-600 dark:border-emerald-800"
                      : status === "atrasada"
                      ? "border-amber-200 text-amber-600 dark:border-amber-800"
                      : "border-red-200 text-red-500 dark:border-red-800"
                  }`}
                >
                  <option value="pagada">{CUOTA_STATUS_LABEL.pagada}</option>
                  <option value="atrasada">{CUOTA_STATUS_LABEL.atrasada}</option>
                  <option value="no_pagada">{CUOTA_STATUS_LABEL.no_pagada}</option>
                </select>
              </div>
            );
          })}
          {cuotas.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-400">Todavía no hay cuotas que deberían haberse pagado.</p>
          )}
        </div>
      </div>
    </div>
  );
}
/* ---------------------------------------------------------------
   AHORROS
------------------------------------------------------------------ */
const SAVINGS_TYPES = [
  { value: "emergencia", label: "Fondo de emergencia" },
  { value: "inversiones", label: "Inversiones" },
  { value: "libre", label: "Ahorro libre" },
];
function SavingsView({ fmt, onDataChanged, year, month }) {
  const [savings, setSavings] = useState([]);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSaving, setEditingSaving] = useState(null);
  const [deletingSaving, setDeletingSaving] = useState(null);
  const [typeFilter, setTypeFilter] = useState("Todos");
  const [viewingTypeReport, setViewingTypeReport] = useState(null);
  async function refetchSavings() {
    const { data } = await supabase
      .from("savings")
      .select("*, goals(name, color)")
      .gte("date", `${year}-01-01`).lte("date", `${year}-12-31`)
      .order("date", { ascending: false });
    setSavings(data || []);
    if (onDataChanged) onDataChanged();
  }
  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      const [{ data: sav, error }, { data: gls, error: glsError }] = await Promise.all([
        supabase.from("savings").select("*, goals(name, color)")
          .gte("date", `${year}-01-01`).lte("date", `${year}-12-31`)
          .order("date", { ascending: false }),
        supabase.from("goals").select("*"),
      ]);
      if (error) console.error("Error cargando ahorros:", error.message);
      if (glsError) console.error("Error cargando metas:", glsError.message);
      setSavings(sav || []);
      setGoals(gls || []);
      setLoading(false);
    }
    fetchAll();
  }, [year]);
  async function handleDelete(record) {
    const { error } = await supabase.from("savings").delete().eq("id", record.id);
    if (error) throw error;
    if (record.goal_id) await adjustGoalAmount(record.goal_id, -Number(record.amount));
    setSavings((prev) => prev.filter((s) => s.id !== record.id));
    if (onDataChanged) onDataChanged();
    setDeletingSaving(null);
  }
  const monthSavings = savings.filter((s) => dateStringMonth(s.date) - 1 === month);
  const total = monthSavings.reduce((a, s) => a + Number(s.amount), 0);
  const filteredSavings = monthSavings.filter((s) => typeFilter === "Todos" || s.type === typeFilter);
  // Además de los 3 tipos fijos, cualquier tipo personalizado que la persona
  // haya escrito (SavingModal, opción "Otro") también aparece aquí, para que
  // el resumen por tipo y el filtro lo incluyan igual que a los demás.
  const knownTypeValues = SAVINGS_TYPES.map((t) => t.value);
  const customTypeValues = [];
  savings.forEach((s) => {
    if (s.type && !knownTypeValues.includes(s.type) && !customTypeValues.includes(s.type)) {
      customTypeValues.push(s.type);
    }
  });
  const allTypes = [...SAVINGS_TYPES, ...customTypeValues.map((v) => ({ value: v, label: v }))];
  const totalsByType = allTypes.map((t) => {
    const items = savings.filter((s) => s.type === t.value);
    return { ...t, items, total: items.reduce((a, s) => a + Number(s.amount), 0) };
  });
  if (loading) {
    return <p className="text-sm text-slate-400">Cargando ahorros...</p>;
  }
  return (
    <div className="space-y-4">
      <Card className="p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Eyebrow>Ahorrado en {MONTHS_FULL[month]} {year}</Eyebrow>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-blue-500">{fmt(total)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => exportToCSV("ahorros.csv", filteredSavings.map((s) => ({ Tipo: SAVINGS_TYPES.find((t) => t.value === s.type)?.label || s.type, Meta: s.goals?.name || "", Monto: s.amount, Fecha: s.date })))}
            disabled={filteredSavings.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Download size={15} /> Exportar CSV
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900"
          >
            <Plus size={15} /> Agregar ahorro
          </button>
        </div>
      </Card>
      <Card className="p-5">
        <Eyebrow>Resumen por tipo en {year}</Eyebrow>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {totalsByType.map((t) => (
            <div key={t.value} className="rounded-xl border border-slate-100 p-4 dark:border-slate-800">
              <p className="text-xs font-medium text-slate-400">{t.label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-blue-500">{fmt(t.total)}</p>
              <button
                onClick={() => setViewingTypeReport(t)}
                className="mt-3 w-full rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Ver reporte
              </button>
            </div>
          ))}
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
          <select
            value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option>Todos</option>
            {allTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {filteredSavings.map((s) => {
            const label = SAVINGS_TYPES.find((t) => t.value === s.type)?.label || s.type;
            return (
              <div key={s.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <p className="font-medium text-slate-700 dark:text-slate-200">{label}</p>
                  <p className="text-xs text-slate-400">
                    {s.date}
                    {s.goals?.name && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium" style={{ backgroundColor: `${s.goals.color || "#3B82F6"}1a`, color: s.goals.color || "#3B82F6" }}>
                        <Target size={10} /> {s.goals.name}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums font-medium text-blue-500">{fmt(s.amount)}</span>
                  <RowActions onEdit={() => setEditingSaving(s)} onDelete={() => setDeletingSaving(s)} />
                </div>
              </div>
            );
          })}
          {filteredSavings.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-slate-400">
              {monthSavings.length === 0 ? `Aún no has registrado ahorros en ${MONTHS_FULL[month]} ${year}.` : "No hay ahorros de este tipo."}
            </p>
          )}
        </div>
      </Card>
      {showModal && (
        <SavingModal goals={goals} defaultDate={defaultDateForMonth(month, year)} onClose={() => setShowModal(false)} onSaved={refetchSavings} />
      )}
      {editingSaving && (
        <SavingModal goals={goals} saving={editingSaving} onClose={() => setEditingSaving(null)} onSaved={refetchSavings} />
      )}
      {deletingSaving && (
        <ConfirmDeleteModal
          title="Eliminar ahorro"
          message={`¿Seguro que quieres eliminar este registro de ahorro de ${fmt(deletingSaving.amount)}? Esta acción no se puede deshacer.`}
          onCancel={() => setDeletingSaving(null)}
          onConfirm={() => handleDelete(deletingSaving)}
        />
      )}
      {viewingTypeReport && (
        <SavingsTypeReportModal
          type={viewingTypeReport}
          year={year}
          fmt={fmt}
          onClose={() => setViewingTypeReport(null)}
        />
      )}
    </div>
  );
}
// Solo lectura: reporte de un tipo de ahorro (Fondo de emergencia,
// Inversiones, Ahorro libre) para el año seleccionado — cuánto se ahorró
// cada mes y el detalle de cada aporte. Para editar o eliminar alguno, se
// hace desde la lista normal de Ahorros.
function SavingsTypeReportModal({ type, year, fmt, onClose }) {
  const total = type.items.reduce((a, s) => a + Number(s.amount), 0);
  const monthlyTotals = MONTHS.map((m, i) => {
    const monthNum = i + 1;
    const monthTotal = type.items
      .filter((s) => dateStringMonth(s.date) === monthNum)
      .reduce((a, s) => a + Number(s.amount), 0);
    return { mes: m, total: monthTotal };
  });
  const maxMonthTotal = Math.max(1, ...monthlyTotals.map((m) => m.total));
  const sortedItems = [...type.items].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-8" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Reporte · {type.label}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>
        <p className="mb-4 text-xs text-slate-400">
          Cuánto ahorraste en "{type.label}" mes a mes durante {year}, y el detalle de cada aporte.
        </p>
        <div className="space-y-1.5">
          {monthlyTotals.map((m) => (
            <div key={m.mes} className="flex items-center gap-3 text-xs">
              <span className="w-8 shrink-0 text-slate-400">{m.mes}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-700 ease-out"
                  style={{ width: `${Math.round((m.total / maxMonthTotal) * 100)}%` }}
                />
              </div>
              <span className="w-24 shrink-0 text-right font-medium text-slate-600 dark:text-slate-300">{fmt(m.total)}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">Detalle de aportes</p>
        <div className="max-h-[35vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
          {sortedItems.map((s) => (
            <div key={s.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <div>
                <p className="text-xs text-slate-400">{s.date}</p>
              </div>
              <span className="tabular-nums font-medium text-blue-500">{fmt(s.amount)}</span>
            </div>
          ))}
          {sortedItems.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-slate-400">Aún no has registrado ahorros de este tipo en {year}.</p>
          )}
        </div>
        {sortedItems.length > 0 && (
          <p className="mt-3 text-right text-xs text-slate-400">
            Total del año: <span className="font-medium text-slate-600 dark:text-slate-300">{fmt(total)}</span>
          </p>
        )}
      </div>
    </div>
  );
}
// Además de los 3 tipos fijos (Fondo de emergencia, Inversiones, Ahorro
// libre), se puede elegir "Otro" y escribir el nombre que se quiera —
// "type" en la base es texto libre (igual que en Ingresos/Gastos fijos),
// así que un tipo personalizado no requiere ningún cambio de esquema.
const CUSTOM_TYPE_VALUE = "otro";
function SavingModal({ saving: savingRecord, goals, onClose, onSaved, defaultDate }) {
  const isEditing = Boolean(savingRecord);
  const today = localDateString();
  const knownTypeValues = SAVINGS_TYPES.map((t) => t.value);
  const startsAsCustom = Boolean(savingRecord?.type) && !knownTypeValues.includes(savingRecord.type);
  const [selectValue, setSelectValue] = useState(startsAsCustom ? CUSTOM_TYPE_VALUE : (savingRecord?.type || "libre"));
  const [type, setType] = useState(savingRecord?.type || "libre");
  const [goalId, setGoalId] = useState(savingRecord?.goal_id || "");
  const [amount, setAmount] = useState(savingRecord ? String(savingRecord.amount) : "");
  const [date, setDate] = useState(savingRecord?.date || defaultDate || today);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  function handleSelectChange(value) {
    setSelectValue(value);
    if (value !== CUSTOM_TYPE_VALUE) setType(value);
    else if (!startsAsCustom) setType("");
  }
  async function handleSubmit(e) {
    e.preventDefault();
    if (selectValue === CUSTOM_TYPE_VALUE && !type.trim()) {
      setErrorMsg("Escribe un nombre para el tipo de ahorro.");
      return;
    }
    if (!amount || !date) {
      setErrorMsg("Completa al menos el monto y la fecha.");
      return;
    }
    setSaving(true);
    setErrorMsg("");
    const newGoalId = goalId || null;
    const newAmount = Number(amount);
    const finalType = type.trim();
    if (isEditing) {
      const { error } = await supabase.from("savings").update({
        type: finalType,
        goal_id: newGoalId,
        amount: newAmount,
        date,
        year: dateStringYear(date),
        month: dateStringMonth(date),
      }).eq("id", savingRecord.id);
      if (!error) {
        const oldGoalId = savingRecord.goal_id || null;
        const oldAmount = Number(savingRecord.amount);
        if (oldGoalId === newGoalId) {
          if (oldGoalId) await adjustGoalAmount(oldGoalId, newAmount - oldAmount);
        } else {
          if (oldGoalId) await adjustGoalAmount(oldGoalId, -oldAmount);
          if (newGoalId) await adjustGoalAmount(newGoalId, newAmount);
        }
      }
      setSaving(false);
      if (error) {
        setErrorMsg("Error al guardar: " + error.message);
      } else {
        onSaved();
        onClose();
      }
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    const { error } = await supabase.from("savings").insert({
      user_id: userId || null,
      type: finalType,
      goal_id: newGoalId,
      amount: newAmount,
      date,
      year: dateStringYear(date),
      month: dateStringMonth(date),
    });
    if (!error && newGoalId) await adjustGoalAmount(newGoalId, newAmount);
    setSaving(false);
    if (error) {
      setErrorMsg("Error al guardar: " + error.message);
    } else {
      onSaved();
      onClose();
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{isEditing ? "Editar ahorro" : "Nuevo ahorro"}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Tipo de ahorro</label>
            <select
              value={selectValue} onChange={(e) => handleSelectChange(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              {SAVINGS_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
              <option value={CUSTOM_TYPE_VALUE}>Otro (escribir nombre)</option>
            </select>
            {selectValue === CUSTOM_TYPE_VALUE && (
              <input
                type="text" value={type} onChange={(e) => setType(e.target.value)}
                placeholder="Ej. Ahorro para viaje, Colegio de los niños..."
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Vincular a una meta (opcional)</label>
            <select
              value={goalId} onChange={(e) => setGoalId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="">Ninguna</option>
              {(goals || []).map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            {goalId && (
              <p className="mt-1.5 text-xs text-slate-400">El monto se sumará automáticamente al progreso de esa meta.</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Monto</label>
              <input
                type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                placeholder="50000"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Fecha</label>
              <input
                type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>
          {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}
          <button
            type="submit" disabled={saving}
            className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
          >
            {saving ? "Guardando..." : isEditing ? "Guardar cambios" : "Agregar ahorro"}
          </button>
        </form>
      </div>
    </div>
  );
}
/* ---------------------------------------------------------------
   PRESUPUESTOS
------------------------------------------------------------------ */
function BudgetsView({ fmt, year, month }) {
  const [categories, setCategories] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [monthExpenses, setMonthExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingBudget, setEditingBudget] = useState(null);
  const [deletingBudget, setDeletingBudget] = useState(null);
  const [viewingCategoryExpenses, setViewingCategoryExpenses] = useState(null);

  async function refetch() {
    const [{ data: cats, error: catError }, { data: buds, error: budError }, { data: exps, error: expError }] = await Promise.all([
      supabase.from("categories").select("*"),
      supabase.from("budgets").select("*"),
      // Se trae sin filtrar por fecha en la consulta: un gasto con tarjeta de
      // crédito guarda en "date" la fecha de PAGO (puede caer el mes
      // siguiente), no la fecha en que realmente se compró. Para el
      // presupuesto lo que importa es cuándo se gastó de verdad, así que se
      // filtra abajo por "purchase_date" (si existe) o por "date".
      supabase.from("expenses").select("id, amount, category_id, date, purchase_date, description, credit_cards(name)"),
    ]);
    if (catError) console.error("Error cargando categorías:", catError.message);
    if (budError) console.error("Error cargando presupuestos:", budError.message);
    if (expError) console.error("Error cargando gastos del mes:", expError.message);
    const thisMonth = (exps || []).filter((e) => {
      const effective = e.purchase_date || e.date;
      return dateStringYear(effective) === year && dateStringMonth(effective) === month + 1;
    });
    setCategories(cats || []);
    setBudgets(buds || []);
    setMonthExpenses(thisMonth);
    setLoading(false);
  }
  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  async function handleDelete(id) {
    const { error } = await supabase.from("budgets").delete().eq("id", id);
    if (error) throw error;
    setBudgets((prev) => prev.filter((b) => b.id !== id));
    setDeletingBudget(null);
  }

  if (loading) {
    return <p className="text-sm text-slate-400">Cargando presupuestos...</p>;
  }

  // Presupuestos por mes: cada categoría puede tener un monto "por defecto"
  // (aplica siempre) y, opcionalmente, uno específico para el mes que se
  // está viendo, que gana si existe (ver resolveEffectiveBudgets).
  const effectiveByCategory = resolveEffectiveBudgets(budgets, year, month + 1);
  const rows = categories.map((c) => {
    const entry = effectiveByCategory[c.id] || null;
    const budget = entry?.row || null;
    const isOverride = entry?.isOverride || false;
    const categoryExpenses = monthExpenses.filter((e) => e.category_id === c.id);
    const spent = categoryExpenses.reduce((a, e) => a + Number(e.amount), 0);
    const pct = budget ? Math.round((spent / Number(budget.monthly_amount)) * 100) : null;
    return { category: c, budget, isOverride, spent, pct, categoryExpenses };
  });
  // Días que quedan del mes que se está viendo — solo tiene sentido si es el
  // mes real actual; si es un mes pasado o futuro, se indica en vez de
  // mostrar un número de días que no significaría nada.
  const now = new Date();
  const isCurrentRealMonth = year === now.getFullYear() && month === now.getMonth();
  const isPastMonth = year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth());
  const daysLeftInMonth = isCurrentRealMonth
    ? Math.max(0, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate())
    : null;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <Eyebrow>Presupuestos de {MONTHS_FULL[month]} {year}</Eyebrow>
        <p className="mt-1 text-sm text-slate-400">Define un límite mensual por categoría y sigue tu progreso en tiempo real. Puedes usar el mismo monto todos los meses, o uno especial solo para el mes que estás viendo.</p>
      </Card>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ category, budget, isOverride, spent, pct, categoryExpenses }) => {
          const color = category.color || "#64748B";
          const over = pct !== null && pct >= 100;
          const near = pct !== null && pct >= 80 && pct < 100;
          return (
            <Card key={category.id} className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl text-xs font-semibold" style={{ backgroundColor: `${color}1a`, color }}>
                    {category.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium text-slate-800 dark:text-white">{category.name}</p>
                    <p className="text-xs text-slate-400">
                      {budget ? `${fmt(spent)} de ${fmt(budget.monthly_amount)}` : "Sin presupuesto definido"}
                    </p>
                    {budget && isOverride && (
                      <p className="mt-0.5 text-[11px] font-medium text-amber-500">Especial de {MONTHS_FULL[month]}</p>
                    )}
                  </div>
                </div>
                {budget ? (
                  <RowActions onEdit={() => setEditingBudget({ category, budget, isOverride })} onDelete={() => setDeletingBudget({ ...budget, isOverride })} />
                ) : (
                  <button
                    onClick={() => setEditingBudget({ category, budget: null, isOverride: false })}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    aria-label="Definir presupuesto"
                  >
                    <Plus size={14} />
                  </button>
                )}
              </div>
              {budget && (
                <>
                  <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ease-out ${over ? "bg-red-500" : near ? "bg-amber-400" : "bg-emerald-500"}`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className={`text-sm font-semibold tabular-nums ${over ? "text-red-500" : near ? "text-amber-500" : "text-emerald-600"}`}>{pct}%</p>
                      <p className="text-[11px] text-slate-400">usado</p>
                    </div>
                    <div>
                      <p className={`text-sm font-semibold tabular-nums ${over ? "text-red-500" : "text-slate-700 dark:text-slate-200"}`}>
                        {fmt(Math.abs(Number(budget.monthly_amount) - spent))}
                      </p>
                      <p className="text-[11px] text-slate-400">{over ? "te pasaste" : "te quedan"}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">{daysLeftInMonth ?? "—"}</p>
                      <p className="text-[11px] text-slate-400">
                        {isCurrentRealMonth ? (daysLeftInMonth === 1 ? "día restante" : "días restantes") : isPastMonth ? "mes cerrado" : "mes futuro"}
                      </p>
                    </div>
                  </div>
                  {over && (
                    <p className="mt-2 flex items-center gap-1 text-xs text-red-500">
                      <AlertTriangle size={12} /> Pasaste el límite
                    </p>
                  )}
                </>
              )}
              {budget && !isOverride && (
                <button
                  onClick={() => setEditingBudget({ category, budget: null, isOverride: false, forceScope: "specific" })}
                  className="mt-3 w-full rounded-lg border border-dashed border-slate-200 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  Definir monto especial para {MONTHS_FULL[month]}
                </button>
              )}
              <button
                onClick={() => setViewingCategoryExpenses({ category, expenses: categoryExpenses })}
                className="mt-3 w-full rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Ver gastos del mes
              </button>
            </Card>
          );
        })}
        {rows.length === 0 && (
          <p className="text-sm text-slate-400">Primero crea categorías de gasto para poder definirles un presupuesto.</p>
        )}
      </div>
      {editingBudget && (
        <BudgetModal
          category={editingBudget.category}
          budget={editingBudget.budget}
          forceScope={editingBudget.forceScope}
          year={year}
          month={month + 1}
          monthLabel={`${MONTHS_FULL[month]} ${year}`}
          onClose={() => setEditingBudget(null)}
          onSaved={refetch}
        />
      )}
      {deletingBudget && (
        <ConfirmDeleteModal
          title="Eliminar presupuesto"
          message={
            deletingBudget.isOverride
              ? `¿Seguro que quieres quitar el presupuesto especial de ${MONTHS_FULL[month]}? Ese mes volverá a usar el presupuesto de siempre para esta categoría.`
              : "¿Seguro que quieres quitar el presupuesto de esta categoría? Puedes volver a definirlo cuando quieras."
          }
          onCancel={() => setDeletingBudget(null)}
          onConfirm={() => handleDelete(deletingBudget.id)}
        />
      )}
      {viewingCategoryExpenses && (
        <CategoryExpensesListModal
          category={viewingCategoryExpenses.category}
          expenses={viewingCategoryExpenses.expenses}
          fmt={fmt}
          onClose={() => setViewingCategoryExpenses(null)}
        />
      )}
    </div>
  );
}
// Solo lectura: qué gastos de este mes componen el "gastado" de una
// categoría, contados por la fecha en que realmente se hicieron (no la
// fecha de pago de una tarjeta). Para editar o eliminar alguno, se hace
// desde Gastos.
function CategoryExpensesListModal({ category, expenses, fmt, onClose }) {
  const total = expenses.reduce((a, e) => a + Number(e.amount), 0);
  const sorted = [...expenses].sort((a, b) => (b.purchase_date || b.date).localeCompare(a.purchase_date || a.date));
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-8" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Gastos del mes · {category.name}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>
        <p className="mb-4 text-xs text-slate-400">
          Se cuentan por la fecha real de la compra, no por la fecha de pago de la tarjeta. Para editar o eliminar alguno, hazlo desde Gastos.
        </p>
        <div className="max-h-[55vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
          {sorted.map((e) => (
            <div key={e.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <div>
                <p className="font-medium text-slate-700 dark:text-slate-200">{e.description || category.name}</p>
                <p className="text-xs text-slate-400">
                  {e.purchase_date || e.date}
                  {e.credit_cards?.name && ` · ${e.credit_cards.name}`}
                </p>
              </div>
              <span className="tabular-nums font-medium text-red-500">{fmt(e.amount)}</span>
            </div>
          ))}
          {sorted.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-slate-400">Aún no has registrado gastos en esta categoría este mes.</p>
          )}
        </div>
        {sorted.length > 0 && (
          <p className="mt-3 text-right text-xs text-slate-400">
            Total del mes: <span className="font-medium text-slate-600 dark:text-slate-300">{fmt(total)}</span>
          </p>
        )}
      </div>
    </div>
  );
}
// year/month acá son el año y el número de mes (1-12) que se está viendo en
// Presupuestos — se usan para guardar un presupuesto "especial" solo para
// ese mes. forceScope="specific" se usa cuando se abre desde el botón
// "Definir monto especial para {mes}" (salta el selector, ya se sabe que es
// para este mes puntual). Si se está EDITANDO un presupuesto existente, no
// se deja cambiar su alcance (evita convertir sin querer un presupuesto de
// siempre en uno de un solo mes, o viceversa) — para eso existe el botón
// aparte de "Definir monto especial".
function BudgetModal({ category, budget, forceScope, year, month, monthLabel, onClose, onSaved }) {
  const isEditing = Boolean(budget);
  const [scope, setScope] = useState(forceScope || (isEditing && budget.year ? "specific" : "default"));
  const [amount, setAmount] = useState(budget ? String(budget.monthly_amount) : "");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!amount) {
      setErrorMsg("Ingresa un monto.");
      return;
    }
    setSaving(true);
    setErrorMsg("");
    if (isEditing) {
      const { error } = await supabase.from("budgets").update({ monthly_amount: Number(amount) }).eq("id", budget.id);
      setSaving(false);
      if (error) {
        setErrorMsg("Error al guardar: " + error.message);
      } else {
        onSaved();
        onClose();
      }
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    const { error } = await supabase.from("budgets").upsert(
      {
        user_id: userId || null,
        category_id: category.id,
        monthly_amount: Number(amount),
        year: scope === "specific" ? year : 0,
        month: scope === "specific" ? month : 0,
      },
      { onConflict: "user_id,category_id,year,month" }
    );
    setSaving(false);
    if (error) {
      setErrorMsg("Error al guardar: " + error.message);
    } else {
      onSaved();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {isEditing ? "Editar presupuesto" : "Definir presupuesto"} · {category.name}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isEditing && !forceScope && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">¿Para cuándo aplica?</label>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => setScope("default")}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${scope === "default" ? "border-slate-900 bg-slate-50 dark:border-white dark:bg-slate-800" : "border-slate-200 dark:border-slate-700"}`}
                >
                  Todos los meses (por defecto)
                </button>
                <button
                  type="button"
                  onClick={() => setScope("specific")}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${scope === "specific" ? "border-slate-900 bg-slate-50 dark:border-white dark:bg-slate-800" : "border-slate-200 dark:border-slate-700"}`}
                >
                  Solo {monthLabel}
                </button>
              </div>
            </div>
          )}
          {!isEditing && forceScope === "specific" && (
            <p className="text-xs text-slate-400">Este monto solo aplicará a <span className="font-medium text-slate-600 dark:text-slate-300">{monthLabel}</span>. El presupuesto de siempre para esta categoría no cambia.</p>
          )}
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Límite mensual</label>
            <input
              type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="150000"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}
          <button
            type="submit" disabled={saving}
            className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
          >
            {saving ? "Guardando..." : isEditing ? "Guardar cambios" : "Definir presupuesto"}
          </button>
        </form>
      </div>
    </div>
  );
}
/* ---------------------------------------------------------------
   APP SHELL
------------------------------------------------------------------ */
const TABS = [
  { id: "dashboard", label: "Resumen", icon: Wallet },
  { id: "incomes", label: "Ingresos", icon: TrendingUp },
  { id: "expenses", label: "Gastos", icon: TrendingDown },
  { id: "calendar", label: "Calendario", icon: Calendar },
  { id: "budgets", label: "Presupuestos", icon: Coins },
  { id: "savings", label: "Ahorros", icon: PiggyBank },
  { id: "goals", label: "Metas", icon: Target },
];
export default function FinanceApp() {
  const [tab, setTab] = useState("dashboard");
  const [monthOpen, setMonthOpen] = useState(null);
  const { code, setCode, format } = useCurrency();
  const [yearData, setYearData] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);
  const realCurrentYear = new Date().getFullYear();
  const [year, setYear] = useState(realCurrentYear);
  // Mes compartido por Ingresos/Gastos/Ahorros/Presupuestos (0 = enero). Vive
  // aquí, junto al año, y se elige desde un único selector fijo en la parte
  // de arriba del encabezado (junto a la moneda) — no pegado al título de
  // cada pestaña, para que se sienta como un control global y no como algo
  // distinto en cada pantalla. También se muestra en Resumen: ahí no filtra
  // nada (esa vista siempre es anual), solo se usa para resaltar el mes
  // elegido dentro de "Panorama del año".
  const [month, setMonth] = useState(() => new Date().getMonth());

  async function loadYearData(y = year) {
    setDataLoading(true);
    const data = await fetchYearData(y);
    setYearData(data);
    setDataLoading(false);
  }
  useEffect(() => {
    loadYearData(year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);
  async function handleLogout() {
    await supabase.auth.signOut();
  }
  const openMonth = (i) => setMonthOpen(i);
  const navMonth = (delta) => setMonthOpen((i) => Math.min(11, Math.max(0, i + delta)));
  const goToYear = (y) => setYear(Math.min(realCurrentYear + MAX_FUTURE_YEARS, y));
  return (
    <div>
      <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors dark:bg-[#0B1220] dark:text-slate-100">
        <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-slate-50/80 backdrop-blur-md dark:border-slate-800/70 dark:bg-[#0B1220]/80">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900">
                <Wallet size={16} />
              </div>
              <span className="text-[15px] font-semibold">Finanzas</span>
            </div>
            <div className="hidden items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900 md:flex">
              {TABS.map((t) => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      active ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    }`}
                  >
                    <Icon size={14} /> {t.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              {["dashboard", "incomes", "expenses", "calendar", "savings", "budgets"].includes(tab) && (
                <MonthTitleSelect month={month} onChange={setMonth} />
              )}
              <select
                value={code} onChange={(e) => setCode(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium outline-none dark:border-slate-800 dark:bg-slate-900"
              >
                {Object.keys(CURRENCIES).map((c) => <option key={c}>{c}</option>)}
              </select>
              <button
                onClick={handleLogout}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Salir
              </button>
            </div>
          </div>
          <div className="flex gap-1 overflow-x-auto border-t border-slate-200/70 px-4 py-2 dark:border-slate-800/70 md:hidden">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
                    active ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  <Icon size={13} /> {t.label}
                </button>
              );
            })}
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold">
                {tab === "dashboard" && "Resumen del año"}
                {tab === "incomes" && "Tus ingresos"}
                {tab === "expenses" && "Tus gastos"}
                {tab === "calendar" && "Calendario de pagos"}
                {tab === "budgets" && "Presupuestos"}
                {tab === "savings" && "Tus ahorros"}
                {tab === "goals" && "Tus metas"}
              </h1>
              {["dashboard", "incomes", "expenses", "calendar", "savings", "budgets"].includes(tab) ? (
                <div className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-400">
                  <button
                    onClick={() => goToYear(year - 1)}
                    className="rounded-md p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800"
                    aria-label="Año anterior"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="tabular-nums font-medium text-slate-600 dark:text-slate-300">{year}</span>
                  <button
                    onClick={() => goToYear(year + 1)}
                    disabled={year >= realCurrentYear + MAX_FUTURE_YEARS}
                    className="rounded-md p-0.5 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
                    aria-label="Año siguiente"
                  >
                    <ChevronRight size={14} />
                  </button>
                  <span>· actualizado en tiempo real</span>
                </div>
              ) : (
                <p className="text-sm text-slate-400">{realCurrentYear} · actualizado en tiempo real</p>
              )}
            </div>
          </div>
          {dataLoading || !yearData ? (
            <p className="text-sm text-slate-400">Cargando tus datos...</p>
          ) : (
            <>
              {tab === "dashboard" && <Dashboard fmt={format} onSelectMonth={openMonth} yearData={yearData} year={year} month={month} />}
              {tab === "calendar" && <CalendarView fmt={format} year={year} month={month} yearData={yearData} />}
            </>
          )}
          {tab === "incomes" && <IncomesView fmt={format} onDataChanged={loadYearData} year={year} month={month} />}
          {tab === "expenses" && <ExpensesView fmt={format} onDataChanged={loadYearData} year={year} month={month} />}
          {tab === "budgets" && <BudgetsView fmt={format} year={year} month={month} />}
          {tab === "savings" && <SavingsView fmt={format} onDataChanged={loadYearData} year={year} month={month} />}
          {tab === "goals" && <GoalsView fmt={format} />}
        </main>
        {monthOpen !== null && yearData && (
          <MonthDetail index={monthOpen} year={year} fmt={format} onClose={() => setMonthOpen(null)} onNav={navMonth} yearData={yearData} />
        )}
      </div>
    </div>
  );
}