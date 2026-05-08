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

const STATUS_COLORS = {
  ACTIVE: "#79c6e6",
  BLACKLISTED: "#f5a6a6",
  "CUSTOMER SPECIFIC BLACKLISTED": "#2fbaab",
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
  A: "Fully ready",
  B: "Operational with minor gaps",
  C: "Needs improvement",
  BL: "Blacklisted",
  "BL-C": "Customer-specific blacklist",
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

function buildFilterOptions(rows) {
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

  return {
    region: orderedRegions,
    state: uniqueSorted(rows.map((row) => row.state)),
    district: sortedDistricts,
    city: uniqueSorted(rows.map((row) => row.city)),
    examCityCentre: uniqueSorted(rows.map((row) => buildExamCityCentre(row))),
    status: orderedStatus,
    category: orderedCategory,
    venueType: uniqueSorted(rows.map((row) => row.venueType)),
    projectName: [],
    projectMonth: [],
    examWise: [],
    roles: [],
    documents: [],
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

function sumBy(rows, getter) {
  return rows.reduce((sum, row) => sum + toNumber(getter(row)), 0);
}

function percent(part, total) {
  if (!total) return 0;
  return Number(((part / total) * 100).toFixed(1));
}

function doesMatchSearch(row, q) {
  if (!q) return true;
  const haystack = `${row.dmsCode} ${row.name} ${row.city} ${row.district} ${row.state}`.toLowerCase();
  return haystack.includes(q);
}

function formatCount(value) {
  return numberFormat.format(toNumber(value));
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
  const { API, openVenueDetail, openManpowerAnalytics, user, goTo, setMasterMapState, fetchApi } = useApp();

  const [dashboardData, setDashboardData] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [manpowerSnapshot, setManpowerSnapshot] = useState(null);
  const [manpowerSnapshotBusy, setManpowerSnapshotBusy] = useState(false);
  const [manpowerSnapshotError, setManpowerSnapshotError] = useState("");

  const [selectedFilters, setSelectedFilters] = useState(null);
  const [topFilters, setTopFilters] = useState({
    region: "",
    state: "",
    examCityCentre: "",
  });

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activePerspective, setActivePerspective] = useState("venue");
  const venuePerspectiveRef = useRef(null);
  const manpowerPerspectiveRef = useRef(null);

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
    setActivePerspective(nextPerspective);
    const target = nextPerspective === "manpower" ? manpowerPerspectiveRef.current : venuePerspectiveRef.current;
    if (target && typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);


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
          projectName: [],
          projectMonth: [],
          examWise: [],
          roles: [],
          documents: [],
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
      setManpowerSnapshotBusy(false);
      setManpowerSnapshotError("");
      return () => {
        active = false;
      };
    }
    const loadManpowerSnapshot = async () => {
      if (!active) return;
      setManpowerSnapshotBusy(true);
      setManpowerSnapshotError("");
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
        setManpowerSnapshotError(err.message || "Could not load manpower snapshot");
      } finally {
        if (active) setManpowerSnapshotBusy(false);
      }
    };
    loadManpowerSnapshot();
    return () => {
      active = false;
    };
  }, [fetchApi, canViewUnifiedManpower]);

  const rows = useMemo(() => dashboardData?.rows || [], [dashboardData]);

  const filterOptions = useMemo(() => buildFilterOptions(rows), [rows]);

  const sidebarScopedRows = useMemo(() => {
    if (!selectedFilters) return [];

    return rows.filter((row) => {
      if (selectedFilters.venueType && !selectedFilters.venueType.includes(row.venueType)) return false;
      if (!selectedFilters.region.includes(row.region)) return false;
      if (!selectedFilters.state.includes(row.state)) return false;
      if (selectedFilters.examCityCentre && !selectedFilters.examCityCentre.includes(buildExamCityCentre(row))) return false;
      if (!selectedFilters.category.includes(row.category)) return false;
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

  const venueSearchScopeRows = useMemo(() => {
    if (!selectedFilters) return [];

    return sidebarScopedRows.filter((row) => {
      if (topFilters.region && row.region !== topFilters.region) return false;
      if (topFilters.state && row.state !== topFilters.state) return false;
      if (topFilters.examCityCentre && buildExamCityCentre(row) !== topFilters.examCityCentre) return false;
      return true;
    });
  }, [sidebarScopedRows, selectedFilters, topFilters]);

  const rowsWithoutStatusFilter = useMemo(() => {
    if (!selectedFilters) return [];
    return venueSearchScopeRows.filter((row) => doesMatchSearch(row, searchQuery));
  }, [venueSearchScopeRows, selectedFilters, searchQuery]);

  const venueSearchResults = useMemo(() => {
    const cleaned = searchInput.trim().toLowerCase();
    const base = cleaned
      ? venueSearchScopeRows.filter((row) => doesMatchSearch(row, cleaned))
      : venueSearchScopeRows;
    return base.slice(0, 10);
  }, [venueSearchScopeRows, searchInput]);

  const filteredRows = useMemo(() => {
    if (!selectedFilters) return [];
    return rowsWithoutStatusFilter.filter((row) => selectedFilters.status.includes(row.status));
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

  const manpowerSnapshotOverview = useMemo(() => {
    const overview = manpowerSnapshot?.overview || {};
    return {
      manpower: Number(overview.manpower || 0),
      projects: Number(overview.projects || 0),
      drives: Number(overview.drives || 0),
      venueCount: Number(overview.venueCount || 0),
      totalBatches: Number(overview.totalBatches || 0),
      noBatchDelay: Number(overview.noBatchDelay || 0),
      callLogs: Number(overview.callLogs || 0),
      ffa: Number(overview.ffa || 0),
    };
  }, [manpowerSnapshot]);

  const manpowerSnapshotProjectRows = useMemo(() => {
    const rows = Array.isArray(manpowerSnapshot?.projectSummary) ? manpowerSnapshot.projectSummary : [];
    return rows.slice(0, 8);
  }, [manpowerSnapshot]);

  const categoryPieData = useMemo(() => {
    const total = filteredRows.length;
    return PIE_ORDER.map((category) => {
      const count = filteredRows.filter((row) => row.category === category).length;
      return {
        name: category,
        value: count,
        percent: percent(count, total),
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

  const categoryExecutiveInsights = useMemo(() => {
    const total = Number(categoryTotals.grand || 0);
    if (!total) return [];

    const countsByCategory = {
      A: Number(categoryTotals.A || 0),
      B: Number(categoryTotals.B || 0),
      C: Number(categoryTotals.C || 0),
      "BL-C": Number(categoryTotals.BLC || 0),
      BL: Number(categoryTotals.BL || 0),
    };

    const dominant = Object.entries(countsByCategory).sort((left, right) => right[1] - left[1])[0];
    const dominantCategory = dominant?.[0] || "A";
    const dominantCount = Number(dominant?.[1] || 0);
    const dominantShare = percent(dominantCount, total);

    const qualityCount = countsByCategory.A + countsByCategory.B;
    const qualityShare = percent(qualityCount, total);
    const riskCount = countsByCategory["BL-C"] + countsByCategory.BL;
    const riskShare = percent(riskCount, total);
    const cShare = percent(countsByCategory.C, total);

    return [
      `Dominant: ${dominantCategory} (${dominantShare}%, ${formatCount(dominantCount)} venues).`,
      `Ready pool (A+B): ${qualityShare}% | Watchlist (BL+BL-C): ${riskShare}%.`,
      `Upgrade bucket (C): ${cShare}% (${formatCount(countsByCategory.C)} venues).`,
    ];
  }, [categoryTotals]);

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

  const handleToggleFilter = (key, value) => {
    setSelectedFilters((prev) => {
      if (!prev) return prev;
      const currentList = prev[key] || [];
      const hasValue = currentList.includes(value);
      const updated = hasValue
        ? currentList.filter((item) => item !== value)
        : [...currentList, value];
      return { ...prev, [key]: updated };
    });
  };

  const handleSelectAll = (key) => {
    setSelectedFilters((prev) => {
      if (!prev) return prev;
      return { ...prev, [key]: [...(filterOptions[key] || [])] };
    });
  };

  const handleClearAll = (key) => {
    setSelectedFilters((prev) => {
      if (!prev) return prev;
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
      projectName: [],
      projectMonth: [],
      examWise: [],
      roles: [],
      documents: [],
    });
    setTopFilters({ region: "", state: "", examCityCentre: "" });
    setSearchInput("");
    setSearchQuery("");
    resetDrilldown();
  };

  const handleSearch = () => {
    const cleaned = searchInput.trim().toLowerCase();
    setSearchQuery(cleaned);
    if (!cleaned) return;
    const exact = rows.find((row) => row.dmsCode.toLowerCase() === cleaned);
    if (exact && user && ["Admin", "Prafull"].includes(user.user)) {
      openVenueDetail(exact.dmsCode);
    }
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
    const query = String(input || "").trim().toLowerCase();
    if (!query) return [];

    const moduleMatches = globalModuleEntries
      .filter((entry) => `${entry.title} ${entry.subtitle} ${entry.keywords}`.toLowerCase().includes(query))
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        subtitle: entry.subtitle,
        onSelect: entry.onSelect,
      }));

    const venueMatches = rows
      .filter((row) => doesMatchSearch(row, query))
      .slice(0, 8)
      .map((row) => ({
        id: `venue-${row.dmsCode}`,
        title: `${row.name || "Unnamed Venue"} (${row.dmsCode})`,
        subtitle: `${row.city || "-"}, ${row.state || "-"} | ${row.venueType || "-"} | ${row.status || "-"}`,
        onSelect: () => openVenueDetail(row.dmsCode),
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

    return [...moduleMatches, ...venueMatches, ...stateMatches].slice(0, 12);
  }, [globalModuleEntries, openVenueDetail, rows]);

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

  const stateSummary = useMemo(() => {
    if (!filteredRows.length) return null;
    const states = new Map();
    filteredRows.forEach((row) => {
      const s = row.state;
      if (!s) return;
      if (!states.has(s)) states.set(s, { count: 0, capacity: 0 });
      const entry = states.get(s);
      entry.count += 1;
      entry.capacity += toNumber(row.venueMaxCapacity);
    });

    const sorted = Array.from(states.entries()).sort((a, b) => b[1].capacity - a[1].capacity);
    if (!sorted.length) return null;

    return {
      totalStates: sorted.length,
      maxState: sorted[0][0],
      maxCapacity: sorted[0][1].capacity,
      minState: sorted[sorted.length - 1][0],
      minCapacity: sorted[sorted.length - 1][1].capacity
    };
  }, [filteredRows]);

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
        filterOptions={filterOptions}
        selectedFilters={selectedFilters}
        onToggleFilter={handleToggleFilter}
        onSelectAll={handleSelectAll}
        onClearAll={handleClearAll}
        onResetAll={handleResetAll}
        globalSearchConfig={{
          placeholder: "Search module, venue, DMS, city, state...",
          resolve: resolveGlobalSearchResults,
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
              <h1 className="dash-title">Venue Analysis Dashboard</h1>
              <p className="dash-subtitle">Live venue intelligence with drilldown analytics</p>
              <div className="perspective-switch" role="tablist" aria-label="Dashboard perspective switch">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activePerspective === "venue"}
                  className={`perspective-btn ${activePerspective === "venue" ? "active" : ""}`}
                  onClick={() => switchPerspective("venue")}
                >
                  Venue Perspective
                </button>
                {canViewUnifiedManpower ? (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activePerspective === "manpower"}
                    className={`perspective-btn ${activePerspective === "manpower" ? "active" : ""}`}
                    onClick={() => switchPerspective("manpower")}
                  >
                    Manpower Perspective
                  </button>
                ) : null}
              </div>
            </div>
            <div className="dash-logo">
              <img src="/logo.png" alt="DEXIT Global" className="dash-logo-img" />
            </div>
          </div>

          <div className="search-card dashboard-venue-search">
            <div className="search-title">Venue Search</div>
            <div className="search-desc">Search by venue name, DMS code, city, district or state.</div>
            <div className="search-flex">
              <input
                className="search-input"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleSearch();
                }}
                placeholder="e.g. AP COMPUTER POINT or EST-AR-1161 or ITANAGAR..."
              />
              <button className="search-btn" onClick={handleSearch}>Search Venue</button>
            </div>
            {searchInput.trim() ? (
              <div className="search-result-list dashboard-venue-search-results">
                {venueSearchResults.length ? (
                  venueSearchResults.map((row) => (
                    <div className="search-result-row" key={`venue-result-${row.dmsCode}`}>
                      <div>
                        <div className="result-main">{row.name || "-"}</div>
                        <div className="result-sub">
                          {row.dmsCode} | {row.city || "-"}, {row.state || "-"} | {row.status || "-"}
                        </div>
                      </div>
                      <button className="btn-outline search-result-btn" onClick={() => openVenueDetail(row.dmsCode)}>
                        Open
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="search-empty">No venue matches found.</div>
                )}
              </div>
            ) : null}
          </div>

          <div className="kpi-row kpi-row-dashboard" id="venue-perspective-section" ref={venuePerspectiveRef}>
          {KPI_CARDS.map((card) => {
            const val = kpis[card.key];
            const isBlacklisted = card.key === "blacklisted" || card.key === "blacklistedSeatCapacity";
            const isInactive = card.key === "inactive";
            const severityClass = isBlacklisted && val > 0 ? " kpi-severity-critical" : isInactive && val > 0 ? " kpi-severity-warning" : "";
            const severityIcon = isBlacklisted && val > 0 ? "🔴" : isInactive && val > 0 ? "🟡" : "";
            return (
              <button
                key={card.key}
                data-tooltip="View details"
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
                <div className="kpi-title">{severityIcon ? <span className="kpi-severity-icon">{severityIcon}</span> : null}{card.title}</div>
                <div className="kpi-val">{formatCount(val)}</div>
                <div className="kpi-click-hint">{drilldownPath.key === card.key ? "Hide details" : "View details"}</div>
              </button>
            );
          })}
          </div>
        </div>

        {canViewUnifiedManpower ? (
          <section className="unified-perspective-section" id="manpower-perspective-section" ref={manpowerPerspectiveRef}>
            <div className="unified-perspective-head">
              <h3 className="section-title">Unified View: Manpower Perspective</h3>
              <button
                className="mp-action-btn mp-action-btn-primary"
                onClick={() => goTo("manpower_dashboard", { requiresAuth: true, allowedUsers: MANPOWER_ANALYTICS_USERS })}
              >
                Open Detailed Manpower Analytics
              </button>
            </div>
            {manpowerSnapshotError ? <div className="inline-error">{manpowerSnapshotError}</div> : null}
            {manpowerSnapshotBusy ? (
              <div className="photo-placeholder" style={{ height: "auto", padding: "18px", borderStyle: "dashed" }}>
                Loading manpower perspective...
              </div>
            ) : (
              <>
                <div className="unified-perspective-kpis">
                  <div className="unified-perspective-kpi"><span>Manpower</span><strong>{formatCount(manpowerSnapshotOverview.manpower)}</strong></div>
                  <div className="unified-perspective-kpi"><span>Projects</span><strong>{formatCount(manpowerSnapshotOverview.projects)}</strong></div>
                  <div className="unified-perspective-kpi"><span>Drives</span><strong>{formatCount(manpowerSnapshotOverview.drives)}</strong></div>
                  <div className="unified-perspective-kpi"><span>Venue Count</span><strong>{formatCount(manpowerSnapshotOverview.venueCount)}</strong></div>
                  <div className="unified-perspective-kpi"><span>Total Batches</span><strong>{formatCount(manpowerSnapshotOverview.totalBatches)}</strong></div>
                  <div className="unified-perspective-kpi"><span>No Delay</span><strong>{formatCount(manpowerSnapshotOverview.noBatchDelay)}</strong></div>
                  <div className="unified-perspective-kpi"><span>Call Logs</span><strong>{formatCount(manpowerSnapshotOverview.callLogs)}</strong></div>
                  <div className="unified-perspective-kpi"><span>FFA</span><strong>{formatCount(manpowerSnapshotOverview.ffa)}</strong></div>
                </div>

                <div className="table-wrap" style={{ marginTop: "10px" }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Project</th>
                        <th>Drive Count</th>
                        <th>Unique Manpower</th>
                        <th>No Delay</th>
                        <th>Call Logs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {manpowerSnapshotProjectRows.length ? (
                        manpowerSnapshotProjectRows.map((row, idx) => (
                          <tr key={`unified-mp-project-${row.projectName}-${idx}`}>
                            <td><strong>{row.projectName || "-"}</strong></td>
                            <td>{formatCount(row.driveCount || 0)}</td>
                            <td>{formatCount(row.uniqueManpower || 0)}</td>
                            <td>{formatCount(row.noBatchDelay || 0)}</td>
                            <td>{formatCount(row.callLogs || 0)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5}>No manpower project snapshot found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        ) : null}




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
                      <XAxis dataKey="name" tick={{ fill: "#475569", fontSize: 12 }} />
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

        <div className="chart-row-3">
          <div className="chart-col">
            <h3>
              Category Distribution
              <span style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: '500', marginTop: '4px', textTransform: 'none' }}>
                (Interactive: Click any segment to drill down)
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
                    formatter={(value, name, props) => [formatCount(value), `${name} (${props.payload.percent}%)`]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="category-meaning-compact">
              {PIE_ORDER.filter((category) => categoryPieData.some((item) => item.name === category)).map((category) => (
                <span key={`category-meaning-${category}`} className="category-meaning-chip">
                  <strong>{category}</strong>: {CATEGORY_MEANINGS[category]}
                </span>
              ))}
            </div>
            {categoryExecutiveInsights.length ? (
              <div className="chart-insight-exec">
                <div className="chart-insight-exec-title">Category Insights</div>
                <ul className="chart-insight-exec-list">
                  {categoryExecutiveInsights.map((line, index) => (
                    <li key={`category-insight-${index}`}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="chart-col">
            <h3>
              Infrastructure Readiness Index
              <span style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: '500', marginTop: '4px', textTransform: 'none' }}>
                (Interactive: Click any point to drill down)
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
                (Interactive: Click a state to open Master Map)
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
            {stateSummary && (
              <div className="chart-insight-card chart-insight-card--stacked">
                <div className="chart-insight-row">
                  <span className="chart-insight-row-label">Total States</span>
                  <span className="chart-insight-row-value">{stateSummary.totalStates}</span>
                </div>
                <div className="chart-insight-row">
                  <span className="chart-insight-row-label">Max Capacity</span>
                  <span className="chart-insight-row-value">
                    {stateSummary.maxState} ({formatCount(stateSummary.maxCapacity)})
                  </span>
                </div>
                <div className="chart-insight-row">
                  <span className="chart-insight-row-label">Min Capacity</span>
                  <span className="chart-insight-row-value">
                    {stateSummary.minState} ({formatCount(stateSummary.minCapacity)})
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="section-full">
          <h3>
            Region-Wise Status Distribution
            <span style={{ display: 'block', fontSize: '12px', color: '#64748b', fontWeight: '500', marginTop: '4px', textTransform: 'none' }}>
              (Interactive: Click any bar section to drill down)
            </span>
          </h3>
          <div className="flex-table-row">
            <div className="half-col">
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
              <ResponsiveContainer width="100%" height={330}>
                <BarChart data={statusChartData} margin={{ top: 8, right: 8, left: -4, bottom: 2 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dde6ef" />
                  <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 12 }} />
                  <RechartsTooltip formatter={(value) => formatCount(value)} />
                  <Bar
                    dataKey="ACTIVE"
                    fill={STATUS_COLORS.ACTIVE}
                    cursor="pointer"
                    onClick={(entry) => handleStatusChartBarClick(entry, "ACTIVE")}
                  >
                    <LabelList dataKey="ACTIVE" position="top" style={{ fontSize: 10, fill: '#64748b' }} formatter={(val) => val > 0 ? formatCount(val) : ''} />
                  </Bar>
                  <Bar
                    dataKey="BLACKLISTED"
                    fill={STATUS_COLORS.BLACKLISTED}
                    cursor="pointer"
                    onClick={(entry) => handleStatusChartBarClick(entry, "BLACKLISTED")}
                  >
                    <LabelList dataKey="BLACKLISTED" position="top" style={{ fontSize: 10, fill: '#64748b' }} formatter={(val) => val > 0 ? formatCount(val) : ''} />
                  </Bar>
                  <Bar
                    dataKey="CUSTOMER_SPECIFIC_BLACKLISTED"
                    fill={STATUS_COLORS["CUSTOMER SPECIFIC BLACKLISTED"]}
                    cursor="pointer"
                    onClick={(entry) => handleStatusChartBarClick(entry, "CUSTOMER_SPECIFIC_BLACKLISTED")}
                  >
                    <LabelList dataKey="CUSTOMER_SPECIFIC_BLACKLISTED" position="top" style={{ fontSize: 10, fill: '#64748b' }} formatter={(val) => val > 0 ? formatCount(val) : ''} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="half-col">
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
                  renderClickable(<span className={item.blacklisted > 0 ? "cell-critical" : "cell-zero"}>{item.blacklisted > 0 ? "⚠ " : ""}{formatCount(item.blacklisted)}</span>, () => handleStatusChartBarClick(item, "BLACKLISTED")),
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
              (Interactive: Click any bar section to drill down)
            </span>
          </h3>
          <div className="flex-table-row">
            <div className="half-col">
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
              <ResponsiveContainer width="100%" height={330}>
                <BarChart data={categoryChartData} margin={{ top: 8, right: 8, left: -4, bottom: 2 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dde6ef" />
                  <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 12 }} />
                  <RechartsTooltip formatter={(value) => formatCount(value)} />
                  <Bar
                    dataKey="A"
                    fill={CATEGORY_COLORS.A}
                    cursor="pointer"
                    onClick={(entry) => handleCategoryChartBarClick(entry, "A")}
                  >
                    <LabelList dataKey="A" position="top" style={{ fontSize: 10, fill: '#64748b' }} formatter={(val) => val > 0 ? formatCount(val) : ''} />
                  </Bar>
                  <Bar
                    dataKey="B"
                    fill={CATEGORY_COLORS.B}
                    cursor="pointer"
                    onClick={(entry) => handleCategoryChartBarClick(entry, "B")}
                  >
                    <LabelList dataKey="B" position="top" style={{ fontSize: 10, fill: '#64748b' }} formatter={(val) => val > 0 ? formatCount(val) : ''} />
                  </Bar>
                  <Bar
                    dataKey="C"
                    fill={CATEGORY_COLORS.C}
                    cursor="pointer"
                    onClick={(entry) => handleCategoryChartBarClick(entry, "C")}
                  >
                    <LabelList dataKey="C" position="top" style={{ fontSize: 10, fill: '#64748b' }} formatter={(val) => val > 0 ? formatCount(val) : ''} />
                  </Bar>
                  <Bar
                    dataKey="BL-C"
                    fill={CATEGORY_COLORS["BL-C"]}
                    cursor="pointer"
                    onClick={(entry) => handleCategoryChartBarClick(entry, "BL-C")}
                  >
                    <LabelList dataKey="BL-C" position="top" style={{ fontSize: 10, fill: '#64748b' }} formatter={(val) => val > 0 ? formatCount(val) : ''} />
                  </Bar>
                  <Bar
                    dataKey="BL"
                    fill={CATEGORY_COLORS.BL}
                    cursor="pointer"
                    onClick={(entry) => handleCategoryChartBarClick(entry, "BL")}
                  >
                    <LabelList dataKey="BL" position="top" style={{ fontSize: 10, fill: '#64748b' }} formatter={(val) => val > 0 ? formatCount(val) : ''} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="half-col">
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

        <div className="heading-banner">
          <h2>Operational Distribution (DOTC vs DATC)</h2>
          <p>Detailed geographic breakdown of venue classifications</p>
        </div>

        <div className="section-full">
          <h3>Region-Wise Distribution</h3>
          <div className="col-2-grid">
            <div>
              <div className="chart-title">Venue Count Distribution</div>
              <div className="chart-legend-row">
                <span className="chart-legend-item">
                  <span className="chart-legend-swatch" style={{ background: "#3f7fdd" }} />
                  DATC
                </span>
                <span className="chart-legend-item">
                  <span className="chart-legend-swatch" style={{ background: "#7d58e2" }} />
                  DOTC
                </span>
              </div>
              <ResponsiveContainer width="100%" height={330}>
                <BarChart data={distributionCountData} margin={{ top: 8, right: 8, left: -4, bottom: 2 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dde6ef" />
                  <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 12 }} />
                  <RechartsTooltip formatter={(value) => formatCount(value)} />
                  <Bar dataKey="DATC" fill="#3f7fdd">
                    <LabelList dataKey="DATC" position="top" style={{ fontSize: 11, fill: '#64748b' }} formatter={(val) => val > 0 ? formatCount(val) : ''} />
                  </Bar>
                  <Bar dataKey="DOTC" fill="#7d58e2">
                    <LabelList dataKey="DOTC" position="top" style={{ fontSize: 11, fill: '#64748b' }} formatter={(val) => val > 0 ? formatCount(val) : ''} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <div className="chart-title">Total Seat Capacity</div>
              <div className="chart-legend-row">
                <span className="chart-legend-item">
                  <span className="chart-legend-swatch" style={{ background: "#3f7fdd" }} />
                  DATC
                </span>
                <span className="chart-legend-item">
                  <span className="chart-legend-swatch" style={{ background: "#7d58e2" }} />
                  DOTC
                </span>
              </div>
              <ResponsiveContainer width="100%" height={330}>
                <BarChart data={distributionCapacityData} margin={{ top: 8, right: 8, left: -4, bottom: 2 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dde6ef" />
                  <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 12 }} />
                  <RechartsTooltip formatter={(value) => formatCount(value)} />
                  <Bar dataKey="DATC" fill="#3f7fdd">
                    <LabelList dataKey="DATC" position="top" style={{ fontSize: 11, fill: '#64748b' }} formatter={(val) => val > 0 ? formatCount(val) : ''} />
                  </Bar>
                  <Bar dataKey="DOTC" fill="#7d58e2">
                    <LabelList dataKey="DOTC" position="top" style={{ fontSize: 11, fill: '#64748b' }} formatter={(val) => val > 0 ? formatCount(val) : ''} />
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
              "DATC MAX CAPACITY",
              "DOTC MAX CAPACITY",
              "Total Capacity",
            ]}
            rows={regionSummaries.map((item) => [
              item.region,
              renderClickable(formatCount(item.datcCount), () => {
                setDrilldownPath({ type: 'kpi', key: 'totalDatc', region: item.region, state: null, district: null, city: null });
                document.getElementById("drilldown-section")?.scrollIntoView({ behavior: "smooth" });
              }),
              renderClickable(formatCount(item.dotcCount), () => {
                setDrilldownPath({ type: 'kpi', key: 'dotcCentres', region: item.region, state: null, district: null, city: null });
                document.getElementById("drilldown-section")?.scrollIntoView({ behavior: "smooth" });
              }),
              renderClickable(formatCount(item.totalCount), () => {
                setDrilldownPath({ type: 'map', key: null, region: item.region, state: null, district: null, city: null });
                document.getElementById("drilldown-section")?.scrollIntoView({ behavior: "smooth" });
              }),
              renderClickable(formatCount(item.datcCapacity), () => {
                setDrilldownPath({ type: 'kpi', key: 'totalDatcSeatCapacity', region: item.region, state: null, district: null, city: null });
                document.getElementById("drilldown-section")?.scrollIntoView({ behavior: "smooth" });
              }),
              renderClickable(formatCount(item.dotcCapacity), () => {
                setDrilldownPath({ type: 'kpi', key: 'dotcSeatCapacity', region: item.region, state: null, district: null, city: null });
                document.getElementById("drilldown-section")?.scrollIntoView({ behavior: "smooth" });
              }),
              renderClickable(formatCount(item.totalCapacity), () => {
                setDrilldownPath({ type: 'map', key: null, region: item.region, state: null, district: null, city: null });
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





