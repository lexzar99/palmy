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
  const [devices, setDevices] = useState<PrinterDevice[]>([
    { id: "1", name: "Epson TM-T88VI", type: "NETWORK", address: "192.168.1.150", status: "READY", isDefault: true },
    { id: "2", name: "Star Micronics BL-50", type: "BLUETOOTH", address: "00:11:22:33:44:55", status: "OFFLINE" },
  ]);

  const startScan = () => {
    setIsScanning(true);
    // Simulate finding a new device
    setTimeout(() => {
      setIsScanning(false);
    }, 3000);
  };

  const setAsDefault = (id: string) => {
    setDevices(prev => prev.map(d => ({ ...d, isDefault: d.id === id })));
  };

  const removeDevice = (id: string) => {
    setDevices(prev => prev.filter(d => d.id !== id));
  };

  return (
    <div className="space-y-12 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-gold-400/10 rounded-[1.5rem] border border-gold-400/20 flex items-center justify-center text-gold-500">
             <Printer size={32} />
          </div>
          <div>
            <h1 className="text-4xl font-black uppercase tracking-tight mb-1">Utskriftsinställningar</h1>
            <p className="text-white/30 text-[10px] font-black uppercase tracking-[0.4em]">Hantera kvittoskrivare via Bluetooth och Nätverk</p>
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
        <div className="lg:col-span-2 space-y-6">
           <div className="bg-white/5 border border-white/5 rounded-[3rem] p-10 space-y-8">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
                   <HardDrive className="text-gold-500" size={24} />
                   Anslutna Skrivare
                </h2>
                <div className="text-[10px] font-black uppercase tracking-widest text-white/20">{devices.length} konfigurerade</div>
              </div>

              <div className="space-y-4">
                 <AnimatePresence mode="popLayout">
                    {devices.map((device) => (
                      <motion.div
                        key={device.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className={`p-8 rounded-[2rem] border-2 transition-all flex items-center justify-between gap-6 ${
                          device.isDefault ? "bg-gold-500/10 border-gold-500/40" : "bg-white/5 border-white/5 hover:border-white/10"
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
                               <div className="text-[10px] font-black uppercase tracking-widest text-white/30 flex items-center gap-3">
                                  {device.address}
                                  <span className="w-1 h-1 rounded-full bg-white/10" />
                                  <span className={device.status === "READY" ? "text-emerald-400" : "text-white/20"}>{device.status}</span>
                               </div>
                            </div>
                         </div>

                         <div className="flex items-center gap-3">
                           {!device.isDefault && (
                             <button 
                               onClick={() => setAsDefault(device.id)}
                               className="px-4 py-2 bg-white/5 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                             >
                               Sätt som standard
                             </button>
                           )}
                            <button 
                               onClick={() => removeDevice(device.id)}
                               className="p-3 bg-red-500/5 hover:bg-red-500/20 text-red-500 rounded-xl transition-all"
                            >
                               <Trash2 size={16} />
                            </button>
                         </div>
                      </motion.div>
                    ))}
                 </AnimatePresence>

                 {devices.length === 0 && !isScanning && (
                   <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-[2rem] flex flex-col items-center justify-center gap-4 text-white/10">
                      <Search size={48} />
                      <p className="font-black uppercase tracking-widest text-sm">Inga skrivare hittades</p>
                   </div>
                 )}

                 {isScanning && (
                    <div className="py-12 flex flex-col items-center justify-center gap-4 text-white/20 animate-pulse">
                       <Loader2 className="animate-spin text-gold-500" size={32} />
                       <p className="font-black uppercase tracking-[0.3em] text-[10px]">Söker efter enheter i nätverket...</p>
                    </div>
                 )}
              </div>
           </div>

           {/* Manual Config */}
           <div className="bg-white/5 border border-white/5 rounded-[3rem] p-10 space-y-8">
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight">Manuell konfiguration</h2>
                <p className="text-white/30 text-[10px] font-black uppercase tracking-[0.2em] mt-1">Om du inte hittar skrivaren automatiskt</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">IP-Adress / Bluetooth ID</label>
                    <input className="w-full bg-dark-500 border border-white/10 rounded-2xl py-4 px-6 outline-none focus:ring-2 focus:ring-gold-500/30 font-mono text-sm" placeholder="192.168.X.X" />
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">Modell</label>
                    <select className="w-full bg-dark-500 border border-white/10 rounded-2xl py-4 px-6 outline-none focus:ring-2 focus:ring-gold-500/30 font-black uppercase text-xs appearance-none">
                       <option>Epson TM-Serien</option>
                       <option>Star Micronics</option>
                       <option>Universal 58mm/80mm</option>
                    </select>
                 </div>
              </div>

              <button className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-white/10 transition-all flex items-center justify-center gap-3">
                 Lägg till manuellt
              </button>
           </div>
        </div>

        {/* Right: Info & Settings */}
        <div className="space-y-6">
           <div className="bg-gradient-to-br from-gold-500/10 to-transparent border border-gold-500/20 rounded-[2.5rem] p-10 space-y-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10">
                 <Zap size={64} className="text-gold-500" />
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight">Status & Test</h3>
              <p className="text-white/40 text-xs font-medium leading-relaxed uppercase">Kontrollera anslutningen genom att skriva ut ett testkvitto till din standardskrivare.</p>
              
              <button className="w-full py-5 bg-gold-500 text-dark-500 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 shadow-xl shadow-gold-500/20 active:scale-95 transition-all">
                 <Play size={18} />
                 Skriv ut testkvitto
              </button>
           </div>

           <div className="bg-white/5 border border-white/5 rounded-[2.5rem] p-8 space-y-8">
              <div className="flex items-center gap-4">
                 <Info className="text-white/20" size={24} />
                 <h3 className="text-sm font-black uppercase tracking-widest">Hjälp</h3>
              </div>
              
              <ul className="space-y-4">
                 <li className="flex gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-1.5 shrink-0" />
                    <p className="text-[10px] text-white/30 font-bold uppercase leading-relaxed">Bluetooth-skrivare kräver att din webbläsare stöder Web Bluetooth API.</p>
                 </li>
                 <li className="flex gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-1.5 shrink-0" />
                    <p className="text-[10px] text-white/30 font-bold uppercase leading-relaxed">Nätverksskrivare måste vara anslutna till samma LAN som denna enhet.</p>
                 </li>
                 <li className="flex gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-gold-500 mt-1.5 shrink-0" />
                    <p className="text-[10px] text-white/30 font-bold uppercase leading-relaxed">Epson-skrivare bör ha ePOS-Print aktiverat.</p>
                 </li>
              </ul>
           </div>

           <div className="bg-white/5 border border-white/5 rounded-[2.5rem] p-8">
              <label className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-4 block text-center">Automatisk utskrift</label>
              <div className="flex items-center justify-between p-4 bg-dark-500 rounded-2xl border border-white/5">
                 <span className="text-[10px] font-black uppercase tracking-widest">Vid ny order</span>
                 <button className="h-6 w-11 rounded-full bg-gold-500 relative">
                    <div className="h-4 w-4 bg-dark-500 rounded-full absolute right-1 top-1" />
                 </button>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default PrintingSettingsPage;
