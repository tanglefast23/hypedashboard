import { NextRequest, NextResponse } from "next/server";
import { getHoldingDashboardData } from "../../../lib/data";

export async function GET(request: NextRequest) {
  const coin = request.nextUrl.searchParams.get("coin");
  if (!coin) return NextResponse.json({ error: "coin is required" }, { status: 400 });
  const data = await getHoldingDashboardData(coin);
  return NextResponse.json(data, { headers: { "Cache-Control": "s-maxage=30, stale-while-revalidate=90" } });
}
