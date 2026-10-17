import type { BackendReceipt } from '../api/contract';
import { Banner } from '../components/Banner';
import { StatusChip } from '../components/StatusChip';

export function LiveSourceComparison({ receipt, obsolete = false }: { receipt: BackendReceipt | null; obsolete?: boolean }) {
  if (!receipt) {
    return <section className="pane"><Banner tone="neutral" title="No backend receipt yet">Run an authenticated review to display its retained source passages and source comparison. The local fixture sources are not shown in live mode.</Banner></section>;
  }

  const consistency = receipt.source_consistency;
  return (
    <div className="screen screen--sources">
      <section className="pane">
        {obsolete && <Banner tone="warn" title="Result obsolete — inputs changed" role="alert">This backend receipt is retained from an earlier input revision. Run a new review before relying on it.</Banner>}
        <div className="pane__head">
          <h2>Backend source comparison</h2>
          <p className="pane__lede">Source records returned with receipt {receipt.review_id}. These are the retained sources used by the backend for this review.</p>
        </div>
        <StatusChip tone={consistency.status === 'conflict' ? 'danger' : consistency.status === 'not_compared' ? 'warn' : 'ok'}>{consistency.status}</StatusChip>
        {consistency.note && <p className="block__note">{consistency.note}</p>}
        {!!consistency.conflicts?.length ? consistency.conflicts.map((conflict, index) => (
          <article className="block" key={index}>
            <h3>{String(conflict.source ?? 'Source ' + (index + 1))}</h3>
            <p>{String(conflict.text ?? '')}</p>
            <p className="mono">Source SHA-256: {String(conflict.source_sha256 ?? conflict.record_sha256 ?? 'not supplied')}</p>
            <p>Captured: {String(conflict.captured_at_utc ?? 'not reported')}</p>
            <a href={String(conflict.url ?? conflict.record_url ?? '#')} target="_blank" rel="noreferrer noopener">{String(conflict.url ?? conflict.record_url ?? 'Source URL not supplied')}</a>
          </article>
        )) : <p className="empty">The backend returned no separate source-conflict record for this case.</p>}
      </section>
      <section className="pane">
        <div className="pane__head"><h2>Retrieved evidence passages</h2><p className="pane__lede">Every backend passage returned for this receipt, including its source and section fingerprints.</p></div>
        {receipt.passages.map((passage) => (
          <article className="passage" key={passage.section_id}>
            <h3>{passage.section_label} · {passage.section_role}</h3>
            <p className="mono">{passage.section_id} · characters {passage.start_offset}–{passage.end_offset}</p>
            <p className="mono">Section SHA-256: {passage.section_sha256}</p>
            <p className="mono">Source SHA-256: {passage.source_sha256}</p>
            <p>Retrieved: {passage.source_retrieved_at_utc} · source and section fingerprints {passage.source_hash_verified && passage.section_hash_verified ? 'verified' : 'not verified'}</p>
            <a href={passage.url} target="_blank" rel="noreferrer noopener">{passage.title}</a>
            <blockquote>{passage.text}</blockquote>
          </article>
        ))}
      </section>
    </div>
  );
}

export function LiveReceiptDetail({
  receipt,
  onExport,
  obsolete = false,
}: {
  receipt: BackendReceipt | null;
  onExport: (reviewId: string) => void;
  obsolete?: boolean;
}) {
  if (!receipt) {
    return <section className="pane"><Banner tone="neutral" title="No server receipt in this session">Run an authenticated backend review to receive a schema 1.1 receipt. Local demo receipts are not mixed into the live view.</Banner></section>;
  }

  return (
    <div className="screen screen--receipt">
      <section className="pane">
        <div className="pane__head">
          <h2>Authenticated backend receipt</h2>
          {!obsolete && <button className="btn btn--primary" type="button" onClick={() => onExport(receipt.review_id)}>Export from backend</button>}
        </div>
        {obsolete && <Banner tone="warn" title="Result obsolete — inputs changed" role="alert">This server receipt remains available as a historical snapshot, but it does not match the current inputs. Export is disabled until a new review completes.</Banner>}
        <dl className="fingerprint">
          <div><dt>Receipt ID</dt><dd className="mono">{receipt.review_id}</dd></div>
          <div><dt>Schema</dt><dd>{receipt.schema_version}</dd></div>
          <div><dt>Case</dt><dd>{receipt.case_id}</dd></div>
          <div><dt>Created (UTC)</dt><dd>{receipt.created_at_utc}</dd></div>
          <div><dt>Revision</dt><dd>{receipt.input_revision}</dd></div>
          <div><dt>Fixture status</dt><dd>{receipt.fixture_status}</dd></div>
          <div><dt>Input SHA-256</dt><dd className="mono">{receipt.input_digest_sha256}</dd></div>
          <div><dt>Receipt SHA-256</dt><dd className="mono">{receipt.receipt_digest_sha256}</dd></div>
          <div><dt>Inference status</dt><dd>{receipt.inference.status}</dd></div>
        </dl>
        <h3>Returned propositions</h3>
        <ul className="reasons">{receipt.propositions.map((item, index) => <li key={index}><strong>{item.status}</strong> — {item.statement}</li>)}</ul>
        <details className="disclosure"><summary>Complete server receipt JSON</summary><pre className="json">{JSON.stringify(receipt, null, 2)}</pre></details>
      </section>
    </div>
  );
}
