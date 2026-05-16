"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
  Marker,
} from "react-simple-maps";
import { scaleQuantile } from "d3-scale";
import { geoCentroid } from "d3-geo";
import { feature } from "topojson-client";

// URL to the topojson file we copied to public/data/
const INDIA_TOPO_JSON = "/data/india.json";

const STATE_NAME_MAPPING = {
  "Andaman & Nicobar Island": "Andaman and Nicobar Islands",
  "Arunanchal Pradesh": "Arunachal Pradesh",
  "DadARA & Nagar Haveli": "Dadra and Nagar Haveli and Daman and Diu",
  "Daman & Diu": "Dadra and Nagar Haveli and Daman and Diu",
  "Jammu & Kashmir": "Jammu and Kashmir",
  "NCT of Delhi": "Delhi",
  "Puducherry": "Puducherry",
  "Odisha": "Odisha",
};

export default function IndiaMap({ data, onStateClick }) {
  const [topoData, setTopoData] = useState(null);
  const [manualResetToIndia, setManualResetToIndia] = useState(false);

  useEffect(() => {
    fetch(INDIA_TOPO_JSON)
      .then((res) => res.json())
      .then((json) => setTopoData(json))
      .catch((err) => console.error("Error loading India map data:", err));
  }, []);

  const colorScale = useMemo(() => {
    const counts = Object.values(data).filter(c => c > 0);
    if (counts.length === 0) {
      return () => "#f8fafc";
    }
    // If only one unique value, scaleQuantile might fail or be boring
    const uniqueCounts = [...new Set(counts)];
    if (uniqueCounts.length === 1) {
      return () => "#4895c6";
    }

    return scaleQuantile()
      .domain(counts)
      .range([
        "#cfe4f3",
        "#a2c9e4",
        "#75afd5",
        "#4895c6",
        "#1b7bb7",
        "#0b61a3",
      ]);
  }, [data]);

  const [tooltipContent, setTooltipContent] = useState("");

  const mapFeatures = useMemo(() => {
    if (!topoData) return null;
    if (topoData.type === "Topology" && topoData.objects && topoData.objects.states) {
      return feature(topoData, topoData.objects.states).features;
    }
    return topoData;
  }, [topoData]);

  const activeStateNames = useMemo(() => {
    return Object.entries(data || {})
      .filter(([, count]) => Number(count) > 0)
      .map(([name]) => name);
  }, [data]);

  const activeStateKey = useMemo(
    () => activeStateNames.slice().sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })).join("|"),
    [activeStateNames],
  );

  useEffect(() => {
    // New search/filter data should re-enable smart zoom.
    setManualResetToIndia(false);
  }, [activeStateKey]);

  const zoomTarget = useMemo(() => {
    if (!mapFeatures || !activeStateNames.length || manualResetToIndia) {
      return { center: [82.97, 22.59], zoom: 1 };
    }

    const activeSet = new Set(activeStateNames);
    const matched = mapFeatures.filter((geo) => {
      const stateName = geo.properties.st_nm || geo.properties.name;
      const normalizedName = STATE_NAME_MAPPING[stateName] || stateName;
      return activeSet.has(normalizedName);
    });

    if (!matched.length) {
      return { center: [82.97, 22.59], zoom: 1 };
    }

    // If many states are active, keep default India framing.
    if (matched.length > 5) {
      return { center: [82.97, 22.59], zoom: 1 };
    }

    const centroids = matched.map((geo) => geoCentroid(geo)).filter((point) =>
      Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]),
    );
    if (!centroids.length) {
      return { center: [82.97, 22.59], zoom: 1 };
    }

    const avgLon = centroids.reduce((sum, point) => sum + point[0], 0) / centroids.length;
    const avgLat = centroids.reduce((sum, point) => sum + point[1], 0) / centroids.length;
    const zoom = matched.length === 1 ? 4.2 : matched.length <= 3 ? 3.1 : 2.35;
    return { center: [avgLon, avgLat], zoom };
  }, [mapFeatures, activeStateNames, manualResetToIndia]);

  const isFocusedView = zoomTarget.zoom > 1 && !manualResetToIndia;

  if (!topoData) {
    return (
      <div className="map-loading" style={{ height: "300px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p>Loading Map...</p>
      </div>
    );
  }

  return (
    <div
      className="india-map-wrapper"
      style={{ width: "100%", height: "100%", position: "relative" }}
      onClick={() => {
        if (!manualResetToIndia && zoomTarget.zoom > 1) {
          setManualResetToIndia(true);
        }
      }}
    >
      {tooltipContent && (
        <div className="map-tooltip">
          {tooltipContent}
        </div>
      )}
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{
          scale: 1000,
          center: [82.97, 22.59], // India center approx
        }}
        style={{ width: "100%", height: "100%" }}
      >
        <ZoomableGroup
          center={zoomTarget.center}
          zoom={zoomTarget.zoom}
          minZoom={1}
          maxZoom={5}
          className="india-map-zoom-group"
          style={{ transition: "transform 550ms ease" }}
          filterZoomEvent={() => { }} // Disable zooming
        >
          <Geographies geography={mapFeatures}>
            {({ geographies }) => (
              <>
                {geographies.map((geo) => {
                  const stateName = geo.properties.st_nm || geo.properties.name;
                  const normalizedName = STATE_NAME_MAPPING[stateName] || stateName;
                  const count = data[normalizedName] || 0;
                  const isActiveState = count > 0;

                  if (isFocusedView && !isActiveState) {
                    return null;
                  }

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onMouseEnter={() => {
                        setTooltipContent(`${normalizedName}: ${count} Venues`);
                      }}
                      onMouseLeave={() => {
                        setTooltipContent("");
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        // If map is currently auto-zoomed, first click returns to India view.
                        if (!manualResetToIndia && zoomTarget.zoom > 1) {
                          setManualResetToIndia(true);
                          return;
                        }
                        if (onStateClick) onStateClick(normalizedName);
                      }}
                      style={{
                        default: {
                          fill: count > 0 ? colorScale(count) : "#f8fafc",
                          stroke: "#cbd5e1",
                          strokeWidth: 0.5,
                          outline: "none",
                          cursor: "pointer",
                          transition: "fill 380ms ease, stroke 380ms ease, opacity 380ms ease",
                        },
                        hover: {
                          fill: "#3f7fdd",
                          stroke: "#cbd5e1",
                          strokeWidth: 0.7,
                          outline: "none",
                          cursor: "pointer",
                          transition: "fill 220ms ease, stroke 220ms ease",
                        },
                        pressed: {
                          fill: "#1e40af",
                          outline: "none",
                          transition: "fill 180ms ease",
                        },
                      }}
                    />
                  );
                })}
                {geographies.map((geo) => {
                  const centroid = geoCentroid(geo);
                  const stateName = geo.properties.st_nm || geo.properties.name;
                  const normalizedName = STATE_NAME_MAPPING[stateName] || stateName;

                  // Show labels only for states that currently have data.
                  const count = data[normalizedName] || 0;
                  if (count === 0) return null;

                  return (
                    <Marker key={geo.rsmKey + "-label"} coordinates={centroid}>
                      <text
                        textAnchor="middle"
                        y={2}
                        style={{
                          fontFamily: "inherit",
                          fill: "#1e293b",
                          fontSize: "10px",
                          fontWeight: "bold",
                          pointerEvents: "none",
                          textShadow: "0px 0px 2px rgba(255,255,255,0.8)"
                        }}
                      >
                        {normalizedName}
                      </text>
                    </Marker>
                  );
                })}
              </>
            )}
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>

      {!isFocusedView && (
        <div className="map-legend">
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <div style={{ width: "12px", height: "12px", background: "#f8fafc", border: "1px solid #cbd5e1" }}></div>
            <span>Low Density</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "2px" }}>
            <div style={{ width: "12px", height: "12px", background: "#1b7bb7" }}></div>
            <span>High Density</span>
          </div>
        </div>
      )}
    </div>
  );
}
