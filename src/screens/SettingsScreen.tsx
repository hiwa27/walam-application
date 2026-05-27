import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Clipboard, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, BadgeCheck, CalendarClock, CircleUserRound, Clock3, ExternalLink, Info, LifeBuoy, LogOut, MessageCircleMore, Trash2 } from 'lucide-react-native';
import { WebView } from 'react-native-webview';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { api } from '../api/client';
import { useAuth } from '../state/AuthContext';
import { useLanguage } from '../state/LanguageContext';
import { colors } from '../theme';
import { playRefreshSound } from '../utils/refresh';

type ReferralStatus = {
  referral_code?: string;
  referred_by_code?: string;
  referred_by_user_id?: string;
  referral_discount_pending?: number;
  referral_balance_usd?: number;
  referral_owner_pending_usd?: number;
  referral_earned_usd?: number;
  referral_used_usd?: number;
  pending_users_count?: number;
  approved_users_count?: number;
};

const DEFAULT_MOBILE_API_URL = 'https://walam.app/mobile-api.php';

function formatExpiryDate(value?: string | null) {
  const raw = (value ?? '').trim();
  if (!raw) return 'N/A';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoValue}>{value}</Text>
      <Text style={styles.infoLabel}>{label}</Text>
    </View>
  );
}

function buildFallbackReferralCode(name: string, fbUserId: string) {
  const normalizedName = (name || '').toUpperCase().replace(/[^A-Z0-9]+/g, '') || 'USER';
  const shortName = normalizedName.slice(0, 8);
  const digits = (fbUserId || '').replace(/\D+/g, '');
  const suffix = digits ? digits.slice(-6) : '000000';
  return `WM-${shortName}-${suffix.toUpperCase()}`;
}

export function SettingsScreen() {
  const { user, signOut, deleteAccount, refreshMe } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const [refreshing, setRefreshing] = useState(false);
  const [busyAction, setBusyAction] = useState<'logout' | 'delete' | null>(null);
  const [settingsView, setSettingsView] = useState<'main' | 'help' | 'plans' | 'referral'>('main');
  const [webLogoutOpen, setWebLogoutOpen] = useState(false);
  const [webLogoutDone, setWebLogoutDone] = useState(false);

  const [liveChatModalOpen, setLiveChatModalOpen] = useState(false);
  const [liveMessages, setLiveMessages] = useState<Array<{ id: number; sender_type: string; sender_label: string; message_text: string }>>([]);
  const [liveThreadCode, setLiveThreadCode] = useState('');
  const [liveClearedAt, setLiveClearedAt] = useState('');
  const [liveLastId, setLiveLastId] = useState(0);
  const [liveInput, setLiveInput] = useState('');
  const [liveBusy, setLiveBusy] = useState(false);
  const [myReferralCode, setMyReferralCode] = useState('');
  const [usedReferralCode, setUsedReferralCode] = useState('');
  const [refBusy, setRefBusy] = useState<null | 'apply'>(null);
  const [referralStatus, setReferralStatus] = useState<ReferralStatus | null>(null);
  const [refStatusLoading, setRefStatusLoading] = useState(false);
  const liveVisitSession = useMemo(() => `mobile_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`, []);

  const accountStatus = useMemo(() => (user?.is_active ? t('active') : t('inactive')), [user?.is_active, t]);
  const expiryText = useMemo(() => formatExpiryDate(user?.expiry_date ?? null), [user?.expiry_date]);
  const displayReferralCode = useMemo(
    () => (myReferralCode.trim() || buildFallbackReferralCode(String(user?.name ?? ''), String(user?.fb_user_id ?? ''))),
    [myReferralCode, user?.name, user?.fb_user_id]
  );
  const websiteUrl = 'https://walam.app/';
  const aboutUrl = 'https://walam.app/#about';
  const whatsappNumberIntl = '96407509205118';

  useEffect(() => {
    setMyReferralCode(String(user?.referral_code ?? '').trim());
  }, [user?.referral_code]);

  useEffect(() => {
    if (settingsView !== 'referral') return;
    loadReferralStatus().catch(() => {});
  }, [settingsView]);

  async function fetchLiveHistory(threadCode: string, clearedAt: string) {
    try {
      const res = await fetch(
        `https://walam.app/live-chat-api.php?action=fetch&after_id=0&thread_code=${encodeURIComponent(threadCode)}&cleared_at=${encodeURIComponent(clearedAt)}&visit_session=${encodeURIComponent(liveVisitSession)}`,
        { credentials: 'include' }
      );
      const data = await res.json();
      const allMessages = Array.isArray(data?.messages) ? data.messages : [];
      setLiveMessages(allMessages);
      setLiveThreadCode(String(data?.thread_code ?? threadCode ?? ''));
      setLiveClearedAt(String(data?.cleared_at ?? clearedAt ?? ''));
      setLiveLastId(Number(data?.last_message_id ?? (allMessages.length ? allMessages[allMessages.length - 1]?.id || 0 : 0)));
    } catch {
      // keep current messages when fetch fails
    }
  }

  useEffect(() => {
    if (!liveChatModalOpen || !liveThreadCode) return;
    const timer = setInterval(() => {
      fetchLiveHistory(liveThreadCode, liveClearedAt);
    }, 3000);
    return () => clearInterval(timer);
  }, [liveChatModalOpen, liveThreadCode, liveClearedAt]);

  async function handlePullRefresh() {
    setRefreshing(true);
    await playRefreshSound();
    setRefreshing(false);
  }

  async function finishAppLogout() {
    if (webLogoutDone) return;
    setWebLogoutDone(true);
    try {
      await signOut();
    } finally {
      setWebLogoutOpen(false);
      setBusyAction(null);
    }
  }

  async function openLink(url: string) {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) throw new Error('unsupported_url');
      await Linking.openURL(url);
    } catch {
      Alert.alert(t('error'), 'Unable to open link.');
    }
  }

  async function openWhatsApp(message: string) {
    const text = encodeURIComponent(message);
    const urls = [
      `whatsapp://send?phone=${whatsappNumberIntl}&text=${text}`,
      `https://wa.me/${whatsappNumberIntl}?text=${text}`,
      `https://api.whatsapp.com/send?phone=${whatsappNumberIntl}&text=${text}`,
    ];
    for (const url of urls) {
      try {
        const supported = await Linking.canOpenURL(url);
        if (!supported) continue;
        await Linking.openURL(url);
        return true;
      } catch {
      }
    }
    Alert.alert(t('error'), 'Unable to open WhatsApp.');
    return false;
  }

  async function openLiveChat() {
    setLiveChatModalOpen(true);
    setLiveBusy(true);
    try {
      const openRes = await fetch('https://walam.app/live-chat-api.php?action=open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Walam-Live-Chat-Open': '1' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'open',
          lang: 'ku',
          page_url: 'mobile://settings',
          visit_session: liveVisitSession,
          user_initiated_open: '1',
          device_type: 'mobile-app',
          platform: 'react-native',
        }),
      });
      const openData = await openRes.json();
      const thread = openData?.thread ?? {};
      const messages = Array.isArray(thread.messages) ? thread.messages : [];
      setLiveMessages(messages);
      const nextThreadCode = String(openData?.thread_code ?? thread.thread_code ?? '');
      const nextClearedAt = String(openData?.cleared_at ?? thread.cleared_at ?? '');
      setLiveThreadCode(nextThreadCode);
      setLiveClearedAt(nextClearedAt);
      setLiveLastId(Number(thread.last_message_id ?? 0));
      await fetchLiveHistory(nextThreadCode, nextClearedAt);
    } catch {
      Alert.alert(t('error'), 'Unable to open Live Chat.');
    } finally {
      setLiveBusy(false);
    }
  }

  async function sendLiveMessage() {
    const text = liveInput.trim();
    if (!text || liveBusy) return;
    setLiveBusy(true);
    try {
      const res = await fetch('https://walam.app/live-chat-api.php?action=send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'send',
          message: text,
          visitor_name: user?.name || 'Visitor',
          lang: 'ku',
          page_url: 'mobile://settings',
          visit_session: liveVisitSession,
          device_type: 'mobile-app',
          platform: 'react-native',
        }),
      });
      const data = await res.json();
      if (!data?.ok) {
        Alert.alert(t('error'), 'Message not sent.');
        return;
      }
      setLiveInput('');
      await fetchLiveHistory(liveThreadCode, liveClearedAt);
    } catch {
      Alert.alert(t('error'), 'Unable to send message.');
    } finally {
      setLiveBusy(false);
    }
  }

  function buyPlan(plan: 'monthly' | 'quarterly' | 'yearly') {
    let message = 'سڵاو، دەمەوێت پلانی ساڵانە بکەم.';
    if (plan === 'monthly') message = 'سڵاو، دەمەوێت پلانی مانگانە بکەم.';
    if (plan === 'quarterly') message = 'سڵاو، دەمەوێت پلانی ٣ مانگ بکەم.';
    openWhatsApp(message);
  }

  async function applyReferralCode() {
    const code = usedReferralCode.trim().toUpperCase();
    if (!code) {
      Alert.alert(t('error'), t('referral_code_required'));
      return;
    }
    setRefBusy('apply');
    try {
      await api.request('apply_referral_code', { used_referral_code: code });
      setUsedReferralCode('');
      await refreshMe().catch(() => {});
      await loadReferralStatus().catch(() => {});
      Alert.alert(t('save'), t('referral_code_applied'));
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to apply referral code.';
      if (String(msg).includes('unknown_action')) {
        try {
          await forceDefaultApiBase();
          await api.request('apply_referral_code', { used_referral_code: code });
          setUsedReferralCode('');
          await refreshMe().catch(() => {});
          await loadReferralStatus().catch(() => {});
          Alert.alert(t('save'), t('referral_code_applied'));
        } catch {
          Alert.alert(t('error'), t('referral_api_not_updated'));
        }
      } else {
        Alert.alert(t('error'), msg);
      }
    } finally {
      setRefBusy(null);
    }
  }

  function copyReferralCode() {
    const code = displayReferralCode.trim();
    if (!code) return;
    Clipboard.setString(code);
    Alert.alert(t('save'), t('referral_code_copied'));
  }

  async function loadReferralStatus() {
    setRefStatusLoading(true);
    try {
      const res = await api.request<ReferralStatus>('referral_status');
      setReferralStatus(res);
      if (res.referral_code) {
        setMyReferralCode(String(res.referral_code));
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      if (String(msg).includes('unknown_action')) {
        try {
          await forceDefaultApiBase();
          const res = await api.request<ReferralStatus>('referral_status');
          setReferralStatus(res);
          if (res.referral_code) {
            setMyReferralCode(String(res.referral_code));
          }
        } catch {
          setReferralStatus(null);
        }
      }
    } finally {
      setRefStatusLoading(false);
    }
  }

  async function forceDefaultApiBase() {
    api.setBaseUrl(DEFAULT_MOBILE_API_URL);
    await AsyncStorage.setItem('walam.baseUrl', DEFAULT_MOBILE_API_URL);
  }

  return (
    <Screen
      title={settingsView === 'help' ? t('help') : settingsView === 'plans' ? t('buy_plan') : settingsView === 'referral' ? t('referral_code_title') : t('settings')}
      subtitle={settingsView === 'main' ? t('account_support') : undefined}
      onRefresh={handlePullRefresh}
      refreshing={refreshing}
    >
      {settingsView === 'main' ? (
        <>
          <Card>
            <View style={styles.headerRow}>
              <CircleUserRound size={18} color={colors.primary} />
              <Text style={styles.name}>{user?.name || 'Walam user'}</Text>
            </View>
            <InfoRow label="Facebook ID" value={user?.fb_user_id || '-'} />
            <InfoRow label="Email" value={(user?.email || '').trim() || '-'} />
            <InfoRow label="Timezone" value={user?.timezone || 'Asia/Baghdad'} />
          </Card>

          <Card>
            <View style={styles.statusRow}>
              <BadgeCheck size={18} color={user?.is_active ? colors.success : colors.danger} />
              <Text style={[styles.statusText, { color: user?.is_active ? colors.success : colors.danger }]}>{accountStatus}</Text>
              <Text style={styles.statusLabel}>{t('status')}</Text>
            </View>
            <View style={styles.statusRow}>
              <CalendarClock size={18} color={colors.accent} />
              <Text style={styles.statusText}>{expiryText}</Text>
              <Text style={styles.statusLabel}>{t('expiry')}</Text>
            </View>
            <View style={styles.statusRow}>
              <Clock3 size={18} color={colors.primary} />
              <Text style={styles.statusText}>{user?.is_admin ? t('admin') : t('user')}</Text>
              <Text style={styles.statusLabel}>{t('role')}</Text>
            </View>
          </Card>

          <Card>
            <Text style={styles.langTitle}>{t('language')}</Text>
            <View style={styles.langRow}>
              <Pressable style={[styles.langBtn, lang === 'ku' ? styles.langBtnActive : null]} onPress={() => void setLang('ku')}>
                <View style={styles.kurdFlag} accessibilityLabel="Kurdistan flag">
                  <View style={[styles.kurdStripe, { backgroundColor: '#ef4444' }]} />
                  <View style={[styles.kurdStripe, { backgroundColor: '#ffffff' }]} />
                  <View style={[styles.kurdStripe, { backgroundColor: '#22c55e' }]} />
                  <View style={styles.kurdSun} />
                </View>
                <Text style={styles.langText}>کوردی</Text>
              </Pressable>
              <Pressable style={[styles.langBtn, lang === 'en' ? styles.langBtnActive : null]} onPress={() => void setLang('en')}>
                <Text style={styles.langFlag}>🇺🇸</Text>
                <Text style={styles.langText}>English</Text>
              </Pressable>
              <Pressable style={[styles.langBtn, lang === 'ar' ? styles.langBtnActive : null]} onPress={() => void setLang('ar')}>
                <Text style={styles.langFlag}>🇮🇶</Text>
                <Text style={styles.langText}>العربية</Text>
              </Pressable>
            </View>
          </Card>

          <Card>
            <Pressable style={styles.helpLinkBtn} onPress={() => setSettingsView('help')}>
              <View style={[styles.helpIconWrap, styles.helpIconLive]}>
                <LifeBuoy size={18} color="#00D4AA" />
              </View>
              <Text style={styles.helpLinkText}>{t('help')}</Text>
            </Pressable>
            <Pressable style={styles.helpLinkBtn} onPress={() => setSettingsView('referral')}>
              <View style={[styles.helpIconWrap, styles.helpIconAbout]}>
                <BadgeCheck size={18} color="#7C5CFC" />
              </View>
              <Text style={styles.helpLinkText}>{t('referral_code_title')}</Text>
            </Pressable>
            <Pressable style={styles.helpLinkBtn} onPress={() => setSettingsView('plans')}>
              <View style={[styles.helpIconWrap, styles.helpIconWebsite]}>
                <CalendarClock size={18} color="#5B8DEF" />
              </View>
              <Text style={styles.helpLinkText}>{t('buy_plan')}</Text>
            </Pressable>
          </Card>

          <Pressable
            style={[styles.logout, busyAction ? styles.disabledBtn : null]}
            disabled={busyAction !== null}
            onPress={() =>
              Alert.alert(t('log_out'), t('log_out_confirm'), [
                { text: t('cancel'), style: 'cancel' },
                {
                  text: t('log_out'),
                  style: 'destructive',
                  onPress: async () => {
                    setBusyAction('logout');
                    setWebLogoutDone(false);
                    setWebLogoutOpen(true);
                  },
                },
              ])
            }
          >
            <LogOut size={18} color="#fff" />
            <Text style={styles.logoutText}>{busyAction === 'logout' ? t('loading') : t('log_out')}</Text>
          </Pressable>

          <Pressable
            style={[styles.deleteAccount, busyAction ? styles.disabledBtn : null]}
            disabled={busyAction !== null}
            onPress={() =>
              Alert.alert(t('delete_account_title'), t('delete_account_confirm'), [
                { text: t('cancel'), style: 'cancel' },
                {
                  text: t('delete'),
                  style: 'destructive',
                  onPress: async () => {
                    setBusyAction('delete');
                    try {
                      await deleteAccount();
                    } finally {
                      setBusyAction(null);
                    }
                  },
                },
              ])
            }
          >
            <Trash2 size={18} color="#FF8A95" />
            <Text style={styles.deleteText}>{busyAction === 'delete' ? t('deleting') : t('delete_account')}</Text>
          </Pressable>
        </>
      ) : null}

      {settingsView === 'help' ? (
        <Card style={styles.fullPageCard}>
          <View style={styles.subPageHeader}>
            <Text style={styles.helpTitle}>{t('help')}</Text>
            <Pressable style={styles.backIconBtn} onPress={() => setSettingsView('main')}>
              <ArrowLeft size={20} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.helpList}>
            <View style={styles.guideCard}>
              <Text style={styles.guideTitle}>{t('help_about_app')}</Text>
              <Text style={styles.helpItem}>• {t('help_about_line_1')}</Text>
              <Text style={styles.helpItem}>• {t('help_about_line_2')}</Text>
            </View>
            <View style={styles.guideCard}>
              <Text style={styles.guideTitle}>{t('help_auto_reply')}</Text>
              <Text style={styles.helpItem}>{t('help_auto_1')}</Text>
              <Text style={styles.helpItem}>{t('help_auto_2')}</Text>
              <Text style={styles.helpItem}>{t('help_auto_3')}</Text>
              <Text style={styles.helpItem}>{t('help_auto_4')}</Text>
            </View>
            <View style={styles.guideCard}>
              <Text style={styles.guideTitle}>{t('help_chat_flow')}</Text>
              <Text style={styles.helpItem}>{t('help_flow_1')}</Text>
              <Text style={styles.helpItem}>{t('help_flow_2')}</Text>
              <Text style={styles.helpItem}>{t('help_flow_3')}</Text>
              <Text style={styles.helpItem}>{t('help_flow_4')}</Text>
              <Text style={styles.helpItem}>{t('help_flow_5')}</Text>
            </View>
          </View>

          <Pressable style={styles.helpLinkBtn} onPress={() => openLink(websiteUrl)}>
            <View style={[styles.helpIconWrap, styles.helpIconWebsite]}>
              <ExternalLink size={18} color="#5B8DEF" />
            </View>
            <Text style={styles.helpLinkText}>{t('website_label')}</Text>
          </Pressable>
          <Pressable style={styles.helpLinkBtn} onPress={() => openLink(aboutUrl)}>
            <View style={[styles.helpIconWrap, styles.helpIconAbout]}>
              <Info size={18} color="#7C5CFC" />
            </View>
            <Text style={styles.helpLinkText}>{t('about_label')}</Text>
          </Pressable>
          <Pressable style={styles.helpLinkBtn} onPress={openLiveChat}>
            <View style={[styles.helpIconWrap, styles.helpIconLive]}>
              <LifeBuoy size={18} color="#00D4AA" />
            </View>
            <Text style={styles.helpLinkText}>{t('live_chat')}</Text>
          </Pressable>
          <Pressable style={styles.helpLinkBtn} onPress={() => openWhatsApp('سڵاو، پێویستم بە یارمەتییە.')}>
            <View style={[styles.helpIconWrap, styles.helpIconWhats]}>
              <MessageCircleMore size={18} color="#00D4AA" />
            </View>
            <Text style={styles.helpLinkText}>{t('live_chat_whatsapp')}</Text>
          </Pressable>
        </Card>
      ) : null}

      {settingsView === 'plans' ? (
        <Card style={styles.fullPageCard}>
          <View style={styles.subPageHeader}>
            <Text style={styles.helpTitle}>{t('buy_plan')}</Text>
            <Pressable style={styles.backIconBtn} onPress={() => setSettingsView('main')}>
              <ArrowLeft size={20} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.planList}>
            <Pressable style={[styles.planItem, styles.planMonthly]} onPress={() => buyPlan('monthly')}>
              <View style={styles.planTopRow}>
                <Text style={[styles.planBadge, styles.planBadgeMonthly]}>{t('plan_basic')}</Text>
                <Text style={styles.planName}>{t('monthly')}</Text>
              </View>
              <Text style={styles.planPrice}>{t('plan_monthly_price')}</Text>
              <View style={styles.planFeatures}>
                <Text style={styles.planFeature}>• {t('plan_monthly_feature_1')}</Text>
                <Text style={styles.planFeature}>• {t('plan_monthly_feature_2')}</Text>
                <Text style={styles.planFeature}>• {t('plan_monthly_feature_3')}</Text>
              </View>
              <View style={styles.planCtaRow}>
                <Text style={styles.planCtaText}>{t('plan_start_now')}</Text>
              </View>
            </Pressable>
            <Pressable style={[styles.planItem, styles.planQuarterly]} onPress={() => buyPlan('quarterly')}>
              <View style={styles.planTopRow}>
                <Text style={[styles.planBadge, styles.planBadgeQuarterly]}>{t('plan_popular')}</Text>
                <Text style={styles.planName}>{t('quarterly')}</Text>
              </View>
              <Text style={styles.planPrice}>{t('plan_quarterly_price')}</Text>
              <View style={styles.planFeatures}>
                <Text style={styles.planFeature}>• {t('plan_quarterly_feature_1')}</Text>
                <Text style={styles.planFeature}>• {t('plan_quarterly_feature_2')}</Text>
                <Text style={styles.planFeature}>• {t('plan_quarterly_feature_3')}</Text>
              </View>
              <View style={styles.planCtaRow}>
                <Text style={styles.planCtaText}>{t('plan_save_more')}</Text>
              </View>
            </Pressable>
            <Pressable style={[styles.planItem, styles.planYearly]} onPress={() => buyPlan('yearly')}>
              <View style={styles.planTopRow}>
                <Text style={[styles.planBadge, styles.planBadgeYearly]}>{t('plan_best_value')}</Text>
                <Text style={styles.planName}>{t('yearly')}</Text>
              </View>
              <Text style={styles.planPrice}>{t('plan_yearly_price')}</Text>
              <View style={styles.planFeatures}>
                <Text style={styles.planFeature}>• {t('plan_yearly_feature_1')}</Text>
                <Text style={styles.planFeature}>• {t('plan_yearly_feature_2')}</Text>
                <Text style={styles.planFeature}>• {t('plan_yearly_feature_3')}</Text>
              </View>
              <View style={styles.planCtaRow}>
                <Text style={styles.planCtaText}>{t('plan_full_access')}</Text>
              </View>
            </Pressable>
          </View>
        </Card>
      ) : null}

      {settingsView === 'referral' ? (
        <Card style={styles.fullPageCard}>
          <View style={styles.subPageHeader}>
            <Text style={styles.helpTitle}>{t('referral_code_title')}</Text>
            <Pressable style={styles.backIconBtn} onPress={() => setSettingsView('main')}>
              <ArrowLeft size={20} color={colors.text} />
            </Pressable>
          </View>

          <Card style={styles.referralCard}>
            <View style={styles.refHeadRow}>
              <View style={styles.refBadge}><Text style={styles.refBadgeText}>$</Text></View>
              <Text style={styles.refTitle}>{t('referral_wallet_title')}</Text>
            </View>
            {refStatusLoading ? <Text style={styles.refMeta}>{t('referral_loading')}</Text> : null}
            <View style={styles.refGrid}>
              <View style={styles.refStatCard}>
                <Text style={styles.refStatLabel}>{t('referral_balance')}</Text>
                <Text style={styles.refStatValue}>${Number(referralStatus?.referral_balance_usd ?? user?.referral_balance_usd ?? 0).toFixed(2)}</Text>
              </View>
              <View style={styles.refStatCard}>
                <Text style={styles.refStatLabel}>{t('referral_pending_reward')}</Text>
                <Text style={styles.refStatValue}>${Number(referralStatus?.referral_owner_pending_usd ?? user?.referral_owner_pending_usd ?? 0).toFixed(2)}</Text>
              </View>
              <View style={styles.refStatCard}>
                <Text style={styles.refStatLabel}>{t('referral_earned')}</Text>
                <Text style={styles.refStatValue}>${Number(referralStatus?.referral_earned_usd ?? user?.referral_earned_usd ?? 0).toFixed(2)}</Text>
              </View>
              <View style={styles.refStatCard}>
                <Text style={styles.refStatLabel}>{t('referral_used')}</Text>
                <Text style={styles.refStatValue}>${Number(referralStatus?.referral_used_usd ?? user?.referral_used_usd ?? 0).toFixed(2)}</Text>
              </View>
            </View>
            <View style={styles.refMetaRow}>
              <Text style={styles.refMetaChip}>{t('referral_pending_users')}: {Number(referralStatus?.pending_users_count ?? 0)}</Text>
              <Text style={styles.refMetaChip}>{t('referral_approved_users')}: {Number(referralStatus?.approved_users_count ?? 0)}</Text>
            </View>
            {String(referralStatus?.referred_by_code ?? '').trim() ? (
              <Text style={styles.refMeta}>{t('referral_used_code')}: {String(referralStatus?.referred_by_code ?? '').trim()}</Text>
            ) : null}
            <Text style={styles.refLabel}>{t('referral_my_code')}</Text>
            <TextInput
              style={styles.refInput}
              value={displayReferralCode}
              onChangeText={() => {}}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="WM-XXXX-123456"
              placeholderTextColor="#94a3b8"
              editable
              selectTextOnFocus
            />
            <Pressable style={styles.copyBtn} onPress={copyReferralCode}>
              <Text style={styles.copyBtnText}>{t('copy_code')}</Text>
            </Pressable>
            <Text style={styles.refMeta}>{t('referral_copy_hint')}</Text>

            <Text style={[styles.refLabel, { marginTop: 10 }]}>{t('referral_use_code')}</Text>
            <TextInput
              style={styles.refInput}
              value={usedReferralCode}
              onChangeText={setUsedReferralCode}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="WM-XXXX-123456"
              placeholderTextColor="#94a3b8"
              editable={!(user?.referred_by_user_id && String(user.referred_by_user_id).trim() !== '')}
            />
            <Pressable
              style={[styles.helpLinkBtn, refBusy ? styles.disabledBtn : null]}
              disabled={refBusy !== null || !!(user?.referred_by_user_id && String(user.referred_by_user_id).trim() !== '')}
              onPress={applyReferralCode}
            >
              <Text style={styles.helpLinkText}>
                {user?.referred_by_user_id ? t('used') : refBusy === 'apply' ? t('loading') : t('apply')}
              </Text>
            </Pressable>
          </Card>
        </Card>
      ) : null}

      <Modal visible={liveChatModalOpen} transparent animationType="fade" onRequestClose={() => setLiveChatModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.liveKeyboardWrap}>
          <View style={styles.liveModalCard}>
            <View style={styles.liveTopBar}>
              <Image source={require('../../assets/walam-icon.png')} style={styles.liveTopLogo} />
              <View style={{ flex: 1 }}>
                <Text style={styles.liveTopTitle}>{t('walam_team')}</Text>
                <Text style={styles.liveTopSub}>{t('active_now')}</Text>
              </View>
              <Pressable style={styles.liveTopClose} onPress={() => setLiveChatModalOpen(false)}>
                <Text style={styles.liveTopCloseText}>✕</Text>
              </Pressable>
            </View>
            <ScrollView
              style={styles.liveThread}
              contentContainerStyle={{ gap: 10, paddingBottom: 12 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            >
              {!liveMessages.length ? <Text style={styles.helpItem}>{liveBusy ? t('loading') : t('no_messages')}</Text> : null}
              {liveMessages.map((m, idx) => {
                const isVisitor = m.sender_type === 'visitor';
                const senderName = isVisitor ? (m.sender_label || user?.name || t('you')) : t('walam_team');
                const initial = (senderName || 'U').trim().charAt(0).toUpperCase();
                return (
                  <View key={`${m.id}-${idx}`} style={[styles.liveRow, isVisitor ? styles.liveRowMine : styles.liveRowOther]}>
                    {isVisitor ? (
                      <View style={styles.liveAvatarUser}>
                        <Text style={styles.liveAvatarInitial}>{initial}</Text>
                      </View>
                    ) : (
                      <Image source={require('../../assets/walam-icon.png')} style={styles.liveAvatarLogo} />
                    )}
                    <View style={[styles.liveMsg, isVisitor ? styles.liveMine : styles.liveOther]}>
                      <Text style={styles.liveName}>{senderName}</Text>
                      <Text style={[styles.liveText, isVisitor ? styles.liveTextMine : null]}>{m.message_text || ''}</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            <View style={styles.liveComposer}>
              <Pressable style={[styles.liveSendBtn, liveBusy ? styles.disabledBtn : null]} disabled={liveBusy} onPress={sendLiveMessage}>
                <Text style={styles.liveSendText}>{t('send')}</Text>
              </Pressable>
              <TextInput
                style={styles.liveInputBox}
                value={liveInput}
                onChangeText={setLiveInput}
                placeholder={t('write_message')}
                placeholderTextColor="#94a3b8"
                textAlign="right"
                multiline
              />
            </View>
          </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={webLogoutOpen} animationType="fade" onRequestClose={finishAppLogout}>
        <View style={styles.webLogoutRoot}>
          <WebView
            source={{ uri: 'https://walam.app/logout.php' }}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            onShouldStartLoadWithRequest={(req) => {
              const raw = String(req?.url || '').trim();
              if (!raw || raw.startsWith('about:blank')) return true;
              try {
                const u = new URL(raw);
                return u.protocol === 'https:' && (u.host === 'walam.app' || u.host === 'www.walam.app' || u.host.endsWith('.facebook.com') || u.host === 'facebook.com');
              } catch {
                return false;
              }
            }}
            onLoadEnd={(e) => {
              const u = String(e.nativeEvent.url || '');
              if (u.includes('/index.php') || u.includes('/facebook-login.php') || u.includes('/logout.php')) {
                finishAppLogout().catch(() => {});
              }
            }}
            onError={() => {
              finishAppLogout().catch(() => {});
            }}
          />
          <View style={styles.webLogoutOverlay} pointerEvents="none">
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.webLogoutText}>{t('loading')}</Text>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fullPageCard: { minHeight: 640 },
  headerRow: { minHeight: 38, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingBottom: 8, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  name: { color: colors.text, fontWeight: '800', textAlign: 'right', flex: 1 },
  infoRow: { minHeight: 40, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border },
  infoLabel: { color: colors.muted, fontWeight: '700', textAlign: 'right' },
  infoValue: { color: colors.text, fontWeight: '700', textAlign: 'left', flexShrink: 1, paddingVertical: 8 },
  statusRow: { minHeight: 44, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  statusLabel: { color: colors.muted, fontWeight: '700', textAlign: 'right', marginLeft: 'auto' },
  statusText: { color: colors.text, fontWeight: '800', textAlign: 'left', flexShrink: 1, paddingVertical: 8 },
  helpHeader: { minHeight: 38, flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingBottom: 8, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  subPageHeader: { minHeight: 44, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingBottom: 8, marginBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  backIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(124,92,252,0.45)',
    backgroundColor: 'rgba(124,92,252,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7C5CFC',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  helpTitle: { color: colors.text, fontWeight: '900', textAlign: 'right', flex: 1 },
  helpList: { gap: 8, paddingVertical: 6 },
  helpItem: { color: colors.muted, fontWeight: '700', textAlign: 'right', lineHeight: 20 },
  guideCard: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: 10, gap: 3 },
  guideTitle: { color: colors.text, fontWeight: '900', textAlign: 'right', marginBottom: 2 },
  langTitle: { color: colors.text, fontWeight: '900', textAlign: 'right', marginBottom: 8 },
  langRow: { flexDirection: 'row-reverse', gap: 8 },
  langBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row-reverse',
    gap: 6,
  },
  langBtnActive: { borderColor: colors.primary, backgroundColor: 'rgba(124,92,252,0.2)' },
  langFlag: { fontSize: 16 },
  kurdFlag: {
    width: 24,
    height: 16,
    borderRadius: 2,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#d1d5db',
    position: 'relative'
  },
  kurdStripe: { flex: 1 },
  kurdSun: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 5,
    height: 5,
    marginLeft: -2.5,
    marginTop: -2.5,
    borderRadius: 999,
    backgroundColor: '#f59e0b'
  },
  langText: { color: colors.text, fontWeight: '800' },
  helpLinkBtn: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 12,
  },
  helpIconWrap: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  helpIconWebsite: { backgroundColor: 'rgba(91,141,239,0.14)', borderColor: 'rgba(91,141,239,0.35)' },
  helpIconAbout: { backgroundColor: 'rgba(124,92,252,0.14)', borderColor: 'rgba(124,92,252,0.35)' },
  helpIconLive: { backgroundColor: 'rgba(0,212,170,0.14)', borderColor: 'rgba(0,212,170,0.35)' },
  helpIconWhats: { backgroundColor: 'rgba(0,212,170,0.2)', borderColor: 'rgba(0,212,170,0.45)' },
  helpLinkText: { color: colors.text, fontWeight: '800', flex: 1, textAlign: 'right', marginRight: 10 },
  planList: { gap: 8, marginTop: 2, marginBottom: 4 },
  referralCard: { marginBottom: 4 },
  refHeadRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 10 },
  refBadge: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(124,92,252,0.25)', borderWidth: 1, borderColor: 'rgba(124,92,252,0.55)', alignItems: 'center', justifyContent: 'center' },
  refBadgeText: { color: '#fff', fontWeight: '900' },
  refTitle: { color: colors.text, fontWeight: '900', textAlign: 'right', flex: 1, fontSize: 15 },
  refMeta: { color: colors.muted, fontWeight: '700', textAlign: 'right', marginBottom: 4, fontSize: 12 },
  refGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  refStatCard: {
    width: '48%',
    minHeight: 76,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'center'
  },
  refStatLabel: { color: colors.muted, fontSize: 11, fontWeight: '700', textAlign: 'right' },
  refStatValue: { color: colors.text, fontSize: 16, fontWeight: '900', textAlign: 'right', marginTop: 4 },
  refMetaRow: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  refMetaChip: { color: colors.text, backgroundColor: 'rgba(91,141,239,0.2)', borderWidth: 1, borderColor: 'rgba(91,141,239,0.45)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, fontSize: 11, fontWeight: '800' },
  refLabel: { color: colors.muted, fontWeight: '700', textAlign: 'right', marginBottom: 6, fontSize: 12 },
  refInput: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    color: colors.text,
    paddingHorizontal: 12,
    fontWeight: '700',
    textAlign: 'left'
  },
  copyBtn: {
    marginTop: 8,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(124,92,252,0.45)',
    backgroundColor: 'rgba(124,92,252,0.22)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  copyBtnText: { color: '#fff', fontWeight: '800' },
  planItem: { minHeight: 156, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center' },
  planMonthly: { borderColor: 'rgba(0,212,170,0.35)', backgroundColor: 'rgba(0,212,170,0.08)' },
  planQuarterly: { borderColor: 'rgba(91,141,239,0.4)', backgroundColor: 'rgba(91,141,239,0.1)' },
  planYearly: { borderColor: 'rgba(255,165,2,0.42)', backgroundColor: 'rgba(255,165,2,0.1)' },
  planTopRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  planBadge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, fontSize: 10, fontWeight: '900', marginBottom: 2 },
  planBadgeMonthly: { backgroundColor: 'rgba(0,212,170,0.16)', color: '#00D4AA' },
  planBadgeQuarterly: { backgroundColor: 'rgba(91,141,239,0.18)', color: '#5B8DEF' },
  planBadgeYearly: { backgroundColor: 'rgba(255,165,2,0.18)', color: '#FFA502' },
  planName: { color: colors.text, textAlign: 'right', fontWeight: '900', fontSize: 14 },
  planPrice: { color: '#FFFFFF', textAlign: 'right', fontWeight: '900', marginTop: 2, marginBottom: 6, fontSize: 15 },
  planFeatures: { gap: 4, marginBottom: 8 },
  planFeature: { color: colors.muted, textAlign: 'right', fontWeight: '700', fontSize: 12, lineHeight: 17 },
  planCtaRow: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', marginTop: 4, paddingTop: 7 },
  planCtaText: { color: colors.text, textAlign: 'right', fontWeight: '800', fontSize: 11 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(2,6,23,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modalCard: { width: '100%', maxWidth: 430, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbeafe', padding: 10 },
  liveModalCard: {
    width: '100%',
    maxWidth: 430,
    height: '88%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#eef2ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  liveKeyboardWrap: { width: '100%', maxWidth: 430, height: '88%' },
  liveTopBar: {
    minHeight: 58,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#dbeafe',
    backgroundColor: '#ffffff',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  liveTopLogo: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#cbd5e1' },
  liveTopTitle: { color: colors.text, fontWeight: '900', textAlign: 'right' },
  liveTopSub: { color: colors.success, fontSize: 11, fontWeight: '700', textAlign: 'right' },
  liveTopClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  liveTopCloseText: { color: colors.muted, fontWeight: '900', fontSize: 14 },
  liveThread: { flex: 1, paddingHorizontal: 10, paddingTop: 10 },
  closeBtn: { marginTop: 8, minHeight: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' },
  closeBtnText: { color: colors.text, fontWeight: '800' },
  liveMsg: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, maxWidth: '82%' },
  liveRow: { flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 8 },
  liveRowMine: { justifyContent: 'flex-start' },
  liveRowOther: { justifyContent: 'flex-start' },
  liveAvatarUser: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#dbeafe',
    borderWidth: 1,
    borderColor: '#93c5fd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveAvatarInitial: { color: colors.text, fontWeight: '900', fontSize: 12 },
  liveAvatarLogo: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
  },
  liveMine: { alignSelf: 'flex-end', backgroundColor: '#0084ff', borderColor: '#0084ff' },
  liveOther: { alignSelf: 'flex-start', backgroundColor: '#ffffff', borderColor: '#e2e8f0' },
  liveName: { color: colors.muted, fontSize: 11, fontWeight: '800', marginBottom: 2, textAlign: 'right' },
  liveText: { color: colors.text, fontWeight: '700', textAlign: 'right' },
  liveTextMine: { color: '#ffffff' },
  liveComposer: {
    borderTopWidth: 1,
    borderTopColor: '#dbeafe',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  liveInputBox: { flex: 1, minHeight: 40, maxHeight: 90, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, paddingHorizontal: 12, paddingVertical: 8, color: colors.text, fontWeight: '700', textAlignVertical: 'top' },
  liveSendBtn: { minHeight: 40, minWidth: 66, borderRadius: 20, backgroundColor: '#0084ff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  liveSendText: { color: '#fff', fontWeight: '800' },
  logout: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,71,87,0.45)',
    backgroundColor: 'rgba(255,71,87,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row-reverse',
    gap: 9,
    shadowColor: '#FF4757',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  logoutText: { color: '#fff', fontWeight: '900', letterSpacing: 0.2 },
  deleteAccount: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,71,87,0.42)',
    backgroundColor: 'rgba(255,71,87,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row-reverse',
    gap: 9,
  },
  deleteText: { color: '#FF8A95', fontWeight: '900', letterSpacing: 0.2 },
  disabledBtn: { opacity: 0.65 },
  webLogoutRoot: { flex: 1, backgroundColor: colors.background },
  webLogoutOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  webLogoutText: { marginTop: 8, color: colors.muted, fontWeight: '700' },
});
