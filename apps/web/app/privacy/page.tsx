import type { Metadata } from "next";
import { getCompanyInfo } from "@/lib/companyInfo";
import PrivacyContent from "./PrivacyContent";

export const metadata: Metadata = {
  title: "Integritetspolicy | ViaEats",
  description: "Hur ViaEats behandlar dina personuppgifter enligt GDPR.",
};

export default async function PrivacyPage() {
  const info = await getCompanyInfo();
  return (
    <PrivacyContent
      company={{
        name: info.name,
        organizationNumber: info.organizationNumber,
        address: info.address,
        email: info.supportEmail,
        privacyEmail: info.privacyEmail,
      }}
    />
  );
}
