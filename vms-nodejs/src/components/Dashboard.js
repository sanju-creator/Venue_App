"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import { ChevronsRight } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import IndiaMap from "@/components/IndiaMap";
import Breadcrumbs from "@/components/Breadcrumbs";
import { useApp } from "@/context/AppContext";

const REGION_ORDER = ["North One", "North Two", "East", "West", "South"];
const STATUS_ORDER = ["ACTIVE", "BLACKLISTED", "CUSTOMER SPECIFIC BLACKLISTED"];
const CATEGORY_ORDER = ["A", "B", "C", "BL-C", "BL"];
const PIE_ORDER = ["A", "B", "C", "BL", "BL-C"];
const PROJECT_FILTER_ORDER = ["IBIS DIP", "BHARAT", "SMILE"];

const PIE_COLORS = {
  A: "#b6e8b2",
  B: "#8fcbdf",
  C: "#f2df7c",
  BL: "#f1b6b6",
  "BL-C": "#ddb6ef",
};

const CATEGORY_COLORS = {
  A: "#b6e8b2",
  B: "#8fcbdf",
  C: "#f2df7c",
  "BL-C": "#ddb6ef",
  BL: "#f1b6b6",
};
const CATEGORY_CHIP_STYLES = {
  A: { bg: "#edf9ee", border: "#b6e8b2", text: "#2f6f36", dot: "#6abf76" },
  B: { bg: "#ebf7fc", border: "#8fcbdf", text: "#245f7b", dot: "#4ba7c8" },
  C: { bg: "#fff8dd", border: "#f2df7c", text: "#7a6112", dot: "#d7b83b" },
  BL: { bg: "#fff0f0", border: "#f1b6b6", text: "#8d3434", dot: "#dc6a6a" },
  "BL-C": { bg: "#f8effd", border: "#ddb6ef", text: "#704285", dot: "#b06ed1" },
};

const UNION_TERRITORY_NAMES = new Set([
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
]);

const STATUS_COLORS = {
  ACTIVE: "#79c6e6",
  BLACKLISTED: "#f5a6a6",
  "CUSTOMER SPECIFIC BLACKLISTED": "#2fbaab",
};

const OPERATIONAL_COLORS = {
  DATC: "#7eaedc",
  DOTC: "#87cbbf",
};

const OPERATIONAL_STROKES = {
  DATC: "#5f8fbe",
  DOTC: "#5fa79c",
};

const COMPARISON_COLORS = {
  datc: OPERATIONAL_COLORS.DATC,
  dotc: OPERATIONAL_COLORS.DOTC,
  datcStrong: OPERATIONAL_STROKES.DATC,
  dotcStrong: OPERATIONAL_STROKES.DOTC,
  availableManpower: STATUS_COLORS.ACTIVE,
  usedManpower: STATUS_COLORS["CUSTOMER SPECIFIC BLACKLISTED"],
  active: STATUS_COLORS.ACTIVE,
  inactive: "#94a3b8",
  blacklisted: STATUS_COLORS.BLACKLISTED,
  projectTotalBatches: CATEGORY_COLORS.A,
};

const STATUS_CHART_KEY_TO_STATUS = {
  ACTIVE: "ACTIVE",
  BLACKLISTED: "BLACKLISTED",
  CUSTOMER_SPECIFIC_BLACKLISTED: "CUSTOMER SPECIFIC BLACKLISTED",
};

const CATEGORY_CHART_KEY_TO_CATEGORY = {
  A: "A",
  B: "B",
  C: "C",
  "BL-C": "BL-C",
  BL: "BL",
};

const CATEGORY_MEANINGS = {
  A: "Good venue: clean and issue-free with positive survey",
  B: "Average venue: moderate issues with low FFA (<10)",
  C: "Sensitive venue: FFA >=10 or malpractice risk",
  BL: "Blacklisted venue: confirmed customer block",
  "BL-C": "Customer-specific blacklist for selected projects",
};

const CATEGORY_LABEL_FLOAT_OFFSETS = {
  A: { dx: -6, dy: -14 },
  B: { dx: 10, dy: 2 },
  C: { dx: 12, dy: 10 },
  BL: { dx: 8, dy: -10 },
  "BL-C": { dx: 12, dy: 14 },
};

const RADIAN = Math.PI / 180;

function renderCategoryPieLabel(props) {
  const { cx, cy, midAngle, outerRadius, percent: share, name } = props;
  if (!share || !name) return null;

  const isSmallSlice = share < 0.08;
  const baseRadius = Number(outerRadius || 0) + (isSmallSlice ? 28 : 16);
  const baseX = Number(cx || 0) + baseRadius * Math.cos(-midAngle * RADIAN);
  const baseY = Number(cy || 0) + baseRadius * Math.sin(-midAngle * RADIAN);
  const offset = CATEGORY_LABEL_FLOAT_OFFSETS[name] || { dx: 0, dy: 0 };
  const x = baseX + offset.dx;
  const y = baseY + offset.dy;
  const textAnchor = x > Number(cx || 0) ? "start" : "end";
  const percentage = Number((share * 100).toFixed(1));

  return (
    <text
      x={x}
      y={y}
      fill="#334155"
      textAnchor={textAnchor}
      dominantBaseline="central"
      style={{ fontSize: 10, fontWeight: 800, pointerEvents: "none" }}
    >
      {`${name} ${percentage}%`}
    </text>
  );
}

const numberFormat = new Intl.NumberFormat("en-IN");

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "en", { sensitivity: "base" }),
  );
}

function buildExamCityCentre(row) {
  const d = (row.district || "").trim();
  const c = (row.city || "").trim();
  if (d && c && d !== "-" && c !== "-") return `${d} / ${c}`;
  return d && d !== "-" ? d : (c && c !== "-" ? c : "-");
}

const MONTH_LABEL_BY_KEY = {
  JAN: "Jan",
  FEB: "Feb",
  MAR: "March",
};

const MONTH_KEY_BY_TOKEN = {
  JAN: "JAN",
  JANUARY: "JAN",
  FEB: "FEB",
  FEBRUARY: "FEB",
  MAR: "MAR",
  MARCH: "MAR",
};

function normalizeMonthLabel(value) {
  const token = String(value || "").trim().toUpperCase().replace(/[^A-Z]/g, "");
  const monthKey = MONTH_KEY_BY_TOKEN[token];
  return monthKey ? MONTH_LABEL_BY_KEY[monthKey] : "";
}

function normalizeProjectLabel(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
}

function buildFilterOptions(rows, manpowerFilterOptions = null) {
  if (!rows.length) {
    return {
      region: [],
      state: [],
      district: [],
      city: [],
      examCityCentre: [],
      status: [],
      category: [],
      venueType: [],
      projectName: [],
      projectMonth: [],
      examWise: [],
      roles: [],
      documents: [],
    };
  }

  const regionSet = new Set(rows.map((row) => row.region));
  const orderedRegions = REGION_ORDER.filter((region) => regionSet.has(region));

  const statusSet = new Set(rows.map((row) => row.status));
  const orderedStatus = STATUS_ORDER.filter((status) => statusSet.has(status));

  const categorySet = new Set(rows.map((row) => row.category));
  const orderedCategory = CATEGORY_ORDER.filter((category) => categorySet.has(category));

  const districts = uniqueSorted(rows.map((row) => row.district));
  const sortedDistricts = districts.includes("-")
    ? ["-", ...districts.filter((district) => district !== "-")]
    : districts;
  const sourceProjects = Array.isArray(manpowerFilterOptions?.projects) && manpowerFilterOptions.projects.length
    ? manpowerFilterOptions.projects
    : rows.map((row) => row.projectName);
  const sourceProjectSet = new Set(sourceProjects.map((value) => normalizeProjectLabel(value)).filter(Boolean));
  const projectNames = PROJECT_FILTER_ORDER.filter((projectName) => sourceProjectSet.has(projectName));
  const monthSource = Array.isArray(manpowerFilterOptions?.projectMonths)
    ? manpowerFilterOptions.projectMonths
    : [];
  const normalizedMonthSet = new Set(monthSource.map((value) => normalizeMonthLabel(value)).filter(Boolean));
  const projectMonth = ["Jan", "Feb", "March"].filter((month) => normalizedMonthSet.has(month));

  return {
    region: orderedRegions,
    state: uniqueSorted(rows.map((row) => row.state)),
    district: sortedDistricts,
    city: uniqueSorted(rows.map((row) => row.city)),
    examCityCentre: uniqueSorted(rows.map((row) => buildExamCityCentre(row))),
    status: orderedStatus,
    category: orderedCategory,
    venueType: uniqueSorted(rows.map((row) => row.venueType)),
    projectName: projectNames,
    projectMonth,
    examWise: uniqueSorted(manpowerFilterOptions?.examWise || []),
    roles: uniqueSorted(manpowerFilterOptions?.roles || []),
    documents: uniqueSorted(manpowerFilterOptions?.documents || []),
  };
}

const KPI_CARDS = [
  { key: "dotcCentres", title: "DOTC CENTRES", color: "#3f7fdd" },
  { key: "dotcSeatCapacity", title: "DOTC SEAT CAPACITY", color: "#3f7fdd" },
  { key: "activeDatc", title: "ACTIVE DATC CENTRES", color: "#0ea5e9" },
  { key: "activeDatcSeatCapacity", title: "ACTIVE DATC SEAT CAPACITY", color: "#0ea5e9" },
  { key: "blacklisted", title: "BLACKLISTED CENTRES", color: "#ef4444" },
  { key: "blacklistedSeatCapacity", title: "BLACKLISTED CENTRE SEAT CAPACITY", color: "#ef4444" },
  { key: "totalDatc", title: "TOTAL DATC CENTRES", color: "#f59e0b" },
  { key: "totalDatcSeatCapacity", title: "TOTAL DATC SEAT CAPACITY", color: "#f59e0b" },
  { key: "inactive", title: "INACTIVE VENUES", color: "#64748b" }
];


const KPI_BAR_COLORS = [
  "#3f7fdd", "#3f7fdd", "#0ea5e9", "#0ea5e9",
  "#ef4444", "#ef4444", "#f59e0b", "#f59e0b",
  "#64748b", "#64748b"
];
const UNIFIED_EMPLOYEE_TYPES = ["DEXIT", "Outsourced"];
const MANPOWER_ANALYTICS_USERS = ["Admin", "Prafull"];
const COMPARISON_VIEW_OPTIONS = [
  { key: "manpower", label: "Manpower" },
  { key: "venue", label: "Venue" },
  { key: "project", label: "Project" },
];
const DATC_DOTC_FILTER_OPTIONS = [
  { key: "ALL", label: "All" },
  { key: "DATC", label: "DATC" },
  { key: "DOTC", label: "DOTC" },
];
const COMPARISON_METRIC_OPTIONS = [
  { key: "totalBatches", label: "Total Batches" },
  { key: "noDelay", label: "No Delay" },
  { key: "partialDelay", label: "Partial Delay" },
  { key: "fullDelay", label: "Full Delay" },
  { key: "noDelayPercent", label: "No Delay %" },
  { key: "availableManpower", label: "Available Manpower" },
  { key: "usedManpower", label: "Used Manpower" },
  { key: "manpowerUtilizationPercent", label: "Manpower Utilization %" },
  { key: "totalCentreCount", label: "Venue Count" },
  { key: "totalSeatCapacity", label: "Seat Capacity" },
  { key: "ffa", label: "FFA" },
  { key: "callLogs", label: "Call Logs" },
];

function sumBy(rows, getter) {
  return rows.reduce((sum, row) => sum + toNumber(getter(row)), 0);
}

function percent(part, total) {
  if (!total) return 0;
  return Number(((part / total) * 100).toFixed(1));
}

function formatCount(value) {
  return numberFormat.format(toNumber(value));
}

function normalizeSearchToken(value) {
  return String(value || "").trim().toLowerCase();
}

function splitSearchTokens(value) {
  return normalizeSearchToken(value).split(/\s+/).filter(Boolean);
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getVenueSearchMatch(row, query, includeLocation = false) {
  const normalizedQuery = normalizeSearchToken(query);
  if (!normalizedQuery) {
    return { matched: true, score: 99 };
  }

  const tokens = splitSearchTokens(normalizedQuery);
  if (!tokens.length) {
    return { matched: true, score: 99 };
  }

  const code = normalizeSearchToken(row?.dmsCode);
  const name = normalizeSearchToken(row?.name);
  const primaryText = `${name} ${code}`.trim();
  const locationText = `${normalizeSearchToken(row?.city)} ${normalizeSearchToken(row?.district)} ${normalizeSearchToken(row?.state)}`.trim();
  const boundaryChecks = tokens.map((token) => new RegExp(`\\b${escapeRegExp(token)}\\b`, "i"));

  if (name === normalizedQuery || code === normalizedQuery) {
    return { matched: true, score: 0 };
  }
  if (boundaryChecks.every((regex) => regex.test(primaryText))) {
    return { matched: true, score: 1 };
  }
  if (name.startsWith(normalizedQuery) || code.startsWith(normalizedQuery)) {
    return { matched: true, score: 2 };
  }
  if (tokens.every((token) => primaryText.includes(token))) {
    return { matched: true, score: 3 };
  }

  if (includeLocation) {
    if (boundaryChecks.every((regex) => regex.test(locationText))) {
      return { matched: true, score: 4 };
    }
    if (tokens.every((token) => locationText.includes(token))) {
      return { matched: true, score: 5 };
    }
  }

  return { matched: false, score: Number.POSITIVE_INFINITY };
}

function buildVenueSearchResults(rows, query, options = {}) {
  const { includeLocation = false, limit = 10 } = options;
  const normalizedQuery = normalizeSearchToken(query);
  const resultRows = [];

  rows.forEach((row) => {
    const match = getVenueSearchMatch(row, normalizedQuery, includeLocation);
    if (!match.matched) return;
    resultRows.push({ row, score: match.score });
  });

  resultRows.sort((left, right) => {
    if (left.score !== right.score) return left.score - right.score;
    const leftName = normalizeSearchToken(left.row?.name);
    const rightName = normalizeSearchToken(right.row?.name);
    const nameCompare = leftName.localeCompare(rightName, "en", { sensitivity: "base" });
    if (nameCompare !== 0) return nameCompare;
    return normalizeSearchToken(left.row?.dmsCode).localeCompare(normalizeSearchToken(right.row?.dmsCode), "en", { sensitivity: "base" });
  });

  if (!normalizedQuery || limit <= 0) {
    return resultRows;
  }
  return resultRows.slice(0, limit);
}

function DashboardTable({ headers, rows, footerRow }) {
  const { openVenueDetail, openManpowerAnalytics } = useApp();
  const isNumericText = (value) => /^[\d,\s]+$/.test(String(value || "").trim());
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row[0]}-${index}`}>
              {row.map((cell, cellIndex) => (
                <td key={`${row[0]}-${cellIndex}`}>
                  {cellIndex === 1 && typeof cell === 'string' ? (
                    isNumericText(cell) ? (
                      <span className="venue-name-link" onClick={() => openManpowerAnalytics(row[0])}>
                        {cell}
                      </span>
                    ) : (
                      <span className="venue-name-link" onClick={() => openVenueDetail(row[0])}>
                        {cell}
                      </span>
                    )
                  ) : cell}
                </td>
              ))}
            </tr>
          ))}
          {footerRow ? (
            <tr className="total-row">
              {footerRow.map((cell, index) => (
                <td key={`footer-${index}`}>{cell}</td>
              ))}
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

export default function Dashboard() {
  const { API, openVenueDetail, openManpowerAnalytics, user, goTo, setMasterMapState, fetchApi, setManpowerFilter, setSelectedVenueCode } = useApp();

  const [dashboardData, setDashboardData] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [manpowerSnapshot, setManpowerSnapshot] = useState(null);

  const [selectedFilters, setSelectedFilters] = useState(null);
  const [topFilters, setTopFilters] = useState({
    region: "",
    state: "",
    examCityCentre: "",
  });

  const [searchInput, setSearchInput] = useState("");
  const [isVenueSearchOpen, setIsVenueSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activePerspective, setActivePerspective] = useState("venue");
  const [comparisonView, setComparisonView] = useState(null);
  const [comparisonTypeFilter, setComparisonTypeFilter] = useState("ALL");
  const [comparisonRegion, setComparisonRegion] = useState("");
  const [comparisonState, setComparisonState] = useState("");
  const [comparisonCity, setComparisonCity] = useState("");
  const [comparisonDistrict, setComparisonDistrict] = useState("");
  const [selectedComparisonMetric, setSelectedComparisonMetric] = useState("");
  const venuePerspectiveRef = useRef(null);
  const venueSearchRef = useRef(null);
  const venueSearchInputRef = useRef(null);
  const comparisonMetricSelectRef = useRef(null);

  const closeComparisonMetricDropdown = useCallback(() => {
    comparisonMetricSelectRef.current?.blur();
  }, []);

  useEffect(() => {
    if (!isVenueSearchOpen) return;
    const onPointerDown = (event) => {
      if (!venueSearchRef.current?.contains(event.target) && !searchInput.trim()) {
        setIsVenueSearchOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isVenueSearchOpen, searchInput]);

  const persistPendingManpowerFilter = useCallback((payload) => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem("vms_pending_manpower_filter", JSON.stringify(payload || {}));
    } catch {
      // Ignore storage failures and continue navigation.
    }
  }, []);

  // Unified Hierarchical Drilldown Path
  const [drilldownPath, setDrilldownPath] = useState({
    type: null,   // 'kpi' | 'category' | 'infra' | 'map' | 'status'
    key: null,    // the ID/name of the metric or region
    region: null,
    state: null,
    district: null,
    city: null
  });

  const resetDrilldown = () => setDrilldownPath({ type: null, key: null, region: null, state: null, district: null, city: null });

  const pushDrilldown = (level, value) => {
    setDrilldownPath(prev => ({ ...prev, [level]: value }));
  };

  const popDrilldown = (level) => {
    setDrilldownPath(prev => {
      const next = { ...prev };
      if (level === 'root') {
        next.region = null;
        next.state = null;
        next.district = null;
        next.city = null;
      } else if (level === 'region') {
        next.state = null;
        next.district = null;
        next.city = null;
      } else if (level === 'state') {
        next.district = null;
        next.city = null;
      } else if (level === 'district') {
        next.city = null;
        next.venue = null;
      } else if (level === 'city') {
        next.venue = null;
      }
      return next;
    });
  };

  const canViewUnifiedManpower = useMemo(
    () => Boolean(user?.user && MANPOWER_ANALYTICS_USERS.includes(user.user)),
    [user],
  );

  const switchPerspective = useCallback((nextPerspective) => {
    if (nextPerspective === "manpower") {
      goTo("manpower_dashboard", { requiresAuth: true, allowedUsers: MANPOWER_ANALYTICS_USERS });
      return;
    }
    setActivePerspective("venue");
    const target = venuePerspectiveRef.current;
    if (target && typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [goTo]);


  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();

    async function fetchDashboard() {
      if (!isActive) return;
      setBusy(true);
      setError("");
      try {
        const response = await fetch(`${API}/dashboard/bootstrap`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || "Could not load dashboard data");
        }
        if (!isActive) return;
        setDashboardData(data);

        const options = buildFilterOptions(data?.rows || []);
        const defaultStatuses = (data?.defaults?.selectedStatuses || STATUS_ORDER).filter((status) =>
          options.status.includes(status),
        );

        if (!isActive) return;
        setSelectedFilters({
          region: [...options.region],
          state: [...options.state],
          district: [...options.district],
          city: [...options.city],
          examCityCentre: [...options.examCityCentre],
          status: defaultStatuses.length ? defaultStatuses : [...options.status],
          category: [...options.category],
          venueType: [...options.venueType],
          projectName: [...options.projectName],
          projectMonth: [...options.projectMonth],
          examWise: [...options.examWise],
          roles: [...options.roles],
          documents: [...options.documents],
        });
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (!isActive) return;
        setError(err.message || "Could not load dashboard");
      } finally {
        if (isActive) setBusy(false);
      }
    }

    fetchDashboard();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [API]);

  useEffect(() => {
    if (!canViewUnifiedManpower && activePerspective === "manpower") {
      setActivePerspective("venue");
    }
  }, [canViewUnifiedManpower, activePerspective]);

  useEffect(() => {
    let active = true;
    if (!canViewUnifiedManpower) {
      setManpowerSnapshot(null);
      return () => {
        active = false;
      };
    }
    const loadManpowerSnapshot = async () => {
      if (!active) return;
      try {
        const data = await fetchApi("manpower/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            search: "",
            employeeTypes: [...UNIFIED_EMPLOYEE_TYPES],
            projects: [],
            employees: [],
            tenure: [],
            roles: [],
            regions: [],
            states: [],
            examCityCentres: [],
          }),
        });
        if (!active) return;
        setManpowerSnapshot(data || null);
      } catch (err) {
        if (!active) return;
        setManpowerSnapshot(null);
      }
    };
    loadManpowerSnapshot();
    return () => {
      active = false;
    };
  }, [fetchApi, canViewUnifiedManpower]);

  const rows = useMemo(() => dashboardData?.rows || [], [dashboardData]);

  const filterOptions = useMemo(
    () => buildFilterOptions(rows, manpowerSnapshot?.filterOptions || null),
    [rows, manpowerSnapshot],
  );

  useEffect(() => {
    setSelectedFilters((prev) => {
      if (!prev) return prev;
      const lazyKeys = ["projectMonth", "examWise", "roles", "documents"];
      let next = prev;
      let changed = false;

      lazyKeys.forEach((key) => {
        if ((next[key] || []).length > 0) return;
        const options = filterOptions[key] || [];
        if (!options.length) return;
        if (!changed) next = { ...next };
        next[key] = [...options];
        changed = true;
      });

      return changed ? next : prev;
    });
  }, [filterOptions]);

  const sidebarScopedRows = useMemo(() => {
    if (!selectedFilters) return [];

    return rows.filter((row) => {
      if (selectedFilters.venueType?.length && !selectedFilters.venueType.includes(row.venueType)) return false;
      if (selectedFilters.region?.length && !selectedFilters.region.includes(row.region)) return false;
      if (selectedFilters.state?.length && !selectedFilters.state.includes(row.state)) return false;
      if (selectedFilters.examCityCentre?.length && !selectedFilters.examCityCentre.includes(buildExamCityCentre(row))) return false;
      if (selectedFilters.category?.length && !selectedFilters.category.includes(row.category)) return false;
      if (selectedFilters.projectName?.length && !selectedFilters.projectName.includes(row.projectName)) return false;
      return true;
    });
  }, [rows, selectedFilters]);

  const topRegionOptions = useMemo(
    () => uniqueSorted(sidebarScopedRows.map((row) => row.region)),
    [sidebarScopedRows],
  );

  const topStateOptions = useMemo(() => {
    const rowsByRegion = topFilters.region
      ? sidebarScopedRows.filter((row) => row.region === topFilters.region)
      : sidebarScopedRows;
    return uniqueSorted(rowsByRegion.map((row) => row.state));
  }, [sidebarScopedRows, topFilters.region]);

  const topExamCityCentreOptions = useMemo(() => {
    let baseRows = sidebarScopedRows;
    if (topFilters.region) baseRows = baseRows.filter((row) => row.region === topFilters.region);
    if (topFilters.state) baseRows = baseRows.filter((row) => row.state === topFilters.state);
    return uniqueSorted(baseRows.map((row) => buildExamCityCentre(row)));
  }, [sidebarScopedRows, topFilters.region, topFilters.state]);

  const geoScopedBaseRows = useMemo(() => {
    if (!selectedFilters) return [];
    return rows.filter((row) => {
      if (selectedFilters.venueType?.length && !selectedFilters.venueType.includes(row.venueType)) return false;
      if (selectedFilters.category?.length && !selectedFilters.category.includes(row.category)) return false;
      if (selectedFilters.status?.length && !selectedFilters.status.includes(row.status)) return false;
      if (selectedFilters.projectName?.length && !selectedFilters.projectName.includes(row.projectName)) return false;
      return true;
    });
  }, [rows, selectedFilters]);

  const regionScopedOptions = useMemo(() => {
    const regionSet = new Set(geoScopedBaseRows.map((row) => row.region).filter(Boolean));
    return REGION_ORDER.filter((region) => regionSet.has(region));
  }, [geoScopedBaseRows]);

  const stateScopedOptions = useMemo(() => {
    if (!selectedFilters?.region?.length) return [];
    const regionSet = new Set(selectedFilters.region);
    return uniqueSorted(
      geoScopedBaseRows
        .filter((row) => regionSet.has(row.region))
        .map((row) => row.state),
    );
  }, [geoScopedBaseRows, selectedFilters]);

  const examCityScopedOptions = useMemo(() => {
    if (!selectedFilters?.region?.length || !selectedFilters?.state?.length) return [];
    const regionSet = new Set(selectedFilters.region);
    const stateSet = new Set(selectedFilters.state);
    return uniqueSorted(
      geoScopedBaseRows
        .filter((row) => regionSet.has(row.region) && stateSet.has(row.state))
        .map((row) => buildExamCityCentre(row)),
    );
  }, [geoScopedBaseRows, selectedFilters]);

  const sidebarFilterOptions = useMemo(
    () => ({
      ...filterOptions,
      region: regionScopedOptions,
      state: stateScopedOptions,
      examCityCentre: examCityScopedOptions,
    }),
    [filterOptions, regionScopedOptions, stateScopedOptions, examCityScopedOptions],
  );

  useEffect(() => {
    setSelectedFilters((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      let changed = false;

      const pruneByOptions = (key, allowedOptions) => {
        const current = Array.isArray(prev[key]) ? prev[key] : [];
        const filtered = current.filter((value) => allowedOptions.includes(value));
        if (filtered.length !== current.length) {
          next[key] = filtered;
          changed = true;
        }
      };

      pruneByOptions("region", regionScopedOptions);
      pruneByOptions("state", stateScopedOptions);
      pruneByOptions("examCityCentre", examCityScopedOptions);

      if (!next.region?.length && (next.state?.length || next.examCityCentre?.length)) {
        next.state = [];
        next.examCityCentre = [];
        changed = true;
      }
      if (!next.state?.length && next.examCityCentre?.length) {
        next.examCityCentre = [];
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [regionScopedOptions, stateScopedOptions, examCityScopedOptions]);

  const venueSearchScopeRows = useMemo(() => {
    if (!selectedFilters) return [];

    return sidebarScopedRows.filter((row) => {
      if (topFilters.region && row.region !== topFilters.region) return false;
      if (topFilters.state && row.state !== topFilters.state) return false;
      if (topFilters.examCityCentre && buildExamCityCentre(row) !== topFilters.examCityCentre) return false;
      return true;
    });
  }, [sidebarScopedRows, selectedFilters, topFilters]);

  const appliedVenueSearchResults = useMemo(
    () => buildVenueSearchResults(venueSearchScopeRows, searchQuery, { includeLocation: true, limit: 0 }),
    [venueSearchScopeRows, searchQuery],
  );

  const rowsWithoutStatusFilter = useMemo(() => {
    if (!selectedFilters) return [];
    if (!searchQuery.trim()) return venueSearchScopeRows;
    return appliedVenueSearchResults.map((entry) => entry.row);
  }, [venueSearchScopeRows, selectedFilters, searchQuery, appliedVenueSearchResults]);

  const venueSearchResults = useMemo(() => {
    return buildVenueSearchResults(venueSearchScopeRows, searchInput, { includeLocation: true, limit: 10 })
      .map((entry) => entry.row);
  }, [venueSearchScopeRows, searchInput]);

  const filteredRows = useMemo(() => {
    if (!selectedFilters) return [];
    return rowsWithoutStatusFilter.filter((row) =>
      selectedFilters.status?.length ? selectedFilters.status.includes(row.status) : true,
    );
  }, [rowsWithoutStatusFilter, selectedFilters]);

  const inactiveRows = useMemo(
    () => rowsWithoutStatusFilter.filter((row) => row.status === "INACTIVE"),
    [rowsWithoutStatusFilter],
  );

  const kpis = useMemo(() => {
    const dotcRows = filteredRows.filter((row) => row.venueType === "DOTC");
    const datcRows = filteredRows.filter((row) => row.venueType === "DATC");

    const activeDatcRows = datcRows.filter((row) => row.status === "ACTIVE");
    const blacklistedRows = filteredRows.filter(
      (row) => row.status === "BLACKLISTED" || row.status === "CUSTOMER SPECIFIC BLACKLISTED"
    );

    return {
      dotcCentres: dotcRows.length,
      dotcSeatCapacity: sumBy(dotcRows, (row) => row.venueMaxCapacity),
      activeDatc: activeDatcRows.length,
      activeDatcSeatCapacity: sumBy(activeDatcRows, (row) => row.venueMaxCapacity),
      blacklisted: blacklistedRows.length,
      blacklistedSeatCapacity: sumBy(blacklistedRows, (row) => row.venueMaxCapacity),
      totalDatc: datcRows.length,
      totalDatcSeatCapacity: sumBy(datcRows, (row) => row.venueMaxCapacity),
      inactive: inactiveRows.length,
      inactiveSeatCapacity: sumBy(inactiveRows, (row) => row.venueMaxCapacity),
    };
  }, [filteredRows, inactiveRows]);

  const manpowerSnapshotProjectRows = useMemo(() => {
    const rows = Array.isArray(manpowerSnapshot?.projectSummary) ? manpowerSnapshot.projectSummary : [];
    return rows.slice(0, 8);
  }, [manpowerSnapshot]);

  const globalPersonDirectory = useMemo(() => {
    const sourceRows = Array.isArray(manpowerSnapshot?.manpowerWiseEmployeeRotationDrilldown)
      ? manpowerSnapshot.manpowerWiseEmployeeRotationDrilldown
      : [];
    const map = new Map();

    sourceRows.forEach((row) => {
      const personName = String(row?.personName || "").trim();
      const empId = String(row?.empId || "").trim();
      const phone = String(row?.phone || "").trim();
      if (!personName && !empId) return;

      const key = empId || personName.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          key,
          personName: personName || "Unknown",
          empId,
          phone,
          roles: new Set(),
          states: new Set(),
          cities: new Set(),
          dmsCodes: new Set(),
          venueNames: new Set(),
          totalRecords: 0,
        });
      }

      const entry = map.get(key);
      if (row?.role) entry.roles.add(String(row.role).trim());
      if (row?.state) entry.states.add(String(row.state).trim());
      if (row?.city) entry.cities.add(String(row.city).trim());
      if (row?.dmsCode) entry.dmsCodes.add(String(row.dmsCode).trim());
      if (row?.venueName) entry.venueNames.add(String(row.venueName).trim());
      entry.totalRecords += Number(row?.records || 0) || 0;
    });

    return Array.from(map.values()).map((entry) => ({
      ...entry,
      rolesList: Array.from(entry.roles).filter(Boolean),
      statesList: Array.from(entry.states).filter(Boolean),
      citiesList: Array.from(entry.cities).filter(Boolean),
      dmsCodeList: Array.from(entry.dmsCodes).filter(Boolean),
      venueList: Array.from(entry.venueNames).filter(Boolean),
      uniqueVenues: entry.venueNames.size,
    }));
  }, [manpowerSnapshot]);

  const manpowerByDms = useMemo(() => {
    const sourceRows = Array.isArray(manpowerSnapshot?.manpowerWiseEmployeeRotationDrilldown)
      ? manpowerSnapshot.manpowerWiseEmployeeRotationDrilldown
      : [];
    const bucketMap = new Map();

    sourceRows.forEach((row) => {
      const dmsCode = String(row?.dmsCode || "").trim();
      const personKey = String(row?.empId || row?.personName || "").trim();
      if (!dmsCode || !personKey) return;
      if (!bucketMap.has(dmsCode)) {
        bucketMap.set(dmsCode, {
          available: new Set(),
          used: new Set(),
          totalBatches: 0,
          noDelay: 0,
          partialDelay: 0,
          fullDelay: 0,
          ffa: 0,
          callLogs: 0,
        });
      }
      const bucket = bucketMap.get(dmsCode);
      bucket.available.add(personKey);
      const totalBatchesRaw = toNumber(row?.totalBatches);
      const noDelay = toNumber(row?.noDelay ?? row?.noBatchDelay);
      const partialDelay = toNumber(row?.partialBatchDelay);
      const fullDelay = toNumber(row?.fullBatchDelay);
      const totalBatches = totalBatchesRaw > 0 ? totalBatchesRaw : noDelay + partialDelay + fullDelay;
      const usedSignal =
        totalBatches > 0 ||
        noDelay > 0 ||
        fullDelay > 0 ||
        partialDelay > 0;
      if (usedSignal) bucket.used.add(personKey);
      bucket.totalBatches += totalBatches;
      bucket.noDelay += noDelay;
      bucket.partialDelay += partialDelay;
      bucket.fullDelay += fullDelay;
      bucket.ffa += toNumber(row?.ffa);
      bucket.callLogs += toNumber(row?.callLogs);
    });

    const result = new Map();
    bucketMap.forEach((bucket, dmsCode) => {
      result.set(dmsCode, {
        available: bucket.available.size,
        used: bucket.used.size,
        totalBatches: bucket.totalBatches,
        noDelay: bucket.noDelay,
        partialDelay: bucket.partialDelay,
        fullDelay: bucket.fullDelay,
        ffa: bucket.ffa,
        callLogs: bucket.callLogs,
      });
    });
    return result;
  }, [manpowerSnapshot]);

  const categoryPieData = useMemo(() => {
    const total = filteredRows.length;
    return PIE_ORDER.map((category) => {
      const count = filteredRows.filter((row) => row.category === category).length;
      return {
        name: category,
        value: count,
        percentage: percent(count, total),
      };
    }).filter((item) => item.value > 0);
  }, [filteredRows]);

  const infraData = useMemo(() => {
    const total = filteredRows.length || 1;
    const cctv = Math.round((filteredRows.filter((row) => row.cctvReady).length / total) * 100);
    const pwd = Math.round((filteredRows.filter((row) => row.pwdReady).length / total) * 100);
    const ups = Math.round((filteredRows.filter((row) => row.upsReady).length / total) * 100);
    const readiness = Math.round(
      (filteredRows.filter((row) => row.usedAndTested).length / total) * 100,
    );

    return [
      { subject: "PWD Accessibility", value: pwd },
      { subject: "CCTV Coverage", value: cctv },
      { subject: "Used & Tested", value: readiness },
      { subject: "UPS Availability", value: ups },
    ];
  }, [filteredRows]);

  const regionSummaries = useMemo(() => {
    return REGION_ORDER.map((region) => {
      const regionRows = filteredRows.filter((row) => row.region === region);
      const active = regionRows.filter((row) => row.status === "ACTIVE").length;
      const blacklisted = regionRows.filter((row) => row.status === "BLACKLISTED").length;
      const customerSpecific = regionRows.filter(
        (row) => row.status === "CUSTOMER SPECIFIC BLACKLISTED",
      ).length;

      const countsByCategory = Object.fromEntries(
        CATEGORY_ORDER.map((category) => [
          category,
          regionRows.filter((row) => row.category === category).length,
        ]),
      );

      const datcRows = regionRows.filter((row) => row.venueType === "DATC");
      const dotcRows = regionRows.filter((row) => row.venueType === "DOTC");
      const datcCapacity = sumBy(datcRows, (row) => row.venueMaxCapacity);
      const dotcCapacity = sumBy(dotcRows, (row) => row.venueMaxCapacity);

      return {
        region,
        active,
        blacklisted,
        customerSpecific,
        totalStatus: active + blacklisted + customerSpecific,
        category: countsByCategory,
        totalCategory:
          countsByCategory.A +
          countsByCategory.B +
          countsByCategory.C +
          countsByCategory["BL-C"] +
          countsByCategory.BL,
        datcCount: datcRows.length,
        dotcCount: dotcRows.length,
        totalCount: datcRows.length + dotcRows.length,
        datcCapacity,
        dotcCapacity,
        totalCapacity: datcCapacity + dotcCapacity,
      };
    });
  }, [filteredRows]);

  const statusChartData = useMemo(
    () =>
      regionSummaries.map((item) => ({
        name: item.region,
        ACTIVE: item.active,
        BLACKLISTED: item.blacklisted,
        CUSTOMER_SPECIFIC_BLACKLISTED: item.customerSpecific,
      })),
    [regionSummaries],
  );

  const categoryChartData = useMemo(
    () =>
      regionSummaries.map((item) => ({
        name: item.region,
        A: item.category.A,
        B: item.category.B,
        C: item.category.C,
        "BL-C": item.category["BL-C"],
        BL: item.category.BL,
      })),
    [regionSummaries],
  );

  const distributionCountData = useMemo(
    () =>
      regionSummaries.map((item) => ({
        name: item.region,
        DATC: item.datcCount,
        DOTC: item.dotcCount,
      })),
    [regionSummaries],
  );

  const distributionCapacityData = useMemo(
    () =>
      regionSummaries.map((item) => ({
        name: item.region,
        DATC: item.datcCapacity,
        DOTC: item.dotcCapacity,
      })),
    [regionSummaries],
  );

  const statusTotals = useMemo(() => {
    return {
      active: sumBy(regionSummaries, (item) => item.active),
      blacklisted: sumBy(regionSummaries, (item) => item.blacklisted),
      customerSpecific: sumBy(regionSummaries, (item) => item.customerSpecific),
      grand: sumBy(regionSummaries, (item) => item.totalStatus),
    };
  }, [regionSummaries]);

  const categoryTotals = useMemo(() => {
    return {
      A: sumBy(regionSummaries, (item) => item.category.A),
      B: sumBy(regionSummaries, (item) => item.category.B),
      C: sumBy(regionSummaries, (item) => item.category.C),
      BLC: sumBy(regionSummaries, (item) => item.category["BL-C"]),
      BL: sumBy(regionSummaries, (item) => item.category.BL),
      grand: sumBy(regionSummaries, (item) => item.totalCategory),
    };
  }, [regionSummaries]);

  const distributionTotals = useMemo(() => {
    return {
      datcCount: sumBy(regionSummaries, (item) => item.datcCount),
      dotcCount: sumBy(regionSummaries, (item) => item.dotcCount),
      totalCount: sumBy(regionSummaries, (item) => item.totalCount),
      datcCapacity: sumBy(regionSummaries, (item) => item.datcCapacity),
      dotcCapacity: sumBy(regionSummaries, (item) => item.dotcCapacity),
      totalCapacity: sumBy(regionSummaries, (item) => item.totalCapacity),
    };
  }, [regionSummaries]);

  const comparisonBaseRows = useMemo(
    () =>
      filteredRows.map((row) => {
        const manpowerMeta = manpowerByDms.get(row.dmsCode) || {
          available: 0,
          used: 0,
          totalBatches: 0,
          noDelay: 0,
          partialDelay: 0,
          fullDelay: 0,
          ffa: 0,
          callLogs: 0,
        };
        const isBlacklisted =
          row.status === "BLACKLISTED" || row.status === "CUSTOMER SPECIFIC BLACKLISTED";
        return {
          ...row,
          examCityCentre: buildExamCityCentre(row),
          manpowerAvailable: manpowerMeta.available,
          manpowerUsed: manpowerMeta.used,
          totalBatches: manpowerMeta.totalBatches,
          noDelay: manpowerMeta.noDelay,
          partialDelay: manpowerMeta.partialDelay,
          fullDelay: manpowerMeta.fullDelay,
          ffa: manpowerMeta.ffa,
          callLogs: manpowerMeta.callLogs,
          isBlacklisted,
        };
      }),
    [filteredRows, manpowerByDms],
  );

  const comparisonRows = useMemo(() => {
    if (comparisonTypeFilter === "DATC") {
      return comparisonBaseRows.filter((row) => row.venueType === "DATC");
    }
    if (comparisonTypeFilter === "DOTC") {
      return comparisonBaseRows.filter((row) => row.venueType === "DOTC");
    }
    return comparisonBaseRows;
  }, [comparisonBaseRows, comparisonTypeFilter]);

  const showDatcSeries = comparisonTypeFilter !== "DOTC";
  const showDotcSeries = comparisonTypeFilter !== "DATC";

  useEffect(() => {
    if (!comparisonRows.some((row) => row.region === comparisonRegion)) {
      setComparisonRegion("");
      setComparisonState("");
      setComparisonCity("");
      setComparisonDistrict("");
      return;
    }
    if (
      comparisonState &&
      !comparisonRows.some((row) => row.region === comparisonRegion && row.state === comparisonState)
    ) {
      setComparisonState("");
      setComparisonCity("");
      setComparisonDistrict("");
      return;
    }
  }, [comparisonRows, comparisonRegion, comparisonState]);

  useEffect(() => {
    if (!comparisonRegion) {
      setComparisonState("");
      setComparisonCity("");
      setComparisonDistrict("");
      return;
    }
    if (
      comparisonState &&
      !comparisonRows.some((row) => row.region === comparisonRegion && row.state === comparisonState)
    ) {
      setComparisonState("");
      setComparisonCity("");
      setComparisonDistrict("");
      return;
    }
    if (
      comparisonCity &&
      !comparisonRows.some(
        (row) =>
          row.region === comparisonRegion &&
          row.state === comparisonState &&
          (String(row.city || "").trim() || "-") === comparisonCity,
      )
    ) {
      setComparisonCity("");
      setComparisonDistrict("");
      return;
    }
    if (
      comparisonDistrict &&
      !comparisonRows.some(
        (row) =>
          row.region === comparisonRegion &&
          row.state === comparisonState &&
          (String(row.city || "").trim() || "-") === comparisonCity &&
          (String(row.district || "").trim() || "-") === comparisonDistrict,
      )
    ) {
      setComparisonDistrict("");
    }
  }, [comparisonRows, comparisonRegion, comparisonState, comparisonCity, comparisonDistrict]);

  const aggregateComparisonRows = useCallback((sourceRows, keyResolver) => {
    const map = new Map();
    sourceRows.forEach((row) => {
      const key = keyResolver(row);
      if (!key) return;
      if (!map.has(key)) {
        map.set(key, {
          name: key,
          DATC: 0,
          DOTC: 0,
          totalCount: 0,
          datcCapacity: 0,
          dotcCapacity: 0,
          totalCapacity: 0,
          availableManpower: 0,
          usedManpower: 0,
          totalBatches: 0,
          noDelay: 0,
          partialDelay: 0,
          fullDelay: 0,
          ffa: 0,
          callLogs: 0,
          activeCount: 0,
          inactiveCount: 0,
          blacklistedCount: 0,
        });
      }
      const entry = map.get(key);
      const isDatc = row.venueType === "DATC";
      const isDotc = row.venueType === "DOTC";
      if (isDatc) {
        entry.DATC += 1;
        entry.datcCapacity += toNumber(row.venueMaxCapacity);
      }
      if (isDotc) {
        entry.DOTC += 1;
        entry.dotcCapacity += toNumber(row.venueMaxCapacity);
      }
      entry.totalCount += 1;
      entry.totalCapacity += toNumber(row.venueMaxCapacity);
      entry.availableManpower += toNumber(row.manpowerAvailable);
      entry.usedManpower += toNumber(row.manpowerUsed);
      entry.totalBatches += toNumber(row.totalBatches);
      entry.noDelay += toNumber(row.noDelay);
      entry.partialDelay += toNumber(row.partialDelay);
      entry.fullDelay += toNumber(row.fullDelay);
      entry.ffa += toNumber(row.ffa);
      entry.callLogs += toNumber(row.callLogs);
      if (row.status === "ACTIVE") entry.activeCount += 1;
      else if (row.status === "INACTIVE") entry.inactiveCount += 1;
      if (row.isBlacklisted) entry.blacklistedCount += 1;
    });

    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
    );
  }, []);

  const comparisonRegionData = useMemo(() => {
    const rows = aggregateComparisonRows(comparisonRows, (row) => row.region);
    return rows.sort(
      (a, b) => REGION_ORDER.indexOf(a.name) - REGION_ORDER.indexOf(b.name),
    );
  }, [comparisonRows, aggregateComparisonRows]);

  const comparisonStateScopedRows = useMemo(() => {
    if (!comparisonRegion) return comparisonRows;
    return comparisonRows.filter((row) => row.region === comparisonRegion);
  }, [comparisonRows, comparisonRegion]);

  const comparisonStateData = useMemo(
    () => aggregateComparisonRows(comparisonStateScopedRows, (row) => row.state),
    [comparisonStateScopedRows, aggregateComparisonRows],
  );

  const comparisonCityScopedRows = useMemo(() => {
    if (!comparisonState) return comparisonStateScopedRows;
    return comparisonStateScopedRows.filter((row) => row.state === comparisonState);
  }, [comparisonStateScopedRows, comparisonState]);

  const comparisonCityLevelData = useMemo(
    () =>
      aggregateComparisonRows(
        comparisonCityScopedRows,
        (row) => String(row.city || "").trim() || "-",
      ),
    [comparisonCityScopedRows, aggregateComparisonRows],
  );

  const comparisonDistrictScopedRows = useMemo(() => {
    if (!comparisonCity) return [];
    return comparisonCityScopedRows.filter(
      (row) => (String(row.city || "").trim() || "-") === comparisonCity,
    );
  }, [comparisonCityScopedRows, comparisonCity]);

  const comparisonDistrictData = useMemo(
    () =>
      aggregateComparisonRows(
        comparisonDistrictScopedRows,
        (row) => String(row.district || "").trim() || "-",
      ),
    [comparisonDistrictScopedRows, aggregateComparisonRows],
  );

  const manpowerDrillLevel = useMemo(() => {
    if (comparisonCity) return "district";
    if (comparisonState) return "city";
    if (comparisonRegion) return "state";
    return "region";
  }, [comparisonRegion, comparisonState, comparisonCity]);

  const comparisonTypeLabel = useMemo(() => {
    const selected = DATC_DOTC_FILTER_OPTIONS.find((option) => option.key === comparisonTypeFilter);
    return selected?.label || comparisonTypeFilter;
  }, [comparisonTypeFilter]);

  const isVenueTypeOnlyMode = useMemo(
    () => comparisonTypeFilter === "DATC" || comparisonTypeFilter === "DOTC",
    [comparisonTypeFilter],
  );

  const effectiveComparisonView = useMemo(
    () => (isVenueTypeOnlyMode ? "venue" : comparisonView),
    [isVenueTypeOnlyMode, comparisonView],
  );

  const activeComparisonViewLabel = useMemo(() => {
    const selected = COMPARISON_VIEW_OPTIONS.find((option) => option.key === effectiveComparisonView);
    return selected?.label || "";
  }, [effectiveComparisonView]);

  const comparisonMetricOptions = useMemo(() => {
    if (!effectiveComparisonView) return [];
    return COMPARISON_METRIC_OPTIONS;
  }, [effectiveComparisonView]);

  const activeComparisonMetric = useMemo(() => {
    if (!comparisonMetricOptions.length) return "";
    if (selectedComparisonMetric && comparisonMetricOptions.some((option) => option.key === selectedComparisonMetric)) {
      return selectedComparisonMetric;
    }
    return comparisonMetricOptions[0]?.key || "";
  }, [comparisonMetricOptions, selectedComparisonMetric]);

  const selectedComparisonMetricLabel = useMemo(() => {
    const selected = comparisonMetricOptions.find((option) => option.key === activeComparisonMetric);
    return selected?.label || "";
  }, [comparisonMetricOptions, activeComparisonMetric]);

  const getAggregateComparisonMetricValue = useCallback((row, metricKey) => {
    if (metricKey === "totalCentreCount") return toNumber(row.totalCount);
    if (metricKey === "totalSeatCapacity") return toNumber(row.totalCapacity);
    if (metricKey === "availableManpower") return toNumber(row.availableManpower);
    if (metricKey === "usedManpower") return toNumber(row.usedManpower);
    if (metricKey === "totalBatches") return toNumber(row.totalBatches);
    if (metricKey === "noDelay") return toNumber(row.noDelay);
    if (metricKey === "partialDelay") return toNumber(row.partialDelay);
    if (metricKey === "fullDelay") return toNumber(row.fullDelay);
    if (metricKey === "noDelayPercent") return percent(toNumber(row.noDelay), toNumber(row.totalBatches));
    if (metricKey === "manpowerUtilizationPercent") {
      return percent(toNumber(row.usedManpower), toNumber(row.availableManpower));
    }
    if (metricKey === "ffa") return toNumber(row.ffa);
    if (metricKey === "callLogs") return toNumber(row.callLogs);
    if (metricKey === "activeCount") return toNumber(row.activeCount);
    if (metricKey === "inactiveCount") return toNumber(row.inactiveCount);
    if (metricKey === "blacklistedCount") return toNumber(row.blacklistedCount);
    return 0;
  }, []);

  const manpowerDrillChartData = useMemo(() => {
    const source =
      manpowerDrillLevel === "state"
        ? comparisonStateData
        : manpowerDrillLevel === "city"
          ? comparisonCityLevelData
          : manpowerDrillLevel === "district"
            ? comparisonDistrictData
            : comparisonRegionData;
    return source
      .map((row) => ({
        ...row,
        value: getAggregateComparisonMetricValue(row, activeComparisonMetric),
      }))
      .filter((row) => toNumber(row.value) > 0);
  }, [
    manpowerDrillLevel,
    comparisonRegionData,
    comparisonStateData,
    comparisonCityLevelData,
    comparisonDistrictData,
    getAggregateComparisonMetricValue,
    activeComparisonMetric,
  ]);

  const manpowerDrillChartTitle = useMemo(() => {
    const levelLabel =
      manpowerDrillLevel === "state"
        ? `State-wise (${comparisonRegion})`
        : manpowerDrillLevel === "city"
          ? `City-wise (${comparisonState})`
          : manpowerDrillLevel === "district"
            ? `District-wise (${comparisonCity})`
            : "Region-wise";
    return `${levelLabel} ${selectedComparisonMetricLabel} | ${activeComparisonViewLabel} | ${comparisonTypeLabel}`;
  }, [
    manpowerDrillLevel,
    comparisonRegion,
    comparisonState,
    comparisonCity,
    selectedComparisonMetricLabel,
    activeComparisonViewLabel,
    comparisonTypeLabel,
  ]);

  const handleManpowerDrillBarClick = useCallback((entry) => {
    const bucketName = entry?.payload?.name;
    if (!bucketName) return;

    if (manpowerDrillLevel === "region") {
      setComparisonRegion((prev) => (prev === bucketName ? "" : bucketName));
      setComparisonState("");
      setComparisonCity("");
      setComparisonDistrict("");
      return;
    }

    if (manpowerDrillLevel === "state") {
      setComparisonState((prev) => (prev === bucketName ? "" : bucketName));
      setComparisonCity("");
      setComparisonDistrict("");
      return;
    }

    if (manpowerDrillLevel === "city") {
      setComparisonCity((prev) => (prev === bucketName ? "" : bucketName));
      setComparisonDistrict("");
      return;
    }

    setComparisonDistrict((prev) => (prev === bucketName ? "" : bucketName));
  }, [manpowerDrillLevel]);

  const comparisonKpis = useMemo(() => {
    const totalCentreCount = comparisonRows.length;
    const totalSeatCapacity = sumBy(comparisonRows, (row) => row.venueMaxCapacity);
    const availableManpower = sumBy(comparisonRows, (row) => row.manpowerAvailable);
    const usedManpower = sumBy(comparisonRows, (row) => row.manpowerUsed);
    const totalBatches = sumBy(comparisonRows, (row) => row.totalBatches);
    const noDelay = sumBy(comparisonRows, (row) => row.noDelay);
    const partialDelay = sumBy(comparisonRows, (row) => row.partialDelay);
    const fullDelay = sumBy(comparisonRows, (row) => row.fullDelay);
    const activeCount = comparisonRows.filter((row) => row.status === "ACTIVE").length;
    const inactiveCount = comparisonRows.filter((row) => row.status === "INACTIVE").length;
    const blacklistedCount = comparisonRows.filter((row) => row.isBlacklisted).length;
    return {
      totalCentreCount,
      totalSeatCapacity,
      availableManpower,
      usedManpower,
      totalBatches,
      noDelay,
      partialDelay,
      fullDelay,
      noDelayPercent: percent(noDelay, totalBatches),
      manpowerUtilizationPercent: percent(usedManpower, availableManpower),
      activeCount,
      inactiveCount,
      blacklistedCount,
      ffa: sumBy(comparisonRows, (row) => row.ffa),
      callLogs: sumBy(comparisonRows, (row) => row.callLogs),
    };
  }, [comparisonRows]);

  useEffect(() => {
    if (
      selectedComparisonMetric &&
      !comparisonMetricOptions.some((option) => option.key === selectedComparisonMetric)
    ) {
      setSelectedComparisonMetric("");
    }
  }, [selectedComparisonMetric, comparisonMetricOptions]);

  useEffect(() => {
    setComparisonRegion("");
    setComparisonState("");
    setComparisonCity("");
    setComparisonDistrict("");
    setSelectedComparisonMetric("");
  }, [comparisonView]);

  const formatComparisonMetricValue = useCallback((metricKey, metricValue) => {
    if (metricKey === "noDelayPercent" || metricKey === "manpowerUtilizationPercent") {
      return `${toNumber(metricValue).toFixed(1)}%`;
    }
    return formatCount(metricValue);
  }, []);

  const selectedComparisonMetricTotal = useMemo(() => {
    if (!activeComparisonMetric) return "";
    const totalValue = comparisonKpis[activeComparisonMetric];
    if (totalValue === undefined || totalValue === null) return "";
    return formatComparisonMetricValue(activeComparisonMetric, totalValue);
  }, [activeComparisonMetric, comparisonKpis, formatComparisonMetricValue]);

  const comparisonDrillTableConfig = useMemo(() => {
    if (manpowerDrillLevel === "state") {
      return {
        title: `State-wise ${selectedComparisonMetricLabel}`,
        header: "State",
        rows: comparisonStateData,
        emptyMessage: "No state data found for selected region.",
      };
    }
    if (manpowerDrillLevel === "city") {
      return {
        title: `City-wise ${selectedComparisonMetricLabel}`,
        header: "City",
        rows: comparisonCityLevelData,
        emptyMessage: "No city data found for selected state.",
      };
    }
    if (manpowerDrillLevel === "district") {
      return {
        title: `District-wise ${selectedComparisonMetricLabel}`,
        header: "District",
        rows: comparisonDistrictData,
        emptyMessage: "No district data found for selected city.",
      };
    }
    return {
      title: `Region-wise ${selectedComparisonMetricLabel}`,
      header: "Region",
      rows: comparisonRegionData,
      emptyMessage: "No region data found for selected filters.",
    };
  }, [
    manpowerDrillLevel,
    selectedComparisonMetricLabel,
    comparisonRegionData,
    comparisonStateData,
    comparisonCityLevelData,
    comparisonDistrictData,
  ]);

  const comparisonDrillTableRows = useMemo(
    () =>
      comparisonDrillTableConfig.rows.filter(
        (row) =>
          COMPARISON_METRIC_OPTIONS.some(
            (metric) => toNumber(getAggregateComparisonMetricValue(row, metric.key)) > 0,
          ),
      ),
    [comparisonDrillTableConfig.rows, getAggregateComparisonMetricValue],
  );

  const handleComparisonDrillTableRowClick = useCallback((bucketName) => {
    if (!bucketName) return;
    if (manpowerDrillLevel === "region") {
      setComparisonRegion((prev) => (prev === bucketName ? "" : bucketName));
      setComparisonState("");
      setComparisonCity("");
      setComparisonDistrict("");
      return;
    }
    if (manpowerDrillLevel === "state") {
      setComparisonState((prev) => (prev === bucketName ? "" : bucketName));
      setComparisonCity("");
      setComparisonDistrict("");
      return;
    }
    if (manpowerDrillLevel === "city") {
      setComparisonCity((prev) => (prev === bucketName ? "" : bucketName));
      setComparisonDistrict("");
      return;
    }
    setComparisonDistrict((prev) => (prev === bucketName ? "" : bucketName));
  }, [manpowerDrillLevel]);

  const manpowerRegionComparisonData = useMemo(() => {
    const sourceRows = Array.isArray(manpowerSnapshot?.manpowerWiseSummary)
      ? manpowerSnapshot.manpowerWiseSummary
      : [];
    const rows = sourceRows.map((row) => ({
      region: row.region,
      owned: toNumber(row.ownedUniqueManpower),
      outsourced: toNumber(row.outsourcedUniqueManpower),
      total: toNumber(row.ownedUniqueManpower) + toNumber(row.outsourcedUniqueManpower),
    }));
    return rows.sort((a, b) => REGION_ORDER.indexOf(a.region) - REGION_ORDER.indexOf(b.region));
  }, [manpowerSnapshot]);

  const projectComparisonData = useMemo(() => {
    const sourceRows = Array.isArray(manpowerSnapshot?.projectSummary)
      ? manpowerSnapshot.projectSummary
      : [];
    return sourceRows.map((row) => ({
      project: row.projectName,
      manpower: toNumber(row.uniqueManpower),
      totalBatches: toNumber(row.noBatchDelay) + toNumber(row.partialBatchDelay) + toNumber(row.fullBatchDelay),
      noDelay: toNumber(row.noBatchDelay),
      callLogs: toNumber(row.callLogs),
      ffa: toNumber(row.ffa),
    }));
  }, [manpowerSnapshot]);

  const handleToggleFilter = (key, value) => {
    setSelectedFilters((prev) => {
      if (!prev) return prev;
      const currentList = prev[key] || [];
      const hasValue = currentList.includes(value);
      const updated = hasValue
        ? currentList.filter((item) => item !== value)
        : [...currentList, value];
      const next = { ...prev, [key]: updated };
      if (key === "region" && !updated.length) {
        next.state = [];
        next.examCityCentre = [];
      }
      if (key === "state" && !updated.length) {
        next.examCityCentre = [];
      }
      return next;
    });
  };

  const handleSelectAll = (key) => {
    setSelectedFilters((prev) => {
      if (!prev) return prev;
      return { ...prev, [key]: [...(sidebarFilterOptions[key] || [])] };
    });
  };

  const handleClearAll = (key) => {
    setSelectedFilters((prev) => {
      if (!prev) return prev;
      if (key === "region") {
        return { ...prev, region: [], state: [], examCityCentre: [] };
      }
      if (key === "state") {
        return { ...prev, state: [], examCityCentre: [] };
      }
      return { ...prev, [key]: [] };
    });
  };

  const handleResetAll = () => {
    setSelectedFilters({
      region: [...filterOptions.region],
      state: [...filterOptions.state],
      district: [...filterOptions.district],
      city: [...filterOptions.city],
      examCityCentre: [...filterOptions.examCityCentre],
      status: [...filterOptions.status],
      category: [...filterOptions.category],
      venueType: [...filterOptions.venueType],
      projectName: [...filterOptions.projectName],
      projectMonth: [...filterOptions.projectMonth],
      examWise: [...filterOptions.examWise],
      roles: [...filterOptions.roles],
      documents: [...filterOptions.documents],
    });
    setTopFilters({ region: "", state: "", examCityCentre: "" });
    setSearchInput("");
    setSearchQuery("");
    resetDrilldown();
  };

  const handleSearch = () => {
    const cleaned = searchInput.trim();
    if (!cleaned) {
      setSearchQuery("");
      return;
    }
    setSearchQuery(cleaned);
  };

  const handleTopFilterChange = (key, value) => {
    if (key === "region") {
      setTopFilters({ region: value, state: "", examCityCentre: "" });
      return;
    }
    if (key === "state") {
      setTopFilters((prev) => ({ ...prev, state: value, examCityCentre: "" }));
      return;
    }
    setTopFilters((prev) => ({ ...prev, [key]: value }));
  };

  const globalModuleEntries = useMemo(
    () => [
      {
        id: "module-dashboard",
        title: "Venue Dashboard",
        subtitle: "Open main venue analytics dashboard",
        keywords: "dashboard venue analysis home",
        onSelect: () => goTo("dashboard"),
      },
      {
        id: "module-manpower",
        title: "Manpower Details",
        subtitle: "Open manpower analytics module",
        keywords: "manpower staffing roles documents",
        onSelect: () => goTo("manpower_dashboard", { requiresAuth: true, allowedUsers: ["Admin", "Prafull"] }),
      },
      {
        id: "module-datc-dotc",
        title: "DATC & DOTC Inventory",
        subtitle: "Open DATC/DOTC inventory dashboard",
        keywords: "datc dotc inventory city centres seats",
        onSelect: () => goTo("city_datc_dotc", { requiresAuth: true, allowedUsers: ["Admin", "Prafull"] }),
      },
      {
        id: "module-occupancy",
        title: "Occupancy Details",
        subtitle: "Open DOTC occupancy table",
        keywords: "occupancy dotc seat usage utilisation utilization",
        onSelect: () => goTo("occupancy_dashboard", { requiresAuth: true, allowedUsers: ["Admin", "Prafull"] }),
      },
      {
        id: "module-master-map",
        title: "Master Coverage Map",
        subtitle: "Open India state coverage map",
        keywords: "map coverage state india geography",
        onSelect: () => goTo("master_map", { requiresAuth: true, allowedUsers: ["Admin", "Prafull"] }),
      },
      {
        id: "module-master-data",
        title: "Manage Master Data",
        subtitle: "Open master records section",
        keywords: "master data records admin",
        onSelect: () => goTo("main", { requiresAuth: true }),
      },
      {
        id: "module-process",
        title: "Process Analysis Engine",
        subtitle: "Open process analysis module",
        keywords: "process analysis engine pipeline",
        onSelect: () => goTo("process", { requiresAuth: true, allowedUsers: ["Admin", "Prafull"] }),
      },
    ],
    [goTo],
  );

  const resolveGlobalSearchResults = useCallback((input) => {
    const query = normalizeSearchToken(input);
    if (!query) return [];

    const moduleMatches = globalModuleEntries
      .filter((entry) => `${entry.title} ${entry.subtitle} ${entry.keywords}`.toLowerCase().includes(query))
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        subtitle: entry.subtitle,
        onSelect: entry.onSelect,
      }));

    const venueMatches = buildVenueSearchResults(rows, query, { includeLocation: true, limit: 0 })
      .map((entry) => entry.row)
      .map((row) => ({
        id: `venue-${row.dmsCode}`,
        title: `${row.name || "Unnamed Venue"} (${row.dmsCode})`,
        subtitle: `${row.city || "-"}, ${row.state || "-"} | ${row.venueType || "-"} | ${row.status || "-"}`,
        onSelect: () => openVenueDetail(row.dmsCode),
      }));

    const regionMatches = uniqueSorted(rows.map((row) => row.region))
      .filter((region) => region.toLowerCase().includes(query))
      .slice(0, 5)
      .map((region) => ({
        id: `region-${region}`,
        title: `Region Focus: ${region}`,
        subtitle: "Apply dashboard filter to this region",
        onSelect: () => {
          setTopFilters({ region, state: "", examCityCentre: "" });
          setSearchInput("");
          setSearchQuery("");
        },
      }));

    const stateMatches = uniqueSorted(rows.map((row) => row.state))
      .filter((state) => state.toLowerCase().includes(query))
      .slice(0, 5)
      .map((state) => ({
        id: `state-${state}`,
        title: `State Focus: ${state}`,
        subtitle: "Apply dashboard filter to this state",
        onSelect: () => {
          setTopFilters({ region: "", state, examCityCentre: "" });
          setSearchInput("");
          setSearchQuery("");
        },
      }));


    const statusMatches = STATUS_ORDER
      .filter((status) => status.toLowerCase().includes(query))
      .map((status) => ({
        id: `status-${status}`,
        title: `Status Filter: ${status}`,
        subtitle: "Filter dashboard by status",
        onSelect: () => {
          setSelectedFilters((prev) => {
            if (!prev) return prev;
            return { ...prev, status: [status] };
          });
          setSearchInput("");
          setSearchQuery("");
        },
      }));

    const categoryMatches = CATEGORY_ORDER
      .filter((category) => category.toLowerCase().includes(query))
      .map((category) => ({
        id: `category-${category}`,
        title: `Category Filter: ${category}`,
        subtitle: "Filter dashboard by venue category",
        onSelect: () => {
          setSelectedFilters((prev) => {
            if (!prev) return prev;
            return { ...prev, category: [category] };
          });
          setSearchInput("");
          setSearchQuery("");
        },
      }));

    const manpowerProjectMatches = (manpowerSnapshotProjectRows || [])
      .filter((row) => String(row.projectName || "").toLowerCase().includes(query))
      .slice(0, 6)
      .map((row) => ({
        id: `manpower-project-${row.projectName}`,
        title: `Project: ${row.projectName || "-"}`,
        subtitle: "Open manpower analytics for this project",
        onSelect: () => {
          const payload = { search: String(row.projectName || "").trim() };
          setSelectedVenueCode("");
          setManpowerFilter(payload);
          persistPendingManpowerFilter(payload);
          goTo("manpower_dashboard", { requiresAuth: true, allowedUsers: MANPOWER_ANALYTICS_USERS });
        },
      }));

    const manpowerPersonMatches = globalPersonDirectory
      .filter((person) => {
        const name = normalizeSearchToken(person.personName);
        const empId = normalizeSearchToken(person.empId);
        const primaryText = `${name} ${empId}`.trim();
        const tokens = splitSearchTokens(query);
        const boundaryChecks = tokens.map((token) => new RegExp(`\\b${escapeRegExp(token)}\\b`, "i"));

        if (name === query || empId === query) return true;
        if (boundaryChecks.length && boundaryChecks.every((regex) => regex.test(primaryText))) return true;
        if (name.startsWith(query) || empId.startsWith(query)) return true;
        return tokens.every((token) => primaryText.includes(token));
      })
      .slice(0, 10)
      .map((person) => {
        const rolePreview = person.rolesList.slice(0, 2).join(", ") || "Role unavailable";
        const locationPreview = [person.citiesList[0], person.statesList[0]].filter(Boolean).join(", ") || "Location unavailable";
        const searchToken = String(person.empId || person.personName || "").trim();
        return {
          id: `manpower-person-${person.key}`,
          title: `${person.personName}${person.empId ? ` (${person.empId})` : ""}`,
          subtitle: `${rolePreview} | ${locationPreview} | Venues: ${person.uniqueVenues}`,
          onSelect: () => {
            const payload = {
              search: searchToken,
              focusEmpId: String(person.empId || "").trim(),
              personName: person.personName,
            };
            setSelectedVenueCode("");
            setManpowerFilter(payload);
            persistPendingManpowerFilter(payload);
            goTo("manpower_dashboard", { requiresAuth: true, allowedUsers: MANPOWER_ANALYTICS_USERS });
          },
        };
      });

    const orderedResults = [
      ...moduleMatches,
      ...venueMatches,
      ...manpowerPersonMatches,
      ...manpowerProjectMatches,
      ...regionMatches,
      ...stateMatches,
      ...statusMatches,
      ...categoryMatches,
    ];

    const deduped = [];
    const seen = new Set();
    orderedResults.forEach((entry) => {
      if (!entry || seen.has(entry.id)) return;
      seen.add(entry.id);
      deduped.push(entry);
    });
    return deduped;
  }, [globalModuleEntries, globalPersonDirectory, goTo, manpowerSnapshotProjectRows, openVenueDetail, persistPendingManpowerFilter, rows, setManpowerFilter, setSelectedVenueCode]);

  const renderClickable = (val, onClick) => (
    <span className="clickable-cell" onClick={onClick}>
      {val}
    </span>
  );

  const handleStatusChartBarClick = (entry, statusChartKey) => {
    const row = entry?.payload || entry;
    const regionName = row?.name;
    if (!regionName) return;
    const selectedStatus = STATUS_CHART_KEY_TO_STATUS[statusChartKey];
    if (!selectedStatus) return;
    const clickedValue = toNumber(entry?.value ?? row?.[statusChartKey]);
    if (clickedValue <= 0) return;

    setDrilldownPath({
      type: "status",
      key: selectedStatus,
      region: regionName,
      state: null,
      district: null,
      city: null,
    });
    document.getElementById("drilldown-section")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleCategoryChartBarClick = (entry, categoryChartKey) => {
    const row = entry?.payload || entry;
    const regionName = row?.name;
    if (!regionName) return;
    const selectedCategory = CATEGORY_CHART_KEY_TO_CATEGORY[categoryChartKey];
    if (!selectedCategory) return;
    const clickedValue = toNumber(entry?.value ?? row?.[categoryChartKey]);
    if (clickedValue <= 0) return;

    setDrilldownPath({
      type: "category",
      key: selectedCategory,
      region: regionName,
      state: null,
      district: null,
      city: null,
    });
    document.getElementById("drilldown-section")?.scrollIntoView({ behavior: "smooth" });
  };

  const activeDrilldownRows = useMemo(() => {
    if (!drilldownPath.key) return [];

    let baseRows = [];
    const { type, key } = drilldownPath;

    // Initial filtering based on metric type
    if (type === 'kpi') {
      switch (key) {
        case "dotcCentres":
        case "dotcSeatCapacity":
          baseRows = filteredRows.filter((row) => row.venueType === "DOTC"); break;
        case "activeDatc":
        case "activeDatcSeatCapacity":
          baseRows = filteredRows.filter((row) => row.venueType === "DATC" && row.status === "ACTIVE"); break;
        case "blacklisted":
        case "blacklistedSeatCapacity":
          baseRows = filteredRows.filter((row) => row.status === "BLACKLISTED" || row.status === "CUSTOMER SPECIFIC BLACKLISTED"); break;
        case "totalDatc":
        case "totalDatcSeatCapacity":
          baseRows = filteredRows.filter((row) => row.venueType === "DATC"); break;
        case "inactive":
        case "inactiveSeatCapacity":
          baseRows = rowsWithoutStatusFilter.filter((row) => row.status === "INACTIVE"); break;
        default: baseRows = [];
      }
    } else if (type === 'category') {
      baseRows = filteredRows.filter((row) => row.category === key);
    } else if (type === 'status') {
      baseRows = filteredRows.filter((row) => row.status === key);
    } else if (type === 'infra') {
      if (key === "CCTV Coverage") baseRows = filteredRows.filter((row) => row.cctvReady);
      else if (key === "PWD Accessibility") baseRows = filteredRows.filter((row) => row.pwdReady);
      else if (key === "UPS Availability") baseRows = filteredRows.filter((row) => row.upsReady);
      else if (key === "Used & Tested") baseRows = filteredRows.filter((row) => row.usedAndTested);
    } else if (type === 'map') {
      baseRows = filteredRows.filter((row) => row.state === key);
    }

    // Secondary filtering based on geographic path
    if (drilldownPath.region) baseRows = baseRows.filter(r => r.region === drilldownPath.region);
    if (drilldownPath.state) baseRows = baseRows.filter(r => r.state === drilldownPath.state);
    if (drilldownPath.district) baseRows = baseRows.filter(r => r.district === drilldownPath.district);
    if (drilldownPath.city) baseRows = baseRows.filter(r => r.city === drilldownPath.city);
    if (drilldownPath.venue) baseRows = baseRows.filter(r => r.name === drilldownPath.venue);

    return baseRows;
  }, [drilldownPath, filteredRows, rowsWithoutStatusFilter]);

  const activeDrilldownChartData = useMemo(() => {
    if (!drilldownPath.key || !activeDrilldownRows.length) return [];

    // Determine the next level to show in chart
    let nextLevel = 'region';
    if (drilldownPath.region) nextLevel = 'state';
    if (drilldownPath.state) nextLevel = 'district';
    if (drilldownPath.district) nextLevel = 'city';
    if (drilldownPath.city) nextLevel = 'venue';
    if (drilldownPath.venue) return [];

    const levelMap = new Map();
    activeDrilldownRows.forEach((row) => {
      let levelValue = "";
      if (nextLevel === 'region') levelValue = row.region;
      else if (nextLevel === 'state') levelValue = row.state;
      else if (nextLevel === 'district') levelValue = row.district;
      else if (nextLevel === 'city') levelValue = row.city;
      else if (nextLevel === 'venue') levelValue = row.name;

      levelValue = levelValue || "Unknown";
      if (!levelMap.has(levelValue)) levelMap.set(levelValue, { count: 0, capacity: 0 });
      const entry = levelMap.get(levelValue);
      entry.count += 1;
      entry.capacity += toNumber(row.venueMaxCapacity);
    });

    const results = Array.from(levelMap.entries()).map(([name, data]) => ({
      name,
      value: (drilldownPath.key || "").endsWith("SeatCapacity") ? data.capacity : data.count,
    }));

    return results.sort((a, b) => b.value - a.value);
  }, [drilldownPath, activeDrilldownRows]);

  const activeDrilldownTableRows = useMemo(() => {
    return activeDrilldownRows.map((row) => ([
      row.dmsCode,
      row.name || "-",
      row.region || "-",
      row.state || "-",
      buildExamCityCentre(row),
      row.reason || "-",
      row.category || "-",
      formatCount(row.venueMaxCapacity),
    ]));
  }, [activeDrilldownRows]);

  const stateCounts = useMemo(() => {
    const counts = {};
    filteredRows.forEach((row) => {
      if (row.state) {
        counts[row.state] = (counts[row.state] || 0) + 1;
      }
    });
    return counts;
  }, [filteredRows]);

  const mapCapacitySummary = useMemo(() => {
    if (!filteredRows.length) return null;
    const activeSearchLabel = String(searchQuery || "").trim();
    const isMeaningfulGeo = (value) => {
      const normalized = String(value ?? "").trim();
      return normalized && normalized !== "-";
    };
    const uniqueStates = new Set();
    const uniqueDistricts = new Set();
    const uniqueCities = new Set();

    filteredRows.forEach((row) => {
      if (isMeaningfulGeo(row.state)) uniqueStates.add(row.state);
      if (isMeaningfulGeo(row.district)) uniqueDistricts.add(row.district);
      if (isMeaningfulGeo(row.city)) uniqueCities.add(row.city);
    });

    let scopeLabel = "States";
    let getGroupName = (row) => row.state || "Unknown";

    if (activeSearchLabel) {
      scopeLabel = "Venues";
      getGroupName = (row) => row.name || row.dmsCode || "Unknown Venue";
    } else if (uniqueCities.size === 1) {
      scopeLabel = "Venues";
      getGroupName = (row) => row.name || row.dmsCode || "Unknown Venue";
    } else if (uniqueDistricts.size === 1) {
      scopeLabel = "Cities";
      getGroupName = (row) => row.city || "Unknown";
    } else if (uniqueStates.size === 1) {
      scopeLabel = "Districts";
      getGroupName = (row) => row.district || "Unknown";
    }

    const groups = new Map();
    filteredRows.forEach((row) => {
      const groupName = getGroupName(row);
      if (scopeLabel === "States" && UNION_TERRITORY_NAMES.has(groupName)) return;
      if (!isMeaningfulGeo(groupName)) return;
      if (!groups.has(groupName)) groups.set(groupName, { capacity: 0, venueCount: 0 });
      const entry = groups.get(groupName);
      entry.capacity += toNumber(row.venueMaxCapacity);
      entry.venueCount += 1;
    });

    const sorted = Array.from(groups.entries())
      .sort((a, b) => {
        if (b[1].capacity !== a[1].capacity) return b[1].capacity - a[1].capacity;
        return String(a[0]).localeCompare(String(b[0]), "en", { sensitivity: "base" });
      });
    if (!sorted.length) return null;

    return {
      scopeLabel,
      contextLabel: activeSearchLabel ? activeSearchLabel.toUpperCase() : "",
      totalGroups: sorted.length,
      maxName: sorted[0][0],
      maxCapacity: sorted[0][1].capacity,
      maxVenueCount: sorted[0][1].venueCount,
      minName: sorted[sorted.length - 1][0],
      minCapacity: sorted[sorted.length - 1][1].capacity,
      minVenueCount: sorted[sorted.length - 1][1].venueCount,
    };
  }, [filteredRows, searchQuery]);

  if (busy) {
    return (
      <div className="loading-screen">
        <div className="loader" />
        <p>Loading dashboard data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="loading-screen">
        <p>{error}</p>
      </div>
    );
  }

  if (!selectedFilters) {
    return null;
  }

  return (
    <div className="app-shell">
      <Sidebar
        filterOptions={sidebarFilterOptions}
        selectedFilters={selectedFilters}
        onToggleFilter={handleToggleFilter}
        onSelectAll={handleSelectAll}
        onClearAll={handleClearAll}
        onResetAll={handleResetAll}
        globalSearchConfig={{
          placeholder: "Type name or code and press Search",
          resolve: resolveGlobalSearchResults,
          onSearch: (query) => {
            const cleaned = String(query || "").trim();
            setSearchInput(cleaned);
            setSearchQuery(cleaned.toLowerCase());
          },
          autoOpenModal: false,
        }}
        mobileOpen={mobileSidebarOpen}
        onToggleMobile={() => setMobileSidebarOpen((prev) => !prev)}
      />

      <button
        className={`sidebar-backdrop ${mobileSidebarOpen ? "visible" : ""}`}
        onClick={() => setMobileSidebarOpen(false)}
        aria-label="Close sidebar"
      />

      <main className="main-content">
        <button
          className="mobile-sidebar-toggle"
          onClick={() => setMobileSidebarOpen(true)}
          aria-label="Open sidebar"
        >
          <ChevronsRight size={20} />
        </button>

        <div className="dashboard-top-shell">
          <div className="dash-header">
            <div className="dash-title-block">
              <h1 className="dash-title">Venue Dashboard</h1>
              <div className="perspective-switch" role="tablist" aria-label="Dashboard perspective switch">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activePerspective === "venue"}
                  className={`perspective-btn ${activePerspective === "venue" ? "active" : ""}`}
                  onClick={() => switchPerspective("venue")}
                >
                  Venue Dashboard
                </button>
                {canViewUnifiedManpower ? (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activePerspective === "manpower"}
                    className={`perspective-btn ${activePerspective === "manpower" ? "active" : ""}`}
                    onClick={() => switchPerspective("manpower")}
                  >
                    Manpower Dashboard
                  </button>
                ) : null}


              </div>
            </div>
            <div className="dash-logo">
              <img src="/logo.png" alt="DEXIT Global" className="dash-logo-img" />
            </div>
          </div>

          <div className="kpi-row kpi-row-dashboard" id="venue-perspective-section" ref={venuePerspectiveRef}>
            {KPI_CARDS.map((card) => {
              const val = kpis[card.key];
              const isBlacklisted = card.key === "blacklisted" || card.key === "blacklistedSeatCapacity";
              const isInactive = card.key === "inactive";
              const severityClass = isBlacklisted && val > 0 ? " kpi-severity-critical" : isInactive && val > 0 ? " kpi-severity-warning" : "";
              const severityTone = isBlacklisted && val > 0 ? "critical" : isInactive && val > 0 ? "warning" : "";
              return (
                <button
                  key={card.key}
                  data-tooltip="Click to drill down"
                  className={`kpi-box with-view kpi-clickable${drilldownPath.key === card.key ? " kpi-active" : ""}${severityClass}`}
                  style={{ "--kpi-accent": card.color }}
                  onClick={() => {
                    if (drilldownPath.key === card.key) {
                      resetDrilldown();
                    } else {
                      setDrilldownPath({ type: 'kpi', key: card.key, region: null, state: null, district: null, city: null });
                      document.getElementById("drilldown-section")?.scrollIntoView({ behavior: "smooth" });
                    }
                  }}
                >
                  <div className="kpi-title">
                    {severityTone ? <span className={`kpi-severity-indicator kpi-severity-indicator--${severityTone}`} aria-hidden="true" /> : null}
                    {card.title}
                  </div>
                  <div className="kpi-val">{formatCount(val)}</div>
                </button>
              );
            })}
          </div>

        </div>



        <div className="chart-row-3">
          <div className="chart-col">
            <h3>
              Category Distribution
              <span style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: '500', marginTop: '4px', textTransform: 'none' }}>
                (Click any segment to drill down)
              </span>
            </h3>
            <div className="chart-container chart-container--category">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="44%"
                    innerRadius={65}
                    outerRadius={105}
                    paddingAngle={2}
                    stroke="none"
                    labelLine={{ stroke: "#b7c8dc", strokeWidth: 1 }}
                    label={renderCategoryPieLabel}
                    onClick={(data) => {
                      if (data && data.name) {
                        setDrilldownPath({ type: "category", key: data.name, region: null, state: null, district: null, city: null });
                        document.getElementById("drilldown-section")?.scrollIntoView({ behavior: "smooth" });
                      }
                    }}
                  >
                    {categoryPieData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={PIE_COLORS[entry.name] || "#CBD5E1"}
                        style={{ cursor: "pointer", outline: "none" }}
                      />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(value, name, props) => [formatCount(value), `${name} (${props.payload.percentage}%)`]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="category-meaning-compact">
              {PIE_ORDER.filter((category) => categoryPieData.some((item) => item.name === category)).map((category) => (
                <div
                  key={`category-meaning-${category}`}
                  className="chart-insight-row category-meaning-row"
                  style={{
                    borderColor: CATEGORY_CHIP_STYLES[category]?.border || "#d7e4f2",
                  }}
                >
                  <span className="chart-insight-row-label" style={{ color: CATEGORY_CHIP_STYLES[category]?.text || "#334155" }}>
                    <span
                      className="category-meaning-dot"
                      style={{ backgroundColor: CATEGORY_CHIP_STYLES[category]?.dot || "#64748b" }}
                    />
                    <strong>{category}</strong>: {CATEGORY_MEANINGS[category]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="chart-col">
            <h3>
              Infrastructure Readiness Index
              <span style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: '500', marginTop: '4px', textTransform: 'none' }}>
                (Click any point to drill down)
              </span>
            </h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius={108} data={infraData}>
                  <PolarGrid stroke="#bfd2e6" />
                  <PolarAngleAxis
                    dataKey="subject"
                    tick={{ fill: "#475569", fontSize: 12, cursor: "pointer" }}
                    onClick={(data) => {
                      if (data && data.value) {
                        setDrilldownPath({ type: "infra", key: data.value || "Tested", region: null, state: null, district: null, city: null });
                        document.getElementById("drilldown-section")?.scrollIntoView({ behavior: "smooth" });
                      }
                    }}
                  />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 11 }} />
                  <Radar
                    dataKey="value"
                    stroke="#2b6ca3"
                    fill="#9ecce8"
                    fillOpacity={0.6}
                    dot={{ cursor: "pointer", r: 4 }}
                    activeDot={{
                      r: 6, onClick: (e, payload) => {
                        if (payload && payload.payload) {
                          setDrilldownPath({ type: "infra", key: payload.payload.subject || "Tested", region: null, state: null, district: null, city: null });
                          document.getElementById("drilldown-section")?.scrollIntoView({ behavior: "smooth" });
                        }
                      }
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-insight-card chart-insight-card--stacked">
              {infraData.map((item) => {
                const level = item.value < 50 ? "critical" : item.value < 75 ? "warning" : "healthy";
                return (
                  <div key={item.subject} className={`chart-insight-row chart-insight-row--${level}`}>
                    <span className="chart-insight-row-label">
                      <span className={`chart-insight-dot chart-insight-dot--${level}`} />
                      {item.subject}
                    </span>
                    <span className="chart-insight-row-value">{item.value}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="chart-col chart-col-map">
            <h3>
              India Coverage Map
              <span style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: '500', marginTop: '4px', textTransform: 'none' }}>
                (Click a state to open Master Map)
              </span>
            </h3>
            <div className="chart-container map-holder">
              <IndiaMap
                data={stateCounts}
                onStateClick={(stateName) => {
                  setMasterMapState(stateName);
                  goTo("master_map", { requiresAuth: true, allowedUsers: ["Admin", "Prafull"] });
                }}
              />
            </div>
            {mapCapacitySummary && (
              <div className="chart-insight-card chart-insight-card--stacked">
                <div className="chart-insight-row">
                  <span className="chart-insight-row-label">
                    Max Capacity{mapCapacitySummary.contextLabel ? ` - ${mapCapacitySummary.contextLabel}` : ""}
                  </span>
                  <span className="chart-insight-row-value">
                    {mapCapacitySummary.maxName}
                  </span>
                </div>
                <div className="chart-insight-row">
                  <span className="chart-insight-row-label">Venue Count</span>
                  <span className="chart-insight-row-value">{formatCount(mapCapacitySummary.maxCapacity)}</span>
                </div>
                <div className="chart-insight-row">
                  <span className="chart-insight-row-label">
                    Min Capacity{mapCapacitySummary.contextLabel ? ` - ${mapCapacitySummary.contextLabel}` : ""}
                  </span>
                  <span className="chart-insight-row-value">
                    {mapCapacitySummary.minName}
                  </span>
                </div>
                <div className="chart-insight-row">
                  <span className="chart-insight-row-label">Venue Count</span>
                  <span className="chart-insight-row-value">{formatCount(mapCapacitySummary.minCapacity)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {drilldownPath.key ? (
          <div className="kpi-drilldown-section" id="drilldown-section">
            <div className="drilldown-title-row">
              <div>
                <h3>
                  {drilldownPath.type === 'kpi' && KPI_CARDS.find(c => c.key === drilldownPath.key)?.title}
                  {drilldownPath.type === 'category' && `Category: ${drilldownPath.key}`}
                  {drilldownPath.type === 'status' && `Status: ${drilldownPath.key}`}
                  {drilldownPath.type === 'infra' && `Infra: ${drilldownPath.key}`}
                  {drilldownPath.type === 'map' && `State: ${drilldownPath.key}`}
                  {" — Details"}
                </h3>
                <Breadcrumbs
                  path={drilldownPath}
                  onPop={popDrilldown}
                  onReset={resetDrilldown}
                  kpiTitle={
                    drilldownPath.type === 'kpi' ? KPI_CARDS.find(c => c.key === drilldownPath.key)?.title :
                      drilldownPath.type === 'category' ? `Category ${drilldownPath.key}` :
                        drilldownPath.type === 'status' ? `Status ${drilldownPath.key}` :
                          drilldownPath.type === 'infra' ? drilldownPath.key :
                            drilldownPath.key
                  }
                />
              </div>
              <button className="kpi-drilldown-close" onClick={resetDrilldown}>✕ Close</button>
            </div>

            <div className="kpi-drilldown-body">
              {activeDrilldownChartData.length > 0 ? (
                <div className="kpi-drilldown-chart">
                  <div style={{ marginBottom: '10px', fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
                    Click a bar to drill deeper
                    {drilldownPath.city ? ' into Venues' :
                      drilldownPath.district ? ' into Cities' :
                        drilldownPath.state ? ' into Districts' :
                          drilldownPath.region ? ' into States' : ' into Regions'}
                  </div>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart
                      data={activeDrilldownChartData}
                      onClick={(data) => {
                        if (data && data.activePayload && data.activePayload[0]) {
                          const name = data.activePayload[0].payload.name;
                          if (!drilldownPath.region) pushDrilldown('region', name);
                          else if (!drilldownPath.state) pushDrilldown('state', name);
                          else if (!drilldownPath.district) pushDrilldown('district', name);
                          else if (!drilldownPath.city) pushDrilldown('city', name);
                          else if (!drilldownPath.venue) {
                            const exact = activeDrilldownRows.find(r => r.name === name);
                            if (exact) {
                              openVenueDetail(exact.dmsCode);
                            }
                          }
                        }
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dde6ef" />
                      <XAxis
                        dataKey="name"
                        interval={0}
                        height={62}
                        angle={-12}
                        textAnchor="end"
                        tickMargin={10}
                        tick={{ fill: "#475569", fontSize: 12 }}
                      />
                      <YAxis tick={{ fill: "#64748b", fontSize: 12 }} />
                      <RechartsTooltip formatter={(value) => formatCount(value)} />
                      <Bar
                        dataKey="value"
                        fill={
                          drilldownPath.type === 'kpi' ? (KPI_CARDS.find(c => c.key === drilldownPath.key)?.color || "#3f7fdd") :
                            drilldownPath.type === 'category' ? (PIE_COLORS[drilldownPath.key] || "#3f7fdd") :
                              "#3f7fdd"
                        }
                        radius={[6, 6, 0, 0]}
                        className="mp-clickable-bar"
                        style={{ cursor: 'pointer' }}
                        onClick={(data) => {
                          if (data && data.name) {
                            const name = data.name;
                            if (!drilldownPath.region) pushDrilldown('region', name);
                            else if (!drilldownPath.state) pushDrilldown('state', name);
                            else if (!drilldownPath.district) pushDrilldown('district', name);
                            else if (!drilldownPath.city) pushDrilldown('city', name);
                            else if (!drilldownPath.venue) {
                              const exact = activeDrilldownRows.find(r => r.name === name);
                              if (exact) {
                                openVenueDetail(exact.dmsCode);
                              }
                            }
                          }
                        }}
                      >
                        <LabelList dataKey="value" position="top" style={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} formatter={(val) => val > 0 ? formatCount(val) : ''} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : null}
              <div className="kpi-drilldown-summary">
                <div className="kpi-drilldown-stat"><span>Total Venues</span><strong>{formatCount(activeDrilldownRows.length)}</strong></div>
                <div className="kpi-drilldown-stat"><span>Total Capacity</span><strong>{formatCount(sumBy(activeDrilldownRows, (r) => r.venueMaxCapacity))}</strong></div>
                <div className="kpi-drilldown-stat">
                  <span>
                    {drilldownPath.district ? 'Cities' : drilldownPath.state ? 'Districts' : drilldownPath.region ? 'States' : 'Regions'}
                  </span>
                  <strong>{activeDrilldownChartData.length || 1}</strong>
                </div>
              </div>
            </div>

            <div className="kpi-drilldown-table-wrap">
              <h4>
                Venue Details
                {drilldownPath.city ? ` in ${drilldownPath.city}` :
                  drilldownPath.district ? ` in ${drilldownPath.district}` :
                    drilldownPath.state ? ` in ${drilldownPath.state}` :
                      drilldownPath.region ? ` in ${drilldownPath.region}` : ''}
                ({formatCount(activeDrilldownTableRows.length)} venues)
              </h4>
              <DashboardTable
                headers={["DMS Code", "Venue Name", "Region", "State", "Exam City Centre", "Reason", "Category", "Capacity"]}
                rows={activeDrilldownTableRows}
              />
            </div>
          </div>
        ) : null}

        <div className="section-full">
          <h3>
            Region-Wise Status Distribution
            <span style={{ display: 'block', fontSize: '12px', color: '#64748b', fontWeight: '500', marginTop: '4px', textTransform: 'none' }}>
              (Click any bar section to drill down)
            </span>
          </h3>
          <div className="flex-table-row chart-table-sync-row chart-table-sync-row--wide">
            <div className="half-col" style={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column' }}>
              <div className="chart-table-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div className="chart-legend-row chart-legend-row--status">
                  <span className="chart-legend-item">
                    <span className="chart-legend-swatch" style={{ background: STATUS_COLORS.ACTIVE }} />
                    ACTIVE
                  </span>
                  <span className="chart-legend-item">
                    <span className="chart-legend-swatch" style={{ background: STATUS_COLORS.BLACKLISTED }} />
                    BLACKLISTED
                  </span>
                  <span className="chart-legend-item">
                    <span className="chart-legend-swatch" style={{ background: STATUS_COLORS["CUSTOMER SPECIFIC BLACKLISTED"] }} />
                    CUSTOMER_SPECIFIC_BLACKLISTED
                  </span>
                </div>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statusChartData} margin={{ top: 8, right: 8, left: -4, bottom: 2 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dde6ef" />
                    <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 12 }} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 12 }} />
                    <RechartsTooltip formatter={(value) => formatCount(value)} cursor={false} />
                    <Bar
                      dataKey="ACTIVE"
                      fill={STATUS_COLORS.ACTIVE}
                      minPointSize={8}
                      cursor="pointer"
                      onClick={(entry) => handleStatusChartBarClick(entry, "ACTIVE")}
                    >
                      <LabelList dataKey="ACTIVE" position="top" style={{ fontSize: 10, fill: '#64748b' }} formatter={(val) => val > 0 ? formatCount(val) : ''} />
                    </Bar>
                    <Bar
                      dataKey="BLACKLISTED"
                      fill={STATUS_COLORS.BLACKLISTED}
                      minPointSize={8}
                      cursor="pointer"
                      onClick={(entry) => handleStatusChartBarClick(entry, "BLACKLISTED")}
                    >
                      <LabelList dataKey="BLACKLISTED" position="top" style={{ fontSize: 10, fill: '#64748b' }} formatter={(val) => val > 0 ? formatCount(val) : ''} />
                    </Bar>
                    <Bar
                      dataKey="CUSTOMER_SPECIFIC_BLACKLISTED"
                      fill={STATUS_COLORS["CUSTOMER SPECIFIC BLACKLISTED"]}
                      minPointSize={8}
                      cursor="pointer"
                      onClick={(entry) => handleStatusChartBarClick(entry, "CUSTOMER_SPECIFIC_BLACKLISTED")}
                    >
                      <LabelList dataKey="CUSTOMER_SPECIFIC_BLACKLISTED" position="top" style={{ fontSize: 10, fill: '#64748b' }} formatter={(val) => val > 0 ? formatCount(val) : ''} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                </div>
              </div>
            </div>
            <div className="half-col half-col--axis-start">
              <DashboardTable
                headers={[
                  "REGION",
                  "ACTIVE",
                  "BLACKLISTED",
                  "CUSTOMER SPECIFIC BLACKLISTED",
                  "GRAND TOTAL",
                ]}
                rows={regionSummaries.map((item) => [
                  item.region,
                  renderClickable(<span className="cell-healthy">{formatCount(item.active)}</span>, () => handleStatusChartBarClick(item, "ACTIVE")),
                  renderClickable(<span className={item.blacklisted > 0 ? "cell-critical" : "cell-zero"}>{item.blacklisted > 0 ? "! " : ""}{formatCount(item.blacklisted)}</span>, () => handleStatusChartBarClick(item, "BLACKLISTED")),
                  renderClickable(<span className={item.customerSpecific > 0 ? "cell-warning" : "cell-zero"}>{formatCount(item.customerSpecific)}</span>, () => handleStatusChartBarClick(item, "CUSTOMER_SPECIFIC_BLACKLISTED")),
                  renderClickable(<strong>{formatCount(item.totalStatus)}</strong>, () => {
                    setDrilldownPath({ type: 'map', key: null, region: item.region, state: null, district: null, city: null });
                    document.getElementById("drilldown-section")?.scrollIntoView({ behavior: "smooth" });
                  }),
                ])}
                footerRow={[
                  "Grand Total",
                  formatCount(statusTotals.active),
                  formatCount(statusTotals.blacklisted),
                  formatCount(statusTotals.customerSpecific),
                  formatCount(statusTotals.grand),
                ]}
              />
            </div>
          </div>
        </div>

        <div className="section-full">
          <h3>
            Region-Wise Category Breakdown
            <span style={{ display: 'block', fontSize: '12px', color: '#64748b', fontWeight: '500', marginTop: '4px', textTransform: 'none' }}>
              (Click any bar section to drill down)
            </span>
          </h3>
          <div className="flex-table-row chart-table-sync-row chart-table-sync-row--wide">
            <div className="half-col" style={{ alignSelf: 'stretch', display: 'flex', flexDirection: 'column' }}>
              <div className="chart-table-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div className="chart-legend-row">
                  {[
                    { key: "A", color: CATEGORY_COLORS.A },
                    { key: "B", color: CATEGORY_COLORS.B },
                    { key: "C", color: CATEGORY_COLORS.C },
                    { key: "BL-C", color: CATEGORY_COLORS["BL-C"] },
                    { key: "BL", color: CATEGORY_COLORS.BL },
                  ].map((item) => (
                    <span className="chart-legend-item" key={`cat-legend-${item.key}`}>
                      <span className="chart-legend-swatch" style={{ background: item.color }} />
                      {item.key}
                    </span>
                  ))}
                </div>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryChartData} margin={{ top: 8, right: 8, left: -4, bottom: 2 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dde6ef" />
                    <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 12 }} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 12 }} />
                    <RechartsTooltip formatter={(value) => formatCount(value)} cursor={false} />
                    <Bar
                      dataKey="A"
                      fill={CATEGORY_COLORS.A}
                      minPointSize={8}
                      cursor="pointer"
                      onClick={(entry) => handleCategoryChartBarClick(entry, "A")}
                    >
                      <LabelList dataKey="A" position="top" style={{ fontSize: 10, fill: '#64748b' }} formatter={(val) => val > 0 ? formatCount(val) : ''} />
                    </Bar>
                    <Bar
                      dataKey="B"
                      fill={CATEGORY_COLORS.B}
                      minPointSize={8}
                      cursor="pointer"
                      onClick={(entry) => handleCategoryChartBarClick(entry, "B")}
                    >
                      <LabelList dataKey="B" position="top" style={{ fontSize: 10, fill: '#64748b' }} formatter={(val) => val > 0 ? formatCount(val) : ''} />
                    </Bar>
                    <Bar
                      dataKey="C"
                      fill={CATEGORY_COLORS.C}
                      minPointSize={8}
                      cursor="pointer"
                      onClick={(entry) => handleCategoryChartBarClick(entry, "C")}
                    >
                      <LabelList dataKey="C" position="top" style={{ fontSize: 10, fill: '#64748b' }} formatter={(val) => val > 0 ? formatCount(val) : ''} />
                    </Bar>
                    <Bar
                      dataKey="BL-C"
                      fill={CATEGORY_COLORS["BL-C"]}
                      minPointSize={8}
                      cursor="pointer"
                      onClick={(entry) => handleCategoryChartBarClick(entry, "BL-C")}
                    >
                      <LabelList dataKey="BL-C" position="top" style={{ fontSize: 10, fill: '#64748b' }} formatter={(val) => val > 0 ? formatCount(val) : ''} />
                    </Bar>
                    <Bar
                      dataKey="BL"
                      fill={CATEGORY_COLORS.BL}
                      minPointSize={8}
                      cursor="pointer"
                      onClick={(entry) => handleCategoryChartBarClick(entry, "BL")}
                    >
                      <LabelList dataKey="BL" position="top" style={{ fontSize: 10, fill: '#64748b' }} formatter={(val) => val > 0 ? formatCount(val) : ''} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                </div>
              </div>
            </div>
            <div className="half-col half-col--axis-start">
              <DashboardTable
                headers={["REGION", "A", "B", "C", "BL-C", "BL", "GRAND TOTAL"]}
                rows={regionSummaries.map((item) => [
                  item.region,
                  renderClickable(formatCount(item.category.A), () => handleCategoryChartBarClick(item, "A")),
                  renderClickable(formatCount(item.category.B), () => handleCategoryChartBarClick(item, "B")),
                  renderClickable(formatCount(item.category.C), () => handleCategoryChartBarClick(item, "C")),
                  renderClickable(formatCount(item.category["BL-C"]), () => handleCategoryChartBarClick(item, "BL-C")),
                  renderClickable(formatCount(item.category.BL), () => handleCategoryChartBarClick(item, "BL")),
                  renderClickable(formatCount(item.totalCategory), () => {
                    setDrilldownPath({ type: 'map', key: null, region: item.region, state: null, district: null, city: null });
                    document.getElementById("drilldown-section")?.scrollIntoView({ behavior: "smooth" });
                  }),
                ])}
                footerRow={[
                  "Grand Total",
                  formatCount(categoryTotals.A),
                  formatCount(categoryTotals.B),
                  formatCount(categoryTotals.C),
                  formatCount(categoryTotals.BLC),
                  formatCount(categoryTotals.BL),
                  formatCount(categoryTotals.grand),
                ]}
              />
            </div>
          </div>
        </div>

        <div className="section-full comparison-analytics-shell">
          <div className="comparison-ribbon">
            <div className="comparison-ribbon-left">
              <h2>
                Comparison Analytics
                {isVenueTypeOnlyMode
                  ? ` - ${comparisonTypeLabel}`
                  : effectiveComparisonView
                    ? ` - ${activeComparisonViewLabel} (${comparisonTypeLabel})`
                    : ""}
              </h2>
              <p>Choose module from right. Section opens only after selection.</p>
            </div>
            <div className="comparison-ribbon-right">
              {COMPARISON_VIEW_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  className={`comparison-view-btn ${!isVenueTypeOnlyMode && comparisonView === option.key ? "active" : ""}`}
                  disabled={isVenueTypeOnlyMode}
                  onClick={() => {
                    if (isVenueTypeOnlyMode) return;
                    closeComparisonMetricDropdown();
                    setComparisonView(option.key);
                  }}
                >
                  {option.label}
                </button>
              ))}
              <div className="dataset-pill-wrap comparison-dataset-pill-wrap">
                {DATC_DOTC_FILTER_OPTIONS.map((option) => (
                  <button
                    key={`header-${option.key}`}
                    className={`dataset-pill ${comparisonTypeFilter === option.key ? "active" : ""}`}
                    onClick={() => {
                      closeComparisonMetricDropdown();
                      setComparisonTypeFilter(option.key);
                      if (option.key === "DATC" || option.key === "DOTC") {
                        setSelectedComparisonMetric("totalCentreCount");
                      } else {
                        setSelectedComparisonMetric("");
                      }
                      setComparisonRegion("");
                      setComparisonState("");
                      setComparisonCity("");
                      setComparisonDistrict("");
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="comparison-metric-toolbar">
            <div className="comparison-metric-select-wrap">
              <label htmlFor="comparison-metric-select">Compare By</label>
              <select
                ref={comparisonMetricSelectRef}
                id="comparison-metric-select"
                className="comparison-metric-select"
                value={activeComparisonMetric}
                onChange={(event) => setSelectedComparisonMetric(event.target.value)}
                disabled={!comparisonMetricOptions.length}
              >
                {!effectiveComparisonView ? <option value="">Select module first</option> : null}
                {comparisonMetricOptions.map((option) => (
                  <option key={`metric-${option.key}`} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            {activeComparisonMetric && effectiveComparisonView ? (
              <div className="comparison-metric-total">
                <span>{selectedComparisonMetricLabel}</span>
                <strong>{selectedComparisonMetricTotal}</strong>
              </div>
            ) : null}
          </div>

          {effectiveComparisonView ? (
            <div className="comparison-expand-panel">
              <div className="comparison-drilldown-path">
                <span>Flow: Region -&gt; State -&gt; City -&gt; District</span>
                <div className="comparison-drilldown-actions">
                  <button
                    className="btn-outline btn-outline--small"
                    onClick={() => {
                      closeComparisonMetricDropdown();
                      setComparisonRegion("");
                      setComparisonState("");
                      setComparisonCity("");
                      setComparisonDistrict("");
                    }}
                  >
                    Reset Drilldown
                  </button>
                  {!isVenueTypeOnlyMode ? <span className="comparison-chip">View: {activeComparisonViewLabel || "-"}</span> : null}
                  <span className="comparison-chip">Type: {comparisonTypeLabel}</span>
                  {comparisonRegion ? <span className="comparison-chip">Region: {comparisonRegion}</span> : null}
                  {comparisonState ? <span className="comparison-chip">State: {comparisonState}</span> : null}
                  {comparisonCity ? <span className="comparison-chip">City: {comparisonCity}</span> : null}
                  {comparisonDistrict ? <span className="comparison-chip">District: {comparisonDistrict}</span> : null}
                  {selectedComparisonMetricLabel ? <span className="comparison-chip">Metric: {selectedComparisonMetricLabel}</span> : null}
                </div>
              </div>

              <div className="col-2-grid operational-grid comparison-grid comparison-grid--single">
                <div className="operational-panel comparison-panel--full">
                  <div className="chart-title">{manpowerDrillChartTitle}</div>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart key={`comparison-drill-${effectiveComparisonView}-${manpowerDrillLevel}-${activeComparisonMetric}`} data={manpowerDrillChartData} margin={{ top: 8, right: 8, left: -4, bottom: 2 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dde6ef" />
                      <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: manpowerDrillLevel === "region" ? 15 : 14 }} />
                      <YAxis tick={{ fill: "#64748b", fontSize: 14 }} />
                      <RechartsTooltip formatter={(value) => formatComparisonMetricValue(activeComparisonMetric, value)} />
                      <Bar dataKey="value" name={selectedComparisonMetricLabel} fill="#3f7fdd" minPointSize={5} onClick={handleManpowerDrillBarClick}>
                        <LabelList
                          dataKey="value"
                          position="top"
                          style={{ fontSize: 14, fill: "#64748b", fontWeight: 700 }}
                          formatter={(val) => toNumber(val) > 0 ? formatComparisonMetricValue(activeComparisonMetric, val) : ""}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="section-full comparison-region-summary-table">
                <h3 className="summary-subtitle">{comparisonDrillTableConfig.title}</h3>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{comparisonDrillTableConfig.header}</th>
                        {COMPARISON_METRIC_OPTIONS.map((metric) => (
                          <th key={`cmp-table-head-${metric.key}`}>{metric.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonDrillTableRows.length ? (
                        comparisonDrillTableRows.map((row) => (
                          <tr key={`cmp-drill-row-${manpowerDrillLevel}-${row.name}`}>
                            <td>{renderClickable(row.name, () => handleComparisonDrillTableRowClick(row.name))}</td>
                            {COMPARISON_METRIC_OPTIONS.map((metric) => (
                              <td key={`cmp-table-cell-${manpowerDrillLevel}-${row.name}-${metric.key}`}>
                                {formatComparisonMetricValue(metric.key, getAggregateComparisonMetricValue(row, metric.key))}
                              </td>
                            ))}
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={COMPARISON_METRIC_OPTIONS.length + 1}>{comparisonDrillTableConfig.emptyMessage}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="section-full section-full--operational operational-shell">
          <div className="operational-shell-head">
            <h2>Operational Distribution (DOTC vs DATC)</h2>
            <p>Detailed geographic breakdown of venue classifications</p>
          </div>
          <h3>Region-Wise Distribution</h3>
          <div className="col-2-grid operational-grid">
            <div className="operational-panel">
              <div className="chart-title">Venue Count Distribution</div>
              <div className="chart-legend-row">
                <span className="chart-legend-item">
                  <span className="chart-legend-swatch" style={{ background: OPERATIONAL_COLORS.DATC }} />
                  DATC
                </span>
                <span className="chart-legend-item">
                  <span className="chart-legend-swatch" style={{ background: OPERATIONAL_COLORS.DOTC }} />
                  DOTC
                </span>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={distributionCountData} margin={{ top: 8, right: 8, left: -4, bottom: 2 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dde6ef" />
                  <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 12 }} />
                  <RechartsTooltip formatter={(value) => formatCount(value)} />
                  <Bar
                    dataKey="DATC"
                    fill={OPERATIONAL_COLORS.DATC}
                    stroke={OPERATIONAL_STROKES.DATC}
                    strokeWidth={1.1}
                    fillOpacity={0.95}
                    minPointSize={5}
                    radius={[6, 6, 0, 0]}
                  >
                    <LabelList dataKey="DATC" position="top" style={{ fontSize: 11, fill: "#64748b" }} formatter={(val) => val > 0 ? formatCount(val) : ""} />
                  </Bar>
                  <Bar
                    dataKey="DOTC"
                    fill={OPERATIONAL_COLORS.DOTC}
                    stroke={OPERATIONAL_STROKES.DOTC}
                    strokeWidth={1.1}
                    fillOpacity={0.96}
                    minPointSize={10}
                    radius={[6, 6, 0, 0]}
                  >
                    <LabelList dataKey="DOTC" position="top" style={{ fontSize: 11, fill: "#64748b" }} formatter={(val) => val > 0 ? formatCount(val) : ""} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="operational-panel">
              <div className="chart-title">Total Seat Capacity</div>
              <div className="chart-legend-row">
                <span className="chart-legend-item">
                  <span className="chart-legend-swatch" style={{ background: OPERATIONAL_COLORS.DATC }} />
                  DATC
                </span>
                <span className="chart-legend-item">
                  <span className="chart-legend-swatch" style={{ background: OPERATIONAL_COLORS.DOTC }} />
                  DOTC
                </span>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={distributionCapacityData} margin={{ top: 8, right: 8, left: -4, bottom: 2 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dde6ef" />
                  <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 12 }} />
                  <RechartsTooltip formatter={(value) => formatCount(value)} />
                  <Bar
                    dataKey="DATC"
                    fill={OPERATIONAL_COLORS.DATC}
                    stroke={OPERATIONAL_STROKES.DATC}
                    strokeWidth={1.1}
                    fillOpacity={0.95}
                    minPointSize={5}
                    radius={[6, 6, 0, 0]}
                  >
                    <LabelList dataKey="DATC" position="top" style={{ fontSize: 11, fill: "#64748b" }} formatter={(val) => val > 0 ? formatCount(val) : ""} />
                  </Bar>
                  <Bar
                    dataKey="DOTC"
                    fill={OPERATIONAL_COLORS.DOTC}
                    stroke={OPERATIONAL_STROKES.DOTC}
                    strokeWidth={1.1}
                    fillOpacity={0.96}
                    minPointSize={10}
                    radius={[6, 6, 0, 0]}
                  >
                    <LabelList dataKey="DOTC" position="top" style={{ fontSize: 11, fill: "#64748b" }} formatter={(val) => val > 0 ? formatCount(val) : ""} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="section-full">
          <h3 className="summary-subtitle">Data Summary Table</h3>
          <DashboardTable
            headers={[
              "REGION",
              "DATC Venues",
              "DOTC Venues",
              "Total Venues",
              "DATC Max Capacity",
              "DOTC Max Capacity",
              "Total Capacity",
            ]}
            rows={regionSummaries.map((item) => [
              item.region,
              renderClickable(formatCount(item.datcCount), () => {
                setDrilldownPath({ type: "kpi", key: "totalDatc", region: item.region, state: null, district: null, city: null });
                document.getElementById("drilldown-section")?.scrollIntoView({ behavior: "smooth" });
              }),
              renderClickable(formatCount(item.dotcCount), () => {
                setDrilldownPath({ type: "kpi", key: "dotcCentres", region: item.region, state: null, district: null, city: null });
                document.getElementById("drilldown-section")?.scrollIntoView({ behavior: "smooth" });
              }),
              renderClickable(formatCount(item.totalCount), () => {
                setDrilldownPath({ type: "map", key: null, region: item.region, state: null, district: null, city: null });
                document.getElementById("drilldown-section")?.scrollIntoView({ behavior: "smooth" });
              }),
              renderClickable(formatCount(item.datcCapacity), () => {
                setDrilldownPath({ type: "kpi", key: "totalDatcSeatCapacity", region: item.region, state: null, district: null, city: null });
                document.getElementById("drilldown-section")?.scrollIntoView({ behavior: "smooth" });
              }),
              renderClickable(formatCount(item.dotcCapacity), () => {
                setDrilldownPath({ type: "kpi", key: "dotcSeatCapacity", region: item.region, state: null, district: null, city: null });
                document.getElementById("drilldown-section")?.scrollIntoView({ behavior: "smooth" });
              }),
              renderClickable(formatCount(item.totalCapacity), () => {
                setDrilldownPath({ type: "map", key: null, region: item.region, state: null, district: null, city: null });
                document.getElementById("drilldown-section")?.scrollIntoView({ behavior: "smooth" });
              }),
            ])}
            footerRow={[
              "Grand Total",
              formatCount(distributionTotals.datcCount),
              formatCount(distributionTotals.dotcCount),
              formatCount(distributionTotals.totalCount),
              formatCount(distributionTotals.datcCapacity),
              formatCount(distributionTotals.dotcCapacity),
              formatCount(distributionTotals.totalCapacity),
            ]}
          />
        </div>

      </main>
    </div>
  );
}



