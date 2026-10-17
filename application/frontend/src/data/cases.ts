// The five demonstration cases.
//
// Each is a CONSTRUCTED FUNCTIONAL EXAMPLE layered over a real retained CPSC
// notice. They are not observed owner incidents and not a population accuracy
// benchmark. Every fixture is labelled as constructed wherever it is shown.
//
// The expected behaviour is recorded in `expected_question` so the walkthrough
// can compare what the app really does against what the case is meant to show.

import type { DemoCase, EvidenceClass, FactValue, IntakeHistory, SuppliedFact } from '../types';

function fact(key: string, value: FactValue, evidence: EvidenceClass, note?: string): SuppliedFact {
  return { key, value, evidence, note };
}

function intake(
  partial: Partial<IntakeHistory> & { facts: SuppliedFact[] },
): IntakeHistory {
  return {
    action_description: '',
    action_date: '',
    kit_or_component: '',
    model: '',
    serial: '',
    reviewer_notes: '',
    ...partial,
  };
}

export const demoCases: DemoCase[] = [
  {
    id: 'case-dr-mower-kit-received-not-installed',
    label: 'DR Power mower — kit received, not installed',
    notice_id: '10896',
    condition_id: '10896:condition:kit-received-and-installed',
    fixture_status: 'constructed functional example over a retained official notice',
    summary:
      'The owner received the free DR Power repair kit but has not installed it. The notice exempts a mower from the stop-use instruction only when the kit has both been received and installed.',
    expected_question:
      'Expected: the received-but-not-installed history is CONTRADICTED, because receipt is not installation.',
    intake: intake({
      action_description:
        'Owner states a free repair kit arrived from DR Power in the mail and is still in its box in the garage.',
      action_date: '2026-08-20',
      kit_or_component: 'DR Power free repair kit (blade control system)',
      model: 'WM25030DMN',
      serial: 'Not legible',
      reviewer_notes:
        'Kit photographed in unopened packaging. No installation receipt or dealer record supplied.',
      facts: [
        fact('kit_dispatched', 'yes', 'owner_statement', 'Owner states the kit was mailed to them.'),
        fact('kit_received', 'yes', 'observed_present', 'Kit box photographed at the property.'),
        fact('kit_installed', 'no', 'observed_absent', 'Kit is still sealed in its packaging.'),
      ],
    }),
  },
  {
    id: 'case-dr-mower-installed-with-evidence',
    label: 'DR Power mower — installation evidence supplied',
    notice_id: '10896',
    condition_id: '10896:condition:kit-received-and-installed',
    fixture_status: 'constructed functional example over a retained official notice',
    summary:
      'Identity is supplied and the installation is confirmed by a documented third-party record. A confirmation supports its stated fact even though it is not the reviewer’s own observation.',
    expected_question:
      'Expected: identity CONFIRMED and the condition SUPPORTED by the dealer installation record.',
    intake: intake({
      action_description:
        'Authorized dealer fitted the DR Power repair kit and issued a dated service record.',
      action_date: '2026-04-02',
      kit_or_component: 'DR Power free repair kit, dealer-fitted',
      model: 'WM25030DEN',
      serial: 'WM25-0118-4471',
      reviewer_notes:
        'Dealer service record and photograph of the fitted shield supplied (single-page PDF).',
      facts: [
        fact('kit_dispatched', 'yes', 'third_party_confirmation', 'Dealer work order references the dispatch.'),
        fact('kit_received', 'yes', 'third_party_confirmation', 'Dealer recorded the kit on site.'),
        fact('kit_installed', 'yes', 'third_party_confirmation', 'Dated dealer installation record supplied.'),
      ],
    }),
  },
  {
    id: 'case-vitamix-historical-repair',
    label: 'Vitamix — historical repair is not an exemption',
    notice_id: '9982',
    condition_id: '9982:condition:2018-repair-not-an-exemption',
    fixture_status: 'constructed functional example over a retained official notice',
    summary:
      'The owner had the container repaired under the 2018 Vitamix recall and treats that as the answer to the later notice. The later notice explicitly includes units repaired in 2018 and requires a new shroud kit.',
    expected_question:
      'Expected: CONTRADICTED. The historical repair is a supplied fact, not an exemption from the later notice’s scope.',
    intake: intake({
      action_description:
        'Owner states the blending container was repaired under the August 2018 Vitamix recall and believes no further action is needed.',
      action_date: '2018-09-14',
      kit_or_component: '2018 Vitamix repair kit (original remedy)',
      model: 'Venturist V1200',
      serial: 'Not supplied',
      reviewer_notes:
        'No record of the 2026 remedy (protective shroud) being obtained or attached.',
      facts: [
        fact('prior_2018_repair', 'yes', 'owner_statement', 'Owner describes the 2018 repair.'),
        fact('new_shroud_kit_attached', 'no', 'not_checked', 'The later shroud kit has not been checked or fitted.'),
      ],
    }),
  },
  {
    id: 'case-york-source-conflict',
    label: 'York furnace — API and official page disagree',
    notice_id: '974',
    condition_id: '974:condition:previously-repaired-not-eligible',
    fixture_status: 'constructed functional example over a retained official notice',
    summary:
      'A structured-API instruction and the retained official page give materially different refund instructions for a previously repaired furnace. The disagreement must be shown and the review blocked rather than silently resolved.',
    expected_question:
      'Expected: the proposition is CONTRADICTED by the explicit page condition, and the review is simultaneously BLOCKED by source disagreement — two separate dimensions.',
    intake: intake({
      action_description:
        'Owner had the furnace repaired under the November 2004 York recall and is now claiming the $100 refund.',
      action_date: '2005-03-11',
      kit_or_component: 'Prior recall repair (furnace)',
      model: 'DGAT070BDD',
      serial: 'Not supplied',
      reviewer_notes:
        'Owner supplied the repair invoice from 2005 and separately sent a screenshot of a refund instruction that differs from the official page.',
      facts: [
        fact('previously_repaired', 'yes', 'owner_statement', 'Owner states and documents the 2005 repair.'),
        fact('inspection_completed', 'no', 'not_checked', 'No inspection has been scheduled.'),
      ],
    }),
    source_variants: {
      api_instruction:
        'CONSTRUCTED FIXTURE — structured instruction offering “$100 toward a new furnace after a free inspection” with no exclusion for previously repaired units. This is not a recorded API response.',
      page_instruction:
        'Retained official page: “Consumers should immediately stop using the recalled furnaces and contact UPG to schedule a free inspection and receive a $100 towards the cost of a new replacement UPG furnace, if the inspected furnace is included in the recall. Previously repaired units are not eligible for the refund.”',
      api_provenance:
        'Constructed example standing in for a structured-API row, pending Ahnaf’s recorded response. Not evidence.',
      page_provenance: 'Section 974:Remedy_instructions:9 from the retained page text.',
    },
  },
  {
    id: 'case-missing-identity-and-installation',
    label: 'DR Power mower — identity and installation missing',
    notice_id: '10896',
    condition_id: '10896:condition:kit-received-and-installed',
    fixture_status: 'constructed functional example over a retained official notice',
    summary:
      'Neither a model identifier nor any installation fact is supplied. The product family looks right but a similar brand name is not sufficient, so the review must abstain and report the missing facts.',
    expected_question:
      'Expected: identity UNCONFIRMED and the proposition UNRESOLVED, listing exactly which facts are missing.',
    intake: intake({
      action_description:
        'Owner says “a DR mower” was involved and that “the recall was dealt with”, without a model, serial or any installation record.',
      action_date: '',
      kit_or_component: 'Unknown',
      model: '',
      serial: '',
      reviewer_notes:
        'No photographs, no invoice, no dealer record. Model identifier not supplied.',
      facts: [
        fact('kit_received', 'unknown', 'not_checked', 'Nothing supplied about receipt.'),
        fact('kit_installed', 'unknown', 'not_checked', 'Nothing supplied about installation.'),
      ],
    }),
  },
];

export function getCase(caseId: string): DemoCase | undefined {
  return demoCases.find((demoCase) => demoCase.id === caseId);
}
