// Local implementation of the six service routes for the interface demo.
//
// It is deliberately honest about what it is: a rules-only stand-in that reads
// the embedded retained corpus and never claims to be the integrated service.
// Receipts are kept so earlier revisions survive a correction, per the spec.

import { corpusMeta, getNoticeOrThrow, listSummaries, searchNotices, summarize } from '../data/corpus';
import { conditions, getCondition } from '../data/conditions';
import { demoCases, getCase } from '../data/cases';
import { buildReceipt, makeReviewId, runReview } from '../review/engine';
import type {
  CasesResponse,
  ConditionResponse,
  ExportResponse,
  HealthResponse,
  NoticesResponse,
  ReviewRequest,
  ReviewResponse,
  StoredReview,
} from './contract';

const STORAGE_KEY = 'oqvian.interface-demo.receipts.v1';

let store: Map<string, StoredReview> = new Map();

function loadStore(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as StoredReview[];
    store = new Map(parsed.map((entry) => [entry.outcome.review_id, entry]));
  } catch {
    store = new Map();
  }
}

function persistStore(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(store.values())));
  } catch {
    // Storage may be unavailable; the in-memory store still works for the session.
  }
}

loadStore();

export function isLiveService(): boolean {
  return false;
}

export function health(): HealthResponse {
  return {
    status: 'ok',
    runtime: 'Vite dev server (browser) — local demo service',
    service_kind: 'interface-demo',
    inference_available: false,
    inference_note:
      'No LinuxONE inference service is attached. Only the deterministic notice-condition check runs.',
    model_revision: null,
    corpus_sources: corpusMeta.source_count,
    corpus_sections: corpusMeta.section_count,
    corpus_sha256: corpusMeta.generated_from_sha256,
  };
}

export function notices(query = ''): NoticesResponse {
  const results = query ? searchNotices(query) : listSummaries();
  return { notices: results, total: results.length };
}

export function cases(): CasesResponse {
  return {
    cases: demoCases.map((demoCase) => ({
      id: demoCase.id,
      label: demoCase.label,
      notice_id: demoCase.notice_id,
      condition_id: demoCase.condition_id,
      fixture_status: demoCase.fixture_status,
      summary: demoCase.summary,
      expected_question: demoCase.expected_question,
    })),
  };
}

export function allConditions(): ConditionResponse {
  return { conditions };
}

export function noticeDetail(cpscId: string) {
  return summarize(getNoticeOrThrow(cpscId));
}

export function createReview(request: ReviewRequest): ReviewResponse {
  const condition = getCondition(request.condition_id);
  if (!condition) {
    throw new Error(`Unknown condition: ${request.condition_id}`);
  }
  if (condition.notice_id !== request.notice_id) {
    throw new Error(
      `Condition ${condition.id} belongs to notice ${condition.notice_id}, not ${request.notice_id}.`,
    );
  }
  const demoCase = request.demo_case_id ? getCase(request.demo_case_id) ?? null : null;
  const reviewId = makeReviewId();

  const outcome = runReview({
    noticeId: request.notice_id,
    condition,
    intake: request.intake,
    caseLabel: demoCase?.label ?? null,
    reviewId,
    inputRevision: request.input_revision,
    demoCase,
  });

  const receipt = buildReceipt(outcome, request.intake, demoCase?.label ?? null);
  const stored: StoredReview = { request, outcome, receipt };
  store.set(reviewId, stored);
  persistStore();
  return { outcome, receipt };
}

export function getReview(reviewId: string): StoredReview | null {
  return store.get(reviewId) ?? null;
}

export function listReviews(): StoredReview[] {
  return Array.from(store.values()).sort((a, b) =>
    b.outcome.created_at_utc.localeCompare(a.outcome.created_at_utc),
  );
}

export function exportReview(reviewId: string): ExportResponse {
  const stored = store.get(reviewId);
  if (!stored) {
    throw new Error(`Unknown review: ${reviewId}`);
  }
  const filename = `oqvian-receipt-${stored.receipt.notice.cpsc_id}-${reviewId}.json`;
  return { filename, json: JSON.stringify(stored.receipt, null, 2) };
}

export function clearReviews(): void {
  store = new Map();
  persistStore();
}
