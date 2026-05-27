import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Dimensions, Easing, Image, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { ChevronDown, Instagram, MessageSquareMore, Mail, RefreshCcw } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Audio, ResizeMode, Video } from 'expo-av';
import { useFocusEffect } from '@react-navigation/native';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { api } from '../api/client';
import type { Automation, Page } from '../api/types';
import { useLanguage } from '../state/LanguageContext';
import { useAuth } from '../state/AuthContext';
import { colors, spacing } from '../theme';
import { playRefreshSound } from '../utils/refresh';

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

function isInstagramPage(page: Page) {
  if (page.platform === 'instagram') return true;
  if (page.platform === 'facebook') return false;
  if ((page.source_page_id ?? '').trim() !== '') return true;
  const category = (page.category ?? '').toLowerCase();
  const name = normalizePageName(page).toLowerCase();
  return category.includes('instagram') || name.includes('instagram');
}

function isFacebookPage(page: Page) {
  if (page.platform === 'facebook') return true;
  if (page.platform === 'instagram') return false;
  return !isInstagramPage(page);
}

type PlatformKey = 'facebook' | 'instagram';
const MODAL_MAX_HEIGHT = Math.round(Dimensions.get('window').height * 0.84);
const MAX_BUTTONS = 3;
const MAX_IMAGES = 1;

function getPlatformMeta(platform: PlatformKey) {
  if (platform === 'facebook') {
    return { label: 'Facebook', short: 'f', accent: '#1877F2', soft: '#EAF2FF', border: '#B8D3FF' };
  }
  return { label: 'Instagram', short: 'IG', accent: '#E1306C', soft: '#FFF0F6', border: '#F7B6CB' };
}

function normalizeMediaUrl(url?: string | null) {
  const value = (url ?? '').trim();
  if (!value) return '';
  if (value.startsWith('http://')) return `https://${value.slice(7)}`;
  return value;
}

function parseWhatsappButton(pmButtonsJson?: string | null) {
  const raw = (pmButtonsJson ?? '').trim();
  if (!raw) return { text: '', phone: '', message: '' };
  try {
    const data = JSON.parse(raw);
    const list = Array.isArray(data) ? data : [];
    const first = list.find((b) => {
      const url = String(b?.url ?? b?.link ?? '');
      return /wa\.me|whatsapp\.com/i.test(url);
    });
    if (!first) return { text: '', phone: '', message: '' };
    const text = String(first.title ?? first.text ?? '??????').trim();
    const url = String(first.url ?? first.link ?? '').trim();
    let phone = '';
    let message = '';
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes('wa.me')) {
        phone = parsed.pathname.replace(/\//g, '').replace(/\D/g, '');
      } else {
        phone = (parsed.searchParams.get('phone') ?? '').replace(/\D/g, '');
      }
      message = decodeURIComponent(parsed.searchParams.get('text') ?? '');
    } catch {
      phone = url.replace(/^https?:\/\/(wa\.me|api\.whatsapp\.com\/send\?phone=)/i, '').replace(/\D/g, '');
      message = '';
    }
    return { text, phone, message };
  } catch {
    return { text: '', phone: '', message: '' };
  }
}

function parseFirstButton(pmButtonsJson?: string | null) {
  const raw = (pmButtonsJson ?? '').trim();
  if (!raw) return { text: '', url: '' };
  try {
    const data = JSON.parse(raw);
    const list = Array.isArray(data) ? data : [];
    const first = list[0];
    if (!first) return { text: '', url: '' };
    return {
      text: String(first.title ?? first.text ?? '').trim(),
      url: String(first.url ?? first.link ?? '').trim(),
    };
  } catch {
    return { text: '', url: '' };
  }
}

function parseButtons(pmButtonsJson?: string | null): Array<{ text: string; url: string }> {
  const raw = (pmButtonsJson ?? '').trim();
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    const list = Array.isArray(data) ? data : [];
    return list
      .map((b) => ({
        text: String(b?.title ?? b?.text ?? '').trim(),
        url: String(b?.url ?? b?.link ?? '').trim(),
      }))
      .filter((b) => b.text || b.url);
  } catch {
    return [];
  }
}

function detectButtonKind(text: string, url: string): 'whatsapp' | 'telegram' | 'viber' | 'website' | 'other' {
  const t = (text || '').toLowerCase();
  const u = (url || '').toLowerCase();
  if (u.includes('whatsapp.com') || u.includes('wa.me') || t.includes('whatsapp') || t.includes('??????')) return 'whatsapp';
  if (u.includes('t.me') || t.includes('telegram') || t.includes('????????')) return 'telegram';
  if (u.includes('viber') || t.includes('viber') || t.includes('??????')) return 'viber';
  if (u.startsWith('http://') || u.startsWith('https://')) return 'website';
  return 'other';
}

function parseImageUrls(value?: string | null): string[] {
  const raw = (value ?? '').trim();
  if (!raw) return [];
  try {
    const decoded = JSON.parse(raw);
    if (Array.isArray(decoded)) {
      return decoded
        .map((s) => String(s ?? '').trim())
        .filter(Boolean)
        .slice(0, MAX_IMAGES);
    }
  } catch {}
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_IMAGES);
}

function serializeImageUrls(list: string[]): string {
  const normalized = list.map((s) => String(s ?? '').trim()).filter(Boolean).slice(0, MAX_IMAGES);
  if (!normalized.length) return '';
  if (normalized.length === 1) return normalized[0];
  try {
    return JSON.stringify(normalized);
  } catch {
    return normalized.join('\n');
  }
}

function fileExtFromMime(kind: 'image' | 'audio' | 'video', mimeType?: string | null) {
  const mime = String(mimeType ?? '').toLowerCase();
  if (kind === 'image') {
    if (mime.includes('png')) return 'png';
    if (mime.includes('webp')) return 'webp';
    return 'jpg';
  }
  if (kind === 'audio') {
    if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
    if (mime.includes('wav')) return 'wav';
    if (mime.includes('aac')) return 'aac';
    return 'm4a';
  }
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('quicktime')) return 'mov';
  return 'mp4';
}

function fileExtFromUri(uri: string) {
  const clean = uri.split('?')[0];
  const m = clean.match(/\.([a-zA-Z0-9]{2,5})$/);
  return m ? m[1].toLowerCase() : '';
}

function buildWhatsappButtonsJson(text?: string, phone?: string, message?: string) {
  const cleanText = (text ?? '').trim();
  const cleanPhone = (phone ?? '').replace(/\D/g, '');
  const cleanMessage = (message ?? '').trim();
  if (!cleanText || !cleanPhone) return '';
  const textPart = cleanMessage ? `&text=${encodeURIComponent(cleanMessage)}` : '';
  return JSON.stringify([{ type: 'web_url', title: cleanText, url: `https://api.whatsapp.com/send?phone=${cleanPhone}${textPart}` }]);
}

function buildButtonJson(text?: string, phone?: string, url?: string, message?: string) {
  const cleanText = (text ?? '').trim();
  const cleanPhone = (phone ?? '').replace(/\D/g, '');
  const cleanUrl = (url ?? '').trim();
  if (!cleanText) return '';
  if (cleanPhone) return buildWhatsappButtonsJson(cleanText, cleanPhone, message);
  if (cleanUrl) return JSON.stringify([{ type: 'web_url', title: cleanText, url: cleanUrl }]);
  return '';
}

function normalizeButtonUrl(url: string) {
  const raw = url.trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

function isValidHttpUrl(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function AutomationsScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const tr = (key: string, vars?: Record<string, string | number>) => {
    let text = t(key);
    if (!vars) return text;
    for (const [k, v] of Object.entries(vars)) text = text.replace(`{${k}}`, String(v));
    return text;
  };
  const [itemsByPlatform, setItemsByPlatform] = useState<Record<PlatformKey, Automation[]>>({ facebook: [], instagram: [] });
  const [pages, setPages] = useState<Page[]>([]);
  const [selectedPageIds, setSelectedPageIds] = useState<Record<PlatformKey, string>>({ facebook: '', instagram: '' });
  const [showPagePicker, setShowPagePicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, { message: string; pm_message: string; pm_image_url: string; pm_audio_url: string; pm_video_url: string; pm_image_label: string; pm_audio_label: string; pm_buttons_json: string; whatsapp_button_text: string; whatsapp_phone: string; whatsapp_message: string; button_url: string }>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [manualPageId, setManualPageId] = useState('');
  const [brokenImages, setBrokenImages] = useState<Record<string, number>>({});
  const [brokenPostImages, setBrokenPostImages] = useState<Record<string, number>>({});
  const [expandedPosts, setExpandedPosts] = useState<Record<string, boolean>>({});
  const [hasMoreByPlatform, setHasMoreByPlatform] = useState<Record<PlatformKey, boolean>>({ facebook: false, instagram: false });
  const [nextCursorByPlatform, setNextCursorByPlatform] = useState<Record<PlatformKey, string | null>>({ facebook: null, instagram: null });
  const [loadingMoreByPlatform, setLoadingMoreByPlatform] = useState<Record<PlatformKey, boolean>>({ facebook: false, instagram: false });
  const [editingItem, setEditingItem] = useState<Automation | null>(null);
  const [editDraft, setEditDraft] = useState<{ auto_reply_comment: boolean; like_active: boolean; auto_reply_pm: boolean; message: string; pm_message: string; pm_image_url: string; pm_audio_url: string; pm_video_url: string; pm_image_label: string; pm_audio_label: string; pm_buttons_json: string; whatsapp_button_text: string; whatsapp_phone: string; whatsapp_message: string; button_url: string } | null>(null);
  const [initialDraft, setInitialDraft] = useState<{ auto_reply_comment: boolean; like_active: boolean; auto_reply_pm: boolean; message: string; pm_message: string; pm_image_url: string; pm_audio_url: string; pm_video_url: string; pm_image_label: string; pm_audio_label: string; pm_buttons_json: string; whatsapp_button_text: string; whatsapp_phone: string; whatsapp_message: string; button_url: string } | null>(null);
  const [platformFilter, setPlatformFilter] = useState<'facebook' | 'instagram'>('facebook');
  const [refreshSpin] = useState(() => new Animated.Value(0));
  const [uploadingMedia, setUploadingMedia] = useState<null | 'image' | 'audio' | 'video'>(null);
  const [imageUploadProgress, setImageUploadProgress] = useState(0);
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);
  const [mediaPreviewError, setMediaPreviewError] = useState<{ image: boolean; video: boolean }>({ image: false, video: false });
  const [audioPreviewError, setAudioPreviewError] = useState(false);
  const [audioPreviewLoading, setAudioPreviewLoading] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [playingAudio, setPlayingAudio] = useState<Audio.Sound | null>(null);
  const [activeAudioUri, setActiveAudioUri] = useState('');
  const [audioDurationMs, setAudioDurationMs] = useState(0);
  const [audioPositionMs, setAudioPositionMs] = useState(0);
  const [audioIsPlaying, setAudioIsPlaying] = useState(false);
  const [buttonEditorOpen, setButtonEditorOpen] = useState(false);
  const [buttonPickerOpen, setButtonPickerOpen] = useState(false);
  const [mediaSectionOpen, setMediaSectionOpen] = useState(false);
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [userQuickReplies, setUserQuickReplies] = useState<string[]>([]);
  const [quickReplyInput, setQuickReplyInput] = useState('');
  const [quickReplyBusy, setQuickReplyBusy] = useState(false);
  const [buttonEditIndex, setButtonEditIndex] = useState<number | null>(null);
  const [buttonEditorKind, setButtonEditorKind] = useState<'whatsapp' | 'telegram' | 'viber' | 'website' | 'other'>('whatsapp');
  const [buttonEditorText, setButtonEditorText] = useState('');
  const [buttonEditorUrl, setButtonEditorUrl] = useState('');
  const [buttonEditorPhone, setButtonEditorPhone] = useState('');
  const [buttonEditorMessage, setButtonEditorMessage] = useState('');
  
  const autoModalScrollRef = useRef<ScrollView | null>(null);
  const quickReplyInputRef = useRef<TextInput | null>(null);
  const quickReplyInputRowYRef = useRef(0);
  const selectedPageId = selectedPageIds[platformFilter];
  const items = itemsByPlatform[platformFilter];
  const hasMore = hasMoreByPlatform[platformFilter];
  const nextCursor = nextCursorByPlatform[platformFilter];
  const loadingMore = loadingMoreByPlatform[platformFilter];

  async function stopAudioPlayback() {
    if (playingAudio) {
      await playingAudio.unloadAsync().catch(() => {});
    }
    setPlayingAudio(null);
    setActiveAudioUri('');
    setAudioDurationMs(0);
    setAudioPositionMs(0);
    setAudioIsPlaying(false);
    setAudioPreviewLoading(false);
  }

  async function loadUserQuickReplies() {
    try {
      const res = await api.request<{ replies?: string[] }>('get_quick_comment_replies');
      setUserQuickReplies(Array.isArray(res.replies) ? res.replies.map((x) => String(x ?? '').trim()).filter(Boolean) : []);
    } catch {
      setUserQuickReplies([]);
    }
  }

  async function persistUserQuickReplies(next: string[]) {
    setQuickReplyBusy(true);
    try {
      const normalized = next.map((x) => String(x ?? '').trim()).filter(Boolean);
      const res = await api.request<{ replies?: string[] }>('save_quick_comment_replies', { replies: normalized });
      setUserQuickReplies(Array.isArray(res.replies) ? res.replies : normalized);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'save_failed';
      Alert.alert(t('error'), msg);
    } finally {
      setQuickReplyBusy(false);
    }
  }

  function getItemKey(item: Automation) {
    return item.id > 0 ? `id:${item.id}` : `post:${item.post_id}:${item.comment_id ?? 'post'}`;
  }

  function focusQuickReplyInput() {
    const y = Math.max(0, quickReplyInputRowYRef.current - 12);
    autoModalScrollRef.current?.scrollTo({ y, animated: true });
    setTimeout(() => quickReplyInputRef.current?.focus(), 120);
  }

  function getPageAvatarCandidates(page: Page) {
    const graphUrl = `https://graph.facebook.com/${encodeURIComponent(page.id)}/picture?type=small&width=96&height=96`;
    const candidates = [page.picture ?? '', graphUrl].filter(Boolean);
    return candidates;
  }

  function getPostImageCandidates(item: Automation) {
    return [item.post_info?.full_picture ?? '', item.post_info?.picture_url ?? ''].filter(Boolean);
  }

  async function loadPosts(page: Page, append = false, after: string | null = null): Promise<Automation[]> {
    const targetPlatform: PlatformKey = page.platform === 'instagram' ? 'instagram' : 'facebook';
    const action = page.platform === 'instagram' ? 'instagram_posts' : 'page_posts';
    const autoRes = await api.request<{
      posts: Automation[];
      paging?: { has_more?: boolean; next_cursor?: string | null };
    }>(action, {
      page_id: page.id,
      ig_id: page.id,
      source_page_id: page.source_page_id ?? '',
      limit: 10,
      after: after ?? '',
    });
    setItemsByPlatform((current) => ({
      ...current,
      [targetPlatform]: append ? [...current[targetPlatform], ...autoRes.posts] : autoRes.posts,
    }));
    setDrafts((current) => {
      const next = { ...current };
      for (const item of autoRes.posts) {
        const wa = parseWhatsappButton(item.pm_buttons_json ?? '');
        const firstBtn = parseFirstButton(item.pm_buttons_json ?? '');
        next[getItemKey(item)] = {
          message: item.message ?? '',
          pm_message: item.pm_message ?? '',
          pm_image_url: item.pm_image_url ?? '',
          pm_audio_url: item.pm_audio_url ?? '',
          pm_video_url: item.pm_video_url ?? '',
          pm_image_label: item.pm_image_label ?? '',
          pm_audio_label: item.pm_audio_label ?? '',
          pm_buttons_json: item.pm_buttons_json ?? '',
          whatsapp_button_text: wa.text,
          whatsapp_phone: wa.phone,
          whatsapp_message: wa.message,
          button_url: firstBtn.url,
        };
      }
      return next;
    });
    setHasMoreByPlatform((current) => ({ ...current, [targetPlatform]: !!autoRes.paging?.has_more }));
    setNextCursorByPlatform((current) => ({ ...current, [targetPlatform]: autoRes.paging?.next_cursor ?? null }));
    setBrokenPostImages({});
    return autoRes.posts;
  }

  async function load() {
    setLoading(true);
    try {
      const pagesRes = await api.request<{ pages: Page[] }>('pages', { debug: 1, include_instagram: 1 });
      let resolvedPages = pagesRes.pages ?? [];

      if (!resolvedPages.length) {
        const meRes = await api.request<{ pages?: Page[] }>('me');
        resolvedPages = meRes.pages ?? [];
      }

      if (!resolvedPages.length) {
        const allAutoRes = await api.request<{ automations: Automation[] }>('automations');
        const map: Record<string, Page> = {};
        for (const row of allAutoRes.automations ?? []) {
          const pid = (row.page_id ?? '').trim();
          if (!pid) continue;
          map[pid] = { id: pid, name: `Page ${pid}`, has_token: true };
        }
        resolvedPages = Object.values(map);
        if (resolvedPages.length) {
          try {
            const namesRes = await api.request<{ pages: Array<{ id: string; name: string; picture?: string | null }> }>(
              'resolve_page_names',
              { page_ids: resolvedPages.map((p) => p.id) }
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

      if (!selectedPageId) {
        setPages(resolvedPages);
        setBrokenImages({});
        return;
      }

      const selectedPage = resolvedPages.find((p) => p.id === selectedPageId);
      if (!selectedPage) {
        setPages(resolvedPages);
        setBrokenImages({});
        return;
      }
      const loadedPosts = await loadPosts(selectedPage, false, null);
      if (!resolvedPages.length) {
        const map: Record<string, Page> = {};
        for (const row of loadedPosts) {
          const pid = (row.page_id ?? '').trim();
          if (!pid) continue;
          map[pid] = { id: pid, name: pid, has_token: true };
        }
        resolvedPages = Object.values(map);
      }
      setPages(resolvedPages);
      setBrokenImages({});
    } catch (error) {
      Alert.alert(t('error'), error instanceof Error ? error.message : t('pages_load_failed'));
    } finally {
      setLoading(false);
    }
  }
  function makeDraftFromItem(item: Automation) {
    const key = getItemKey(item);
    const msgDraft = drafts[key];
    return {
      auto_reply_comment: !!item.auto_reply_comment,
      like_active: !!item.like_active,
      auto_reply_pm: !!item.auto_reply_pm,
      message: msgDraft?.message ?? item.message ?? '',
      pm_message: msgDraft?.pm_message ?? item.pm_message ?? '',
      pm_image_url: msgDraft?.pm_image_url ?? item.pm_image_url ?? '',
      pm_audio_url: msgDraft?.pm_audio_url ?? item.pm_audio_url ?? '',
      pm_video_url: msgDraft?.pm_video_url ?? item.pm_video_url ?? '',
      pm_image_label: msgDraft?.pm_image_label ?? item.pm_image_label ?? '',
      pm_audio_label: msgDraft?.pm_audio_label ?? item.pm_audio_label ?? '',
      pm_buttons_json: msgDraft?.pm_buttons_json ?? item.pm_buttons_json ?? '',
      whatsapp_button_text: msgDraft?.whatsapp_button_text ?? parseWhatsappButton(item.pm_buttons_json ?? '').text,
      whatsapp_phone: msgDraft?.whatsapp_phone ?? parseWhatsappButton(item.pm_buttons_json ?? '').phone,
      whatsapp_message: msgDraft?.whatsapp_message ?? parseWhatsappButton(item.pm_buttons_json ?? '').message,
      button_url: msgDraft?.button_url ?? parseFirstButton(item.pm_buttons_json ?? '').url
    };
  }

  function openEditor(item: Automation) {
    const nextDraft = makeDraftFromItem(item);
    setEditingItem(item);
    setEditDraft(nextDraft);
    setInitialDraft(nextDraft);
    setButtonEditorOpen(false);
    setButtonEditIndex(null);
    setButtonEditorText('');
    setButtonEditorUrl('');
    setButtonEditorPhone('');
    setButtonEditorMessage('');
    setMediaSectionOpen(false);
  }

  function hasUnsavedChanges() {
    if (!editDraft || !initialDraft) return false;
    return (
      editDraft.auto_reply_comment !== initialDraft.auto_reply_comment ||
      editDraft.like_active !== initialDraft.like_active ||
      editDraft.auto_reply_pm !== initialDraft.auto_reply_pm ||
      editDraft.message !== initialDraft.message ||
      editDraft.pm_message !== initialDraft.pm_message ||
      editDraft.pm_image_url !== initialDraft.pm_image_url ||
      editDraft.pm_audio_url !== initialDraft.pm_audio_url ||
      editDraft.pm_video_url !== initialDraft.pm_video_url ||
      editDraft.pm_image_label !== initialDraft.pm_image_label ||
      editDraft.pm_audio_label !== initialDraft.pm_audio_label ||
      editDraft.pm_buttons_json !== initialDraft.pm_buttons_json ||
      editDraft.whatsapp_button_text !== initialDraft.whatsapp_button_text ||
      editDraft.whatsapp_phone !== initialDraft.whatsapp_phone ||
      editDraft.whatsapp_message !== initialDraft.whatsapp_message ||
      editDraft.button_url !== initialDraft.button_url
    );
  }

  function closeEditorWithGuard() {
    if (!hasUnsavedChanges()) {
      stopAudioPlayback().catch(() => {});
      setEditingItem(null);
      setEditDraft(null);
      setInitialDraft(null);
      setButtonEditorOpen(false);
      setButtonEditIndex(null);
      setButtonEditorPhone('');
      setButtonEditorMessage('');
      return;
    }
    Alert.alert(t('cancel'), 'Unsaved changes', [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('save'),
        style: 'destructive',
        onPress: () => {
          stopAudioPlayback().catch(() => {});
          setEditingItem(null);
          setEditDraft(null);
          setInitialDraft(null);
          setButtonEditorOpen(false);
          setButtonEditIndex(null);
          setButtonEditorPhone('');
          setButtonEditorMessage('');
        }
      }
    ]);
  }

  async function uploadBase64Asset(kind: 'image' | 'audio' | 'video', uri: string, mimeType = '') {
    setUploadingMedia(kind);
    try {
      const res = await uploadMediaAssetWithProgress(kind, uri, mimeType, (p) => {
        if (kind === 'image') setImageUploadProgress(p);
        if (kind === 'video') setVideoUploadProgress(p);
      });
      return res.url;
    } finally {
      if (kind === 'image') setImageUploadProgress(0);
      if (kind === 'video') setVideoUploadProgress(0);
      setUploadingMedia(null);
    }
  }

  async function uploadMediaAssetWithProgress(
    kind: 'image' | 'audio' | 'video',
    uri: string,
    mimeType: string,
    onProgress: (value: number) => void
  ): Promise<{ url: string }> {
    const baseUrl = api.getBaseUrl();
    const token = api.getToken();
    return await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', baseUrl);
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (evt) => {
        if (!evt.lengthComputable) return;
        onProgress(Math.max(0, Math.min(100, Math.round((evt.loaded / evt.total) * 100))));
      };
      xhr.onerror = () => reject(new Error('upload_failed'));
      xhr.onload = () => {
        try {
          const raw = String(xhr.responseText ?? '');
          const json = JSON.parse(raw) as { success?: boolean; error?: string; url?: string };
          if (xhr.status >= 200 && xhr.status < 300 && json.success && json.url) {
            onProgress(100);
            resolve({ url: json.url });
            return;
          }
          reject(new Error(json.error || `HTTP ${xhr.status}`));
        } catch {
          reject(new Error('upload_parse_failed'));
        }
      };
      const ext = fileExtFromUri(uri) || fileExtFromMime(kind, mimeType);
      const contentType =
        mimeType ||
        (kind === 'image'
          ? ext === 'png'
            ? 'image/png'
            : ext === 'webp'
            ? 'image/webp'
            : 'image/jpeg'
          : kind === 'video'
          ? ext === 'webm'
            ? 'video/webm'
            : ext === 'mov'
            ? 'video/quicktime'
            : 'video/mp4'
          : ext === 'mp3'
          ? 'audio/mpeg'
          : ext === 'wav'
          ? 'audio/wav'
          : ext === 'aac'
          ? 'audio/aac'
          : 'audio/mp4');
      const form = new FormData();
      form.append('action', 'upload_media_asset_file');
      form.append('kind', kind);
      form.append('file', {
        uri,
        type: contentType,
        name: `${kind}_${Date.now()}.${ext}`,
      } as any);
      xhr.send(form);
    });
  }

  async function persistMediaAfterUpload(kind: 'image' | 'audio' | 'video', url: string) {
    if (!editDraft) return;
    if (kind === 'image') {
      const current = parseImageUrls(editDraft.pm_image_url);
      if (current.length >= MAX_IMAGES) {
        Alert.alert(t('warning'), tr('only_images_limit', { count: MAX_IMAGES }));
        return;
      }
    }
    const nextDraft = {
      ...editDraft,
      pm_image_url:
        kind === 'image'
          ? serializeImageUrls([...parseImageUrls(editDraft.pm_image_url), url])
          : editDraft.pm_image_url,
      pm_audio_url: kind === 'audio' ? url : editDraft.pm_audio_url,
      pm_video_url: kind === 'video' ? url : editDraft.pm_video_url,
    };
    setEditDraft(nextDraft);
  }

  async function removeImageAtIndex(index: number) {
    if (!editDraft) return;
    const list = parseImageUrls(editDraft.pm_image_url);
    if (index < 0 || index >= list.length) return;
    const nextList = list.filter((_, i) => i !== index);
    const nextValue = serializeImageUrls(nextList);
    setEditDraft((current) => (current ? { ...current, pm_image_url: nextValue } : current));
  }

  async function pickAndUpload(kind: 'image' | 'video' | 'audio') {
    if (!editDraft) return;
    try {
      let file: { uri: string; mimeType?: string | null } | null = null;
      if (kind === 'image' || kind === 'video') {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert(t('error'), t('gallery_permission_required'));
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: kind === 'image' ? ['images'] : ['videos'],
          quality: 1,
          allowsEditing: false,
          selectionLimit: 1,
        });
        if (result.canceled || !result.assets?.length) return;
        const a = result.assets[0];
        file = { uri: a.uri, mimeType: a.mimeType ?? null };
      } else {
        const pick = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true, multiple: false });
        if (pick.canceled || !pick.assets?.length) return;
        const a = pick.assets[0];
        const mime = String(a.mimeType ?? '').toLowerCase();
        const ok = mime.includes('audio/mp4') || mime.includes('audio/mpeg') || mime.includes('audio/mp3') || mime.includes('audio/wav');
        if (mime && !ok) {
          Alert.alert(t('error'), t('unsupported_audio_format'));
          return;
        }
        file = a;
      }
      if (!file) return;
      if (kind === 'image') setMediaPreviewError((s) => ({ ...s, image: false }));
      if (kind === 'video') setMediaPreviewError((s) => ({ ...s, video: false }));
      if (kind === 'audio') {
        setAudioPreviewError(false);
        setAudioPreviewLoading(true);
      }
      const uploadedUrl = await uploadBase64Asset(kind, file.uri, file.mimeType ?? '');
      await persistMediaAfterUpload(kind, uploadedUrl);
      if (kind === 'audio') setAudioPreviewLoading(false);
    } catch (error) {
      if (kind === 'audio') setAudioPreviewLoading(false);
      Alert.alert(t('error'), error instanceof Error ? error.message : t('upload_failed'));
    }
  }

  async function startAudioRecord() {
    if (recording) return;
    const perm = await Audio.requestPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('error'), t('mic_permission_required'));
      return;
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const rec = new Audio.Recording();
    rec.setProgressUpdateInterval(200);
    rec.setOnRecordingStatusUpdate((status) => {
      if (!status?.isRecording) return;
      setRecordingDurationMs(status.durationMillis ?? 0);
    });
    await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await rec.startAsync();
    setRecordingDurationMs(0);
    setRecording(rec);
  }

  async function stopAudioRecordAndUpload() {
    if (!recording || !editDraft) return;
    if (recordingDurationMs < 700) {
      Alert.alert(t('warning'), t('min_recording_warning'));
      return;
    }
    setUploadingMedia('audio');
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const uri = recording.getURI();
      setRecording(null);
      setRecordingDurationMs(0);
      if (!uri) return;
      const url = await uploadBase64Asset('audio', uri, 'audio/mp4');
      setEditDraft((current) => (current ? { ...current, pm_audio_url: url } : current));
    } finally {
      setUploadingMedia(null);
    }
  }

  async function previewAudio(uri: string) {
    const safeUri = normalizeMediaUrl(uri);
    if (!safeUri) return;
    try {
      setAudioPreviewError(false);
      setAudioPreviewLoading(true);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      if (playingAudio && activeAudioUri === safeUri) {
        const status = await playingAudio.getStatusAsync();
        if (status.isLoaded) {
          const reachedEnd =
            typeof status.durationMillis === 'number' &&
            typeof status.positionMillis === 'number' &&
            status.durationMillis > 0 &&
            status.positionMillis >= status.durationMillis - 120;
          if (status.isPlaying) {
            await playingAudio.pauseAsync();
          } else {
            if (reachedEnd) {
              await playingAudio.setPositionAsync(0);
            }
            await playingAudio.playAsync();
          }
        }
        setAudioPreviewLoading(false);
        return;
      }
      if (playingAudio) {
        await playingAudio.unloadAsync();
      }
      let sourceUri = safeUri;
      if (/^https?:\/\//i.test(safeUri)) {
        const ext = fileExtFromUri(safeUri) || 'm4a';
        const localTarget = `${FileSystem.cacheDirectory}audio_preview_${Date.now()}.${ext}`;
        const dl = await FileSystem.downloadAsync(safeUri, localTarget);
        sourceUri = dl.uri;
      }
      const onStatus = (status: any) => {
        if (!status?.isLoaded) return;
        setAudioDurationMs(status.durationMillis ?? 0);
        setAudioPositionMs(status.positionMillis ?? 0);
        setAudioIsPlaying(!!status.isPlaying);
        if (status.didJustFinish) {
          setAudioIsPlaying(false);
          setAudioPositionMs(0);
        }
      };
      const { sound, status } = await Audio.Sound.createAsync(
        { uri: sourceUri },
        { shouldPlay: true, progressUpdateIntervalMillis: 250 },
        onStatus
      );
      setActiveAudioUri(safeUri);
      setPlayingAudio(sound);
      if ((status as any)?.isLoaded) {
        setAudioDurationMs((status as any).durationMillis ?? 0);
        setAudioPositionMs((status as any).positionMillis ?? 0);
        setAudioIsPlaying(!!(status as any).isPlaying);
      }
      setAudioPreviewLoading(false);
    } catch {
      setAudioPreviewLoading(false);
      setAudioPreviewError(true);
      Alert.alert(t('error'), t('cant_play_audio'));
    }
  }

  function formatMs(ms: number) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  async function removeMediaAndPersist(kind: 'image' | 'audio' | 'video') {
    if (!editDraft) return;
    const clearPatch =
      kind === 'image'
        ? { pm_image_url: '', pm_image_label: '' }
        : kind === 'audio'
        ? { pm_audio_url: '', pm_audio_label: '' }
        : { pm_video_url: '' };

    setEditDraft((current) => (current ? { ...current, ...clearPatch } : current));
    if (kind === 'audio') {
      await stopAudioPlayback();
    }
  }

  async function removeButtonAndPersist(index?: number) {
    if (!editDraft) return;
    const prevButtons = parseButtons(editDraft.pm_buttons_json ?? '');
    const nextButtons =
      typeof index === 'number' ? prevButtons.filter((_, i) => i !== index) : [];
    const nextJson = nextButtons.length
      ? JSON.stringify(nextButtons.map((b) => ({ type: 'web_url', title: b.text, url: b.url })))
      : '';
    setEditDraft((current) =>
      current
        ? {
            ...current,
            pm_buttons_json: nextJson,
            whatsapp_button_text: '',
            whatsapp_phone: '',
            whatsapp_message: '',
            button_url: '',
          }
        : current
    );
    setButtonEditorOpen(false);
    setButtonEditorText('');
    setButtonEditorUrl('');
    setButtonEditorPhone('');
    setButtonEditorMessage('');
  }

  async function saveButtonAndPersist() {
    if (!editingItem || !editDraft) return;
    const label = buttonEditorText.trim();
    const phone = buttonEditorPhone.trim();
    const message = buttonEditorMessage.trim();
    const rawUrl = buttonEditorUrl.trim();
    if (!label) {
      Alert.alert(t('error'), t('button_name_required'));
      return;
    }

    let targetUrl = '';
    if (buttonEditorKind === 'whatsapp') {
      if (!phone || phone.replace(/\D/g, '').length < 8) {
        Alert.alert(t('error'), t('whatsapp_phone_invalid'));
        return;
      }
      targetUrl = `https://api.whatsapp.com/send?phone=${phone.replace(/\D/g, '')}${message ? `&text=${encodeURIComponent(message)}` : ''}`;
    } else {
      targetUrl = normalizeButtonUrl(rawUrl);
      if (!targetUrl || !isValidHttpUrl(targetUrl)) {
        Alert.alert(t('error'), t('invalid_link'));
        return;
      }
    }

    const prevButtons = parseButtons(editDraft.pm_buttons_json ?? '');
    if (buttonEditIndex === null && prevButtons.length >= MAX_BUTTONS) {
      Alert.alert(t('warning'), tr('max_buttons_reached', { count: MAX_BUTTONS }));
      return;
    }
    const nextButtons = [...prevButtons];
    const nextItem = { text: label, url: targetUrl };
    if (buttonEditIndex !== null && buttonEditIndex >= 0 && buttonEditIndex < nextButtons.length) {
      nextButtons[buttonEditIndex] = nextItem;
    } else {
      nextButtons.push(nextItem);
    }
    const nextJson = JSON.stringify(nextButtons.map((b) => ({ type: 'web_url', title: b.text, url: b.url })));
    const nextDraft = {
      ...editDraft,
      auto_reply_pm: true,
      whatsapp_button_text: label,
      whatsapp_phone: buttonEditorKind === 'whatsapp' ? phone.replace(/\D/g, '') : '',
      whatsapp_message: buttonEditorKind === 'whatsapp' ? message : '',
      button_url: buttonEditorKind === 'whatsapp' ? '' : targetUrl,
      pm_buttons_json: nextJson,
    };
    setEditDraft(nextDraft);

    setInitialDraft(nextDraft);
    setButtonEditorOpen(false);
    setButtonEditIndex(null);
  }

  async function saveMessages(item: Automation) {
    if (!editDraft) return;
    setSavingId(item.id);
    try {
      const buttonsJson = (editDraft.pm_buttons_json ?? '').trim();
      let nextItem: Automation = {
        ...item,
        active: editDraft.auto_reply_comment ? 1 : 0,
        like_active: editDraft.like_active ? 1 : 0,
        pm_active: editDraft.auto_reply_pm ? 1 : 0,
        auto_reply_comment: editDraft.auto_reply_comment ? 1 : 0,
        auto_reply_pm: editDraft.auto_reply_pm ? 1 : 0,
        message: editDraft.message,
        pm_message: editDraft.pm_message,
        pm_image_url: editDraft.pm_image_url,
        pm_audio_url: editDraft.pm_audio_url,
        pm_video_url: editDraft.pm_video_url,
        pm_image_label: editDraft.pm_image_label,
        pm_audio_label: editDraft.pm_audio_label,
        pm_buttons_json: buttonsJson
      };
      if (platformFilter === 'instagram') {
        const selectedInstagramPage = pages.find((p) => p.id === selectedPageId);
        const res = await api.request<{ automation?: Automation }>('save_instagram_automation', {
          post_id: item.post_id,
          page_id: selectedPageId,
          ig_id: selectedPageId,
          source_page_id: selectedInstagramPage?.source_page_id ?? '',
          auto_reply_comment: editDraft.auto_reply_comment ? 1 : 0,
          like_active: editDraft.like_active ? 1 : 0,
          auto_reply_pm: editDraft.auto_reply_pm ? 1 : 0,
          message: editDraft.message,
          pm_message: editDraft.pm_message,
          pm_image_url: editDraft.pm_image_url,
          pm_audio_url: editDraft.pm_audio_url,
          pm_video_url: editDraft.pm_video_url,
          pm_image_label: editDraft.pm_image_label,
          pm_audio_label: editDraft.pm_audio_label,
          pm_buttons_json: buttonsJson
        });
        nextItem = {
          ...nextItem,
          ...(res.automation ?? {}),
          pm_image_url: editDraft.pm_image_url,
          pm_audio_url: editDraft.pm_audio_url,
          pm_video_url: editDraft.pm_video_url,
          pm_image_label: editDraft.pm_image_label,
          pm_audio_label: editDraft.pm_audio_label,
          pm_buttons_json: buttonsJson,
          post_info: item.post_info
        };
      } else {
        let targetItem = item;
        if (targetItem.id <= 0) {
          targetItem = await ensureAutomation(targetItem);
          setEditingItem(targetItem);
        }
        await api.request('update_automation', {
          id: targetItem.id,
          active: editDraft.auto_reply_comment ? 1 : 0,
          auto_reply_comment: editDraft.auto_reply_comment ? 1 : 0,
          like_active: editDraft.like_active ? 1 : 0,
          pm_active: editDraft.auto_reply_pm ? 1 : 0,
          auto_reply_pm: editDraft.auto_reply_pm ? 1 : 0,
          message: editDraft.message,
          pm_message: editDraft.pm_message,
          pm_image_url: editDraft.pm_image_url,
          pm_audio_url: editDraft.pm_audio_url,
          pm_video_url: editDraft.pm_video_url,
          pm_image_label: editDraft.pm_image_label,
          pm_audio_label: editDraft.pm_audio_label,
          pm_buttons_json: buttonsJson
        });
      }
      setItemsByPlatform((current) => ({
        ...current,
        [platformFilter]: current[platformFilter].map((row) =>
          getItemKey(row) === getItemKey(item) || row.id === item.id
            ? nextItem
            : row
        )
      }));
      setDrafts((current) => ({
        ...current,
        [getItemKey(nextItem)]: {
          message: editDraft.message,
          pm_message: editDraft.pm_message,
          pm_image_url: editDraft.pm_image_url,
          pm_audio_url: editDraft.pm_audio_url,
          pm_video_url: editDraft.pm_video_url,
          pm_image_label: editDraft.pm_image_label,
          pm_audio_label: editDraft.pm_audio_label,
          pm_buttons_json: buttonsJson,
          whatsapp_button_text: editDraft.whatsapp_button_text,
          whatsapp_phone: editDraft.whatsapp_phone,
          whatsapp_message: editDraft.whatsapp_message,
          button_url: editDraft.button_url
        }
      }));
      setInitialDraft(editDraft);
      await stopAudioPlayback();
      setEditingItem(null);
      setEditDraft(null);
      setInitialDraft(null);
    } catch (error) {
      Alert.alert(t('error'), error instanceof Error ? error.message : t('save'));
    } finally {
      setSavingId(null);
    }
  }
  async function loadMorePosts() {
    if (!selectedPageId || loadingMore || !hasMore) return;
    if (!nextCursor) return;
    setLoadingMoreByPlatform((current) => ({ ...current, [platformFilter]: true }));
    try {
      const selectedPage = pages.find(
        (p) =>
          p.id === selectedPageId &&
          (platformFilter === 'instagram' ? isInstagramPage(p) : isFacebookPage(p))
      );
      if (!selectedPage) return;
      await loadPosts(selectedPage, true, nextCursor);
    } catch (error) {
      Alert.alert(t('error'), error instanceof Error ? error.message : t('load_more'));
    } finally {
      setLoadingMoreByPlatform((current) => ({ ...current, [platformFilter]: false }));
    }
  }

  async function ensureAutomation(item: Automation): Promise<Automation> {
    if (platformFilter === 'instagram') return item;
    if (item.id > 0) return item;
    const res = await api.request<{ id: number }>('create_automation', {
      post_id: item.post_id,
      page_id: selectedPageId,
    });
    const newId = res.id;
    const upgraded: Automation = { ...item, id: newId };
    setItemsByPlatform((current) => ({
      ...current,
      [platformFilter]: current[platformFilter].map((row) => (getItemKey(row) === getItemKey(item) ? upgraded : row)),
    }));
    setDrafts((current) => {
      const oldKey = getItemKey(item);
      const newKey = getItemKey(upgraded);
      const value = current[oldKey] ?? {
        message: item.message ?? '',
        pm_message: item.pm_message ?? '',
        pm_image_url: item.pm_image_url ?? '',
        pm_audio_url: item.pm_audio_url ?? '',
        pm_video_url: item.pm_video_url ?? '',
        pm_image_label: item.pm_image_label ?? '',
        pm_audio_label: item.pm_audio_label ?? '',
        pm_buttons_json: item.pm_buttons_json ?? '',
        whatsapp_button_text: parseWhatsappButton(item.pm_buttons_json ?? '').text,
        whatsapp_phone: parseWhatsappButton(item.pm_buttons_json ?? '').phone,
        whatsapp_message: parseWhatsappButton(item.pm_buttons_json ?? '').message,
        button_url: parseFirstButton(item.pm_buttons_json ?? '').url
      };
      const next = { ...current };
      delete next[oldKey];
      next[newKey] = value;
      return next;
    });
    return upgraded;
  }

  async function handlePullRefresh() {
    await playRefreshSound();
    await load();
  }

  useEffect(() => {
    load();
  }, [platformFilter, selectedPageIds.facebook, selectedPageIds.instagram]);

  useEffect(() => {
    if (loading) {
      Animated.loop(
        Animated.timing(refreshSpin, {
          toValue: 1,
          duration: 850,
          easing: Easing.linear,
          useNativeDriver: true
        })
      ).start();
      return;
    }
    refreshSpin.stopAnimation();
    refreshSpin.setValue(0);
  }, [loading, refreshSpin]);

  useEffect(() => {
    loadUserQuickReplies();
  }, []);

  useEffect(() => {
    return () => {
      stopAudioPlayback().catch(() => {});
    };
  }, [playingAudio]);

  useFocusEffect(
    React.useCallback(() => {
      return () => {
        stopAudioPlayback().catch(() => {});
      };
    }, [playingAudio])
  );

  const selectedPageName = selectedPageId
    ? normalizePageName(pages.find((p) => p.id === selectedPageId)) || `Page ${selectedPageId}`
    : t('select_page');
  const canUseManualPage = manualPageId.trim().length > 0;
  const filteredPages = pages.filter((p) => (platformFilter === 'instagram' ? isInstagramPage(p) : isFacebookPage(p)));
  const selectedPageInTab = filteredPages.find((p) => p.id === selectedPageId);
  const isAccountBlocked = (user?.is_active ?? true) === false;
  const isSelectedPageRestricted = !!selectedPageInTab?.restricted;
  const selectedPageRestrictionReason = (selectedPageInTab?.restriction_reason ?? '').trim();
  const platformMeta = getPlatformMeta(platformFilter);
  const visibleItems = items.filter((item) => {
    if (!selectedPageInTab) return false;
    // Show all posts returned for the selected platform/page.
    // Strict permalink/id-shape checks were hiding valid posts for some pages.
    return true;
  });
  const renderedItems = showActiveOnly
    ? visibleItems.filter((item) => !!item.active || !!item.auto_reply_comment || !!item.auto_reply_pm || !!item.like_active || !!item.pm_active)
    : visibleItems;
  const dedupedRenderedItems = React.useMemo(() => {
    const seen = new Set<string>();
    const result: Automation[] = [];
    for (const item of renderedItems) {
      const text = String(item.post_info?.message || item.post_info?.story || '').trim();
      const signature = `${String(item.post_id || '').trim()}|${String(item.post_info?.created_time || '').trim()}|${text}`;
      if (!signature.trim() || signature === '||') {
        result.push(item);
        continue;
      }
      if (seen.has(signature)) continue;
      seen.add(signature);
      result.push(item);
    }
    return result;
  }, [renderedItems]);
  const canManagePosts = !!selectedPageInTab && !isAccountBlocked && !isSelectedPageRestricted;
  const quickCommentReplies = [
    t('quick_reply_1'),
    t('quick_reply_2'),
    t('quick_reply_3'),
    t('quick_reply_4'),
    t('quick_reply_5'),
    ...userQuickReplies,
  ].filter((x) => !!String(x).trim());
  const quickPlaceholderTokens = [
    '{date}',
    '{time}',
    '{user_first_name}',
    '{user_last_name}',
    '{full_name}',
    '{page_name}',
    '{bot_name}',
    '{current_date}',
    '{current_time}',
    '{day_name}',
    '{random_number}',
    '{comment}',
    '{post_id}',
    '{comment_id}',
  ];

  return (
    <Screen title={t('posts_manage_title')} subtitle={t('posts_manage_subtitle')} onRefresh={handlePullRefresh} refreshing={loading}>
      <View style={styles.platformTabs}>
        <Pressable style={[styles.platformTab, platformFilter === 'facebook' ? styles.platformTabActive : null]} onPress={() => { setPlatformFilter('facebook'); }}>
          <View style={[styles.platformIcon, styles.facebookIcon, platformFilter === 'facebook' ? styles.platformIconActive : null]}>
            <Text style={styles.platformIconText}>f</Text>
          </View>
          <Text style={[styles.platformTabText, platformFilter === 'facebook' ? styles.platformTabTextActive : null]}>Facebook</Text>
        </Pressable>
        <Pressable style={[styles.platformTab, platformFilter === 'instagram' ? styles.platformTabActive : null]} onPress={() => { setPlatformFilter('instagram'); }}>
          <View style={[styles.platformIcon, styles.instagramIcon, platformFilter === 'instagram' ? styles.platformIconActive : null]}>
            <Instagram size={14} color="#fff" />
          </View>
          <Text style={[styles.platformTabText, platformFilter === 'instagram' ? styles.platformTabTextActive : null]}>Instagram</Text>
        </Pressable>
      </View>
      <Pressable style={styles.pageSelect} onPress={() => setShowPagePicker(true)}>
        <View style={styles.pageSelectLead}>
          <View style={[styles.pageSelectPlatformBadge, { backgroundColor: platformMeta.soft, borderColor: platformMeta.border }]}>
            <Text style={[styles.pageSelectPlatformBadgeText, { color: platformMeta.accent }]}>{platformMeta.short}</Text>
          </View>
          <View style={styles.pageSelectMeta}>
            <Text style={styles.pageSelectCaption}>{platformMeta.label}</Text>
            <Text style={styles.pageSelectText} numberOfLines={1}>{selectedPageName}</Text>
          </View>
        </View>
        <ChevronDown size={18} color={platformMeta.accent} />
      </Pressable>
      {selectedPageInTab ? (
        <View style={styles.postFilterRow}>
          <Pressable
            style={[styles.postFilterBtn, showActiveOnly ? styles.postFilterBtnActive : null]}
            onPress={() => setShowActiveOnly((v) => !v)}
          >
            <Text style={[styles.postFilterBtnText, showActiveOnly ? styles.postFilterBtnTextActive : null]}>
              {showActiveOnly ? t('all_posts') : t('active_posts_only')}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {!loading && filteredPages.length === 0 ? <Text style={styles.empty}>{t('no_connected_pages')}</Text> : null}
      {isAccountBlocked ? (
        <View style={styles.blockWarn}>
          <Text style={styles.blockWarnText}>{t('blocked_account_message')}</Text>
        </View>
      ) : null}
      {selectedPageInTab && isSelectedPageRestricted ? (
        <View style={styles.blockWarn}>
          <Text style={styles.blockWarnText}>{t('blocked_page_message')}</Text>
          <Text style={styles.blockWarnSub}>
            {t('restriction_reason_label')}: {selectedPageRestrictionReason || t('restriction_reason_empty')}
          </Text>
        </View>
      ) : null}

      {loading ? <ActivityIndicator color={colors.primary} /> : null}

      {!loading && !selectedPageInTab ? <Text style={styles.empty}>{t('select_page_first_for_posts')}</Text> : null}

      {canManagePosts && dedupedRenderedItems.map((item) => (
        <Card key={getItemKey(item)}>
          {(!!item.active || !!item.auto_reply_comment || !!item.auto_reply_pm || !!item.like_active || !!item.pm_active) ? (
            <View style={styles.activePostBar}>
              <Text style={styles.activePostText}>{t('active_post')}</Text>
            </View>
          ) : (
            <View style={styles.inactivePostBar}>
              <Text style={styles.inactivePostText}>{t('inactive_post')}</Text>
            </View>
          )}
          {(() => {
            const postCandidates = getPostImageCandidates(item);
            const postFailCount = brokenPostImages[item.post_id] ?? 0;
            const postUri = postCandidates[postFailCount] ?? '';
            return postUri ? (
            <Image
              source={{ uri: postUri }}
              style={styles.postImage}
              onError={() =>
                setBrokenPostImages((current) => ({
                  ...current,
                  [item.post_id]: Math.min((current[item.post_id] ?? 0) + 1, postCandidates.length)
                }))
              }
            />
            ) : null;
          })()}
          <View style={styles.postRow}>
            <View style={styles.postIdChip}>
              <Text style={styles.postIdChipText}>{item.post_id}</Text>
            </View>
            <Text style={styles.post}>{t('post_info')}</Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>{t('post_info')}</Text>
          {(() => {
            const postKey = getItemKey(item);
            const postText = (item.post_info?.message || item.post_info?.story || '').trim();
            const expanded = !!expandedPosts[postKey];
            const shouldCollapse = postText.length > 180 || (postText.match(/\n/g)?.length ?? 0) >= 3;
            return postText ? (
              <>
                <Text style={styles.postMessage} numberOfLines={expanded ? undefined : 3}>
                  {postText}
                </Text>
                {shouldCollapse ? (
                  <Pressable onPress={() => setExpandedPosts((current) => ({ ...current, [postKey]: !expanded }))}>
                    <Text style={styles.readMoreText}>{expanded ? t('show_less') : t('read_more')}</Text>
                  </Pressable>
                ) : null}
              </>
            ) : null;
          })()}
          {item.post_info?.created_time ? <Text style={styles.postMeta}>{t('date')}: {item.post_info.created_time}</Text> : null}
          </View>
          <Pressable
            style={styles.configBtn}
            onPress={async () => {
              openEditor(item);
            }}
          >
            <Text style={styles.configBtnText}>{t('set_auto_reply')}</Text>
          </Pressable>
          {item.id <= 0 ? <Text style={styles.notConfigured}>{t('post_not_configured')}</Text> : null}
        </Card>
      ))}
      {!loading && canManagePosts && hasMore ? (
        <Pressable style={[styles.reload, loadingMore ? styles.saveBtnDisabled : null]} onPress={loadMorePosts} disabled={loadingMore}>
          <Text style={styles.reloadText}>{loadingMore ? t('refreshing_text') : t('load_more')}</Text>
        </Pressable>
      ) : null}

      {!loading && canManagePosts && dedupedRenderedItems.length === 0 ? (
        <Text style={styles.empty}>{showActiveOnly ? t('no_active_posts_found') : t('no_pages_found')}</Text>
      ) : null}

      <Pressable style={[styles.reload, loading ? styles.reloadLoading : null]} onPress={handlePullRefresh}>
        <Animated.View
          style={{
            transform: [
              {
                rotate: refreshSpin.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '360deg']
                })
              }
            ]
          }}
        >
          <RefreshCcw size={16} color="#fff" />
        </Animated.View>
        <Text style={styles.reloadText}>{t('refresh')}</Text>
      </Pressable>

      <Modal visible={showPagePicker} transparent animationType="fade" onRequestClose={() => setShowPagePicker(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.pickerHeader}>
              <View style={[styles.pickerHeaderBadge, { backgroundColor: platformMeta.soft, borderColor: platformMeta.border }]}>
                <Text style={[styles.pickerHeaderBadgeText, { color: platformMeta.accent }]}>{platformMeta.short}</Text>
              </View>
              <View style={styles.pickerHeaderMeta}>
                <Text style={styles.pickerHeaderTitle}>{platformMeta.label}</Text>
                <Text style={styles.pickerHeaderSubtitle}>{t('select_platform_page')}</Text>
              </View>
            </View>
            {filteredPages.length === 0 ? <Text style={styles.empty}>{t('no_pages_available')}</Text> : null}
            <TextInput
              style={styles.input}
              placeholder={platformFilter === 'instagram' ? t('enter_instagram_id') : t('enter_page_id')}
              placeholderTextColor={colors.muted}
              value={manualPageId}
              onChangeText={setManualPageId}
              autoCapitalize="none"
              autoCorrect={false}
              textAlign="left"
            />
            <Pressable
              style={[styles.saveBtn, !canUseManualPage ? styles.saveBtnDisabled : null]}
              disabled={!canUseManualPage}
              onPress={() => {
                const id = manualPageId.trim();
                if (!id) return;
                setPages((current) => {
                  if (current.some((p) => p.id === id)) return current;
                  return [{ id, name: `Page ${id}`, platform: platformFilter, has_token: true }, ...current];
                });
                setSelectedPageIds((current) => ({ ...current, [platformFilter]: id }));
                setShowPagePicker(false);
              }}
            >
              <Text style={styles.saveBtnText}>{platformFilter === 'instagram' ? t('select_instagram_id') : t('select_page_id')}</Text>
            </Pressable>
            <ScrollView style={styles.pageList}>
              {filteredPages.map((p) => (
                <Pressable key={p.id} style={[styles.pageItem, p.id === selectedPageId ? styles.pageItemActive : null]} onPress={() => { setSelectedPageIds((current) => ({ ...current, [platformFilter]: p.id })); setShowPagePicker(false); }}>
                  <View style={styles.pageRow}>
                    {(() => {
                      const avatarCandidates = getPageAvatarCandidates(p);
                      const avatarFailCount = brokenImages[p.id] ?? 0;
                      const avatarUri = avatarCandidates[avatarFailCount] ?? '';
                      return avatarUri ? (
                      <Image
                        source={{ uri: avatarUri }}
                        style={styles.pageAvatar}
                        onError={() =>
                          setBrokenImages((current) => ({
                            ...current,
                            [p.id]: Math.min((current[p.id] ?? 0) + 1, avatarCandidates.length)
                          }))
                        }
                      />
                      ) : (
                      <View style={styles.pageAvatarPlaceholder}>
                        <Text style={styles.pageAvatarLetter}>{(normalizePageName(p) || 'P').charAt(0).toUpperCase()}</Text>
                      </View>
                      );
                    })()}
                    <View style={styles.pageMeta}>
                      <Text style={styles.pageItemText}>{normalizePageName(p) || `Page ${p.id}`}</Text>
                      {(normalizePageName(p).trim() || p.id) !== p.id ? <Text style={styles.pageIdText}>{p.id}</Text> : null}
                    </View>
                    <View style={[styles.pageMiniBadge, { backgroundColor: platformMeta.soft, borderColor: platformMeta.border }]}>
                      <Text style={[styles.pageMiniBadgeText, { color: platformMeta.accent }]}>{platformMeta.short}</Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.cancelBtn} onPress={() => setShowPagePicker(false)}>
              <Text style={styles.cancelText}>{t('close')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal visible={!!editingItem} transparent animationType="fade" onRequestClose={closeEditorWithGuard}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, styles.autoReplyModalCard]}>
            <ScrollView
              ref={autoModalScrollRef}
              style={styles.autoModalScroll}
              contentContainerStyle={styles.autoModalScrollContent}
              showsVerticalScrollIndicator
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {editingItem ? (
                <>
                <View style={styles.autoModalHeader}>
                  <Text style={styles.modalTitle}>{t('auto_reply_settings')}</Text>
                  <Text style={styles.modalPostId}>Post: {editingItem.post_id}</Text>
                </View>
                <View style={styles.modalSection}>
                  <Toggle label={t('comment_reply_message')} value={!!editDraft?.auto_reply_comment} onValueChange={(v) => setEditDraft((current) => (current ? { ...current, auto_reply_comment: v } : current))} />
                  <Toggle label={t('likes')} value={!!editDraft?.like_active} onValueChange={(v) => setEditDraft((current) => (current ? { ...current, like_active: v } : current))} />
                  <Toggle label={t('pm_reply_message')} value={!!editDraft?.auto_reply_pm} onValueChange={(v) => setEditDraft((current) => (current ? { ...current, auto_reply_pm: v } : current))} />
                </View>
                <View style={styles.modalSection}>
                  <View style={styles.inputHintRow}>
                    <MessageSquareMore size={15} color={colors.primaryDark} />
                    <Text style={styles.inputHintText}>{t('comment_reply_message')}</Text>
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder={t('comment_reply_message')}
                    placeholderTextColor={colors.muted}
                    value={editDraft?.message ?? ''}
                    onChangeText={(text) => setEditDraft((current) => (current ? { ...current, message: text } : current))}
                    multiline
                    textAlign="right"
                  />
                  <View style={styles.quickRepliesWrap}>
                    <Text style={styles.quickRepliesTitle}>{t('quick_comment_replies')}</Text>
                    <View style={styles.quickRepliesHintRow}>
                      <View style={styles.quickRepliesPlusBadge}>
                        <Text style={styles.quickRepliesPlusText}>+</Text>
                      </View>
                      <Text style={styles.quickRepliesHintText}>{t('quick_reply_add_hint')}</Text>
                    </View>
                    <View
                      style={styles.quickReplyInputRow}
                      onLayout={(e) => {
                        quickReplyInputRowYRef.current = e.nativeEvent.layout.y;
                      }}
                    >
                      <TextInput
                        ref={quickReplyInputRef}
                        style={[styles.input, styles.quickReplyInput]}
                        placeholder={t('quick_reply_custom_placeholder')}
                        placeholderTextColor={colors.muted}
                        value={quickReplyInput}
                        onChangeText={setQuickReplyInput}
                        textAlign="right"
                      />
                      <Pressable
                        style={[styles.quickReplyAddBtn, (!quickReplyInput.trim() || quickReplyBusy) ? styles.saveBtnDisabled : null]}
                        disabled={!quickReplyInput.trim() || quickReplyBusy}
                        onPress={() => {
                          const value = quickReplyInput.trim();
                          if (!value) return;
                          if (userQuickReplies.includes(value)) {
                            setQuickReplyInput('');
                            return;
                          }
                          const next = [...userQuickReplies, value];
                          setQuickReplyInput('');
                          void persistUserQuickReplies(next);
                        }}
                      >
                        <Text style={styles.quickReplyAddBtnText}>{quickReplyBusy ? t('saving') : t('add_button')}</Text>
                      </Pressable>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRepliesRow}>
                      {quickCommentReplies.map((reply, idx) => (
                        <View key={`quick_reply_${idx}`} style={styles.quickReplyChipWrap}>
                          <Pressable
                            style={styles.quickReplyChip}
                            onPress={() =>
                              setEditDraft((current) => {
                                if (!current) return current;
                                const prev = String(current.message ?? '').trim();
                                const next = prev ? `${prev}\n${reply}` : reply;
                                return { ...current, message: next };
                              })
                            }
                          >
                            <Text style={styles.quickReplyChipText}>{reply}</Text>
                          </Pressable>
                          {userQuickReplies.includes(reply) ? (
                            <Pressable
                              style={styles.quickReplyRemoveBtn}
                              onPress={() => {
                                const next = userQuickReplies.filter((x) => x !== reply);
                                void persistUserQuickReplies(next);
                              }}
                            >
                              <Text style={styles.quickReplyRemoveBtnText}>×</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      ))}
                      <Pressable
                        style={[styles.quickReplyChip, styles.quickReplyAddInlineChip]}
                        onPress={focusQuickReplyInput}
                      >
                        <Text style={styles.quickReplyAddInlineText}>+</Text>
                      </Pressable>
                    </ScrollView>
                    <Text style={[styles.quickRepliesTitle, { marginTop: 8 }]}>{t('quick_reply_tokens')}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRepliesRow}>
                      {quickPlaceholderTokens.map((token) => (
                        <Pressable
                          key={token}
                          style={[styles.quickReplyChip, styles.quickTokenChip]}
                          onPress={() =>
                            setEditDraft((current) => {
                              if (!current) return current;
                              const prev = String(current.message ?? '').trim();
                              const next = prev ? `${prev} ${token}` : token;
                              return { ...current, message: next };
                            })
                          }
                        >
                          <Text style={[styles.quickReplyChipText, styles.quickTokenChipText]}>{token}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                    <Text style={styles.quickReplyHelpText}>{t('quick_reply_help_short')}</Text>
                  </View>
                </View>
                <View style={styles.modalSection}>
                  <View style={styles.inputHintRow}>
                    <Mail size={15} color={colors.primaryDark} />
                    <Text style={styles.inputHintText}>{t('pm_reply_message')}</Text>
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder={t('pm_reply_message')}
                    placeholderTextColor={colors.muted}
                    value={editDraft?.pm_message ?? ''}
                    onChangeText={(text) => setEditDraft((current) => (current ? { ...current, pm_message: text } : current))}
                    multiline
                    textAlign="right"
                  />
                  <View style={styles.mediaPanel}>
                    <Pressable style={styles.mediaPanelHeader} onPress={() => setMediaSectionOpen((v) => !v)}>
                      <ChevronDown
                        size={18}
                        color="#0369a1"
                        style={[styles.mediaPanelChevron, mediaSectionOpen ? styles.mediaPanelChevronOpen : null]}
                      />
                      <View style={styles.mediaPanelHeaderRight}>
                        <Text style={styles.mediaPanelTitle}>{t('messenger_media')}</Text>
                        <Text style={styles.mediaPanelSub}>{t('media_types')}</Text>
                      </View>
                      <View style={styles.mediaPanelBadge}>
                        <Text style={styles.mediaPanelBadgeText}>{mediaSectionOpen ? t('close') : t('open')}</Text>
                      </View>
                    </Pressable>
                    {mediaSectionOpen ? (
                      <View style={styles.mediaPanelBody}>
                    <View style={styles.mediaCard}>
                      <Text style={styles.mediaCardTitle}>{t('image')}</Text>
                      {parseImageUrls(editDraft?.pm_image_url).length ? (
                        <View style={styles.imageGrid}>
                          {parseImageUrls(editDraft?.pm_image_url).map((img, idx) => (
                            <View key={`${img}-${idx}`} style={styles.imageItem}>
                              <Image
                                source={{ uri: normalizeMediaUrl(img) }}
                                style={styles.previewImage}
                                resizeMode="cover"
                                onError={() => setMediaPreviewError((s) => ({ ...s, image: true }))}
                              />
                              <Pressable style={styles.imageDeleteBadge} onPress={() => removeImageAtIndex(idx)}>
                                <Text style={styles.imageDeleteBadgeText}>?</Text>
                              </Pressable>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <Text style={styles.mediaEmpty}>{t('no_image')}</Text>
                      )}
                      <Text style={styles.mediaCountText}>{t('image')}: {parseImageUrls(editDraft?.pm_image_url).length}/{MAX_IMAGES}</Text>
                      {uploadingMedia === 'image' ? (
                        <Text style={styles.uploadProgressText}>{t('upload_progress')}: {imageUploadProgress}%</Text>
                      ) : null}
                      <View style={styles.mediaActionsRow}>
                        <Pressable
                          style={[styles.mediaBtn, parseImageUrls(editDraft?.pm_image_url).length >= MAX_IMAGES ? styles.saveBtnDisabled : null]}
                          disabled={uploadingMedia !== null || parseImageUrls(editDraft?.pm_image_url).length >= MAX_IMAGES}
                          onPress={() => pickAndUpload('image')}
                        >
                          <Text style={styles.mediaBtnText}>{t('upload')}</Text>
                        </Pressable>
                      </View>
                    </View>
                    <View style={styles.mediaCard}>
                      <Text style={styles.mediaCardTitle}>{t('video')}</Text>
                      {editDraft?.pm_video_url ? (
                        mediaPreviewError.video ? (
                          <Text style={styles.mediaError}>{t('cant_show_video_preview')}</Text>
                        ) : (
                          <Video
                            key={normalizeMediaUrl(editDraft.pm_video_url)}
                            source={{ uri: normalizeMediaUrl(editDraft.pm_video_url) }}
                            style={styles.previewVideo}
                            useNativeControls
                            resizeMode={ResizeMode.CONTAIN}
                            onError={() => setMediaPreviewError((s) => ({ ...s, video: true }))}
                          />
                        )
                      ) : (
                        <Text style={styles.mediaEmpty}>{t('no_video')}</Text>
                      )}
                      {uploadingMedia === 'video' ? (
                        <Text style={styles.uploadProgressText}>{t('upload_progress')}: {videoUploadProgress}%</Text>
                      ) : null}
                      <View style={styles.mediaActionsRow}>
                        <Pressable style={styles.mediaBtn} disabled={uploadingMedia !== null} onPress={() => pickAndUpload('video')}><Text style={styles.mediaBtnText}>{t('upload')}</Text></Pressable>
                        {editDraft?.pm_video_url ? (
                          <Pressable style={styles.mediaBtnDanger} onPress={() => removeMediaAndPersist('video')}><Text style={styles.mediaBtnText}>{t('delete_item')}</Text></Pressable>
                        ) : null}
                      </View>
                    </View>
                    <View style={styles.mediaCard}>
                      <Text style={styles.mediaCardTitle}>{t('audio')}</Text>
                      {editDraft?.pm_audio_url ? (
                        <View style={styles.audioPreviewCard}>
                          <Pressable style={styles.audioPlayBtn} onPress={() => previewAudio(editDraft.pm_audio_url ?? '')}>
                            <Text style={styles.audioPlayIcon}>{audioIsPlaying && activeAudioUri === normalizeMediaUrl(editDraft.pm_audio_url ?? '') ? '??' : '?'}</Text>
                          </Pressable>
                          <View style={styles.audioProgressWrap}>
                            <View style={styles.audioProgressTrack}>
                              <View
                                style={[
                                  styles.audioProgressFill,
                                  {
                                    width:
                                      audioDurationMs > 0 && activeAudioUri === normalizeMediaUrl(editDraft.pm_audio_url ?? '')
                                        ? `${Math.min(100, (audioPositionMs / audioDurationMs) * 100)}%`
                                        : '0%',
                                  },
                                ]}
                              />
                            </View>
                            <Text style={styles.audioTimeText}>
                              {activeAudioUri === normalizeMediaUrl(editDraft.pm_audio_url ?? '')
                                ? `${formatMs(audioPositionMs)} / ${audioDurationMs > 0 ? formatMs(audioDurationMs) : '--:--'}`
                                : '0:00 / --:--'}
                            </Text>
                          </View>
                        </View>
                      ) : (
                        <Text style={styles.mediaEmpty}>{t('no_audio')}</Text>
                      )}
                      {audioPreviewLoading ? <Text style={styles.uploadProgressText}>{t('loading_preview_audio')}</Text> : null}
                      {audioPreviewError ? <Text style={styles.mediaError}>{t('cant_play_audio')}</Text> : null}
                      <View style={styles.mediaActionsRow}>
                        <Pressable style={styles.mediaBtn} disabled={uploadingMedia !== null} onPress={() => pickAndUpload('audio')}><Text style={styles.mediaBtnText}>{t('upload')}</Text></Pressable>
                        <Pressable style={styles.mediaBtn} disabled={uploadingMedia !== null} onPress={recording ? stopAudioRecordAndUpload : startAudioRecord}><Text style={styles.mediaBtnText}>{recording ? t('stop_and_save') : t('record')}</Text></Pressable>
                        {editDraft?.pm_audio_url ? (
                          <Pressable style={styles.mediaBtnDanger} onPress={() => removeMediaAndPersist('audio')}><Text style={styles.mediaBtnText}>{t('delete_item')}</Text></Pressable>
                        ) : null}
                      </View>
                    </View>
                    {(() => {
                      const existing = parseFirstButton(editDraft?.pm_buttons_json ?? '');
                      const allButtons = parseButtons(editDraft?.pm_buttons_json ?? '');
                      const canAddMoreButtons = allButtons.length < MAX_BUTTONS;
                      return (
                        <View style={styles.existingButtonBox}>
                          <Text style={styles.existingButtonTitle}>{t('buttons_messenger')}</Text>
                          <Text style={styles.addButtonTitle}>{t('add_button')}</Text>
                          <Pressable
                            style={[styles.addMainButton, !canAddMoreButtons ? styles.saveBtnDisabled : null]}
                            disabled={!canAddMoreButtons}
                            onPress={() => setButtonPickerOpen((v) => !v)}
                          >
                            <Text style={styles.addMainButtonText}>{t('add_button')}</Text>
                          </Pressable>
                          {!canAddMoreButtons ? <Text style={styles.maxButtonsHint}>{tr('max_buttons_reached', { count: MAX_BUTTONS })}</Text> : null}
                          {buttonPickerOpen ? (
                            <View style={styles.inlinePickerCard}>
                              <Text style={styles.buttonPickerTitle}>{t('button_suggestions')}</Text>
                              <View style={styles.suggestedButtonsRow}>
              <Pressable style={[styles.suggestedChip, styles.chipWhatsapp]} onPress={() => { setButtonEditIndex(null); setButtonEditorKind('whatsapp'); setButtonEditorOpen(true); setButtonEditorText('??????'); setButtonEditorPhone(''); setButtonEditorUrl(''); setButtonEditorMessage(''); setButtonPickerOpen(false); }}>
                                  <Text style={[styles.suggestedChipText, styles.chipWhatsappText]}>WhatsApp</Text>
                                </Pressable>
              <Pressable style={[styles.suggestedChip, styles.chipTelegram]} onPress={() => { setButtonEditIndex(null); setButtonEditorKind('telegram'); setButtonEditorOpen(true); setButtonEditorText('????????'); setButtonEditorPhone(''); setButtonEditorUrl('https://t.me/'); setButtonEditorMessage(''); setButtonPickerOpen(false); }}>
                                  <Text style={[styles.suggestedChipText, styles.chipTelegramText]}>Telegram</Text>
                                </Pressable>
              <Pressable style={[styles.suggestedChip, styles.chipViber]} onPress={() => { setButtonEditIndex(null); setButtonEditorKind('viber'); setButtonEditorOpen(true); setButtonEditorText('??????'); setButtonEditorPhone(''); setButtonEditorUrl('https://invite.viber.com/'); setButtonEditorMessage(''); setButtonPickerOpen(false); }}>
                                  <Text style={[styles.suggestedChipText, styles.chipViberText]}>Viber</Text>
                                </Pressable>
              <Pressable style={[styles.suggestedChip, styles.chipWebsite]} onPress={() => { setButtonEditIndex(null); setButtonEditorKind('website'); setButtonEditorOpen(true); setButtonEditorText('???????'); setButtonEditorPhone(''); setButtonEditorUrl('https://'); setButtonEditorMessage(''); setButtonPickerOpen(false); }}>
                                  <Text style={[styles.suggestedChipText, styles.chipWebsiteText]}>Website</Text>
                                </Pressable>
              <Pressable style={[styles.suggestedChip, styles.chipOther]} onPress={() => { setButtonEditIndex(null); setButtonEditorKind('other'); setButtonEditorOpen(true); setButtonEditorText('????'); setButtonEditorPhone(''); setButtonEditorUrl('https://'); setButtonEditorMessage(''); setButtonPickerOpen(false); }}>
                                  <Text style={[styles.suggestedChipText, styles.chipOtherText]}>Other</Text>
                                </Pressable>
                              </View>
                            </View>
                          ) : null}
                          {allButtons.length ? (
                            <View style={styles.buttonListWrap}>
                              {allButtons.map((btn, idx) => (
                                <View
                                  key={`${btn.url}-${idx}`}
                                  style={[
                                    styles.existingButtonCard,
                                    detectButtonKind(btn.text, btn.url) === 'whatsapp'
                                      ? styles.existingCardWhatsapp
                                      : detectButtonKind(btn.text, btn.url) === 'telegram'
                                      ? styles.existingCardTelegram
                                      : detectButtonKind(btn.text, btn.url) === 'viber'
                                      ? styles.existingCardViber
                                      : detectButtonKind(btn.text, btn.url) === 'website'
                                      ? styles.existingCardWebsite
                                      : styles.existingCardOther,
                                  ]}
                                >
                                  <Text style={styles.existingButtonMeta}>{t('add_button')} #{idx + 1}</Text>
                                  <View
                                    style={[
                                      styles.existingButtonPreview,
                                      detectButtonKind(btn.text, btn.url) === 'whatsapp'
                                        ? styles.previewWhatsapp
                                        : detectButtonKind(btn.text, btn.url) === 'telegram'
                                        ? styles.previewTelegram
                                        : detectButtonKind(btn.text, btn.url) === 'viber'
                                        ? styles.previewViber
                                        : detectButtonKind(btn.text, btn.url) === 'website'
                                        ? styles.previewWebsite
                                        : styles.previewOther,
                                    ]}
                                  >
                                    <Text style={styles.existingButtonPreviewText}>{btn.text || 'Button'}</Text>
                                  </View>
                                  <Text style={styles.existingButtonUrl}>{btn.url || '-'}</Text>
                                  <View style={styles.existingButtonActions}>
                                    <Pressable
                                      style={[styles.editExistingBtn, styles.actionBtnHalf]}
                                      onPress={() => {
                                        const wa = parseWhatsappButton(JSON.stringify([{ title: btn.text, url: btn.url }]));
                                        const kind = wa.phone
                                          ? 'whatsapp'
                                          : btn.url.includes('t.me')
                                          ? 'telegram'
                                          : btn.url.startsWith('viber://') || btn.url.includes('viber')
                                          ? 'viber'
                                          : btn.url.includes('http')
                                          ? 'website'
                                          : 'other';
                                        setButtonEditIndex(idx);
                                        setButtonEditorKind(kind);
                                        setButtonEditorOpen(true);
                                        setButtonEditorText(btn.text || '');
                                        setButtonEditorUrl(btn.url || '');
                                        setButtonEditorPhone(wa.phone || '');
                                        setButtonEditorMessage(wa.message || '');
                                      }}
                                    >
                                      <Text style={styles.editExistingBtnText}>{t('edit')}</Text>
                                    </Pressable>
                                    <Pressable style={[styles.deleteExistingBtn, styles.actionBtnHalf]} onPress={() => removeButtonAndPersist(idx)}>
                                      <Text style={styles.deleteExistingBtnText}>{t('delete_item')}</Text>
                                    </Pressable>
                                  </View>
                                </View>
                              ))}
                            </View>
                          ) : (
                            <Text style={styles.mediaEmpty}>{t('no_buttons_yet')}</Text>
                          )}
                          {buttonEditorOpen ? (
                            <View style={styles.buttonEditorBox}>
                              <TextInput
                                style={styles.input}
                                placeholder={t('button_name_placeholder')}
                                placeholderTextColor={colors.muted}
                                value={buttonEditorText}
                                onChangeText={setButtonEditorText}
                                textAlign="right"
                              />
                              {buttonEditorKind === 'whatsapp' ? (
                                <>
                                  <TextInput
                                    style={[styles.input, styles.phoneInput]}
                                    placeholder={t('whatsapp_phone_placeholder')}
                                    placeholderTextColor={colors.muted}
                                    value={buttonEditorPhone}
                                    onChangeText={(text) => setButtonEditorPhone(text.replace(/[^0-9]/g, ''))}
                                    keyboardType="number-pad"
                                    textAlign="right"
                                  />
                                  <TextInput
                                    style={[styles.input, styles.jsonInput]}
                                    placeholder={t('whatsapp_text_placeholder')}
                                    placeholderTextColor={colors.muted}
                                    value={buttonEditorMessage}
                                    onChangeText={setButtonEditorMessage}
                                    multiline
                                    textAlign="right"
                                  />
                                </>
                              ) : (
                                <TextInput
                                  style={styles.input}
                                  placeholder={t('button_link_placeholder')}
                                  placeholderTextColor={colors.muted}
                                  value={buttonEditorUrl}
                                  onChangeText={setButtonEditorUrl}
                                  autoCapitalize="none"
                                  autoCorrect={false}
                                  textAlign="left"
                                />
                              )}
                              <View style={styles.mediaActionsRow}>
                                <Pressable
                                  style={styles.mediaBtn}
                                  onPress={saveButtonAndPersist}
                                >
                                  <Text style={styles.mediaBtnText}>{t('save_edit')}</Text>
                                </Pressable>
                                <Pressable style={styles.cancelBtn} onPress={() => setButtonEditorOpen(false)}>
                                  <Text style={styles.cancelText}>{t('cancel')}</Text>
                                </Pressable>
                              </View>
                            </View>
                          ) : null}
                        </View>
                      );
                    })()}
                    {uploadingMedia ? <Text style={styles.uploadingText}>Uploading {uploadingMedia}...</Text> : null}
                      </View>
                    ) : null}
                  </View>
                </View>
                <Pressable style={[styles.saveBtn, savingId === editingItem.id ? styles.saveBtnDisabled : null]} onPress={() => saveMessages(editingItem)} disabled={savingId === editingItem.id}>
                  <Text style={styles.saveBtnText}>{savingId === editingItem.id ? t('saving') : t('save')}</Text>
                </Pressable>
                </>
              ) : null}
              <Pressable style={styles.cancelBtn} onPress={closeEditorWithGuard}>
                <Text style={styles.cancelText}>{t('close')}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function Toggle({ label, value, onValueChange, disabled = false }: { label: string; value: boolean; onValueChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <View style={[styles.toggle, disabled ? styles.toggleDisabled : null]}>
      <Switch disabled={disabled} value={value} onValueChange={onValueChange} thumbColor={value ? colors.primary : '#fff'} trackColor={{ true: '#b7eaeb', false: '#d0d5dd' }} />
      <Text style={styles.toggleText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  platformTabs: { flexDirection: 'row-reverse', gap: 10, marginBottom: 2 },
  platformTab: { flex: 1, minHeight: 54, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', flexDirection: 'row-reverse', gap: 10, paddingHorizontal: 12, shadowColor: '#0f172a', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  platformTabActive: { backgroundColor: 'rgba(124,92,252,0.22)', borderColor: colors.primary, shadowOpacity: 0.1, elevation: 2 },
  platformIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  facebookIcon: { backgroundColor: '#1877F2', borderColor: '#1877F2' },
  instagramIcon: { backgroundColor: '#E1306C', borderColor: '#E1306C' },
  platformIconActive: { transform: [{ scale: 1.06 }] },
  platformIconText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  platformTabText: { color: colors.muted, fontWeight: '900', fontSize: 14 },
  platformTabTextActive: { color: colors.primaryDark },
  pageSelect: { minHeight: 62, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: spacing.md, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', shadowColor: '#0f172a', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  pageSelectLead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flex: 1 },
  pageSelectPlatformBadge: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  pageSelectPlatformBadgeText: { fontSize: 12, fontWeight: '900' },
  pageSelectMeta: { flex: 1, alignItems: 'flex-end' },
  pageSelectCaption: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  pageSelectText: { color: colors.text, fontWeight: '800', marginTop: 2 },
  blockWarn: { marginTop: 8, marginBottom: 2, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,71,87,0.45)', backgroundColor: 'rgba(255,71,87,0.14)', paddingVertical: 8, paddingHorizontal: 10 },
  blockWarnText: { color: '#ffd7dc', fontWeight: '900', textAlign: 'right' },
  blockWarnSub: { color: '#ffd7dc', fontWeight: '700', textAlign: 'right', marginTop: 4, fontSize: 12 },
  postFilterRow: { alignItems: 'flex-end', marginTop: 6, marginBottom: 4 },
  postFilterBtn: {
    minHeight: 30,
    borderRadius: 999,
    borderWidth: 1,
      borderColor: 'rgba(0,212,170,0.45)',
      backgroundColor: 'rgba(0,212,170,0.15)',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  postFilterBtnActive: { borderColor: 'rgba(124,92,252,0.45)', backgroundColor: 'rgba(124,92,252,0.2)' },
  postFilterBtnText: { color: '#a7f3d0', fontWeight: '800', fontSize: 12 },
  postFilterBtnTextActive: { color: '#ffffff' },
  activePostBar: { borderRadius: 999, borderWidth: 1, borderColor: 'rgba(0,212,170,0.45)', backgroundColor: 'rgba(0,212,170,0.14)', paddingVertical: 5, paddingHorizontal: 12, alignSelf: 'flex-end', marginBottom: spacing.sm },
  activePostText: { color: '#a7f3d0', fontWeight: '900', fontSize: 11, letterSpacing: 0.3 },
  inactivePostBar: { borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,71,87,0.45)', backgroundColor: 'rgba(255,71,87,0.14)', paddingVertical: 5, paddingHorizontal: 12, alignSelf: 'flex-end', marginBottom: spacing.sm },
  inactivePostText: { color: '#ffd7dc', fontWeight: '900', fontSize: 11, letterSpacing: 0.3 },
  postImage: { width: '100%', height: 198, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: colors.surfaceAlt, marginBottom: spacing.sm },
  postRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  post: { color: colors.text, fontWeight: '900', textAlign: 'right', fontSize: 13 },
  postIdChip: { maxWidth: '68%', minHeight: 28, borderRadius: 999, paddingHorizontal: 10, borderWidth: 1, borderColor: 'rgba(91,141,239,0.45)', backgroundColor: 'rgba(91,141,239,0.16)', alignItems: 'center', justifyContent: 'center' },
  postIdChipText: { color: '#c8ddff', fontWeight: '800', fontSize: 11 },
  infoBox: { marginTop: spacing.xs, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.04)', padding: spacing.sm },
  infoTitle: { color: colors.primaryDark, fontWeight: '900', textAlign: 'right', marginBottom: 6, fontSize: 12 },
  configBtn: { minHeight: 46, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm, borderWidth: 1, borderColor: 'rgba(124,92,252,0.6)' },
  configBtnText: { color: '#fff', fontWeight: '900', letterSpacing: 0.2 },
  postMessage: { color: colors.text, textAlign: 'right', marginTop: 6, marginBottom: 6, lineHeight: 20 },
  readMoreText: { color: '#9fc0ff', fontWeight: '800', textAlign: 'right', marginTop: 2 },
  postMeta: { color: colors.muted, textAlign: 'right', fontSize: 11, marginBottom: 2 },
  toggle: { minHeight: 44, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border },
  toggleDisabled: { opacity: 0.55 },
  toggleText: { color: colors.text, fontWeight: '700', textAlign: 'right' },
  notConfigured: { color: colors.muted, textAlign: 'right', fontSize: 12, marginTop: 8 },
  input: { minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceAlt, paddingHorizontal: spacing.sm, paddingVertical: 10, color: colors.text, marginTop: spacing.sm, textAlignVertical: 'top' },
  inputHintRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginTop: 4 },
  inputHintText: { color: colors.primaryDark, fontWeight: '800', fontSize: 12 },
  quickRepliesWrap: { marginTop: 8 },
  quickRepliesTitle: { color: colors.muted, fontWeight: '800', textAlign: 'right', fontSize: 11, marginBottom: 6 },
  quickRepliesHintRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginBottom: 8 },
  quickRepliesPlusBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(124,92,252,0.24)',
    borderWidth: 1,
    borderColor: 'rgba(124,92,252,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickRepliesPlusText: { color: '#fff', fontWeight: '900', fontSize: 12, lineHeight: 13 },
  quickRepliesHintText: { color: colors.muted, fontWeight: '700', fontSize: 10, textAlign: 'right' },
  quickReplyInputRow: { marginBottom: 8 },
  quickReplyInput: { minHeight: 40, marginTop: 0, marginBottom: 8 },
  quickReplyAddBtn: {
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(124,92,252,0.5)',
    backgroundColor: 'rgba(124,92,252,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickReplyAddBtnText: { color: colors.text, fontWeight: '800', fontSize: 12 },
  quickRepliesRow: { flexDirection: 'row-reverse', gap: 8, paddingVertical: 2 },
  quickReplyChipWrap: { position: 'relative' },
  quickReplyChip: {
    minHeight: 32,
    borderRadius: 16,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(124,92,252,0.4)',
    backgroundColor: 'rgba(124,92,252,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickReplyChipText: { color: colors.text, fontWeight: '700', fontSize: 12, textAlign: 'center' },
  
  quickReplyAddInlineChip: { borderColor: 'rgba(0,212,170,0.45)', backgroundColor: 'rgba(0,212,170,0.18)' },
  quickReplyAddInlineText: { color: '#cffff1', fontWeight: '900', fontSize: 16, lineHeight: 16 },
  quickReplyRemoveBtn: {
    position: 'absolute',
    top: -5,
    left: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255,71,87,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickReplyRemoveBtnText: { color: '#fff', fontSize: 11, fontWeight: '900', lineHeight: 12 },
  quickTokenChip: {
    borderColor: 'rgba(91,141,239,0.45)',
    backgroundColor: 'rgba(91,141,239,0.16)',
  },
  quickTokenChipText: { color: '#cfe1ff' },
  quickReplyHelpText: { color: colors.muted, textAlign: 'right', fontSize: 10, marginTop: 8, lineHeight: 15 },
  mediaPanel: { marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(124,92,252,0.35)', backgroundColor: 'rgba(255,255,255,0.03)', padding: 10 },
  mediaPanelHeader: { minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.03)', paddingHorizontal: 10, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  mediaPanelHeaderRight: { flex: 1, alignItems: 'flex-end', marginHorizontal: 8 },
  mediaPanelTitle: { color: colors.text, fontWeight: '900', textAlign: 'right', fontSize: 14 },
  mediaPanelSub: { color: colors.muted, fontWeight: '700', textAlign: 'right', fontSize: 11, marginTop: 1 },
  mediaPanelBadge: { minWidth: 52, height: 24, borderRadius: 12, backgroundColor: 'rgba(124,92,252,0.2)', borderWidth: 1, borderColor: 'rgba(124,92,252,0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  mediaPanelBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  mediaPanelChevron: { transform: [{ rotate: '-90deg' }] },
  mediaPanelChevronOpen: { transform: [{ rotate: '0deg' }] },
  mediaPanelBody: { marginTop: 8 },
  mediaCard: { borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 8, marginTop: 8 },
  mediaCardTitle: { color: colors.primaryDark, fontWeight: '900', textAlign: 'right', marginBottom: 6 },
  previewImage: { width: '100%', height: 120, borderRadius: 8, backgroundColor: colors.surfaceAlt },
  imageGrid: { gap: 8 },
  imageItem: { position: 'relative' },
  imageDeleteBadge: { position: 'absolute', top: 6, left: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(190,18,60,0.92)', alignItems: 'center', justifyContent: 'center' },
  imageDeleteBadgeText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  mediaCountText: { marginTop: 6, color: colors.muted, fontSize: 11, textAlign: 'right', fontWeight: '700' },
  previewVideo: { width: '100%', height: 150, borderRadius: 8, backgroundColor: '#0f172a' },
  mediaError: { color: '#b91c1c', textAlign: 'right', fontSize: 12, fontWeight: '700', marginTop: 4 },
  audioPreviewCard: { width: '100%', minHeight: 58, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: colors.border, flexDirection: 'row-reverse', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, gap: 10 },
  audioPlayBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#0ea5e9', alignItems: 'center', justifyContent: 'center' },
  audioPlayIcon: { color: '#fff', fontWeight: '900', fontSize: 14 },
  audioProgressWrap: { flex: 1, alignItems: 'stretch' },
  audioProgressTrack: { height: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  audioProgressFill: { height: '100%', borderRadius: 999, backgroundColor: '#0ea5e9' },
  audioTimeText: { marginTop: 6, color: colors.text, fontSize: 12, fontWeight: '700', textAlign: 'right' },
  mediaEmpty: { color: colors.muted, textAlign: 'right', fontSize: 12 },
  mediaActionsRow: { flexDirection: 'row-reverse', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  mediaBtn: { minHeight: 34, borderRadius: 8, backgroundColor: '#0ea5e9', paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  mediaBtnDanger: { minHeight: 34, borderRadius: 8, backgroundColor: '#ef4444', paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  mediaBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  uploadProgressText: { marginTop: 6, color: '#0369a1', fontSize: 12, fontWeight: '700', textAlign: 'right' },
  existingButtonBox: { marginTop: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 10 },
  existingButtonTitle: { color: colors.text, fontWeight: '800', textAlign: 'right', marginBottom: 2, fontSize: 13 },
  addButtonTitle: { color: colors.muted, fontWeight: '700', textAlign: 'right', marginTop: 2, marginBottom: 8, fontSize: 12 },
  existingButtonCard: { marginTop: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.02)', padding: 8 },
  existingCardWhatsapp: { borderColor: '#86efac', backgroundColor: '#f0fdf4' },
  existingCardTelegram: { borderColor: '#93c5fd', backgroundColor: '#eff6ff' },
  existingCardViber: { borderColor: '#c4b5fd', backgroundColor: '#f5f3ff' },
  existingCardWebsite: { borderColor: '#fdba74', backgroundColor: '#fff7ed' },
  existingCardOther: { borderColor: '#cbd5e1', backgroundColor: '#f8fafc' },
  buttonListWrap: { gap: 8 },
  existingButtonMeta: { color: colors.muted, fontSize: 11, fontWeight: '700', textAlign: 'right', marginBottom: 4 },
  existingButtonPreview: { marginTop: 6, alignSelf: 'flex-end', minHeight: 36, borderRadius: 8, backgroundColor: '#16a34a', paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  previewWhatsapp: { backgroundColor: '#16a34a' },
  previewTelegram: { backgroundColor: '#2563eb' },
  previewViber: { backgroundColor: '#7c3aed' },
  previewWebsite: { backgroundColor: '#ea580c' },
  previewOther: { backgroundColor: '#475569' },
  existingButtonPreviewText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  existingButtonUrl: { color: colors.muted, fontSize: 11, textAlign: 'left', marginTop: 6 },
  addMainButton: { marginTop: 4, minHeight: 36, borderRadius: 8, backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center' },
  addMainButtonText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  maxButtonsHint: { marginTop: 6, color: '#b45309', fontSize: 11, textAlign: 'right', fontWeight: '700' },
  buttonPickerCard: { maxWidth: 360 },
  inlinePickerCard: { marginTop: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.03)', padding: 8 },
  buttonPickerTitle: { color: colors.text, fontSize: 14, fontWeight: '800', textAlign: 'right', marginBottom: 8 },
  editExistingBtn: { marginTop: 8, minHeight: 34, borderRadius: 8, borderWidth: 1, borderColor: '#7dd3fc', backgroundColor: '#f0f9ff', alignItems: 'center', justifyContent: 'center' },
  editExistingBtnText: { color: '#0369a1', fontWeight: '700' },
  deleteExistingBtn: { marginTop: 8, minHeight: 34, borderRadius: 8, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fff1f2', alignItems: 'center', justifyContent: 'center' },
  deleteExistingBtnText: { color: '#be123c', fontWeight: '700' },
  existingButtonActions: { flexDirection: 'row-reverse', gap: 8, marginTop: 8 },
  actionBtnHalf: { flex: 1, marginTop: 0 },
  suggestedButtonsRow: { marginTop: 10, flexDirection: 'row-reverse', gap: 8, flexWrap: 'wrap' },
  suggestedChip: { minHeight: 30, paddingHorizontal: 10, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  suggestedChipText: { color: colors.text, fontWeight: '700', fontSize: 11 },
  chipWhatsapp: { backgroundColor: '#e8f8ef', borderColor: '#86efac' },
  chipWhatsappText: { color: '#15803d' },
  chipTelegram: { backgroundColor: '#eaf4ff', borderColor: '#93c5fd' },
  chipTelegramText: { color: '#1d4ed8' },
  chipViber: { backgroundColor: '#f3e8ff', borderColor: '#c4b5fd' },
  chipViberText: { color: '#6d28d9' },
  chipWebsite: { backgroundColor: '#fff7ed', borderColor: '#fdba74' },
  chipWebsiteText: { color: '#c2410c' },
  chipOther: { backgroundColor: '#f1f5f9', borderColor: '#cbd5e1' },
  chipOtherText: { color: '#334155' },
  buttonEditorBox: { marginTop: 8, borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 8 },
  phoneInput: { fontSize: 13, paddingVertical: 12 },
  uploadingText: { color: colors.muted, textAlign: 'right', marginTop: 6, fontSize: 12, fontWeight: '700' },
  mediaLinksRow: { marginTop: 8, gap: 4 },
  mediaLinkText: { color: colors.muted, textAlign: 'right', fontSize: 11, fontWeight: '700' },
  jsonInput: { minHeight: 90 },
  saveBtn: { minHeight: 42, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  saveBtnDisabled: { opacity: 0.65 },
  saveBtnText: { color: '#fff', fontWeight: '800' },
  helperText: { color: colors.muted, textAlign: 'right', fontSize: 12, marginBottom: 2 },
  empty: { color: colors.muted, textAlign: 'center' },
  reload: { minHeight: 48, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row-reverse', gap: 8 },
  reloadLoading: { backgroundColor: colors.primaryDark },
  reloadText: { color: '#fff', fontWeight: '900' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    padding: spacing.md,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.52,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14
  },
  pickerHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 6, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  pickerHeaderBadge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  pickerHeaderBadgeText: { fontSize: 13, fontWeight: '900', letterSpacing: 0.3 },
  pickerHeaderMeta: { flex: 1, alignItems: 'flex-end' },
  pickerHeaderTitle: { color: colors.text, fontWeight: '900', fontSize: 15 },
  pickerHeaderSubtitle: { color: colors.muted, fontSize: 11, marginTop: 2 },
  autoReplyModalCard: { borderRadius: 16, borderColor: colors.border, borderWidth: 1.2, backgroundColor: colors.backgroundAlt, padding: spacing.lg, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 12 }, elevation: 12 },
  autoModalScroll: { maxHeight: MODAL_MAX_HEIGHT },
  autoModalScrollContent: { paddingBottom: 12, flexGrow: 1 },
  autoModalHeader: { borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: colors.border, paddingVertical: 10, paddingHorizontal: spacing.sm, marginBottom: spacing.sm },
  modalSection: { borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.03)', paddingHorizontal: spacing.sm, paddingVertical: 8, marginBottom: spacing.sm },
  pageList: { maxHeight: 320, marginTop: 4 },
  pageItem: { minHeight: 66, borderRadius: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', paddingHorizontal: spacing.md, backgroundColor: 'rgba(255,255,255,0.045)', marginBottom: 8 },
  pageItemActive: { borderColor: 'rgba(124,92,252,0.75)', backgroundColor: 'rgba(124,92,252,0.28)' },
  pageRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  pageAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  pageAvatarPlaceholder: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(124,92,252,0.2)', borderWidth: 1, borderColor: 'rgba(124,92,252,0.4)', alignItems: 'center', justifyContent: 'center' },
  pageAvatarLetter: { color: colors.text, fontWeight: '800' },
  pageMeta: { flex: 1, alignItems: 'flex-end' },
  pageItemText: { color: colors.text, textAlign: 'right', fontWeight: '800' },
  pageIdText: { color: colors.muted, fontSize: 11, marginTop: 2 },
  pageMiniBadge: { minWidth: 34, height: 24, borderRadius: 12, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  pageMiniBadgeText: { fontSize: 10, fontWeight: '900' },
  modalTitle: { color: colors.text, fontWeight: '900', fontSize: 16, textAlign: 'right' },
  modalPostId: { color: colors.muted, textAlign: 'right', marginTop: 4, fontWeight: '700' },
  cancelBtn: { minHeight: 46, marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: colors.text, fontWeight: '800' }
});



















