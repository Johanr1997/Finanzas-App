"use client";
import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart,
} from "recharts";
import {
  Wallet, TrendingUp, TrendingDown, PiggyBank, Target, Sun, Moon,
  Search, Filter, Download, ChevronRight, ChevronLeft, X, Plus,
  Home, Utensils, Car, Zap, HeartPulse, GraduationCap, Popcorn,
  ShoppingBag, Repeat, MoreHorizontal, Sparkles, Check, Trash2,
  Calendar, Bell, ArrowUpRight, ArrowDownRight, Settings2, Globe,
  Pencil,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
/* ---------------------------------------------------------------
   TOKENS
------------------------------------------------------------------ */
const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MONTHS_FULL = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
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
  Otros: { icon: MoreHorizontal, color: "#64748B" },
};
const CATEGORY_NAMES = Object.keys(CATEGORY_META);
const CURRENCIES = {
  CRC: { symbol: "₡", rate: 1, locale: "es-CR" },
  USD: { symbol: "$", rate: 1 / 520, locale: "en-US" },
  EUR: { symbol: "€", rate: 1 / 560, locale: "es-ES" },
};
/* ---------------------------------------------------------------
   DATOS REALES — agrupa incomes/expenses/savings por mes
------------------------------------------------------------------ */
async function fetchYearData(year) {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const [
    { data: incomes, error: incError },
    { data: expenses, error: expError },
    { data: savings, error: savError },
  ] = await Promise.all([
    supabase.from("incomes").select("*").gte("date", start).lte("date", end),
    supabase.from("expenses").select("*, categories(name, color, icon)").gte("date", start).lte("date", end),
    supabase.from("savings").select("*").gte("date", start).lte("date", end),
  ]);
  if (incError) console.error("Error incomes:", incError.message);
  if (expError) console.error("Error expenses:", expError.message);
  if (savError) console.error("Error savings:", savError.message);
  const monthsData = MONTHS.map((m, i) => {
    const monthNum = i + 1;
    const monthIncomes = (incomes || []).filter((r) => new Date(r.date).getMonth() + 1 === monthNum);
    const monthExpenses = (expenses || []).filter((r) => new Date(r.date).getMonth() + 1 === monthNum);
    const monthSavings = (savings || []).filter((r) => new Date(r.date).getMonth() + 1 === monthNum);
    const ingresoTotal = monthIncomes.reduce((a, r) => a + Number(r.amount), 0);
    const gastoTotal = monthExpenses.reduce((a, r) => a + Number(r.amount), 0);
    const ahorroTotal = monthSavings.reduce((a, r) => a + Number(r.amount), 0);
    const balance = ingresoTotal - gastoTotal - ahorroTotal;
    const gastosFormateados = monthExpenses.map((e) => ({
      id: e.id,
      categoria: e.categories?.name || "Otros",
      descripcion: e.description || e.categories?.name || "Gasto",
      fecha: e.date,
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
  const cfg = CURRENCIES[code];
  const format = useCallback((crcAmount) => {
    const value = crcAmount * cfg.rate;
    return new Intl.NumberFormat(cfg.locale, {
      style: "currency", currency: code, maximumFractionDigits: 0,
    }).format(value);
  }, [code, cfg]);
  return { code, setCode, format };
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
/* ---------------------------------------------------------------
   DASHBOARD
------------------------------------------------------------------ */
function Dashboard({ fmt, onSelectMonth, yearData }) {
  const totals = useMemo(() => {
    const ingresos = yearData.reduce((a, m) => a + m.ingresoTotal, 0);
    const gastos = yearData.reduce((a, m) => a + m.gastoTotal, 0);
    const ahorros = yearData.reduce((a, m) => a + m.ahorroTotal, 0);
    const balance = ingresos - gastos - ahorros;
    return { ingresos, gastos, ahorros, balance, saldo: ingresos - gastos };
  }, [yearData]);
  const metaAnual = 3000000;
  const metaProgreso = Math.min(100, Math.round((totals.ahorros / (metaAnual || 1)) * 100));
  const barData = yearData.map((m) => ({ mes: m.mes, Ingresos: m.ingresoTotal, Gastos: m.gastoTotal }));
  const lineData = useMemo(() => {
    let acc = 0;
    return yearData.map((m) => { acc += m.ahorroTotal; return { mes: m.mes, Ahorro: acc }; });
  }, [yearData]);
  const now = new Date();
  const currentIdx = now.getMonth();
  const prevIdx = Math.max(0, currentIdx - 1);
  const currentMonth = yearData[currentIdx];
  const prevMonth = yearData[prevIdx];
  const insights = [];
  if (prevMonth.gastoTotal > 0) {
    const pct = Math.abs(Math.round((1 - currentMonth.gastoTotal / prevMonth.gastoTotal) * 100));
    insights.push(`En ${currentMonth.mesFull.toLowerCase()} gastaste ${pct}% ${currentMonth.gastoTotal < prevMonth.gastoTotal ? "menos" : "más"} que en ${prevMonth.mesFull.toLowerCase()}.`);
  }
  const allExpenses = yearData.flatMap((m) => m.gastos);
  if (allExpenses.length > 0) {
    const byCat = allExpenses.reduce((a, e) => (a[e.categoria] = (a[e.categoria] || 0) + e.monto, a), {});
    const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
    if (top) insights.push(`Tu categoría con mayor gasto este año fue ${top[0]}.`);
  }
  if (currentMonth.ingresoTotal > 0) {
    insights.push(`Este mes has ahorrado un ${Math.round((currentMonth.ahorroTotal / currentMonth.ingresoTotal) * 100)}% de tus ingresos.`);
  }
  if (totals.ahorros > 0) {
    const promedioMensual = totals.ahorros / (currentIdx + 1);
    if (promedioMensual > 0) {
      insights.push(`Si mantienes este ritmo de ahorro, alcanzarás tu meta anual en ${Math.max(1, Math.ceil((metaAnual - totals.ahorros) / promedioMensual))} meses.`);
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
          <ProgressRing percent={metaProgreso} color="#F59E0B" size={56} />
          <div>
            <Eyebrow>Meta anual de ahorro</Eyebrow>
            <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{metaProgreso}%</p>
            <p className="text-xs text-slate-400">{fmt(totals.ahorros)} de {fmt(metaAnual)}</p>
          </div>
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
   VISTA ANUAL
------------------------------------------------------------------ */
function AnnualTable({ fmt, onSelectMonth, yearData }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-400 dark:border-slate-800">
              <th className="px-5 py-3 font-medium">Mes</th>
              <th className="px-5 py-3 font-medium">Ingresos</th>
              <th className="px-5 py-3 font-medium">Gastos</th>
              <th className="px-5 py-3 font-medium">Ahorros</th>
              <th className="px-5 py-3 font-medium">Balance</th>
              <th className="px-5 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {yearData.map((m, i) => {
              const st = statusOf(m.balance, m.ingresoTotal);
              return (
                <tr
                  key={m.mes}
                  onClick={() => onSelectMonth(i)}
                  className="cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/50"
                >
                  <td className="px-5 py-3 font-medium text-slate-900 dark:text-white">{m.mesFull}</td>
                  <td className="px-5 py-3 tabular-nums text-emerald-600">{fmt(m.ingresoTotal)}</td>
                  <td className="px-5 py-3 tabular-nums text-red-500">{fmt(m.gastoTotal)}</td>
                  <td className="px-5 py-3 tabular-nums text-blue-500">{fmt(m.ahorroTotal)}</td>
                  <td className={`px-5 py-3 tabular-nums font-medium ${m.balance >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmt(m.balance)}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-white ${STATUS_COLOR[st]}`}>
                      {STATUS_LABEL[st]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
/* ---------------------------------------------------------------
   VISTA MENSUAL
------------------------------------------------------------------ */
function MonthDetail({ index, fmt, onClose, onNav, yearData }) {
  const m = yearData[index];
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("Todas");
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
                        <p className="text-xs text-slate-400">{e.categoria} · {e.fecha}</p>
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
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [deletingGoal, setDeletingGoal] = useState(null);
  async function refetchGoals() {
    const { data } = await supabase.from("goals").select("*");
    setGoals(data || []);
  }
  useEffect(() => {
    async function fetchGoals() {
      const { data, error } = await supabase.from("goals").select("*");
      if (error) {
        console.error("Error cargando metas:", error.message);
        setGoals([]);
      } else {
        setGoals(data || []);
      }
      setLoading(false);
    }
    fetchGoals();
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
function IncomesView({ fmt, onDataChanged }) {
  const [incomes, setIncomes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingIncome, setEditingIncome] = useState(null);
  const [deletingIncome, setDeletingIncome] = useState(null);
  async function refetchIncomes() {
    const { data } = await supabase.from("incomes").select("*").order("date", { ascending: false });
    setIncomes(data || []);
    if (onDataChanged) onDataChanged();
  }
  useEffect(() => {
    async function fetchIncomes() {
      const { data, error } = await supabase.from("incomes").select("*").order("date", { ascending: false });
      if (error) {
        console.error("Error cargando ingresos:", error.message);
        setIncomes([]);
      } else {
        setIncomes(data || []);
      }
      setLoading(false);
    }
    fetchIncomes();
  }, []);
  async function handleDelete(id) {
    const { error } = await supabase.from("incomes").delete().eq("id", id);
    if (error) throw error;
    setIncomes((prev) => prev.filter((i) => i.id !== id));
    if (onDataChanged) onDataChanged();
    setDeletingIncome(null);
  }
  const total = incomes.reduce((a, i) => a + Number(i.amount), 0);
  if (loading) {
    return <p className="text-sm text-slate-400">Cargando ingresos...</p>;
  }
  return (
    <div className="space-y-4">
      <Card className="p-5 flex items-center justify-between">
        <div>
          <Eyebrow>Total de ingresos registrados</Eyebrow>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-600">{fmt(total)}</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900"
        >
          <Plus size={15} /> Agregar ingreso
        </button>
      </Card>
      <Card className="overflow-hidden">
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {incomes.map((i) => (
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
          {incomes.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-slate-400">Aún no has registrado ingresos.</p>
          )}
        </div>
      </Card>
      {showModal && (
        <IncomeModal onClose={() => setShowModal(false)} onSaved={refetchIncomes} />
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
    </div>
  );
}
function IncomeModal({ income, onClose, onSaved }) {
  const isEditing = Boolean(income);
  const today = new Date().toISOString().slice(0, 10);
  const [type, setType] = useState(income?.type || "");
  const [description, setDescription] = useState(income?.description || "");
  const [amount, setAmount] = useState(income ? String(income.amount) : "");
  const [date, setDate] = useState(income?.date || today);
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
    const dateObj = new Date(date);
    if (isEditing) {
      const { error } = await supabase.from("incomes").update({
        year: dateObj.getFullYear(),
        month: dateObj.getMonth() + 1,
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
      year: dateObj.getFullYear(),
      month: dateObj.getMonth() + 1,
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
/* ---------------------------------------------------------------
   GASTOS
------------------------------------------------------------------ */
function ExpensesView({ fmt, onDataChanged }) {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [deletingExpense, setDeletingExpense] = useState(null);
  async function refetchExpenses() {
    const { data } = await supabase
      .from("expenses")
      .select("*, categories(name, color, icon)")
      .order("date", { ascending: false });
    setExpenses(data || []);
    if (onDataChanged) onDataChanged();
  }
  useEffect(() => {
    async function fetchAll() {
      const [{ data: exp, error: expError }, { data: cats, error: catError }] = await Promise.all([
        supabase.from("expenses").select("*, categories(name, color, icon)").order("date", { ascending: false }),
        supabase.from("categories").select("*"),
      ]);
      if (expError) console.error("Error cargando gastos:", expError.message);
      if (catError) console.error("Error cargando categorías:", catError.message);
      setExpenses(exp || []);
      setCategories(cats || []);
      setLoading(false);
    }
    fetchAll();
  }, []);
  async function handleDelete(id) {
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) throw error;
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    if (onDataChanged) onDataChanged();
    setDeletingExpense(null);
  }
  const total = expenses.reduce((a, e) => a + Number(e.amount), 0);
  if (loading) {
    return <p className="text-sm text-slate-400">Cargando gastos...</p>;
  }
  return (
    <div className="space-y-4">
      <Card className="p-5 flex items-center justify-between">
        <div>
          <Eyebrow>Total de gastos registrados</Eyebrow>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-red-500">{fmt(total)}</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900"
        >
          <Plus size={15} /> Agregar gasto
        </button>
      </Card>
      <Card className="overflow-hidden">
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {expenses.map((e) => (
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
                  <p className="text-xs text-slate-400">{e.categories?.name} · {e.date}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="tabular-nums font-medium text-red-500">{fmt(e.amount)}</span>
                <RowActions onEdit={() => setEditingExpense(e)} onDelete={() => setDeletingExpense(e)} />
              </div>
            </div>
          ))}
          {expenses.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-slate-400">Aún no has registrado gastos.</p>
          )}
        </div>
      </Card>
      {showModal && (
        <ExpenseModal categories={categories} onClose={() => setShowModal(false)} onSaved={refetchExpenses} />
      )}
      {editingExpense && (
        <ExpenseModal
          categories={categories}
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
    </div>
  );
}
function ExpenseModal({ categories, expense, onClose, onSaved }) {
  const isEditing = Boolean(expense);
  const today = new Date().toISOString().slice(0, 10);
  const [categoryId, setCategoryId] = useState(expense?.category_id || categories[0]?.id || "");
  const [description, setDescription] = useState(expense?.description || "");
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [date, setDate] = useState(expense?.date || today);
  const [isRecurring, setIsRecurring] = useState(expense?.is_recurring || false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  async function handleSubmit(e) {
    e.preventDefault();
    if (!categoryId || !amount || !date) {
      setErrorMsg("Completa al menos la categoría, el monto y la fecha.");
      return;
    }
    setSaving(true);
    setErrorMsg("");
    if (isEditing) {
      const { error } = await supabase.from("expenses").update({
        category_id: categoryId,
        description,
        amount: Number(amount),
        date,
        is_recurring: isRecurring,
      }).eq("id", expense.id);
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
      category_id: categoryId,
      description,
      amount: Number(amount),
      date,
      is_recurring: isRecurring,
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
              <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Fecha</label>
              <input
                type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
            Es un gasto recurrente (se repite cada mes)
          </label>
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
/* ---------------------------------------------------------------
   AHORROS
------------------------------------------------------------------ */
const SAVINGS_TYPES = [
  { value: "emergencia", label: "Fondo de emergencia" },
  { value: "inversiones", label: "Inversiones" },
  { value: "libre", label: "Ahorro libre" },
];
function SavingsView({ fmt, onDataChanged }) {
  const [savings, setSavings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSaving, setEditingSaving] = useState(null);
  const [deletingSaving, setDeletingSaving] = useState(null);
  async function refetchSavings() {
    const { data } = await supabase.from("savings").select("*").order("date", { ascending: false });
    setSavings(data || []);
    if (onDataChanged) onDataChanged();
  }
  useEffect(() => {
    async function fetchSavings() {
      const { data, error } = await supabase.from("savings").select("*").order("date", { ascending: false });
      if (error) console.error("Error cargando ahorros:", error.message);
      setSavings(data || []);
      setLoading(false);
    }
    fetchSavings();
  }, []);
  async function handleDelete(id) {
    const { error } = await supabase.from("savings").delete().eq("id", id);
    if (error) throw error;
    setSavings((prev) => prev.filter((s) => s.id !== id));
    if (onDataChanged) onDataChanged();
    setDeletingSaving(null);
  }
  const total = savings.reduce((a, s) => a + Number(s.amount), 0);
  if (loading) {
    return <p className="text-sm text-slate-400">Cargando ahorros...</p>;
  }
  return (
    <div className="space-y-4">
      <Card className="p-5 flex items-center justify-between">
        <div>
          <Eyebrow>Total ahorrado</Eyebrow>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-blue-500">{fmt(total)}</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900"
        >
          <Plus size={15} /> Agregar ahorro
        </button>
      </Card>
      <Card className="overflow-hidden">
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {savings.map((s) => {
            const label = SAVINGS_TYPES.find((t) => t.value === s.type)?.label || s.type;
            return (
              <div key={s.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <p className="font-medium text-slate-700 dark:text-slate-200">{label}</p>
                  <p className="text-xs text-slate-400">{s.date}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums font-medium text-blue-500">{fmt(s.amount)}</span>
                  <RowActions onEdit={() => setEditingSaving(s)} onDelete={() => setDeletingSaving(s)} />
                </div>
              </div>
            );
          })}
          {savings.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-slate-400">Aún no has registrado ahorros.</p>
          )}
        </div>
      </Card>
      {showModal && (
        <SavingModal onClose={() => setShowModal(false)} onSaved={refetchSavings} />
      )}
      {editingSaving && (
        <SavingModal saving={editingSaving} onClose={() => setEditingSaving(null)} onSaved={refetchSavings} />
      )}
      {deletingSaving && (
        <ConfirmDeleteModal
          title="Eliminar ahorro"
          message={`¿Seguro que quieres eliminar este registro de ahorro de ${fmt(deletingSaving.amount)}? Esta acción no se puede deshacer.`}
          onCancel={() => setDeletingSaving(null)}
          onConfirm={() => handleDelete(deletingSaving.id)}
        />
      )}
    </div>
  );
}
function SavingModal({ saving: savingRecord, onClose, onSaved }) {
  const isEditing = Boolean(savingRecord);
  const today = new Date().toISOString().slice(0, 10);
  const [type, setType] = useState(savingRecord?.type || "libre");
  const [amount, setAmount] = useState(savingRecord ? String(savingRecord.amount) : "");
  const [date, setDate] = useState(savingRecord?.date || today);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  async function handleSubmit(e) {
    e.preventDefault();
    if (!amount || !date) {
      setErrorMsg("Completa al menos el monto y la fecha.");
      return;
    }
    setSaving(true);
    setErrorMsg("");
    const dateObj = new Date(date);
    if (isEditing) {
      const { error } = await supabase.from("savings").update({
        type,
        amount: Number(amount),
        date,
        year: dateObj.getFullYear(),
        month: dateObj.getMonth() + 1,
      }).eq("id", savingRecord.id);
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
      type,
      amount: Number(amount),
      date,
      year: dateObj.getFullYear(),
      month: dateObj.getMonth() + 1,
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
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{isEditing ? "Editar ahorro" : "Nuevo ahorro"}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Tipo de ahorro</label>
            <select
              value={type} onChange={(e) => setType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              {SAVINGS_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
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
   ESTADÍSTICAS
------------------------------------------------------------------ */
function StatsView({ fmt, yearData }) {
  const allExpenses = yearData.flatMap((m) => m.gastos);
  const categoriasUsadas = [...new Set(allExpenses.map((e) => e.categoria))];
  const catTotals = categoriasUsadas.map((cat) => ({
    name: cat,
    value: allExpenses.filter((e) => e.categoria === cat).reduce((a, e) => a + e.monto, 0),
    color: CATEGORY_META[cat]?.color || "#64748B",
  }));
  const monthCompare = yearData.map((m) => ({ mes: m.mes, Balance: m.balance }));
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <Eyebrow>Gastos por categoría (año completo)</Eyebrow>
          <div className="mt-4 h-72">
            {catTotals.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={catTotals} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                    {catTotals.map((d, i) => <Cell key={i} fill={d.color} />)}
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
          <div className="mt-4 h-72">
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
        <Eyebrow>Evolución de ingresos, gastos y ahorro</Eyebrow>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={yearData.map((m) => ({ mes: m.mes, Ingresos: m.ingresoTotal, Gastos: m.gastoTotal, Ahorro: m.ahorroTotal }))}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v) => fmt(v)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="Ingresos" stroke="#22C55E" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Gastos" stroke="#EF4444" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Ahorro" stroke="#3B82F6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
/* ---------------------------------------------------------------
   APP SHELL
------------------------------------------------------------------ */
const TABS = [
  { id: "dashboard", label: "Resumen", icon: Wallet },
  { id: "annual", label: "Vista anual", icon: Calendar },
  { id: "incomes", label: "Ingresos", icon: TrendingUp },
  { id: "expenses", label: "Gastos", icon: TrendingDown },
  { id: "savings", label: "Ahorros", icon: PiggyBank },
  { id: "goals", label: "Metas", icon: Target },
  { id: "stats", label: "Estadísticas", icon: TrendingUp },
];
export default function FinanceApp() {
  const [dark, setDark] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [monthOpen, setMonthOpen] = useState(null);
  const { code, setCode, format } = useCurrency();
  const [yearData, setYearData] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);
  const currentYear = new Date().getFullYear();
  async function loadYearData() {
    setDataLoading(true);
    const data = await fetchYearData(currentYear);
    setYearData(data);
    setDataLoading(false);
  }
  useEffect(() => {
    loadYearData();
  }, []);
  async function handleLogout() {
    await supabase.auth.signOut();
  }
  const openMonth = (i) => setMonthOpen(i);
  const navMonth = (delta) => setMonthOpen((i) => Math.min(11, Math.max(0, i + delta)));
  return (
    <div className={dark ? "dark" : ""}>
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
                onClick={() => setDark((d) => !d)}
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                {dark ? <Sun size={15} /> : <Moon size={15} />}
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
                {tab === "dashboard" && "Resumen del año"}
                {tab === "annual" && "Vista anual"}
                {tab === "incomes" && "Tus ingresos"}
                {tab === "expenses" && "Tus gastos"}
                {tab === "savings" && "Tus ahorros"}
                {tab === "goals" && "Tus metas"}
                {tab === "stats" && "Estadísticas"}
              </h1>
              <p className="text-sm text-slate-400">{currentYear} · actualizado en tiempo real</p>
            </div>
          </div>
          {dataLoading || !yearData ? (
            <p className="text-sm text-slate-400">Cargando tus datos...</p>
          ) : (
            <>
              {tab === "dashboard" && <Dashboard fmt={format} onSelectMonth={openMonth} yearData={yearData} />}
              {tab === "annual" && <AnnualTable fmt={format} onSelectMonth={openMonth} yearData={yearData} />}
              {tab === "stats" && <StatsView fmt={format} yearData={yearData} />}
            </>
          )}
          {tab === "incomes" && <IncomesView fmt={format} onDataChanged={loadYearData} />}
          {tab === "expenses" && <ExpensesView fmt={format} onDataChanged={loadYearData} />}
          {tab === "savings" && <SavingsView fmt={format} onDataChanged={loadYearData} />}
          {tab === "goals" && <GoalsView fmt={format} />}
        </main>
        {monthOpen !== null && yearData && (
          <MonthDetail index={monthOpen} fmt={format} onClose={() => setMonthOpen(null)} onNav={navMonth} yearData={yearData} />
        )}
      </div>
    </div>
  );
}