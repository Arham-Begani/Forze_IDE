export function Logo({ size = 28 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-lg border border-line-strong bg-bg-raised text-accent"
      style={{ width: size, height: size }}
      aria-label="VIBECODE"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        width={size * 0.6}
        height={size * 0.6}
      >
        <path d="M4 4 L12 20 L20 4" />
      </svg>
    </div>
  );
}
