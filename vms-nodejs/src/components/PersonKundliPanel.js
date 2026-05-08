"use client";
import { useMemo, useState } from "react";

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasCsvToken(csv, token) {
  const target = String(token || "").trim().toLowerCase();
  if (!target) return false;
  return splitCsv(csv).some((item) => item.toLowerCase() === target);
}

function uniqueList(items) {
  return Array.from(new Set((items || []).filter(Boolean)));
}

function categoryClass(category) {
  return String(category || "-").replace("-", "").toLowerCase();
}

function StatusBadge({ ok, yesLabel = "Available", noLabel = "Missing" }) {
  return (
    <span className={`pk-doc-badge ${ok ? "pk-doc-yes" : "pk-doc-no"}`}>
      <span className="pk-doc-dot" />
      {ok ? yesLabel : noLabel}
    </span>
  );
}

function ScoreBar({ label, score, icon }) {
  const color = score >= 80 ? "#16a34a" : score >= 60 ? "#d97706" : score >= 40 ? "#ea580c" : "#dc2626";
  return (
    <div className="pk-score-card">
      <div className="pk-score-header">
        {icon ? <span className="pk-score-icon">{icon}</span> : null}
        <span className="pk-score-label">{label}</span>
      </div>
      <div className="pk-score-bar-bg">
        <div className="pk-score-bar-fill" style={{ width: `${score}%`, background: color }} />
      </div>
      <div className="pk-score-value" style={{ color }}>{score}<span>/100</span></div>
    </div>
  );
}

function DrilldownTable({
  title,
  rows,
  columns,
  onClose,
  onRowClick,
  activeRowKey,
  getRowKey,
  emptyMessage = "No details found.",
}) {
  const safeRows = rows || [];
  return (
    <div className="pk-drilldown-panel">
      <div className="pk-drilldown-head">
        <span className="pk-drilldown-title">{title}</span>
        {onClose ? <button className="pk-close-btn" onClick={onClose}>X</button> : null}
      </div>
      {safeRows.length ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
            <tbody>
              {safeRows.map((r, i) => {
                const rowKey = getRowKey ? getRowKey(r, i) : `${i}`;
                const isActive = activeRowKey && rowKey === activeRowKey;
                return (
                  <tr
                    key={rowKey}
                    className={onRowClick ? `pk-drill-row${isActive ? " is-active" : ""}` : undefined}
                    onClick={onRowClick ? () => onRowClick(r, i) : undefined}
                  >
                    {columns.map((c) => <td key={c.key} style={c.style}>{c.render ? c.render(r) : r[c.key]}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="photo-placeholder" style={{ height: "auto", padding: "20px", borderStyle: "dashed" }}>
          {emptyMessage}
        </div>
      )}
    </div>
  );
}

function DeepDetailBlock({ detail, onBack, onSyncCurrentVenue }) {
  if (!detail) return null;
  return (
    <div className="pk-drilldown-panel pk-deep-panel">
      <div className="pk-drilldown-head">
        <div>
          {detail.breadcrumb ? <div className="pk-breadcrumb-lite">{detail.breadcrumb}</div> : null}
          <span className="pk-drilldown-title">{detail.title}</span>
        </div>
        <div className="pk-deep-actions">
          {onSyncCurrentVenue ? <button className="mp-back-small-btn" onClick={onSyncCurrentVenue}>Sync To Current Venue Info</button> : null}
          <button className="mp-back-small-btn" onClick={onBack}>Back</button>
        </div>
      </div>
      {detail.summary?.length ? (
        <div className="pk-deep-summary-grid">
          {detail.summary.map((item) => (
            <div key={item.label} className="pk-deep-summary-box">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      ) : null}
      {detail.rows?.length ? (
        <div className="table-wrap" style={{ marginTop: "10px" }}>
          <table className="data-table">
            <thead><tr>{detail.columns.map((col) => <th key={col.key}>{col.label}</th>)}</tr></thead>
            <tbody>
              {detail.rows.map((row, rowIdx) => (
                <tr key={`detail-row-${rowIdx}`}>
                  {detail.columns.map((col) => (
                    <td key={`${col.key}-${rowIdx}`}>{col.render ? col.render(row) : row[col.key]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="photo-placeholder" style={{ height: "auto", padding: "20px", borderStyle: "dashed", marginTop: "10px" }}>
          {detail.emptyMessage || "No extra details found."}
        </div>
      )}
    </div>
  );
}

export default function PersonKundliPanel({ data, loading, error, onClose, onSyncCurrentVenue }) {
  const [drill, setDrill] = useState(null);
  const [subDrill, setSubDrill] = useState(null);
  const [deepDetail, setDeepDetail] = useState(null);

  const safeData = data || {};
  const {
    identity = {},
    summary = {},
    delivery = {},
    issueBreakdown = [],
    venueRotation = [],
    projectDelivery = [],
    driveBreakdown = [],
    ffaDetails = [],
    callLogDetails = [],
    dateDistribution = [],
    resourcePlanning = {},
  } = safeData;
  const totalIssues = issueBreakdown.reduce((s, i) => s + i.count, 0);
  const rp = resourcePlanning || {};
  const scores = rp.scores || {};

  const venueRows = venueRotation || [];
  const projectRows = projectDelivery || [];
  const driveRows = driveBreakdown || [];
  const ffaRows = ffaDetails || [];
  const callLogRows = callLogDetails || [];
  const dateRows = dateDistribution || [];

  const fullDelayRows = venueRows.filter((v) => toNum(v.fullBatchDelay) > 0);
  const partialDelayRows = venueRows.filter((v) => toNum(v.partialBatchDelay) > 0);
  const noDelayRows = venueRows.filter((v) => toNum(v.noDelay) > 0);

  const venueByDms = useMemo(() => {
    const map = new Map();
    venueRows.forEach((row) => map.set(String(row.dmsCode || ""), row));
    return map;
  }, [venueRows]);

  const toggleDrill = (key) => {
    setDeepDetail(null);
    setSubDrill(null);
    setDrill((prev) => (prev === key ? null : key));
  };

  const openSub = (parent, kind, row) => {
    setDeepDetail(null);
    setSubDrill({ parent, kind, row });
  };

  const kpiClass = (key) => `pk-kpi pk-kpi-clickable${drill === key ? " pk-kpi-active" : ""}`;

  const projCols = [
    { key: "project", label: "Project" },
    { key: "drives", label: "Drives" },
    { key: "venues", label: "Venues" },
    { key: "totalBatches", label: "Batches" },
    { key: "fullBatchDelay", label: "Full Delay", style: { color: "#dc2626" } },
    { key: "partialBatchDelay", label: "Partial", style: { color: "#d97706" } },
    { key: "noDelay", label: "No Delay", style: { color: "#16a34a" } },
    { key: "ffa", label: "FFA" },
    { key: "callLogs", label: "Call Logs" },
  ];
  const driveCols = [
    { key: "drive", label: "Drive" },
    { key: "projects", label: "Projects" },
    { key: "venues", label: "Venues" },
    { key: "records", label: "Records" },
  ];
  const venueBatchCols = [
    { key: "venueName", label: "Venue" },
    { key: "dmsCode", label: "DMS" },
    { key: "totalBatches", label: "Batches" },
    { key: "fullBatchDelay", label: "Full Delay" },
    { key: "partialBatchDelay", label: "Partial" },
    { key: "noDelay", label: "No Delay" },
  ];
  const ffaCols = [
    { key: "venueName", label: "Venue" },
    { key: "dmsCode", label: "DMS" },
    { key: "category", label: "Category" },
    { key: "projects", label: "Projects" },
    { key: "dateRange", label: "Period" },
    { key: "ffa", label: "FFA Count", style: { color: "#dc2626", fontWeight: 700 } },
  ];
  const clCols = [
    { key: "venueName", label: "Venue" },
    { key: "dmsCode", label: "DMS" },
    { key: "category", label: "Category" },
    { key: "projects", label: "Projects" },
    { key: "dateRange", label: "Period" },
    { key: "callLogs", label: "Call Logs", style: { color: "#dc2626", fontWeight: 700 } },
  ];
  const dateCols = [
    { key: "date", label: "Date" },
    { key: "count", label: "Records" },
  ];

  const subDrillPanel = useMemo(() => {
    if (!subDrill) return null;
    const { kind, row } = subDrill;
    if (kind === "project") {
      const relVenues = venueRows.filter((v) => hasCsvToken(v.projects, row.project));
      const relFfa = ffaRows.filter((f) => hasCsvToken(f.projects, row.project));
      const relCall = callLogRows.filter((c) => hasCsvToken(c.projects, row.project));
      const relDrives = uniqueList(relVenues.flatMap((v) => splitCsv(v.drives)));
      return {
        title: `Project Deep Dive: ${row.project}`,
        summary: [
          { label: "Drives", value: relDrives.length || row.drives || 0 },
          { label: "Venues", value: relVenues.length || row.venues || 0 },
          { label: "Batches", value: row.totalBatches },
          { label: "No Delay", value: row.noDelay },
          { label: "FFA", value: row.ffa },
          { label: "Call Logs", value: row.callLogs },
        ],
        rows: relVenues,
        columns: [
          { key: "venueName", label: "Venue" },
          { key: "dmsCode", label: "DMS" },
          { key: "drives", label: "Drives" },
          { key: "dateRange", label: "Period" },
          { key: "totalBatches", label: "Batches" },
          { key: "fullBatchDelay", label: "Full Delay" },
          { key: "partialBatchDelay", label: "Partial" },
          { key: "noDelay", label: "No Delay" },
          { key: "ffa", label: "FFA" },
          { key: "callLogs", label: "Call Logs" },
        ],
        emptyMessage: "No venue-level data found for this project.",
        onRowClick: (venue) => {
          const venueFfa = relFfa.filter((f) => String(f.dmsCode || "") === String(venue.dmsCode || ""));
          const venueCall = relCall.filter((c) => String(c.dmsCode || "") === String(venue.dmsCode || ""));
          setDeepDetail({
            title: `Venue in Project: ${venue.venueName}`,
            breadcrumb: composeBreadcrumb(`Venue ${venue.venueName}`),
            summary: [
              { label: "DMS", value: venue.dmsCode || "-" },
              { label: "Category", value: venue.category || "-" },
              { label: "Roles", value: venue.roles || "-" },
              { label: "Projects", value: venue.projects || "-" },
            ],
            rows: venueFfa.length || venueCall.length
              ? [
                ...venueFfa.map((f) => ({ type: "FFA", count: f.ffa, period: f.dateRange, details: f.projects })),
                ...venueCall.map((c) => ({ type: "Call Log", count: c.callLogs, period: c.dateRange, details: c.projects })),
              ]
              : [],
            columns: [
              { key: "type", label: "Issue Type" },
              { key: "count", label: "Count" },
              { key: "period", label: "Period" },
              { key: "details", label: "Project Scope" },
            ],
            emptyMessage: "No incident rows for this project-venue combination.",
          });
        },
      };
    }
    if (kind === "drive") {
      const relVenues = venueRows.filter((v) => hasCsvToken(v.drives, row.drive));
      const relProjects = uniqueList(relVenues.flatMap((v) => splitCsv(v.projects)));
      return {
        title: `Drive Deep Dive: ${row.drive}`,
        summary: [
          { label: "Projects", value: relProjects.length || row.projects || 0 },
          { label: "Venues", value: relVenues.length || row.venues || 0 },
          { label: "Records", value: row.records || 0 },
        ],
        rows: relVenues,
        columns: [
          { key: "venueName", label: "Venue" },
          { key: "dmsCode", label: "DMS" },
          { key: "projects", label: "Projects" },
          { key: "dateRange", label: "Period" },
          { key: "totalBatches", label: "Batches" },
          { key: "callLogs", label: "Call Logs" },
        ],
        emptyMessage: "No venue-level rows mapped to this drive.",
        onRowClick: (venue) => {
          setDeepDetail({
            title: `Drive-Venue Detail: ${venue.venueName}`,
            breadcrumb: composeBreadcrumb(`Venue ${venue.venueName}`),
            summary: [
              { label: "Drive", value: row.drive },
              { label: "DMS", value: venue.dmsCode || "-" },
              { label: "Projects", value: venue.projects || "-" },
              { label: "Roles", value: venue.roles || "-" },
            ],
            rows: [
              {
                fullDelay: venue.fullBatchDelay,
                partialDelay: venue.partialBatchDelay,
                noDelay: venue.noDelay,
                ffa: venue.ffa,
                callLogs: venue.callLogs,
                period: venue.dateRange,
              },
            ],
            columns: [
              { key: "fullDelay", label: "Full Delay" },
              { key: "partialDelay", label: "Partial" },
              { key: "noDelay", label: "No Delay" },
              { key: "ffa", label: "FFA" },
              { key: "callLogs", label: "Call Logs" },
              { key: "period", label: "Period" },
            ],
          });
        },
      };
    }
    if (kind === "venue") {
      return {
        title: `Venue Deep Dive: ${row.venueName}`,
        summary: [
          { label: "DMS", value: row.dmsCode || "-" },
          { label: "Category", value: row.category || "-" },
          { label: "State", value: row.state || "-" },
          { label: "City", value: row.city || "-" },
          { label: "Roles", value: row.roles || "-" },
          { label: "Period", value: row.dateRange || "-" },
        ],
        rows: [
          {
            projects: row.projects || "-",
            drives: row.drives || "-",
            totalBatches: row.totalBatches,
            fullBatchDelay: row.fullBatchDelay,
            partialBatchDelay: row.partialBatchDelay,
            noDelay: row.noDelay,
            ffa: row.ffa,
            callLogs: row.callLogs,
          },
        ],
        columns: [
          { key: "projects", label: "Projects" },
          { key: "drives", label: "Drives" },
          { key: "totalBatches", label: "Batches" },
          { key: "fullBatchDelay", label: "Full Delay" },
          { key: "partialBatchDelay", label: "Partial" },
          { key: "noDelay", label: "No Delay" },
          { key: "ffa", label: "FFA" },
          { key: "callLogs", label: "Call Logs" },
        ],
      };
    }
    if (kind === "date") {
      const relVenues = venueRows.filter((v) => String(v.dateRange || "").includes(String(row.date || "")));
      return {
        title: `Date Deep Dive: ${row.date}`,
        summary: [
          { label: "Records", value: row.count },
          { label: "Mapped Venues", value: relVenues.length },
        ],
        rows: relVenues,
        columns: [
          { key: "venueName", label: "Venue" },
          { key: "dmsCode", label: "DMS" },
          { key: "projects", label: "Projects" },
          { key: "dateRange", label: "Date Range" },
          { key: "totalBatches", label: "Batches" },
        ],
        emptyMessage: "No venue rows matched exactly in date range text for this date.",
      };
    }
    if (kind === "ffa") {
      const venue = venueByDms.get(String(row.dmsCode || ""));
      return {
        title: `FFA Deep Dive: ${row.venueName}`,
        summary: [
          { label: "DMS", value: row.dmsCode || "-" },
          { label: "Category", value: row.category || "-" },
          { label: "FFA Count", value: row.ffa || 0 },
          { label: "Period", value: row.dateRange || "-" },
        ],
        rows: venue ? [venue] : [],
        columns: [
          { key: "projects", label: "Projects" },
          { key: "drives", label: "Drives" },
          { key: "roles", label: "Roles" },
          { key: "totalBatches", label: "Batches" },
          { key: "callLogs", label: "Call Logs" },
        ],
        emptyMessage: "No matching venue record found for this FFA row.",
      };
    }
    if (kind === "callLogs") {
      const venue = venueByDms.get(String(row.dmsCode || ""));
      return {
        title: `Call Log Deep Dive: ${row.venueName}`,
        summary: [
          { label: "DMS", value: row.dmsCode || "-" },
          { label: "Category", value: row.category || "-" },
          { label: "Call Logs", value: row.callLogs || 0 },
          { label: "Period", value: row.dateRange || "-" },
        ],
        rows: venue ? [venue] : [],
        columns: [
          { key: "projects", label: "Projects" },
          { key: "drives", label: "Drives" },
          { key: "roles", label: "Roles" },
          { key: "totalBatches", label: "Batches" },
          { key: "ffa", label: "FFA" },
        ],
        emptyMessage: "No matching venue record found for this call log row.",
      };
    }
    if (kind === "deliveryVenue") {
      return {
        title: `Delivery Deep Dive: ${row.venueName}`,
        summary: [
          { label: "DMS", value: row.dmsCode || "-" },
          { label: "Batches", value: row.totalBatches },
          { label: "Full Delay", value: row.fullBatchDelay },
          { label: "Partial", value: row.partialBatchDelay },
          { label: "No Delay", value: row.noDelay },
          { label: "Period", value: row.dateRange || "-" },
        ],
        rows: [
          {
            projects: row.projects || "-",
            drives: row.drives || "-",
            ffa: row.ffa || 0,
            callLogs: row.callLogs || 0,
            roles: row.roles || "-",
            location: `${row.state || "-"}, ${row.city || "-"}`,
          },
        ],
        columns: [
          { key: "projects", label: "Projects" },
          { key: "drives", label: "Drives" },
          { key: "roles", label: "Roles" },
          { key: "location", label: "Location" },
          { key: "ffa", label: "FFA" },
          { key: "callLogs", label: "Call Logs" },
        ],
      };
    }
    return null;
  }, [subDrill, venueRows, ffaRows, callLogRows, venueByDms]);

  const clearSubDrill = () => {
    setSubDrill(null);
    setDeepDetail(null);
  };

  const drillLabelMap = {
    projects: "Projects",
    drives: "Drives",
    venues: "Venues",
    records: "Records",
    batches: "Batches",
    fullDelay: "Full Delay",
    partialDelay: "Partial Delay",
    noDelayDrill: "No Delay",
    ffaDrill: "FFA",
    clDrill: "Call Logs",
  };

  const composeBreadcrumb = (leafTitle) => {
    const parent = subDrill?.parent === "rotation" ? "Rotation Summary" : "Delivery Performance";
    const metric = drillLabelMap[drill] || "Metric";
    const second = subDrillPanel?.title || "Table";
    return `${parent} > ${metric} > ${second} > ${leafTitle}`;
  };

  if (loading) return <div className="pk-panel"><div className="pk-loading"><div className="loader" /></div></div>;
  if (error) return <div className="pk-panel"><div className="pk-header"><span className="pk-error-text">{error}</span><button className="pk-close-btn" onClick={onClose}>X</button></div></div>;
  if (!data) return null;

  return (
    <div className="pk-panel">
      <div className="pk-header">
        <div className="pk-header-left">
          <div className="pk-avatar">{(identity.name || "?")[0].toUpperCase()}</div>
          <div>
            <div className="pk-name">{identity.name}</div>
            <div className="pk-empid">ID: {identity.empId}</div>
          </div>
          {rp.classification ? (
            <div className={`pk-class-badge pk-class-${rp.classification.replace(/\s+/g, "").toLowerCase()}`}>
              {rp.classificationIcon} {rp.classification} <span className="pk-class-score">{rp.overallRating}/100</span>
            </div>
          ) : null}
        </div>
        <button className="pk-close-btn" onClick={onClose}>X</button>
      </div>

      <div className="pk-section-row">
        <div className="pk-card pk-card-half">
          <div className="pk-card-title">Contact Information</div>
          <div className="pk-kv"><span>Phone</span><strong>{identity.phone}</strong></div>
          <div className="pk-kv"><span>Email</span><strong style={{ fontSize: "12px", wordBreak: "break-all" }}>{identity.email}</strong></div>
          <div className="pk-kv"><span>Roles</span><strong>{summary.roles}</strong></div>
          <div className="pk-kv"><span>Tenure</span><strong>{summary.tenures}</strong></div>
        </div>
        <div className="pk-card pk-card-half">
          <div className="pk-card-title">Document Compliance</div>
          <div className="pk-docs-grid">
            <StatusBadge ok={identity.hasPhone} yesLabel="Phone Verified" noLabel="Phone Missing" />
            <StatusBadge ok={identity.hasEmail} yesLabel="Email Verified" noLabel="Email Missing" />
            <StatusBadge ok={identity.hasGovtId} yesLabel="Govt ID Submitted" noLabel="Govt ID Missing" />
            <StatusBadge ok={identity.hasDeclaration} yesLabel="Declaration Signed" noLabel="Declaration Missing" />
          </div>
        </div>
      </div>

      <div className="pk-card">
        <div className="pk-card-title">Rotation Summary <span className="pk-click-hint">Click a metric to view details</span></div>
        <div className="pk-kpi-strip">
          <div className={kpiClass("projects")} data-tooltip="View details" onClick={() => toggleDrill("projects")}>
            <div className="pk-kpi-value">{summary.uniqueProjects}</div>
            <div className="pk-kpi-label">Projects {drill === "projects" ? "?" : "?"}</div>
          </div>
          <div className={kpiClass("drives")} data-tooltip="View details" onClick={() => toggleDrill("drives")}>
            <div className="pk-kpi-value">{summary.uniqueDrives}</div>
            <div className="pk-kpi-label">Drives {drill === "drives" ? "?" : "?"}</div>
          </div>
          <div className={kpiClass("venues")} data-tooltip="View details" onClick={() => toggleDrill("venues")}>
            <div className="pk-kpi-value">{summary.uniqueVenues}</div>
            <div className="pk-kpi-label">Venues {drill === "venues" ? "?" : "?"}</div>
          </div>
          <div className={kpiClass("records")} data-tooltip="View details" onClick={() => toggleDrill("records")}>
            <div className="pk-kpi-value">{summary.totalRecords}</div>
            <div className="pk-kpi-label">Records {drill === "records" ? "?" : "?"}</div>
          </div>
        </div>
        {drill === "projects" ? (
          <DrilldownTable
            title="Per-Project Delivery Breakdown"
            rows={projectRows}
            columns={projCols}
            onClose={() => setDrill(null)}
            onRowClick={(row) => openSub("rotation", "project", row)}
            activeRowKey={subDrill?.kind === "project" ? subDrill.row.project : ""}
            getRowKey={(row) => row.project}
          />
        ) : null}
        {drill === "drives" ? (
          <DrilldownTable
            title="Per-Drive Breakdown"
            rows={driveRows}
            columns={driveCols}
            onClose={() => setDrill(null)}
            onRowClick={(row) => openSub("rotation", "drive", row)}
            activeRowKey={subDrill?.kind === "drive" ? subDrill.row.drive : ""}
            getRowKey={(row) => row.drive}
          />
        ) : null}
        {drill === "venues" ? (
          <DrilldownTable
            title="Per-Venue Summary"
            rows={venueRows}
            columns={venueBatchCols}
            onClose={() => setDrill(null)}
            onRowClick={(row) => openSub("rotation", "venue", row)}
            activeRowKey={subDrill?.kind === "venue" ? subDrill.row.dmsCode : ""}
            getRowKey={(row) => row.dmsCode}
          />
        ) : null}
        {drill === "records" ? (
          <DrilldownTable
            title="Date-Wise Record Distribution"
            rows={dateRows}
            columns={dateCols}
            onClose={() => setDrill(null)}
            onRowClick={(row) => openSub("rotation", "date", row)}
            activeRowKey={subDrill?.kind === "date" ? subDrill.row.date : ""}
            getRowKey={(row) => row.date}
          />
        ) : null}
        {subDrillPanel && subDrill?.parent === "rotation" ? (
          <DrilldownTable
            title={subDrillPanel.title}
            rows={subDrillPanel.rows}
            columns={subDrillPanel.columns}
            onClose={clearSubDrill}
            onRowClick={subDrillPanel.onRowClick}
            emptyMessage={subDrillPanel.emptyMessage}
          />
        ) : null}
        {subDrill?.parent === "rotation" ? (
          <DeepDetailBlock detail={deepDetail} onBack={() => setDeepDetail(null)} onSyncCurrentVenue={onSyncCurrentVenue} />
        ) : null}
      </div>

      <div className="pk-card">
        <div className="pk-card-title">Delivery Performance <span className="pk-click-hint">Click a metric to view details</span></div>
        <div className="pk-kpi-strip pk-delivery-strip">
          <div className={`${kpiClass("batches")} pk-kpi-neutral`} data-tooltip="View details" onClick={() => toggleDrill("batches")}>
            <div className="pk-kpi-value">{delivery.totalBatches}</div>
            <div className="pk-kpi-label">Batches {drill === "batches" ? "?" : "?"}</div>
          </div>
          <div className={`${kpiClass("fullDelay")} pk-kpi-danger`} data-tooltip="View details" onClick={() => toggleDrill("fullDelay")}>
            <div className="pk-kpi-value">{delivery.fullBatchDelay}</div>
            <div className="pk-kpi-label">Full Delay {drill === "fullDelay" ? "?" : "?"}</div>
          </div>
          <div className={`${kpiClass("partialDelay")} pk-kpi-warn`} data-tooltip="View details" onClick={() => toggleDrill("partialDelay")}>
            <div className="pk-kpi-value">{delivery.partialBatchDelay}</div>
            <div className="pk-kpi-label">Partial {drill === "partialDelay" ? "?" : "?"}</div>
          </div>
          <div className={`${kpiClass("noDelayDrill")} pk-kpi-good`} data-tooltip="View details" onClick={() => toggleDrill("noDelayDrill")}>
            <div className="pk-kpi-value">{delivery.noDelay}</div>
            <div className="pk-kpi-label">No Delay {drill === "noDelayDrill" ? "?" : "?"}</div>
          </div>
          <div className={`${kpiClass("ffaDrill")} pk-kpi-danger`} data-tooltip="View details" onClick={() => toggleDrill("ffaDrill")}>
            <div className="pk-kpi-value">{delivery.ffa}</div>
            <div className="pk-kpi-label">FFA {drill === "ffaDrill" ? "?" : "?"}</div>
          </div>
          <div className={`${kpiClass("clDrill")} ${delivery.callLogs > 0 ? "pk-kpi-danger" : "pk-kpi-good"}`} data-tooltip="View details" onClick={() => toggleDrill("clDrill")}>
            <div className="pk-kpi-value">{delivery.callLogs}</div>
            <div className="pk-kpi-label">Call Logs {drill === "clDrill" ? "?" : "?"}</div>
          </div>
        </div>
        {drill === "batches" ? (
          <DrilldownTable
            title="Batch Distribution by Venue"
            rows={venueRows}
            columns={venueBatchCols}
            onClose={() => setDrill(null)}
            onRowClick={(row) => openSub("delivery", "deliveryVenue", row)}
            activeRowKey={subDrill?.kind === "deliveryVenue" ? subDrill.row.dmsCode : ""}
            getRowKey={(row) => row.dmsCode}
          />
        ) : null}
        {drill === "fullDelay" ? (
          <DrilldownTable
            title="Venues with Full Batch Delay"
            rows={fullDelayRows}
            columns={[...venueBatchCols.slice(0, 2), { key: "fullBatchDelay", label: "Full Delay", style: { color: "#dc2626", fontWeight: 700 } }, { key: "totalBatches", label: "Total Batches" }]}
            onClose={() => setDrill(null)}
            onRowClick={(row) => openSub("delivery", "deliveryVenue", row)}
            activeRowKey={subDrill?.kind === "deliveryVenue" ? subDrill.row.dmsCode : ""}
            getRowKey={(row) => row.dmsCode}
          />
        ) : null}
        {drill === "partialDelay" ? (
          <DrilldownTable
            title="Venues with Partial Batch Delay"
            rows={partialDelayRows}
            columns={[...venueBatchCols.slice(0, 2), { key: "partialBatchDelay", label: "Partial Delay", style: { color: "#d97706", fontWeight: 700 } }, { key: "totalBatches", label: "Total Batches" }]}
            onClose={() => setDrill(null)}
            onRowClick={(row) => openSub("delivery", "deliveryVenue", row)}
            activeRowKey={subDrill?.kind === "deliveryVenue" ? subDrill.row.dmsCode : ""}
            getRowKey={(row) => row.dmsCode}
          />
        ) : null}
        {drill === "noDelayDrill" ? (
          <DrilldownTable
            title="Venues with No Delay (Clean)"
            rows={noDelayRows}
            columns={[...venueBatchCols.slice(0, 2), { key: "noDelay", label: "No Delay", style: { color: "#16a34a", fontWeight: 700 } }, { key: "totalBatches", label: "Total Batches" }]}
            onClose={() => setDrill(null)}
            onRowClick={(row) => openSub("delivery", "deliveryVenue", row)}
            activeRowKey={subDrill?.kind === "deliveryVenue" ? subDrill.row.dmsCode : ""}
            getRowKey={(row) => row.dmsCode}
          />
        ) : null}
        {drill === "ffaDrill" ? (
          <DrilldownTable
            title="FFA Incidents by Venue"
            rows={ffaRows}
            columns={ffaCols}
            onClose={() => setDrill(null)}
            onRowClick={(row) => openSub("delivery", "ffa", row)}
            activeRowKey={subDrill?.kind === "ffa" ? `${subDrill.row.dmsCode}-${subDrill.row.dateRange}` : ""}
            getRowKey={(row, i) => `${row.dmsCode}-${row.dateRange}-${i}`}
          />
        ) : null}
        {drill === "clDrill" ? (
          <DrilldownTable
            title="Call Log Issues by Venue"
            rows={callLogRows}
            columns={clCols}
            onClose={() => setDrill(null)}
            onRowClick={(row) => openSub("delivery", "callLogs", row)}
            activeRowKey={subDrill?.kind === "callLogs" ? `${subDrill.row.dmsCode}-${subDrill.row.dateRange}` : ""}
            getRowKey={(row, i) => `${row.dmsCode}-${row.dateRange}-${i}`}
          />
        ) : null}
        {subDrillPanel && subDrill?.parent === "delivery" ? (
          <DrilldownTable
            title={subDrillPanel.title}
            rows={subDrillPanel.rows}
            columns={subDrillPanel.columns}
            onClose={clearSubDrill}
            onRowClick={subDrillPanel.onRowClick}
            emptyMessage={subDrillPanel.emptyMessage}
          />
        ) : null}
        {subDrill?.parent === "delivery" ? (
          <DeepDetailBlock detail={deepDetail} onBack={() => setDeepDetail(null)} onSyncCurrentVenue={onSyncCurrentVenue} />
        ) : null}
      </div>

      {issueBreakdown.length > 0 ? (
        <div className="pk-card">
          <div className="pk-card-title">Issue Category Breakdown <span className="pk-card-badge">{totalIssues} total</span></div>
          <div className="pk-issue-bar-wrap">
            {issueBreakdown.map((issue) => (
              <div key={issue.category} className="pk-issue-row">
                <span className="pk-issue-label">{issue.category}</span>
                <div className="pk-issue-bar-bg">
                  <div className="pk-issue-bar-fill" style={{ width: `${Math.min(100, (issue.count / totalIssues) * 100)}%` }} />
                </div>
                <span className="pk-issue-count">{issue.count}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {rp.scores ? (
        <div className="pk-card pk-resource-section">
          <div className="pk-card-title">Parameters for Rating Performance</div>
          <div className="pk-resource-top">
            <div className={`pk-class-hero pk-class-${(rp.classification || "").replace(/\s+/g, "").toLowerCase()}`}>
              <div className="pk-class-hero-icon">{rp.classificationIcon}</div>
              <div className="pk-class-hero-label">{rp.classification}</div>
              <div className="pk-class-hero-score">{rp.overallRating}<span>/100</span></div>
            </div>
            <div className="pk-scores-grid">
              <ScoreBar label="Attendance" score={scores.attendance} />
              <ScoreBar label="Punctuality" score={scores.punctuality} />
              <ScoreBar label="Productivity" score={scores.productivity} />
              <ScoreBar label="Task Completion" score={scores.taskCompletion} />
              <ScoreBar label="Feedback" score={scores.feedback} />
              <ScoreBar label="Compliance" score={scores.compliance} />
            </div>
          </div>

          <div className="pk-sw-grid">
            <div className="pk-sw-col pk-sw-strengths">
              <div className="pk-sw-title">Strengths</div>
              {(rp.strengths || []).length > 0 ? (
                rp.strengths.map((s, i) => <div key={i} className="pk-sw-item pk-sw-good">+ {s}</div>)
              ) : (
                <div className="pk-sw-item pk-sw-empty">No notable strengths identified</div>
              )}
            </div>
            <div className="pk-sw-col pk-sw-weaknesses">
              <div className="pk-sw-title">Areas of Concern</div>
              {(rp.weaknesses || []).length > 0 ? (
                rp.weaknesses.map((w, i) => <div key={i} className="pk-sw-item pk-sw-bad">- {w}</div>)
              ) : (
                <div className="pk-sw-item pk-sw-empty">No concerns identified</div>
              )}
            </div>
          </div>

          {(rp.recommendations || []).length > 0 ? (
            <div className="pk-reco-section">
              <div className="pk-sw-title">Highlights</div>
              {rp.recommendations.map((r, i) => (
                <div key={i} className="pk-reco-item">{"-> "}{r}</div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="pk-card">
        <div className="pk-card-title">Venue-Wise Rotation History <span className="pk-card-badge">{venueRows.length} venue(s)</span></div>
        {venueRows.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Venue</th><th>DMS Code</th><th>Category</th><th>Location</th><th>Role</th>
                  <th>Projects</th><th>Period</th><th>Batches</th><th>Full Delay</th><th>Partial</th>
                  <th>No Delay</th><th>FFA</th><th>Call Logs</th>
                </tr>
              </thead>
              <tbody>
                {venueRows.map((v, idx) => (
                  <tr key={`${v.dmsCode}-${idx}`}>
                    <td style={{ fontWeight: 600, maxWidth: "180px" }}>{v.venueName}</td>
                    <td style={{ fontFamily: "monospace", fontSize: "12px" }}>{v.dmsCode}</td>
                    <td><span className={`pk-cat-pill pk-cat-${categoryClass(v.category)}`}>{v.category}</span></td>
                    <td style={{ fontSize: "12px" }}>{v.state}, {v.city}</td>
                    <td style={{ fontSize: "12px" }}>{v.roles}</td>
                    <td style={{ fontSize: "12px", maxWidth: "150px" }}>{v.projects}</td>
                    <td style={{ fontSize: "11px", whiteSpace: "nowrap" }}>{v.dateRange}</td>
                    <td><strong>{v.totalBatches}</strong></td>
                    <td style={{ color: v.fullBatchDelay > 0 ? "#dc2626" : "#64748b" }}>{v.fullBatchDelay}</td>
                    <td style={{ color: v.partialBatchDelay > 0 ? "#f59e0b" : "#64748b" }}>{v.partialBatchDelay}</td>
                    <td style={{ color: "#16a34a" }}>{v.noDelay}</td>
                    <td style={{ color: v.ffa > 0 ? "#dc2626" : "#64748b", fontWeight: v.ffa > 0 ? 700 : 400 }}>{v.ffa}</td>
                    <td style={{ color: v.callLogs > 0 ? "#dc2626" : "#16a34a", fontWeight: 600 }}>{v.callLogs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="photo-placeholder" style={{ height: "auto", padding: "24px", borderStyle: "dashed" }}>
            No venue rotation data available.
          </div>
        )}
      </div>
    </div>
  );
}

