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
import * as d3Geo from "d3-geo";
import { feature } from "topojson-client";

const STATE_TO_FILE = {
  "Andaman and Nicobar Islands": "andaman-and-nicobar-islands.json",
  "Andhra Pradesh": "andhra-pradesh.json",
  "Arunachal Pradesh": "arunachal-pradesh.json",
  "Assam": "assam.json",
  "Bihar": "bihar.json",
  "Chandigarh": "chandigarh.json",
  "Chhattisgarh": "chhattisgarh.json",
  "Delhi": "delhi.json",
  "Dadra and Nagar Haveli and Daman and Diu": "dnh-and-dd.json",
  "Goa": "goa.json",
  "Gujarat": "gujarat.json",
  "Haryana": "haryana.json",
  "Himachal Pradesh": "himachal-pradesh.json",
  "Jammu and Kashmir": "jammu-and-kashmir.json",
  "Jharkhand": "jharkhand.json",
  "Karnataka": "karnataka.json",
  "Kerala": "kerala.json",
  "Ladakh": "ladakh.json",
  "Lakshadweep": "lakshadweep.json",
  "Madhya Pradesh": "madhya-pradesh.json",
  "Maharashtra": "maharashtra.json",
  "Manipur": "manipur.json",
  "Meghalaya": "meghalaya.json",
  "Mizoram": "mizoram.json",
  "Nagaland": "nagaland.json",
  "Odisha": "odisha.json",
  "Puducherry": "puducherry.json",
  "Punjab": "punjab.json",
  "Rajasthan": "rajasthan.json",
  "Sikkim": "sikkim.json",
  "Tamil Nadu": "tamilnadu.json",
  "Telangana": "telangana.json",
  "Tripura": "tripura.json",
  "Uttar Pradesh": "uttar-pradesh.json",
  "Uttarakhand": "uttarakhand.json",
  "West Bengal": "west-bengal.json",
};

export default function StateMap({ stateName, data = {}, onDistrictClick }) {
  const [topoData, setTopoData] = useState(null);
  const [projection, setProjection] = useState(null);
  const [tooltipContent, setTooltipContent] = useState("");

  const fileName = STATE_TO_FILE[stateName];

  useEffect(() => {
    if (!fileName) {
      setTopoData(null);
      return;
    }
    fetch(`/data/states/${fileName}`)
      .then((res) => res.json())
      .then((json) => {
        setTopoData(json);
        
        // Compute the bounding box of the state to center and scale the map
        const objectKey = Object.keys(json.objects)[0];
        const geoJsonData = feature(json, json.objects[objectKey]);
        
        // We calculate a custom projection that fits the specific state geometry
        const proj = d3Geo.geoMercator().fitSize([800, 500], geoJsonData);
        setProjection(() => proj);
      })
      .catch((err) => console.error(`Error loading state map data for ${stateName}:`, err));
  }, [stateName, fileName]);

  const colorScale = useMemo(() => {
    const counts = Object.values(data).filter((c) => c > 0);
    if (counts.length === 0) {
      return () => "#f8fafc";
    }
    const uniqueCounts = [...new Set(counts)];
    if (uniqueCounts.length === 1) {
      return () => "#4895c6";
    }
    return scaleQuantile()
      .domain(counts)
      .range(["#cfe4f3", "#a2c9e4", "#75afd5", "#4895c6", "#1b7bb7", "#0b61a3"]);
  }, [data]);

  if (!fileName) {
    return (
      <div className="map-loading" style={{ height: "400px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p>No map data available for {stateName}</p>
      </div>
    );
  }

  if (!topoData || !projection) {
    return (
      <div className="map-loading" style={{ height: "400px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="loader" />
      </div>
    );
  }

  return (
    <div className="state-map-wrapper" style={{ width: "100%", maxWidth: "800px", height: "500px", margin: "0 auto", position: "relative" }}>
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
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          {tooltipContent}
        </div>
      )}
      <ComposableMap projection={projection} style={{ width: "100%", height: "100%" }}>
        <Geographies geography={topoData}>
          {({ geographies }) => (
            <>
              {geographies.map((geo) => {
                const districtName = geo.properties.dt_name || geo.properties.district || geo.properties.name || "Unknown";
                const count = data[districtName] || 0;

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onMouseEnter={() => setTooltipContent(`${districtName}: ${count} Venues`)}
                    onMouseLeave={() => setTooltipContent("")}
                    onClick={() => {
                      if (onDistrictClick) onDistrictClick(districtName);
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
                const centroid = d3Geo.geoCentroid(geo);
                const districtName = geo.properties.dt_name || geo.properties.district || geo.properties.name || "Unknown";
                
                return (
                  <Marker key={geo.rsmKey + "-label"} coordinates={centroid}>
                    <text
                      textAnchor="middle"
                      y={2}
                      style={{
                        fontFamily: "inherit",
                        fill: "#334155",
                        fontSize: "12px",
                        fontWeight: "600",
                        pointerEvents: "none",
                        textShadow: "0px 0px 2px rgba(255,255,255,0.8)"
                      }}
                    >
                      {districtName}
                    </text>
                  </Marker>
                );
              })}
            </>
          )}
        </Geographies>
      </ComposableMap>
      <div
        className="map-legend"
        style={{
          position: "absolute",
          bottom: "10px",
          right: "10px",
          background: "rgba(255,255,255,0.8)",
          padding: "5px",
          borderRadius: "4px",
          fontSize: "10px",
        }}
      >
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
