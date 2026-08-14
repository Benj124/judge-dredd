import { listRubricsHttp, saveRubricHttp } from "@/lib/eval/http";

export const runtime = "nodejs";

export async function GET() {
  return listRubricsHttp();
}

export async function POST(request: Request) {
  return saveRubricHttp(request);
}

export async function PUT(request: Request) {
  return saveRubricHttp(request);
}
