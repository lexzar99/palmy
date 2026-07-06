import type { Metadata } from "next";
import { getCompanyInfo } from "@/lib/companyInfo";
import TermsContent from "./TermsContent";

export const metadata: Metadata = {
  title: "Allmänna villkor | ViaEats",
  description: "Villkoren för att beställa mat via ViaEats, beställningsplattformen som kopplar dig till lokala restauranger.",
};

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
