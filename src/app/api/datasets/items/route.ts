import { listDatasetItemsHttp } from "@/lib/eval/synthDatasetHttp";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return listDatasetItemsHttp(request);
}
