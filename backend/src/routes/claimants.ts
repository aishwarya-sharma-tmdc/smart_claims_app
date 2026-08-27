import { Router } from "express";
import { getAdapter } from "../adapter.js";
import { requireToken } from "../semantic/client.js";
import { BUNDLE_STAGES, TIMELINE_MILESTONES } from "../stages.js";
import type { ChecklistItem, ClaimRow, EvidenceEvent } from "../types.js";

export const claimantsRouter = Router();

// ── List: filterable / sortable claims with masked claimant identity ─────────
claimantsRouter.get("/", async (req, res, next) => {
  try {
    const token = requireToken(req);
    const claims = await getAdapter().getClaims(token);
    const { status, stage, program, state, search, sort } = req.query as Record<string, string>;

    let rows = claims.slice();
    if (status) rows = rows.filter((c) => c.status === status);
    if (stage) rows = rows.filter((c) => c.current_bundle_stage === stage);
    if (program) rows = rows.filter((c) => c.program_type === program);
    if (state) rows = rows.filter((c) => c.state_code === state);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (c) =>
          c.claim_id.toLowerCase().includes(q) ||
          (c.claimant_name ?? "").toLowerCase().includes(q) ||
          (c.claimant_id ?? "").toLowerCase().includes(q)
      );
    }

    rows.sort((a, b) => {
      switch (sort) {
        case "days_desc":
          return (b.days_elapsed ?? 0) - (a.days_elapsed ?? 0);
        case "days_asc":
          return (a.days_elapsed ?? 0) - (b.days_elapsed ?? 0);
        case "completeness_desc":
          return (b.plan_completeness_pct ?? 0) - (a.plan_completeness_pct ?? 0);
        case "completeness_asc":
          return (a.plan_completeness_pct ?? 0) - (b.plan_completeness_pct ?? 0);
        case "stage_desc":
          return b.current_stage_index - a.current_stage_index;
        case "stage_asc":
          return a.current_stage_index - b.current_stage_index;
        default:
          // Default: most-progressed but still open first, then decided.
          return b.current_stage_index - a.current_stage_index;
      }
    });

    res.json({ count: rows.length, claimants: rows.map(listItem) });
  } catch (err) {
    next(err);
  }
});

// ── Filter option values ─────────────────────────────────────────────────────
claimantsRouter.get("/filters", async (req, res, next) => {
  try {
    const token = requireToken(req);
    const claims = await getAdapter().getClaims(token);
    const uniq = (vals: (string | null)[]) =>
      [...new Set(vals.filter((v): v is string => !!v))].sort();
    res.json({
      statuses: ["Approved", "Denied", "In Progress"],
      stages: BUNDLE_STAGES,
      programs: uniq(claims.map((c) => c.program_type)),
      states: uniq(claims.map((c) => c.state_code)),
    });
  } catch (err) {
    next(err);
  }
});

// ── Journey detail: the bundle board + timeline + evidence for one claim ─────
claimantsRouter.get("/:claimId", async (req, res, next) => {
  try {
    const token = requireToken(req);
    const adapter = getAdapter();
    const claimId = req.params.claimId;
    const [claims, checklist] = await Promise.all([adapter.getClaims(token), adapter.getChecklist(token)]);
    const claim = claims.find((c) => c.claim_id === claimId);
    if (!claim) return res.status(404).json({ error: "Claim not found" });

    const evidence = await adapter.getEvidenceForClaim(claimId, token).catch(() => [] as EvidenceEvent[]);

    const board = buildBoard(claim, checklist, evidence);
    const timeline = TIMELINE_MILESTONES.map((label, idx) => ({
      label,
      stage: BUNDLE_STAGES[idx],
      index: idx,
      completed: claim.current_stage_index > idx || (claim.is_decided && idx <= 5),
      current: claim.current_stage_index === idx && !claim.is_decided,
    }));

    // Evidence events, newest activity first (received/overdue signal), for the log panel.
    const evidenceLog = evidence
      .slice()
      .sort((a, b) => Number(b.is_received) - Number(a.is_received))
      .slice(0, 60);

    res.json({ claim, board, timeline, evidence: evidenceLog });
  } catch (err) {
    next(err);
  }
});

function listItem(c: ClaimRow) {
  return {
    claim_id: c.claim_id,
    claimant_id: c.claimant_id,
    identity_restricted: c.identity_restricted,
    claimant_name: c.claimant_name,
    ssn: c.ssn,
    email: c.email,
    phone: c.phone,
    age: c.age,
    gender: c.gender,
    city: c.city,
    state_code: c.state_code,
    program_type: c.program_type,
    primary_disability_category: c.primary_disability_category,
    veteran: c.veteran,
    status: c.status,
    current_bundle_stage: c.current_bundle_stage,
    current_stage_index: c.current_stage_index,
    evidence_completeness_pct: c.evidence_completeness_pct,
    evidence_received: c.evidence_received,
    evidence_total: c.evidence_total,
    expected_doc_count: c.expected_doc_count,
    plan_completeness_pct: c.plan_completeness_pct,
    outstanding_vs_plan: c.outstanding_vs_plan,
    days_elapsed: c.days_elapsed,
    is_overdue: c.is_overdue,
    filing_date: c.filing_date,
    decision_date: c.decision_date,
    monthly_benefit_usd: c.monthly_benefit_usd,
  };
}

// Match the claim's evidence to the per-stage checklist to render received-vs-pending.
function buildBoard(claim: ClaimRow, checklist: ChecklistItem[], evidence: EvidenceEvent[]) {
  // Group received evidence by (stage, source_type) for matching.
  const receivedKey = new Set<string>();
  const anyKey = new Set<string>();
  for (const e of evidence) {
    const k = `${(e.development_stage ?? "").toLowerCase()}|${(e.source_type ?? "").toLowerCase()}`;
    anyKey.add(k);
    if (e.is_received) receivedKey.add(k);
    // also index by source type alone (checklist join is primarily on doc type)
    const ks = `*|${(e.source_type ?? "").toLowerCase()}`;
    anyKey.add(ks);
    if (e.is_received) receivedKey.add(ks);
  }

  return BUNDLE_STAGES.map((stage, idx) => {
    const items = checklist
      .filter((i) => i.stage_index === idx)
      .map((i) => {
        const docType = (i.expected_doc_type ?? "").toLowerCase();
        const kExact = `${stage.toLowerCase()}|${docType}`;
        const kType = `*|${docType}`;
        // Strictly evidence-driven: an item is only complete when matching
        // evidence actually arrived. We deliberately do NOT infer completion
        // from the claim's stage — CURRENT_STAGE_INDEX is a procedural marker in
        // the source data and is not guaranteed to line up with evidence intake,
        // so inferring from it would overstate what the claimant has provided.
        const received = receivedKey.has(kExact) || receivedKey.has(kType);
        const requested = anyKey.has(kExact) || anyKey.has(kType);
        return {
          code: i.checklist_code,
          label: prettyLabel(i.expected_doc_type),
          doc_type: i.expected_doc_type,
          source_type: i.expected_source_type,
          channel: i.expected_channel,
          required: i.is_required,
          received,
          // Distinguishes "asked for, still waiting" from "not requested yet".
          requested,
        };
      });
    const done = items.filter((i) => i.received).length;
    return {
      stage,
      index: idx,
      isCurrent: claim.current_stage_index === idx,
      isPast: claim.current_stage_index > idx,
      items,
      completedItems: done,
      totalItems: items.length,
      progress: items.length ? Math.round((done / items.length) * 100) : 0,
    };
  });
}

// Turn an EXPECTED_DOC_TYPE code into a display label (fallback if it's snake/upper).
function prettyLabel(raw: string | null): string {
  if (!raw) return "Document";
  if (/^[A-Z]{2,}-?\d/.test(raw)) return raw; // keep form codes like SSA-827
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}
