import { corpusMeta } from '../data/corpus';

/**
 * The categories the curated inventory excludes from evidence. Shown verbatim so
 * the exclusion decision is visible rather than silent.
 */
export const demonstrablyExcludedNote =
  `Excluded from evidence during data preparation: ${corpusMeta.excluded_from_evidence.join('; ')}.`;

export const notEstablishedNote = corpusMeta.not_established;

export const scopeNote = corpusMeta.scope_note;

export const revisionNote = corpusMeta.revision_note;
