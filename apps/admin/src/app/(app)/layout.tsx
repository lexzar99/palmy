import { AppShell } from "@/shared/layout/app-shell";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
