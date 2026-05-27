import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CircleAlert, ShieldCheck } from 'lucide-react-native';
import { Card } from '../components/Card';
import { Screen } from '../components/Screen';
import { api } from '../api/client';
import { useLanguage } from '../state/LanguageContext';
import { colors, spacing } from '../theme';
import { playRefreshSound } from '../utils/refresh';

type SpamResult = { is_spam: boolean; spam_score: number; confidence: string; keywords: string[] };

export function SpamTesterScreen() {
  const { t } = useLanguage();
  const [text, setText] = useState('');
  const [result, setResult] = useState<SpamResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function test() {
    if (!text.trim()) {
      Alert.alert(t('text_required'), t('enter_comment_first'));
      return;
    }
    setLoading(true);
    try {
      const res = await api.request<SpamResult>('test_spam', { text });
      setResult(res);
    } catch (error) {
      Alert.alert(t('error'), error instanceof Error ? error.message : t('spam_test_failed'));
    } finally {
      setLoading(false);
    }
  }

  async function handlePullRefresh() {
    setRefreshing(true);
    await playRefreshSound();
    setRefreshing(false);
  }

  return (
    <Screen title={t('spam_tester_title')} subtitle={t('spam_tester_subtitle')} onRefresh={handlePullRefresh} refreshing={refreshing}>
      <Card>
        <Text style={styles.inputLabel}>{t('comment_text')}</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          placeholder={t('write_comment')}
          placeholderTextColor="#98a2b3"
          style={styles.textarea}
          textAlignVertical="top"
        />
        <Pressable style={styles.button} onPress={test} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('test')}</Text>}
        </Pressable>
      </Card>

      {result ? (
        <Card>
          <View style={styles.resultHead}>
            {result.is_spam ? <CircleAlert size={18} color={colors.danger} /> : <ShieldCheck size={18} color={colors.success} />}
            <Text style={[styles.resultState, { color: result.is_spam ? colors.danger : colors.success }]}>{result.is_spam ? t('spam') : t('safe')}</Text>
          </View>
          <Text style={styles.score}>{result.spam_score}%</Text>
          <Text style={styles.label}>{t('confidence')}: {result.confidence}</Text>
          <Text style={styles.keywords}>{t('detected_keywords')}: {result.keywords.join(', ') || t('none')}</Text>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  inputLabel: { color: colors.text, fontWeight: '800', textAlign: 'right', marginBottom: spacing.sm },
  textarea: { minHeight: 150, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surfaceAlt, padding: spacing.md, color: colors.text, textAlign: 'right' },
  button: { marginTop: spacing.md, minHeight: 50, borderRadius: 8, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontWeight: '900' },
  resultHead: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  resultState: { fontWeight: '900', fontSize: 16 },
  score: { fontSize: 36, fontWeight: '900', textAlign: 'right', color: colors.text, marginTop: spacing.sm },
  label: { color: colors.muted, textAlign: 'right' },
  keywords: { color: colors.text, marginTop: spacing.sm, textAlign: 'right' }
});
