"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import axios from "axios";
import { Loader2, Settings2, Printer, Check } from "lucide-react";
import { API_URL } from "@/lib/api";

const defaultSettings = {
  fontSizeHeader: "text-lg",
  fontSizeItems: "text-base",
  fontSizeFooter: "text-sm",
  showHeader: true,
  showFooter: true,
  showMap: true,
  showLogo: false,
  customHeader: "MatGo Sushi",
  customFooter: "Tack för din beställning!\nVälkommen åter",
  layoutType: "standard",
};

const FONT_OPTIONS = [
  { label: "Liten", value: "text-sm" },
  { label: "Normal", value: "text-base" },
  { label: "Stor", value: "text-lg" },
  { label: "Extra Stor", value: "text-xl" },
];

const mockOrder = {
  orderNumber: "001",
  type: "DELIVERY",
  customerName: "Sven Svensson",
  customerPhone: "070-123 45 67",
  deliveryStreet: "Kiliansgatan 14",
  deliveryZip: "223 50",
  deliveryCity: "Lund",
  note: "Ring på klockan om ni inte hittar, dörrkod 1234.",
  createdAt: new Date(Date.now() - 30 * 60000).toISOString(),
  total: 645,
  deliveryFee: 49,
  paymentStatus: "PAID",
  paymentMethod: "ONLINE (STRIPE)",
  restaurantName: "MatGo Lund",
  restaurantAddress: "Kiliansgatan 12, 223 50 Lund",
  restaurantPhone: "046-12 34 56",
  items: [
    {
      productName: "MatGo Special Pizza",
      quantity: 2,
      basePrice: 149,
      subtotal: 298,
      selectedExtras: [
        { groupName: "Storlek", extraName: "Familjepizza" },
        { groupName: "Sås", extraName: "Stark Sås" },
      ],
      note: "Extra krispig botten tack!",
    },
    {
      productName: "Kebabtallrik XL",
      quantity: 1,
      basePrice: 139,
      subtotal: 139,
      selectedExtras: [
        { groupName: "Tillbehör", extraName: "Pommes frites" },
        { groupName: "Sås", extraName: "Vitlökssås" },
        { groupName: "Extra", extraName: "Extra kött", priceAddon: 20 },
      ],
    },
    {
      productName: "Falafelrulle",
      quantity: 1,
      basePrice: 85,
      subtotal: 85,
      selectedExtras: [
        { groupName: "Sås", extraName: "Mild Sås" },
      ],
    },
    {
      productName: "Coca-Cola Zero 33cl",
      quantity: 3,
      basePrice: 25,
      subtotal: 75,
    }
  ]
};

const formatTime = (date: Date) => {
  return date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
};

const addMinutes = (date: Date, minutes: number) => {
  return new Date(date.getTime() + minutes * 60000);
};

import { Suspense } from "react";

const ReceiptPageContent = () => {
  const searchParams = useSearchParams();
  const orderId = searchParams?.get("orderId");
  
  const [loading, setLoading] = useState(!!orderId);
  const [order, setOrder] = useState<any>(null);
  const [settings, setSettings] = useState(defaultSettings);
  const [showSettings, setShowSettings] = useState(!orderId);
  const [saveStatus, setSaveStatus] = useState(false);

  useEffect(() => {
    // Ladda inställningar
    const saved = localStorage.getItem("matgo_receipt_settings");
    if (saved) {
      setSettings(JSON.parse(saved));
    }
    
    // Om orderId finns, hämta ordern
    if (orderId) {
      const fetchOrder = async () => {
        try {
          const token = localStorage.getItem("matgo_token") || "";
          const res = await axios.get(`${API_URL}/api/admin/orders/${orderId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setOrder(res.data || mockOrder);
        } catch (err) {
          console.error(err);
          setOrder(mockOrder);
        } finally {
          setLoading(false);
        }
      };
      fetchOrder();
    } else {
      setOrder(mockOrder);
    }
  }, [orderId]);

  useEffect(() => {
    // Om vi navigerat hit med en orderId och allt är laddat, aktivera print mode (göm settings om man inte forcerar det)
    if (orderId && !loading && order) {
      setShowSettings(false);
      // Optional: Auto-print efter 1 sek
      setTimeout(() => {
        window.print();
      }, 500);
    }
  }, [loading, orderId, order]);

  const saveSettings = () => {
    localStorage.setItem("matgo_receipt_settings", JSON.stringify(settings));
    setSaveStatus(true);
    setTimeout(() => setSaveStatus(false), 2000);
  };

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-gold-500" size={40} /></div>;
  if (!order) return <div>Inget kvitto hittades.</div>;

  const parseExtras = (extras: any) => {
    if (typeof extras === "string") {
      try {
        return JSON.parse(extras);
      } catch {
        return [];
      }
    }
    return Array.isArray(extras) ? extras : [];
  };

  const splitExtras = (extras: any[]) => {
    const sizeExtras = extras.filter((extra) => extra.groupName?.toLowerCase() === "storlek");
    const sauceExtras = extras.filter((extra) => ["sås", "dip"].includes(extra.groupName?.toLowerCase()));
    const otherExtras = extras.filter((extra) => !sizeExtras.includes(extra) && !sauceExtras.includes(extra));
    return { sizeExtras, sauceExtras, otherExtras };
  };

  return (
    <div className={`min-h-screen ${showSettings ? 'flex' : ''} bg-gray-100`}>
      {/* Settings Sidebar (Göm vid utskrift) */}
      {showSettings && (
        <div className="w-96 bg-[var(--bg-primary)] min-h-screen p-8 border-r border-[var(--border-strong)] no-print flex flex-col h-full overflow-y-auto print:hidden shrink-0">
          <div className="flex items-center gap-3 mb-8 text-gold-500">
            <Settings2 size={24} />
            <h1 className="text-2xl font-black uppercase tracking-widest">Kvittolayout</h1>
          </div>

          <div className="space-y-8 flex-1">
            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/40">Sektionsvisning</h3>
              <label className="flex items-center gap-3 bg-[var(--border-subtle)] p-4 rounded-xl cursor-pointer hover:bg-white/10 transition-colors border border-[var(--border-subtle)]">
                <input type="checkbox" checked={settings.showHeader} onChange={(e) => setSettings({...settings, showHeader: e.target.checked})} className="w-4 h-4 accent-gold-500" />
                <span className="font-bold text-sm">Visa Restauranghuvud</span>
              </label>
              <label className="flex items-center gap-3 bg-[var(--border-subtle)] p-4 rounded-xl cursor-pointer hover:bg-white/10 transition-colors border border-[var(--border-subtle)]">
                <input type="checkbox" checked={settings.showFooter} onChange={(e) => setSettings({...settings, showFooter: e.target.checked})} className="w-4 h-4 accent-gold-500" />
                <span className="font-bold text-sm">Visa Fotnot</span>
              </label>
              <label className="flex items-center gap-3 bg-[var(--border-subtle)] p-4 rounded-xl cursor-pointer hover:bg-white/10 transition-colors border border-[var(--border-subtle)]">
                <input type="checkbox" checked={settings.showLogo} onChange={(e) => setSettings({...settings, showLogo: e.target.checked})} className="w-4 h-4 accent-gold-500" />
                <span className="font-bold text-sm">Visa Logotyp-ikon / Emoji</span>
              </label>
            </div>

            <div className="space-y-4 pt-4 border-t border-[var(--border-subtle)]">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/40">Anpassad Text</h3>
              <div>
                <label className="block text-xs font-bold mb-2">Rubrik (Restaurangnamn)</label>
                <input value={settings.customHeader} onChange={(e) => setSettings({...settings, customHeader: e.target.value})} className="w-full bg-dark-400 border border-[var(--border-strong)] rounded-lg p-3 outline-none text-sm" placeholder="MatGo Sushi" />
              </div>
              <div>
                <label className="block text-xs font-bold mb-2">Fotnot (Tack-meddelande)</label>
                <textarea value={settings.customFooter} onChange={(e) => setSettings({...settings, customFooter: e.target.value})} className="w-full bg-dark-400 border border-[var(--border-strong)] rounded-lg p-3 outline-none text-sm h-20" placeholder="Tack för din beställning!" />
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-[var(--border-subtle)]">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/40">Textstorlekar</h3>
              <div>
                <label className="block text-xs font-bold mb-2">Huvud / Rubriker</label>
                <select value={settings.fontSizeHeader} onChange={(e) => setSettings({...settings, fontSizeHeader: e.target.value})} className="w-full bg-dark-400 border border-[var(--border-strong)] rounded-lg p-3 outline-none text-sm">
                  {FONT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold mb-2">Artiklar / Beställning</label>
                <select value={settings.fontSizeItems} onChange={(e) => setSettings({...settings, fontSizeItems: e.target.value})} className="w-full bg-dark-400 border border-[var(--border-strong)] rounded-lg p-3 outline-none text-sm">
                  {FONT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold mb-2">Fotnot</label>
                <select value={settings.fontSizeFooter} onChange={(e) => setSettings({...settings, fontSizeFooter: e.target.value})} className="w-full bg-dark-400 border border-[var(--border-strong)] rounded-lg p-3 outline-none text-sm">
                  {FONT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            
            <div className="space-y-4 pt-4 border-t border-[var(--border-subtle)]">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/40">Layout</h3>
              <select value={settings.layoutType} onChange={(e) => setSettings({...settings, layoutType: e.target.value})} className="w-full bg-dark-400 border border-[var(--border-strong)] rounded-lg p-3 outline-none text-sm">
                <option value="standard">Standard (Bred)</option>
                <option value="compact">Kompakt (Smalt termopapper)</option>
              </select>
            </div>
          </div>

          <div className="mt-8 space-y-3 pt-4 border-t border-[var(--border-subtle)]">
            <button
              onClick={saveSettings}
              className={`w-full py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${saveStatus ? 'bg-green-500 text-[#0d0d0d]' : 'bg-gold-500 text-[#0d0d0d] hover:bg-gold-400'}`}
            >
              {saveStatus ? <Check size={18} /> : <Settings2 size={18} />}
              {saveStatus ? "Sparat!" : "Spara inställningar"}
            </button>
            <button
              onClick={() => window.print()}
              className="w-full py-4 bg-[var(--border-subtle)] hover:bg-white/10 border border-[var(--border-strong)] rounded-xl font-bold transition-all flex items-center justify-center gap-2"
            >
              <Printer size={18} />
              Testutskrift
            </button>
          </div>
        </div>
      )}

      {/* Receipt View (Detta skrivs ut) */}
      <div className={`p-8 w-full ${showSettings ? 'flex justify-center' : ''} bg-gray-100`}>
        <div 
          className={`bg-white text-black shadow-2xl overflow-hidden print:shadow-none print:m-0 print:p-0 ${
            settings.layoutType === 'compact' ? 'max-w-[80mm] w-full text-center mx-auto' : 'max-w-md w-full mx-auto'
          }`}
          style={{ fontFamily: "monospace" }}
        >
          <div className="p-6 print:p-0">
            {/* Header */}
            {settings.showHeader && (
              <div className={`border-b-2 border-dashed border-gray-300 pb-4 mb-4 text-center ${settings.fontSizeHeader}`}>
                {settings.showLogo && (
                  <div className="flex justify-center mb-2">
                     <span className="text-4xl grayscale">🍕</span>
                  </div>
                )}
                <h2 className="font-extrabold text-2xl mb-1 uppercase">{settings.customHeader || order.restaurantName || "Restaurang"}</h2>
                <div className="font-medium text-gray-600">
                  <p>{order.restaurant?.address || order.restaurantAddress || ""}</p>
                  <p>{order.restaurant?.phone || order.restaurantPhone || ""}</p>
                </div>
              </div>
            )}

            {/* Order Info */}
            <div className={`border-b-2 border-dashed border-gray-300 pb-4 mb-4 ${settings.fontSizeItems}`}>
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold">Order: #{order.orderNumber}</span>
                <span className="text-gray-500">{new Date(order.createdAt).toLocaleTimeString('sv-SE', {hour: '2-digit', minute: '2-digit'})}</span>
              </div>
              <div className="font-bold uppercase text-lg mb-2">
                {order.type === "DELIVERY" ? "🚗 UTKÖRNING" : "🛍️ AVHÄMTNING"}
              </div>
              <div className="mt-2">
                <div className="font-bold">{order.customerName}</div>
                <div>{order.customerPhone}</div>
                {order.type === "DELIVERY" && order.deliveryStreet && (
                  <div className="font-bold text-lg mt-1 whitespace-pre-wrap">
                    {order.deliveryStreet}, {order.deliveryZip}
                  </div>
                )}
              </div>

              {/* ESTIMATED TIIMES - PREMIUM LARGE DISPLAY */}
              {order.estimatedTime && (
                <div className="mt-6 p-4 border-4 border-black text-center mb-4">
                   <div className="text-[10px] font-black uppercase tracking-widest mb-1">Utlovad Tid</div>
                   <div className="text-6xl font-black">{order.estimatedTime} min</div>
                   <div className="mt-4 pt-4 border-t-2 border-dashed border-black">
                      <div className="text-[10px] font-black uppercase tracking-widest mb-1">Beräknad Klar / Levererad</div>
                      <div className="text-2xl font-bold">
                        ca kl {formatTime(addMinutes(new Date(order.createdAt), order.estimatedTime))}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 uppercase font-bold tracking-tighter">
                        Fönster: {formatTime(addMinutes(new Date(order.createdAt), order.estimatedTime))} - {formatTime(addMinutes(new Date(order.createdAt), order.estimatedTime + 15))}
                      </div>
                   </div>
                </div>
              )}

              {order.note && (
                <div className="mt-2 p-2 border border-black italic font-bold">
                  NOTERING: {order.note}
                </div>
              )}
            </div>

            {/* Items */}
            <div className={`border-b-2 border-solid border-black pb-4 mb-4 space-y-4 ${settings.fontSizeItems}`}>
              {order.items?.map((item: any, idx: number) => (
                <div key={idx}>
                  {(() => {
                    const extras = parseExtras(item.selectedExtras || item.extras);
                    const { sizeExtras, sauceExtras, otherExtras } = splitExtras(extras);
                    const productName = sizeExtras.length > 0
                      ? `${item.product?.name || item.productName || item.name} - ${sizeExtras.map((e: any) => e.extraName || e.name).join(", ")}`
                      : item.product?.name || item.productName || item.name;
                    return (
                      <>
                  <div className="flex justify-between items-start font-bold">
                    <div>
                      {item.quantity}x {productName}
                    </div>
                    <div>{item.subtotal} kr</div>
                  </div>
                  {(otherExtras.length > 0 || sauceExtras.length > 0 || item.note) && (
                    <div className="ml-6 mt-1 text-gray-600 space-y-1 text-[0.9em]">
                      {otherExtras.map((e: any, i: number) => (
                        <div key={i}>+ {e.extraName || e.name}</div>
                      ))}
                      {sauceExtras.map((e: any, i: number) => (
                        <div key={`sauce-${i}`} className="text-[0.8em] uppercase font-bold text-red-700">
                          {e.groupName}: {e.extraName || e.name}
                        </div>
                      ))}
                      {item.note && (
                        <div className="italic font-bold text-black uppercase">** {item.note}</div>
                      )}
                    </div>
                  )}
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className={`border-b-2 border-dashed border-gray-300 pb-4 mb-4 ${settings.fontSizeItems}`}>
              <div className="flex justify-between items-center">
                <span>Delsumma:</span>
                <span>{(order.total - order.deliveryFee)} kr</span>
              </div>
              {order.type === "DELIVERY" && (
                <div className="flex justify-between items-center">
                  <span>Hemkörning:</span>
                  <span>{order.deliveryFee} kr</span>
                </div>
              )}
              <div className="flex justify-between items-center text-xl font-black mt-2 pt-2 border-t border-black">
                <span>TOTALT:</span>
                <span>{order.total} kr</span>
              </div>
            </div>

            {/* Footer */}
            {settings.showFooter && (
              <div className={`text-center text-gray-500 ${settings.fontSizeFooter}`}>
                <p className="whitespace-pre-line">{settings.customFooter || "Tack för din beställning!\nVälkommen åter"}</p>
                <div className="mt-4 text-[10px] break-all">ID: {order.id || "MOCK-ORDER-123"}</div>
              </div>
            )}
            
            <style jsx global>{`
              @media print {
                @page { margin: 0; size: auto; }
                body { background: white; margin: 0; padding: 0; }
                .no-print { display: none !important; }
              }
            `}</style>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ReceiptPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-gold-500" size={40} /></div>}>
      <ReceiptPageContent />
    </Suspense>
  );
}
