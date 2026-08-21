import { passIcon, passLabel, passTone } from "@/lib/eval/format";
import { Badge } from "@/components/ui/badge";

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

  return (
    <Badge tone={tone} size={size} aria-label={label}>
      <span aria-hidden="true" className="font-mono leading-none">
        {icon}
      </span>
      <span>{label}</span>
    </Badge>
  );
}
