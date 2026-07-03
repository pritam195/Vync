/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api.js';
import { clearAuthToken, setAuthToken } from '../services/authToken.js';

const AuthContext = createContext(null);
const guestStorageKey = 'vync_guest';

function getStoredGuest() {
  try {
    const storedGuest = localStorage.getItem(guestStorageKey);
    return storedGuest ? JSON.parse(storedGuest) : null;
  } catch {
    localStorage.removeItem(guestStorageKey);
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [guest, setGuest] = useState(getStoredGuest);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
      setGuest(null);
      localStorage.removeItem(guestStorageKey);
    } catch {
      setUser(null);
      clearAuthToken();
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = useCallback(async (credentials) => {
    setAuthError('');
    const { data } = await api.post('/auth/login', credentials);
    setAuthToken(data.token);
    setUser(data.user);
    setGuest(null);
    localStorage.removeItem(guestStorageKey);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    setAuthError('');
    const { data } = await api.post('/auth/register', payload);
    setAuthToken(data.token);
    setUser(data.user);
    setGuest(null);
    localStorage.removeItem(guestStorageKey);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout');
    clearAuthToken();
    setUser(null);
    setGuest(null);
    localStorage.removeItem(guestStorageKey);
  }, []);

  const joinAsGuest = useCallback((name) => {
    const guestUser = {
      id: crypto.randomUUID(),
      name: name.trim(),
      role: 'guest',
      avatar: '',
    };

    setGuest(guestUser);
    setUser(null);
    clearAuthToken();
    localStorage.setItem(guestStorageKey, JSON.stringify(guestUser));
    return guestUser;
  }, []);

  const forgotPassword = useCallback(async (email) => {
    setAuthError('');
    const { data } = await api.post('/auth/forgot-password', { email });
    return data;
  }, []);

  const verifyOTP = useCallback(async (email, otp) => {
    setAuthError('');
    const { data } = await api.post('/auth/verify-otp', { email, otp });
    return data;
  }, []);

  const resetPassword = useCallback(async (email, otp, password) => {
    setAuthError('');
    const { data } = await api.post('/auth/reset-password', { email, otp, password });
    return data;
  }, []);

  const value = useMemo(
    () => ({
      user,
      guest,
      currentUser: user || guest,
      authError,
      isGuest: Boolean(guest),
      isLoading,
      isAuthenticated: Boolean(user),
      joinAsGuest,
      login,
      refreshUser,
      register,
      setUser,
      setAuthError,
      logout,
      forgotPassword,
      verifyOTP,
      resetPassword,
    }),
    [authError, guest, isLoading, joinAsGuest, login, logout, refreshUser, register, user, forgotPassword, verifyOTP, resetPassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }

  return context;
}
