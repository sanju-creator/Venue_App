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

  if (!topoData) {
    return (
      <div className="map-loading" style={{ height: "300px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p>Loading Map...</p>
      </div>
    );
  }

  return (
    <div className="india-map-wrapper" style={{ width: "100%", height: "100%", position: "relative" }}>
      {tooltipContent && (
        <div 
          className="map-tooltip" 
          style={{ 
            position: "absolute", 
            top: "10px", 
            left: "50%", 
            transform: "translateX(-50%)",
            background: "rgba(15, 23, 42, 0.9)",
            color: "#fff",
            padding: "4px 10px",
            borderRadius: "6px",
            fontSize: "12px",
            pointerEvents: "none",
            zIndex: 10,
            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
            border: "1px solid rgba(255,255,255,0.1)"
          }}
        >
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
          center={[82.97, 22.59]} 
          zoom={1}
          minZoom={1}
          maxZoom={1}
          filterZoomEvent={() => {}} // Disable zooming
        >
          <Geographies geography={mapFeatures}>
            {({ geographies }) => (
              <>
                {geographies.map((geo) => {
                  const stateName = geo.properties.st_nm || geo.properties.name;
                  const normalizedName = STATE_NAME_MAPPING[stateName] || stateName;
                  const count = data[normalizedName] || 0;

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
                      onClick={() => {
                        if (onStateClick) onStateClick(normalizedName);
                      }}
                      style={{
                        default: {
                          fill: count > 0 ? colorScale(count) : "#f8fafc",
                          stroke: "#cbd5e1",
                          strokeWidth: 0.5,
                          outline: "none",
                          cursor: "pointer",
                        },
                        hover: {
                          fill: "#3f7fdd",
                          stroke: "#cbd5e1",
                          strokeWidth: 0.7,
                          outline: "none",
                          cursor: "pointer",
                        },
                        pressed: {
                          fill: "#1e40af",
                          outline: "none",
                        },
                      }}
                    />
                  );
                })}
                {geographies.map((geo) => {
                  const centroid = geoCentroid(geo);
                  const stateName = geo.properties.st_nm || geo.properties.name;
                  const normalizedName = STATE_NAME_MAPPING[stateName] || stateName;
                  
                  // Only show label for states with data or major states
                  const count = data[normalizedName] || 0;
                  if (count === 0 && !["Delhi", "Goa"].includes(normalizedName)) return null;

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
      
      <div className="map-legend" style={{ position: "absolute", bottom: "10px", right: "10px", background: "rgba(255,255,255,0.8)", padding: "5px", borderRadius: "4px", fontSize: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <div style={{ width: "12px", height: "12px", background: "#f8fafc", border: "1px solid #cbd5e1" }}></div>
          <span>No Venues</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "2px" }}>
          <div style={{ width: "12px", height: "12px", background: "#1b7bb7" }}></div>
          <span>High Density</span>
        </div>
      </div>
    </div>
  );
}
