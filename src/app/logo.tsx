// The product mark: a rate line moving up and down inside a rounded square — the size of a swing, not its direction.

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <path d="M6 18.5c2.6-5.3 5.4-5.3 8 0s5.4 5.3 8 0 2.4-4 4-4" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M8 9h5M10.5 6.5v5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity="0.85" />
      <path d="M19 9h5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity="0.85" />
    </svg>
  );
}
