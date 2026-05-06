"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { useApp } from "@/context/AppContext";

const numberFormat = new Intl.NumberFormat("en-IN");

function DataTable({ headers, rows }) {
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
          {rows.map((row, idx) => (
            <tr key={idx}>
              {headers.map((header) => (
                <td key={`${idx}-${header}`}>{String(row[header] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MainDataPage() {
  const { user, fetchApi, datasetKey, setDatasetKey, goTo } = useApp();
  const [allowedDatasets, setAllowedDatasets] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadAllowed() {
      if (!user?.user) return;
      try {
        const data = await fetchApi(`master/allowed?user=${encodeURIComponent(user.user)}`);
        const datasets = data?.datasets || [];
        setAllowedDatasets(datasets);
        if (datasets.length && !datasets.includes(datasetKey)) {
          setDatasetKey(datasets[0]);
        }
      } catch (err) {
        setError(err.message || "Failed to load datasets");
      }
    }
    loadAllowed();
  }, [datasetKey, fetchApi, setDatasetKey, user?.user]);

  useEffect(() => {
    async function loadDataset() {
      if (!datasetKey) return;
      setBusy(true);
      setError("");
      try {
        const data = await fetchApi(`master/${encodeURIComponent(datasetKey)}`);
        setHeaders(data?.headers || []);
        setRows(data?.rows || []);
      } catch (err) {
        setError(err.message || "Failed to load dataset");
      } finally {
        setBusy(false);
      }
    }
    loadDataset();
  }, [datasetKey, fetchApi]);

  const activeCount = useMemo(() => {
    const statusHeader = headers.find((h) => h.toLowerCase().trim() === "status");
    if (!statusHeader) return 0;
    return rows.filter((row) => String(row[statusHeader] || "").toUpperCase() === "ACTIVE").length;
  }, [headers, rows]);

  const blacklistedCount = useMemo(() => {
    const statusHeader = headers.find((h) => h.toLowerCase().trim() === "status");
    if (!statusHeader) return 0;
    return rows.filter((row) => String(row[statusHeader] || "").toUpperCase().includes("BLACK")).length;
  }, [headers, rows]);

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">
        <div className="dash-header">
          <h1 className="dash-title">Master Data Center</h1>
          <button className="btn-outline" style={{ width: 240 }} onClick={() => goTo("dashboard")}>
            Return To Dashboard
          </button>
        </div>

        <div className="dataset-pill-wrap">
          {allowedDatasets.map((dataset) => (
            <button
              key={dataset}
              className={`dataset-pill ${dataset === datasetKey ? "active" : ""}`}
              onClick={() => setDatasetKey(dataset)}
            >
              {dataset}
            </button>
          ))}
        </div>

        <div className="kpi-row kpi-row-3">
          <div className="kpi-box">
            <div className="kpi-title">Rows Scanned</div>
            <div className="kpi-val">{numberFormat.format(rows.length)}</div>
          </div>
          <div className="kpi-box">
            <div className="kpi-title">Active Venues</div>
            <div className="kpi-val">{numberFormat.format(activeCount)}</div>
          </div>
          <div className="kpi-box">
            <div className="kpi-title">Blacklisted</div>
            <div className="kpi-val">{numberFormat.format(blacklistedCount)}</div>
          </div>
        </div>

        <div className="action-row">
          <button className="search-btn" style={{ maxWidth: 280 }} onClick={() => goTo("edit", { requiresAuth: true })}>
            Open Advanced Editor
          </button>
        </div>

        {busy ? <div className="loading-screen"><div className="loader" /></div> : null}
        {error ? <div className="inline-error">{error}</div> : null}
        {!busy && !error ? <DataTable headers={headers} rows={rows} /> : null}
      </main>
    </div>
  );
}
