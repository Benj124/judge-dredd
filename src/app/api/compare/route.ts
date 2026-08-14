import { compareRunsHttp } from "@/lib/eval/compareHttp";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return compareRunsHttp(request);
}
