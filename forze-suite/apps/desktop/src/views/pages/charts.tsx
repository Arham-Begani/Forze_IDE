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
}: {
  data: AreaPoint[];
  height?: number;
  accent?: string;
}): JSX.Element {
  const width = 560;
  const pad = 28;
  const max = Math.max(...data.map((d) => d.value)) * 1.1;
  const min = 0;
  const stepX = (width - pad * 2) / (data.length - 1);
  const y = (v: number) =>
    height - pad - ((v - min) / (max - min)) * (height - pad * 2);
  const x = (i: number) => pad + i * stepX;

  const line = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ');
  const area = `${pad},${height - pad} ${line} ${x(data.length - 1)},${height - pad}`;

  // Find index of 'Mar' to highlight it like in the mockup image
  const marIndex = data.findIndex((d) => pointLabel(d) === 'Mar');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      role="img"
      aria-label="Revenue over time"
      style={{ overflow: 'visible' }}
    >
      <defs>
        <linearGradient id="areaGlow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.0" />
        </linearGradient>
        <filter id="lineShadow" x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="var(--color-accent)" floodOpacity="0.3" />
        </filter>
      </defs>
      
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line
          key={f}
          x1={pad}
          x2={width - pad}
          y1={height - pad - f * (height - pad * 2)}
          y2={height - pad - f * (height - pad * 2)}
          stroke="rgba(255,255,255,0.03)"
          strokeWidth={1}
        />
      ))}
      <polygon points={area} fill="url(#areaGlow)" />
      <polyline points={line} fill="none" stroke={accent} strokeWidth={2.5} filter="url(#lineShadow)" />

      {/* Dotted indicator for March if present */}
      {marIndex !== -1 && (
        <>
          <line
            x1={x(marIndex)}
            y1={y(data[marIndex]!.value)}
            x2={x(marIndex)}
            y2={height - pad}
            stroke="rgba(0, 212, 255, 0.45)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <circle
            cx={x(marIndex)}
            cy={y(data[marIndex]!.value)}
            r={5.5}
            fill={accent}
            stroke="#ffffff"
            strokeWidth={1.5}
            style={{ filter: 'drop-shadow(0 0 6px var(--color-accent))' }}
          />
          
          {/* Tooltip Card matching the reference image */}
          <g transform={`translate(${x(marIndex) - 60}, ${y(data[marIndex]!.value) - 58})`}>
            <rect
              width="120"
              height="44"
              rx="6"
              fill="rgba(15, 15, 22, 0.95)"
              stroke="rgba(255, 255, 255, 0.08)"
              strokeWidth="1"
              style={{ filter: 'drop-shadow(0 8px 24px rgba(0, 0, 0, 0.6))' }}
            />
            <text x="10" y="16" fill="var(--color-text-dim)" fontSize="9" fontWeight="600" letterSpacing="0.4">
              Mar 2024
            </text>
            <circle cx="14" cy="29" r="3.5" fill="var(--color-accent-bright)" />
            <text x="24" y="32" fill="#ffffff" fontSize="10" fontWeight="bold">
              Revenue
            </text>
            <text x="110" y="32" fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="end">
              $26,420
            </text>
          </g>
        </>
      )}

      {data.map((d, i) => {
        // Skip March circle rendering here since we custom render it glowing
        if (i === marIndex) return null;
        return (
          <g key={pointLabel(d)}>
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
  accent = '#ededed',
}: {
  data: AreaPoint[];
  height?: number;
  accent?: string;
}): JSX.Element {
  const width = 520;
  const pad = 28;
  const max = Math.max(...data.map((d) => d.value)) * 1.1;
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
}: {
  data: { name: string; value: number; color: string }[];
  size?: number;
}): JSX.Element {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = size / 2;
  const inner = r * 0.62;
  let angle = -Math.PI / 2;

  const arcs = data.map((d) => {
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
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Top referrers">
      {arcs.map((a, i) => (
        <path key={i} d={a.d} fill={a.color} />
      ))}
    </svg>
  );
}
