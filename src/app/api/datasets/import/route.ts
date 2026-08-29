import { importDatasetHttp } from "@/lib/eval/synthDatasetHttp";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return importDatasetHttp(request);
}
