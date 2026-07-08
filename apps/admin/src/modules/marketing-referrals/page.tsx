"use client";

import { useState } from "react";
import { PageHeader, Tabs } from "@/shared/components/ui";
import VarvaVanTab from "./VarvaVanTab";
import WelcomeTab from "./WelcomeTab";

type TabKey = "varvavan" | "welcome";

// Värvning + välkomstrabatt. Egen sida sedan poängsystemet avvecklades.
export function ReferralsPage() {
  const [tab, setTab] = useState<TabKey>("varvavan");
  return (
    <div className="page-stack">
      <PageHeader breadcrumb="Tillväxt" title="Värva vän" />
      <Tabs<TabKey>
        value={tab}
        onChange={setTab}
        options={[
          { value: "varvavan", label: "Värvningar" },
          { value: "welcome", label: "Välkomst" },
        ]}
      />
      {tab === "varvavan" && <VarvaVanTab />}
      {tab === "welcome" && <WelcomeTab />}
    </div>
  );
}
