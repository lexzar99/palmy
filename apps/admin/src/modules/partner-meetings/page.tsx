"use client";

import { PageHeader } from "@/shared/components/ui";
import { BookedMeetings } from "./BookedMeetings";

export function PartnerMeetingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Bokade möten" />
      <BookedMeetings />
    </div>
  );
}
