import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  ReactNode,
} from "react";
import { apiFetch, storeToken, clearToken, getToken } from "@/lib/api";

export interface Employee {
  id: string;
  employee_code: string;
  full_name: string;
  designation?: string | null;
  role?: string | null;
  photo_url?: string | null;
  email?: string | null;
  contact_number?: string | null;
  workplace_id?: string | null;
  workplace?: { id: string; name: string; client_name?: string | null; address?: string | null } | null;
  password_changed?: boolean | null;
  employment_status?: string | null;
}

interface AuthContextValue {
  user: Employee | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ passwordChanged: boolean }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Employee | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = await getToken();
        if (stored) {
          setToken(stored);
          const me = await apiFetch<Employee>("/auth/me");
          setUser(me);
        }
      } catch {
        await clearToken();
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = async (username: string, password: string) => {
    const data = await apiFetch<{ token: string; employee: Employee; passwordChanged: boolean }>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ username, password }) },
    );
    await storeToken(data.token);
    setToken(data.token);
    setUser(data.employee);
    return { passwordChanged: data.passwordChanged };
  };

  const logout = async () => {
    await clearToken();
    setToken(null);
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const me = await apiFetch<Employee>("/auth/me");
      setUser(me);
    } catch { /* ignore */ }
  };

  const value = useMemo(
    () => ({ user, token, isLoading, login, logout, refreshUser }),
    [user, token, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
