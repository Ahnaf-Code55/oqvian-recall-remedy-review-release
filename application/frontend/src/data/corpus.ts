// Read-only access to the embedded notice corpus.
//
// The corpus is generated from the retained inventory by
// scripts/generate-notices.mjs. Every section keeps its id, character offsets
// and SHA-256 fingerprint so that anything the interface cites can be traced
// back to the retained official text.

import type {
  CitedPassage,
  NoticeCorpus,
  NoticeSection,
  NoticeSummary,
  OfficialNotice,
} from '../types';
import noticesJson from './notices.json';

const corpus = noticesJson as unknown as NoticeCorpus;

export const corpusMeta = {
  layer: corpus.layer,
  generated_from: corpus.generated_from,
  generated_from_sha256: corpus.generated_from_sha256,
  purpose: corpus.purpose,
  source_count: corpus.source_count,
  section_count: corpus.section_count,
  scope_note: corpus.scope_note,
  revision_note: corpus.revision_note,
  excluded_from_evidence: corpus.excluded_from_evidence,
  not_established: corpus.not_established,
};

export const allNotices: OfficialNotice[] = corpus.notices;

export function getNotice(cpscId: string): OfficialNotice | undefined {
  return allNotices.find((notice) => notice.cpsc_id === cpscId);
}

export function getNoticeOrThrow(cpscId: string): OfficialNotice {
  const notice = getNotice(cpscId);
  if (!notice) {
    throw new Error(`Unknown notice id: ${cpscId}`);
  }
  return notice;
}

export function eligibleSections(notice: OfficialNotice): NoticeSection[] {
  return notice.sections.filter((section) => section.condition_retrieval_candidate);
}

export function findSection(
  notice: OfficialNotice,
  sectionId: string,
): NoticeSection | undefined {
  return notice.sections.find((section) => section.section_id === sectionId);
}

/** Source text occasionally carries empty inline tags from the saved page. */
export function displayText(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function sectionValue(
  notice: OfficialNotice,
  role: string,
  label: string,
): string | null {
  const section = notice.sections.find(
    (candidate) => candidate.role === role && candidate.label === label,
  );
  return section ? displayText(section.text) : null;
}

function firstLine(value: string | null): string {
  if (!value) return '';
  return value.split('\n').map((line) => line.trim()).filter(Boolean)[0] ?? '';
}

export function summarize(notice: OfficialNotice): NoticeSummary {
  const updateNote =
    notice.sections.find((section) => section.role === 'source_update_note') ?? null;
  return {
    cpsc_id: notice.cpsc_id,
    title: displayText(notice.document_title),
    product: firstLine(sectionValue(notice, 'identity', 'Name of Product')),
    recall_date: firstLine(sectionValue(notice, 'publication_metadata', 'Recall Date')),
    remedy_type: firstLine(sectionValue(notice, 'remedy', 'Remedy type')),
    units: firstLine(sectionValue(notice, 'scope', 'Units')),
    hazard: firstLine(sectionValue(notice, 'hazard_context', 'Hazard')),
    description: sectionValue(notice, 'identity_and_scope', 'Description') ?? '',
    official_url: notice.official_url,
    source_file: notice.source_file,
    source_sha256: notice.source_sha256,
    retrieved_at_utc: notice.source_retrieved_at_utc,
    version_status: notice.source_version_status,
    update_note: updateNote ? displayText(updateNote.text) : null,
    eligible_section_count: eligibleSections(notice).length,
  };
}

export function listSummaries(): NoticeSummary[] {
  return allNotices.map(summarize);
}

export function toCitedPassage(
  notice: OfficialNotice,
  section: NoticeSection,
): CitedPassage {
  return {
    section_id: section.section_id,
    notice_id: notice.cpsc_id,
    label: section.label,
    source_heading: section.source_heading,
    role: section.role,
    char_start: section.char_start,
    char_end_exclusive: section.char_end_exclusive,
    section_sha256: section.section_sha256,
    text: displayText(section.text),
    source_sha256: notice.source_sha256,
    official_url: notice.official_url,
    retrieved_at_utc: notice.source_retrieved_at_utc,
  };
}

export function passageFor(
  notice: OfficialNotice,
  sectionId: string,
): CitedPassage | null {
  const section = findSection(notice, sectionId);
  return section ? toCitedPassage(notice, section) : null;
}

/** Case-insensitive search over title, product name and CPSC id. */
export function searchNotices(query: string): NoticeSummary[] {
  const trimmed = query.trim().toLowerCase();
  const summaries = listSummaries();
  if (!trimmed) return summaries;
  return summaries.filter((notice) =>
    [notice.cpsc_id, notice.title, notice.product, notice.recall_date]
      .join(' ')
      .toLowerCase()
      .includes(trimmed),
  );
}

export function shortHash(hash: string, length = 12): string {
  return hash.slice(0, length);
}

export function formatSnapshotDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toISOString().slice(0, 10);
}
