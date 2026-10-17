// Notice-specific condition records.
//
// These are manual annotations written over the retained official wording in
// research/ and embedded in src/data/notices.json. Each record cites exactly one
// permitted source section (plus supporting sections for scope and exclusions).
//
// The wording in `scope` and `exclusion` is quoted from the source. The
// `requirements` and `exclusion_keys` are the deterministic part: they name the
// intake facts a reviewer must supply before the proposition can be answered.
// They never replace the passage; the passage is always shown next to the claim.
//
// Earlier-notice markers and date restrictions are deliberately NOT carried
// across notices. Each notice is annotated on its own terms.

import type { NoticeCondition } from '../types';

const provenance =
  'Manual annotation over retained CPSC notice text held in research/; section id, character offsets and SHA-256 preserved from the curated inventory.';

export const conditions: NoticeCondition[] = [
  {
    id: '10541:condition:new-remedy-after-original-recall',
    notice_id: '10541',
    question:
      'Does having responded to the original May 2024 DR Power vacuum recall complete this notice’s remedy?',
    section_id: '10541:Remedy_instructions:9',
    supporting_section_ids: ['10541:Description:8', '10541:Units:5'],
    scope:
      'Walk-behind and tow-behind DR Power leaf vacuums listed in the notice description.',
    exclusion:
      'Consumers who responded to the original recall should nevertheless contact DR Power for the new remedy.',
    requirements: [
      { key: 'metal_shield_fitted', label: 'New metal outer shield kit fitted to the chute' },
    ],
    exclusion_keys: ['responded_to_original_recall'],
    identity_required: true,
    provenance,
  },
  {
    id: '9982:condition:2018-repair-not-an-exemption',
    notice_id: '9982',
    question:
      'Does a repair completed under the August 2018 Vitamix recall satisfy this notice’s remedy?',
    section_id: '9982:Remedy_instructions:9',
    supporting_section_ids: ['9982:Description:8', '9982:Units:5'],
    scope:
      'All Ascent and Venturist Series 8-ounce and 20-ounce blending containers and blade bases, including those repaired under the previous recall.',
    exclusion:
      'The description states the recall includes containers “that were repaired as part of a previous recall in August 2018”, and the remedy instructs “All consumers, including consumers who participated in the 2018 recall” to obtain a new repair kit.',
    requirements: [
      { key: 'new_shroud_kit_attached', label: 'Protective plastic shroud repair kit obtained and attached' },
    ],
    exclusion_keys: ['prior_2018_repair'],
    identity_required: true,
    provenance,
  },
  {
    id: '974:condition:previously-repaired-not-eligible',
    notice_id: '974',
    question:
      'Is a previously repaired York/Coleman furnace eligible for the $100 refund?',
    section_id: '974:Remedy_instructions:9',
    supporting_section_ids: ['974:Description:8', '974:Units:6'],
    scope:
      'Coleman, Coleman Evcon and Red T gas furnaces for manufactured homes, models listed in the notice description.',
    exclusion: 'Previously repaired units are not eligible for the refund.',
    requirements: [
      { key: 'inspection_completed', label: 'Free inspection completed and unit confirmed included' },
    ],
    exclusion_keys: ['previously_repaired'],
    identity_required: true,
    provenance,
  },
  {
    id: '10896:condition:kit-received-and-installed',
    notice_id: '10896',
    question:
      'Does the supplied history meet this notice’s condition for an exempted mower — a free repair kit received from DR Power and installed?',
    section_id: '10896:Remedy_instructions:9',
    supporting_section_ids: ['10896:Description:8', '10896:Units:5'],
    scope:
      'DR Power PRO MAX30 30-inch walk-behind mowers, models WM25030DEN, WM25030DMN and WM25030DMNR.',
    exclusion:
      'Consumers should stop using the recalled mowers immediately unless they have already received a free repair kit in the mail from DR Power and it has been installed.',
    requirements: [
      { key: 'kit_received', label: 'Free repair kit received from DR Power' },
      { key: 'kit_installed', label: 'Repair kit installed on the mower' },
    ],
    exclusion_keys: [],
    identity_required: true,
    provenance,
  },
  {
    id: '10301:condition:prior-repair-not-an-exemption',
    notice_id: '10301',
    question:
      'Does a repair performed under a prior Yamaha golf car recall satisfy this expanded remedy?',
    section_id: '10301:Remedy_instructions:8',
    supporting_section_ids: ['10301:Description:7', '10301:Units:5'],
    scope: 'Yamaha golf car vehicles included in the expanded recall.',
    exclusion:
      'Consumers should stop using the recalled vehicles “even if they have already had their golf car vehicles repaired as part of prior recalls”.',
    requirements: [
      { key: 'spring_assembly_replaced', label: 'Accelerator pedal return spring assembly replaced by a dealer' },
    ],
    exclusion_keys: ['prior_yamaha_recall_repair'],
    identity_required: true,
    provenance,
  },
  {
    id: '10150:condition:dealer-confirmation-required',
    notice_id: '10150',
    question:
      'Does a prior inspection or repair complete this notice’s remedy for the snow thrower?',
    section_id: '10150:Remedy_instructions:9',
    supporting_section_ids: ['10150:Description:8'],
    scope: 'Ariens DELUXE-, PLATINUM- and PROFESSIONAL-series Sno-Thro models in the recall list.',
    exclusion: null,
    requirements: [
      {
        key: 'dealer_confirmed_and_repairs_completed',
        label: 'Dealer confirmed the unit’s repair status and completed all necessary repairs',
      },
    ],
    exclusion_keys: [],
    identity_required: true,
    provenance,
  },
  {
    id: '9910:condition:2022-assembly-not-an-exemption',
    notice_id: '9910',
    question:
      'Does a replacement upper assembly received under the November 2022 recall complete this notice’s remedy?',
    section_id: '9910:Remedy_instructions:8',
    supporting_section_ids: ['9910:Description:7', '9910:Units:5'],
    scope: 'All BLACK+DECKER Model HGS011 Easy Garment Steamers.',
    exclusion:
      'The remedy has been changed to a refund for all units; consumers who received a replacement upper assembly in the November 2022 recall should contact Empower Brands for a full refund.',
    requirements: [
      { key: 'full_refund_obtained', label: 'Full refund obtained from Empower Brands' },
    ],
    exclusion_keys: ['prior_2022_upper_assembly'],
    identity_required: true,
    provenance,
  },
  {
    id: '9764:condition:prior-zline-repair-not-an-exemption',
    notice_id: '9764',
    question:
      'Does a repair completed under the January 2023 ZLINE recall exempt the range from this expanded remedy?',
    section_id: '9764:Remedy_instructions:8',
    supporting_section_ids: ['9764:Description:7'],
    scope: 'ZLINE 30-inch, 36-inch and 48-inch RG gas ranges, models listed in the notice description.',
    exclusion:
      'All consumers who have an affected range should immediately stop using the oven compartment, “even if they have already had their range repaired as part of the prior recall”.',
    requirements: [
      { key: 'expanded_remedy_selected', label: 'Inspection, replacement range or refund option selected and completed' },
    ],
    exclusion_keys: ['prior_2023_zline_repair'],
    identity_required: true,
    provenance,
  },
  {
    id: '9449:condition:locking-pin-for-continued-use',
    notice_id: '9449',
    question:
      'May the generator be operated before a repair kit is fitted, on the supplied history?',
    section_id: '9449:Remedy_instructions:9',
    supporting_section_ids: ['9449:Description:8', '9449:Units:5'],
    scope: 'Generac and DR 6500-watt and 8000-watt portable generators listed in the notice description.',
    exclusion:
      'Consumers should stop using the generators “unless the locking pin has been inserted to secure the handle in place before and after moving the generator”.',
    requirements: [
      { key: 'locking_pin_in_place', label: 'Locking pin inserted to secure the handle in place' },
    ],
    exclusion_keys: [],
    identity_required: true,
    provenance,
  },
  {
    id: '8750:condition:replacement-lid-not-an-exemption',
    notice_id: '8750',
    question:
      'Does a replacement lid received under the August 2019 Contigo recall complete this notice’s remedy?',
    section_id: '8750:Remedy_instructions:9',
    supporting_section_ids: ['8750:Description:8', '8750:Units:5'],
    scope:
      'Contigo Kids Cleanable water bottles and the replacement lids provided in the previous recall.',
    exclusion:
      'Consumers who received replacement lids in the previous recall should contact Contigo for the new water bottle.',
    requirements: [
      { key: 'new_bottle_obtained', label: 'Free replacement water bottle obtained from Contigo' },
    ],
    exclusion_keys: ['prior_replacement_lid'],
    identity_required: true,
    provenance,
  },
  {
    id: '8288:condition:black-dot-exclusion',
    notice_id: '8288',
    question:
      'Is the riding mower still subject to this recall, given the supplied inspection of its labels?',
    section_id: '8288:Description:8',
    supporting_section_ids: ['8288:Remedy_instructions:9'],
    scope: 'Snapper, Simplicity and Massey Ferguson riding mowers in the recall list.',
    exclusion:
      'If a black dot is present on either the equipment ID label or the shipping crate label, the product has been repaired and is not included in the recall.',
    requirements: [
      { key: 'dealer_repair_scheduled', label: 'Free repair scheduled with a Briggs & Stratton dealer' },
    ],
    exclusion_keys: ['black_dot_present'],
    identity_required: true,
    provenance,
  },
  {
    id: '1622:condition:2013-repair-not-an-exemption',
    notice_id: '1622',
    question:
      'Does the May 2013 repair of the dehydrator complete this expanded notice’s remedy?',
    section_id: '1622:Remedy_instructions:9',
    supporting_section_ids: ['1622:Description:8', '1622:Units:5'],
    scope:
      '5-tray food dehydrators, model 1009, serial numbers between 20110506 and 20121008, previously recalled and repaired in May 2013.',
    exclusion:
      'These food dehydrators were previously recalled and repaired as part of a May 2013 recall, and are included in this expansion.',
    requirements: [
      { key: 'returned_for_lem_repair', label: 'Unit returned to LEM for free repair' },
    ],
    exclusion_keys: ['prior_2013_repair'],
    identity_required: true,
    provenance,
  },
  {
    id: '1371:condition:return-for-repair-benefits',
    notice_id: '1371',
    question:
      'Does returning the dehydrator for repair obtain the stated warranty extension and discount coupon?',
    section_id: '1371:Remedy_instructions:9',
    supporting_section_ids: ['1371:Description:8'],
    scope: 'LEM 5-tray food dehydrators, model 1009, UPC 734494010091.',
    exclusion: null,
    requirements: [
      { key: 'returned_for_lem_repair', label: 'Unit returned to LEM for free repair' },
    ],
    exclusion_keys: [],
    identity_required: true,
    provenance,
  },
  {
    id: '7876:condition:replacement-device-not-an-exemption',
    notice_id: '7876',
    question:
      'Does possessing a replacement Galaxy Note7 from the previous recall exempt the device from this expanded recall?',
    section_id: '7876:Remedy_instructions:8',
    supporting_section_ids: ['7876:Description:7', '7876:Units:5'],
    scope:
      'All Galaxy Note7 devices, including replacements received under the 15 September 2016 recall and any device with a green battery icon.',
    exclusion:
      'The recall involves “all Galaxy Note7 devices received as replacements as part of the previous Galaxy Note7 recall”.',
    requirements: [
      { key: 'device_powered_down_and_remedy_obtained', label: 'Device powered down and refund or exchange obtained' },
    ],
    exclusion_keys: ['replacement_note7_received'],
    identity_required: true,
    provenance,
  },
  {
    id: '7856:condition:pre-september-2016-devices',
    notice_id: '7856',
    question:
      'Is a Galaxy Note7 purchased before 15 September 2016 within this original recall?',
    section_id: '7856:Remedy_instructions:9',
    supporting_section_ids: ['7856:Description:8'],
    scope: 'Samsung Galaxy Note7 smartphones sold before 15 September 2016.',
    exclusion: null,
    requirements: [
      { key: 'purchased_before_2016_09_15', label: 'Device purchased before 15 September 2016' },
    ],
    exclusion_keys: [],
    identity_required: true,
    provenance,
  },
  {
    id: '8374:condition:dot-marking-means-repaired',
    notice_id: '8374',
    question:
      'Does a green or orange dot on the blade base show the container has already been repaired?',
    section_id: '8374:Description:8',
    supporting_section_ids: ['8374:Remedy_instructions:9'],
    scope:
      'Ascent and Venturist Series 8-ounce and 20-ounce blending containers with blade date codes March 2018 or earlier.',
    exclusion: null,
    requirements: [
      { key: 'dot_marking_present', label: 'Green or orange dot present on the bottom of the blade base' },
    ],
    exclusion_keys: [],
    identity_required: true,
    provenance,
  },
];

export function getCondition(conditionId: string): NoticeCondition | undefined {
  return conditions.find((condition) => condition.id === conditionId);
}

export function conditionsForNotice(noticeId: string): NoticeCondition[] {
  return conditions.filter((condition) => condition.notice_id === noticeId);
}

/** The fact keys any condition can ask for, with human labels for the form. */
export const factCatalogue: Array<{
  key: string;
  label: string;
  hint: string;
}> = [
  { key: 'kit_dispatched', label: 'Repair kit dispatched to the owner', hint: 'Dispatch is not receipt.' },
  { key: 'kit_received', label: 'Repair kit received', hint: 'Receipt is not installation.' },
  { key: 'kit_installed', label: 'Repair kit installed on the unit', hint: 'The condition the DR Power notice turns on.' },
  { key: 'metal_shield_fitted', label: 'New metal outer shield kit fitted', hint: 'DR Power leaf vacuum remedy.' },
  { key: 'responded_to_original_recall', label: 'Owner responded to the original recall', hint: 'Response alone is not the new remedy.' },
  { key: 'new_shroud_kit_attached', label: 'New protective shroud kit attached', hint: 'Vitamix remedy.' },
  { key: 'prior_2018_repair', label: 'Repaired under the August 2018 Vitamix recall', hint: 'A historical action, not an exemption.' },
  { key: 'inspection_completed', label: 'Free inspection completed and unit confirmed included', hint: 'York refund precondition.' },
  { key: 'previously_repaired', label: 'Previously repaired', hint: 'York: previously repaired units are not eligible for the refund.' },
  { key: 'spring_assembly_replaced', label: 'Accelerator pedal return spring assembly replaced', hint: 'Yamaha remedy.' },
  { key: 'prior_yamaha_recall_repair', label: 'Repaired under a prior Yamaha recall', hint: 'Not an exemption from the expansion.' },
  { key: 'dealer_confirmed_and_repairs_completed', label: 'Dealer confirmed status and completed repairs', hint: 'Ariens remedy.' },
  { key: 'full_refund_obtained', label: 'Full refund obtained', hint: 'Black+Decker remedy.' },
  { key: 'prior_2022_upper_assembly', label: 'Replacement upper assembly from the November 2022 recall', hint: 'Not an exemption; the remedy changed to a refund.' },
  { key: 'expanded_remedy_selected', label: 'Expanded remedy option selected and completed', hint: 'ZLINE remedy.' },
  { key: 'prior_2023_zline_repair', label: 'Repaired under the January 2023 ZLINE recall', hint: 'Not an exemption; stop using even if repaired.' },
  { key: 'locking_pin_in_place', label: 'Locking pin inserted to secure the handle', hint: 'Generac condition for continued use.' },
  { key: 'new_bottle_obtained', label: 'Free replacement water bottle obtained', hint: 'Contigo remedy.' },
  { key: 'prior_replacement_lid', label: 'Replacement lid from the August 2019 recall', hint: 'That lid is also recalled.' },
  { key: 'black_dot_present', label: 'Black dot present on the equipment ID or crate label', hint: 'Briggs & Stratton: already repaired, not included.' },
  { key: 'dealer_repair_scheduled', label: 'Free repair scheduled with a dealer', hint: 'Briggs & Stratton remedy.' },
  { key: 'returned_for_lem_repair', label: 'Unit returned to LEM for free repair', hint: 'LEM remedy.' },
  { key: 'prior_2013_repair', label: 'Repaired under the May 2013 LEM recall', hint: 'Not an exemption from the expansion.' },
  { key: 'device_powered_down_and_remedy_obtained', label: 'Device powered down and refund or exchange obtained', hint: 'Samsung remedy.' },
  { key: 'replacement_note7_received', label: 'Replacement Note7 received under the previous recall', hint: 'Replacement devices are also recalled.' },
  { key: 'purchased_before_2016_09_15', label: 'Device purchased before 15 September 2016', hint: 'Original Samsung recall scope.' },
  { key: 'dot_marking_present', label: 'Green or orange dot present on the blade base', hint: 'Vitamix 2018: indicates the container was already repaired.' },
];

export function factLabel(key: string): string {
  return factCatalogue.find((fact) => fact.key === key)?.label ?? key;
}
