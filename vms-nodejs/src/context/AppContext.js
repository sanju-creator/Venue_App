"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

const AppContext = createContext(null);

const API = "http://localhost:5000/api";
const USER_KEY = "vms_user";
const USER_EVENT = "vms_user_changed";

function getUserSnapshot() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(USER_KEY);
}

function getServerUserSnapshot() {
  return null;
}

function subscribeUserStore(callback) {
  if (typeof window === "undefined") {
    return () => {};
  }
  const onChange = () => callback();
  window.addEventListener("storage", onChange);
  window.addEventListener(USER_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(USER_EVENT, onChange);
  };
}

function emitUserStoreChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(USER_EVENT));
  }
}

export function AppProvider({ children }) {
  const userJson = useSyncExternalStore(subscribeUserStore, getUserSnapshot, getServerUserSnapshot);

  const user = useMemo(() => {
    if (!userJson) return null;
    try {
      return JSON.parse(userJson);
    } catch {
      if (typeof window !== "undefined") localStorage.removeItem(USER_KEY);
      return null;
    }
  }, [userJson]);

  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [page, setPage] = useState("dashboard");
  const [pendingPage, setPendingPage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [datasetKey, setDatasetKey] = useState("Venue Inventory");
  const [selectedVenueCode, setSelectedVenueCode] = useState("");
  const [manpowerFilter, setManpowerFilter] = useState(null);
  const [masterMapState, setMasterMapState] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [notice, setNotice] = useState("");

  const fetchApi = useCallback(async (endpoint, init = {}) => {
    setLoading(true);
    try {
      const response = await fetch(`${API}/${endpoint}`, init);
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || data?.message || `Request failed (${response.status})`);
      }
      return data;
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(
    async (username, password) => {
      const data = await fetchApi("login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      localStorage.setItem(USER_KEY, JSON.stringify(data));
      emitUserStoreChange();
      if (pendingPage) {
        setPage(pendingPage);
        setPendingPage(null);
      } else {
        setPage("dashboard");
      }
      if (data?.datasets?.length) {
        setDatasetKey((prev) => (data.datasets.includes(prev) ? prev : data.datasets[0]));
      }
      setNotice("");
      return data;
    },
    [fetchApi, pendingPage],
  );

  const logout = useCallback(async () => {
    const currentUser = user;
    try {
      if (currentUser?.user) {
        await fetch(`${API}/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: currentUser.user,
            sessionId: currentUser.sessionId || "",
          }),
        });
      }
    } catch {
      // Logout should still proceed on client even if network call fails.
    } finally {
      localStorage.removeItem(USER_KEY);
      emitUserStoreChange();
      setPendingPage(null);
      setPage("dashboard");
      setNotice("");
    }
  }, [user]);

  const goTo = useCallback(
    (nextPage, options = {}) => {
      const requiresAuth = !!options.requiresAuth;
      const allowedUsers = options.allowedUsers || null;

      if (requiresAuth && !user) {
        setPendingPage(nextPage);
        setPage("login");
        setNotice("Please login to access this section.");
        return false;
      }

      if (allowedUsers && user && !allowedUsers.includes(user.user)) {
        setNotice(`Access denied for ${user.user} in this module.`);
        return false;
      }

      setNotice("");
      setPage(nextPage);
      return true;
    },
    [user],
  );

  const openVenueDetail = useCallback(
    (dmsCode) => {
      const safeCode = String(dmsCode || "").trim();
      if (!safeCode) return;
      setSelectedVenueCode(safeCode);
      goTo("venue_detail", { requiresAuth: true, allowedUsers: ["Admin", "Prafull"] });
    },
    [goTo],
  );

  const openManpowerAnalytics = useCallback(
    (dmsCode) => {
      const safeCode = String(dmsCode || "").trim();
      setManpowerFilter(safeCode ? { dmsCode: safeCode } : null);
      goTo("manpower_dashboard", { requiresAuth: true });
    },
    [goTo],
  );

  const value = useMemo(
    () => ({
      API,
      hydrated,
      user,
      datasets: user?.datasets || [],
      page,
      setPage,
      pendingPage,
      datasetKey,
      setDatasetKey,
      selectedVenueCode,
      setSelectedVenueCode,
      notice,
      setNotice,
      loading,
      fetchApi,
      login,
      logout,
      goTo,
      openVenueDetail,
      manpowerFilter,
      setManpowerFilter,
      openManpowerAnalytics,
      masterMapState,
      setMasterMapState,
      sidebarCollapsed,
      setSidebarCollapsed,
    }),
    [
      hydrated,
      user,
      page,
      pendingPage,
      datasetKey,
      selectedVenueCode,
      notice,
      loading,
      fetchApi,
      login,
      logout,
      goTo,
      openVenueDetail,
      manpowerFilter,
      setManpowerFilter,
      openManpowerAnalytics,
      masterMapState,
      setMasterMapState,
      sidebarCollapsed,
      setSidebarCollapsed,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProvider");
  return context;
}
