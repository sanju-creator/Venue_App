"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  LabelList,
  Legend,
} from "recharts";
import { ChevronsRight } from "lucide-react";
import { useApp } from "@/context/AppContext";
import Breadcrumbs from "@/components/Breadcrumbs";
import Sidebar from "@/components/Sidebar";

const EMPLOYEE_TYPES = ["DEXIT", "Outsourced"];
const DELAY_OPTIONS = ["Full Batch Delay", "Partially Batch Delay", "No Delay"];
const ISSUE_OPTIONS = ["FFA = Yes", "Call Logs = Yes"];
const DATE_MODES = {
  all: "all",
  custom: "custom",
};
const MATRIX_SERIES_COLORS = [
  "#7AA6D8",
  "#94C3A2",
  "#E7C57B",
  "#AFA7E8",
  "#E49AA9",
  "#84D1CF",
  "#B8C2D0",
];
const CATEGORY_COLUMNS = [
  { code: "A", key: "categoryAUniqueManpower", label: "A" },
  { code: "B", key: "categoryBUniqueManpower", label: "B" },
  { code: "C", key: "categoryCUniqueManpower", label: "C" },
  { code: "BL-C", key: "categoryBlcUniqueManpower", label: "BL-C (Blacklisted)" },
  { code: "BL", key: "categoryBlUniqueManpower", label: "BL" },
];
const TENURE_COLUMNS = [
  { code: "<1 yr", key: "tenureLt1Count", label: "<1 yr" },
  { code: "1 to 2 yrs", key: "tenure1to2Count", label: "1 to 2 yrs" },
  { code: "2 to 5 yrs", key: "tenure2to5Count", label: "2 to 5 yrs" },
  { code: ">5 yrs", key: "tenureGt5Count", label: ">5 yrs" },
  { code: "Unknown", key: "tenureUnknownCount", label: "Unknown" },
];
const CATEGORY_CODES = CATEGORY_COLUMNS.map((column) => column.code);
const PERFORMANCE_RANKING_ALLOWED_USERS = ["Admin", "Prafull"];
const DEFAULT_FILTERS = {
  project: "",
  employee: "",
  tenure: "",
  role: "",
  region: "",
  state: "",
  examCityCentre: "",
};
const TENURE_ORDER_LOOKUP = new Map(
  TENURE_COLUMNS.map((column, index) => [String(column.code || "").toLowerCase(), index]),
);

const numberFormat = new Intl.NumberFormat("en-IN");
const compactNumberFormat = new Intl.NumberFormat("en-IN", {
  notation: "compact",
  maximumFractionDigits: 1,
});
function getRankingLimit(scope) {
  if (scope === "top25") return 25;
  if (scope === "full") return Number.POSITIVE_INFINITY;
  return 10;
}

function toRankNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function calcPerformanceScore({ totalBatches = 0, noDelay = 0, callLogs = 0, coverage = 0 }) {
  const quality = noDelay * 2.2;
  const productivity = totalBatches * 1.15;
  const coverageBoost = coverage * 3.8;
  const issuePenalty = callLogs * 2.1;
  const raw = quality + productivity + coverageBoost - issuePenalty;
  return Number(Math.max(0, raw).toFixed(2));
}

function buildLocalPerformanceRankings(queryResult, scope = "top10") {
  const limit = getRankingLimit(scope);

  const manpowerSourceRows = Array.isArray(queryResult?.manpowerWiseEmployeeRotationDrilldown)
    ? queryResult.manpowerWiseEmployeeRotationDrilldown
    : [];
  const venueSourceRows = Array.isArray(queryResult?.manpowerWiseVenueDrilldown)
    ? queryResult.manpowerWiseVenueDrilldown
    : [];
  const projectSourceRows = Array.isArray(queryResult?.projectSummary)
    ? queryResult.projectSummary
    : [];

  const manpowerMap = new Map();
  manpowerSourceRows.forEach((row) => {
    const personName = String(row?.personName || "").trim();
    const empId = String(row?.empId || "").trim();
    const key = `${empId || "NA"}||${personName || "Unknown"}`;
    if (!manpowerMap.has(key)) {
      manpowerMap.set(key, {
        personName: personName || "Unknown",
        empId: empId || "-",
        venueSet: new Set(),
        totalBatches: 0,
        noDelay: 0,
        callLogs: 0,
      });
    }
    const entry = manpowerMap.get(key);
    if (row?.dmsCode) entry.venueSet.add(String(row.dmsCode).trim());
    entry.totalBatches += toRankNumber(row?.totalBatches);
    entry.noDelay += toRankNumber(row?.noDelay);
    entry.callLogs += toRankNumber(row?.callLogs);
  });

  const manpower = Array.from(manpowerMap.values())
    .map((entry) => {
      const venueCoverage = entry.venueSet.size;
      return {
        personName: entry.personName,
        empId: entry.empId,
        venueCoverage,
        totalBatches: entry.totalBatches,
        noDelay: entry.noDelay,
        callLogs: entry.callLogs,
        score: calcPerformanceScore({
          totalBatches: entry.totalBatches,
          noDelay: entry.noDelay,
          callLogs: entry.callLogs,
          coverage: venueCoverage,
        }),
      };
    })
    .sort((a, b) => (b.score - a.score) || (b.totalBatches - a.totalBatches) || a.personName.localeCompare(b.personName, "en", { sensitivity: "base" }));

  const venues = venueSourceRows
    .map((row) => {
      const uniqueManpower = toRankNumber(row?.uniqueManpower);
      const noBatchDelay = toRankNumber(row?.noDelay);
      const callLogs = toRankNumber(row?.callLogs);
      const totalBatches = toRankNumber(row?.totalBatches);
      return {
        venueName: String(row?.venueName || "").trim() || "-",
        dmsCode: String(row?.dmsCode || "").trim() || "-",
        uniqueManpower,
        noBatchDelay,
        callLogs,
        score: calcPerformanceScore({
          totalBatches,
          noDelay: noBatchDelay,
          callLogs,
          coverage: uniqueManpower,
        }),
      };
    })
    .sort((a, b) => (b.score - a.score) || (b.uniqueManpower - a.uniqueManpower) || a.venueName.localeCompare(b.venueName, "en", { sensitivity: "base" }));

  const projects = projectSourceRows
    .map((row) => {
      const driveCount = toRankNumber(row?.driveCount);
      const uniqueManpower = toRankNumber(row?.uniqueManpower);
      const noBatchDelay = toRankNumber(row?.noBatchDelay);
      const callLogs = toRankNumber(row?.callLogs);
      return {
        projectName: String(row?.projectName || "").trim() || "-",
        driveCount,
        uniqueManpower,
        noBatchDelay,
        callLogs,
        score: calcPerformanceScore({
          totalBatches: driveCount,
          noDelay: noBatchDelay,
          callLogs,
          coverage: uniqueManpower,
        }),
      };
    })
    .sort((a, b) => (b.score - a.score) || (b.driveCount - a.driveCount) || a.projectName.localeCompare(b.projectName, "en", { sensitivity: "base" }));

  return {
    success: true,
    scope,
    source: "local-fallback",
    totals: {
      manpower: manpower.length,
      venues: venues.length,
      projects: projects.length,
    },
    manpower: manpower.slice(0, limit),
    venues: venues.slice(0, limit),
    projects: projects.slice(0, limit),
  };
}

function RegionCategoryTable({ rows, onCellClick }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Region</th>
            {CATEGORY_COLUMNS.map((column) => (
              <th key={column.code}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={row.region}>
                <td>{row.region}</td>
                {CATEGORY_COLUMNS.map((column) => {
                  const value = Number(row[column.key] || 0);
                  return (
                    <td key={`${row.region}-${column.code}`}>
                      {renderClickable(value, () => onCellClick(row.region, column.code))}
                    </td>
                  );
                })}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6}>No data found for selected filters.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ManpowerWiseTable({ rows, onCellClick }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Region</th>
            <th>Owned</th>
            <th>Outsource</th>
            {TENURE_COLUMNS.map((column) => (
              <th key={column.code}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={row.region}>
                <td>{row.region}</td>
                <td>{renderClickable(row.ownedUniqueManpower, () => onCellClick(row.region, "Owned"))}</td>
                <td>{renderClickable(row.outsourcedUniqueManpower, () => onCellClick(row.region, "Outsource"))}</td>
                {TENURE_COLUMNS.map((column) => (
                  <td key={`${row.region}-manpower-${column.code}`}>
                    {renderClickable(row[column.key], () => onCellClick(row.region, column.code))}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={8}>No data found for selected filters.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function RegionMatrixTable({ rows, buckets, emptyMessage = "No data found for selected filters." }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Region</th>
            {buckets.map((bucket) => (
              <th key={`bucket-head-${bucket.key}`}>{bucket.label}</th>
            ))}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={`matrix-row-${row.region}`}>
                <td>{row.region}</td>
                {buckets.map((bucket) => (
                  <td key={`matrix-cell-${row.region}-${bucket.key}`}>{formatCount(row[bucket.key] || 0)}</td>
                ))}
                <td>{formatCount(row.total || 0)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={buckets.length + 2}>{emptyMessage}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function RegionMatrixSection({ title, rows, buckets }) {
  const tableColRef = useRef(null);
  const [chartBoxHeight, setChartBoxHeight] = useState(350);

  useLayoutEffect(() => {
    const tableEl = tableColRef.current;
    if (!tableEl) return undefined;

    const syncHeight = () => {
      const measured = tableEl.getBoundingClientRect().height || 0;
      if (measured > 0) {
        setChartBoxHeight((prev) => {
          const next = Math.max(320, Math.round(measured));
          return prev === next ? prev : next;
        });
      }
    };

    syncHeight();

    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => syncHeight());
    observer.observe(tableEl);
    return () => observer.disconnect();
  }, [rows, buckets]);

  const chartInnerHeight = Math.max(250, chartBoxHeight - 32);

  return (
    <>
      <h3 className="section-title">{title}</h3>
      <div className="flex-table-row">
        <div className="half-col">
          <div className="chart-container" style={{ height: `${chartBoxHeight}px`, minHeight: `${chartBoxHeight}px`, width: "100%", background: "#fff", border: "1px solid #dde6ef", borderRadius: "12px", padding: "16px" }}>
            {rows.length && buckets.length ? (
              <ResponsiveContainer width="100%" height={chartInnerHeight}>
                <BarChart
                  data={rows}
                  barSize={22}
                  barCategoryGap="22%"
                  maxBarSize={34}
                  margin={{ top: 26, right: 12, left: 4, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="region" tick={{ fill: "#64748b", fontSize: 13, fontWeight: 500 }} axisLine={false} tickLine={false} tickMargin={12} />
                  <YAxis
                    tickFormatter={formatAxisTickCount}
                    width={58}
                    tick={{ fill: "#64748b", fontSize: 13, fontWeight: 500 }}
                    axisLine={false}
                    tickLine={false}
                    tickMargin={12}
                  />
                  <RechartsTooltip
                    cursor={{ fill: "rgba(241, 245, 249, 0.5)" }}
                    contentStyle={{
                      backgroundColor: "#ffffff",
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)",
                      padding: "12px",
                    }}
                    itemStyle={{ fontSize: "13px", fontWeight: 500, padding: "2px 0" }}
                    labelStyle={{ fontSize: "13px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}
                    formatter={(value) => formatCount(value)}
                  />
                  <Legend verticalAlign="top" iconType="circle" wrapperStyle={{ paddingBottom: "20px", fontWeight: 500, fontSize: "13px", color: "#64748b" }} />
                  {buckets.map((bucket, index) => (
                    <Bar
                      key={`matrix-bar-${bucket.key}`}
                      activeBar={false}
                      dataKey={bucket.key}
                      name={bucket.label}
                      stackId="a"
                      fill={MATRIX_SERIES_COLORS[index % MATRIX_SERIES_COLORS.length]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="mp-drilldown-end-msg">No chart data available for current filters.</div>
            )}
          </div>
        </div>
        <div className="half-col" ref={tableColRef}>
          <RegionMatrixTable rows={rows} buckets={buckets} />
        </div>
      </div>
    </>
  );
}

function ManpowerSpreadTable({ rows, onStateClick }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Region</th>
            <th>Type</th>
            <th>Spread (State)</th>
            <th>Unique Manpower</th>
            <th>Unique Venues</th>
            <th>Total Batches</th>
            <th>FFA</th>
            <th>Call Logs</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, idx) => (
              <tr key={`${row.region}-${row.workforceType}-${row.state}-${idx}`}>
                <td>{row.region}</td>
                <td>{row.workforceType}</td>
                <td>{renderClickable(row.state, () => onStateClick(row.state), true)}</td>
                <td>{renderClickable(row.uniqueManpower)}</td>
                <td>{renderClickable(row.uniqueVenues)}</td>
                <td>{renderClickable(row.totalBatches)}</td>
                <td className={row.ffa > 0 ? "cell-warning" : "cell-zero"}>{renderClickable(row.ffa)}</td>
                <td className={row.callLogs > 0 ? "cell-critical" : "cell-zero"}>{renderClickable(row.callLogs)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={8}>No spread data found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ManpowerTenureRoleTable({ rows, onTenureRoleClick }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Region</th>
            <th>Type</th>
            <th>State</th>
            <th>Tenure</th>
            <th>Role</th>
            <th>Unique Manpower</th>
            <th>Unique Venues</th>
            <th>Total Batches</th>
            <th>FFA</th>
            <th>Call Logs</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, idx) => (
              <tr key={`${row.region}-${row.workforceType}-${row.state}-${row.tenure}-${row.role}-${idx}`}>
                <td>{row.region}</td>
                <td>{row.workforceType}</td>
                <td>{row.state}</td>
                <td>{row.tenure}</td>
                <td>{row.role}</td>
                <td>{renderClickable(row.uniqueManpower, () => onTenureRoleClick(row.tenure, row.role))}</td>
                <td>{formatCount(row.uniqueVenues)}</td>
                <td>{formatCount(row.totalBatches)}</td>
                <td className={row.ffa > 0 ? "cell-warning" : "cell-zero"}>{formatCount(row.ffa)}</td>
                <td className={row.callLogs > 0 ? "cell-critical" : "cell-zero"}>{formatCount(row.callLogs)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={10}>No tenure and role data found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ManpowerVenueTable({ rows, onVenueClick }) {
  const { openVenueDetail } = useApp();
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Region</th>
            <th>Type</th>
            <th>State</th>
            <th>Tenure</th>
            <th>Role</th>
            <th>Venue Name</th>
            <th>DMS Code</th>
            <th>District / City</th>
            <th>Category</th>
            <th>Unique Manpower</th>
            <th>Total Batches</th>
            <th>FFA</th>
            <th>Call Logs</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, idx) => (
              <tr key={`${row.region}-${row.workforceType}-${row.state}-${row.tenure}-${row.role}-${row.dmsCode}-${idx}`}>
                <td>{row.region}</td>
                <td>{row.workforceType}</td>
                <td>{row.state}</td>
                <td>{row.tenure}</td>
                <td>{row.role}</td>
                <td>
                  <div className="flex-cell-actions">
                    {renderClickable(row.venueName, () => openVenueDetail(row.dmsCode), true)}
                    <button className="mp-cell-mini-btn" onClick={() => openVenueDetail(row.dmsCode)} title="View Venue Analytics">Analytics ↗</button>
                  </div>
                </td>
                <td>{row.dmsCode}</td>
                <td>{`${row.district} / ${row.city}`}</td>
                <td>{row.category}</td>
                <td>{renderClickable(row.uniqueManpower, () => onVenueClick(row))}</td>
                <td>{formatCount(row.totalBatches)}</td>
                <td className={row.ffa > 0 ? "cell-warning" : "cell-zero"}>{formatCount(row.ffa)}</td>
                <td className={row.callLogs > 0 ? "cell-critical" : "cell-zero"}>{formatCount(row.callLogs)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={13}>No venue data found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ManpowerEmployeeRotationTable({ rows }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Emp ID</th>
            <th>Name</th>
            <th>Role</th>
            <th>Tenure</th>
            <th>Phone Status</th>
            <th>Email Status</th>
            <th>Govt ID Status</th>
            <th>Declaration Status</th>
            <th>Phone</th>
            <th>Email</th>
            <th>Venue Rotation</th>
            <th>Drive Rotation</th>
            <th>Project Rotation</th>
            <th>Total Batches</th>
            <th>Full Delay</th>
            <th>Partial Delay</th>
            <th>No Delay</th>
            <th>FFA</th>
            <th>Call Logs</th>
            <th>Issue Categories</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, idx) => (
              <tr key={`${row.empId}-${row.dmsCode}-${idx}`}>
                <td>{row.empId}</td>
                <td>{row.personName}</td>
                <td>{row.role}</td>
                <td>{row.tenure}</td>
                <td><StatusCheck checked={Boolean(row.hasPhone)} /></td>
                <td><StatusCheck checked={Boolean(row.hasEmail)} /></td>
                <td><StatusCheck checked={Boolean(row.hasGovtId)} /></td>
                <td><StatusCheck checked={Boolean(row.hasDeclaration)} /></td>
                <td>{row.phone || "-"}</td>
                <td>{row.email || "-"}</td>
                <td>{formatCount(row.uniqueVenuesInScope)}</td>
                <td>{formatCount(row.uniqueDrivesInScope)}</td>
                <td>{formatCount(row.uniqueProjectsInScope)}</td>
                <td>{formatCount(row.totalBatches)}</td>
                <td className={row.fullBatchDelay > 0 ? "cell-critical" : "cell-zero"}>{formatCount(row.fullBatchDelay)}</td>
                <td className={row.partialBatchDelay > 0 ? "cell-warning" : "cell-zero"}>{formatCount(row.partialBatchDelay)}</td>
                <td className={row.noDelay > 0 ? "cell-healthy" : "cell-zero"}>{formatCount(row.noDelay)}</td>
                <td className={row.ffa > 0 ? "cell-warning" : "cell-zero"}>{formatCount(row.ffa)}</td>
                <td className={row.callLogs > 0 ? "cell-critical" : "cell-zero"}>{formatCount(row.callLogs)}</td>
                <td>{row.scopeIssueCategorySummary || row.issueCategorySummary || "-"}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={20}>No employee rotation data found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function VenueIntelligencePanel({ rows }) {
  const first = rows[0] || {};
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Venue</th>
            <th>DMS</th>
            <th>Google / News</th>
            <th>Day-End</th>
            <th>Call Logs</th>
            <th>Feedback</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            <tr>
              <td>{first.venueName || "-"}</td>
              <td>{first.dmsCode || "-"}</td>
              <td>{first.marketRemark || "-"}</td>
              <td>{first.dayEndSummary || "-"}</td>
              <td>{first.callLogSummary || "-"}</td>
              <td>{first.venueFeedbackSummary || "-"}</td>
            </tr>
          ) : (
            <tr>
              <td colSpan={6}>No venue intelligence data found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function EmployeeDirectoryTable({ rows }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Photo</th>
            <th>Involvement</th>
            <th>Tenure</th>
            <th>Issues Reported</th>
            <th>Feedback</th>
            <th>Documents</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, idx) => (
              <tr key={`${row.empId}-directory-${idx}`}>
                <td>{`${row.personName} (${row.empId})`}</td>
                <td>
                  <StatusCheck
                    checked={Boolean(row.hasPhoto)}
                    presentLabel={`Yes (${formatCount(row.photoCount)})`}
                    missingLabel="No"
                  />
                </td>
                <td>{`${formatCount(row.uniqueProjectsInScope)} Proj | ${formatCount(row.uniqueDrivesInScope)} Drives | ${formatCount(row.uniqueVenuesInScope)} Venues`}</td>
                <td>{row.tenure || "-"}</td>
                <td>{row.scopeIssueCategorySummary || "-"}</td>
                <td>{row.venueFeedbackSummary || "-"}</td>
                <td>
                  <StatusCheck
                    checked={Boolean(row.documentsAvailable)}
                    presentLabel="Available"
                    missingLabel="Missing"
                  />
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={7}>No directory data found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ManpowerRotationTrendTable({ rows, onVenueClick }) {
  const { openVenueDetail } = useApp();
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Rotation</th>
            <th>Trend By Issue</th>
            <th>Category</th>
            <th>Recommendation</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, idx) => (
              <tr key={`${row.empId}-${row.venueName || "summary"}-${idx}`}>
                <td>{row.employeeLabel}</td>
                <td>
                  {row.isSummary ? (
                    row.venueName || "-"
                  ) : (
                    <div className="flex-cell-actions">
                      <span className="venue-name-link" onClick={() => openVenueDetail(row.dmsCode)}>{row.venueName}</span>
                      <button className="mp-cell-mini-btn" onClick={() => onVenueClick(row)}>Select</button>
                    </div>
                  )}
                </td>
                <td>{row.issueTrend}</td>
                <td>{row.category || "-"}</td>
                <td>{row.recommendation || "-"}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5}>No rotation trend data found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function VenueWiseManpowerListTable({ venueName, dmsCode, rows }) {
  const { openVenueDetail } = useApp();
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Venue</th>
            <th>Person Details</th>
            <th>Tenure / Roles</th>
            <th>Project Scope</th>
            <th>Stats & Call Logs</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, idx) => (
              <tr key={`${row.empId || row.personName}-${idx}`}>
                <td>
                  <div className="flex-cell-actions">
                    <span className="venue-name-link" onClick={() => openVenueDetail(dmsCode || row.dmsCode)}>
                      {venueName}
                    </span>
                    <button
                      className="mp-cell-mini-btn"
                      onClick={() => openVenueDetail(dmsCode || row.dmsCode)}
                      title="View Venue Analytics"
                    >
                      Analytics ↗
                    </button>
                  </div>
                </td>
                <td style={{ verticalAlign: "top" }}>
                  <div style={{ fontWeight: 700, color: "#1e293b" }}>{row.personName || "-"}</div>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>ID: {row.empId || "-"}</div>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>Phone: {row.phone || "N/A"}</div>
                  <div style={{ fontSize: "12px", color: "#64748b" }}>Email: {row.email || "N/A"}</div>
                </td>
                <td style={{ verticalAlign: "top" }}>
                  <div style={{ fontSize: "12px", color: "#475569", marginBottom: "4px" }}>Tenure: {row.tenure || "-"}</div>
                  <div style={{ fontSize: "12px", color: "#475569" }}>Role: {row.role || "-"}</div>
                </td>
                <td style={{ verticalAlign: "top" }}>
                  <div style={{ fontSize: "12px", color: "#334155" }}>Projects: {formatCount(row.uniqueProjectsInScope || 0)}</div>
                  <div style={{ fontSize: "12px", color: "#334155" }}>Drives: {formatCount(row.uniqueDrivesInScope || 0)}</div>
                  <div style={{ fontSize: "12px", color: "#334155" }}>Venue Rotations: {formatCount(row.uniqueVenuesInScope || 0)}</div>
                </td>
                <td style={{ verticalAlign: "top" }}>
                  <div style={{ fontSize: "12px", color: "#334155" }}>Batches: {formatCount(row.totalBatches || 0)}</div>
                  <div style={{ fontSize: "12px", color: "#334155" }}>FFA: {formatCount(row.ffa || 0)}</div>
                  <div style={{ fontSize: "12px", color: "#dc2626", fontWeight: 600 }}>
                    Call Logs: {formatCount(row.callLogs || 0)}
                  </div>
                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: "4px", lineHeight: "1.35" }}>
                    {row.scopeIssueCategorySummary || row.issueCategorySummary || "-"}
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5}>No manpower found for selected venue.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ManpowerCategoryVenueTable({ rows }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Categories</th>
            <th>Number of Venues</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, idx) => (
              <tr key={`${row.empId}-${row.category}-${idx}`}>
                <td>{row.employeeLabel}</td>
                <td>{row.category}</td>
                <td>{formatCount(row.venueCount)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={3}>No Category-Wise venue trend data found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CategoryWiseCallLogTable({ rows, totalCallLogs, onCategoryClick }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Category</th>
            <th>No of Employee</th>
            <th>{`Call Log No. (Total: ${formatCount(totalCallLogs)})`}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={`category-wise-${row.category}`}>
                <td>{renderClickable(row.category, () => onCategoryClick(row.category), true)}</td>
                <td>{formatCount(row.employeeCount)}</td>
                <td>{formatCount(row.callLogCount)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={3}>No Category-Wise data found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CategoryCallLogTrendTable({ category, employeeCount, totalCallLogs, rows, onBack }) {
  return (
    <>
      <div className="mp-table-head-row">
        <h3 className="section-title">{category} Category Call Log Drilldown</h3>
        <div className="mp-table-actions">
          <button className="mp-back-small-btn" onClick={onBack}>
            Back to Category Summary
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>No of Employee</th>
              <th>Call Log No.</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{category}</td>
              <td>{formatCount(employeeCount)}</td>
              <td>Total Call Logs</td>
              <td>{formatCount(totalCallLogs)}</td>
            </tr>
            {rows.length ? (
              rows.map((row) => (
                <tr key={`${category}-${row.reason}`}>
                  <td>{category}</td>
                  <td>{formatCount(employeeCount)}</td>
                  <td>{row.reason}</td>
                  <td>{formatCount(row.count)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td>{category}</td>
                <td>{formatCount(employeeCount)}</td>
                <td>No call log trend found</td>
                <td>0</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function StateComparisonTable({
  leftState,
  rightState,
  leftLabel,
  rightLabel,
  rows,
  emptyMessage = "Select two different options to compare.",
}) {
  const firstLabel = leftLabel || leftState || "Option 1";
  const secondLabel = rightLabel || rightState || "Option 2";
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>{firstLabel}</th>
            <th>{secondLabel}</th>
            <th>Difference</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={row.key}>
                <td>{row.label}</td>
                <td>{formatCount(row.leftValue)}</td>
                <td>{formatCount(row.rightValue)}</td>
                <td>{row.diff > 0 ? `+${formatCount(row.diff)}` : formatCount(row.diff)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={4}>{emptyMessage}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function RegionCategoryDrilldownTable({ rows, selectedState, selectedCity, onStateClick, onCityClick }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Region</th>
            <th>Category</th>
            <th>State</th>
            <th>Centre City (District / City)</th>
            <th>Unique Manpower Count</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, idx) => (
              <tr key={`${row.region}-${row.category}-${row.state}-${row.district}-${row.city}-${idx}`}>
                <td>{row.region}</td>
                <td>{row.category}</td>
                <td>{renderClickable(row.state, selectedState ? null : () => onStateClick(row.state), true)}</td>
                <td>
                  {selectedState && !selectedCity 
                    ? renderClickable(`${row.district} / ${row.city}`, () => onCityClick(row.district, row.city), true)
                    : `${row.district} / ${row.city}`
                  }
                </td>
                <td>{formatCount(row.uniqueManpowerCount)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5}>No drilldown data found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function RegionCategoryVenueDrilldownTable({ rows, onManpowerClick }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Region</th>
            <th>Category</th>
            <th>State</th>
            <th>Centre City (District / City)</th>
            <th>Venue Name</th>
            <th>Unique Manpower Count</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, idx) => (
              <tr key={`${row.region}-${row.category}-${row.state}-${row.district}-${row.city}-${row.venueName}-${idx}`}>
                <td>{row.region}</td>
                <td>{row.category}</td>
                <td>{row.state}</td>
                <td>{`${row.district} / ${row.city}`}</td>
                <td>{row.venueName}</td>
                <td>
                  {row.uniqueManpowerCount > 0 ? (
                    <button className="mp-cell-btn" onClick={() => onManpowerClick(row)}>
                      {formatCount(row.uniqueManpowerCount)}
                    </button>
                  ) : (
                    formatCount(row.uniqueManpowerCount)
                  )}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6}>No venue-level data found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function RegionCategoryVenuePersonTable({ rows, selectedPersonKey, onPersonClick }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Region</th>
            <th>Category</th>
            <th>State</th>
            <th>Centre City (District / City)</th>
            <th>Venue Name</th>
            <th>Manpower</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, idx) => (
              <tr key={`${row.region}-${row.category}-${row.state}-${row.district}-${row.city}-${row.venueName}-${row.personName}-${idx}`}>
                <td>{row.region}</td>
                <td>{row.category}</td>
                <td>{row.state}</td>
                <td>{`${row.district} / ${row.city}`}</td>
                <td>{row.venueName}</td>
                <td>
                  {(() => {
                    const parsed = parsePersonDetailStats(row.personDetails);
                    const personKey = `${parsed.id || ""}||${row.personName}`;
                    const isSelected = selectedPersonKey === personKey;
                    return (
                      <button
                        className="mp-cell-btn"
                        style={isSelected ? { borderColor: "#3f7fdd", background: "#eff6ff", color: "#1d4ed8" } : undefined}
                        onClick={() => onPersonClick(row, personKey)}
                      >
                        {row.personName}
                      </button>
                    );
                  })()}
                </td>
                <td>{row.personDetails}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={7}>No manpower person-level data found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function VenuePersonDrilldownPanel({ selectedPerson, rows }) {
  if (!selectedPerson) return null;
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Person</th>
            <th>ID</th>
            <th>Role</th>
            <th>Tenure</th>
            <th>Mobile</th>
            <th>Email</th>
            <th>Dates</th>
            <th>Entries</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, idx) => {
              const details = String(row.personDetails || "");
              const parsed = parsePersonDetailStats(details);
              const role = getDetailBlock(details, "Role") || "-";
              const tenure = getDetailBlock(details, "Tenure") || "-";
              const mobile = getDetailBlock(details, "Mobile") || "-";
              const email = getDetailBlock(details, "Email") || "-";
              const dates = getDetailBlock(details, "Dates") || "-";
              return (
                <tr key={`${selectedPerson.personKey}-${idx}`}>
                  <td>{row.personName || "-"}</td>
                  <td>{parsed.id || "-"}</td>
                  <td>{role}</td>
                  <td>{tenure}</td>
                  <td>{mobile}</td>
                  <td>{email}</td>
                  <td>{dates}</td>
                  <td>{formatCount(parsed.entries || 0)}</td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={8}>No person-level details found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SelectField({ label, value, onChange, options, placeholder }) {
  return (
    <div className="mp-select-wrap">
      <label>{label}</label>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

function formatCount(value) {
  return numberFormat.format(Number(value) || 0);
}

function formatCompactCount(value) {
  return compactNumberFormat.format(Number(value) || 0);
}

function formatAxisTickCount(value) {
  const numericValue = Number(value) || 0;
  return numericValue >= 1000 ? formatCompactCount(numericValue) : formatCount(numericValue);
}

function renderClickable(value, onClick, isText = false) {
  const displayValue = isText ? value : formatCount(value);
  if (!onClick || (!isText && value <= 0)) return <span>{displayValue}</span>;
  return (
    <span className="clickable-cell" onClick={onClick}>
      {displayValue}
    </span>
  );
}

function normalizeWorkforceType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized.includes("out")) return "outsource";
  if (normalized.includes("own")) return "owned";
  return normalized;
}

function normalizeBucketLabel(value) {
  const text = String(value || "").trim();
  return text || "Unknown";
}

function toBucketKey(label) {
  return `bucket_${String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "unknown"}`;
}

function getTenureSortIndex(label) {
  const key = String(label || "").trim().toLowerCase();
  if (TENURE_ORDER_LOOKUP.has(key)) return TENURE_ORDER_LOOKUP.get(key);
  return Number.POSITIVE_INFINITY;
}

function buildRegionMatrixSummary(sourceRows, { bucketField, workforceType = null, maxBuckets = 7 }) {
  const matrix = new Map();
  const bucketTotals = new Map();

  sourceRows.forEach((row) => {
    if (workforceType && normalizeWorkforceType(row.workforceType) !== workforceType) return;

    const region = normalizeBucketLabel(row.region);
    const bucketLabel = normalizeBucketLabel(row[bucketField]);
    const value = Number(row.uniqueManpowerCount ?? row.uniqueManpower ?? 0);
    if (!Number.isFinite(value) || value <= 0) return;

    if (!matrix.has(region)) matrix.set(region, new Map());
    const regionMap = matrix.get(region);
    regionMap.set(bucketLabel, (regionMap.get(bucketLabel) || 0) + value);
    bucketTotals.set(bucketLabel, (bucketTotals.get(bucketLabel) || 0) + value);
  });

  const sortedBuckets = Array.from(bucketTotals.entries())
    .sort((a, b) => {
      if (bucketField === "tenure") {
        const idxA = getTenureSortIndex(a[0]);
        const idxB = getTenureSortIndex(b[0]);
        if (idxA !== idxB) return idxA - idxB;
      }
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0], "en", { sensitivity: "base" });
    });

  const headCount = Math.max(1, maxBuckets - 1);
  const topBuckets = sortedBuckets.slice(0, headCount);
  const otherBuckets = sortedBuckets.slice(headCount);
  const hasOthers = otherBuckets.length > 0;

  const buckets = [
    ...topBuckets.map(([label]) => ({ label, key: toBucketKey(label) })),
    ...(hasOthers ? [{ label: "Others", key: "bucket_others" }] : []),
  ];

  const bucketKeyMap = new Map(topBuckets.map(([label]) => [label, toBucketKey(label)]));

  const rows = Array.from(matrix.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "en", { sensitivity: "base" }))
    .map(([region, regionMap]) => {
      const row = { region, total: 0 };
      buckets.forEach((bucket) => {
        row[bucket.key] = 0;
      });
      regionMap.forEach((value, label) => {
        const key = bucketKeyMap.get(label);
        if (key) row[key] += value;
        else if (hasOthers) row.bucket_others += value;
      });
      row.total = Object.entries(row)
        .filter(([key]) => key.startsWith("bucket_"))
        .reduce((sum, [, value]) => sum + Number(value || 0), 0);
      return row;
    });

  return { rows, buckets };
}

function StatusCheck({ checked, presentLabel = "Available", missingLabel = "Missing" }) {
  return (
    <span className={`mp-status-check ${checked ? "is-yes" : "is-no"}`}>
      <span className="mp-status-check-box" />
      <span>{checked ? presentLabel : missingLabel}</span>
    </span>
  );
}

function getIssueTrendLabel(row) {
  const issueSummary = String(row?.issueCategorySummary || "").toLowerCase();
  const callLogSummary = String(row?.callLogSummary || "").toLowerCase();
  const dayEndSummary = String(row?.dayEndSummary || "").toLowerCase();
  const combined = `${issueSummary} ${callLogSummary} ${dayEndSummary}`;

  if (/(invigilator|observer).*(not reported|absent|missing)|not reported.*(invigilator|observer)/.test(combined)) {
    return "invigilator not reported";
  }
  if (/pc related|pc |pcchange|pc change|system change|system replacement|terminal change/.test(combined)) {
    return "pc change";
  }
  if (combined.includes("security")) return "security";
  if (combined.includes("electricity") || combined.includes("power") || combined.includes("ups")) return "electricity issue";
  if (combined.includes("cleanliness") || combined.includes("clean")) return "cleanliness issue";
  if (combined.includes("material")) return "material issue";
  if ((row?.callLogs || 0) > 0 || issueSummary.trim() !== "-" || dayEndSummary.trim() !== "-") return "process issue";
  return "no issue";
}

function shouldCountForRotation(issueTrend) {
  const blocked = new Set(["no issue", "electricity issue", "cleanliness issue", "material issue"]);
  return !blocked.has(issueTrend);
}

function getDetailBlock(details, label) {
  const pattern = new RegExp(`${label}:\\s*([^|]+)`, "i");
  const matched = String(details || "").match(pattern);
  return matched ? matched[1].trim() : "";
}

function parseListCount(details, label) {
  const block = getDetailBlock(details, label);
  if (!block || block === "-") return 0;
  return block
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean).length;
}

function parseNumericDetail(details, label) {
  const matched = String(details || "").match(new RegExp(`${label}:\\s*(\\d+)`, "i"));
  return matched ? Number(matched[1]) : 0;
}

function parsePersonDetailStats(personDetails) {
  const details = String(personDetails || "");
  const id = getDetailBlock(details, "ID");
  const entries = parseNumericDetail(details, "Entries");
  const rolesCount = parseListCount(details, "Role");
  const tenuresCount = parseListCount(details, "Tenure");
  const dateCount = parseListCount(details, "Dates");
  const hasPhone = Boolean(getDetailBlock(details, "Mobile"));
  const hasEmail = Boolean(getDetailBlock(details, "Email"));
  const contactCompleteness = (hasPhone ? 1 : 0) + (hasEmail ? 1 : 0);
  const score = (entries * 5) + (rolesCount * 2) + tenuresCount + contactCompleteness;
  return {
    id,
    entries,
    rolesCount,
    tenuresCount,
    dateCount,
    hasPhone,
    hasEmail,
    contactCompleteness,
    score,
  };
}

function getProfileInitials(name) {
  const tokens = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) return "MP";
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return `${tokens[0][0]}${tokens[1][0]}`.toUpperCase();
}

function ManpowerProfileCard({ row, sourceRows = [], onClose }) {
  const initials = getProfileInitials(row?.personName);
  const empId = String(row?.empId || "").trim();
  const normalizedName = String(row?.personName || "").trim().toLowerCase();
  const matchedRows = (sourceRows || []).filter((entry) => {
    const entryEmpId = String(entry?.empId || "").trim();
    const entryName = String(entry?.personName || "").trim().toLowerCase();
    if (empId && entryEmpId) return empId === entryEmpId;
    return normalizedName && entryName === normalizedName;
  });

  const phones = new Set();
  const emails = new Set();
  const roles = new Set();
  const tenures = new Set();
  const projectNames = new Set();
  const venueNames = new Set();
  let declarationAvailable = false;
  let govtIdAvailable = false;
  let trainingCompleted = false;
  let totalDetailEntries = 0;

  matchedRows.forEach((entry) => {
    const details = String(entry?.personDetails || "");
    const phoneValue = getDetailBlock(details, "Mobile");
    const emailValue = getDetailBlock(details, "Email");
    const roleValue = getDetailBlock(details, "Role");
    const tenureValue = getDetailBlock(details, "Tenure");
    const declarationValue = getDetailBlock(details, "Declaration");
    const govtIdValue = getDetailBlock(details, "Govt ID") || getDetailBlock(details, "Government ID");
    const trainingValue = getDetailBlock(details, "PAT Training") || getDetailBlock(details, "Training");

    if (phoneValue && phoneValue !== "-") phones.add(phoneValue);
    if (emailValue && emailValue !== "-") emails.add(emailValue);
    if (roleValue && roleValue !== "-") roleValue.split(",").map((item) => item.trim()).filter(Boolean).forEach((item) => roles.add(item));
    if (tenureValue && tenureValue !== "-") tenureValue.split(",").map((item) => item.trim()).filter(Boolean).forEach((item) => tenures.add(item));
    if (String(declarationValue || "").match(/yes|available|submitted|done|complete/i)) declarationAvailable = true;
    if (String(govtIdValue || "").match(/yes|available|submitted|done|verified/i)) govtIdAvailable = true;
    if (String(trainingValue || "").match(/yes|available|completed|done|recorded/i)) trainingCompleted = true;
    if (entry?.projectName) projectNames.add(String(entry.projectName));
    if (entry?.venueName) venueNames.add(String(entry.venueName));
    totalDetailEntries += parsePersonDetailStats(details).entries;
  });

  const statusChips = [
    { label: phones.size ? "Phone Available" : "Phone Missing", ok: phones.size > 0 },
    { label: emails.size ? "Email Available" : "Email Missing", ok: emails.size > 0 },
    { label: govtIdAvailable ? "Govt ID Available" : "Govt ID Missing", ok: govtIdAvailable },
    { label: declarationAvailable ? "Declaration Available" : "Declaration Missing", ok: declarationAvailable },
    { label: Number(row?.totalBatches || 0) > 0 ? "Exam Duty Logged" : "Exam Duty Missing", ok: Number(row?.totalBatches || 0) > 0 },
    { label: trainingCompleted || Number(row?.venueCoverage || 0) > 0 ? "PAT Training Recorded" : "PAT Training Missing", ok: trainingCompleted || Number(row?.venueCoverage || 0) > 0 },
  ];

  const summaryRows = [
    { label: "Phone", value: phones.size ? Array.from(phones).join(", ") : "-" },
    { label: "Email", value: emails.size ? Array.from(emails).join(", ") : "-" },
    { label: "Roles", value: roles.size ? Array.from(roles).join(", ") : "-" },
    { label: "Tenure", value: tenures.size ? Array.from(tenures).join(", ") : "-" },
  ];

  const complianceRows = [
    { label: "Exam Participation", value: Number(row?.totalBatches || 0) > 0 ? "Yes" : "No" },
    { label: "Training Completed", value: trainingCompleted || Number(row?.venueCoverage || 0) > 0 ? "Yes" : "No" },
    { label: "Exam Projects", value: formatCount(projectNames.size || 0) },
    { label: "Training Projects", value: formatCount(venueNames.size || row?.venueCoverage || 0) },
  ];

  const rotationCards = [
    { label: "Projects", value: formatCount(projectNames.size || 0) },
    { label: "Drives", value: formatCount(row?.totalBatches || 0) },
    { label: "Venues", value: formatCount(venueNames.size || row?.venueCoverage || 0) },
    { label: "Records", value: formatCount(totalDetailEntries || row?.totalBatches || 0) },
  ];

  return (
    <div className="mp-manpower-profile-card">
      <div className="mp-manpower-profile-head">
        <div className="mp-manpower-profile-identity">
          <div className="mp-manpower-profile-avatar">{initials}</div>
          <div>
            <h4>{row?.personName || "Unknown"}</h4>
            <p>ID: {row?.empId || "-"}</p>
          </div>
        </div>
        <div className="mp-manpower-profile-head-actions">
          <button type="button" className="mp-back-small-btn">Download</button>
          <button type="button" className="mp-back-small-btn" onClick={onClose}>Close</button>
        </div>
      </div>

      <div className="mp-manpower-profile-body">
        <div className="mp-manpower-profile-section">
          <h5>Contact Information</h5>
          <div className="mp-manpower-profile-main-grid">
            <div className="mp-manpower-profile-left">
              <div className="mp-manpower-photo-box" role="img" aria-label="Dummy grayscale photograph placeholder">
                <div className="mp-manpower-photo-initials">{initials}</div>
                <span>Dummy Grayscale Photo</span>
              </div>
              <div className="mp-manpower-doc-grid">
                <div className="mp-manpower-doc mp-manpower-doc-horizontal">
                  <div className="mp-manpower-doc-title">Government ID Proof</div>
                  <div className="mp-manpower-doc-note">{govtIdAvailable ? "Verified" : "Upload Placeholder"}</div>
                </div>
                <div className="mp-manpower-doc mp-manpower-doc-vertical">
                  <div className="mp-manpower-doc-title">Employee ID Proof</div>
                  <div className="mp-manpower-doc-note">{row?.empId || "Pending"}</div>
                </div>
              </div>
            </div>
            <div className="mp-manpower-contact-list">
              {summaryRows.map((item) => (
                <div key={item.label} className="mp-manpower-contact-row">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mp-manpower-profile-section">
          <h5>Document Compliance</h5>
          <div className="mp-manpower-status-grid">
            {statusChips.map((chip) => (
              <div key={chip.label} className={`mp-manpower-status-chip ${chip.ok ? "is-ok" : "is-miss"}`}>
                <span className="mp-manpower-status-dot" />
                <strong>{chip.label}</strong>
              </div>
            ))}
          </div>
          <div className="mp-manpower-compliance-table">
            {complianceRows.map((item) => (
              <div key={item.label} className="mp-manpower-compliance-row">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="mp-manpower-profile-section">
          <div className="mp-manpower-rotation-head">
            <h5>Rotation Summary</h5>
            <span>Click a metric to view details</span>
          </div>
          <div className="mp-manpower-rotation-grid">
            {rotationCards.map((card) => (
              <div key={card.label} className="mp-manpower-rotation-card">
                <strong>{card.value}</strong>
                <span>{card.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ManpowerDashboardPage() {
  const { fetchApi, goTo, selectedVenueCode, setSelectedVenueCode, manpowerFilter, setManpowerFilter, openVenueDetail, user, setSidebarCollapsed } = useApp();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [focusEmpId, setFocusEmpId] = useState("");
  const [focusPersonName, setFocusPersonName] = useState("");
  const [employeeTypes, setEmployeeTypes] = useState([...EMPLOYEE_TYPES]);
  const [dateMode, setDateMode] = useState(DATE_MODES.all);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
  const [sidebarVenueFilters, setSidebarVenueFilters] = useState({
    status: "",
    category: "",
    venueType: "",
  });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedDrilldown, setSelectedDrilldown] = useState(null);
  const [selectedManpowerDrilldown, setSelectedManpowerDrilldown] = useState(null);
  const [stateCompareOpen, setStateCompareOpen] = useState(false);
  const [compareStateLeft, setCompareStateLeft] = useState("");
  const [compareStateRight, setCompareStateRight] = useState("");
  const [cityCompareOpen, setCityCompareOpen] = useState(false);
  const [compareCityLeft, setCompareCityLeft] = useState("");
  const [compareCityRight, setCompareCityRight] = useState("");
  const [venueCompareOpen, setVenueCompareOpen] = useState(false);
  const [compareVenueLeft, setCompareVenueLeft] = useState("");
  const [compareVenueRight, setCompareVenueRight] = useState("");
  const [personCompareOpen, setPersonCompareOpen] = useState(false);
  const [comparePersonLeft, setComparePersonLeft] = useState("");
  const [comparePersonRight, setComparePersonRight] = useState("");
  const hasBootstrappedQueryRef = useRef(false);
  const [selectedCategoryCallLog, setSelectedCategoryCallLog] = useState("");
  const [selectedTrendVenue, setSelectedTrendVenue] = useState(null);
  const [selectedPersonDrilldown, setSelectedPersonDrilldown] = useState(null);
  const [stateCompareSelection, setStateCompareSelection] = useState({ leftState: "", rightState: "" });
  const [performanceView, setPerformanceView] = useState("manpower");
  const [performanceScope, setPerformanceScope] = useState("top10");
  const [performanceRankings, setPerformanceRankings] = useState(null);
  const regionCategoryTableColRef = useRef(null);
  const manpowerWiseTableColRef = useRef(null);
  const [regionCategoryChartHeight, setRegionCategoryChartHeight] = useState(350);
  const [manpowerWiseChartHeight, setManpowerWiseChartHeight] = useState(350);

  useEffect(() => {
    // Keep filter panel visible on manpower dashboard.
    setSidebarCollapsed(false);
  }, [setSidebarCollapsed]);

  useLayoutEffect(() => {
    const tableEl = regionCategoryTableColRef.current;
    if (!tableEl) return undefined;
    const syncHeight = () => {
      const measured = tableEl.getBoundingClientRect().height || 0;
      if (measured > 0) {
        setRegionCategoryChartHeight((prev) => {
          const next = Math.max(320, Math.round(measured));
          return prev === next ? prev : next;
        });
      }
    };
    syncHeight();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(syncHeight);
    observer.observe(tableEl);
    return () => observer.disconnect();
  }, [selectedDrilldown, selectedManpowerDrilldown, result]);

  useLayoutEffect(() => {
    const tableEl = manpowerWiseTableColRef.current;
    if (!tableEl) return undefined;
    const syncHeight = () => {
      const measured = tableEl.getBoundingClientRect().height || 0;
      if (measured > 0) {
        setManpowerWiseChartHeight((prev) => {
          const next = Math.max(320, Math.round(measured));
          return prev === next ? prev : next;
        });
      }
    };
    syncHeight();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(syncHeight);
    observer.observe(tableEl);
    return () => observer.disconnect();
  }, [selectedDrilldown, selectedManpowerDrilldown, result]);
  const [performanceBusy, setPerformanceBusy] = useState(false);
  const [performanceError, setPerformanceError] = useState("");
  const [expandedProfilePersonKey, setExpandedProfilePersonKey] = useState("");
  const [lastQueryPayload, setLastQueryPayload] = useState(null);
  const [returnToGlobalSearchQuery, setReturnToGlobalSearchQuery] = useState("");

  // Unified Hierarchical Drilldown Path for Manpower
  const [drilldownPath, setDrilldownPath] = useState({
    metric: null, // 'manpower', 'projects', 'drives', etc.
    region: null,
    state: null,
    district: null,
    city: null,
    venue: null
  });

  const resetDrilldown = () => setDrilldownPath({ metric: null, region: null, state: null, district: null, city: null, venue: null });
  
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
        next.venue = null;
      } else if (level === 'region') {
        next.state = null;
        next.district = null;
        next.city = null;
        next.venue = null;
      } else if (level === 'state') {
        next.district = null;
        next.city = null;
        next.venue = null;
      } else if (level === 'district') {
        next.city = null;
        next.venue = null;
      } else if (level === 'city') {
        next.venue = null;
      }
      return next;
    });
  };



  const canViewPerformanceRankings = useMemo(() => {
    if (!user) return false;
    const permissionList = Array.isArray(user.permissions) ? user.permissions : [];
    const roleName = String(user.role || user.userType || "").trim();
    return (
      PERFORMANCE_RANKING_ALLOWED_USERS.includes(user.user) ||
      ["Admin", "SuperAdmin", "OperationsHead"].includes(roleName) ||
      permissionList.includes("view_performance_rankings") ||
      permissionList.includes("performance_rankings_view")
    );
  }, [user]);

  const buildPerformancePersonKey = useCallback((row, index) => {
    const personName = String(row?.personName || "").trim();
    const empId = String(row?.empId || "").trim();
    return `${empId || "NA"}::${personName || index}`;
  }, []);

  const togglePerformancePersonProfile = useCallback((row, index) => {
    const key = buildPerformancePersonKey(row, index);
    setExpandedProfilePersonKey((prev) => (prev === key ? "" : key));
  }, [buildPerformancePersonKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem("vms_manpower_return_global_search");
      if (!raw) return;
      const payload = JSON.parse(raw);
      const query = String(payload?.query || "").trim();
      if (query) setReturnToGlobalSearchQuery(query);
    } catch {
      // Ignore parsing failures.
    }
  }, []);

  useEffect(() => {
    if (performanceView !== "manpower") {
      setExpandedProfilePersonKey("");
    }
  }, [performanceView]);

  const loadPerformanceRankings = useCallback(
    async (queryPayload, scopeOverride = performanceScope) => {
      if (!canViewPerformanceRankings || !user?.user) {
        setPerformanceRankings(null);
        setPerformanceError("");
        return;
      }

      setPerformanceBusy(true);
      setPerformanceError("");
      try {
        const data = await fetchApi("manpower/performance-rankings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: user.user,
            scope: scopeOverride,
            query: queryPayload || {},
          }),
        });
        setPerformanceRankings(data);
      } catch (err) {
        const message = String(err?.message || "");
        if (message.includes("(404)") && result) {
          const fallbackRankings = buildLocalPerformanceRankings(result, scopeOverride);
          setPerformanceRankings(fallbackRankings);
          setPerformanceError("");
        } else {
          setPerformanceRankings(null);
          setPerformanceError(message || "Unable to load performance rankings.");
        }
      } finally {
        setPerformanceBusy(false);
      }
    },
    [canViewPerformanceRankings, fetchApi, performanceScope, result, user],
  );

  const runQuery = useCallback(async (payload) => {
    setBusy(true);
    setError("");
    setPerformanceError("");
    try {
      const requestBody = payload || {
        search: search.trim(),
        focusEmpId,
        personName: focusPersonName,
        employeeTypes,
        projects: filters.project ? [filters.project] : [],
        employees: filters.employee ? [filters.employee] : [],
        tenure: filters.tenure ? [filters.tenure] : [],
        roles: filters.role ? [filters.role] : [],
        regions: filters.region ? [filters.region] : [],
        states: filters.state ? [filters.state] : [],
        examCityCentres: filters.examCityCentre ? [filters.examCityCentre] : [],
        statuses: sidebarVenueFilters.status ? [sidebarVenueFilters.status] : [],
        categories: sidebarVenueFilters.category ? [sidebarVenueFilters.category] : [],
        venueTypes: sidebarVenueFilters.venueType ? [sidebarVenueFilters.venueType] : [],
        ...(dateMode === DATE_MODES.custom && dateFrom ? { dateFrom } : {}),
        ...(dateMode === DATE_MODES.custom && dateTo ? { dateTo } : {}),
      };

      const data = await fetchApi("manpower/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      setResult(data);
      setLastQueryPayload(requestBody);
      setSelectedDrilldown(null);
      setSelectedManpowerDrilldown(null);
      setStateCompareOpen(false);
      setCompareStateLeft("");
      setCompareStateRight("");
      setCityCompareOpen(false);
      setCompareCityLeft("");
      setCompareCityRight("");
      setVenueCompareOpen(false);
      setCompareVenueLeft("");
      setCompareVenueRight("");
      setPersonCompareOpen(false);
      setComparePersonLeft("");
      setComparePersonRight("");
      setSelectedCategoryCallLog("");
      setSelectedTrendVenue(null);
      setStateCompareSelection({ leftState: "", rightState: "" });
      setSelectedPersonDrilldown(null);
      return data;
    } catch (err) {
      setError(err.message || "Failed to load manpower dashboard");
      setPerformanceRankings(null);
      return null;
    } finally {
      setBusy(false);
    }
  }, [dateFrom, dateMode, dateTo, employeeTypes, fetchApi, filters, sidebarVenueFilters, search, focusEmpId, focusPersonName]);

  useEffect(() => {
    const hasPersonSearch = (payload) =>
      Boolean(
        String(payload?.search || "").trim() ||
        String(payload?.focusEmpId || "").trim() ||
        String(payload?.personName || "").trim(),
      );
    const hasAnyManpowerFilter = (payload) =>
      hasPersonSearch(payload) || Boolean(String(payload?.dmsCode || "").trim());
    const readPendingManpowerFilter = () => {
      if (typeof window === "undefined") return null;
      try {
        const raw = sessionStorage.getItem("vms_pending_manpower_filter");
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : null;
      } catch {
        return null;
      }
    };
    const clearPendingManpowerFilter = () => {
      if (typeof window === "undefined") return;
      try {
        sessionStorage.removeItem("vms_pending_manpower_filter");
      } catch {
        // Ignore storage failures.
      }
    };

    const pendingManpowerFilter = !hasAnyManpowerFilter(manpowerFilter)
      ? readPendingManpowerFilter()
      : null;
    const effectiveFilter = hasAnyManpowerFilter(manpowerFilter)
      ? manpowerFilter
      : (hasAnyManpowerFilter(pendingManpowerFilter) ? pendingManpowerFilter : null);

    let searchCandidates = [];
    // Track whether we need to clear context state AFTER the query runs,
    // rather than before (which would trigger a re-render and cancel the timer).
    let needsClearManpowerFilter = false;
    let needsClearVenueCode = false;

    let exactEmpId = "";
    let personName = "";

    if (hasPersonSearch(effectiveFilter)) {
      exactEmpId = String(effectiveFilter?.focusEmpId || "").trim();
      const primary = String(effectiveFilter?.search || "").trim();
      personName = String(effectiveFilter?.personName || "").trim();
      searchCandidates = Array.from(new Set([personName, primary, exactEmpId].filter(Boolean)));
      setSearch(searchCandidates[0] || "");
      setFocusEmpId(exactEmpId);
      setFocusPersonName(personName);
      needsClearManpowerFilter = hasAnyManpowerFilter(manpowerFilter);
      clearPendingManpowerFilter();
      needsClearVenueCode = Boolean(selectedVenueCode);
    } else if (effectiveFilter?.dmsCode) {
      searchCandidates = [String(effectiveFilter.dmsCode || "").trim()].filter(Boolean);
      setSearch(searchCandidates[0] || "");
      needsClearManpowerFilter = hasAnyManpowerFilter(manpowerFilter);
      clearPendingManpowerFilter();
      needsClearVenueCode = Boolean(selectedVenueCode);
    } else if (selectedVenueCode) {
      searchCandidates = [String(selectedVenueCode || "").trim()].filter(Boolean);
      setSearch(searchCandidates[0] || "");
      needsClearVenueCode = true;
      clearPendingManpowerFilter();
    } else if (!hasBootstrappedQueryRef.current) {
      searchCandidates = [""];
      clearPendingManpowerFilter();
    } else {
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      hasBootstrappedQueryRef.current = true;
      const candidates = searchCandidates.length ? searchCandidates : [""];
      for (const candidate of candidates) {
        if (cancelled) return;
        const cleanCandidate = String(candidate || "").trim();
        setSearch(cleanCandidate);
        setFocusEmpId(exactEmpId);
        setFocusPersonName(personName);
        const data = await runQuery({
          search: cleanCandidate,
          focusEmpId: exactEmpId,
          personName: personName,
          employeeTypes: [...EMPLOYEE_TYPES],
          projects: [],
          employees: [],
          tenure: [],
          roles: [],
          regions: [],
          states: [],
          examCityCentres: [],
        });
        if (cancelled) return;
        const rowCount = Number(data?.rowCount || data?.dedupedCount || 0);
        if (rowCount > 0) break;
      }
      // Clear context state AFTER the query has completed, so the state
      // change does not trigger a re-render that cancels this timer.
      if (!cancelled) {
        if (needsClearManpowerFilter) setManpowerFilter(null);
        if (needsClearVenueCode) setSelectedVenueCode("");
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manpowerFilter, selectedVenueCode]);

  useEffect(() => {
    if (!canViewPerformanceRankings) {
      setPerformanceRankings(null);
      setPerformanceError("");
      return;
    }
    if (!lastQueryPayload) return;
    loadPerformanceRankings(lastQueryPayload, performanceScope);
  }, [canViewPerformanceRankings, lastQueryPayload, loadPerformanceRankings, performanceScope]);

  const kpiCards = useMemo(() => {
    const overview = result?.overview || {};
    return [
      { key: "manpower", title: "MANPOWER", value: overview.manpower || 0, color: "#64748b" },
      { key: "projects", title: "PROJECTS", value: overview.projects || 0, color: "#3f7fdd" },
      { key: "drives", title: "DRIVES", value: overview.drives || 0, color: "#199fdb" },
      { key: "venueCount", title: "VENUE COUNT", value: overview.venueCount || 0, color: "#d18f00" },
      {
        key: "fullBatchDelay",
        title: "FULL BATCH DELAY",
        value: overview.fullBatchDelay || 0,
        color: "#eb4545",
      },
      {
        key: "partialBatchDelay",
        title: "PARTIALLY BATCH DELAY",
        value: overview.partialBatchDelay || 0,
        color: "#7b53e6",
      },
      { key: "noBatchDelay", title: "NO BATCH DELAY", value: overview.noBatchDelay || 0, color: "#5d5ce6" },
      { key: "totalBatches", title: "TOTAL BATCHES", value: overview.totalBatches || 0, color: "#1e293b" },
      { key: "ffa", title: "FASTEST FINGER ANALYSIS (FFA)", value: overview.ffa || 0, color: "#0fb77b" },
      { key: "callLogs", title: "CALL LOGS", value: overview.callLogs || 0, color: "#e39400" },
    ];
  }, [result]);

  const activeDrilldownChartData = useMemo(() => {
    if (!drilldownPath.metric || !result) return [];
    
    const { metric, region, state, district, city } = drilldownPath;
    
    // Use manpowerWiseEmployeeRotationDrilldown for absolute granularity if needed
    // but start with spread for Region/State
    let baseRows = result.manpowerWiseSpreadDrilldown || [];
    let nextLevel = 'region';

    if (region) {
      baseRows = baseRows.filter(r => r.region === region);
      nextLevel = 'state';
    }
    
    if (state) {
      baseRows = baseRows.filter(r => r.state === state);
      // For district/city, switch to more granular data if available
      // Actually spreadDrilldown usually stops at State.
      // Let's check manpowerWiseVenueDrilldown if it has more.
      const granularRows = result.manpowerWiseVenueDrilldown || [];
      if (granularRows.length > 0) {
        baseRows = granularRows.filter(r => r.region === region && r.state === state);
        nextLevel = 'district';
      } else {
        return [];
      }
    }

    if (district) {
      baseRows = baseRows.filter(r => r.district === district);
      nextLevel = 'city';
    }

    if (city) {
      baseRows = baseRows.filter(r => r.city === city);
      nextLevel = 'venueName';
    }

    if (drilldownPath.venue) return []; 

    const levelMap = new Map();
    const levelVenueSetMap = metric === "venueCount" ? new Map() : null;

    baseRows.forEach(row => {
      const levelValue = row[nextLevel] || "Unknown";
      if (!levelMap.has(levelValue)) levelMap.set(levelValue, 0);
      
      let val = 0;
      if (metric === 'manpower') val = Number(row.uniqueManpower || row.manpowerCount || 1);
      else if (metric === 'projects') val = Number(row.uniqueProjects || 1);
      else if (metric === 'drives') val = Number(row.uniqueDrives || 1);
      else if (metric === 'venueCount') {
        const venueId = String(row.dmsCode || "").trim();
        if (venueId && venueId !== "UNKNOWN") {
          if (!levelVenueSetMap.has(levelValue)) levelVenueSetMap.set(levelValue, new Set());
          levelVenueSetMap.get(levelValue).add(venueId);
        } else {
          val = Number(row.uniqueVenues || 0);
        }
      }
      else if (metric === 'noBatchDelay') val = Number(row.noDelay || 0);
      else if (metric === 'totalBatches') val = Number(row.totalBatches || 0);
      else if (metric === 'ffa') val = Number(row.ffa || 0);
      else if (metric === 'callLogs') val = Number(row.callLogs || 0);
      else if (metric === 'fullBatchDelay') val = Number(row.fullBatchDelay || 0);
      else if (metric === 'partialBatchDelay') val = Number(row.partialBatchDelay || 0);
      
      levelMap.set(levelValue, levelMap.get(levelValue) + val);
    });

    if (metric === "venueCount" && levelVenueSetMap) {
      levelVenueSetMap.forEach((venueSet, levelValue) => {
        levelMap.set(levelValue, levelMap.get(levelValue) + venueSet.size);
      });
    }

    return Array.from(levelMap.entries())
      .map(([name, value]) => ({ name, value }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [drilldownPath, result]);

  const drilldownManpowerRows = useMemo(() => {
    if (!drilldownPath.metric || !drilldownPath.venue || !result) return [];
    const { metric, region, state, district, city, venue } = drilldownPath;
    const sourceRows = result.manpowerWiseEmployeeRotationDrilldown || [];
    
    return sourceRows
      .filter(row => {
        if (region && row.region !== region) return false;
        if (state && row.state !== state) return false;
        if (district && row.district !== district) return false;
        if (city && row.city !== city) return false;
        if (venue && row.venueName !== venue) return false;
        return true;
      })
      .map(row => {
        let val = 0;
        if (metric === 'manpower') val = 1;
        else if (metric === 'projects') val = Number(row.uniqueProjects || 1);
        else if (metric === 'drives') val = Number(row.uniqueDrives || 1);
        else if (metric === 'noBatchDelay') val = Number(row.noDelay || 0);
        else if (metric === 'totalBatches') val = Number(row.totalBatches || 0);
        else if (metric === 'ffa') val = Number(row.ffa || 0);
        else if (metric === 'callLogs') val = Number(row.callLogs || 0);
        else if (metric === 'fullBatchDelay') val = Number(row.fullBatchDelay || 0);
        else if (metric === 'partialBatchDelay') val = Number(row.partialBatchDelay || 0);
        
        return {
          empId: row.empId,
          personName: row.personName || row.name || "Unknown",
          role: row.role || "N/A",
          tenure: row.tenure || "N/A",
          value: val
        };
      })
      .filter(row => row.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [drilldownPath, result]);

  const selectedDrilldownChartData = useMemo(() => {
    if (!selectedDrilldown || !result) return [];
    const { region, category, state, city } = selectedDrilldown;
    const sourceRows = result.regionCategoryVenueDrilldown || [];
    
    let filtered = sourceRows.filter(r => r.region === region && r.category === category);
    let nextLevel = 'state';
    
    if (state) {
      filtered = filtered.filter(r => r.state === state);
      nextLevel = 'city';
    }
    
    if (city) {
      filtered = filtered.filter(r => r.city === city);
      nextLevel = 'venueName';
    }
    
    const levelMap = new Map();
    filtered.forEach(row => {
      let levelValue = "";
      if (nextLevel === 'state') levelValue = row.state;
      else if (nextLevel === 'city') levelValue = `${row.district} / ${row.city}`;
      else if (nextLevel === 'venueName') levelValue = row.venueName;
      
      levelValue = levelValue || "Unknown";
      levelMap.set(levelValue, (levelMap.get(levelValue) || 0) + Number(row.uniqueManpowerCount || 0));
    });
    
    return Array.from(levelMap.entries())
      .map(([name, value]) => ({ name, value }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [selectedDrilldown, result]);

  const selectedManpowerDrilldownChartData = useMemo(() => {
    if (!selectedManpowerDrilldown || !result) return [];
    const { region, workforceType, state, tenure, role } = selectedManpowerDrilldown;
    
    if (state && tenure && role) return []; // Too deep for a simple chart

    if (!state) {
      // Show states for this region/workforceType
      const sourceRows = result.manpowerWiseSpreadDrilldown || [];
      return sourceRows
        .filter(r => r.region === region && r.workforceType === workforceType)
        .map(r => ({ name: r.state, value: Number(r.uniqueManpower || 0) }))
        .filter(item => item.value > 0)
        .sort((a, b) => b.value - a.value);
    } else {
      // Show tenure/role distribution for this state
      const sourceRows = result.manpowerWiseTenureRoleDrilldown || [];
      const levelMap = new Map();
      sourceRows
        .filter(r => r.region === region && r.workforceType === workforceType && r.state === state)
        .forEach(r => {
          const key = `${r.tenure} - ${r.role}`;
          levelMap.set(key, (levelMap.get(key) || 0) + Number(r.uniqueManpowerCount || 0));
        });
      return Array.from(levelMap.entries())
        .map(([name, value]) => ({ name, value }))
        .filter(item => item.value > 0)
        .sort((a, b) => b.value - a.value);
    }
  }, [selectedManpowerDrilldown, result]);


  const regionCategoryRows = useMemo(
    () => result?.regionCategorySummary || [],
    [result],
  );
  const regionCategoryChartRows = useMemo(
    () =>
      regionCategoryRows.map((row) => ({
        ...row,
        totalUniqueManpower:
          Number(row.categoryAUniqueManpower || 0) +
          Number(row.categoryBUniqueManpower || 0) +
          Number(row.categoryCUniqueManpower || 0) +
          Number(row.categoryBlcUniqueManpower || 0) +
          Number(row.categoryBlUniqueManpower || 0),
      })),
    [regionCategoryRows],
  );
  const manpowerWiseRows = useMemo(
    () => result?.manpowerWiseSummary || [],
    [result],
  );
  const tenureRoleSourceRows = useMemo(
    () => result?.manpowerWiseTenureRoleDrilldown || [],
    [result],
  );
  const regionVsRolesMatrix = useMemo(
    () => buildRegionMatrixSummary(tenureRoleSourceRows, { bucketField: "role", maxBuckets: 8 }),
    [tenureRoleSourceRows],
  );
  const regionVsTenureMatrix = useMemo(
    () => buildRegionMatrixSummary(tenureRoleSourceRows, { bucketField: "tenure", maxBuckets: 7 }),
    [tenureRoleSourceRows],
  );
  const outsourceVsTenureMatrix = useMemo(
    () => buildRegionMatrixSummary(tenureRoleSourceRows, { bucketField: "tenure", workforceType: "outsource", maxBuckets: 7 }),
    [tenureRoleSourceRows],
  );
  const ownedVsTenureMatrix = useMemo(
    () => buildRegionMatrixSummary(tenureRoleSourceRows, { bucketField: "tenure", workforceType: "owned", maxBuckets: 7 }),
    [tenureRoleSourceRows],
  );
  const manpowerSpreadRows = useMemo(() => {
    if (!selectedManpowerDrilldown) return [];
    const sourceRows = result?.manpowerWiseSpreadDrilldown || [];
    return sourceRows.filter((row) => {
      if (row.region !== selectedManpowerDrilldown.region) return false;
      if (row.workforceType !== selectedManpowerDrilldown.workforceType) return false;
      return true;
    });
  }, [result, selectedManpowerDrilldown]);
  const manpowerStateCompareOptions = useMemo(
    () => Array.from(new Set(manpowerSpreadRows.map((row) => row.state).filter(Boolean))).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })),
    [manpowerSpreadRows],
  );
  const compareLeftState = manpowerStateCompareOptions.includes(stateCompareSelection.leftState)
    ? stateCompareSelection.leftState
    : "";
  const compareRightState = manpowerStateCompareOptions.includes(stateCompareSelection.rightState)
    ? stateCompareSelection.rightState
    : "";
  const manpowerStateComparisonRows = useMemo(() => {
    const leftState = compareLeftState;
    const rightState = compareRightState;
    if (!leftState || !rightState || leftState === rightState) return [];

    const leftRow = manpowerSpreadRows.find((row) => row.state === leftState);
    const rightRow = manpowerSpreadRows.find((row) => row.state === rightState);
    if (!leftRow || !rightRow) return [];

    const metrics = [
      { key: "uniqueManpower", label: "Unique Manpower" },
      { key: "uniqueVenues", label: "Unique Venues" },
      { key: "totalBatches", label: "Total Batches" },
      { key: "fullBatchDelay", label: "Full Batch Delay" },
      { key: "partialBatchDelay", label: "Partial Batch Delay" },
      { key: "noDelay", label: "No Delay" },
      { key: "ffa", label: "FFA" },
      { key: "callLogs", label: "Call Logs" },
    ];

    return metrics.map((metric) => {
      const leftValue = Number(leftRow[metric.key] || 0);
      const rightValue = Number(rightRow[metric.key] || 0);
      return {
        key: metric.key,
        label: metric.label,
        leftValue,
        rightValue,
        diff: leftValue - rightValue,
      };
    });
  }, [manpowerSpreadRows, compareLeftState, compareRightState]);
  const manpowerTenureRoleRows = useMemo(() => {
    if (!selectedManpowerDrilldown?.state) return [];
    const sourceRows = result?.manpowerWiseTenureRoleDrilldown || [];
    return sourceRows.filter((row) => {
      if (row.region !== selectedManpowerDrilldown.region) return false;
      if (row.workforceType !== selectedManpowerDrilldown.workforceType) return false;
      if (row.state !== selectedManpowerDrilldown.state) return false;
      return true;
    });
  }, [result, selectedManpowerDrilldown]);
  const manpowerVenueRows = useMemo(() => {
    if (!selectedManpowerDrilldown?.state || !selectedManpowerDrilldown?.tenure || !selectedManpowerDrilldown?.role) {
      return [];
    }
    const sourceRows = result?.manpowerWiseVenueDrilldown || [];
    return sourceRows.filter((row) => {
      if (row.region !== selectedManpowerDrilldown.region) return false;
      if (row.workforceType !== selectedManpowerDrilldown.workforceType) return false;
      if (row.state !== selectedManpowerDrilldown.state) return false;
      if (row.tenure !== selectedManpowerDrilldown.tenure) return false;
      if (row.role !== selectedManpowerDrilldown.role) return false;
      return true;
    });
  }, [result, selectedManpowerDrilldown]);
  const manpowerEmployeeRotationRows = useMemo(() => {
    if (!selectedManpowerDrilldown?.state || !selectedManpowerDrilldown?.tenure || !selectedManpowerDrilldown?.role || !selectedManpowerDrilldown?.dmsCode) {
      return [];
    }
    const sourceRows = result?.manpowerWiseEmployeeRotationDrilldown || [];
    return sourceRows.filter((row) => {
      if (row.region !== selectedManpowerDrilldown.region) return false;
      if (row.workforceType !== selectedManpowerDrilldown.workforceType) return false;
      if (row.state !== selectedManpowerDrilldown.state) return false;
      if (row.tenure !== selectedManpowerDrilldown.tenure) return false;
      if (row.role !== selectedManpowerDrilldown.role) return false;
      if (row.dmsCode !== selectedManpowerDrilldown.dmsCode) return false;
      if (row.venueName !== selectedManpowerDrilldown.venueName) return false;
      return true;
    });
  }, [result, selectedManpowerDrilldown]);
  const manpowerScopedEmployeeRows = useMemo(() => {
    if (!selectedManpowerDrilldown?.state || !selectedManpowerDrilldown?.tenure || !selectedManpowerDrilldown?.role) {
      return [];
    }
    return (result?.manpowerWiseEmployeeRotationDrilldown || [])
      .filter((row) => {
        if (row.region !== selectedManpowerDrilldown.region) return false;
        if (row.workforceType !== selectedManpowerDrilldown.workforceType) return false;
        if (row.state !== selectedManpowerDrilldown.state) return false;
        if (row.tenure !== selectedManpowerDrilldown.tenure) return false;
        if (row.role !== selectedManpowerDrilldown.role) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.personName !== b.personName) return a.personName.localeCompare(b.personName, "en", { sensitivity: "base" });
        if (a.empId !== b.empId) return a.empId.localeCompare(b.empId, "en", { sensitivity: "base" });
        return a.venueName.localeCompare(b.venueName, "en", { sensitivity: "base" });
      });
  }, [result, selectedManpowerDrilldown]);
  const manpowerRotationTrendRows = useMemo(() => {
    if (!manpowerScopedEmployeeRows.length) return [];

    const grouped = manpowerScopedEmployeeRows.reduce((acc, row) => {
      const key = `${row.empId}||${row.personName}`;
      if (!acc.has(key)) acc.set(key, []);
      acc.get(key).push(row);
      return acc;
    }, new Map());

    const output = [];
    for (const groupRows of grouped.values()) {
      const trendCount = new Map();
      const venueSet = new Set();
      const categoryVenueMap = new Map(CATEGORY_CODES.map((code) => [code, new Set()]));
      groupRows.forEach((row) => {
        const trend = getIssueTrendLabel(row);
        venueSet.add(row.venueName);
        if (shouldCountForRotation(trend)) {
          trendCount.set(trend, (trendCount.get(trend) || 0) + 1);
        }
        if (CATEGORY_CODES.includes(row.category)) {
          categoryVenueMap.get(row.category).add(row.dmsCode || row.venueName || "");
        }
        output.push({
          empId: row.empId,
          employeeLabel: `${row.personName} (${row.empId})`,
          venueName: row.venueName,
          dmsCode: row.dmsCode,
          issueTrend: trend,
          category: row.category || "-",
          recommendation: "",
          isSummary: false,
        });
      });

      let recommendation = "";
      let topIssueCount = 0;
      let topIssueTrend = "";
      trendCount.forEach((count, trend) => {
        if (count > topIssueCount) {
          topIssueCount = count;
          topIssueTrend = trend;
        }
      });
      let dominantCategory = "-";
      let dominantCategoryCount = -1;
      categoryVenueMap.forEach((venues, category) => {
        if (venues.size > dominantCategoryCount) {
          dominantCategoryCount = venues.size;
          dominantCategory = category;
        }
      });
      if (venueSet.size >= 3 && topIssueCount >= 2) {
        recommendation = `same venue rotation needed (${topIssueTrend})`;
        const firstRow = groupRows[0];
        output.push({
          empId: firstRow.empId,
          employeeLabel: `${firstRow.personName} (${firstRow.empId})`,
          venueName: "same venue",
          dmsCode: "",
          issueTrend: "rotation needed",
          category: dominantCategory,
          recommendation,
          isSummary: true,
        });
      }
    }

    return output;
  }, [manpowerScopedEmployeeRows]);
  const manpowerCategoryVenueRows = useMemo(() => {
    if (!manpowerScopedEmployeeRows.length) return [];

    const grouped = manpowerScopedEmployeeRows.reduce((acc, row) => {
      const key = `${row.empId}||${row.personName}`;
      if (!acc.has(key)) {
        const categoryVenueMap = new Map();
        CATEGORY_CODES.forEach((code) => categoryVenueMap.set(code, new Set()));
        acc.set(key, {
          empId: row.empId,
          personName: row.personName,
          categoryVenueMap,
        });
      }
      const entry = acc.get(key);
      const categoryCode = CATEGORY_CODES.includes(row.category) ? row.category : null;
      const venueKey = row.dmsCode || row.venueName || "";
      if (categoryCode && venueKey) {
        entry.categoryVenueMap.get(categoryCode).add(venueKey);
      }
      return acc;
    }, new Map());

    const out = [];
    grouped.forEach((entry) => {
      CATEGORY_CODES.forEach((categoryCode) => {
        const venuesForCategory = entry.categoryVenueMap.get(categoryCode) || new Set();
        out.push({
          empId: entry.empId,
          employeeLabel: `${entry.personName} (${entry.empId})`,
          category: categoryCode,
          venueCount: venuesForCategory.size,
        });
      });
    });

    return out.sort((a, b) => {
      if (a.employeeLabel !== b.employeeLabel) return a.employeeLabel.localeCompare(b.employeeLabel, "en", { sensitivity: "base" });
      return CATEGORY_CODES.indexOf(a.category) - CATEGORY_CODES.indexOf(b.category);
    });
  }, [manpowerScopedEmployeeRows]);
  const manpowerSelectedVenueRows = useMemo(() => {
    if (!selectedTrendVenue || !manpowerScopedEmployeeRows.length) return [];
    const filtered = manpowerScopedEmployeeRows.filter((row) => {
      if (selectedTrendVenue.dmsCode && row.dmsCode === selectedTrendVenue.dmsCode) return true;
      return row.venueName === selectedTrendVenue.venueName;
    });
    const unique = new Map();
    filtered.forEach((row) => {
      const key = `${row.empId}||${row.personName}`;
      if (!unique.has(key)) {
        unique.set(key, { ...row });
        return;
      }
      const existing = unique.get(key);
      unique.set(key, {
        ...existing,
        totalBatches: Math.max(Number(existing.totalBatches || 0), Number(row.totalBatches || 0)),
        ffa: Math.max(Number(existing.ffa || 0), Number(row.ffa || 0)),
        callLogs: Math.max(Number(existing.callLogs || 0), Number(row.callLogs || 0)),
        uniqueProjectsInScope: Math.max(Number(existing.uniqueProjectsInScope || 0), Number(row.uniqueProjectsInScope || 0)),
        uniqueDrivesInScope: Math.max(Number(existing.uniqueDrivesInScope || 0), Number(row.uniqueDrivesInScope || 0)),
        uniqueVenuesInScope: Math.max(Number(existing.uniqueVenuesInScope || 0), Number(row.uniqueVenuesInScope || 0)),
        phone: existing.phone || row.phone,
        email: existing.email || row.email,
        role: existing.role || row.role,
        tenure: existing.tenure || row.tenure,
      });
    });
    return Array.from(unique.values()).sort((a, b) =>
      String(a.personName || "").localeCompare(String(b.personName || ""), "en", { sensitivity: "base" }),
    );
  }, [manpowerScopedEmployeeRows, selectedTrendVenue]);
  const categoryCallLogSourceRows = useMemo(
    () => result?.manpowerWiseEmployeeRotationDrilldown || [],
    [result],
  );
  const categoryWiseCallLogRows = useMemo(() => {
    const grouped = new Map(CATEGORY_CODES.map((category) => [category, { employees: new Set(), callLogCount: 0 }]));
    categoryCallLogSourceRows.forEach((row) => {
      const category = CATEGORY_CODES.includes(row.category) ? row.category : null;
      if (!category) return;
      const key = `${row.empId || ""}||${row.personName || ""}`;
      if (key !== "||") {
        grouped.get(category).employees.add(key);
      }
      grouped.get(category).callLogCount += Number(row.callLogs || 0);
    });
    return CATEGORY_CODES.map((category) => {
      const entry = grouped.get(category);
      return {
        category,
        employeeCount: entry ? entry.employees.size : 0,
        callLogCount: entry ? entry.callLogCount : 0,
      };
    });
  }, [categoryCallLogSourceRows]);
  const categoryWiseTotalCallLogs = useMemo(
    () => categoryWiseCallLogRows.reduce((sum, row) => sum + Number(row.callLogCount || 0), 0),
    [categoryWiseCallLogRows],
  );
  const selectedCategoryCallLogSummary = useMemo(
    () => categoryWiseCallLogRows.find((row) => row.category === selectedCategoryCallLog) || null,
    [categoryWiseCallLogRows, selectedCategoryCallLog],
  );
  const selectedCategoryCallLogTrendRows = useMemo(() => {
    if (!selectedCategoryCallLog) return [];
    const trendMap = new Map();
    categoryCallLogSourceRows.forEach((row) => {
      if (row.category !== selectedCategoryCallLog) return;
      const count = Number(row.callLogs || 0);
      if (count <= 0) return;
      const reason = getIssueTrendLabel(row);
      trendMap.set(reason, (trendMap.get(reason) || 0) + count);
    });
    return Array.from(trendMap.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.reason.localeCompare(b.reason, "en", { sensitivity: "base" });
      });
  }, [categoryCallLogSourceRows, selectedCategoryCallLog]);

  const manpowerPerformanceRows = useMemo(
    () => (Array.isArray(performanceRankings?.manpower) ? performanceRankings.manpower : []),
    [performanceRankings],
  );
  const venuePerformanceRows = useMemo(
    () => (Array.isArray(performanceRankings?.venues) ? performanceRankings.venues : []),
    [performanceRankings],
  );
  const projectPerformanceRows = useMemo(
    () => (Array.isArray(performanceRankings?.projects) ? performanceRankings.projects : []),
    [performanceRankings],
  );

  const drilldownRows = useMemo(() => {
    if (!selectedDrilldown) return [];
    const sourceRows = result?.regionCategoryDrilldown || [];
    return sourceRows.filter((row) => {
      if (row.region !== selectedDrilldown.region) return false;
      if (row.category !== selectedDrilldown.category) return false;
      if (selectedDrilldown.state && row.state !== selectedDrilldown.state) return false;
      return true;
    });
  }, [result, selectedDrilldown]);
  const drilldownRowsAllStates = useMemo(() => {
    if (!selectedDrilldown) return [];
    const sourceRows = result?.regionCategoryDrilldown || [];
    return sourceRows.filter((row) => {
      if (row.region !== selectedDrilldown.region) return false;
      if (row.category !== selectedDrilldown.category) return false;
      return true;
    });
  }, [result, selectedDrilldown]);
  const comparableStates = useMemo(
    () => Array.from(new Set(drilldownRowsAllStates.map((row) => row.state).filter(Boolean))).sort(),
    [drilldownRowsAllStates],
  );
  const normalizedCompareLeft = comparableStates.includes(compareStateLeft)
    ? compareStateLeft
    : (comparableStates[0] || "");
  const normalizedCompareRight = (comparableStates.includes(compareStateRight) && compareStateRight !== normalizedCompareLeft)
    ? compareStateRight
    : (comparableStates.find((state) => state !== normalizedCompareLeft) || "");
  const summarizeStateForComparison = useCallback((stateName) => {
    const scopedRows = drilldownRowsAllStates.filter((row) => row.state === stateName);
    const uniqueManpower = scopedRows.reduce((sum, row) => sum + Number(row.uniqueManpowerCount || 0), 0);
    const centreSet = new Set(scopedRows.map((row) => `${row.district}||${row.city}`));
    const centreCities = centreSet.size;
    const maxCentreManpower = scopedRows.length
      ? Math.max(...scopedRows.map((row) => Number(row.uniqueManpowerCount || 0)))
      : 0;
    const avgManpowerPerCentre = centreCities ? uniqueManpower / centreCities : 0;
    return {
      uniqueManpower,
      centreCities,
      maxCentreManpower,
      avgManpowerPerCentre: Number(avgManpowerPerCentre.toFixed(2)),
    };
  }, [drilldownRowsAllStates]);
  const canShowStateCompare = Boolean(
    selectedDrilldown && !selectedDrilldown.state && !selectedDrilldown.city && comparableStates.length >= 2,
  );
  const leftCompareSummary = useMemo(
    () => (normalizedCompareLeft ? summarizeStateForComparison(normalizedCompareLeft) : null),
    [normalizedCompareLeft, summarizeStateForComparison],
  );
  const rightCompareSummary = useMemo(
    () => (normalizedCompareRight ? summarizeStateForComparison(normalizedCompareRight) : null),
    [normalizedCompareRight, summarizeStateForComparison],
  );
  const drilldownStateComparisonRows = useMemo(() => {
    if (!leftCompareSummary || !rightCompareSummary) return [];
    const metrics = [
      {
        key: "uniqueManpower",
        label: "Unique Manpower",
        leftValue: leftCompareSummary.uniqueManpower,
        rightValue: rightCompareSummary.uniqueManpower,
      },
      {
        key: "centreCities",
        label: "Centre Cities",
        leftValue: leftCompareSummary.centreCities,
        rightValue: rightCompareSummary.centreCities,
      },
      {
        key: "avgManpowerPerCentre",
        label: "Average Manpower / Centre",
        leftValue: leftCompareSummary.avgManpowerPerCentre,
        rightValue: rightCompareSummary.avgManpowerPerCentre,
      },
      {
        key: "maxCentreManpower",
        label: "Highest Centre Manpower",
        leftValue: leftCompareSummary.maxCentreManpower,
        rightValue: rightCompareSummary.maxCentreManpower,
      },
    ];
    return metrics.map((metric) => ({
      ...metric,
      diff: Number(metric.leftValue) - Number(metric.rightValue),
    }));
  }, [leftCompareSummary, rightCompareSummary]);

  const formatCentreLabel = useCallback((centreKey) => {
    const [district = "", city = ""] = String(centreKey || "").split("||");
    return `${district} / ${city}`;
  }, []);

  const comparableCities = useMemo(() => {
    if (!selectedDrilldown?.state || selectedDrilldown?.city) return [];
    const seen = new Set();
    return drilldownRows
      .map((row) => {
        const district = String(row.district || "").trim();
        const city = String(row.city || "").trim();
        const key = `${district}||${city}`;
        return {
          key,
          label: `${district} / ${city}`,
        };
      })
      .filter((entry) => {
        if (entry.key === "||" || seen.has(entry.key)) return false;
        seen.add(entry.key);
        return true;
      })
      .sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
  }, [drilldownRows, selectedDrilldown]);
  const comparableCityKeys = useMemo(
    () => comparableCities.map((entry) => entry.key),
    [comparableCities],
  );
  const normalizedCityCompareLeft = comparableCityKeys.includes(compareCityLeft)
    ? compareCityLeft
    : (comparableCityKeys[0] || "");
  const normalizedCityCompareRight = (
    comparableCityKeys.includes(compareCityRight) && compareCityRight !== normalizedCityCompareLeft
  )
    ? compareCityRight
    : (comparableCityKeys.find((key) => key !== normalizedCityCompareLeft) || "");
  const cityScopedVenueRows = useMemo(() => {
    if (!selectedDrilldown?.state || selectedDrilldown?.city) return [];
    return (result?.regionCategoryVenueDrilldown || []).filter((row) => {
      if (row.region !== selectedDrilldown.region) return false;
      if (row.category !== selectedDrilldown.category) return false;
      if (row.state !== selectedDrilldown.state) return false;
      return true;
    });
  }, [result, selectedDrilldown]);
  const summarizeCityForComparison = useCallback((centreKey) => {
    if (!centreKey) return null;
    const [district = "", city = ""] = centreKey.split("||");
    const scopedRows = drilldownRows.filter(
      (row) => String(row.district || "").trim() === district && String(row.city || "").trim() === city,
    );
    const uniqueManpower = scopedRows.reduce((sum, row) => sum + Number(row.uniqueManpowerCount || 0), 0);
    const scopedVenueRows = cityScopedVenueRows.filter(
      (row) => String(row.district || "").trim() === district && String(row.city || "").trim() === city,
    );
    const uniqueVenueSet = new Set(
      scopedVenueRows.map((row) => `${String(row.dmsCode || "").trim()}||${String(row.venueName || "").trim()}`),
    );
    const venueCount = uniqueVenueSet.size;
    const maxVenueManpower = scopedVenueRows.length
      ? Math.max(...scopedVenueRows.map((row) => Number(row.uniqueManpowerCount || 0)))
      : 0;
    const avgManpowerPerVenue = venueCount ? uniqueManpower / venueCount : 0;
    return {
      uniqueManpower,
      venueCount,
      avgManpowerPerVenue: Number(avgManpowerPerVenue.toFixed(2)),
      maxVenueManpower,
    };
  }, [cityScopedVenueRows, drilldownRows]);
  const canShowCityCompare = Boolean(
    selectedDrilldown?.state && !selectedDrilldown?.city && comparableCityKeys.length >= 2,
  );
  const leftCityCompareSummary = useMemo(
    () => (normalizedCityCompareLeft ? summarizeCityForComparison(normalizedCityCompareLeft) : null),
    [normalizedCityCompareLeft, summarizeCityForComparison],
  );
  const rightCityCompareSummary = useMemo(
    () => (normalizedCityCompareRight ? summarizeCityForComparison(normalizedCityCompareRight) : null),
    [normalizedCityCompareRight, summarizeCityForComparison],
  );
  const cityComparisonRows = useMemo(() => {
    if (!leftCityCompareSummary || !rightCityCompareSummary) return [];
    const metrics = [
      {
        key: "cityUniqueManpower",
        label: "Unique Manpower",
        leftValue: leftCityCompareSummary.uniqueManpower,
        rightValue: rightCityCompareSummary.uniqueManpower,
      },
      {
        key: "cityVenueCount",
        label: "Number of Venues",
        leftValue: leftCityCompareSummary.venueCount,
        rightValue: rightCityCompareSummary.venueCount,
      },
      {
        key: "cityAvgPerVenue",
        label: "Average Manpower / Venue",
        leftValue: leftCityCompareSummary.avgManpowerPerVenue,
        rightValue: rightCityCompareSummary.avgManpowerPerVenue,
      },
      {
        key: "cityMaxVenue",
        label: "Highest Venue Manpower",
        leftValue: leftCityCompareSummary.maxVenueManpower,
        rightValue: rightCityCompareSummary.maxVenueManpower,
      },
    ];
    return metrics.map((metric) => ({
      ...metric,
      diff: Number(metric.leftValue) - Number(metric.rightValue),
    }));
  }, [leftCityCompareSummary, rightCityCompareSummary]);

  const venueDrilldownRows = useMemo(() => {
    if (!selectedDrilldown?.state || !selectedDrilldown?.city || !selectedDrilldown?.district) return [];
    const sourceRows = result?.regionCategoryVenueDrilldown || [];
    return sourceRows.filter((row) => {
      if (row.region !== selectedDrilldown.region) return false;
      if (row.category !== selectedDrilldown.category) return false;
      if (row.state !== selectedDrilldown.state) return false;
      if (row.city !== selectedDrilldown.city) return false;
      if (row.district !== selectedDrilldown.district) return false;
      return true;
    });
  }, [result, selectedDrilldown]);
  const cityScopedVenuePersonRows = useMemo(() => {
    if (!selectedDrilldown?.state || !selectedDrilldown?.city || !selectedDrilldown?.district) return [];
    return (result?.regionCategoryVenuePersonDrilldown || []).filter((row) => {
      if (row.region !== selectedDrilldown.region) return false;
      if (row.category !== selectedDrilldown.category) return false;
      if (row.state !== selectedDrilldown.state) return false;
      if (row.city !== selectedDrilldown.city) return false;
      if (row.district !== selectedDrilldown.district) return false;
      return true;
    });
  }, [result, selectedDrilldown]);
  const comparableVenues = useMemo(() => {
    if (!selectedDrilldown?.city || selectedDrilldown?.venueName) return [];
    const seen = new Set();
    return venueDrilldownRows
      .map((row) => {
        const dmsCode = String(row.dmsCode || "").trim();
        const venueName = String(row.venueName || "").trim();
        const key = `${dmsCode}||${venueName}`;
        return {
          key,
          dmsCode,
          venueName,
          label: dmsCode ? `${venueName} (${dmsCode})` : venueName,
          uniqueManpowerCount: Number(row.uniqueManpowerCount || 0),
        };
      })
      .filter((entry) => {
        if (!entry.venueName || seen.has(entry.key)) return false;
        seen.add(entry.key);
        return true;
      })
      .sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
  }, [selectedDrilldown, venueDrilldownRows]);
  const comparableVenueKeys = useMemo(
    () => comparableVenues.map((entry) => entry.key),
    [comparableVenues],
  );
  const comparableVenueMap = useMemo(
    () => new Map(comparableVenues.map((entry) => [entry.key, entry])),
    [comparableVenues],
  );
  const normalizedVenueCompareLeft = comparableVenueKeys.includes(compareVenueLeft)
    ? compareVenueLeft
    : (comparableVenueKeys[0] || "");
  const normalizedVenueCompareRight = (
    comparableVenueKeys.includes(compareVenueRight) && compareVenueRight !== normalizedVenueCompareLeft
  )
    ? compareVenueRight
    : (comparableVenueKeys.find((key) => key !== normalizedVenueCompareLeft) || "");
  const summarizeVenueForComparison = useCallback((venueKey) => {
    const venueEntry = comparableVenueMap.get(venueKey);
    if (!venueEntry) return null;
    const scopedPeople = cityScopedVenuePersonRows.filter((row) => {
      if (String(row.venueName || "").trim() !== venueEntry.venueName) return false;
      if (venueEntry.dmsCode && String(row.dmsCode || "").trim() !== venueEntry.dmsCode) return false;
      return true;
    });
    const totalEntries = scopedPeople.reduce(
      (sum, row) => sum + parsePersonDetailStats(row.personDetails).entries,
      0,
    );
    const peopleCount = scopedPeople.length;
    const avgEntriesPerPerson = peopleCount ? totalEntries / peopleCount : 0;
    const highestPersonEntries = scopedPeople.length
      ? Math.max(...scopedPeople.map((row) => parsePersonDetailStats(row.personDetails).entries))
      : 0;
    return {
      uniqueManpower: venueEntry.uniqueManpowerCount,
      peopleCount,
      totalEntries,
      avgEntriesPerPerson: Number(avgEntriesPerPerson.toFixed(2)),
      highestPersonEntries,
    };
  }, [cityScopedVenuePersonRows, comparableVenueMap]);
  const canShowVenueCompare = Boolean(
    selectedDrilldown?.city && !selectedDrilldown?.venueName && comparableVenueKeys.length >= 2,
  );
  const leftVenueCompareSummary = useMemo(
    () => (normalizedVenueCompareLeft ? summarizeVenueForComparison(normalizedVenueCompareLeft) : null),
    [normalizedVenueCompareLeft, summarizeVenueForComparison],
  );
  const rightVenueCompareSummary = useMemo(
    () => (normalizedVenueCompareRight ? summarizeVenueForComparison(normalizedVenueCompareRight) : null),
    [normalizedVenueCompareRight, summarizeVenueForComparison],
  );
  const venueComparisonRows = useMemo(() => {
    if (!leftVenueCompareSummary || !rightVenueCompareSummary) return [];
    const metrics = [
      {
        key: "venueUniqueManpower",
        label: "Unique Manpower",
        leftValue: leftVenueCompareSummary.uniqueManpower,
        rightValue: rightVenueCompareSummary.uniqueManpower,
      },
      {
        key: "venuePeopleCount",
        label: "Number of People",
        leftValue: leftVenueCompareSummary.peopleCount,
        rightValue: rightVenueCompareSummary.peopleCount,
      },
      {
        key: "venueTotalEntries",
        label: "Total Involvement Entries",
        leftValue: leftVenueCompareSummary.totalEntries,
        rightValue: rightVenueCompareSummary.totalEntries,
      },
      {
        key: "venueAvgEntries",
        label: "Average Entries / Person",
        leftValue: leftVenueCompareSummary.avgEntriesPerPerson,
        rightValue: rightVenueCompareSummary.avgEntriesPerPerson,
      },
      {
        key: "venueTopEntries",
        label: "Top Performer Entries",
        leftValue: leftVenueCompareSummary.highestPersonEntries,
        rightValue: rightVenueCompareSummary.highestPersonEntries,
      },
    ];
    return metrics.map((metric) => ({
      ...metric,
      diff: Number(metric.leftValue) - Number(metric.rightValue),
    }));
  }, [leftVenueCompareSummary, rightVenueCompareSummary]);

  const venuePersonRows = useMemo(() => {
    if (!selectedDrilldown?.state || !selectedDrilldown?.city || !selectedDrilldown?.district || !selectedDrilldown?.venueName) {
      return [];
    }
    const sourceRows = result?.regionCategoryVenuePersonDrilldown || [];
    return sourceRows.filter((row) => {
      if (row.region !== selectedDrilldown.region) return false;
      if (row.category !== selectedDrilldown.category) return false;
      if (row.state !== selectedDrilldown.state) return false;
      if (row.city !== selectedDrilldown.city) return false;
      if (row.district !== selectedDrilldown.district) return false;
      if (row.venueName !== selectedDrilldown.venueName) return false;
      if (selectedDrilldown.dmsCode && row.dmsCode !== selectedDrilldown.dmsCode) return false;
      return true;
    });
  }, [result, selectedDrilldown]);
  const selectedVenuePersonRows = useMemo(() => {
    if (!selectedPersonDrilldown?.personKey) return [];
    return venuePersonRows.filter((row) => {
      const parsed = parsePersonDetailStats(row.personDetails);
      const personKey = `${parsed.id || ""}||${row.personName}`;
      return personKey === selectedPersonDrilldown.personKey;
    });
  }, [selectedPersonDrilldown, venuePersonRows]);
  const comparablePersons = useMemo(() => {
    if (!selectedDrilldown?.venueName) return [];
    const grouped = new Map();
    venuePersonRows.forEach((row) => {
      const parsed = parsePersonDetailStats(row.personDetails);
      const personId = parsed.id || "";
      const personKey = `${personId}||${row.personName}`;
      if (!grouped.has(personKey)) {
        grouped.set(personKey, {
          key: personKey,
          label: personId ? `${row.personName} (${personId})` : row.personName,
          entries: 0,
          rolesCount: 0,
          tenuresCount: 0,
          dateCount: 0,
          contactCompleteness: 0,
          score: 0,
        });
      }
      const entry = grouped.get(personKey);
      entry.entries += parsed.entries;
      entry.rolesCount = Math.max(entry.rolesCount, parsed.rolesCount);
      entry.tenuresCount = Math.max(entry.tenuresCount, parsed.tenuresCount);
      entry.dateCount = Math.max(entry.dateCount, parsed.dateCount);
      entry.contactCompleteness = Math.max(entry.contactCompleteness, parsed.contactCompleteness);
      entry.score += parsed.score;
    });
    return Array.from(grouped.values()).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.entries !== a.entries) return b.entries - a.entries;
      return a.label.localeCompare(b.label, "en", { sensitivity: "base" });
    });
  }, [selectedDrilldown, venuePersonRows]);
  const comparablePersonKeys = useMemo(
    () => comparablePersons.map((entry) => entry.key),
    [comparablePersons],
  );
  const comparablePersonMap = useMemo(
    () => new Map(comparablePersons.map((entry) => [entry.key, entry])),
    [comparablePersons],
  );
  const normalizedPersonCompareLeft = comparablePersonKeys.includes(comparePersonLeft)
    ? comparePersonLeft
    : (comparablePersonKeys[0] || "");
  const lowestPerformerKey = comparablePersons.length > 1
    ? comparablePersons[comparablePersons.length - 1].key
    : "";
  const normalizedPersonCompareRight = (
    comparablePersonKeys.includes(comparePersonRight) && comparePersonRight !== normalizedPersonCompareLeft
  )
    ? comparePersonRight
    : (
      (lowestPerformerKey && lowestPerformerKey !== normalizedPersonCompareLeft
        ? lowestPerformerKey
        : comparablePersonKeys.find((key) => key !== normalizedPersonCompareLeft)) || ""
    );
  const canShowPersonCompare = Boolean(
    selectedDrilldown?.venueName && comparablePersonKeys.length >= 2,
  );
  const leftPersonCompareSummary = useMemo(
    () => (normalizedPersonCompareLeft ? comparablePersonMap.get(normalizedPersonCompareLeft) : null),
    [comparablePersonMap, normalizedPersonCompareLeft],
  );
  const rightPersonCompareSummary = useMemo(
    () => (normalizedPersonCompareRight ? comparablePersonMap.get(normalizedPersonCompareRight) : null),
    [comparablePersonMap, normalizedPersonCompareRight],
  );
  const personComparisonRows = useMemo(() => {
    if (!leftPersonCompareSummary || !rightPersonCompareSummary) return [];
    const metrics = [
      {
        key: "personScore",
        label: "Performance Score",
        leftValue: leftPersonCompareSummary.score,
        rightValue: rightPersonCompareSummary.score,
      },
      {
        key: "personEntries",
        label: "Involvement Entries",
        leftValue: leftPersonCompareSummary.entries,
        rightValue: rightPersonCompareSummary.entries,
      },
      {
        key: "personRoles",
        label: "Roles Covered",
        leftValue: leftPersonCompareSummary.rolesCount,
        rightValue: rightPersonCompareSummary.rolesCount,
      },
      {
        key: "personTenures",
        label: "Tenure Bands",
        leftValue: leftPersonCompareSummary.tenuresCount,
        rightValue: rightPersonCompareSummary.tenuresCount,
      },
      {
        key: "personContact",
        label: "Contact Completeness",
        leftValue: leftPersonCompareSummary.contactCompleteness,
        rightValue: rightPersonCompareSummary.contactCompleteness,
      },
      {
        key: "personDates",
        label: "Dates Captured",
        leftValue: leftPersonCompareSummary.dateCount,
        rightValue: rightPersonCompareSummary.dateCount,
      },
    ];
    return metrics.map((metric) => ({
      ...metric,
      diff: Number(metric.leftValue) - Number(metric.rightValue),
    }));
  }, [leftPersonCompareSummary, rightPersonCompareSummary]);

  const options = result?.filterOptions || {};

  const filteredOptions = useMemo(() => {
    if (!result) return options;
    const records = result.regionCategoryVenuePersonDrilldown || [];
    if (!records.length) return options;

    const getUnique = (targetKey, parentKey, parentValue) => {
      const filtered = parentValue 
        ? records.filter(r => String(r[parentKey] || "").trim() === String(parentValue).trim())
        : records;
      return [...new Set(filtered.map(r => r[targetKey]).filter(Boolean))].sort();
    };

    return {
      ...options,
      // If a region is selected, only show states belonging to that region
      states: filters.region ? getUnique('state', 'region', filters.region) : options.states,
      // If state is selected, only show cities in that state. If only region, show all cities in that region.
      examCityCentres: filters.state 
        ? getUnique('city', 'state', filters.state) 
        : (filters.region ? getUnique('city', 'region', filters.region) : options.examCityCentres),
      // Filter projects based on geography
      projects: filters.state
        ? getUnique('projectName', 'state', filters.state)
        : (filters.region ? getUnique('projectName', 'region', filters.region) : options.projects),
    };
  }, [result, options, filters.region, filters.state]);

  const sidebarFilterOptions = useMemo(() => {
    const venueRows = Array.isArray(result?.regionCategoryVenueDrilldown) ? result.regionCategoryVenueDrilldown : [];
    const uniqueSorted = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "en", { sensitivity: "base" }));
    return {
      region: filteredOptions.regions || [],
      state: filteredOptions.states || [],
      examCityCentre: filteredOptions.examCityCentres || [],
      projectName: filteredOptions.projects || [],
      projectMonth: filteredOptions.projectMonths || [],
      category: uniqueSorted(venueRows.map((row) => row.category)),
      status: uniqueSorted(venueRows.map((row) => row.status)),
      examWise: [],
      roles: filteredOptions.roles || [],
      documents: [],
      venueType: uniqueSorted(venueRows.map((row) => row.venueType)),
    };
  }, [filteredOptions, result]);

  const sidebarSelectedFilters = useMemo(() => ({
    region: filters.region ? [filters.region] : [],
    state: filters.state ? [filters.state] : [],
    examCityCentre: filters.examCityCentre ? [filters.examCityCentre] : [],
    projectName: filters.project ? [filters.project] : [],
    projectMonth: [],
    category: sidebarVenueFilters.category ? [sidebarVenueFilters.category] : [],
    status: sidebarVenueFilters.status ? [sidebarVenueFilters.status] : [],
    examWise: [],
    roles: filters.role ? [filters.role] : [],
    documents: [],
    venueType: sidebarVenueFilters.venueType ? [sidebarVenueFilters.venueType] : [],
  }), [filters, sidebarVenueFilters]);

  const handleSidebarToggleFilter = useCallback((key, value) => {
    if (key === "region") {
      updateFilter("region", filters.region === value ? "" : value);
      return;
    }
    if (key === "state") {
      updateFilter("state", filters.state === value ? "" : value);
      return;
    }
    if (key === "examCityCentre") {
      updateFilter("examCityCentre", filters.examCityCentre === value ? "" : value);
      return;
    }
    if (key === "projectName") {
      updateFilter("project", filters.project === value ? "" : value);
      return;
    }
    if (key === "roles") {
      updateFilter("role", filters.role === value ? "" : value);
      return;
    }
    if (key === "status" || key === "category" || key === "venueType") {
      setSidebarVenueFilters((prev) => ({
        ...prev,
        [key]: prev[key] === value ? "" : value,
      }));
      setTimeout(() => runQuery(), 0);
    }
  }, [filters, updateFilter, runQuery]);

  const handleSidebarSelectAll = useCallback((key) => {
    if (key === "region") updateFilter("region", "");
    if (key === "state") updateFilter("state", "");
    if (key === "examCityCentre") updateFilter("examCityCentre", "");
    if (key === "projectName") updateFilter("project", "");
    if (key === "roles") updateFilter("role", "");
    if (key === "status" || key === "category" || key === "venueType") {
      setSidebarVenueFilters((prev) => ({ ...prev, [key]: "" }));
      setTimeout(() => runQuery(), 0);
    }
  }, [updateFilter, runQuery]);

  const handleSidebarClearAll = useCallback((key) => {
    handleSidebarSelectAll(key);
  }, [handleSidebarSelectAll]);

  function updateFilter(key, value) {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "region") {
        next.state = "";
        next.examCityCentre = "";
      } else if (key === "state") {
        next.examCityCentre = "";
      }
      return next;
    });

    // Auto-run query for geographic changes to keep UI and options in sync
    if (key === "region" || key === "state" || key === "examCityCentre") {
       setTimeout(() => runQuery(), 0);
    }
  }

  const handleResetFilters = () => {
    setSearch("");
    setFocusEmpId("");
    setFocusPersonName("");
    setEmployeeTypes([...EMPLOYEE_TYPES]);
    setDateMode(DATE_MODES.all);
    setDateFrom("");
    setDateTo("");
    setFilters({ ...DEFAULT_FILTERS });
    setSidebarVenueFilters({ status: "", category: "", venueType: "" });
    setSelectedDrilldown(null);
    setSelectedManpowerDrilldown(null);
    setStateCompareOpen(false);
    setCompareStateLeft("");
    setCompareStateRight("");
    setCityCompareOpen(false);
    setCompareCityLeft("");
    setCompareCityRight("");
    setVenueCompareOpen(false);
    setCompareVenueLeft("");
    setCompareVenueRight("");
    setPersonCompareOpen(false);
    setComparePersonLeft("");
    setComparePersonRight("");
    setSelectedCategoryCallLog("");
    setSelectedTrendVenue(null);
    setStateCompareSelection({ leftState: "", rightState: "" });
    runQuery({
      search: "",
      employeeTypes: [...EMPLOYEE_TYPES],
      projects: [],
      employees: [],
      tenure: [],
      roles: [],
      regions: [],
      states: [],
      examCityCentres: [],
      statuses: [],
      categories: [],
      venueTypes: [],
    });
  };

  const handleBackToSearchResults = () => {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(
          "vms_global_search_restore",
          JSON.stringify({
            query: returnToGlobalSearchQuery,
            openModal: true,
          }),
        );
        sessionStorage.removeItem("vms_manpower_return_global_search");
      } catch {
        // Ignore storage failures and continue navigation.
      }
    }
    goTo("dashboard");
  };

  if (busy && !result) {
    return (
      <div className="loading-screen">
        <div className="loader" />
        <p>Loading manpower data... (this may take up to 30 seconds)</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        filterOptions={sidebarFilterOptions}
        selectedFilters={sidebarSelectedFilters}
        onToggleFilter={handleSidebarToggleFilter}
        onSelectAll={handleSidebarSelectAll}
        onClearAll={handleSidebarClearAll}
        onResetAll={handleResetFilters}
        globalSearchConfig={{
          placeholder: "Search manpower by name or ID and press Search",
          onSearch: (query) => {
            const normalized = String(query || "").trim();
            setSearch(normalized);
            setFocusEmpId("");
            setFocusPersonName("");
            runQuery({
              search: normalized,
              focusEmpId: "",
              personName: "",
              employeeTypes,
              projects: filters.project ? [filters.project] : [],
              employees: filters.employee ? [filters.employee] : [],
              tenure: filters.tenure ? [filters.tenure] : [],
              roles: filters.role ? [filters.role] : [],
              regions: filters.region ? [filters.region] : [],
              states: filters.state ? [filters.state] : [],
              examCityCentres: filters.examCityCentre ? [filters.examCityCentre] : [],
              statuses: sidebarVenueFilters.status ? [sidebarVenueFilters.status] : [],
              categories: sidebarVenueFilters.category ? [sidebarVenueFilters.category] : [],
              venueTypes: sidebarVenueFilters.venueType ? [sidebarVenueFilters.venueType] : [],
              dateFrom: dateMode === DATE_MODES.custom ? dateFrom : "",
              dateTo: dateMode === DATE_MODES.custom ? dateTo : "",
            });
          },
          resolve: () => [],
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

    <div className="mp-page">
      <div className="dashboard-top-shell mp-dashboard-top-shell">
      <div className="mp-header">
        <div className="mp-header-left">
          <h1 className="mp-title">Manpower Dashboard</h1>
        </div>
        <div className="mp-header-right">
          <div className="dash-logo mp-dash-logo">
            <img src="/logo.png" alt="DEXIT Global" className="dash-logo-img mp-logo-img" />
          </div>
          <div className="mp-header-actions">
            {returnToGlobalSearchQuery ? (
              <button className="mp-back-small-btn is-active" onClick={handleBackToSearchResults}>
                Back to Search Results
              </button>
            ) : null}
            <button className="mp-back-btn" onClick={() => goTo("dashboard")}>
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>

      <section className="mp-metrics-section">
        <h2>Overall Metrics</h2>

        <div className="mp-kpi-grid">
          {kpiCards.map((card) => {
            return (
              <div 
                key={card.key} 
                data-tooltip="Click to drill down"
                className={`mp-kpi-card mp-kpi-clickable${drilldownPath.metric === card.key ? ' active' : ''}`} 
                style={{ "--card-color": card.color }}
                onClick={() => {
                  if (drilldownPath.metric === card.key) resetDrilldown();
                  else {
                    setDrilldownPath({ metric: card.key, region: null, state: null, district: null, city: null, venue: null });
                    document.getElementById("mp-drilldown-section")?.scrollIntoView({ behavior: "smooth" });
                  }
                }}
              >
                <div className="mp-kpi-title">
                  {card.title}
                </div>
                <div className="mp-kpi-value">{formatCount(card.value)}</div>
              </div>
            );
          })}
        </div>
      </section>
      </div>



      {error ? <div className="inline-error">{error}</div> : null}
      {busy ? <div className="mp-busy">Updating dashboard...</div> : null}

      {canViewPerformanceRankings ? (
        <section className="mp-performance-section">
          <div className="mp-performance-head">
            <h3 className="section-title">
              Performance Analytics
              {performanceRankings?.scope === "top10" ? " - Top 10" : ""}
              {performanceRankings?.scope === "top25" ? " - Top 25" : ""}
              {performanceRankings?.scope === "full" ? " - Full List" : ""}
            </h3>
            <div className="mp-performance-tabs">
              <button
                className={`mp-action-btn${performanceView === "manpower" ? " mp-action-btn-primary" : ""}`}
                onClick={() => setPerformanceView("manpower")}
              >
                Manpower
              </button>
              <button
                className={`mp-action-btn${performanceView === "venues" ? " mp-action-btn-primary" : ""}`}
                onClick={() => setPerformanceView("venues")}
              >
                Venues
              </button>
              <button
                className={`mp-action-btn${performanceView === "projects" ? " mp-action-btn-primary" : ""}`}
                onClick={() => setPerformanceView("projects")}
              >
                Projects
              </button>
            </div>
          </div>
          <div className="mp-performance-scopes">
            <button
              className={`mp-action-btn${performanceScope === "top10" ? " mp-action-btn-primary" : ""}`}
              onClick={() => setPerformanceScope("top10")}
            >
              Top 10
            </button>
            <button
              className={`mp-action-btn${performanceScope === "top25" ? " mp-action-btn-primary" : ""}`}
              onClick={() => setPerformanceScope("top25")}
            >
              Top 25
            </button>
            <button
              className={`mp-action-btn${performanceScope === "full" ? " mp-action-btn-primary" : ""}`}
              onClick={() => setPerformanceScope("full")}
            >
              Full
            </button>
            <span className="mp-performance-count">
              Manpower: {formatCount(performanceRankings?.totals?.manpower || 0)} | Venues: {formatCount(performanceRankings?.totals?.venues || 0)} | Projects: {formatCount(performanceRankings?.totals?.projects || 0)}
            </span>
          </div>
          {performanceError ? <div className="inline-error">{performanceError}</div> : null}

          {performanceView === "manpower" ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Person</th>
                    <th>Employee ID</th>
                    <th>Venue Coverage</th>
                    <th>Total Batches</th>
                    <th>No Delay</th>
                    <th>Call Logs</th>
                  </tr>
                </thead>
                <tbody>
                  {performanceBusy ? (
                    <tr>
                      <td colSpan={7}>Loading performance rankings...</td>
                    </tr>
                  ) : manpowerPerformanceRows.length ? (
                    manpowerPerformanceRows.map((row, index) => {
                      const personKey = buildPerformancePersonKey(row, index);
                      const isExpanded = expandedProfilePersonKey === personKey;
                      return (
                        <Fragment key={`perf-manpower-${personKey}`}>
                          <tr>
                            <td>{index + 1}</td>
                            <td>
                              <button
                                type="button"
                                className={`mp-person-name-btn${isExpanded ? " is-open" : ""}`}
                                onClick={() => togglePerformancePersonProfile(row, index)}
                              >
                                {row.personName || "Unknown"}
                              </button>
                            </td>
                            <td>{row.empId || "-"}</td>
                            <td>{formatCount(row.venueCoverage || 0)}</td>
                            <td>{formatCount(row.totalBatches)}</td>
                            <td>{formatCount(row.noDelay)}</td>
                            <td>{formatCount(row.callLogs)}</td>
                          </tr>
                          {isExpanded ? (
                            <tr className="mp-profile-row">
                              <td colSpan={7}>
                                <ManpowerProfileCard
                                  row={row}
                                  sourceRows={result?.manpowerWiseEmployeeRotationDrilldown || []}
                                  onClose={() => setExpandedProfilePersonKey("")}
                                />
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7}>No manpower performance data available.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : null}

          {performanceView === "venues" ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Venue</th>
                    <th>DMS Code</th>
                    <th>Unique Manpower</th>
                    <th>Total No Delay</th>
                    <th>Call Logs</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {performanceBusy ? (
                    <tr>
                      <td colSpan={7}>Loading performance rankings...</td>
                    </tr>
                  ) : venuePerformanceRows.length ? (
                    venuePerformanceRows.map((row, index) => (
                      <tr key={`perf-venue-${row.dmsCode}-${index}`}>
                        <td>{index + 1}</td>
                        <td>{row.venueName || "-"}</td>
                        <td>{row.dmsCode || "-"}</td>
                        <td>{formatCount(row.uniqueManpower || 0)}</td>
                        <td>{formatCount(row.noBatchDelay || 0)}</td>
                        <td>{formatCount(row.callLogs || 0)}</td>
                        <td>
                          <button className="mp-cell-mini-btn" onClick={() => openVenueDetail(row.dmsCode)} title="View venue details">
                            Open
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7}>No venue performance data available.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : null}

          {performanceView === "projects" ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Project</th>
                    <th>Drive Count</th>
                    <th>Unique Manpower</th>
                    <th>No Delay</th>
                    <th>Call Logs</th>
                  </tr>
                </thead>
                <tbody>
                  {performanceBusy ? (
                    <tr>
                      <td colSpan={6}>Loading performance rankings...</td>
                    </tr>
                  ) : projectPerformanceRows.length ? (
                    projectPerformanceRows.map((row, index) => (
                      <tr key={`perf-project-${row.projectName}-${index}`}>
                        <td>{index + 1}</td>
                        <td>{row.projectName || "-"}</td>
                        <td>{formatCount(row.driveCount || 0)}</td>
                        <td>{formatCount(row.uniqueManpower || 0)}</td>
                        <td>{formatCount(row.noBatchDelay || 0)}</td>
                        <td>{formatCount(row.callLogs || 0)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6}>No project performance data available.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      {drilldownPath.metric ? (
        <section className="kpi-drilldown-section" id="mp-drilldown-section">
          <div className="drilldown-title-row">
            <div>
              <h3>
                {kpiCards.find(c => c.key === drilldownPath.metric)?.title} Breakdown
              </h3>
              <Breadcrumbs 
                path={drilldownPath} 
                onPop={popDrilldown} 
                onReset={resetDrilldown} 
                kpiTitle={kpiCards.find(c => c.key === drilldownPath.metric)?.title}
              />
            </div>
            <button className="kpi-drilldown-close" onClick={resetDrilldown}>✕ Close</button>
          </div>

          <div className="kpi-drilldown-body">
            {drilldownPath.venue ? (
              <div className="kpi-drilldown-end">
                <h4 className="section-title" style={{ marginTop: 0 }}>
                  Manpower Details for {drilldownPath.venue}
                </h4>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Employee ID</th>
                        <th>Name</th>
                        <th>Role</th>
                        <th>Tenure</th>
                        <th>Value ({drilldownPath.metric})</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drilldownManpowerRows.length > 0 ? (
                        drilldownManpowerRows.map((row, idx) => (
                          <tr key={idx}>
                            <td>{row.empId}</td>
                            <td>{row.personName}</td>
                            <td>{row.role}</td>
                            <td>{row.tenure}</td>
                            <td>{formatCount(row.value)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5}>No detailed data found for this venue and metric.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : activeDrilldownChartData.length > 0 ? (
              <div className="kpi-drilldown-chart">
                <div style={{ marginBottom: '10px', fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
                  Click a bar to drill deeper 
                    {drilldownPath.region ? (drilldownPath.state ? (drilldownPath.district ? (drilldownPath.city ? ' into Venue' : ' into City') : ' into District') : ' into State') : ' into Region'}
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
                        else if (!drilldownPath.venue) pushDrilldown('venue', name);
                      }
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dde6ef" />
                    <XAxis dataKey="name" tick={{ fill: "#475569", fontSize: 12 }} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 12 }} />
                    <RechartsTooltip formatter={(value) => formatCount(value)} />
                    <Bar 
                      dataKey="value" 
                      fill={kpiCards.find(c => c.key === drilldownPath.metric)?.color || "#3f7fdd"} 
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
                          else if (!drilldownPath.venue) pushDrilldown('venue', name);
                        }
                      }}
                    >
                      <LabelList dataKey="value" position="top" style={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} formatter={(val) => val > 0 ? formatCount(val) : ''} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="mp-drilldown-end-msg">
                Showing all data for {drilldownPath.state || drilldownPath.region || 'Total'}
              </div>
            )}
          </div>
        </section>
      ) : null}

      {selectedDrilldown ? (
        <>
          <div className="mp-table-head-row">
            <h3 className="section-title">
              {selectedDrilldown.region} Region vs {selectedDrilldown.category} Category Manpower Details
              {selectedDrilldown.state ? ` for ${selectedDrilldown.state} State` : ""}
              {selectedDrilldown.city ? ` and ${selectedDrilldown.city} City` : ""}
              {selectedDrilldown.venueName ? ` in ${selectedDrilldown.venueName} Venue` : ""}
            </h3>
            <div className="mp-table-actions">
              {selectedDrilldown.venueName ? (
                <button
                  className="mp-back-small-btn"
                  onClick={() => {
                    setPersonCompareOpen(false);
                    setComparePersonLeft("");
                    setComparePersonRight("");
                    setSelectedPersonDrilldown(null);
                    setSelectedDrilldown((prev) => (prev ? { ...prev, venueName: "", dmsCode: "" } : prev));
                  }}
                >
                  Back to Venues
                </button>
              ) : null}
              {selectedDrilldown.city ? (
                <button
                  className="mp-back-small-btn"
                  onClick={() => {
                    setVenueCompareOpen(false);
                    setCompareVenueLeft("");
                    setCompareVenueRight("");
                    setSelectedPersonDrilldown(null);
                    setSelectedDrilldown((prev) => (prev ? { ...prev, district: "", city: "", venueName: "", dmsCode: "" } : prev));
                  }}
                >
                  Back to Centre Cities
                </button>
              ) : null}
              {selectedDrilldown.state && !selectedDrilldown.city ? (
                <button
                  className="mp-back-small-btn"
                  onClick={() => {
                    setCityCompareOpen(false);
                    setCompareCityLeft("");
                    setCompareCityRight("");
                    setSelectedPersonDrilldown(null);
                    setSelectedDrilldown((prev) =>
                      (prev ? { ...prev, state: "", district: "", city: "", venueName: "", dmsCode: "" } : prev),
                    );
                  }}
                >
                  Back to States
                </button>
              ) : null}
              {canShowStateCompare ? (
                <button
                  className="mp-back-small-btn"
                  onClick={() =>
                    setStateCompareOpen((prev) => {
                      const next = !prev;
                      if (next) {
                        const left = comparableStates[0] || "";
                        const right = comparableStates.find((state) => state !== left) || "";
                        setCompareStateLeft(left);
                        setCompareStateRight(right);
                      }
                      return next;
                    })
                  }
                >
                  {stateCompareOpen ? "Hide State Compare" : "Compare States"}
                </button>
              ) : null}
              {canShowCityCompare ? (
                <button
                  className="mp-back-small-btn"
                  onClick={() =>
                    setCityCompareOpen((prev) => {
                      const next = !prev;
                      if (next) {
                        const left = comparableCityKeys[0] || "";
                        const right = comparableCityKeys.find((key) => key !== left) || "";
                        setCompareCityLeft(left);
                        setCompareCityRight(right);
                      }
                      return next;
                    })
                  }
                >
                  {cityCompareOpen ? "Hide City Compare" : "Compare 2 Centre Cities"}
                </button>
              ) : null}
              {canShowVenueCompare ? (
                <button
                  className="mp-back-small-btn"
                  onClick={() =>
                    setVenueCompareOpen((prev) => {
                      const next = !prev;
                      if (next) {
                        const left = comparableVenueKeys[0] || "";
                        const right = comparableVenueKeys.find((key) => key !== left) || "";
                        setCompareVenueLeft(left);
                        setCompareVenueRight(right);
                      }
                      return next;
                    })
                  }
                >
                  {venueCompareOpen ? "Hide Venue Compare" : "Compare 2 Venues"}
                </button>
              ) : null}
              {canShowPersonCompare ? (
                <button
                  className="mp-back-small-btn"
                  onClick={() =>
                    setPersonCompareOpen((prev) => {
                      const next = !prev;
                      if (next) {
                        const best = comparablePersonKeys[0] || "";
                        const lower = (comparablePersons[comparablePersons.length - 1]?.key || "");
                        const fallback = comparablePersonKeys.find((key) => key !== best) || "";
                        setComparePersonLeft(best);
                        setComparePersonRight(lower && lower !== best ? lower : fallback);
                      }
                      return next;
                    })
                  }
                >
                  {personCompareOpen ? "Hide Performer Compare" : "Compare Performers"}
                </button>
              ) : null}
              <button
                className="mp-back-small-btn"
                onClick={() => {
                  setStateCompareOpen(false);
                  setCompareStateLeft("");
                  setCompareStateRight("");
                  setCityCompareOpen(false);
                  setCompareCityLeft("");
                  setCompareCityRight("");
                  setVenueCompareOpen(false);
                  setCompareVenueLeft("");
                  setCompareVenueRight("");
                  setPersonCompareOpen(false);
                  setComparePersonLeft("");
                  setComparePersonRight("");
                  setSelectedPersonDrilldown(null);
                  setSelectedDrilldown(null);
                }}
              >
                Back
              </button>
            </div>
          </div>

          {!selectedDrilldown.venueName && selectedDrilldownChartData.length > 0 && (
            <div className="mp-kpi-drilldown-chart-wrap" style={{ marginBottom: '24px', background: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid #dde6ef' }}>
              <div style={{ marginBottom: '10px', fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
                Click a bar to drill deeper into 
                {selectedDrilldown.state ? (selectedDrilldown.city ? 'Venues' : 'Centre Cities') : 'States'}
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={selectedDrilldownChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dde6ef" />
                  <XAxis dataKey="name" tick={{ fill: "#475569", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 11 }} />
                  <RechartsTooltip formatter={(value) => formatCount(value)} />
                  <Bar 
                    dataKey="value" 
                    fill="#3f7fdd" 
                    radius={[4, 4, 0, 0]}
                    style={{ cursor: 'pointer' }}
                    onClick={(data) => {
                      if (data && data.name) {
                        if (!selectedDrilldown.state) {
                          setSelectedDrilldown(prev => ({ ...prev, state: data.name }));
                        } else if (!selectedDrilldown.city) {
                          const [dist, city] = data.name.split(' / ');
                          setSelectedDrilldown(prev => ({ ...prev, district: dist, city: city }));
                        } else if (!selectedDrilldown.venueName) {
                          setSelectedDrilldown(prev => ({ ...prev, venueName: data.name }));
                        }
                      }
                    }}
                  >
                    <LabelList dataKey="value" position="top" style={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }} formatter={(val) => val > 0 ? formatCount(val) : ''} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {selectedDrilldown.venueName ? (
            <>
              <RegionCategoryVenuePersonTable
                rows={venuePersonRows}
                selectedPersonKey={selectedPersonDrilldown?.personKey || ""}
                onPersonClick={(row, personKey) => {
                  setSelectedPersonDrilldown((prev) =>
                    prev?.personKey === personKey
                      ? null
                      : {
                          personKey,
                          personName: row.personName || "",
                          venueName: row.venueName || selectedDrilldown.venueName || "",
                        },
                  );
                }}
              />
              {selectedPersonDrilldown ? (
                <>
                  <div className="mp-table-head-row">
                    <h3 className="section-title">
                      Person Drilldown: {selectedPersonDrilldown.personName}
                    </h3>
                    <div className="mp-table-actions">
                      <button className="mp-back-small-btn" onClick={() => setSelectedPersonDrilldown(null)}>
                        Back to Person List
                      </button>
                    </div>
                  </div>
                  <VenuePersonDrilldownPanel selectedPerson={selectedPersonDrilldown} rows={selectedVenuePersonRows} />
                </>
              ) : null}
              {canShowPersonCompare && personCompareOpen ? (
                <div className="mp-state-compare-panel">
                  <div className="mp-state-compare-controls">
                    <div className="mp-select-wrap">
                      <label>Performer 1</label>
                      <select value={normalizedPersonCompareLeft} onChange={(event) => setComparePersonLeft(event.target.value)}>
                        {comparablePersons.map((person) => (
                          <option key={`left-person-${person.key}`} value={person.key}>
                            {person.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mp-select-wrap">
                      <label>Performer 2</label>
                      <select value={normalizedPersonCompareRight} onChange={(event) => setComparePersonRight(event.target.value)}>
                        {comparablePersons.map((person) => (
                          <option key={`right-person-${person.key}`} value={person.key}>
                            {person.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {normalizedPersonCompareLeft && normalizedPersonCompareRight && normalizedPersonCompareLeft !== normalizedPersonCompareRight && leftPersonCompareSummary && rightPersonCompareSummary ? (
                    <>
                      <h3 className="section-title">Best vs Lower Performer Comparison</h3>
                      <StateComparisonTable
                        leftLabel={leftPersonCompareSummary.label}
                        rightLabel={rightPersonCompareSummary.label}
                        rows={personComparisonRows}
                        emptyMessage="Select two different performers to compare."
                      />
                    </>
                  ) : (
                    <div className="inline-error">Please select two different performers for comparison.</div>
                  )}
                </div>
              ) : null}
            </>
          ) : selectedDrilldown.city ? (
            <>
              <RegionCategoryVenueDrilldownTable
                rows={venueDrilldownRows}
                onManpowerClick={(row) => {
                  setVenueCompareOpen(false);
                  setCompareVenueLeft("");
                  setCompareVenueRight("");
                  setSelectedPersonDrilldown(null);
                  setSelectedDrilldown((prev) =>
                    (prev
                      ? { ...prev, venueName: row.venueName, dmsCode: row.dmsCode }
                      : prev),
                  );
                }}
              />
              {canShowVenueCompare && venueCompareOpen ? (
                <div className="mp-state-compare-panel">
                  <div className="mp-state-compare-controls">
                    <div className="mp-select-wrap">
                      <label>Venue 1</label>
                      <select value={normalizedVenueCompareLeft} onChange={(event) => setCompareVenueLeft(event.target.value)}>
                        {comparableVenues.map((venue) => (
                          <option key={`left-venue-${venue.key}`} value={venue.key}>
                            {venue.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mp-select-wrap">
                      <label>Venue 2</label>
                      <select value={normalizedVenueCompareRight} onChange={(event) => setCompareVenueRight(event.target.value)}>
                        {comparableVenues.map((venue) => (
                          <option key={`right-venue-${venue.key}`} value={venue.key}>
                            {venue.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {normalizedVenueCompareLeft && normalizedVenueCompareRight && normalizedVenueCompareLeft !== normalizedVenueCompareRight && leftVenueCompareSummary && rightVenueCompareSummary ? (
                    <>
                      <h3 className="section-title">Venue Comparison</h3>
                      <StateComparisonTable
                        leftLabel={comparableVenueMap.get(normalizedVenueCompareLeft)?.label || "Venue 1"}
                        rightLabel={comparableVenueMap.get(normalizedVenueCompareRight)?.label || "Venue 2"}
                        rows={venueComparisonRows}
                        emptyMessage="Select two different venues to compare."
                      />
                    </>
                  ) : (
                    <div className="inline-error">Please select two different venues for comparison.</div>
                  )}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <RegionCategoryDrilldownTable
                rows={drilldownRows}
                selectedState={selectedDrilldown.state}
                selectedCity={selectedDrilldown.city}
                onStateClick={(state) => {
                  setStateCompareOpen(false);
                  setCompareStateLeft("");
                  setCompareStateRight("");
                  setCityCompareOpen(false);
                  setCompareCityLeft("");
                  setCompareCityRight("");
                  setVenueCompareOpen(false);
                  setCompareVenueLeft("");
                  setCompareVenueRight("");
                  setPersonCompareOpen(false);
                  setComparePersonLeft("");
                  setComparePersonRight("");
                  setSelectedPersonDrilldown(null);
                  setSelectedDrilldown((prev) =>
                    (prev ? { ...prev, state, district: "", city: "", venueName: "", dmsCode: "" } : prev),
                  );
                }}
                onCityClick={(district, city) => {
                  setCityCompareOpen(false);
                  setCompareCityLeft("");
                  setCompareCityRight("");
                  setVenueCompareOpen(false);
                  setCompareVenueLeft("");
                  setCompareVenueRight("");
                  setPersonCompareOpen(false);
                  setComparePersonLeft("");
                  setComparePersonRight("");
                  setSelectedPersonDrilldown(null);
                  setSelectedDrilldown((prev) =>
                    (prev ? { ...prev, district, city, venueName: "", dmsCode: "" } : prev),
                  );
                }}
              />
              {canShowStateCompare && stateCompareOpen ? (
                <div className="mp-state-compare-panel">
                  <div className="mp-state-compare-controls">
                    <div className="mp-select-wrap">
                      <label>State 1</label>
                      <select value={normalizedCompareLeft} onChange={(event) => setCompareStateLeft(event.target.value)}>
                        {comparableStates.map((state) => (
                          <option key={`left-${state}`} value={state}>
                            {state}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mp-select-wrap">
                      <label>State 2</label>
                      <select value={normalizedCompareRight} onChange={(event) => setCompareStateRight(event.target.value)}>
                        {comparableStates.map((state) => (
                          <option key={`right-${state}`} value={state}>
                            {state}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {normalizedCompareLeft && normalizedCompareRight && normalizedCompareLeft !== normalizedCompareRight && leftCompareSummary && rightCompareSummary ? (
                    <>
                      <h3 className="section-title">State Comparison</h3>
                      <StateComparisonTable
                        leftLabel={normalizedCompareLeft || "State 1"}
                        rightLabel={normalizedCompareRight || "State 2"}
                        rows={drilldownStateComparisonRows}
                        emptyMessage="Select two different states to compare."
                      />
                    </>
                  ) : (
                    <div className="inline-error">Please select two different states for comparison.</div>
                  )}
                </div>
              ) : null}
              {canShowCityCompare && cityCompareOpen ? (
                <div className="mp-state-compare-panel">
                  <div className="mp-state-compare-controls">
                    <div className="mp-select-wrap">
                      <label>Centre City 1</label>
                      <select value={normalizedCityCompareLeft} onChange={(event) => setCompareCityLeft(event.target.value)}>
                        {comparableCities.map((centreCity) => (
                          <option key={`left-city-${centreCity.key}`} value={centreCity.key}>
                            {centreCity.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mp-select-wrap">
                      <label>Centre City 2</label>
                      <select value={normalizedCityCompareRight} onChange={(event) => setCompareCityRight(event.target.value)}>
                        {comparableCities.map((centreCity) => (
                          <option key={`right-city-${centreCity.key}`} value={centreCity.key}>
                            {centreCity.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {normalizedCityCompareLeft && normalizedCityCompareRight && normalizedCityCompareLeft !== normalizedCityCompareRight && leftCityCompareSummary && rightCityCompareSummary ? (
                    <>
                      <h3 className="section-title">Centre City Comparison</h3>
                      <StateComparisonTable
                        leftLabel={formatCentreLabel(normalizedCityCompareLeft)}
                        rightLabel={formatCentreLabel(normalizedCityCompareRight)}
                        rows={cityComparisonRows}
                        emptyMessage="Select two different centre cities to compare."
                      />
                    </>
                  ) : (
                    <div className="inline-error">Please select two different centre cities for comparison.</div>
                  )}
                </div>
              ) : null}
            </>
          )}
        </>
      ) : (
        <>
          {!selectedManpowerDrilldown ? (
            <>
              <RegionMatrixSection
                title="Region vs Roles"
                rows={regionVsRolesMatrix.rows}
                buckets={regionVsRolesMatrix.buckets}
              />
              <RegionMatrixSection
                title="Region vs Tenure"
                rows={regionVsTenureMatrix.rows}
                buckets={regionVsTenureMatrix.buckets}
              />
              <RegionMatrixSection
                title="Outsource Manpower vs Tenure"
                rows={outsourceVsTenureMatrix.rows}
                buckets={outsourceVsTenureMatrix.buckets}
              />
              <RegionMatrixSection
                title="Owned Manpower vs Tenure"
                rows={ownedVsTenureMatrix.rows}
                buckets={ownedVsTenureMatrix.buckets}
              />
            </>
          ) : null}
          <h3 className="section-title">Region vs Category Manpower Details</h3>
          <div className="flex-table-row">
            <div className="half-col">
              <div className="chart-container" style={{ height: `${regionCategoryChartHeight}px`, minHeight: `${regionCategoryChartHeight}px`, width: "100%", background: "#fff", border: "1px solid #dde6ef", borderRadius: "12px", padding: "16px" }}>
                <ResponsiveContainer width="100%" height={Math.max(250, regionCategoryChartHeight - 32)}>
                  <BarChart 
                    data={regionCategoryChartRows} 
                    barSize={26}
                    barCategoryGap="26%"
                    maxBarSize={38}
                    margin={{ top: 26, right: 12, left: 4, bottom: 8 }}
                    onClick={(data) => {
                      if (data && data.activePayload && data.activePayload[0]) {
                        const region = data.activeLabel;
                        const category = data.activePayload[0].name; // A, B, C, etc.
                        setSelectedTrendVenue(null);
                        setStateCompareOpen(false);
                        setCompareStateLeft("");
                        setCompareStateRight("");
                        setCityCompareOpen(false);
                        setCompareCityLeft("");
                        setCompareCityRight("");
                        setVenueCompareOpen(false);
                        setCompareVenueLeft("");
                        setCompareVenueRight("");
                        setPersonCompareOpen(false);
                        setComparePersonRight("");
                        setSelectedCategoryCallLog("");
                        setStateCompareSelection({ leftState: "", rightState: "" });
                        setSelectedManpowerDrilldown(null);
                        setSelectedDrilldown({ region, category, state: "", district: "", city: "", venueName: "", dmsCode: "" });
                      }
                    }}
                  >
                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="region" tick={{ fill: "#64748b", fontSize: 13, fontWeight: 500 }} axisLine={false} tickLine={false} tickMargin={12} />
                    <YAxis
                      domain={[0, (max) => {
                        const numericMax = Number(max) || 0;
                        if (numericMax <= 0) return 10;
                        return Math.ceil(numericMax * 1.18 + 4);
                      }]}
                      tickFormatter={formatAxisTickCount}
                      width={58}
                      tick={{ fill: "#64748b", fontSize: 13, fontWeight: 500 }}
                      axisLine={false}
                      tickLine={false}
                      tickMargin={12}
                    />
                    <RechartsTooltip
                      cursor={{ fill: "rgba(241, 245, 249, 0.5)" }}
                      contentStyle={{
                        backgroundColor: "#ffffff",
                        borderRadius: "8px",
                        border: "1px solid #e2e8f0",
                        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)",
                        padding: "12px",
                      }}
                      itemStyle={{ fontSize: "13px", fontWeight: 500, padding: "2px 0" }}
                      labelStyle={{ fontSize: "13px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}
                      formatter={(value) => formatCount(value)}
                    />
                    <Legend verticalAlign="top" iconType="circle" wrapperStyle={{ paddingBottom: '20px', fontWeight: 500, fontSize: '13px', color: '#64748b' }} />
                    <Bar activeBar={false} dataKey="categoryAUniqueManpower" name="A" stackId="a" fill="#818cf8" />
                    <Bar activeBar={false} dataKey="categoryBUniqueManpower" name="B" stackId="a" fill="#38bdf8" />
                    <Bar activeBar={false} dataKey="categoryCUniqueManpower" name="C" stackId="a" fill="#fcd34d" />
                    <Bar activeBar={false} dataKey="categoryBlcUniqueManpower" name="BL-C (Blacklisted)" stackId="a" fill="#fdba74" />
                    <Bar activeBar={false} dataKey="categoryBlUniqueManpower" name="BL" stackId="a" fill="#fca5a5" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="half-col" ref={regionCategoryTableColRef}>
              <RegionCategoryTable
                rows={regionCategoryRows}
                onCellClick={(region, category) =>
                  {
                    setSelectedTrendVenue(null);
                    setStateCompareOpen(false);
                    setCompareStateLeft("");
                    setCompareStateRight("");
                    setCityCompareOpen(false);
                    setCompareCityLeft("");
                    setCompareCityRight("");
                    setVenueCompareOpen(false);
                    setCompareVenueLeft("");
                    setCompareVenueRight("");
                    setPersonCompareOpen(false);
                    setComparePersonLeft("");
                    setComparePersonRight("");
                    setSelectedCategoryCallLog("");
                    setStateCompareSelection({ leftState: "", rightState: "" });
                    setSelectedManpowerDrilldown(null);
                    setSelectedDrilldown({ region, category, state: "", district: "", city: "", venueName: "", dmsCode: "" });
                  }
                }
              />
            </div>
          </div>
          {selectedManpowerDrilldown ? (
            <>
              <div className="mp-table-head-row">
                <h3 className="section-title">
                  {selectedManpowerDrilldown.region} Region {selectedManpowerDrilldown.workforceType} Manpower Details
                  {selectedManpowerDrilldown.state ? ` for ${selectedManpowerDrilldown.state} State` : ""}
                  {selectedManpowerDrilldown.tenure ? ` | Tenure: ${selectedManpowerDrilldown.tenure}` : ""}
                  {selectedManpowerDrilldown.role ? ` | Role: ${selectedManpowerDrilldown.role}` : ""}
                  {selectedManpowerDrilldown.venueName ? ` | Venue: ${selectedManpowerDrilldown.venueName}` : ""}
                </h3>
                <div className="mp-table-actions">
                  {selectedManpowerDrilldown.venueName ? (
                    <button
                      className="mp-back-small-btn"
                      onClick={() =>
                        {
                          setSelectedTrendVenue(null);
                          setSelectedManpowerDrilldown((prev) =>
                            (prev ? { ...prev, venueName: "", dmsCode: "" } : prev),
                          );
                        }
                      }
                    >
                      Back to Venues
                    </button>
                  ) : null}
                  {selectedManpowerDrilldown.tenure && !selectedManpowerDrilldown.venueName ? (
                    <button
                      className="mp-back-small-btn"
                      onClick={() =>
                        {
                          setSelectedTrendVenue(null);
                          setSelectedManpowerDrilldown((prev) =>
                            (prev ? { ...prev, tenure: "", role: "", venueName: "", dmsCode: "" } : prev),
                          );
                        }
                      }
                    >
                      Back to Tenure / Role
                    </button>
                  ) : null}
                  {selectedManpowerDrilldown.state && !selectedManpowerDrilldown.tenure ? (
                    <button
                      className="mp-back-small-btn"
                      onClick={() =>
                        {
                          setSelectedTrendVenue(null);
                          setSelectedManpowerDrilldown((prev) =>
                            (prev ? { ...prev, state: "", tenure: "", role: "", venueName: "", dmsCode: "" } : prev),
                          );
                        }
                      }
                    >
                      Back to Spread
                    </button>
                  ) : null}
                  <button
                    className="mp-back-small-btn"
                    disabled={manpowerStateCompareOptions.length < 2}
                    onClick={() => {
                      setStateCompareOpen((prev) => !prev);
                      if (stateCompareOpen) {
                        setStateCompareSelection({ leftState: "", rightState: "" });
                      }
                    }}
                  >
                    {stateCompareOpen ? "Hide State Compare" : "Compare 2 States"}
                  </button>
                  <button
                    className="mp-back-small-btn"
                    onClick={() => {
                      setSelectedTrendVenue(null);
                      setStateCompareOpen(false);
                      setStateCompareSelection({ leftState: "", rightState: "" });
                      setSelectedCategoryCallLog("");
                      setSelectedManpowerDrilldown(null);
                    }}
                  >
                    Back
                  </button>
                </div>
              </div>

              {!selectedManpowerDrilldown.venueName && selectedManpowerDrilldownChartData.length > 0 && (
                <div className="mp-kpi-drilldown-chart-wrap" style={{ marginBottom: '24px', background: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid #dde6ef' }}>
                  <div style={{ marginBottom: '10px', fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
                    Click a bar to drill deeper into 
                    {selectedManpowerDrilldown.state ? 'Tenure & Roles' : 'States'}
                  </div>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={selectedManpowerDrilldownChartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dde6ef" />
                      <XAxis dataKey="name" tick={{ fill: "#475569", fontSize: 11 }} />
                      <YAxis tick={{ fill: "#64748b", fontSize: 11 }} />
                      <RechartsTooltip formatter={(value) => formatCount(value)} />
                      <Bar 
                        dataKey="value" 
                        fill="#3f7fdd" 
                        radius={[4, 4, 0, 0]}
                        style={{ cursor: 'pointer' }}
                        onClick={(data) => {
                          if (data && data.name) {
                            if (!selectedManpowerDrilldown.state) {
                              setSelectedManpowerDrilldown(prev => ({ ...prev, state: data.name }));
                            } else if (!selectedManpowerDrilldown.tenure) {
                              const [tenure, role] = data.name.split(' - ');
                              setSelectedManpowerDrilldown(prev => ({ ...prev, tenure, role }));
                            }
                          }
                        }}
                      >
                        <LabelList dataKey="value" position="top" style={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }} formatter={(val) => val > 0 ? formatCount(val) : ''} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {selectedManpowerDrilldown.venueName ? (
                <>
                  <ManpowerEmployeeRotationTable rows={manpowerEmployeeRotationRows} />
                  <h3 className="section-title">Venue Intelligence</h3>
                  <VenueIntelligencePanel rows={manpowerEmployeeRotationRows} />
                  <h3 className="section-title">Directory</h3>
                  <EmployeeDirectoryTable rows={manpowerEmployeeRotationRows} />
                </>
              ) : selectedManpowerDrilldown.tenure ? (
                <>
                  <ManpowerVenueTable
                    rows={manpowerVenueRows}
                    onVenueClick={(row) =>
                      {
                        setSelectedTrendVenue(null);
                        setSelectedManpowerDrilldown((prev) =>
                          (prev ? { ...prev, venueName: row.venueName, dmsCode: row.dmsCode } : prev),
                        );
                      }
                    }
                  />
                  <h3 className="section-title">Emp Rotation Trend By Issue</h3>
                  <ManpowerRotationTrendTable
                    rows={manpowerRotationTrendRows}
                    onVenueClick={(row) =>
                      setSelectedTrendVenue((prev) => {
                        const sameSelection = prev && prev.venueName === row.venueName && prev.dmsCode === row.dmsCode;
                        return sameSelection ? null : { venueName: row.venueName, dmsCode: row.dmsCode || "" };
                      })
                    }
                  />
                  {selectedTrendVenue ? (
                    <>
                      <h3 className="section-title">{selectedTrendVenue.venueName} Venue Manpower List</h3>
                      <VenueWiseManpowerListTable
                        venueName={selectedTrendVenue.venueName}
                        dmsCode={selectedTrendVenue.dmsCode}
                        rows={manpowerSelectedVenueRows}
                      />
                    </>
                  ) : null}
                  <h3 className="section-title">Employee Category vs Number of Venues</h3>
                  <ManpowerCategoryVenueTable rows={manpowerCategoryVenueRows} />
                </>
              ) : selectedManpowerDrilldown.state ? (
                <ManpowerTenureRoleTable
                  rows={manpowerTenureRoleRows}
                  onTenureRoleClick={(tenure, role) =>
                    {
                      setSelectedTrendVenue(null);
                      setSelectedManpowerDrilldown((prev) =>
                        (prev ? { ...prev, tenure, role, venueName: "", dmsCode: "" } : prev),
                      );
                    }
                  }
                />
              ) : (
                <ManpowerSpreadTable
                  rows={manpowerSpreadRows}
                  onStateClick={(state) =>
                    {
                      setSelectedTrendVenue(null);
                      setSelectedManpowerDrilldown((prev) =>
                        (prev ? { ...prev, state, tenure: "", role: "", venueName: "", dmsCode: "" } : prev),
                      );
                    }
                  }
                />
              )}
              {stateCompareOpen ? (
                <>
                  <h3 className="section-title">State Comparison</h3>
                  <div className="mp-state-compare-panel">
                    <div className="mp-state-compare-controls">
                      <div className="mp-select-wrap">
                        <label>State 1</label>
                        <select
                          value={compareLeftState}
                          onChange={(event) =>
                            setStateCompareSelection((prev) => ({ ...prev, leftState: event.target.value }))
                          }
                        >
                          <option value="">Select first state</option>
                          {manpowerStateCompareOptions.map((state) => (
                            <option key={`left-${state}`} value={state}>
                              {state}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="mp-select-wrap">
                        <label>State 2</label>
                        <select
                          value={compareRightState}
                          onChange={(event) =>
                            setStateCompareSelection((prev) => ({ ...prev, rightState: event.target.value }))
                          }
                        >
                          <option value="">Select second state</option>
                          {manpowerStateCompareOptions.map((state) => (
                            <option key={`right-${state}`} value={state}>
                              {state}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  <StateComparisonTable
                    leftState={compareLeftState || "State 1"}
                    rightState={compareRightState || "State 2"}
                    rows={manpowerStateComparisonRows}
                  />
                </>
              ) : null}
            </>
          ) : (
            <>
              <h3 className="section-title">Manpower-Wise Details</h3>
              <div className="flex-table-row">
                <div className="half-col">
                  <div className="chart-container" style={{ height: `${manpowerWiseChartHeight}px`, minHeight: `${manpowerWiseChartHeight}px`, width: "100%", background: "#fff", border: "1px solid #dde6ef", borderRadius: "12px", padding: "16px" }}>
                    <ResponsiveContainer width="100%" height={Math.max(250, manpowerWiseChartHeight - 32)}>
                      <BarChart 
                        data={manpowerWiseRows} 
                        barSize={20}
                        onClick={(data) => {
                          if (data && data.activePayload && data.activePayload[0]) {
                            const region = data.activeLabel;
                            const workforceType = data.activePayload[0].name; // Owned or Outsource
                            setSelectedTrendVenue(null);
                            setStateCompareOpen(false);
                            setSelectedCategoryCallLog("");
                            setStateCompareSelection({ leftState: "", rightState: "" });
                            setSelectedManpowerDrilldown({
                              region,
                              workforceType,
                              state: "",
                              tenure: "",
                              role: "",
                              venueName: "",
                              dmsCode: "",
                            });
                          }
                        }}
                      >
                        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="region" tick={{ fill: "#64748b", fontSize: 13, fontWeight: 500 }} axisLine={false} tickLine={false} tickMargin={12} />
                        <YAxis tick={{ fill: "#64748b", fontSize: 13, fontWeight: 500 }} axisLine={false} tickLine={false} tickMargin={12} />
                        <RechartsTooltip 
                          cursor={{ fill: 'rgba(241, 245, 249, 0.5)' }}
                          contentStyle={{ backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)', padding: '12px' }}
                          itemStyle={{ fontSize: '13px', fontWeight: 500, padding: '2px 0' }}
                          labelStyle={{ fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}
                          formatter={(value) => formatCount(value)} 
                        />
                        <Legend verticalAlign="top" iconType="circle" wrapperStyle={{ paddingBottom: '20px', fontWeight: 500, fontSize: '13px', color: '#64748b' }} />
                        <Bar dataKey="ownedUniqueManpower" name="Owned" fill="#a78bfa" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="outsourcedUniqueManpower" name="Outsource" fill="#93c5fd" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="half-col" ref={manpowerWiseTableColRef}>
                  <ManpowerWiseTable
                    rows={manpowerWiseRows}
                    onCellClick={(region, workforceType) =>
                      {
                        setSelectedTrendVenue(null);
                        setStateCompareOpen(false);
                        setSelectedCategoryCallLog("");
                        setStateCompareSelection({ leftState: "", rightState: "" });
                        setSelectedManpowerDrilldown({
                          region,
                          workforceType,
                          state: "",
                          tenure: "",
                          role: "",
                          venueName: "",
                          dmsCode: "",
                        });
                      }
                    }
                  />
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
      </main>
    </div>
  );
}
