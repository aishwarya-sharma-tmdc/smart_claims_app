import axios from "axios";
import { getAccessToken, redirectToLogin } from "./auth";

// Resolve the API base against the document's <base href> so it works no matter
// what path the app is mounted under (root, /smart-claims/, …).
export const API_BASE = new URL("api", document.baseURI).toString();
export const api = axios.create({ baseURL: API_BASE });

// Attach the user's OIDC access_token to every request so the backend queries
// the semantic layer as that user (governance is applied per token). Read fresh
// each request so a re-login token is used automatically.
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// If the backend rejects the token (missing/expired), send the user back to
// DataOS to sign in again.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      console.warn("[Smart Claims] API: 401 — redirecting to sign in.");
      redirectToLogin();
    }
    return Promise.reject(err);
  }
);

export type ClaimStatus = "Approved" | "Denied" | "In Progress";

export interface Overview {
  total: number;
  decided: number;
  approved: number;
  denied: number;
  inProgress: number;
  overdue: number;
  settlementRate: number;
  denialRate: number;
  avgDaysToDecision: number;
  avgCompleteness: number;
  totalMonthlyBenefit: number;
  totalBackPay: number;
  evidenceReceived: number;
  evidenceOutstanding: number;
  avgIdpConfidence: number | null;
  byStage: { stage: string; index: number; count: number }[];
  byProgram: OutcomeGroup[];
  byState: OutcomeGroup[];
  byStatus: { status: string; count: number; color: string }[];
  evidenceIntake: {
    source: string;
    total: number;
    received: number;
    overdue: number;
    avgConfidence: number | null;
    avgDaysToReceive: number | null;
  }[];
  topOverdue: {
    claim_id: string;
    claimant_name: string | null;
    state_code: string | null;
    program_type: string | null;
    current_bundle_stage: string | null;
    current_stage_index: number;
    days_elapsed: number | null;
    is_overdue: boolean;
    evidence_completeness_pct: number | null;
  }[];
}

export interface OutcomeGroup {
  name: string;
  total: number;
  decided: number;
  approved: number;
  settlementRate: number;
  denialRate: number;
}

export interface ClaimantListItem {
  claim_id: string;
  claimant_id: string | null;
  identity_restricted: boolean;
  claimant_name: string | null;
  ssn: string | null;
  email: string | null;
  phone: string | null;
  age: number | null;
  gender: string | null;
  city: string | null;
  state_code: string | null;
  program_type: string | null;
  primary_disability_category: string | null;
  veteran: boolean;
  status: ClaimStatus;
  current_bundle_stage: string | null;
  current_stage_index: number;
  evidence_completeness_pct: number | null;
  evidence_received: number;
  evidence_total: number;
  // Checklist-based progress (received vs documents the checklist expects).
  expected_doc_count: number;
  plan_completeness_pct: number | null;
  outstanding_vs_plan: number;
  days_elapsed: number | null;
  is_overdue: boolean;
  filing_date: string | null;
  decision_date: string | null;
  monthly_benefit_usd: number | null;
}

export interface BoardStage {
  stage: string;
  index: number;
  isCurrent: boolean;
  isPast: boolean;
  items: {
    code: string;
    label: string;
    doc_type: string | null;
    source_type: string | null;
    channel: string | null;
    required: boolean;
    received: boolean;
    requested: boolean;
  }[];
  completedItems: number;
  totalItems: number;
  progress: number;
}

export interface TimelineStep {
  label: string;
  stage: string;
  index: number;
  completed: boolean;
  current: boolean;
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

export interface ClaimDetail {
  claim: ClaimantListItem & {
    primary_diagnosis: string | null;
    priority_flag: string | null;
    alleged_onset_date: string | null;
    age_band: string | null;
    marital_status: string | null;
    primary_language: string | null;
    occupation: string | null;
    evidence_outstanding: number;
    is_decided: boolean;
    is_approved: boolean;
    decision_type: string | null;
    denial_reason: string | null;
    back_pay_usd: number | null;
    days_to_decision: number | null;
  };
  board: BoardStage[];
  timeline: TimelineStep[];
  evidence: EvidenceEvent[];
}

export interface ClaimantFilters {
  statuses: ClaimStatus[];
  stages: string[];
  programs: string[];
  states: string[];
}

/** Surface backend `{ error: "..." }` instead of axios's generic status text. */
export function formatApiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as { error?: unknown } | undefined;
    if (typeof body?.error === "string" && body.error.trim()) return body.error;
    if (err.response?.status === 401) return "Not authenticated — sign in to DataOS.";
  }
  if (err instanceof Error && err.message) return err.message;
  return "Request failed";
}

/** Clear the backend's cached snapshot for this user, so the next fetch re-queries. */
export const refreshData = () => api.post<{ ok: boolean }>("/refresh").then((r) => r.data);

export const fetchOverview = () => api.get<Overview>("/overview").then((r) => r.data);
export const fetchClaimants = (params: Record<string, string>) =>
  api.get<{ count: number; claimants: ClaimantListItem[] }>("/claimants", { params }).then((r) => r.data);
export const fetchClaimantFilters = () =>
  api.get<ClaimantFilters>("/claimants/filters").then((r) => r.data);
export const fetchClaim = (id: string) =>
  api.get<ClaimDetail>(`/claimants/${id}`).then((r) => r.data);
