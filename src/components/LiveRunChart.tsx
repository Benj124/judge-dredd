import { runningMean } from "@/lib/eval/stream";

export type LiveMetricPoint = {
  id: string;
  accuracy: number | null;
  ttftMs: number | null;
};

function polyline(
  values: Array<number | null>,
  width: number,
  height: number,
  min: number,
  max: number,
): string {
  const usable = values
    .map((value, index) => ({ value, index }))
    .filter((item): item is { value: number; index: number } => item.value !== null);
  if (usable.length === 0) return "";
  const span = Math.max(max - min, 0.001);
  return usable
    .map(({ value, index }) => {
      const x =
        values.length <= 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function LiveRunChart({ points }: { points: LiveMetricPoint[] }) {
  const accuracies = points.map((point) => point.accuracy);
  const ttfts = points.map((point) => point.ttftMs);
  const accValues = accuracies.filter((value): value is number => value !== null);
  const ttftValues = ttfts.filter((value): value is number => value !== null);
  const accMean = runningMean(accValues);
  const ttftMean = runningMean(ttftValues);
  const last = points[points.length - 1];

  const width = 560;
  const height = 120;
  const accLine = polyline(accuracies, width, height, 1, 5);
  const maxTtft = Math.max(200, ...ttftValues, 1);
  const ttftLine = polyline(ttfts, width, height, 0, maxTtft);

  return (
    <div className="rounded-2xl border border-border bg-background/60 p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            Live run
          </p>
          <div className="mt-2 flex flex-wrap gap-6">
            <div>
              <p className="text-xs text-muted">Accuracy (avg)</p>
              <p className="font-display text-3xl leading-none">
                {accMean == null ? "—" : accMean.toFixed(2)}
              </p>
              <p className="mt-1 text-xs text-muted">
                latest {last?.accuracy != null ? last.accuracy.toFixed(2) : "—"} · n=
                {accValues.length}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">TTFT (avg)</p>
              <p className="font-display text-3xl leading-none">
                {ttftMean == null ? "—" : `${Math.round(ttftMean)}ms`}
              </p>
              <p className="mt-1 text-xs text-muted">
                latest{" "}
                {last?.ttftMs != null ? `${Math.round(last.ttftMs)}ms` : "—"} · n=
                {ttftValues.length}
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-accent" /> Accuracy (1–5)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-pending" /> TTFT
          </span>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-4 h-32 w-full"
        role="img"
        aria-label="Accuracy and TTFT as responses arrive"
      >
        <line
          x1="0"
          y1={height}
          x2={width}
          y2={height}
          className="stroke-border"
          strokeWidth="1"
        />
        {accLine ? (
          <polyline
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={accLine}
          />
        ) : null}
        {ttftLine ? (
          <polyline
            fill="none"
            stroke="var(--pending)"
            strokeWidth="2"
            strokeDasharray="4 3"
            strokeLinejoin="round"
            points={ttftLine}
          />
        ) : null}
      </svg>
      {points.length === 0 ? (
        <p className="text-xs text-muted">
          The graph fills in as generate/evaluate responses arrive.
        </p>
      ) : (
        <p className="text-xs text-muted">{points.length} responses plotted</p>
      )}
    </div>
  );
}
