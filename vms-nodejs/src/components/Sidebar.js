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
      { key: "projectMonth", label: "Month-Wise" },
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
    title: "Manpower Details",
    items: [
      { key: "examWise", label: "Exam-Wise" },
      { key: "roles", label: "Roles" },
      { key: "documents", label: "Documents" },
    ],
  },
  {
    title: "DATC & DOTC Inventory",
    items: [
      { key: "venueType", label: "Type (DATC/DOTC)" },
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
        DATC &amp; DOTC Inventory Dashboard
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
  globalSearchConfig = null,
  mobileOpen = false,
  onToggleMobile = () => {},
}) {
  const { user, logout, goTo, sidebarCollapsed, setSidebarCollapsed } = useApp();
  const [openGroups, setOpenGroups] = useState({});
  const [openSections, setOpenSections] = useState(() =>
    Object.fromEntries(FILTER_SECTIONS.map((section) => [section.title, false]))
  );
  const [currentTime, setCurrentTime] = useState("");
  const [globalSearchInput, setGlobalSearchInput] = useState("");

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

  const globalSearchResults = useMemo(() => {
    const resolver = globalSearchConfig?.resolve;
    if (typeof resolver !== "function") return [];
    return resolver(globalSearchInput);
  }, [globalSearchConfig, globalSearchInput]);

  const handleGlobalSearch = () => {
    if (typeof globalSearchConfig?.onSearch === "function") {
      globalSearchConfig.onSearch(globalSearchInput);
    }
  };

  const handleAdminButton = () => {
    if (!user) {
      goTo("login");
      return;
    }
    logout();
  };

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

        {globalSearchConfig ? (
          <div className="sidebar-global-search">
            <div className="search-title">Global Search</div>
            <div className="search-desc">
              Search modules and records from one place.
            </div>
            <div className="search-flex">
              <input
                className="search-input"
                value={globalSearchInput}
                onChange={(event) => setGlobalSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleGlobalSearch();
                }}
                placeholder={globalSearchConfig.placeholder || "Search modules, venues, state, city..."}
              />
              <button className="search-btn" onClick={handleGlobalSearch}>Search</button>
            </div>

            {globalSearchInput.trim() ? (
              <div className="search-result-list">
                {globalSearchResults.length ? (
                  globalSearchResults.map((result) => (
                    <div className="search-result-row" key={result.id}>
                      <div>
                        <div className="result-main">{result.title}</div>
                        {result.subtitle ? <div className="result-sub">{result.subtitle}</div> : null}
                      </div>
                      <button
                        className="btn-outline search-result-btn"
                        onClick={() => {
                          if (typeof result.onSelect === "function") result.onSelect();
                        }}
                      >
                        Open
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="search-empty">No results found.</div>
                )}
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
            Back to Dashboard
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
