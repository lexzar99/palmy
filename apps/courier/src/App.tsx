import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { Bike, MapPin, Package, User, type LucideIcon } from "lucide-react";
import { api } from "./lib/api";
import { useAuth } from "./lib/auth";
import { useGeolocation, type GeoStatus } from "./lib/geo";
import { GeoContext } from "./lib/geoctx";
import { SessionContext } from "./lib/sessionctx";
import { requestPushPermission, syncPushSubscription } from "./lib/push";
import { Login } from "./screens/Login";
import { SessionStart } from "./screens/SessionStart";
import { Jobs } from "./screens/Jobs";
import { JobPreview } from "./screens/JobPreview";
import { ActiveList } from "./screens/ActiveList";
import { OrderDetail } from "./screens/OrderDetail";
import { Account } from "./screens/Account";
import { GoldButton, Spinner, Splash } from "./ui";
import { MapSkeleton } from "./map";

function LocationGate({ status, request }: { status: GeoStatus; request: () => void }) {
  return (
    <div className="flex min-h-screen flex-col justify-center px-6 pb-10">
      <div className="mx-auto w-full max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-soft text-gold-deep">
          <MapPin size={26} />
        </div>
        <h1 className="text-2xl font-black tracking-tight">Dela din plats</h1>
        <p className="mt-2 text-sm text-muted">Vi behöver din position för att matcha dig med ordrar nära dig och visa dig vägen.</p>
        <div className="mt-5">
          <MapSkeleton height={180} />
        </div>
        <div className="mt-5">
          {status === "prompting" ? (
            <GoldButton disabled>
              <Spinner />
            </GoldButton>
          ) : (
            <GoldButton onClick={request}>Dela min plats</GoldButton>
          )}
        </div>
        {status === "denied" && <p className="mt-3 text-sm font-medium text-red-500">Platsåtkomst nekad. Tillåt plats för Delivera i webbläsarens inställningar och försök igen.</p>}
        {status === "unsupported" && <p className="mt-3 text-sm font-medium text-red-500">Din webbläsare stöder inte platstjänster.</p>}
      </div>
    </div>
  );
}

const TABS: { to: string; label: string; Icon: LucideIcon }[] = [
  { to: "/", label: "Uppdrag", Icon: Bike },
  { to: "/aktiv", label: "Pågående", Icon: Package },
  { to: "/konto", label: "Konto", Icon: User },
];

function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md items-stretch border-t border-[var(--color-line)] bg-white/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      {TABS.map(({ to, label, Icon }) => (
        <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-bold ${isActive ? "text-gold-deep" : "text-muted"}`}>
          <Icon size={21} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export function App() {
  const { ready, courier } = useAuth();
  const geo = useGeolocation();
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    if (courier && geo.status === "granted") api.getSession().then((s) => setOnline(s.online));
  }, [courier, geo.status]);

  // Skicka kurirens position KONTINUERLIGT medan online → kunden kan följa
  // budet live i sin order-tracking (broadcastas till order-rummet) och admin
  // ser positionen färsk. Två drivers: en heartbeat (även stillastående) och
  // direkt-sändning vid varje ny GPS-position (throttlad).
  const coordsRef = useRef(geo.coords);
  coordsRef.current = geo.coords;
  const lastSentRef = useRef(0);

  const pushLocation = useCallback(() => {
    if (!online || geo.status !== "granted" || !coordsRef.current) return;
    lastSentRef.current = Date.now();
    void api.sendLocation(coordsRef.current);
  }, [online, geo.status]);

  // Heartbeat var 10:e s så positionen aldrig blir stale medan budet står still.
  useEffect(() => {
    if (!online || geo.status !== "granted") return;
    pushLocation();
    const t = setInterval(pushLocation, 10000);
    return () => clearInterval(t);
  }, [online, geo.status, pushLocation]);

  // Rörelse: skicka direkt vid ny GPS-position (throttlad till ≥4s) så budet
  // rör sig mjukt på kartan utan att spamma backend.
  useEffect(() => {
    if (!online || geo.status !== "granted" || !geo.coords) return;
    if (Date.now() - lastSentRef.current >= 4000) pushLocation();
  }, [geo.coords, online, geo.status, pushLocation]);

  const start = async () => {
    await api.startSession();
    setOnline(true);
    // Notis-tillstånd måste komma från denna gest (Starta pass-klicket) — be om
    // det och registrera Web Push så kuriren notifieras även med appen stängd.
    await requestPushPermission();
    void syncPushSubscription();
  };

  // Åter-synka push-subscription när kuriren är online (täcker reload där
  // tillstånd redan getts men subscriptionen roterats av webbläsaren).
  useEffect(() => {
    if (online) void syncPushSubscription();
  }, [online]);
  const end = async () => {
    await api.endSession();
    setOnline(false);
  };

  if (!ready) return <Splash />;
  if (!courier) return <div className="min-h-screen bg-canvas"><Login /></div>;
  if (geo.resuming) return <Splash />;
  if (geo.status !== "granted") return <LocationGate status={geo.status} request={geo.request} />;
  if (online === null) return <Splash />;
  if (!online) return <div className="min-h-screen bg-canvas"><SessionStart onStart={start} /></div>;

  return (
    <SessionContext.Provider value={{ end }}>
      <GeoContext.Provider value={geo.coords}>
      <div className="mx-auto min-h-screen max-w-md bg-canvas">
        <Routes>
          <Route path="/" element={<Jobs />} />
          <Route path="/uppdrag/:id" element={<JobPreview />} />
          <Route path="/aktiv" element={<ActiveList />} />
          <Route path="/order/:id" element={<OrderDetail />} />
          <Route path="/konto" element={<Account />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <BottomNav />
      </div>
      </GeoContext.Provider>
    </SessionContext.Provider>
  );
}
