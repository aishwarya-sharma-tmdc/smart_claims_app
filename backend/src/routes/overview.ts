import { Router } from "express";
import { getAdapter } from "../adapter.js";
import { int, num, requireToken } from "../semantic/client.js";
import { BUNDLE_STAGES } from "../stages.js";
import type { ClaimRow } from "../types.js";

export const overviewRouter = Router();

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

overviewRouter.get("/", async (req, res, next) => {
  try {
    const token = requireToken(req);
    const adapter = getAdapter();
    const [claims, evidenceBySource] = await Promise.all([
      adapter.getClaims(token),
      adapter.getEvidenceBySource(token).catch(() => []),
    ]);

    const total = claims.length;
    const decided = claims.filter((c) => c.is_decided).length;
    const approved = claims.filter((c) => c.is_approved).length;
    const denied = decided - approved;
    const inProgress = total - decided;
    const overdue = claims.filter((c) => c.is_overdue).length;

    const settlementRate = pct(approved, decided); // AWARD_RATE
    const denialRate = pct(denied, decided); // DENIAL_RATE (not-settled)

    const avgDaysToDecision =
      avg(claims.map((c) => c.days_to_decision).filter((v): v is number => v != null)) ?? 0;
    const avgCompleteness =
      avg(claims.map((c) => c.plan_completeness_pct).filter((v): v is number => v != null)) ?? 0;

    const totalMonthlyBenefit = claims.reduce((s, c) => s + (c.monthly_benefit_usd ?? 0), 0);
    const totalBackPay = claims.reduce((s, c) => s + (c.back_pay_usd ?? 0), 0);
    const evidenceReceived = claims.reduce((s, c) => s + c.evidence_received, 0);
    const evidenceOutstanding = claims.reduce((s, c) => s + c.outstanding_vs_plan, 0);

    // Distribution across the six bundle stages (0 → 5).
    const byStage = BUNDLE_STAGES.map((stage, idx) => ({
      stage,
      index: idx,
      count: claims.filter((c) => c.current_stage_index === idx).length,
    }));

    // Program breakdown with settlement rate.
    const byProgram = groupOutcome(claims, (c) => c.program_type ?? "Unknown").sort(
      (a, b) => b.total - a.total
    );

    // State breakdown (top 10 by volume) with denial (not-settled) rate.
    const byState = groupOutcome(claims, (c) => c.state_code ?? "Unknown")
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);

    const byStatus = [
      { status: "Approved", count: approved, color: "good" },
      { status: "Denied", count: denied, color: "risk" },
      { status: "In Progress", count: inProgress, color: "blue" },
    ];

    const evidenceIntake = evidenceBySource
      .map((r) => ({
        source: r["EVIDENCE.EVIDENCE_SOURCE_TYPE"] ?? "Unknown",
        total: int(r["EVIDENCE.TOTAL_EVIDENCE"]),
        received: int(r["EVIDENCE.RECEIVED_COUNT"]),
        overdue: int(r["EVIDENCE.OVERDUE_COUNT"]),
        avgConfidence: num(r["EVIDENCE.AVG_IDP_CONFIDENCE"]),
        avgDaysToReceive: num(r["EVIDENCE.AVG_DAYS_TO_RECEIVE"]),
      }))
      .sort((a, b) => b.total - a.total);

    const avgIdpConfidence =
      avg(evidenceIntake.map((e) => e.avgConfidence).filter((v): v is number => v != null)) ?? null;

    // Claims needing attention: overdue / longest-running open claims.
    const topOverdue = claims
      .filter((c) => !c.is_decided)
      .sort((a, b) => (b.days_elapsed ?? 0) - (a.days_elapsed ?? 0))
      .slice(0, 8)
      .map((c) => ({
        claim_id: c.claim_id,
        claimant_name: c.claimant_name,
        state_code: c.state_code,
        program_type: c.program_type,
        current_bundle_stage: c.current_bundle_stage,
        current_stage_index: c.current_stage_index,
        days_elapsed: c.days_elapsed,
        is_overdue: c.is_overdue,
        evidence_completeness_pct: c.plan_completeness_pct,
      }));

    res.json({
      total,
      decided,
      approved,
      denied,
      inProgress,
      overdue,
      settlementRate,
      denialRate,
      avgDaysToDecision: Math.round(avgDaysToDecision),
      avgCompleteness: Math.round(avgCompleteness * 10) / 10,
      totalMonthlyBenefit,
      totalBackPay,
      evidenceReceived,
      evidenceOutstanding,
      avgIdpConfidence,
      byStage,
      byProgram,
      byState,
      byStatus,
      evidenceIntake,
      topOverdue,
    });
  } catch (err) {
    next(err);
  }
});

function groupOutcome(claims: ClaimRow[], key: (c: ClaimRow) => string) {
  const map = new Map<string, { name: string; total: number; decided: number; approved: number }>();
  for (const c of claims) {
    const name = key(c);
    const g = map.get(name) ?? { name, total: 0, decided: 0, approved: 0 };
    g.total++;
    if (c.is_decided) g.decided++;
    if (c.is_approved) g.approved++;
    map.set(name, g);
  }
  return [...map.values()].map((g) => ({
    name: g.name,
    total: g.total,
    decided: g.decided,
    approved: g.approved,
    settlementRate: pct(g.approved, g.decided),
    denialRate: pct(g.decided - g.approved, g.decided),
  }));
}
