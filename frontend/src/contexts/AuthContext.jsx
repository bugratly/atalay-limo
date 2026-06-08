import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, setToken, getToken } from "@/lib/api";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      if (!getToken()) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const { data } = await api.get("/auth/me");
        if (!cancelled) setUser(data);
      } catch (err) {
        console.error("Auth init failed:", err);
        setToken(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    init();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    setToken(data.token);
    // Confirm the fresh session before routing. This prevents the first-click login
    // timing issue where the UI showed an error before auth state was ready.
    const me = await api.get("/auth/me");
    setUser(me.data);
    return me.data;
  }, []);

  const register = useCallback(async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const refresh = useCallback((next) => {
    if (next) {
      setUser(next);
      return;
    }
    api.get("/auth/me")
      .then(({ data }) => setUser(data))
      .catch((err) => console.error("Auth refresh failed:", err));
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch (err) {
      console.error("Logout API call failed:", err);
    }
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}
