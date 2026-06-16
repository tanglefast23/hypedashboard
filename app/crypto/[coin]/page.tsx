import { Dashboard } from "../../../components/dashboard";
import { getAssetDashboardData } from "../../../lib/data";

export const dynamic = "force-dynamic";

const SUPPORTED = new Set(["NEAR", "ZEC", "SPCX", "SPX"]);

type Props = { params: Promise<{ coin: string }> };

export default async function CryptoPage({ params }: Props) {
  const { coin } = await params;
  const symbol = decodeURIComponent(coin).toUpperCase();
  const data = await getAssetDashboardData(SUPPORTED.has(symbol) ? symbol : "NEAR");
  return <Dashboard initialData={data} />;
}
