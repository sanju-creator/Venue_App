import React, { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { useApp } from "@/context/AppContext";

const TABLE_COLUMNS = [
  { key: "month", label: "Month", type: "text" },
  { key: "dmsCode", label: "DMS Code", type: "text" },
  { key: "examCenter", label: "Exam Center", type: "text" },
  { key: "seatCapacity", label: "Capacity", type: "number" },
  { key: "seatOccupancy", label: "Occupied", type: "number" },
  { key: "occupancyPercent", label: "Occupancy", type: "percent" },
  { key: "utilizationGap", label: "Available", type: "number" },
];

const PAGE_SIZES = [25, 50, 100, 250, 500];
const BAND_CONFIG = [
  { key: "excellent", label: "Excellent", range: "85%+", className: "excellent" },
  { key: "healthy", label: "Healthy", range: "60-84%", className: "healthy" },
  { key: "watch", label: "Watch", range: "40-59%", className: "watch" },
  { key: "critical", label: "Critical", range: "<40%", className: "critical" },
];

function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString("en-IN") : "-";
}

function formatPercent(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? `${number.toLocaleString("en-IN", { maximumFractionDigits: 1 })}%` : "-";
}

function monthIndex(value, months) {
  const index = months.indexOf(value);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function occupancyTone(value) {
  const number = Number(value || 0);
  if (number >= 85) return "excellent";
  if (number >= 60) return "healthy";
  if (number >= 40) return "watch";
  if (number > 0) return "critical";
  return "empty";
}

function bandKey(value) {
  const number = Number(value || 0);
  if (number >= 85) return "excellent";
  if (number >= 60) return "healthy";
  if (number >= 40) return "watch";
  return "critical";
}

function pctWidth(value) {
  const number = Math.max(0, Math.min(Number(value || 0), 140));
  return `${Math.min(number, 100)}%`;
}

function renderCell(row, column) {
  const value = row[column.key];
  if (column.type === "number") return <span className="occupancy-num">{formatNumber(value)}</span>;
  if (column.type === "percent") {
    const tone = occupancyTone(value);
    return (
      <div className="occupancy-meter-cell">
        <span className={`occupancy-badge ${tone}`}>{formatPercent(value)}</span>
        <span className="occupancy-meter">
          <span className={`occupancy-meter-fill ${tone}`} style={{ width: pctWidth(value) }} />
        </span>
      </div>
    );
  }
  return value || "-";
}

function CenterList({ title, rows, mode }) {
  const Icon = mode === "high" ? ArrowUp : ArrowDown;
  return (
    <div className="occupancy-list-card">
      <div className="occupancy-list-title">
        <span className={`occupancy-list-icon ${mode}`}><Icon size={15} /></span>
        {title}
      </div>
      <div className="occupancy-list">
        {rows.map((row) => (
          <div className="occupancy-list-row" key={`${title}-${row.month}-${row.dmsCode}`}>
            <div className="occupancy-list-main">
              <strong>{row.examCenter || row.dmsCode || "-"}</strong>
              <span>{row.month} | {row.dmsCode} | Cap {formatNumber(row.seatCapacity)}</span>
            </div>
            <span className={`occupancy-badge ${occupancyTone(row.occupancyPercent)}`}>
              {formatPercent(row.occupancyPercent)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OccupancyDashboardPage() {
  const { fetchApi, goTo } = useApp();
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [months, setMonths] = useState([]);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sortConfig, setSortConfig] = useState({ key: "occupancyPercent", direction: "desc" });

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetchApi("occupancy/data");
        if (!active) return;
        setRows(Array.isArray(response.rows) ? response.rows : Array.isArray(response.data) ? response.data : []);
        setSummary(response.summary || null);
        setMonths(Array.isArray(response.months) ? response.months : []);
        setFileName(response.fileName || "");
      } catch (err) {
        if (active) setError(err.message || "Occupancy data load nahi ho paya.");
      } finally {
        if (active) setLoading(false);
      }
    };
    loadData();
    return () => {
      active = false;
    };
  }, [fetchApi]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (month !== "all" && row.month !== month) return false;
      if (!needle) return true;
      return TABLE_COLUMNS.some((column) => String(row[column.key] ?? "").toLowerCase().includes(needle));
    });
  }, [month, rows, search]);

  const filteredAndSortedRows = useMemo(() => {
    const sorted = [...filteredRows];
    sorted.sort((a, b) => {
      const { key, direction } = sortConfig;
      const multiplier = direction === "asc" ? 1 : -1;
      if (key === "month") return (monthIndex(a.month, months) - monthIndex(b.month, months)) * multiplier;
      const aValue = a[key];
      const bValue = b[key];
      const aNumber = Number(aValue);
      const bNumber = Number(bValue);
      if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) return (aNumber - bNumber) * multiplier;
      return String(aValue || "").localeCompare(String(bValue || "")) * multiplier;
    });
    return sorted;
  }, [filteredRows, months, sortConfig]);

  const filteredSummary = useMemo(() => {
    const totalSeatCapacity = filteredRows.reduce((sum, row) => sum + Number(row.seatCapacity || 0), 0);
    const totalSeatOccupancy = filteredRows.reduce((sum, row) => sum + Number(row.seatOccupancy || 0), 0);
    const centers = new Set(filteredRows.map((row) => row.dmsCode).filter(Boolean)).size;
    return {
      totalRows: filteredRows.length,
      centers,
      totalSeatCapacity,
      totalSeatOccupancy,
      availableSeats: Math.max(totalSeatCapacity - totalSeatOccupancy, 0),
      averageOccupancyPercent: totalSeatCapacity ? Math.round((totalSeatOccupancy / totalSeatCapacity) * 1000) / 10 : 0,
    };
  }, [filteredRows]);

  const bandSummary = useMemo(() => {
    const counts = filteredRows.reduce(
      (acc, row) => {
        const key = bandKey(row.occupancyPercent);
        acc[key] += 1;
        return acc;
      },
      { excellent: 0, healthy: 0, watch: 0, critical: 0 },
    );
    return BAND_CONFIG.map((item) => ({
      ...item,
      count: counts[item.key],
      percent: filteredRows.length ? Math.round((counts[item.key] / filteredRows.length) * 100) : 0,
    }));
  }, [filteredRows]);

  const monthSummary = useMemo(() => {
    const map = new Map();
    filteredRows.forEach((row) => {
      const key = row.month || "Unknown";
      const current = map.get(key) || { month: key, rows: 0, capacity: 0, occupied: 0 };
      current.rows += 1;
      current.capacity += Number(row.seatCapacity || 0);
      current.occupied += Number(row.seatOccupancy || 0);
      map.set(key, current);
    });
    return Array.from(map.values())
      .map((item) => ({
        ...item,
        occupancy: item.capacity ? Math.round((item.occupied / item.capacity) * 1000) / 10 : 0,
      }))
      .sort((a, b) => monthIndex(a.month, months) - monthIndex(b.month, months));
  }, [filteredRows, months]);

  const topCenters = useMemo(() => {
    const usable = filteredRows.filter((row) => Number(row.seatCapacity || 0) > 0);
    const high = [...usable].sort((a, b) => Number(b.occupancyPercent || 0) - Number(a.occupancyPercent || 0)).slice(0, 5);
    const low = [...usable].sort((a, b) => Number(a.occupancyPercent || 0) - Number(b.occupancyPercent || 0)).slice(0, 5);
    return { high, low };
  }, [filteredRows]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedRows.length / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredAndSortedRows.slice(start, start + pageSize);
  }, [filteredAndSortedRows, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [month, pageSize, search]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const handleSort = (key) => {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const kpis = [
    { label: "Records", value: formatNumber(filteredSummary.totalRows), hint: `${formatNumber(summary?.totalRows || 0)} total rows` },
    { label: "Seat Capacity", value: formatNumber(filteredSummary.totalSeatCapacity), hint: `${formatNumber(filteredSummary.centers)} centers` },
    { label: "Seat Occupancy", value: formatNumber(filteredSummary.totalSeatOccupancy), hint: "Seats used" },
    { label: "Available Seats", value: formatNumber(filteredSummary.availableSeats), hint: "Open capacity" },
  ];

  return (
    <div className="occupancy-page">
      <div className="occupancy-hero">
        <div className="occupancy-hero-main">
          <div className="occupancy-eyebrow">DOTC Utilization Intelligence</div>
          <h1 className="occupancy-title">Occupancy Details</h1>
          <p className="occupancy-subtitle">{fileName ? `Source: ${fileName}` : "DOTC occupancy data"}</p>
        </div>
        <button className="mp-back-btn occupancy-back-btn" onClick={() => goTo("dashboard")}>
          Back to Dashboard
        </button>
      </div>

      <div className="occupancy-filter-card">
        <div className="occupancy-filter-grid">
          <div className="mp-field occupancy-search-field">
            <label>Search</label>
            <div className="occupancy-search-box">
              <Search size={18} />
              <input
                placeholder="DMS code, center name, month..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
          <div className="mp-field">
            <label>Month</label>
            <select className="mp-input" value={month} onChange={(event) => setMonth(event.target.value)}>
              <option value="all">All months</option>
              {months.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div className="mp-field">
            <label>Rows</label>
            <select className="mp-input" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="occupancy-state"><div className="loader" /><p>Loading occupancy data...</p></div>
      ) : null}
      {error ? <div className="inline-error occupancy-error">{error}</div> : null}

      {!loading && !error ? (
        <>
          <div className="occupancy-kpi-grid">
            <div className="occupancy-gauge-card">
              <div
                className="occupancy-gauge"
                style={{ "--gauge-value": `${Math.min(Math.max(filteredSummary.averageOccupancyPercent, 0), 100)}%` }}
              >
                <div>
                  <strong>{formatPercent(filteredSummary.averageOccupancyPercent)}</strong>
                  <span>Average</span>
                </div>
              </div>
            </div>
            {kpis.map((item) => (
              <div className="occupancy-kpi" key={item.label}>
                <div className="occupancy-kpi-label">{item.label}</div>
                <div className="occupancy-kpi-value">{item.value}</div>
                <div className="occupancy-kpi-hint">{item.hint}</div>
              </div>
            ))}
          </div>

          <div className="occupancy-insight-grid">
            <div className="occupancy-panel occupancy-band-panel">
              <div className="occupancy-panel-head">
                <h2>Occupancy Health</h2>
                <span>{formatNumber(filteredRows.length)} records</span>
              </div>
              <div className="occupancy-band-list">
                {bandSummary.map((item) => (
                  <div className="occupancy-band-row" key={item.key}>
                    <div className="occupancy-band-label">
                      <span className={`occupancy-band-dot ${item.className}`} />
                      <strong>{item.label}</strong>
                      <em>{item.range}</em>
                    </div>
                    <div className="occupancy-band-track">
                      <span className={item.className} style={{ width: `${item.percent}%` }} />
                    </div>
                    <div className="occupancy-band-value">{formatNumber(item.count)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="occupancy-panel occupancy-month-panel">
              <div className="occupancy-panel-head">
                <h2>Monthly View</h2>
                <span>{month === "all" ? "FY spread" : month}</span>
              </div>
              <div className="occupancy-month-list">
                {monthSummary.map((item) => (
                  <div className="occupancy-month-row" key={item.month}>
                    <span>{item.month}</span>
                    <div className="occupancy-month-track">
                      <span className={occupancyTone(item.occupancy)} style={{ width: pctWidth(item.occupancy) }} />
                    </div>
                    <strong>{formatPercent(item.occupancy)}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="occupancy-leader-grid">
            <CenterList title="Highest Occupancy Centers" rows={topCenters.high} mode="high" />
            <CenterList title="Lowest Occupancy Centers" rows={topCenters.low} mode="low" />
          </div>

          <div className="occupancy-table-card">
            <div className="occupancy-table-head">
              <div>
                <h2>Detailed Records</h2>
                <p>Sortable rows with center, month, capacity, used seats, and open capacity.</p>
              </div>
              <div className="occupancy-count">
                {formatNumber((page - 1) * pageSize + (paginatedRows.length ? 1 : 0))}-
                {formatNumber(Math.min(page * pageSize, filteredAndSortedRows.length))} of {formatNumber(filteredAndSortedRows.length)}
              </div>
            </div>

            <div className="occupancy-table-wrap">
              <table className="occupancy-table">
                <thead>
                  <tr>
                    {TABLE_COLUMNS.map((column) => (
                      <th key={column.key} onClick={() => handleSort(column.key)}>
                        <span>{column.label}</span>
                        <span className="occupancy-sort-mark">
                          {sortConfig.key === column.key ? (sortConfig.direction === "asc" ? "▲" : "▼") : ""}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((row, index) => (
                    <tr key={`${row.month}-${row.dmsCode}-${index}`}>
                      {TABLE_COLUMNS.map((column) => (
                        <td key={column.key} className={column.key === "examCenter" ? "occupancy-center-cell" : ""}>
                          {renderCell(row, column)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!paginatedRows.length ? (
                    <tr>
                      <td colSpan={TABLE_COLUMNS.length} className="occupancy-empty-cell">
                        No occupancy rows match this filter.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="occupancy-pagination">
              <button className="btn-outline" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                Previous
              </button>
              <span>Page {page} of {totalPages}</span>
              <button className="btn-outline" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>
                Next
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
