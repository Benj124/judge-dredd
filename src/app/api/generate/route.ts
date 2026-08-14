import { generateHttp } from "@/lib/eval/generateHttp";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  return generateHttp(request);
}
