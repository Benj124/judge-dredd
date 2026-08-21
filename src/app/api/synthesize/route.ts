import { synthesizeHttp } from "@/lib/graph/synthesizeHttp";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  return synthesizeHttp(request);
}
