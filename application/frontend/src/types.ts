// Domain types for the OQVIAN review workspace.
//
// These mirror the "Data representation" section of docs/planning/BUILD-SPEC.md.
// The result labels (Supported / Contradicted / Unresolved) attach to a single
// narrowly phrased proposition. Source consistency is a separate dimension and
// is never a fourth proposition label.

/** Result label for one proposition. */
export type PropositionStatus = 'supported' | 'contradicted' | 'unresolved';

/** Product identity is tracked apart from proposition outcomes. */
export type IdentityStatus =
  | 'confirmed'
  | 'unconfirmed'
  | 'not_supplied';

/** Structured API vs official webpage agreement. Not a proposition label. */
export type SourceConsistencyStatus = 'agree' | 'disagree' | 'not_checked';

/**
 * Provenance of a supplied intake fact. Mirrors the classes the spec requires
 * the reviewer to distinguish. A confirmation may support its stated fact even
 * when it is not the reviewer's own observation.
 */
export type EvidenceClass =
  | 'observed_present'
  | 'observed_absent'
  | 'constructed_fixture'
  | 'not_checked'
  | 'owner_statement'
  | 'third_party_confirmation';

/** Tri-state supplied value. `unknown` is a first-class answer, not an absence. */
export type FactValue = 'yes' | 'no' | 'unknown';

export interface NoticeSection {
  section_id: string;
  label: string;
  source_heading: string | null;
  role: string;
  char_start: number;
  char_end_exclusive: number;
  section_sha256: string;
  text: string;
  condition_retrieval_candidate: boolean;
  selection_status: string | null;
}

export interface OfficialNotice {
  cpsc_id: string;
  document_title: string;
  official_url: string;
  source_file: string;
  source_sha256: string;
  source_retrieved_at_utc: string;
  source_version_status: string | null;
  annotation_status: string | null;
  sections: NoticeSection[];
}

export interface NoticeCorpus {
  layer: string;
  generated_from: string;
  generated_from_sha256: string;
  purpose: string;
  source_count: number;
  section_count: number;
  scope_note: string;
  revision_note: string;
  excluded_from_evidence: string[];
  not_established: string[];
  notices: OfficialNotice[];
}

/** Convenience view of the metadata a reviewer needs before choosing a notice. */
export interface NoticeSummary {
  cpsc_id: string;
  title: string;
  product: string;
  recall_date: string;
  remedy_type: string;
  units: string;
  hazard: string;
  description: string;
  official_url: string;
  source_file: string;
  source_sha256: string;
  retrieved_at_utc: string;
  version_status: string | null;
  update_note: string | null;
  eligible_section_count: number;
}

/** A fact the deterministic check needs before it can answer a condition. */
export interface SuppliedFact {
  key: string;
  value: FactValue;
  evidence: EvidenceClass;
  note?: string;
}

/**
 * One intake history. The fields the spec calls out (dispatched / received /
 * installed) are kept separate because a received kit is not an installed kit.
 */
export interface IntakeHistory {
  action_description: string;
  action_date: string;
  kit_or_component: string;
  model: string;
  serial: string;
  facts: SuppliedFact[];
  reviewer_notes: string;
}

export interface ConditionRequirement {
  key: string;
  label: string;
}

/**
 * A notice-specific condition record. Hand-authored over the retained official
 * text (manual annotation), citing exactly one permitted source section.
 */
export interface NoticeCondition {
  id: string;
  notice_id: string;
  /** Narrowly phrased question this proposition answers. */
  question: string;
  /** The exact permitted source section this condition is drawn from. */
  section_id: string;
  /** Additional sections that carry the scope or the exclusion wording. */
  supporting_section_ids: string[];
  /** Component and time scope of the condition. */
  scope: string;
  /** Explicit exclusion, quoted from the source where present. */
  exclusion: string | null;
  /** Facts that must all be `yes` for the proposition to be supported. */
  requirements: ConditionRequirement[];
  /** Facts that, when supplied as `yes`, contradict the proposition outright. */
  exclusion_keys: string[];
  identity_required: boolean;
  provenance: string;
}

/** A constructed demonstration fixture over real official documents. */
export interface DemoCase {
  id: string;
  label: string;
  notice_id: string;
  condition_id: string;
  fixture_status: 'constructed functional example over a retained official notice';
  summary: string;
  expected_question: string;
  intake: IntakeHistory;
  source_variants?: {
    api_instruction: string;
    page_instruction: string;
    api_provenance: string;
    page_provenance: string;
  };
}

/** A cited passage attached to a claim. */
export interface CitedPassage {
  section_id: string;
  notice_id: string;
  label: string;
  source_heading: string | null;
  role: string;
  char_start: number;
  char_end_exclusive: number;
  section_sha256: string;
  text: string;
  source_sha256: string;
  official_url: string;
  retrieved_at_utc: string;
}

export interface PropositionResult {
  condition_id: string;
  question: string;
  status: PropositionStatus;
  /** Deterministic facts applied, in the order they were checked. */
  reasoning: string[];
  /** Required facts that are still missing or ambiguous. */
  missing: string[];
  passage: CitedPassage;
  supporting_passages: CitedPassage[];
  scope: string;
  exclusion: string | null;
}

export interface IdentityEvaluation {
  status: IdentityStatus;
  supplied_model: string;
  supplied_serial: string;
  reasoning: string[];
  passage: CitedPassage | null;
  serial_note: string | null;
}

export interface SourceConsistencyEvaluation {
  status: SourceConsistencyStatus;
  summary: string;
  api_instruction: string | null;
  page_instruction: string | null;
  api_provenance: string | null;
  page_provenance: string | null;
  blocks_review: boolean;
}

/** Alerts the reviewer must not lose: truncation, missing confirmation, etc. */
export interface ReviewWarning {
  code: string;
  severity: 'info' | 'attention' | 'blocking';
  message: string;
}

export interface ReviewOutcome {
  review_id: string;
  input_revision: number;
  created_at_utc: string;
  notice: NoticeSummary;
  case_label: string | null;
  fixture_status: string;
  identity: IdentityEvaluation;
  proposition: PropositionResult;
  source_consistency: SourceConsistencyEvaluation;
  warnings: ReviewWarning[];
  follow_up_questions: string[];
  inference: {
    available: boolean;
    reason: string;
    model_revision: string | null;
  };
  rule_baseline: string;
  elapsed_ms: number;
  /** True when the displayed result no longer matches the current inputs. */
  obsolete: boolean;
}

export interface ReviewReceipt {
  review_id: string;
  input_revision: number;
  created_at_utc: string;
  notice: NoticeSummary;
  case_label: string | null;
  fixture_status: string;
  jurisdiction: string;
  intake: IntakeHistory;
  outcome: ReviewOutcome;
  cited_fingerprints: Array<{
    section_id: string;
    section_sha256: string;
    source_sha256: string;
    char_start: number;
    char_end_exclusive: number;
  }>;
  model_revision: string | null;
  environment: string;
  reviewer_notes: string;
}
