import type { EvidenceClass, IdentityStatus, PropositionStatus, SourceConsistencyStatus } from '../types';

export type Tone = 'ok' | 'warn' | 'danger' | 'neutral' | 'info';

export const propositionLabel: Record<PropositionStatus, string> = {
  supported: 'Supported by supplied evidence',
  contradicted: 'Contradicted by supplied evidence',
  unresolved: 'Unresolved',
};

export const propositionShort: Record<PropositionStatus, string> = {
  supported: 'Supported',
  contradicted: 'Contradicted',
  unresolved: 'Unresolved',
};

export const propositionTone: Record<PropositionStatus, Tone> = {
  supported: 'ok',
  contradicted: 'danger',
  unresolved: 'warn',
};

export const identityLabel: Record<IdentityStatus, string> = {
  confirmed: 'Identity confirmed',
  unconfirmed: 'Identity unconfirmed',
  not_supplied: 'Identity not supplied',
};

export const identityTone: Record<IdentityStatus, Tone> = {
  confirmed: 'ok',
  unconfirmed: 'warn',
  not_supplied: 'neutral',
};

export const consistencyLabel: Record<SourceConsistencyStatus, string> = {
  agree: 'Sources agree',
  disagree: 'Sources disagree — review blocked',
  not_checked: 'Source consistency not checked',
};

export const consistencyTone: Record<SourceConsistencyStatus, Tone> = {
  agree: 'ok',
  disagree: 'danger',
  not_checked: 'neutral',
};

export const evidenceLabel: Record<EvidenceClass, string> = {
  observed_present: 'Observed present',
  observed_absent: 'Observed absent',
  constructed_fixture: 'Constructed fixture',
  not_checked: 'Not checked',
  owner_statement: 'Owner statement',
  third_party_confirmation: 'Third-party confirmation',
};

export const evidenceHint: Record<EvidenceClass, string> = {
  observed_present: 'The reviewer saw the fact present.',
  observed_absent: 'The reviewer saw the fact absent.',
  constructed_fixture: 'Synthetic test input only; not an owner statement or observed fact.',
  not_checked: 'Nobody has checked this yet.',
  owner_statement: 'The owner says so. A statement, not a verification.',
  third_party_confirmation: 'Documented confirmation from another party.',
};

export const severityTone: Record<'info' | 'attention' | 'blocking', Tone> = {
  info: 'info',
  attention: 'warn',
  blocking: 'danger',
};

export const severityLabel: Record<'info' | 'attention' | 'blocking', string> = {
  info: 'Note',
  attention: 'Attention',
  blocking: 'Blocking',
};
