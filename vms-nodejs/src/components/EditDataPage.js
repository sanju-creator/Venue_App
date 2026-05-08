"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { useApp } from "@/context/AppContext";

export default function EditDataPage() {
  const { datasetKey, fetchApi, goTo, API } = useApp();
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [uploadMode, setUploadMode] = useState("upsert");
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setBusy(true);
      setError("");
      try {
        const data = await fetchApi(`master/${encodeURIComponent(datasetKey)}`);
        setHeaders(data?.headers || []);
        setRows(data?.rows || []);
      } catch (err) {
        setError(err.message || "Failed to load data");
      } finally {
        setBusy(false);
      }
    }
    load();
  }, [datasetKey, fetchApi]);

  const filteredIndexes = useMemo(() => {
    if (!search.trim()) return rows.map((_, idx) => idx);
    const query = search.toLowerCase();
    return rows
      .map((row, idx) => ({ row, idx }))
      .filter(({ row }) => Object.values(row).join(" ").toLowerCase().includes(query))
      .map(({ idx }) => idx);
  }, [rows, search]);

  const visibleIndexes = filteredIndexes.slice(0, 120);

  const handleCellChange = (rowIndex, key, value) => {
    setRows((prev) => {
      const next = [...prev];
      next[rowIndex] = { ...next[rowIndex], [key]: value };
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await fetchApi(`master/${encodeURIComponent(datasetKey)}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headers, rows }),
      });
      setMessage(`Saved ${result.count || rows.length} rows successfully.`);
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleTemplateDownload = () => {
    if (!headers.length) return;
    const csv = `${headers.join(",")}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `Format_${datasetKey.replace(/\s+/g, "_")}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", uploadMode);
      const response = await fetch(`${API}/master/${encodeURIComponent(datasetKey)}/upload?mode=${uploadMode}`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Upload failed");
      setMessage(
        uploadMode === "replace"
          ? `File replaced. Total rows: ${data.count || 0}`
          : `Upload merged. Updated: ${data.updated || 0}, Inserted: ${data.inserted || 0}`,
      );
      const fresh = await fetchApi(`master/${encodeURIComponent(datasetKey)}`);
      setHeaders(fresh?.headers || []);
      setRows(fresh?.rows || []);
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">
        <div className="dash-header">
          <h1 className="dash-title">Advanced Data Controller</h1>
          <button className="btn-outline" style={{ width: 220 }} onClick={() => goTo("main", { requiresAuth: true })}>
            Back To Master Data
          </button>
        </div>

        <div className="editor-toolbar">
          <input
            className="search-input"
            placeholder="Search live database by keywords..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button className="search-btn" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Commit Changes"}
          </button>
          <button className="btn-outline" onClick={() => setSearch("")}>
            Clear
          </button>
        </div>

        <div className="editor-toolbar editor-toolbar-second">
          <button className="btn-outline" onClick={handleTemplateDownload}>
            Download Format
          </button>
          <select value={uploadMode} onChange={(event) => setUploadMode(event.target.value)} className="compact-select">
            <option value="upsert">Bulk Upload (Merge)</option>
            <option value="replace">Bulk Upload (Replace)</option>
          </select>
          <label className="file-upload-label">
            Upload Excel/CSV
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleUpload} />
          </label>
        </div>

        {message ? <div className="inline-success">{message}</div> : null}
        {error ? <div className="inline-error">{error}</div> : null}
        {busy ? <div className="loading-screen"><div className="loader" /></div> : null}

        {!busy ? (
          <div className="table-wrap">
            <table className="data-table data-table-editor">
              <thead>
                <tr>
                  {headers.map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleIndexes.map((rowIndex) => (
                  <tr key={rowIndex}>
                    {headers.map((header) => (
                      <td key={`${rowIndex}-${header}`}>
                        <input
                          className="table-cell-input"
                          value={String(rows[rowIndex]?.[header] ?? "")}
                          onChange={(event) => handleCellChange(rowIndex, header, event.target.value)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {!busy ? (
          <div className="result-sub" style={{ marginTop: 8 }}>
            Showing {visibleIndexes.length} rows out of {filteredIndexes.length} matching records
          </div>
        ) : null}
      </main>
    </div>
  );
}
