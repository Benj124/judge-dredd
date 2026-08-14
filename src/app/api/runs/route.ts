import { listRunsHttp } from "@/lib/db/historyHttp";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return listRunsHttp(request);
}
