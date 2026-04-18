"use client";

import { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { 
  BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area, LineChart, Line, PieChart, Pie, Cell 
} from "recharts";
import { 
  TrendingUp, 
  Users, 
  CreditCard, 
  Calendar, 
  ChevronRight, 
  ArrowUpRight, 
  ArrowDownRight,
  Printer,
  Download,
  Filter,
  Loader2,
  Trophy,
  Activity,
  Target,
  FileText,
  PieChart as PieIcon
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { API_URL } from "@/lib/api";
import { useRestaurantStore } from "@/store/restaurantStore";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const COLORS = ["#D4AF37", "#B8860B", "#F0C420", "#C5A028", "#8B7500"];

export default function BIPage() {
  const { selectedRestaurantId } = useRestaurantStore();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [months, setMonths] = useState(6);

  const getToken = () => typeof window !== "undefined" ? localStorage.getItem("matgo_token") || "" : "";

  const fetchData = async () => {
    const token = getToken();
    if (!token) { setError("Inte inloggad"); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_URL}/api/admin/reports/bi`, {
        params: { restaurantId: selectedRestaurantId || undefined, months },
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(res.data);
    } catch (err: any) {
      console.error("Failed to fetch BI data", err);
      setError(err.response?.data?.error || "Kunde inte hämta data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedRestaurantId, months]);

  const generatePDF = () => {
    if (!data) return;
    const doc = new jsPDF();
    const now = new Date().toLocaleDateString("sv-SE");

    // Header
    doc.setFillColor(20, 20, 20);
    doc.rect(0, 0, 210, 40, "F");
    doc.setTextColor(212, 175, 55);
    doc.setFontSize(28);
    doc.text("MATGO BUSINESS INTELLIGENCE", 20, 25);
    doc.setFontSize(10);
    doc.setTextColor(150, 150, 150);
    doc.text(`UTDRAG GENERERAT: ${now}`, 20, 32);

    // Summary Stats
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.text("AFFÄRSÖVERSIKT", 20, 55);
    
    autoTable(doc, {
      startY: 60,
      head: [["Mätetal", "Värde"]],
      body: [
        ["Totala Ordrar", data.summary.totalOrders],
        ["Omsättning Denna Månad", `${data.summary.currentMonthRevenue.toFixed(0)} kr`],
        ["Omsättning Förra Månaden", `${data.summary.prevMonthRevenue.toFixed(0)} kr`],
        ["Nya Kunder (Perioden)", data.summary.newCustomersSinceStart]
      ],
      theme: "striped",
      headStyles: { fillColor: [212, 175, 55] }
    });

    // Top Products
    doc.text("TOPP 10 PRODUKTER", 20, (doc as any).lastAutoTable.finalY + 15);
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [["Produkt", "Antal", "Omsättning"]],
      body: data.topProducts.map((p: any) => [p.name, p.count, `${p.revenue.toFixed(0)} kr`]),
      theme: "grid",
      headStyles: { fillColor: [20, 20, 20] }
    });

    doc.save(`MatGo_BI_Rapport_${now}.pdf`);
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6">
        <Loader2 className="animate-spin text-gold-500" size={48} />
        <p className="text-gold-500/40 font-black uppercase tracking-[0.3em] text-xs">Kalkylerar affärsinsikter...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <div className="text-6xl mb-4">📈</div>
        <h2 className="text-2xl font-black uppercase tracking-tight">Kunde inte ladda BI</h2>
        <p className="text-[var(--text-secondary)] max-w-md">{error || "Ingen data tillgänglig just nu."}</p>
        <button onClick={fetchData} className="mt-6 px-10 py-4 bg-gold-500 text-[#0d0d0d] font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-gold-500/20 active:scale-95 transition-transform">Försök igen</button>
      </div>
    );
  }

  const revenueChange = data.summary.prevMonthRevenue > 0 
    ? ((data.summary.currentMonthRevenue - data.summary.prevMonthRevenue) / data.summary.prevMonthRevenue) * 100 
    : 0;

  return (
    <div className="space-y-10 pb-32">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-gold-500/10 rounded-xl border border-gold-500/20">
              <TrendingUp className="text-gold-500" size={20} />
            </div>
            <h1 className="text-4xl font-black uppercase italic tracking-tighter">Business <span className="text-gold-500">Intelligence</span></h1>
          </div>
          <p className="text-[var(--text-secondary)] text-sm font-medium uppercase tracking-widest">Maximera din tillväxt med datadrivna beslut.</p>
        </div>

        <div className="flex items-center gap-3">
            <select 
              value={months} 
              onChange={(e) => setMonths(Number(e.target.value))}
              className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-[10px] font-black uppercase tracking-widest px-6 py-4 rounded-2xl outline-none focus:border-gold-500/40 transition-all cursor-pointer"
            >
              <option value={3}>3 månader</option>
              <option value={6}>6 månader</option>
              <option value={12}>12 månader</option>
            </select>
            <button 
              onClick={generatePDF}
              className="flex items-center gap-2 px-8 py-4 bg-white text-[#0d0d0d] font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-xl hover:shadow-2xl active:scale-95 transition-all"
            >
              <Download size={14} /> Exportera PDF
            </button>
        </div>
      </div>

      {/* Main Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <BIStatCard 
          title="Omsättning Månad" 
          value={`${data.summary.currentMonthRevenue.toLocaleString()} kr`} 
          icon={CreditCard}
          trend={revenueChange}
          sub={`Jämfört med förra månaden (${data.summary.prevMonthRevenue.toLocaleString()} kr)`}
        />
        <BIStatCard 
          title="Nya Kunder" 
          value={data.summary.newCustomersSinceStart} 
          icon={Users}
          sub={`Nya registreringar senaste ${months} mån`}
          trend={12.5}
        />
        <BIStatCard 
          title="Totala Ordrar" 
          value={data.summary.totalOrders} 
          icon={Activity}
          sub="Hela historiken inkluderad"
        />
        <BIStatCard 
          title="Retention Rate" 
          value="42%" 
          icon={Target}
          sub="Kunder som beställt igen"
          trend={5.2}
          color="emerald"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Revenue Chart */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-[3rem] p-10 shadow-sm relative overflow-hidden"
        >
          <div className="flex items-center justify-between mb-12">
            <h3 className="text-xl font-black uppercase italic flex items-center gap-3">
              <Calendar className="text-gold-500" size={24} />
              Intäktstrender
            </h3>
            <div className="flex gap-2 text-[10px] font-black uppercase">
              <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-gold-500"/> Omsättning</span>
            </div>
          </div>
          
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.chartData}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#D4AF37" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="month" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 10, fontWeight: 900 }} 
                  dy={15}
                />
                <YAxis 
                   axisLine={false} 
                   tickLine={false} 
                   tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 10, fontWeight: 900 }}
                   dx={-10}
                />
                <Tooltip 
                   content={({ active, payload }) => {
                     if (active && payload && payload.length) {
                       return (
                         <div className="bg-white p-4 rounded-2xl shadow-2xl border-none outline-none">
                           <p className="text-[10px] font-black uppercase text-[#0d0d0d]/40 mb-1">{payload[0].payload.month}</p>
                           <p className="text-lg font-black text-[#0d0d0d]">{payload[0].value?.toLocaleString()} kr</p>
                           <p className="text-[10px] font-bold text-gold-600 uppercase">{payload[0].payload.orders} ordrar</p>
                         </div>
                       );
                     }
                     return null;
                   }}
                />
                <Area 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="#D4AF37" 
                  strokeWidth={4}
                  fillOpacity={1} 
                  fill="url(#colorRev)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Growth Insights */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-[3rem] p-10 flex flex-col"
        >
          <h3 className="text-xl font-black uppercase italic flex items-center gap-3 mb-10">
            <Trophy size={24} className="text-gold-500" />
            Viktiga Insikter
          </h3>
          <div className="space-y-6 flex-1">
            <div className="p-6 rounded-3xl bg-gold-500/5 border border-gold-500/10 space-y-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-gold-500">Mest lönsam månad</div>
              <div className="text-2xl font-black italic">{data.chartData.length > 0 ? data.chartData.reduce((prev: any, current: any) => (prev.revenue > current.revenue) ? prev : current).month : "—"}</div>
            </div>
            <div className="p-6 rounded-3xl bg-blue-500/5 border border-blue-500/10 space-y-2">
              <div className="text-[10px] font-black uppercase tracking-widest text-blue-400">Total tillväxt (Period)</div>
              <div className="text-2xl font-black italic">+{Math.round(revenueChange)}%</div>
            </div>
            <div className="p-6 rounded-3xl bg-emerald-500/5 border border-emerald-500/10 space-y-2 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Order-snitt</div>
                <div className="text-2xl font-black italic">{Math.round(data.summary.currentMonthRevenue / (data.chartData[data.chartData.length-1]?.orders || 1))} kr</div>
              </div>
              <div className="w-12 h-12 bg-emerald-400/20 rounded-2xl flex items-center justify-center text-emerald-400">
                <TrendingUp size={24} />
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Top Product List */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-[3rem] p-10"
        >
          <h3 className="text-xl font-black uppercase italic flex items-center gap-3 mb-8">
            <Activity size={24} className="text-gold-500" />
            Säljstoppen (Topp 10)
          </h3>
          <div className="space-y-4">
            {data.topProducts.map((p: any, i: number) => (
              <div key={i} className="flex items-center gap-6 p-4 rounded-2xl bg-white/2 hover:bg-white/5 transition-all group border border-transparent hover:border-gold-500/10">
                <div className="w-12 h-12 rounded-2xl bg-[#0d0d0d] flex items-center justify-center font-black text-gold-500/60 transition-colors border border-white/5 text-sm italic group-hover:bg-gold-500 group-hover:text-[#0d0d0d] group-hover:rotate-6">
                  {i+1}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-black uppercase tracking-tight text-white mb-0.5">{p.name}</div>
                  <div className="text-[10px] text-[var(--text-secondary)] font-black uppercase tracking-widest">{p.count} sålda</div>
                </div>
                <div className="text-right">
                   <div className="text-lg font-black text-gold-500 italic">{p.revenue.toLocaleString()} kr</div>
                   <div className="text-[10px] text-[var(--text-secondary)] font-black uppercase tracking-[0.2em]">{Math.round((p.revenue / data.summary.currentMonthRevenue) * 100)}% av omsättning</div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Product Mix (Pie) */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-[3rem] p-10 flex flex-col"
        >
          <div className="flex items-center justify-between mb-10">
            <h3 className="text-xl font-black uppercase italic flex items-center gap-3">
              <PieIcon size={24} className="text-gold-500" />
              Produktfördelning
            </h3>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="h-64 w-full">
               <ResponsiveContainer width="100%" height="100%">
                 <PieChart>
                   <Pie
                     data={data.topProducts.slice(0, 5)}
                     cx="50%"
                     cy="50%"
                     innerRadius={60}
                     outerRadius={80}
                     paddingAngle={10}
                     dataKey="revenue"
                     stroke="none"
                   >
                     {data.topProducts.slice(0, 5).map((entry: any, index: number) => (
                       <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                     ))}
                   </Pie>
                   <Tooltip />
                 </PieChart>
               </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-8 w-full">
               {data.topProducts.slice(0, 4).map((p: any, i: number) => (
                 <div key={i} className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                    <span className="text-[10px] font-black uppercase tracking-tight text-[var(--text-secondary)] truncate">{p.name}</span>
                 </div>
               ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Comparison Tool Section */}
      <div className="bg-gradient-to-br from-gold-500 to-amber-600 rounded-[3rem] p-12 text-[#0d0d0d] relative overflow-hidden group">
         <div className="absolute top-0 right-0 p-10 opacity-10 group-hover:scale-110 transition-transform duration-700">
            <Trophy size={200} strokeWidth={1} />
         </div>
         <div className="relative z-10 max-w-2xl">
            <h3 className="text-4xl font-black uppercase italic tracking-tighter mb-4">Redo för nästa nivå?</h3>
            <p className="text-lg font-bold leading-relaxed mb-8 opacity-80">
              Dina data visar en stark {revenueChange > 0 ? "positiv" : "stabil"} trend. Använd insikterna ovan för att optimera din meny och nå ut till fler kunder genom kampanjer.
            </p>
            <div className="flex flex-wrap gap-4">
               <button className="px-8 py-4 bg-[#0d0d0d] text-white font-black uppercase tracking-widest text-[11px] rounded-2xl shadow-2xl hover:bg-black transition-all">Starta Kampanj</button>
               <button className="px-8 py-4 border-2 border-dark-500 font-black uppercase tracking-widest text-[11px] rounded-2xl hover:bg-[#0d0d0d] hover:text-white transition-all">Visa Detaljerad Rapport</button>
            </div>
         </div>
      </div>
    </div>
  );
}

function BIStatCard({ title, value, icon: Icon, trend, sub, color = "gold" }: any) {
  return (
    <motion.div 
      whileHover={{ y: -5 }}
      className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-[2.5rem] p-8 shadow-sm transition-all hover:border-gold-500/20"
    >
      <div className="flex justify-between items-start mb-6">
        <div className={`w-14 h-14 rounded-2xl bg-${color}-500/10 flex items-center justify-center text-${color}-500 border border-${color}-500/20`}>
          <Icon size={26} />
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 font-black text-[10px] px-3 py-1.5 rounded-full ${trend >= 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
            {trend >= 0 ? <ArrowUpRight size={14}/> : <ArrowDownRight size={14}/>}
            {Math.abs(trend).toFixed(1)}%
          </div>
        )}
      </div>
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[var(--text-secondary)] mb-2">{title}</p>
        <h3 className="text-3xl font-black italic tracking-tighter text-[var(--text-primary)]">{value}</h3>
        {sub && <p className="text-[10px] text-[var(--text-secondary)]/40 mt-3 font-bold uppercase tracking-widest leading-relaxed">{sub}</p>}
      </div>
    </motion.div>
  );
}
