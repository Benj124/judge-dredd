import { passIcon, passLabel, passTone } from "@/lib/eval/format";

const TONE_CLASS: Record<ReturnType<typeof passTone>, string> = {
  pass: "bg-pass-bg text-pass border-pass/25",
  fail: "bg-fail-bg text-fail border-fail/25",
  neutral: "bg-surface-muted text-muted border-border",
};

export function PassFailBadge({
  passed,
  size = "md",
}: {
  passed: boolean | null | undefined;
  size?: "sm" | "md";
}) {
  const tone = passTone(passed);
  const label = passLabel(passed);
  const icon = passIcon(passed);
  const sizing =
    size === "sm"
      ? "gap-1 px-2 py-0.5 text-[11px]"
      : "gap-1.5 px-3 py-1 text-xs";

  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-flex items-center rounded-full border font-semibold tracking-wide ${TONE_CLASS[tone]} ${sizing}`}
    >
      <span aria-hidden="true" className="font-mono leading-none">
        {icon}
      </span>
      <span>{label}</span>
    </span>
  );
}
