"use client";

import { AppProvider, useApp } from "@/context/AppContext";
import LoginPage from "@/components/LoginPage";
import Dashboard from "@/components/Dashboard";
import MainDataPage from "@/components/MainDataPage";
import EditDataPage from "@/components/EditDataPage";
import ProcessPage from "@/components/ProcessPage";
import VenueDetailPage from "@/components/VenueDetailPage";
import ManpowerDashboardPage from "@/components/ManpowerDashboardPage";
import CityDatcDotcPage from "@/components/CityDatcDotcPage";
import MasterVenueCoverageMapPage from "@/components/MasterVenueCoverageMapPage";
import OccupancyDashboardPage from "@/components/OccupancyDashboardPage";

function FullPageLoader() {
  return (
    <div className="loading-screen">
      <div className="loader" />
      <p>Loading application...</p>
    </div>
  );
}

function AccessNotice({ text }) {
  if (!text) return null;
  return <div className="inline-error" style={{ margin: "12px 24px 0" }}>{text}</div>;
}

function AppShell() {
  const { hydrated, page, user, notice } = useApp();

  if (!hydrated) return <FullPageLoader />;

  if (page === "login") return <LoginPage />;
  if (page === "dashboard") return <><AccessNotice text={notice} /><Dashboard /></>;

  if (page === "main") {
    if (!user) return <LoginPage />;
    return <><AccessNotice text={notice} /><MainDataPage /></>;
  }
  if (page === "edit") {
    if (!user) return <LoginPage />;
    return <><AccessNotice text={notice} /><EditDataPage /></>;
  }
  if (page === "process") {
    if (!user) return <LoginPage />;
    return <><AccessNotice text={notice} /><ProcessPage /></>;
  }
  if (page === "venue_detail") {
    if (!user || !["Admin", "Prafull"].includes(user.user)) return <LoginPage />;
    return <><AccessNotice text={notice} /><VenueDetailPage /></>;
  }
  if (page === "manpower_dashboard") {
    if (!user || !["Admin", "Prafull"].includes(user.user)) return <LoginPage />;
    return <><AccessNotice text={notice} /><ManpowerDashboardPage /></>;
  }
  if (page === "city_datc_dotc") {
    if (!user || !["Admin", "Prafull"].includes(user.user)) return <LoginPage />;
    return <><AccessNotice text={notice} /><CityDatcDotcPage /></>;
  }
  if (page === "master_map") {
    if (!user || !["Admin", "Prafull"].includes(user.user)) return <LoginPage />;
    return <><AccessNotice text={notice} /><MasterVenueCoverageMapPage /></>;
  }
  if (page === "occupancy_dashboard") {
    if (!user || !["Admin", "Prafull"].includes(user.user)) return <LoginPage />;
    return <><AccessNotice text={notice} /><OccupancyDashboardPage /></>;
  }

  return <Dashboard />;
}

export default function RootPage() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
