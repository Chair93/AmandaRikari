import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from '../api/client';
import type { User } from '../api/types';

interface AuthState {
  user: User | null;
  isOwner: boolean;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<User>('/auth/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    setError(null);
    try {
      const u = await api.post<User>('/auth/login', { email, password });
      setUser(u);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao entrar');
      throw e;
    }
  }

  async function register(email: string, password: string, name: string) {
    setError(null);
    try {
      const u = await api.post<User>('/auth/register', { email, password, name });
      setUser(u);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao criar conta');
      throw e;
    }
  }

  async function logout() {
    await api.post('/auth/logout');
    setUser(null);
  }

  async function refresh() {
    const u = await api.get<User>('/auth/me').catch(() => null);
    setUser(u);
  }

  return (
    <AuthContext.Provider value={{ user, isOwner: user?.role === 'owner', loading, error, login, register, logout, clearError: () => setError(null), refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
