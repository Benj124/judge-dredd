import { listDatasetHttp } from "@/lib/eval/http";

export const runtime = "nodejs";

export async function GET() {
  return listDatasetHttp();
}
