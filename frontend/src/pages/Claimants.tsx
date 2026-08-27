import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Search, SlidersHorizontal, X, ArrowUpDown, Lock, ShieldCheck } from "lucide-react";
import { fetchClaimants, fetchClaimantFilters, formatApiError, type ClaimantListItem } from "../lib/api";
import { Card, StatusBadge, StageBadge, Spinner, ProgressBar, ErrorState, RefreshButton } from "../components/ui";
import { fmtNum, fmtPct } from "../lib/format";
import { progressColor, soft, CHART } from "../lib/colors";

const FILTER_KEYS = ["status", "stage", "program", "state", "search", "sort"] as const;

export default function Claimants() {
  const [params, setParams] = useSearchParams();
  const { data: filters } = useQuery({ queryKey: ["claimantFilters"], queryFn: fetchClaimantFilters });

  const query: Record<string, string> = {};
  FILTER_KEYS.forEach((k) => {
    const v = params.get(k);
    if (v) query[k] = v;
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["claimants", query],
    queryFn: () => fetchClaimants(query),
  });

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const activeChips = FILTER_KEYS.filter(
    (k) => k !== "sort" && k !== "search" && params.get(k)
  );

  // Whether the semantic layer is masking PII for THIS user's group. Executives
  // who see unredacted data don't get the badge; masked/governed users do.
  const piiGoverned = data ? detectPiiGoverned(data.claimants) : false;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-fg-primary">
            Claimant Bundle Status
          </h1>
          <p className="mt-1 text-sm text-fg-secondary">
            Every claimant and where their evidence bundle sits on the 0–100 day journey. Select one to open its case-bundle board.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {piiGoverned && (
            <>
              <span
                className="chip"
                title="Claimant name, SSN, email and phone are masked by the semantic layer for your user group."
                style={{ color: "var(--color-action-primary)", backgroundColor: soft("#009293", 12) }}
              >
                <ShieldCheck size={14} /> PII is governed
              </span>
              <span
                className="chip"
                title="Row-level security restricts these results to the states your user group is entitled to."
                style={{ color: CHART.violet, backgroundColor: soft(CHART.violet, 14) }}
              >
                <Lock size={14} /> RLS active
              </span>
            </>
          )}
          <RefreshButton />
        </div>
      </header>

      <Card className="!p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-secondary" />
              <input
                value={params.get("search") ?? ""}
                onChange={(e) => set("search", e.target.value)}
                placeholder="Search claim ID or claimant…"
                className="field-input !h-11 !pl-10"
              />
            </div>
            <div className="relative sm:w-60">
              <ArrowUpDown className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-secondary" />
              <select
                value={params.get("sort") ?? "stage_desc"}
                onChange={(e) => set("sort", e.target.value)}
                className="select-chevron field-input !h-11 !w-full !bg-bg-secondary !pl-10 !pr-9 font-medium"
              >
                <option value="stage_desc">Sort: Most progressed</option>
                <option value="stage_asc">Sort: Least progressed</option>
                <option value="days_desc">Sort: Longest running</option>
                <option value="days_asc">Sort: Newest</option>
                <option value="completeness_desc">Sort: Most complete</option>
                <option value="completeness_asc">Sort: Least complete</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Select label="Status" value={params.get("status") ?? ""} onChange={(v) => set("status", v)} options={filters?.statuses ?? []} />
            <Select label="Stage" value={params.get("stage") ?? ""} onChange={(v) => set("stage", v)} options={filters?.stages ?? []} />
            <Select label="Program" value={params.get("program") ?? ""} onChange={(v) => set("program", v)} options={filters?.programs ?? []} />
            <Select label="State" value={params.get("state") ?? ""} onChange={(v) => set("state", v)} options={filters?.states ?? []} />
          </div>

          {activeChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-divider pt-3">
              <SlidersHorizontal className="h-3.5 w-3.5 text-fg-secondary" />
              {activeChips.map((k) => (
                <button
                  key={k}
                  onClick={() => set(k, "")}
                  className="chip"
                  style={{ color: "var(--color-action-primary)", backgroundColor: soft("#009293", 12) }}
                >
                  {params.get(k)} <X className="h-3 w-3" />
                </button>
              ))}
              <button
                onClick={() => setParams(new URLSearchParams(), { replace: true })}
                className="ml-1 text-xs font-medium text-fg-secondary hover:text-fg-primary"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      </Card>

      {error ? (
        <ErrorState message={error ? formatApiError(error) : "No data"} />
      ) : isLoading || !data ? (
        <Spinner />
      ) : (
        <>
          <div className="px-1 text-sm text-fg-secondary">
            <span className="font-semibold text-fg-primary">{data.count}</span> claimants
          </div>

          <Card className="!p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] table-fixed text-sm">
                <colgroup>
                  <col className="w-[24%]" />
                  <col className="w-[15%]" />
                  <col className="w-[11%]" />
                  <col className="w-[17%]" />
                  <col className="w-[15%]" />
                  <col className="w-[9%]" />
                  <col className="w-[9%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-divider text-left text-[10px] uppercase tracking-wide text-fg-secondary">
                    <th className="px-4 py-3.5 font-semibold">Claimant (masked)</th>
                    <th className="px-2 py-3.5 font-semibold">Status</th>
                    <th className="px-2 py-3.5 font-semibold">Program / State</th>
                    <th className="px-2 py-3.5 font-semibold">Bundle Stage</th>
                    <th className="px-2 py-3.5 font-semibold">Evidence</th>
                    <th className="whitespace-nowrap px-2 py-3.5 text-right font-semibold">Days</th>
                    <th className="whitespace-nowrap px-4 py-3.5 text-right font-semibold">SLA</th>
                  </tr>
                </thead>
                <tbody>
                  {data.claimants.map((c) => {
                    const pct = c.plan_completeness_pct ?? 0;
                    return (
                      <tr key={c.claim_id} className="group border-b border-divider transition-colors hover:bg-bg-secondary">
                        <td className="px-4 py-3">
                          <Link to={`/claimants/${c.claim_id}`} className="flex items-center gap-3">
                            <span
                              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
                              style={{
                                background: c.identity_restricted ? soft(CHART.slate, 16) : soft("#009293", 12),
                                color: c.identity_restricted ? CHART.slate : "var(--color-action-primary)",
                              }}
                            >
                              <Lock size={15} />
                            </span>
                            <div className="min-w-0">
                              {c.identity_restricted ? (
                                <div className="flex items-center gap-1.5 leading-snug">
                                  <span className="truncate font-medium text-fg-secondary">Restricted</span>
                                  <span className="chip !px-1.5 !py-0.5 !text-[9px]" style={{ color: CHART.slate, backgroundColor: soft(CHART.slate, 16) }}>
                                    RLS
                                  </span>
                                </div>
                              ) : (
                                <div className="truncate font-medium leading-snug text-fg-primary group-hover:text-action-primary">
                                  {c.claimant_name}
                                </div>
                              )}
                              <div className="truncate font-mono text-[11px] text-fg-secondary">{c.claim_id}</div>
                            </div>
                          </Link>
                        </td>
                        <td className="px-2 py-3"><StatusBadge status={c.status} /></td>
                        <td className="px-2 py-3">
                          <div className="text-fg-primary">{c.program_type ?? "—"}</div>
                          <div className="text-xs text-fg-secondary">{c.state_code ?? "—"}{c.city ? ` · ${c.city}` : ""}</div>
                        </td>
                        <td className="px-2 py-3"><StageBadge stage={c.current_bundle_stage} index={c.current_stage_index} /></td>
                        <td className="px-2 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-24"><ProgressBar value={pct} color={progressColor(pct)} /></div>
                            <span className="tabular text-xs font-medium text-fg-secondary">{fmtPct(pct, 0)}</span>
                          </div>
                          <div className="mt-0.5 text-[11px] text-fg-secondary">
                            {fmtNum(c.evidence_received)}/{fmtNum(c.expected_doc_count)} docs
                          </div>
                        </td>
                        <td className="px-2 py-3 text-right tabular text-fg-primary">{fmtNum(c.days_elapsed)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          {c.is_overdue ? (
                            <span className="chip" style={{ color: CHART.amber, backgroundColor: soft(CHART.amber, 16) }}>
                              Overdue
                            </span>
                          ) : (
                            <span className="text-xs text-fg-secondary">On track</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {data.claimants.length === 0 && (
              <div className="py-12 text-center text-sm text-fg-secondary">No claimants match these filters.</div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

// Heuristic: is the current user's PII masked by the semantic layer? We look at
// the claimant identity fields the layer returns. A real SSN (NNN-NN-NNNN) or a
// real email local-part means the user sees unredacted data (e.g. an executive)
// → not governed. Otherwise the values are hashed/redacted → governed. Restricted
// rows (row-level security) are ignored; if everything is restricted we treat it
// as governed.
function detectPiiGoverned(claimants: ClaimantListItem[]): boolean {
  const visible = claimants.filter((c) => !c.identity_restricted);
  if (visible.length === 0) return claimants.length > 0;

  const realSsn = /^\d{3}-?\d{2}-?\d{4}$/;
  const realEmail = /^[^@\s*]+@[^@\s]+\.[^@\s]+$/;
  const seesUnredacted = visible.slice(0, 25).some((c) => {
    const ssnReal = !!c.ssn && realSsn.test(c.ssn.trim());
    const emailReal = !!c.email && realEmail.test(c.email.trim());
    return ssnReal || emailReal;
  });
  return !seesUnredacted;
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="select-chevron field-input !h-10 !w-full !bg-bg-secondary !pr-8 font-medium"
    >
      <option value="">{label}: All</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
