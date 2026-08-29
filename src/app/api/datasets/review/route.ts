import { reviewDatasetHttp } from "@/lib/eval/synthDatasetHttp";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return reviewDatasetHttp(request);
}
