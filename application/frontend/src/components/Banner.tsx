import type { ReactNode } from 'react';
import type { Tone } from '../ui/labels';

interface BannerProps {
  tone: Tone;
  title: string;
  children?: ReactNode;
  role?: 'status' | 'alert';
}

export function Banner({ tone, title, children, role = 'status' }: BannerProps) {
  return (
    <div className={`banner banner--${tone}`} role={role}>
      <div className="banner__title">{title}</div>
      {children && <div className="banner__body">{children}</div>}
    </div>
  );
}
