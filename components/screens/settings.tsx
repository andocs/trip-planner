"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { CategoriesSection } from "@/components/settings/categories-section";
import { DestinationsSection } from "@/components/settings/destinations-section";
import { InviteSection } from "@/components/settings/invite-section";
import { TripTools } from "@/components/settings/trip-tools";
import { TravelersSection } from "@/components/settings/travelers-section";
import { TripForm } from "@/components/settings/trip-form";
import { useTheme, type ThemePref } from "@/components/theme";
import { AccountSection } from "@/components/settings/account-section";
import { ViewersSection } from "@/components/settings/viewers-section";
import { TripGate, useCanEdit } from "@/components/trip-gate";
import { ViewOnlyBanner } from "@/components/view-only-banner";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";

function Appearance() {
  const [pref, setPref] = useTheme();
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3">
      <CardTitle>Theme</CardTitle>
      <Segmented<ThemePref>
        label="Theme"
        value={pref}
        onChange={setPref}
        options={[
          { value: "light", label: "Light" },
          { value: "dark", label: "Night" },
          { value: "system", label: "System" },
        ]}
      />
    </Card>
  );
}

export function SettingsScreen() {
  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="-ml-2 lg:hidden">
          <Link href="/" aria-label="Back to Home">
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Settings</h1>
      </header>
      <TripGate>
        <SettingsBody />
      </TripGate>
    </div>
  );
}

function SettingsBody() {
  const canEdit = useCanEdit();
  if (!canEdit) {
    return (
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="lg:col-span-2">
          <ViewOnlyBanner />
        </div>
        <Appearance />
        <AccountSection />
      </div>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <div className="space-y-4">
        <TripForm />
        <InviteSection />
        <ViewersSection />
        <TripTools />
      </div>
      <div className="space-y-4">
        <TravelersSection />
        <DestinationsSection />
        <CategoriesSection />
        <Appearance />
        <AccountSection />
      </div>
    </div>
  );
}
