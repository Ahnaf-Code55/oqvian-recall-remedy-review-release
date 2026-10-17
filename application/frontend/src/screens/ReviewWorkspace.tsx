import { useMemo } from 'react';
import type { ReviewOutcome, NoticeCondition, IntakeHistory, FactValue, EvidenceClass, NoticeSummary } from '../types';
import type { BackendCase, CasesResponse, HealthResponse } from '../api/contract';
import type { BackendReceipt } from '../api/contract';
import { PassageCard } from '../components/PassageCard';
import { StatusChip } from '../components/StatusChip';
import { Banner } from '../components/Banner';
import {
  consistencyLabel,
  consistencyTone,
  evidenceHint,
  evidenceLabel,
  identityLabel,
  identityTone,
  propositionLabel,
  propositionShort,
  propositionTone,
  severityLabel,
  severityTone,
} from '../ui/labels';

interface ReviewWorkspaceProps {
  notices: NoticeSummary[];
  notice: NoticeSummary | null;
  conditions: NoticeCondition[];
  condition: NoticeCondition;
  intake: IntakeHistory;
  demoCaseId: string | null;
  demoCases: CasesResponse['cases'];
  outcome: ReviewOutcome | null;
  obsolete: boolean;
  running: boolean;
  error: string | null;
  health: HealthResponse | null;
  liveReceipt?: BackendReceipt | null;
  liveObsolete?: boolean;
  liveMode?: boolean;
  onLiveExport?: (reviewId: string) => void;
  liveCase?: BackendCase | null;
  onSelectNotice: (cpscId: string) => void;
  onSelectCondition: (conditionId: string) => void;
  onIntakeChange: (patch: Partial<IntakeHistory>) => void;
  onFactChange: (key: string, value: FactValue, evidence: EvidenceClass) => void;
  onSelectDemoCase: (caseId: string | null) => void;
  onRun: () => void;
}

const FACT_VALUES: Array<{ value: FactValue; label: string }> = [
  { value: 'yes', label: 'Present / yes' },
  { value: 'no', label: 'Absent / no' },
  { value: 'unknown', label: 'Not established' },
];

const EVALUATION_ORDER: EvidenceClass[] = [
  'observed_present',
  'observed_absent',
  'constructed_fixture',
  'not_checked',
  'owner_statement',
  'third_party_confirmation',
];

function factValue(intake: IntakeHistory, key: string): FactValue {
  return intake.facts.find((fact) => fact.key === key)?.value ?? 'unknown';
}

function factEvidence(intake: IntakeHistory, key: string): EvidenceClass {
  return intake.facts.find((fact) => fact.key === key)?.evidence ?? 'not_checked';
}

export function ReviewWorkspace(props: ReviewWorkspaceProps) {
  const {
    notices,
    notice,
    conditions,
    condition,
    intake,
    demoCaseId,
    demoCases,
    outcome,
    obsolete,
    running,
    error,
    health,
    liveReceipt = null,
    liveObsolete = false,
    liveMode = false,
    onLiveExport,
    liveCase = null,
    onSelectNotice,
    onSelectCondition,
    onIntakeChange,
    onFactChange,
    onSelectDemoCase,
    onRun,
  } = props;

  const factKeys = useMemo(() => {
    if (liveMode && liveCase) {
      const liveKeys = new Set(['prior_repair_claim', 'kit_received', 'kit_installed']);
      return Object.keys(liveCase.history_template).filter((key) => liveKeys.has(key));
    }
    const keys: string[] = [];
    const push = (key: string) => {
      if (!keys.includes(key)) keys.push(key);
    };
    condition.requirements.forEach((requirement) => push(requirement.key));
    condition.exclusion_keys.forEach(push);
    if (keys.includes('kit_received') || keys.includes('kit_installed')) push('kit_dispatched');
    return keys;
  }, [condition, liveMode, liveCase]);

  const requirementLabels = new Map(
    condition.requirements.map((requirement) => [requirement.key, requirement.label]),
  );

  const activeDemoCase = demoCaseId
    ? demoCases.find((fixture) => fixture.id === demoCaseId) ?? null
    : null;

  return (
    <div className="workspace">
      <aside className="panel panel--inputs" aria-label="Product and history inputs">
        <div className="panel__head">
          <h2>Inputs</h2>
          <p className="panel__lede">
            Identity is never assumed. A received kit is not an installed kit, and dispatch is
            not receipt.
          </p>
        </div>

        <label className="field">
          <span className="field__label">Notice family</span>
          <select
            className="input"
            value={notice?.cpsc_id ?? ''}
            onChange={(event) => onSelectNotice(event.target.value)}
          >
            {liveMode && notices.length === 0 && <option value="">Backend notices unavailable</option>}
            {notices.map((candidate) => (
              <option key={candidate.cpsc_id} value={candidate.cpsc_id}>
                CPSC {candidate.cpsc_id} — {candidate.product}
              </option>
            ))}
          </select>
        </label>

        {!liveMode && <label className="field">
          <span className="field__label">Review condition</span>
          <select
            className="input"
            value={condition.id}
            onChange={(event) => onSelectCondition(event.target.value)}
          >
            {conditions.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.question}
              </option>
            ))}
          </select>
        </label>}

        {!liveMode && <label className="field">
          <span className="field__label">Load a demonstration fixture</span>
          <select
            className="input"
            value={demoCaseId ?? ''}
            onChange={(event) => onSelectDemoCase(event.target.value || null)}
          >
            <option value="">— reviewer-supplied history —</option>
            {demoCases.map((fixture) => (
              <option key={fixture.id} value={fixture.id}>
                {fixture.label}
              </option>
            ))}
          </select>
        </label>}

        {!liveMode && activeDemoCase && (
          <p className="inline-note">
            <span className="tag tag--fixture">constructed fixture</span> {activeDemoCase.summary}
          </p>
        )}

        <fieldset className="fieldset">
          <legend>Identity</legend>
          <label className="field">
            <span className="field__label">Model identifier</span>
            <input
              className="input"
              value={intake.model}
              placeholder="e.g. WM25030DMN"
              onChange={(event) => onIntakeChange({ model: event.target.value })}
            />
          </label>
          <label className="field">
            <span className="field__label">Serial number (optional)</span>
            <input
              className="input"
              value={intake.serial}
              placeholder="Not reconstructed from flattened text"
              onChange={(event) => onIntakeChange({ serial: event.target.value })}
            />
          </label>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Prior action</legend>
          <label className="field">
            <span className="field__label">Repair or replacement description</span>
            <textarea
              className="input"
              rows={3}
              value={intake.action_description}
              onChange={(event) => onIntakeChange({ action_description: event.target.value })}
            />
          </label>
          <label className="field">
            <span className="field__label">Date of the prior action (if known)</span>
            <input
              className="input"
              value={intake.action_date}
              placeholder="YYYY-MM-DD or free text"
              onChange={(event) => onIntakeChange({ action_date: event.target.value })}
            />
          </label>
          <label className="field">
            <span className="field__label">Kit or component</span>
            <input
              className="input"
              value={intake.kit_or_component}
              onChange={(event) => onIntakeChange({ kit_or_component: event.target.value })}
            />
          </label>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Facts this condition turns on</legend>
              {factKeys.map((key) => (
            <div className="fact" key={key}>
              <div className="fact__label">
                {liveCase?.history_field_labels?.[key] ?? requirementLabels.get(key) ?? key.replace(/_/g, ' ')}
              </div>
              <div className="fact__controls">
                <label className="field field--tight">
                  <span className="field__label">Value</span>
                  <select
                    className="input"
                    value={factValue(intake, key)}
                    onChange={(event) =>
                      onFactChange(
                        key,
                        event.target.value as FactValue,
                        factEvidence(intake, key),
                      )
                    }
                  >
                    {FACT_VALUES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field field--tight">
                  <span className="field__label">Evidence class</span>
                  <select
                    className="input"
                    value={factEvidence(intake, key)}
                    onChange={(event) =>
                      onFactChange(
                        key,
                        factValue(intake, key),
                        event.target.value as EvidenceClass,
                      )
                    }
                  >
                    {EVALUATION_ORDER.map((option) => (
                      <option key={option} value={option}>
                        {evidenceLabel[option]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="fact__hint">{evidenceHint[factEvidence(intake, key)]}</p>
            </div>
          ))}
        </fieldset>

        <label className="field">
          <span className="field__label">Reviewer notes</span>
          <textarea
            className="input"
            rows={2}
            value={intake.reviewer_notes}
            onChange={(event) => onIntakeChange({ reviewer_notes: event.target.value })}
          />
        </label>

        <div className="run-row">
          <button
            type="button"
            className="btn btn--primary btn--lg"
            onClick={onRun}
            disabled={running}
          >
            {running ? 'Running review…' : obsolete ? 'Re-run review' : 'Run review'}
          </button>
          {obsolete && <span className="hint hint--warn">Inputs changed</span>}
        </div>
      </aside>

      <section className="panel panel--result" aria-live="polite" aria-label="Review result">
        <div className="panel__head">
          <h2>Review question and result</h2>
          <p className="panel__lede">{liveCase?.review_question ?? condition.question}</p>
        </div>

        {error && (
          <Banner tone="danger" title="Review error" role="alert">
            {error}
          </Banner>
        )}

        {running && <p className="loading">{liveMode ? 'Submitting the review to the protected backend…' : 'Running the deterministic condition check…'}</p>}

        {liveReceipt && (
          <LiveReceiptPanel
            receipt={liveReceipt}
            obsolete={liveObsolete}
            onExport={onLiveExport}
          />
        )}

        {!outcome && !liveReceipt && !running && (
          <Banner tone="neutral" title="No result yet">
            Supply identity and history facts, then run the review. The result attaches to this
            single proposition, not to the product as a whole.
          </Banner>
        )}

        {outcome && (
          <>
            {obsolete && (
              <Banner tone="warn" title="Result obsolete — inputs changed" role="alert">
                The result below was produced from revision {outcome.input_revision}. It no
                longer matches the current inputs and must not be relied on until a new review
                completes. The earlier receipt is preserved separately.
              </Banner>
            )}

            <div key={outcome.review_id} className={`result ${obsolete ? 'result--obsolete' : ''}`}>
              <div className="result__headline">
                <StatusChip tone={propositionTone[outcome.proposition.status]}>
                  {propositionLabel[outcome.proposition.status]}
                </StatusChip>
                <span className="result__context">
                  CPSC {outcome.notice.cpsc_id} · {outcome.notice.recall_date} · snapshot{' '}
                  {outcome.notice.retrieved_at_utc.slice(0, 10)} · US CPSC jurisdiction
                </span>
              </div>

              <section className="block">
                <h3>Identity</h3>
                <StatusChip tone={identityTone[outcome.identity.status]}>
                  {identityLabel[outcome.identity.status]}
                </StatusChip>
                <ul className="reasons">
                  {outcome.identity.reasoning.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </section>

              <section className="block">
                <h3>Notice condition</h3>
                <div className="kv">
                  <span className="kv__key">Scope</span>
                  <span className="kv__value">{outcome.proposition.scope}</span>
                </div>
                {outcome.proposition.exclusion && (
                  <div className="kv">
                    <span className="kv__key">Explicit exclusion</span>
                    <span className="kv__value">{outcome.proposition.exclusion}</span>
                  </div>
                )}
                <ul className="reasons">
                  {outcome.proposition.reasoning.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                {outcome.proposition.missing.length > 0 && (
                  <div className="missing">
                    <h4>Missing or ambiguous facts</h4>
                    <ul>
                      {outcome.proposition.missing.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>

              <section className="block">
                <h3>Source consistency</h3>
                <StatusChip tone={consistencyTone[outcome.source_consistency.status]}>
                  {consistencyLabel[outcome.source_consistency.status]}
                </StatusChip>
                <p className="block__note">{outcome.source_consistency.summary}</p>
              </section>

              <section className="block">
                <h3>Alerts</h3>
                <ul className="alert-list">
                  {outcome.warnings.map((warning) => (
                    <li className={`alert alert--${severityTone[warning.severity]}`} key={warning.code}>
                      <span className="alert__kind">{severityLabel[warning.severity]}</span>
                      <span>{warning.message}</span>
                    </li>
                  ))}
                </ul>
              </section>

              {outcome.follow_up_questions.length > 0 && (
                <section className="block">
                  <h3>Required follow-up</h3>
                  <ol className="questions">
                    {outcome.follow_up_questions.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ol>
                </section>
              )}

              <section className="block block--meta">
                <h3>Execution</h3>
                <div className="kv">
                  <span className="kv__key">Rule baseline</span>
                  <span className="kv__value">{outcome.rule_baseline}</span>
                </div>
                <div className="kv">
                  <span className="kv__key">Inference</span>
                  <span className="kv__value">
                    {outcome.inference.available ? 'available' : 'unavailable'} —{' '}
                    {outcome.inference.reason}
                  </span>
                </div>
                <div className="kv">
                  <span className="kv__key">Model revision</span>
                  <span className="kv__value">
                    {outcome.inference.model_revision ?? 'none loaded'}
                  </span>
                </div>
                <div className="kv">
                  <span className="kv__key">Elapsed</span>
                  <span className="kv__value">{outcome.elapsed_ms} ms (local rules check)</span>
                </div>
                <div className="kv">
                  <span className="kv__key">Review id</span>
                  <span className="kv__value mono">{outcome.review_id}</span>
                </div>
                <div className="kv">
                  <span className="kv__key">Result label</span>
                  <span className="kv__value">
                    {propositionShort[outcome.proposition.status]} — attaches to this proposition
                    only. Not a product safety rating, refund entitlement or permission to resell.
                  </span>
                </div>
                <div className="kv">
                  <span className="kv__key">Service</span>
                  <span className="kv__value">
                    {health?.service_kind === 'live' ? 'live service' : 'interface demo (local)'}
                  </span>
                </div>
              </section>
            </div>
          </>
        )}
      </section>

      <aside className="panel panel--evidence" aria-label="Exact official passages">
        <div className="panel__head">
          <h2>Exact official passages</h2>
          <p className="panel__lede">
            Each cited passage is shown with its section id, character offsets and fingerprints.
          </p>
        </div>
        {liveReceipt ? (
          <div className="passage-stack" key={liveReceipt.review_id}>
            {liveReceipt.passages.map((passage) => (
              <article className="passage" key={passage.section_id}>
                <div className="passage__head">
                  <strong>{passage.section_id}</strong>
                  {passage.required_for_case && <span className="tag tag--eligible">required for case</span>}
                </div>
                <p>{passage.title} · {passage.section_label} · {passage.section_role}</p>
                <p>Characters {passage.start_offset}–{passage.end_offset}</p>
                <p className="mono">Section SHA-256: {passage.section_sha256}</p>
                <p className="mono">Source SHA-256: {passage.source_sha256}</p>
                <p>Retrieved: {passage.source_retrieved_at_utc} · fingerprints verified: source {passage.source_hash_verified ? 'yes' : 'no'}, section {passage.section_hash_verified ? 'yes' : 'no'}</p>
                <a href={passage.url} target="_blank" rel="noreferrer noopener">{passage.url}</a>
                <blockquote>{passage.text}</blockquote>
              </article>
            ))}
          </div>
        ) : outcome ? (
          <div className="passage-stack" key={outcome.review_id}>
            <PassageCard passage={outcome.proposition.passage} caption="cited by the condition" />
            {outcome.proposition.supporting_passages.map((passage) => (
              <PassageCard
                key={passage.section_id}
                passage={passage}
                caption="scope or exclusion"
                compact
              />
            ))}
            {outcome.identity.passage && (
              <PassageCard passage={outcome.identity.passage} caption="identity text" compact />
            )}
          </div>
        ) : (
          <p className="empty">
            Run a review to see the exact passages that support or contradict the claim.
          </p>
        )}
      </aside>
    </div>
  );
}

function LiveReceiptPanel({
  receipt,
  obsolete,
  onExport,
}: {
  receipt: BackendReceipt;
  obsolete: boolean;
  onExport?: (reviewId: string) => void;
}) {
  const tone = (status: string): 'ok' | 'danger' | 'warn' =>
    status === 'Supported' ? 'ok' : status === 'Contradicted' ? 'danger' : 'warn';

  return (
    <section className="live-receipt" aria-label="Backend review receipt">
      <div className="result__headline">
        <strong>Authenticated backend receipt {receipt.schema_version}</strong>
        <span className="mono">{receipt.review_id}</span>
        {onExport && !obsolete && <button className="btn btn--ghost" type="button" onClick={() => onExport(receipt.review_id)}>Export receipt</button>}
      </div>
      {obsolete && <Banner tone="warn" title="Result obsolete — inputs changed" role="alert">This backend receipt belongs to an earlier input revision. Run a new review before relying on it.</Banner>}
      <p><strong>Question:</strong> {receipt.question}</p>
      <p><strong>Identity:</strong> {receipt.identity_status}</p>
      <p><strong>Source consistency:</strong> {receipt.source_consistency.status}{receipt.source_consistency.note ? ' — ' + receipt.source_consistency.note : ''}</p>
      {receipt.source_consistency.conflicts?.map((conflict, index) => (
        <details className="disclosure" key={index} open>
          <summary>{String(conflict.source ?? 'Conflicting source ' + (index + 1))}</summary>
          <p>{String(conflict.text ?? '')}</p>
          <p className="mono">SHA-256: {String(conflict.source_sha256 ?? conflict.record_sha256 ?? 'not supplied')}</p>
          <p>{String(conflict.url ?? conflict.record_url ?? '')}</p>
        </details>
      ))}
      <h3>Every returned proposition</h3>
      {receipt.propositions.map((proposition, index) => (
        <article className="block" key={index}>
          <StatusChip tone={tone(proposition.status)}>{proposition.status}</StatusChip>
          <h4>{proposition.statement}</h4>
          {proposition.rationale && <p>{proposition.rationale}</p>}
          {!!proposition.evidence?.length && <ul className="reasons">{proposition.evidence.map((item, i) => <li key={`${item.section_id}-${i}`}><blockquote>{item.text}</blockquote><small className="mono">{item.section_id} · section SHA-256: {item.section_sha256} · source SHA-256: {item.source_sha256} · <a href={item.url} target="_blank" rel="noreferrer noopener">official source</a></small></li>)}</ul>}
          {!!proposition.unknowns?.length && <div className="missing"><h4>Unknowns</h4><ul>{proposition.unknowns.map((item, i) => <li key={i}>{item}</li>)}</ul></div>}
        </article>
      ))}
      <h3>Effective supplied facts</h3>
      <pre className="json">{JSON.stringify(receipt.input_provenance.effective_condition_facts ?? {}, null, 2)}</pre>
      <h3>Inference</h3>
      <p><strong>Status:</strong> {receipt.inference.status} · <strong>Model:</strong> {receipt.inference.model_id ?? 'not reported'} · <strong>Revision:</strong> {receipt.inference.model_revision ?? 'not reported'}</p>
      {receipt.inference.elapsed_seconds != null && <p>Inference time: {receipt.inference.elapsed_seconds} seconds</p>}
      {receipt.inference.note && <p>{receipt.inference.note}</p>}
      {!!receipt.inference.scores?.length && <pre className="json">{JSON.stringify(receipt.inference.scores, null, 2)}</pre>}
      <p><strong>Receipt time:</strong> {receipt.created_at_utc} · <strong>Elapsed:</strong> {receipt.elapsed_ms} ms · <strong>Input revision:</strong> {receipt.input_revision}</p>
      <h3>Limitations</h3>
      <ul className="reasons">{receipt.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul>
      <details className="disclosure"><summary>Complete schema 1.1 receipt JSON</summary><pre className="json">{JSON.stringify(receipt, null, 2)}</pre></details>
    </section>
  );
}
