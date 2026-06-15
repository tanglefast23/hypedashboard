import { NextRequest, NextResponse } from "next/server";
import { getAssetDashboardData, getDashboardData } from "../../../lib/data";
import { saveCrowdingSnapshot } from "../../../lib/crowding-history";
import { collectHypeTrades } from "../../../lib/trade-history";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const trades = await collectHypeTrades();
    const dashboards = await Promise.all([
      getDashboardData(),
      getAssetDashboardData("NEAR"),
      getAssetDashboardData("ZEC"),
    ]);
    const crowding = await Promise.all(dashboards.map((dashboard) => saveCrowdingSnapshot(dashboard.crowding, dashboard.asset.symbol)));
    return NextResponse.json({ crowding, trades, collectedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown collector error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
