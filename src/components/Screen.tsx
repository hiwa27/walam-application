import React from 'react';
import { KeyboardAvoidingView, NativeScrollEvent, NativeSyntheticEvent, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';
import { useLanguage } from '../state/LanguageContext';

export function Screen({
  title,
  subtitle,
  children,
  onRefresh,
  refreshing = false,
  onScroll,
  headerRight
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  headerRight?: React.ReactNode;
}) {
  const { isRTL } = useLanguage();
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
        >
          <View style={styles.bgBase} />
          <View style={styles.bgOrbTop} />
          <View style={styles.bgOrbBottom} />
          <View style={styles.bgOrbMid} />
          <View style={styles.header}>
            <View style={[styles.headerTopRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              {headerRight ? <View style={styles.headerRight}>{headerRight}</View> : null}
              <Text style={[styles.title, { textAlign: isRTL ? 'right' : 'left' }]}>{title}</Text>
            </View>
            {subtitle ? <Text style={[styles.subtitle, { textAlign: isRTL ? 'right' : 'left' }]}>{subtitle}</Text> : null}
          </View>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.md, paddingBottom: spacing.x4l, overflow: 'hidden' },
  bgBase: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.background },
  bgOrbTop: { position: 'absolute', top: -130, right: -80, width: 280, height: 280, borderRadius: 140, backgroundColor: 'rgba(124,92,252,0.16)' },
  bgOrbBottom: { position: 'absolute', bottom: 30, left: -100, width: 230, height: 230, borderRadius: 115, backgroundColor: 'rgba(91,141,239,0.15)' },
  bgOrbMid: { position: 'absolute', top: '45%', right: -50, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(0,212,170,0.09)' },
  header: { gap: 6, padding: spacing.lg, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: colors.border },
  headerTopRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  headerRight: { marginLeft: spacing.sm },
  title: { color: colors.text, fontSize: 26, fontWeight: '900', textAlign: 'right', letterSpacing: -0.3 },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: 'right' }
});
