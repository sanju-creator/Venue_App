"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Sidebar from "@/components/Sidebar";
import { useApp } from "@/context/AppContext";

const TABS = [
  { key: "city", label: "City-Wise" },
  { key: "district", label: "District-Wise" },
  { key: "state", label: "State-Wise" },
  { key: "region", label: "Region-Wise" },
];

function PivotTable({ rows }) {
  if (!rows?.length) return <div className="result-sub">No rows</div>;
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>DATC</th>
            <th>DOTC</th>
            <th>Total</th>
            <th>Seat Capacity</th>
            <th>Active</th>
            <th>Active Capacity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{row.key}</td>
              <td>{row.DATC}</td>
              <td>{row.DOTC}</td>
              <td>{row.Total}</td>
              <td>{row.SeatCapacity}</td>
              <td>{row.Active}</td>
              <td>{row.ActiveCapacity}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CityDatcDotcPage() {
  const { fetchApi, goTo } = useApp();
  const isMountedRef = useRef(false);
  const [tab, setTab] = useState("city");
  const [search, setSearch] = useState("");
  const [topN, setTopN] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadData = async () => {
    if (!isMountedRef.current) return;
    setBusy(true);
    setError("");
    try {
      const result = await fetchApi(`city-datc-dotc/bootstrap?search=${encodeURIComponent(search)}&topN=${topN}`);
      if (!isMountedRef.current) return;
      setData(result);
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err.message || "Failed to load summary");
    } finally {
      if (isMountedRef.current) setBusy(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chartData = useMemo(() => {
    if (!data?.charts?.[tab]) return [];
    return data.charts[tab];
  }, [data, tab]);

  const pivotRows = data?.pivots?.[tab] || [];

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">
        <div className="dash-header">
          <h1 className="dash-title">DATC & DOTC Inventory Dashboard</h1>
          <button className="btn-outline" style={{ width: 220 }} onClick={() => goTo("dashboard")}>
            Back to Dashboard
          </button>
        </div>

        <div className="editor-toolbar">
          <input
            className="search-input"
            placeholder="Search by DMS, city, district..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select value={topN} onChange={(event) => setTopN(Number(event.target.value))} className="compact-select">
            {[5, 10, 15, 20, 25, 30, 40, 50].map((value) => (
              <option key={value} value={value}>
                Top {value}
              </option>
            ))}
          </select>
          <button className="search-btn" onClick={loadData}>
            Apply
          </button>
        </div>

        {error ? <div className="inline-error">{error}</div> : null}
        {busy ? <div className="loading-screen"><div className="loader" /></div> : null}

        {data?.kpis ? (
          <div className="kpi-row kpi-row-3">
            <div className="kpi-box kpi-clickable" data-tooltip="View details"><div className="kpi-title">Total Venues</div><div className="kpi-val">{data.kpis.totalVenues}</div></div>
            <div className="kpi-box kpi-clickable" data-tooltip="View details"><div className="kpi-title">DATC</div><div className="kpi-val">{data.kpis.totalDATC}</div></div>
            <div className="kpi-box kpi-clickable" data-tooltip="View details"><div className="kpi-title">DOTC</div><div className="kpi-val">{data.kpis.totalDOTC}</div></div>
          </div>
        ) : null}

        <div className="dataset-pill-wrap">
          {TABS.map((item) => (
            <button key={item.key} className={`dataset-pill ${tab === item.key ? "active" : ""}`} onClick={() => setTab(item.key)}>
              {item.label}
            </button>
          ))}
        </div>

        <div className="section-full">
          <h3>{TABS.find((item) => item.key === tab)?.label} DATC vs DOTC</h3>
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
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -4, bottom: 2 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="DATC" fill="#3f7fdd" />
                <Bar dataKey="DOTC" fill="#7d58e2" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <h3 className="section-title">Pivot Table</h3>
        <PivotTable rows={pivotRows} />
      </main>
    </div>
  );
}
