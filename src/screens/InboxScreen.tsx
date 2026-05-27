import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Bell, Trash2 } from 'lucide-react-native';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { api } from '../api/client';
import type { AdminInboxMessage } from '../api/types';
import { useLanguage } from '../state/LanguageContext';
import { colors, spacing } from '../theme';
import { playRefreshSound } from '../utils/refresh';

export function InboxScreen() {
  const { t } = useLanguage();
  const [items, setItems] = useState<AdminInboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      // mark_read=1 keeps unread styling in payload (fetched first), then clears unread on server
      const res = await api.request<{ messages?: AdminInboxMessage[] }>('admin_inbox', { mark_read: 1, limit: 40 });
      setItems(res.messages ?? []);
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      if (!msg.includes('unknown_action')) {
        Alert.alert(t('error'), msg || t('failed_load_inbox'));
      }
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function handlePullRefresh() {
    await playRefreshSound();
    await load();
  }

  async function deleteMessage(messageId: number) {
    if (messageId <= 0) return;
    setDeletingId(messageId);
    try {
      await api.request<{ deleted?: boolean }>('admin_inbox_delete', { message_id: messageId });
      setItems((prev) => prev.filter((x) => Number(x.id ?? 0) !== messageId));
    } catch (error) {
      Alert.alert(t('error'), error instanceof Error ? error.message : t('failed_delete_message'));
    } finally {
      setDeletingId(null);
    }
  }

  function onPressDelete(messageId: number) {
    if (messageId <= 0) return;
    Alert.alert(t('delete_message'), t('delete_message_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: () => { void deleteMessage(messageId); } }
    ]);
  }

  useEffect(() => {
    load();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      load();
      return () => {};
    }, [])
  );

  const unreadCount = items.filter((item) => Boolean(item?.is_unread)).length;

  return (
    <Screen title={t('inbox_title')} subtitle={t('inbox_subtitle')} onRefresh={handlePullRefresh} refreshing={loading}>
      {loading ? <ActivityIndicator color={colors.primary} /> : null}

      {!loading && unreadCount > 0 ? (
        <Card style={styles.unreadSummaryCard}>
          <Text style={styles.unreadSummaryText}>{`${unreadCount} ${unreadCount > 1 ? t('unread_messages') : t('unread_message')}`}</Text>
        </Card>
      ) : null}

      {items.map((item, i) => {
        const id = Number(item.id ?? 0);
        const isUnread = Boolean(item.is_unread);
        return (
          <Card key={`${item.id ?? i}-${item.created_at ?? ''}`} style={isUnread ? styles.unreadCard : undefined}>
            <View style={styles.topRow}>
              <Text style={styles.title}>{item.title || t('new_message')}</Text>
              <Pressable
                style={({ pressed }) => [styles.deleteBtn, pressed && styles.deleteBtnPressed]}
                onPress={() => onPressDelete(id)}
                disabled={id <= 0 || deletingId === id}
              >
                <Trash2 size={16} color={deletingId === id ? '#9ca3af' : '#dc2626'} />
              </Pressable>
            </View>
            <Text style={styles.body}>{item.body || item.message || ''}</Text>
            <Text style={styles.date}>{item.created_at || ''}</Text>
          </Card>
        );
      })}

      {!loading && items.length === 0 ? (
        <Card>
          <View style={styles.emptyIcon}><Bell size={16} color={colors.muted} /></View>
          <Text style={styles.empty}>{t('no_messages_yet')}</Text>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  unreadSummaryCard: { backgroundColor: 'rgba(124,92,252,0.2)', borderColor: 'rgba(124,92,252,0.45)' },
  unreadSummaryText: { color: '#fff', fontWeight: '800', textAlign: 'right' },
  unreadCard: { backgroundColor: 'rgba(91,141,239,0.12)', borderColor: 'rgba(91,141,239,0.4)' },
  topRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { color: colors.text, fontWeight: '900', textAlign: 'right' },
  body: { color: colors.muted, textAlign: 'right', marginTop: spacing.sm, lineHeight: 20 },
  date: { color: colors.tertiary, textAlign: 'right', marginTop: spacing.sm, fontSize: 12 },
  deleteBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,71,87,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,71,87,0.4)'
  },
  deleteBtnPressed: { opacity: 0.8, transform: [{ scale: 0.94 }] },
  emptyIcon: { alignItems: 'center', marginBottom: 6 },
  empty: { color: colors.muted, textAlign: 'center' }
});
