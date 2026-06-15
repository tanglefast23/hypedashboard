import { NextResponse } from "next/server";
import { getAssetDashboardData } from "../../../lib/data";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const coin = url.searchParams.get("coin") ?? "HYPE";
    const data = await getAssetDashboardData(coin);
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "s-maxage=30, stale-while-revalidate=90",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
