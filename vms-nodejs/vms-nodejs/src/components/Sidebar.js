"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, ChevronsLeft } from "lucide-react";
import { useApp } from "@/context/AppContext";

const FILTER_SECTIONS = [
  {
    title: "Geographical Distribution",
    items: [
      { key: "region", label: "Regions" },
      { key: "state", label: "State" },
      { key: "examCityCentre", label: "Exam City" },
    ],
  },
  {
    title: "Projects",
    items: [
      { key: "projectName", label: "Name" },
      { key: "projectMonth", label: "Month-wise" },
    ],
  },
  {
    title: "Venue Ratings Grading",
    items: [
      { key: "category", label: "Category (A-C)" },
      { key: "status", label: "Status (Active/Good)" },
    ],
  },
  {
    title: "Manpower details",
    items: [
      { key: "examWise", label: "Exam wise" },
      { key: "roles", label: "Roles" },
      { key: "documents", label: "Documents" },
    ],
  },
  {
    title: "DATC & DOTC inventory",
    items: [
      { key: "venueType", label: "Type (DOTC/DATC)" },
    ],
  },
];

function QuickActions() {
  const { goTo } = useApp();

  return (
    <>
      <div className="selection-card selection-card--fixed">
        <div className="selection-title">Quick Actions</div>
        <div className="selection-item">Navigate to admin tools instantly</div>
      </div>

      <button className="btn-outline" onClick={() => goTo("main", { requiresAuth: true })}>
        Manage Master Data
      </button>
      <button
        className="btn-outline"
        onClick={() => goTo("process", { requiresAuth: true, allowedUsers: ["Admin", "Prafull"] })}
      >
        Process Analysis Engine
      </button>
      <button
        className="btn-outline"
        onClick={() => goTo("manpower_dashboard", { requiresAuth: true, allowedUsers: ["Admin", "Prafull"] })}
      >
        Manpower Details
      </button>
      <button
        className="btn-outline"
        onClick={() => goTo("city_datc_dotc", { requiresAuth: true, allowedUsers: ["Admin", "Prafull"] })}
      >
        DATC &amp; DOTC Inventory Summary
      </button>
    </>
  );
}

export default function Sidebar({
  filterOptions,
  selectedFilters,
  onToggleFilter,
  onSelectAll,
  onClearAll,
  onResetAll,
  venueSearchConfig = null,
  mobileOpen = false,
  onToggleMobile = () => {},
}) {
  const { user, logout, goTo, sidebarCollapsed, setSidebarCollapsed, openVenueDetail } = useApp();
  const [openGroups, setOpenGroups] = useState({});
  const [openSections, setOpenSections] = useState(() =>
    Object.fromEntries(FILTER_SECTIONS.map((section) => [section.title, false]))
  );
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const options = {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      };
      setCurrentTime(now.toLocaleString("en-GB", options).replace(",", ""));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const isDynamic =
    !!filterOptions &&
    !!selectedFilters &&
    typeof onToggleFilter === "function" &&
    typeof onSelectAll === "function" &&
    typeof onClearAll === "function";

  const selectedCount = (key) => (selectedFilters?.[key] || []).length;
  const totalCount = (key) => (filterOptions?.[key] || []).length;

  const adminButtonLabel = useMemo(() => {
    if (!user) return "Admin Login";
    return `Logout (${user.user})`;
  }, [user]);

  const handleAdminButton = () => {
    if (!user) {
      goTo("login");
      return;
    }
    logout();
  };

  const canOpenVenueDetail = Boolean(user && ["Admin", "Prafull"].includes(user.user));
  const venueSearchResults = venueSearchConfig?.results || [];
  const venueSearchQuery = (venueSearchConfig?.query || "").trim();

  return (
    <>
      <button
        className={`sidebar-breadcrumb-toggle ${sidebarCollapsed ? "is-collapsed" : ""}`}
        onClick={() => setSidebarCollapsed((prev) => !prev)}
        aria-label={sidebarCollapsed ? "Show left panel" : "Hide left panel"}
        title={sidebarCollapsed ? "Show left panel" : "Hide left panel"}
      >
        <span className="crumb-symbol">{sidebarCollapsed ? ">" : "<"}</span>
        <span className="sidebar-toggle-handle" />
      </button>

      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""} ${sidebarCollapsed ? "sidebar-desktop-collapsed" : ""}`}>
        <button className="sidebar-collapse-btn" onClick={onToggleMobile} aria-label="Close sidebar">
          <ChevronsLeft size={20} />
        </button>

        {user ? (
          <div className="sidebar-welcome">
            <div className="sidebar-welcome-title">
              Welcome, {user.user}
            </div>
            <div className="sidebar-welcome-time">
              <span className="sidebar-welcome-dot" />
              {currentTime}
            </div>
          </div>
        ) : null}

        {venueSearchConfig ? (
          <div className="search-card sidebar-venue-search">
            <div className="search-title">Venue Search</div>
            <div className="search-desc">
              Search by venue name, DMS code, city, or keyword.
            </div>
            <div className="search-flex">
              <input
                type="text"
                className="search-input"
                placeholder={venueSearchConfig.placeholder || "Search venue..."}
                value={venueSearchConfig.input || ""}
                onChange={(event) => venueSearchConfig.onInputChange?.(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    venueSearchConfig.onSearch?.();
                  }
                }}
              />
              <button className="search-btn" onClick={() => venueSearchConfig.onSearch?.()}>
                Search Venue
              </button>
            </div>

            {venueSearchQuery ? (
              <div className="search-results">
                {venueSearchResults.slice(0, 6).map((row) => {
                  const st = String(row.status || "").toUpperCase();
                  const stClass = st === "ACTIVE" ? "search-status-active" : st.includes("BLACKLIST") ? "search-status-blacklisted" : "search-status-inactive";
                  const stIcon = st === "ACTIVE" ? "OK" : st.includes("BLACKLIST") ? "!" : "-";
                  return (
                    <div key={row.dmsCode} className="search-result-row">
                      <div>
                        <strong>{row.dmsCode}</strong> - {row.name || "Unnamed Venue"}
                        <span className={`search-status-pill ${stClass}`} style={{ marginLeft: 8 }}>{stIcon} {row.status}</span>
                        <div className="result-sub">{row.city}, {row.state} - Category: {row.category}</div>
                      </div>
                      <button
                        className="search-result-btn"
                        onClick={() => openVenueDetail(row.dmsCode)}
                        disabled={!canOpenVenueDetail}
                      >
                        View
                      </button>
                    </div>
                  );
                })}
                {venueSearchResults.length > 6 ? (
                  <div className="result-sub">Showing first 6 matches</div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {isDynamic ? (
          <button className="btn-outline" onClick={onResetAll}>
            Reset All Filters
          </button>
        ) : (
          <button className="btn-outline" onClick={() => goTo("dashboard")}>
            Back To Dashboard
          </button>
        )}

        {FILTER_SECTIONS.map((section, sIdx) => {
          const sectionOpen = !!openSections[section.title];
          return (
            <div key={`sec-${sIdx}`} className="leftmenu-section">
              <button
                className={`leftmenu-section-header ${sectionOpen ? "open" : ""}`}
                onClick={() =>
                  setOpenSections((prev) => ({
                    ...prev,
                    [section.title]: prev[section.title] === false,
                  }))
                }
              >
                <span className="leftmenu-section-title">{section.title}</span>
                <ChevronRight size={15} />
              </button>

              {sectionOpen ? (
                <div className="leftmenu-section-body">
                  {section.items.map((group) => {
                    const key = group.key;
                    const isOpen = !!openGroups[key];
                    const options = filterOptions?.[key] || [];
                    const selected = selectedFilters?.[key] || [];
                    const shouldRenderPanel = isDynamic && isOpen && options.length > 0;

                    return (
                      <div className="leftmenu-subsection" key={key}>
                        <button
                          className={`leftmenu-subsection-header ${isOpen ? "open" : ""}`}
                          onClick={() => setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }))}
                          style={{ opacity: options.length === 0 ? 0.7 : 1 }}
                        >
                          <ChevronRight size={14} />
                          <span className="leftmenu-subsection-title">
                            {group.label} ({selectedCount(key)}/{isDynamic ? totalCount(key) : selectedCount(key)})
                          </span>
                        </button>

                        {shouldRenderPanel ? (
                          <div className="leftmenu-subsection-panel">
                            <div className="accordion-actions">
                              <button type="button" onClick={() => onSelectAll(key)}>
                                All
                              </button>
                              <button type="button" onClick={() => onClearAll(key)}>
                                Clear
                              </button>
                            </div>
                            <div className="filter-option-list">
                              {options.map((option) => (
                                <label key={`${key}-${option}`} className="filter-option-item">
                                  <input
                                    type="checkbox"
                                    checked={selected.includes(option)}
                                    onChange={() => onToggleFilter(key, option)}
                                  />
                                  <span>{option}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}

        <QuickActions />

        <div style={{ marginTop: "auto", paddingTop: "24px" }}>
          <button className="btn-outline" onClick={handleAdminButton}>
            {adminButtonLabel}
          </button>
        </div>
      </aside>
    </>
  );
}
