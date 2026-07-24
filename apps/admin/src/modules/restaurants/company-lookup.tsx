"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Building2, Check, Loader2, Search } from "lucide-react";
import { searchCompaniesByName, type CompanyLookupResult } from "@/modules/restaurants/api";
import { Button, Input } from "@/shared/components/ui";
import { cn } from "@/shared/utils/cn";

function apiError(error: unknown): string | null {
  return (error as { response?: { data?: { error?: string } } } | null)?.response?.data?.error ?? null;
}

function addressLine(company: CompanyLookupResult) {
  return [company.street, [company.zip, company.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

/**
 * Söker upp ett svenskt bolag och fyller formuläret med juridiska uppgifter
 * och adress. Verksamhetsbeskrivningen hämtas inte — bara det vi behöver.
 *
 * Samma fält tar både organisationsnummer och namn: rena siffror kör exakt
 * uppslag, text kör namnsökning. (Skickas ett org.nummer som namnsökning
 * matchas siffrorna mot bolagsnamn och ger fel företag.)
 */
export function CompanyLookup({
  onApply,
  defaultQuery = "",
  compact = false,
}: {
  onApply: (company: CompanyLookupResult) => void;
  /** Förifyllt sökord, t.ex. restaurangens namn. */
  defaultQuery?: string;
  /** Kompakt läge för infosidan; onboarding använder det luftiga. */
  compact?: boolean;
}) {
  const [query, setQuery] = useState(defaultQuery);
  const [applied, setApplied] = useState<string | null>(null);

  const digits = query.replace(/\D/g, "");
  const looksLikeOrgNumber = /^[\d\s-]+$/.test(query.trim()) && query.trim().length > 0;
  const orgNumberReady = looksLikeOrgNumber && (digits.length === 10 || digits.length === 12);

  const search = useMutation({
    mutationFn: () => searchCompaniesByName(query.trim()),
    onSuccess: (result) => {
      setApplied(null);
      // Exakt org.nr-träff: applicera direkt, inget att välja mellan.
      if (looksLikeOrgNumber && result.companies.length === 1) {
        const company = result.companies[0];
        onApply(company);
        setApplied(company.legalName || company.orgNumber);
      }
    },
  });

  const error = apiError(search.error);
  const companies = search.data?.companies ?? [];
  const noHits = search.isSuccess && companies.length === 0;

  return (
    <div
      className={cn("grid gap-3 rounded-[14px] border p-4", !compact && "sm:p-5")}
      style={{ borderColor: "var(--border-subtle)", background: "var(--brand-navy-soft)" }}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] bg-[var(--brand-navy)] text-[var(--brand-cream)]">
          <Building2 size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-extrabold tracking-[-0.2px] text-[var(--text-primary)]">Hämta från bolagsregistret</p>
          <p className="text-xs text-[var(--text-muted)]">Org.nummer eller företagsnamn — adress och juridik fylls i automatiskt.</p>
        </div>
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (looksLikeOrgNumber ? orgNumberReady : query.trim().length >= 2) search.mutate();
        }}
      >
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Org.nummer eller företagsnamn"
          className="min-w-0 flex-1 sm:max-w-[280px]"
          aria-label="Organisationsnummer eller företagsnamn"
        />
        <Button
          type="submit"
          variant="primary"
          disabled={(looksLikeOrgNumber ? !orgNumberReady : query.trim().length < 2) || search.isPending}
          loading={search.isPending}
        >
          {!search.isPending && <Search size={14} />} {looksLikeOrgNumber ? "Hämta" : "Sök"}
        </Button>
      </form>

      {looksLikeOrgNumber && !orgNumberReady && (
        <p className="text-[12px] text-[var(--text-muted)]">Ett organisationsnummer har 10 siffror.</p>
      )}

      {companies.length > 0 && !applied && (
        <div className="grid gap-1.5">
          {companies.map((company, i) => (
            <button
              key={`${company.orgNumber}-${i}`}
              type="button"
              onClick={() => {
                onApply(company);
                setApplied(company.legalName || company.orgNumber);
              }}
              className="flex items-center gap-3 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3.5 py-2.5 text-left transition-colors hover:border-[var(--border-strong)]"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="min-w-0 truncate text-[13px] font-bold text-[var(--text-primary)]">
                    {company.legalName || "—"}
                  </span>
                  {!company.active && <span className="badge badge-danger flex-none">Avregistrerat</span>}
                </span>
                <span className="mt-0.5 block truncate text-[11.5px] text-[var(--text-muted)]">
                  {[company.orgNumber, addressLine(company)].filter(Boolean).join(" · ") || "Ingen adress registrerad"}
                </span>
              </span>
              <span className="flex-none text-[12px] font-bold text-[var(--brand-navy-ink)]">Använd</span>
            </button>
          ))}
        </div>
      )}

      {noHits && (
        <p className="text-[12.5px] text-[var(--text-muted)]">
          {looksLikeOrgNumber ? "Inget bolag med det numret." : "Inga träffar — prova hela det registrerade namnet."}
        </p>
      )}

      {applied && (
        <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--success-text)]">
          <Check size={14} /> Uppgifter hämtade för {applied}
        </p>
      )}

      {search.isPending && (
        <p className="flex items-center gap-1.5 text-[12.5px] text-[var(--text-muted)]">
          <Loader2 size={13} className="animate-spin" /> Söker…
        </p>
      )}

      {error && <p className="field-message" role="alert">{error}</p>}
    </div>
  );
}
