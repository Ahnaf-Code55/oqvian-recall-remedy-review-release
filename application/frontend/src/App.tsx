import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { conditions as allConditions, conditionsForNotice } from './data/conditions';
import { getNoticeOrThrow, listSummaries, summarize } from './data/corpus';
import { demoCases } from './data/cases';
import * as api from './api/client';
import type { BackendCase, BackendHealthResponse, BackendNotice, BackendReceipt, HealthResponse, StoredReview } from './api/contract';
import type { EvidenceClass, FactValue, IntakeHistory } from './types';
import type { ReviewOutcome } from './types';
import { CaseLibrary } from './screens/CaseLibrary';
import { ReviewWorkspace } from './screens/ReviewWorkspace';
import { SourceComparison } from './screens/SourceComparison';
import { ReviewReceipt } from './screens/ReviewReceipt';
import { LiveReceiptDetail, LiveSourceComparison } from './screens/LiveViews';
import { autoplayRequested, startAutoplay } from './ui/autoplay';
import './styles.css';

type Screen = 'library' | 'review' | 'sources' | 'receipt';

const NAV: Array<{ id: Screen; label: string }> = [
  { id: 'library', label: 'Case library' },
  { id: 'review', label: 'Review workspace' },
  { id: 'sources', label: 'Source comparison' },
  { id: 'receipt', label: 'Review receipt' },
];

const DEFAULT_NOTICE = '10896';
const inputGeneration = { value: 0 };
const requestGeneration = { value: 0 };

function liveCaseForNotice(cases: BackendCase[], noticeId: string): BackendCase | undefined {
  return cases.find((candidate) => candidate.notice_ids.includes(noticeId));
}

function mapLiveHistory(intake: IntakeHistory, noticeId: string): Record<string, string | boolean | Record<string, string>> {
  const history: Record<string, string | boolean | Record<string, string>> = {};
  const provenance: Record<string, string> = {};
  const facts = new Map(intake.facts.map((fact) => [fact.key, fact]));
  const evidenceName: Record<EvidenceClass, string> = {
    observed_present: 'observed_present',
    observed_absent: 'observed_absent',
    constructed_fixture: 'constructed_fixture',
    not_checked: 'not_checked',
    owner_statement: 'owner_statement',
    third_party_confirmation: 'third_party_confirmation',
  };
  const addFact = (target: string, sourceKeys: string[]) => {
    const fact = sourceKeys.map((key) => facts.get(key)).find((value) => value !== undefined);
    if (!fact || fact.value === 'unknown') return;
    history[target] = fact.value === 'yes';
    provenance[target] = evidenceName[fact.evidence];
  };
  if (intake.model.trim()) {
    history.exact_model = intake.model.trim();
    provenance.exact_model = 'not_checked';
  }
  if (intake.serial.trim()) {
    history.serial = intake.serial.trim();
    provenance.serial = 'not_checked';
  }
  if (intake.action_date.trim()) {
    history.prior_action_date = intake.action_date.trim();
    provenance.prior_action_date = 'not_checked';
  }
  addFact('prior_repair_claim', noticeId === '9982'
    ? ['prior_2018_repair', 'prior_repair_claim']
    : ['previously_repaired', 'prior_repair_claim']);
  addFact('kit_received', ['kit_received']);
  addFact('kit_installed', noticeId === '9982'
    ? ['new_shroud_kit_attached', 'kit_installed']
    : ['kit_installed']);
  // The backend treats unchecked or unprovenanced values as unknown. Keep
  // provenance labels explicit and never translate "unknown" into "no".
  if (history.exact_model) provenance.exact_model = 'not_checked';
  if (history.serial) provenance.serial = 'not_checked';
  if (history.prior_action_date) provenance.prior_action_date = 'not_checked';
  history.fact_provenance = provenance;
  return history;
}

function blankIntake(): IntakeHistory {
  return {
    action_description: '',
    action_date: '',
    kit_or_component: '',
    model: '',
    serial: '',
    facts: [],
    reviewer_notes: '',
  };
}

function download(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function App() {
  const summaries = useMemo(() => listSummaries(), []);
  const [screen, setScreen] = useState<Screen>('library');
  const [noticeId, setNoticeId] = useState<string>(DEFAULT_NOTICE);
  const [conditionId, setConditionId] = useState<string>(
    conditionsForNotice(DEFAULT_NOTICE)[0]?.id ?? allConditions[0].id,
  );
  const [intake, setIntake] = useState<IntakeHistory>(blankIntake);
  const [demoCaseId, setDemoCaseId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ReviewOutcome | null>(null);
  const [obsolete, setObsolete] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [backendHealth, setBackendHealth] = useState<BackendHealthResponse | null>(null);
  const [backendCases, setBackendCases] = useState<BackendCase[]>([]);
  const [backendNoticeIds, setBackendNoticeIds] = useState<string[]>([]);
  const [backendNotices, setBackendNotices] = useState<BackendNotice[]>([]);
  const [liveReceipt, setLiveReceipt] = useState<BackendReceipt | null>(null);
  const [liveObsolete, setLiveObsolete] = useState(false);
  const [receipts, setReceipts] = useState<StoredReview[]>(() => api.listLocalReviews());
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (api.serviceMode === 'live') {
      Promise.all([api.backendHealth(), api.backendCases(), api.backendNotices()])
        .then(([status, casesResponse, noticesResponse]) => {
          setBackendHealth(status);
          setBackendCases(casesResponse.cases);
          setBackendNotices(noticesResponse.notices);
          setBackendNoticeIds(noticesResponse.notices.map((item) => item.cpsc_id));
        })
        .catch((caught) => setError(caught instanceof Error ? caught.message : String(caught)));
    } else {
      api.health().then(setHealth).catch(() => setHealth(null));
    }
  }, []);

  const notice = useMemo(() => summarize(getNoticeOrThrow(noticeId)), [noticeId]);
  const noticeConditions = useMemo(() => conditionsForNotice(noticeId), [noticeId]);
  const condition = useMemo(
    () => noticeConditions.find((candidate) => candidate.id === conditionId) ?? noticeConditions[0] ?? allConditions[0],
    [noticeConditions, conditionId],
  );

  const filteredNotices = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return summaries;
    return summaries.filter((summary) =>
      [summary.cpsc_id, summary.title, summary.product, summary.recall_date]
        .join(' ')
        .toLowerCase()
        .includes(trimmed),
    );
  }, [summaries, query]);

  const markChanged = useCallback(() => {
    inputGeneration.value += 1;
    setObsolete((previous) => previous || outcome !== null || liveReceipt !== null);
    if (liveReceipt) setLiveObsolete(true);
  }, [outcome, liveReceipt]);

  const openNotice = useCallback(
    (cpscId: string) => {
      inputGeneration.value += 1;
      setNoticeId(cpscId);
      setConditionId(conditionsForNotice(cpscId)[0]?.id ?? allConditions[0].id);
      setIntake(blankIntake());
      setDemoCaseId(null);
      setOutcome(null);
      setLiveReceipt(null);
      setLiveObsolete(false);
      setObsolete(false);
      setError(null);
      setScreen('review');
    },
    [],
  );

  const selectCondition = useCallback((nextConditionId: string) => {
    inputGeneration.value += 1;
    setConditionId(nextConditionId);
    setOutcome(null);
    setLiveReceipt(null);
    setLiveObsolete(false);
    setObsolete(false);
    setError(null);
  }, []);

  const loadFixture = useCallback((caseId: string) => {
    inputGeneration.value += 1;
    const fixture = demoCases.find((candidate) => candidate.id === caseId);
    if (!fixture) return;
    setNoticeId(fixture.notice_id);
    setConditionId(fixture.condition_id);
    setIntake({ ...blankIntake(), ...fixture.intake });
    setDemoCaseId(fixture.id);
    setOutcome(null);
    setLiveReceipt(null);
    setLiveObsolete(false);
    setObsolete(false);
    setError(null);
    setScreen('review');
  }, []);

  const handleIntakeChange = useCallback(
    (patch: Partial<IntakeHistory>) => {
      setIntake((previous) => ({ ...previous, ...patch }));
      markChanged();
    },
    [markChanged],
  );

  const handleFactChange = useCallback(
    (key: string, value: FactValue, evidence: EvidenceClass) => {
      setIntake((previous) => {
        const others = previous.facts.filter((fact) => fact.key !== key);
        return { ...previous, facts: [...others, { key, value, evidence }] };
      });
      markChanged();
    },
    [markChanged],
  );

  const handleSelectDemoCase = useCallback(
    (caseId: string | null) => {
      if (caseId === null) {
        setDemoCaseId(null);
        return;
      }
      loadFixture(caseId);
    },
    [loadFixture],
  );

  const runReview = useCallback(async () => {
    setRunning(true);
    setError(null);
    const nextRevision = revision + 1;
    const generationAtSubmit = inputGeneration.value;
    const requestId = ++requestGeneration.value;
    try {
      if (api.serviceMode === 'live') {
        const selectedCase = liveCaseForNotice(backendCases, noticeId);
        if (!selectedCase) {
          throw new Error('The protected backend has no configured case for this notice. Choose CPSC 974, 9982, or 10896.');
        }
        const receipt = await api.createBackendReview({
          case_id: selectedCase.case_id,
          history: mapLiveHistory(intake, noticeId),
          question: selectedCase.review_question || condition.question,
          input_revision: nextRevision,
        });
        if (requestId !== requestGeneration.value) return;
        setRevision(nextRevision);
        setLiveReceipt(receipt);
        setLiveObsolete(generationAtSubmit !== inputGeneration.value);
        setOutcome(null);
        setSelectedReceiptId(receipt.review_id);
        return;
      }
      const response = await api.createReview({
        notice_id: noticeId,
        condition_id: condition.id,
        intake,
        input_revision: nextRevision,
        demo_case_id: demoCaseId,
      });
      setRevision(nextRevision);
      setOutcome(response.outcome);
      setObsolete(false);
      setSelectedReceiptId(response.outcome.review_id);
      setReceipts(api.listLocalReviews());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRunning(false);
    }
  }, [revision, noticeId, condition.id, condition.question, intake, demoCaseId, backendCases]);

  // Demo video driver — see src/ui/autoplay.ts. It fires only when the page is
  // opened with `?autoplay`, and is a no-op in normal use. The ref is re-pointed
  // at the latest handlers on every render so the scripted take always calls the
  // current callbacks; the scheduled effect runs once and its cleanup cancels
  // steps that have not fired yet.
  const autoplayRef = useRef<{
    loadFixture: (caseId: string) => void;
    runReview: () => void;
    setScreen: (screen: Screen) => void;
  } | null>(null);

  useEffect(() => {
    autoplayRef.current = { loadFixture, runReview, setScreen };
  }, [loadFixture, runReview, setScreen]);

  useEffect(() => {
    if (!autoplayRequested()) return undefined;
    return startAutoplay({
      loadFixture: (caseId) => autoplayRef.current?.loadFixture(caseId),
      runReview: () => void autoplayRef.current?.runReview(),
      setScreen: (screen) => autoplayRef.current?.setScreen(screen),
    });
  }, []);

  const handleExport = useCallback(async (reviewId: string) => {
    try {
      const exported = api.serviceMode === 'live'
        ? await api.exportBackendReview(reviewId)
        : await api.exportReview(reviewId);
      download(exported.filename, exported.json);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, []);

  const handleSelectReceipt = useCallback(
    (reviewId: string) => {
      const entry = receipts.find((item) => item.outcome.review_id === reviewId) ?? null;
      setSelectedReceiptId(reviewId);
      if (entry) {
        setOutcome(entry.outcome);
        setNoticeId(entry.receipt.notice.cpsc_id);
        setConditionId(entry.outcome.proposition.condition_id);
        setIntake(entry.receipt.intake);
        // Restore the fixture linkage so a re-run from a restored receipt reproduces
        // the same outcome. Without this, fixture-only inputs such as a source
        // disagreement would silently disappear on the next run.
        const linkedFixture = demoCases.find(
          (fixture) => fixture.label === entry.receipt.case_label,
        );
        setDemoCaseId(linkedFixture?.id ?? null);
        setObsolete(false);
      }
    },
    [receipts],
  );

  const selectedReceipt =
    receipts.find((entry) => entry.outcome.review_id === selectedReceiptId) ?? null;
  const activeBackendCase = liveCaseForNotice(backendCases, noticeId) ?? null;
  const visibleNotices = api.serviceMode === 'live'
    ? summaries.filter((item) => backendNoticeIds.includes(item.cpsc_id)).map((item) => {
        const source = backendNotices.find((noticeItem) => noticeItem.cpsc_id === item.cpsc_id);
        return source ? {
          ...item,
          product: source.document_title,
          title: source.document_title,
          recall_date: source.publication_date,
          official_url: source.official_url,
          source_sha256: source.source_sha256,
          retrieved_at_utc: source.source_retrieved_at_utc,
          version_status: source.source_version_status,
          update_note: source.source_update_note,
        } : item;
      })
    : summaries;
  const libraryNotices = api.serviceMode === 'live'
    ? visibleNotices.filter((item) =>
        [item.cpsc_id, item.title, item.product, item.recall_date].join(' ').toLowerCase().includes(query.trim().toLowerCase()),
      )
    : filteredNotices;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__mark" aria-hidden="true">O</span>
          <span className="topbar__name">
            OQVIAN <span className="topbar__sub">Recall Remedy Review</span>
          </span>
        </div>

        <nav className="topbar__nav" aria-label="Screens">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={screen === item.id ? 'nav-btn nav-btn--active' : 'nav-btn'}
              aria-current={screen === item.id ? 'page' : undefined}
              onClick={() => setScreen(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="topbar__meta">
          {api.serviceMode === 'interface-demo' ? (
            <span
              className="mode-badge"
              title="Interface demo — local fixtures and a rules-only service; not the integrated backend."
            >
              Interface demo
            </span>
          ) : (
            <span className="mode-badge mode-badge--live">Protected live service · same origin</span>
          )}
        </div>
      </header>

      <div className="statusstrip" role="note">
        <span className="statusstrip__question">
          Does a claimed earlier repair or replacement answer the explicit conditions in a later
          official recall notice?
        </span>
        <span className="statusstrip__facts">
          <span><span className="statusstrip__key">Jurisdiction:</span> US CPSC</span>
          <span><span className="statusstrip__key">Snapshot:</span> {api.serviceMode === 'live' ? (backendNotices.find((item) => item.cpsc_id === noticeId)?.source_retrieved_at_utc.slice(0, 10) ?? 'not loaded') : notice.retrieved_at_utc.slice(0, 10)}</span>
          <span><span className="statusstrip__key">Source set:</span> {api.serviceMode === 'live' ? `${visibleNotices.length} qualified notices` : health ? `${health.corpus_sources} notices / ${health.corpus_sections} sections` : 'loading…'}</span>
          <span>
            <span className="statusstrip__key">Inference:</span>{' '}
            {api.serviceMode === 'live'
              ? backendHealth?.ai_status ?? 'checking protected service…'
              : health?.inference_available
                ? `available (${health.model_revision ?? 'unversioned'})`
                : 'unavailable — rules-only'}
          </span>
        </span>
      </div>

      <main className="main">
        {screen === 'library' && (
          <CaseLibrary
            notices={libraryNotices}
            total={libraryNotices.length}
            cases={api.serviceMode === 'live' ? [] : demoCases.map((fixture) => ({
              id: fixture.id,
              label: fixture.label,
              notice_id: fixture.notice_id,
              condition_id: fixture.condition_id,
              fixture_status: fixture.fixture_status,
              summary: fixture.summary,
              expected_question: fixture.expected_question,
            }))}
            query={query}
            onQuery={setQuery}
            onOpenNotice={openNotice}
            onLoadFixture={loadFixture}
            corpusSources={health?.corpus_sources ?? libraryNotices.length}
            corpusSections={health?.corpus_sections ?? 0}
            corpusSha={health?.corpus_sha256 ?? ''}
            liveMode={api.serviceMode === 'live'}
          />
        )}

        {screen === 'review' && (
          <ReviewWorkspace
            notices={visibleNotices}
            notice={api.serviceMode === 'live' ? visibleNotices.find((item) => item.cpsc_id === noticeId) ?? null : notice}
            conditions={noticeConditions}
            condition={condition}
            intake={intake}
            demoCaseId={demoCaseId}
            demoCases={demoCases.map((fixture) => ({
              id: fixture.id,
              label: fixture.label,
              notice_id: fixture.notice_id,
              condition_id: fixture.condition_id,
              fixture_status: fixture.fixture_status,
              summary: fixture.summary,
              expected_question: fixture.expected_question,
            }))}
            outcome={outcome}
            obsolete={obsolete}
            running={running}
            error={error}
            health={health}
            liveReceipt={liveReceipt}
            liveObsolete={liveObsolete}
            liveMode={api.serviceMode === 'live'}
            liveCase={activeBackendCase}
            onLiveExport={handleExport}
            onSelectNotice={openNotice}
            onSelectCondition={selectCondition}
            onIntakeChange={handleIntakeChange}
            onFactChange={handleFactChange}
            onSelectDemoCase={handleSelectDemoCase}
            onRun={runReview}
          />
        )}

        {screen === 'sources' && (
          api.serviceMode === 'live'
            ? <LiveSourceComparison receipt={liveReceipt} obsolete={liveObsolete} />
            : <SourceComparison noticeId={noticeId} outcome={outcome} />
        )}

        {screen === 'receipt' && (
          api.serviceMode === 'live'
            ? <LiveReceiptDetail receipt={liveReceipt} onExport={handleExport} obsolete={liveObsolete} />
            : <ReviewReceipt
                receipts={receipts}
                selected={selectedReceipt}
                onSelect={handleSelectReceipt}
                onExport={handleExport}
                onClear={() => {
                  api.clearLocalReviews();
                  setReceipts([]);
                  setSelectedReceiptId(null);
                }}
              />
        )}
      </main>

      <footer className="footbar">
        <span>
          CPSC text reproduced with credit and no implied endorsement. Results attach to a single
          proposition, never to a product safety rating, refund entitlement or permission to resell.
        </span>
        <span className="footbar__meta">
          {api.serviceMode === 'interface-demo'
            ? 'Interface demo — deterministic rules over retained, fingerprinted notice sections.'
            : api.apiBaseUrl ? `Protected live service at ${api.apiBaseUrl}` : 'Protected live service on this origin'}
        </span>
      </footer>
    </div>
  );
}

export default App;
