"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  DollarSign,
  ShoppingBag,
  Activity,
  Users,
  Loader2,
  Calendar,
  FileText,
  Filter,
  Printer,
} from "lucide-react";
import { motion } from "framer-motion";
import { API_URL } from "@/lib/api";
import { useRestaurantStore } from "@/store/restaurantStore";

const today = new Date().toISOString().slice(0, 10);

const StatsPage = () => {
  const { selectedRestaurantId } = useRestaurantStore();
  const [stats, setStats] = useState<any>(null);
  const [report, setReport] = useState<any>(null);
  const [reportRows, setReportRows] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<string[]>(["ALL"]);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [filters, setFilters] = useState({
    dateFrom: today,
    dateTo: today,
    paymentMethod: "ALL",
  });

  const getToken = () => typeof window !== "undefined" ? localStorage.getItem("palmyra_token") || "" : "";

  const fetchReport = async (nextFilters = filters) => {
    setReportLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/admin/reports/orders`, {
        headers: { Authorization: `Bearer ${getToken()}` },
        params: { ...nextFilters, restaurantId: selectedRestaurantId },
      });
      setReportRows(res.data.orders || []);
      setPaymentMethods(res.data.availablePaymentMethods || ["ALL"]);
    } catch (err) {
      console.error("Error fetching report rows:", err);
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [statsRes, reportRes] = await Promise.all([
          axios.get(`${API_URL}/api/admin/stats`, { 
            headers: { Authorization: `Bearer ${getToken()}` },
            params: { restaurantId: selectedRestaurantId }
          }),
          axios.get(`${API_URL}/api/admin/stats/report`, { 
            headers: { Authorization: `Bearer ${getToken()}` },
            params: { restaurantId: selectedRestaurantId }
          }),
        ]);
        setStats(statsRes.data);
        setReport(reportRes.data);
      } catch (err) {
        console.error("Error fetching stats:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    fetchReport(filters);
  }, [selectedRestaurantId]);

  const currentCards = [
    { label: "Intäkter Idag", value: `${stats?.revenueToday ?? 0} kr`, icon: DollarSign, color: "text-emerald-400" },
    { label: "Ordrar Idag", value: stats?.ordersToday ?? 0, icon: ShoppingBag, color: "text-blue-400" },
    { label: "Väntande Ordrar", value: stats?.pendingOrders ?? 0, icon: Activity, color: "text-gold-500" },
    { label: "Totalt Antal Ordrar", value: stats?.totalOrders ?? 0, icon: Users, color: "text-purple-400" },
  ];

  const reportCards = [
    { label: "Senaste 7 Dagarna", revenue: report?.last7?.revenue ?? 0, count: report?.last7?.count ?? 0, period: "VECKOÖVERSIKT" },
    { label: "Senaste 30 Dagarna", revenue: report?.last30?.revenue ?? 0, count: report?.last30?.count ?? 0, period: "MÅNADSÖVERSIKT" },
  ];

  const reportTotal = useMemo(
    () => reportRows.reduce((sum, row) => sum + row.total, 0),
    [reportRows],
  );

  const printReport = () => {
    const rowsHtml = reportRows
      .map(
        (row) => `
          <tr>
            <td>#${row.orderNumber}</td>
            <td>${row.customerPhone}</td>
            <td>${row.total.toFixed(0)} kr</td>
            <td>${row.paymentMethod}</td>
          </tr>`,
      )
      .join("");

    const popup = window.open("", "_blank", "width=900,height=700");
    if (!popup) return;

    popup.document.write(`
      <html>
        <head>
          <title>Orderutdrag</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #111; }
            h1 { margin: 0 0 8px; }
            p { margin: 0 0 20px; color: #444; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
            th { background: #f3f3f3; text-transform: uppercase; font-size: 12px; letter-spacing: 1px; }
            .summary { margin-top: 20px; font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>Orderutdrag</h1>
          <p>Intervall: ${filters.dateFrom} till ${filters.dateTo} | Betalsätt: ${filters.paymentMethod}</p>
          <table>
            <thead>
              <tr>
                <th>Ordernummer</th>
                <th>Kundnummer</th>
                <th>Summa</th>
                <th>Betalsätt</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <div class="summary">Totalt: ${reportRows.length} ordrar | ${reportTotal.toFixed(0)} kr</div>
          <script>window.onload = () => window.print()</script>
        </body>
      </html>
    `);
    popup.document.close();
  };

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-gold-500" size={40} /></div>;

  return (
    <div className="space-y-10 pb-24">
      <div>
        <h1 className="text-4xl font-black uppercase tracking-tight mb-2">Statistik & <span className="text-gold-500">Rapporter</span></h1>
        <p className="text-[var(--text-primary)]/40 font-medium">Se läget just nu och skriv ut tydliga orderutdrag som PDF.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {currentCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="p-8 rounded-[2rem] bg-[var(--border-subtle)] border border-[var(--border-subtle)] hover:border-gold-500/20 transition-all group"
          >
            <div className={`p-4 rounded-2xl bg-[var(--border-subtle)] w-fit mb-6 ${card.color}`}>
              <card.icon size={24} />
            </div>
            <div className="text-[10px] text-[var(--text-primary)]/20 font-black uppercase tracking-widest mb-2">{card.label}</div>
            <div className="text-4xl font-black text-[var(--text-primary)]">{card.value}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {reportCards.map((card) => (
          <div key={card.label} className="p-10 rounded-[3rem] bg-gradient-to-br from-white/5 to-transparent border border-[var(--border-strong)] relative overflow-hidden">
            <div className="text-gold-500 text-[10px] font-black uppercase tracking-[0.3em] mb-6">{card.period}</div>
            <h3 className="text-3xl font-black mb-10">{card.label}</h3>
            <div className="grid grid-cols-2 gap-10">
              <div>
                <div className="text-[10px] text-[var(--text-primary)]/20 font-black uppercase tracking-widest mb-2">Total Omsättning</div>
                <div className="text-5xl font-black text-[var(--text-primary)]">{card.revenue.toFixed(0)} <span className="text-sm text-[var(--text-primary)]/40">KR</span></div>
              </div>
              <div>
                <div className="text-[10px] text-[var(--text-primary)]/20 font-black uppercase tracking-widest mb-2">Antal Ordrar</div>
                <div className="text-5xl font-black text-[var(--text-primary)]">{card.count} <span className="text-sm text-[var(--text-primary)]/40">ST</span></div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-[3rem] border border-[var(--border-strong)] bg-[var(--border-subtle)] p-8 space-y-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-gold-500 mb-2">PDF-utdrag</div>
            <h2 className="text-2xl font-black uppercase">Orderlista För Utskrift</h2>
          </div>
          <button
            onClick={printReport}
            disabled={reportRows.length === 0}
            className="inline-flex items-center gap-2 rounded-2xl bg-gold-500 px-6 py-4 text-sm font-black uppercase tracking-[0.2em] text-dark-500 disabled:opacity-50"
          >
            <Printer size={16} />
            Skriv ut PDF
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-2xl bg-dark-500 border border-[var(--border-subtle)] p-4">
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-primary)]/20 mb-2">Från</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--border-subtle)] px-4 py-3 outline-none"
            />
          </div>
          <div className="rounded-2xl bg-dark-500 border border-[var(--border-subtle)] p-4">
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-primary)]/20 mb-2">Till</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--border-subtle)] px-4 py-3 outline-none"
            />
          </div>
          <div className="rounded-2xl bg-dark-500 border border-[var(--border-subtle)] p-4">
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-primary)]/20 mb-2">Betalsätt</label>
            <select
              value={filters.paymentMethod}
              onChange={(e) => setFilters({ ...filters, paymentMethod: e.target.value })}
              className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--border-subtle)] px-4 py-3 outline-none"
            >
              {paymentMethods.map((method) => (
                <option key={method} value={method}>{method}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => fetchReport(filters)}
            className="mt-auto inline-flex h-[54px] items-center justify-center gap-2 rounded-2xl border border-[var(--border-strong)] bg-[var(--border-subtle)] px-6 text-sm font-black uppercase tracking-[0.2em] hover:bg-white/10"
          >
            {reportLoading ? <Loader2 size={16} className="animate-spin" /> : <Filter size={16} />}
            Filtrera
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-[var(--border-strong)] bg-dark-500 p-5">
            <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--text-primary)]/20 mb-2">Rader</div>
            <div className="text-3xl font-black text-gold-500">{reportRows.length}</div>
          </div>
          <div className="rounded-2xl border border-[var(--border-strong)] bg-dark-500 p-5">
            <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--text-primary)]/20 mb-2">Total Summa</div>
            <div className="text-3xl font-black text-gold-500">{reportTotal.toFixed(0)} kr</div>
          </div>
          <div className="rounded-2xl border border-[var(--border-strong)] bg-dark-500 p-5">
            <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--text-primary)]/20 mb-2">Aktivt Filter</div>
            <div className="text-lg font-black text-gold-500">{filters.paymentMethod}</div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-[var(--border-strong)]">
          <table className="min-w-full text-left">
            <thead className="bg-[var(--border-subtle)]">
              <tr>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-primary)]/30">Ordernummer</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-primary)]/30">Kundnummer</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-primary)]/30">Summa</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-primary)]/30">Betalsätt</th>
                <th className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-primary)]/30">Datum</th>
              </tr>
            </thead>
            <tbody>
              {reportRows.map((row) => (
                <tr key={row.id} className="border-t border-[var(--border-subtle)]">
                  <td className="px-4 py-4 font-black text-gold-500">#{row.orderNumber}</td>
                  <td className="px-4 py-4 font-bold">{row.customerPhone}</td>
                  <td className="px-4 py-4 font-bold">{row.total.toFixed(0)} kr</td>
                  <td className="px-4 py-4 text-[var(--text-primary)]/70">{row.paymentMethod}</td>
                  <td className="px-4 py-4 text-[var(--text-primary)]/50">{new Date(row.createdAt).toLocaleDateString("sv-SE")}</td>
                </tr>
              ))}
              {reportRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-[var(--text-primary)]/30">
                    Inga ordrar hittades för valt intervall.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default StatsPage;
