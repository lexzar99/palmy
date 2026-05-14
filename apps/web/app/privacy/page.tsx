import { getCompanyInfo } from "@/lib/companyInfo";
import PrivacyContent from "./PrivacyContent";

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
