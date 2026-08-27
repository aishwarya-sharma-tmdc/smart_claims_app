// Canonical shapes returned by the SSA adapter and served by the API.

export type ClaimStatus = "Approved" | "Denied" | "In Progress";

// One row per claim, enriched with (masked) claimant identity.
export interface ClaimRow {
  claim_id: string;
  claimant_id: string | null;

  // True when the claimant row is hidden by row-level security (out of the
  // token's permitted state), so no identity fields resolve for this claim.
  identity_restricted: boolean;

  // Masked / governed claimant identity (from DIM_CLAIMANT via the semantic layer).
  claimant_name: string | null; // "***REDACTED***" for non-privileged groups
  ssn: string | null; // SHA2 hash for non-privileged groups
  email: string | null; // domain-only for non-privileged groups
  phone: string | null; // masked
  age: number | null;
  age_band: string | null;
  gender: string | null;
  city: string | null;
  marital_status: string | null;
  primary_language: string | null;
  veteran: boolean;
  occupation: string | null;

  // Claim attributes
  state_code: string | null;
  program_type: string | null;
  primary_disability_category: string | null;
  primary_diagnosis: string | null;
  priority_flag: string | null;
  filing_date: string | null;
  alleged_onset_date: string | null;

  // Bundle maturity / evidence
  current_bundle_stage: string | null;
  current_stage_index: number;
  evidence_total: number;
  evidence_received: number;
  evidence_outstanding: number;
  evidence_completeness_pct: number | null;
  // Checklist-based progress: received measured against the documents the bundle
  // checklist expects. Preferred over evidence_completeness_pct, which compares
  // received against the evidence rows that exist and so self-reports ~100%.
  expected_doc_count: number;
  plan_completeness_pct: number | null;
  outstanding_vs_plan: number;

  // SLA
  days_elapsed: number | null;
  days_to_decision: number | null;
  is_overdue: boolean;

  // Outcome / settlement
  status: ClaimStatus;
  is_decided: boolean;
  is_approved: boolean;
  decision_type: string | null;
  decision_date: string | null;
  denial_reason: string | null;
  monthly_benefit_usd: number | null;
  back_pay_usd: number | null;
}

export interface ChecklistItem {
  checklist_code: string;
  stage_index: number;
  development_stage: string;
  sort_order: number;
  expected_doc_type: string | null;
  expected_source_type: string | null;
  expected_channel: string | null;
  is_required: boolean;
  is_system_generated: boolean;
}

export interface EvidenceEvent {
  evidence_event_id: string;
  claim_id: string | null;
  source_type: string | null;
  subcategory: string | null;
  source_channel: string | null;
  status: string | null;
  development_stage: string | null;
  is_received: boolean;
  is_overdue: boolean;
  idp_confidence: number | null;
  days_to_receive: number | null;
  due_date: string | null;
}
