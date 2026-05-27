import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import type { User } from '../api/types';

type AuthContextValue = {
  ready: boolean;
  token: string | null;
  user: User | null;
  baseUrl: string;
  signIn: (baseUrl: string, token: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type MeResponse = {
  user?: User;
  name?: string;
};

function normalizeMe(me: MeResponse, previousName = ''): User | null {
  if (!me.user) return null;
  const resolvedName = (me.user.name || '').trim() || (me.name || '').trim() || previousName.trim();
  return { ...me.user, name: resolvedName };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [baseUrl, setBaseUrl] = useState(api.getBaseUrl());

  useEffect(() => {
    async function boot() {
      const savedToken = await AsyncStorage.getItem('walam.token');
      const savedBaseUrl = await AsyncStorage.getItem('walam.baseUrl');
      if (savedBaseUrl) {
        api.setBaseUrl(savedBaseUrl);
        setBaseUrl(savedBaseUrl);
      }
      if (savedToken) {
        api.setToken(savedToken);
        setToken(savedToken);
        try {
          const me = await api.request<MeResponse>('me');
          const savedName = (await AsyncStorage.getItem('walam.lastName')) || '';
          const merged = normalizeMe(me, savedName);
          setUser(merged);
          if (merged?.name?.trim()) {
            await AsyncStorage.setItem('walam.lastName', merged.name.trim());
          }
        } catch {
          await AsyncStorage.removeItem('walam.token');
          api.setToken(null);
          setToken(null);
        }
      }
      setReady(true);
    }
    boot();
  }, []);

  async function refreshMe() {
    const me = await api.request<MeResponse>('me');
    setUser((prev) => {
      const merged = normalizeMe(me, prev?.name || '');
      if (merged?.name?.trim()) {
        AsyncStorage.setItem('walam.lastName', merged.name.trim()).catch(() => {});
      }
      return merged;
    });
  }

  async function signIn(nextBaseUrl: string, nextToken: string) {
    api.setBaseUrl(nextBaseUrl);
    api.setToken(nextToken);
    const me = await api.request<MeResponse>('me');
    await AsyncStorage.multiSet([
      ['walam.baseUrl', nextBaseUrl],
      ['walam.token', nextToken]
    ]);
    setBaseUrl(nextBaseUrl);
    setToken(nextToken);
    const merged = normalizeMe(me, user?.name || '');
    setUser(merged);
    if (merged?.name?.trim()) {
      await AsyncStorage.setItem('walam.lastName', merged.name.trim());
    }
  }

  async function signOut() {
    try {
      await api.request('logout');
    } catch {
      // local logout should still continue
    }
    await AsyncStorage.multiRemove([
      'walam.token',
      'walam.lastName',
      'walam.fbLogoutNonce',
      'walam.forceFbLogout',
      'walam.force_reauth_next_login',
    ]);
    api.setToken(null);
    setToken(null);
    setUser(null);
  }

  async function deleteAccount() {
    try {
      await api.request('delete_account');
    } finally {
      await AsyncStorage.multiRemove(['walam.token', 'walam.lastName', 'walam.fbLogoutNonce']);
      api.setToken(null);
      setToken(null);
      setUser(null);
    }
  }

  const value = useMemo(() => ({ ready, token, user, baseUrl, signIn, signOut, deleteAccount, refreshMe }), [ready, token, user, baseUrl]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return value;
}
