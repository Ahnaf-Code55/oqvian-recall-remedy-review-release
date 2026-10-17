import type { CasesResponse } from '../api/contract';
import type { NoticeSummary } from '../types';
import { formatSnapshotDate } from '../data/corpus';

interface CaseLibraryProps {
  notices: NoticeSummary[];
  total: number;
  cases: CasesResponse['cases'];
  query: string;
  onQuery: (value: string) => void;
  onOpenNotice: (cpscId: string) => void;
  onLoadFixture: (caseId: string) => void;
  corpusSources: number;
  corpusSections: number;
  corpusSha: string;
  liveMode?: boolean;
}

export function CaseLibrary({
  notices,
  total,
  cases,
  query,
  onQuery,
  onOpenNotice,
  onLoadFixture,
  corpusSources,
  corpusSections,
  corpusSha,
  liveMode = false,
}: CaseLibraryProps) {
  return (
    <div className="screen">
      <section className="pane">
        <div className="pane__head">
          <h2>Case library</h2>
          <p className="pane__lede">
            Retained official notice families, each with a snapshot date and a link to the
            source. Product identity stays unconfirmed until the reviewer supplies the model
            or serial facts.
          </p>
        </div>

        <div className="field-row">
          <label className="field field--grow">
              <span className="field__label">{liveMode ? 'Search configured backend notices' : 'Search the retained notice corpus'}</span>
            <input
              className="input"
              type="search"
              value={query}
              placeholder="Try “DR Power”, “Vitamix”, “furnace”, or a CPSC number"
              onChange={(event) => onQuery(event.target.value)}
            />
          </label>
        </div>
        <p className="register__count" aria-live="polite">
          <span className="mono">{total}</span> notice{total === 1 ? '' : 's'} shown ·{' '}
          <span className="mono">{corpusSources} / {corpusSections}</span> sources / sections
        </p>

        <div className="notice-grid">
          {notices.map((notice) => (
            <article className="notice-card" key={notice.cpsc_id}>
              <span className="notice-card__id">CPSC {notice.cpsc_id}</span>
              <header className="notice-card__head">
                <h3>{notice.product}</h3>
                <p className="notice-card__title">{notice.title}</p>
              </header>
              <dl className="notice-card__meta">
                <div>
                  <dt>Recall date</dt>
                  <dd>{notice.recall_date}</dd>
                </div>
                <div>
                  <dt>Remedy</dt>
                  <dd>{notice.remedy_type}</dd>
                </div>
                <div>
                  <dt>Units</dt>
                  <dd>{notice.units}</dd>
                </div>
                <div>
                  <dt>Snapshot</dt>
                  <dd>{formatSnapshotDate(notice.retrieved_at_utc)}</dd>
                </div>
              </dl>
              {notice.update_note && (
                <p className="notice-card__note">Source update note: {notice.update_note}</p>
              )}
              <footer className="notice-card__foot">
                <button
                  type="button"
                  className="btn"
                  onClick={() => onOpenNotice(notice.cpsc_id)}
                >
                  Open in review workspace
                </button>
                <a
                  className="link"
                  href={notice.official_url}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Official CPSC page ↗
                </a>
              </footer>
            </article>
          ))}
          {notices.length === 0 && (
            <p className="empty">No retained notice matches that search.</p>
          )}
        </div>
      </section>

        {!liveMode && <section className="pane">
        <div className="pane__head">
          <h2>Demonstration fixtures</h2>
          <p className="pane__lede">
            Five constructed functional examples over the real official notices. They are not
            observed owner incidents and not an accuracy benchmark. Each one loads a labelled
            history into the review workspace.
          </p>
        </div>
        <ol className="fixture-list">
          {cases.map((fixture) => (
            <li className="fixture" key={fixture.id}>
              <div className="fixture__head">
                <h3>{fixture.label}</h3>
                <span className="tag tag--fixture">constructed fixture</span>
              </div>
              <p className="fixture__summary">{fixture.summary}</p>
              <p className="fixture__expected">{fixture.expected_question}</p>
              <button
                type="button"
                className="btn"
                onClick={() => onLoadFixture(fixture.id)}
              >
                Load this fixture
              </button>
            </li>
          ))}
        </ol>
        <p className="footnote">
          Corpus projection from the curated inventory, {corpusSources} sources /{' '}
          {corpusSections} sections, inventory hash {corpusSha.slice(0, 16)}…
        </p>
        </section>}
    </div>
  );
}
