"use client";

import { useEffect, useMemo, useState } from "react";
import IndiaMap from "@/components/IndiaMap";
import StateMap from "@/components/StateMap";
import { useApp } from "@/context/AppContext";

function toTitleCase(str) {
  return str.replace(
    /\w\S*/g,
    function(txt) {
      return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    }
  );
}

export default function MasterVenueCoverageMapPage() {
  const { API, goTo, masterMapState } = useApp();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  const [selectedState, setSelectedState] = useState(masterMapState || "");
  const [selectedDistrict, setSelectedDistrict] = useState("");

  useEffect(() => {
    async function loadData() {
      setBusy(true);
      setError("");
      try {
        const response = await fetch(`${API}/dashboard/bootstrap`);
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result?.error || "Failed to load map data");
        }
        setData(result);
      } catch (err) {
        setError(err.message || "Failed to load map data");
      } finally {
        setBusy(false);
      }
    }
    loadData();
  }, [API]);

  const rows = useMemo(() => {
    if (!data?.rows) return [];
    // Only DATC and DOTC
    return data.rows.filter((r) => r.venueType === "DATC" || r.venueType === "DOTC");
  }, [data]);

  const stateCounts = useMemo(() => {
    const counts = {};
    rows.forEach((row) => {
      if (row.state) {
        const s = toTitleCase(row.state);
        counts[s] = (counts[s] || 0) + 1;
      }
    });
    return counts;
  }, [rows]);

  const panIndiaSummary = useMemo(() => {
    let datc = 0;
    let dotc = 0;
    let datcCap = 0;
    let dotcCap = 0;

    rows.forEach((r) => {
      const cap = Number(r.venueMaxCapacity) || 0;
      if (r.venueType === "DATC") {
        datc++;
        datcCap += cap;
      } else if (r.venueType === "DOTC") {
        dotc++;
        dotcCap += cap;
      }
    });

    return [
      { type: "DATC", count: datc, capacity: datcCap },
      { type: "DOTC", count: dotc, capacity: dotcCap },
      { type: "GRAND TOTAL", count: datc + dotc, capacity: datcCap + dotcCap },
    ];
  }, [rows]);

  const allStates = useMemo(() => {
    return Array.from(new Set(rows.map((r) => toTitleCase(r.state)))).filter(Boolean).sort();
  }, [rows]);

  const stateOverview = useMemo(() => {
    if (!selectedState) return null;
    let datc = 0;
    let dotc = 0;
    let datcCap = 0;
    let dotcCap = 0;
    let other = 0;
    let otherCap = 0;

    rows.forEach((r) => {
      if (toTitleCase(r.state) === selectedState) {
        const cap = Number(r.venueMaxCapacity) || 0;
        if (r.venueType === "DATC") {
          datc++;
          datcCap += cap;
        } else if (r.venueType === "DOTC") {
          dotc++;
          dotcCap += cap;
        } else {
          other++;
          otherCap += cap;
        }
      }
    });

    return {
      module: selectedState,
      datc,
      dotc,
      datcCap,
      dotcCap,
      total: datc + dotc + other,
      totalCap: datcCap + dotcCap + otherCap
    };
  }, [rows, selectedState]);

  const districtCountsForState = useMemo(() => {
    if (!selectedState) return {};
    const counts = {};
    rows.forEach((r) => {
      if (toTitleCase(r.state) === selectedState && r.district) {
        const d = toTitleCase(r.district);
        counts[d] = (counts[d] || 0) + 1;
      }
    });
    return counts;
  }, [rows, selectedState]);

  const allDistrictsInState = useMemo(() => {
    return Object.keys(districtCountsForState).sort();
  }, [districtCountsForState]);

  const districtOverview = useMemo(() => {
    if (!selectedState || !selectedDistrict) return null;
    let datc = 0;
    let dotc = 0;
    let datcCap = 0;
    let dotcCap = 0;
    let other = 0;
    let otherCap = 0;

    rows.forEach((r) => {
      if (toTitleCase(r.state) === selectedState && toTitleCase(r.district) === selectedDistrict) {
        const cap = Number(r.venueMaxCapacity) || 0;
        if (r.venueType === "DATC") {
          datc++;
          datcCap += cap;
        } else if (r.venueType === "DOTC") {
          dotc++;
          dotcCap += cap;
        } else {
          other++;
          otherCap += cap;
        }
      }
    });

    return {
      module: selectedDistrict,
      datc,
      dotc,
      datcCap,
      dotcCap,
      total: datc + dotc + other,
      totalCap: datcCap + dotcCap + otherCap
    };
  }, [rows, selectedState, selectedDistrict]);

  const handleStateSelect = (e) => {
    setSelectedState(e.target.value);
    setSelectedDistrict("");
  };

  const handleDistrictSelect = (e) => {
    setSelectedDistrict(e.target.value);
  };

  return (
    <div className="map-page-shell">
      <main className="map-page-main">
        <div className="dash-header">
          <h1 className="dash-title">DEXIT Master Venue Coverage Map</h1>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <button className="btn-outline" style={{ width: "auto", minHeight: "40px", padding: "0 20px" }} onClick={() => goTo("dashboard")}>
              Back to Dashboard
            </button>
            <div className="dash-logo">
              <img src="/logo.png" alt="DEXIT Global" className="dash-logo-img" />
            </div>
          </div>
        </div>

        {error ? <div className="inline-error">{error}</div> : null}
        {busy ? <div className="loading-screen"><div className="loader" /></div> : null}

        {!busy && !error && (
          <div className="map-page-content" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            
            <div className="card map-card" style={{ padding: "20px" }}>
              <div style={{ height: "600px", width: "100%" }}>
                <IndiaMap 
                  data={stateCounts} 
                  onStateClick={(st) => {
                    setSelectedState(st);
                    setSelectedDistrict("");
                    setTimeout(() => {
                      document.getElementById("state-overview-section")?.scrollIntoView({ behavior: "smooth" });
                    }, 100);
                  }} 
                />
              </div>
            </div>

            <div className="card">
              <h3 className="section-title">Pan-India DATC & DOTC Network Summary</h3>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Venue Type</th>
                      <th>Venue Count</th>
                      <th>Total Seat Capacity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {panIndiaSummary.map((item, i) => (
                      <tr key={i} className={item.type === "GRAND TOTAL" ? "total-row" : ""}>
                        <td>{item.type}</td>
                        <td>{item.count}</td>
                        <td>{item.capacity.toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card" id="state-overview-section">
              <div className="form-group" style={{ marginBottom: "16px" }}>
                <label>Selected State</label>
                <select className="form-control" value={selectedState} onChange={handleStateSelect}>
                  <option value="">Select a state...</option>
                  {allStates.map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>

              {stateOverview && (
                <>
                  <h3 className="section-title" style={{ textTransform: "uppercase" }}>{selectedState} OVERVIEW</h3>
                  <div className="table-wrap" style={{ marginBottom: "24px" }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Metric</th>
                          <th>DATC</th>
                          <th>DOTC</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td><strong>Centres</strong></td>
                          <td>{stateOverview.datc}</td>
                          <td>{stateOverview.dotc}</td>
                          <td>{stateOverview.total}</td>
                        </tr>
                        <tr>
                          <td><strong>Seat Capacity</strong></td>
                          <td>{stateOverview.datcCap.toLocaleString('en-IN')}</td>
                          <td>{stateOverview.dotcCap.toLocaleString('en-IN')}</td>
                          <td>{stateOverview.totalCap.toLocaleString('en-IN')}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="state-map-container" style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "16px", background: "#f8fafc", marginBottom: "24px" }}>
                    <StateMap 
                      stateName={selectedState} 
                      data={districtCountsForState} 
                      onDistrictClick={(dist) => {
                        setSelectedDistrict(dist);
                        setTimeout(() => {
                          document.getElementById("district-overview-section")?.scrollIntoView({ behavior: "smooth" });
                        }, 100);
                      }}
                    />
                  </div>
                </>
              )}

              {selectedState && (
                <div id="district-overview-section">
                  <div className="form-group" style={{ marginBottom: "16px" }}>
                    <label>Selected District in {selectedState}</label>
                    <select className="form-control" value={selectedDistrict} onChange={handleDistrictSelect}>
                      <option value="">Select a district...</option>
                      {allDistrictsInState.map((dist) => (
                        <option key={dist} value={dist}>{dist}</option>
                      ))}
                    </select>
                  </div>

                  {districtOverview && (
                    <>
                      <h3 className="section-title" style={{ textTransform: "uppercase" }}>{selectedDistrict} OVERVIEW</h3>
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Metric</th>
                              <th>DATC</th>
                              <th>DOTC</th>
                              <th>Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td><strong>Centres</strong></td>
                              <td>{districtOverview.datc}</td>
                              <td>{districtOverview.dotc}</td>
                              <td>{districtOverview.total}</td>
                            </tr>
                            <tr>
                              <td><strong>Seat Capacity</strong></td>
                              <td>{districtOverview.datcCap.toLocaleString('en-IN')}</td>
                              <td>{districtOverview.dotcCap.toLocaleString('en-IN')}</td>
                              <td>{districtOverview.totalCap.toLocaleString('en-IN')}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

          </div>
        )}
      </main>
    </div>
  );
}
