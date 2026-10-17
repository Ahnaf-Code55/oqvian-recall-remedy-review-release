import type { CitedPassage } from '../types';
import { displayText, shortHash } from '../data/corpus';

interface PassageCardProps {
  passage: CitedPassage;
  caption?: string;
  compact?: boolean;
}

/**
 * An exact official passage with the provenance needed to trace it: section id,
 * character offsets within the retained text, the section fingerprint and the
 * full-source fingerprint.
 */
export function PassageCard({ passage, caption, compact = false }: PassageCardProps) {
  return (
    <figure className={`passage${compact ? ' passage--compact' : ''}`}>
      <figcaption className="passage__head">
        <span className="passage__role">{passage.role.replace(/_/g, ' ')}</span>
        <span className="passage__label">{passage.label}</span>
        {caption && <span className="passage__caption">{caption}</span>}
      </figcaption>
      <blockquote className="passage__body">{displayText(passage.text)}</blockquote>
      <div className="passage__provenance">
        <span title={passage.section_id}>section {passage.section_id}</span>
        <span>
          chars {passage.char_start}–{passage.char_end_exclusive}
        </span>
        <span title={passage.section_sha256}>
          section sha256 {shortHash(passage.section_sha256, 16)}…
        </span>
        <span title={passage.source_sha256}>
          source sha256 {shortHash(passage.source_sha256, 16)}…
        </span>
        <a href={passage.official_url} target="_blank" rel="noreferrer noopener">
          CPSC {passage.notice_id} ↗
        </a>
      </div>
    </figure>
  );
}
