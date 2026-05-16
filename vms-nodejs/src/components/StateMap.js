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

export default function StateMap({ stateName, data = {}, onDistrictClick, focusedDistrict = "", focusedVenueRows = [] }) {
  const [topoData, setTopoData] = useState(null);
  const [tooltipContent, setTooltipContent] = useState("");

  const fileName = STATE_TO_FILE[stateName];

  useEffect(() => {
    if (!fileName) {
      setTopoData(null);
      return;
    }
    fetch(`/data/states/${fileName}`)
      .then((res) => res.json())
      .then((json) => setTopoData(json))
      .catch((err) => console.error(`Error loading state map data for ${stateName}:`, err));
  }, [stateName, fileName]);

  const allFeatures = useMemo(() => {
    if (!topoData) return [];
    const objectKey = Object.keys(topoData.objects || {})[0];
    if (!objectKey) return [];
    return feature(topoData, topoData.objects[objectKey]).features || [];
  }, [topoData]);

  const normalizedFocusedDistrict = String(focusedDistrict || "").trim().toLowerCase();
  const focusTokens = useMemo(() => {
    const tokens = new Set();
    if (normalizedFocusedDistrict) tokens.add(normalizedFocusedDistrict);
    (Array.isArray(focusedVenueRows) ? focusedVenueRows : []).forEach((row) => {
      const d = String(row?.district || "").trim().toLowerCase();
      const c = String(row?.city || "").trim().toLowerCase();
      if (d) tokens.add(d);
      if (c) tokens.add(c);
    });
    return Array.from(tokens);
  }, [focusedVenueRows, normalizedFocusedDistrict]);

  const districtMatchesFocus = (districtName) => {
    const name = String(districtName || "").trim().toLowerCase();
    if (!name) return false;
    return focusTokens.some((token) => token && (name.includes(token) || token.includes(name)));
  };

  const displayedFeatures = useMemo(() => {
    if (!focusTokens.length) return allFeatures;
    return allFeatures.filter((geo) => {
      const districtName = geo.properties.dt_name || geo.properties.district || geo.properties.name || "";
      return districtMatchesFocus(districtName);
    });
  }, [allFeatures, focusTokens]);

  const focusedDistrictFeature = useMemo(() => {
    if (!focusTokens.length) return null;
    return allFeatures.find((geo) => {
      const districtName = geo.properties.dt_name || geo.properties.district || geo.properties.name || "";
      return districtMatchesFocus(districtName);
    }) || null;
  }, [allFeatures, focusTokens]);

  const venuePins = useMemo(() => {
    if (!focusTokens.length || !focusedDistrictFeature) return [];
    const source = Array.isArray(focusedVenueRows) ? focusedVenueRows : [];
    if (!source.length) return [];

    const featuresCollection = {
      type: "FeatureCollection",
      features: [focusedDistrictFeature],
    };
    const bounds = d3Geo.geoBounds(featuresCollection);
    const minLon = bounds?.[0]?.[0];
    const minLat = bounds?.[0]?.[1];
    const maxLon = bounds?.[1]?.[0];
    const maxLat = bounds?.[1]?.[1];

    if (![minLon, minLat, maxLon, maxLat].every(Number.isFinite)) return [];

    const venues = source.map((row, idx) => ({
      id: `${idx}-${String(row?.dmsCode || "").trim()}-${String(row?.venueName || "").trim()}`,
      venueName: String(row?.venueName || row?.venue_name || `Venue ${idx + 1}`).trim() || `Venue ${idx + 1}`,
      venueType: String(row?.venueType || "-").trim() || "-",
      capacity: Number(row?.venueMaxCapacity) || 0,
    }));

    const total = venues.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(total)));
    const rows = Math.max(1, Math.ceil(total / cols));
    const lonSpan = Math.max(0.08, maxLon - minLon);
    const latSpan = Math.max(0.08, maxLat - minLat);

    const pins = [];
    venues.forEach((venue, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const lon = minLon + ((col + 1) / (cols + 1)) * lonSpan;
      const lat = maxLat - ((row + 1) / (rows + 1)) * latSpan;
      const point = [lon, lat];
      if (!d3Geo.geoContains(focusedDistrictFeature, point)) return;
      pins.push({ ...venue, coordinates: point });
    });

    if (pins.length === 0) {
      const center = d3Geo.geoCentroid(focusedDistrictFeature);
      return venues.map((venue, index) => ({
        ...venue,
        coordinates: [
          center[0] + ((index % 3) - 1) * 0.03,
          center[1] + (Math.floor(index / 3) - 1) * 0.02,
        ],
      }));
    }

    return pins;
  }, [focusTokens, focusedDistrictFeature, focusedVenueRows]);

  const projection = useMemo(() => {
    if (!allFeatures.length) return null;
    const targetGeoJson = {
      type: "FeatureCollection",
      features: displayedFeatures.length ? displayedFeatures : allFeatures,
    };
    return d3Geo.geoMercator().fitExtent([[35, 35], [765, 465]], targetGeoJson);
  }, [allFeatures, displayedFeatures]);

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
        <div className="map-tooltip">
          {tooltipContent}
        </div>
      )}
      <ComposableMap projection={projection} style={{ width: "100%", height: "100%" }}>
        <Geographies geography={topoData}>
          {({ geographies }) => (
            <>
              {geographies.map((geo) => {
                const districtName = geo.properties.dt_name || geo.properties.district || geo.properties.name || "Unknown";
                if (displayedFeatures.length && !districtMatchesFocus(districtName)) return null;
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
                if (displayedFeatures.length && !districtMatchesFocus(districtName)) return null;
                
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
              {venuePins.map((pin, idx) => (
                <Marker key={`venue-pin-${pin.id}`} coordinates={pin.coordinates}>
                  <g>
                    <circle r={4} fill="#dc2626" stroke="#ffffff" strokeWidth={1.2} />
                    <text
                      x={8}
                      y={idx % 2 === 0 ? -2 : 10}
                      style={{
                        fontFamily: "inherit",
                        fill: "#0f172a",
                        fontSize: "10px",
                        fontWeight: "700",
                        pointerEvents: "none",
                        textShadow: "0px 0px 2px rgba(255,255,255,0.95)",
                      }}
                    >
                      {pin.venueName}
                    </text>
                  </g>
                </Marker>
              ))}
            </>
          )}
        </Geographies>
      </ComposableMap>
      {!focusTokens.length && (
        <div className="map-legend">
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <div style={{ width: "12px", height: "12px", background: "#f8fafc", border: "1px solid #cbd5e1" }}></div>
            <span>No Venues</span>
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
