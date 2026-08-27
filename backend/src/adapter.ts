import { createHash } from "node:crypto";
import { config } from "./config.js";
import {
  int,
  iso,
  num,
  runAll,
  runQuery,
  truthy,
  type CubeQuery,
  type Row,
} from "./semantic/client.js";
import { BUNDLE_STAGES } from "./stages.js";
import type { ChecklistItem, ClaimRow, ClaimStatus, EvidenceEvent } from "./types.js";

const CL = "CLAIM_LIFECYCLE";
const CM = "CLAIMANT";
const BC = "BUNDLE_CHECKLIST";
const EV = "EVIDENCE";

function indexBy(rows: Row[], key: string): Map<string, Row> {
  const m = new Map<string, Row>();
  for (const r of rows) m.set(String(r[key]), r);
  return m;
}

function normStage(stage: string | null): string | null {
  if (!stage) return null;
  const hit = BUNDLE_STAGES.find((s) => s.toLowerCase() === stage.toLowerCase());
  return hit ?? stage;
}

function toStatus(v: any): ClaimStatus {
  const s = String(v ?? "").toLowerCase();
  if (s === "approved") return "Approved";
  if (s === "denied") return "Denied";
  return "In Progress";
}

interface Cached<T> {
  at: number;
  data: T;
}

// Cache is keyed by a short hash of the user's token, never the raw token. Each
// user therefore gets their own governed snapshot, and a refreshed/expired token
// (a new key) naturally re-fetches instead of serving another user's data.
function tokenKey(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

/**
 * Reads the DataOS/Cube.js semantic layer for the SSA Smart Claims data product.
 * Every call is authenticated with the user's own access token, so governance
 * (PII masking + row-level security) is applied per user by the semantic layer —
 * the app just renders whatever it receives.
 */
export class SsaAdapter {
  private claimsCache = new Map<string, Cached<ClaimRow[]>>();
  private checklistCache = new Map<string, Cached<ChecklistItem[]>>();
  private evidenceBySourceCache = new Map<string, Cached<Row[]>>();

  private fresh<T>(store: Map<string, Cached<T>>, key: string): T | null {
    const c = store.get(key);
    return c && Date.now() - c.at < config.cacheTtlMs ? c.data : null;
  }

  // Drop this user's cached snapshot so the next request re-queries the semantic
  // layer. Backs the app's manual "refresh" button (cache stays on by default).
  clear(token: string): void {
    const key = tokenKey(token);
    this.claimsCache.delete(key);
    this.checklistCache.delete(key);
    this.evidenceBySourceCache.delete(key);
  }

  // ── Claims + (masked) claimant identity, joined in Node by claimant_id ─────
  async getClaims(token: string): Promise<ClaimRow[]> {
    const key = tokenKey(token);
    const cached = this.fresh(this.claimsCache, key);
    if (cached) return cached;

    const q = {
      claims: {
        dimensions: [
          `${CL}.CLAIM_ID`, `${CL}.CLAIMANT_ID`, `${CL}.STATE_CODE`, `${CL}.PROGRAM_TYPE`,
          `${CL}.PRIMARY_DISABILITY_CATEGORY`, `${CL}.PRIMARY_DIAGNOSIS`, `${CL}.PRIORITY_FLAG`,
          `${CL}.FILING_DATE`, `${CL}.ALLEGED_ONSET_DATE`,
          `${CL}.CURRENT_BUNDLE_STAGE`, `${CL}.CURRENT_STAGE_INDEX`,
          `${CL}.EVIDENCE_TOTAL`, `${CL}.EVIDENCE_RECEIVED`, `${CL}.EVIDENCE_OUTSTANDING`,
          `${CL}.EVIDENCE_COMPLETENESS_PCT`, `${CL}.EXPECTED_DOC_COUNT`,
          `${CL}.PLAN_COMPLETENESS_PCT`, `${CL}.OUTSTANDING_VS_PLAN`,
          `${CL}.DAYS_ELAPSED`, `${CL}.DAYS_TO_DECISION`, `${CL}.IS_DECIDED`, `${CL}.IS_APPROVED`,
          `${CL}.IS_OVERDUE`, `${CL}.CLAIM_STATUS`, `${CL}.DECISION_TYPE`, `${CL}.DECISION_DATE`,
          `${CL}.DENIAL_REASON`, `${CL}.MONTHLY_BENEFIT_AMOUNT_USD`, `${CL}.BACK_PAY_AMOUNT_USD`,
        ],
      },
      claimants: {
        dimensions: [
          `${CM}.CLAIMANT_ID`, `${CM}.FULL_NAME`, `${CM}.SSN`, `${CM}.EMAIL`, `${CM}.PHONE`,
          `${CM}.AGE`, `${CM}.AGE_BAND`, `${CM}.GENDER`, `${CM}.CITY`, `${CM}.MARITAL_STATUS`,
          `${CM}.PRIMARY_LANGUAGE`, `${CM}.VETERAN_FLAG`, `${CM}.OCCUPATION`,
        ],
      },
    } satisfies Record<string, CubeQuery>;

    const r = await runAll(q, token);
    const claimantById = indexBy(r.claimants, `${CM}.CLAIMANT_ID`);

    const rows: ClaimRow[] = r.claims.map((c) => {
      const claimantId = c[`${CL}.CLAIMANT_ID`] != null ? String(c[`${CL}.CLAIMANT_ID`]) : null;
      const cm = claimantId ? claimantById.get(claimantId) : undefined;
      return {
        claim_id: String(c[`${CL}.CLAIM_ID`]),
        claimant_id: claimantId,
        identity_restricted: !cm,

        claimant_name: cm?.[`${CM}.FULL_NAME`] ?? null,
        ssn: cm?.[`${CM}.SSN`] ?? null,
        email: cm?.[`${CM}.EMAIL`] ?? null,
        phone: cm?.[`${CM}.PHONE`] ?? null,
        age: num(cm?.[`${CM}.AGE`]),
        age_band: cm?.[`${CM}.AGE_BAND`] ?? null,
        gender: cm?.[`${CM}.GENDER`] ?? null,
        city: cm?.[`${CM}.CITY`] ?? null,
        marital_status: cm?.[`${CM}.MARITAL_STATUS`] ?? null,
        primary_language: cm?.[`${CM}.PRIMARY_LANGUAGE`] ?? null,
        veteran: truthy(cm?.[`${CM}.VETERAN_FLAG`]),
        occupation: cm?.[`${CM}.OCCUPATION`] ?? null,

        state_code: c[`${CL}.STATE_CODE`] ?? null,
        program_type: c[`${CL}.PROGRAM_TYPE`] ?? null,
        primary_disability_category: c[`${CL}.PRIMARY_DISABILITY_CATEGORY`] ?? null,
        primary_diagnosis: c[`${CL}.PRIMARY_DIAGNOSIS`] ?? null,
        priority_flag: c[`${CL}.PRIORITY_FLAG`] ?? null,
        filing_date: iso(c[`${CL}.FILING_DATE`]),
        alleged_onset_date: iso(c[`${CL}.ALLEGED_ONSET_DATE`]),

        current_bundle_stage: normStage(c[`${CL}.CURRENT_BUNDLE_STAGE`] ?? null),
        current_stage_index: int(c[`${CL}.CURRENT_STAGE_INDEX`]),
        evidence_total: int(c[`${CL}.EVIDENCE_TOTAL`]),
        evidence_received: int(c[`${CL}.EVIDENCE_RECEIVED`]),
        evidence_outstanding: int(c[`${CL}.EVIDENCE_OUTSTANDING`]),
        evidence_completeness_pct: num(c[`${CL}.EVIDENCE_COMPLETENESS_PCT`]),
        expected_doc_count: int(c[`${CL}.EXPECTED_DOC_COUNT`]),
        plan_completeness_pct: num(c[`${CL}.PLAN_COMPLETENESS_PCT`]),
        outstanding_vs_plan: int(c[`${CL}.OUTSTANDING_VS_PLAN`]),

        days_elapsed: num(c[`${CL}.DAYS_ELAPSED`]),
        days_to_decision: num(c[`${CL}.DAYS_TO_DECISION`]),
        is_overdue: truthy(c[`${CL}.IS_OVERDUE`]),

        status: toStatus(c[`${CL}.CLAIM_STATUS`]),
        is_decided: truthy(c[`${CL}.IS_DECIDED`]),
        is_approved: truthy(c[`${CL}.IS_APPROVED`]),
        decision_type: c[`${CL}.DECISION_TYPE`] ?? null,
        decision_date: iso(c[`${CL}.DECISION_DATE`]),
        denial_reason: c[`${CL}.DENIAL_REASON`] ?? null,
        monthly_benefit_usd: num(c[`${CL}.MONTHLY_BENEFIT_AMOUNT_USD`]),
        back_pay_usd: num(c[`${CL}.BACK_PAY_AMOUNT_USD`]),
      };
    });

    this.claimsCache.set(key, { at: Date.now(), data: rows });
    return rows;
  }

  // ── Bundle checklist (reference data: expected docs per stage) ─────────────
  async getChecklist(token: string): Promise<ChecklistItem[]> {
    const key = tokenKey(token);
    const cached = this.fresh(this.checklistCache, key);
    if (cached) return cached;

    const rows = await runQuery({
      dimensions: [
        `${BC}.CHECKLIST_CODE`, `${BC}.STAGE_INDEX`, `${BC}.DEVELOPMENT_STAGE`, `${BC}.SORT_ORDER`,
        `${BC}.EXPECTED_DOC_TYPE`, `${BC}.EXPECTED_SOURCE_TYPE`, `${BC}.EXPECTED_CHANNEL`,
        `${BC}.IS_REQUIRED`, `${BC}.IS_SYSTEM_GENERATED`,
      ],
      limit: 2000,
    }, token);

    const items: ChecklistItem[] = rows
      .map((x) => ({
        checklist_code: String(x[`${BC}.CHECKLIST_CODE`]),
        stage_index: int(x[`${BC}.STAGE_INDEX`]),
        development_stage: normStage(x[`${BC}.DEVELOPMENT_STAGE`] ?? null) ?? "Initial Bundle",
        sort_order: int(x[`${BC}.SORT_ORDER`]),
        expected_doc_type: x[`${BC}.EXPECTED_DOC_TYPE`] ?? null,
        expected_source_type: x[`${BC}.EXPECTED_SOURCE_TYPE`] ?? null,
        expected_channel: x[`${BC}.EXPECTED_CHANNEL`] ?? null,
        is_required: truthy(x[`${BC}.IS_REQUIRED`]),
        is_system_generated: truthy(x[`${BC}.IS_SYSTEM_GENERATED`]),
      }))
      .sort((a, b) => a.stage_index - b.stage_index || a.sort_order - b.sort_order);

    this.checklistCache.set(key, { at: Date.now(), data: items });
    return items;
  }

  // ── Evidence-by-source rollup (intake / IDP trust) ─────────────────────────
  async getEvidenceBySource(token: string): Promise<Row[]> {
    const key = tokenKey(token);
    const cached = this.fresh(this.evidenceBySourceCache, key);
    if (cached) return cached;
    const rows = await runQuery({
      measures: [
        `${EV}.TOTAL_EVIDENCE`, `${EV}.RECEIVED_COUNT`, `${EV}.OVERDUE_COUNT`,
        `${EV}.AVG_IDP_CONFIDENCE`, `${EV}.AVG_DAYS_TO_RECEIVE`,
      ],
      dimensions: [`${EV}.EVIDENCE_SOURCE_TYPE`],
      limit: 200,
    }, token);
    this.evidenceBySourceCache.set(key, { at: Date.now(), data: rows });
    return rows;
  }

  // ── Per-claim evidence events (for the claimant journey timeline) ──────────
  async getEvidenceForClaim(claimId: string, token: string): Promise<EvidenceEvent[]> {
    const rows = await runQuery({
      dimensions: [
        `${EV}.EVIDENCE_EVENT_ID`, `${EV}.CLAIM_ID`, `${EV}.EVIDENCE_SOURCE_TYPE`,
        `${EV}.EVIDENCE_TYPE_SUBCATEGORY`, `${EV}.EVIDENCE_SOURCE_CHANNEL`, `${EV}.EVIDENCE_STATUS`,
        `${EV}.EVIDENCE_DEVELOPMENT_STAGE`, `${EV}.IS_RECEIVED`, `${EV}.IS_OVERDUE`,
        `${EV}.IDP_CONFIDENCE_SCORE`, `${EV}.DAYS_TO_RECEIVE`, `${EV}.EVIDENCE_DUE_DATE`,
      ],
      filters: [{ member: `${EV}.CLAIM_ID`, operator: "equals", values: [claimId] }],
      limit: 500,
    }, token);

    return rows.map((x) => ({
      evidence_event_id: String(x[`${EV}.EVIDENCE_EVENT_ID`]),
      claim_id: x[`${EV}.CLAIM_ID`] != null ? String(x[`${EV}.CLAIM_ID`]) : null,
      source_type: x[`${EV}.EVIDENCE_SOURCE_TYPE`] ?? null,
      subcategory: x[`${EV}.EVIDENCE_TYPE_SUBCATEGORY`] ?? null,
      source_channel: x[`${EV}.EVIDENCE_SOURCE_CHANNEL`] ?? null,
      status: x[`${EV}.EVIDENCE_STATUS`] ?? null,
      development_stage: normStage(x[`${EV}.EVIDENCE_DEVELOPMENT_STAGE`] ?? null),
      is_received: truthy(x[`${EV}.IS_RECEIVED`]),
      is_overdue: truthy(x[`${EV}.IS_OVERDUE`]),
      idp_confidence: num(x[`${EV}.IDP_CONFIDENCE_SCORE`]),
      days_to_receive: num(x[`${EV}.DAYS_TO_RECEIVE`]),
      due_date: iso(x[`${EV}.EVIDENCE_DUE_DATE`]),
    }));
  }
}

let adapter: SsaAdapter | null = null;
export function getAdapter(): SsaAdapter {
  if (!adapter) adapter = new SsaAdapter();
  return adapter;
}
