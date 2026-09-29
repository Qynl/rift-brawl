// ============ RIFT BRAWL — launch buttons ============
//
// Deliberately the smallest possible client island: every other pixel of the
// landing page is static HTML, and these are the only things on it that need
// to react to a click.

'use client';

import { launchGame, type LaunchDetail } from './launch';

interface Props extends LaunchDetail {
  children: React.ReactNode;
  variant?: 'primary' | 'ghost' | 'chip';
  className?: string;
  /** Screen-reader label when the visible text is not descriptive on its own. */
  ariaLabel?: string;
}

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-full font-bold ' +
  'transition-[transform,background-color,border-color,box-shadow] duration-200 ' +
  'active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-[#2ee6a8]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#07060f]';

const VARIANTS: Record<NonNullable<Props['variant']>, string> = {
  primary:
    'px-6 py-3 text-[12px] tracking-[0.18em] text-[#04150f] bg-[#2ee6a8] ' +
    'hover:bg-[#5cffce] shadow-[0_0_0_1px_rgba(46,230,168,0.5),0_12px_40px_-12px_rgba(46,230,168,0.7)]',
  ghost:
    'px-5 py-2.5 text-[11px] tracking-[0.18em] text-white/75 border border-white/12 ' +
    'bg-white/[0.03] hover:bg-white/[0.07] hover:text-white hover:border-white/25',
  chip:
    'px-4 py-2 text-[11px] tracking-[0.14em] text-white/70 border border-white/10 ' +
    'bg-white/[0.02] hover:bg-white/[0.06] hover:text-white',
};

export default function PlayButton({
  children,
  variant = 'primary',
  className = '',
  ariaLabel,
  ...detail
}: Props) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => launchGame(detail)}
      className={`${BASE} ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
