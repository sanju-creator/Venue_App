"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
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
      <button
        className="btn-outline"
        onClick={() => goTo("occupancy_dashboard", { requiresAuth: true, allowedUsers: ["Admin", "Prafull"] })}
      >
        Occupancy Details
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
  const { user, logout, goTo, sidebarCollapsed, setSidebarCollapsed, fetchApi, setManpowerFilter, setSelectedVenueCode, page } = useApp();
  const [openGroups, setOpenGroups] = useState({});
  const [openSections, setOpenSections] = useState(() =>
    Object.fromEntries(FILTER_SECTIONS.map((section) => [section.title, false]))
  );
  const [currentTime, setCurrentTime] = useState("");
  const [globalSearchInput, setGlobalSearchInput] = useState("");
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [globalSearchModalOpen, setGlobalSearchModalOpen] = useState(false);
  const [globalSearchBusy, setGlobalSearchBusy] = useState(false);
  const [globalSearchFallbackResult, setGlobalSearchFallbackResult] = useState(null);
  const [globalSearchFallbackError, setGlobalSearchFallbackError] = useState("");

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

  const resolveGlobalSearch = useCallback((input) => {
    const resolver = globalSearchConfig?.resolve;
    if (typeof resolver !== "function") return [];
    return resolver(input);
  }, [globalSearchConfig]);

  const globalSearchResults = useMemo(() => {
    return resolveGlobalSearch(globalSearchQuery);
  }, [resolveGlobalSearch, globalSearchQuery]);

  const mergedGlobalSearchResults = useMemo(() => {
    if (!globalSearchFallbackResult) return globalSearchResults;
    if (globalSearchResults.some((item) => item.id === globalSearchFallbackResult.id)) return globalSearchResults;
    return [globalSearchFallbackResult, ...globalSearchResults];
  }, [globalSearchFallbackResult, globalSearchResults]);

  useEffect(() => {
    if (!globalSearchModalOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setGlobalSearchModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [globalSearchModalOpen]);

  useEffect(() => {
    if (!globalSearchConfig || page !== "dashboard" || typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem("vms_global_search_restore");
      if (!raw) return;
      const payload = JSON.parse(raw);
      const restoredQuery = String(payload?.query || "").trim();
      if (!restoredQuery) return;
      setGlobalSearchInput(restoredQuery);
      setGlobalSearchQuery(restoredQuery);
      setGlobalSearchModalOpen(payload?.openModal !== false);
      sessionStorage.removeItem("vms_global_search_restore");
    } catch {
      // Ignore storage parsing failures.
    }
  }, [globalSearchConfig, page]);

  const handleGlobalSearch = async () => {
    const query = String(globalSearchInput || "").trim();
    setGlobalSearchQuery(query);
    setGlobalSearchModalOpen(Boolean(query));
    setGlobalSearchFallbackResult(null);
    setGlobalSearchFallbackError("");

    if (typeof globalSearchConfig?.onSearch === "function") {
      globalSearchConfig.onSearch(query);
    }

    if (!query) return;

    const localResults = resolveGlobalSearch(query);
    if (localResults.length > 0) return;

    if (query.length < 2) return;

    setGlobalSearchBusy(true);
    try {
      const lookup = await fetchApi(`manpower/person-lookup?name=${encodeURIComponent(query)}`);
      const personName = String(lookup?.name || "").trim();
      const empId = String(lookup?.empId || "").trim();
      if (!personName && !empId) return;

      setGlobalSearchFallbackResult({
        id: `fallback-person-${empId || personName.toLowerCase()}`,
        title: `${personName || "Unknown"}${empId ? ` (${empId})` : ""}`,
        subtitle: `Matched via person lookup${lookup?.confidence ? ` | Confidence: ${lookup.confidence}` : ""}`,
        onSelect: () => {
          const token = empId || personName;
          const payload = {
            search: token,
            focusEmpId: empId,
            personName: personName || token,
          };
          setSelectedVenueCode("");
          setManpowerFilter(payload);
          if (typeof window !== "undefined") {
            try {
              sessionStorage.setItem("vms_pending_manpower_filter", JSON.stringify(payload));
            } catch {
              // Ignore storage failures and continue navigation.
            }
          }
          setGlobalSearchModalOpen(false);
          goTo("manpower_dashboard", { requiresAuth: true, allowedUsers: ["Admin", "Prafull"] });
        },
      });
    } catch (error) {
      const message = String(error?.message || "");
      if (!message.includes("404")) {
        setGlobalSearchFallbackError("Could not fetch person lookup right now.");
      }
    } finally {
      setGlobalSearchBusy(false);
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
              Search people, modules, and records from one place.
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

            {globalSearchQuery ? (
              <div className="global-search-status-pill">
                {globalSearchBusy
                  ? "Searching..."
                  : `${mergedGlobalSearchResults.length} result${mergedGlobalSearchResults.length === 1 ? "" : "s"} for "${globalSearchQuery}"`}
                <button className="global-search-status-open-btn" onClick={() => setGlobalSearchModalOpen(true)}>
                  View
                </button>
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

      {globalSearchModalOpen ? (
        <div className="global-search-modal-backdrop" onClick={() => setGlobalSearchModalOpen(false)}>
          <div className="global-search-modal" onClick={(event) => event.stopPropagation()}>
            <div className="global-search-modal-head">
              <div>
                <div className="global-search-modal-title">Global Search Results</div>
                <div className="global-search-modal-subtitle">
                  Query: "{globalSearchQuery || "N/A"}"
                </div>
              </div>
              <button className="global-search-modal-close" onClick={() => setGlobalSearchModalOpen(false)}>
                Close
              </button>
            </div>

            {globalSearchBusy ? (
              <div className="global-search-modal-empty">Searching records...</div>
            ) : mergedGlobalSearchResults.length ? (
              <div className="global-search-modal-list">
                {mergedGlobalSearchResults.map((result) => (
                  <div className="global-search-modal-item" key={result.id}>
                    <div className="global-search-modal-item-main">
                      <div className="result-main">{result.title}</div>
                      {result.subtitle ? <div className="result-sub">{result.subtitle}</div> : null}
                    </div>
                    <button
                      className="search-result-btn"
                      onClick={() => {
                        const resultId = String(result?.id || "");
                        const isManpowerNavigation =
                          resultId === "module-manpower" ||
                          resultId.startsWith("manpower-") ||
                          resultId.startsWith("fallback-person-");
                        if (isManpowerNavigation && typeof window !== "undefined") {
                          const payload = {
                            query: String(globalSearchQuery || "").trim(),
                            openModal: true,
                          };
                          try {
                            sessionStorage.setItem("vms_manpower_return_global_search", JSON.stringify(payload));
                          } catch {
                            // Ignore storage failures and continue navigation.
                          }
                        }
                        if (typeof result.onSelect === "function") result.onSelect();
                        setGlobalSearchModalOpen(false);
                      }}
                    >
                      Open
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="global-search-modal-empty">
                No results found. Try full name, employee ID, venue code, city, state, or project name.
              </div>
            )}

            {globalSearchFallbackError ? (
              <div className="global-search-modal-error">{globalSearchFallbackError}</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
