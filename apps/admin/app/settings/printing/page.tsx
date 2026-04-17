"use client";

import { useState, useEffect } from "react";
import { 
  Printer, 
  Bluetooth, 
  Wifi, 
  Search, 
  Loader2, 
  Check, 
  RefreshCw, 
  Settings, 
  Smartphone,
  HardDrive,
  Info,
  Zap,
  Play,
  Trash2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface PrinterDevice {
  id: string;
  name: string;
  type: "BLUETOOTH" | "NETWORK";
  address: string;
  status: "ONLINE" | "OFFLINE" | "READY";
  isDefault?: boolean;
}

const PrintingSettingsPage = () => {
  const [isScanning, setIsScanning] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [receiptLayout, setReceiptLayout] = useState("COMPACT"); // "COMPACT" | "DETAILED"
  const [devices, setDevices] = useState<PrinterDevice[]>([
    { id: "1", name: "Epson TM-T88VI", type: "NETWORK", address: "192.168.1.150", status: "READY", isDefault: true },
    { id: "2", name: "Star Micronics BL-50", type: "BLUETOOTH", address: "00:11:22:33:44:55", status: "OFFLINE" },
  ]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("matgo_admin");
      const admin = raw ? JSON.parse(raw) : null;
      setIsSuperAdmin(admin?.role === "SUPER_ADMIN");
    } catch { setIsSuperAdmin(false); }
  }, []);

  const startScan = () => {
    setIsScanning(true);
    setTimeout(() => setIsScanning(false), 3000);
  };

  const setAsDefault = (id: string) => {
    setDevices(prev => prev.map(d => ({ ...d, isDefault: d.id === id })));
  };

  const removeDevice = (id: string) => {
    setDevices(prev => prev.filter(d => d.id !== id));
  };

  const handleTestPrint = () => {
    // logic for test print
  };

  return (
    <div className="space-y-12 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-gold-400/10 rounded-[1.5rem] border border-gold-400/20 flex items-center justify-center text-gold-500">
             <Settings size={32} />
          </div>
          <div>
            <h1 className="text-4xl font-black uppercase tracking-tight mb-1 italic">Inställningar</h1>
            <p className="text-[var(--text-primary)]/30 text-[10px] font-black uppercase tracking-[0.4em]">Konfigurera utskrift, kvitto och system</p>
          </div>
        </div>
        <button 
          onClick={startScan}
          disabled={isScanning}
          className="flex items-center gap-3 px-8 py-4 bg-gold-500 text-dark-500 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-gold-400 transition-all disabled:opacity-50 shadow-xl shadow-gold-500/20"
        >
          {isScanning ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
          {isScanning ? "Söker..." : "Sök nya enheter"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Left: Device List */}
        <div className="lg:col-span-2 space-y-8">
           {isSuperAdmin && (
             <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-[3rem] p-10 space-y-8">
                <div className="flex items-center justify-between">
                   <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
                      <HardDrive className="text-emerald-400" size={24} />
                      Global Kvittolayout
                   </h2>
                   <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-lg text-[8px] font-black uppercase tracking-widest">Super Admin Only</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <button onClick={() => setReceiptLayout("COMPACT")} className={`p-6 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-3 ${receiptLayout === 'COMPACT' ? 'bg-emerald-500/20 border-emerald-500/50' : 'bg-transparent border-white/5 opacity-50'}`}>
                      <div className="text-sm font-black uppercase italic">Kompakt</div>
                      <div className="text-[8px] opacity-40 uppercase font-bold tracking-widest">Sparar papper</div>
                   </button>
                   <button onClick={() => setReceiptLayout("DETAILED")} className={`p-6 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-3 ${receiptLayout === 'DETAILED' ? 'bg-emerald-500/20 border-emerald-500/50' : 'bg-transparent border-white/5 opacity-50'}`}>
                      <div className="text-sm font-black uppercase italic">Detaljerad</div>
                      <div className="text-[8px] opacity-40 uppercase font-bold tracking-widest">Maximal info</div>
                   </button>
                </div>
             </div>
           )}

           <div className="bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-[3rem] p-10 space-y-8">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
                   <Printer className="text-gold-500" size={24} />
                   Anslutna Skrivare
                </h2>
                <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/20">{devices.length} konfigurerade</div>
              </div>

              <div className="space-y-4">
                 <AnimatePresence mode="popLayout">
                    {devices.map((device) => (
                      <motion.div
                        key={device.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className={`p-8 rounded-[2.5rem] border-2 transition-all flex items-center justify-between gap-6 ${
                          device.isDefault ? "bg-gold-500/10 border-gold-500/40 shadow-lg shadow-gold-500/5" : "bg-[var(--border-subtle)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]"
                        }`}
                      >
                         <div className="flex items-center gap-6">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${device.type === "BLUETOOTH" ? "bg-blue-500/10 text-blue-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                               {device.type === "BLUETOOTH" ? <Bluetooth size={24} /> : <Wifi size={24} />}
                            </div>
                            <div>
                               <div className="flex items-center gap-3 mb-1">
                                  <h3 className="text-lg font-black uppercase tracking-tight">{device.name}</h3>
                                  {device.isDefault && (
                                    <span className="px-2 py-0.5 bg-gold-500 text-dark-500 rounded-md text-[8px] font-black uppercase tracking-widest">Standard</span>
                                  )}
                               </div>
                               <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/30 flex items-center gap-3">
                                  {device.address}
                                  <span className="w-1 h-1 rounded-full bg-white/10" />
                                  <span className={device.status === "READY" ? "text-emerald-400" : "text-[var(--text-primary)]/20"}>{device.status}</span>
                               </div>
                            </div>
                         </div>

                         <div className="flex items-center gap-3">
                           {!device.isDefault && (
                             <button 
                               onClick={() => setAsDefault(device.id)}
                               className="px-4 py-3 bg-[var(--border-subtle)] rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-white/10 transition-all border border-white/5"
                             >
                               Sätt som standard
                             </button>
                           )}
                            <button 
                               onClick={() => removeDevice(device.id)}
                               className="p-4 bg-rose-500/5 hover:bg-rose-500/20 text-rose-500 rounded-2xl transition-all"
                            >
                               <Trash2 size={18} />
                            </button>
                         </div>
                      </motion.div>
                    ))}
                 </AnimatePresence>

                 {devices.length === 0 && !isScanning && (
                   <div className="py-20 text-center border-2 border-dashed border-[var(--border-subtle)] rounded-[2.5rem] flex flex-col items-center justify-center gap-4 text-[var(--text-primary)]/10">
                      <Search size={48} />
                      <p className="font-black uppercase tracking-widest text-sm">Inga skrivare hittades</p>
                   </div>
                 )}
              </div>
           </div>
        </div>

        {/* Right: Status & Actions */}
        <div className="space-y-8">
           <div className="bg-gradient-to-br from-gold-500/20 to-transparent border border-gold-500/30 rounded-[3rem] p-10 space-y-8 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-10 opacity-10 group-hover:rotate-12 transition-transform duration-500">
                 <Zap size={80} className="text-gold-500" />
              </div>
              <h3 className="text-2xl font-black uppercase tracking-tight italic">System Test</h3>
              <p className="text-text-secondary/60 text-xs font-bold leading-relaxed uppercase tracking-wide">Skriv ut ett testkvitto till din standardskrivare för att säkerställa att anslutningen fungerar felfritt.</p>
              
              <button onClick={handleTestPrint} className="w-full py-6 bg-gold-500 text-dark-500 rounded-[1.5rem] font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 shadow-2xl shadow-gold-500/20 active:scale-95 hover:bg-gold-400 transition-all">
                 <Play size={20} />
                 Skriv ut testkvitto
              </button>
           </div>

           <div className="bg-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-[2.5rem] p-10">
              <div className="text-[10px] font-black uppercase tracking-[0.4em] text-text-secondary/20 mb-6 text-center italic">Automatisk utskrift</div>
              <div className="flex items-center justify-between p-6 bg-dark-500/50 rounded-2xl border border-white/5">
                 <span className="text-xs font-black uppercase tracking-widest">Vid ny order</span>
                 <button className="h-7 w-12 rounded-full bg-emerald-500 relative shadow-lg shadow-emerald-500/20">
                    <div className="h-5 w-5 bg-white rounded-full absolute right-1 top-1" />
                 </button>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default PrintingSettingsPage;
