import { getRunHttp } from "@/lib/db/historyHttp";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return getRunHttp(id);
}
