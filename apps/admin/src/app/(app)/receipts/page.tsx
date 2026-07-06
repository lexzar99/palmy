import { redirect } from "next/navigation";

// Kvitto-mallen bor numera som flik under Inställningar.
export default function ReceiptsRoutePage() {
  redirect("/platform-settings?tab=kvitto");
}
