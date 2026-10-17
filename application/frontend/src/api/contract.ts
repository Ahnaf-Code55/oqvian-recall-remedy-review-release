// The service contract from docs/planning/BUILD-SPEC.md.
//
// These are the request/response shapes the interface expects from the review
// service. In the interface demo they are answered locally by demoService.ts.
// When Ahnaf's service is running, VITE_API_BASE_URL switches the same calls to
// the real endpoints without changing any screen code.

import type {
  DemoCase,
  IntakeHistory,
  NoticeCondition,
  NoticeSummary,
  ReviewOutcome,
  ReviewReceipt,
} from '../types';

export interface HealthResponse {
  status: 'ok';
  runtime: string;
  service_kind: 'interface-demo' | 'live';
  inference_available: boolean;
  inference_note: string;
  model_revision: string | null;
  corpus_sources: number;
  corpus_sections: number;
  corpus_sha256: string;
}

export interface NoticesResponse {
  notices: NoticeSummary[];
  total: number;
}

export interface CasesResponse {
  cases: Array<{
    id: string;
    label: string;
    notice_id: string;
    condition_id: string;
    fixture_status: string;
    summary: string;
    expected_question: string;
  }>;
}

export interface ConditionResponse {
  conditions: NoticeCondition[];
}

export interface ReviewRequest {
  notice_id: string;
  condition_id: string;
  intake: IntakeHistory;
  input_revision: number;
  demo_case_id?: string | null;
}

export interface ReviewResponse {
  outcome: ReviewOutcome;
  receipt: ReviewReceipt;
}

export interface StoredReview {
  request: ReviewRequest;
  outcome: ReviewOutcome;
  receipt: ReviewReceipt;
}

export interface DemoCaseDetail extends DemoCase {}

export interface ExportResponse {
  filename: string;
  json: string;
}

/** Raw schema 1.1 backend receipt. Keep this shape intact for display/export. */
export interface BackendReceipt {
  schema_version: '1.1';
  review_id: string;
  case_id: string;
  created_at_utc: string;
  jurisdiction: string;
  fixture_status: string;
  input_revision: number;
  history: Record<string, unknown>;
  input_provenance: {
    fixture_status?: string;
    field_sources?: Record<string, string>;
    effective_condition_facts?: Record<string, 'yes' | 'no' | 'unknown'>;
    note?: string;
    [key: string]: unknown;
  };
  question: string;
  identity_status: string;
  source_consistency: {
    status: string;
    conflicts?: Array<Record<string, unknown>>;
    note?: string;
    [key: string]: unknown;
  };
  propositions: Array<{
    status: 'Supported' | 'Contradicted' | 'Unresolved';
    statement: string;
    evidence?: Array<{
      section_id: string;
      text: string;
      section_sha256: string;
      source_sha256: string;
      url: string;
      [key: string]: unknown;
    }>;
    rationale?: string;
    unknowns?: string[];
    [key: string]: unknown;
  }>;
  passages: Array<{
    notice_id: string;
    title: string;
    url: string;
    section_id: string;
    source_sha256: string;
    source_retrieved_at_utc: string;
    section_sha256: string;
    section_label: string;
    section_role: string;
    start_offset: number;
    end_offset: number;
    source_hash_verified: boolean;
    section_hash_verified: boolean;
    text: string;
    required_for_case?: boolean;
    [key: string]: unknown;
  }>;
  inference: {
    status: string;
    available?: boolean;
    model_id?: string;
    model_revision?: string;
    elapsed_seconds?: number | null;
    scores?: unknown[];
    ranking?: string[];
    note?: string;
    [key: string]: unknown;
  };
  rule_baseline: unknown;
  truncation: unknown;
  elapsed_ms: number;
  storage_security: unknown;
  limitations: string[];
  input_digest_sha256: string;
  receipt_digest_sha256: string;
  [key: string]: unknown;
}

export interface BackendCase {
  case_id: string;
  title: string;
  notice_ids: string[];
  review_question: string;
  history_template: Record<string, unknown>;
  history_field_labels?: Record<string, string>;
  fixture_status?: string;
  case_note?: string;
}

export interface BackendCasesResponse {
  schema_version: string;
  fixture_notice: string;
  cases: BackendCase[];
  provenance_classes: string[];
}

export interface BackendNotice {
  cpsc_id: string;
  document_title: string;
  official_url: string;
  publication_date: string;
  source_update_note: string | null;
  source_sha256: string;
  source_retrieved_at_utc: string;
  source_version_status: string | null;
}

export interface BackendNoticesResponse {
  notices: BackendNotice[];
}

export interface BackendHealthResponse {
  ok: boolean;
  service: string;
  model_id: string;
  model_revision: string;
  model_device: string;
  ai_available: boolean | null;
  ai_status: string;
}

export interface BackendReviewRequest {
  case_id: string;
  history: Record<string, string | boolean | Record<string, string>>;
  question: string;
  input_revision: number;
}
