// The six bundle-maturity stages of the disability-claim journey, index 0-5.
// Names match FCT_CLAIM_LIFECYCLE.CURRENT_BUNDLE_STAGE and DIM_BUNDLE_CHECKLIST.DEVELOPMENT_STAGE.
export const BUNDLE_STAGES = [
  "Initial Bundle",
  "Growing Bundle",
  "Enriched Bundle",
  "Comprehensive Bundle",
  "Complete Bundle",
  "Decision Ready",
] as const;

// Short journey-milestone labels for the horizontal timeline (aligned to stage index).
export const TIMELINE_MILESTONES = [
  "Claim Filed",
  "Initial Evidence Gathered",
  "Medical Records Added",
  "Additional Evidence Added",
  "Final Documents Added",
  "Decision Ready",
] as const;

export function stageIndex(stage: string | null | undefined): number {
  if (!stage) return 0;
  const i = BUNDLE_STAGES.findIndex((s) => s.toLowerCase() === stage.toLowerCase());
  return i >= 0 ? i : 0;
}
