// Demo video driver.
//
// This file exists for one purpose: recording the interface segment of the
// OQVIAN demo video (docs/demo/VIDEO-SCRIPT.md) as a single unattended take.
//
// It runs only when the page is opened with `?autoplay` in the URL. It performs
// the same actions a human would perform - loading the labelled fixtures and
// pressing Run review - on a recorded timeline that matches the script beats.
// It cannot fabricate outputs: every result shown comes from the same engine
// path as a manual run, on the same labelled fixtures. It is a camera operator,
// not a second application.

export type AutoplayScreen = 'library' | 'review' | 'sources' | 'receipt';

export interface AutoplayControl {
  loadFixture: (caseId: string) => void;
  runReview: () => void;
  setScreen: (screen: AutoplayScreen) => void;
}

interface Step {
  /** Absolute time in seconds from the start of the page. */
  at: number;
  label: string;
  act: (control: AutoplayControl) => void;
}

/** Scroll the running content to a fraction of its scrollable height. */
function scrollMain(fraction: number): void {
  const clamped = Math.min(Math.max(fraction, 0), 1);
  const pane = document.querySelector<HTMLElement>('.main');
  if (pane) {
    const top = (pane.scrollHeight - pane.clientHeight) * clamped;
    pane.scrollTo({ top, behavior: 'smooth' });
    return;
  }
  const reach = document.documentElement.scrollHeight - window.innerHeight;
  window.scrollTo({ top: Math.max(reach, 0) * clamped, behavior: 'smooth' });
}

/**
 * The shot list. Timestamps are the absolute second at which an action happens,
 * taken from the beat headings in docs/demo/VIDEO-SCRIPT.md:
 *
 *   0:00 - 0:52   case library, notices then fixtures
 *   0:52 - 1:25   Vitamix historical repair -> Contradicted + evidence passage
 *   1:25 - 1:50   DR Power received-not-installed, then installation record
 *   1:50 - 2:10   DR Power missing identity -> Unresolved
 *   2:10 - 2:35   York furnace -> Contradicted and blocked; source comparison
 *   2:35 - 2:48   review receipts, five preserved revisions
 *   2:48 - 2:55   honest close on the result and the "Inference" strip
 */
const SCRIPT: ReadonlyArray<Step> = [
  { at: 0.5, label: 'open on the case library', act: (c) => { c.setScreen('library'); scrollMain(0); } },
  { at: 14, label: 'sweep the notice families', act: () => scrollMain(0.3) },
  { at: 26, label: 'continue through the corpus', act: () => scrollMain(0.6) },
  { at: 36, label: 'deep into the retained notices', act: () => scrollMain(0.88) },
  { at: 41, label: 'rest on the result panel', act: () => scrollMain(0) },
  { at: 46, label: 'reveals the demonstration fixtures', act: () => scrollMain(0.95) },
  { at: 49, label: 'load the Vitamix fixture', act: (c) => c.loadFixture('case-vitamix-historical-repair') },
  { at: 55, label: 'run Vitamix', act: (c) => c.runReview() },
  { at: 58, label: 'read the contradicted result', act: () => scrollMain(0.28) },
  { at: 67, label: 'reach the cited remedy passage', act: () => scrollMain(0.55) },
  { at: 76, label: 'show the scope and identity passages', act: () => scrollMain(0.82) },
  { at: 81, label: 'settle back on the result', act: () => scrollMain(0.5) },
  { at: 85, label: 'load DR Power - kit received, not installed', act: (c) => c.loadFixture('case-dr-mower-kit-received-not-installed') },
  { at: 88, label: 'run it', act: (c) => c.runReview() },
  { at: 90, label: 'receipt is not installation', act: () => scrollMain(0.4) },
  { at: 94, label: 'hold the contradicted result', act: () => scrollMain(0.75) },
  { at: 96, label: 'load DR Power - installation evidence', act: (c) => c.loadFixture('case-dr-mower-installed-with-evidence') },
  { at: 99, label: 'run it', act: (c) => c.runReview() },
  { at: 101, label: 'same rule, different facts', act: () => scrollMain(0.5) },
  { at: 106, label: 'supported by the dealer record', act: () => scrollMain(0.75) },
  { at: 110, label: 'load the missing-identity fixture', act: (c) => c.loadFixture('case-missing-identity-and-installation') },
  { at: 113, label: 'run it', act: (c) => c.runReview() },
  { at: 115, label: 'the review abstains', act: () => scrollMain(0.35) },
  { at: 121, label: 'missing facts, listed not guessed', act: () => scrollMain(0.75) },
  { at: 126, label: 'return to the inputs', act: () => scrollMain(0.3) },
  { at: 130, label: 'load the York furnace', act: (c) => c.loadFixture('case-york-source-conflict') },
  { at: 133, label: 'run it', act: (c) => c.runReview() },
  { at: 135, label: 'contradicted and blocked', act: () => scrollMain(0.4) },
  { at: 140, label: 'open the source comparison', act: (c) => c.setScreen('sources') },
  { at: 146, label: 'page against the API row', act: () => scrollMain(0.5) },
  { at: 152, label: 'the labelled stand-in and the block', act: () => scrollMain(0.9) },
  { at: 155, label: 'open the review receipts', act: (c) => c.setScreen('receipt') },
  { at: 160, label: 'five preserved revisions', act: () => scrollMain(0.35) },
  { at: 164, label: 'the receipt detail with provenance', act: () => scrollMain(0.85) },
  { at: 168, label: 'close on the result and the honest strip', act: (c) => c.setScreen('review') },
];

/** True when the page was opened with the autoplay parameter. */
export function autoplayRequested(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.search.includes('autoplay');
}

/**
 * Schedule the script against real timers and return a cleanup that cancels
 * every not-yet-fired step (used on unmount and on hot reloads).
 */
export function startAutoplay(control: AutoplayControl): () => void {
  const timers: number[] = [];
  for (const step of SCRIPT) {
    timers.push(
      window.setTimeout(() => {
        try {
          step.act(control);
        } catch (caught) {
          // A recording take must not die on one failed step.
          console.error(`autoplay step "${step.label}" failed`, caught);
        }
      }, step.at * 1000),
    );
  }
  return () => timers.forEach((timer) => window.clearTimeout(timer));
}
