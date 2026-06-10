import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { Bike, MapPin, Package, User, type LucideIcon } from "lucide-react";
import { useAuth } from "./lib/auth";
import { useGeolocation, type GeoStatus } from "./lib/geo";
import { GeoContext } from "./lib/geoctx";
import { Login } from "./screens/Login";
import { Jobs } from "./screens/Jobs";
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

  if (!ready) return <Splash />;
  if (!courier) return <div className="min-h-screen bg-canvas"><Login /></div>;
  if (geo.status !== "granted") return <LocationGate status={geo.status} request={geo.request} />;

  return (
    <GeoContext.Provider value={geo.coords}>
      <div className="mx-auto min-h-screen max-w-md bg-canvas" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <Routes>
          <Route path="/" element={<Jobs />} />
          <Route path="/aktiv" element={<ActiveList />} />
          <Route path="/order/:id" element={<OrderDetail />} />
          <Route path="/konto" element={<Account />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <BottomNav />
      </div>
    </GeoContext.Provider>
  );
}
