/** Tiny dependency-free SVG charts for the Startup OS pages. */

interface AreaPoint {
  label?: string;
  month?: string;
  value: number;
}

function pointLabel(p: AreaPoint): string {
  return p.label ?? p.month ?? '';
}

export function AreaSpark({
  data,
  height = 200,
  accent = 'var(--color-accent)',
  /** Tooltip title for the highlighted point (defaults to its label). */
  seriesLabel,
  /** Formats a point's value for the tooltip + axis (defaults to a plain count). */
  format = (v) => String(v),
}: {
  data: AreaPoint[];
  height?: number;
  accent?: string;
  seriesLabel?: string;
  format?: (value: number) => string;
}): JSX.Element {
  const width = 560;
  const pad = 28;
  // Guard a flat/empty series so we never divide by zero or NaN the geometry.
  const peak = Math.max(0, ...data.map((d) => d.value));
  const max = peak > 0 ? peak * 1.1 : 1;
  const min = 0;
  const stepX = data.length > 1 ? (width - pad * 2) / (data.length - 1) : 0;
  const y = (v: number) =>
    height - pad - ((v - min) / (max - min)) * (height - pad * 2);
  const x = (i: number) => pad + i * stepX;

  const line = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ');
  const area = `${pad},${height - pad} ${line} ${x(data.length - 1)},${height - pad}`;

  // Highlight the most recent point (the live "where you are now"), with a
  // tooltip showing its real value — no hardcoded numbers.
  const hi = data.length - 1;
  const hiPoint = data[hi];
  const tipTitle = seriesLabel ?? (hiPoint ? pointLabel(hiPoint) : '');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      role="img"
      aria-label={seriesLabel ?? 'Series over time'}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <linearGradient id="areaGlow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.16" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line
          key={f}
          x1={pad}
          x2={width - pad}
          y1={height - pad - f * (height - pad * 2)}
          y2={height - pad - f * (height - pad * 2)}
          stroke="rgba(var(--color-overlay-rgb), 0.04)"
          strokeWidth={1}
        />
      ))}
      <polygon points={area} fill="url(#areaGlow)" />
      <polyline points={line} fill="none" stroke={accent} strokeWidth={2.5} />

      {hiPoint && peak > 0 && (
        <>
          <line
            x1={x(hi)}
            y1={y(hiPoint.value)}
            x2={x(hi)}
            y2={height - pad}
            stroke="rgba(var(--color-accent-rgb), 0.45)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <circle
            cx={x(hi)}
            cy={y(hiPoint.value)}
            r={5.5}
            fill={accent}
            stroke="var(--color-bg)"
            strokeWidth={1.5}
          />
          {/* Tooltip with the point's real value. Clamp x so it stays on-canvas. */}
          <g
            transform={`translate(${Math.max(2, Math.min(width - 122, x(hi) - 60))}, ${Math.max(2, y(hiPoint.value) - 58)})`}
          >
            <rect
              width="120"
              height="44"
              rx="6"
              fill="var(--color-bg-elevated)"
              stroke="rgba(var(--color-overlay-rgb), 0.1)"
              strokeWidth="1"
              style={{ filter: 'drop-shadow(0 8px 24px rgba(0, 0, 0, 0.6))' }}
            />
            <text x="10" y="16" fill="var(--color-text-dim)" fontSize="9" fontWeight="600" letterSpacing="0.4">
              {tipTitle}
            </text>
            <circle cx="14" cy="29" r="3.5" fill="var(--color-accent-bright)" />
            <text x="24" y="32" fill="var(--color-text)" fontSize="10" fontWeight="bold">
              {seriesLabel ? 'Latest' : pointLabel(hiPoint)}
            </text>
            <text x="110" y="32" fill="var(--color-text)" fontSize="10" fontWeight="bold" textAnchor="end">
              {format(hiPoint.value)}
            </text>
          </g>
        </>
      )}

      {data.map((d, i) => {
        if (i === hi) return null;
        return (
          <g key={`${pointLabel(d)}-${i}`}>
            <circle cx={x(i)} cy={y(d.value)} r={3} fill={accent} opacity={0.7} />
            <text
              x={x(i)}
              y={height - 8}
              fontSize={10}
              fontWeight="500"
              fill="var(--color-text-dim)"
              textAnchor="middle"
            >
              {pointLabel(d)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}


export function BarMini({
  data,
  height = 180,
  accent = 'var(--color-text-muted)',
}: {
  data: AreaPoint[];
  height?: number;
  accent?: string;
}): JSX.Element {
  const width = 520;
  const pad = 28;
  // Guard an all-zero series so bar heights never become 0/0 = NaN.
  const peak = Math.max(0, ...data.map((d) => d.value));
  const max = peak > 0 ? peak * 1.1 : 1;
  const barW = (width - pad * 2) / data.length - 10;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img">
      {data.map((d, i) => {
        const h = ((d.value / max) * (height - pad * 2));
        const x = pad + i * ((width - pad * 2) / data.length) + 5;
        return (
          <g key={pointLabel(d)}>
            <rect
              x={x}
              y={height - pad - h}
              width={barW}
              height={h}
              rx={4}
              fill={accent}
              fillOpacity={0.85}
            />
            <text
              x={x + barW / 2}
              y={height - 8}
              fontSize={10}
              fill="var(--color-text-dim)"
              textAnchor="middle"
            >
              {pointLabel(d)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function DonutChart({
  data,
  size = 132,
  ariaLabel = 'Breakdown',
}: {
  data: { name: string; value: number; color: string }[];
  size?: number;
  ariaLabel?: string;
}): JSX.Element | null {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return null;

  const r = size / 2;
  const inner = r * 0.62;
  const ring = r - inner;

  // A single non-zero slice (100%) makes a degenerate arc whose start and end
  // points coincide — SVG draws nothing. Render it as a full ring instead.
  const nonZero = data.filter((d) => d.value > 0);
  if (nonZero.length === 1) {
    return (
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={ariaLabel}>
        <circle
          cx={r}
          cy={r}
          r={(r + inner) / 2}
          fill="none"
          stroke={nonZero[0]!.color}
          strokeWidth={ring}
        />
      </svg>
    );
  }

  let angle = -Math.PI / 2;
  const arcs = nonZero.map((d) => {
    const frac = d.value / total;
    const start = angle;
    const end = angle + frac * Math.PI * 2;
    angle = end;
    const large = end - start > Math.PI ? 1 : 0;
    const x1 = r + r * Math.cos(start);
    const y1 = r + r * Math.sin(start);
    const x2 = r + r * Math.cos(end);
    const y2 = r + r * Math.sin(end);
    const xi2 = r + inner * Math.cos(end);
    const yi2 = r + inner * Math.sin(end);
    const xi1 = r + inner * Math.cos(start);
    const yi1 = r + inner * Math.sin(start);
    return {
      color: d.color,
      d: `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${inner} ${inner} 0 ${large} 0 ${xi1} ${yi1} Z`,
    };
  });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={ariaLabel}>
      {arcs.map((a, i) => (
        <path key={i} d={a.d} fill={a.color} />
      ))}
    </svg>
  );
}
