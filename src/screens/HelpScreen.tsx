import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Bot, ChevronDown, MessageCircle, Plus, Trash2 } from 'lucide-react-native';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { colors, spacing } from '../theme';
import { playRefreshSound } from '../utils/refresh';
import { api } from '../api/client';
import type { Automation, Page } from '../api/types';
import { useAuth } from '../state/AuthContext';
import { useLanguage } from '../state/LanguageContext';

type FlowButton = { id: string; key?: string; label: string; reply: string };
type StepItem = { id: string; label: string; reply: string };
type ChatLine = { id: string; from: 'user' | 'bot'; text: string };

const MAX_FLOW_BUTTONS = 15;
const MAX_STEP_LABELS = 5;

type ChatFlowPayload = {
  page_id: string;
  is_active: number;
  welcome_text: string;
  welcome_cooldown_hours: string;
  label_price: string;
  label_location?: string;
  label_more?: string;
  label_contact?: string;
  label_custom_replies_json: string;
  label_dynamic_options_json: string;
};

export function HelpScreen() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [flowEnabled, setFlowEnabled] = useState(true);
  const [welcomeEnabled, setWelcomeEnabled] = useState(true);
  const [welcomeText, setWelcomeText] = useState('');

  const [buttonsOpen, setButtonsOpen] = useState(true);
  const [buttons, setButtons] = useState<FlowButton[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [newReply, setNewReply] = useState('');

  const [stepOpen, setStepOpen] = useState(true);
  const [stepRootLabel, setStepRootLabel] = useState('');
  const [stepRootKey, setStepRootKey] = useState('label_price');
  const [stepItemsByRoot, setStepItemsByRoot] = useState<Record<string, StepItem[]>>({});

  const [pages, setPages] = useState<Page[]>([]);
  const [selectedPageId, setSelectedPageId] = useState('');
  const [showPagePicker, setShowPagePicker] = useState(false);
  const [brokenPageImages, setBrokenPageImages] = useState<Record<string, number>>({});

  const [previewOpen, setPreviewOpen] = useState(true);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [chatLines, setChatLines] = useState<ChatLine[]>([]);
  const [stepPreviewMode, setStepPreviewMode] = useState(false);
  const [previewStepKey, setPreviewStepKey] = useState('');
  const [loadingFlow, setLoadingFlow] = useState(false);
  const [savingFlow, setSavingFlow] = useState(false);
  const [flowCustomRepliesRaw, setFlowCustomRepliesRaw] = useState<Record<string, string>>({});
  const [flowDynamicOptionsRaw, setFlowDynamicOptionsRaw] = useState<Record<string, Array<{ label: string; reply: string }>>>({});

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const pagesRes = await api.request<{ pages?: Page[] }>('pages', { debug: 1 });
        let list = Array.isArray(pagesRes.pages) ? pagesRes.pages : [];
        if (!list.length) {
          const meRes = await api.request<{ pages?: Page[] }>('me');
          list = Array.isArray(meRes.pages) ? meRes.pages : [];
        }
        if (!list.length) {
          const autoRes = await api.request<{ automations?: Automation[] }>('automations');
          const map: Record<string, Page> = {};
          for (const row of autoRes.automations ?? []) {
            const pid = (row.page_id ?? '').trim();
            if (!pid) continue;
            map[pid] = { id: pid, name: `Page ${pid}`, has_token: true, platform: 'facebook' };
          }
          list = Object.values(map);
        }
        if (!mounted) return;
        setPages(list);
      } catch {
        if (!mounted) return;
        setPages([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [selectedPageId]);

  async function handlePullRefresh() {
    setRefreshing(true);
    await playRefreshSound();
    if (selectedPageId) {
      await loadChatFlow(selectedPageId);
    }
    setRefreshing(false);
  }

  function parseFlowFromApi(flow?: Partial<ChatFlowPayload> | null) {
    const source = flow ?? {};
    const active = Number(source.is_active ?? 0) === 1;
    const wText = String(source.welcome_text ?? '');
    const rootLabel = String(source.label_price ?? '').trim() || 'نرخ';
    let customRepliesRaw: unknown = {};
    let dynamicOptions: Record<string, Array<{ label: string; reply: string }>> = {};
    try {
      customRepliesRaw = JSON.parse(String(source.label_custom_replies_json ?? '{}')) ?? {};
    } catch {
      customRepliesRaw = {};
    }
    try {
      dynamicOptions = JSON.parse(String(source.label_dynamic_options_json ?? '{}')) ?? {};
    } catch {
      dynamicOptions = {};
    }
    const keyToLabel: Record<string, string> = {
      label_price: String(source.label_price ?? '').trim() || 'نرخ',
      label_location: String(source.label_location ?? '').trim() || 'شوێن',
      label_more: String(source.label_more ?? '').trim(),
      label_contact: String(source.label_contact ?? '').trim(),
    };

    const customReplies: Record<string, string> = {};
    if (Array.isArray(customRepliesRaw)) {
      customRepliesRaw.forEach((row) => {
        const optionKey = String((row as any)?.option_key ?? '').trim();
        const reply = String((row as any)?.reply ?? '').trim();
        if (optionKey && reply) customReplies[optionKey] = reply;
      });
    } else if (customRepliesRaw && typeof customRepliesRaw === 'object') {
      Object.entries(customRepliesRaw as Record<string, unknown>).forEach(([k, v]) => {
        const reply = String(v ?? '').trim();
        if (k.trim() && reply) customReplies[k.trim()] = reply;
      });
    }
    const normalizedReplies: Record<string, string> = {};
    const aliasToKey: Record<string, string> = {
      [keyToLabel.label_price]: 'label_price',
      [keyToLabel.label_location]: 'label_location',
      [keyToLabel.label_more]: 'label_more',
      [keyToLabel.label_contact]: 'label_contact',
      'نرخەکان': 'label_price',
      'وەڵام ئەپ چیە': 'label_location',
      'پەیوەندی': 'label_more',
      'فێرکاری': 'label_contact',
    };
    Object.entries(customReplies).forEach(([k, v]) => {
      const key = k.trim();
      const mapped = key.startsWith('label_') ? key : (aliasToKey[key] || key);
      normalizedReplies[mapped] = v;
    });

    const extraButtons = Object.entries(normalizedReplies)
      .map(([label, reply], i) => ({
        id: `b_${Date.now()}_${i}`,
        key: String(label ?? '').trim(),
        label:
          keyToLabel[String(label ?? '').trim()]
          || (String(label ?? '').startsWith('custom_') ? `دوگمەی زیادکراو ${i + 1}` : String(label ?? '').trim())
          || 'دوگمە',
        reply: String(reply ?? '').trim(),
      }))
      .filter((x) => x.label);
    const mainButtons = extraButtons.slice(0, MAX_FLOW_BUTTONS);
    const buttonKeys = Object.keys(normalizedReplies);
    const detectedKey =
      buttonKeys.find((k) => Array.isArray((dynamicOptions as Record<string, unknown[]>)[k]) && ((dynamicOptions as Record<string, unknown[]>)[k] || []).length > 0)
      || 'label_price';
    const stepList = Array.isArray((dynamicOptions as Record<string, unknown[]>)[detectedKey])
      ? (((dynamicOptions as Record<string, Array<{ label?: string; reply?: string }>>)[detectedKey]) || [])
      : [];
    const steps = stepList
      .map((item, i) => ({
        id: `s_${Date.now()}_${i}`,
        label: String(item?.label ?? '').trim(),
        reply: String(item?.reply ?? '').trim(),
      }))
      .filter((x) => x.label && x.reply)
      .slice(0, MAX_STEP_LABELS);
    const nextStepMap: Record<string, StepItem[]> = {};
    Object.entries(dynamicOptions).forEach(([k, rows]) => {
      if (!Array.isArray(rows)) return;
      nextStepMap[k] = rows
        .map((item, i) => ({
          id: `s_${k}_${Date.now()}_${i}`,
          label: String(item?.label ?? '').trim(),
          reply: String(item?.reply ?? '').trim(),
        }))
        .filter((x) => x.label && x.reply)
        .slice(0, MAX_STEP_LABELS);
    });
    if (!nextStepMap[detectedKey]) {
      nextStepMap[detectedKey] = steps;
    }

    setFlowEnabled(active);
    setWelcomeEnabled(wText.trim().length > 0);
    setWelcomeText(wText);
    setStepRootKey(detectedKey);
    setStepRootLabel(keyToLabel[detectedKey] || rootLabel);
    setButtons(mainButtons);
    setStepItemsByRoot(nextStepMap);
    setFlowCustomRepliesRaw(normalizedReplies);
    setFlowDynamicOptionsRaw(dynamicOptions);
  }

  async function loadChatFlow(pageId: string) {
    if (!pageId) return;
    setLoadingFlow(true);
    try {
      const res = await api.request<{ chat_flow?: ChatFlowPayload }>('get_chat_flow', { page_id: pageId });
      parseFlowFromApi(res.chat_flow ?? null);
    } catch {
      parseFlowFromApi(null);
    } finally {
      setLoadingFlow(false);
    }
  }

  async function saveChatFlow() {
    if (!selectedPageId || savingFlow) return;
    setSavingFlow(true);
    try {
      const customReplies: Record<string, string> = { ...(flowCustomRepliesRaw || {}) };
      const savedKeyByOriginal: Record<string, string> = {};
      const activeKeys = new Set<string>();
      buttons.forEach((b) => {
        const originalKey = (b.key ?? '').trim();
        const fallbackLabel = b.label.trim();
        const normalizedCustom = originalKey.startsWith('custom_') ? fallbackLabel : '';
        const saveKey = (originalKey && !originalKey.startsWith('custom_')) ? originalKey : normalizedCustom || fallbackLabel;
        if (!saveKey) return;
        if (originalKey) savedKeyByOriginal[originalKey] = saveKey;
        activeKeys.add(saveKey);
      });
      Object.keys(customReplies).forEach((k) => {
        if (!activeKeys.has(k)) delete customReplies[k];
      });
      buttons
        .filter((b) => b.label.trim())
        .slice(0, MAX_FLOW_BUTTONS)
        .forEach((b) => {
          const k = (b.key ?? '').trim();
          const saveKey = (k && !k.startsWith('custom_')) ? k : (savedKeyByOriginal[k] || b.label.trim());
          if (!saveKey) return;
          const nextReply = b.reply.trim();
          if (nextReply) customReplies[saveKey] = nextReply;
          else delete customReplies[saveKey];
        });
      const stepOptions = currentStepItems
        .filter((s) => s.label.trim() && s.reply.trim())
        .slice(0, MAX_STEP_LABELS)
        .map((s) => ({ label: s.label.trim(), reply: s.reply.trim() }));
      const dynamicOptions: Record<string, Array<{ label: string; reply: string }>> = {};
      const activeButtonKeys = new Set(
        buttons
          .map((b) => {
            const k = (b.key || '').trim();
            if (!k) return '';
            return savedKeyByOriginal[k] || k;
          })
          .filter((k) => k !== '')
      );
      Object.entries(stepItemsByRoot).forEach(([k, rows]) => {
        const mappedKey = savedKeyByOriginal[k] || k;
        if (!activeButtonKeys.has(k) && !k.startsWith('label_')) return;
        const list = (rows || [])
          .filter((s) => s.label.trim() && s.reply.trim())
          .slice(0, MAX_STEP_LABELS)
          .map((s) => ({ label: s.label.trim(), reply: s.reply.trim() }));
        if (list.length) dynamicOptions[mappedKey] = list;
      });
      const rootButton = buttons.find((b) => (b.key || '').trim() === (stepRootKey || '').trim());
      const normalizedStepRootKey = (stepRootKey || '').startsWith('label_') ? (stepRootKey || 'label_price') : 'label_price';
      if (stepOptions.length > 0) {
        dynamicOptions[normalizedStepRootKey] = stepOptions;
      } else {
        delete dynamicOptions[normalizedStepRootKey];
      }
      Object.keys(dynamicOptions).forEach((k) => {
        if (!activeButtonKeys.has(k) && !k.startsWith('label_')) {
          delete dynamicOptions[k];
        }
      });
      // Do not auto-create any default/root button reply. Save only user-created buttons.
      const labelByKey: Record<string, string> = {};
      buttons.forEach((b) => {
        const k = (b.key || '').trim();
        if (k.startsWith('label_') && b.label.trim()) {
          labelByKey[k] = b.label.trim();
        }
      });
      await api.request('save_chat_flow', {
        page_id: selectedPageId,
        is_active: flowEnabled ? 1 : 0,
        welcome_text: welcomeEnabled ? welcomeText.trim() : '',
        welcome_cooldown_hours: 24,
        label_price: (labelByKey.label_price || 'نرخ').trim(),
        label_location: (labelByKey.label_location || 'شوێن').trim(),
        label_more: (labelByKey.label_more || '').trim(),
        label_contact: (labelByKey.label_contact || '').trim(),
        label_custom_replies_json: JSON.stringify(customReplies),
        label_dynamic_options_json: JSON.stringify(dynamicOptions),
      });
      Alert.alert(t('save'), t('save_chat_flow'));
      await loadChatFlow(selectedPageId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'save_failed';
      Alert.alert(t('error'), msg);
    } finally {
      setSavingFlow(false);
    }
  }

  useEffect(() => {
    if (!selectedPageId) return;
    loadChatFlow(selectedPageId);
  }, [selectedPageId]);

  const selectedPageName = useMemo(() => pages.find((p) => p.id === selectedPageId)?.name || t('select_page'), [pages, selectedPageId, t]);
  const selectedPage = useMemo(() => pages.find((p) => p.id === selectedPageId) || null, [pages, selectedPageId]);
  const isAccountBlocked = (user?.is_active ?? true) === false;
  const isSelectedPageRestricted = !!selectedPage?.restricted;
  const selectedPageRestrictionReason = (selectedPage?.restriction_reason ?? '').trim();
  const canEditFlow = !!selectedPageId && !isAccountBlocked && !isSelectedPageRestricted;
  const currentStepItems = useMemo(() => stepItemsByRoot[stepRootKey] || [], [stepItemsByRoot, stepRootKey]);
  const canAdd = useMemo(() => canEditFlow && !!newLabel.trim() && !!newReply.trim() && buttons.length < MAX_FLOW_BUTTONS, [canEditFlow, newLabel, newReply, buttons.length]);

  function getPageAvatarCandidates(page?: Page | null) {
    if (!page) return [];
    const graphUrl = `https://graph.facebook.com/${encodeURIComponent(page.id)}/picture?type=small&width=96&height=96`;
    return [page.picture ?? '', graphUrl].filter(Boolean);
  }

  function addButtonRule() {
    if (!canAdd) return;
    const id = `b_${Date.now()}`;
    setButtons((cur) => [...cur, { id, key: `custom_${id}`, label: newLabel.trim(), reply: newReply.trim() }]);
    setNewLabel('');
    setNewReply('');
  }

  function removeButtonRule(id: string) {
    setButtons((cur) => {
      const target = cur.find((b) => b.id === id);
      const next = cur.filter((b) => b.id !== id);
      const removedKey = (target?.key || '').trim();
      if (removedKey) {
        setStepItemsByRoot((prev) => {
          const clone = { ...prev };
          delete clone[removedKey];
          return clone;
        });
        if (removedKey === stepRootKey) {
          const fallback = next[0];
          if (fallback) {
            setStepRootKey((fallback.key || '').trim() || 'label_price');
            setStepRootLabel(fallback.label);
          } else {
            setStepRootKey('label_price');
            setStepRootLabel(t('button_name'));
          }
        }
      }
      return next;
    });
  }

  function removeStepItem(id: string) {
    setStepItemsByRoot((cur) => ({
      ...cur,
      [stepRootKey]: (cur[stepRootKey] || []).filter((s) => s.id !== id),
    }));
  }

  function addStepItemField() {
    if (currentStepItems.length >= MAX_STEP_LABELS) return;
    setStepItemsByRoot((cur) => ({
      ...cur,
      [stepRootKey]: [...(cur[stepRootKey] || []), { id: `s_${Date.now()}`, label: '', reply: '' }],
    }));
  }

  function updateStepItem(id: string, patch: Partial<StepItem>) {
    setStepItemsByRoot((cur) => ({
      ...cur,
      [stepRootKey]: (cur[stepRootKey] || []).map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  }

  function openInteractivePreview() {
    const start = welcomeEnabled ? [{ id: `w_${Date.now()}`, from: 'bot' as const, text: welcomeText || t('welcome_message') }] : [];
    setChatLines(start);
    setStepPreviewMode(false);
    setPreviewStepKey('');
    setPreviewModalOpen(true);
  }

  function onTapFlowButton(btn: FlowButton) {
    setChatLines((cur) => [...cur, { id: `u_${Date.now()}`, from: 'user', text: btn.label }]);
    setTimeout(() => {
      if (btn.reply.trim()) {
        setChatLines((cur) => [...cur, { id: `r_${Date.now()}`, from: 'bot', text: btn.reply }]);
      }
      const key = (btn.key || '').trim();
      const steps = key ? (stepItemsByRoot[key] || []) : [];
      if (steps.length > 0) {
        setPreviewStepKey(key);
        setStepPreviewMode(true);
      } else {
        setPreviewStepKey('');
        setStepPreviewMode(false);
      }
    }, 280);
  }

  function onTapStepRoot() {
    const rootReply = buttons.find((b) => (b.key || '') === stepRootKey)?.reply;
    setChatLines((cur) => [
      ...cur,
      { id: `sr_u_${Date.now()}`, from: 'user', text: stepRootLabel || t('button_name') },
      { id: `sr_b_${Date.now()}`, from: 'bot', text: t('select_page_first_for_posts') }
    ]);
    setStepPreviewMode(true);
  }

  function onTapStepItem(item: StepItem) {
    setChatLines((cur) => [
      ...cur,
      { id: `si_u_${Date.now()}`, from: 'user', text: item.label },
      { id: `si_b_${Date.now()}`, from: 'bot', text: item.reply }
    ]);
    setTimeout(() => {
      setPreviewStepKey('');
      setStepPreviewMode(false);
    }, 180);
  }

  return (
    <Screen title={t('chat_flow')} subtitle={t('chat_flow_subtitle')} onRefresh={handlePullRefresh} refreshing={refreshing}>
      <Card>
        <View style={styles.topRow}>
          <View style={styles.titleWrap}>
            <Text style={styles.title}>{t('messenger_chat_flow_title')}</Text>
            <Text style={styles.sub}>{t('messenger_chat_flow_sub')}</Text>
          </View>
          <Bot size={20} color={colors.primaryDark} />
        </View>
        <Text style={styles.pageTitle}>{t('page_selection')}</Text>
        <Pressable style={styles.pageSelect} onPress={() => setShowPagePicker(true)}>
          <ChevronDown size={16} color={colors.muted} />
          {selectedPage ? (
            (() => {
              const candidates = getPageAvatarCandidates(selectedPage);
              const failCount = brokenPageImages[selectedPage.id] ?? 0;
              const uri = candidates[failCount] ?? '';
              return uri ? (
                <Image
                  source={{ uri }}
                  style={styles.pageAvatar}
                  onError={() => setBrokenPageImages((cur) => ({ ...cur, [selectedPage.id]: Math.min((cur[selectedPage.id] ?? 0) + 1, candidates.length) }))}
                />
              ) : (
                <View style={styles.pageAvatarFallback}><Text style={styles.pageAvatarFallbackText}>{(selectedPage.name || 'P').slice(0, 1)}</Text></View>
              );
            })()
          ) : null}
          <Text style={styles.pageSelectText} numberOfLines={1}>{selectedPageName}</Text>
        </Pressable>
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
        <View style={styles.switchRow}>
          <Switch value={flowEnabled} onValueChange={setFlowEnabled} disabled={!canEditFlow} thumbColor={flowEnabled ? colors.primary : '#fff'} trackColor={{ true: '#b7eaeb', false: '#d0d5dd' }} />
          <Text style={styles.switchText}>{flowEnabled ? t('active') : t('inactive')}</Text>
        </View>
        <Pressable style={[styles.saveBtn, (savingFlow || loadingFlow || !canEditFlow) ? styles.addBtnDisabled : null]} onPress={saveChatFlow} disabled={savingFlow || loadingFlow || !canEditFlow}>
          <Text style={styles.saveBtnText}>{savingFlow ? t('saving') : (loadingFlow ? t('loading') : t('save'))}</Text>
        </Pressable>
      </Card>

      <Card>
        <Text style={styles.sectionLabel}>{t('welcome_message')}</Text>
        <View style={styles.switchRow}>
          <Switch value={welcomeEnabled} onValueChange={setWelcomeEnabled} disabled={!canEditFlow} thumbColor={welcomeEnabled ? colors.primary : '#fff'} trackColor={{ true: '#b7eaeb', false: '#d0d5dd' }} />
          <Text style={styles.switchText}>{welcomeEnabled ? t('active') : t('inactive')}</Text>
        </View>
        <TextInput style={[styles.input, styles.replyInput, (!welcomeEnabled || !canEditFlow) ? styles.disabledInput : null]} placeholder={t('welcome_placeholder')} placeholderTextColor={colors.muted} value={welcomeText} onChangeText={setWelcomeText} editable={welcomeEnabled && canEditFlow} multiline textAlign="right" />
      </Card>

      <Card>
        <Pressable style={styles.sectionHead} onPress={() => setPreviewOpen((v) => !v)}>
          <ChevronDown size={18} color={colors.primaryDark} style={previewOpen ? styles.chevOpen : styles.chevClosed} />
          <Text style={styles.sectionTitle}>{t('chat_preview')}</Text>
        </Pressable>
        {previewOpen ? (
          <Pressable style={styles.openPreviewBtn} onPress={openInteractivePreview}>
            <Text style={styles.openPreviewBtnText}>{t('preview')}</Text>
          </Pressable>
        ) : null}
      </Card>

      <Card>
        <Pressable style={styles.sectionHead} onPress={() => setButtonsOpen((v) => !v)}>
          <ChevronDown size={18} color={colors.primaryDark} style={buttonsOpen ? styles.chevOpen : styles.chevClosed} />
          <Text style={styles.sectionTitle}>{t('button_setup')}</Text>
        </Pressable>
        {buttonsOpen ? (
          <>
            <TextInput style={styles.input} placeholder={t('button_name')} placeholderTextColor={colors.muted} value={newLabel} onChangeText={setNewLabel} textAlign="right" />
            <TextInput style={[styles.input, styles.replyInput]} placeholder={t('button_reply')} placeholderTextColor={colors.muted} value={newReply} onChangeText={setNewReply} multiline textAlign="right" />
            <Pressable style={[styles.addBtn, !canAdd ? styles.addBtnDisabled : null]} onPress={addButtonRule} disabled={!canAdd}>
              <Plus size={16} color="#fff" />
              <Text style={styles.addBtnText}>{t('add_button_label')}</Text>
            </Pressable>
            <Text style={styles.limit}>{t('limit')}: {buttons.length}/{MAX_FLOW_BUTTONS}</Text>
            <View style={styles.rulesWrap}>
              {buttons.map((b) => (
                <View key={b.id} style={styles.ruleCard}>
                  <View style={styles.ruleHead}>
                    <Pressable style={[styles.deleteBtn, !canEditFlow ? styles.addBtnDisabled : null]} onPress={() => removeButtonRule(b.id)} disabled={!canEditFlow}><Trash2 size={14} color="#be123c" /></Pressable>
                    <View style={styles.ruleTag}><Text style={styles.ruleTagText}>{b.label}</Text></View>
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder={t('button_name')}
                    placeholderTextColor={colors.muted}
                    value={b.label}
                    onChangeText={(text) => setButtons((cur) => cur.map((x) => (x.id === b.id ? { ...x, label: text } : x)))}
                    editable={canEditFlow}
                    textAlign="right"
                  />
                  <TextInput
                    style={[styles.input, styles.replyInput]}
                    placeholder={t('button_reply')}
                    placeholderTextColor={colors.muted}
                    value={b.reply}
                    onChangeText={(text) => setButtons((cur) => cur.map((x) => (x.id === b.id ? { ...x, reply: text } : x)))}
                    editable={canEditFlow}
                    multiline
                    textAlign="right"
                  />
                  <View style={styles.replyBubble}><MessageCircle size={14} color="#0f766e" /><Text style={styles.replyText}>{b.reply}</Text></View>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </Card>

      <Card>
        <Pressable style={styles.sectionHead} onPress={() => setStepOpen((v) => !v)}>
          <ChevronDown size={18} color={colors.primaryDark} style={stepOpen ? styles.chevOpen : styles.chevClosed} />
          <Text style={styles.sectionTitle}>{t('step_by_step_buttons')}</Text>
        </Pressable>
        {stepOpen ? (
          <>
            <Text style={styles.subSectionLabel}>{t('link_step_to_main')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stepRootRow}>
              {buttons.filter((b) => b.reply.trim() !== '').map((b) => {
                const active = (b.key || '') === stepRootKey;
                return (
                  <Pressable
                    key={`root_${b.id}`}
                    style={[styles.stepRootChip, active ? styles.stepRootChipActive : null]}
                    onPress={() => {
                      const k = (b.key || '').trim();
                      if (!k) return;
                      setStepRootKey(k);
                      setStepRootLabel(b.label);
                    }}
                    disabled={!canEditFlow}
                  >
                    <Text style={[styles.stepRootChipText, active ? styles.stepRootChipTextActive : null]}>{b.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <TextInput
              style={[styles.input, styles.disabledInput]}
              placeholder={t('main_button_name')}
              placeholderTextColor={colors.muted}
              value={stepRootLabel}
              editable={false}
              selectTextOnFocus={false}
              textAlign="right"
            />
            <View style={styles.subSectionHead}>
              <Pressable style={[styles.addMiniBtn, (currentStepItems.length >= MAX_STEP_LABELS || !canEditFlow) ? styles.addBtnDisabled : null]} onPress={addStepItemField} disabled={currentStepItems.length >= MAX_STEP_LABELS || !canEditFlow}>
                <Plus size={14} color="#fff" />
              </Pressable>
              <Text style={styles.subSectionLabel}>{t('add_sub_button')}</Text>
            </View>
            <Text style={styles.limit}>{t('limit')}: {currentStepItems.length}/{MAX_STEP_LABELS}</Text>
            <View style={styles.rulesWrap}>
              {currentStepItems.map((s) => (
                <View key={s.id} style={styles.ruleCard}>
                  <View style={styles.ruleHead}>
                    <Pressable style={[styles.deleteBtn, !canEditFlow ? styles.addBtnDisabled : null]} onPress={() => removeStepItem(s.id)} disabled={!canEditFlow}><Trash2 size={14} color="#be123c" /></Pressable>
                    <View style={styles.ruleTag}><Text style={styles.ruleTagText}>{s.label || 'Label'}</Text></View>
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder={t('sub_button_name')}
                    placeholderTextColor={colors.muted}
                    value={s.label}
                    onChangeText={(text) => updateStepItem(s.id, { label: text })}
                    editable={canEditFlow}
                    textAlign="right"
                  />
                  <TextInput
                    style={[styles.input, styles.replyInput]}
                    placeholder={t('sub_button_reply')}
                    placeholderTextColor={colors.muted}
                    value={s.reply}
                    onChangeText={(text) => updateStepItem(s.id, { reply: text })}
                    editable={canEditFlow}
                    multiline
                    textAlign="right"
                  />
                  <View style={styles.replyBubble}><MessageCircle size={14} color="#0f766e" /><Text style={styles.replyText}>{s.reply || '...'}</Text></View>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </Card>

      <Card>
        <Pressable
          style={[styles.saveBtn, styles.saveBtnBottom, (savingFlow || loadingFlow || !selectedPageId) ? styles.addBtnDisabled : null]}
          onPress={saveChatFlow}
          disabled={savingFlow || loadingFlow || !canEditFlow}
        >
          <Text style={styles.saveBtnText}>{savingFlow ? t('saving') : (loadingFlow ? t('loading') : t('save_chat_flow'))}</Text>
        </Pressable>
      </Card>

      <Modal visible={previewModalOpen} transparent animationType="fade" onRequestClose={() => setPreviewModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.chatHeader}><Text style={styles.chatHeaderTitle}>{selectedPageName}</Text></View>
            <ScrollView style={styles.chatBody} contentContainerStyle={{ padding: 10, gap: 8 }}>
              {chatLines.map((line) => (
                <View key={line.id} style={[styles.chatBubble, line.from === 'user' ? styles.chatUser : styles.chatBot]}>
                  <Text style={[styles.chatBubbleText, line.from === 'user' ? styles.chatUserText : styles.chatBotText]}>{line.text}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={styles.chatActions}>
              {!stepPreviewMode
                ? buttons.filter((b) => b.label.trim() !== '').map((b) => (
                    <Pressable key={b.id} style={styles.chatActionBtn} onPress={() => onTapFlowButton(b)}>
                      <Text style={styles.chatActionBtnText}>{b.label}</Text>
                    </Pressable>
                  ))
                : null}
              {stepPreviewMode
                ? (stepItemsByRoot[previewStepKey] || []).map((s) => (
                    <Pressable key={s.id} style={[styles.chatActionBtn, { backgroundColor: '#0f766e' }]} onPress={() => onTapStepItem(s)}>
                      <Text style={styles.chatActionBtnText}>{s.label}</Text>
                    </Pressable>
                  ))
                : null}
              {stepPreviewMode ? (
                <Pressable style={[styles.chatActionBtn, { backgroundColor: '#64748b' }]} onPress={() => { setPreviewStepKey(''); setStepPreviewMode(false); }}>
                  <Text style={styles.chatActionBtnText}>{t('back')}</Text>
                </Pressable>
              ) : null}
            </View>
            <Pressable style={styles.closeBtn} onPress={() => setPreviewModalOpen(false)}><Text style={styles.closeBtnText}>{t('close')}</Text></Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={showPagePicker} transparent animationType="fade" onRequestClose={() => setShowPagePicker(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.pagePickerCard}>
            <Text style={styles.pagePickerTitle}>{t('select_page')}</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {pages.map((p) => (
                <Pressable key={p.id} style={[styles.pagePickerItem, selectedPageId === p.id ? styles.pagePickerItemActive : null]} onPress={() => { setSelectedPageId(p.id); setShowPagePicker(false); }}>
                  {(() => {
                    const candidates = getPageAvatarCandidates(p);
                    const failCount = brokenPageImages[p.id] ?? 0;
                    const uri = candidates[failCount] ?? '';
                    return uri ? (
                      <Image
                        source={{ uri }}
                        style={styles.pageAvatar}
                        onError={() => setBrokenPageImages((cur) => ({ ...cur, [p.id]: Math.min((cur[p.id] ?? 0) + 1, candidates.length) }))}
                      />
                    ) : (
                      <View style={styles.pageAvatarFallback}><Text style={styles.pageAvatarFallbackText}>{(p.name || 'P').slice(0, 1)}</Text></View>
                    );
                  })()}
                  <Text style={styles.pagePickerItemText}>{p.name || p.id}</Text>
                </Pressable>
              ))}
              {!pages.length ? <Text style={styles.empty}>{t('no_pages_available')}</Text> : null}
            </ScrollView>
            <Pressable style={styles.closeBtn} onPress={() => setShowPagePicker(false)}><Text style={styles.closeBtnText}>{t('close')}</Text></Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  titleWrap: { flex: 1, alignItems: 'flex-end' },
  title: { color: colors.text, fontWeight: '900', fontSize: 15, textAlign: 'right' },
  sub: { color: colors.muted, marginTop: 2, textAlign: 'right', fontSize: 12 },
  pageTitle: { marginTop: 10, color: colors.muted, textAlign: 'right', fontWeight: '800', fontSize: 12 },
  pageSelect: { marginTop: 8, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, paddingHorizontal: 10, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  pageSelectText: { flex: 1, color: colors.text, textAlign: 'right', fontWeight: '800', marginHorizontal: 8, lineHeight: 20, includeFontPadding: false },
  pageAvatar: { width: 28, height: 28, borderRadius: 14, marginHorizontal: 6, backgroundColor: '#1f2a44' },
  pageAvatarFallback: { width: 28, height: 28, borderRadius: 14, marginHorizontal: 6, backgroundColor: 'rgba(124,92,252,0.22)', alignItems: 'center', justifyContent: 'center' },
  pageAvatarFallbackText: { color: colors.text, fontSize: 11, fontWeight: '900' },
  blockWarn: { marginTop: 8, borderRadius: 10, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fff1f2', paddingVertical: 8, paddingHorizontal: 10 },
  blockWarnText: { color: '#9f1239', fontWeight: '900', textAlign: 'right' },
  blockWarnSub: { color: '#be123c', fontWeight: '700', textAlign: 'right', marginTop: 4, fontSize: 12 },
  switchRow: { marginTop: 10, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  switchText: { color: colors.text, fontWeight: '800' },
  saveBtn: { marginTop: 10, minHeight: 42, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  saveBtnBottom: { marginTop: 0, minHeight: 48 },
  saveBtnText: { color: '#fff', fontWeight: '900' },
  sectionLabel: { color: colors.text, fontWeight: '900', textAlign: 'right', fontSize: 13 },
  subSectionLabel: { marginTop: 10, color: colors.muted, fontWeight: '800', textAlign: 'right', fontSize: 12 },
  stepRootRow: { flexDirection: 'row-reverse', gap: 8, paddingTop: 8 },
  stepRootChip: { minHeight: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  stepRootChipActive: { borderColor: colors.primary, backgroundColor: 'rgba(124,92,252,0.18)' },
  stepRootChipText: { color: colors.muted, fontWeight: '800', fontSize: 12 },
  stepRootChipTextActive: { color: colors.text },
  subSectionHead: { marginTop: 10, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  addMiniBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  disabledInput: { opacity: 0.5 },
  sectionHead: { minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, paddingHorizontal: 10, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: colors.text, fontWeight: '900', fontSize: 13 },
  chevOpen: { transform: [{ rotate: '0deg' }] },
  chevClosed: { transform: [{ rotate: '-90deg' }] },
  input: { minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, paddingHorizontal: spacing.sm, paddingVertical: 10, color: colors.text, marginTop: 10, textAlignVertical: 'top' },
  replyInput: { minHeight: 86 },
  openPreviewBtn: { marginTop: 10, minHeight: 42, borderRadius: 12, backgroundColor: '#5B8DEF', alignItems: 'center', justifyContent: 'center' },
  openPreviewBtnText: { color: '#fff', fontWeight: '900' },
  addBtn: { marginTop: 10, minHeight: 42, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row-reverse', gap: 8 },
  addBtnDisabled: { opacity: 0.55 },
  addBtnText: { color: '#fff', fontWeight: '900' },
  limit: { color: colors.muted, textAlign: 'right', marginTop: 6, fontWeight: '700', fontSize: 12 },
  rulesWrap: { marginTop: 8, gap: 8 },
  ruleCard: { borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, padding: 8 },
  ruleHead: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  ruleTag: { minHeight: 30, borderRadius: 15, backgroundColor: 'rgba(124,92,252,0.16)', borderWidth: 1, borderColor: 'rgba(124,92,252,0.4)', paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  ruleTagText: { color: colors.text, fontWeight: '900', fontSize: 12 },
  deleteBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,71,87,0.14)', borderWidth: 1, borderColor: 'rgba(255,71,87,0.35)', alignItems: 'center', justifyContent: 'center' },
  replyBubble: { marginTop: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,212,170,0.35)', backgroundColor: 'rgba(0,212,170,0.14)', padding: 8, flexDirection: 'row-reverse', gap: 6, alignItems: 'flex-start' },
  replyText: { flex: 1, color: colors.text, textAlign: 'right', fontWeight: '700', lineHeight: 20 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modalCard: { width: '100%', maxWidth: 430, maxHeight: '88%', borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  chatHeader: { minHeight: 52, backgroundColor: colors.surfaceAlt, paddingHorizontal: 12, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
  chatHeaderTitle: { color: '#fff', fontWeight: '900', textAlign: 'right', fontSize: 14 },
  chatBody: { backgroundColor: colors.surface },
  chatBubble: { maxWidth: '82%', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  chatBot: { alignSelf: 'flex-start', backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  chatUser: { alignSelf: 'flex-end', backgroundColor: 'rgba(124,92,252,0.20)', borderWidth: 1, borderColor: 'rgba(124,92,252,0.4)' },
  chatBubbleText: { fontWeight: '700', lineHeight: 19 },
  chatBotText: { color: colors.text, textAlign: 'left' },
  chatUserText: { color: colors.text, textAlign: 'right' },
  chatActions: { padding: 10, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  chatActionBtn: { minHeight: 34, borderRadius: 17, backgroundColor: colors.primary, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  chatActionBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  closeBtn: { minHeight: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt, borderTopWidth: 1, borderTopColor: colors.border },
  closeBtnText: { color: colors.text, fontWeight: '800' },
  pagePickerCard: { width: '100%', maxWidth: 420, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 10, gap: 10 },
  pagePickerTitle: { color: colors.text, fontWeight: '900', textAlign: 'right', fontSize: 15 },
  pagePickerItem: { minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, justifyContent: 'center', alignItems: 'center', flexDirection: 'row-reverse', paddingHorizontal: 10, marginBottom: 8 },
  pagePickerItemActive: { borderColor: colors.primary, backgroundColor: 'rgba(124,92,252,0.18)' },
  pagePickerItemText: { flex: 1, color: colors.text, textAlign: 'right', fontWeight: '800', lineHeight: 20, includeFontPadding: false },
  empty: { color: colors.muted, textAlign: 'center', fontSize: 12, marginTop: 8 }
});
