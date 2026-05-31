import { Dashboard } from "@/components/Dashboard";
import { spendguardConfig } from "@/server/config/spendguard";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <Dashboard
      erc7710PaidPocConfig={{
        amountAtomic: spendguardConfig.erc7710PaidPoc.priceAtomic,
        enabled: spendguardConfig.erc7710PaidPoc.enabled,
        priceLabel: spendguardConfig.erc7710PaidPoc.priceLabel
      }}
    />
  );
}
