// Generates src/data/notices.json for the OQVIAN interface demo.
//
// The corpus is a read-only projection of the retained notice inventory at
// research/prebuild-curation-2026-10-16/notice-section-inventory.json.
// It copies, verbatim: section ids, labels, source headings, roles, character
// offsets and section fingerprints, so that citations rendered by the interface
// keep the provenance recorded during data preparation. Nothing here invents
// notice text, dates or remedy wording.
//
// Run:  node scripts/generate-notices.mjs   (from application/frontend)

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');
const inventoryRel = 'research/prebuild-curation-2026-10-16/notice-section-inventory.json';
const inventoryPath = path.join(repoRoot, ...inventoryRel.split('/'));
const outPath = path.join(here, '..', 'src', 'data', 'notices.json');

const rawInventory = fs.readFileSync(inventoryPath, 'utf8');
const inventory = JSON.parse(rawInventory);
const inventorySha = createHash('sha256').update(rawInventory, 'utf8').digest('hex');

const notices = inventory.sources.map((source) => ({
  cpsc_id: String(source.cpsc_id),
  document_title: source.document_title,
  official_url: source.official_url,
  source_file: source.source_file,
  source_sha256: source.source_sha256,
  source_retrieved_at_utc: source.source_retrieved_at_utc,
  source_version_status: source.source_version_status ?? null,
  annotation_status: source.annotation_status ?? null,
  sections: source.sections.map((section) => ({
    section_id: section.section_id,
    label: section.label,
    source_heading: section.source_heading ?? null,
    role: section.section_role,
    char_start: section.char_start,
    char_end_exclusive: section.char_end_exclusive,
    section_sha256: section.section_sha256,
    text: section.text,
    condition_retrieval_candidate: Boolean(section.condition_retrieval_candidate),
    selection_status: section.selection_status ?? null,
  })),
}));

const payload = {
  layer: 'embedded-interface-demo-corpus',
  generated_from: inventoryRel,
  generated_from_sha256: inventorySha,
  purpose:
    'Read-only notice corpus embedded for interface development. Section text, ids, offsets and fingerprints are copied from the retained inventory; the interface demo is not the integrated service.',
  source_count: inventory.source_count,
  section_count: inventory.section_count,
  scope_note: inventory.scope_note,
  revision_note: inventory.revision_note,
  excluded_from_evidence: inventory.excluded_from_evidence,
  not_established: inventory.not_established,
  notices,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

const sectionTotal = notices.reduce((sum, n) => sum + n.sections.length, 0);
console.log(`wrote ${outPath}`);
console.log(`notices=${notices.length} sections=${sectionTotal} inventory_sha256=${inventorySha.slice(0, 16)}…`);