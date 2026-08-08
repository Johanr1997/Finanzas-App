"use client";
import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart,
  Line, LineChart, ReferenceLine, LabelList,
} from "recharts";
import {
  Wallet, TrendingUp, TrendingDown, PiggyBank, Target,
  Search, Filter, Download, ChevronRight, ChevronLeft, X, Plus,
  Home, Utensils, Car, Zap, HeartPulse, GraduationCap, Popcorn,
  ShoppingBag, Repeat, MoreHorizontal, Sparkles, Check, Trash2,
  Calendar, Bell, ArrowUpRight, ArrowDownRight, Settings2, Globe,
  Pencil, Coins, AlertTriangle, CreditCard, Landmark, Tag, CalendarRange,
  Minus, Clock, Wifi,
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
// Método de pago / cuenta de un ingreso (2026-08-01) -- lista fija y simple
// (no un manager como Tipos de ingreso o Categorías) porque no hace falta
// gestionar cuentas propias, solo dejar constancia de por dónde entró el
// dinero. Campo opcional -- los ingresos de antes de este cambio no tienen
// ninguno guardado y siguen mostrándose bien (ver payment_method en incomes).
const PAYMENT_METHODS = ["Efectivo", "Cuenta corriente", "Cuenta de ahorros", "Tarjeta", "Otro"];
// Tipos de cuenta (Fase 2, 2026-08-08) -- lista fija, igual de simple que
// PAYMENT_METHODS, para la nueva tabla "accounts".
const ACCOUNT_TYPES = ["Efectivo", "Cuenta corriente", "Cuenta de ahorros", "Inversión", "Otro"];
// Cada cuenta se muestra como una tarjeta (2026-08-08, a pedido del
// usuario) con el color del banco elegido -- son colores aproximados,
// inspirados en la identidad de cada banco, NO el logo real (no podemos
// usar el logo oficial de ningún banco). "Efectivo" y "Otro" no son bancos
// de verdad, usan un color neutro. La persona también puede elegir "Otro" y
// definir su propio color si su banco no está en la lista o el color no le
// convence.
const BANKS = [
  { name: "BAC Credomatic", from: "#C8102E", to: "#6E0A1B" },
  { name: "Banco Nacional (BN)", from: "#00205B", to: "#E30613" },
  { name: "Banco de Costa Rica (BCR)", from: "#004C97", to: "#00274D" },
  { name: "Banco Popular", from: "#F26A21", to: "#A8390A" },
  { name: "Scotiabank", from: "#EC111A", to: "#8C0B12" },
  { name: "Davivienda", from: "#EF3F24", to: "#C1121F" },
  { name: "Promerica", from: "#F7941D", to: "#A85F0A" },
  { name: "Lafise", from: "#046A38", to: "#023D20" },
  { name: "Coopenae", from: "#2E8B3D", to: "#1B5423" },
  { name: "Efectivo", from: "#475569", to: "#1E293B" },
  { name: "Otro", from: "#334155", to: "#0F172A" },
];
const CARD_NETWORKS = ["Ninguna", "Visa", "Mastercard"];
// Colores especiales cuando un banco se usa en una TARJETA DE CRÉDITO (kind
// === "tarjeta", creada con el botón "+ Tarjeta"), distintos de los que usa
// esa misma cuenta cuando es una cuenta normal (kind === "cuenta", botón
// "+ Cuenta") -- a pedido del usuario (2026-08-08): el BN se ve dorado solo
// en sus tarjetas de crédito, sus cuentas normales se quedan con el azul/
// rojo de siempre.
const CREDIT_CARD_BANK_OVERRIDES = {
  "Banco Nacional (BN)": { from: "#E6C455", to: "#8A6D1D" },
};
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
  const hadError = Boolean(incError || expError || savError || planError || recExpError || recIncError);
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
      // Color real de la categoría, tal como está en Supabase (columna
      // categories.color) — así los gráficos de Resumen usan el mismo color
      // que ya se ve en Gastos/Presupuestos, en vez de un color fijo aparte
      // en el código (CATEGORY_META) que podía quedar desactualizado si el
      // color de una categoría se edita alguna vez desde la base de datos.
      color: e.categories?.color || null,
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
  // Antes esto solo mandaba los errores a console.error y seguía con lo que
  // hubiera cargado bien — la persona veía la pantalla igual que si de
  // verdad no tuviera datos ese año, sin ningún aviso. Ahora también se
  // devuelve si algo falló, para que quien llama a fetchYearData (el
  // encabezado de la app) pueda mostrar un aviso visible.
  return { months: monthsData, hadError };
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
// Mismo patrón que adjustGoalAmount, para ligar Ingresos/Gastos (y pagos de
// tarjeta) con el saldo real de una cuenta (2026-08-08). `delta` ya viene
// con el signo correcto puesto por quien llama (positivo para sumar,
// negativo para restar) -- esta función solo lee el saldo actual y le suma
// el delta, no decide el signo.
async function adjustAccountBalance(accountId, delta) {
  if (!accountId || !delta) return;
  const { data } = await supabase.from("accounts").select("current_balance").eq("id", accountId).single();
  if (!data) return;
  await supabase.from("accounts").update({ current_balance: Number(data.current_balance) + delta }).eq("id", accountId);
}
// Antes, un mes se marcaba en rojo simplemente si ESE mes (aislado) gastó
// más de lo que ingresó. Pero eso no toma en cuenta el saldo que se trae de
// meses anteriores -- ej. un salario que cae el día 30 del mes anterior y
// financia la primera quincena del mes actual: ese mes puede "verse" en
// déficit aislado sin estarlo en la realidad, porque los gastos de esos
// primeros días ya estaban cubiertos con el saldo que traías. Ahora, cuando
// se conoce el saldo acumulado hasta ese mes (ver "Saldo acumulado" en
// Resumen, 2026-07-30), solo se marca rojo si de verdad te quedarías sin
// dinero real ese mes (el acumulado se vuelve negativo); si el acumulado
// sigue en positivo pero ese mes en particular gastó más de lo normal, se
// marca amarillo ("ajustado") en vez de rojo -- estás usando parte de tu
// colchón, pero no te quedaste sin nada. El parámetro es opcional para no
// romper otros usos futuros de esta función que no tengan ese dato a mano.
function statusOf(balance, ingreso, saldoAcumulado) {
  if (ingreso === 0) return "gris";
  const ratio = balance / ingreso;
  if (saldoAcumulado !== undefined) {
    if (saldoAcumulado < 0) return "rojo";
    return ratio >= 0.15 ? "verde" : "amarillo";
  }
  if (ratio >= 0.15) return "verde";
  if (ratio >= 0) return "amarillo";
  return "rojo";
}
const STATUS_COLOR = {
  verde: "bg-emerald-500", amarillo: "bg-amber-400", rojo: "bg-red-500", gris: "bg-slate-400",
};
const STATUS_LABEL = { verde: "Saludable", amarillo: "Ajustado", rojo: "En déficit", gris: "Sin datos" };
// Clase compartida por casi todos los <input>/<select> de los formularios
// (modales de gasto, ingreso, ahorro, presupuesto, etc.) — antes estaba
// repetida literalmente en más de 35 lugares; centralizarla acá hace que un
// cambio de estilo futuro sea de una sola línea en vez de buscar y
// reemplazar por todo el archivo. El margen superior (mt-1, mt-2...) se
// agrega en cada lugar según haga falta, ya que varía según el contexto.
const INPUT_CLASS = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition-shadow focus:border-slate-400 focus:ring-4 focus:ring-slate-900/5 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:ring-white/10";
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
// Estado vacío reutilizable (2026-07-31, pulido de UI a pedido del
// usuario): reemplaza los mensajes de una sola línea en gris ("Aún no hay
// gastos registrados este año.") por un bloque con ícono + mensaje breve y
// algo más invitador, para que un gráfico o lista sin datos todavía no se
// sienta como un error o un espacio roto. `compact` se usa dentro de
// listas/secciones ya angostas (ej. el detalle de gastos), donde una caja
// grande se sentiría pesada.
function EmptyState({ icon: Icon, title, message, compact = false, className = "" }) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 text-center dark:border-slate-700 ${compact ? "gap-1 px-4 py-6" : "gap-2 px-6 py-10"} ${className}`}
    >
      {Icon && (
        <div className={`flex items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 ${compact ? "h-8 w-8" : "h-12 w-12"}`}>
          <Icon size={compact ? 15 : 20} />
        </div>
      )}
      <p className={`font-medium text-slate-600 dark:text-slate-300 ${compact ? "text-xs" : "text-sm"}`}>{title}</p>
      {message && <p className={`max-w-xs text-slate-400 ${compact ? "text-[11px]" : "text-xs"}`}>{message}</p>}
    </div>
  );
}
// Esqueletos de carga (2026-07-31, a pedido del usuario): reemplazan los
// textos simples de "Cargando..." por bloques animados (`animate-pulse`,
// utilidad nativa de Tailwind) con la misma silueta aproximada del
// contenido real, para que la transición entre pestañas se sienta menos
// brusca. No intentan ser pixel-perfect al contenido final -- solo dar una
// sensación de "esto ya casi está" en vez de una pantalla en blanco con
// una palabra.
function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-lg bg-slate-200/70 dark:bg-slate-800/70 ${className}`} />;
}
function StatCardSkeleton() {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-5 w-24" />
        </div>
        <Skeleton className="h-10 w-10 rounded-xl" />
      </div>
    </Card>
  );
}
function ChartSkeleton({ height = "h-64" }) {
  return (
    <Card className="p-5">
      <Skeleton className="h-2.5 w-32" />
      <Skeleton className={`mt-4 w-full ${height}`} />
    </Card>
  );
}
function TileSkeleton() {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="w-full space-y-2">
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="h-3.5 w-28" />
        </div>
        <Skeleton className="h-4 w-4 shrink-0 rounded" />
      </div>
      <Skeleton className="mt-4 h-2.5 w-20" />
      <Skeleton className="mt-2 h-5 w-24" />
    </Card>
  );
}
function CardGridSkeleton({ count = 6 }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, i) => <TileSkeleton key={i} />)}
    </div>
  );
}
function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 5 }, (_, i) => <StatCardSkeleton key={i} />)}
      </div>
      <ChartSkeleton height="h-56" />
      <ChartSkeleton height="h-64" />
    </div>
  );
}
// Aviso visible cuando algo falló al cargar datos de Supabase (antes solo se
// mandaba a la consola con console.error y la pantalla quedaba igual que si
// no hubiera datos, sin ningún aviso — confuso, porque se ve idéntico a "no
// has registrado nada todavía"). Cada pestaña guarda su propio mensaje de
// error y lo limpia en cuanto una recarga sale bien.
function LoadErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
// Encabezado colapsable reutilizable: antes cada sección plegable ("Consejos
// para este mes" en Resumen, "Ingresos fijos" en Ingresos, "Fijo y
// programado" en Gastos) repetía el mismo botón con flechita que gira +
// lógica de mostrar/ocultar. El contenido de cada encabezado (título,
// descripción, ícono) sigue siendo distinto en cada lugar, así que se recibe
// como children ("header") y no se intenta forzar una forma única.
function CollapsibleSection({ open, onToggle, header, buttonClassName, children }) {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        className={buttonClassName || "flex w-full items-center justify-between gap-2 text-left"}
      >
        {header}
        <ChevronRight size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && children}
    </>
  );
}
// Selector de un tipo/artículo reutilizable (tipo de ingreso, tipo de
// ahorro, artículo de gasto) que además deja crear uno nuevo sin salir del
// formulario -- a pedido del usuario (2026-07-31): antes, si el tipo que
// necesitaba no existía todavía, tenía que cerrar "Agregar ingreso/ahorro",
// ir al botón de "Tipos de X"/"Artículos", crearlo ahí, y volver a abrir
// "Agregar" desde cero. Elegir "+ Crear nuevo..." en el selector muestra un
// campo de texto + botón "Crear" en el momento; al crearlo, se selecciona
// automáticamente y queda disponible para la próxima vez sin tener que
// volver a este selector (se avisa al padre vía onCreated, que es el mismo
// refetch que ya usa el botón "Tipos de X"/"Artículos" de cada pestaña).
function TypeSelectWithCreate({ label, value, onChange, options, table, extraFields, onCreated, placeholder, emptyHint, namePlaceholder }) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  // Por si el padre todavía no terminó de refrescar su lista cuando este
  // selector se vuelve a mostrar (ej. justo después de crear), se guarda acá
  // también, para que la opción recién creada nunca desaparezca del select.
  const [justCreated, setJustCreated] = useState([]);
  const allOptions = [...options, ...justCreated.filter((jc) => !options.some((o) => o.id === jc.id))];
  async function handleCreate() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setSaving(true);
    setErrorMsg("");
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    const { data, error } = await supabase
      .from(table)
      .insert({ user_id: userId || null, name: trimmed, ...(extraFields || {}) })
      .select()
      .single();
    setSaving(false);
    if (error) {
      setErrorMsg("Error al crear: " + error.message);
      return;
    }
    setJustCreated((prev) => [...prev, data]);
    if (onCreated) onCreated(data);
    onChange(data.id);
    setCreating(false);
    setNewName("");
  }
  if (creating) {
    return (
      <div>
        {label && <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>}
        <div className="mt-1 flex gap-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreate(); } }}
            placeholder={namePlaceholder || "Nombre nuevo"}
            className={INPUT_CLASS}
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving || !newName.trim()}
            className="shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
          >
            {saving ? "..." : "Crear"}
          </button>
          <button
            type="button"
            onClick={() => { setCreating(false); setNewName(""); setErrorMsg(""); }}
            disabled={saving}
            className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
        </div>
        {errorMsg && <p className="mt-1 text-xs text-red-500">{errorMsg}</p>}
      </div>
    );
  }
  return (
    <div>
      {label && <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>}
      <select
        value={value}
        onChange={(e) => {
          if (e.target.value === "__create__") { setCreating(true); return; }
          onChange(e.target.value);
        }}
        className={`mt-1 ${INPUT_CLASS}`}
      >
        <option value="">{placeholder || "Selecciona"}</option>
        {allOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        <option value="__create__">+ Crear nuevo...</option>
      </select>
      {allOptions.length === 0 && emptyHint && (
        <p className="mt-1 text-xs text-slate-400">{emptyHint}</p>
      )}
    </div>
  );
}
// Envoltorio compartido para modales: fondo oscuro + tarjeta blanca +
// encabezado con título y botón de cerrar (X) — el mismo bloque que se
// repetía a mano en más de 10 modales distintos de la app. Por ahora solo se
// usa en los modales de Ingresos (2026-07-28, primer paso de "reducir código
// repetido" en Ingresos/Gastos/Ahorros); el resto de modales se dejó sin
// tocar a propósito, para probar bien este cambio en una sola pestaña antes
// de aplicarlo en las demás.
function ModalShell({ onClose, title, maxWidth = "max-w-md", zIndex = "z-50", overlayExtras, children }) {
  return (
    // "overflow-y-auto" es a propósito: si el contenido de un modal (ej. una
    // lista larga de artículos) termina siendo más alto que la pantalla, se
    // puede desplazar el modal completo en vez de que la parte de abajo
    // (como el botón "+ Agregar") quede fuera de la vista sin ninguna forma
    // de llegar a ella. Antes esto no tenía overflow, así que en pantallas
    // bajas (celular) o con listas largas, ese botón quedaba inalcanzable.
    <div className={`fixed inset-0 ${zIndex} flex items-center justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm`} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className={`my-8 w-full ${maxWidth} rounded-2xl border border-slate-100 bg-white p-6 shadow-xl shadow-slate-900/10 dark:border-slate-800/60 dark:bg-slate-900 dark:shadow-black/40`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>
        {children}
      </div>
      {/* Modales anidados (ej. "Agregar tarjeta" o confirmar borrar dentro de
          "Tarjetas de crédito") se pasan por acá, NO por children — así
          quedan como hermanos de la tarjeta blanca (no dentro de ella),
          igual que estaban antes de existir ModalShell. Importa para que un
          clic en el fondo oscuro del modal anidado no quede "atrapado" por el
          stopPropagation() de la tarjeta blanca de este modal. */}
      {overlayExtras}
    </div>
  );
}
// Envoltorio compartido para listas con buscador/filtro arriba: tarjeta +
// lista con líneas divisorias + mensaje de "no hay nada" cuando corresponde.
// El encabezado (buscador, filtro, o ambos) sigue siendo distinto en cada
// pestaña, así que se recibe tal cual como "header" — mismo criterio que
// CollapsibleSection más arriba. Por ahora solo se usa en Ingresos
// (2026-07-28) — mismo motivo que ModalShell, un paso a la vez.
function ListCard({ header, isEmpty, emptyMessage, children }) {
  return (
    <Card className="overflow-hidden">
      {header}
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {children}
        {isEmpty && <p className="px-5 py-8 text-center text-sm text-slate-400">{emptyMessage}</p>}
      </div>
    </Card>
  );
}
// Tarjeta "hero" de KPI (2026-08-01) -- rediseño de Reporte/Anual a partir de
// dos imágenes de referencia que trajo el usuario: franja de color sólido
// arriba (en vez de un ícono chico a la derecha, como StatCard) y el número
// mucho más grande, para que las 4 cifras principales del año salten a la
// vista de inmediato en vez de competir en tamaño con el resto de tarjetas.
function HeroStat({ label, value, accent, note }) {
  return (
    <Card className="overflow-hidden">
      <div className="h-1.5 w-full" style={{ backgroundColor: accent }} />
      <div className="p-5">
        <Eyebrow>{label}</Eyebrow>
        <p className="mt-2 text-[26px] font-extrabold leading-tight tracking-tight tabular-nums text-slate-900 dark:text-white">{value}</p>
        {note && <p className="mt-1 text-xs font-medium text-slate-400">{note}</p>}
      </div>
    </Card>
  );
}
// Insignia de tendencia ("+8% vs mes anterior") para los encabezados de
// Ingresos/Gastos/Ahorros -- reutiliza yearData/estado que cada pestaña ya
// carga (mismo año completo), sin ninguna consulta nueva a Supabase. Si no
// hay mes anterior con el que comparar (ej. estás viendo enero, cuyo mes
// anterior sería diciembre del año pasado, que esa pestaña no carga) o el
// mes anterior fue ₡0, no se muestra nada -- un porcentaje contra cero no
// dice nada útil. `invert` es para Gastos: ahí que suba es la mala noticia.
function TrendBadge({ current, previous, invert = false }) {
  if (!previous || previous <= 0) return null;
  const diffPct = ((current - previous) / previous) * 100;
  if (Math.abs(diffPct) < 1) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        <Minus size={12} /> Igual que el mes anterior
      </span>
    );
  }
  const isUp = diffPct > 0;
  const isGood = invert ? !isUp : isUp;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${
        isGood
          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
          : "bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400"
      }`}
    >
      {isUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {Math.abs(diffPct).toFixed(0)}% vs mes anterior
    </span>
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
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl border border-slate-100 bg-white p-6 shadow-xl shadow-slate-900/10 dark:border-slate-800/60 dark:bg-slate-900 dark:shadow-black/40">
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
// Borra TODA la información de la cuenta que inició sesión (ingresos, gastos,
// ahorros, metas, presupuestos, planes de pago, gastos/ingresos fijos,
// tarjetas y los tipos guardados de cada uno) -- en todas las pestañas de la
// app, a pedido del usuario (2026-07-31), ej. para "empezar de cero" o
// limpiar datos de prueba. "categories" queda fuera a propósito: es una
// lista compartida entre cuentas (no información personal), la app nunca
// crea categorías nuevas por su cuenta y no tiene sentido borrarla.
// Por seguridad (es irreversible) pide escribir "ELIMINAR" para habilitar el
// botón, además del típico modal de confirmar.
function DeleteAllDataModal({ onClose, onDeleted }) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const canConfirm = confirmText.trim().toUpperCase() === "ELIMINAR";
  async function handleConfirm() {
    if (!canConfirm) return;
    setDeleting(true);
    setErrorMsg("");
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error("No se pudo identificar tu cuenta.");
      // Orden pensado para no chocar con las relaciones entre tablas (ej.
      // borrar las cuotas marcadas de un plan de pago antes que el plan
      // mismo, los ahorros antes que las metas a las que puedan estar
      // vinculados, los ingresos/gastos antes que sus tipos/artículos, etc.)
      for (const table of [
        "installment_payment_status",
        "expenses",
        "savings",
        "incomes",
        "recurring_incomes",
        "recurring_expenses",
        "installment_plans",
        "goals",
        "income_types",
        "savings_types",
        "expense_items",
        "credit_cards",
        "budgets",
      ]) {
        const { error } = await supabase.from(table).delete().eq("user_id", userId);
        if (error) throw new Error(`${table}: ${error.message}`);
      }
      if (onDeleted) onDeleted();
    } catch (err) {
      setErrorMsg("Error al eliminar: " + (err?.message || "intenta de nuevo."));
      setDeleting(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={deleting ? undefined : onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl border border-slate-100 bg-white p-6 shadow-xl shadow-slate-900/10 dark:border-slate-800/60 dark:bg-slate-900 dark:shadow-black/40">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-500 dark:bg-red-500/10">
            <AlertTriangle size={18} />
          </div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Eliminar toda mi información</h2>
        </div>
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          Esto borra todos tus ingresos, gastos, ahorros, metas, presupuestos, planes de pago, gastos/ingresos fijos, tarjetas y tipos guardados -- de todas las pestañas de la app. No se puede deshacer.
        </p>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Para confirmar, escribe <span className="font-semibold text-slate-700 dark:text-slate-200">ELIMINAR</span> abajo.
        </p>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="ELIMINAR"
          disabled={deleting}
          className={`${INPUT_CLASS} mt-2`}
        />
        {errorMsg && <p className="mt-2 text-xs text-red-500">{errorMsg}</p>}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={deleting || !canConfirm}
            className="flex-1 rounded-lg bg-red-500 py-2.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleting ? "Eliminando..." : "Eliminar todo"}
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
/* ---------------------------------------------------------------
   DASHBOARD
------------------------------------------------------------------ */
// Saldo acumulado MES A MES: a diferencia del resto de la app (que calcula
// cada mes aislado, sin arrastrar nada del anterior), esto suma mes a mes lo
// que sobra (ingresos - gastos - ahorros) para reflejar el dinero que en
// realidad sigues teniendo disponible -- ej. un salario que entra el 30 de
// julio ya no "desaparece" al pasar a agosto, porque agosto arranca con lo
// que sobró de julio. Empieza en ₡0 en enero del año elegido (a pedido del
// usuario, 2026-07-30) -- por ahora no arrastra saldo de un año al
// siguiente, cada año vuelve a empezar en ₡0 en enero. Se usa para el
// semáforo de "Panorama del año" (ver statusOf) y, en modo "Mes completo",
// para la pestaña "Quincenas".
function computeCumulativeBalanceData(yearData) {
  let running = 0;
  return yearData.map((m) => {
    running += m.balance;
    return { mes: m.mes, mesFull: m.mesFull, balanceDelMes: m.balance, saldoAcumulado: running };
  });
}
// Períodos alineados al CICLO REAL DE PAGO del usuario -- corregido el
// 2026-07-30 después de que el usuario explicara con números reales que la
// quincena de CALENDARIO (1-15 / 16-fin de mes, la que usan "Ingreso por
// tipo" y "Gasto por artículo") no le servía para esto: su sueldo cae los
// días 15 y 30 (o el último día del mes en meses más cortos, como febrero),
// pero el del día 30 financia sus gastos del 30 al 14 del mes SIGUIENTE
// (cruza de un mes calendario a otro) -- no "16 a fin de mes" como asumía la
// versión anterior. Con la quincena de calendario, "Quincena 1" del mes
// siguiente mezclaba los gastos que en realidad paga el sueldo del 30 con el
// INGRESO del día 15 (que es para la quincena de DESPUÉS), dando números que
// no coincidían con la realidad del usuario por más que estuviera todo bien
// cargado. Esta función arma los períodos directamente por fecha real (no
// por mes+mitad), aplanando todos los movimientos del año y agrupándolos
// entre un día de pago y el siguiente -- así el período que arranca el día
// 30 correctamente incluye los días 30/31 de un mes y 1 al 14 del próximo.
// Empieza en ₡0 el 1° de enero (mismo criterio que el resto de "Reporte").
// Se usa SOLO en "Reporte" → Mensual/Quincenal → Quincenal; el resto de la
// app (Ingreso por tipo/Gasto por artículo) sigue con la quincena de
// calendario de siempre -- son selectores de categoría, no de flujo de
// caja, así que no es tan crítico que coincidan exactamente con el día de
// pago real.
function computePaydayPeriods(yearData, year) {
  const paydays = [];
  for (let mi = 0; mi < 12; mi++) {
    const lastDay = new Date(year, mi + 1, 0).getDate();
    const mm = String(mi + 1).padStart(2, "0");
    paydays.push(`${year}-${mm}-15`);
    paydays.push(`${year}-${mm}-${String(Math.min(30, lastDay)).padStart(2, "0")}`);
  }
  const boundaries = [`${year}-01-01`, ...paydays, `${year + 1}-01-01`];
  const allIncomes = yearData.flatMap((m) => m.incomes.map((i) => ({ amount: Number(i.amount), date: i.date })));
  const allGastos = yearData.flatMap((m) => m.gastos.map((g) => ({ amount: Number(g.monto), date: g.fecha })));
  const allSavings = yearData.flatMap((m) => m.savings.map((s) => ({ amount: Number(s.amount), date: s.date })));
  const out = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i];
    const end = boundaries[i + 1]; // exclusivo: el día "end" ya pertenece al siguiente período
    const inRange = (d) => d >= start && d < end;
    const ingreso = allIncomes.filter((x) => inRange(x.date)).reduce((a, x) => a + x.amount, 0);
    const gasto = allGastos.filter((x) => inRange(x.date)).reduce((a, x) => a + x.amount, 0);
    const ahorro = allSavings.filter((x) => inRange(x.date)).reduce((a, x) => a + x.amount, 0);
    // "T00:00:00" (sin "Z") fuerza a que el Date se interprete en hora LOCAL,
    // no UTC -- evita el mismo bug de zona horaria que ya se corrigió en
    // otras partes de la app (ver dateStringDay/dateStringMonth) para poder
    // restar un día sin riesgo de que se corra de fecha.
    const startDay = Number(start.slice(8, 10));
    const startMonthIdx = Number(start.slice(5, 7)) - 1;
    const endMinusOne = new Date(`${end}T00:00:00`);
    endMinusOne.setDate(endMinusOne.getDate() - 1);
    out.push({
      start, end,
      label: `${startDay} ${MONTHS[startMonthIdx]}`,
      longLabel: `${startDay} de ${MONTHS_FULL[startMonthIdx]} al ${endMinusOne.getDate()} de ${MONTHS_FULL[endMinusOne.getMonth()]}`,
      ingreso, gasto, ahorro,
      balanceDelPeriodo: ingreso - gasto - ahorro,
    });
  }
  let running = 0;
  return out.map((d) => { running += d.balanceDelPeriodo; return { ...d, saldoAcumulado: running }; });
}
// Etiqueta de % directo sobre cada porción del donut de "Gastos por
// categoría" (2026-08-01, a partir de las imágenes de referencia que trajo
// el usuario) -- en vez de tener que mirar la leyenda para saber el peso de
// cada categoría. Se oculta en porciones muy chicas (<5%) para no amontonar
// texto encima de una porción angosta.
const DONUT_LABEL_RADIAN = Math.PI / 180;
function renderDonutSliceLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
  if (percent < 0.05) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
  const x = cx + radius * Math.cos(-midAngle * DONUT_LABEL_RADIAN);
  const y = cy + radius * Math.sin(-midAngle * DONUT_LABEL_RADIAN);
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
      {`${Math.round(percent * 100)}%`}
    </text>
  );
}
function Dashboard({ fmt, onSelectMonth, yearData, year, month, categories = [], onNavigateTab, accounts = [], refetchAccounts, cards = [], refetchCards }) {
  const [goals, setGoals] = useState([]);
  const [goalsError, setGoalsError] = useState(false);
  useEffect(() => {
    supabase.from("goals").select("*").then(({ data, error }) => {
      if (error) console.error("Error cargando metas:", error.message);
      setGoalsError(Boolean(error));
      setGoals(data || []);
    });
  }, []);
  // Datos para "Patrimonio neto" y "Atención" (rediseño "centro de control
  // financiero", 2026-08-07): a diferencia del resto de esta pantalla, estos
  // tres no dependen del año que se está viendo (yearData) -- se piden UNA
  // sola vez, con TODA la historia, porque patrimonio neto no tendría
  // sentido si se reiniciara cada enero como sí hace el "saldo acumulado" de
  // más abajo.
  const [patrimonioRaw, setPatrimonioRaw] = useState(null);
  const [patrimonioError, setPatrimonioError] = useState(false);
  // "accounts" (Fase 2, 2026-08-08): tus cuentas reales (efectivo, cuenta
  // corriente, cuenta de ahorros, inversión...), cada una con un saldo. Ya
  // no se cargan acá adentro -- vienen como prop desde FinanceApp (2026-08-08,
  // al ligarlas con Ingresos/Gastos), que las carga una sola vez y las
  // comparte con Inicio, Ingresos y Gastos. refetchPatrimonioRaw se quedó
  // solo con ahorros y planes de pago, que sí siguen siendo propios de esta
  // pantalla.
  async function refetchPatrimonioRaw() {
    const [
      { data: sav, error: savErr },
      { data: pl, error: plErr },
    ] = await Promise.all([
      supabase.from("savings").select("amount, date"),
      supabase.from("installment_plans").select("*, credit_cards(name, cutoff_day, payment_day)"),
    ]);
    setPatrimonioError(Boolean(savErr || plErr));
    setPatrimonioRaw({ savings: sav || [], plans: pl || [] });
  }
  useEffect(() => {
    refetchPatrimonioRaw();
  }, []);
  // Deuda de cada tarjeta de crédito (2026-08-08): a diferencia de las
  // cuentas normales (que guardan su saldo directo en la columna
  // current_balance), la deuda de una tarjeta se calcula sola --
  // saldo_inicial (lo que ya debías antes de usar la app) + lo que le has
  // cargado en gastos sueltos (expenses.card_id) + lo que le has cargado en
  // cuotas de planes de pago vinculados a esa tarjeta (ver planChargesByCard
  // más abajo) - lo que le has pagado (credit_card_payments).
  const [cardCharges, setCardCharges] = useState({});
  async function refetchCardCharges() {
    const [{ data: exps }, { data: pays }] = await Promise.all([
      supabase.from("expenses").select("amount, card_id").not("card_id", "is", null),
      supabase.from("credit_card_payments").select("amount, card_id"),
    ]);
    const map = {};
    (exps || []).forEach((e) => { map[e.card_id] = (map[e.card_id] || 0) + Number(e.amount); });
    (pays || []).forEach((p) => { map[p.card_id] = (map[p.card_id] || 0) - Number(p.amount); });
    setCardCharges(map);
  }
  useEffect(() => {
    refetchCardCharges();
  }, []);
  // Cuotas de planes de pago vinculados a una tarjeta (2026-08-08, a pedido
  // del usuario -- antes esto era una limitación conocida, ya no). Reusa
  // patrimonioRaw.plans (que ya se carga para el cálculo de patrimonio, con
  // TODOS los planes, no solo los de una tarjeta) en vez de pedirlo de
  // nuevo. Para cada plan con card_id, suma lo que ya se le ha "cargado" a
  // la tarjeta hasta hoy: cuotas ya cumplidas (planElapsedMonths, con la
  // fecha real de hoy, igual que "Próximos compromisos") × el monto de cada
  // cuota -- las cuotas futuras todavía no se han cobrado, así que no
  // cuentan como deuda todavía.
  const planChargesByCard = useMemo(() => {
    const plans = patrimonioRaw?.plans || [];
    const map = {};
    plans.forEach((p) => {
      if (!p.card_id) return;
      const elapsed = planElapsedMonths(p);
      map[p.card_id] = (map[p.card_id] || 0) + elapsed * Number(p.monthly_amount);
    });
    return map;
  }, [patrimonioRaw]);
  const [editingAccount, setEditingAccount] = useState(null);
  const [deletingAccount, setDeletingAccount] = useState(null);
  const [editingCard, setEditingCard] = useState(null);
  const [deletingCard, setDeletingCard] = useState(null);
  const [payingCard, setPayingCard] = useState(null);
  async function handleDeleteAccount(id) {
    const { error } = await supabase.from("accounts").delete().eq("id", id);
    if (error) throw error;
    setDeletingAccount(null);
    if (refetchAccounts) refetchAccounts();
  }
  async function handleDeleteCard(id) {
    const { error } = await supabase.from("credit_cards").delete().eq("id", id);
    if (error) throw error;
    setDeletingCard(null);
    if (refetchCards) refetchCards();
    refetchCardCharges();
  }
  // Tarjetas de crédito y cuentas normales, mezcladas en un solo arreglo
  // para el carrusel de "Tus cuentas" (2026-08-08) -- cada ítem trae "kind"
  // para saber cuál modal abrir al editar/borrar, y su saldo ya calculado
  // (directo para cuentas, o deuda calculada para tarjetas).
  const accountCarouselItems = useMemo(() => {
    const accountItems = accounts.map((a) => ({ kind: "cuenta", id: a.id, data: a, balance: Number(a.current_balance) }));
    const cardItems = cards.map((c) => ({
      kind: "tarjeta",
      id: c.id,
      data: c,
      balance: Number(c.initial_balance || 0) + (cardCharges[c.id] || 0) + (planChargesByCard[c.id] || 0),
    }));
    return [...accountItems, ...cardItems];
  }, [accounts, cards, cardCharges, planChargesByCard]);
  const totals = useMemo(() => {
    const ingresos = yearData.reduce((a, m) => a + m.ingresoTotal, 0);
    const gastos = yearData.reduce((a, m) => a + m.gastoTotal, 0);
    const ahorros = yearData.reduce((a, m) => a + m.ahorroTotal, 0);
    const balance = ingresos - gastos - ahorros;
    return { ingresos, gastos, ahorros, balance, saldo: ingresos - gastos };
  }, [yearData]);
  // Indicador de salud financiera (2026-08-01): un vistazo rápido de "¿cómo
  // voy?" sin tener que leer y comparar las 5 tarjetas de arriba. Se basa en
  // el % de tus ingresos del año que lograste ahorrar, PERO si el Balance
  // neto salió negativo (gastaste más de lo que entró, incluso contando los
  // ahorros) eso pesa más que cualquier % y manda directo a "Alerta" -- no
  // tendría sentido decir "Bien" solo porque ahorraste algo si en la práctica
  // terminaste debiendo. Umbrales simples a propósito (no una fórmula con
  // muchas variables) para que se pueda explicar con una frase.
  const savingsRate = totals.ingresos > 0 ? (totals.ahorros / totals.ingresos) * 100 : 0;
  const healthStatus = useMemo(() => {
    if (totals.ingresos === 0) {
      return { label: "Sin datos", color: "#94A3B8", accentClass: "text-slate-500 dark:text-slate-400" };
    }
    if (totals.balance < 0 || savingsRate < 1) {
      return { label: "Alerta", color: "#EF4444", accentClass: "text-red-500 dark:text-red-400" };
    }
    if (savingsRate >= 20) {
      return { label: "Excelente", color: "#22C55E", accentClass: "text-emerald-600 dark:text-emerald-400" };
    }
    if (savingsRate >= 10) {
      return { label: "Bien", color: "#3B82F6", accentClass: "text-blue-600 dark:text-blue-400" };
    }
    return { label: "Cuidado", color: "#F59E0B", accentClass: "text-amber-600 dark:text-amber-400" };
  }, [totals, savingsRate]);
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
    return categoriasUsadas.map((cat) => {
      // Color real de la categoría (columna categories.color en Supabase),
      // el mismo que ya se ve en Gastos/Presupuestos — así nunca se ven
      // colores distintos para la misma categoría entre pestañas. Si algún
      // gasto viejo no tiene ese dato (categoría eliminada, por ejemplo),
      // se usa el color fijo del código como respaldo, y gris si tampoco hay.
      const conColor = expensesForCat.find((e) => e.categoria === cat && e.color);
      return {
        name: cat,
        value: expensesForCat.filter((e) => e.categoria === cat).reduce((a, e) => a + e.monto, 0),
        color: conColor?.color || CATEGORY_META[cat]?.color || "#64748B",
      };
    });
  }, [yearData]);
  // "Top 5 categorías de gasto" (2026-08-01): mismo dato que ya calcula
  // catTotalsYear de arriba, solo un segundo ángulo para verlo -- el donut
  // muestra proporción (qué tan grande es cada porción del total), esto
  // muestra ranking (cuáles son, en orden, las que más pesan). No hace falta
  // ninguna consulta nueva.
  const topCategoriasGasto = useMemo(
    () => [...catTotalsYear].sort((a, b) => b.value - a.value).slice(0, 5),
    [catTotalsYear]
  );
  const monthCompare = yearData.map((m) => ({ mes: m.mes, Balance: m.balance }));
  // Saldo acumulado: a diferencia del resto de la app (que calcula cada mes
  // aislado, sin arrastrar nada del anterior), esto suma mes a mes lo que
  // sobra (ingresos - gastos - ahorros) para reflejar el dinero que en
  // realidad sigues teniendo disponible -- ej. un salario que entra el 30 de
  // julio ya no "desaparece" al pasar a agosto, porque agosto arranca con lo
  // que sobró de julio. Empieza en ₡0 en enero de {year} (a pedido del
  // usuario, 2026-07-30) -- por ahora no arrastra saldo de un año al
  // siguiente, cada año vuelve a empezar en ₡0 en enero.
  const cumulativeBalanceData = useMemo(() => computeCumulativeBalanceData(yearData), [yearData]);
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
  // A diferencia de "prevMonth" de arriba (que se queda en el mismo mes si
  // estás en enero, solo para no romper los "insights" de más abajo), este
  // "previous" es null en enero a propósito -- TrendBadge ya sabe no
  // mostrar nada cuando previous es null, en vez de mostrar "0% vs mes
  // anterior" de forma engañosa.
  const prevMonthForTrend = month > 0 ? yearData[month - 1] : null;
  // Patrimonio neto (aproximado): ahorros acumulados de TODA la historia
  // hasta el fin del mes que se está viendo, menos el saldo pendiente de
  // todos los planes de pago a esa misma fecha. Es una aproximación
  // intencional -- la app todavía no tiene el concepto de "cuenta bancaria"
  // ni rastrea el saldo real de una tarjeta de crédito, así que ninguno de
  // los dos entra en esta cuenta todavía. Como usa datos de toda la
  // historia (no solo el año seleccionado), la comparación "vs. mes
  // anterior" funciona bien incluso cruzando de diciembre a enero.
  const patrimonio = useMemo(() => {
    if (!patrimonioRaw) return null;
    const { savings, plans } = patrimonioRaw;
    // Las cuentas (Fase 2) solo tienen un saldo de "ahora", no un histórico
    // por fecha como los ahorros -- así que se suman igual sin importar qué
    // mes se esté viendo. Esto no distorsiona la comparación "vs. mes
    // anterior": como el total de cuentas es el mismo en los dos lados de la
    // resta, se cancela solo y el delta sigue reflejando de verdad el
    // cambio en ahorros y deuda de ese mes.
    const totalCuentas = accounts.reduce((a, c) => a + Number(c.current_balance), 0);
    const endOfMonthStr = (y, m) => {
      const lastDay = new Date(y, m + 1, 0).getDate();
      return `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    };
    const ahorrosHasta = (y, m) => {
      const cutoff = endOfMonthStr(y, m);
      return savings.filter((s) => s.date <= cutoff).reduce((a, s) => a + Number(s.amount), 0);
    };
    const pasivosHasta = (y, m) => plans.reduce((a, p) => a + planSaldoPendiente(p, [], y, m), 0);
    const prevY = month === 0 ? year - 1 : year;
    const prevM = month === 0 ? 11 : month - 1;
    const activos = totalCuentas + ahorrosHasta(year, month);
    const pasivos = pasivosHasta(year, month);
    const neto = activos - pasivos;
    const activosPrev = totalCuentas + ahorrosHasta(prevY, prevM);
    const netoPrev = activosPrev - pasivosHasta(prevY, prevM);
    // "Dinero Actual" (2026-08-08, a pedido del usuario) muestra "activos"
    // solo -- sin restar deuda -- así que su propia comparación "vs. mes
    // anterior" (deltaActivos) también es sin restar deuda, para que el
    // número de arriba y la flechita de abajo cuenten la misma historia.
    // "neto"/"delta" (con deuda restada) se dejan calculados por si se
    // vuelven a necesitar en otra pantalla más adelante.
    return { activos, pasivos, neto, delta: neto - netoPrev, deltaActivos: activos - activosPrev, totalCuentas };
  }, [patrimonioRaw, accounts, year, month]);
  // Próximos compromisos (próximos 30 días reales): a diferencia de todo lo
  // demás en esta pantalla, esto SIEMPRE mira la fecha real de hoy, no el
  // mes que se está navegando con las flechitas -- no tendría sentido
  // "anticipar pagos" de un año que ya pasó. Solo funciona mientras se esté
  // viendo el año real actual (yearData del año navegado es el único que
  // hay cargado); si se está viendo otro año, se muestra un aviso en vez de
  // datos vacíos que parezcan un error.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const proximosPagos = useMemo(() => {
    if (!isCurrentYear) return { items: [], totalComprometido: 0, hasMore: false, disabled: true };
    const todayStr = localDateString(now);
    const limitDate = new Date(now);
    limitDate.setDate(limitDate.getDate() + 30);
    const limitStr = localDateString(limitDate);
    const realMonthIdx = now.getMonth();
    const sourceMonths = [yearData[realMonthIdx]];
    if (realMonthIdx < 11) sourceMonths.push(yearData[realMonthIdx + 1]);
    const pool = [];
    sourceMonths.forEach((md) => {
      md.gastos
        .filter((g) => String(g.id).startsWith("plan-") || String(g.id).startsWith("recexp-"))
        .forEach((g) => pool.push({ id: g.id, kind: "gasto", label: g.descripcion, date: g.fecha, amount: g.monto }));
      md.incomes
        .filter((i) => String(i.id).startsWith("recinc-"))
        .forEach((i) => pool.push({ id: i.id, kind: "ingreso", label: i.description || i.type || "Ingreso fijo", date: i.date, amount: Number(i.amount) }));
    });
    const upcoming = pool.filter((it) => it.date >= todayStr && it.date <= limitStr).sort((a, b) => (a.date < b.date ? -1 : 1));
    const totalComprometido = upcoming.filter((it) => it.kind === "gasto").reduce((a, it) => a + it.amount, 0);
    return { items: upcoming.slice(0, 6), totalComprometido, hasMore: upcoming.length > 6, disabled: false };
  }, [isCurrentYear, yearData]);
  // "Actividad reciente": mezcla ingresos, gastos y ahorros del mes elegido
  // (currentMonth ya viene de yearData, que esta pantalla ya tenía cargado --
  // ninguna consulta nueva a Supabase), ordenados por fecha descendente y con
  // un tope de 8 para que el panel no crezca sin límite en un mes con muchos
  // movimientos. Los ahorros no tienen un campo de descripción propio en la
  // base de datos (solo tipo), así que usan su tipo como etiqueta.
  const recentActivity = useMemo(() => {
    const items = [
      ...currentMonth.incomes.map((i) => ({
        id: `inc-${i.id}`,
        kind: "ingreso",
        label: i.description || i.type || "Ingreso",
        sub: i.type,
        date: i.date,
        amount: Number(i.amount),
      })),
      ...currentMonth.gastos.map((g) => ({
        id: `gasto-${g.id}`,
        kind: "gasto",
        label: g.descripcion,
        sub: g.categoria,
        date: g.fecha,
        amount: g.monto,
        color: g.color,
      })),
      ...currentMonth.savings.map((s) => ({
        id: `ahorro-${s.id}`,
        kind: "ahorro",
        label: s.type || "Ahorro",
        sub: "Ahorro",
        date: s.date,
        amount: Number(s.amount),
      })),
    ];
    return items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 8);
  }, [currentMonth]);
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
      <LoadErrorBanner message={goalsError ? "No se pudieron cargar tus metas — el progreso de metas de abajo puede no ser exacto. Revisa tu conexión e intenta recargar la página." : ""} />
      <LoadErrorBanner message={patrimonioError ? "No se pudo cargar todo lo necesario para Dinero Actual y tus cuentas. Revisa tu conexión e intenta recargar la página." : ""} />
      {/* "Centro de control financiero" (Fase 1, 2026-08-07; rediseño de
          Inicio, 2026-08-08): arriba de todo va Dinero Actual (ahorros +
          saldo de tus cuentas, sin desglose de activos/pasivos), el resumen
          del mes (Disponible/Ingresos/Gastos/Ahorro), tus cuentas como
          tarjetas visuales y Próximos compromisos -- pensado para responder
          en segundos "¿cómo estoy?" sin tener que leer varios gráficos. El
          cuadro de "Atención" se quitó por pedido del usuario. Debajo de eso
          van los títulos "Resumen anual" (los 4 números "hero" del año) y
          "Resumen Mensual" (Panorama del año), y todo lo que ya existía más
          abajo (donut, Ingresos vs gastos, etc.) se dejó tal cual. */}
      <Card className="p-6">
        <Eyebrow>Dinero Actual</Eyebrow>
        {patrimonio ? (
          <>
            <p className="mt-1 text-[32px] font-extrabold leading-tight tracking-tight tabular-nums text-slate-900 dark:text-white">{fmt(patrimonio.activos)}</p>
            {patrimonio.deltaActivos !== 0 && (
              <p className={`mt-1 text-sm font-semibold ${patrimonio.deltaActivos >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                {patrimonio.deltaActivos >= 0 ? "↑" : "↓"} {fmt(Math.abs(patrimonio.deltaActivos))} este mes
              </p>
            )}
          </>
        ) : (
          <p className="mt-1 text-sm text-slate-400">Calculando…</p>
        )}
        <p className="mt-3 text-[11px] text-slate-400">Ahorros acumulados + saldo de tus cuentas.</p>
      </Card>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <Eyebrow>Disponible</Eyebrow>
          <p className="mt-1.5 text-xl font-bold tabular-nums text-slate-900 dark:text-white">{fmt(patrimonio ? patrimonio.totalCuentas : 0)}</p>
          <p className="mt-1.5 text-[11px] text-slate-400">Suma de tus cuentas, ver abajo</p>
        </Card>
        <Card className="p-4">
          <Eyebrow>Ingresos</Eyebrow>
          <p className="mt-1.5 text-xl font-bold tabular-nums text-slate-900 dark:text-white">{fmt(currentMonth.ingresoTotal)}</p>
          <div className="mt-1.5"><TrendBadge current={currentMonth.ingresoTotal} previous={prevMonthForTrend?.ingresoTotal} /></div>
        </Card>
        <Card className="p-4">
          <Eyebrow>Gastos</Eyebrow>
          <p className="mt-1.5 text-xl font-bold tabular-nums text-slate-900 dark:text-white">{fmt(currentMonth.gastoTotal)}</p>
          <div className="mt-1.5"><TrendBadge current={currentMonth.gastoTotal} previous={prevMonthForTrend?.gastoTotal} invert /></div>
        </Card>
        <Card className="p-4">
          <Eyebrow>Ahorro</Eyebrow>
          <p className="mt-1.5 text-xl font-bold tabular-nums text-slate-900 dark:text-white">
            {fmt(currentMonth.ahorroTotal)}
            {currentMonth.ingresoTotal > 0 && (
              <span className="ml-1.5 text-xs font-semibold text-slate-400">· {Math.round((currentMonth.ahorroTotal / currentMonth.ingresoTotal) * 100)}%</span>
            )}
          </p>
          <div className="mt-1.5"><TrendBadge current={currentMonth.ahorroTotal} previous={prevMonthForTrend?.ahorroTotal} /></div>
        </Card>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <Eyebrow>Tus cuentas</Eyebrow>
          {/* Dos botones (2026-08-08, a pedido del usuario): las tarjetas de
              crédito ahora se crean/editan/borran desde acá también (ya no
              desde el botón "Tarjetas" que vivía en Gastos), para que solo
              haya un lugar donde manejarlas. */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditingAccount({ account: null })}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <Plus size={13} /> Cuenta
            </button>
            <button
              onClick={() => setEditingCard({ card: null })}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <Plus size={13} /> Tarjeta
            </button>
          </div>
        </div>
        {accountCarouselItems.length === 0 ? (
          <Card className="p-5">
            <p className="text-sm text-slate-400">Todavía no tienes cuentas ni tarjetas. Agrega la primera con los botones de arriba.</p>
          </Card>
        ) : (
          <AccountsCarousel
            items={accountCarouselItems}
            fmt={fmt}
            onEdit={(item) => (item.kind === "cuenta" ? setEditingAccount({ account: item.data }) : setEditingCard({ card: item.data }))}
            onDelete={(item) => (item.kind === "cuenta" ? setDeletingAccount(item.data) : setDeletingCard(item.data))}
            onPay={(item) => setPayingCard(item.data)}
          />
        )}
      </div>
      <Card className="p-5">
        <Eyebrow>Próximos compromisos</Eyebrow>
        {proximosPagos.disabled ? (
          <p className="mt-3 text-sm text-slate-400">Cambia al año actual para ver tus próximos pagos.</p>
        ) : proximosPagos.items.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">No tienes pagos ni ingresos programados en los próximos 30 días.</p>
        ) : (
          <>
            <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
              {proximosPagos.items.map((it) => (
                <div key={it.id} className="flex items-center justify-between gap-2 py-2 text-sm first:pt-0">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="w-14 shrink-0 text-xs font-medium text-slate-400">
                      {dateStringDay(it.date)} {MONTHS[dateStringMonth(it.date) - 1]}
                    </span>
                    <span className="truncate text-slate-700 dark:text-slate-200">{it.label}</span>
                  </div>
                  <span className={`shrink-0 tabular-nums font-medium ${it.kind === "ingreso" ? "text-emerald-600" : "text-red-500"}`}>
                    {it.kind === "ingreso" ? "+" : "-"}{fmt(it.amount)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-dashed border-slate-200 pt-2 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <button onClick={() => onNavigateTab?.("calendar")} className="hover:text-slate-700 dark:hover:text-slate-200">Ver calendario completo</button>
              <span>Comprometido: {fmt(proximosPagos.totalComprometido)}</span>
            </div>
          </>
        )}
      </Card>
      <h2 className="pt-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Resumen anual</h2>
      {/* Rediseño de Reporte/Anual (2026-08-01) a partir de dos imágenes de
          referencia que trajo el usuario -- mismos datos y gráficos de
          siempre, reacomodados con más jerarquía visual: 4 números "hero"
          bien grandes arriba, una fila secundaria más chica debajo, y el
          desglose por categoría con % directo sobre el donut + un ranking en
          barras (mismo dato, dos ángulos). "Saldo disponible" se dejó de
          mostrar como tarjeta aparte -- "Balance neto" ya es la versión
          completa (también resta los ahorros), tenerlas las dos del mismo
          tamaño era redundante. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <HeroStat label="Ingresos del año" value={fmt(totals.ingresos)} accent="#10B981" />
        <HeroStat label="Gastos del año" value={fmt(totals.gastos)} accent="#EF4444" />
        <HeroStat label="Ahorros del año" value={fmt(totals.ahorros)} accent="#3B82F6" />
        <HeroStat
          label="Balance neto"
          value={fmt(totals.balance)}
          accent={totals.balance >= 0 ? "#10B981" : "#EF4444"}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="p-4 flex items-center gap-4">
          <ProgressRing percent={Math.min(100, Math.max(0, Math.round(savingsRate)))} color={healthStatus.color} size={48} />
          <div>
            <Eyebrow>Salud financiera</Eyebrow>
            <p className={`mt-0.5 text-base font-bold ${healthStatus.accentClass}`}>{healthStatus.label}</p>
            <p className="text-xs text-slate-400">
              {totals.ingresos > 0 ? `Ahorras un ${Math.round(savingsRate)}% de tus ingresos` : "Registra ingresos para verlo"}
            </p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          {totalMetaObjetivo > 0 ? (
            <>
              <ProgressRing percent={metaProgreso} color="#F59E0B" size={48} />
              <div>
                <Eyebrow>Progreso de tus metas</Eyebrow>
                <p className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">{metaProgreso}%</p>
                <p className="text-xs text-slate-400">{fmt(totalMetaActual)} de {fmt(totalMetaObjetivo)}</p>
              </div>
            </>
          ) : (
            <div>
              <Eyebrow>Progreso de tus metas</Eyebrow>
              <p className="mt-0.5 text-sm text-slate-400">Crea una meta en la pestaña Metas para ver tu progreso aquí.</p>
            </div>
          )}
        </Card>
      </div>
      <h2 className="pt-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Resumen Mensual</h2>
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <Eyebrow>Panorama del año</Eyebrow>
          <span className="text-xs text-slate-400">Clic en un mes para ver el detalle</span>
        </div>
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-12">
          {yearData.map((m, i) => {
            const st = statusOf(m.balance, m.ingresoTotal, cumulativeBalanceData[i].saldoAcumulado);
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
          <Eyebrow>Gastos por categoría (año completo)</Eyebrow>
          <div className="mt-4 h-72">
            {catTotalsYear.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={catTotalsYear} dataKey="value" nameKey="name"
                    innerRadius={55} outerRadius={90} paddingAngle={2}
                    label={renderDonutSliceLabel} labelLine={false}
                  >
                    {catTotalsYear.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmt(v)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} layout="vertical" align="right" verticalAlign="middle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                icon={TrendingDown}
                title="Aún no hay gastos este año"
                message="En cuanto registres el primero, vas a ver aquí cómo se reparte entre categorías."
                compact
                className="h-full"
              />
            )}
          </div>
        </Card>
        <Card className="p-5">
          <Eyebrow>Top 5 categorías de gasto</Eyebrow>
          <div className="mt-4 h-72">
            {topCategoriasGasto.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topCategoriasGasto} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 8 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} width={100} />
                  <Tooltip formatter={(v) => fmt(v)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={22}>
                    {topCategoriasGasto.map((d, i) => <Cell key={i} fill={d.color} />)}
                    <LabelList dataKey="value" position="right" formatter={(v) => `${Math.round(v / 1000)}k`} style={{ fontSize: 11, fontWeight: 700, fill: "#475569" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                icon={TrendingDown}
                title="Aún no hay gastos este año"
                message="En cuanto registres el primero, vas a ver aquí tu ranking de categorías."
                compact
                className="h-full"
              />
            )}
          </div>
        </Card>
      </div>
      {/* "Ingresos vs gastos" pasa a ocupar todo el ancho -- es el gráfico
          que más se consulta, así que en vez de compartir fila con otro (como
          antes) queda como la pieza principal, sin línea de cuadrícula para
          que se sienta más limpio (mismo criterio en los otros dos de abajo). */}
      <Card className="p-5">
        <Eyebrow>Ingresos vs gastos</Eyebrow>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData}>
              <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v) => fmt(v)} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Ingresos" fill="#22C55E" radius={[4, 4, 0, 0]} barSize={22} />
              <Bar dataKey="Gastos" fill="#EF4444" radius={[4, 4, 0, 0]} barSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
                <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v) => fmt(v)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Area type="monotone" dataKey="Ahorro" stroke="#3B82F6" strokeWidth={2} fill="url(#ahorroGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <Eyebrow>Balance mensual (comparación entre meses)</Eyebrow>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthCompare}>
                <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v) => fmt(v)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="Balance" radius={[4, 4, 0, 0]} barSize={22}>
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
      {/* Panel inferior de actividad reciente: mezcla ingresos, gastos y
          ahorros del mes elegido (recentActivity, ver arriba), lo más nuevo
          primero -- para tener, de un vistazo, "qué pasó últimamente" sin
          tener que entrar a Ingresos/Gastos/Ahorros por separado. */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-slate-400" />
            <Eyebrow>Actividad reciente</Eyebrow>
          </div>
          <span className="text-xs text-slate-400">{currentMonth.mesFull} {year}</span>
        </div>
        {recentActivity.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="Sin movimientos este mes todavía"
            message="Los ingresos, gastos y ahorros que registres van a aparecer aquí, con lo más reciente primero."
            compact
          />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {recentActivity.map((item) => {
              const isIncome = item.kind === "ingreso";
              const isSaving = item.kind === "ahorro";
              const Icon = isIncome ? TrendingUp : isSaving ? PiggyBank : (CATEGORY_META[item.sub]?.icon || MoreHorizontal);
              const color = isIncome ? "#22C55E" : isSaving ? "#3B82F6" : (item.color || CATEGORY_META[item.sub]?.color || "#64748B");
              const amountClass = isIncome
                ? "text-emerald-600 dark:text-emerald-400"
                : isSaving
                ? "text-blue-500 dark:text-blue-400"
                : "text-red-500 dark:text-red-400";
              const sign = isIncome ? "+" : "-";
              return (
                <div key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${color}1a`, color }}
                    >
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{item.label}</p>
                      <p className="truncate text-xs text-slate-400">
                        {item.sub ? `${item.sub} · ` : ""}{item.date}
                      </p>
                    </div>
                  </div>
                  <span className={`shrink-0 tabular-nums text-sm font-semibold ${amountClass}`}>
                    {sign}{fmt(item.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      {editingAccount && (
        <AccountModal
          account={editingAccount.account}
          onClose={() => setEditingAccount(null)}
          onSaved={() => { if (refetchAccounts) refetchAccounts(); }}
        />
      )}
      {deletingAccount && (
        <ConfirmDeleteModal
          title="Eliminar cuenta"
          message={`¿Seguro que quieres eliminar "${deletingAccount.name}"? Los ingresos/gastos que tengas ligados a ella no se borran, solo dejan de estar vinculados a ninguna cuenta.`}
          onCancel={() => setDeletingAccount(null)}
          onConfirm={() => handleDeleteAccount(deletingAccount.id)}
        />
      )}
      {editingCard && (
        <CreditCardModal
          card={editingCard.card}
          onClose={() => setEditingCard(null)}
          onSaved={() => { if (refetchCards) refetchCards(); refetchCardCharges(); }}
        />
      )}
      {deletingCard && (
        <ConfirmDeleteModal
          title="Eliminar tarjeta"
          message={`¿Seguro que quieres eliminar la tarjeta "${deletingCard.name}"? Los gastos que le hayas cargado no se borran, solo dejan de estar vinculados a esta tarjeta.`}
          onCancel={() => setDeletingCard(null)}
          onConfirm={() => handleDeleteCard(deletingCard.id)}
        />
      )}
      {payingCard && (
        <CardPaymentModal
          card={payingCard}
          accounts={accounts}
          onClose={() => setPayingCard(null)}
          onSaved={() => { refetchCardCharges(); if (refetchAccounts) refetchAccounts(); }}
        />
      )}
    </div>
  );
}
// Modal simple de crear/editar una cuenta -- mismo patrón que GoalModal
// (nombre + un par de campos + guardar), sin nada de "agregar/rebajar": el
// saldo es un número que se edita directo, como el "monto actual" de una
// meta.
// Marca de red genérica (2026-08-08) -- una aproximación estilizada, no el
// logo oficial de Visa/Mastercard (no podemos usar los logos reales), solo
// para distinguir de un vistazo qué red tiene cada tarjeta.
function NetworkMark({ network }) {
  if (network === "Visa") {
    return <span className="text-lg font-black italic tracking-tight text-white/90">VISA</span>;
  }
  if (network === "Mastercard") {
    return (
      <span className="flex items-center">
        <span className="h-6 w-6 rounded-full bg-red-500/90" />
        <span className="-ml-2.5 h-6 w-6 rounded-full bg-amber-400/90 mix-blend-screen" />
      </span>
    );
  }
  return null;
}
// Convierte un ítem del carrusel (una cuenta normal o una tarjeta de
// crédito) a la forma que espera AccountCard -- así el mismo componente
// visual sirve para las dos cosas sin tener que duplicarlo (2026-08-08).
function toCardView(item) {
  if (item.kind === "tarjeta") {
    const c = item.data;
    return { name: c.name, type: "Tarjeta de crédito", bank: c.bank, network: c.network, last4: c.last4, balance: item.balance };
  }
  const a = item.data;
  return { name: a.name, type: a.type, bank: a.bank, network: a.network, last4: a.last4, balance: item.balance };
}
// Tarjeta visual de una cuenta o tarjeta de crédito (2026-08-08, a pedido
// del usuario; saldo llevado adentro de la tarjeta, y look más realista
// -- chip metálico, ícono de contactless, banda diagonal decorativa -- a
// partir de varias capturas de tarjetas reales de bancos de Costa Rica que
// mandó de referencia): forma y textura de una tarjeta real, en el color
// del banco elegido -- NO es el logo real del banco (ni el ícono/isotipo de
// cada banco, ni el logo oficial de Visa/Mastercard), solo un color
// inspirado en su identidad más elementos genéricos de cualquier tarjeta
// (chip, contactless) que no son marca de nadie en particular. Para una
// tarjeta de crédito, el número no es "saldo" sino "deuda" (lo que has
// cargado menos lo que has pagado), así que la etiqueta cambia según "kind".
function AccountCard({ view, kind, fmt, onEdit, onDelete }) {
  const isCard = kind === "tarjeta";
  const bank = (isCard && CREDIT_CARD_BANK_OVERRIDES[view.bank])
    || BANKS.find((b) => b.name === view.bank)
    || BANKS[BANKS.length - 1];
  return (
    <div
      className="group relative flex aspect-[16/10] w-full flex-col justify-between overflow-hidden rounded-2xl p-5 text-white shadow-lg shadow-slate-900/10 sm:p-6"
      style={{ backgroundImage: `linear-gradient(135deg, ${bank.from}, ${bank.to})` }}
    >
      {/* Banda diagonal decorativa, genérica (no es el isotipo de ningún
          banco en particular) -- solo para que la tarjeta se sienta menos
          plana, como las de las capturas de referencia. */}
      <div
        className="pointer-events-none absolute -right-6 -top-10 h-40 w-40 rotate-12 rounded-3xl bg-white/10"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -right-2 -top-16 h-40 w-24 rotate-12 rounded-3xl bg-white/10"
        aria-hidden="true"
      />
      <div className="absolute right-3 top-3 flex gap-0.5 opacity-60 transition-opacity hover:opacity-100 group-hover:opacity-100">
        <button
          onClick={onEdit}
          aria-label={isCard ? "Editar tarjeta" : "Editar cuenta"}
          className="rounded-lg bg-black/20 p-1.5 text-white/90 backdrop-blur-sm hover:bg-black/35"
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={onDelete}
          aria-label={isCard ? "Eliminar tarjeta" : "Eliminar cuenta"}
          className="rounded-lg bg-black/20 p-1.5 text-white/90 backdrop-blur-sm hover:bg-black/35"
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div className="relative flex items-start justify-between gap-3 pr-14">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70">{isCard ? "Debes actualmente" : "Saldo actual"}</p>
          <p className="mt-1 truncate text-[28px] font-extrabold leading-tight tracking-tight text-white sm:text-[32px]">
            {fmt(view.balance)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-white/60">{view.bank || "Otro"}</p>
          <p className="mt-0.5 text-[10px] text-white/50">{view.type}</p>
        </div>
      </div>
      <div className="relative">
        {/* Chip metálico + contactless (2026-08-08): elementos genéricos de
            cualquier tarjeta física, no son marca de un banco -- se agregan
            para que se vea más real, como en las capturas de referencia. */}
        <div className="flex items-center gap-2">
          <div className="h-7 w-9 rounded-[5px] bg-gradient-to-br from-slate-200 via-slate-300 to-slate-400 shadow-inner">
            <div className="h-full w-full rounded-[5px] border border-slate-400/40" style={{ backgroundImage: "linear-gradient(to bottom, transparent 33%, rgba(100,116,139,0.5) 33%, rgba(100,116,139,0.5) 36%, transparent 36%, transparent 63%, rgba(100,116,139,0.5) 63%, rgba(100,116,139,0.5) 66%, transparent 66%)" }} />
          </div>
          <Wifi size={16} className="rotate-90 text-white/70" />
        </div>
        <p className="mt-2 font-mono text-sm tracking-[0.2em] text-white/90">
          •••• •••• •••• {view.last4 || "····"}
        </p>
        <div className="mt-2 flex items-end justify-between">
          <p className="min-w-0 truncate text-sm font-medium text-white/80">{view.name}</p>
          <NetworkMark network={view.network} />
        </div>
      </div>
    </div>
  );
}
// Carrusel de cuentas y tarjetas (2026-08-08, a pedido del usuario, a partir
// de una captura de referencia): una tarjeta a la vez con flechitas a los
// lados en pantallas grandes, flechitas debajo en móvil, y puntos indicando
// cuántas hay. Si solo hay una, no se muestran ni flechitas ni puntos. Las
// tarjetas de crédito (kind === "tarjeta") además muestran un botón
// "Registrar pago" debajo, para bajar su deuda.
function AccountsCarousel({ items, fmt, onEdit, onDelete, onPay }) {
  const [index, setIndex] = useState(0);
  const count = items.length;
  const safeIndex = count ? ((index % count) + count) % count : 0;
  const item = items[safeIndex];
  function prev() {
    setIndex((i) => (i - 1 + count) % count);
  }
  function next() {
    setIndex((i) => (i + 1) % count);
  }
  if (!item) return null;
  const view = toCardView(item);
  return (
    <div>
      <div className="flex items-center gap-3">
        {count > 1 && (
          <button
            onClick={prev}
            aria-label="Anterior"
            className="hidden shrink-0 items-center justify-center rounded-full border border-slate-200 p-2 text-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 sm:flex"
          >
            <ChevronLeft size={18} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <AccountCard
            view={view}
            kind={item.kind}
            fmt={fmt}
            onEdit={() => onEdit(item)}
            onDelete={() => onDelete(item)}
          />
          {item.kind === "tarjeta" && (
            <button
              onClick={() => onPay(item)}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Landmark size={13} /> Registrar pago
            </button>
          )}
        </div>
        {count > 1 && (
          <button
            onClick={next}
            aria-label="Siguiente"
            className="hidden shrink-0 items-center justify-center rounded-full border border-slate-200 p-2 text-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 sm:flex"
          >
            <ChevronRight size={18} />
          </button>
        )}
      </div>
      {count > 1 && (
        <div className="mt-3 flex items-center justify-center gap-4 sm:hidden">
          <button
            onClick={prev}
            aria-label="Anterior"
            className="rounded-full border border-slate-200 p-2 text-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-500 dark:hover:bg-slate-800"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={next}
            aria-label="Siguiente"
            className="rounded-full border border-slate-200 p-2 text-slate-400 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-500 dark:hover:bg-slate-800"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
      {count > 1 && (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {items.map((it, i) => (
            <button
              key={`${it.kind}-${it.id}`}
              onClick={() => setIndex(i)}
              aria-label={`Ir al ítem ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === safeIndex ? "w-5 bg-slate-700 dark:bg-white" : "w-1.5 bg-slate-300 dark:bg-slate-600"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
function AccountModal({ account, onClose, onSaved }) {
  const isEditing = Boolean(account);
  const [name, setName] = useState(account?.name || "");
  const [type, setType] = useState(account?.type || ACCOUNT_TYPES[0]);
  const [bank, setBank] = useState(account?.bank || BANKS[0].name);
  const [network, setNetwork] = useState(account?.network || CARD_NETWORKS[0]);
  const [last4, setLast4] = useState(account?.last4 || "");
  const [balance, setBalance] = useState(account ? String(account.current_balance) : "0");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  async function handleSubmit(e) {
    e.preventDefault();
    if (!name) {
      setErrorMsg("Ponle un nombre a la cuenta.");
      return;
    }
    setSaving(true);
    setErrorMsg("");
    const payload = {
      name, type, bank,
      network: network === "Ninguna" ? null : network,
      last4: last4 ? last4.slice(-4) : null,
      current_balance: Number(balance) || 0,
    };
    if (isEditing) {
      const { error } = await supabase.from("accounts").update(payload).eq("id", account.id);
      setSaving(false);
      if (error) { setErrorMsg("Error al guardar: " + error.message); return; }
      onSaved();
      onClose();
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    const { error } = await supabase.from("accounts").insert({ ...payload, user_id: userId || null });
    setSaving(false);
    if (error) { setErrorMsg("Error al guardar: " + error.message); return; }
    onSaved();
    onClose();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-xl shadow-slate-900/10 dark:border-slate-800/60 dark:bg-slate-900 dark:shadow-black/40">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{isEditing ? "Editar cuenta" : "Nueva cuenta"}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Nombre</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Cuenta Colones" className={`mt-1 ${INPUT_CLASS}`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Banco</label>
              <select value={bank} onChange={(e) => setBank(e.target.value)} className={`mt-1 ${INPUT_CLASS}`}>
                {BANKS.map((b) => <option key={b.name}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Tipo</label>
              <select value={type} onChange={(e) => setType(e.target.value)} className={`mt-1 ${INPUT_CLASS}`}>
                {ACCOUNT_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Red</label>
              <select value={network} onChange={(e) => setNetwork(e.target.value)} className={`mt-1 ${INPUT_CLASS}`}>
                {CARD_NETWORKS.map((n) => <option key={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Últimos 4 dígitos</label>
              <input
                value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="1234" inputMode="numeric" className={`mt-1 ${INPUT_CLASS}`}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {isEditing ? "Saldo actual" : "Saldo de hoy"}
            </label>
            <input type="number" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0" className={`mt-1 ${INPUT_CLASS}`} />
            {!isEditing && <p className="mt-1 text-xs text-slate-400">Este es el punto de partida -- no hace falta cargar movimientos viejos.</p>}
          </div>
          {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}
          <button
            type="submit" disabled={saving}
            className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
          >
            {saving ? "Guardando..." : isEditing ? "Guardar cambios" : "Crear cuenta"}
          </button>
        </form>
      </div>
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
            Solo lo programado (cuotas, fijos). Lo que registras a mano no aparece aquí.
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
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-xl shadow-slate-900/10 dark:border-slate-800/60 dark:bg-slate-900 dark:shadow-black/40">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{day} de {monthLabel}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>
        <p className="mb-4 text-xs text-slate-400">Lo programado para este día.</p>
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
          {items.map((it) => (
            <div key={it.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-700 dark:text-slate-200">{it.label}</p>
                {it.sub && <p className="truncate text-xs text-slate-400">{it.sub}</p>}
              </div>
              <span className={`shrink-0 tabular-nums font-medium ${it.kind === "ingreso" ? "text-emerald-600" : "text-red-500"}`}>
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
  const pieData = categoriasDelMes.map((cat) => {
    const conColor = m.gastos.find((e) => e.categoria === cat && e.color);
    return {
      name: cat,
      value: m.gastos.filter((e) => e.categoria === cat).reduce((a, e) => a + e.monto, 0),
      color: conColor?.color || CATEGORY_META[cat]?.color || "#64748B",
    };
  }).filter((d) => d.value > 0);
  const tipToneClasses = {
    red: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
    green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-8" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl animate-[fadeIn_.25s_ease] rounded-2xl border border-slate-100 bg-white shadow-xl shadow-slate-900/10 dark:border-slate-800/60 dark:bg-slate-900 dark:shadow-black/40"
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
            <CollapsibleSection
              open={tipsOpen}
              onToggle={() => setTipsOpen((v) => !v)}
              buttonClassName="flex w-full items-center justify-between gap-2 rounded-lg py-1 text-left hover:opacity-80"
              header={
                <span className="flex items-center gap-2">
                  <Sparkles size={16} className="text-amber-500" />
                  <Eyebrow>Consejos para este mes</Eyebrow>
                </span>
              }
            >
              <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {tips.map((t, i) => (
                  <li key={i} className={`rounded-xl px-4 py-3 text-sm ${tipToneClasses[t.level]}`}>
                    {t.text}
                  </li>
                ))}
              </ul>
            </CollapsibleSection>
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
                  <Row key={s.id} label={s.type} value={fmt(s.amount)} />
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
                // El ícono sigue viniendo de la tabla fija del código (el
                // ícono guardado en Supabase no está conectado a ningún
                // componente real todavía en ningún lado de la app); el
                // color en cambio usa el real de la categoría (Supabase) si
                // este gasto lo trae, para que coincida con Gastos/Presupuestos.
                const Icon = CATEGORY_META[e.categoria]?.icon || MoreHorizontal;
                const color = e.color || CATEGORY_META[e.categoria]?.color || "#64748B";
                return (
                  <div key={e.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}1a`, color }}>
                        <Icon size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-700 dark:text-slate-200">{e.descripcion}</p>
                        <p className="truncate text-xs text-slate-400">
                          {e.categoria} · {e.fechaCompra || e.fecha}
                          {e.fechaCompra && e.fechaCompra !== e.fecha && ` · pago: ${e.fecha}`}
                          {e.tarjeta && ` · ${e.tarjeta}`}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 tabular-nums font-medium text-slate-700 dark:text-slate-200">{fmt(e.monto)}</span>
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
/* ---------------------------------------------------------------
   QUINCENAS
------------------------------------------------------------------ */
// Pestaña dedicada a ver el dinero disponible por quincena (o por mes
// completo) -- agregada el 2026-07-30, corregida el mismo día después de que
// el usuario, ya probándola con números reales, explicara que la quincena de
// CALENDARIO (1-15 / 16-fin de mes) no coincidía con su ciclo real de pago:
// su sueldo del día 30 financia del 30 al 14 del mes SIGUIENTE (cruza de mes
// calendario), no "16 a fin de mes" -- por eso ahora el modo "Quincenal" usa
// `computePaydayPeriods` (períodos anclados a sus días de pago reales, 15 y
// 30) en vez de la quincena de calendario. El modo "Mes completo" no cambió
// -- un mes calendario siempre incluye los dos pagos, así que no tenía el
// mismo problema.
function QuincenasView({ fmt, yearData, year, month, onJumpToMonth }) {
  const [modo, setModo] = useState("quincenal"); // "quincenal" | "mensual" | "personalizado"
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("Todas");
  // "Personalizado": el usuario elige dos fechas cualquiera en vez de una
  // quincena o un mes completo -- a pedido del usuario (2026-07-31), para
  // preguntas puntuales que no calzan con esos dos ("cuánto gasté en mi
  // viaje", "cuánto llevo desde que cobré hasta hoy"). Arranca en el mes
  // elegido arriba (mismo mes/año de las flechitas del encabezado) para no
  // partir de fechas vacías -- el usuario las ajusta desde ahí. Acotado al
  // año elegido (min/max de los inputs) porque `yearData` solo trae ese año.
  const monthLastDay = new Date(year, month + 1, 0).getDate();
  const monthStr = String(month + 1).padStart(2, "0");
  const [customStart, setCustomStart] = useState(`${year}-${monthStr}-01`);
  const [customEnd, setCustomEnd] = useState(`${year}-${monthStr}-${String(monthLastDay).padStart(2, "0")}`);
  function formatCustomDate(dateStr) {
    if (!dateStr) return "";
    return `${dateStringDay(dateStr)} de ${MONTHS_FULL[dateStringMonth(dateStr) - 1]}`;
  }
  const cumulativeBalanceData = useMemo(() => computeCumulativeBalanceData(yearData), [yearData]);
  const paydayPeriods = useMemo(() => computePaydayPeriods(yearData, year), [yearData, year]);
  // Índice del período de pago elegido (0 a ~24 por año). Por defecto, el
  // período que contiene el día de hoy (si se está viendo el año real
  // actual); si no, el último período del año elegido -- mismo criterio que
  // ya se usaba antes para "el cierre" de un período no-actual.
  const todayStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }, []);
  const defaultPayIndex = (periods) => {
    const idx = periods.findIndex((p) => todayStr >= p.start && todayStr < p.end);
    return idx >= 0 ? idx : periods.length - 1;
  };
  const [payIndex, setPayIndex] = useState(() => defaultPayIndex(paydayPeriods));
  useEffect(() => {
    setPayIndex(defaultPayIndex(paydayPeriods));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);
  const isQuincenal = modo === "quincenal";
  const isCustom = modo === "personalizado";
  const m = yearData[month];
  const currentPeriod = isQuincenal ? paydayPeriods[payIndex] : null;
  // Para el modo Quincenal, los movimientos de un período pueden venir de DOS
  // meses distintos (ej. el período que arranca el 30 de julio incluye
  // también días de agosto) -- por eso se filtra por fecha real sobre TODOS
  // los movimientos del año, en vez de sobre el mes elegido en el
  // encabezado (que solo se usa para el modo "Mes completo"). El modo
  // "Personalizado" reutiliza estos mismos arreglos planos, filtrando entre
  // las dos fechas que elija el usuario en vez de entre los límites de una
  // quincena.
  const allGastosFlat = useMemo(() => yearData.flatMap((mm) => mm.gastos), [yearData]);
  const allIncomesFlat = useMemo(() => yearData.flatMap((mm) => mm.incomes), [yearData]);
  const allSavingsFlat = useMemo(() => yearData.flatMap((mm) => mm.savings), [yearData]);
  const gastosPeriodo = isQuincenal
    ? allGastosFlat.filter((e) => e.fecha >= currentPeriod.start && e.fecha < currentPeriod.end)
    : isCustom
    ? allGastosFlat.filter((e) => e.fecha >= customStart && e.fecha <= customEnd)
    : m.gastos;
  const incomesPeriodo = isQuincenal
    ? allIncomesFlat.filter((i) => i.date >= currentPeriod.start && i.date < currentPeriod.end)
    : isCustom
    ? allIncomesFlat.filter((i) => i.date >= customStart && i.date <= customEnd)
    : m.incomes;
  const savingsPeriodo = isQuincenal
    ? allSavingsFlat.filter((s) => s.date >= currentPeriod.start && s.date < currentPeriod.end)
    : isCustom
    ? allSavingsFlat.filter((s) => s.date >= customStart && s.date <= customEnd)
    : m.savings;
  const ingresoTotal = isQuincenal ? currentPeriod.ingreso : isCustom ? incomesPeriodo.reduce((a, i) => a + Number(i.amount), 0) : m.ingresoTotal;
  const gastoTotal = isQuincenal ? currentPeriod.gasto : isCustom ? gastosPeriodo.reduce((a, e) => a + Number(e.monto), 0) : m.gastoTotal;
  const ahorroTotal = isQuincenal ? currentPeriod.ahorro : isCustom ? savingsPeriodo.reduce((a, s) => a + Number(s.amount), 0) : m.ahorroTotal;
  // Saldo inicial en modo Personalizado: la misma suma corrida de siempre
  // (ingresos - gastos - ahorros, empezando en ₡0 el 1° de enero), pero
  // calculada solo con lo que pasó ANTES de la fecha de inicio elegida --
  // así "Saldo disponible" sigue siendo el monto real disponible, no solo lo
  // que entra y sale dentro del rango.
  const saldoInicialCustom = isCustom
    ? allIncomesFlat.filter((i) => i.date < customStart).reduce((a, i) => a + Number(i.amount), 0) -
      allGastosFlat.filter((e) => e.fecha < customStart).reduce((a, e) => a + Number(e.monto), 0) -
      allSavingsFlat.filter((s) => s.date < customStart).reduce((a, s) => a + Number(s.amount), 0)
    : 0;
  const saldoInicial = isQuincenal
    ? (payIndex > 0 ? paydayPeriods[payIndex - 1].saldoAcumulado : 0)
    : isCustom
    ? saldoInicialCustom
    : (month > 0 ? cumulativeBalanceData[month - 1].saldoAcumulado : 0);
  const saldoFinal = isQuincenal
    ? currentPeriod.saldoAcumulado
    : isCustom
    ? saldoInicialCustom + ingresoTotal - gastoTotal - ahorroTotal
    : cumulativeBalanceData[month].saldoAcumulado;
  const periodShort = isQuincenal ? currentPeriod.longLabel : isCustom ? `${formatCustomDate(customStart)} al ${formatCustomDate(customEnd)}` : m.mesFull;
  // Balance SOLO de este período (ingresos - gastos - ahorros de este período
  // puntual, sin sumarle el arrastre de antes) -- a pedido del usuario
  // (2026-07-30): "Saldo disponible" de arriba es el monto real acumulado
  // desde enero (útil para saber cuánto tenés de verdad), pero no deja ver de
  // un vistazo si ESTE ciclo puntual (este sueldo) rindió o no, sin mezclarlo
  // con lo de antes.
  const balancePeriodo = isQuincenal
    ? currentPeriod.balanceDelPeriodo
    : isCustom
    ? ingresoTotal - gastoTotal - ahorroTotal
    : cumulativeBalanceData[month].balanceDelMes;
  const filteredExpenses = gastosPeriodo.filter((e) =>
    (catFilter === "Todas" || e.categoria === catFilter) &&
    e.descripcion.toLowerCase().includes(search.toLowerCase())
  );
  const categoriasDelPeriodo = [...new Set(gastosPeriodo.map((e) => e.categoria))];
  const pieData = categoriasDelPeriodo.map((cat) => {
    const conColor = gastosPeriodo.find((e) => e.categoria === cat && e.color);
    return {
      name: cat,
      value: gastosPeriodo.filter((e) => e.categoria === cat).reduce((a, e) => a + e.monto, 0),
      color: conColor?.color || CATEGORY_META[cat]?.color || "#64748B",
    };
  }).filter((d) => d.value > 0);
  const chartData = isQuincenal ? paydayPeriods : cumulativeBalanceData;
  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Eyebrow>Saldo disponible</Eyebrow>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">{isCustom ? `Del ${periodShort}` : `Al ${periodShort}`}</p>
            <p className={`text-2xl font-semibold tabular-nums ${saldoFinal >= 0 ? "text-slate-900 dark:text-white" : "text-red-500"}`}>
              {fmt(saldoFinal)}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="max-w-xs">
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Modo</label>
            <select value={modo} onChange={(e) => setModo(e.target.value)} className={`mt-1 ${INPUT_CLASS}`}>
              <option value="quincenal">Quincenal</option>
              <option value="mensual">Mes completo</option>
              <option value="personalizado">Personalizado</option>
            </select>
          </div>
          {isCustom && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date" value={customStart}
                min={`${year}-01-01`} max={customEnd || `${year}-12-31`}
                onChange={(e) => setCustomStart(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <span className="text-sm text-slate-400">a</span>
              <input
                type="date" value={customEnd}
                min={customStart || `${year}-01-01`} max={`${year}-12-31`}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          )}
          {isQuincenal && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPayIndex((i) => Math.max(0, i - 1))}
                disabled={payIndex === 0}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="whitespace-nowrap text-sm font-medium text-slate-600 dark:text-slate-300">{currentPeriod.longLabel}</span>
              <button
                onClick={() => setPayIndex((i) => Math.min(paydayPeriods.length - 1, i + 1))}
                disabled={payIndex === paydayPeriods.length - 1}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatMini label="Saldo inicial" value={fmt(saldoInicial)} color={saldoInicial >= 0 ? "text-slate-500 dark:text-slate-400" : "text-red-500"} />
        <StatMini label="Ingresos" value={fmt(ingresoTotal)} color="text-emerald-600" />
        <StatMini label="Gastos" value={fmt(gastoTotal)} color="text-red-500" />
        <StatMini label="Ahorros" value={fmt(ahorroTotal)} color="text-blue-500" />
      </div>
      <div className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3 ${balancePeriodo >= 0 ? "bg-emerald-50 dark:bg-emerald-500/10" : "bg-red-50 dark:bg-red-500/10"}`}>
        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
          Balance de {isQuincenal ? "esta quincena" : "este mes"}
        </span>
        <span className={`text-lg font-semibold tabular-nums ${balancePeriodo >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
          {fmt(balancePeriodo)}
        </span>
      </div>
      {/* En modo Personalizado no hay una secuencia de períodos que graficar
          (es un solo rango puntual), así que esta tarjeta se omite en vez de
          mostrar un gráfico que no tendría un eje natural. */}
      {!isCustom && (
        <Card className="p-5">
          <Eyebrow>Saldo acumulado {isQuincenal ? "por quincena" : "por mes"}</Eyebrow>
          <p className="mt-1 text-xs text-slate-400">Clic en un punto para saltar {isQuincenal ? "a ese período" : "a ese mes"}.</p>
          <div className="mt-2 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ left: 4, right: 12 }}
                onClick={(e) => {
                  if (!e || typeof e.activeTooltipIndex !== "number") return;
                  if (isQuincenal) setPayIndex(e.activeTooltipIndex);
                  else onJumpToMonth(e.activeTooltipIndex);
                }}
                style={{ cursor: "pointer" }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey={isQuincenal ? "label" : "mes"} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} interval={isQuincenal ? 1 : 0} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip
                  formatter={(v) => fmt(v)}
                  labelFormatter={(l) => (isQuincenal ? paydayPeriods.find((d) => d.label === l)?.longLabel : l) || l}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                />
                {/* Línea de referencia en ₡0: cruzar por debajo de ella es la
                    señal real de "te quedaste sin dinero", no solo un período
                    con balance aislado negativo (ver statusOf en Resumen, que
                    sigue usando el acumulado MENSUAL para el semáforo de
                    "Panorama del año"). */}
                <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="saldoAcumulado" name="Saldo acumulado" stroke="#6366F1" strokeWidth={2} dot={{ r: 3, fill: "#6366F1", strokeWidth: 0 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <Eyebrow>Ingresos del período</Eyebrow>
          <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
            {incomesPeriodo.length === 0 && <p className="px-4 py-4 text-sm text-slate-400">Sin ingresos registrados.</p>}
            {incomesPeriodo.map((inc) => (
              <Row key={inc.id} label={inc.description || inc.type} value={fmt(inc.amount)} />
            ))}
          </div>
          <Eyebrow>
            <span className="mt-6 block">Ahorros del período</span>
          </Eyebrow>
          <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
            {savingsPeriodo.length === 0 && <p className="px-4 py-4 text-sm text-slate-400">Sin ahorros registrados.</p>}
            {savingsPeriodo.map((s) => (
              <Row key={s.id} label={s.type} value={fmt(s.amount)} />
            ))}
            <Row label="Total del período" value={fmt(ahorroTotal)} bold />
          </div>
        </div>
        <Card className="p-5">
          <Eyebrow>Gastos por categoría</Eyebrow>
          <div className="mt-4 h-72">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData} dataKey="value" nameKey="name"
                    innerRadius={55} outerRadius={90} paddingAngle={2}
                    label={renderDonutSliceLabel} labelLine={false}
                  >
                    {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmt(v)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} layout="vertical" align="right" verticalAlign="middle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-slate-400">Sin gastos en este período.</p>
            )}
          </div>
        </Card>
      </div>
      <Card className="p-5">
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
              {categoriasDelPeriodo.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
          {filteredExpenses.map((e) => {
            const Icon = CATEGORY_META[e.categoria]?.icon || MoreHorizontal;
            const color = e.color || CATEGORY_META[e.categoria]?.color || "#64748B";
            return (
              <div key={e.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}1a`, color }}>
                    <Icon size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-700 dark:text-slate-200">{e.descripcion}</p>
                    <p className="truncate text-xs text-slate-400">
                      {e.categoria} · {e.fechaCompra || e.fecha}
                      {e.fechaCompra && e.fechaCompra !== e.fecha && ` · pago: ${e.fecha}`}
                      {e.tarjeta && ` · ${e.tarjeta}`}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 tabular-nums font-medium text-slate-700 dark:text-slate-200">{fmt(e.monto)}</span>
              </div>
            );
          })}
          {filteredExpenses.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-400">Sin resultados para este filtro.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
/* ---------------------------------------------------------------
   REPORTE (Anual / Mensual)
------------------------------------------------------------------ */
// Nota histórica: esto fue una sola pestaña "Reporte" con un interruptor
// interno "Anual" / "Mensual y quincenal" (agregado el 2026-07-30, fusionando
// lo que antes eran dos pestañas separadas). El 2026-08-01 el usuario decidió
// volver a separarlas en dos pestañas propias -- "Anual" y "Mensual" -- para
// que Reporte no fuera la única pestaña de la app con una vista escondida
// detrás de un selector interno. `Dashboard` y `QuincenasView` (más abajo) no
// cambiaron por dentro; ahora se renderizan directo desde `FinanceApp` según
// el tab elegido, sin ningún componente interruptor en el medio.
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
// Sugiere cuánto sería razonable aportar a una meta puntual EN EL MES
// ELEGIDO (las flechitas "‹ Mes Año ›" arriba del título de Metas), sin
// afectar las demás finanzas. Las metas no tienen fecha límite (no hay
// columna para eso todavía), así que el consejo no se basa en "cuántos
// meses faltan" — se basa en lo que de verdad sobra en ese mes en la vida
// real de la persona: `monthBalance` es el mismo "balance" que ya calcula
// fetchYearData (ingresos - gastos - ahorros ya registrados) para el mes
// elegido, tomado directamente del `yearData` que ya carga toda la app (no
// hace falta una consulta aparte). Se recomienda hasta un 30% de ese
// sobrante — nunca más de lo que sobra, ni más de lo que falta para
// completar la meta — para dejar margen para imprevistos y no comprometer
// todo el dinero disponible en una sola meta.
function buildGoalSavingsTip(remaining, monthBalance, monthLabel, fmt) {
  if (remaining <= 0) {
    return { level: "green", text: "¡Ya completaste esta meta! No hace falta aportar más, a menos que quieras seguir acumulando." };
  }
  if (monthBalance == null) return null; // todavía cargando el balance del mes
  if (monthBalance <= 0) {
    return {
      level: "red",
      text: `En ${monthLabel} tus gastos y ahorros ya igualan o superan tus ingresos, así que no queda margen para aportar a esta meta sin afectar tus finanzas ese mes.`,
    };
  }
  let suggested = Math.min(remaining, monthBalance * 0.3);
  if (suggested >= 1000) suggested = Math.round(suggested / 1000) * 1000; // redondeado a miles, se ve más limpio
  suggested = Math.min(suggested, monthBalance); // por si acaso el redondeo lo pasara del margen real
  if (suggested >= remaining) {
    return {
      level: "green",
      text: `Con ${fmt(remaining)} completarías esta meta, y tu margen en ${monthLabel} (${fmt(monthBalance)}) alcanza sin problema — podrías completarla sin afectar tus finanzas.`,
    };
  }
  return {
    level: "amber",
    text: `En ${monthLabel} lo recomendable sería ahorrar ${fmt(suggested)} para esta meta, sin afectar tus finanzas (hasta un 30% de lo que te queda disponible ese mes: ${fmt(monthBalance)}).`,
  };
}
// Estima para cuándo se completaría una meta si se sigue aportando al mismo
// ritmo promedio de hasta ahora — inspirado en el "oráculo" de una plantilla
// de Excel que el usuario vio en Instagram (2026-07-28). Se basa en los
// ahorros de la pestaña Ahorros vinculados a esta meta (mismo dato que ya se
// ve en "Ver aportes"), NO en ajustes manuales hechos con "Actualizar
// monto" — esos no quedan guardados con fecha, así que no hay forma de
// incluirlos en un promedio mensual real.
function estimateGoalForecast(goal, contributions) {
  const remaining = Number(goal.target_amount) - Number(goal.current_amount);
  if (remaining <= 0) return { status: "completed" };
  if (!contributions || contributions.length === 0) return { status: "no-data" };
  const sorted = [...contributions].sort((a, b) => a.date.localeCompare(b.date));
  const firstDate = sorted[0].date;
  const today = localDateString();
  const totalContributed = contributions.reduce((a, c) => a + Number(c.amount), 0);
  // Meses transcurridos desde el primer aporte hasta hoy — con un piso de 1
  // mes, para no sobreestimar el ritmo si todos los aportes fueron dentro
  // del mismo mes.
  const monthsElapsed = Math.max(
    1,
    (dateStringYear(today) - dateStringYear(firstDate)) * 12 + (dateStringMonth(today) - dateStringMonth(firstDate))
  );
  const avgMonthly = totalContributed / monthsElapsed;
  if (avgMonthly <= 0) return { status: "no-pace" };
  const monthsNeeded = Math.ceil(remaining / avgMonthly);
  const targetDate = addMonthsToDateString(today, monthsNeeded);
  return { status: "ok", avgMonthly, targetDate };
}
function GoalsView({ fmt, yearData, month }) {
  const [goals, setGoals] = useState([]);
  const [contributions, setContributions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  // Balance del mes elegido con las flechitas de arriba (ingresos - gastos -
  // ahorros), para el consejo de "cuánto aportar a esta meta sin afectar tus
  // finanzas" dentro de "Ver aportes". Se toma directo del `yearData` que ya
  // carga la app entera — no hace falta una consulta aparte. Mientras
  // `yearData` todavía no llega (primera carga), queda en null y el consejo
  // simplemente no se muestra todavía (ver buildGoalSavingsTip).
  const selectedMonthBalance = yearData ? yearData[month].balance : null;
  const [showModal, setShowModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [deletingGoal, setDeletingGoal] = useState(null);
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
      setLoadError(
        error || contribError
          ? "No se pudieron cargar tus metas. Revisa tu conexión e intenta recargar la página."
          : ""
      );
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
    return <CardGridSkeleton count={3} />;
  }
  return (
    <div className="space-y-4">
      <LoadErrorBanner message={loadError} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {goals.map((g) => {
        const pct = Math.min(100, Math.round((g.current_amount / g.target_amount) * 100));
        const Icon = Target;
        const forecast = estimateGoalForecast(g, contributions.filter((c) => c.goal_id === g.id));
        return (
          <Card key={g.id} className="p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${g.color}1a`, color: g.color }}>
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800 dark:text-white">{g.name}</p>
                  <p className="truncate text-xs text-slate-400">{fmt(g.current_amount)} de {fmt(g.target_amount)}</p>
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
            {forecast.status === "ok" && (
              <p className="mt-1.5 text-xs text-slate-400">
                A este ritmo (~{fmt(Math.round(forecast.avgMonthly))}/mes), la completarías en{" "}
                <span className="font-medium text-slate-600 dark:text-slate-300">
                  {MONTHS_FULL[dateStringMonth(forecast.targetDate) - 1]} {dateStringYear(forecast.targetDate)}
                </span>.
              </p>
            )}
            <div className="mt-3">
              <button
                onClick={() => setViewingContributionsGoal(g)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
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
      {viewingContributionsGoal && (
        <GoalContributionsListModal
          goal={viewingContributionsGoal}
          contributions={contributions.filter((c) => c.goal_id === viewingContributionsGoal.id)}
          fmt={fmt}
          selectedMonthBalance={selectedMonthBalance}
          monthLabel={MONTHS_FULL[month]}
          onClose={() => setViewingContributionsGoal(null)}
        />
      )}
      </div>
    </div>
  );
}
// Solo lectura: muestra los ahorros de la pestaña Ahorros que se vincularon
// a esta meta. Para editarlos o borrarlos, se hace desde Ahorros (ahí vive
// el registro real); esto evita duplicar esa lógica en dos lugares.
function GoalContributionsListModal({ goal, contributions, fmt, selectedMonthBalance, monthLabel, onClose }) {
  const total = contributions.reduce((a, c) => a + Number(c.amount), 0);
  // Consejo desplegable de cuánto aportar en el mes elegido (las flechitas
  // de arriba) sin afectar las finanzas — empieza cerrado, la persona decide
  // si lo quiere ver.
  const [tipOpen, setTipOpen] = useState(false);
  const remaining = Math.max(0, Number(goal.target_amount) - Number(goal.current_amount));
  const tip = buildGoalSavingsTip(remaining, selectedMonthBalance, monthLabel, fmt);
  const tipToneClasses = {
    red: { icon: "text-red-500", border: "border-red-100 dark:border-red-500/20", text: "text-red-600 dark:text-red-400" },
    amber: { icon: "text-amber-500", border: "border-amber-100 dark:border-amber-500/20", text: "text-amber-700 dark:text-amber-400" },
    green: { icon: "text-emerald-500", border: "border-emerald-100 dark:border-emerald-500/20", text: "text-emerald-700 dark:text-emerald-400" },
  };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-8" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl border border-slate-100 bg-white p-6 shadow-xl shadow-slate-900/10 dark:border-slate-800/60 dark:bg-slate-900 dark:shadow-black/40">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Aportes · {goal.name}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>
        <p className="mb-4 text-xs text-slate-400">
          Ahorros de la pestaña Ahorros vinculados a esta meta. Para editar o eliminar alguno, hazlo desde ahí.
        </p>
        {tip && (
          <div className="mb-4 overflow-hidden rounded-xl border border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setTipOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left"
            >
              <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                <Sparkles size={13} className={tipToneClasses[tip.level].icon} />
                Consejo para esta meta
              </span>
              <ChevronRight size={14} className={`shrink-0 text-slate-400 transition-transform ${tipOpen ? "rotate-90" : ""}`} />
            </button>
            {tipOpen && (
              <p className={`border-t px-4 py-2.5 text-xs ${tipToneClasses[tip.level].border} ${tipToneClasses[tip.level].text}`}>
                {tip.text}
              </p>
            )}
          </div>
        )}
        <div className="max-h-[55vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
          {contributions.map((c) => {
            return (
              <div key={c.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-700 dark:text-slate-200">{c.type}</p>
                  <p className="text-xs text-slate-400">{c.date}</p>
                </div>
                <span className="shrink-0 tabular-nums font-medium text-blue-500">{fmt(c.amount)}</span>
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
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-xl shadow-slate-900/10 dark:border-slate-800/60 dark:bg-slate-900 dark:shadow-black/40">
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
              className={`mt-1 ${INPUT_CLASS}`}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Monto objetivo</label>
              <input
                type="number" value={objetivo} onChange={(e) => setObjetivo(e.target.value)}
                placeholder="1000000"
                className={`mt-1 ${INPUT_CLASS}`}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Monto actual</label>
              <input
                type="number" value={actual} onChange={(e) => setActual(e.target.value)}
                placeholder="0"
                className={`mt-1 ${INPUT_CLASS}`}
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
function IncomesView({ fmt, onDataChanged, year, month, accounts }) {
  const [incomes, setIncomes] = useState([]);
  const [recurring, setRecurring] = useState([]);
  // Tipos de ingreso (ej. "Salario", "Freelance"): no dependen del año/mes
  // elegido, así que se cargan una sola vez, no cada vez que cambia el año.
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingIncome, setEditingIncome] = useState(null);
  const [deletingIncome, setDeletingIncome] = useState(null);
  const [showRecurringModal, setShowRecurringModal] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState(null);
  const [deletingRecurring, setDeletingRecurring] = useState(null);
  const [showTypesManager, setShowTypesManager] = useState(false);
  // La lista de "Ingresos fijos" es retráctil (empieza cerrada) para no
  // ocupar espacio de entrada — mismo patrón que "Consejos para este mes".
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [loadError, setLoadError] = useState("");
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
  async function refetchTypes() {
    const { data } = await supabase.from("income_types").select("*").order("name", { ascending: true });
    setTypes(data || []);
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
      setLoadError(
        error || recError
          ? "No se pudieron cargar todos tus ingresos. Revisa tu conexión e intenta recargar la página."
          : ""
      );
      setIncomes(inc || []);
      setRecurring(rec || []);
      setLoading(false);
    }
    fetchAll();
  }, [year]);
  useEffect(() => {
    refetchTypes();
  }, []);
  async function handleDelete(record) {
    const { error } = await supabase.from("incomes").delete().eq("id", record.id);
    if (error) throw error;
    if (record.account_id) await adjustAccountBalance(record.account_id, -Number(record.amount));
    setIncomes((prev) => prev.filter((i) => i.id !== record.id));
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
  // Un ingreso fijo ("Ingreso fijo", ej. un salario) no se guarda como fila
  // real en incomes -- se sintetiza aquí, solo para el mes elegido, para que
  // el total de arriba sí refleje el ingreso real de ese mes (igual que ya
  // hace Resumen y el gráfico "Ingreso por tipo"), en vez de mostrar ₡0
  // cuando todo el ingreso del mes viene de un ingreso fijo y no de ingresos
  // sueltos registrados a mano.
  const monthRecurringIncomeAmount = recurring.reduce((sum, r) => {
    const occurrencesThisMonth = synthesizeRecurringEntries(r, year).filter(
      ({ date }) => dateStringMonth(date) - 1 === month
    ).length;
    return sum + occurrencesThisMonth * Number(r.amount);
  }, 0);
  const total = monthIncomes.reduce((a, i) => a + Number(i.amount), 0) + monthRecurringIncomeAmount;
  // Total del mes anterior, solo para la insignia de tendencia del
  // encabezado -- mismo cálculo de arriba pero contra month - 1. Si month es
  // 0 (enero), el mes anterior sería diciembre del año pasado, que esta
  // pestaña no carga (solo trae el año elegido), así que se deja en 0 y
  // TrendBadge simplemente no muestra nada en ese caso.
  const prevMonthIncomes = month > 0 ? incomes.filter((i) => dateStringMonth(i.date) - 1 === month - 1) : [];
  const prevMonthRecurringIncomeAmount = month > 0 ? recurring.reduce((sum, r) => {
    const occurrencesPrevMonth = synthesizeRecurringEntries(r, year).filter(
      ({ date }) => dateStringMonth(date) - 1 === month - 1
    ).length;
    return sum + occurrencesPrevMonth * Number(r.amount);
  }, 0) : 0;
  const prevTotal = month > 0 ? prevMonthIncomes.reduce((a, i) => a + Number(i.amount), 0) + prevMonthRecurringIncomeAmount : 0;
  const filteredIncomes = monthIncomes.filter((i) =>
    `${i.type || ""} ${i.description || ""}`.toLowerCase().includes(search.toLowerCase())
  );
  if (loading) {
    return <CardGridSkeleton count={6} />;
  }
  return (
    <div className="space-y-4">
      <LoadErrorBanner message={loadError} />
      <Card className="p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Eyebrow>Ingresos en {MONTHS_FULL[month]} {year}</Eyebrow>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-2xl font-semibold tabular-nums text-emerald-600">{fmt(total)}</p>
            <TrendBadge current={total} previous={prevTotal} />
          </div>
          {monthRecurringIncomeAmount > 0 && (
            <p className="mt-0.5 text-xs text-slate-400">Incluye ingresos fijos de este mes</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => exportToCSV("ingresos.csv", filteredIncomes.map((i) => ({ Tipo: i.type, Descripcion: i.description || "", Monto: i.amount, Fecha: i.date, MetodoDePago: i.payment_method || "" })))}
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
            onClick={() => setShowTypesManager(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Tag size={15} /> Tipos de ingreso
          </button>
        </div>
      </Card>
      {/* Misma tarjeta punteada de "agregar" que Gastos, arriba del todo -- a
          pedido del usuario (2026-07-31), para que quede en el mismo lugar
          en ambas pestañas. Antes vivía dentro de un grid de varias
          columnas (pensado para cuando hay más de una tarjeta), pero acá
          siempre es la única -- eso la dejaba más angosta que la tarjeta de
          arriba en pantallas grandes. Se quitó el grid (2026-08-08, a
          pedido del usuario) para que ocupe el ancho completo, igual que la
          tarjeta de "Ingresos en {mes}". */}
      <button
        onClick={() => setShowModal(true)}
        className="flex min-h-[152px] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 transition-colors hover:border-slate-300 hover:text-slate-500 dark:border-slate-700 dark:hover:border-slate-600"
      >
        <Plus size={20} />
        <span className="text-sm font-medium">Agregar ingreso</span>
      </button>
      {recurring.length > 0 && (
        <Card className="p-5">
          <CollapsibleSection
            open={recurringOpen}
            onToggle={() => setRecurringOpen((v) => !v)}
            header={
              <div>
                <Eyebrow>Ingresos fijos</Eyebrow>
              </div>
            }
          >
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {recurring.map((r) => {
                const isQuincenal = r.frequency === "quincenal";
                return (
                  <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 p-4 dark:border-slate-800">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10">
                        <Repeat size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800 dark:text-white">{r.description || r.type || "Ingreso fijo"}</p>
                        <p className="truncate text-xs text-slate-400">
                          {r.type} · {fmt(r.amount)} {isQuincenal ? "c/quincena" : "/mes"} · desde {r.start_date}
                        </p>
                      </div>
                    </div>
                    <RowActions onEdit={() => setEditingRecurring(r)} onDelete={() => setDeletingRecurring(r)} />
                  </div>
                );
              })}
            </div>
          </CollapsibleSection>
        </Card>
      )}
      {types.length > 0 && (
        <Card className="p-5">
          <IncomeTypesReport types={types} incomes={incomes} recurring={recurring} year={year} month={month} fmt={fmt} />
        </Card>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Eyebrow>Ingresos de {MONTHS_FULL[month]} {year}</Eyebrow>
        <div className="relative max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por tipo o descripción..."
            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>
      </div>
      {/* Misma forma de tarjetas que Ahorros, a pedido del usuario
          (2026-07-31). Reemplaza la lista con buscador (ListCard) que tenía
          antes. La tarjeta punteada de "agregar" quedó arriba del todo (ver
          más arriba), no repetida acá. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filteredIncomes.length === 0 && (
          monthIncomes.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title={`Todavía no registras ingresos en ${MONTHS_FULL[month]} ${year}`}
              message="Usa el cuadro de arriba para agregar el primero -- cada ingreso que anotes alimenta tu Reporte al instante."
              className="col-span-full"
            />
          ) : (
            <p className="col-span-full text-sm text-slate-400">Sin resultados para tu búsqueda.</p>
          )
        )}
        {filteredIncomes.map((i) => (
          <Card key={i.id} className="p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10">
                  <TrendingUp size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800 dark:text-white">{i.description || i.type}</p>
                  <p className="truncate text-xs text-slate-400">{i.type} · {i.date}{i.payment_method ? ` · ${i.payment_method}` : ""}</p>
                </div>
              </div>
              <RowActions onEdit={() => setEditingIncome(i)} onDelete={() => setDeletingIncome(i)} />
            </div>
            <p className="mt-4 text-xl font-semibold tabular-nums text-emerald-600">{fmt(i.amount)}</p>
          </Card>
        ))}
      </div>
      {showModal && (
        <IncomeModal types={types} accounts={accounts} defaultDate={defaultDateForMonth(month, year)} onClose={() => setShowModal(false)} onSaved={refetchIncomes} onTypesChanged={refetchTypes} />
      )}
      {editingIncome && (
        <IncomeModal types={types} accounts={accounts} income={editingIncome} onClose={() => setEditingIncome(null)} onSaved={refetchIncomes} onTypesChanged={refetchTypes} />
      )}
      {showTypesManager && (
        <IncomeTypesManagerModal types={types} onClose={() => setShowTypesManager(false)} onChanged={refetchTypes} />
      )}
      {deletingIncome && (
        <ConfirmDeleteModal
          title="Eliminar ingreso"
          message={`¿Seguro que quieres eliminar este ingreso de ${fmt(deletingIncome.amount)}? Esta acción no se puede deshacer.`}
          onCancel={() => setDeletingIncome(null)}
          onConfirm={() => handleDelete(deletingIncome)}
        />
      )}
      {showRecurringModal && (
        <RecurringIncomeModal types={types} onClose={() => setShowRecurringModal(false)} onSaved={refetchRecurring} onTypesChanged={refetchTypes} />
      )}
      {editingRecurring && (
        <RecurringIncomeModal types={types} item={editingRecurring} onClose={() => setEditingRecurring(null)} onSaved={refetchRecurring} onTypesChanged={refetchTypes} />
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
function IncomeModal({ income, types, accounts, onClose, onSaved, onTypesChanged, defaultDate }) {
  const isEditing = Boolean(income);
  const today = localDateString();
  const [typeId, setTypeId] = useState(income?.type_id || "");
  const [description, setDescription] = useState(income?.description || "");
  const [amount, setAmount] = useState(income ? String(income.amount) : "");
  const [date, setDate] = useState(income?.date || defaultDate || today);
  const [paymentMethod, setPaymentMethod] = useState(income?.payment_method || "");
  // Cuenta real a la que se liga este ingreso (2026-08-08), distinta del
  // "Método de pago" de arriba (que es solo una etiqueta descriptiva, texto
  // libre, sin saldo detrás). Si se elige una cuenta, el monto se suma
  // automáticamente a su saldo -- mismo patrón que "Vincular a una meta" en
  // Ahorros.
  const [accountId, setAccountId] = useState(income?.account_id || "");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  // Ver el mismo comentario en SavingModal: guarda acá los tipos creados en
  // el momento, para no depender de que el `types` del padre ya se haya
  // refrescado antes de que la persona guarde el ingreso.
  const [extraTypes, setExtraTypes] = useState([]);
  const allTypes = [...types, ...extraTypes.filter((t) => !types.some((x) => x.id === t.id))];
  async function handleSubmit(e) {
    e.preventDefault();
    if (!typeId || !amount || !date) {
      setErrorMsg("Completa el tipo, el monto y la fecha (puedes crear un tipo nuevo desde el mismo selector).");
      return;
    }
    const selectedType = allTypes.find((t) => t.id === typeId);
    setSaving(true);
    setErrorMsg("");
    const newAccountId = accountId || null;
    const newAmount = Number(amount);
    if (isEditing) {
      const { error } = await supabase.from("incomes").update({
        year: dateStringYear(date),
        month: dateStringMonth(date),
        type: selectedType?.name || "",
        type_id: typeId,
        description,
        amount: newAmount,
        date,
        payment_method: paymentMethod || null,
        account_id: newAccountId,
      }).eq("id", income.id);
      if (!error) {
        const oldAccountId = income.account_id || null;
        const oldAmount = Number(income.amount);
        if (oldAccountId === newAccountId) {
          if (oldAccountId) await adjustAccountBalance(oldAccountId, newAmount - oldAmount);
        } else {
          if (oldAccountId) await adjustAccountBalance(oldAccountId, -oldAmount);
          if (newAccountId) await adjustAccountBalance(newAccountId, newAmount);
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
    const { error } = await supabase.from("incomes").insert({
      user_id: userId || null,
      year: dateStringYear(date),
      month: dateStringMonth(date),
      type: selectedType?.name || "",
      type_id: typeId,
      description,
      amount: newAmount,
      date,
      payment_method: paymentMethod || null,
      account_id: newAccountId,
    });
    if (!error && newAccountId) await adjustAccountBalance(newAccountId, newAmount);
    setSaving(false);
    if (error) {
      setErrorMsg("Error al guardar: " + error.message);
    } else {
      onSaved();
      onClose();
    }
  }
  return (
    <ModalShell onClose={onClose} title={isEditing ? "Editar ingreso" : "Nuevo ingreso"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <TypeSelectWithCreate
          label="Tipo de ingreso"
          value={typeId}
          onChange={setTypeId}
          options={allTypes}
          table="income_types"
          onCreated={(t) => { setExtraTypes((prev) => [...prev, t]); if (onTypesChanged) onTypesChanged(); }}
          placeholder="Selecciona un tipo"
          namePlaceholder="Ej. Salario"
          emptyHint="Aún no tienes tipos de ingreso."
        />
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Descripción (opcional)</label>
          <input
            value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej. Pago quincena julio"
            className={`mt-1 ${INPUT_CLASS}`}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Monto</label>
            <input
              type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="500000"
              className={`mt-1 ${INPUT_CLASS}`}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Fecha</label>
            <input
              type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className={`mt-1 ${INPUT_CLASS}`}
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Método de pago (opcional)</label>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={`mt-1 ${INPUT_CLASS}`}>
            <option value="">Sin especificar</option>
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        {(accounts || []).length > 0 && (
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Vincular a una cuenta (opcional)</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={`mt-1 ${INPUT_CLASS}`}>
              <option value="">Ninguna</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {accountId && <p className="mt-1.5 text-xs text-slate-400">El monto se sumará automáticamente al saldo de esa cuenta.</p>}
          </div>
        )}
        {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}
        <button
          type="submit" disabled={saving}
          className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          {saving ? "Guardando..." : isEditing ? "Guardar cambios" : "Agregar ingreso"}
        </button>
      </form>
    </ModalShell>
  );
}
function RecurringIncomeModal({ item, types, onClose, onSaved, onTypesChanged }) {
  const isEditing = Boolean(item);
  const today = localDateString();
  const [typeId, setTypeId] = useState(item?.type_id || "");
  const [description, setDescription] = useState(item?.description || "");
  const [amount, setAmount] = useState(item ? String(item.amount) : "");
  const [startDate, setStartDate] = useState(item?.start_date || today);
  const [frequency, setFrequency] = useState(item?.frequency || "mensual");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const isQuincenal = frequency === "quincenal";
  // Ver el mismo comentario en SavingModal/IncomeModal.
  const [extraTypes, setExtraTypes] = useState([]);
  const allTypes = [...types, ...extraTypes.filter((t) => !types.some((x) => x.id === t.id))];

  async function handleSubmit(e) {
    e.preventDefault();
    if (!typeId || !amount || !startDate) {
      setErrorMsg("Completa el tipo, el monto y la fecha de inicio (puedes crear un tipo nuevo desde el mismo selector).");
      return;
    }
    const selectedType = allTypes.find((t) => t.id === typeId);
    setSaving(true);
    setErrorMsg("");
    const payload = { type: selectedType?.name || "", type_id: typeId, description, amount: Number(amount), start_date: startDate, frequency };
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
    <ModalShell onClose={onClose} title={isEditing ? "Editar ingreso fijo" : "Nuevo ingreso fijo"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <TypeSelectWithCreate
          label="Tipo de ingreso"
          value={typeId}
          onChange={setTypeId}
          options={allTypes}
          table="income_types"
          onCreated={(t) => { setExtraTypes((prev) => [...prev, t]); if (onTypesChanged) onTypesChanged(); }}
          placeholder="Selecciona un tipo"
          namePlaceholder="Ej. Salario"
          emptyHint="Aún no tienes tipos de ingreso."
        />
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Descripción (opcional)</label>
          <input
            value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej. Salario quincenal empresa X"
            className={`mt-1 ${INPUT_CLASS}`}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Frecuencia</label>
          <select
            value={frequency} onChange={(e) => setFrequency(e.target.value)}
            className={`mt-1 ${INPUT_CLASS}`}
          >
            <option value="mensual">Mensual</option>
            <option value="quincenal">Quincenal (días 15 y 30)</option>
          </select>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{isQuincenal ? "Monto por quincena" : "Monto mensual"}</label>
            <input
              type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="500000"
              className={`mt-1 ${INPUT_CLASS}`}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{isQuincenal ? "A partir de" : "Empieza el"}</label>
            <input
              type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className={`mt-1 ${INPUT_CLASS}`}
            />
          </div>
        </div>
        {isQuincenal && (
          <p className="text-xs text-slate-400">
            Se cuenta siempre en los días 15 y 30 (o fin de mes), empezando en la primera de esas fechas a partir de la que elijas.
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
    </ModalShell>
  );
}
// Espacio para armar la lista de tipos de ingreso, separado a propósito del
// formulario de "Agregar ingreso" (mismo patrón que
// ExpenseItemsManagerModal/ExpenseItemModal para Gastos): un lugar para
// crear/editar/borrar tipos, y otro distinto para registrar ingresos
// usándolos. A diferencia de los artículos de Gastos, un tipo de ingreso no
// vive dentro de una categoría -- es una lista plana.
function IncomeTypesManagerModal({ types, onClose, onChanged }) {
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [deletingType, setDeletingType] = useState(null);
  const sortedTypes = [...types].sort((a, b) => a.name.localeCompare(b.name));
  async function handleDeleteType(id) {
    const { error } = await supabase.from("income_types").delete().eq("id", id);
    if (!error) {
      onChanged();
      setDeletingType(null);
    }
  }
  return (
    <ModalShell
      onClose={onClose}
      title="Tipos de ingreso"
      overlayExtras={
        <>
          {showTypeModal && (
            <IncomeTypeModal onClose={() => setShowTypeModal(false)} onSaved={onChanged} />
          )}
          {editingType && (
            <IncomeTypeModal type={editingType} onClose={() => setEditingType(null)} onSaved={onChanged} />
          )}
          {deletingType && (
            <ConfirmDeleteModal
              title="Eliminar tipo de ingreso"
              message={`¿Seguro que quieres eliminar "${deletingType.name}"? Los ingresos que ya registraste con este tipo no se borran, solo quedan sin tipo asociado.`}
              onCancel={() => setDeletingType(null)}
              onConfirm={() => handleDeleteType(deletingType.id)}
            />
          )}
        </>
      }
    >
      <div className="space-y-4">
        {sortedTypes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400 dark:border-slate-700">
            Aún no hay tipos de ingreso.
          </p>
        ) : (
          <div className="max-h-[40vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
            {sortedTypes.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <p className="min-w-0 flex-1 truncate font-medium text-slate-700 dark:text-slate-200">{t.name}</p>
                <RowActions onEdit={() => setEditingType(t)} onDelete={() => setDeletingType(t)} />
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowTypeModal(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <Plus size={15} /> Agregar tipo
        </button>
      </div>
    </ModalShell>
  );
}
function IncomeTypeModal({ type, onClose, onSaved }) {
  const isEditing = Boolean(type);
  const [name, setName] = useState(type?.name || "");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg("Escribe un nombre.");
      return;
    }
    setSaving(true);
    setErrorMsg("");
    if (isEditing) {
      const { error } = await supabase.from("income_types").update({ name: name.trim() }).eq("id", type.id);
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
    const { error } = await supabase.from("income_types").insert({ user_id: userId || null, name: name.trim() });
    setSaving(false);
    if (error) {
      setErrorMsg("Error al guardar: " + error.message);
    } else {
      onSaved();
      onClose();
    }
  }
  return (
    <ModalShell onClose={onClose} title={isEditing ? "Editar tipo de ingreso" : "Nuevo tipo de ingreso"} maxWidth="max-w-sm" zIndex="z-[60]">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Nombre</label>
          <input
            value={name} onChange={(e) => setName(e.target.value)} autoFocus
            placeholder="Ej. Salario"
            className={`mt-1 ${INPUT_CLASS}`}
          />
        </div>
        {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}
        <button
          type="submit" disabled={saving}
          className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          {saving ? "Guardando..." : isEditing ? "Guardar cambios" : "Agregar tipo"}
        </button>
      </form>
    </ModalShell>
  );
}
function IncomeTypesReport({ types, incomes, recurring, year, month, fmt }) {
  const sortedTypes = [...types].sort((a, b) => a.name.localeCompare(b.name));
  const [period, setPeriod] = useState("mes"); // "mes" | "q1" | "q2"

  function inSelectedPeriod(i) {
    if (dateStringYear(i.date) !== year || dateStringMonth(i.date) - 1 !== month) return false;
    if (period === "mes") return true;
    const day = dateStringDay(i.date);
    return period === "q1" ? day <= 15 : day > 15;
  }
  // Los ingresos fijos ("Ingreso fijo") no se guardan como fila real en
  // incomes -- se sintetizan aquí, solo para el año elegido, igual que ya
  // hace fetchYearData para Resumen/Calendario, para poder sumarlos también
  // a este gráfico junto con los ingresos sueltos.
  const recurringIncomeEntries = [];
  (recurring || []).forEach((r) => {
    if (!r.type_id) return;
    synthesizeRecurringEntries(r, year).forEach(({ date }) => {
      recurringIncomeEntries.push({ type_id: r.type_id, amount: r.amount, date });
    });
  });
  const relevantIncomes = incomes.filter((i) => i.type_id && inSelectedPeriod(i));
  const relevantRecurring = recurringIncomeEntries.filter(inSelectedPeriod);
  const totalsByType = sortedTypes
    .map((t) => {
      const matchingIncomes = relevantIncomes.filter((i) => i.type_id === t.id);
      const matchingRecurring = relevantRecurring.filter((e) => e.type_id === t.id);
      return {
        id: t.id,
        name: t.name,
        amount:
          matchingIncomes.reduce((a, i) => a + Number(i.amount), 0) +
          matchingRecurring.reduce((a, e) => a + Number(e.amount), 0),
        count: matchingIncomes.length + matchingRecurring.length,
      };
    })
    .filter((d) => d.count > 0)
    .sort((a, b) => b.amount - a.amount);
  const grandTotal = totalsByType.reduce((a, d) => a + d.amount, 0);
  const periodLabel = period === "mes"
    ? `${MONTHS_FULL[month]} ${year}`
    : period === "q1"
    ? `1 al 15 de ${MONTHS_FULL[month]} ${year}`
    : `16 a fin de mes de ${MONTHS_FULL[month]} ${year}`;
  const chartHeight = Math.max(120, totalsByType.length * 40);

  return (
    <div>
      <Eyebrow>Ingreso por tipo</Eyebrow>
      <div className="mt-3 max-w-xs">
        <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Período</label>
        <select
          value={period} onChange={(e) => setPeriod(e.target.value)}
          className={`mt-1 ${INPUT_CLASS}`}
        >
          <option value="mes">Mes completo</option>
          <option value="q1">Quincena 1 (días 1 al 15)</option>
          <option value="q2">Quincena 2 (día 16 a fin de mes)</option>
        </select>
      </div>
      <p className="mt-3 text-xs text-slate-400">{periodLabel}</p>
      {totalsByType.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">
          Aún no has registrado ingresos por tipo en este período.
        </p>
      ) : (
        <>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{fmt(grandTotal)}</p>
          <div className="mt-4" style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={totalsByType} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => fmt(v)} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Bar dataKey="amount" fill="#22C55E" radius={[0, 4, 4, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
            {totalsByType.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-700 dark:text-slate-200">{d.name}</p>
                  <p className="text-xs text-slate-400">{d.count} ingreso{d.count === 1 ? "" : "s"}</p>
                </div>
                <span className="shrink-0 tabular-nums font-medium text-slate-700 dark:text-slate-200">{fmt(d.amount)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
/* ---------------------------------------------------------------
   GASTOS
------------------------------------------------------------------ */
function ExpensesView({ fmt, onDataChanged, year, month, categories, cards, refetchCards, accounts }) {
  const [expenses, setExpenses] = useState([]);
  const [plans, setPlans] = useState([]);
  const [paymentOverrides, setPaymentOverrides] = useState([]);
  const [recurring, setRecurring] = useState([]);
  // Artículos por categoría (ej. "Arroz", "Frijoles" dentro de Alimentación):
  // no dependen del año/mes elegido (son una lista que la persona arma poco a
  // poco), así que se cargan una sola vez, no cada vez que cambia el año.
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [deletingExpense, setDeletingExpense] = useState(null);
  const [showItemsManager, setShowItemsManager] = useState(false);
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
  // El detalle de gastos individuales (buscador + lista completa, la última
  // sección de la pestaña) también es colapsable, igual que "Fijo y
  // programado" arriba (empieza cerrada por el mismo motivo). Antes esto se
  // había puesto por error en "Gasto por artículo" (la sección de las
  // barras) — se corrigió para que sea esta lista, no esa, la colapsable.
  const [expensesListOpen, setExpensesListOpen] = useState(false);
  // "Plan de pago" es el botón que menos se usa día a día, así que queda
  // escondido detrás de "Más opciones" (empieza cerrado) — deja la fila de
  // botones de Gastos menos cargada por defecto. "Tarjetas" vivía acá
  // también, pero se quitó (2026-08-08, a pedido del usuario): las tarjetas
  // de crédito ahora se crean/editan/borran desde Cuentas (Inicio), para
  // que solo haya un lugar donde manejarlas.
  const [moreOpen, setMoreOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("Todas");
  const [loadError, setLoadError] = useState("");
  async function refetchExpenses() {
    const { data } = await supabase
      .from("expenses")
      .select("*, categories(name, color, icon), credit_cards(name), expense_items(name)")
      .gte("date", `${year}-01-01`).lte("date", `${year}-12-31`)
      .order("date", { ascending: false });
    setExpenses(data || []);
    if (onDataChanged) onDataChanged();
  }
  async function refetchItems() {
    const { data } = await supabase.from("expense_items").select("*").order("name", { ascending: true });
    setItems(data || []);
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
        { data: pls, error: planError },
        { data: overrides, error: overrideError },
        { data: rec, error: recError },
      ] = await Promise.all([
        supabase.from("expenses").select("*, categories(name, color, icon), credit_cards(name), expense_items(name)")
          .gte("date", `${year}-01-01`).lte("date", `${year}-12-31`)
          .order("date", { ascending: false }),
        supabase.from("installment_plans").select("*, categories(name, color, icon), credit_cards(name, cutoff_day, payment_day)").order("start_date", { ascending: false }),
        supabase.from("installment_payment_status").select("*"),
        supabase.from("recurring_expenses").select("*, categories(name, color, icon)").order("start_date", { ascending: false }),
      ]);
      if (expError) console.error("Error cargando gastos:", expError.message);
      if (planError) console.error("Error cargando planes de pago:", planError.message);
      if (overrideError) console.error("Error cargando estado de cuotas:", overrideError.message);
      if (recError) console.error("Error cargando gastos fijos:", recError.message);
      setLoadError(
        expError || planError || overrideError || recError
          ? "No se pudieron cargar todos tus datos de Gastos. Revisa tu conexión e intenta recargar la página."
          : ""
      );
      setExpenses(exp || []);
      setPlans(pls || []);
      setPaymentOverrides(overrides || []);
      setRecurring(rec || []);
      setLoading(false);
    }
    fetchAll();
  }, [year]);
  useEffect(() => {
    refetchItems();
  }, []);
  async function handleDelete(record) {
    const { error } = await supabase.from("expenses").delete().eq("id", record.id);
    if (error) throw error;
    if (record.account_id) await adjustAccountBalance(record.account_id, Number(record.amount));
    setExpenses((prev) => prev.filter((e) => e.id !== record.id));
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
  const monthExpenses = expenses.filter((e) => dateStringMonth(e.date) - 1 === month);
  // Los gastos fijos y las cuotas de planes de pago no se guardan como fila
  // real en expenses -- se sintetizan aquí, solo para el mes elegido, para
  // que el total de arriba sí refleje el gasto real de ese mes (igual que ya
  // hace Reporte, vía fetchYearData), en vez de quedarse corto cuando parte
  // del gasto del mes viene de un gasto fijo o una cuota de plan y no de un
  // gasto suelto registrado a mano. Mismo mecanismo que ya se corrigió antes
  // en Ingresos (monthRecurringIncomeAmount).
  const monthRecurringExpenseAmount = recurring.reduce((sum, r) => {
    const occurrencesThisMonth = synthesizeRecurringEntries(r, year).filter(
      ({ date }) => dateStringMonth(date) - 1 === month
    ).length;
    return sum + occurrencesThisMonth * Number(r.amount);
  }, 0);
  const monthPlanAmount = plans.reduce((sum, p) => {
    const totalMonths = Number(p.total_months) || 0;
    const anchoredPlan = { ...p, start_date: planAnchorDate(p) };
    const occurrencesThisMonth = synthesizeRecurringEntries(anchoredPlan, year, { totalMonths }).filter(
      ({ date }) => dateStringMonth(date) - 1 === month
    ).length;
    return sum + occurrencesThisMonth * Number(p.monthly_amount);
  }, 0);
  const total = monthExpenses.reduce((a, e) => a + Number(e.amount), 0) + monthRecurringExpenseAmount + monthPlanAmount;
  // Total del mes anterior, solo para la insignia de tendencia -- mismo
  // cálculo de arriba (incluye gastos fijos y cuotas de planes) pero contra
  // month - 1. En enero (month === 0) se deja en 0 porque el año anterior no
  // está cargado en esta pestaña; TrendBadge no muestra nada en ese caso.
  const prevMonthExpenses = month > 0 ? expenses.filter((e) => dateStringMonth(e.date) - 1 === month - 1) : [];
  const prevMonthRecurringExpenseAmount = month > 0 ? recurring.reduce((sum, r) => {
    const occurrencesPrevMonth = synthesizeRecurringEntries(r, year).filter(
      ({ date }) => dateStringMonth(date) - 1 === month - 1
    ).length;
    return sum + occurrencesPrevMonth * Number(r.amount);
  }, 0) : 0;
  const prevMonthPlanAmount = month > 0 ? plans.reduce((sum, p) => {
    const totalMonths = Number(p.total_months) || 0;
    const anchoredPlan = { ...p, start_date: planAnchorDate(p) };
    const occurrencesPrevMonth = synthesizeRecurringEntries(anchoredPlan, year, { totalMonths }).filter(
      ({ date }) => dateStringMonth(date) - 1 === month - 1
    ).length;
    return sum + occurrencesPrevMonth * Number(p.monthly_amount);
  }, 0) : 0;
  const prevTotal = month > 0 ? prevMonthExpenses.reduce((a, e) => a + Number(e.amount), 0) + prevMonthRecurringExpenseAmount + prevMonthPlanAmount : 0;
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
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold"
              style={{ backgroundColor: `${color}1a`, color }}
            >
              <CreditCard size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800 dark:text-white">{p.description || p.categories?.name || "Plan de pago"}</p>
              <p className="truncate text-xs text-slate-400">
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
    return <CardGridSkeleton count={6} />;
  }
  return (
    <div className="space-y-4">
      <LoadErrorBanner message={loadError} />
      <Card className="p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Eyebrow>Gastos en {MONTHS_FULL[month]} {year}</Eyebrow>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-2xl font-semibold tabular-nums text-red-500">{fmt(total)}</p>
            <TrendBadge current={total} previous={prevTotal} invert />
          </div>
          {(monthRecurringExpenseAmount > 0 || monthPlanAmount > 0) && (
            <p className="mt-0.5 text-xs text-slate-400">Incluye gastos fijos y planes de pago de este mes</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => exportToCSV("gastos.csv", filteredExpenses.map((e) => ({ Categoria: e.categories?.name || "", Descripcion: e.description || "", Articulo: e.expense_items?.name || "", Monto: e.amount, Fecha: e.date, FechaCompra: e.purchase_date || "", Tarjeta: e.credit_cards?.name || "" })))}
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
                onClick={() => setShowPlanModal(true)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <CreditCard size={15} /> Plan de pago
              </button>
              <button
                onClick={() => setShowItemsManager(true)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <ShoppingBag size={15} /> Artículos
              </button>
            </>
          )}
        </div>
      </Card>
      {/* Misma tarjeta punteada de "agregar" que Ahorros/Ingresos, a pedido
          del usuario (2026-07-31) -- reemplaza el botón negro de arriba. El
          resto de la vista (fijos, planes, reporte, detalle) queda igual.
          Se quitó el grid que la envolvía (2026-08-08, a pedido del
          usuario) -- como siempre es la única tarjeta ahí, el grid la
          dejaba más angosta que la tarjeta de arriba en pantallas grandes;
          ahora ocupa el ancho completo. */}
      <button
        onClick={() => setShowModal(true)}
        className="flex min-h-[152px] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 transition-colors hover:border-slate-300 hover:text-slate-500 dark:border-slate-700 dark:hover:border-slate-600"
      >
        <Plus size={20} />
        <span className="text-sm font-medium">Agregar gasto</span>
      </button>
      {(recurring.length > 0 || activePlans.length > 0 || finishedPlans.length > 0) && (
        <Card className="p-5">
          <CollapsibleSection
            open={programmedOpen}
            onToggle={() => setProgrammedOpen((v) => !v)}
            header={
              <div>
                <Eyebrow>Fijo y programado</Eyebrow>
                <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                  {[
                    recurring.length > 0 && `${recurring.length} gasto${recurring.length === 1 ? "" : "s"} fijo${recurring.length === 1 ? "" : "s"}`,
                    activePlans.length > 0 && `${activePlans.length} plan${activePlans.length === 1 ? "" : "es"} activo${activePlans.length === 1 ? "" : "s"}`,
                    finishedPlans.length > 0 && `${finishedPlans.length} plan${finishedPlans.length === 1 ? "" : "es"} pagado${finishedPlans.length === 1 ? "" : "s"}`,
                  ].filter(Boolean).join(" · ")}
                </p>
              </div>
            }
          >
            <div className="mt-4 space-y-6">
              {recurring.length > 0 && (
                <div>
                  <Eyebrow>Gastos fijos</Eyebrow>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {recurring.map((r) => {
                      const color = r.categories?.color || "#64748B";
                      const isQuincenal = r.frequency === "quincenal";
                      return (
                        <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 p-4 dark:border-slate-800">
                          <div className="flex min-w-0 items-center gap-3">
                            <div
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold"
                              style={{ backgroundColor: `${color}1a`, color }}
                            >
                              <Repeat size={16} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-slate-800 dark:text-white">{r.description || r.categories?.name || "Gasto fijo"}</p>
                              <p className="truncate text-xs text-slate-400">
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
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {activePlans.map(renderPlanCard)}
                  </div>
                </div>
              )}
              {finishedPlans.length > 0 && (
                <div>
                  <Eyebrow>Planes pagados</Eyebrow>
                  <p className="mt-1 text-xs text-slate-400">
                    Sin cuota pendiente en {MONTHS_FULL[month]} {year}.
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {finishedPlans.map(renderPlanCard)}
                  </div>
                </div>
              )}
            </div>
          </CollapsibleSection>
        </Card>
      )}
      {items.length > 0 && (
        <Card className="p-5">
          <ExpenseItemsReport
            categories={categories}
            items={items}
            expenses={expenses}
            year={year}
            month={month}
            defaultCategoryId={catFilter !== "Todas" ? categories.find((c) => c.name === catFilter)?.id : undefined}
            fmt={fmt}
          />
        </Card>
      )}
      <Card className="overflow-hidden">
        <CollapsibleSection
          open={expensesListOpen}
          onToggle={() => setExpensesListOpen((v) => !v)}
          buttonClassName="flex w-full items-center justify-between gap-2 px-5 py-4 text-left"
          header={
            <div>
              <Eyebrow>Detalle de gastos</Eyebrow>
              <p className="mt-1 text-xs text-slate-400">
                {monthExpenses.length} gasto{monthExpenses.length === 1 ? "" : "s"} en {MONTHS_FULL[month]} {year}
              </p>
            </div>
          }
        >
          <div className="flex flex-wrap items-center gap-2 border-t border-b border-slate-100 px-5 py-3 dark:border-slate-800">
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
              <div key={e.id} className="flex items-center justify-between gap-2 px-5 py-3 text-sm">
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold"
                    style={{ backgroundColor: `${e.categories?.color || "#64748B"}1a`, color: e.categories?.color || "#64748B" }}
                  >
                    {(e.categories?.name || "?").charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-700 dark:text-slate-200">{e.description || e.expense_items?.name || e.categories?.name}</p>
                    <p className="truncate text-xs text-slate-400">
                      {e.categories?.name}
                      {e.expense_items?.name && ` · ${e.expense_items.name}`}
                      {" · "}{e.purchase_date || e.date}
                      {e.purchase_date && e.purchase_date !== e.date && ` · pago: ${e.date}`}
                      {e.credit_cards?.name && ` · ${e.credit_cards.name}`}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums font-medium text-red-500">{fmt(e.amount)}</span>
                  <RowActions onEdit={() => setEditingExpense(e)} onDelete={() => setDeletingExpense(e)} />
                </div>
              </div>
            ))}
            {filteredExpenses.length === 0 && (
              monthExpenses.length === 0 ? (
                <EmptyState
                  icon={TrendingDown}
                  title={`Sin gastos registrados en ${MONTHS_FULL[month]} ${year}`}
                  message="Anota tu primer gasto para empezar a ver el detalle aquí."
                  compact
                />
              ) : (
                <p className="px-5 py-8 text-center text-sm text-slate-400">Sin resultados para tu búsqueda.</p>
              )
            )}
          </div>
        </CollapsibleSection>
      </Card>
      {showModal && (
        <ExpenseModal categories={categories} cards={cards} items={items} accounts={accounts} defaultDate={defaultDateForMonth(month, year)} onClose={() => setShowModal(false)} onSaved={refetchExpenses} onItemsChanged={refetchItems} />
      )}
      {editingExpense && (
        <ExpenseModal
          categories={categories}
          cards={cards}
          items={items}
          accounts={accounts}
          expense={editingExpense}
          onClose={() => setEditingExpense(null)}
          onSaved={refetchExpenses}
          onItemsChanged={refetchItems}
        />
      )}
      {deletingExpense && (
        <ConfirmDeleteModal
          title="Eliminar gasto"
          message={`¿Seguro que quieres eliminar el gasto "${deletingExpense.description || deletingExpense.categories?.name || "sin descripción"}" de ${fmt(deletingExpense.amount)}? Esta acción no se puede deshacer.`}
          onCancel={() => setDeletingExpense(null)}
          onConfirm={() => handleDelete(deletingExpense)}
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
      {showItemsManager && (
        <ExpenseItemsManagerModal
          categories={categories}
          items={items}
          onClose={() => setShowItemsManager(false)}
          onChanged={refetchItems}
        />
      )}
    </div>
  );
}
// Valor sentinela del selector de "Artículo" que significa "quiero escribir
// uno nuevo" (mismo patrón que "Otro (escribir nombre)" en tipos de ahorro).
function ExpenseModal({ categories, cards, items, expense, accounts, onClose, onSaved, onItemsChanged, defaultDate }) {
  const cardsList = cards || [];
  const itemsList = items || [];
  const isEditing = Boolean(expense);
  const today = localDateString();
  const [categoryId, setCategoryId] = useState(expense?.category_id || categories[0]?.id || "");
  const [description, setDescription] = useState(expense?.description || "");
  const [itemId, setItemId] = useState(expense?.item_id || "");
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [date, setDate] = useState(expense?.purchase_date || expense?.date || defaultDate || today);
  const [cardId, setCardId] = useState(expense?.card_id || "");
  // Cuenta real de la que sale este gasto (2026-08-08) -- solo tiene
  // sentido cuando NO se paga con tarjeta: un gasto con tarjeta ya se suma
  // solo a la deuda de esa tarjeta (ver refetchCardCharges en Dashboard), no
  // le resta a ninguna cuenta de débito. Si se elige una cuenta, el monto se
  // resta automáticamente de su saldo.
  const [accountId, setAccountId] = useState(expense?.account_id || "");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const selectedCard = cardsList.find((c) => c.id === cardId) || null;
  const computedPaymentDate = selectedCard && date
    ? computeCardPaymentDate(date, Number(selectedCard.cutoff_day), Number(selectedCard.payment_day))
    : null;
  // Los artículos son por categoría (ej. "Arroz" vive dentro de Alimentación),
  // así que la lista del selector se filtra según la categoría elegida. Los
  // artículos en sí se crean/editan/borran aparte, en "Artículos" (dentro de
  // "Más opciones" en Gastos) — este formulario solo elige entre los que ya
  // existan, para no mezclar "registrar un gasto" con "armar la lista".
  const itemsForCategory = itemsList.filter((it) => it.category_id === categoryId);
  function handleCategoryChange(value) {
    setCategoryId(value);
    setItemId("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!categoryId || !amount || !date) {
      setErrorMsg("Completa al menos la categoría, el monto y la fecha.");
      return;
    }
    setSaving(true);
    setErrorMsg("");
    const newAmount = Number(amount);
    const newAccountId = selectedCard ? null : (accountId || null);
    const payload = selectedCard
      ? {
          category_id: categoryId,
          description,
          item_id: itemId || null,
          amount: newAmount,
          date: computedPaymentDate,
          purchase_date: date,
          card_id: selectedCard.id,
          account_id: null,
          is_recurring: false,
        }
      : {
          category_id: categoryId,
          description,
          item_id: itemId || null,
          amount: newAmount,
          date,
          purchase_date: null,
          card_id: null,
          account_id: newAccountId,
          is_recurring: false,
        };
    if (isEditing) {
      const { error } = await supabase.from("expenses").update(payload).eq("id", expense.id);
      if (!error) {
        const oldAccountId = expense.account_id || null;
        const oldAmount = Number(expense.amount);
        if (oldAccountId === newAccountId) {
          if (oldAccountId) await adjustAccountBalance(oldAccountId, -(newAmount - oldAmount));
        } else {
          if (oldAccountId) await adjustAccountBalance(oldAccountId, oldAmount);
          if (newAccountId) await adjustAccountBalance(newAccountId, -newAmount);
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
    const { error } = await supabase.from("expenses").insert({
      user_id: userId || null,
      ...payload,
    });
    if (!error && newAccountId) await adjustAccountBalance(newAccountId, -newAmount);
    setSaving(false);
    if (error) {
      setErrorMsg("Error al guardar: " + error.message);
    } else {
      onSaved();
      onClose();
    }
  }
  return (
    <ModalShell onClose={onClose} title={isEditing ? "Editar gasto" : "Nuevo gasto"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Categoría</label>
          <select
            value={categoryId} onChange={(e) => handleCategoryChange(e.target.value)}
            className={`mt-1 ${INPUT_CLASS}`}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <TypeSelectWithCreate
          key={categoryId}
          label="Artículo (opcional)"
          value={itemId}
          onChange={setItemId}
          options={itemsForCategory}
          table="expense_items"
          extraFields={{ category_id: categoryId }}
          onCreated={onItemsChanged}
          placeholder="Ninguno"
          namePlaceholder="Ej. Arroz"
        />
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Descripción (opcional)</label>
          <input
            value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej. Supermercado semana"
            className={`mt-1 ${INPUT_CLASS}`}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Monto</label>
            <input
              type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="25000"
              className={`mt-1 ${INPUT_CLASS}`}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{selectedCard ? "Fecha de la compra" : "Fecha"}</label>
            <input
              type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className={`mt-1 ${INPUT_CLASS}`}
            />
          </div>
        </div>
        {cardsList.length > 0 && (
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Método de pago</label>
            <select
              value={cardId} onChange={(e) => setCardId(e.target.value)}
              className={`mt-1 ${INPUT_CLASS}`}
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
        {/* Solo tiene sentido ligar a una cuenta de débito cuando NO se paga
            con tarjeta -- un gasto con tarjeta ya afecta la deuda de esa
            tarjeta, no el saldo de una cuenta (2026-08-08). */}
        {!selectedCard && (accounts || []).length > 0 && (
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Vincular a una cuenta (opcional)</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={`mt-1 ${INPUT_CLASS}`}>
              <option value="">Ninguna</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {accountId && <p className="mt-1.5 text-xs text-slate-400">El monto se restará automáticamente del saldo de esa cuenta.</p>}
          </div>
        )}
        {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}
        <button
          type="submit" disabled={saving}
          className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          {saving ? "Guardando..." : isEditing ? "Guardar cambios" : "Agregar gasto"}
        </button>
      </form>
    </ModalShell>
  );
}
// Solo lectura: cuánto se gastó por artículo (ej. "Arroz" dentro de
// Alimentación) en el mes elegido, o en una de sus dos quincenas. Vive
// directamente en la pestaña Gastos (no en un modal aparte) para que se vea
// de un vistazo, sin tener que darle a un botón. Se separó "período"
// (mes/quincena) de las flechitas "‹ Mes Año ›" de arriba a propósito, para
// no cambiarle el significado a esa navegación en el resto de la app — aquí
// simplemente se recorta el mismo mes elegido en dos mitades. El componente
// no se renderiza si todavía no hay ningún artículo creado (ver ExpensesView).
// Valor sentinela del selector de categoría que significa "todas juntas".
const ALL_CATEGORIES_VALUE = "";
function ExpenseItemsReport({ categories, items, expenses, year, month, defaultCategoryId, fmt }) {
  const categoriesWithItems = categories.filter((c) => items.some((it) => it.category_id === c.id));
  // Por defecto se muestran todas las categorías juntas ("Todas"), salvo que
  // se llegue con un filtro de categoría específico ya elegido arriba en
  // Gastos (defaultCategoryId) -- así, al recargar la página sin ningún
  // filtro puesto, el gráfico no "elige por su cuenta" la primera categoría
  // con artículos (ej. Alimentación), que no es necesariamente lo que se
  // quiere ver de un vistazo.
  const [categoryId, setCategoryId] = useState(
    defaultCategoryId && items.some((it) => it.category_id === defaultCategoryId)
      ? defaultCategoryId
      : ALL_CATEGORIES_VALUE
  );
  const [period, setPeriod] = useState("mes"); // "mes" | "q1" | "q2"
  const showAllCategories = categoryId === ALL_CATEGORIES_VALUE;

  const itemsInScope = showAllCategories ? items : items.filter((it) => it.category_id === categoryId);
  function inSelectedPeriod(e) {
    if (dateStringYear(e.date) !== year || dateStringMonth(e.date) - 1 !== month) return false;
    if (period === "mes") return true;
    const day = dateStringDay(e.date);
    return period === "q1" ? day <= 15 : day > 15;
  }
  const relevantExpenses = expenses.filter((e) =>
    (showAllCategories || e.category_id === categoryId) && e.item_id && inSelectedPeriod(e)
  );
  const totalsByItem = itemsInScope
    .map((it) => {
      const matching = relevantExpenses.filter((e) => e.item_id === it.id);
      const categoryName = categories.find((c) => c.id === it.category_id)?.name || "";
      const categoryColor = categories.find((c) => c.id === it.category_id)?.color || "#3B82F6";
      return {
        id: it.id,
        name: showAllCategories && categoryName ? `${it.name} · ${categoryName}` : it.name,
        categoryName,
        categoryColor,
        amount: matching.reduce((a, e) => a + Number(e.amount), 0),
        count: matching.length,
      };
    })
    .filter((d) => d.count > 0)
    .sort((a, b) => b.amount - a.amount);
  const grandTotal = totalsByItem.reduce((a, d) => a + d.amount, 0);
  const periodLabel = period === "mes"
    ? `${MONTHS_FULL[month]} ${year}`
    : period === "q1"
    ? `1 al 15 de ${MONTHS_FULL[month]} ${year}`
    : `16 a fin de mes de ${MONTHS_FULL[month]} ${year}`;
  const chartHeight = Math.max(120, totalsByItem.length * 40);

  if (categoriesWithItems.length === 0) return null;

  return (
    <div>
      <Eyebrow>Gasto por artículo</Eyebrow>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Categoría</label>
          <select
            value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
            className={`mt-1 ${INPUT_CLASS}`}
          >
            <option value={ALL_CATEGORIES_VALUE}>Todas</option>
            {categoriesWithItems.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Período</label>
          <select
            value={period} onChange={(e) => setPeriod(e.target.value)}
            className={`mt-1 ${INPUT_CLASS}`}
          >
            <option value="mes">Mes completo</option>
            <option value="q1">Quincena 1 (días 1 al 15)</option>
            <option value="q2">Quincena 2 (día 16 a fin de mes)</option>
          </select>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-400">{periodLabel}</p>
      {totalsByItem.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">
          Aún no has registrado compras por artículo en este período{showAllCategories ? "" : " para esta categoría"}.
        </p>
      ) : (
        <>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{fmt(grandTotal)}</p>
          <div className="mt-4" style={{ height: chartHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={totalsByItem} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <YAxis type="category" dataKey="name" width={showAllCategories ? 140 : 90} tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => fmt(v)} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]} barSize={18}>
                  {totalsByItem.map((d) => <Cell key={d.id} fill={d.categoryColor} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
            {totalsByItem.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-700 dark:text-slate-200">{d.name}</p>
                  <p className="text-xs text-slate-400">{d.count} compra{d.count === 1 ? "" : "s"}</p>
                </div>
                <span className="shrink-0 tabular-nums font-medium text-slate-700 dark:text-slate-200">{fmt(d.amount)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
// Espacio para armar la lista de artículos por categoría, separado a
// propósito del formulario de "Agregar gasto" (mismo patrón que
// CreditCardsManagerModal/CreditCardModal): un lugar para crear/editar/
// borrar artículos, y otro distinto para registrar gastos usándolos.
function ExpenseItemsManagerModal({ categories, items, onClose, onChanged }) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id || "");
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deletingItem, setDeletingItem] = useState(null);
  const itemsForCategory = items.filter((it) => it.category_id === categoryId).sort((a, b) => a.name.localeCompare(b.name));
  async function handleDeleteItem(id) {
    const { error } = await supabase.from("expense_items").delete().eq("id", id);
    if (!error) {
      onChanged();
      setDeletingItem(null);
    }
  }
  return (
    <ModalShell
      onClose={onClose}
      title="Artículos por categoría"
      overlayExtras={
        <>
          {showItemModal && (
            <ExpenseItemModal categoryId={categoryId} onClose={() => setShowItemModal(false)} onSaved={onChanged} />
          )}
          {editingItem && (
            <ExpenseItemModal categoryId={categoryId} item={editingItem} onClose={() => setEditingItem(null)} onSaved={onChanged} />
          )}
          {deletingItem && (
            <ConfirmDeleteModal
              title="Eliminar artículo"
              message={`¿Seguro que quieres eliminar "${deletingItem.name}"? Los gastos que ya registraste con este artículo no se borran, solo quedan sin artículo asociado.`}
              onCancel={() => setDeletingItem(null)}
              onConfirm={() => handleDeleteItem(deletingItem.id)}
            />
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Categoría</label>
          <select
            value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
            className={`mt-1 ${INPUT_CLASS}`}
          >
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {itemsForCategory.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400 dark:border-slate-700">
            Aún no hay artículos en esta categoría.
          </p>
        ) : (
          <div className="max-h-[40vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
            {itemsForCategory.map((it) => (
              <div key={it.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <p className="min-w-0 flex-1 truncate font-medium text-slate-700 dark:text-slate-200">{it.name}</p>
                <RowActions onEdit={() => setEditingItem(it)} onDelete={() => setDeletingItem(it)} />
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowItemModal(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <Plus size={15} /> Agregar artículo
        </button>
      </div>
    </ModalShell>
  );
}
function ExpenseItemModal({ categoryId, item, onClose, onSaved }) {
  const isEditing = Boolean(item);
  const [name, setName] = useState(item?.name || "");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg("Escribe un nombre.");
      return;
    }
    setSaving(true);
    setErrorMsg("");
    if (isEditing) {
      const { error } = await supabase.from("expense_items").update({ name: name.trim() }).eq("id", item.id);
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
    const { error } = await supabase.from("expense_items").insert({ user_id: userId || null, category_id: categoryId, name: name.trim() });
    setSaving(false);
    if (error) {
      setErrorMsg("Error al guardar: " + error.message);
    } else {
      onSaved();
      onClose();
    }
  }
  return (
    <ModalShell onClose={onClose} title={isEditing ? "Editar artículo" : "Nuevo artículo"} maxWidth="max-w-sm" zIndex="z-[60]">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Nombre</label>
          <input
            value={name} onChange={(e) => setName(e.target.value)} autoFocus
            placeholder="Ej. Arroz"
            className={`mt-1 ${INPUT_CLASS}`}
          />
        </div>
        {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}
        <button
          type="submit" disabled={saving}
          className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          {saving ? "Guardando..." : isEditing ? "Guardar cambios" : "Agregar artículo"}
        </button>
      </form>
    </ModalShell>
  );
}
// Modal de crear/editar una tarjeta de crédito (2026-08-08, ahora vive en
// Cuentas -- antes había un "CreditCardsManagerModal" aparte dentro de
// Gastos, se quitó para que solo haya un lugar donde manejar tarjetas). Se
// le agregaron los mismos campos visuales que ya tienen las cuentas
// (banco/red/últimos 4 dígitos) más "Deuda ya existente", para poder
// arrancar con el saldo real si ya debías algo antes de usar la app -- de
// ahí en adelante, la deuda se calcula sola (ver refetchCardCharges en
// Dashboard) a partir de los gastos que le cargues menos los pagos que
// registres, así que este campo no se vuelve a tocar después de crearla.
function CreditCardModal({ card, onClose, onSaved }) {
  const isEditing = Boolean(card);
  const [name, setName] = useState(card?.name || "");
  const [bank, setBank] = useState(card?.bank || BANKS[0].name);
  const [network, setNetwork] = useState(card?.network || CARD_NETWORKS[0]);
  const [last4, setLast4] = useState(card?.last4 || "");
  const [cutoffDay, setCutoffDay] = useState(card ? String(card.cutoff_day) : "");
  const [paymentDay, setPaymentDay] = useState(card ? String(card.payment_day) : "");
  const [initialBalance, setInitialBalance] = useState(card ? String(card.initial_balance || 0) : "0");
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
    const payload = {
      name, bank,
      network: network === "Ninguna" ? null : network,
      last4: last4 ? last4.slice(-4) : null,
      cutoff_day: cutoff,
      payment_day: payment,
      initial_balance: Number(initialBalance) || 0,
    };
    if (isEditing) {
      const { error } = await supabase.from("credit_cards").update(payload).eq("id", card.id);
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
      user_id: userId || null, ...payload,
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
    <ModalShell onClose={onClose} title={isEditing ? "Editar tarjeta" : "Nueva tarjeta"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Nombre de la tarjeta</label>
          <input
            value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Ej. BAC Visa"
            className={`mt-1 ${INPUT_CLASS}`}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Banco</label>
            <select value={bank} onChange={(e) => setBank(e.target.value)} className={`mt-1 ${INPUT_CLASS}`}>
              {BANKS.map((b) => <option key={b.name}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Red</label>
            <select value={network} onChange={(e) => setNetwork(e.target.value)} className={`mt-1 ${INPUT_CLASS}`}>
              {CARD_NETWORKS.map((n) => <option key={n}>{n}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Últimos 4 dígitos</label>
          <input
            value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="1234" inputMode="numeric" className={`mt-1 ${INPUT_CLASS}`}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Día de corte</label>
            <input
              type="number" min="1" max="31" value={cutoffDay} onChange={(e) => setCutoffDay(e.target.value)}
              placeholder="3"
              className={`mt-1 ${INPUT_CLASS}`}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Día de pago</label>
            <input
              type="number" min="1" max="31" value={paymentDay} onChange={(e) => setPaymentDay(e.target.value)}
              placeholder="18"
              className={`mt-1 ${INPUT_CLASS}`}
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Deuda ya existente (opcional)</label>
          <input type="number" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} placeholder="0" className={`mt-1 ${INPUT_CLASS}`} />
          <p className="mt-1 text-xs text-slate-400">Si ya debías algo en esta tarjeta antes de empezar a usarla acá, ponlo aquí -- de ahí en adelante, la deuda se calcula sola con lo que le cargues y lo que le pagues.</p>
        </div>
        {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}
        <button
          type="submit" disabled={saving}
          className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          {saving ? "Guardando..." : isEditing ? "Guardar cambios" : "Crear tarjeta"}
        </button>
      </form>
    </ModalShell>
  );
}
// Modal para registrar un pago a una tarjeta de crédito (2026-08-08): baja
// la deuda de la tarjeta (se resta de lo que has cargado) y, si eliges de
// qué cuenta salió el dinero, también le resta el monto a esa cuenta --
// como una transferencia real (decisión confirmada con el usuario).
function CardPaymentModal({ card, accounts, onClose, onSaved }) {
  const today = localDateString();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [accountId, setAccountId] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  async function handleSubmit(e) {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) {
      setErrorMsg("Ingresa un monto válido.");
      return;
    }
    setSaving(true);
    setErrorMsg("");
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    const { error } = await supabase.from("credit_card_payments").insert({
      user_id: userId || null,
      card_id: card.id,
      account_id: accountId || null,
      amount: Number(amount),
      date,
    });
    if (!error && accountId) await adjustAccountBalance(accountId, -Number(amount));
    setSaving(false);
    if (error) {
      setErrorMsg("Error al guardar: " + error.message);
      return;
    }
    onSaved();
    onClose();
  }
  return (
    <ModalShell onClose={onClose} title={`Registrar pago -- ${card.name}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Monto</label>
            <input
              type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="50000"
              className={`mt-1 ${INPUT_CLASS}`}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Fecha</label>
            <input
              type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className={`mt-1 ${INPUT_CLASS}`}
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">¿De cuál cuenta salió el dinero? (opcional)</label>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={`mt-1 ${INPUT_CLASS}`}>
            <option value="">Ninguna -- solo registrar el pago</option>
            {(accounts || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {accountId && <p className="mt-1.5 text-xs text-slate-400">A esa cuenta también se le va a restar este monto, como si fuera una transferencia.</p>}
        </div>
        {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}
        <button
          type="submit" disabled={saving}
          className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          {saving ? "Guardando..." : "Registrar pago"}
        </button>
      </form>
    </ModalShell>
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
    <ModalShell onClose={onClose} title={isEditing ? "Editar plan de pago" : "Nuevo plan de pago"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Categoría</label>
          <select
            value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
            className={`mt-1 ${INPUT_CLASS}`}
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
            className={`mt-1 ${INPUT_CLASS}`}
          />
        </div>
        {cardsList.length > 0 && (
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Tarjeta asociada</label>
            <select
              value={cardId} onChange={(e) => setCardId(e.target.value)}
              className={`mt-1 ${INPUT_CLASS}`}
            >
              <option value="">Ninguna / pago directo</option>
              {cardsList.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Monto de la cuota mensual</label>
            <input
              type="number" value={monthlyAmount} onChange={(e) => setMonthlyAmount(e.target.value)}
              placeholder="25000"
              className={`mt-1 ${INPUT_CLASS}`}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{selectedCard ? "Fecha de la compra" : "Fecha de la 1ª cuota"}</label>
            <input
              type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className={`mt-1 ${INPUT_CLASS}`}
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">¿A cuántos meses (cuotas)?</label>
          <input
            type="number" min="1" value={totalMonths} onChange={(e) => setTotalMonths(e.target.value)}
            placeholder="72"
            className={`mt-1 ${INPUT_CLASS}`}
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
    </ModalShell>
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
    <ModalShell onClose={onClose} title={isEditing ? "Editar gasto fijo" : "Nuevo gasto fijo"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Categoría</label>
          <select
            value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
            className={`mt-1 ${INPUT_CLASS}`}
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
            className={`mt-1 ${INPUT_CLASS}`}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Frecuencia</label>
          <select
            value={frequency} onChange={(e) => setFrequency(e.target.value)}
            className={`mt-1 ${INPUT_CLASS}`}
          >
            <option value="mensual">Mensual</option>
            <option value="quincenal">Quincenal (días 15 y 30)</option>
          </select>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{isQuincenal ? "Monto por quincena" : "Monto mensual"}</label>
            <input
              type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="150000"
              className={`mt-1 ${INPUT_CLASS}`}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{isQuincenal ? "A partir de" : "Empieza el"}</label>
            <input
              type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className={`mt-1 ${INPUT_CLASS}`}
            />
          </div>
        </div>
        {isQuincenal && (
          <p className="text-xs text-slate-400">
            Se cuenta siempre en los días 15 y 30 (o fin de mes), empezando en la primera de esas fechas a partir de la que elijas.
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
    </ModalShell>
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
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl border border-slate-100 bg-white p-6 shadow-xl shadow-slate-900/10 dark:border-slate-800/60 dark:bg-slate-900 dark:shadow-black/40">
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
// Fusión de las pestañas "Ahorros" y "Metas" en una sola, a pedido del
// usuario (2026-07-31) -- eligió verlas con un interruptor (mismo patrón que
// "Reporte": Anual / Mensual y Quincenal), en vez de apiladas. Ninguna de las
// dos vistas cambió su lógica de datos por esto: Ahorros sigue alimentando el
// balance mensual de toda la app igual que antes, y un ahorro sigue sin
// necesitar una meta vinculada -- solo se decidió cuál de las dos se ve a la
// vez, dentro de una sola pestaña del menú.
function SavingsGoalsView({ fmt, onDataChanged, yearData, year, month, vista, onChangeVista }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onChangeVista("ahorros")}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
            vista === "ahorros"
              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
              : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
          }`}
        >
          <PiggyBank size={15} /> Ahorros
        </button>
        <button
          onClick={() => onChangeVista("metas")}
          className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
            vista === "metas"
              ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
              : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
          }`}
        >
          <Target size={15} /> Metas
        </button>
      </div>
      {vista === "ahorros" ? (
        <SavingsView fmt={fmt} onDataChanged={onDataChanged} year={year} month={month} />
      ) : (
        <GoalsView fmt={fmt} yearData={yearData} month={month} />
      )}
    </div>
  );
}
function SavingsView({ fmt, onDataChanged, year, month }) {
  const [savings, setSavings] = useState([]);
  const [goals, setGoals] = useState([]);
  // Tipos de ahorro (ej. "Fondo de emergencia", "Viaje a Argentina"): no
  // dependen del año/mes elegido, así que se cargan una sola vez -- mismo
  // patrón que los tipos de ingreso en Ingresos.
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSaving, setEditingSaving] = useState(null);
  const [deletingSaving, setDeletingSaving] = useState(null);
  const [showTypesManager, setShowTypesManager] = useState(false);
  const [typeFilter, setTypeFilter] = useState("Todos");
  const [viewingTypeReport, setViewingTypeReport] = useState(null);
  const [loadError, setLoadError] = useState("");
  async function refetchSavings() {
    const { data } = await supabase
      .from("savings")
      .select("*, goals(name, color)")
      .gte("date", `${year}-01-01`).lte("date", `${year}-12-31`)
      .order("date", { ascending: false });
    setSavings(data || []);
    if (onDataChanged) onDataChanged();
  }
  async function refetchTypes() {
    const { data } = await supabase.from("savings_types").select("*").order("name", { ascending: true });
    setTypes(data || []);
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
      setLoadError(
        error || glsError
          ? "No se pudieron cargar todos tus ahorros. Revisa tu conexión e intenta recargar la página."
          : ""
      );
      setSavings(sav || []);
      setGoals(gls || []);
      setLoading(false);
    }
    fetchAll();
  }, [year]);
  useEffect(() => {
    refetchTypes();
  }, []);
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
  // Total del mes anterior, solo para la insignia de tendencia -- ver el
  // mismo comentario en Ingresos/Gastos sobre por qué enero (month === 0)
  // se deja en 0 (el mes anterior no está cargado en esta pestaña).
  const prevMonthSavings = month > 0 ? savings.filter((s) => dateStringMonth(s.date) - 1 === month - 1) : [];
  const prevTotal = month > 0 ? prevMonthSavings.reduce((a, s) => a + Number(s.amount), 0) : 0;
  const filteredSavings = monthSavings.filter((s) => typeFilter === "Todos" || s.type === typeFilter);
  // Además de los tipos ya creados en "Tipos de ahorro", cualquier tipo que
  // haya quedado en un ahorro (ej. uno cuyo tipo ya se borró de la lista, o
  // de antes de que existiera esta lista) también aparece aquí, para que el
  // resumen por tipo y el filtro no dejen ningún ahorro fuera.
  const knownTypeValues = types.map((t) => t.name);
  const customTypeValues = [];
  savings.forEach((s) => {
    if (s.type && !knownTypeValues.includes(s.type) && !customTypeValues.includes(s.type)) {
      customTypeValues.push(s.type);
    }
  });
  const allTypes = [...types.map((t) => ({ value: t.name, label: t.name })), ...customTypeValues.map((v) => ({ value: v, label: v }))];
  // Solo los tipos que ya tienen al menos un ahorro entran al gráfico "Ahorro
  // por tipo" (antes eran tarjetas con el total de cada tipo, aunque
  // estuviera en ₡0) -- ordenado de mayor a menor, mismo criterio que ya usan
  // "Ingreso por tipo" (Ingresos) y "Gasto por artículo" (Gastos).
  const totalsByType = allTypes
    .map((t) => {
      const items = savings.filter((s) => s.type === t.value);
      return { ...t, items, total: items.reduce((a, s) => a + Number(s.amount), 0) };
    })
    .filter((t) => t.items.length > 0)
    .sort((a, b) => b.total - a.total);
  if (loading) {
    return <CardGridSkeleton count={6} />;
  }
  return (
    <div className="space-y-4">
      <LoadErrorBanner message={loadError} />
      <Card className="p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Eyebrow>Ahorrado en {MONTHS_FULL[month]} {year}</Eyebrow>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-2xl font-semibold tabular-nums text-blue-500">{fmt(total)}</p>
            <TrendBadge current={total} previous={prevTotal} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => exportToCSV("ahorros.csv", filteredSavings.map((s) => ({ Tipo: s.type, Meta: s.goals?.name || "", Monto: s.amount, Fecha: s.date })))}
            disabled={filteredSavings.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Download size={15} /> Exportar CSV
          </button>
          <button
            onClick={() => setShowTypesManager(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Tag size={15} /> Tipos de ahorro
          </button>
        </div>
      </Card>
      {/* Misma tarjeta punteada de "agregar", ahora arriba del todo -- a
          pedido del usuario (2026-07-31), para que quede en el mismo lugar
          que en Ingresos y Gastos. Se quitó el grid que la envolvía
          (2026-08-08, a pedido del usuario) -- como siempre es la única
          tarjeta ahí, el grid la dejaba más angosta que la tarjeta de
          arriba en pantallas grandes; ahora ocupa el ancho completo. */}
      <button
        onClick={() => setShowModal(true)}
        className="flex min-h-[152px] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 transition-colors hover:border-slate-300 hover:text-slate-500 dark:border-slate-700 dark:hover:border-slate-600"
      >
        <Plus size={20} />
        <span className="text-sm font-medium">Agregar ahorro</span>
      </button>
      {/* Antes eran tarjetas con el total anual de cada tipo -- el usuario
          notó (2026-07-31) que, con un solo ahorro por tipo en el mes, se
          veía igual que la tarjeta individual de abajo. Se cambió a un
          gráfico de barras (mismo patrón que "Ingreso por tipo"/"Gasto por
          artículo"), que sí aporta algo que las tarjetas del mes no dan: el
          acumulado del AÑO completo comparado entre tipos, no solo julio. */}
      {allTypes.length > 0 && (
        <Card className="p-5">
          <Eyebrow>Ahorro por tipo en {year}</Eyebrow>
          {totalsByType.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">Aún no has registrado ahorros con un tipo asignado.</p>
          ) : (
            <>
              <div className="mt-4" style={{ height: Math.max(120, totalsByType.length * 40) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={totalsByType} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <YAxis type="category" dataKey="label" width={90} tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v) => fmt(v)} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                    <Bar dataKey="total" fill="#3B82F6" radius={[0, 4, 4, 0]} barSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                {totalsByType.map((t) => (
                  <div key={t.value} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-700 dark:text-slate-200">{t.label}</p>
                      <p className="text-xs text-slate-400">{t.items.length} aporte{t.items.length === 1 ? "" : "s"}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="tabular-nums font-medium text-blue-500">{fmt(t.total)}</span>
                      <button
                        onClick={() => setViewingTypeReport(t)}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        Ver reporte
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      )}
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>Ahorros de {MONTHS_FULL[month]} {year}</Eyebrow>
        <select
          value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
        >
          <option>Todos</option>
          {allTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      {/* Misma forma de tarjetas que Metas (GoalsView), a pedido del usuario
          (2026-07-31). Reemplaza la lista con buscador/filtro (ListCard) que
          tenía antes. La tarjeta punteada de "agregar" quedó arriba del
          todo (ver más arriba), no repetida acá. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filteredSavings.length === 0 && (
          monthSavings.length === 0 ? (
            <EmptyState
              icon={PiggyBank}
              title={`Aún no tienes ahorros en ${MONTHS_FULL[month]} ${year}`}
              message="Cada colón que apartes cuenta -- agrega tu primer ahorro con el cuadro de arriba."
              className="col-span-full"
            />
          ) : (
            <p className="col-span-full text-sm text-slate-400">No hay ahorros de este tipo.</p>
          )
        )}
        {filteredSavings.map((s) => (
          <Card key={s.id} className="p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-500 dark:bg-blue-500/10">
                  <PiggyBank size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800 dark:text-white">{s.type}</p>
                  <p className="truncate text-xs text-slate-400">{s.date}</p>
                </div>
              </div>
              <RowActions onEdit={() => setEditingSaving(s)} onDelete={() => setDeletingSaving(s)} />
            </div>
            <p className="mt-4 text-xl font-semibold tabular-nums text-blue-500">{fmt(s.amount)}</p>
            {s.goals?.name && (
              <span
                className="mt-2 inline-flex max-w-full items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium"
                style={{ backgroundColor: `${s.goals.color || "#3B82F6"}1a`, color: s.goals.color || "#3B82F6" }}
              >
                <Target size={10} className="shrink-0" /> <span className="truncate">{s.goals.name}</span>
              </span>
            )}
          </Card>
        ))}
      </div>
      {showModal && (
        <SavingModal types={types} goals={goals} defaultDate={defaultDateForMonth(month, year)} onClose={() => setShowModal(false)} onSaved={refetchSavings} onTypesChanged={refetchTypes} />
      )}
      {editingSaving && (
        <SavingModal types={types} goals={goals} saving={editingSaving} onClose={() => setEditingSaving(null)} onSaved={refetchSavings} onTypesChanged={refetchTypes} />
      )}
      {showTypesManager && (
        <SavingsTypesManagerModal types={types} onClose={() => setShowTypesManager(false)} onChanged={refetchTypes} />
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
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl border border-slate-100 bg-white p-6 shadow-xl shadow-slate-900/10 dark:border-slate-800/60 dark:bg-slate-900 dark:shadow-black/40">
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
function SavingModal({ saving: savingRecord, types, goals, onClose, onSaved, onTypesChanged, defaultDate }) {
  const isEditing = Boolean(savingRecord);
  const today = localDateString();
  const [typeId, setTypeId] = useState(savingRecord?.type_id || "");
  const [goalId, setGoalId] = useState(savingRecord?.goal_id || "");
  const [amount, setAmount] = useState(savingRecord ? String(savingRecord.amount) : "");
  const [date, setDate] = useState(savingRecord?.date || defaultDate || today);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  // Tipos creados en el momento (con "+ Crear nuevo..." del selector) que
  // todavía no llegaron de vuelta en el `types` del padre (ese refetch es
  // async) -- se guardan acá también para que, si la persona guarda el
  // ahorro de inmediato, el nombre del tipo nuevo sí se encuentre y no se
  // guarde un "type" vacío por accidente.
  const [extraTypes, setExtraTypes] = useState([]);
  const allTypes = [...types, ...extraTypes.filter((t) => !types.some((x) => x.id === t.id))];
  async function handleSubmit(e) {
    e.preventDefault();
    if (!typeId || !amount || !date) {
      setErrorMsg("Completa el tipo, el monto y la fecha (puedes crear un tipo nuevo desde el mismo selector).");
      return;
    }
    const selectedType = allTypes.find((t) => t.id === typeId);
    setSaving(true);
    setErrorMsg("");
    const newGoalId = goalId || null;
    const newAmount = Number(amount);
    const finalType = selectedType?.name || "";
    if (isEditing) {
      const { error } = await supabase.from("savings").update({
        type: finalType,
        type_id: typeId,
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
      type_id: typeId,
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
    <ModalShell onClose={onClose} title={isEditing ? "Editar ahorro" : "Nuevo ahorro"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <TypeSelectWithCreate
          label="Tipo de ahorro"
          value={typeId}
          onChange={setTypeId}
          options={allTypes}
          table="savings_types"
          onCreated={(t) => { setExtraTypes((prev) => [...prev, t]); if (onTypesChanged) onTypesChanged(); }}
          placeholder="Selecciona un tipo"
          namePlaceholder="Ej. Fondo de emergencia"
          emptyHint="Aún no tienes tipos de ahorro."
        />
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Vincular a una meta (opcional)</label>
          <select
            value={goalId} onChange={(e) => setGoalId(e.target.value)}
            className={`mt-1 ${INPUT_CLASS}`}
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Monto</label>
            <input
              type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="50000"
              className={`mt-1 ${INPUT_CLASS}`}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Fecha</label>
            <input
              type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className={`mt-1 ${INPUT_CLASS}`}
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
    </ModalShell>
  );
}
// Espacio para armar la lista de tipos de ahorro, separado a propósito del
// formulario de "Agregar ahorro" (mismo patrón que
// IncomeTypesManagerModal/IncomeTypeModal de Ingresos): un lugar para
// crear/editar/borrar tipos, y otro distinto para registrar ahorros
// usándolos.
function SavingsTypesManagerModal({ types, onClose, onChanged }) {
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [deletingType, setDeletingType] = useState(null);
  const sortedTypes = [...types].sort((a, b) => a.name.localeCompare(b.name));
  async function handleDeleteType(id) {
    const { error } = await supabase.from("savings_types").delete().eq("id", id);
    if (!error) {
      onChanged();
      setDeletingType(null);
    }
  }
  return (
    <ModalShell
      onClose={onClose}
      title="Tipos de ahorro"
      overlayExtras={
        <>
          {showTypeModal && (
            <SavingsTypeModal onClose={() => setShowTypeModal(false)} onSaved={onChanged} />
          )}
          {editingType && (
            <SavingsTypeModal type={editingType} onClose={() => setEditingType(null)} onSaved={onChanged} />
          )}
          {deletingType && (
            <ConfirmDeleteModal
              title="Eliminar tipo de ahorro"
              message={`¿Seguro que quieres eliminar "${deletingType.name}"? Los ahorros que ya registraste con este tipo no se borran, solo quedan sin tipo asociado.`}
              onCancel={() => setDeletingType(null)}
              onConfirm={() => handleDeleteType(deletingType.id)}
            />
          )}
        </>
      }
    >
      <div className="space-y-4">
        {sortedTypes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400 dark:border-slate-700">
            Aún no hay tipos de ahorro.
          </p>
        ) : (
          <div className="max-h-[40vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
            {sortedTypes.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <p className="min-w-0 flex-1 truncate font-medium text-slate-700 dark:text-slate-200">{t.name}</p>
                <RowActions onEdit={() => setEditingType(t)} onDelete={() => setDeletingType(t)} />
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowTypeModal(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <Plus size={15} /> Agregar tipo
        </button>
      </div>
    </ModalShell>
  );
}
function SavingsTypeModal({ type, onClose, onSaved }) {
  const isEditing = Boolean(type);
  const [name, setName] = useState(type?.name || "");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg("Escribe un nombre.");
      return;
    }
    setSaving(true);
    setErrorMsg("");
    if (isEditing) {
      const { error } = await supabase.from("savings_types").update({ name: name.trim() }).eq("id", type.id);
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
    const { error } = await supabase.from("savings_types").insert({ user_id: userId || null, name: name.trim() });
    setSaving(false);
    if (error) {
      setErrorMsg("Error al guardar: " + error.message);
    } else {
      onSaved();
      onClose();
    }
  }
  return (
    <ModalShell onClose={onClose} title={isEditing ? "Editar tipo de ahorro" : "Nuevo tipo de ahorro"} maxWidth="max-w-sm" zIndex="z-[60]">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Nombre</label>
          <input
            value={name} onChange={(e) => setName(e.target.value)} autoFocus
            placeholder="Ej. Fondo de emergencia"
            className={`mt-1 ${INPUT_CLASS}`}
          />
        </div>
        {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}
        <button
          type="submit" disabled={saving}
          className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900"
        >
          {saving ? "Guardando..." : isEditing ? "Guardar cambios" : "Agregar tipo"}
        </button>
      </form>
    </ModalShell>
  );
}
/* ---------------------------------------------------------------
   PRESUPUESTOS
------------------------------------------------------------------ */
function BudgetsView({ fmt, year, month, categories }) {
  const [budgets, setBudgets] = useState([]);
  const [yearExpenses, setYearExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editingBudget, setEditingBudget] = useState(null);
  const [deletingBudget, setDeletingBudget] = useState(null);
  const [viewingCategoryExpenses, setViewingCategoryExpenses] = useState(null);

  async function refetch() {
    // Las categorías ya llegan como prop desde FinanceApp (se cargan una
    // sola vez ahí arriba, no dependen del año). Acá solo se piden
    // presupuestos y gastos.
    const [{ data: buds, error: budError }, { data: exps, error: expError }] = await Promise.all([
      supabase.from("budgets").select("*"),
      // Antes esto traía TODOS los gastos de la historia, sin filtrar por
      // fecha en la consulta, y filtraba por mes después en el navegador —
      // funcionaba, pero con los años se vuelve una consulta cada vez más
      // pesada (trae más y más filas que nunca hacían falta). Ahora se
      // acota a una ventana de un año con margen: un gasto con tarjeta de
      // crédito guarda en "date" la fecha de PAGO (puede caer 1-2 meses
      // después de la compra real, ver computeCardPaymentDate), así que el
      // margen cubre eso — se sigue filtrando por "purchase_date" (si
      // existe) o "date" abajo, esto solo acota cuánto se trae de Supabase.
      supabase.from("expenses")
        .select("id, amount, category_id, date, purchase_date, description, credit_cards(name)")
        .gte("date", `${year}-01-01`)
        .lte("date", `${year + 1}-03-31`),
    ]);
    if (budError) console.error("Error cargando presupuestos:", budError.message);
    if (expError) console.error("Error cargando gastos:", expError.message);
    setLoadError(
      budError || expError
        ? "No se pudieron cargar todos tus datos de Presupuestos. Revisa tu conexión e intenta recargar la página."
        : ""
    );
    setBudgets(buds || []);
    setYearExpenses(exps || []);
    setLoading(false);
  }
  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);
  // El mes que se está viendo se filtra al vuelo sobre lo ya cargado — ya no
  // hace falta volver a consultar Supabase solo por mover las flechitas de
  // mes (mismo año), como sí pasaba antes.
  const monthExpenses = useMemo(() => yearExpenses.filter((e) => {
    const effective = e.purchase_date || e.date;
    return dateStringYear(effective) === year && dateStringMonth(effective) === month + 1;
  }), [yearExpenses, year, month]);

  async function handleDelete(id) {
    const { error } = await supabase.from("budgets").delete().eq("id", id);
    if (error) throw error;
    setBudgets((prev) => prev.filter((b) => b.id !== id));
    setDeletingBudget(null);
  }

  if (loading) {
    return <CardGridSkeleton count={6} />;
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

  // Las que tienen gasto este mes van arriba (y entre ellas, primero las
  // más urgentes: sin presupuesto pero con gasto, luego por % usado
  // descendente). Después, las que tienen presupuesto pero sin movimiento
  // este mes. Al final, las que ni siquiera tienen presupuesto definido.
  // Así lo más importante de ver está siempre primero, sin tener que
  // escanear toda la cuadrícula.
  const sortedRows = [...rows].sort((a, b) => {
    const aActive = a.spent > 0;
    const bActive = b.spent > 0;
    if (aActive !== bActive) return aActive ? -1 : 1;
    if (aActive) {
      const aUrgency = a.pct === null ? Infinity : a.pct;
      const bUrgency = b.pct === null ? Infinity : b.pct;
      if (aUrgency !== bUrgency) return bUrgency - aUrgency;
    }
    const aHasBudget = Boolean(a.budget);
    const bHasBudget = Boolean(b.budget);
    if (aHasBudget !== bHasBudget) return aHasBudget ? -1 : 1;
    return a.category.name.localeCompare(b.category.name);
  });

  return (
    <div className="space-y-4">
      <LoadErrorBanner message={loadError} />
      <Card className="p-5">
        <Eyebrow>Presupuestos de {MONTHS_FULL[month]} {year}</Eyebrow>
        {isCurrentRealMonth && (
          <p className="mt-1 text-xs text-slate-400">
            Quedan {daysLeftInMonth} {daysLeftInMonth === 1 ? "día" : "días"} del mes
          </p>
        )}
      </Card>
      <Card className="divide-y divide-slate-100 p-0 dark:divide-slate-800">
        {sortedRows.map(({ category, budget, isOverride, spent, pct, categoryExpenses }) => {
          const color = category.color || "#64748B";
          const over = pct !== null && pct >= 100;
          const near = pct !== null && pct >= 80 && pct < 100;
          const barColor = over ? "bg-red-500" : near ? "bg-amber-400" : "bg-emerald-500";
          const pctColor = over ? "text-red-500" : near ? "text-amber-500" : "text-emerald-600";
          return (
            <div key={category.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-semibold" style={{ backgroundColor: `${color}1a`, color }}>
                {category.name.charAt(0)}
              </div>
              <button
                type="button"
                onClick={() => setViewingCategoryExpenses({ category, expenses: categoryExpenses })}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-white">
                    {category.name}
                    {budget && isOverride && (
                      <span className="ml-1.5 text-[10px] font-medium text-amber-500">· especial</span>
                    )}
                  </p>
                  {budget ? (
                    <span className={`shrink-0 text-sm font-semibold tabular-nums ${pctColor}`}>{pct}%</span>
                  ) : (
                    <span className="shrink-0 text-xs text-slate-400">{spent > 0 ? fmt(spent) : "Sin presupuesto"}</span>
                  )}
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    {budget && (
                      <div className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
                    )}
                  </div>
                  {budget && (
                    <span className={`shrink-0 text-[11px] tabular-nums ${over ? "text-red-500" : "text-slate-400"}`}>
                      {over
                        ? `${fmt(spent - Number(budget.monthly_amount))} de más`
                        : `${fmt(Number(budget.monthly_amount) - spent)} libres`}
                    </span>
                  )}
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                {budget && !isOverride && (
                  <button
                    type="button"
                    onClick={() => setEditingBudget({ category, budget: null, isOverride: false, forceScope: "specific" })}
                    aria-label={`Monto especial de ${MONTHS_FULL[month]}`}
                    title={`Monto especial de ${MONTHS_FULL[month]}`}
                    className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  >
                    <Clock size={14} />
                  </button>
                )}
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
            </div>
          );
        })}
        {rows.length === 0 && (
          <EmptyState
            icon={Coins}
            title="Primero crea categorías de gasto"
            message="En cuanto tengas categorías en Gastos, vas a poder definirles un presupuesto aquí."
          />
        )}
      </Card>
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
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl border border-slate-100 bg-white p-6 shadow-xl shadow-slate-900/10 dark:border-slate-800/60 dark:bg-slate-900 dark:shadow-black/40">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Gastos del mes · {category.name}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>
        <p className="mb-4 text-xs text-slate-400">
          Se cuentan por la fecha real de la compra, no por la fecha de pago de la tarjeta. Para editar o eliminar alguno, hazlo desde Gastos.
        </p>
        <div className="max-h-[55vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
          {sorted.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-700 dark:text-slate-200">{e.description || category.name}</p>
                <p className="truncate text-xs text-slate-400">
                  {e.purchase_date || e.date}
                  {e.credit_cards?.name && ` · ${e.credit_cards.name}`}
                </p>
              </div>
              <span className="shrink-0 tabular-nums font-medium text-red-500">{fmt(e.amount)}</span>
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
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-xl shadow-slate-900/10 dark:border-slate-800/60 dark:bg-slate-900 dark:shadow-black/40">
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
              className={`mt-1 ${INPUT_CLASS}`}
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
  { id: "inicio", label: "Inicio", icon: Home },
  { id: "mensual", label: "Mensual", icon: CalendarRange },
  { id: "incomes", label: "Ingresos", icon: TrendingUp },
  { id: "expenses", label: "Gastos", icon: TrendingDown },
  { id: "savings", label: "Ahorros y Metas", icon: PiggyBank },
  { id: "budgets", label: "Presupuestos", icon: Coins },
  { id: "calendar", label: "Calendario", icon: Calendar },
];
export default function FinanceApp() {
  const [tab, setTab] = useState("inicio");
  // "Reporte" (una sola pestaña con un interruptor interno "Anual" /
  // "Mensual y quincenal", agregado el 2026-07-30) se volvió a separar en dos
  // pestañas propias -- "Anual" y "Mensual" -- a pedido del usuario
  // (2026-08-01): el interruptor escondido adentro de una sola pestaña era la
  // única pestaña de la app que funcionaba distinto al resto (Ingresos,
  // Gastos, etc. son una cosa por pestaña), y esa inconsistencia era parte de
  // por qué esa pantalla se sentía cargada. "Mensual" muestra exactamente lo
  // mismo que antes era la vista "Quincenas" (QuincenasView), solo con el
  // nombre de pestaña cambiado -- decisión explícita del usuario, para no
  // duplicar contenido que ya existe en otro lado de la app.
  // "Ahorros y Metas" fusiona lo que antes eran dos pestañas separadas, a
  // pedido del usuario (2026-07-31), con el mismo patrón de interruptor que
  // "Reporte" -- acá solo hace falta para el título de arriba (las flechitas
  // de mes son iguales en las dos vistas, así que no afectan esa parte).
  const [savingsVista, setSavingsVista] = useState("ahorros");
  const [monthOpen, setMonthOpen] = useState(null);
  const { code, setCode, format } = useCurrency();
  const [yearData, setYearData] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [yearDataError, setYearDataError] = useState(false);
  const realCurrentYear = new Date().getFullYear();
  const [year, setYear] = useState(realCurrentYear);
  // Mes compartido por Ingresos/Gastos/Calendario/Ahorros/Presupuestos
  // (0 = enero). Antes se elegía con un <select> fijo arriba del todo, junto
  // a la moneda; el 2026-07-27 por la noche se quitó ese selector y en su
  // lugar cada una de esas pestañas muestra flechitas "‹ Mes Año ›" debajo de
  // su título (mismo lugar donde antes solo Resumen tenía flechitas de año).
  // Solo Resumen se quedó con las flechitas de AÑO (ahí la vista es siempre
  // anual, no de un mes puntual) — ver más abajo, en el título de cada
  // pestaña, dónde se bifurca uno u otro control.
  const [month, setMonth] = useState(() => new Date().getMonth());
  // Categorías y tarjetas de crédito no dependen del año/mes elegido y antes
  // se volvían a pedir a Supabase por separado en Gastos y en Presupuestos
  // cada vez que se entraba a esas pestañas. Ahora se cargan una sola vez
  // acá arriba y se pasan como prop hacia abajo — menos consultas repetidas
  // a la base de datos por la misma información.
  const [categories, setCategories] = useState([]);
  const [cards, setCards] = useState([]);
  // Cuentas (2026-08-08): igual que categorías y tarjetas, se cargan una
  // sola vez acá arriba -- las necesitan tanto Inicio (para el carrusel de
  // "Tus cuentas") como Ingresos y Gastos (para el selector opcional de
  // "Cuenta" que liga cada movimiento con el saldo real de una cuenta).
  const [accounts, setAccounts] = useState([]);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  async function refetchCards() {
    const { data } = await supabase.from("credit_cards").select("*").order("name", { ascending: true });
    setCards(data || []);
  }
  async function refetchAccounts() {
    const { data } = await supabase.from("accounts").select("*").order("created_at", { ascending: true });
    setAccounts(data || []);
  }
  useEffect(() => {
    supabase.from("categories").select("*").then(({ data }) => setCategories(sortCategories(data || [])));
    refetchCards();
    refetchAccounts();
  }, []);

  async function loadYearData(y = year) {
    setDataLoading(true);
    const { months, hadError } = await fetchYearData(y);
    setYearData(months);
    setYearDataError(hadError);
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
  // Mueve el mes elegido hacia adelante/atrás; si se sale de enero o
  // diciembre, pasa también al año anterior/siguiente (mismo wraparound que
  // tenía la barra de flechitas original, antes de moverse al selector fijo).
  const atMaxFutureMonth = year >= realCurrentYear + MAX_FUTURE_YEARS && month === 11;
  const goToMonth = (delta) => {
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth > 11) { newMonth = 0; newYear = year + 1; }
    else if (newMonth < 0) { newMonth = 11; newYear = year - 1; }
    if (newYear !== year) setYear(Math.min(realCurrentYear + MAX_FUTURE_YEARS, newYear));
    setMonth(newMonth);
  };
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
              <select
                value={code} onChange={(e) => setCode(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium outline-none dark:border-slate-800 dark:bg-slate-900"
              >
                {Object.keys(CURRENCIES).map((c) => <option key={c}>{c}</option>)}
              </select>
              <button
                onClick={() => setShowDeleteAllModal(true)}
                title="Eliminar toda mi información"
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-500 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-red-500/30 dark:hover:bg-red-500/10"
              >
                <Trash2 size={15} />
              </button>
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
                {tab === "inicio" && "Centro de control financiero"}
                {tab === "mensual" && "Control por período"}
                {tab === "incomes" && "Tus ingresos"}
                {tab === "expenses" && "Tus gastos"}
                {tab === "calendar" && "Calendario de pagos"}
                {tab === "budgets" && "Presupuestos"}
                {tab === "savings" && (savingsVista === "ahorros" ? "Tus ahorros" : "Tus metas")}
              </h1>
              {tab === "inicio" ? (
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
              ) : ["mensual", "incomes", "expenses", "calendar", "savings", "budgets"].includes(tab) ? (
                <div className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-400">
                  <button
                    onClick={() => goToMonth(-1)}
                    className="rounded-md p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800"
                    aria-label="Mes anterior"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="tabular-nums font-medium text-slate-600 dark:text-slate-300">{MONTHS_FULL[month]} {year}</span>
                  <button
                    onClick={() => goToMonth(1)}
                    disabled={atMaxFutureMonth}
                    className="rounded-md p-0.5 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
                    aria-label="Mes siguiente"
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
          <LoadErrorBanner message={yearDataError ? "No se pudieron cargar todos tus datos de este año. Revisa tu conexión e intenta recargar la página." : ""} />
          {dataLoading || !yearData ? (
            // Esta carga inicial (yearData) es compartida por todas las
            // pestañas, así que el esqueleto se elige según cuál se está
            // viendo -- Anual/Mensual/Calendario tienen forma de tarjetas +
            // gráficos grandes; el resto (Ingresos/Gastos/Ahorros/
            // Presupuestos) se ve más como una cuadrícula de tarjetas.
            tab === "inicio" || tab === "mensual" || tab === "calendar" ? <DashboardSkeleton /> : <CardGridSkeleton count={6} />
          ) : (
            <>
              {tab === "inicio" && (
                <Dashboard
                  fmt={format}
                  onSelectMonth={openMonth}
                  yearData={yearData}
                  year={year}
                  month={month}
                  categories={categories}
                  onNavigateTab={setTab}
                  accounts={accounts}
                  refetchAccounts={refetchAccounts}
                  cards={cards}
                  refetchCards={refetchCards}
                />
              )}
              {tab === "mensual" && (
                <QuincenasView fmt={format} yearData={yearData} year={year} month={month} onJumpToMonth={setMonth} />
              )}
              {tab === "calendar" && <CalendarView fmt={format} year={year} month={month} yearData={yearData} />}
            </>
          )}
          {tab === "incomes" && <IncomesView fmt={format} onDataChanged={loadYearData} year={year} month={month} accounts={accounts} />}
          {tab === "expenses" && <ExpensesView fmt={format} onDataChanged={loadYearData} year={year} month={month} categories={categories} cards={cards} refetchCards={refetchCards} accounts={accounts} />}
          {tab === "budgets" && <BudgetsView fmt={format} year={year} month={month} categories={categories} />}
          {tab === "savings" && (
            <SavingsGoalsView
              fmt={format}
              onDataChanged={loadYearData}
              yearData={yearData}
              year={year}
              month={month}
              vista={savingsVista}
              onChangeVista={setSavingsVista}
            />
          )}
        </main>
        {monthOpen !== null && yearData && (
          <MonthDetail index={monthOpen} year={year} fmt={format} onClose={() => setMonthOpen(null)} onNav={navMonth} yearData={yearData} />
        )}
        {showDeleteAllModal && (
          <DeleteAllDataModal
            onClose={() => setShowDeleteAllModal(false)}
            // Después de borrar todo, se recarga la página completa en vez
            // de solo refrescar yearData -- así cada pestaña (que guarda su
            // propia lista en su estado local, ej. tipos, tarjetas,
            // artículos) también parte de cero, sin arrastrar nada viejo en
            // memoria.
            onDeleted={() => window.location.reload()}
          />
        )}
      </div>
    </div>
  );
}