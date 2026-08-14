import { evaluateHttp } from "@/lib/eval/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return evaluateHttp(request);
}
