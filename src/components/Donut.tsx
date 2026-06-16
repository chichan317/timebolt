export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

interface DonutProps {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  /** Short text in the centre (e.g. the total). */
  centerLabel?: string;
  centerSub?: string;
  /** Describes the whole chart for screen readers. */
  ariaLabel: string;
}

/**
 * A small accessible donut chart. Colour is decorative only — the surrounding
 * legend carries the names, values and percentages, and `ariaLabel` summarises
 * the chart for screen readers.
 */
export function Donut({
  slices,
  size = 168,
  thickness = 26,
  centerLabel,
  centerSub,
  ariaLabel,
}: DonutProps) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;

  let acc = 0;
  const segments = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const len = (s.value / total) * c;
      const start = acc;
      acc += len;
      return { ...s, len, start };
    });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={ariaLabel}
      className="donut"
    >
      <g transform={`rotate(-90 ${cx} ${cx})`}>
        {/* Track */}
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={thickness} />
        {total > 0 &&
          segments.map((s) => (
            <circle
              key={s.label}
              cx={cx}
              cy={cx}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${Math.max(0, s.len - 1.5)} ${c - Math.max(0, s.len - 1.5)}`}
              strokeDashoffset={-s.start}
              strokeLinecap="butt"
            />
          ))}
      </g>
      {centerLabel && (
        <text x={cx} y={cx} className="donut-center" textAnchor="middle" dominantBaseline="middle">
          <tspan x={cx} dy="-0.2em" className="donut-center-main">
            {centerLabel}
          </tspan>
          {centerSub && (
            <tspan x={cx} dy="1.4em" className="donut-center-sub">
              {centerSub}
            </tspan>
          )}
        </text>
      )}
    </svg>
  );
}
