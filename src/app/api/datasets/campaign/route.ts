import { campaignFromGoldHttp } from "@/lib/eval/synthDatasetHttp";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  return campaignFromGoldHttp(request);
}
