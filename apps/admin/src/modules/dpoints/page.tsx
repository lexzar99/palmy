"use client";

import { useState } from "react";
import { PageHeader, Tabs } from "@/shared/components/ui";
import OverviewTab from "./tabs/OverviewTab";
import RewardsTab from "./tabs/RewardsTab";
import VarvaVanTab from "./tabs/VarvaVanTab";
import WelcomeTab from "./tabs/WelcomeTab";
import SponsorsTab from "./tabs/SponsorsTab";
import ActivityTab from "./tabs/ActivityTab";

type TabKey = "overview" | "rewards" | "varvavan" | "welcome" | "sponsors" | "activity";

export function DpointsPage() {
  const [tab, setTab] = useState<TabKey>("overview");
  return (
    <div className="page-stack">
      <PageHeader title="Lojalitet" />
      <Tabs<TabKey>
        value={tab}
        onChange={setTab}
        scroll
        options={[
          { value: "overview", label: "Översikt" },
          { value: "rewards", label: "Belöningar" },
          { value: "varvavan", label: "Värva vän" },
          { value: "welcome", label: "Välkomstkampanj" },
          { value: "sponsors", label: "Sponsorkort" },
          { value: "activity", label: "Aktivitet" },
        ]}
      />
      {tab === "overview" && <OverviewTab />}
      {tab === "rewards" && <RewardsTab />}
      {tab === "varvavan" && <VarvaVanTab />}
      {tab === "welcome" && <WelcomeTab />}
      {tab === "sponsors" && <SponsorsTab />}
      {tab === "activity" && <ActivityTab />}
    </div>
  );
}
