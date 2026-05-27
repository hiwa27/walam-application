import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, LayoutChangeEvent, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Fingerprint,
  Heart,
  Mail,
  MessageCircle,
  ThumbsUp,
  Users,
} from 'lucide-react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { api } from '../api/client';
import type { Automation, Page } from '../api/types';
import { useAuth } from '../state/AuthContext';
import { useLanguage } from '../state/LanguageContext';
import { colors, spacing } from '../theme';
import { playRefreshSound } from '../utils/refresh';

type BotStatsBucket = {
  total?: number;
  reply_count?: number;
  like_count?: number;
  pm_count?: number;
};

type PageStatsPayload = {
  page?: {
    id?: string;
    name?: string;
    fan_count?: number;
    followers_count?: number;
  };
  bot_stats?: {
    total?: BotStatsBucket;
    today?: BotStatsBucket;
    week?: BotStatsBucket;
    month?: BotStatsBucket;
  };
  daily_series?: {
    labels?: string[];
    reply?: number[];
    like?: number[];
    pm?: number[];
  };
  debug?: {
    raw_page_id?: string;
    source_page_id?: string;
    stats_page_id?: string;
    token_found?: boolean;
    using_user_token?: boolean;
    bot_replies?: {
      exact_page_id_count?: number;
      prefix_page_id_count?: number;
      comment_prefix_count?: number;
      reply_prefix_count?: number;
      last_row?: { id?: number; page_id?: string; type?: string; fb_user_id?: string; created_at?: string } | null;
      error?: string;
    };
  };
};

function normalizePageName(page?: Page | null) {
  if (!page) return '';
  return typeof page.name === 'string' ? page.name : String(page.name ?? '');
}

function pageNeedsNameResolution(page: Page) {
  const id = (page.id ?? '').trim();
  const name = normalizePageName(page).trim();
  if (!id) return false;
  if (!name) return true;
  if (name === id) return true;
  return /^page\s+/i.test(name);
}

function getPageAvatarCandidates(page: Page) {
  const graphUrl = `https://graph.facebook.com/${encodeURIComponent(page.id)}/picture?type=small&width=96&height=96`;
  return [page.picture ?? '', graphUrl].filter(Boolean);
}

function safeBucket(bucket?: BotStatsBucket): Required<BotStatsBucket> {
  return {
    total: Number(bucket?.total ?? 0),
    reply_count: Number(bucket?.reply_count ?? 0),
    like_count: Number(bucket?.like_count ?? 0),
    pm_count: Number(bucket?.pm_count ?? 0),
  };
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={styles.miniStatCard}>
      <View style={styles.miniStatHead}>
        <View style={styles.miniStatIcon}>{icon}</View>
        <Text style={styles.miniStatLabel}>{label}</Text>
      </View>
      <Text numberOfLines={1} style={styles.miniStatValue}>
        {value}
      </Text>
    </View>
  );
}

function buildLinePath(values: number[], width: number, height: number, maxY: number): string {
  if (!values.length || width <= 0 || height <= 0 || maxY <= 0) return '';
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  return values
    .map((value, index) => {
      const x = stepX * index;
      const y = height - (Math.max(0, value) / maxY) * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

function shortDateLabel(input: string): string {
  if (!input) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return input.slice(5);
  }
  return input;
}

function TrendChart({
  labels,
  reply,
  like,
  pm,
  repliesLabel,
  likesLabel,
}: {
  labels: string[];
  reply: number[];
  like: number[];
  pm: number[];
  repliesLabel: string;
  likesLabel: string;
}) {
  const [chartWidth, setChartWidth] = useState(0);
  const chartHeight = 170;
  const gridLines = 4;
  const allValues = [...reply, ...like, ...pm];
  const maxY = Math.max(1, ...allValues);

  const replyPath = buildLinePath(reply, chartWidth, chartHeight, maxY);
  const likePath = buildLinePath(like, chartWidth, chartHeight, maxY);
  const pmPath = buildLinePath(pm, chartWidth, chartHeight, maxY);

  function onChartLayout(event: LayoutChangeEvent) {
    const width = Math.max(0, Math.floor(event.nativeEvent.layout.width));
    if (width !== chartWidth) {
      setChartWidth(width);
    }
  }

  const startLabel = labels.length ? shortDateLabel(labels[0]) : '';
  const endLabel = labels.length ? shortDateLabel(labels[labels.length - 1]) : '';

  return (
    <View style={styles.chartCard}>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#4f46e5' }]} />
          <Text style={styles.legendText}>{repliesLabel}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#db2777' }]} />
          <Text style={styles.legendText}>{likesLabel}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#059669' }]} />
          <Text style={styles.legendText}>PM</Text>
        </View>
      </View>

      <View style={styles.chartBox} onLayout={onChartLayout}>
        {chartWidth > 0 ? (
          <Svg width={chartWidth} height={chartHeight}>
            {Array.from({ length: gridLines + 1 }).map((_, idx) => {
              const y = (chartHeight / gridLines) * idx;
              return <Line key={`grid-${idx}`} x1={0} y1={y} x2={chartWidth} y2={y} stroke="#e5e7eb" strokeWidth={1} />;
            })}
            {replyPath ? <Path d={replyPath} stroke="#4f46e5" strokeWidth={2.5} fill="none" /> : null}
            {likePath ? <Path d={likePath} stroke="#db2777" strokeWidth={2.5} fill="none" /> : null}
            {pmPath ? <Path d={pmPath} stroke="#059669" strokeWidth={2.5} fill="none" /> : null}
          </Svg>
        ) : null}
      </View>

      <View style={styles.chartFooter}>
        <Text style={styles.chartFooterText}>{startLabel}</Text>
        <Text style={styles.chartFooterText}>{endLabel}</Text>
      </View>
    </View>
  );
}

export function PagesScreen() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [pages, setPages] = useState<Page[]>([]);
  const [selectedPageId, setSelectedPageId] = useState<string>('');
  const [showPagePicker, setShowPagePicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [pageStats, setPageStats] = useState<PageStatsPayload | null>(null);
  const [statsError, setStatsError] = useState('');
  const [brokenImages, setBrokenImages] = useState<Record<string, number>>({});

  async function load() {
    setLoading(true);
    try {
      const pagesRes = await api.request<{ pages: Page[] }>('pages', { debug: 1 });
      let resolvedPages = pagesRes.pages ?? [];

      if (!resolvedPages.length) {
        const meRes = await api.request<{ pages?: Page[] }>('me');
        resolvedPages = meRes.pages ?? [];
      }

      if (!resolvedPages.length) {
        const autoRes = await api.request<{ automations: Automation[] }>('automations');
        const fallbackMap: Record<string, Page> = {};
        for (const row of autoRes.automations ?? []) {
          const pid = (row.page_id ?? '').trim();
          if (!pid) continue;
          fallbackMap[pid] = { id: pid, name: `Page ${pid}`, has_token: true, platform: 'facebook' };
        }
        resolvedPages = Object.values(fallbackMap);
      }

      const unresolvedIds = resolvedPages.filter(pageNeedsNameResolution).map((p) => p.id);
      if (unresolvedIds.length) {
        try {
          const namesRes = await api.request<{ pages: Array<{ id: string; name: string; picture?: string | null }> }>(
            'resolve_page_names',
            { page_ids: unresolvedIds }
          );
          const byId: Record<string, { name: string; picture?: string | null }> = {};
          for (const p of namesRes.pages ?? []) {
            if (!p?.id) continue;
            byId[p.id] = { name: p.name || p.id, picture: p.picture ?? null };
          }
          resolvedPages = resolvedPages.map((p) => ({
            ...p,
            name: byId[p.id]?.name || p.name,
            picture: byId[p.id]?.picture ?? p.picture ?? null,
          }));
        } catch {}
      }

      setPages(resolvedPages);
      setSelectedPageId((prev) => {
        if (resolvedPages.length === 0) return '';
        if (prev && resolvedPages.some((p) => p.id === prev)) return prev;
        return resolvedPages[0].id;
      });
    } catch (error) {
      Alert.alert(t('error'), error instanceof Error ? error.message : t('pages_load_failed'));
    } finally {
      setLoading(false);
    }
  }

  async function handlePullRefresh() {
    await playRefreshSound();
    await load();
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    let active = true;
    async function loadStats() {
      if (!selectedPageId) {
        if (active) setPageStats(null);
        return;
      }
      setStatsLoading(true);
      setStatsError('');
      try {
        const res = await api.request<PageStatsPayload>('page_stats', {
          page_id: selectedPageId,
          // Keep mobile stats consistent with dashboard selection.
          // Passing source_page_id here can force a different page identity in legacy mappings.
          source_page_id: '',
        });
        if (active) {
          setPageStats({
            page: res.page,
            bot_stats: res.bot_stats,
            daily_series: res.daily_series,
            debug: res.debug,
          });
        }
      } catch (error) {
        if (active) {
          setPageStats(null);
          setStatsError(error instanceof Error ? error.message : t('stats_load_failed'));
        }
      } finally {
        if (active) setStatsLoading(false);
      }
    }
    loadStats();
    return () => {
      active = false;
    };
  }, [selectedPageId, pages]);

  const selectedPage = useMemo(() => pages.find((page) => page.id === selectedPageId) ?? null, [pages, selectedPageId]);
  const isAccountBlocked = (user?.is_active ?? true) === false;
  const isSelectedPageRestricted = !!selectedPage?.restricted;
  const selectedPageRestrictionReason = (selectedPage?.restriction_reason ?? '').trim();
  const selectedPageName = selectedPage ? normalizePageName(selectedPage).trim() || `Page ${selectedPage.id}` : t('select_page');
  const totalPagesCount = pages.length;
  const activePagesCount = pages.filter((p) => p.has_token).length;

  const pageLikes = Number(pageStats?.page?.fan_count ?? selectedPage?.fan_count ?? 0);
  const pageFollowers = Number(pageStats?.page?.followers_count ?? pageStats?.page?.fan_count ?? selectedPage?.fan_count ?? 0);
  const pageIdLabel = (pageStats?.page?.id || selectedPage?.id || '-').trim() || '-';

  const statsTotal = safeBucket(pageStats?.bot_stats?.total);
  const statsToday = safeBucket(pageStats?.bot_stats?.today);
  const statsWeek = safeBucket(pageStats?.bot_stats?.week);
  const statsMonth = safeBucket(pageStats?.bot_stats?.month);

  const dailyLabels = Array.isArray(pageStats?.daily_series?.labels) ? pageStats?.daily_series?.labels ?? [] : [];
  const dailyReply = Array.isArray(pageStats?.daily_series?.reply) ? (pageStats?.daily_series?.reply ?? []).map((n) => Number(n ?? 0)) : [];
  const dailyLike = Array.isArray(pageStats?.daily_series?.like) ? (pageStats?.daily_series?.like ?? []).map((n) => Number(n ?? 0)) : [];
  const dailyPm = Array.isArray(pageStats?.daily_series?.pm) ? (pageStats?.daily_series?.pm ?? []).map((n) => Number(n ?? 0)) : [];
  const selectedPageAvatarCandidates = selectedPage ? getPageAvatarCandidates(selectedPage) : [];
  const selectedPageAvatarFailCount = selectedPage ? (brokenImages[selectedPage.id] ?? 0) : 0;
  const selectedPageAvatarUri = selectedPage ? (selectedPageAvatarCandidates[selectedPageAvatarFailCount] ?? '') : '';

  return (
    <Screen title={t('page_stats_title')} subtitle={t('page_stats_subtitle')} onRefresh={handlePullRefresh} refreshing={loading}>
      <Pressable style={styles.pageSelect} onPress={() => setShowPagePicker(true)}>
        <ChevronDown size={16} color={colors.muted} />
        <View style={styles.pageSelectMeta}>
          <Text style={styles.pageSelectText}>{selectedPageName}</Text>
          <Text style={styles.pageSelectId}>{t('page_id')}: {pageIdLabel}</Text>
        </View>
        {selectedPage && selectedPageAvatarUri ? (
          <Image
            source={{ uri: selectedPageAvatarUri }}
            style={styles.pageAvatar}
            onError={() =>
              setBrokenImages((current) => ({
                ...current,
                [selectedPage.id]: (current[selectedPage.id] ?? 0) + 1,
              }))
            }
          />
        ) : (
          <View style={styles.pageAvatarFallback}>
            <Text style={styles.pageAvatarFallbackText}>{(selectedPageName.trim().charAt(0) || '?').toUpperCase()}</Text>
          </View>
        )}
      </Pressable>

      <Card>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>{totalPagesCount}</Text>
            <Text style={styles.summaryLabel}>{t('total_pages')}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryNumber}>{activePagesCount}</Text>
            <Text style={styles.summaryLabel}>{t('active_pages')}</Text>
          </View>
        </View>
      </Card>

      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {statsLoading ? <ActivityIndicator color={colors.primaryDark} /> : null}
      {!statsLoading && statsError ? <Text style={styles.errorText}>{t('stats_fetch_error')}: {statsError}</Text> : null}
      {isAccountBlocked ? (
        <View style={styles.blockWarn}>
          <Text style={styles.blockWarnText}>{t('blocked_account_message')}</Text>
        </View>
      ) : null}
      {isSelectedPageRestricted ? (
        <View style={styles.blockWarn}>
          <Text style={styles.blockWarnText}>{t('blocked_page_message')}</Text>
          <Text style={styles.blockWarnSub}>
            {t('restriction_reason_label')}: {selectedPageRestrictionReason || t('restriction_reason_empty')}
          </Text>
        </View>
      ) : null}

      {selectedPage ? (
        <>
          <Card>
            <View style={styles.head}>
              <View style={[styles.stateBadge, { backgroundColor: selectedPage.has_token ? '#ecfdf3' : '#fff7ed' }]}>
                {selectedPage.has_token ? <CheckCircle2 size={14} color={colors.success} /> : <CircleAlert size={14} color={colors.accent} />}
                <Text style={[styles.stateText, { color: selectedPage.has_token ? colors.success : '#b45309' }]}>
                  {selectedPage.has_token ? t('active') : t('inactive')}
                </Text>
              </View>
              <Text style={styles.name}>{selectedPageName}</Text>
            </View>

            <View style={styles.miniStatsRow}>
              <MiniStat icon={<ThumbsUp size={16} color="#2563eb" />} label={t('likes')} value={pageLikes.toLocaleString()} />
              <MiniStat icon={<Users size={16} color="#7c3aed" />} label={t('followers')} value={pageFollowers.toLocaleString()} />
              <MiniStat icon={<Fingerprint size={16} color="#d97706" />} label={t('page_id')} value={pageIdLabel} />
            </View>
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>{t('page_stats')}</Text>
            <View style={styles.botTopRow}>
              <View style={styles.botTopCard}>
                <View style={styles.botTopHead}><MessageCircle size={15} color="#4f46e5" /><Text style={styles.botTopLabel}>{t('replies')}</Text></View>
                <Text style={styles.botTopValue}>{statsTotal.reply_count.toLocaleString()}</Text>
                <Text style={styles.botTopSub}>{t('total')}: {statsTotal.reply_count.toLocaleString()}</Text>
              </View>
              <View style={styles.botTopCard}>
                <View style={styles.botTopHead}><Heart size={15} color="#db2777" /><Text style={styles.botTopLabel}>{t('likes')}</Text></View>
                <Text style={styles.botTopValue}>{statsTotal.like_count.toLocaleString()}</Text>
                <Text style={styles.botTopSub}>{t('total')}: {statsTotal.like_count.toLocaleString()}</Text>
              </View>
              <View style={styles.botTopCard}>
                <View style={styles.botTopHead}><Mail size={15} color="#059669" /><Text style={styles.botTopLabel}>PM</Text></View>
                <Text style={styles.botTopValue}>{statsTotal.pm_count.toLocaleString()}</Text>
                <Text style={styles.botTopSub}>{t('total')}: {statsTotal.pm_count.toLocaleString()}</Text>
              </View>
            </View>

            <View style={styles.periodGrid}>
              <View style={styles.periodCard}>
                <Text style={styles.periodTitle}>{t('total')}</Text>
                <Text style={styles.periodLine}>{t('replies')}: {statsTotal.reply_count.toLocaleString()}</Text>
                <Text style={styles.periodLine}>{t('likes')}: {statsTotal.like_count.toLocaleString()}</Text>
                <Text style={styles.periodLine}>PM: {statsTotal.pm_count.toLocaleString()}</Text>
              </View>
              <View style={styles.periodCard}>
                <Text style={styles.periodTitle}>{t('daily')}</Text>
                <Text style={styles.periodLine}>{t('replies')}: {statsToday.reply_count.toLocaleString()}</Text>
                <Text style={styles.periodLine}>{t('likes')}: {statsToday.like_count.toLocaleString()}</Text>
                <Text style={styles.periodLine}>PM: {statsToday.pm_count.toLocaleString()}</Text>
              </View>
              <View style={styles.periodCard}>
                <Text style={styles.periodTitle}>{t('weekly')}</Text>
                <Text style={styles.periodLine}>{t('replies')}: {statsWeek.reply_count.toLocaleString()}</Text>
                <Text style={styles.periodLine}>{t('likes')}: {statsWeek.like_count.toLocaleString()}</Text>
                <Text style={styles.periodLine}>PM: {statsWeek.pm_count.toLocaleString()}</Text>
              </View>
              <View style={styles.periodCard}>
                <Text style={styles.periodTitle}>{t('monthly')}</Text>
                <Text style={styles.periodLine}>{t('replies')}: {statsMonth.reply_count.toLocaleString()}</Text>
                <Text style={styles.periodLine}>{t('likes')}: {statsMonth.like_count.toLocaleString()}</Text>
                <Text style={styles.periodLine}>PM: {statsMonth.pm_count.toLocaleString()}</Text>
              </View>
            </View>
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>{t('chart_last_30_days')}</Text>
            <TrendChart labels={dailyLabels} reply={dailyReply} like={dailyLike} pm={dailyPm} repliesLabel={t('replies')} likesLabel={t('likes')} />
          </Card>

        </>
      ) : null}

      {!loading && selectedPage ? <Text style={styles.helper}>{t('selected_page')}: {selectedPageName}</Text> : null}
      {!loading && pages.length > 0 ? <Text style={styles.helper}>{t('change_page_hint')}</Text> : null}
      {!loading && pages.length === 0 ? <Text style={styles.empty}>{t('no_pages_found')}</Text> : null}

      <Modal visible={showPagePicker} transparent animationType="fade" onRequestClose={() => setShowPagePicker(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {pages.length === 0 ? <Text style={styles.empty}>{t('no_pages_available')}</Text> : null}
            <ScrollView style={styles.pageList}>
              {pages.map((page) => {
                const pageName = normalizePageName(page).trim() || `Page ${page.id}`;
                const isActive = page.id === selectedPageId;
                const avatarCandidates = getPageAvatarCandidates(page);
                const avatarFailCount = brokenImages[page.id] ?? 0;
                const avatarUri = avatarCandidates[avatarFailCount] ?? '';
                return (
                  <Pressable
                    key={page.id}
                    style={[styles.pageItem, isActive ? styles.pageItemActive : null]}
                    onPress={() => {
                      setSelectedPageId(page.id);
                      setShowPagePicker(false);
                    }}
                  >
                    <View style={styles.pageItemHead}>
                      <View style={styles.pageItemMain}>
                        {avatarUri ? (
                          <Image
                            source={{ uri: avatarUri }}
                            style={styles.pageAvatar}
                            onError={() =>
                              setBrokenImages((current) => ({
                                ...current,
                                [page.id]: (current[page.id] ?? 0) + 1,
                              }))
                            }
                          />
                        ) : (
                          <View style={styles.pageAvatarFallback}>
                            <Text style={styles.pageAvatarFallbackText}>{(pageName.trim().charAt(0) || '?').toUpperCase()}</Text>
                          </View>
                        )}
                        <View style={styles.pageItemTexts}>
                          <Text style={styles.pageItemName}>{pageName}</Text>
                          <Text style={styles.pageItemId}>{t('page_id')}: {page.id}</Text>
                        </View>
                      </View>
                      <View style={[styles.stateBadge, { backgroundColor: page.has_token ? '#ecfdf3' : '#fff7ed' }]}>
                        {page.has_token ? <CheckCircle2 size={12} color={colors.success} /> : <CircleAlert size={12} color={colors.accent} />}
                        <Text style={[styles.stateText, { color: page.has_token ? colors.success : '#b45309' }]}>
                          {page.has_token ? t('active') : t('inactive')}
                        </Text>
                      </View>
                    </View>
                    {page.restricted ? (
                      <View style={styles.pageRestrictedRow}>
                        <Text style={styles.pageRestrictedText}>{t('blocked_page_message')}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable style={styles.cancelBtn} onPress={() => setShowPagePicker(false)}>
              <Text style={styles.cancelText}>{t('cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  summaryRow: { flexDirection: 'row-reverse', gap: spacing.md },
  summaryItem: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  summaryNumber: { color: colors.text, fontWeight: '900', fontSize: 24 },
  summaryLabel: { color: colors.muted, marginTop: 4 },

  pageSelect: {
    minHeight: 62,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageSelectMeta: { flex: 1, marginHorizontal: spacing.sm, alignItems: 'flex-end' },
  pageSelectText: { color: colors.text, fontWeight: '700' },
  pageSelectId: { marginTop: 2, color: colors.muted, fontSize: 12, textAlign: 'right' },
  pageAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceAlt },
  pageAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(124,92,252,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageAvatarFallbackText: { color: '#ffffff', fontWeight: '900', fontSize: 16 },

  head: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  name: { color: colors.text, fontWeight: '900', fontSize: 17, textAlign: 'right', flex: 1, marginLeft: spacing.md },
  stateBadge: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  stateText: { fontWeight: '800', fontSize: 12 },

  miniStatsRow: { flexDirection: 'row-reverse', gap: spacing.sm, marginTop: spacing.md },
  miniStatCard: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: spacing.sm,
    minHeight: 94,
  },
  miniStatHead: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  miniStatIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: 'rgba(124,92,252,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniStatLabel: { color: colors.muted, fontWeight: '700', textAlign: 'right', fontSize: 12 },
  miniStatValue: { marginTop: spacing.sm, color: colors.text, fontWeight: '900', fontSize: 15, textAlign: 'right' },

  sectionTitle: { color: colors.text, fontWeight: '900', fontSize: 18, textAlign: 'right', marginBottom: spacing.sm },
  botTopRow: { flexDirection: 'row-reverse', gap: spacing.sm },
  botTopCard: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: spacing.sm,
  },
  botTopHead: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  botTopLabel: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  botTopValue: { marginTop: 6, color: colors.text, fontWeight: '900', fontSize: 21, textAlign: 'right' },
  botTopSub: { color: colors.muted, fontSize: 12, textAlign: 'right' },

  periodGrid: { marginTop: spacing.md, flexDirection: 'row-reverse', gap: spacing.sm },
  periodCard: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: spacing.sm,
    gap: 4,
  },
  periodTitle: { color: colors.text, fontWeight: '800', textAlign: 'right' },
  periodLine: { color: colors.muted, fontSize: 12, textAlign: 'right' },

  chartCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: spacing.sm,
  },
  legendRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'flex-start', gap: spacing.md, marginBottom: spacing.sm },
  legendItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  chartBox: { width: '100%', height: 170 },
  chartFooter: { marginTop: 4, flexDirection: 'row-reverse', justifyContent: 'space-between' },
  chartFooterText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  debugLine: { color: colors.muted, textAlign: 'right', fontSize: 12, marginBottom: 3 },

  helper: { color: colors.muted, textAlign: 'center', marginTop: -spacing.sm },
  empty: { color: colors.muted, textAlign: 'center' },
  errorText: { color: colors.danger, textAlign: 'center', fontWeight: '700' },
  blockWarn: { marginTop: 8, marginBottom: 2, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,71,87,0.45)', backgroundColor: 'rgba(255,71,87,0.14)', paddingVertical: 8, paddingHorizontal: 10 },
  blockWarnText: { color: '#ffd7dc', fontWeight: '900', textAlign: 'right' },
  blockWarnSub: { color: '#ffd7dc', fontWeight: '700', textAlign: 'right', marginTop: 4, fontSize: 12 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.3)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: '75%',
    padding: spacing.md,
    gap: spacing.sm,
  },
  pageList: { maxHeight: 320 },
  pageItem: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  pageItemActive: { borderColor: colors.primary, backgroundColor: 'rgba(124,92,252,0.2)' },
  pageItemHead: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  pageItemMain: { flexDirection: 'row-reverse', alignItems: 'center', flex: 1, marginLeft: spacing.sm },
  pageItemTexts: { flex: 1, alignItems: 'flex-end', marginRight: spacing.sm },
  pageItemName: { color: colors.text, fontWeight: '800', textAlign: 'right' },
  pageItemId: { marginTop: 4, color: colors.muted, textAlign: 'right', fontSize: 12 },
  pageRestrictedRow: { marginTop: 8, borderTopWidth: 1, borderTopColor: '#fee2e2', paddingTop: 6 },
  pageRestrictedText: { color: '#ffd7dc', fontWeight: '800', textAlign: 'right', fontSize: 12 },

  cancelBtn: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { color: colors.text, fontWeight: '800' },
});
