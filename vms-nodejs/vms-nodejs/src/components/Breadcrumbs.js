"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, MapPin, List } from "lucide-react";

export default function Breadcrumbs({ path, onPop, onReset, kpiTitle }) {
  const [isOpen, setIsOpen] = useState(false);

  // Determine the current "deepest" part of the path
  const currentPath = [];
  if (onReset) currentPath.push({ label: "All", onClick: onReset });
  
  const metricLabel = kpiTitle || path.key || path.metric;
  if (metricLabel) {
    currentPath.push({ label: metricLabel, onClick: () => onPop('root') });
  }
  
  if (path.region) currentPath.push({ label: path.region, onClick: () => onPop('region') });
  if (path.state) currentPath.push({ label: path.state, onClick: () => onPop('state') });
  if (path.district) currentPath.push({ label: path.district, onClick: () => onPop('district') });
  if (path.city) currentPath.push({ label: path.city, onClick: () => onPop('city') });
  if (path.venue) currentPath.push({ label: path.venue, isCurrent: true });

  const lastItem = currentPath[currentPath.length - 1];

  return (
    <div className={`compact-breadcrumb-bar ${isOpen ? "is-open" : ""}`}>
      <div className="breadcrumb-bar-main" onClick={() => setIsOpen(!isOpen)}>
        <div className="breadcrumb-bar-trigger">
          <List size={12} />
          <span>Path</span>
        </div>
        <div className="breadcrumb-bar-preview">
          {lastItem?.label || "All"}
        </div>
        <div className="breadcrumb-bar-chevron">
          {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </div>
      </div>

      {isOpen && (
        <div className="breadcrumb-bar-expanded">
          {currentPath.map((item, idx) => (
            <div key={idx} className="breadcrumb-bar-item-wrap">
              {idx > 0 && <span className="breadcrumb-bar-sep">/</span>}
              {item.isCurrent ? (
                <span className="breadcrumb-bar-item current">{item.label}</span>
              ) : (
                <button className="breadcrumb-bar-item link" onClick={item.onClick}>
                  {item.label}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
