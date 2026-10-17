// Deterministic review engine for the interface demo.
//
// This is a rules-only check. It applies notice-specific condition records to
// supplied intake facts. It does not score text, does not guess, and does not
// hide missing facts. The inference service is not connected in the interface
// demo, and that is reported as an unavailable-inference warning rather than
// silently omitted.

import { getNoticeOrThrow, passageFor, summarize } from '../data/corpus';
import { factLabel } from '../data/conditions';
import type {
  CitedPassage,
  DemoCase,
  FactValue,
  IdentityEvaluation,
  IntakeHistory,
  NoticeCondition,
  PropositionResult,
  PropositionStatus,
  ReviewOutcome,
  ReviewReceipt,
  ReviewWarning,
  SourceConsistencyEvaluation,
  SuppliedFact,
} from '../types';

const JURISDICTION = 'United States — U.S. Consumer Product Safety Commission (CPSC)';

function normalizeToken(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function factMap(intake: IntakeHistory): Map<string, SuppliedFact> {
  const map = new Map<string, SuppliedFact>();
  for (const supplied of intake.facts) {
    map.set(supplied.key, supplied);
  }
  return map;
}

function valueOf(facts: Map<string, SuppliedFact>, key: string): FactValue {
  return facts.get(key)?.value ?? 'unknown';
}

function identitySectionIds(noticeId: string): string[] {
  const notice = getNoticeOrThrow(noticeId);
  return notice.sections
    .filter((section) => section.role === 'identity' || section.role === 'identity_and_scope')
    .map((section) => section.section_id);
}

function evaluateIdentity(noticeId: string, intake: IntakeHistory): IdentityEvaluation {
  const notice = getNoticeOrThrow(noticeId);
  const identityIds = identitySectionIds(noticeId);
  const identityText = notice.sections
    .filter((section) => identityIds.includes(section.section_id))
    .map((section) => normalizeToken(section.text))
    .join(' ');
  const passage = identityIds.length > 0 ? passageFor(notice, identityIds[0]) : null;

  const model = intake.model.trim();
  const serial = intake.serial.trim();
  const reasoning: string[] = [];

  let serialNote: string | null = null;
  if (serial) {
    serialNote =
      'A serial number was supplied. Serial ranges are not reconstructed from the retained flattened text, so serial-level identity is not established by this review.';
  }

  if (!model) {
    reasoning.push(
      'No model identifier was supplied. A similar brand name is not sufficient to confirm product identity.',
    );
    return {
      status: 'not_supplied',
      supplied_model: '',
      supplied_serial: serial,
      reasoning,
      passage,
      serial_note: serialNote,
    };
  }

  const normalizedModel = normalizeToken(model);
  const matched = normalizedModel.length >= 4 && identityText.includes(normalizedModel);

  if (matched) {
    reasoning.push(
      `Supplied model “${model}” appears in the notice identity text (character-for-character match after normalising case and separators).`,
    );
    return {
      status: 'confirmed',
      supplied_model: model,
      supplied_serial: serial,
      reasoning,
      passage,
      serial_note: serialNote,
    };
  }

  reasoning.push(
    `Supplied model “${model}” was not found in the notice identity text. Identity remains unconfirmed; it is not treated as an exclusion.`,
  );
  return {
    status: 'unconfirmed',
    supplied_model: model,
    supplied_serial: serial,
    reasoning,
    passage,
    serial_note: serialNote,
  };
}

function evaluateProposition(
  condition: NoticeCondition,
  identity: IdentityEvaluation,
  facts: Map<string, SuppliedFact>,
): PropositionResult {
  const notice = getNoticeOrThrow(condition.notice_id);
  const passage = passageFor(notice, condition.section_id);
  if (!passage) {
    throw new Error(`Condition ${condition.id} cites a missing section ${condition.section_id}`);
  }
  const supporting = condition.supporting_section_ids
    .map((sectionId) => passageFor(notice, sectionId))
    .filter((candidate): candidate is CitedPassage => candidate !== null);

  const reasoning: string[] = [];
  const missing: string[] = [];
  let status: PropositionStatus = 'unresolved';

  // 1. An explicit source exclusion supplied as holding contradicts the proposition.
  const triggeredExclusions = condition.exclusion_keys.filter(
    (key) => valueOf(facts, key) === 'yes',
  );
  if (triggeredExclusions.length > 0) {
    status = 'contradicted';
    for (const key of triggeredExclusions) {
      reasoning.push(
        `Supplied fact “${factLabel(key)}” is a source exclusion: the notice states this does not satisfy the remedy.`,
      );
    }
    return {
      condition_id: condition.id,
      question: condition.question,
      status,
      reasoning,
      missing,
      passage,
      supporting_passages: supporting,
      scope: condition.scope,
      exclusion: condition.exclusion,
    };
  }

  // 2. Required facts, evaluated in a stable order.
  let allRequirementsHold = condition.requirements.length > 0;
  let anyRequirementAbsent = false;

  for (const requirement of condition.requirements) {
    const value = valueOf(facts, requirement.key);
    const supplied = facts.get(requirement.key);
    const evidence = supplied ? supplied.evidence : null;

    if (value === 'yes') {
      reasoning.push(
        `Required fact satisfied: ${requirement.label}${evidence ? ` (${evidence.replace(/_/g, ' ')})` : ''}.`,
      );
    } else if (value === 'no') {
      anyRequirementAbsent = true;
      allRequirementsHold = false;
      reasoning.push(
        `Required fact explicitly not met: ${requirement.label} (supplied as “no”).`,
      );
    } else {
      allRequirementsHold = false;
      missing.push(requirement.label);
      reasoning.push(
        `Required fact not established: ${requirement.label} — no value supplied (treated as unknown, not as false).`,
      );
    }
  }

  // 3. Identity is a precondition, never an assumption.
  const identityBlocks =
    condition.identity_required && identity.status !== 'confirmed';

  if (identityBlocks) {
    status = 'unresolved';
    reasoning.push(
      identity.status === 'not_supplied'
        ? 'Product identity was not supplied, so the condition cannot be applied to this unit.'
        : `Product identity is ${identity.status}, so the condition is not applied.`,
    );
    return {
      condition_id: condition.id,
      question: condition.question,
      status,
      reasoning,
      missing,
      passage,
      supporting_passages: supporting,
      scope: condition.scope,
      exclusion: condition.exclusion,
    };
  }

  if (anyRequirementAbsent) {
    status = 'contradicted';
  } else if (allRequirementsHold) {
    status = 'supported';
    if (condition.requirements.length === 0) {
      reasoning.push('No additional facts are required by this condition.');
    }
  } else {
    status = 'unresolved';
  }

  return {
    condition_id: condition.id,
    question: condition.question,
    status,
    reasoning,
    missing,
    passage,
    supporting_passages: supporting,
    scope: condition.scope,
    exclusion: condition.exclusion,
  };
}

function evaluateSourceConsistency(demoCase: DemoCase | null): SourceConsistencyEvaluation {
  if (demoCase?.source_variants) {
    return {
      status: 'disagree',
      summary:
        'A structured-API instruction and the retained official page give materially different instructions. Both are shown; the review is blocked until a human resolves the disagreement.',
      api_instruction: demoCase.source_variants.api_instruction,
      page_instruction: demoCase.source_variants.page_instruction,
      api_provenance: demoCase.source_variants.api_provenance,
      page_provenance: demoCase.source_variants.page_provenance,
      blocks_review: true,
    };
  }
  return {
    status: 'not_checked',
    summary:
      'Structured API and official webpage were not compared in this review. The interface demo holds no recorded API response; the retained page is the only source shown, and its current status is not checked.',
    api_instruction: null,
    page_instruction: null,
    api_provenance: null,
    page_provenance: null,
    blocks_review: false,
  };
}

function buildWarnings(
  condition: NoticeCondition,
  identity: IdentityEvaluation,
  proposition: PropositionResult,
  consistency: SourceConsistencyEvaluation,
): ReviewWarning[] {
  const warnings: ReviewWarning[] = [];

  warnings.push({
    code: 'inference_unavailable',
    severity: 'info',
    message:
      'No inference service is connected. This interface demo shows the deterministic rules-only result; no model score is shown or implied.',
  });

  if (consistency.blocks_review) {
    warnings.push({
      code: 'source_disagreement',
      severity: 'blocking',
      message:
        'Structured API and official webpage disagree. Human resolution is required before the outcome is relied on.',
    });
  }

  if (identity.status !== 'confirmed') {
    warnings.push({
      code: 'identity_not_confirmed',
      severity: 'attention',
      message:
        'Product identity is not confirmed, so the condition was not applied to a specific unit.',
    });
  }

  if (identity.serial_note) {
    warnings.push({
      code: 'serial_not_established',
      severity: 'attention',
      message: identity.serial_note,
    });
  }

  const unconfirmed = condition.requirements.filter((requirement) =>
    proposition.missing.includes(requirement.label),
  );
  if (unconfirmed.length > 0) {
    warnings.push({
      code: 'missing_facts',
      severity: 'attention',
      message: `${unconfirmed.length} required fact${unconfirmed.length === 1 ? '' : 's'} not established.`,
    });
  }

  return warnings;
}

function buildFollowUps(
  identity: IdentityEvaluation,
  proposition: PropositionResult,
): string[] {
  const questions: string[] = [];
  if (identity.status === 'not_supplied') {
    questions.push('What is the exact model identifier printed on the unit?');
    questions.push('Where is the model or serial label located on this unit?');
  } else if (identity.status === 'unconfirmed') {
    questions.push(
      `Where did “${identity.supplied_model}” come from, and where is it printed on the unit or its packaging?`,
    );
  }
  if (identity.supplied_serial) {
    questions.push(
      'Can a photograph of the serial label be supplied so serial-level identity can be transcribed from the official structured page?',
    );
  }
  for (const label of proposition.missing) {
    questions.push(`Can documented evidence be supplied for: ${label}?`);
  }
  if (proposition.status === 'contradicted') {
    questions.push(
      'Does the reviewer agree the supplied facts conflict with the quoted source condition?',
    );
  }
  return questions;
}

export interface RunReviewInput {
  noticeId: string;
  condition: NoticeCondition;
  intake: IntakeHistory;
  caseLabel?: string | null;
  reviewId: string;
  inputRevision: number;
  demoCase?: DemoCase | null;
}

export function runReview(input: RunReviewInput): ReviewOutcome {
  const startedAt =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

  const notice = getNoticeOrThrow(input.noticeId);
  const facts = factMap(input.intake);
  const demoCase = input.demoCase ?? null;

  const identity = evaluateIdentity(input.noticeId, input.intake);
  const proposition = evaluateProposition(input.condition, identity, facts);
  const sourceConsistency = evaluateSourceConsistency(demoCase);
  const warnings = buildWarnings(input.condition, identity, proposition, sourceConsistency);
  const followUps = buildFollowUps(identity, proposition);

  const finishedAt =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

  return {
    review_id: input.reviewId,
    input_revision: input.inputRevision,
    created_at_utc: new Date().toISOString(),
    notice: summarize(notice),
    case_label: input.caseLabel ?? null,
    fixture_status: demoCase?.fixture_status ?? 'reviewer-supplied history',
    identity,
    proposition,
    source_consistency: sourceConsistency,
    warnings,
    follow_up_questions: followUps,
    inference: {
      available: false,
      reason:
        'Interface demo: the LinuxONE inference service is not connected, so no passage ranking or claim score is produced.',
      model_revision: null,
    },
    rule_baseline:
      'Deterministic notice-condition check over the retained, fingerprinted notice sections. Rules only; no model score.',
    elapsed_ms: Math.round((finishedAt - startedAt) * 1000) / 1000,
    obsolete: false,
  };
}

export function buildReceipt(
  outcome: ReviewOutcome,
  intake: IntakeHistory,
  caseLabel: string | null,
): ReviewReceipt {
  const cited = new Map<string, ReviewReceipt['cited_fingerprints'][number]>();
  const addPassage = (passage: CitedPassage | null) => {
    if (!passage) return;
    cited.set(passage.section_id, {
      section_id: passage.section_id,
      section_sha256: passage.section_sha256,
      source_sha256: passage.source_sha256,
      char_start: passage.char_start,
      char_end_exclusive: passage.char_end_exclusive,
    });
  };
  addPassage(outcome.proposition.passage);
  for (const passage of outcome.proposition.supporting_passages) addPassage(passage);
  addPassage(outcome.identity.passage);

  return {
    review_id: outcome.review_id,
    input_revision: outcome.input_revision,
    created_at_utc: outcome.created_at_utc,
    notice: outcome.notice,
    case_label: caseLabel,
    fixture_status: outcome.fixture_status,
    jurisdiction: JURISDICTION,
    intake,
    outcome,
    cited_fingerprints: Array.from(cited.values()),
    model_revision: outcome.inference.model_revision,
    environment: 'application/frontend — interface demo (rules-only, no inference service attached)',
    reviewer_notes: intake.reviewer_notes,
  };
}

export { JURISDICTION };

export function makeReviewId(): string {
  const random = Math.random().toString(16).slice(2, 10);
  return `rev_${Date.now().toString(36)}_${random}`;
}
