import { HoldingDashboard } from "../../../components/holding-dashboard";
import { getHoldingDashboardData } from "../../../lib/data";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ coin: string }> };

export default async function HoldingPage({ params }: Props) {
  const { coin } = await params;
  const data = await getHoldingDashboardData(coin);
  return <HoldingDashboard initialData={data} />;
}
