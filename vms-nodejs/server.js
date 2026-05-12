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

const ROOT_PATH = path.join(__dirname, "..");
const DATA_PATH = path.join(ROOT_PATH, "Data");
const OUTPUT_PATH = path.join(DATA_PATH, "Output");
const PHOTOS_PATH = path.join(DATA_PATH, "Venue_Photos");
const SESSION_LOG_PATH = path.join(DATA_PATH, "user_session_logs.json");
const MARKET_RESEARCH_PATH = path.join(DATA_PATH, "market_research.json");
const MAX_SESSION_LOGS = 5000;
const DEFAULT_RESEARCH_MAX_RESULTS = 10;

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
  Prafull: {
    password: "Prafull@123",
    role: "OperationsHead",
    permissions: ["view_performance_rankings", "performance_rankings_view"],
  },
  Nishant: {
    password: "Nishant@123",
    role: "User",
    permissions: [],
  },
  Mayuresh: {
    password: "Mayuresh@123",
    role: "User",
    permissions: [],
  },
  Anil: {
    password: "Anil@123",
    role: "User",
    permissions: [],
  },
  Admin: {
    password: "Admin@123",
    role: "Admin",
    permissions: ["view_performance_rankings", "performance_rankings_view"],
  },
};
const PERFORMANCE_RANKING_ALLOWED_USERS = new Set(["Admin", "Prafull"]);
const PERFORMANCE_RANKING_ALLOWED_ROLES = new Set(["Admin", "SuperAdmin", "OperationsHead"]);
const PERFORMANCE_RANKING_ALLOWED_PERMISSIONS = new Set(["view_performance_rankings", "performance_rankings_view"]);

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
let occupancyDataCache = null;

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function getUserRecord(username) {
  const normalizedUsername = cleanText(username);
  const record = USERS[normalizedUsername];
  return record && typeof record === "object" ? record : null;
}

function isKnownUser(username) {
  return Boolean(getUserRecord(username));
}

function isValidPassword(username, password) {
  const record = getUserRecord(username);
  return Boolean(record && record.password === cleanText(password));
}

function canViewPerformanceRankingsByUser(username) {
  const normalizedUsername = cleanText(username);
  const record = getUserRecord(normalizedUsername);
  if (!record) return false;

  if (PERFORMANCE_RANKING_ALLOWED_USERS.has(normalizedUsername)) return true;
  if (PERFORMANCE_RANKING_ALLOWED_ROLES.has(cleanText(record.role))) return true;

  const permissionList = Array.isArray(record.permissions) ? record.permissions : [];
  return permissionList.some((permission) => PERFORMANCE_RANKING_ALLOWED_PERMISSIONS.has(cleanText(permission)));
}

function normalizeRankingScope(scope) {
  const normalized = cleanText(scope).toLowerCase();
  if (normalized === "top25" || normalized === "top_25" || normalized === "top-25") {
    return { key: "top25", limit: 25 };
  }
  if (normalized === "full" || normalized === "all") {
    return { key: "full", limit: Number.POSITIVE_INFINITY };
  }
  return { key: "top10", limit: 10 };
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

function toPercentNumber(value) {
  const number = Number(String(value ?? "").replace(/,/g, "").replace(/%/g, ""));
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

function ensureSessionLogFile() {
  if (!fs.existsSync(path.dirname(SESSION_LOG_PATH))) {
    fs.mkdirSync(path.dirname(SESSION_LOG_PATH), { recursive: true });
  }
  if (!fs.existsSync(SESSION_LOG_PATH)) {
    fs.writeFileSync(SESSION_LOG_PATH, JSON.stringify({ sessions: [] }, null, 2), "utf8");
  }
}

function readSessionLogs() {
  ensureSessionLogFile();
  try {
    const raw = fs.readFileSync(SESSION_LOG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.sessions)) return { sessions: [] };
    return { sessions: parsed.sessions };
  } catch {
    return { sessions: [] };
  }
}

function writeSessionLogs(store) {
  const safeSessions = Array.isArray(store?.sessions) ? store.sessions : [];
  const trimmed =
    safeSessions.length > MAX_SESSION_LOGS
      ? safeSessions.slice(safeSessions.length - MAX_SESSION_LOGS)
      : safeSessions;
  ensureSessionLogFile();
  fs.writeFileSync(SESSION_LOG_PATH, JSON.stringify({ sessions: trimmed }, null, 2), "utf8");
}

function getClientIp(req) {
  const forwarded = cleanText(req.headers["x-forwarded-for"] || "");
  if (forwarded) return forwarded.split(",")[0].trim();
  return cleanText(req.socket?.remoteAddress || "");
}

function createSessionId(username) {
  const safeUser = cleanText(username).replace(/[^a-z0-9_-]/gi, "").toLowerCase() || "user";
  return `${safeUser}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function toMs(value) {
  const date = new Date(value);
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function buildSessionSummary(username, sessions, currentSessionId = "") {
  const userKey = cleanText(username);
  const userSessions = (Array.isArray(sessions) ? sessions : [])
    .filter((entry) => cleanText(entry?.user) === userKey)
    .sort((a, b) => toMs(b?.loginAt) - toMs(a?.loginAt));

  const withLogout = userSessions.filter((entry) => cleanText(entry?.logoutAt));
  const latestLogin = userSessions[0] || null;
  const latestLogout = withLogout.sort((a, b) => toMs(b?.logoutAt) - toMs(a?.logoutAt))[0] || null;
  const previousCompletedSession =
    withLogout.find((entry) => cleanText(entry?.sessionId) !== cleanText(currentSessionId)) || null;

  return {
    user: userKey,
    totalSessions: userSessions.length,
    activeSessions: userSessions.filter((entry) => !cleanText(entry?.logoutAt)).length,
    currentSessionId: cleanText(currentSessionId) || cleanText(latestLogin?.sessionId),
    lastLoginAt: cleanText(latestLogin?.loginAt) || null,
    lastLogoutAt: cleanText(latestLogout?.logoutAt) || null,
    previousCompletedSession: previousCompletedSession
      ? {
          sessionId: cleanText(previousCompletedSession.sessionId),
          loginAt: cleanText(previousCompletedSession.loginAt) || null,
          logoutAt: cleanText(previousCompletedSession.logoutAt) || null,
        }
      : null,
    recentSessions: userSessions.slice(0, 8).map((entry) => ({
      sessionId: cleanText(entry?.sessionId),
      loginAt: cleanText(entry?.loginAt) || null,
      logoutAt: cleanText(entry?.logoutAt) || null,
      isActive: !cleanText(entry?.logoutAt),
    })),
  };
}

function normalizeResearchKey(value) {
  return cleanText(value)
    .toUpperCase()
    .replace(/FORMERLY KNOWN AS NSEIT LIMITED/g, "")
    .replace(/NSEIT LIMITED/g, "DEXIT GLOBAL LIMITED")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ensureMarketResearchStore() {
  if (!fs.existsSync(path.dirname(MARKET_RESEARCH_PATH))) {
    fs.mkdirSync(path.dirname(MARKET_RESEARCH_PATH), { recursive: true });
  }
  if (!fs.existsSync(MARKET_RESEARCH_PATH)) {
    fs.writeFileSync(MARKET_RESEARCH_PATH, JSON.stringify({ venues: [] }, null, 2), "utf8");
  }
}

function readMarketResearchStore() {
  ensureMarketResearchStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(MARKET_RESEARCH_PATH, "utf8"));
    return {
      venues: Array.isArray(parsed?.venues) ? parsed.venues : [],
    };
  } catch (error) {
    console.error("Market research read error:", error.message);
    return { venues: [] };
  }
}

function writeMarketResearchStore(store) {
  const safeStore = {
    venues: Array.isArray(store?.venues) ? store.venues : [],
  };
  ensureMarketResearchStore();
  fs.writeFileSync(MARKET_RESEARCH_PATH, JSON.stringify(safeStore, null, 2), "utf8");
}

function readMarketResearchRecords() {
  return readMarketResearchStore().venues;
}

function htmlDecode(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function stripTags(value) {
  return cleanText(String(value ?? "").replace(/<[^>]*>/g, " "));
}

function getHostNameSafe(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function normalizeSourceUrl(rawUrl) {
  const raw = cleanText(rawUrl);
  if (!raw) return "";

  let resolved = raw;
  if (resolved.startsWith("//")) resolved = `https:${resolved}`;
  if (resolved.startsWith("/")) resolved = `https://duckduckgo.com${resolved}`;

  try {
    const parsed = new URL(resolved);
    if (parsed.hostname.includes("duckduckgo.com")) {
      const redirect = parsed.searchParams.get("uddg");
      if (redirect) {
        const decoded = decodeURIComponent(redirect);
        return cleanText(decoded);
      }
    }
    return parsed.toString();
  } catch {
    return "";
  }
}

function splitResultBlocks(html) {
  const source = String(html || "");
  const startRegex = /<div[^>]*class="[^"]*\bresult\b[^"]*"[^>]*>/gi;
  const starts = Array.from(source.matchAll(startRegex)).map((match) => match.index || 0);
  if (!starts.length) return [];

  const blocks = [];
  for (let i = 0; i < starts.length; i += 1) {
    const from = starts[i];
    const to = i < starts.length - 1 ? starts[i + 1] : source.length;
    blocks.push(source.slice(from, to));
  }
  return blocks;
}

function parseDuckDuckGoResults(html, maxResults = DEFAULT_RESEARCH_MAX_RESULTS) {
  const blocks = splitResultBlocks(html);
  const parsed = [];
  for (const block of blocks) {
    const titleMatch = block.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;

    const rawUrl = titleMatch[1];
    const title = stripTags(htmlDecode(titleMatch[2]));
    const url = normalizeSourceUrl(rawUrl);
    if (!url) continue;

    const snippetMatch = block.match(/<(?:a|div)[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/i);
    const snippet = snippetMatch ? stripTags(htmlDecode(snippetMatch[1])) : "";
    const domain = getHostNameSafe(url);

    if (!title && !snippet) continue;
    parsed.push({ title: title || domain || "Source", url, snippet, domain });
    if (parsed.length >= maxResults) break;
  }

  const seen = new Set();
  return parsed.filter((item) => {
    const key = `${item.domain}|${item.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchTextWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function buildResearchQueries(record, code) {
  const venueName = cleanText(record?.venue_name || record?.name || "");
  const venueNameNoParen = venueName.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const venueNameNoLegacy = venueName
    .replace(/\bFORMERLY\b.*$/i, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const city = cleanText(record?.city || "");
  const state = cleanText(record?.state || "");
  const address = cleanText(record?.complete_address || record?.address || "");
  const landmark = cleanText(record?.landmark || "");
  const pincode = cleanText(record?.pincode || "");
  const dms = cleanDms(code || record?.dms_code || record?.venue_code || record?.code);
  const location = [city, state, pincode].filter(Boolean).join(" ");

  const queries = [
    [`"${venueNameNoParen || venueName}"`, city, state, pincode, "test center"].filter(Boolean).join(" "),
    [venueNameNoLegacy || venueNameNoParen || venueName, city, state, "exam centre"].filter(Boolean).join(" "),
    [venueName, landmark, city, state].filter(Boolean).join(" "),
    [venueNameNoParen || venueName, address, location].filter(Boolean).join(" "),
    [dms, venueNameNoParen || venueName, city].filter(Boolean).join(" "),
    [venueNameNoParen || venueName, "official website", city].filter(Boolean).join(" "),
  ]
    .map((q) => cleanText(q))
    .filter(Boolean);
  return Array.from(new Set(queries)).slice(0, 6);
}

function tokenizeResearchText(value) {
  return normalizeResearchKey(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function buildVenueSignals(record, code) {
  const genericTokens = new Set([
    "DEXIT",
    "GLOBAL",
    "LIMITED",
    "FORMERLY",
    "KNOWN",
    "AS",
    "NSEIT",
    "PRIVATE",
    "PVT",
    "LTD",
    "TEST",
    "CENTER",
    "CENTRE",
    "VENUE",
    "INDIA",
    "LIMITED",
    "GLOBAL",
    "PVT",
    "PRIVATE",
    "BUILDING",
    "FLOOR",
    "ROAD",
    "STREET",
    "NAGAR",
    "NEAR",
    "ADJACENT",
  ]);

  const dms = cleanDms(code || record?.dms_code || record?.venue_code || record?.code);
  const fullName = normalizeResearchKey(record?.venue_name || record?.name || "");
  const fullNameCompact = fullName.replace(/\s+/g, "");
  const nameTokens = tokenizeResearchText(record?.venue_name || record?.name || "")
    .filter((token) => token.length >= 4 && !genericTokens.has(token));
  const locationTokens = [
    ...tokenizeResearchText(record?.city || ""),
    ...tokenizeResearchText(record?.district || ""),
    ...tokenizeResearchText(record?.state || ""),
    ...tokenizeResearchText(record?.pincode || ""),
  ].filter((token) => token.length >= 4 || /^\d{6}$/.test(token));
  const addressTokens = tokenizeResearchText(record?.complete_address || record?.address || "")
    .filter((token) => (token.length >= 5 || /^\d{6}$/.test(token)) && !genericTokens.has(token));

  return {
    dms,
    fullName,
    fullNameCompact,
    nameTokens: Array.from(new Set(nameTokens)),
    locationTokens: Array.from(new Set(locationTokens)),
    addressTokens: Array.from(new Set(addressTokens)),
  };
}

function analyzeSourceRelevance(entry, signals) {
  const haystack = normalizeResearchKey(`${entry?.title || ""} ${entry?.snippet || ""} ${entry?.url || ""}`);
  const haystackCompact = haystack.replace(/\s+/g, "");
  if (!haystack) {
    return { score: 0, hasCodeMatch: false, hasFullNameMatch: false, matchedName: 0, matchedLocation: 0, matchedAddress: 0 };
  }

  const hasCodeMatch = !!(signals?.dms && haystack.includes(normalizeResearchKey(signals.dms)));
  const hasFullNameMatch = !!(
    signals?.fullName &&
    (haystack.includes(signals.fullName) || (signals?.fullNameCompact && haystackCompact.includes(signals.fullNameCompact)))
  );
  let score = hasCodeMatch ? 14 : 0;
  if (hasFullNameMatch) score += 12;

  const matchedName = (signals?.nameTokens || []).filter((token) => haystack.includes(token)).length;
  const matchedLocation = (signals?.locationTokens || []).filter((token) => haystack.includes(token)).length;
  const matchedAddress = (signals?.addressTokens || []).filter((token) => haystack.includes(token)).length;

  score += matchedName * 4;
  score += matchedLocation * 2;
  score += matchedAddress * 3;

  if (matchedName > 0 && (matchedLocation > 0 || matchedAddress > 0)) score += 5;
  if (matchedAddress >= 2) score += 4;

  return { score, hasCodeMatch, hasFullNameMatch, matchedName, matchedLocation, matchedAddress };
}

function selectRelevantSourcesForVenue(sources, record, code) {
  const list = Array.isArray(sources) ? sources : [];
  const signals = buildVenueSignals(record, code);
  const ranked = list
    .map((source) => {
      const normalized = {
        label: cleanText(source?.label || "Source"),
        url: cleanText(source?.url || ""),
        note: cleanText(source?.note || ""),
      };
      const relevance = analyzeSourceRelevance(
        {
          title: normalized.label,
          snippet: normalized.note,
          url: normalized.url,
        },
        signals,
      );
      return {
        ...normalized,
        ...relevance,
      };
    })
    .filter((source) => (source.label || source.url))
    .sort((a, b) => b.score - a.score);

  const strict = ranked
    .filter((source) => {
      const highSignal =
        source.hasCodeMatch ||
        source.hasFullNameMatch ||
        (source.matchedName > 0 && (source.matchedLocation > 0 || source.matchedAddress > 0)) ||
        source.matchedAddress >= 2;
      return highSignal && source.score >= 6;
    })
    .slice(0, DEFAULT_RESEARCH_MAX_RESULTS)
    .map(({ label, url, note }) => ({ label, url, note }));

  if (strict.length) return strict;

  // Fallback: keep top relevant links even when strict confidence is low,
  // so UI can still show meaningful evidence instead of an empty generic note.
  return ranked
    .filter((source) => source.score >= 2 || source.matchedLocation > 0 || source.matchedAddress > 0 || source.hasFullNameMatch)
    .slice(0, Math.min(5, DEFAULT_RESEARCH_MAX_RESULTS))
    .map(({ label, url, note }) => ({ label, url, note }));
}

function buildSimpleMarketSummary(record, searchResults) {
  const venueName = cleanText(record?.venue_name || record?.name || "Venue");
  const city = cleanText(record?.city || "");
  const state = cleanText(record?.state || "");
  const location = [city, state].filter(Boolean).join(", ");
  const domains = Array.from(new Set((searchResults || []).map((r) => r.domain).filter(Boolean)));

  if (!searchResults.length) {
    const fallbackAddress = cleanText(record?.complete_address || record?.address || "");
    const fallbackLandmark = cleanText(record?.landmark || "");
    return {
      status: "Research pending",
      confidence: "Low",
      marketPosition: location ? `Local venue in ${location}` : "Local venue",
      summary: [
        `Public web references for ${venueName} are limited right now.`,
        location ? `Internal profile location: ${location}.` : "",
        fallbackLandmark ? `Landmark: ${fallbackLandmark}.` : "",
        fallbackAddress ? `Address on file: ${fallbackAddress}.` : "",
        "Use Search Web Again to refresh internet references before final decision support.",
      ]
        .filter(Boolean)
        .join(" "),
      opportunities: [
        "Add one official company/source page and one map/listing source for stronger external validation.",
        "Cross-check address and access landmarks with latest public references.",
      ],
      risks: [
        "External references are currently limited, so confidence remains low.",
      ],
    };
  }

  const snippetBucket = searchResults
    .map((item) => cleanText(item.snippet))
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");

  const hasExamSignal = /(exam|test|center|centre|assessment|digital)/i.test(snippetBucket);
  const hasLocationSignal = /(road|city|district|state|near|landmark|address)/i.test(snippetBucket);
  const hasOfficialSignal = domains.some((domain) => /(gov|edu|org|dexitglobal|nseit)/i.test(domain));

  let confidence = "Low";
  if (searchResults.length >= 5 && hasOfficialSignal) confidence = "High";
  else if (searchResults.length >= 3) confidence = "Medium";

  const opportunities = [];
  if (hasExamSignal) opportunities.push("Public web references indicate venue/exam-center relevance, helping faster pre-verification.");
  if (hasLocationSignal) opportunities.push("Location-related public references are available for quick address and access cross-check.");
  if (hasOfficialSignal) opportunities.push("At least one authoritative/public domain is available to support source-backed review.");
  if (!opportunities.length) opportunities.push("Public references are available and can be used as preliminary validation inputs.");

  const risks = [];
  if (!hasOfficialSignal) risks.push("Most links are generic listings; add one official/public authority source before final decisions.");
  if (searchResults.length < 3) risks.push("Limited number of sources found; confidence should be treated as low-to-medium.");
  risks.push("Always validate infra readiness (CCTV/UPS/PWD/seat capacity) on-ground before scheduling.");

  const topDomains = domains.slice(0, 4).join(", ");
  const summary = [
    `An internet scan for ${venueName}${location ? ` (${location})` : ""} found ${searchResults.length} relevant public references.`,
    topDomains ? `Top source domains: ${topDomains}.` : "",
    "Use this as a preliminary view; complete operational validation is required before final decisions.",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    status: "Researched",
    confidence,
    marketPosition: location ? `Local venue in ${location}` : "Local venue",
    summary,
    opportunities,
    risks,
  };
}

async function generateMarketResearchForVenue(record, code) {
  const queries = buildResearchQueries(record, code);
  let collected = [];

  for (const query of queries) {
    try {
      const params = new URLSearchParams({ q: query, kl: "in-en" });
      const html = await fetchTextWithTimeout(
        `https://html.duckduckgo.com/html/?${params.toString()}`,
        {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Accept: "text/html,application/xhtml+xml",
            Referer: "https://html.duckduckgo.com/",
          },
        },
      );
      const results = parseDuckDuckGoResults(html, DEFAULT_RESEARCH_MAX_RESULTS);
      collected = collected.concat(results);
      if (collected.length >= DEFAULT_RESEARCH_MAX_RESULTS) break;
    } catch (error) {
      // Continue with next query; we still return a fallback summary if no source resolves.
    }
  }
  const signals = buildVenueSignals(record, code);

  const seenUrls = new Set();
  const sources = collected
    .map((entry) => {
      const relevance = analyzeSourceRelevance(entry, signals);
      return { ...entry, ...relevance };
    })
    .filter((entry) => {
      // Relaxed criteria to ensure we capture relevant public references for the AI overview
      return entry.score >= 3 || entry.hasFullNameMatch || entry.matchedName > 0 || entry.matchedLocation > 0;
    })
    .sort((a, b) => b.score - a.score)
    .filter((entry) => {
      if (!entry.url || seenUrls.has(entry.url)) return false;
      seenUrls.add(entry.url);
      return true;
    })
    .slice(0, DEFAULT_RESEARCH_MAX_RESULTS);

  const summaryBits = buildSimpleMarketSummary(record, sources);
  const venueName = cleanText(record?.venue_name || record?.name || "Venue");
  const searchedAt = new Date().toISOString().slice(0, 10);

  return {
    venueName,
    aliases: [cleanText(record?.venue_name), cleanText(record?.name)].filter(Boolean),
    dmsCodes: [cleanDms(code || record?.dms_code || record?.venue_code || record?.code)].filter(Boolean),
    addressContains: [
      cleanText(record?.city),
      cleanText(record?.district),
      cleanText(record?.state),
      cleanText(record?.pincode),
    ].filter(Boolean),
    status: summaryBits.status,
    confidence: summaryBits.confidence,
    marketPosition: summaryBits.marketPosition,
    summary: summaryBits.summary,
    opportunities: summaryBits.opportunities,
    risks: summaryBits.risks,
    sources: sources.map((item) => ({
      label: item.title || item.domain || "Source",
      url: item.url,
      note: cleanText(item.snippet || "").slice(0, 220),
    })),
    searchQuery: queries[0] || venueName,
    lastResearchedAt: searchedAt,
  };
}

function upsertMarketResearchRecord(record) {
  const store = readMarketResearchStore();
  const incomingCodes = Array.isArray(record?.dmsCodes) ? record.dmsCodes.map(cleanDms).filter(Boolean) : [];
  const incomingName = normalizeResearchKey(record?.venueName);

  const index = store.venues.findIndex((entry) => {
    const entryCodes = Array.isArray(entry?.dmsCodes) ? entry.dmsCodes.map(cleanDms).filter(Boolean) : [];
    if (incomingCodes.length && entryCodes.some((code) => incomingCodes.includes(code))) return true;

    const entryName = normalizeResearchKey(entry?.venueName);
    if (incomingName && entryName && (incomingName.includes(entryName) || entryName.includes(incomingName))) {
      return true;
    }
    return false;
  });

  if (index >= 0) {
    store.venues[index] = { ...store.venues[index], ...record };
  } else {
    store.venues.push(record);
  }

  writeMarketResearchStore(store);
}

function buildMarketResearchFallback(record) {
  const venueName = cleanText(record?.venue_name || record?.name || record?.venue || "Venue");
  const city = cleanText(record?.city || "");
  const district = cleanText(record?.district || "");
  const state = cleanText(record?.state || "");
  const pincode = cleanText(record?.pincode || "");
  const address = cleanText(record?.complete_address || record?.address || "");
  const landmark = cleanText(record?.landmark || "");
  const venueStatus = cleanText(record?.status || "Unknown");
  const venueType = cleanText(record?.venue_type || record?.type || "");
  const companyName = cleanText(record?.company_name || "DEXIT Global Limited");
  const locationText = [city, state].filter(Boolean).join(", ");
  const locationLine = [city || district, district && district !== city ? district : "", state, pincode].filter(Boolean).join(", ");
  const addressLine = address || landmark || "Address is available in internal profile.";
  const summaryParts = [
    `${venueName} is available in the internal venue profile${locationText ? ` for ${locationText}` : ""}.`,
    venueType ? `Venue type: ${venueType}.` : "",
    venueStatus ? `Current operating status on record: ${venueStatus}.` : "",
    locationLine ? `Location details: ${locationLine}.` : "",
    landmark ? `Landmark: ${landmark}.` : "",
    `Address on file: ${addressLine}`,
    `Public market references are still being verified; use Search Web Again for latest web-backed evidence.`,
  ].filter(Boolean);
  return {
    venueName,
    status: "Research pending",
    confidence: "Low",
    marketPosition: locationText ? `Local venue in ${locationText}` : "Local venue",
    summary: summaryParts.join(" "),
    opportunities: [
      `Validate venue listing using one official ${companyName} source and one public map/listing source.`,
      "Confirm candidate entry route, nearest transport/landmark access, and current center activity before scheduling.",
      "Cross-check contact details from internal profile with latest public references.",
    ],
    risks: [
      "External source confidence is currently low because verified public references are limited.",
      "Final market decisions should not rely only on internal profile without one external validation source.",
    ],
    sources: [],
    searchQuery: [venueName, address, landmark, city, district, state, pincode].filter(Boolean).join(" "),
    lastResearchedAt: "",
  };
}

function isGenericResearchSummary(value) {
  const summary = cleanText(value).toLowerCase();
  if (!summary) return true;
  return (
    summary.includes("not been curated for this venue yet") ||
    summary.includes("could not be verified automatically") ||
    summary.includes("highly confident public references") ||
    summary.includes("no reliable public source was found")
  );
}

function buildMarketResearchResponse(entry, record, code) {
  if (!entry || typeof entry !== "object") return buildMarketResearchFallback(record);

  const relevantSources = selectRelevantSourcesForVenue(entry.sources, record, code);
  const summary = cleanText(entry.summary || "");
  const opportunities = Array.isArray(entry.opportunities) ? entry.opportunities.map(cleanText).filter(Boolean) : [];
  const risks = Array.isArray(entry.risks) ? entry.risks.map(cleanText).filter(Boolean) : [];
  const staleGeneric = isGenericResearchSummary(summary) && relevantSources.length === 0;

  if (staleGeneric) return buildMarketResearchFallback(record);

  return {
    venueName: cleanText(entry.venueName || record?.venue_name || record?.name),
    status: cleanText(entry.status || "Researched"),
    confidence: cleanText(entry.confidence || "Medium"),
    marketPosition: cleanText(entry.marketPosition || ""),
    summary: summary || buildMarketResearchFallback(record).summary,
    opportunities,
    risks,
    sources: relevantSources,
    searchQuery: cleanText(entry.searchQuery || ""),
    lastResearchedAt: cleanText(entry.lastResearchedAt || ""),
  };
}

function findMarketResearchForVenue(record, code) {
  const records = readMarketResearchRecords();
  const dmsCandidates = [code, record?.dms_code, record?.venue_code, record?.code].map(cleanDms).filter(Boolean);
  let strictByCode = null;

  if (dmsCandidates.length) {
    strictByCode = records.find((entry) => {
      const entryCodes = Array.isArray(entry?.dmsCodes) ? entry.dmsCodes.map(cleanDms).filter(Boolean) : [];
      return entryCodes.length && dmsCandidates.some((candidate) => entryCodes.includes(candidate));
    });
  }

  const textCandidates = [
    record?.venue_name,
    record?.name,
    record?.complete_address,
    record?.address,
    record?.city,
    record?.state,
  ]
    .map(normalizeResearchKey)
    .filter(Boolean);

  const matched = records.find((entry) => {
    const entryTexts = [entry?.venueName, ...(Array.isArray(entry?.aliases) ? entry.aliases : [])]
      .map(normalizeResearchKey)
      .filter(Boolean);
    if (entryTexts.some((entryText) => textCandidates.some((candidate) => candidate.includes(entryText) || entryText.includes(candidate)))) {
      return true;
    }

    const addressContains = Array.isArray(entry?.addressContains)
      ? entry.addressContains.map(normalizeResearchKey).filter(Boolean)
      : [];
    return addressContains.length && addressContains.every((needle) => textCandidates.some((candidate) => candidate.includes(needle)));
  });

  const resolved = strictByCode || matched;
  if (!resolved) return buildMarketResearchFallback(record);
  return buildMarketResearchResponse(resolved, record, code);
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

function getOccupancyDataFilePath() {
  const candidates = [
    "DOTC Occupancy.xlsx",
    "Occupancy Report FY25-26 March.xlsx",
  ];
  return candidates.map((fileName) => path.join(DATA_PATH, fileName)).find((filePath) => fs.existsSync(filePath)) || null;
}

function buildOccupancyDataset() {
  const filePath = getOccupancyDataFilePath();
  if (!filePath) {
    return {
      filePath: null,
      fileName: "",
      rows: [],
      summary: {
        totalRows: 0,
        totalCenters: 0,
        totalSeatCapacity: 0,
        totalSeatOccupancy: 0,
        averageOccupancyPercent: 0,
      },
      months: [],
      headers: [],
    };
  }

  const rawRows = readWorkbookSmart(filePath).rows;
  const rows = rawRows
    .map((row) => {
      const normalized = normalizeRowKeys(row);
      const rawSeatCapacity = row["Seat Capacity"];
      const rawSeatOccupancy = row["Seat Occupancy"];
      const rawOccupancyPercent = row["Seat Occupancy %"];
      const dmsCode = cleanDms(normalized.dms_code || normalized.center_code || normalized.venue_code);
      const seatCapacity = toNumber(rawSeatCapacity || normalized.seat_capacity || normalized.capacity);
      const seatOccupancy = toNumber(rawSeatOccupancy || normalized.occupancy);
      const occupancyPercent = toPercentNumber(
        rawOccupancyPercent ||
          normalized.seat_occupancy_ ||
          normalized.seat_occupancy_percent ||
          normalized.occupancy_percent ||
          normalized.seat_occupancy ||
          normalized.occupancy_pct,
      );

      return {
        month: cleanText(normalized.month || normalized.monthly),
        dmsCode,
        examCenter: cleanText(normalized.exam_center || normalized.center_name || normalized.venue_name),
        seatCapacity,
        seatOccupancy,
        occupancyPercent,
        utilizationGap: Math.max(seatCapacity - seatOccupancy, 0),
      };
    })
    .filter((row) => row.month || row.dmsCode || row.examCenter);

  const totalSeatCapacity = rows.reduce((sum, row) => sum + row.seatCapacity, 0);
  const totalSeatOccupancy = rows.reduce((sum, row) => sum + row.seatOccupancy, 0);
  const averageOccupancyPercent = totalSeatCapacity
    ? Math.round((totalSeatOccupancy / totalSeatCapacity) * 1000) / 10
    : 0;

  return {
    filePath,
    fileName: path.basename(filePath),
    rows,
    summary: {
      totalRows: rows.length,
      totalCenters: new Set(rows.map((row) => row.dmsCode).filter(Boolean)).size,
      totalSeatCapacity,
      totalSeatOccupancy,
      averageOccupancyPercent,
    },
    months: Array.from(new Set(rows.map((row) => row.month).filter(Boolean))),
    headers: ["month", "dmsCode", "examCenter", "seatCapacity", "seatOccupancy", "occupancyPercent", "utilizationGap"],
  };
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
  const focusEmpId = cleanText(filters.focusEmpId || "").toLowerCase();
  const personName = cleanText(filters.personName || "").toLowerCase();
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
    if (focusEmpId || personName) {
      let match = false;
      const rowEmpId = cleanText(row.emp_id).toLowerCase();
      const rowName = cleanText(row.name).toLowerCase();
      
      if (focusEmpId && rowEmpId === focusEmpId) {
        match = true;
      } else if (personName && rowName.includes(personName)) {
        match = true;
      } else if (focusEmpId && rowName.includes(focusEmpId)) {
        match = true;
      }
      
      if (!match) return false;
    } else if (search) {
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

function buildPerformanceRankings(queryResult, scope = "top10") {
  const { key: scopeKey, limit } = normalizeRankingScope(scope);

  const manpowerSourceRows = Array.isArray(queryResult?.manpowerWiseEmployeeRotationDrilldown)
    ? queryResult.manpowerWiseEmployeeRotationDrilldown
    : [];
  const venueSourceRows = Array.isArray(queryResult?.dmsSummary) ? queryResult.dmsSummary : [];
  const venueLookupRows = Array.isArray(queryResult?.manpowerWiseVenueDrilldown)
    ? queryResult.manpowerWiseVenueDrilldown
    : [];
  const projectSourceRows = Array.isArray(queryResult?.projectSummary) ? queryResult.projectSummary : [];

  const manpowerMap = new Map();
  manpowerSourceRows.forEach((row) => {
    const empId = cleanText(row.empId);
    const personName = cleanText(row.personName) || "Unknown";
    const mapKey = `${empId || "NA"}||${personName}`;
    if (!manpowerMap.has(mapKey)) {
      manpowerMap.set(mapKey, {
        empId,
        personName,
        venues: new Set(),
        states: new Set(),
        totalBatches: 0,
        fullBatchDelay: 0,
        partialBatchDelay: 0,
        noDelay: 0,
        ffa: 0,
        callLogs: 0,
      });
    }
    const entry = manpowerMap.get(mapKey);
    if (cleanText(row.venueName)) entry.venues.add(cleanText(row.venueName));
    if (cleanText(row.state)) entry.states.add(cleanText(row.state));
    entry.totalBatches += toNumber(row.totalBatches);
    entry.fullBatchDelay += toNumber(row.fullBatchDelay);
    entry.partialBatchDelay += toNumber(row.partialBatchDelay);
    entry.noDelay += toNumber(row.noDelay);
    entry.ffa += toNumber(row.ffa);
    entry.callLogs += toNumber(row.callLogs);
  });

  const manpowerRows = Array.from(manpowerMap.values())
    .map((entry) => {
      const scoreRaw =
        entry.noDelay * 3 +
        entry.totalBatches * 0.5 +
        entry.venues.size * 1.5 +
        entry.states.size * 0.75 -
        entry.fullBatchDelay * 4 -
        entry.partialBatchDelay * 2 -
        entry.ffa * 2 -
        entry.callLogs * 3;
      return {
        empId: entry.empId,
        personName: entry.personName,
        venueCoverage: entry.venues.size,
        totalBatches: entry.totalBatches,
        noDelay: entry.noDelay,
        callLogs: entry.callLogs,
        score: Number(scoreRaw.toFixed(2)),
      };
    })
    .sort((a, b) => b.score - a.score);

  const venueNameByDms = new Map();
  venueLookupRows.forEach((row) => {
    const dmsCode = cleanDms(row.dmsCode);
    if (!dmsCode || venueNameByDms.has(dmsCode)) return;
    venueNameByDms.set(dmsCode, cleanText(row.venueName) || dmsCode);
  });

  const venueRows = venueSourceRows
    .map((row) => {
      const scoreRaw =
        toNumber(row.noBatchDelay) * 3 +
        toNumber(row.uniqueManpower) * 1.5 +
        toNumber(row.driveCount) * 1.25 -
        toNumber(row.fullBatchDelay) * 4 -
        toNumber(row.partialBatchDelay) * 2 -
        toNumber(row.ffa) * 2 -
        toNumber(row.callLogs) * 3;
      const dmsCode = cleanDms(row.dmsCode);
      return {
        venueName: venueNameByDms.get(dmsCode) || dmsCode || "Unknown Venue",
        dmsCode,
        uniqueManpower: toNumber(row.uniqueManpower),
        noBatchDelay: toNumber(row.noBatchDelay),
        callLogs: toNumber(row.callLogs),
        score: Number(scoreRaw.toFixed(2)),
      };
    })
    .sort((a, b) => b.score - a.score);

  const projectRows = projectSourceRows
    .map((row) => {
      const scoreRaw =
        toNumber(row.noBatchDelay) * 3 +
        toNumber(row.uniqueManpower) * 1.5 +
        toNumber(row.driveCount) * 1.25 -
        toNumber(row.fullBatchDelay) * 4 -
        toNumber(row.partialBatchDelay) * 2 -
        toNumber(row.ffa) * 2 -
        toNumber(row.callLogs) * 3;
      return {
        projectName: cleanText(row.projectName) || "Unknown Project",
        driveCount: toNumber(row.driveCount),
        uniqueManpower: toNumber(row.uniqueManpower),
        noBatchDelay: toNumber(row.noBatchDelay),
        callLogs: toNumber(row.callLogs),
        score: Number(scoreRaw.toFixed(2)),
      };
    })
    .sort((a, b) => b.score - a.score);

  const sliceRows = (rows) => (Number.isFinite(limit) ? rows.slice(0, limit) : rows);
  return {
    scope: scopeKey,
    totals: {
      manpower: manpowerRows.length,
      venues: venueRows.length,
      projects: projectRows.length,
    },
    manpower: sliceRows(manpowerRows),
    venues: sliceRows(venueRows),
    projects: sliceRows(projectRows),
  };
}

function buildProjectPerformanceDrilldown(projectName, selectedVenueCode = "") {
  const targetProject = cleanText(projectName);
  if (!targetProject) {
    return {
      project: "",
      summary: {
        uniqueVenues: 0,
        uniquePeople: 0,
        totalRecords: 0,
        totalBatches: 0,
        fullBatchDelay: 0,
        partialBatchDelay: 0,
        noDelay: 0,
        ffa: 0,
        callLogs: 0,
      },
      venues: [],
      people: [],
    };
  }

  const mpPath = path.join(DATA_PATH, "0 Final_Manpower_Data.xlsx");
  const workbook = readWorkbookSmart(mpPath, "Data");
  const rows = (workbook.rows || []).map((row) => normalizeRowKeys(row));

  const latestRows = getLatestAnalysisRowsNormalized();
  const dmsMetaMap = new Map();
  latestRows.forEach((row) => {
    const dmsCode = cleanDms(row.dms_code || row.center_code || row.venue_code || row.code);
    if (!dmsCode || dmsMetaMap.has(dmsCode)) return;
    dmsMetaMap.set(dmsCode, {
      venueName: firstNonBlank([row.updated_venue_name, row.venue_name, row.name, row.venue]) || dmsCode,
      category: cleanText(row.category).toUpperCase() || "-",
      region: cleanText(row.region) || "-",
      state: cleanText(row.state) || "-",
      district: cleanText(row.district) || "-",
      city: cleanText(row.city) || "-",
    });
  });

  const scopedRows = rows.filter((row) => cleanText(row.project_name) === targetProject);
  const currentVenueCode = cleanDms(selectedVenueCode);

  const venueMap = new Map();
  const personMap = new Map();
  const summaryDeliveryKeys = new Set();
  const uniquePeople = new Set();
  let totalRecords = 0;
  let totalBatches = 0;
  let fullBatchDelay = 0;
  let partialBatchDelay = 0;
  let noDelay = 0;
  let ffa = 0;
  let callLogs = 0;

  scopedRows.forEach((row) => {
    totalRecords += 1;
    const dmsCode = cleanDms(row.dms_code || row.center_code || row.venue_code || row.code);
    const safeDmsCode = dmsCode || "UNKNOWN";
    const meta = dmsMetaMap.get(dmsCode) || {};
    const venueName = cleanText(meta.venueName || row.updated_venue_name || row.venue_name || row.name || safeDmsCode) || safeDmsCode;
    const driveName = cleanText(row.drive_name) || "Unknown Drive";
    const empId = cleanText(row.emp_id);
    const personName = cleanText(row.name) || empId || "Unknown";
    const personKey = `${empId || "NA"}||${personName}`;
    if (empId) uniquePeople.add(empId);

    const summaryKey = `${targetProject}||${driveName}||${safeDmsCode}`;
    if (!summaryDeliveryKeys.has(summaryKey)) {
      summaryDeliveryKeys.add(summaryKey);
      totalBatches += toNumber(row.total_batches);
      fullBatchDelay += toNumber(row.full_batch_delay);
      partialBatchDelay += toNumber(row.partially_batch_delay);
      noDelay += toNumber(row.no_delay);
      ffa += toNumber(row.ffa);
      callLogs += toNumber(row.call_logs_issue_count);
    }

    if (!venueMap.has(safeDmsCode)) {
      venueMap.set(safeDmsCode, {
        dmsCode: safeDmsCode,
        venueName,
        category: cleanText(meta.category) || "-",
        region: cleanText(meta.region || row.region) || "-",
        state: cleanText(meta.state || row.state) || "-",
        district: cleanText(meta.district || row.district) || "-",
        city: cleanText(meta.city || row.city) || "-",
        people: new Set(),
        roles: new Set(),
        deliveryKeys: new Set(),
        totalBatches: 0,
        fullBatchDelay: 0,
        partialBatchDelay: 0,
        noDelay: 0,
        ffa: 0,
        callLogs: 0,
      });
    }
    const venueEntry = venueMap.get(safeDmsCode);
    if (personName) venueEntry.people.add(personKey);
    if (cleanText(row.role)) venueEntry.roles.add(cleanText(row.role));
    const venueDeliveryKey = `${targetProject}||${driveName}||${safeDmsCode}`;
    if (!venueEntry.deliveryKeys.has(venueDeliveryKey)) {
      venueEntry.deliveryKeys.add(venueDeliveryKey);
      venueEntry.totalBatches += toNumber(row.total_batches);
      venueEntry.fullBatchDelay += toNumber(row.full_batch_delay);
      venueEntry.partialBatchDelay += toNumber(row.partially_batch_delay);
      venueEntry.noDelay += toNumber(row.no_delay);
      venueEntry.ffa += toNumber(row.ffa);
      venueEntry.callLogs += toNumber(row.call_logs_issue_count);
    }

    if (!personMap.has(personKey)) {
      personMap.set(personKey, {
        personName,
        empId: empId || "-",
        phone: cleanText(row.number) || "-",
        tenures: new Set(),
        roles: new Set(),
        venues: new Set(),
        deliveryKeys: new Set(),
        totalBatches: 0,
        fullBatchDelay: 0,
        partialBatchDelay: 0,
        noDelay: 0,
        ffa: 0,
        callLogs: 0,
      });
    }
    const personEntry = personMap.get(personKey);
    if (!personEntry.phone || personEntry.phone === "-") personEntry.phone = cleanText(row.number) || personEntry.phone;
    if (cleanText(row.tenure)) personEntry.tenures.add(cleanText(row.tenure));
    if (cleanText(row.role)) personEntry.roles.add(cleanText(row.role));
    personEntry.venues.add(safeDmsCode);
    const personDeliveryKey = `${targetProject}||${driveName}||${safeDmsCode}||${personEntry.empId}`;
    if (!personEntry.deliveryKeys.has(personDeliveryKey)) {
      personEntry.deliveryKeys.add(personDeliveryKey);
      personEntry.totalBatches += toNumber(row.total_batches);
      personEntry.fullBatchDelay += toNumber(row.full_batch_delay);
      personEntry.partialBatchDelay += toNumber(row.partially_batch_delay);
      personEntry.noDelay += toNumber(row.no_delay);
      personEntry.ffa += toNumber(row.ffa);
      personEntry.callLogs += toNumber(row.call_logs_issue_count);
    }
  });

  const venues = Array.from(venueMap.values())
    .map((entry) => {
      const scoreRaw =
        entry.noDelay * 3 +
        entry.totalBatches * 0.5 +
        entry.people.size * 1.5 -
        entry.fullBatchDelay * 4 -
        entry.partialBatchDelay * 2 -
        entry.ffa * 2 -
        entry.callLogs * 3;
      return {
        dmsCode: entry.dmsCode,
        venueName: entry.venueName,
        category: entry.category,
        region: entry.region,
        state: entry.state,
        district: entry.district,
        city: entry.city,
        peopleCount: entry.people.size,
        roleCount: entry.roles.size,
        totalBatches: entry.totalBatches,
        fullBatchDelay: entry.fullBatchDelay,
        partialBatchDelay: entry.partialBatchDelay,
        noDelay: entry.noDelay,
        ffa: entry.ffa,
        callLogs: entry.callLogs,
        score: Number(scoreRaw.toFixed(2)),
        isCurrentVenue: Boolean(currentVenueCode && entry.dmsCode === currentVenueCode),
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.totalBatches !== a.totalBatches) return b.totalBatches - a.totalBatches;
      return a.venueName.localeCompare(b.venueName, "en", { sensitivity: "base" });
    });

  const people = Array.from(personMap.values())
    .map((entry) => {
      const scoreRaw =
        entry.noDelay * 3 +
        entry.totalBatches * 0.5 +
        entry.venues.size * 1.5 -
        entry.fullBatchDelay * 4 -
        entry.partialBatchDelay * 2 -
        entry.ffa * 2 -
        entry.callLogs * 3;
      return {
        personName: entry.personName,
        empId: entry.empId,
        phone: entry.phone,
        tenure: Array.from(entry.tenures).join(", ") || "-",
        roles: Array.from(entry.roles).join(", ") || "-",
        venueCodes: Array.from(entry.venues),
        venueCoverage: entry.venues.size,
        totalBatches: entry.totalBatches,
        fullBatchDelay: entry.fullBatchDelay,
        partialBatchDelay: entry.partialBatchDelay,
        noDelay: entry.noDelay,
        ffa: entry.ffa,
        callLogs: entry.callLogs,
        score: Number(scoreRaw.toFixed(2)),
        assignedToCurrentVenue: Boolean(currentVenueCode && entry.venues.has(currentVenueCode)),
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.totalBatches !== a.totalBatches) return b.totalBatches - a.totalBatches;
      return a.personName.localeCompare(b.personName, "en", { sensitivity: "base" });
    });

  return {
    project: targetProject,
    summary: {
      uniqueVenues: venues.length,
      uniquePeople: uniquePeople.size || people.length,
      totalRecords,
      totalBatches,
      fullBatchDelay,
      partialBatchDelay,
      noDelay,
      ffa,
      callLogs,
    },
    venues,
    people,
  };
}

app.post("/api/login", (req, res) => {
  const username = cleanText(req.body?.username);
  const password = cleanText(req.body?.password);
  if (isValidPassword(username, password)) {
    const userRecord = getUserRecord(username);
    const store = readSessionLogs();
    const nowIso = new Date().toISOString();
    const sessionId = createSessionId(username);
    store.sessions.push({
      sessionId,
      user: username,
      loginAt: nowIso,
      logoutAt: null,
      loginIp: getClientIp(req),
      logoutIp: "",
      userAgent: cleanText(req.get("user-agent")).slice(0, 300),
    });
    writeSessionLogs(store);

    const datasets = Object.entries(FILES)
      .filter(([, config]) => config.users.includes(username))
      .map(([key]) => key);

    return res.json({
      success: true,
      user: username,
      role: cleanText(userRecord?.role) || "User",
      permissions: Array.isArray(userRecord?.permissions) ? userRecord.permissions : [],
      datasets,
      sessionId,
      sessionSummary: buildSessionSummary(username, store.sessions, sessionId),
    });
  }
  return res.status(401).json({ success: false, message: "Invalid credentials" });
});

app.post("/api/logout", (req, res) => {
  const username = cleanText(req.body?.username);
  const sessionId = cleanText(req.body?.sessionId);

  if (!username || !isKnownUser(username)) {
    return res.status(400).json({ success: false, message: "Valid user is required" });
  }

  const store = readSessionLogs();
  const nowIso = new Date().toISOString();
  let updated = false;

  if (sessionId) {
    const found = store.sessions.find(
      (entry) =>
        cleanText(entry?.sessionId) === sessionId &&
        cleanText(entry?.user) === username &&
        !cleanText(entry?.logoutAt),
    );
    if (found) {
      found.logoutAt = nowIso;
      found.logoutIp = getClientIp(req);
      updated = true;
    }
  }

  if (!updated) {
    for (let i = store.sessions.length - 1; i >= 0; i -= 1) {
      const entry = store.sessions[i];
      if (cleanText(entry?.user) === username && !cleanText(entry?.logoutAt)) {
        entry.logoutAt = nowIso;
        entry.logoutIp = getClientIp(req);
        updated = true;
        break;
      }
    }
  }

  if (updated) writeSessionLogs(store);
  return res.json({
    success: true,
    updated,
    sessionSummary: buildSessionSummary(username, store.sessions),
  });
});

app.get("/api/session-summary", (req, res) => {
  const username = cleanText(req.query.user);
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 20) : 8;

  if (!username || !isKnownUser(username)) {
    return res.status(400).json({ success: false, message: "Valid user is required" });
  }

  const store = readSessionLogs();
  const summary = buildSessionSummary(username, store.sessions);
  return res.json({
    success: true,
    ...summary,
    recentSessions: summary.recentSessions.slice(0, limit),
  });
});

app.get("/api/datasets", (req, res) => {
  const username = cleanText(req.query.user);
  if (!username || !isKnownUser(username)) {
    return res.json({ datasets: Object.keys(FILES) });
  }
  const datasets = Object.entries(FILES)
    .filter(([, config]) => config.users.includes(username))
    .map(([key]) => key);
  return res.json({ datasets });
});

app.get("/api/master/allowed", (req, res) => {
  const username = cleanText(req.query.user);
  if (!username || !isKnownUser(username)) {
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

  const marketResearch = findMarketResearchForVenue(record, code);

  return res.json({
    venue: record,
    photos,
    occupancyPercent: occupancyPct,
    manpower,
    marketResearch,
  });
});

app.post("/api/venue/:code/market-research", async (req, res) => {
  try {
    const code = cleanDms(req.params.code);
    if (!code) return res.status(400).json({ error: "Invalid venue code" });

    const rows = getLatestAnalysisRowsNormalized();
    const record = rows.find((row) => cleanDms(row.dms_code || row.venue_code || row.code) === code);
    if (!record) return res.status(404).json({ error: "Venue not found" });

    const generated = await generateMarketResearchForVenue(record, code);
    upsertMarketResearchRecord(generated);
    const marketResearch = findMarketResearchForVenue(record, code);

    return res.json({
      success: true,
      marketResearch,
      sourceCount: Array.isArray(marketResearch?.sources) ? marketResearch.sources.length : 0,
      refreshedAt: marketResearch?.lastResearchedAt || new Date().toISOString().slice(0, 10),
    });
  } catch (error) {
    return res.status(500).json({ error: `Market research refresh failed: ${error.message}` });
  }
});

app.post("/api/market-research/refresh-all", async (req, res) => {
  try {
    const limitRaw = Number(req.body?.limit || 25);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(80, Math.floor(limitRaw))) : 25;
    const onlyMissing = req.body?.onlyMissing !== false;

    const rows = getLatestAnalysisRowsNormalized();
    const uniqueByCode = new Map();
    rows.forEach((row) => {
      const code = cleanDms(row.dms_code || row.venue_code || row.code);
      if (!code || uniqueByCode.has(code)) return;
      uniqueByCode.set(code, row);
    });

    const candidates = Array.from(uniqueByCode.entries()).filter(([code, row]) => {
      if (!onlyMissing) return true;
      const existing = findMarketResearchForVenue(row, code);
      return !Array.isArray(existing?.sources) || existing.sources.length === 0;
    });

    const sliced = candidates.slice(0, limit);
    let refreshed = 0;
    const failed = [];

    for (const [code, row] of sliced) {
      try {
        const generated = await generateMarketResearchForVenue(row, code);
        upsertMarketResearchRecord(generated);
        refreshed += 1;
      } catch (error) {
        failed.push({ code, error: cleanText(error?.message || "Unknown error") });
      }
    }

    return res.json({
      success: true,
      totalCandidates: candidates.length,
      attempted: sliced.length,
      refreshed,
      failed,
    });
  } catch (error) {
    return res.status(500).json({ error: `Bulk market research refresh failed: ${error.message}` });
  }
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

app.get("/api/occupancy/data", (req, res) => {
  try {
    const filePath = getOccupancyDataFilePath();
    if (!filePath) {
      return res.status(404).json({ error: "Occupancy data file not found" });
    }
    const stat = fs.statSync(filePath);
    if (occupancyDataCache && occupancyDataCache.mtimeMs === stat.mtimeMs) {
      return res.json({ success: true, ...occupancyDataCache.payload });
    }

    const payload = buildOccupancyDataset();

    occupancyDataCache = { mtimeMs: stat.mtimeMs, payload };
    return res.json({ success: true, ...payload });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/manpower/query", (req, res) => {
  try {
    const result = runManpowerQuery(req.body || {});
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/manpower/project-drilldown", (req, res) => {
  try {
    const project = cleanText(req.query.project);
    const venueCode = cleanText(req.query.venueCode || req.query.dmsCode || "");
    if (!project) {
      return res.status(400).json({ error: "Project is required" });
    }
    const result = buildProjectPerformanceDrilldown(project, venueCode);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/manpower/performance-rankings", (req, res) => {
  try {
    const username = cleanText(req.body?.username || req.query.user || req.get("x-vms-user"));
    if (!username || !isKnownUser(username)) {
      return res.status(401).json({ error: "Unauthorized user" });
    }
    if (!canViewPerformanceRankingsByUser(username)) {
      return res.status(403).json({ error: "Access denied for performance rankings" });
    }

    const scope = cleanText(req.body?.scope || req.query.scope || "top10");
    const hasNestedQuery = req.body?.query && typeof req.body.query === "object";
    const queryPayload = hasNestedQuery ? { ...req.body.query } : { ...(req.body || {}) };
    delete queryPayload.username;
    delete queryPayload.scope;
    delete queryPayload.query;

    const result = runManpowerQuery(queryPayload);
    const rankings = buildPerformanceRankings(result, scope);
    return res.json({
      success: true,
      ...rankings,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/manpower/person-lookup", (req, res) => {
  try {
    const targetName = cleanText(req.query.name);
    const targetDms = cleanDms(req.query.dmsCode || req.query.dms || req.query.venueCode || "");
    if (!targetName) return res.status(400).json({ error: "Name is required" });

    const mpPath = path.join(DATA_PATH, "0 Final_Manpower_Data.xlsx");
    if (!fs.existsSync(mpPath)) return res.status(404).json({ error: "Manpower data not found" });

    const workbook = readWorkbookSmart(mpPath, "Data");
    const allRows = (workbook.rows || []).map((r) => normalizeRowKeys(r));

    const norm = (value) =>
      cleanText(value)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");

    const targetNorm = norm(targetName);
    if (!targetNorm) return res.status(400).json({ error: "Invalid name" });

    const scoreMap = new Map();

    for (const row of allRows) {
      const empId = cleanText(row.emp_id);
      const name = cleanText(row.name);
      if (!empId || !name) continue;

      const rowNorm = norm(name);
      if (!rowNorm) continue;

      let score = 0;
      if (rowNorm === targetNorm) score += 100;
      else if (rowNorm.startsWith(targetNorm) || targetNorm.startsWith(rowNorm)) score += 80;
      else if (rowNorm.includes(targetNorm) || targetNorm.includes(rowNorm)) score += 60;
      else continue;

      const rowDms = cleanDms(row.dms_code || row.center_code || row.venue_code || row.code);
      if (targetDms && rowDms && rowDms === targetDms) score += 25;

      if (cleanText(row.number)) score += 2;
      if (cleanText(row.email)) score += 2;

      const existing = scoreMap.get(empId);
      if (!existing || score > existing.score) {
        scoreMap.set(empId, {
          empId,
          name,
          phone: cleanText(row.number),
          email: cleanText(row.email),
          score,
        });
      }
    }

    const best = Array.from(scoreMap.values()).sort((a, b) => b.score - a.score)[0];
    if (!best) return res.status(404).json({ error: "Person not found" });

    return res.json({
      empId: best.empId,
      name: best.name,
      phone: best.phone,
      email: best.email,
      confidence: best.score >= 100 ? "high" : best.score >= 80 ? "medium" : "low",
    });
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
    const examProjects = new Set();
    const examDrives = new Set();
    const trainingProjects = new Set();
    const trainingDrives = new Set();
    let examRows = 0;
    let trainingRows = 0;
    let maxExamDays = 0;
    let maxPatTrainingAttempted = 0;
    let maxUniquePatTrainingAttempted = 0;

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

      const examDays = toNumber(row.exam_days);
      const patTrainingAttempted = toNumber(row.pat_training_attempted);
      const uniquePatTrainingAttempted = toNumber(row.unique_pat_training_attempted);
      const rowProjectName = cleanText(row.project_name);
      const rowDriveName = cleanText(row.drive_name);

      if (examDays > 0) {
        examRows += 1;
        if (rowProjectName) examProjects.add(rowProjectName);
        if (rowDriveName) examDrives.add(rowDriveName);
        if (examDays > maxExamDays) maxExamDays = examDays;
      }

      if (patTrainingAttempted > 0 || uniquePatTrainingAttempted > 0) {
        trainingRows += 1;
        if (rowProjectName) trainingProjects.add(rowProjectName);
        if (rowDriveName) trainingDrives.add(rowDriveName);
      }

      if (patTrainingAttempted > maxPatTrainingAttempted) {
        maxPatTrainingAttempted = patTrainingAttempted;
      }
      if (uniquePatTrainingAttempted > maxUniquePatTrainingAttempted) {
        maxUniquePatTrainingAttempted = uniquePatTrainingAttempted;
      }

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

    const readiness = {
      examDuty: {
        hasExamDuty: examRows > 0 || examProjects.size > 0 || maxExamDays > 0,
        rowsWithExamDuty: examRows,
        projectsWithExamDuty: examProjects.size,
        drivesWithExamDuty: examDrives.size,
        maxExamDaysObserved: maxExamDays,
      },
      training: {
        hasPatTraining:
          trainingRows > 0 ||
          trainingProjects.size > 0 ||
          maxPatTrainingAttempted > 0 ||
          maxUniquePatTrainingAttempted > 0,
        rowsWithTraining: trainingRows,
        projectsWithTraining: trainingProjects.size,
        drivesWithTraining: trainingDrives.size,
        maxPatTrainingAttempted,
        maxUniquePatTrainingAttempted,
        trainingProjects: Array.from(trainingProjects),
      },
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
      readiness,
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
