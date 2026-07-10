import Link from "next/link";
import { PageHeader, Surface } from "@/shared/components/ui";

export default function AdminNotFound() {
  return (
    <div className="page-stack">
      <PageHeader breadcrumb="System" title="Sidan finns inte" />
      <Surface className="px-6 py-12 text-center">
        <p className="mx-auto max-w-xl text-sm leading-relaxed text-[var(--text-secondary)]">
          Länken är gammal eller så har sidan flyttats i den nya adminstrukturen.
        </p>
        <Link href="/dashboard" className="button-primary mx-auto mt-6 inline-flex w-fit">
          Till operationsöversikten
        </Link>
      </Surface>
    </div>
  );
}
