import { exportDatasetHttp } from "@/lib/eval/synthDatasetHttp";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return exportDatasetHttp(request);
}
