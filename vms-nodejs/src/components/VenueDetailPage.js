"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import PersonKundliPanel from "@/components/PersonKundliPanel";
import { useApp } from "@/context/AppContext";

function pretty(value) {
  const text = String(value ?? "").trim();
  if (!text || text.toUpperCase() === "NAN") return "N/A";
  return text;
}

function normalizeDms(value) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function csvCount(value) {
  return String(value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean).length;
}

function splitCsvValues(value) {
  return String(value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeToken(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function normalizePersonKey(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function hasProject(projectsText, projectName) {
  const target = normalizeToken(projectName);
  if (!target) return false;
  return splitCsvValues(projectsText).some((entry) => normalizeToken(entry) === target);
}

function getSourceHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}


export default function VenueDetailPage() {
  const { selectedVenueCode, setSelectedVenueCode, fetchApi, goTo, API, setManpowerFilter, openVenueDetail } = useApp();
  const [searchCode, setSearchCode] = useState(selectedVenueCode || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [venue, setVenue] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [activePhoto, setActivePhoto] = useState("");
  const [occupancyPercent, setOccupancyPercent] = useState(0);
  const [manpower, setManpower] = useState([]);
  const [marketResearch, setMarketResearch] = useState(null);

  // Person Kundli state
  const [selectedManpower, setSelectedManpower] = useState(null);
  const [selectedEmpId, setSelectedEmpId] = useState(null);
  const [personData, setPersonData] = useState(null);
  const [personLoading, setPersonLoading] = useState(false);
  const [personError, setPersonError] = useState("");
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileMaximized, setProfileMaximized] = useState(false);
  const [currentVenueDrillKey, setCurrentVenueDrillKey] = useState("");
  const [currentVenueDeepDetail, setCurrentVenueDeepDetail] = useState(null);
  const [selectedProjectKey, setSelectedProjectKey] = useState("");
  const [projectDrilldown, setProjectDrilldown] = useState(null);
  const [projectDrilldownBusy, setProjectDrilldownBusy] = useState(false);
  const [projectDrilldownError, setProjectDrilldownError] = useState("");
  const [projectDrillLevel, setProjectDrillLevel] = useState("venues");
  const [selectedProjectVenueCode, setSelectedProjectVenueCode] = useState("");
  const [projectVenueSortBy, setProjectVenueSortBy] = useState("score_desc");
  const [projectPeopleSortBy, setProjectPeopleSortBy] = useState("score_desc");
  const currentVenueInfoRef = useRef(null);
  const isMountedRef = useRef(false);
  const autoResearchRequestedRef = useRef(new Set());

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const activePhotoIndex = useMemo(() => {
    if (!photos.length || !activePhoto) return -1;
    return photos.findIndex((photo) => photo === activePhoto);
  }, [photos, activePhoto]);

  const hasMultiplePhotos = photos.length > 1;

  const goToPrevPhoto = useCallback(() => {
    if (!hasMultiplePhotos || activePhotoIndex < 0) return;
    const prevIndex = (activePhotoIndex - 1 + photos.length) % photos.length;
    setActivePhoto(photos[prevIndex]);
  }, [hasMultiplePhotos, activePhotoIndex, photos]);

  const goToNextPhoto = useCallback(() => {
    if (!hasMultiplePhotos || activePhotoIndex < 0) return;
    const nextIndex = (activePhotoIndex + 1) % photos.length;
    setActivePhoto(photos[nextIndex]);
  }, [hasMultiplePhotos, activePhotoIndex, photos]);

  const currentVenueCode = useMemo(
    () =>
      normalizeDms(
        selectedVenueCode || venue?.dms_code || venue?.dmsCode || venue?.venue_code || venue?.code || "",
      ),
    [selectedVenueCode, venue],
  );

  const refreshMarketResearch = useCallback(async () => {
    if (!currentVenueCode || !isMountedRef.current) return;
    try {
      const data = await fetchApi(`venue/${encodeURIComponent(currentVenueCode)}/market-research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!isMountedRef.current) return;
      setMarketResearch(data?.marketResearch || null);
    } catch {
      // Keep existing data if internet refresh fails.
    }
  }, [currentVenueCode, fetchApi]);

  const loadVenue = async (code) => {
    const clean = String(code || "").trim();
    if (!clean) return;
    if (!isMountedRef.current) return;
    setBusy(true);
    setError("");
    setSelectedManpower(null);
    setSelectedEmpId(null);
    setShowProfileModal(false);
    setProfileMaximized(false);
    setCurrentVenueDrillKey("");
    setCurrentVenueDeepDetail(null);
    setSelectedProjectKey("");
    setProjectDrilldown(null);
    setProjectDrilldownBusy(false);
    setProjectDrilldownError("");
    setProjectDrillLevel("venues");
    setSelectedProjectVenueCode("");
    setProjectVenueSortBy("score_desc");
    setProjectPeopleSortBy("score_desc");
    setPersonData(null);
    try {
      const data = await fetchApi(`venue/${encodeURIComponent(clean)}/detail`);
      if (!isMountedRef.current) return;
      setVenue(data?.venue || null);
      setPhotos(data?.photos || []);
      setActivePhoto((data?.photos || [])[0] || "");
      setOccupancyPercent(data?.occupancyPercent || 0);
      setManpower(data?.manpower || []);
      setMarketResearch(data?.marketResearch || null);
      setSelectedVenueCode(clean);
      setSearchCode(clean);
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err.message || "Venue not found");
      setVenue(null);
      setPhotos([]);
      setManpower([]);
      setMarketResearch(null);
    } finally {
      if (isMountedRef.current) setBusy(false);
    }
  };

  const handleSelectPerson = useCallback((person) => {
    setSelectedManpower(person || null);
    setCurrentVenueDrillKey("");
    setCurrentVenueDeepDetail(null);
    if (!person || person.empId !== selectedEmpId) {
      setSelectedEmpId(null);
      setPersonData(null);
      setPersonError("");
    }
  }, [selectedEmpId]);

  const toggleCurrentVenueDrill = useCallback((key) => {
    setCurrentVenueDeepDetail(null);
    setCurrentVenueDrillKey((prev) => (prev === key ? "" : key));
  }, []);

  const loadPersonProfile = useCallback(async (person) => {
    const empId = person?.empId;
    if (!empId) return;
    if (!isMountedRef.current) return;
    setSelectedManpower(person);
    setSelectedEmpId(empId);
    setShowProfileModal(true);
    setProfileMaximized(false);
    setPersonLoading(true);
    setPersonError("");
    setPersonData(null);
    try {
      const data = await fetchApi(`manpower/person/${encodeURIComponent(empId)}`);
      if (!isMountedRef.current) return;
      setPersonData(data);
    } catch (err) {
      if (!isMountedRef.current) return;
      setPersonError(err.message || "Failed to load person profile");
    } finally {
      if (isMountedRef.current) setPersonLoading(false);
    }
  }, [fetchApi]);

  const manpowerByEmpId = useMemo(() => {
    const map = new Map();
    (manpower || []).forEach((person) => {
      const empId = String(person?.empId || "").trim();
      if (!empId || map.has(empId)) return;
      map.set(empId, person);
    });
    return map;
  }, [manpower]);

  const manpowerByNameKey = useMemo(() => {
    const map = new Map();
    (manpower || []).forEach((person) => {
      const key = normalizePersonKey(person?.name);
      if (!key || map.has(key)) return;
      map.set(key, person);
    });
    return map;
  }, [manpower]);

  const resolvePersonForProfile = useCallback((name, empId = "") => {
    const cleanEmpId = String(empId || "").trim();
    if (cleanEmpId && manpowerByEmpId.has(cleanEmpId)) {
      return manpowerByEmpId.get(cleanEmpId);
    }

    const nameKey = normalizePersonKey(name);
    if (!nameKey) return null;

    const exactByName = manpowerByNameKey.get(nameKey);
    if (exactByName) return exactByName;

    const fuzzy = (manpower || []).find((person) => {
      const candidate = normalizePersonKey(person?.name);
      return candidate && (candidate.includes(nameKey) || nameKey.includes(candidate));
    });

    return fuzzy || null;
  }, [manpower, manpowerByEmpId, manpowerByNameKey]);

  const openPersonDetail = useCallback(async (name, empId = "") => {
    const cleanName = String(name || "").trim();
    const cleanEmpId = String(empId || "").trim();
    const matchedPerson = resolvePersonForProfile(name, empId);
    const openManpowerPageForPerson = (resolvedEmpId = "", resolvedName = cleanName) => {
      const searchToken = String(resolvedEmpId || resolvedName || "").trim();
      if (!searchToken) return;
      const payload = {
        search: searchToken,
        dmsCode: currentVenueCode || "",
        focusEmpId: String(resolvedEmpId || "").trim(),
        personName: String(resolvedName || "").trim(),
      };
      setManpowerFilter(payload);
      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem("vms_pending_manpower_filter", JSON.stringify(payload));
        } catch {
          // Ignore storage failures and continue navigation.
        }
      }
      goTo("manpower_dashboard", { requiresAuth: true, allowedUsers: ["Admin", "Prafull"] });
    };

    if (matchedPerson?.empId) {
      openManpowerPageForPerson(matchedPerson.empId, matchedPerson.name || cleanName);
      return;
    }
    if (cleanEmpId) {
      openManpowerPageForPerson(cleanEmpId, cleanName || cleanEmpId);
      return;
    }
    if (!cleanName) return;
    try {
      const query = new URLSearchParams({
        name: cleanName,
        dmsCode: currentVenueCode || "",
      });
      const lookup = await fetchApi(`manpower/person-lookup?${query.toString()}`);
      const resolvedEmpId = String(lookup?.empId || "").trim();
      if (resolvedEmpId) {
        openManpowerPageForPerson(resolvedEmpId, lookup?.name || cleanName);
        return;
      }
      setPersonError(`Profile not found for ${cleanName}.`);
    } catch {
      setPersonError(`Profile not found for ${cleanName}.`);
    }
  }, [currentVenueCode, fetchApi, goTo, resolvePersonForProfile, setManpowerFilter]);

  const closeProfileModal = useCallback(() => {
    setShowProfileModal(false);
    setProfileMaximized(false);
  }, []);

  const focusCurrentVenueInfo = useCallback(() => {
    const node = currentVenueInfoRef.current;
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  useEffect(() => {
    if (selectedVenueCode) {
      const timer = setTimeout(() => {
        loadVenue(selectedVenueCode);
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVenueCode]);

  useEffect(() => {
    if (!venue || !currentVenueCode || !marketResearch) return;
    const hasSources = Array.isArray(marketResearch.sources) && marketResearch.sources.length > 0;
    if (hasSources) return;
    if (autoResearchRequestedRef.current.has(currentVenueCode)) return;
    autoResearchRequestedRef.current.add(currentVenueCode);
    refreshMarketResearch();
  }, [venue, currentVenueCode, marketResearch, refreshMarketResearch]);

  const statusColor = useMemo(() => {
    const status = pretty(venue?.status).toUpperCase();
    if (status === "ACTIVE") return "#16a34a";
    if (status.includes("BLACKLIST")) return "#dc2626";
    return "#64748b";
  }, [venue]);

  const venueSpocPerson = useMemo(
    () => resolvePersonForProfile(venue?.venue_spoc_name, venue?.venue_spoc_emp_id),
    [resolvePersonForProfile, venue?.venue_spoc_name, venue?.venue_spoc_emp_id],
  );

  const channelManagerPerson = useMemo(
    () => resolvePersonForProfile(venue?.channel_manager_name, venue?.channel_manager_emp_id),
    [resolvePersonForProfile, venue?.channel_manager_name, venue?.channel_manager_emp_id],
  );

  const selectedVenueSummary = useMemo(() => {
    if (!selectedManpower) return null;
    const currentVenueCode = normalizeDms(
      selectedVenueCode || venue?.dms_code || venue?.dmsCode || venue?.code || "",
    );
    const fallback = {
      roles: selectedManpower.roles || "N/A",
      projectsText: selectedManpower.projects || "N/A",
      drivesText: "N/A",
      uniqueProjects: csvCount(selectedManpower.projects),
      uniqueDrives: 0,
      uniqueVenues: 1,
      totalRecords: Number(selectedManpower.instanceCount) || 0,
      totalBatches: Number(selectedManpower.instanceCount) || 0,
      fullBatchDelay: 0,
      partialBatchDelay: 0,
      noDelay: 0,
      ffa: 0,
      callLogs: Number(selectedManpower.callLogCount) || 0,
      dmsCode: currentVenueCode || pretty(venue?.dms_code || venue?.dmsCode || "-"),
      venueName: pretty(venue?.venue_name || venue?.name || "-"),
      category: pretty(venue?.category || "-"),
      region: pretty(venue?.region || "-"),
      state: pretty(venue?.state || "-"),
      district: pretty(venue?.district || "-"),
      city: pretty(venue?.city || "-"),
      dateRange: "-",
      fromProfile: false,
    };

    const hasMatchingProfile =
      selectedEmpId &&
      selectedEmpId === selectedManpower.empId &&
      personData &&
      Array.isArray(personData.venueRotation);
    if (!hasMatchingProfile) return fallback;

    const venueRows = personData.venueRotation || [];
    let venueRow = venueRows.find((row) => normalizeDms(row.dmsCode) === currentVenueCode);
    if (!venueRow && venueRows.length === 1) {
      venueRow = venueRows[0];
    }
    if (!venueRow) return fallback;

    return {
      roles: venueRow.roles || fallback.roles,
      projectsText: venueRow.projects || fallback.projectsText,
      drivesText: venueRow.drives || fallback.drivesText,
      uniqueProjects: csvCount(venueRow.projects),
      uniqueDrives: csvCount(venueRow.drives),
      uniqueVenues: 1,
      totalRecords: Number(venueRow.records) || fallback.totalRecords,
      totalBatches: Number(venueRow.totalBatches) || 0,
      fullBatchDelay: Number(venueRow.fullBatchDelay) || 0,
      partialBatchDelay: Number(venueRow.partialBatchDelay) || 0,
      noDelay: Number(venueRow.noDelay) || 0,
      ffa: Number(venueRow.ffa) || 0,
      callLogs: Number(venueRow.callLogs) || 0,
      dmsCode: venueRow.dmsCode || fallback.dmsCode,
      venueName: venueRow.venueName || fallback.venueName,
      category: venueRow.category || fallback.category,
      region: venueRow.region || fallback.region,
      state: venueRow.state || fallback.state,
      district: venueRow.district || fallback.district,
      city: venueRow.city || fallback.city,
      dateRange: venueRow.dateRange || "-",
      fromProfile: true,
    };
  }, [selectedManpower, selectedEmpId, personData, selectedVenueCode, venue]);

  const currentVenueDrilldownData = useMemo(() => {
    if (!selectedVenueSummary || !selectedManpower) return null;
    const projects = splitCsvValues(selectedVenueSummary.projectsText);
    const drives = splitCsvValues(selectedVenueSummary.drivesText);
    const dmsCodeNormalized = normalizeDms(selectedVenueSummary.dmsCode);
    const ffaRows = (personData?.ffaDetails || [])
      .filter((row) => normalizeDms(row.dmsCode) === dmsCodeNormalized)
      .map((row, idx) => ({
        id: `${row.dmsCode}-ffa-${idx}`,
        venue: row.venueName || selectedVenueSummary.venueName,
        dmsCode: row.dmsCode || selectedVenueSummary.dmsCode,
        category: row.category || selectedVenueSummary.category,
        projects: row.projects || selectedVenueSummary.projectsText,
        period: row.dateRange || selectedVenueSummary.dateRange,
        count: Number(row.ffa) || 0,
      }));
    const callLogRows = (personData?.callLogDetails || [])
      .filter((row) => normalizeDms(row.dmsCode) === dmsCodeNormalized)
      .map((row, idx) => ({
        id: `${row.dmsCode}-cl-${idx}`,
        venue: row.venueName || selectedVenueSummary.venueName,
        dmsCode: row.dmsCode || selectedVenueSummary.dmsCode,
        category: row.category || selectedVenueSummary.category,
        projects: row.projects || selectedVenueSummary.projectsText,
        period: row.dateRange || selectedVenueSummary.dateRange,
        count: Number(row.callLogs) || 0,
      }));
    return {
      projects,
      drives,
      ffaRows,
      callLogRows,
    };
  }, [selectedVenueSummary, selectedManpower, personData]);

  const projectReportData = useMemo(() => {
    const byKey = new Map();
    const venueMembers = new Set();
    let venueInstances = 0;
    let venueCallLogs = 0;

    (manpower || []).forEach((person) => {
      const personId = String(person.empId || person.name || "").trim();
      if (personId) venueMembers.add(personId);
      venueInstances += Number(person.instanceCount) || 0;
      venueCallLogs += Number(person.callLogCount) || 0;

      const projectTokens = splitCsvValues(person.projects || "");
      const scopedProjects = projectTokens.length ? projectTokens : ["Unmapped / Not Declared"];

      scopedProjects.forEach((projectLabel) => {
        const project = String(projectLabel || "").trim() || "Unmapped / Not Declared";
        const key = normalizeToken(project);
        if (!key) return;
        if (!byKey.has(key)) {
          byKey.set(key, {
            key,
            project,
            roles: new Set(),
            people: new Map(),
            totalInstances: 0,
            totalCallLogs: 0,
          });
        }
        const bucket = byKey.get(key);
        bucket.totalInstances += Number(person.instanceCount) || 0;
        bucket.totalCallLogs += Number(person.callLogCount) || 0;

        splitCsvValues(person.roles || "").forEach((role) => {
          if (role) bucket.roles.add(role);
        });

        const personKey = String(person.empId || person.name || `${project}-${bucket.people.size}`).trim();
        if (!bucket.people.has(personKey)) {
          bucket.people.set(personKey, {
            person: person.name || "N/A",
            empId: person.empId || "N/A",
            phone: person.phone || "N/A",
            tenure: person.tenure || "-",
            roles: person.roles || "-",
            instances: Number(person.instanceCount) || 0,
            callLogs: Number(person.callLogCount) || 0,
            remarks: person.callLogRemarks || "",
          });
        }
      });
    });

    const rows = Array.from(byKey.values())
      .map((bucket) => ({
        key: bucket.key,
        project: bucket.project,
        memberCount: bucket.people.size,
        totalInstances: bucket.totalInstances,
        totalCallLogs: bucket.totalCallLogs,
        roles: Array.from(bucket.roles),
        members: Array.from(bucket.people.values()).sort(
          (left, right) => (right.instances - left.instances) || (right.callLogs - left.callLogs),
        ),
      }))
      .sort((left, right) => {
        const score = right.memberCount - left.memberCount;
        if (score !== 0) return score;
        return left.project.localeCompare(right.project);
      });

    return {
      rows,
      byKey: new Map(rows.map((row) => [row.key, row])),
      totalProjects: rows.length,
      totalMembers: venueMembers.size,
      totalInstances: venueInstances,
      totalCallLogs: venueCallLogs,
    };
  }, [manpower]);

  const marketExecutiveBrief = useMemo(() => {
    if (!venue && !marketResearch) return null;
    const sanitize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const yesNo = (value) => sanitize(value).toUpperCase() === "YES";
    const venueName = sanitize(marketResearch?.venueName || venue?.venue_name || venue?.name || "Selected Venue");
    const city = sanitize(venue?.city);
    const state = sanitize(venue?.state);
    const location = [city, state].filter(Boolean).join(", ");
    const status = sanitize(venue?.status || marketResearch?.status || "Unknown");
    const confidence = sanitize(marketResearch?.confidence || "Low");
    const capacity = sanitize(venue?.venue_max_capacity);
    const category = sanitize(venue?.category);

    const infraFlags = [
      { label: "CCTV", ok: yesNo(venue?.cctv) },
      { label: "UPS", ok: yesNo(venue?.ups_availability) },
      { label: "Genset", ok: yesNo(venue?.genset_availability) },
      { label: "PWD Access", ok: yesNo(venue?.pwd_venue) },
    ];
    const infraReadyCount = infraFlags.filter((item) => item.ok).length;
    const infraTotal = infraFlags.length;

    const sources = Array.isArray(marketResearch?.sources) ? marketResearch.sources : [];
    const sourceCount = sources.length;
    const topDomains = Array.from(
      new Set(
        sources
          .map((item) => sanitize(getSourceHost(item?.url || "")))
          .filter(Boolean),
      ),
    ).slice(0, 4);

    const recommendation =
      confidence.toLowerCase() === "high"
        ? "Proceed with planning review, while keeping final scheduling contingent on current on-ground readiness checks."
        : "Treat this as a preliminary assessment and complete operational due diligence before any final commitment.";

    return {
      title: `${venueName}${location ? ` (${location})` : ""}`,
      paragraph: `${venueName} is currently assessed as ${status || "operationally unclassified"} with ${confidence.toLowerCase()} confidence based on available public references and internal profile data.`,
      highlights: [
        `External validation coverage: ${sourceCount} public source${sourceCount === 1 ? "" : "s"}${topDomains.length ? ` (${topDomains.join(", ")})` : ""}.`,
        `Internal readiness snapshot: ${infraReadyCount}/${infraTotal} key infra controls marked available (${infraFlags.map((f) => `${f.label}: ${f.ok ? "Yes" : "No"}`).join(", ")}).`,
        `Capacity profile: ${capacity || "Not reported"} seats${category ? ` | Category ${category}` : ""}.`,
        `Assessment confidence: ${confidence}.`,
      ],
      recommendation,
      status,
      confidence,
      updatedAt: sanitize(marketResearch?.lastResearchedAt),
    };
  }, [marketResearch, venue]);

  const selectedProjectReport = useMemo(() => {
    if (!selectedProjectKey) return null;
    return projectReportData.byKey.get(selectedProjectKey) || null;
  }, [selectedProjectKey, projectReportData]);

  useEffect(() => {
    const loadProjectDrilldown = async () => {
      if (!selectedProjectReport?.project) {
        setProjectDrilldown(null);
        setProjectDrilldownError("");
        setProjectDrilldownBusy(false);
        setSelectedProjectVenueCode("");
        setProjectDrillLevel("venues");
        return;
      }
      setProjectDrilldownBusy(true);
      setProjectDrilldownError("");
      try {
        const query = new URLSearchParams({
          project: selectedProjectReport.project,
          venueCode: currentVenueCode || "",
        });
        const data = await fetchApi(`manpower/project-drilldown?${query.toString()}`);
        if (!isMountedRef.current) return;
        setProjectDrilldown(data || null);
        const currentVenueMatch = (data?.venues || []).find((row) => row.isCurrentVenue);
        setSelectedProjectVenueCode(currentVenueMatch?.dmsCode || "");
        setProjectDrillLevel("venues");
      } catch (err) {
        if (!isMountedRef.current) return;
        setProjectDrilldown(null);
        const rawMessage = err?.message || "";
        if (rawMessage.includes("(404)")) {
          setProjectDrilldownError("Live project drill-down API not available (404). Showing current venue snapshot.");
        } else {
          setProjectDrilldownError(rawMessage || "Failed to load project drill-down.");
        }
      } finally {
        if (isMountedRef.current) setProjectDrilldownBusy(false);
      }
    };
    loadProjectDrilldown();
  }, [selectedProjectReport, currentVenueCode, fetchApi]);

  const projectVenueRows = useMemo(() => {
    if (Array.isArray(projectDrilldown?.venues) && projectDrilldown.venues.length) return projectDrilldown.venues;
    if (!selectedProjectReport) return [];
    return [{
      dmsCode: selectedVenueSummary?.dmsCode || currentVenueCode || "-",
      venueName: selectedVenueSummary?.venueName || pretty(venue?.venue_name || venue?.name),
      category: selectedVenueSummary?.category || pretty(venue?.category || "-"),
      region: selectedVenueSummary?.region || pretty(venue?.region || "-"),
      state: selectedVenueSummary?.state || pretty(venue?.state || "-"),
      district: selectedVenueSummary?.district || pretty(venue?.district || "-"),
      city: selectedVenueSummary?.city || pretty(venue?.city || "-"),
      peopleCount: selectedProjectReport.memberCount || 0,
      roleCount: selectedProjectReport.roles?.length || 0,
      totalBatches: selectedProjectReport.totalInstances || 0,
      fullBatchDelay: 0,
      partialBatchDelay: 0,
      noDelay: selectedProjectReport.totalInstances || 0,
      ffa: 0,
      callLogs: selectedProjectReport.totalCallLogs || 0,
      score: 0,
      isCurrentVenue: true,
    }];
  }, [projectDrilldown, selectedProjectReport, selectedVenueSummary, currentVenueCode, venue]);

  const projectPeopleRows = useMemo(() => {
    if (Array.isArray(projectDrilldown?.people) && projectDrilldown.people.length) {
      let rows = projectDrilldown.people;
      if (selectedProjectVenueCode) {
        rows = rows.filter((row) =>
          Array.isArray(row.venueCodes) && row.venueCodes.some((code) => normalizeDms(code) === normalizeDms(selectedProjectVenueCode)),
        );
      }
      return rows;
    }
    if (!selectedProjectReport) return [];
    return selectedProjectReport.members.map((member) => ({
      personName: member.person,
      empId: member.empId,
      phone: member.phone,
      tenure: member.tenure,
      roles: member.roles,
      venueCodes: [selectedVenueSummary?.dmsCode || currentVenueCode || ""],
      venueCoverage: 1,
      totalBatches: member.instances || 0,
      fullBatchDelay: 0,
      partialBatchDelay: 0,
      noDelay: member.instances || 0,
      ffa: 0,
      callLogs: member.callLogs || 0,
      score: 0,
      assignedToCurrentVenue: true,
      remarks: member.remarks || "",
    }));
  }, [projectDrilldown, selectedProjectVenueCode, selectedProjectReport, selectedVenueSummary, currentVenueCode]);

  const sortedProjectVenueRows = useMemo(() => {
    const rows = [...projectVenueRows];
    const compareText = (left, right) => String(left || "").localeCompare(String(right || ""), "en", { sensitivity: "base" });
    if (projectVenueSortBy === "batches_desc") rows.sort((a, b) => (Number(b.totalBatches || 0) - Number(a.totalBatches || 0)) || compareText(a.venueName, b.venueName));
    else if (projectVenueSortBy === "calls_desc") rows.sort((a, b) => (Number(b.callLogs || 0) - Number(a.callLogs || 0)) || compareText(a.venueName, b.venueName));
    else rows.sort((a, b) => (Number(b.score || 0) - Number(a.score || 0)) || compareText(a.venueName, b.venueName));
    return rows;
  }, [projectVenueRows, projectVenueSortBy]);

  const sortedProjectPeopleRows = useMemo(() => {
    const rows = [...projectPeopleRows];
    const compareText = (left, right) => String(left || "").localeCompare(String(right || ""), "en", { sensitivity: "base" });
    if (projectPeopleSortBy === "batches_desc") rows.sort((a, b) => (Number(b.totalBatches || 0) - Number(a.totalBatches || 0)) || compareText(a.personName, b.personName));
    else if (projectPeopleSortBy === "calls_desc") rows.sort((a, b) => (Number(b.callLogs || 0) - Number(a.callLogs || 0)) || compareText(a.personName, b.personName));
    else rows.sort((a, b) => (Number(b.score || 0) - Number(a.score || 0)) || compareText(a.personName, b.personName));
    return rows;
  }, [projectPeopleRows, projectPeopleSortBy]);

  const showProjectFallbackNote = useMemo(
    () =>
      Boolean(
        projectDrilldownError &&
          !projectDrilldownBusy &&
          !projectDrilldown &&
          selectedProjectReport &&
          (projectVenueRows.length > 0 || projectPeopleRows.length > 0),
      ),
    [projectDrilldownError, projectDrilldownBusy, projectDrilldown, selectedProjectReport, projectVenueRows.length, projectPeopleRows.length],
  );

  const downloadProjectDrillCsv = useCallback(() => {
    if (!selectedProjectReport) return;
    const projectSlug = normalizeToken(selectedProjectReport.project || "project").replace(/\s+/g, "_");
    const isVenueView = projectDrillLevel === "venues";
    const headers = isVenueView
      ? ["Venue", "DMS", "Category", "People", "Total Batches", "No Delay", "Call Logs", "Score"]
      : ["Person", "Employee ID", "Phone", "Tenure", "Roles", "Venue Coverage", "Total Batches", "No Delay", "Call Logs", "Score"];
    const rows = isVenueView
      ? sortedProjectVenueRows.map((row) => [
          row.venueName || "",
          row.dmsCode || "",
          row.category || "",
          Number(row.peopleCount || 0),
          Number(row.totalBatches || 0),
          Number(row.noDelay || 0),
          Number(row.callLogs || 0),
          Number(row.score || 0),
        ])
      : sortedProjectPeopleRows.map((row) => [
          row.personName || "",
          row.empId || "",
          row.phone || "",
          row.tenure || "",
          row.roles || "",
          Number(row.venueCoverage || 0),
          Number(row.totalBatches || 0),
          Number(row.noDelay || 0),
          Number(row.callLogs || 0),
          Number(row.score || 0),
        ]);

    const toCsvCell = (value) => {
      const text = String(value ?? "");
      if (/[",\n]/.test(text)) return `"${text.replace(/"/g, "\"\"")}"`;
      return text;
    };
    const csvText = [headers, ...rows].map((line) => line.map(toCsvCell).join(",")).join("\n");
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${projectSlug}_${isVenueView ? "venue_performance" : "person_performance"}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [projectDrillLevel, selectedProjectReport, sortedProjectPeopleRows, sortedProjectVenueRows]);

  const renderCurrentVenueDrilldown = () => {
    if (!selectedVenueSummary || !currentVenueDrillKey || !currentVenueDrilldownData) return null;
    const metrics = {
      projects: {
        title: "Projects In Current Venue",
        columns: [{ key: "project", label: "Project Name" }],
        rows: currentVenueDrilldownData.projects.map((project) => ({ project })),
        empty: "No project details available for this venue.",
        onRowClick: (row) => {
          const projectPeople = (manpower || []).filter((person) => hasProject(person.projects, row.project));
          const fallbackPeople = projectPeople.length ? projectPeople : selectedManpower ? [selectedManpower] : [];
          const totalPersons = fallbackPeople.length;
          const totalInstances = fallbackPeople.reduce((sum, person) => sum + (Number(person.instanceCount) || 0), 0);
          const totalCallLogs = fallbackPeople.reduce((sum, person) => sum + (Number(person.callLogCount) || 0), 0);
          const uniqueRoles = Array.from(
            new Set(
              fallbackPeople
                .flatMap((person) => splitCsvValues(person.roles || ""))
                .filter(Boolean),
            ),
          );
          setCurrentVenueDeepDetail({
            breadcrumb: "Current Venue Info > Projects > Detail",
            title: `Project Deep Detail: ${row.project}`,
            summaryStats: [
              { label: "Project", value: row.project || "N/A" },
              { label: "Persons Working", value: totalPersons },
              { label: "Total Instances", value: totalInstances },
              { label: "Total Call Logs", value: totalCallLogs },
              { label: "Unique Roles", value: uniqueRoles.length },
              { label: "Venue", value: selectedVenueSummary.venueName || "-" },
            ],
            columns: [
              { key: "person", label: "Person" },
              { key: "empId", label: "Employee ID" },
              { key: "phone", label: "Phone" },
              { key: "roles", label: "Roles" },
              { key: "tenure", label: "Tenure" },
              { key: "instances", label: "Instances" },
              { key: "callLogs", label: "Call Logs" },
            ],
            rows: fallbackPeople.map((person) => ({
              person: person.name || "N/A",
              empId: person.empId || "N/A",
              phone: person.phone || "N/A",
              roles: person.roles || "-",
              tenure: person.tenure || "-",
              instances: Number(person.instanceCount) || 0,
              callLogs: Number(person.callLogCount) || 0,
            })),
            empty: "No manpower project detail available for this project.",
          });
        },
      },
      drives: {
        title: "Drives In Current Venue",
        columns: [{ key: "drive", label: "Drive Name" }],
        rows: currentVenueDrilldownData.drives.map((drive) => ({ drive })),
        empty: "No drive details available for this venue.",
        onRowClick: (row) =>
          setCurrentVenueDeepDetail({
            title: `Drive Deep Detail: ${row.drive}`,
            columns: [
              { key: "projects", label: "Projects" },
              { key: "batches", label: "Batches" },
              { key: "fullDelay", label: "Full Delay" },
              { key: "partial", label: "Partial" },
              { key: "noDelay", label: "No Delay" },
              { key: "callLogs", label: "Call Logs" },
            ],
            rows: [
              {
                projects: selectedVenueSummary.projectsText || "-",
                batches: selectedVenueSummary.totalBatches || 0,
                fullDelay: selectedVenueSummary.fullBatchDelay || 0,
                partial: selectedVenueSummary.partialBatchDelay || 0,
                noDelay: selectedVenueSummary.noDelay || 0,
                callLogs: selectedVenueSummary.callLogs || 0,
              },
            ],
            empty: "No deep detail available for this drive.",
          }),
      },
      venues: {
        title: "Current Venue Mapping",
        columns: [
          { key: "venue", label: "Venue" },
          { key: "dmsCode", label: "DMS" },
          { key: "category", label: "Category" },
          { key: "region", label: "Region" },
          { key: "state", label: "State" },
          { key: "district", label: "District" },
          { key: "city", label: "City" },
        ],
        rows: [{
          venue: selectedVenueSummary.venueName,
          dmsCode: selectedVenueSummary.dmsCode,
          category: selectedVenueSummary.category,
          region: selectedVenueSummary.region,
          state: selectedVenueSummary.state,
          district: selectedVenueSummary.district,
          city: selectedVenueSummary.city,
        }],
        empty: "Venue mapping not available.",
        onRowClick: (row) =>
          setCurrentVenueDeepDetail({
            title: `Venue Deep Detail: ${row.venue}`,
            columns: [
              { key: "roles", label: "Roles" },
              { key: "projects", label: "Projects" },
              { key: "drives", label: "Drives" },
              { key: "records", label: "Records" },
              { key: "period", label: "Period" },
              { key: "source", label: "Source" },
            ],
            rows: [{
              roles: selectedVenueSummary.roles || "-",
              projects: selectedVenueSummary.projectsText || "-",
              drives: selectedVenueSummary.drivesText || "-",
              records: selectedVenueSummary.totalRecords || 0,
              period: selectedVenueSummary.dateRange || "-",
              source: selectedVenueSummary.fromProfile ? "Profile data (venue filtered)" : "Venue list aggregate",
            }],
          }),
      },
      records: {
        title: "Record Scope Details",
        columns: [
          { key: "employee", label: "Employee" },
          { key: "empId", label: "Emp ID" },
          { key: "records", label: "Records" },
          { key: "period", label: "Period" },
          { key: "roles", label: "Roles" },
          { key: "source", label: "Source" },
        ],
        rows: [{
          employee: selectedManpower.name || "-",
          empId: selectedManpower.empId || "-",
          records: selectedVenueSummary.totalRecords,
          period: selectedVenueSummary.dateRange || "-",
          roles: selectedVenueSummary.roles || "-",
          source: selectedVenueSummary.fromProfile ? "Profile data (venue filtered)" : "Venue list aggregate",
        }],
        empty: "Record details unavailable.",
        onRowClick: () =>
          setCurrentVenueDeepDetail({
            title: "Record Source Deep Detail",
            columns: [
              { key: "instances", label: "Instances" },
              { key: "totalBatches", label: "Total Batches" },
              { key: "ffa", label: "FFA" },
              { key: "callLogs", label: "Call Logs" },
              { key: "coverage", label: "Coverage Type" },
            ],
            rows: [{
              instances: selectedManpower.instanceCount ?? 0,
              totalBatches: selectedVenueSummary.totalBatches ?? 0,
              ffa: selectedVenueSummary.ffa ?? 0,
              callLogs: selectedVenueSummary.callLogs ?? 0,
              coverage: selectedVenueSummary.fromProfile ? "Current venue exact" : "Current venue inferred",
            }],
          }),
      },
      batches: {
        title: "Batch Breakdown (Current Venue)",
        columns: [
          { key: "total", label: "Total" },
          { key: "fullDelay", label: "Full Delay" },
          { key: "partial", label: "Partial" },
          { key: "noDelay", label: "No Delay" },
          { key: "ffa", label: "FFA" },
          { key: "callLogs", label: "Call Logs" },
        ],
        rows: [{
          total: selectedVenueSummary.totalBatches,
          fullDelay: selectedVenueSummary.fullBatchDelay,
          partial: selectedVenueSummary.partialBatchDelay,
          noDelay: selectedVenueSummary.noDelay,
          ffa: selectedVenueSummary.ffa,
          callLogs: selectedVenueSummary.callLogs,
        }],
        empty: "Batch details unavailable.",
        onRowClick: () =>
          setCurrentVenueDeepDetail({
            title: "Batch Ratio Deep Detail",
            columns: [
              { key: "metric", label: "Metric" },
              { key: "value", label: "Value" },
              { key: "ratio", label: "Ratio vs Total" },
            ],
            rows: [
              {
                metric: "Full Delay",
                value: selectedVenueSummary.fullBatchDelay,
                ratio: selectedVenueSummary.totalBatches > 0
                  ? `${Math.round((selectedVenueSummary.fullBatchDelay / selectedVenueSummary.totalBatches) * 100)}%`
                  : "N/A",
              },
              {
                metric: "Partial",
                value: selectedVenueSummary.partialBatchDelay,
                ratio: selectedVenueSummary.totalBatches > 0
                  ? `${Math.round((selectedVenueSummary.partialBatchDelay / selectedVenueSummary.totalBatches) * 100)}%`
                  : "N/A",
              },
              {
                metric: "No Delay",
                value: selectedVenueSummary.noDelay,
                ratio: selectedVenueSummary.totalBatches > 0
                  ? `${Math.round((selectedVenueSummary.noDelay / selectedVenueSummary.totalBatches) * 100)}%`
                  : "N/A",
              },
            ],
          }),
      },
      fullDelay: {
        title: "Full Delay Drilldown",
        columns: [
          { key: "venue", label: "Venue" },
          { key: "dmsCode", label: "DMS" },
          { key: "fullDelay", label: "Full Delay" },
          { key: "totalBatches", label: "Total Batches" },
          { key: "period", label: "Period" },
        ],
        rows: selectedVenueSummary.fullBatchDelay > 0
          ? [{
            venue: selectedVenueSummary.venueName,
            dmsCode: selectedVenueSummary.dmsCode,
            fullDelay: selectedVenueSummary.fullBatchDelay,
            totalBatches: selectedVenueSummary.totalBatches,
            period: selectedVenueSummary.dateRange || "-",
          }]
          : [],
        empty: "No full-delay incidents in this venue for selected person.",
      },
      partial: {
        title: "Partial Delay Drilldown",
        columns: [
          { key: "venue", label: "Venue" },
          { key: "dmsCode", label: "DMS" },
          { key: "partial", label: "Partial Delay" },
          { key: "totalBatches", label: "Total Batches" },
          { key: "period", label: "Period" },
        ],
        rows: selectedVenueSummary.partialBatchDelay > 0
          ? [{
            venue: selectedVenueSummary.venueName,
            dmsCode: selectedVenueSummary.dmsCode,
            partial: selectedVenueSummary.partialBatchDelay,
            totalBatches: selectedVenueSummary.totalBatches,
            period: selectedVenueSummary.dateRange || "-",
          }]
          : [],
        empty: "No partial-delay incidents in this venue for selected person.",
      },
      noDelay: {
        title: "No Delay Drilldown",
        columns: [
          { key: "venue", label: "Venue" },
          { key: "dmsCode", label: "DMS" },
          { key: "noDelay", label: "No Delay" },
          { key: "totalBatches", label: "Total Batches" },
          { key: "ratio", label: "Clean Ratio" },
        ],
        rows: selectedVenueSummary.noDelay > 0
          ? [{
            venue: selectedVenueSummary.venueName,
            dmsCode: selectedVenueSummary.dmsCode,
            noDelay: selectedVenueSummary.noDelay,
            totalBatches: selectedVenueSummary.totalBatches,
            ratio: selectedVenueSummary.totalBatches > 0
              ? `${Math.round((selectedVenueSummary.noDelay / selectedVenueSummary.totalBatches) * 100)}%`
              : "N/A",
          }]
          : [],
        empty: "No clean (no-delay) records in this venue for selected person.",
      },
      ffa: {
        title: "FFA Drilldown (Current Venue)",
        columns: [
          { key: "venue", label: "Venue" },
          { key: "dmsCode", label: "DMS" },
          { key: "category", label: "Category" },
          { key: "projects", label: "Projects" },
          { key: "period", label: "Period" },
          { key: "count", label: "FFA Count" },
        ],
        rows: currentVenueDrilldownData.ffaRows,
        empty: "No FFA incidents found for current venue.",
        onRowClick: (row) =>
          setCurrentVenueDeepDetail({
            title: `FFA Incident Detail: ${row.venue}`,
            columns: [
              { key: "dmsCode", label: "DMS" },
              { key: "category", label: "Category" },
              { key: "projects", label: "Projects" },
              { key: "period", label: "Period" },
              { key: "count", label: "FFA Count" },
              { key: "callLogs", label: "Mapped Call Logs" },
            ],
            rows: [{
              dmsCode: row.dmsCode,
              category: row.category,
              projects: row.projects,
              period: row.period,
              count: row.count,
              callLogs: currentVenueDrilldownData.callLogRows.reduce((sum, item) => sum + Number(item.count || 0), 0),
            }],
          }),
      },
      callLogs: {
        title: "Call Logs Drilldown (Current Venue)",
        columns: [
          { key: "venue", label: "Venue" },
          { key: "dmsCode", label: "DMS" },
          { key: "category", label: "Category" },
          { key: "projects", label: "Projects" },
          { key: "period", label: "Period" },
          { key: "count", label: "Call Logs" },
        ],
        rows: currentVenueDrilldownData.callLogRows,
        empty: "No call log incidents found for current venue.",
        onRowClick: (row) =>
          setCurrentVenueDeepDetail({
            title: `Call Log Incident Detail: ${row.venue}`,
            columns: [
              { key: "dmsCode", label: "DMS" },
              { key: "category", label: "Category" },
              { key: "projects", label: "Projects" },
              { key: "period", label: "Period" },
              { key: "count", label: "Call Logs" },
              { key: "ffa", label: "Mapped FFA" },
            ],
            rows: [{
              dmsCode: row.dmsCode,
              category: row.category,
              projects: row.projects,
              period: row.period,
              count: row.count,
              ffa: currentVenueDrilldownData.ffaRows.reduce((sum, item) => sum + Number(item.count || 0), 0),
            }],
          }),
      },
    };
    const entry = metrics[currentVenueDrillKey];
    if (!entry) return null;
    const metricLabelMap = {
      projects: "Projects",
      drives: "Drives",
      venues: "Venues",
      records: "Records",
      batches: "Batches",
      fullDelay: "Full Delay",
      partial: "Partial",
      noDelay: "No Delay",
      ffa: "FFA",
      callLogs: "Call Logs",
    };
    const deepBreadcrumb = currentVenueDeepDetail?.breadcrumb || `Current Venue Info > ${metricLabelMap[currentVenueDrillKey] || "Metric"} > Detail`;
    return (
      <div className="pk-venue-drilldown-panel">
        <div className="pk-venue-drilldown-head">
          <strong>{entry.title}</strong>
          <button
            className="mp-back-small-btn"
            onClick={() => {
              setCurrentVenueDrillKey("");
              setCurrentVenueDeepDetail(null);
            }}
          >
            Close Drilldown
          </button>
        </div>
        {entry.rows.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>{entry.columns.map((col) => <th key={`${currentVenueDrillKey}-${col.key}`}>{col.label}</th>)}</tr>
              </thead>
              <tbody>
                {entry.rows.map((row, rowIdx) => (
                  <tr
                    key={`${currentVenueDrillKey}-row-${rowIdx}`}
                    className={entry.onRowClick ? "pk-drill-row" : undefined}
                    onClick={entry.onRowClick ? () => entry.onRowClick(row, rowIdx) : undefined}
                  >
                    {entry.columns.map((col) => <td key={`${currentVenueDrillKey}-${col.key}-${rowIdx}`}>{row[col.key]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="photo-placeholder" style={{ height: "auto", padding: "20px", borderStyle: "dashed" }}>
            {entry.empty}
          </div>
        )}
        {currentVenueDeepDetail ? (
          <div className="pk-venue-drilldown-panel" style={{ marginTop: "10px" }}>
            <div className="pk-venue-drilldown-head">
              <div>
                <div className="pk-breadcrumb-lite">{deepBreadcrumb}</div>
                <strong>{currentVenueDeepDetail.title}</strong>
              </div>
              <div className="pk-deep-actions">
                {selectedManpower ? <button className="mp-back-small-btn" onClick={() => loadPersonProfile(selectedManpower)}>Open Complete Details</button> : null}
                <button className="mp-back-small-btn" onClick={focusCurrentVenueInfo}>Sync Current Venue</button>
                <button className="mp-back-small-btn" onClick={() => setCurrentVenueDeepDetail(null)}>Back</button>
              </div>
            </div>
            {currentVenueDeepDetail.summaryStats?.length ? (
              <div className="pk-deep-summary-grid" style={{ marginBottom: "10px" }}>
                {currentVenueDeepDetail.summaryStats.map((item, idx) => (
                  <div className="pk-deep-summary-box" key={`deep-summary-${idx}`}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            ) : null}
            {currentVenueDeepDetail.rows?.length ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>{currentVenueDeepDetail.columns.map((col) => <th key={`deep-${col.key}`}>{col.label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {currentVenueDeepDetail.rows.map((row, rowIdx) => (
                      <tr key={`deep-row-${rowIdx}`}>
                        {currentVenueDeepDetail.columns.map((col) => <td key={`deep-${col.key}-${rowIdx}`}>{row[col.key]}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="photo-placeholder" style={{ height: "auto", padding: "20px", borderStyle: "dashed" }}>
                {currentVenueDeepDetail.empty || "No deep detail found."}
              </div>
            )}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">
        <div className="dash-header">
          <h1 className="dash-title">Venue Detail</h1>
          <button className="btn-outline" style={{ width: 220 }} onClick={() => goTo("dashboard")}>
            Back to Dashboard
          </button>
        </div>

        <div className="search-card">
          <div className="search-title">Quick Search Other Venues</div>
          <div className="search-flex">
            <input
              className="search-input"
              placeholder="Enter DMS code, e.g. EST-AR-1161"
              value={searchCode}
              onChange={(event) => setSearchCode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  loadVenue(searchCode);
                }
              }}
            />
            <button className="search-btn" onClick={() => loadVenue(searchCode)}>
              Search
            </button>
          </div>
        </div>

        {error ? <div className="inline-error">{error}</div> : null}
        {busy ? <div className="loading-screen"><div className="loader" /></div> : null}

        {!busy && venue ? (
          <>
            <div className="venue-hero">
              <div>
                <div className="venue-name">{pretty(venue.venue_name || venue.name)}</div>
                <div className="venue-sub">
                  {pretty(venue.dms_code)} | {pretty(venue.venue_type)}
                </div>
              </div>
              <div className="status-pill" style={{ borderColor: statusColor, color: statusColor }}>
                {pretty(venue.status)}
              </div>
            </div>

            {/* Status Alert Banner */}
            {(() => {
              const st = pretty(venue.status).toUpperCase();
              const isBL = st.includes("BLACKLIST");
              const isActive = st === "ACTIVE";
              const bannerClass = isActive ? "status-banner-active" : isBL ? "status-banner-blacklisted" : "status-banner-inactive";
              const icon = isActive ? "\u2705" : isBL ? "\u26a0\ufe0f" : "\u2014";
              const msg = isActive ? "This venue is currently active and operational" : isBL ? "\u26a0 ATTENTION: This venue is blacklisted \u2014 review required before any assignment" : "This venue is currently inactive";
              return (
                <div className={`status-banner ${bannerClass}`}>
                  <span className="status-banner-icon">{icon}</span>
                  <div className="status-banner-text">
                    <div>{msg}</div>
                    <div className="status-banner-label">Status: {pretty(venue.status)}</div>
                  </div>
                </div>
              );
            })()}

            <div className="venue-grid">
              <div className="venue-card">
                <div className="venue-card-title">Venue Photo</div>
                {activePhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`${API.replace(/\/api$/, "")}${activePhoto}`} alt="Venue" className="venue-main-photo" />
                ) : (
                  <div className="photo-placeholder">Photo Not Available</div>
                )}
                {photos.length ? (
                  <div className="photo-toggle-row">
                    <button
                      type="button"
                      className="photo-toggle-btn"
                      onClick={goToPrevPhoto}
                      disabled={!hasMultiplePhotos}
                    >
                      Prev
                    </button>
                    <div className="photo-toggle-index">
                      {activePhotoIndex >= 0 ? activePhotoIndex + 1 : 1} / {photos.length}
                    </div>
                    <button
                      type="button"
                      className="photo-toggle-btn"
                      onClick={goToNextPhoto}
                      disabled={!hasMultiplePhotos}
                    >
                      Next
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="venue-card">
                <div className="venue-card-title">Location Profile</div>
                <div className="kv-row"><span>Region</span><strong>{pretty(venue.region)}</strong></div>
                <div className="kv-row"><span>State</span><strong>{pretty(venue.state)}</strong></div>
                <div className="kv-row"><span>City</span><strong>{pretty(venue.city)}</strong></div>
                <div className="kv-row"><span>District</span><strong>{pretty(venue.district)}</strong></div>
                <div className="kv-row"><span>Pincode</span><strong>{pretty(venue.pincode)}</strong></div>
                <div className="kv-row"><span>Landmark</span><strong>{pretty(venue.landmark)}</strong></div>
                <div className="address-box">{pretty(venue.complete_address)}</div>
              </div>

              <div className="venue-card">
                <div className="venue-card-title">Key Metrics</div>
                <div className="metric-mini"><span>Max Capacity</span><strong>{pretty(venue.venue_max_capacity)}</strong></div>
                <div className="metric-mini"><span>CCTV</span><strong className={pretty(venue.cctv).toUpperCase() === "YES" ? "metric-yes" : "metric-no"}>{pretty(venue.cctv).toUpperCase() === "YES" ? "\u2705 Yes" : "\u274c No"}</strong></div>
                <div className="metric-mini"><span>PWD Venue</span><strong className={pretty(venue.pwd_venue).toUpperCase() === "YES" ? "metric-yes" : "metric-no"}>{pretty(venue.pwd_venue).toUpperCase() === "YES" ? "\u2705 Yes" : "\u274c No"}</strong></div>
                <div className="metric-mini"><span>UPS</span><strong className={pretty(venue.ups_availability).toUpperCase() === "YES" ? "metric-yes" : "metric-no"}>{pretty(venue.ups_availability).toUpperCase() === "YES" ? "\u2705 Yes" : "\u274c No"}</strong></div>
                <div className="metric-mini"><span>Genset</span><strong className={pretty(venue.genset_availability).toUpperCase() === "YES" ? "metric-yes" : "metric-no"}>{pretty(venue.genset_availability).toUpperCase() === "YES" ? "\u2705 Yes" : "\u274c No"}</strong></div>
                <div className="metric-mini"><span>Occupancy %</span><strong style={{ color: occupancyPercent > 75 ? "#16a34a" : occupancyPercent > 50 ? "#d97706" : occupancyPercent > 0 ? "#dc2626" : "#64748b" }}>{occupancyPercent ? `${occupancyPercent}%` : "N/A"}</strong></div>
              </div>
            </div>

            <div className="venue-grid venue-grid-2">
              <div className="venue-card">
                <div className="venue-card-title">Venue Information</div>
                <div className="kv-row">
                  <span>Venue SPOC</span>
                  <strong>
                    <button
                      type="button"
                      className="pk-contact-link"
                      onClick={() => openPersonDetail(venue.venue_spoc_name, venueSpocPerson?.empId || venue?.venue_spoc_emp_id || "")}
                      title="Open SPOC detail profile"
                    >
                      {pretty(venue.venue_spoc_name)}
                    </button>
                  </strong>
                </div>
                <div className="kv-row"><span>SPOC Contact</span><strong>{pretty(venue.spoc_contact_number)}</strong></div>
                <div className="kv-row"><span>SPOC Email</span><strong>{pretty(venue.spoc_email_id)}</strong></div>
              </div>
              <div className="venue-card">
                <div className="venue-card-title">DEXIT SPOC Contact Information</div>
                <div className="kv-row">
                  <span>Channel Manager</span>
                  <strong>
                    <button
                      type="button"
                      className="pk-contact-link"
                      onClick={() => openPersonDetail(venue.channel_manager_name, channelManagerPerson?.empId || venue?.channel_manager_emp_id || "")}
                      title="Open channel manager detail profile"
                    >
                      {pretty(venue.channel_manager_name)}
                    </button>
                  </strong>
                </div>
                <div className="kv-row"><span>CM Contact</span><strong>{pretty(venue.channel_manager_contact_no)}</strong></div>
                <div className="kv-row"><span>CM Email</span><strong>{pretty(venue.channel_manager_email_id)}</strong></div>
              </div>
            </div>

            <div className="venue-card">
              <div className="venue-card-title">Analysis & Remarks</div>
              <div className="kv-row"><span>Category</span><strong><span className={`cat-badge cat-badge-${(pretty(venue.category)).replace("-", "").toLowerCase()}`}>{pretty(venue.category)}</span></strong></div>
              <div className="kv-row"><span>Final Analysis</span><strong>{pretty(venue.final_analysis)}</strong></div>
              <div className="address-box">{pretty(venue.reason)}</div>
            </div>

            <div className="venue-card" style={{ marginTop: "24px" }}>
              <div className="venue-card-title">
                Market Information & Source Summary
                <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 400, marginLeft: "12px" }}>
                  Venue-wise intelligence summary with verified source links
                </span>
              </div>
              {marketResearch ? (
                <div className="market-research-panel">
                  <div className="market-simple-grid">
                    <div className="market-simple-card">
                      <div className="market-research-subtitle">Market Intelligence Summary</div>
                      {marketExecutiveBrief ? (
                        <>
                          <div className="market-exec-title">{marketExecutiveBrief.title}</div>
                          <div className="market-simple-summary">{marketExecutiveBrief.paragraph}</div>
                          <ul className="market-exec-list">
                            {marketExecutiveBrief.highlights.map((line, idx) => (
                              <li key={`exec-highlight-${idx}`}>{line}</li>
                            ))}
                          </ul>
                          <div className="market-exec-recommendation">
                            Recommendation: {marketExecutiveBrief.recommendation}
                          </div>
                          <div className="market-simple-meta">
                            <span>{marketExecutiveBrief.status || "Research pending"}</span>
                            <span>{marketExecutiveBrief.confidence || "Low"} confidence</span>
                            {marketExecutiveBrief.updatedAt ? <span>Updated: {marketExecutiveBrief.updatedAt}</span> : null}
                          </div>
                        </>
                      ) : (
                        <div className="market-simple-summary">
                          Summary is being prepared from public internet sources.
                        </div>
                      )}
                    </div>

                    <div className="market-simple-card">
                      <div className="market-research-subtitle">Verified Sources</div>
                      {(marketResearch.sources || []).length ? (
                        <div className="market-source-list">
                          {marketResearch.sources.map((source, idx) => (
                            <a
                              key={`${source.url || source.label}-${idx}`}
                              className="market-source-link"
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <span>{idx + 1}. {source.label || getSourceHost(source.url) || "Source"}</span>
                              <strong>{getSourceHost(source.url)}</strong>
                              {source.note ? <small>{source.note}</small> : null}
                            </a>
                          ))}
                        </div>
                      ) : (
                        <div className="market-research-no-source">
                          No source attached yet. Use refresh to fetch internet references.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="google-no-info">
                  <span className="google-no-info-icon">MR</span>
                  <div className="google-no-info-text">No market research available for this venue</div>
                  <div className="google-no-info-sub">Add source-backed market research to show venue-specific analysis here.</div>
                </div>
              )}
            </div>

            <div className="venue-card" style={{ marginTop: "24px" }}>
              <div className="venue-card-title">
                Manpower History & Personnel
                <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 400, marginLeft: "12px" }}>
                  Click person name to open detail profile
                </span>
              </div>
              {manpower.length > 0 ? (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Person Details</th>
                        <th>Tenure / Roles</th>
                        <th>Projects</th>
                        <th>Stats & Call Logs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {manpower.map((p) => (
                        <tr
                          key={p.empId}
                          className={selectedManpower?.empId === p.empId ? "pk-selected-row" : ""}
                        >
                          <td style={{ verticalAlign: "top" }}>
                            <button
                              className="pk-person-link"
                              onClick={() => openPersonDetail(p.name, p.empId)}
                              title="Open full profile"
                            >
                              {p.name}
                            </button>
                            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>ID: {p.empId}</div>
                            <div style={{ fontSize: "12px", color: "#64748b" }}>Ph: {p.phone || "N/A"}</div>
                            <button
                              className="mp-cell-mini-btn"
                              style={{ marginTop: "8px" }}
                              onClick={() => loadPersonProfile(p)}
                              title="Open full profile in popup"
                            >
                              Complete Details
                            </button>
                          </td>
                          <td style={{ verticalAlign: "top" }}>
                            <div
                              className="status-pill"
                              style={{
                                display: "inline-block",
                                fontSize: "11px",
                                padding: "2px 8px",
                                marginBottom: "6px",
                                background: "#f1f5f9",
                                borderColor: "#e2e8f0",
                                color: "#475569",
                              }}
                            >
                              {p.tenure}
                            </div>
                            <div style={{ fontSize: "13px", color: "#475569", lineHeight: "1.4" }}>{p.roles}</div>
                          </td>
                          <td style={{ verticalAlign: "top" }}>
                            <div style={{ fontSize: "13px", color: "#334155", fontWeight: 500, lineHeight: "1.4" }}>
                              {p.projects}
                            </div>
                          </td>
                          <td style={{ verticalAlign: "top" }}>
                            <div style={{ fontSize: "13px", marginBottom: "4px" }}>
                              {p.instanceCount >= 3 ? (
                                <span className="risk-flag risk-flag-star">⭐ Instances: {p.instanceCount}</span>
                              ) : (
                                <>Instances: <strong>{p.instanceCount}</strong></>
                              )}
                            </div>
                            {p.callLogCount > 0 ? (
                              <span className="risk-flag risk-flag-danger">⚠ Call Logs: {p.callLogCount}</span>
                            ) : (
                              <span className="risk-flag risk-flag-clean">✓ Call Logs: 0</span>
                            )}
                            {p.callLogRemarks && (
                              <div
                                style={{
                                  fontSize: "11px",
                                  color: "#64748b",
                                  marginTop: "6px",
                                  fontStyle: "italic",
                                  lineHeight: "1.4",
                                  maxWidth: "250px",
                                }}
                              >
                                {p.callLogRemarks}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="photo-placeholder" style={{ height: "auto", padding: "40px", borderStyle: "dashed" }}>
                  No manpower records found for this venue.
                </div>
              )}
            </div>

            <div className="venue-card" style={{ marginTop: "14px" }}>
              <div className="venue-card-title">
                Project Report (Current Venue)
                <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 400, marginLeft: "12px" }}>
                  Click any project row to open drilldown details
                </span>
              </div>
              {projectReportData.rows.length ? (
                <>
                  <div className="pk-venue-kpi-grid pk-project-kpi-grid">
                    <div className="pk-venue-kpi-box">
                      <span>Projects</span>
                      <strong>{projectReportData.totalProjects}</strong>
                    </div>
                    <div className="pk-venue-kpi-box">
                      <span>Team Members</span>
                      <strong>{projectReportData.totalMembers}</strong>
                    </div>
                    <div className="pk-venue-kpi-box">
                      <span>Total Instances</span>
                      <strong>{projectReportData.totalInstances}</strong>
                    </div>
                    <div className="pk-venue-kpi-box is-danger">
                      <span>Total Call Logs</span>
                      <strong>{projectReportData.totalCallLogs}</strong>
                    </div>
                  </div>

                  <div className="table-wrap" style={{ marginTop: "10px" }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Project</th>
                          <th>Team Members</th>
                          <th>Instances</th>
                          <th>Call Logs</th>
                          <th>Key Roles</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projectReportData.rows.map((row) => {
                          const rolesPreview = row.roles.slice(0, 3).join(", ");
                          const hiddenRoles = Math.max(0, row.roles.length - 3);
                          return (
                            <tr
                              key={`project-report-${row.key}`}
                              className={`pk-drill-row${selectedProjectKey === row.key ? " is-active" : ""}`}
                              onClick={() => setSelectedProjectKey((prev) => (prev === row.key ? "" : row.key))}
                            >
                              <td><strong>{row.project}</strong></td>
                              <td>{row.memberCount}</td>
                              <td>{row.totalInstances}</td>
                              <td>
                                {row.totalCallLogs > 0 ? (
                                  <span className="risk-flag risk-flag-danger">⚠ {row.totalCallLogs}</span>
                                ) : (
                                  <span className="risk-flag risk-flag-clean">✓ 0</span>
                                )}
                              </td>
                              <td>{rolesPreview || "-"}{hiddenRoles ? ` +${hiddenRoles}` : ""}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {selectedProjectReport ? (
                    <div className="pk-venue-drilldown-panel" style={{ marginTop: "12px" }}>
                      <div className="pk-venue-drilldown-head">
                        <div>
                          <div className="pk-breadcrumb-lite">
                            Project Report &gt; {selectedProjectReport.project} &gt; {projectDrillLevel === "venues" ? "Venue Performance" : "Person Performance"}
                            {selectedProjectVenueCode ? ` (${selectedProjectVenueCode})` : ""}
                          </div>
                          <strong>{selectedProjectReport.project} - Drilldown</strong>
                        </div>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          <button
                            className={`mp-back-small-btn${projectDrillLevel === "venues" ? " is-active" : ""}`}
                            onClick={() => setProjectDrillLevel("venues")}
                          >
                            Venue-Level
                          </button>
                          <button
                            className={`mp-back-small-btn${projectDrillLevel === "people" ? " is-active" : ""}`}
                            onClick={() => setProjectDrillLevel("people")}
                          >
                            Person-Level
                          </button>
                          {selectedProjectVenueCode ? (
                            <button className="mp-back-small-btn" onClick={() => setSelectedProjectVenueCode("")}>
                              Clear Venue Filter
                            </button>
                          ) : null}
                          <button className="mp-back-small-btn" onClick={() => setSelectedProjectKey("")}>
                            Close
                          </button>
                        </div>
                      </div>

                      <div className="pk-deep-summary-grid" style={{ marginBottom: "10px" }}>
                        <div className="pk-deep-summary-box">
                          <span>Venues</span>
                          <strong>{projectDrilldown?.summary?.uniqueVenues ?? projectVenueRows.length}</strong>
                        </div>
                        <div className="pk-deep-summary-box">
                          <span>People</span>
                          <strong>{projectDrilldown?.summary?.uniquePeople ?? selectedProjectReport.memberCount}</strong>
                        </div>
                        <div className="pk-deep-summary-box">
                          <span>Total Batches</span>
                          <strong>{projectDrilldown?.summary?.totalBatches ?? selectedProjectReport.totalInstances}</strong>
                        </div>
                        <div className="pk-deep-summary-box">
                          <span>Total Call Logs</span>
                          <strong>{projectDrilldown?.summary?.callLogs ?? selectedProjectReport.totalCallLogs}</strong>
                        </div>
                      </div>
                      <div className="pk-drill-chip-row">
                        <span className="pk-drill-chip"><strong>Project</strong> {selectedProjectReport.project}</span>
                        <span className="pk-drill-chip"><strong>Venue</strong> {selectedProjectVenueCode || "All Venues"}</span>
                        <span className="pk-drill-chip"><strong>View</strong> {projectDrillLevel === "venues" ? "Venue-Level" : "Person-Level"}</span>
                      </div>
                      <div className="pk-drill-tools-row">
                        {projectDrillLevel === "venues" ? (
                          <select
                            className="pk-drill-select"
                            value={projectVenueSortBy}
                            onChange={(event) => setProjectVenueSortBy(event.target.value)}
                          >
                            <option value="score_desc">Sort: Score (High to Low)</option>
                            <option value="batches_desc">Sort: Total Batches (High to Low)</option>
                            <option value="calls_desc">Sort: Call Logs (High to Low)</option>
                          </select>
                        ) : (
                          <select
                            className="pk-drill-select"
                            value={projectPeopleSortBy}
                            onChange={(event) => setProjectPeopleSortBy(event.target.value)}
                          >
                            <option value="score_desc">Sort: Score (High to Low)</option>
                            <option value="batches_desc">Sort: Total Batches (High to Low)</option>
                            <option value="calls_desc">Sort: Call Logs (High to Low)</option>
                          </select>
                        )}
                        <button className="mp-back-small-btn" onClick={downloadProjectDrillCsv}>
                          Export CSV
                        </button>
                      </div>

                      {projectDrilldownError && !showProjectFallbackNote ? (
                        <div className="inline-error" style={{ marginBottom: "10px" }}>{projectDrilldownError}</div>
                      ) : null}
                      {showProjectFallbackNote ? (
                        <div
                          style={{
                            marginBottom: "10px",
                            border: "1px solid #fde68a",
                            background: "#fffbeb",
                            color: "#92400e",
                            borderRadius: "10px",
                            padding: "8px 10px",
                            fontSize: "12px",
                            fontWeight: 600,
                          }}
                        >
                          {projectDrilldownError}
                        </div>
                      ) : null}
                      {projectDrilldownBusy ? (
                        <div className="photo-placeholder" style={{ height: "auto", padding: "20px", borderStyle: "dashed" }}>
                          Loading project drill-down...
                        </div>
                      ) : null}

                      {!projectDrilldownBusy && projectDrillLevel === "venues" ? (
                        sortedProjectVenueRows.length ? (
                          <div className="table-wrap">
                            <table className="data-table">
                              <thead>
                                <tr>
                                  <th>Venue</th>
                                  <th>DMS</th>
                                  <th>Category</th>
                                  <th>People</th>
                                  <th>Total Batches</th>
                                  <th>No Delay</th>
                                  <th>Call Logs</th>
                                  <th>Score</th>
                                  <th>Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sortedProjectVenueRows.map((row, idx) => (
                                  <tr
                                    key={`project-venue-${selectedProjectReport.key}-${row.dmsCode}-${idx}`}
                                    className={`pk-drill-row${normalizeDms(selectedProjectVenueCode) === normalizeDms(row.dmsCode) ? " is-active" : ""}`}
                                    onClick={() => {
                                      setSelectedProjectVenueCode(row.dmsCode);
                                      setProjectDrillLevel("people");
                                    }}
                                  >
                                    <td><strong>{row.venueName}</strong>{row.isCurrentVenue ? " (Current)" : ""}</td>
                                    <td>{row.dmsCode}</td>
                                    <td>{row.category || "-"}</td>
                                    <td>{row.peopleCount ?? 0}</td>
                                    <td>{row.totalBatches ?? 0}</td>
                                    <td>{row.noDelay ?? 0}</td>
                                    <td>{row.callLogs ?? 0}</td>
                                    <td><strong>{row.score ?? 0}</strong></td>
                                    <td>
                                      <button
                                        type="button"
                                        className="mp-cell-mini-btn"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          openVenueDetail(row.dmsCode);
                                        }}
                                        title="Open venue detail"
                                      >
                                        Open
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="photo-placeholder" style={{ height: "auto", padding: "20px", borderStyle: "dashed" }}>
                            No venue-level performance found for this project.
                          </div>
                        )
                      ) : null}

                      {!projectDrilldownBusy && projectDrillLevel === "people" ? (
                        sortedProjectPeopleRows.length ? (
                          <div className="table-wrap">
                            <table className="data-table">
                              <thead>
                                <tr>
                                  <th>Person</th>
                                  <th>Employee ID</th>
                                  <th>Phone</th>
                                  <th>Tenure</th>
                                  <th>Roles</th>
                                  <th>Venue Coverage</th>
                                  <th>Total Batches</th>
                                  <th>No Delay</th>
                                  <th>Call Logs</th>
                                  <th>Score</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sortedProjectPeopleRows.map((member, idx) => (
                                  <tr key={`project-member-${selectedProjectReport.key}-${member.empId}-${idx}`}>
                                    <td>
                                      <button
                                        type="button"
                                        className="pk-person-link"
                                        onClick={() => openPersonDetail(member.personName, member.empId)}
                                        title="Open person detail profile"
                                      >
                                        {member.personName}
                                      </button>
                                    </td>
                                    <td>{member.empId}</td>
                                    <td>{member.phone || "-"}</td>
                                    <td>{member.tenure || "-"}</td>
                                    <td>{member.roles || "-"}</td>
                                    <td>{member.venueCoverage ?? 0}</td>
                                    <td>{member.totalBatches ?? 0}</td>
                                    <td>{member.noDelay ?? 0}</td>
                                    <td>
                                      {Number(member.callLogs || 0) > 0 ? (
                                        <span className="risk-flag risk-flag-danger">Call Logs {member.callLogs}</span>
                                      ) : (
                                        <span className="risk-flag risk-flag-clean">Call Logs 0</span>
                                      )}
                                    </td>
                                    <td><strong>{member.score ?? 0}</strong></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="photo-placeholder" style={{ height: "auto", padding: "20px", borderStyle: "dashed" }}>
                            No person-level performance found for this selection.
                          </div>
                        )
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="photo-placeholder" style={{ height: "auto", padding: "28px", borderStyle: "dashed" }}>
                  No project mapping found for this venue manpower set.
                </div>
              )}
            </div>

            {selectedManpower && (
              <div className="venue-card pk-venue-person-card" ref={currentVenueInfoRef}>
                <div className="venue-card-title">
                  Selected Person (Current Venue Info)
                </div>
                <div className="pk-venue-person-grid">
                  <div className="kv-row">
                    <span>Name</span>
                    <strong>
                      <button
                        type="button"
                        className="pk-contact-link"
                        onClick={() => openPersonDetail(selectedManpower.name, selectedManpower.empId)}
                        title="Open person detail profile"
                      >
                        {selectedManpower.name || "N/A"}
                      </button>
                    </strong>
                  </div>
                  <div className="kv-row"><span>Employee ID</span><strong>{selectedManpower.empId || "N/A"}</strong></div>
                  <div className="kv-row"><span>Phone</span><strong>{selectedManpower.phone || "N/A"}</strong></div>
                  <div className="kv-row"><span>Tenure</span><strong>{selectedManpower.tenure || "N/A"}</strong></div>
                  <div className="kv-row"><span>Roles</span><strong>{selectedVenueSummary?.roles || selectedManpower.roles || "N/A"}</strong></div>
                  <div className="kv-row"><span>Projects</span><strong>{selectedVenueSummary?.projectsText || selectedManpower.projects || "N/A"}</strong></div>
                  <div className="kv-row"><span>Instances</span><strong>{selectedManpower.instanceCount ?? 0}</strong></div>
                  <div className="kv-row"><span>Call Logs</span><strong>{selectedManpower.callLogCount ?? 0}</strong></div>
                </div>
                <div className="pk-venue-kpi-card">
                  <div className="pk-venue-kpi-title">
                    Rotation Summary (Current Venue)
                    <span className="pk-click-hint">Click a metric to view details</span>
                  </div>
                  <div className="pk-venue-kpi-grid">
                    <button type="button" className={`pk-venue-kpi-box is-clickable${currentVenueDrillKey === "projects" ? " is-active" : ""}`} onClick={() => toggleCurrentVenueDrill("projects")}><span>Projects</span><strong>{selectedVenueSummary?.uniqueProjects ?? 0}</strong></button>
                    <button type="button" className={`pk-venue-kpi-box is-clickable${currentVenueDrillKey === "drives" ? " is-active" : ""}`} onClick={() => toggleCurrentVenueDrill("drives")}><span>Drives</span><strong>{selectedVenueSummary?.uniqueDrives ?? 0}</strong></button>
                    <button type="button" className={`pk-venue-kpi-box is-clickable${currentVenueDrillKey === "venues" ? " is-active" : ""}`} onClick={() => toggleCurrentVenueDrill("venues")}><span>Venues</span><strong>{selectedVenueSummary?.uniqueVenues ?? 0}</strong></button>
                    <button type="button" className={`pk-venue-kpi-box is-clickable${currentVenueDrillKey === "records" ? " is-active" : ""}`} onClick={() => toggleCurrentVenueDrill("records")}><span>Records</span><strong>{selectedVenueSummary?.totalRecords ?? 0}</strong></button>
                  </div>
                </div>
                <div className="pk-venue-kpi-card">
                  <div className="pk-venue-kpi-title">
                    Delivery Performance (Current Venue)
                    <span className="pk-click-hint">Click a metric to view details</span>
                  </div>
                  <div className="pk-venue-kpi-grid pk-venue-kpi-grid-6">
                    <button type="button" className={`pk-venue-kpi-box is-clickable${currentVenueDrillKey === "batches" ? " is-active" : ""}`} onClick={() => toggleCurrentVenueDrill("batches")}><span>Batches</span><strong>{selectedVenueSummary?.totalBatches ?? 0}</strong></button>
                    <button type="button" className={`pk-venue-kpi-box is-danger is-clickable${currentVenueDrillKey === "fullDelay" ? " is-active" : ""}`} onClick={() => toggleCurrentVenueDrill("fullDelay")}><span>Full Delay</span><strong>{selectedVenueSummary?.fullBatchDelay ?? 0}</strong></button>
                    <button type="button" className={`pk-venue-kpi-box is-warn is-clickable${currentVenueDrillKey === "partial" ? " is-active" : ""}`} onClick={() => toggleCurrentVenueDrill("partial")}><span>Partial</span><strong>{selectedVenueSummary?.partialBatchDelay ?? 0}</strong></button>
                    <button type="button" className={`pk-venue-kpi-box is-good is-clickable${currentVenueDrillKey === "noDelay" ? " is-active" : ""}`} onClick={() => toggleCurrentVenueDrill("noDelay")}><span>No Delay</span><strong>{selectedVenueSummary?.noDelay ?? 0}</strong></button>
                    <button type="button" className={`pk-venue-kpi-box is-danger is-clickable${currentVenueDrillKey === "ffa" ? " is-active" : ""}`} onClick={() => toggleCurrentVenueDrill("ffa")}><span>FFA</span><strong>{selectedVenueSummary?.ffa ?? 0}</strong></button>
                    <button type="button" className={`pk-venue-kpi-box is-danger is-clickable${currentVenueDrillKey === "callLogs" ? " is-active" : ""}`} onClick={() => toggleCurrentVenueDrill("callLogs")}><span>Call Logs</span><strong>{selectedVenueSummary?.callLogs ?? 0}</strong></button>
                  </div>
                </div>
                {renderCurrentVenueDrilldown()}
                {selectedManpower.callLogRemarks ? (
                  <div className="address-box" style={{ marginTop: "12px" }}>
                    {selectedManpower.callLogRemarks}
                  </div>
                ) : null}
                <div className="pk-venue-person-actions">
                  <button className="search-btn" onClick={() => loadPersonProfile(selectedManpower)}>
                    Open Complete Details
                  </button>
                  <button className="btn-outline" style={{ width: "auto" }} onClick={() => handleSelectPerson(null)}>
                    Back To Person List
                  </button>
                </div>
              </div>
            )}

            {/* Full profile popup */}
            {showProfileModal && (
              <div className="pk-modal-overlay" onClick={closeProfileModal}>
                <div className={`pk-modal-shell${profileMaximized ? " is-maximized" : ""}`} onClick={(event) => event.stopPropagation()}>
                  <div className="pk-modal-topbar">
                    <div className="pk-modal-topbar-left">
                      <button className="mp-back-small-btn" onClick={closeProfileModal}>
                        Back
                      </button>
                      <button className="mp-back-small-btn" onClick={() => setProfileMaximized((prev) => !prev)}>
                        {profileMaximized ? "Minimize" : "Maximize"}
                      </button>
                    </div>
                    <button className="mp-back-small-btn" onClick={closeProfileModal}>
                      Close
                    </button>
                  </div>
                  <PersonKundliPanel
                    data={personData}
                    loading={personLoading}
                    error={personError}
                    onClose={closeProfileModal}
                    onSyncCurrentVenue={() => {
                      closeProfileModal();
                      focusCurrentVenueInfo();
                    }}
                  />
                </div>
              </div>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
