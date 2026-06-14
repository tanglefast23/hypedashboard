import { NextResponse } from "next/server";
import { getChartRange } from "../../../lib/chart-ranges";
import { getCandles } from "../../../lib/data";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const range = getChartRange(url.searchParams.get("range"));
    const candles = await getCandles(range.id);
    return NextResponse.json({ candles, range }, { headers: cacheHeaders() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function cacheHeaders(): HeadersInit {
  return { "Cache-Control": "s-maxage=15, stale-while-revalidate=45" };
}
