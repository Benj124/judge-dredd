import { listSynthesisTemplatesHttp } from "@/lib/graph/synthesizeHttp";

export const runtime = "nodejs";

export async function GET() {
  return listSynthesisTemplatesHttp();
}
