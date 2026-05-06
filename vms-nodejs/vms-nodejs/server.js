const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const XLSX = require("xlsx");

const app = express();
const PORT = Number(process.env.PORT || 5000);
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true }));

const ROOT_PATH = path.join(__dirname, "..", "..");
const DATA_PATH = path.join(ROOT_PATH, "Data");
const OUTPUT_PATH = path.join(DATA_PATH, "Output");
const PHOTOS_PATH = path.join(DATA_PATH, "Venue_Photos");

if (!fs.existsSync(OUTPUT_PATH)) fs.mkdirSync(OUTPUT_PATH, { recursive: true });
if (!fs.existsSync(PHOTOS_PATH)) fs.mkdirSync(PHOTOS_PATH, { recursive: true });

app.use("/photos", express.static(PHOTOS_PATH));

const FILES = {
  "Venue Inventory": { file: "VMS Master.xlsx", users: ["Nishant", "Prafull", "Admin"] },
  Blacklisted: { file: "Blacklisted Venues.xlsx", users: ["Prafull", "Admin"] },
  "FFA Data": { file: "FFA Data.xlsx", users: ["Anil", "Admin"] },
  Suspicious: { file: "Suspicious Activities.xlsx", users: ["Prafull", "Admin"] },
  "Day End": { file: "Day End Observations.xlsx", users: ["Prafull", "Admin"] },
  "Market Reviews": { file: "Google review and ratings.xlsx", users: ["Prafull", "Admin"] },
  "Call Logs": { file: "Master Call Logs.xlsx", users: ["Prafull", "Admin"] },
  "Project Master": { file: "Project Master.xlsx", users: ["Prafull", "Admin"] },
};

const USERS = {
  Prafull: "Prafull@123",
  Nishant: "Nishant@123",
  Mayuresh: "Mayuresh@123",
  Anil: "Anil@123",
  Admin: "Admin@123",
};

const REGION_ORDER = ["North One", "North Two", "East", "West", "South"];
const STATUS_ORDER = ["ACTIVE", "BLACKLISTED", "CUSTOMER SPECIFIC BLACKLISTED"];
const CATEGORY_ORDER = ["A", "B", "C", "BL-C", "BL"];

const STATE_NAME_ALIASES = {
  "NCT OF DELHI": "DELHI",
  "NCT DELHI": "DELHI",
  "DELHI NCR": "DELHI",
  "DELHI NCT": "DELHI",
  ORISSA: "ODISHA",
  UTTARANCHAL: "UTTARAKHAND",
  "JAMMU KASHMIR": "JAMMU AND KASHMIR",
  "JAMMU AND KASHMIR": "JAMMU AND KASHMIR",
  "JAMMU & KASHMIR": "JAMMU AND KASHMIR",
  "DADRA AND NAGAR HAVELI AND DAMAN AND DIU": "DADRA AND NAGAR HAVELI AND DAMAN AND DIU",
  "DADRA AND NAGAR HAVELI DAMAN AND DIU": "DADRA AND NAGAR HAVELI AND DAMAN AND DIU",
  "DADRA AND NAGAR HAVELI": "DADRA AND NAGAR HAVELI AND DAMAN AND DIU",
  "DAMAN AND DIU": "DADRA AND NAGAR HAVELI AND DAMAN AND DIU",
  "ANDAMAN NICOBAR": "ANDAMAN AND NICOBAR ISLANDS",
  "ANDAMAN AND NICOBAR": "ANDAMAN AND NICOBAR ISLANDS",
  "ANDAMAN AND NICOBAR ISLAND": "ANDAMAN AND NICOBAR ISLANDS",
  PONDICHERRY: "PUDUCHERRY",
};

const FOREIGN_LOCATIONS = new Set(["NEPAL", "UAE"]);
const HEADER_HINTS = ["ROW LABELS", "VENUE_TYPE", "CODE", "ACTIVE", "DMS_CODE", "STATUS"];

let dashboardCache = null;
let occupancyCache = null;

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isBlankLike(value) {
  const text = cleanText(value).toUpperCase();
  return text === "" || text === "-" || text === "NAN" || text === "NONE" || text === "NA";
}

function normalizeKey(key) {
  return cleanText(key)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeRowKeys(row) {
  const normalized = {};
  for (const [rawKey, rawValue] of Object.entries(row || {})) {
    normalized[normalizeKey(rawKey)] = rawValue;
  }
  return normalized;
}

function toNumber(value) {
  const number = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function toBoolean(value) {
  const normalized = cleanText(value).toUpperCase();
  return ["YES", "Y", "TRUE", "1"].includes(normalized);
}

function normalizeStateName(value) {
  const raw = cleanText(value).toUpperCase().replace(/&/g, " AND ");
  const cleaned = raw.replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  return STATE_NAME_ALIASES[cleaned] || cleaned;
}

function normalizeRegionName(value) {
  const raw = cleanText(value).toUpperCase();
  const map = {
    "NORTH ONE": "North One",
    "NORTH TWO": "North Two",
    EAST: "East",
    WEST: "West",
    SOUTH: "South",
  };
  return map[raw] || cleanText(value);
}

function cleanDms(value) {
  return cleanText(value)
    .replace(/\.0$/, "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function parseDateForFilename(value = new Date()) {
  const d = new Date(value);
  const p2 = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
}

function getDatasetPath(datasetKey) {
  const fileConfig = FILES[datasetKey];
  if (!fileConfig) return null;
  return path.join(DATA_PATH, fileConfig.file);
}

function findHeaderIndex(aoaRows) {
  const maxRows = Math.min(12, aoaRows.length);
  for (let i = 0; i < maxRows; i += 1) {
    const rowText = (aoaRows[i] || []).map((value) => String(value)).join(" ").toUpperCase();
    if (HEADER_HINTS.some((hint) => rowText.includes(hint))) {
      return i;
    }
  }
  return 0;
}

function readWorkbookSmart(filePath, sheetNameOverride = null) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { filePath, sheetName: "Sheet1", headerIndex: 0, headers: [], rows: [] };
  }

  try {
    const workbook = XLSX.readFile(filePath, { cellDates: true });
    const sheetName =
      sheetNameOverride && workbook.SheetNames.includes(sheetNameOverride)
        ? sheetNameOverride
        : workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false, raw: false });
    const headerIndex = findHeaderIndex(aoa);
    const headers = (aoa[headerIndex] || [])
      .map((value, index) => {
        const text = cleanText(value);
        return text || `COLUMN_${index + 1}`;
      })
      .filter((_, index, arr) => index < arr.length);

    const rows = [];
    for (let i = headerIndex + 1; i < aoa.length; i += 1) {
      const cells = aoa[i] || [];
      const record = {};
      let hasData = false;
      headers.forEach((header, colIndex) => {
        const value = cells[colIndex] ?? "";
        if (!isBlankLike(value)) hasData = true;
        record[header] = value;
      });
      if (hasData) rows.push(record);
    }

    return { filePath, sheetName, headerIndex, headers, rows };
  } catch (error) {
    return { filePath, sheetName: "Sheet1", headerIndex: 0, headers: [], rows: [], error: error.message };
  }
}

function readWorkbookFromBuffer(buffer, sheetNameOverride = null) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName =
    sheetNameOverride && workbook.SheetNames.includes(sheetNameOverride)
      ? sheetNameOverride
      : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false, raw: false });
  const headerIndex = findHeaderIndex(aoa);
  const headers = (aoa[headerIndex] || [])
    .map((value, index) => {
      const text = cleanText(value);
      return text || `COLUMN_${index + 1}`;
    })
    .filter((_, index, arr) => index < arr.length);

  const rows = [];
  for (let i = headerIndex + 1; i < aoa.length; i += 1) {
    const cells = aoa[i] || [];
    const record = {};
    let hasData = false;
    headers.forEach((header, colIndex) => {
      const value = cells[colIndex] ?? "";
      if (!isBlankLike(value)) hasData = true;
      record[header] = value;
    });
    if (hasData) rows.push(record);
  }
  return { sheetName, headers, rows };
}

function writeWorkbook(filePath, rows, headers = null, sheetName = "Sheet1") {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeHeaders =
    headers && headers.length
      ? headers
      : Array.from(new Set(safeRows.flatMap((row) => Object.keys(row || {}))));

  const orderedRows = safeRows.map((row) => {
    const copy = {};
    safeHeaders.forEach((header) => {
      copy[header] = row?.[header] ?? "";
    });
    return copy;
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(orderedRows, { header: safeHeaders, skipHeader: false });
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  XLSX.writeFile(wb, filePath);
}

function clearCaches() {
  dashboardCache = null;
  occupancyCache = null;
}

function pickLatestAnalysisFile() {
  const fallback = getDatasetPath("Venue Inventory");
  const outputFiles = fs.existsSync(OUTPUT_PATH)
    ? fs
        .readdirSync(OUTPUT_PATH)
        .filter((name) => /^VMS_Full_Analysis_.*\.xlsx$/i.test(name))
        .map((name) => path.join(OUTPUT_PATH, name))
        .filter((fullPath) => fs.statSync(fullPath).isFile())
    : [];

  if (!outputFiles.length) {
    return {
      filePath: fallback,
      fileName: fallback ? path.basename(fallback) : "",
      source: "fallback",
    };
  }

  outputFiles.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return {
    filePath: outputFiles[0],
    fileName: path.basename(outputFiles[0]),
    source: "output",
  };
}

function buildDashboardRows(rows) {
  return rows
    .map((row) => normalizeRowKeys(row))
    .map((row) => {
      const dmsCode = cleanDms(row.dms_code || row.venue_code || row.code);
      const region = normalizeRegionName(row.region);
      const stateNormalized = normalizeStateName(row.state);

      return {
        dmsCode,
        name: cleanText(row.venue_name || row.name),
        venueType: cleanText(row.venue_type).toUpperCase(),
        region,
        state: cleanText(stateNormalized)
          .toLowerCase()
          .replace(/\b\w/g, (ch) => ch.toUpperCase()),
        district: cleanText(row.district) || "-",
        city: cleanText(row.city)
          .toLowerCase()
          .replace(/\b\w/g, (ch) => ch.toUpperCase()),
        status: cleanText(row.status).toUpperCase(),
        reason: cleanText(row.reason || row.final_analysis || row.blacklist_info || row.remarks || row.remark || row.market_remark || row.deo_remarks_summary || row.call_log_summary || row.remarks_summary || row.final_remarks || row.status_reason || "-"),
        category: cleanText(row.category).toUpperCase(),
        venueMaxCapacity: toNumber(row.venue_max_capacity),
        cctvReady: toBoolean(row.cctv),
        pwdReady: toBoolean(row.pwd_venue),
        upsReady: toBoolean(row.ups_availability),
        usedAndTested: toBoolean(row.used_and_tested_venue),
      };
    })
    .filter(
      (row) =>
        row.dmsCode &&
        row.region &&
        row.region.toUpperCase() !== "FOREIGN" &&
        !FOREIGN_LOCATIONS.has(normalizeStateName(row.state)),
    );
}

function uniqueCount(values) {
  return new Set(values.filter(Boolean)).size;
}

function computeDashboardMeta(rows) {
  const rowsWithoutInactive = rows.filter((row) => row.status !== "INACTIVE");
  return {
    totalRows: rows.length,
    defaultRows: rowsWithoutInactive.length,
    filters: {
      region: uniqueCount(rowsWithoutInactive.map((row) => row.region)),
      state: uniqueCount(rowsWithoutInactive.map((row) => row.state)),
      district: uniqueCount(rowsWithoutInactive.map((row) => row.district)),
      city: uniqueCount(rowsWithoutInactive.map((row) => row.city)),
      status: uniqueCount(rowsWithoutInactive.map((row) => row.status)),
      category: uniqueCount(rowsWithoutInactive.map((row) => row.category)),
    },
  };
}

function loadDashboardData() {
  dashboardCache = null; // Force clear cache to apply new buildDashboardRows logic
  const { filePath, fileName } = pickLatestAnalysisFile();
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      filePath: "",
      fileName: "",
      updatedAt: "",
      rows: [],
      orders: { region: REGION_ORDER, status: STATUS_ORDER, category: CATEGORY_ORDER },
      defaults: { selectedStatuses: STATUS_ORDER },
      meta: computeDashboardMeta([]),
    };
  }

  const stat = fs.statSync(filePath);
  if (dashboardCache && dashboardCache.filePath === filePath && dashboardCache.mtimeMs === stat.mtimeMs) {
    return dashboardCache.data;
  }

  const workbookData = readWorkbookSmart(filePath);
  const rows = buildDashboardRows(workbookData.rows || []);
  const data = {
    filePath,
    fileName,
    updatedAt: stat.mtime.toISOString(),
    rows,
    orders: {
      region: REGION_ORDER,
      status: STATUS_ORDER,
      category: CATEGORY_ORDER,
    },
    defaults: {
      selectedStatuses: STATUS_ORDER,
    },
    meta: computeDashboardMeta(rows),
  };

  dashboardCache = { filePath, mtimeMs: stat.mtimeMs, data };
  return data;
}

function buildCompleteAddress(row) {
  const fields = [
    cleanText(row.updated_venue_name || row.venue_name || row.name),
    cleanText(row.address),
    cleanText(row.landmark),
    cleanText(row.city),
    cleanText(row.district),
    cleanText(row.state),
  ].filter(Boolean);
  const pincode = cleanText(row.pincode).replace(/\.0$/, "");
  return fields.join(", ") + (pincode ? ` - ${pincode}` : "");
}

function cleanProjectName(value) {
  return cleanText(value)
    .toUpperCase()
    .replace(/[^A-Z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstNonBlank(values) {
  for (const value of values) {
    if (!isBlankLike(value) && cleanText(value).toUpperCase() !== "NOT ASSIGNED") {
      return cleanText(value);
    }
  }
  return "";
}

function buildIssueSummaryMap(rows, issueKey) {
  const grouped = new Map();
  for (const raw of rows) {
    const row = normalizeRowKeys(raw);
    const dms = cleanDms(row.dms_code || row.center_code || row.updated_dms_code || row.venue_code || row.row_labels);
    if (!dms) continue;
    const issue = cleanText(row[issueKey]);
    if (!issue) continue;
    const issueMap = grouped.get(dms) || new Map();
    issueMap.set(issue, (issueMap.get(issue) || 0) + 1);
    grouped.set(dms, issueMap);
  }

  const summary = new Map();
  for (const [dms, issueMap] of grouped.entries()) {
    const parts = [];
    for (const [issue, count] of issueMap.entries()) {
      parts.push(`${issue}(${count} instances)`);
    }
    summary.set(dms, parts.join(", "));
  }
  return summary;
}

function buildCallLogSummaryMap(rows) {
  const grouped = new Map();
  for (const raw of rows) {
    const row = normalizeRowKeys(raw);
    const dms = cleanDms(row.updated_dms_code || row.center_code || row.dms_code);
    if (!dms) continue;
    const issue = cleanText(row.final_issue_remark_by_prafull);
    if (!issue) continue;
    if (issue.toLowerCase().includes("other low impact issues")) continue;

    const issueMap = grouped.get(dms) || new Map();
    issueMap.set(issue, (issueMap.get(issue) || 0) + 1);
    grouped.set(dms, issueMap);
  }

  const summary = new Map();
  for (const [dms, issueMap] of grouped.entries()) {
    const parts = [];
    for (const [issue, count] of issueMap.entries()) {
      parts.push(`${issue}(${count})`);
    }
    summary.set(dms, parts.join(", "));
  }
  return summary;
}

function buildMarketRemarkMap(rows) {
  const map = new Map();
  for (const raw of rows) {
    const row = normalizeRowKeys(raw);
    const dms = cleanDms(row.dms_code || row.venue_code);
    if (!dms) continue;

    const rating = toNumber(row.google_ratings);
    const reviewCount = toNumber(row.google_review_count);
    let remark = "";
    if (reviewCount < 10) remark = "Doubtful (Reviews < 10)";
    else if (rating >= 4 && reviewCount >= 10) remark = "Good (Rating >=4 & Reviews >=10)";
    else if (rating <= 2 && reviewCount >= 10) remark = "Poor (Rating <=2 & Reviews >=10)";
    else if (rating < 4 && reviewCount >= 10) remark = "Average (Rating <4 & Reviews >=10)";
    if (remark) map.set(dms, remark);
  }
  return map;
}

function buildColumnAudit(rows) {
  if (!rows.length) return [];
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row || {}))));
  return columns.map((columnName) => {
    const values = rows.map((row) => row[columnName]);
    const nonBlank = values.filter((value) => !isBlankLike(value));
    const uniqueValues = new Set(nonBlank.map((value) => String(value))).size;
    const frequency = new Map();
    for (const value of nonBlank) {
      const key = String(value);
      frequency.set(key, (frequency.get(key) || 0) + 1);
    }
    let topFrequent = "N/A";
    let maxCount = -1;
    for (const [value, count] of frequency.entries()) {
      if (count > maxCount) {
        maxCount = count;
        topFrequent = value;
      }
    }

    const fillRate = rows.length ? (nonBlank.length / rows.length) * 100 : 0;
    return {
      COLUMN_NAME: columnName,
      "FILL_RATE_(%)": Number(fillRate.toFixed(2)),
      UNIQUE_VALUES: uniqueValues,
      TOP_FREQUENT: topFrequent,
    };
  });
}

function listProcessOutputFiles() {
  if (!fs.existsSync(OUTPUT_PATH)) return [];
  return fs
    .readdirSync(OUTPUT_PATH)
    .filter((name) => /^VMS_Full_Analysis_.*\.xlsx$/i.test(name))
    .map((name) => path.join(OUTPUT_PATH, name))
    .filter((fullPath) => fs.statSync(fullPath).isFile())
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

function runCentralAnalysis() {
  const vmsRaw = readWorkbookSmart(path.join(DATA_PATH, "VMS Master.xlsx")).rows;
  const blacklistedRaw = readWorkbookSmart(path.join(DATA_PATH, "Blacklisted Venues.xlsx")).rows;
  const ffaRaw = readWorkbookSmart(path.join(DATA_PATH, "FFA Data.xlsx")).rows;
  const deoRaw = readWorkbookSmart(path.join(DATA_PATH, "Day End Observations.xlsx")).rows;
  const suspiciousRaw = readWorkbookSmart(path.join(DATA_PATH, "Suspicious Activities.xlsx")).rows;
  const marketRaw = readWorkbookSmart(path.join(DATA_PATH, "Google review and ratings.xlsx")).rows;
  const callLogsRaw = readWorkbookSmart(path.join(DATA_PATH, "Master Call Logs.xlsx")).rows;

  const vms = vmsRaw.map((row) => normalizeRowKeys(row));
  const blacklisted = blacklistedRaw.map((row) => normalizeRowKeys(row));
  const ffa = ffaRaw.map((row) => normalizeRowKeys(row));
  const deo = deoRaw.map((row) => normalizeRowKeys(row));
  const suspicious = suspiciousRaw.map((row) => normalizeRowKeys(row));
  const market = marketRaw.map((row) => normalizeRowKeys(row));
  const callLogs = callLogsRaw.map((row) => normalizeRowKeys(row));

  const vmsValid = vms
    .map((row) => ({ ...row, dms_code: cleanDms(row.dms_code || row.venue_code || row.code) }))
    .filter((row) => row.dms_code && !["NAN", "GRANDTOTAL"].includes(row.dms_code));

  if (!vmsValid.length) {
    throw new Error("VMS Master is empty or invalid. Cannot run analysis.");
  }

  const blacklistMap = new Map();
  for (const row of blacklisted) {
    const dms = cleanDms(row.dms_code || row.venue_code || row.row_labels);
    if (!dms) continue;
    const remark = cleanText(row.remark || row.remarks);
    const by = cleanText(row.blacklisted_by);
    const info = `${remark}${remark && by ? " by " : ""}${by}`.trim();
    if (!info) continue;
    if (!blacklistMap.has(dms)) blacklistMap.set(dms, []);
    blacklistMap.get(dms).push(info);
  }

  const ffaCountMap = new Map();
  for (const row of ffa) {
    const dms = cleanDms(row.dms_code || row.venue_code || row.row_labels);
    if (!dms) continue;
    ffaCountMap.set(dms, (ffaCountMap.get(dms) || 0) + 1);
  }

  const deoSummaryMap = buildIssueSummaryMap(deo, "remark");
  const suspiciousSummaryMap = buildIssueSummaryMap(suspicious, "issue_type");
  const callLogSummaryMap = buildCallLogSummaryMap(callLogs);
  const marketRemarkMap = buildMarketRemarkMap(market);

  const vmsByCode = new Map(vmsValid.map((row) => [row.dms_code, row]));
  const callProfileMap = new Map();
  for (const row of callLogs) {
    const dms = cleanDms(row.updated_dms_code || row.center_code || row.dms_code);
    if (!dms || !vmsByCode.has(dms)) continue;
    const vmsRow = vmsByCode.get(dms);
    const profile = callProfileMap.get(dms) || {
      call_logs_project_name: "",
      call_logs_updated_venue_name: "",
      call_logs_concat_address: "",
    };

    profile.call_logs_project_name =
      profile.call_logs_project_name ||
      firstNonBlank([cleanProjectName(row.updated_project_name || row.project_name)]);
    profile.call_logs_updated_venue_name =
      profile.call_logs_updated_venue_name ||
      firstNonBlank([row.updated_venue_name, row.venue_name, vmsRow.name]);
    profile.call_logs_concat_address =
      profile.call_logs_concat_address ||
      firstNonBlank([
        buildCompleteAddress({
          updated_venue_name: row.updated_venue_name || vmsRow.name,
          address: vmsRow.address,
          landmark: vmsRow.landmark,
          city: vmsRow.city,
          district: vmsRow.district,
          state: vmsRow.state,
          pincode: vmsRow.pincode,
        }),
      ]);

    callProfileMap.set(dms, profile);
  }

  const finalRows = vmsValid.map((row) => {
    const dms = row.dms_code;
    const blacklistInfo = (blacklistMap.get(dms) || []).join(", ");
    const ffaFrequency = ffaCountMap.get(dms) || 0;
    const deoSummary = deoSummaryMap.get(dms) || "";
    const suspiciousSummary = suspiciousSummaryMap.get(dms) || "";
    const callLogSummary = callLogSummaryMap.get(dms) || "";
    const marketRemark = marketRemarkMap.get(dms) || "";
    const callProfile = callProfileMap.get(dms) || {};

    let finalAnalysis = "Good";
    let reason = "Good";

    const blacklistLower = blacklistInfo.toLowerCase();
    if (blacklistLower.startsWith("completely blacklisted")) {
      finalAnalysis = "Completely Blacklisted";
      reason = blacklistInfo;
    } else if (blacklistLower.startsWith("customer specific blacklisted")) {
      finalAnalysis = "Customer Specific Blacklisted";
      reason = blacklistInfo;
    } else {
      if (ffaFrequency >= 1) {
        finalAnalysis = ffaFrequency < 5 ? "Average" : "Sensitive";
        reason = `Found in FFA | Count: ${ffaFrequency}`;
      }
      if (deoSummary && finalAnalysis === "Good") {
        finalAnalysis = "Sensitive";
        reason = deoSummary;
      }
      if (suspiciousSummary && finalAnalysis === "Good") {
        finalAnalysis = "Sensitive";
        reason = suspiciousSummary;
      }
      if (callLogSummary && finalAnalysis === "Good" && !callLogSummary.toLowerCase().includes("other low impact issues")) {
        finalAnalysis = "Average";
        reason = `Call Logs | ${callLogSummary}`;
      }
      if (marketRemark && finalAnalysis === "Good") {
        if (/doubtful|poor|average/i.test(marketRemark)) {
          finalAnalysis = "Average";
        } else {
          finalAnalysis = "Good";
        }
        reason = `Market: ${marketRemark}`;
      }
      if (finalAnalysis === "Good" && reason === "Good") {
        reason = "Good Venue";
      }
    }

    const categoryMap = {
      Good: "A",
      Average: "B",
      Sensitive: "C",
      "Completely Blacklisted": "BL",
      "Customer Specific Blacklisted": "BL-C",
    };
    let category = categoryMap[finalAnalysis] || "";

    const venueType = cleanText(row.venue_type).toUpperCase();
    if (venueType === "DOTC") {
      finalAnalysis = "Good";
      reason = "Good Venue";
      category = "A";
    }

    return {
      ...row,
      venue_name: cleanText(row.venue_name || row.name),
      blacklist_info: blacklistInfo,
      ffa_frequency: ffaFrequency,
      deo_remarks_summary: deoSummary,
      suspicious_summary: suspiciousSummary,
      call_log_summary: callLogSummary,
      market_remark: marketRemark,
      final_analysis: finalAnalysis,
      reason,
      category,
      call_logs_project_name: callProfile.call_logs_project_name || "",
      call_logs_updated_venue_name: callProfile.call_logs_updated_venue_name || "",
      call_logs_concat_address: callProfile.call_logs_concat_address || "",
    };
  });

  const columnAudit = buildColumnAudit(finalRows);
  const ts = parseDateForFilename();
  const outputFileName = `VMS_Full_Analysis_${ts}.xlsx`;
  const outputFilePath = path.join(OUTPUT_PATH, outputFileName);

  const oldFiles = listProcessOutputFiles();
  const previousOutputPath = oldFiles.length ? oldFiles[0] : null;

  const upperRows = finalRows.map((row) => {
    const result = {};
    for (const [key, value] of Object.entries(row)) {
      result[key.toUpperCase()] = value;
    }
    return result;
  });

  const workbook = XLSX.utils.book_new();
  const mainSheet = XLSX.utils.json_to_sheet(upperRows);
  XLSX.utils.book_append_sheet(workbook, mainSheet, "Main_Analysis");
  const auditSheet = XLSX.utils.json_to_sheet(columnAudit);
  XLSX.utils.book_append_sheet(workbook, auditSheet, "Column_Audit");
  const runInfoSheet = XLSX.utils.json_to_sheet([
    {
      CURRENT_OUTPUT_FILE: outputFileName,
      PREVIOUS_OUTPUT_FILE: previousOutputPath ? path.basename(previousOutputPath) : "",
      GENERATED_ON: new Date().toISOString(),
    },
  ]);
  XLSX.utils.book_append_sheet(workbook, runInfoSheet, "Run_Info");

  if (previousOutputPath && fs.existsSync(previousOutputPath)) {
    try {
      const oldMain = readWorkbookSmart(previousOutputPath, "Main_Analysis").rows;
      if (oldMain.length) {
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(oldMain), "Old_Main_Analysis");
      }
    } catch {
      // ignore old sheet read issue
    }
    try {
      const oldAudit = readWorkbookSmart(previousOutputPath, "Column_Audit").rows;
      if (oldAudit.length) {
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(oldAudit), "Old_Column_Audit");
      }
    } catch {
      // ignore old sheet read issue
    }
  }

  XLSX.writeFile(workbook, outputFilePath);

  const inventoryColumns = [
    "venue_type",
    "region",
    "state",
    "city",
    "district",
    "dms_code",
    "venue_name",
    "address",
    "pincode",
    "landmark",
    "complete_address",
    "venue_max_capacity",
    "pwd_venue",
    "status",
    "final_analysis",
    "reason",
    "category",
  ];
  const inventoryRows = finalRows.map((row) => {
    const result = {};
    inventoryColumns.forEach((column) => {
      result[column.toUpperCase()] = row[column] ?? "";
    });
    return result;
  });

  const inventoryDir = path.join(OUTPUT_PATH, "Venue Inventory");
  fs.mkdirSync(inventoryDir, { recursive: true });
  const inventoryFileName = `Venue Inventory as on ${ts}.xlsx`;
  const inventoryFilePath = path.join(inventoryDir, inventoryFileName);
  writeWorkbook(inventoryFilePath, inventoryRows, inventoryColumns.map((column) => column.toUpperCase()), "Venue_Inventory");

  clearCaches();

  const analysisCounts = finalRows.reduce(
    (acc, row) => {
      const key = row.final_analysis || "Unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {},
  );

  return {
    generatedAt: new Date().toISOString(),
    outputFile: outputFileName,
    outputPath: outputFilePath,
    inventoryFile: inventoryFileName,
    inventoryPath: inventoryFilePath,
    rowCount: finalRows.length,
    analysisCounts,
    preview: finalRows.slice(0, 25),
  };
}

function getLatestAnalysisRowsNormalized() {
  const latest = pickLatestAnalysisFile();
  if (!latest.filePath || !fs.existsSync(latest.filePath)) return [];
  const rows = readWorkbookSmart(latest.filePath).rows;
  return rows.map((row) => normalizeRowKeys(row));
}

function getOccupancyMap() {
  const filePath = path.join(DATA_PATH, "DOTC Occupancy.xlsx");
  if (!fs.existsSync(filePath)) return new Map();
  const stat = fs.statSync(filePath);
  if (occupancyCache && occupancyCache.mtimeMs === stat.mtimeMs) return occupancyCache.map;

  const rows = readWorkbookSmart(filePath).rows.map((row) => normalizeRowKeys(row));
  const map = new Map();
  for (const row of rows) {
    const dms = cleanDms(row.dms_code || row.center_code || row.venue_code);
    if (!dms) continue;
    map.set(dms, toNumber(row.seat_occupancy) || toNumber(row.seat_occupancy_));
    const pct = row.seat_occupancy___ || row.seat_occupancy__ || row.seat_occupancy_per || row.seat_occupancy;
    if (toNumber(pct)) map.set(`${dms}_PCT`, toNumber(pct));
  }

  occupancyCache = { mtimeMs: stat.mtimeMs, map };
  return map;
}

function listVenuePhotos(dmsCode) {
  if (!fs.existsSync(PHOTOS_PATH)) return [];
  const prefix = cleanDms(dmsCode);
  if (!prefix) return [];
  return fs
    .readdirSync(PHOTOS_PATH)
    .filter((name) => /\.(png|jpe?g|webp)$/i.test(name))
    .filter((name) => name.toUpperCase().startsWith(prefix))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => `/photos/${encodeURIComponent(name)}`);
}

function buildCityPivot(rows, dimension) {
  const buckets = new Map();
  for (const row of rows) {
    const key = cleanText(row[dimension]);
    if (!key) continue;

    const type = cleanText(row.venue_type).toUpperCase();
    if (!["DATC", "DOTC"].includes(type)) continue;

    const status = cleanText(row.status).toUpperCase();
    const capacity = toNumber(row.venue_max_capacity);
    const current = buckets.get(key) || {
      key,
      DATC: 0,
      DOTC: 0,
      Total: 0,
      SeatCapacity: 0,
      Active: 0,
      ActiveCapacity: 0,
    };
    current[type] += 1;
    current.Total += 1;
    current.SeatCapacity += capacity;
    if (status === "ACTIVE") {
      current.Active += 1;
      current.ActiveCapacity += capacity;
    }
    buckets.set(key, current);
  }

  const rowsOut = Array.from(buckets.values()).sort((a, b) => b.Total - a.Total);
  const grandTotal = rowsOut.reduce(
    (acc, row) => ({
      key: "Grand Total",
      DATC: acc.DATC + row.DATC,
      DOTC: acc.DOTC + row.DOTC,
      Total: acc.Total + row.Total,
      SeatCapacity: acc.SeatCapacity + row.SeatCapacity,
      Active: acc.Active + row.Active,
      ActiveCapacity: acc.ActiveCapacity + row.ActiveCapacity,
    }),
    { key: "Grand Total", DATC: 0, DOTC: 0, Total: 0, SeatCapacity: 0, Active: 0, ActiveCapacity: 0 },
  );

  rowsOut.push(grandTotal);
  return rowsOut;
}

function buildCityChart(rows, dimension, topN = 20) {
  const map = new Map();
  for (const row of rows) {
    const key = cleanText(row[dimension]);
    if (!key) continue;
    const type = cleanText(row.venue_type).toUpperCase();
    if (!["DATC", "DOTC"].includes(type)) continue;
    if (!map.has(key)) map.set(key, { name: key, DATC: 0, DOTC: 0, Total: 0 });
    const item = map.get(key);
    item[type] += 1;
    item.Total += 1;
  }
  return Array.from(map.values())
    .sort((a, b) => b.Total - a.Total)
    .slice(0, topN);
}

function runManpowerQuery(filters = {}) {
  const filePath = path.join(DATA_PATH, "0 Final_Manpower_Data.xlsx");
  const workbook = readWorkbookSmart(filePath, "Data");
  if (!workbook.rows.length) {
    return {
      rows: [],
      overview: {},
      filterOptions: {},
      projectSummary: [],
      dmsSummary: [],
      regionCategorySummary: [],
      manpowerWiseSummary: [],
      manpowerWiseSpreadDrilldown: [],
      manpowerWiseTenureRoleDrilldown: [],
      manpowerWiseVenueDrilldown: [],
      manpowerWiseEmployeeRotationDrilldown: [],
      regionCategoryDrilldown: [],
      regionCategoryVenueDrilldown: [],
      regionCategoryVenuePersonDrilldown: [],
    };
  }

  const rows = workbook.rows.map((row) => normalizeRowKeys(row));
  const search = cleanText(filters.search || "").toLowerCase();
  const selectedEmployeeTypes = Array.isArray(filters.employeeTypes)
    ? filters.employeeTypes
    : ["DEXIT", "Outsourced"];
  const employeeTypeMap = {
    DEXIT: "DEXIT GLOBAL EMPLOYEE",
    Outsourced: "OUTSOURCE",
  };
  const employeeSourceTargets = new Set(
    selectedEmployeeTypes.map((type) => cleanText(employeeTypeMap[type] || type).toUpperCase()),
  );

  const fromDate = filters.dateFrom ? new Date(filters.dateFrom) : null;
  const toDate = filters.dateTo ? new Date(filters.dateTo) : null;

  const listFilter = (value) => (Array.isArray(value) ? value.map((entry) => cleanText(entry)) : []);
  const selectedProjects = new Set(listFilter(filters.projects));
  const selectedEmployees = new Set(listFilter(filters.employees));
  const selectedTenure = new Set(listFilter(filters.tenure));
  const selectedRoles = new Set(listFilter(filters.roles));
  const selectedRegions = new Set(listFilter(filters.regions));
  const selectedStates = new Set(listFilter(filters.states));
  const selectedExamCityCentres = new Set(listFilter(filters.examCityCentres));
  const selectedDelayStatuses = new Set(listFilter(filters.delayStatuses));
  const selectedIssues = new Set(listFilter(filters.issueFilters));

  const dmsKey = rows.length && Object.keys(rows[0]).includes("dms_code") ? "dms_code" : "center_code";

  const filtered = rows.filter((row) => {
    if (search) {
      const haystack = Object.values(row).map((value) => String(value)).join(" ").toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    const employeeSource = cleanText(row.employee_source || row.updated_employee_source).toUpperCase();
    if (employeeSourceTargets.size && !employeeSourceTargets.has(employeeSource)) return false;

    if (fromDate || toDate) {
      const date = row.date ? new Date(row.date) : null;
      if (!date || Number.isNaN(date.getTime())) return false;
      if (fromDate && date < fromDate) return false;
      if (toDate && date > toDate) return false;
    }

    if (selectedProjects.size && !selectedProjects.has(cleanText(row.project_name))) return false;
    if (selectedEmployees.size) {
      const empLabel = `${cleanText(row.emp_id)} - ${cleanText(row.name)}`;
      if (!selectedEmployees.has(empLabel)) return false;
    }
    if (selectedTenure.size && !selectedTenure.has(cleanText(row.tenure))) return false;
    if (selectedRoles.size && !selectedRoles.has(cleanText(row.role))) return false;
    if (selectedRegions.size && !selectedRegions.has(cleanText(row.region))) return false;
    if (selectedStates.size && !selectedStates.has(cleanText(row.state))) return false;
    if (selectedExamCityCentres.size) {
      const d = cleanText(row.district);
      const c = cleanText(row.city);
      const val = d && c ? `${d} / ${c}` : (d || c);
      if (!selectedExamCityCentres.has(val)) return false;
    }

    if (selectedDelayStatuses.size) {
      const statusChecks = {
        "Full Batch Delay": toNumber(row.full_batch_delay) > 0,
        "Partially Batch Delay": toNumber(row.partially_batch_delay) > 0,
        "No Delay": toNumber(row.no_delay) > 0,
      };
      let hasAny = false;
      for (const delayStatus of selectedDelayStatuses) {
        if (statusChecks[delayStatus]) {
          hasAny = true;
          break;
        }
      }
      if (!hasAny) return false;
    }

    if (selectedIssues.size) {
      const issueChecks = {
        "FFA = Yes": toNumber(row.ffa) > 0,
        "Call Logs = Yes": toNumber(row.call_logs_issue_count) > 0,
      };
      let hasIssue = false;
      for (const issue of selectedIssues) {
        if (issueChecks[issue]) {
          hasIssue = true;
          break;
        }
      }
      if (!hasIssue) return false;
    }

    return true;
  });

  const metricKeys = ["call_logs_issue_count", "ffa", "full_batch_delay", "partially_batch_delay", "no_delay"];
  const dedupeMap = new Map();
  for (const row of filtered) {
    const projectName = cleanText(row.project_name);
    const driveName = cleanText(row.drive_name);
    const dmsValue = cleanDms(row[dmsKey]);
    const dedupeKey = `${projectName}||${driveName}||${dmsValue}`;
    if (!dedupeMap.has(dedupeKey)) {
      const base = { ...row, [dmsKey]: dmsValue };
      metricKeys.forEach((metricKey) => {
        base[metricKey] = toNumber(base[metricKey]);
      });
      dedupeMap.set(dedupeKey, base);
      continue;
    }
    const current = dedupeMap.get(dedupeKey);
    metricKeys.forEach((metricKey) => {
      current[metricKey] = Math.max(toNumber(current[metricKey]), toNumber(row[metricKey]));
    });
  }
  const dedupedRows = Array.from(dedupeMap.values());

  const overview = {
    manpower: new Set(filtered.map((row) => cleanText(row.emp_id)).filter(Boolean)).size,
    projects: new Set(dedupedRows.map((row) => cleanText(row.project_name)).filter(Boolean)).size,
    drives: new Set(dedupedRows.map((row) => cleanText(row.drive_name)).filter(Boolean)).size,
    venueCount: new Set(
      dedupedRows
        .map((row) => cleanDms(row[dmsKey] || row.dms_code || row.center_code || row.venue_code || row.code))
        .filter((dmsCode) => dmsCode && dmsCode !== "UNKNOWN"),
    ).size,
    callLogs: dedupedRows.reduce((sum, row) => sum + toNumber(row.call_logs_issue_count), 0),
    ffa: dedupedRows.reduce((sum, row) => sum + toNumber(row.ffa), 0),
    fullBatchDelay: dedupedRows.reduce((sum, row) => sum + toNumber(row.full_batch_delay), 0),
    partialBatchDelay: dedupedRows.reduce((sum, row) => sum + toNumber(row.partially_batch_delay), 0),
    noBatchDelay: dedupedRows.reduce((sum, row) => sum + toNumber(row.no_delay), 0),
  };
  overview.totalBatches = overview.fullBatchDelay + overview.partialBatchDelay + overview.noBatchDelay;

  const projectSummaryMap = new Map();
  for (const row of dedupedRows) {
    const projectName = cleanText(row.project_name) || "Unknown";
    if (!projectSummaryMap.has(projectName)) {
      projectSummaryMap.set(projectName, {
        projectName,
        driveCount: 0,
        uniqueManpower: 0,
        callLogs: 0,
        ffa: 0,
        fullBatchDelay: 0,
        partialBatchDelay: 0,
        noBatchDelay: 0,
      });
    }
    const entry = projectSummaryMap.get(projectName);
    entry.callLogs += toNumber(row.call_logs_issue_count);
    entry.ffa += toNumber(row.ffa);
    entry.fullBatchDelay += toNumber(row.full_batch_delay);
    entry.partialBatchDelay += toNumber(row.partially_batch_delay);
    entry.noBatchDelay += toNumber(row.no_delay);
  }
  const projectRowsRaw = filtered.reduce((acc, row) => {
    const projectName = cleanText(row.project_name) || "Unknown";
    if (!acc.has(projectName)) {
      acc.set(projectName, { drives: new Set(), employees: new Set() });
    }
    const current = acc.get(projectName);
    if (cleanText(row.drive_name)) current.drives.add(cleanText(row.drive_name));
    if (cleanText(row.emp_id)) current.employees.add(cleanText(row.emp_id));
    return acc;
  }, new Map());
  for (const [projectName, detail] of projectRowsRaw.entries()) {
    const entry = projectSummaryMap.get(projectName);
    if (!entry) continue;
    entry.driveCount = detail.drives.size;
    entry.uniqueManpower = detail.employees.size;
  }

  const dmsSummaryMap = new Map();
  for (const row of dedupedRows) {
    const dms = cleanDms(row[dmsKey]) || "UNKNOWN";
    if (!dmsSummaryMap.has(dms)) {
      dmsSummaryMap.set(dms, {
        dmsCode: dms,
        driveCount: 0,
        uniqueManpower: 0,
        callLogs: 0,
        ffa: 0,
        fullBatchDelay: 0,
        partialBatchDelay: 0,
        noBatchDelay: 0,
      });
    }
    const entry = dmsSummaryMap.get(dms);
    entry.callLogs += toNumber(row.call_logs_issue_count);
    entry.ffa += toNumber(row.ffa);
    entry.fullBatchDelay += toNumber(row.full_batch_delay);
    entry.partialBatchDelay += toNumber(row.partially_batch_delay);
    entry.noBatchDelay += toNumber(row.no_delay);
  }
  const dmsRowsRaw = filtered.reduce((acc, row) => {
    const dms = cleanDms(row[dmsKey]) || "UNKNOWN";
    if (!acc.has(dms)) acc.set(dms, { drives: new Set(), employees: new Set() });
    const current = acc.get(dms);
    if (cleanText(row.drive_name)) current.drives.add(cleanText(row.drive_name));
    if (cleanText(row.emp_id)) current.employees.add(cleanText(row.emp_id));
    return acc;
  }, new Map());
  for (const [dms, detail] of dmsRowsRaw.entries()) {
    const entry = dmsSummaryMap.get(dms);
    if (!entry) continue;
    entry.driveCount = detail.drives.size;
    entry.uniqueManpower = detail.employees.size;
  }

  const latestAnalysisRows = getLatestAnalysisRowsNormalized();
  const dmsCategoryMap = new Map();
  const dmsVenueNameMap = new Map();
  const dmsVenueInsightMap = new Map();
  for (const row of latestAnalysisRows) {
    const dms = cleanDms(row.dms_code || row.center_code || row.venue_code || row.code);
    const category = cleanText(row.category).toUpperCase();
    const venueName = firstNonBlank([row.updated_venue_name, row.venue_name, row.name, row.venue]) || dms;
    if (!dms) continue;
    if (CATEGORY_ORDER.includes(category) && !dmsCategoryMap.has(dms)) dmsCategoryMap.set(dms, category);
    if (!dmsVenueNameMap.has(dms)) dmsVenueNameMap.set(dms, venueName);
    if (!dmsVenueInsightMap.has(dms)) {
      dmsVenueInsightMap.set(dms, {
        marketRemark: cleanText(row.market_remark),
        dayEndSummary: cleanText(row.deo_remarks_summary),
        suspiciousSummary: cleanText(row.suspicious_summary),
        callLogSummary: cleanText(row.call_log_summary),
        venueFeedbackSummary: cleanText(row.reason),
        googleCoordinates: cleanText(row.google_coordinates),
      });
    }
  }

  const createCategorySetBucket = () => ({
    A: new Set(),
    B: new Set(),
    C: new Set(),
    "BL-C": new Set(),
    BL: new Set(),
  });

  const regionCategoryMap = new Map();
  const regionManpowerMap = new Map();
  const manpowerSpreadMap = new Map();
  const manpowerTenureRoleMap = new Map();
  const manpowerVenueMap = new Map();
  const manpowerRotationScopeMap = new Map();
  const manpowerVenueEmployeeMap = new Map();
  const regionCategoryDrilldownMap = new Map();
  const regionCategoryVenueDrilldownMap = new Map();
  const regionCategoryVenuePersonDrilldownMap = new Map();

  const createDeliveryMetricBucket = () => ({
    deliveryKeys: new Set(),
    totalBatches: 0,
    fullBatchDelay: 0,
    partialBatchDelay: 0,
    noDelay: 0,
    ffa: 0,
    callLogs: 0,
  });
  const addDeliveryMetrics = (entry, row, deliveryKey) => {
    if (entry.deliveryKeys.has(deliveryKey)) return;
    entry.deliveryKeys.add(deliveryKey);
    entry.totalBatches += toNumber(row.total_batches);
    entry.fullBatchDelay += toNumber(row.full_batch_delay);
    entry.partialBatchDelay += toNumber(row.partially_batch_delay);
    entry.noDelay += toNumber(row.no_delay);
    entry.ffa += toNumber(row.ffa);
    entry.callLogs += toNumber(row.call_logs_issue_count);
  };
  const ISSUE_CATEGORY_ORDER = ["Security", "PC Related", "Electricity", "Cleanliness", "Material", "Other"];
  const classifyIssueCategory = (text) => {
    const value = cleanText(text).toUpperCase();
    if (!value) return null;
    if (/(SECURITY|GUARD|UNSAFE|SAFETY)/.test(value)) return "Security";
    if (/(PC|COMPUTER|SYSTEM|LAPTOP|KEYBOARD|MOUSE|BIOMETRIC|SOFTWARE|HANG|NETWORK|INTERNET)/.test(value)) {
      return "PC Related";
    }
    if (/(ELECTRIC|POWER|LIGHT|UPS|GENERATOR|CURRENT|VOLTAGE)/.test(value)) return "Electricity";
    if (/(CLEAN|DIRTY|WASHROOM|TOILET|HOUSEKEEP|HYGIENE)/.test(value)) return "Cleanliness";
    if (/(CHAIR|DESK|TABLE|FURNITURE|MAT|CABLE|WIRE|PRINTER|SCANNER)/.test(value)) return "Material";
    return "Other";
  };
  const addIssueCategory = (entry, row) => {
    const issueTexts = [cleanText(row.call_logs), cleanText(row.day_end_observation)];
    issueTexts.forEach((issueText) => {
      if (!issueText) return;
      const issueCategory = classifyIssueCategory(issueText);
      if (!issueCategory) return;
      entry.issueCategories[issueCategory] = (entry.issueCategories[issueCategory] || 0) + 1;
    });
  };
  const formatIssueCategorySummary = (issueCategories) => {
    const parts = ISSUE_CATEGORY_ORDER
      .filter((name) => issueCategories[name])
      .map((name) => `${name}: ${issueCategories[name]}`);
    return parts.join(", ") || "-";
  };
  const GOVT_ID_KEYS = [
    "govt_id",
    "government_id",
    "govt_id_number",
    "government_id_number",
    "pan",
    "pan_card",
    "pan_no",
    "aadhaar",
    "aadhar",
    "aadhaar_no",
    "aadhar_no",
    "voter_id",
    "driving_license",
    "passport",
  ];
  const DECLARATION_KEYS = [
    "declaration",
    "declaration_status",
    "declaration_signed",
    "signed_declaration",
    "declaration_accepted",
    "employee_declaration",
    "nda_signed",
    "consent",
    "consent_status",
  ];
  const hasAnyFieldValue = (row, keys) =>
    keys.some((key) => {
      const value = row?.[key];
      return !isBlankLike(value);
    });

  for (const row of filtered) {
    const region = cleanText(row.region) || "Unknown";
    const empId = cleanText(row.emp_id);
    if (!empId) continue;

    const dmsValue = cleanDms(row[dmsKey] || row.dms_code || row.center_code || row.venue_code);
    const safeDmsCode = dmsValue || "UNKNOWN";
    const venueName = dmsVenueNameMap.get(dmsValue) || dmsValue || "Unknown Venue";
    const fallbackCategory = cleanText(row.category).toUpperCase();
    const category = dmsCategoryMap.get(dmsValue) || (CATEGORY_ORDER.includes(fallbackCategory) ? fallbackCategory : null);
    const venueInsight = dmsVenueInsightMap.get(safeDmsCode) || {};
    const employeeSource = cleanText(row.employee_source || row.updated_employee_source).toUpperCase();
    const isOutsourced = employeeSource.includes("OUTSOURCE");
    const workforceType = isOutsourced ? "Outsource" : "Owned";
    const state = cleanText(row.state) || "Unknown";
    const district = cleanText(row.district) || "-";
    const city = cleanText(row.city) || "-";
    const tenure = cleanText(row.tenure) || "Unknown";
    const role = cleanText(row.role) || "Unknown";
    const projectName = cleanText(row.project_name) || "Unknown Project";
    const driveName = cleanText(row.drive_name) || "Unknown Drive";
    const hasGovtId = hasAnyFieldValue(row, GOVT_ID_KEYS);
    const hasDeclaration = hasAnyFieldValue(row, DECLARATION_KEYS);
    const deliveryKey = `${projectName}||${driveName}||${safeDmsCode}||${empId}`;
    const spreadKey = `${region}||${workforceType}||${state}`;
    const tenureRoleKey = `${spreadKey}||${tenure}||${role}`;
    const venueKey = `${tenureRoleKey}||${safeDmsCode}||${venueName}`;
    const rotationKey = `${tenureRoleKey}||${empId}`;
    const venueEmployeeKey = `${venueKey}||${empId}`;

    if (!regionCategoryMap.has(region)) {
      regionCategoryMap.set(region, { region, ...createCategorySetBucket() });
    }
    if (!regionManpowerMap.has(region)) {
      regionManpowerMap.set(region, {
        region,
        owned: new Set(),
        outsourced: new Set(),
        ...createCategorySetBucket(),
        tenureLt1: new Set(),
        tenure1to2: new Set(),
        tenure2to5: new Set(),
        tenureGt5: new Set(),
        tenureUnknown: new Set(),
      });
    }

    const entry = regionCategoryMap.get(region);
    const manpowerEntry = regionManpowerMap.get(region);

    if (isOutsourced) manpowerEntry.outsourced.add(empId);
    else manpowerEntry.owned.add(empId);

    if (tenure === "<1 yr") manpowerEntry.tenureLt1.add(empId);
    else if (tenure === "1 to 2 yrs") manpowerEntry.tenure1to2.add(empId);
    else if (tenure === "2 to 5 yrs") manpowerEntry.tenure2to5.add(empId);
    else if (tenure === ">5 yrs") manpowerEntry.tenureGt5.add(empId);
    else manpowerEntry.tenureUnknown.add(empId);

    if (!manpowerSpreadMap.has(spreadKey)) {
      manpowerSpreadMap.set(spreadKey, {
        region,
        workforceType,
        state,
        employees: new Set(),
        venues: new Set(),
        ...createDeliveryMetricBucket(),
      });
    }
    const spreadEntry = manpowerSpreadMap.get(spreadKey);
    spreadEntry.employees.add(empId);
    if (safeDmsCode && safeDmsCode !== "UNKNOWN") spreadEntry.venues.add(safeDmsCode);
    addDeliveryMetrics(spreadEntry, row, deliveryKey);

    if (!manpowerTenureRoleMap.has(tenureRoleKey)) {
      manpowerTenureRoleMap.set(tenureRoleKey, {
        region,
        workforceType,
        state,
        tenure,
        role,
        employees: new Set(),
        venues: new Set(),
        ...createDeliveryMetricBucket(),
      });
    }
    const tenureRoleEntry = manpowerTenureRoleMap.get(tenureRoleKey);
    tenureRoleEntry.employees.add(empId);
    if (safeDmsCode && safeDmsCode !== "UNKNOWN") tenureRoleEntry.venues.add(safeDmsCode);
    addDeliveryMetrics(tenureRoleEntry, row, deliveryKey);

    if (!manpowerVenueMap.has(venueKey)) {
      manpowerVenueMap.set(venueKey, {
        region,
        workforceType,
        state,
        tenure,
        role,
        district,
        city,
        dmsCode: safeDmsCode,
        venueName,
        category: category || "-",
        employees: new Set(),
        ...createDeliveryMetricBucket(),
      });
    }
    const venueEntry = manpowerVenueMap.get(venueKey);
    venueEntry.employees.add(empId);
    if (category && venueEntry.category === "-") venueEntry.category = category;
    addDeliveryMetrics(venueEntry, row, deliveryKey);

    if (!manpowerRotationScopeMap.has(rotationKey)) {
      manpowerRotationScopeMap.set(rotationKey, {
        region,
        workforceType,
        state,
        tenure,
        role,
        empId,
        personName: cleanText(row.name) || empId || "Unknown",
        projects: new Set(),
        drives: new Set(),
        venues: new Set(),
        issueCategories: {},
        ...createDeliveryMetricBucket(),
      });
    }
    const rotationEntry = manpowerRotationScopeMap.get(rotationKey);
    rotationEntry.projects.add(projectName);
    rotationEntry.drives.add(driveName);
    rotationEntry.venues.add(`${safeDmsCode}||${venueName}`);
    addDeliveryMetrics(rotationEntry, row, deliveryKey);
    addIssueCategory(rotationEntry, row);

    if (!manpowerVenueEmployeeMap.has(venueEmployeeKey)) {
      manpowerVenueEmployeeMap.set(venueEmployeeKey, {
        region,
        workforceType,
        state,
        tenure,
        role,
        district,
        city,
        dmsCode: safeDmsCode,
        venueName,
        category: category || "-",
        empId,
        personName: cleanText(row.name) || empId || "Unknown",
        phone: cleanText(row.number),
        email: cleanText(row.email),
        issueCategories: {},
        rotationKey,
        records: 0,
        hasGovtId,
        hasDeclaration,
        marketRemark: venueInsight.marketRemark || "",
        dayEndSummary: venueInsight.dayEndSummary || cleanText(row.day_end_observation),
        callLogSummary: venueInsight.callLogSummary || cleanText(row.call_logs),
        venueFeedbackSummary: venueInsight.venueFeedbackSummary || "",
        googleCoordinates: venueInsight.googleCoordinates || "",
        suspiciousSummary: venueInsight.suspiciousSummary || "",
        ...createDeliveryMetricBucket(),
      });
    }
    const venueEmployeeEntry = manpowerVenueEmployeeMap.get(venueEmployeeKey);
    venueEmployeeEntry.records += 1;
    if (!venueEmployeeEntry.phone && cleanText(row.number)) venueEmployeeEntry.phone = cleanText(row.number);
    if (!venueEmployeeEntry.email && cleanText(row.email)) venueEmployeeEntry.email = cleanText(row.email);
    if (hasGovtId) venueEmployeeEntry.hasGovtId = true;
    if (hasDeclaration) venueEmployeeEntry.hasDeclaration = true;
    if (!venueEmployeeEntry.dayEndSummary && cleanText(row.day_end_observation)) venueEmployeeEntry.dayEndSummary = cleanText(row.day_end_observation);
    if (!venueEmployeeEntry.callLogSummary && cleanText(row.call_logs)) venueEmployeeEntry.callLogSummary = cleanText(row.call_logs);
    if (!venueEmployeeEntry.venueFeedbackSummary && cleanText(row.call_logs)) {
      venueEmployeeEntry.venueFeedbackSummary = cleanText(row.call_logs);
    }
    if (category && venueEmployeeEntry.category === "-") venueEmployeeEntry.category = category;
    addDeliveryMetrics(venueEmployeeEntry, row, deliveryKey);
    addIssueCategory(venueEmployeeEntry, row);

    if (category && CATEGORY_ORDER.includes(category)) {
      entry[category].add(empId);
      manpowerEntry[category].add(empId);

      const drilldownKey = `${region}||${category}||${state}||${district}||${city}`;
      const venueDrilldownKey = `${region}||${category}||${state}||${district}||${city}||${dmsValue}||${venueName}`;

      if (!regionCategoryDrilldownMap.has(drilldownKey)) {
        regionCategoryDrilldownMap.set(drilldownKey, {
          region,
          category,
          state,
          district,
          city,
          employees: new Set(),
        });
      }

      regionCategoryDrilldownMap.get(drilldownKey).employees.add(empId);

      if (!regionCategoryVenueDrilldownMap.has(venueDrilldownKey)) {
        regionCategoryVenueDrilldownMap.set(venueDrilldownKey, {
          region,
          category,
          state,
          district,
          city,
          venueName,
          dmsCode: dmsValue || "UNKNOWN",
          employees: new Set(),
        });
      }

      regionCategoryVenueDrilldownMap.get(venueDrilldownKey).employees.add(empId);

      const personDrilldownKey = `${venueDrilldownKey}||${empId}`;
      if (!regionCategoryVenuePersonDrilldownMap.has(personDrilldownKey)) {
        regionCategoryVenuePersonDrilldownMap.set(personDrilldownKey, {
          region,
          category,
          state,
          district,
          city,
          venueName,
          dmsCode: dmsValue || "UNKNOWN",
          empId,
          personName: cleanText(row.name) || empId || "Unknown",
          roles: new Set(),
          tenures: new Set(),
          phones: new Set(),
          emails: new Set(),
          dates: new Set(),
          records: 0,
        });
      }

      const personEntry = regionCategoryVenuePersonDrilldownMap.get(personDrilldownKey);
      personEntry.records += 1;
      if (cleanText(row.role)) personEntry.roles.add(cleanText(row.role));
      if (cleanText(row.tenure)) personEntry.tenures.add(cleanText(row.tenure));
      if (cleanText(row.number)) personEntry.phones.add(cleanText(row.number));
      if (cleanText(row.email)) personEntry.emails.add(cleanText(row.email));
      if (cleanText(row.date)) personEntry.dates.add(cleanText(row.date));
    }
  }

  const preferredRegionOrder = ["North", "North One", "North Two", "East", "West", "South"];
  const regionOrderRank = new Map(preferredRegionOrder.map((region, idx) => [region.toUpperCase(), idx]));
  const regionCategorySummary = Array.from(regionCategoryMap.values())
    .sort((a, b) => {
      const aKey = cleanText(a.region).toUpperCase();
      const bKey = cleanText(b.region).toUpperCase();
      const aRank = regionOrderRank.has(aKey) ? regionOrderRank.get(aKey) : Number.MAX_SAFE_INTEGER;
      const bRank = regionOrderRank.has(bKey) ? regionOrderRank.get(bKey) : Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) return aRank - bRank;
      return a.region.localeCompare(b.region, "en", { sensitivity: "base" });
    })
    .map((entry) => ({
      region: entry.region,
      categoryAUniqueManpower: entry.A.size,
      categoryBUniqueManpower: entry.B.size,
      categoryCUniqueManpower: entry.C.size,
      categoryBlcUniqueManpower: entry["BL-C"].size,
      categoryBlUniqueManpower: entry.BL.size,
    }));
  const manpowerWiseSummary = Array.from(regionManpowerMap.values())
    .sort((a, b) => {
      const aKey = cleanText(a.region).toUpperCase();
      const bKey = cleanText(b.region).toUpperCase();
      const aRank = regionOrderRank.has(aKey) ? regionOrderRank.get(aKey) : Number.MAX_SAFE_INTEGER;
      const bRank = regionOrderRank.has(bKey) ? regionOrderRank.get(bKey) : Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) return aRank - bRank;
      return a.region.localeCompare(b.region, "en", { sensitivity: "base" });
    })
    .map((entry) => ({
      region: entry.region,
      ownedUniqueManpower: entry.owned.size,
      outsourcedUniqueManpower: entry.outsourced.size,
      categoryAUniqueManpower: entry.A.size,
      categoryBUniqueManpower: entry.B.size,
      categoryCUniqueManpower: entry.C.size,
      categoryBlcUniqueManpower: entry["BL-C"].size,
      categoryBlUniqueManpower: entry.BL.size,
      tenureLt1Count: entry.tenureLt1.size,
      tenure1to2Count: entry.tenure1to2.size,
      tenure2to5Count: entry.tenure2to5.size,
      tenureGt5Count: entry.tenureGt5.size,
      tenureUnknownCount: entry.tenureUnknown.size,
    }));
  const workforceRank = new Map([
    ["Owned", 0],
    ["Outsource", 1],
  ]);
  const compareRegionAndWorkforce = (a, b) => {
    const aRegionKey = cleanText(a.region).toUpperCase();
    const bRegionKey = cleanText(b.region).toUpperCase();
    const aRegionRank = regionOrderRank.has(aRegionKey) ? regionOrderRank.get(aRegionKey) : Number.MAX_SAFE_INTEGER;
    const bRegionRank = regionOrderRank.has(bRegionKey) ? regionOrderRank.get(bRegionKey) : Number.MAX_SAFE_INTEGER;
    if (aRegionRank !== bRegionRank) return aRegionRank - bRegionRank;
    const aWorkforceRank = workforceRank.has(a.workforceType) ? workforceRank.get(a.workforceType) : Number.MAX_SAFE_INTEGER;
    const bWorkforceRank = workforceRank.has(b.workforceType) ? workforceRank.get(b.workforceType) : Number.MAX_SAFE_INTEGER;
    if (aWorkforceRank !== bWorkforceRank) return aWorkforceRank - bWorkforceRank;
    return a.region.localeCompare(b.region, "en", { sensitivity: "base" });
  };
  const manpowerWiseSpreadDrilldown = Array.from(manpowerSpreadMap.values())
    .map((entry) => ({
      region: entry.region,
      workforceType: entry.workforceType,
      state: entry.state,
      uniqueManpower: entry.employees.size,
      uniqueVenues: entry.venues.size,
      totalBatches: entry.totalBatches,
      fullBatchDelay: entry.fullBatchDelay,
      partialBatchDelay: entry.partialBatchDelay,
      noDelay: entry.noDelay,
      ffa: entry.ffa,
      callLogs: entry.callLogs,
    }))
    .sort((a, b) => {
      const base = compareRegionAndWorkforce(a, b);
      if (base !== 0) return base;
      if (b.uniqueManpower !== a.uniqueManpower) return b.uniqueManpower - a.uniqueManpower;
      return a.state.localeCompare(b.state, "en", { sensitivity: "base" });
    });
  const manpowerWiseTenureRoleDrilldown = Array.from(manpowerTenureRoleMap.values())
    .map((entry) => ({
      region: entry.region,
      workforceType: entry.workforceType,
      state: entry.state,
      tenure: entry.tenure,
      role: entry.role,
      uniqueManpower: entry.employees.size,
      uniqueVenues: entry.venues.size,
      totalBatches: entry.totalBatches,
      fullBatchDelay: entry.fullBatchDelay,
      partialBatchDelay: entry.partialBatchDelay,
      noDelay: entry.noDelay,
      ffa: entry.ffa,
      callLogs: entry.callLogs,
    }))
    .sort((a, b) => {
      const base = compareRegionAndWorkforce(a, b);
      if (base !== 0) return base;
      if (a.state !== b.state) return a.state.localeCompare(b.state, "en", { sensitivity: "base" });
      if (b.uniqueManpower !== a.uniqueManpower) return b.uniqueManpower - a.uniqueManpower;
      if (a.tenure !== b.tenure) return a.tenure.localeCompare(b.tenure, "en", { sensitivity: "base" });
      return a.role.localeCompare(b.role, "en", { sensitivity: "base" });
    });
  const manpowerWiseVenueDrilldown = Array.from(manpowerVenueMap.values())
    .map((entry) => ({
      region: entry.region,
      workforceType: entry.workforceType,
      state: entry.state,
      tenure: entry.tenure,
      role: entry.role,
      district: entry.district,
      city: entry.city,
      dmsCode: entry.dmsCode,
      venueName: entry.venueName,
      category: entry.category,
      uniqueManpower: entry.employees.size,
      totalBatches: entry.totalBatches,
      fullBatchDelay: entry.fullBatchDelay,
      partialBatchDelay: entry.partialBatchDelay,
      noDelay: entry.noDelay,
      ffa: entry.ffa,
      callLogs: entry.callLogs,
    }))
    .sort((a, b) => {
      const base = compareRegionAndWorkforce(a, b);
      if (base !== 0) return base;
      if (a.state !== b.state) return a.state.localeCompare(b.state, "en", { sensitivity: "base" });
      if (a.tenure !== b.tenure) return a.tenure.localeCompare(b.tenure, "en", { sensitivity: "base" });
      if (a.role !== b.role) return a.role.localeCompare(b.role, "en", { sensitivity: "base" });
      if (b.uniqueManpower !== a.uniqueManpower) return b.uniqueManpower - a.uniqueManpower;
      return a.venueName.localeCompare(b.venueName, "en", { sensitivity: "base" });
    });
  const photoFileNames = fs.existsSync(PHOTOS_PATH)
    ? fs.readdirSync(PHOTOS_PATH).filter((name) => /\.(png|jpe?g|webp)$/i.test(name))
    : [];
  const photoCacheByDms = new Map();
  const getPhotoUrlsForDms = (dmsCode) => {
    const safeCode = cleanDms(dmsCode);
    if (!safeCode || safeCode === "UNKNOWN") return [];
    if (photoCacheByDms.has(safeCode)) return photoCacheByDms.get(safeCode);
    const urls = photoFileNames
      .filter((name) => name.toUpperCase().startsWith(safeCode))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => `/photos/${encodeURIComponent(name)}`);
    photoCacheByDms.set(safeCode, urls);
    return urls;
  };
  const manpowerWiseEmployeeRotationDrilldown = Array.from(manpowerVenueEmployeeMap.values())
    .map((entry) => {
      const rotationEntry = manpowerRotationScopeMap.get(entry.rotationKey);
      const photoUrls = getPhotoUrlsForDms(entry.dmsCode);
      return {
        region: entry.region,
        workforceType: entry.workforceType,
        state: entry.state,
        tenure: entry.tenure,
        role: entry.role,
        district: entry.district,
        city: entry.city,
        dmsCode: entry.dmsCode,
        venueName: entry.venueName,
        category: entry.category,
        empId: entry.empId,
        personName: entry.personName,
        phone: entry.phone,
        email: entry.email,
        hasPhone: Boolean(cleanText(entry.phone)),
        hasEmail: Boolean(cleanText(entry.email)),
        hasGovtId: Boolean(entry.hasGovtId),
        hasDeclaration: Boolean(entry.hasDeclaration),
        hasPhoto: photoUrls.length > 0,
        photoCount: photoUrls.length,
        photoPreviewUrl: photoUrls[0] || "",
        documentsAvailable: Boolean(entry.hasGovtId || entry.hasDeclaration),
        records: entry.records,
        totalBatches: entry.totalBatches,
        fullBatchDelay: entry.fullBatchDelay,
        partialBatchDelay: entry.partialBatchDelay,
        noDelay: entry.noDelay,
        ffa: entry.ffa,
        callLogs: entry.callLogs,
        uniqueVenuesInScope: rotationEntry ? rotationEntry.venues.size : 0,
        uniqueDrivesInScope: rotationEntry ? rotationEntry.drives.size : 0,
        uniqueProjectsInScope: rotationEntry ? rotationEntry.projects.size : 0,
        issueCategorySummary: formatIssueCategorySummary(entry.issueCategories),
        scopeIssueCategorySummary: rotationEntry ? formatIssueCategorySummary(rotationEntry.issueCategories) : "-",
        marketRemark: entry.marketRemark || "-",
        dayEndSummary: entry.dayEndSummary || "-",
        callLogSummary: entry.callLogSummary || "-",
        venueFeedbackSummary: entry.venueFeedbackSummary || "-",
        googleCoordinates: entry.googleCoordinates || "-",
        suspiciousSummary: entry.suspiciousSummary || "-",
      };
    })
    .sort((a, b) => {
      const base = compareRegionAndWorkforce(a, b);
      if (base !== 0) return base;
      if (a.state !== b.state) return a.state.localeCompare(b.state, "en", { sensitivity: "base" });
      if (a.tenure !== b.tenure) return a.tenure.localeCompare(b.tenure, "en", { sensitivity: "base" });
      if (a.role !== b.role) return a.role.localeCompare(b.role, "en", { sensitivity: "base" });
      if (a.venueName !== b.venueName) return a.venueName.localeCompare(b.venueName, "en", { sensitivity: "base" });
      return a.personName.localeCompare(b.personName, "en", { sensitivity: "base" });
    });

  const categoryRank = new Map(CATEGORY_ORDER.map((category, idx) => [category, idx]));
  const regionCategoryDrilldown = Array.from(regionCategoryDrilldownMap.values())
    .map((entry) => ({
      region: entry.region,
      category: entry.category,
      state: entry.state,
      district: entry.district,
      city: entry.city,
      uniqueManpowerCount: entry.employees.size,
    }))
    .sort((a, b) => {
      const aRegionKey = cleanText(a.region).toUpperCase();
      const bRegionKey = cleanText(b.region).toUpperCase();
      const aRegionRank = regionOrderRank.has(aRegionKey) ? regionOrderRank.get(aRegionKey) : Number.MAX_SAFE_INTEGER;
      const bRegionRank = regionOrderRank.has(bRegionKey) ? regionOrderRank.get(bRegionKey) : Number.MAX_SAFE_INTEGER;
      if (aRegionRank !== bRegionRank) return aRegionRank - bRegionRank;

      const aCategoryRank = categoryRank.has(a.category) ? categoryRank.get(a.category) : Number.MAX_SAFE_INTEGER;
      const bCategoryRank = categoryRank.has(b.category) ? categoryRank.get(b.category) : Number.MAX_SAFE_INTEGER;
      if (aCategoryRank !== bCategoryRank) return aCategoryRank - bCategoryRank;

      if (b.uniqueManpowerCount !== a.uniqueManpowerCount) return b.uniqueManpowerCount - a.uniqueManpowerCount;
      if (a.state !== b.state) return a.state.localeCompare(b.state, "en", { sensitivity: "base" });
      if (a.district !== b.district) return a.district.localeCompare(b.district, "en", { sensitivity: "base" });
      return a.city.localeCompare(b.city, "en", { sensitivity: "base" });
    });

  const regionCategoryVenueDrilldown = Array.from(regionCategoryVenueDrilldownMap.values())
    .map((entry) => ({
      region: entry.region,
      category: entry.category,
      state: entry.state,
      district: entry.district,
      city: entry.city,
      venueName: entry.venueName,
      dmsCode: entry.dmsCode,
      uniqueManpowerCount: entry.employees.size,
    }))
    .sort((a, b) => {
      const aRegionKey = cleanText(a.region).toUpperCase();
      const bRegionKey = cleanText(b.region).toUpperCase();
      const aRegionRank = regionOrderRank.has(aRegionKey) ? regionOrderRank.get(aRegionKey) : Number.MAX_SAFE_INTEGER;
      const bRegionRank = regionOrderRank.has(bRegionKey) ? regionOrderRank.get(bRegionKey) : Number.MAX_SAFE_INTEGER;
      if (aRegionRank !== bRegionRank) return aRegionRank - bRegionRank;

      const aCategoryRank = categoryRank.has(a.category) ? categoryRank.get(a.category) : Number.MAX_SAFE_INTEGER;
      const bCategoryRank = categoryRank.has(b.category) ? categoryRank.get(b.category) : Number.MAX_SAFE_INTEGER;
      if (aCategoryRank !== bCategoryRank) return aCategoryRank - bCategoryRank;

      if (a.state !== b.state) return a.state.localeCompare(b.state, "en", { sensitivity: "base" });
      if (a.district !== b.district) return a.district.localeCompare(b.district, "en", { sensitivity: "base" });
      if (a.city !== b.city) return a.city.localeCompare(b.city, "en", { sensitivity: "base" });
      if (b.uniqueManpowerCount !== a.uniqueManpowerCount) return b.uniqueManpowerCount - a.uniqueManpowerCount;
      return a.venueName.localeCompare(b.venueName, "en", { sensitivity: "base" });
    });

  const regionCategoryVenuePersonDrilldown = Array.from(regionCategoryVenuePersonDrilldownMap.values())
    .map((entry) => {
      const detailParts = [];
      if (entry.empId) detailParts.push(`ID: ${entry.empId}`);
      if (entry.roles.size) detailParts.push(`Role: ${Array.from(entry.roles).join(", ")}`);
      if (entry.tenures.size) detailParts.push(`Tenure: ${Array.from(entry.tenures).join(", ")}`);
      if (entry.phones.size) detailParts.push(`Mobile: ${Array.from(entry.phones).join(", ")}`);
      if (entry.emails.size) detailParts.push(`Email: ${Array.from(entry.emails).join(", ")}`);
      if (entry.dates.size) detailParts.push(`Dates: ${Array.from(entry.dates).slice(0, 3).join(", ")}`);
      detailParts.push(`Entries: ${entry.records}`);

      return {
        region: entry.region,
        category: entry.category,
        state: entry.state,
        district: entry.district,
        city: entry.city,
        venueName: entry.venueName,
        dmsCode: entry.dmsCode,
        personName: entry.personName,
        personDetails: detailParts.join(" | "),
      };
    })
    .sort((a, b) => {
      const aRegionKey = cleanText(a.region).toUpperCase();
      const bRegionKey = cleanText(b.region).toUpperCase();
      const aRegionRank = regionOrderRank.has(aRegionKey) ? regionOrderRank.get(aRegionKey) : Number.MAX_SAFE_INTEGER;
      const bRegionRank = regionOrderRank.has(bRegionKey) ? regionOrderRank.get(bRegionKey) : Number.MAX_SAFE_INTEGER;
      if (aRegionRank !== bRegionRank) return aRegionRank - bRegionRank;

      const aCategoryRank = categoryRank.has(a.category) ? categoryRank.get(a.category) : Number.MAX_SAFE_INTEGER;
      const bCategoryRank = categoryRank.has(b.category) ? categoryRank.get(b.category) : Number.MAX_SAFE_INTEGER;
      if (aCategoryRank !== bCategoryRank) return aCategoryRank - bCategoryRank;

      if (a.state !== b.state) return a.state.localeCompare(b.state, "en", { sensitivity: "base" });
      if (a.district !== b.district) return a.district.localeCompare(b.district, "en", { sensitivity: "base" });
      if (a.city !== b.city) return a.city.localeCompare(b.city, "en", { sensitivity: "base" });
      if (a.venueName !== b.venueName) return a.venueName.localeCompare(b.venueName, "en", { sensitivity: "base" });
      return a.personName.localeCompare(b.personName, "en", { sensitivity: "base" });
    });


  const filterOptions = {
    projects: Array.from(new Set(filtered.map((row) => cleanText(row.project_name)).filter(Boolean))).sort(),
    employees: Array.from(
      new Set(
        filtered
          .map((row) => `${cleanText(row.emp_id)} - ${cleanText(row.name)}`)
          .filter((label) => label !== " - "),
      ),
    ).sort(),
    tenure: Array.from(new Set(filtered.map((row) => cleanText(row.tenure)).filter(Boolean))).sort(),
    roles: Array.from(new Set(filtered.map((row) => cleanText(row.role)).filter(Boolean))).sort(),
    regions: Array.from(new Set(filtered.map((row) => cleanText(row.region)).filter(Boolean))).sort(),
    states: Array.from(new Set(filtered.map((row) => cleanText(row.state)).filter(Boolean))).sort(),
    examCityCentres: Array.from(new Set(filtered.map((row) => {
      const d = cleanText(row.district);
      const c = cleanText(row.city);
      if (d && c) return `${d} / ${c}`;
      return d || c;
    }).filter(Boolean))).sort(),
  };

  return {
    rowCount: filtered.length,
    dedupedCount: dedupedRows.length,
    overview,
    filterOptions,
    dedupedRows,
    projectSummary: Array.from(projectSummaryMap.values()).sort((a, b) => b.driveCount - a.driveCount),
    dmsSummary: Array.from(dmsSummaryMap.values()).sort((a, b) => b.callLogs - a.callLogs),
    regionCategorySummary,
    manpowerWiseSummary,
    manpowerWiseSpreadDrilldown,
    manpowerWiseTenureRoleDrilldown,
    manpowerWiseVenueDrilldown,
    manpowerWiseEmployeeRotationDrilldown,
    regionCategoryDrilldown,
    regionCategoryVenueDrilldown,
    regionCategoryVenuePersonDrilldown,
  };
}

app.post("/api/login", (req, res) => {
  const username = cleanText(req.body?.username);
  const password = cleanText(req.body?.password);
  if (USERS[username] && USERS[username] === password) {
    const datasets = Object.entries(FILES)
      .filter(([, config]) => config.users.includes(username))
      .map(([key]) => key);
    return res.json({
      success: true,
      user: username,
      datasets,
    });
  }
  return res.status(401).json({ success: false, message: "Invalid credentials" });
});

app.get("/api/datasets", (req, res) => {
  const username = cleanText(req.query.user);
  if (!username || !USERS[username]) {
    return res.json({ datasets: Object.keys(FILES) });
  }
  const datasets = Object.entries(FILES)
    .filter(([, config]) => config.users.includes(username))
    .map(([key]) => key);
  return res.json({ datasets });
});

app.get("/api/master/allowed", (req, res) => {
  const username = cleanText(req.query.user);
  if (!username || !USERS[username]) {
    return res.json({ datasets: [] });
  }
  const datasets = Object.entries(FILES)
    .filter(([, config]) => config.users.includes(username))
    .map(([key]) => key);
  return res.json({ datasets });
});

app.get("/api/master/:dataset", (req, res) => {
  const dataset = decodeURIComponent(req.params.dataset);
  const filePath = getDatasetPath(dataset);
  if (!filePath) return res.status(404).json({ error: "Dataset not found" });

  const workbook = readWorkbookSmart(filePath);
  return res.json({
    dataset,
    fileName: path.basename(filePath),
    headers: workbook.headers,
    count: workbook.rows.length,
    rows: workbook.rows,
  });
});

app.post("/api/master/:dataset/save", (req, res) => {
  const dataset = decodeURIComponent(req.params.dataset);
  const filePath = getDatasetPath(dataset);
  if (!filePath) return res.status(404).json({ error: "Dataset not found" });
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const headers = Array.isArray(req.body?.headers) ? req.body.headers : null;
  const sheetName = readWorkbookSmart(filePath).sheetName || "Sheet1";
  writeWorkbook(filePath, rows, headers, sheetName);
  clearCaches();
  return res.json({ success: true, dataset, count: rows.length });
});

app.post("/api/master/:dataset/upsert", (req, res) => {
  const dataset = decodeURIComponent(req.params.dataset);
  const filePath = getDatasetPath(dataset);
  if (!filePath) return res.status(404).json({ error: "Dataset not found" });

  const incomingRows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!incomingRows.length) return res.json({ success: true, updated: 0, inserted: 0, count: 0 });

  const existingWorkbook = readWorkbookSmart(filePath);
  const existingRows = existingWorkbook.rows || [];

  const normalizedExisting = existingRows.map((row, idx) => ({ idx, row, normalized: normalizeRowKeys(row) }));
  const normalizedIncoming = incomingRows.map((row) => ({ row, normalized: normalizeRowKeys(row) }));

  const detectDmsColumn = (records) => {
    if (!records.length) return null;
    const keyVotes = ["dms_code", "venue_code", "updated_dms_code", "center_code", "code", "row_labels"];
    for (const key of keyVotes) {
      if (records.some((record) => Object.keys(record.normalized).includes(key))) return key;
    }
    return null;
  };

  const existingDmsKey = detectDmsColumn(normalizedExisting);
  const incomingDmsKey = detectDmsColumn(normalizedIncoming);

  let updated = 0;
  let inserted = 0;
  const mergedRows = [...existingRows];

  if (!existingDmsKey || !incomingDmsKey) {
    incomingRows.forEach((row) => mergedRows.push(row));
    inserted = incomingRows.length;
  } else {
    const indexByDms = new Map();
    normalizedExisting.forEach((record) => {
      const dms = cleanDms(record.normalized[existingDmsKey]);
      if (dms) indexByDms.set(dms, record.idx);
    });

    for (const record of normalizedIncoming) {
      const dms = cleanDms(record.normalized[incomingDmsKey]);
      if (dms && indexByDms.has(dms)) {
        const idx = indexByDms.get(dms);
        mergedRows[idx] = { ...mergedRows[idx], ...record.row };
        updated += 1;
      } else {
        mergedRows.push(record.row);
        inserted += 1;
      }
    }
  }

  const sheetName = existingWorkbook.sheetName || "Sheet1";
  const headers = existingWorkbook.headers?.length
    ? Array.from(new Set([...existingWorkbook.headers, ...Object.keys(incomingRows[0] || {})]))
    : null;
  writeWorkbook(filePath, mergedRows, headers, sheetName);
  clearCaches();
  return res.json({
    success: true,
    dataset,
    updated,
    inserted,
    count: mergedRows.length,
  });
});

app.post("/api/master/:dataset/upload", upload.single("file"), (req, res) => {
  const dataset = decodeURIComponent(req.params.dataset);
  const filePath = getDatasetPath(dataset);
  if (!filePath) return res.status(404).json({ error: "Dataset not found" });
  if (!req.file?.buffer) return res.status(400).json({ error: "No file uploaded" });

  try {
    const parsed = readWorkbookFromBuffer(req.file.buffer);
    const rows = parsed.rows || [];
    const mode = cleanText(req.query.mode || req.body.mode).toLowerCase() || "upsert";
    if (!rows.length) {
      return res.status(400).json({ error: "Uploaded file has no usable rows" });
    }

    if (mode === "replace") {
      const current = readWorkbookSmart(filePath);
      writeWorkbook(filePath, rows, parsed.headers, current.sheetName || parsed.sheetName || "Sheet1");
      clearCaches();
      return res.json({ success: true, mode: "replace", count: rows.length });
    }

    const existingWorkbook = readWorkbookSmart(filePath);
    const existingRows = existingWorkbook.rows || [];
    const existingNorm = existingRows.map((row, idx) => ({ row, idx, normalized: normalizeRowKeys(row) }));
    const incomingNorm = rows.map((row) => ({ row, normalized: normalizeRowKeys(row) }));

    const pickDms = (records) => {
      const candidates = ["dms_code", "venue_code", "updated_dms_code", "center_code", "code", "row_labels"];
      for (const key of candidates) {
        if (records.some((record) => record.normalized[key] !== undefined)) return key;
      }
      return null;
    };

    const existingKey = pickDms(existingNorm);
    const incomingKey = pickDms(incomingNorm);
    let updated = 0;
    let inserted = 0;
    const merged = [...existingRows];

    if (!existingKey || !incomingKey) {
      merged.push(...rows);
      inserted = rows.length;
    } else {
      const byCode = new Map();
      existingNorm.forEach((record) => {
        const code = cleanDms(record.normalized[existingKey]);
        if (code) byCode.set(code, record.idx);
      });
      incomingNorm.forEach((record) => {
        const code = cleanDms(record.normalized[incomingKey]);
        if (code && byCode.has(code)) {
          const idx = byCode.get(code);
          merged[idx] = { ...merged[idx], ...record.row };
          updated += 1;
        } else {
          merged.push(record.row);
          inserted += 1;
        }
      });
    }

    const headers = Array.from(new Set([...existingWorkbook.headers, ...parsed.headers]));
    writeWorkbook(filePath, merged, headers, existingWorkbook.sheetName || parsed.sheetName || "Sheet1");
    clearCaches();
    return res.json({ success: true, mode: "upsert", updated, inserted, count: merged.length });
  } catch (error) {
    return res.status(400).json({ error: `Upload parse failed: ${error.message}` });
  }
});

app.get("/api/dashboard/bootstrap", (req, res) => {
  const data = loadDashboardData();
  return res.json(data);
});

app.get("/api/venue/:code", (req, res) => {
  const code = cleanDms(req.params.code);
  const dashboard = loadDashboardData();
  const venue = dashboard.rows.find((row) => cleanDms(row.dmsCode) === code);
  if (!venue) return res.status(404).json({ error: "Venue not found" });
  return res.json(venue);
});

app.get("/api/venue/:code/detail", (req, res) => {
  const code = cleanDms(req.params.code);
  if (!code) return res.status(400).json({ error: "Invalid venue code" });

  const rows = getLatestAnalysisRowsNormalized();
  const record = rows.find((row) => cleanDms(row.dms_code || row.venue_code || row.code) === code);
  if (!record) return res.status(404).json({ error: "Venue not found" });

  const photos = listVenuePhotos(code);
  const occupancyMap = getOccupancyMap();
  const occupancyPct = occupancyMap.get(`${code}_PCT`) || 0;

  let manpower = [];
  try {
    const mpPath = path.join(DATA_PATH, "0 Final_Manpower_Data.xlsx");
    if (fs.existsSync(mpPath)) {
      const mpWorkbook = readWorkbookSmart(mpPath, "Data");
      const mpRows = (mpWorkbook.rows || []).map((r) => normalizeRowKeys(r));
      console.log(`[DEBUG] Venue code: ${code}, Total manpower rows: ${mpRows.length}`);
      const filteredMp = mpRows.filter((r) => {
        const dms = cleanDms(r.dms_code || r.center_code || r.venue_code || r.updated_dms_code || r.code);
        const match = dms === code;
        if (mpRows.indexOf(r) < 5) {
          console.log(
            `[DEBUG] Row DMS: ${dms}, Match: ${match}, Raw: ${JSON.stringify(
              r.dms_code || r.center_code || r.venue_code || r.updated_dms_code || r.code,
            )}`,
          );
        }
        return match;
      });
      console.log(`[DEBUG] Filtered manpower rows: ${filteredMp.length}`);

      const grouped = new Map();
      for (const row of filteredMp) {
        const empId = cleanText(row.emp_id);
        if (!empId) continue;

        if (!grouped.has(empId)) {
          grouped.set(empId, {
            empId,
            name: cleanText(row.name),
            phone: cleanText(row.number),
            tenure: cleanText(row.tenure),
            roles: new Set(),
            projects: new Set(),
            instanceCount: 0,
            callLogCount: 0,
            callLogRemarks: new Set(),
          });
        }

        const person = grouped.get(empId);
        person.instanceCount += 1;
        if (cleanText(row.role)) person.roles.add(cleanText(row.role));
        if (cleanText(row.project_name)) person.projects.add(cleanText(row.project_name));
        person.callLogCount += toNumber(row.call_logs_issue_count);
        if (cleanText(row.call_logs)) person.callLogRemarks.add(cleanText(row.call_logs));
      }

      manpower = Array.from(grouped.values()).map((p) => ({
        ...p,
        roles: Array.from(p.roles).join(", "),
        projects: Array.from(p.projects).join(", "),
        callLogRemarks: Array.from(p.callLogRemarks).join("; "),
      }));
    }
  } catch (err) {
    console.error("Manpower detail error:", err);
  }

  // Google review & ratings data
  let googleRemarks = [];
  try {
    const googlePath = path.join(DATA_PATH, "Google review and ratings.xlsx");
    if (fs.existsSync(googlePath)) {
      const googleWorkbook = readWorkbookSmart(googlePath);
      const googleRows = (googleWorkbook.rows || []).map((r) => normalizeRowKeys(r));
      const filtered = googleRows.filter((r) => {
        const dms = cleanDms(r.dms_code || r.venue_code);
        return dms === code;
      });
      googleRemarks = filtered.map((r) => ({
        venueName: cleanText(r.venue_name || r.name || ""),
        googleRatings: cleanText(r.google_ratings || ""),
        googleReviewCount: cleanText(r.google_review_count || ""),
        googleLink: cleanText(r.google_link || r.google_url || r.link || ""),
        remarks: cleanText(r.remarks || r.remark || r.google_remarks || r.market_remark || ""),
        address: cleanText(r.address || r.google_address || ""),
        category: cleanText(r.category || ""),
        status: cleanText(r.status || ""),
      }));
    }
  } catch (err) {
    console.error("Google remarks detail error:", err);
  }

  return res.json({
    venue: record,
    photos,
    occupancyPercent: occupancyPct,
    manpower,
    googleRemarks,
  });
});

app.post("/api/process/run", (req, res) => {
  try {
    const result = runCentralAnalysis();
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/api/process/history", (req, res) => {
  const files = listProcessOutputFiles().map((fullPath) => {
    const stat = fs.statSync(fullPath);
    return {
      fileName: path.basename(fullPath),
      filePath: fullPath,
      modifiedAt: stat.mtime.toISOString(),
      sizeBytes: stat.size,
    };
  });
  return res.json({ count: files.length, files });
});

app.post("/api/manpower/query", (req, res) => {
  try {
    const result = runManpowerQuery(req.body || {});
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/manpower/person/:empId", (req, res) => {
  try {
    const targetEmpId = cleanText(req.params.empId);
    if (!targetEmpId) return res.status(400).json({ error: "Invalid employee ID" });

    const mpPath = path.join(DATA_PATH, "0 Final_Manpower_Data.xlsx");
    if (!fs.existsSync(mpPath)) return res.status(404).json({ error: "Manpower data not found" });

    const workbook = readWorkbookSmart(mpPath, "Data");
    const allRows = (workbook.rows || []).map((r) => normalizeRowKeys(r));
    const personRows = allRows.filter((r) => cleanText(r.emp_id) === targetEmpId);

    if (!personRows.length) return res.status(404).json({ error: "Employee not found" });

    const GOVT_ID_KEYS_PERSON = [
      "govt_id", "government_id", "govt_id_number", "government_id_number",
      "pan", "pan_card", "pan_no", "aadhaar", "aadhar", "aadhaar_no", "aadhar_no",
      "voter_id", "driving_license", "passport",
    ];
    const DECLARATION_KEYS_PERSON = [
      "declaration", "declaration_status", "declaration_signed", "signed_declaration",
      "declaration_accepted", "employee_declaration", "nda_signed", "consent", "consent_status",
    ];
    const hasField = (row, keys) => keys.some((k) => !isBlankLike(row?.[k]));
    const ISSUE_CAT_ORDER = ["Security", "PC Related", "Electricity", "Cleanliness", "Material", "Other"];
    const classifyIssue = (text) => {
      const v = cleanText(text).toUpperCase();
      if (!v) return null;
      if (/(SECURITY|GUARD|UNSAFE|SAFETY)/.test(v)) return "Security";
      if (/(PC|COMPUTER|SYSTEM|LAPTOP|KEYBOARD|MOUSE|BIOMETRIC|SOFTWARE|HANG|NETWORK|INTERNET)/.test(v)) return "PC Related";
      if (/(ELECTRIC|POWER|LIGHT|UPS|GENERATOR|CURRENT|VOLTAGE)/.test(v)) return "Electricity";
      if (/(CLEAN|DIRTY|WASHROOM|TOILET|HOUSEKEEP|HYGIENE)/.test(v)) return "Cleanliness";
      if (/(CHAIR|DESK|TABLE|FURNITURE|MAT|CABLE|WIRE|PRINTER|SCANNER)/.test(v)) return "Material";
      return "Other";
    };

    const latestRows = getLatestAnalysisRowsNormalized();
    const dmsCategoryMap = new Map();
    const dmsVenueNameMap = new Map();
    for (const row of latestRows) {
      const dms = cleanDms(row.dms_code || row.center_code || row.venue_code || row.code);
      if (!dms) continue;
      if (!dmsCategoryMap.has(dms)) {
        const cat = cleanText(row.category).toUpperCase();
        if (["A", "B", "C", "BL-C", "BL"].includes(cat)) dmsCategoryMap.set(dms, cat);
      }
      if (!dmsVenueNameMap.has(dms)) {
        dmsVenueNameMap.set(dms, firstNonBlank([row.updated_venue_name, row.venue_name, row.name, row.venue]) || dms);
      }
    }

    const identity = {
      empId: targetEmpId,
      name: "",
      phones: new Set(),
      emails: new Set(),
      hasGovtId: false,
      hasDeclaration: false,
    };
    const roles = new Set();
    const tenures = new Set();
    const projects = new Set();
    const drives = new Set();
    const venues = new Set();
    const dates = new Set();
    const issueCategories = {};
    let totalBatches = 0, fullBatchDelay = 0, partialBatchDelay = 0, noDelay = 0, ffa = 0, callLogs = 0;
    const deliveryKeys = new Set();
    const venueBreakdownMap = new Map();

    for (const row of personRows) {
      if (!identity.name) identity.name = cleanText(row.name) || targetEmpId;
      if (cleanText(row.number)) identity.phones.add(cleanText(row.number));
      if (cleanText(row.email)) identity.emails.add(cleanText(row.email));
      if (hasField(row, GOVT_ID_KEYS_PERSON)) identity.hasGovtId = true;
      if (hasField(row, DECLARATION_KEYS_PERSON)) identity.hasDeclaration = true;

      if (cleanText(row.role)) roles.add(cleanText(row.role));
      if (cleanText(row.tenure)) tenures.add(cleanText(row.tenure));
      if (cleanText(row.project_name)) projects.add(cleanText(row.project_name));
      if (cleanText(row.drive_name)) drives.add(cleanText(row.drive_name));
      if (cleanText(row.date)) dates.add(cleanText(row.date));

      const dmsKey = row.dms_code ? "dms_code" : "center_code";
      const dmsValue = cleanDms(row[dmsKey] || row.dms_code || row.center_code || row.venue_code);
      if (dmsValue && dmsValue !== "UNKNOWN") venues.add(dmsValue);

      const projectName = cleanText(row.project_name) || "Unknown";
      const driveName = cleanText(row.drive_name) || "Unknown";
      const deliveryKey = `${projectName}||${driveName}||${dmsValue}||${targetEmpId}`;
      if (!deliveryKeys.has(deliveryKey)) {
        deliveryKeys.add(deliveryKey);
        totalBatches += toNumber(row.total_batches);
        fullBatchDelay += toNumber(row.full_batch_delay);
        partialBatchDelay += toNumber(row.partially_batch_delay);
        noDelay += toNumber(row.no_delay);
        ffa += toNumber(row.ffa);
        callLogs += toNumber(row.call_logs_issue_count);
      }

      [cleanText(row.call_logs), cleanText(row.day_end_observation)].forEach((t) => {
        if (!t) return;
        const cat = classifyIssue(t);
        if (cat) issueCategories[cat] = (issueCategories[cat] || 0) + 1;
      });

      if (dmsValue) {
        if (!venueBreakdownMap.has(dmsValue)) {
          venueBreakdownMap.set(dmsValue, {
            dmsCode: dmsValue,
            venueName: dmsVenueNameMap.get(dmsValue) || dmsValue,
            category: dmsCategoryMap.get(dmsValue) || "-",
            region: cleanText(row.region) || "-",
            state: cleanText(row.state) || "-",
            district: cleanText(row.district) || "-",
            city: cleanText(row.city) || "-",
            roles: new Set(),
            projects: new Set(),
            drives: new Set(),
            dates: new Set(),
            deliveryKeys: new Set(),
            totalBatches: 0,
            fullBatchDelay: 0,
            partialBatchDelay: 0,
            noDelay: 0,
            ffa: 0,
            callLogs: 0,
            records: 0,
          });
        }
        const venueEntry = venueBreakdownMap.get(dmsValue);
        venueEntry.records += 1;
        if (cleanText(row.role)) venueEntry.roles.add(cleanText(row.role));
        if (cleanText(row.project_name)) venueEntry.projects.add(cleanText(row.project_name));
        if (cleanText(row.drive_name)) venueEntry.drives.add(cleanText(row.drive_name));
        if (cleanText(row.date)) venueEntry.dates.add(cleanText(row.date));
        const vDelKey = `${projectName}||${driveName}||${dmsValue}`;
        if (!venueEntry.deliveryKeys.has(vDelKey)) {
          venueEntry.deliveryKeys.add(vDelKey);
          venueEntry.totalBatches += toNumber(row.total_batches);
          venueEntry.fullBatchDelay += toNumber(row.full_batch_delay);
          venueEntry.partialBatchDelay += toNumber(row.partially_batch_delay);
          venueEntry.noDelay += toNumber(row.no_delay);
          venueEntry.ffa += toNumber(row.ffa);
          venueEntry.callLogs += toNumber(row.call_logs_issue_count);
        }
      }
    }

    const issueSummary = ISSUE_CAT_ORDER
      .filter((c) => issueCategories[c])
      .map((c) => ({ category: c, count: issueCategories[c] }));

    const venueBreakdown = Array.from(venueBreakdownMap.values())
      .map((v) => ({
        dmsCode: v.dmsCode,
        venueName: v.venueName,
        category: v.category,
        region: v.region,
        state: v.state,
        district: v.district,
        city: v.city,
        roles: Array.from(v.roles).join(", "),
        projects: Array.from(v.projects).join(", "),
        drives: Array.from(v.drives).join(", "),
        dateRange: (() => {
          const sorted = Array.from(v.dates).sort();
          if (!sorted.length) return "-";
          if (sorted.length === 1) return sorted[0];
          return `${sorted[0]} → ${sorted[sorted.length - 1]}`;
        })(),
        records: v.records,
        totalBatches: v.totalBatches,
        fullBatchDelay: v.fullBatchDelay,
        partialBatchDelay: v.partialBatchDelay,
        noDelay: v.noDelay,
        ffa: v.ffa,
        callLogs: v.callLogs,
      }))
      .sort((a, b) => b.totalBatches - a.totalBatches);

    const sortedDates = Array.from(dates).sort();

    // --- Per-project delivery breakdown ---
    const projectDeliveryMap = new Map();
    const projDeliveryKeys = new Set();
    for (const row of personRows) {
      const projName = cleanText(row.project_name) || "Unknown";
      const driveName = cleanText(row.drive_name) || "Unknown";
      const dmsValue = cleanDms(row.dms_code || row.center_code || row.venue_code);
      const pdKey = `${projName}||${driveName}||${dmsValue}`;
      if (!projectDeliveryMap.has(projName)) {
        projectDeliveryMap.set(projName, {
          project: projName,
          drives: new Set(),
          venues: new Set(),
          totalBatches: 0, fullBatchDelay: 0, partialBatchDelay: 0, noDelay: 0, ffa: 0, callLogs: 0,
        });
      }
      const pe = projectDeliveryMap.get(projName);
      if (driveName !== "Unknown") pe.drives.add(driveName);
      if (dmsValue && dmsValue !== "UNKNOWN") pe.venues.add(dmsValue);
      if (!projDeliveryKeys.has(pdKey)) {
        projDeliveryKeys.add(pdKey);
        pe.totalBatches += toNumber(row.total_batches);
        pe.fullBatchDelay += toNumber(row.full_batch_delay);
        pe.partialBatchDelay += toNumber(row.partially_batch_delay);
        pe.noDelay += toNumber(row.no_delay);
        pe.ffa += toNumber(row.ffa);
        pe.callLogs += toNumber(row.call_logs_issue_count);
      }
    }
    const projectDelivery = Array.from(projectDeliveryMap.values())
      .map((p) => ({
        project: p.project,
        drives: p.drives.size,
        venues: p.venues.size,
        totalBatches: p.totalBatches,
        fullBatchDelay: p.fullBatchDelay,
        partialBatchDelay: p.partialBatchDelay,
        noDelay: p.noDelay,
        ffa: p.ffa,
        callLogs: p.callLogs,
      }))
      .sort((a, b) => b.totalBatches - a.totalBatches);

    // --- FFA details per venue ---
    const ffaDetails = venueBreakdown
      .filter((v) => v.ffa > 0)
      .map((v) => ({ venueName: v.venueName, dmsCode: v.dmsCode, category: v.category, projects: v.projects, dateRange: v.dateRange, ffa: v.ffa }))
      .sort((a, b) => b.ffa - a.ffa);

    // --- Call log details per venue ---
    const callLogDetails = venueBreakdown
      .filter((v) => v.callLogs > 0)
      .map((v) => ({ venueName: v.venueName, dmsCode: v.dmsCode, category: v.category, projects: v.projects, dateRange: v.dateRange, callLogs: v.callLogs }))
      .sort((a, b) => b.callLogs - a.callLogs);

    // --- Drive breakdown ---
    const driveBreakdownMap = new Map();
    for (const row of personRows) {
      const driveName = cleanText(row.drive_name) || "Unknown";
      if (!driveBreakdownMap.has(driveName)) {
        driveBreakdownMap.set(driveName, { drive: driveName, projects: new Set(), venues: new Set(), records: 0 });
      }
      const de = driveBreakdownMap.get(driveName);
      de.records += 1;
      if (cleanText(row.project_name)) de.projects.add(cleanText(row.project_name));
      const dmsVal = cleanDms(row.dms_code || row.center_code || row.venue_code);
      if (dmsVal && dmsVal !== "UNKNOWN") de.venues.add(dmsVal);
    }
    const driveBreakdown = Array.from(driveBreakdownMap.values())
      .map((d) => ({ drive: d.drive, projects: d.projects.size, venues: d.venues.size, records: d.records }))
      .sort((a, b) => b.records - a.records);

    // --- Date distribution (timeline) ---
    const dateDistMap = new Map();
    for (const row of personRows) {
      const d = cleanText(row.date);
      if (!d) continue;
      dateDistMap.set(d, (dateDistMap.get(d) || 0) + 1);
    }
    const dateDistribution = Array.from(dateDistMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // --- Resource Planning Scorecard ---
    const clampScore = (v) => Math.max(0, Math.min(100, Math.round(v)));

    // Attendance: records relative to unique drives x unique venues (expected coverage)
    const expectedCoverage = Math.max(1, drives.size * venues.size);
    const attendanceRaw = (personRows.length / expectedCoverage) * 100;
    const attendanceScore = clampScore(Math.min(attendanceRaw, 100));

    // Punctuality: ratio of noDelay / totalBatches
    const punctualityScore = totalBatches > 0
      ? clampScore((noDelay / totalBatches) * 100)
      : 50; // neutral if no batches

    // Productivity: batches per venue rotation (efficiency)
    const productivityRaw = venues.size > 0 ? (totalBatches / venues.size) : 0;
    // Normalize: assume 10 batches/venue = 100%
    const productivityScore = clampScore((productivityRaw / 10) * 100);

    // Task Completion: (totalBatches - fullBatchDelay) / totalBatches
    const taskCompletionScore = totalBatches > 0
      ? clampScore(((totalBatches - fullBatchDelay) / totalBatches) * 100)
      : 50;

    // Feedback: inverse of call log + FFA issues relative to total batches
    const issueRatio = totalBatches > 0 ? ((callLogs + ffa) / totalBatches) : 0;
    const feedbackScore = clampScore((1 - Math.min(issueRatio, 1)) * 100);

    // Compliance: document completeness
    const complianceChecks = [identity.phones.size > 0, identity.emails.size > 0, identity.hasGovtId, identity.hasDeclaration];
    const compliancePassed = complianceChecks.filter(Boolean).length;
    const complianceScore = clampScore((compliancePassed / complianceChecks.length) * 100);

    // Weighted overall
    const overallRating = Math.round(
      attendanceScore * 0.10 +
      punctualityScore * 0.20 +
      productivityScore * 0.15 +
      taskCompletionScore * 0.25 +
      feedbackScore * 0.20 +
      complianceScore * 0.10
    );

    // Classification
    let classification = "";
    let classificationIcon = "";
    if (overallRating >= 80) { classification = "Star Performer"; classificationIcon = "⭐"; }
    else if (overallRating >= 60) { classification = "Reliable"; classificationIcon = "✅"; }
    else if (overallRating >= 40) { classification = "Needs Improvement"; classificationIcon = "⚠️"; }
    else { classification = "Defaulter"; classificationIcon = "🚫"; }

    // Strengths & Weaknesses
    const strengths = [];
    const weaknesses = [];
    if (punctualityScore >= 80) strengths.push("Excellent punctuality — consistently delivers batches on time");
    else if (punctualityScore < 50) weaknesses.push("Poor punctuality — frequent batch delays");
    if (taskCompletionScore >= 80) strengths.push("High task completion rate — minimal full batch delays");
    else if (taskCompletionScore < 50) weaknesses.push("Low task completion — significant full batch delays");
    if (feedbackScore >= 80) strengths.push("Clean feedback record — minimal FFA/Call Log issues");
    else if (feedbackScore < 50) weaknesses.push("Frequent issues reported — high FFA/Call Log incidents");
    if (complianceScore >= 75) strengths.push("Fully compliant — all documents submitted");
    else if (complianceScore < 50) weaknesses.push("Missing documents — compliance gaps");
    if (productivityScore >= 80) strengths.push("High productivity — handles many batches per venue");
    else if (productivityScore < 40) weaknesses.push("Low productivity — few batches per venue rotation");
    if (attendanceScore >= 80) strengths.push("Strong attendance across drives and venues");
    else if (attendanceScore < 40) weaknesses.push("Low attendance coverage relative to assigned drives");
    if (venues.size >= 5 && ffa === 0 && callLogs === 0) strengths.push("Multi-venue experience with zero issues — ideal for new venue assignments");
    if (ffa > 3) weaknesses.push(`High FFA count (${ffa}) — requires monitoring`);
    if (callLogs > 5) weaknesses.push(`Elevated call log issues (${callLogs}) — corrective action needed`);

    // Recommendations
    const recommendations = [];
    if (overallRating >= 80) {
      recommendations.push("Eligible for recognition and performance awards");
      recommendations.push("Consider for Team Lead / Mentor role in new venue deployments");
      if (venues.size >= 3) recommendations.push("Experienced rotator — ideal for critical exam center assignments");
    } else if (overallRating >= 60) {
      recommendations.push("Maintain current performance level with periodic reviews");
      if (weaknesses.length > 0) recommendations.push("Focus on: " + weaknesses[0]);
    } else if (overallRating >= 40) {
      recommendations.push("Schedule performance improvement discussion");
      recommendations.push("Pair with a mentor or Star Performer for the next assignment");
      if (complianceScore < 50) recommendations.push("Priority: Complete missing document submissions");
    } else {
      recommendations.push("Immediate corrective action required");
      recommendations.push("Review and address all weaknesses before next deployment");
      if (callLogs > 0 || ffa > 0) recommendations.push("Conduct root-cause analysis for reported issues");
      recommendations.push("Consider reassignment or additional training");
    }

    const resourcePlanning = {
      scores: {
        attendance: attendanceScore,
        punctuality: punctualityScore,
        productivity: productivityScore,
        taskCompletion: taskCompletionScore,
        feedback: feedbackScore,
        compliance: complianceScore,
      },
      overallRating,
      classification,
      classificationIcon,
      strengths,
      weaknesses,
      recommendations,
    };

    return res.json({
      identity: {
        empId: identity.empId,
        name: identity.name,
        phone: Array.from(identity.phones).join(", ") || "-",
        email: Array.from(identity.emails).join(", ") || "-",
        hasGovtId: identity.hasGovtId,
        hasDeclaration: identity.hasDeclaration,
        hasPhone: identity.phones.size > 0,
        hasEmail: identity.emails.size > 0,
      },
      summary: {
        roles: Array.from(roles).join(", ") || "-",
        tenures: Array.from(tenures).join(", ") || "-",
        uniqueProjects: projects.size,
        uniqueDrives: drives.size,
        uniqueVenues: venues.size,
        totalRecords: personRows.length,
        firstSeen: sortedDates[0] || "-",
        lastSeen: sortedDates[sortedDates.length - 1] || "-",
      },
      delivery: {
        totalBatches,
        fullBatchDelay,
        partialBatchDelay,
        noDelay,
        ffa,
        callLogs,
      },
      issueBreakdown: issueSummary,
      venueRotation: venueBreakdown,
      projectDelivery,
      driveBreakdown,
      ffaDetails,
      callLogDetails,
      dateDistribution,
      resourcePlanning,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/city-datc-dotc/bootstrap", (req, res) => {
  try {
    const latestRows = getLatestAnalysisRowsNormalized();
    const topN = Math.max(5, Math.min(50, Number(req.query.topN) || 20));
    const search = cleanText(req.query.search || "").toLowerCase();
    const selectedRegions = cleanText(req.query.regions).split(",").map(cleanText).filter(Boolean);
    const selectedStates = cleanText(req.query.states).split(",").map(cleanText).filter(Boolean);
    const selectedStatuses = cleanText(req.query.statuses).split(",").map(cleanText).filter(Boolean);
    const selectedTypes = cleanText(req.query.types).split(",").map((x) => x.toUpperCase()).filter(Boolean);

    const rows = latestRows
      .map((row) => ({
        ...row,
        dms_code: cleanDms(row.dms_code || row.venue_code || row.code),
        region: cleanText(row.region),
        state: cleanText(normalizeStateName(row.state)),
        district: cleanText(row.district),
        city: cleanText(row.city),
        status: cleanText(row.status).toUpperCase(),
        venue_type: cleanText(row.venue_type).toUpperCase(),
        category: cleanText(row.category).toUpperCase(),
        venue_max_capacity: toNumber(row.venue_max_capacity),
      }))
      .filter((row) => row.dms_code)
      .filter((row) => row.status !== "INACTIVE")
      .filter((row) => !FOREIGN_LOCATIONS.has(normalizeStateName(row.state)))
      .filter((row) => ["DATC", "DOTC"].includes(row.venue_type))
      .filter((row) => {
        if (!search) return true;
        const haystack = Object.values(row).join(" ").toLowerCase();
        return haystack.includes(search);
      })
      .filter((row) => (selectedRegions.length ? selectedRegions.includes(row.region) : true))
      .filter((row) => (selectedStates.length ? selectedStates.includes(row.state) : true))
      .filter((row) => (selectedStatuses.length ? selectedStatuses.includes(row.status) : true))
      .filter((row) => (selectedTypes.length ? selectedTypes.includes(row.venue_type) : true));

    const kpis = {
      totalVenues: rows.length,
      totalDATC: rows.filter((row) => row.venue_type === "DATC").length,
      totalDOTC: rows.filter((row) => row.venue_type === "DOTC").length,
    };

    const pivots = {
      city: buildCityPivot(rows, "city"),
      district: buildCityPivot(rows, "district"),
      state: buildCityPivot(rows, "state"),
      region: buildCityPivot(rows, "region"),
    };

    const charts = {
      city: buildCityChart(rows, "city", topN),
      district: buildCityChart(rows, "district", topN),
      state: buildCityChart(rows, "state", topN),
      region: buildCityChart(rows, "region", topN),
    };

    const filters = {
      regions: Array.from(new Set(rows.map((row) => row.region).filter(Boolean))).sort(),
      states: Array.from(new Set(rows.map((row) => row.state).filter(Boolean))).sort(),
      statuses: Array.from(new Set(rows.map((row) => row.status).filter(Boolean))).sort(),
      types: ["DATC", "DOTC"],
    };

    return res.json({
      fileName: pickLatestAnalysisFile().fileName,
      kpis,
      pivots,
      charts,
      filters,
      topN,
      rowCount: rows.length,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/health", (req, res) => {
  return res.json({ status: "ok", time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`VMS API server running at http://localhost:${PORT}`);
});
