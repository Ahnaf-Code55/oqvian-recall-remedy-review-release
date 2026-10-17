import type { StoredReview } from '../api/contract';
import { evidenceLabel, consistencyLabel, propositionLabel, propositionShort, propositionTone } from '../ui/labels';
import { StatusChip } from '../components/StatusChip';
import { notEstablishedNote } from '../ui/notes';

interface ReviewReceiptProps {
  receipts: StoredReview[];
  selected: StoredReview | null;
  onSelect: (reviewId: string) => void;
  onExport: (reviewId: string) => void;
  onClear: () => void;
}

export function ReviewReceipt({
  receipts,
  selected,
  onSelect,
  onExport,
  onClear,
}: ReviewReceiptProps) {
  return (
    <div className="screen screen--receipt">
      <section className="pane">
        <div className="pane__head">
          <h2>Review receipt</h2>
          <p className="pane__lede">
            A versioned snapshot of inputs, cited fingerprints, snapshot dates, model revision,
            timings, uncertainty and reviewer notes. Corrections create new receipts; earlier
            receipts are preserved separately.
          </p>
        </div>

        {receipts.length === 0 && (
          <p className="empty">
            No receipt yet. Run a review in the workspace, then export here.
          </p>
        )}

        {receipts.length > 0 && (
          <table className="receipt-table">
            <thead>
              <tr>
                <th scope="col">Receipt</th>
                <th scope="col">Notice</th>
                <th scope="col">Result</th>
                <th scope="col">Revision</th>
                <th scope="col">Created (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((entry) => (
                <tr
                  key={entry.outcome.review_id}
                  className={
                    selected?.outcome.review_id === entry.outcome.review_id
                      ? 'receipt-table__row receipt-table__row--active'
                      : 'receipt-table__row'
                  }
                >
                  <td>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => onSelect(entry.outcome.review_id)}
                    >
                      {entry.outcome.review_id}
                    </button>
                  </td>
                  <td>CPSC {entry.receipt.notice.cpsc_id}</td>
                  <td>{propositionShort[entry.outcome.proposition.status]}</td>
                  <td>v{entry.receipt.input_revision}</td>
                  <td className="mono">{entry.receipt.created_at_utc.slice(0, 19)}Z</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {receipts.length > 0 && (
          <div className="receipt-actions">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={onClear}
            >
              Clear stored receipts
            </button>
          </div>
        )}
      </section>

      {selected && (
        <section className="pane">
          <div className="pane__head">
            <h2>{selected.outcome.review_id}</h2>
            <div className="receipt-actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => onExport(selected.outcome.review_id)}
              >
                Download receipt JSON
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => window.print()}>
                Print
              </button>
            </div>
          </div>

          <StatusChip tone={propositionTone[selected.outcome.proposition.status]}>
            {propositionLabel[selected.outcome.proposition.status]}
          </StatusChip>

          <dl className="fingerprint">
            <div>
              <dt>Question</dt>
              <dd>{selected.outcome.proposition.question}</dd>
            </div>
            <div>
              <dt>Notice</dt>
              <dd>
                CPSC {selected.receipt.notice.cpsc_id} — {selected.receipt.notice.product}
              </dd>
            </div>
            <div>
              <dt>Recall date</dt>
              <dd>{selected.receipt.notice.recall_date}</dd>
            </div>
            <div>
              <dt>Jurisdiction</dt>
              <dd>{selected.receipt.jurisdiction}</dd>
            </div>
            <div>
              <dt>Snapshot retrieved (UTC)</dt>
              <dd>{selected.receipt.notice.retrieved_at_utc}</dd>
            </div>
            <div>
              <dt>Fixture status</dt>
              <dd>{selected.receipt.fixture_status}</dd>
            </div>
            <div>
              <dt>Source consistency</dt>
              <dd>
                {consistencyLabel[selected.outcome.source_consistency.status]}
                {selected.outcome.source_consistency.blocks_review
                  ? ' — blocks reliance until a human resolves it'
                  : ''}
              </dd>
            </div>
            <div>
              <dt>Model revision</dt>
              <dd>{selected.receipt.model_revision ?? 'none loaded (rules-only interface demo)'}</dd>
            </div>
            <div>
              <dt>Environment</dt>
              <dd>{selected.receipt.environment}</dd>
            </div>
            <div>
              <dt>Elapsed</dt>
              <dd>{selected.outcome.elapsed_ms} ms</dd>
            </div>
            <div>
              <dt>Reviewer notes</dt>
              <dd>{selected.receipt.reviewer_notes || '—'}</dd>
            </div>
          </dl>

          <h3>Supplied history</h3>
          <dl className="fingerprint">
            <div>
              <dt>Action</dt>
              <dd>{selected.receipt.intake.action_description || '—'}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{selected.receipt.intake.action_date || '—'}</dd>
            </div>
            <div>
              <dt>Kit / component</dt>
              <dd>{selected.receipt.intake.kit_or_component || '—'}</dd>
            </div>
            <div>
              <dt>Model / serial</dt>
              <dd>
                {selected.receipt.intake.model || '—'} / {selected.receipt.intake.serial || '—'}
              </dd>
            </div>
          </dl>
          <ul className="fact-list">
            {selected.receipt.intake.facts.map((fact) => (
              <li key={fact.key}>
                <span className="mono">{fact.key}</span> = <strong>{fact.value}</strong>{' '}
                <span className="hint">({evidenceLabel[fact.evidence]})</span>
              </li>
            ))}
          </ul>

          <h3>Cited fingerprints</h3>
          <table className="section-table">
            <thead>
              <tr>
                <th scope="col">Section</th>
                <th scope="col">Chars</th>
                <th scope="col">Section SHA-256</th>
                <th scope="col">Source SHA-256</th>
              </tr>
            </thead>
            <tbody>
              {selected.receipt.cited_fingerprints.map((entry) => (
                <tr key={entry.section_id}>
                  <td className="mono">{entry.section_id}</td>
                  <td className="mono">
                    {entry.char_start}–{entry.char_end_exclusive}
                  </td>
                  <td className="mono">{entry.section_sha256.slice(0, 20)}…</td>
                  <td className="mono">{entry.source_sha256.slice(0, 20)}…</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Uncertainty carried forward</h3>
          <ul className="reasons">
            {selected.outcome.warnings.map((warning) => (
              <li key={warning.code}>{warning.message}</li>
            ))}
          </ul>

          <details className="disclosure">
            <summary>Not established by this demo</summary>
            <ul className="reasons">
              {notEstablishedNote.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </details>

          <details className="disclosure">
            <summary>Raw receipt JSON</summary>
            <pre className="json">{JSON.stringify(selected.receipt, null, 2)}</pre>
          </details>
        </section>
      )}
    </div>
  );
}
