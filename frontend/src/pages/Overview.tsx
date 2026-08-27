import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  FileStack,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  ArrowRight,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Cell,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from "recharts";
import { fetchOverview, formatApiError } from "../lib/api";
import { Card, KpiCard, SectionTitle, Spinner, ProgressBar, ErrorState, RefreshButton } from "../components/ui";
import { fmtCurrency, fmtNum, fmtPct } from "../lib/format";
import { CHART, STAGE_COLORS, STATUS_COLORS, progressColor, soft } from "../lib/colors";
import { ChartTooltip } from "../components/charts";

const AXIS = "#94a3b8";

export default function Overview() {
  const { data, isLoading, error } = useQuery({ queryKey: ["overview"], queryFn: fetchOverview });
  if (isLoading) return <Spinner label="Loading claim portfolio…" />;
  if (error || !data) return <ErrorState message={error ? formatApiError(error) : "No data"} />;

  const decidedPct = data.total ? Math.round((data.decided / data.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-fg-primary">
            Claim Portfolio Overview
          </h1>
          <p className="mt-1 text-sm text-fg-secondary">
            Settlement outcomes, pipeline maturity and evidence intake across the disability caseload — governed live from the semantic layer.
          </p>
        </div>
        <RefreshButton className="mt-1" />
      </header>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard
          label="Total Claims"
          value={fmtNum(data.total)}
          icon={<FileStack size={17} />}
          accent="brand"
          to="/claimants"
          sub={`${fmtNum(data.decided)} decided · ${decidedPct}%`}
        />
        <KpiCard
          label="Settled %"
          value={fmtPct(data.settlementRate, 1)}
          icon={<CheckCircle2 size={17} />}
          accent="emerald"
          to="/claimants?status=Approved"
          sub={`${fmtNum(data.approved)} approved of ${fmtNum(data.decided)} decided`}
        />
        <KpiCard
          label="Not-Settled %"
          value={fmtPct(data.denialRate, 1)}
          icon={<XCircle size={17} />}
          accent="rose"
          to="/claimants?status=Denied"
          sub={`${fmtNum(data.denied)} denied of ${fmtNum(data.decided)} decided`}
        />
        <KpiCard
          label="Awarded Benefits"
          value={fmtCurrency(data.totalMonthlyBenefit)}
          icon={<DollarSign size={17} />}
          accent="violet"
          sub={`+ ${fmtCurrency(data.totalBackPay)} back-pay`}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard
          label="In Progress"
          value={fmtNum(data.inProgress)}
          icon={<Clock size={17} />}
          accent="sky"
          to="/claimants?status=In Progress"
          sub="Open claims in development"
        />
        <KpiCard
          label="Overdue (SLA)"
          value={fmtNum(data.overdue)}
          icon={<AlertTriangle size={17} />}
          accent="amber"
          sub="Past statutory target"
        />
        <KpiCard
          label="Avg Days to Decision"
          value={fmtNum(data.avgDaysToDecision)}
          icon={<Clock size={17} />}
          accent="teal"
          sub="Filing → determination"
        />
        <KpiCard
          label="Avg IDP Confidence"
          value={data.avgIdpConfidence != null ? `${Math.round(data.avgIdpConfidence * 100)}%` : "—"}
          icon={<ShieldCheck size={17} />}
          accent="brand"
          sub={`${fmtNum(data.evidenceReceived)} received · ${fmtNum(data.evidenceOutstanding)} outstanding`}
        />
      </div>

      {/* Settlement gauge + status split + stage distribution */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="flex flex-col items-center text-center">
          <SectionTitle title="Settlement Rate" />
          <RadialGauge score={Math.round(data.settlementRate)} />
          <div className="mt-4 grid w-full grid-cols-3 gap-2">
            <MiniStat label="Approved" value={data.approved} color={STATUS_COLORS.Approved} />
            <MiniStat label="Denied" value={data.denied} color={STATUS_COLORS.Denied} />
            <MiniStat label="In Progress" value={data.inProgress} color={STATUS_COLORS["In Progress"]} />
          </div>
        </Card>

        <Card>
          <SectionTitle title="Outcome Split" subtitle="Decisions across the portfolio" />
          <div className="space-y-3">
            {data.byStatus.map((s) => (
              <OutcomeRow
                key={s.status}
                label={s.status}
                value={s.count}
                total={data.total}
                color={STATUS_COLORS[s.status as keyof typeof STATUS_COLORS] ?? CHART.slate}
              />
            ))}
          </div>
          <div className="mt-5 rounded-xl bg-bg-secondary px-4 py-3 text-xs text-fg-secondary">
            Settlement = approved ÷ decided. Not-settled ({fmtPct(data.denialRate, 1)}) is its complement.
          </div>
        </Card>

        <Card>
          <SectionTitle title="Bundle Stage Pipeline" subtitle="Claims by maturity stage" />
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={data.byStage} margin={{ left: -18, right: 8, top: 8 }}>
              <XAxis
                dataKey="index"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: AXIS }}
                tickFormatter={(i) => `S${i}`}
              />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS }} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(148,163,184,0.1)" }} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {data.byStage.map((s, i) => (
                  <Cell key={i} fill={STAGE_COLORS[i] ?? CHART.teal} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-fg-secondary">
            {data.byStage.map((s) => (
              <span key={s.index}>
                <span className="font-semibold text-fg-primary">S{s.index}</span> {s.stage.replace(" Bundle", "")}
              </span>
            ))}
          </div>
        </Card>
      </div>

      {/* Program + State outcome tables */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle title="Settlement by Program" subtitle="SSDI · SSI · Concurrent" />
          <div className="space-y-3">
            {data.byProgram.map((p) => (
              <RateRow key={p.name} name={p.name} total={p.total} decided={p.decided} rate={p.settlementRate} />
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle
            title="Not-Settled Hotspots by State"
            subtitle="Highest denial rate first"
          />
          <div className="space-y-2.5">
            {[...data.byState]
              .sort((a, b) => b.denialRate - a.denialRate)
              .slice(0, 8)
              .map((s) => (
                <div key={s.name}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-fg-primary">{s.name}</span>
                    <span className="text-xs text-fg-secondary">
                      {s.total} claims · not-settled{" "}
                      <span className="font-semibold" style={{ color: progressColor(100 - s.denialRate) }}>
                        {fmtPct(s.denialRate, 1)}
                      </span>
                    </span>
                  </div>
                  <ProgressBar value={s.denialRate} color={STATUS_COLORS.Denied} />
                </div>
              ))}
          </div>
        </Card>
      </div>

      {/* Evidence intake + attention list */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle title="Evidence Intake by Source" subtitle="Received vs outstanding · IDP trust" />
          {data.evidenceIntake.length === 0 ? (
            <p className="py-6 text-center text-sm text-fg-secondary">No evidence rollup available.</p>
          ) : (
            <div className="space-y-3">
              {data.evidenceIntake.slice(0, 7).map((e) => {
                const recPct = e.total ? Math.round((e.received / e.total) * 100) : 0;
                return (
                  <div key={e.source}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium capitalize text-fg-primary">{e.source}</span>
                      <span className="text-xs text-fg-secondary">
                        {fmtNum(e.received)}/{fmtNum(e.total)} received
                        {e.avgConfidence != null && (
                          <span className="ml-2">· IDP {Math.round(e.avgConfidence * 100)}%</span>
                        )}
                      </span>
                    </div>
                    <ProgressBar value={recPct} color={CHART.teal} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle
            title="Claims Needing Attention"
            subtitle="Longest-running open claims"
            action={
              <Link
                to="/claimants?sort=days_desc"
                className="inline-flex items-center gap-1 text-sm font-medium text-action-primary hover:opacity-80"
              >
                View all <ArrowRight size={14} />
              </Link>
            }
          />
          <div className="space-y-1">
            {data.topOverdue.map((c) => (
              <Link
                key={c.claim_id}
                to={`/claimants/${c.claim_id}`}
                className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-bg-secondary"
              >
                <div
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[13px] font-semibold"
                  style={{
                    background: soft(STAGE_COLORS[c.current_stage_index] ?? CHART.slate),
                    color: STAGE_COLORS[c.current_stage_index] ?? CHART.slate,
                  }}
                >
                  S{c.current_stage_index}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-fg-primary">
                    {c.claimant_name ?? c.claim_id}
                  </div>
                  <div className="truncate text-xs text-fg-secondary">
                    {c.state_code} · {c.program_type} · {c.current_bundle_stage}
                  </div>
                </div>
                {c.is_overdue && (
                  <span className="chip" style={{ color: CHART.amber, backgroundColor: soft(CHART.amber, 16) }}>
                    Overdue
                  </span>
                )}
                <span className="w-16 text-right text-xs font-medium text-fg-secondary">
                  {fmtNum(c.days_elapsed)}d
                </span>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function RadialGauge({ score }: { score: number }) {
  const data = [{ name: "score", value: score, fill: progressColor(score) }];
  return (
    <div className="relative h-[190px] w-[190px]">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart innerRadius="72%" outerRadius="100%" data={data} startAngle={90} endAngle={-270}>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar background dataKey="value" cornerRadius={20} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        <span className="text-4xl font-semibold leading-none text-fg-primary">{score}%</span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-fg-secondary">settled</span>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl bg-bg-secondary py-2">
      <div className="text-xl font-semibold" style={{ color }}>
        {value.toLocaleString()}
      </div>
      <div className="text-[11px] font-medium text-fg-secondary">{label}</div>
    </div>
  );
}

function OutcomeRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-fg-secondary">{label}</span>
        <span className="text-xs font-medium text-fg-secondary">
          {value.toLocaleString()} · {pct}%
        </span>
      </div>
      <ProgressBar value={pct} color={color} />
    </div>
  );
}

function RateRow({ name, total, decided, rate }: { name: string; total: number; decided: number; rate: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium text-fg-primary">{name}</span>
        <span className="text-xs text-fg-secondary">
          {total} claims · settled{" "}
          <span className="font-semibold" style={{ color: progressColor(rate) }}>
            {fmtPct(rate, 1)}
          </span>
        </span>
      </div>
      <ProgressBar value={rate} color={progressColor(rate)} />
    </div>
  );
}
