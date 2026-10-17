import type { ReactNode } from 'react';
import type { Tone } from '../ui/labels';

interface StatusChipProps {
  tone: Tone;
  children: ReactNode;
  /** The chip always carries a text label; the dot is a secondary cue only. */
  withDot?: boolean;
}

const glyph: Record<Tone, string> = {
  ok: '✓',
  warn: '!',
  danger: '×',
  neutral: '·',
  info: 'i',
};

export function StatusChip({ tone, children, withDot = true }: StatusChipProps) {
  return (
    <span className={`chip chip--${tone}`}>
      {withDot && (
        <span className="chip__glyph" aria-hidden="true">
          {glyph[tone]}
        </span>
      )}
      <span className="chip__label">{children}</span>
    </span>
  );
}
