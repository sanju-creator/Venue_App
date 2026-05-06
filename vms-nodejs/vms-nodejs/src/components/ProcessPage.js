"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { useApp } from "@/context/AppContext";

function HistoryTable({ files }) {
  if (!files.length) return <div className="result-sub">No process outputs yet.</div>;
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Output File</th>
            <th>Generated At</th>
            <th>Size (KB)</th>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <tr key={file.fileName}>
              <td>{file.fileName}</td>
              <td>{new Date(file.modifiedAt).toLocaleString("en-IN")}</td>
              <td>{Math.round((file.sizeBytes || 0) / 1024)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ProcessPage() {
  const { fetchApi, goTo } = useApp();
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const data = await fetchApi("process/history");
      setHistory(data?.files || []);
    } catch (err) {
      setError(err.message || "Failed to load history");
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadHistory();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runProcess = async () => {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const data = await fetchApi("process/run", { method: "POST" });
      setResult(data);
      await loadHistory();
    } catch (err) {
      setError(err.message || "Process failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">
        <div className="dash-header">
          <h1 className="dash-title">Central Analysis Engine</h1>
          <button className="btn-outline" style={{ width: 240 }} onClick={() => goTo("dashboard")}>
            Return To Dashboard
          </button>
        </div>

        <div className="heading-banner">
          <h2>Full Ecosystem Compilation</h2>
          <p>
            Run Blacklisted + FFA + Day End + Suspicious + Market Reviews + Call Logs merge into a single
            analysis output.
          </p>
        </div>

        <div className="action-row">
          <button className="search-btn" style={{ maxWidth: 340 }} onClick={runProcess} disabled={busy}>
            {busy ? "Processing..." : "Execute Core Analysis Consolidation"}
          </button>
        </div>

        {error ? <div className="inline-error">{error}</div> : null}
        {result ? (
          <div className="inline-success">
            Process complete. Output: <strong>{result.outputFile}</strong> | Rows: <strong>{result.rowCount}</strong>
          </div>
        ) : null}

        {result?.analysisCounts ? (
          <div className="kpi-row kpi-row-4">
            {Object.entries(result.analysisCounts).map(([key, value]) => (
              <div className="kpi-box kpi-clickable" key={key} data-tooltip="Click here for details">
                <div className="kpi-title">{key}</div>
                <div className="kpi-val">{value}</div>
              </div>
            ))}
          </div>
        ) : null}

        <h3 className="section-title">Output History</h3>
        {loadingHistory ? <div className="loading-screen"><div className="loader" /></div> : <HistoryTable files={history} />}
      </main>
    </div>
  );
}
