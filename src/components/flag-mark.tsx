/**
 * GolfSnipe mark: a flagstick with a pennant on the green. Replaces the earlier
 * crosshair (too "sniper", not golf). `variant="light"` is for placing on the
 * dark green brand panel; the default reads on light surfaces via theme tokens.
 */
export function FlagMark({
  size = 26,
  variant = 'default',
  className,
}: {
  size?: number;
  variant?: 'default' | 'light';
  className?: string;
}) {
  const green = variant === 'light' ? '#4e8467' : 'var(--go)';
  const pole = variant === 'light' ? '#eaf1e7' : 'var(--ink)';
  const flag = variant === 'light' ? '#d6604b' : 'var(--flag)';

  return (
    <svg
      width={size}
      height={(size * 34) / 32}
      viewBox="0 0 32 34"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path d="M6 30 h20" stroke={green} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M11 5 L11 30" stroke={pole} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M11 5.4 L25 9 L11 12.8 Z" fill={flag} />
      <circle cx="17" cy="29" r="1.8" fill={pole} />
    </svg>
  );
}
