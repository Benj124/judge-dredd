import { BatchComparePanel } from "@/components/BatchComparePanel";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function BatchPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <Link href="/" className="text-sm text-muted underline">
        ← Dashboard
      </Link>
      <h1 className="font-display text-4xl tracking-tight">Batch and compare</h1>
      <BatchComparePanel />
    </div>
  );
}
