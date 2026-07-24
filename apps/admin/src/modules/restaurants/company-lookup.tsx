"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Building2, Check, Loader2, Search } from "lucide-react";
import {
  lookupCompanyByOrgNumber,
  searchCompaniesByName,
  type CompanyLookupResult,
} from "@/modules/restaurants/api";
import { Button, Input } from "@/shared/components/ui";
import { cn } from "@/shared/utils/cn";

type Mode = "org" | "name";

function apiError(error: unknown): string | null {
  return (error as { response?: { data?: { error?: string } } } | null)?.response?.data?.error ?? null;
}

function companyLine(company: CompanyLookupResult) {
  return [company.street, [company.zip, company.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

/**
 * Slår upp ett svenskt bolag och fyller formuläret med juridiska uppgifter
 * och adress. Verksamhetsbeskrivningen hämtas inte — bara det vi behöver.
 * Uppslagen går via vår backend (nyckel + kvot ligger server-side).
 */
export function CompanyLookup({
  onApply,
  compact = false,
}: {
  onApply: (company: CompanyLookupResult) => void;
  /** Kompakt läge för infosidan; onboarding använder det luftiga. */
  compact?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("org");
  const [orgNumber, setOrgNumber] = useState("");
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState<string | null>(null);

  const lookup = useMutation({
    mutationFn: () => lookupCompanyByOrgNumber(orgNumber),
    onSuccess: (company) => {
      onApply(company);
      setApplied(company.legalName || company.orgNumber);
    },
  });

  const search = useMutation({
    mutationFn: () => searchCompaniesByName(query),
  });

  const error = apiError(lookup.error) || apiError(search.error);
  const suggestions = search.data?.companies ?? [];

  return (
    <div
      className={cn("grid gap-3 rounded-[14px] border p-4", compact ? "" : "sm:p-5")}
      style={{ borderColor: "var(--border-subtle)", background: "var(--brand-navy-soft)" }}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] bg-[var(--brand-navy)] text-[var(--brand-cream)]">
          <Building2 size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-extrabold tracking-[-0.2px] text-[var(--text-primary)]">Hämta från bolagsregistret</p>
          <p className="text-xs text-[var(--text-muted)]">Fyller namn, adress och juridiska uppgifter automatiskt.</p>
        </div>
      </div>

      <div className="segmented self-start">
        <button type="button" className={mode === "org" ? "is-active" : ""} onClick={() => setMode("org")}>Org.nummer</button>
        <button type="button" className={mode === "name" ? "is-active" : ""} onClick={() => setMode("name")}>Företagsnamn</button>
      </div>

      {mode === "org" ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (orgNumber.replace(/\D/g, "").length >= 10) lookup.mutate();
          }}
        >
          <Input
            value={orgNumber}
            onChange={(event) => {
              setOrgNumber(event.target.value);
              setApplied(null);
            }}
            placeholder="559123-4567"
            inputMode="numeric"
            className="max-w-[200px]"
            aria-label="Organisationsnummer"
          />
          <Button
            type="submit"
            variant="primary"
            disabled={orgNumber.replace(/\D/g, "").length < 10 || lookup.isPending}
            loading={lookup.isPending}
          >
            Hämta
          </Button>
        </form>
      ) : (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (query.trim().length >= 2) search.mutate();
          }}
        >
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Palmyra Pizzeria AB"
            className="max-w-[260px]"
            aria-label="Företagsnamn"
          />
          <Button type="submit" disabled={query.trim().length < 2 || search.isPending} loading={search.isPending}>
            {!search.isPending && <Search size={14} />} Sök
          </Button>
        </form>
      )}

      {suggestions.length > 0 && mode === "name" && (
        <div className="grid gap-1.5">
          {suggestions.map((company, i) => (
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
                <span className="block truncate text-[13px] font-bold text-[var(--text-primary)]">{company.legalName || "—"}</span>
                <span className="block truncate text-[11.5px] text-[var(--text-muted)]">
                  {[company.orgNumber, companyLine(company)].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="flex-none text-[12px] font-bold text-[var(--brand-navy-ink)]">Använd</span>
            </button>
          ))}
        </div>
      )}

      {applied && (
        <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--success-text)]">
          <Check size={14} /> Uppgifter hämtade för {applied}
        </p>
      )}

      {(lookup.isPending || search.isPending) && !applied && (
        <p className="flex items-center gap-1.5 text-[12.5px] text-[var(--text-muted)]">
          <Loader2 size={13} className="animate-spin" /> Hämtar…
        </p>
      )}

      {error && <p className="field-message" role="alert">{error}</p>}
    </div>
  );
}
