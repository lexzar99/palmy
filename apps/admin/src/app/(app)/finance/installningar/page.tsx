import { redirect } from "next/navigation";

// Satserna bor numera som flik under Ekonomi.
export default function FinanceSettingsRoutePage() {
  redirect("/finance/restauranger?tab=satser");
}
