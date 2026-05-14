import { getCompanyInfo } from "@/lib/companyInfo";
import TermsContent from "./TermsContent";

export default async function TermsPage() {
  const info = await getCompanyInfo();
  return (
    <TermsContent
      company={{
        name: info.name,
        organizationNumber: info.organizationNumber,
        address: info.address,
        email: info.supportEmail,
      }}
    />
  );
}
