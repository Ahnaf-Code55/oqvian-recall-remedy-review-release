import { useMemo } from 'react';
import type { NoticeSection, ReviewOutcome } from '../types';
import { getNoticeOrThrow, shortHash } from '../data/corpus';
import { demonstrablyExcludedNote } from '../ui/notes';
import { Banner } from '../components/Banner';
import { StatusChip } from '../components/StatusChip';
import { consistencyLabel, consistencyTone } from '../ui/labels';

interface SourceComparisonProps {
  noticeId: string;
  outcome: ReviewOutcome | null;
}

export function SourceComparison({ noticeId, outcome }: SourceComparisonProps) {
  const notice = useMemo(() => getNoticeOrThrow(noticeId), [noticeId]);
  const consistency = outcome?.source_consistency ?? null;

  const eligible = notice.sections.filter((section) => section.condition_retrieval_candidate);
  const contextOnly = notice.sections.filter((section) => !section.condition_retrieval_candidate);

  return (
    <div className="screen screen--sources">
      <section className="pane">
        <div className="pane__head">
          <h2>Source comparison</h2>
          <p className="pane__lede">
            Structured-API instructions and the official webpage are separate sources. When they
            disagree, both are shown and the review is blocked; this is not a fourth proposition
            label.
          </p>
        </div>

        {consistency ? (
          <>
            <StatusChip tone={consistencyTone[consistency.status]}>
              {consistencyLabel[consistency.status]}
            </StatusChip>
            <p className="block__note">{consistency.summary}</p>
          </>
        ) : (
          <Banner tone="neutral" title="Source consistency not yet evaluated">
            Run a review in the workspace to compare the structured API and the official webpage
            for this notice.
          </Banner>
        )}

        <div className="compare">
          <article className={`compare__col${consistency?.status === 'disagree' ? ' compare__col--conflict' : ''}`}>
            <h3>Structured API instruction</h3>
            {consistency?.api_instruction ? (
              <>
                <p className="compare__text">{consistency.api_instruction}</p>
                <p className="compare__prov">{consistency.api_provenance}</p>
              </>
            ) : (
              <p className="empty">
                No recorded API response is held. API-only results would be discovery material
                labelled “webpage not checked”.
              </p>
            )}
          </article>
          <article className="compare__col">
            <h3>Official webpage (retained snapshot)</h3>
            {consistency?.page_instruction ? (
              <>
                <p className="compare__text">{consistency.page_instruction}</p>
                <p className="compare__prov">{consistency.page_provenance}</p>
              </>
            ) : (
              <p className="empty">
                The retained page text is the only source in this demo; its current status is not
                checked.
              </p>
            )}
          </article>
        </div>

        <details className="disclosure" open>
          <summary>Full source fingerprint</summary>
          <dl className="fingerprint">
            <div>
              <dt>Notice</dt>
              <dd>
                CPSC {notice.cpsc_id} — {notice.document_title}
              </dd>
            </div>
            <div>
              <dt>Retained file</dt>
              <dd className="mono">{notice.source_file}</dd>
            </div>
            <div>
              <dt>Source SHA-256</dt>
              <dd className="mono">{notice.source_sha256}</dd>
            </div>
            <div>
              <dt>Retrieved (UTC)</dt>
              <dd>{notice.source_retrieved_at_utc}</dd>
            </div>
            <div>
              <dt>Version status</dt>
              <dd>{notice.source_version_status ?? 'not recorded'}</dd>
            </div>
            <div>
              <dt>Official URL</dt>
              <dd>
                <a href={notice.official_url} target="_blank" rel="noreferrer noopener">
                  {notice.official_url}
                </a>
              </dd>
            </div>
          </dl>
        </details>
      </section>

      <section className="pane">
        <div className="pane__head">
          <h2>Sections eligible for evidence</h2>
          <p className="pane__lede">
            Only marked identity / remedy / scope / sale-scope passages are condition-retrieval
            candidates. Everything else is retained as context but never cited as a condition.
          </p>
        </div>
        <SectionTable sections={eligible} eligible />
        <details className="disclosure">
          <summary>
            Context-only sections retained but not eligible ({contextOnly.length})
          </summary>
          <p className="footnote">{demonstrablyExcludedNote}</p>
          <SectionTable sections={contextOnly} eligible={false} />
        </details>
      </section>
    </div>
  );
}

function SectionTable({ sections, eligible }: { sections: NoticeSection[]; eligible: boolean }) {
  return (
    <table className="section-table">
      <thead>
        <tr>
          <th scope="col">Section</th>
          <th scope="col">Chars</th>
          <th scope="col">SHA-256</th>
          <th scope="col">Evidence use</th>
        </tr>
      </thead>
      <tbody>
        {sections.map((section) => (
          <tr key={section.section_id}>
            <td>
              <span className="section-table__id mono">{section.section_id}</span>
              <span className="section-table__label">
                {section.label} · {section.role.replace(/_/g, ' ')}
              </span>
            </td>
            <td className="mono">
              {section.char_start}–{section.char_end_exclusive}
            </td>
            <td className="mono">{shortHash(section.section_sha256, 14)}…</td>
            <td>
              <span className={`tag ${eligible ? 'tag--eligible' : 'tag--context'}`}>
                {eligible ? 'candidate' : 'context'}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
