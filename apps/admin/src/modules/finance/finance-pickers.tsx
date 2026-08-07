"use client";

import { useMemo, useState } from "react";
import { monthId, monthLabel, monthRange } from "@/modules/finance/finance-workspace";
import { num, shortDate } from "@/modules/finance/format";
import styles from "@/modules/finance/finance-pickers.module.css";

/* ── Perioden ───────────────────────────────────────────────────────────── */

export type Period = { from: string; to: string; month: string | null };

export const isDateParam = (value: string | null | undefined): value is string =>
  Boolean(value && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value));

/**
 * En hel kalendermånad? Utbetalningar sparas bara på hela månader — API:t
 * avvisar allt annat — så sidor som skriver måste kunna fråga.
 */
export const isWholeMonth = (period: Period): boolean => {
  if (period.month) return true;
  const candidate = period.from.slice(0, 7);
  if (candidate !== period.to.slice(0, 7)) return false;
  const range = monthRange(candidate);
  return range.from === period.from && range.to === period.to;
};

export const periodLabel = (period: Period) =>
  period.month
    ? monthLabel(period.month)
    : `${shortDate(period.from)} – ${shortDate(period.to)}`;

/**
 * Läs perioden ur adressen. from/to vinner när båda finns och är giltiga;
 * annars månaden; annars innevarande månad. Känner igen en from/to som råkar
 * vara exakt en kalendermånad och märker den som sådan.
 */
export function readPeriod(params: URLSearchParams | { get(key: string): string | null }): Period {
  const from = params.get("from");
  const to = params.get("to");
  const month = params.get("month");
  const isMonthParam = (value: string | null) => Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));

  if (isDateParam(from) && isDateParam(to) && from <= to) {
    const candidate = from.slice(0, 7);
    const range = monthRange(candidate);
    const matchesMonth = range.from === from && range.to === to;
    return { from, to, month: matchesMonth ? candidate : isMonthParam(month) && monthRange(month!).from === from ? month : null };
  }
  const fallback = isMonthParam(month) ? month! : monthId(new Date());
  return { ...monthRange(fallback), month: fallback };
}

/** Perioden som frågesträng, så en delad länk öppnar samma underlag. */
export function periodQuery(period: Period): string {
  const query = new URLSearchParams({ from: period.from, to: period.to });
  if (period.month) query.set("month", period.month);
  return query.toString();
}

/** De sex senaste kalendermånaderna, senaste först. */
function monthPresets(today: Date) {
  return Array.from({ length: 6 }, (_, index) => {
    const month = monthId(new Date(today.getFullYear(), today.getMonth() - index, 1));
    return { month, label: monthLabel(month), ...monthRange(month) };
  });
}

export function PeriodPicker({
  period,
  onChange,
}: {
  period: Period;
  onChange: (next: Period) => void;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);
  const presets = useMemo(() => monthPresets(new Date()), []);

  return (
    <div className={styles.picker}>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.triggerLabel}>{periodLabel(period)}</span>
        <span className={styles.caret}>▾</span>
      </button>
      {open ? (
        <>
          <div className={styles.backdrop} onClick={() => setOpen(false)} />
          <div className={styles.menu}>
            {presets.map((preset) => (
              <button
                type="button"
                key={preset.month}
                className={`${styles.preset} ${preset.month === period.month ? styles.presetActive : ""}`}
                onClick={() => {
                  onChange({ from: preset.from, to: preset.to, month: preset.month });
                  setFrom(preset.from);
                  setTo(preset.to);
                  setOpen(false);
                }}
              >
                <span>{preset.label}</span>
                <span className={styles.presetRange}>
                  {shortDate(preset.from)}–{shortDate(preset.to)}
                </span>
              </button>
            ))}
            <div className={styles.custom}>
              <p className={styles.customLabel}>Egen period</p>
              <div className={styles.range}>
                <input
                  type="date"
                  className={styles.date}
                  value={from}
                  aria-label="Från"
                  onChange={(event) => setFrom(event.target.value)}
                />
                <span className={styles.arrow}>→</span>
                <input
                  type="date"
                  className={styles.date}
                  value={to}
                  aria-label="Till"
                  onChange={(event) => setTo(event.target.value)}
                />
              </div>
              <button
                type="button"
                className={styles.apply}
                disabled={!isDateParam(from) || !isDateParam(to) || from > to}
                onClick={() => {
                  const candidate = from.slice(0, 7);
                  const range = monthRange(candidate);
                  // En egen period som råkar vara exakt en månad ska behandlas
                  // som en månad — annars blockeras sparandet i onödan.
                  const matchesMonth = range.from === from && range.to === to;
                  onChange({ from, to, month: matchesMonth ? candidate : null });
                  setOpen(false);
                }}
              >
                Använd period
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ── Restaurangen ───────────────────────────────────────────────────────── */

export type RestaurantOption = { id: string; name: string; amount?: number | null };

/**
 * Sökbar restaurangväljare.
 *
 * Ersätter raden med knappar: den fungerade för sex restauranger men blir
 * oläslig vid trettio — namnen kortas till "Burger K…" och raden svämmar över.
 * En meny med sökfält är lika snabb vid få och fungerar fortfarande vid många.
 */
export function RestaurantPicker({
  restaurants,
  selectedId,
  onSelect,
}: {
  restaurants: RestaurantOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = restaurants.find((item) => item.id === selectedId) || null;
  const normalized = query.trim().toLocaleLowerCase("sv-SE");
  const matches = normalized
    ? restaurants.filter((item) => item.name.toLocaleLowerCase("sv-SE").includes(normalized))
    : restaurants;

  return (
    <div className={styles.picker}>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          setQuery("");
        }}
      >
        <span className={styles.triggerLabel}>{selected?.name || "Välj restaurang"}</span>
        <span className={styles.caret}>▾</span>
      </button>
      {open ? (
        <>
          <div className={styles.backdrop} onClick={() => setOpen(false)} />
          <div className={styles.menu}>
            <input
              type="text"
              className={styles.search}
              value={query}
              autoFocus
              placeholder="Sök restaurang"
              aria-label="Sök restaurang"
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className={styles.list}>
              {matches.length === 0 ? (
                <p className={styles.empty}>Ingen restaurang matchar “{query.trim()}”.</p>
              ) : (
                matches.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    title={item.name}
                    className={`${styles.option} ${item.id === selectedId ? styles.optionActive : ""}`}
                    onClick={() => {
                      onSelect(item.id);
                      setOpen(false);
                    }}
                  >
                    <span className={styles.optionName}>{item.name}</span>
                    {item.amount == null ? null : (
                      <span className={styles.optionAmount}>{num(item.amount)}</span>
                    )}
                  </button>
                ))
              )}
            </div>
            <p className={styles.count}>
              {normalized
                ? `${matches.length} av ${restaurants.length}`
                : `${restaurants.length} restauranger`}
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}
