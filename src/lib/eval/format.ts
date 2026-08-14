export function formatOverall(score: number): string {
  if (!Number.isFinite(score)) return "—";
  return (Math.round(score * 100) / 100).toFixed(2);
}

export type PassTone = "pass" | "fail" | "neutral";

export function passLabel(passed: boolean | null | undefined): string {
  if (passed === true) return "Pass";
  if (passed === false) return "Fail";
  return "No rule";
}

export function passTone(passed: boolean | null | undefined): PassTone {
  if (passed === true) return "pass";
  if (passed === false) return "fail";
  return "neutral";
}

/** Short icon glyph for pass/fail/no-rule badges (accessible label is separate). */
export function passIcon(passed: boolean | null | undefined): string {
  if (passed === true) return "✓";
  if (passed === false) return "✕";
  return "–";
}

export function scalePercent(score: number, min: number, max: number): number {
  if (!Number.isFinite(score) || !Number.isFinite(min) || !Number.isFinite(max)) {
    return 0;
  }
  if (max <= min) return 0;
  const pct = ((score - min) / (max - min)) * 100;
  return Math.min(100, Math.max(0, pct));
}

export function formatScoreOnScale(score: number, max: number): string {
  const right = Number.isInteger(max) ? String(max) : formatOverall(max);
  return `${formatOverall(score)} / ${right}`;
}
