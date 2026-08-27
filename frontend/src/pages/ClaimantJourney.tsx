import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Lock,
  ShieldCheck,
  FileText,
  Fingerprint,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Stethoscope,
} from "lucide-react";
import { fetchClaim, formatApiError, type BoardStage, type ClaimDetail } from "../lib/api";
import { Card, SectionTitle, Spinner, StatusBadge, StageBadge, ProgressBar, StatLine, ErrorState } from "../components/ui";
import { fmtCurrency, fmtDate, fmtNum, fmtPct } from "../lib/format";
import { STAGE_COLORS, progressColor, soft, CHART } from "../lib/colors";

export default function ClaimantJourney() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ["claim", id],
    queryFn: () => fetchClaim(id!),
    enabled: !!id,
  });

  if (isLoading) return <Spinner label="Loading claimant journey…" />;
  if (error || !data) return <ErrorState message={error ? formatApiError(error) : "Claim not found"} />;

  const { claim, board, timeline } = data;

  return (
    <div className="space-y-6">
      <Link
        to="/claimants"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-fg-secondary transition-colors hover:text-fg-primary"
      >
        <ArrowLeft size={16} /> Back to all claimants
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-bg-secondary text-fg-secondary">
            <Lock size={22} />
          </span>
          <div>
            <h1 className="font-serif text-2xl font-semibold tracking-tight text-fg-primary">
              {claim.claimant_name ?? (claim.identity_restricted ? "Restricted claimant" : "Claimant")}
            </h1>
            <p className="font-mono text-xs text-fg-secondary">
              {claim.claim_id}
              {claim.claimant_id ? ` · ${claim.claimant_id}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={claim.status} />
          <StageBadge stage={claim.current_bundle_stage} index={claim.current_stage_index} />
        </div>
      </div>

      {/* Summary KPI strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryTile label="Evidence Complete" value={fmtPct(claim.plan_completeness_pct, 0)} color={progressColor(claim.plan_completeness_pct ?? 0)} />
        <SummaryTile label="Days Elapsed" value={`${fmtNum(claim.days_elapsed)}d`} color={claim.is_overdue ? CHART.amber : CHART.teal} />
        <SummaryTile
          label="Docs Received"
          value={`${fmtNum(claim.evidence_received)}/${fmtNum(claim.expected_doc_count)}`}
          color={CHART.blue}
        />
        <SummaryTile
          label={claim.is_approved ? "Monthly Benefit" : "Outstanding Docs"}
          value={claim.is_approved ? fmtCurrency(claim.monthly_benefit_usd) : fmtNum(claim.outstanding_vs_plan)}
          color={claim.is_approved ? CHART.good : CHART.violet}
        />
      </div>

      {/* Bundle board — the six-stage case bundle */}
      <Card>
        <SectionTitle
          title="Case Bundle Status"
          subtitle="Expected documents at each maturity stage — matched against received evidence"
        />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {board.map((stage) => (
            <StageColumn key={stage.index} stage={stage} currentIndex={claim.current_stage_index} />
          ))}
        </div>

        {/* Journey timeline */}
        <div className="mt-8">
          <JourneyTimeline steps={timeline} filingDate={claim.filing_date} decisionDate={claim.decision_date} />
        </div>
      </Card>

      {/* Claimant identity (masked) + case detail */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle
            title="Claimant Record"
            subtitle="Governed & masked by the semantic layer"
            action={
              <span className="chip" style={{ color: "var(--color-action-primary)", backgroundColor: soft("#009293", 12) }}>
                <ShieldCheck size={13} /> Governed
              </span>
            }
          />
          {claim.identity_restricted && (
            <div className="mb-3 flex items-start gap-2 rounded-xl border border-divider bg-bg-secondary px-3 py-2.5 text-xs text-fg-secondary">
              <Lock size={14} className="mt-0.5 shrink-0 text-fg-secondary" />
              This claimant is outside your permitted state(s), so row-level security hides the identity record entirely. Claim-level data below is still visible.
            </div>
          )}
          <div className="space-y-0.5">
            <IdentityRow icon={<Fingerprint size={15} />} label="SSN (hashed)" value={<span className="font-mono text-xs">{truncate(claim.ssn)}</span>} />
            <IdentityRow icon={<Mail size={15} />} label="Email" value={claim.email} />
            <IdentityRow icon={<Phone size={15} />} label="Phone" value={claim.phone} />
            <IdentityRow icon={<MapPin size={15} />} label="Location" value={[claim.city, claim.state_code].filter(Boolean).join(", ") || "—"} />
            <StatLine label="Age / Gender" value={`${claim.age ?? "—"}${claim.gender ? ` · ${claim.gender}` : ""}`} />
            <StatLine label="Program" value={claim.program_type ?? "—"} />
            <StatLine label="Veteran" value={claim.veteran ? "Yes" : "No"} />
            <StatLine label="Occupation" value={claim.occupation ?? "—"} />
          </div>
        </Card>

        <Card>
          <SectionTitle title="Case & Determination" subtitle="Filing → decision" />
          <div className="space-y-0.5">
            <IdentityRow icon={<Calendar size={15} />} label="Filed" value={fmtDate(claim.filing_date)} />
            <IdentityRow icon={<Stethoscope size={15} />} label="Primary diagnosis" value={claim.primary_diagnosis} />
            <StatLine label="Disability category" value={claim.primary_disability_category ?? "—"} />
            <StatLine label="Alleged onset" value={fmtDate(claim.alleged_onset_date)} />
            <StatLine label="Priority" value={claim.priority_flag ?? "Standard"} />
            <StatLine label="SLA" value={claim.is_overdue ? <span className="font-semibold text-state-warning">Overdue</span> : "On track"} />
            <StatLine
              label="Decision"
              value={
                claim.is_decided ? (
                  <span className="font-semibold" style={{ color: claim.is_approved ? CHART.good : CHART.ember }}>
                    {claim.decision_type} · {fmtDate(claim.decision_date)}
                  </span>
                ) : (
                  "Pending"
                )
              }
            />
            {claim.is_approved ? (
              <>
                <StatLine label="Monthly benefit" value={fmtCurrency(claim.monthly_benefit_usd)} />
                <StatLine label="Back-pay" value={fmtCurrency(claim.back_pay_usd)} />
              </>
            ) : claim.denial_reason ? (
              <StatLine label="Denial reason" value={claim.denial_reason} />
            ) : null}
          </div>
        </Card>
      </div>

      {/* Evidence log */}
      <EvidenceLog data={data} />
    </div>
  );
}

function StageColumn({ stage, currentIndex }: { stage: BoardStage; currentIndex: number }) {
  const color = STAGE_COLORS[stage.index] ?? CHART.teal;
  const active = stage.index === currentIndex;
  return (
    <div
      className="flex flex-col rounded-2xl border p-3.5"
      style={{
        borderColor: active ? color : "var(--color-divider)",
        boxShadow: active ? `0 0 0 1px ${color}` : undefined,
        background: active ? soft(color, 6) : "var(--color-bg-card)",
      }}
    >
      <div className="mb-1 flex items-center justify-between gap-1">
        <h3 className="text-[13px] font-semibold leading-tight text-fg-primary">
          {stage.stage.replace(" Bundle", "")}
        </h3>
        {active && (
          <span className="chip !px-1.5 !py-0.5 !text-[9px]" style={{ color, backgroundColor: soft(color, 16) }}>
            Current
          </span>
        )}
      </div>
      <p className="mb-3 text-[10px] uppercase tracking-wide text-fg-secondary">Stage {stage.index}</p>

      <ul className="flex-1 space-y-1.5">
        {stage.items.length === 0 && (
          <li className="text-[11px] italic text-fg-secondary">No checklist items</li>
        )}
        {stage.items.map((item) => (
          <li
            key={item.code}
            className="flex items-center gap-1.5 rounded-lg border border-divider bg-bg-secondary px-2 py-1.5"
          >
            {item.received ? (
              <CheckCircle2 size={13} className="shrink-0" style={{ color: CHART.good }} />
            ) : (
              <Clock size={13} className="shrink-0" style={{ color: CHART.amber }} />
            )}
            <span
              className={`truncate text-[11px] ${item.received ? "text-fg-primary" : "text-fg-secondary"}`}
              title={item.label}
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3">
        <ProgressBar value={stage.progress} color={color} />
        <div className="mt-1 flex items-center justify-between text-[10px] text-fg-secondary">
          <span>{stage.completedItems}/{stage.totalItems}</span>
          <span className="font-semibold" style={{ color }}>{stage.progress}%</span>
        </div>
      </div>
    </div>
  );
}

function JourneyTimeline({
  steps,
  filingDate,
  decisionDate,
}: {
  steps: ClaimDetail["timeline"];
  filingDate: string | null;
  decisionDate: string | null;
}) {
  const n = steps.length;
  // Nodes are evenly spaced (flex-1), so each node center sits half a cell in
  // from the edge. Inset the rail to the first/last node centers so it never
  // spills past the outer nodes / out of the card.
  const inset = n > 0 ? 50 / n : 0;
  const completedCount = steps.filter((s) => s.completed).length;
  // Fill reaches the last completed node. Clamp to [0,1] so a fully-decided
  // claim (all nodes completed) fills exactly to the last node, never past it.
  const frac = n > 1 ? Math.min(1, Math.max(0, (completedCount - 1) / (n - 1))) : 0;
  return (
    <div>
      <div className="relative flex items-center justify-between">
        <div className="absolute top-[11px] h-0.5 bg-divider" style={{ left: `${inset}%`, right: `${inset}%` }} />
        <div
          className="absolute top-[11px] h-0.5 bg-action-primary transition-all"
          style={{ left: `${inset}%`, width: `calc((100% - ${inset * 2}%) * ${frac})` }}
        />
        {steps.map((step) => {
          const color = STAGE_COLORS[step.index] ?? CHART.teal;
          return (
            <div key={step.index} className="relative z-10 flex flex-1 flex-col items-center text-center">
              <span
                className="grid h-6 w-6 place-items-center rounded-full border-2 bg-bg-card"
                style={{
                  borderColor: step.completed || step.current ? color : "var(--color-divider)",
                  background: step.completed ? color : "var(--color-bg-card)",
                }}
              >
                {step.completed ? (
                  <CheckCircle2 size={12} className="text-white" />
                ) : step.current ? (
                  <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-divider" />
                )}
              </span>
              <span className="mt-2 max-w-[90px] text-[10px] font-medium leading-tight text-fg-primary">
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between text-[10px] text-fg-secondary">
        <span>Filed {fmtDate(filingDate)}</span>
        <span>{decisionDate ? `Decided ${fmtDate(decisionDate)}` : "Awaiting decision"}</span>
      </div>
    </div>
  );
}

function EvidenceLog({ data }: { data: ClaimDetail }) {
  const events = data.evidence;
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="p-5 pb-3">
        <SectionTitle title="Evidence Events" subtitle={`${events.length} documents on this claim`} />
      </div>
      {events.length === 0 ? (
        <div className="px-5 pb-6 text-sm text-fg-secondary">No evidence events returned for this claim.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-y border-divider text-left text-[10px] uppercase tracking-wide text-fg-secondary">
                <th className="px-5 py-3 font-semibold">Source / Type</th>
                <th className="px-2 py-3 font-semibold">Stage</th>
                <th className="px-2 py-3 font-semibold">Status</th>
                <th className="px-2 py-3 text-right font-semibold">IDP Conf.</th>
                <th className="px-2 py-3 text-right font-semibold">Days</th>
                <th className="px-5 py-3 text-right font-semibold">Due</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const conf = e.idp_confidence;
                const lowConf = conf != null && conf < 0.5;
                return (
                  <tr key={e.evidence_event_id} className="border-b border-divider last:border-0">
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="shrink-0 text-fg-secondary" />
                        <div className="min-w-0">
                          <div className="truncate font-medium capitalize text-fg-primary">{e.source_type ?? "—"}</div>
                          <div className="truncate text-xs text-fg-secondary">{e.subcategory ?? e.source_channel ?? ""}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-xs text-fg-secondary">{e.development_stage?.replace(" Bundle", "") ?? "—"}</td>
                    <td className="px-2 py-2.5">
                      {e.is_received ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: CHART.good }}>
                          <CheckCircle2 size={13} /> {e.status ?? "Received"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: e.is_overdue ? CHART.amber : CHART.slate }}>
                          <Clock size={13} /> {e.status ?? (e.is_overdue ? "Overdue" : "Pending")}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular">
                      {conf != null ? (
                        <span className={lowConf ? "font-semibold" : ""} style={{ color: lowConf ? CHART.ember : undefined }}>
                          {Math.round(conf * 100)}%
                        </span>
                      ) : (
                        <span className="text-fg-secondary">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular text-fg-secondary">{e.days_to_receive ?? "—"}</td>
                    <td className="px-5 py-2.5 text-right text-xs text-fg-secondary">{fmtDate(e.due_date)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function SummaryTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="surface-card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-secondary">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function IdentityRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-divider py-2.5 text-sm last:border-0">
      <span className="flex items-center gap-2 text-fg-secondary">
        <span className="text-fg-secondary">{icon}</span>
        {label}
      </span>
      <span className="max-w-[60%] truncate text-right font-medium text-fg-primary">{value ?? "—"}</span>
    </div>
  );
}

function truncate(s: string | null, n = 18): string {
  if (!s) return "—";
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
