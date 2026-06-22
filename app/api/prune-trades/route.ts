import { NextRequest, NextResponse } from "next/server";
import { pruneDashboardTrades } from "../../../lib/trade-history";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const trades = await pruneDashboardTrades();
    return NextResponse.json({ trades, prunedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown prune error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
