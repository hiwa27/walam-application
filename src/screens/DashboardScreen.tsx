import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowUpRight, MessageCircle, Bot, Layers, RefreshCcw, CalendarClock } from 'lucide-react-native';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { api } from '../api/client';
import type { DashboardSummary } from '../api/types';
import { useAuth } from '../state/AuthContext';
import { useLanguage } from '../state/LanguageContext';
import { colors, spacing } from '../theme';
import { playRefreshSound } from '../utils/refresh';

export function DashboardScreen() {
  const { user, baseUrl, refreshMe } = useAuth();
  const { t } = useLanguage();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileBroken, setProfileBroken] = useState(false);

  const profileUri = user?.fb_user_id ? `https://graph.facebook.com/${encodeURIComponent(user.fb_user_id)}/picture?type=large` : '';

  const expiryText = useMemo(() => {
    const raw = user?.expiry_date;
    if (!raw) return t('no_expiry_date');
    const exp = new Date(raw);
    if (Number.isNaN(exp.getTime())) return raw;
    const now = new Date();
    const diffMs = exp.getTime() - now.getTime();
    const absMs = Math.abs(diffMs);
    const days = Math.floor(absMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((absMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (diffMs >= 0) return `${days} d ${hours} h ${t('time_left_suffix')}`;
    return `${days} d ${hours} h ${t('time_passed_suffix')}`;
  }, [user?.expiry_date, t]);

  async function resolvePagesCountLikePagesScreen(): Promise<number | null> {
    try {
      const pagesRes = await api.request<{ pages?: Array<{ id?: string }> }>('pages', { debug: 1 });
      let resolvedPages = Array.isArray(pagesRes.pages) ? pagesRes.pages : [];

      if (!resolvedPages.length) {
        const meRes = await api.request<{ pages?: Array<{ id?: string }> }>('me');
        resolvedPages = Array.isArray(meRes.pages) ? meRes.pages : [];
      }

      if (!resolvedPages.length) {
        const autoRes = await api.request<{ automations?: Array<{ page_id?: string }> }>('automations');
        const seen = new Set<string>();
        for (const row of autoRes.automations ?? []) {
          const pid = (row.page_id ?? '').trim();
          if (!pid) continue;
          seen.add(pid);
        }
        return seen.size;
      }

      return resolvedPages.length;
    } catch {
      return null;
    }
  }

  async function load() {
    setLoading(true);
    try {
      const res = await api.request<{ summary: DashboardSummary }>('dashboard_summary');
      let nextSummary = res.summary;
      const pagesCount = await resolvePagesCountLikePagesScreen();
      if (pagesCount !== null) {
        nextSummary = { ...nextSummary, pages: pagesCount };
      }
      setSummary(nextSummary);
    } catch (error) {
      Alert.alert(t('error'), error instanceof Error ? error.message : t('could_not_load_dashboard_data'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      refreshMe().catch(() => {});
      return () => {};
    }, [refreshMe])
  );

  async function handlePullRefresh() {
    await playRefreshSound();
    await refreshMe().catch(() => {});
    await load();
  }

  return (
    <Screen
      title={t('dashboard')}
      subtitle={t('overview')}
      onRefresh={handlePullRefresh}
      refreshing={loading}
      headerRight={
        <Image source={require('../../assets/walam-icon.png')} style={styles.headerLogo} />
      }
    >
      <Card>
        <View style={styles.userRow}>
          <View style={styles.userMeta}>
            <Text style={styles.userName}>{user?.name?.trim() || ''}</Text>
            <Text style={styles.userId}>ID: {user?.fb_user_id || '-'}</Text>
          </View>
          {!profileBroken && profileUri ? (
            <Image source={{ uri: profileUri }} style={styles.profile} onError={() => setProfileBroken(true)} />
          ) : (
            <View style={styles.profileFallback}><Text style={styles.profileFallbackText}>{(user?.name?.trim()?.charAt(0) || '?').toUpperCase()}</Text></View>
          )}
        </View>

        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Layers size={16} color={colors.primaryDark} />
            <Text style={styles.infoLabel}>{t('stats')}</Text>
            <Text style={styles.infoValue}>{summary?.pages ?? 0}</Text>
          </View>
          <View style={styles.infoItem}>
            <CalendarClock size={16} color={colors.primaryDark} />
            <Text style={styles.infoLabel}>{t('account_time')}</Text>
            <Text style={styles.infoValueSmall}>{expiryText}</Text>
          </View>
        </View>
      </Card>

      {loading && !summary ? <ActivityIndicator color={colors.primary} /> : null}

      <View style={styles.grid}>
        <Metric icon={<Bot size={18} color={colors.primary} />} label={t('active_posts')} value={summary?.active_posts ?? 0} />
        <Metric icon={<MessageCircle size={18} color={colors.primary} />} label={t('today_replies')} value={summary?.replies_today ?? 0} />
        <Metric icon={<ArrowUpRight size={18} color={colors.primary} />} label={t('total_replies')} value={summary?.total_replies ?? 0} />
      </View>

      <Pressable style={styles.refresh} onPress={handlePullRefresh}>
        <RefreshCcw size={16} color="#fff" />
        <Text style={styles.refreshText}>{t('refresh_data')}</Text>
      </Pressable>
    </Screen>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <View style={styles.metricHead}>
        <View style={styles.metricIcon}>{icon}</View>
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
      <Text style={styles.metricValue}>{value.toLocaleString()}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerLogo: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)' },
  headerLogoFallback: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  headerLogoFallbackText: { color: '#fff', fontWeight: '900', fontSize: 22 },

  userRow: { marginTop: spacing.md, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  userMeta: { flex: 1, alignItems: 'flex-end' },
  userName: { color: colors.text, fontWeight: '900', fontSize: 17, textAlign: 'right' },
  userId: { marginTop: 4, color: colors.muted, textAlign: 'right' },
  profile: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.surfaceAlt },
  profileFallback: { width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(124,92,252,0.2)', alignItems: 'center', justifyContent: 'center' },
  profileFallbackText: { color: '#fff', fontWeight: '900', fontSize: 20 },

  infoRow: { marginTop: spacing.md, flexDirection: 'row-reverse', gap: spacing.md },
  infoItem: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.03)', padding: spacing.sm, alignItems: 'flex-end', gap: 4 },
  infoLabel: { color: colors.muted, fontWeight: '700', fontSize: 12, textAlign: 'right' },
  infoValue: { color: colors.text, fontWeight: '900', fontSize: 24, textAlign: 'right' },
  infoValueSmall: { color: colors.text, fontWeight: '800', fontSize: 13, textAlign: 'right' },

  grid: { gap: spacing.md },
  metricHead: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  metricIcon: { width: 28, height: 28, borderRadius: 10, backgroundColor: 'rgba(124,92,252,0.2)', alignItems: 'center', justifyContent: 'center' },
  metricLabel: { color: colors.muted, fontWeight: '700' },
  metricValue: { marginTop: spacing.sm, color: colors.text, fontSize: 30, fontWeight: '900', textAlign: 'right' },
  refresh: { minHeight: 52, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row-reverse', gap: 8, shadowColor: colors.primary, shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  refreshText: { color: '#fff', fontWeight: '900' }
});
