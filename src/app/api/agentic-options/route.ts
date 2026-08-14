import {
  getAgenticOptionsHttp,
  saveAgenticOptionsHttp,
} from "@/lib/eval/http";

export const runtime = "nodejs";

export async function GET() {
  return getAgenticOptionsHttp();
}

export async function PUT(request: Request) {
  return saveAgenticOptionsHttp(request);
}

export async function POST(request: Request) {
  return saveAgenticOptionsHttp(request);
}
