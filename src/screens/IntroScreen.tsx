import React, { useState } from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Globe, MessageCircle, Tag, Facebook, LayoutPanelTop } from 'lucide-react-native';
import { Card } from '../components/Card';
import { colors, spacing } from '../theme';
import { useLanguage } from '../state/LanguageContext';

export function IntroScreen() {
  const navigation = useNavigation<any>();
  const { lang, isRTL, setLang, t } = useLanguage();
  const whatsappNumber = '96407509205118';
  const [showPlans, setShowPlans] = useState(false);

  async function openWhatsApp(message: string) {
    const text = encodeURIComponent(message);
    const urls = [
      `whatsapp://send?phone=${whatsappNumber}&text=${text}`,
      `https://wa.me/${whatsappNumber}?text=${text}`,
      `https://api.whatsapp.com/send?phone=${whatsappNumber}&text=${text}`,
    ];
    for (const url of urls) {
      try {
        const supported = await Linking.canOpenURL(url);
        if (!supported) continue;
        await Linking.openURL(url);
        return;
      } catch {}
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <View style={styles.hero}>
          <View style={styles.logoFrame}>
            <Image source={require('../../assets/walam-icon.png')} style={styles.logoImage} />
          </View>
          <Text style={[styles.brand, { textAlign: isRTL ? 'right' : 'left' }]}>{t('app_name')}</Text>
          <Text style={[styles.subtitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('intro_subtitle')}</Text>
        </View>
      </View>

      <Card>
        <InfoRow icon={<LayoutPanelTop color={colors.primary} size={18} />} label={t('use_cases')} value="Dashboard, Pages, Automation, Chat Flow" />
        <InfoRow icon={<Tag color={colors.primary} size={18} />} label={t('pricing')} value={`${t('plan_monthly_price')} / ${t('plan_yearly_price')}`} onPress={() => setShowPlans(true)} />
        <InfoRow icon={<MessageCircle color={colors.primary} size={18} />} label={t('whatsapp')} value="96407509205118" onPress={() => openWhatsApp('Hello')} />
        <InfoRow icon={<Globe color={colors.primary} size={18} />} label={t('website')} value="walam.app" onPress={() => Linking.openURL('https://walam.app')} />
        <InfoRow icon={<Facebook color={colors.primary} size={18} />} label={t('platform')} value="Facebook / Instagram / Messenger" />
      </Card>

      <View style={[styles.quickRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Pressable style={styles.quickBtn} onPress={() => setShowPlans(true)}>
          <Text style={styles.quickBtnText}>{t('pricing')}</Text>
        </Pressable>
        <Pressable style={styles.quickBtn} onPress={() => Linking.openURL('https://walam.app')}>
          <Text style={styles.quickBtnText}>{t('website')}</Text>
        </Pressable>
      </View>

      <Pressable style={styles.primaryBtn} onPress={() => navigation.navigate('Login')}>
        <Text style={styles.primaryText}>{t('enter_app')}</Text>
      </Pressable>

      <View style={styles.langWrap}>
        <Text style={[styles.langTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('language')}</Text>
        <View style={[styles.langRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <Pressable style={[styles.langBtn, lang === 'ku' ? styles.langBtnActive : null]} onPress={() => void setLang('ku')}>
            <KurdistanFlagIcon />
            <Text style={[styles.langText, lang === 'ku' ? styles.langTextActive : null]}>کوردی</Text>
          </Pressable>
          <Pressable style={[styles.langBtn, lang === 'en' ? styles.langBtnActive : null]} onPress={() => void setLang('en')}>
            <Text style={styles.langFlag}>🇺🇸</Text>
            <Text style={[styles.langText, lang === 'en' ? styles.langTextActive : null]}>English</Text>
          </Pressable>
          <Pressable style={[styles.langBtn, lang === 'ar' ? styles.langBtnActive : null]} onPress={() => void setLang('ar')}>
            <Text style={styles.langFlag}>🇮🇶</Text>
            <Text style={[styles.langText, lang === 'ar' ? styles.langTextActive : null]}>العربية</Text>
          </Pressable>
        </View>
      </View>

      <Modal visible={showPlans} transparent animationType="fade" onRequestClose={() => setShowPlans(false)}>
        <View style={styles.planOverlay}>
          <View style={styles.planModal}>
            <View style={[styles.planHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Text style={[styles.planModalTitle, { textAlign: isRTL ? 'right' : 'left' }]}>{t('buy_plan')}</Text>
              <Pressable style={styles.planClose} onPress={() => setShowPlans(false)}>
                <Text style={styles.planCloseText}>×</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.planList} showsVerticalScrollIndicator={false}>
              <PlanCard
                badge={t('plan_basic')}
                badgeStyle={styles.planBadgeMonthly}
                price={t('plan_monthly_price')}
                subtitle={t('plan_start_now')}
                features={[t('plan_monthly_feature_1'), t('plan_monthly_feature_2'), t('plan_monthly_feature_3')]}
                isRTL={isRTL}
              />
              <PlanCard
                badge={t('plan_popular')}
                badgeStyle={styles.planBadgeQuarterly}
                price={t('plan_quarterly_price')}
                subtitle={t('plan_save_more')}
                features={[t('plan_quarterly_feature_1'), t('plan_quarterly_feature_2'), t('plan_quarterly_feature_3')]}
                isRTL={isRTL}
                highlighted
              />
              <PlanCard
                badge={t('plan_best_value')}
                badgeStyle={styles.planBadgeYearly}
                price={t('plan_yearly_price')}
                subtitle={t('plan_full_access')}
                features={[t('plan_yearly_feature_1'), t('plan_yearly_feature_2'), t('plan_yearly_feature_3')]}
                isRTL={isRTL}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function InfoRow({ icon, label, value, onPress }: { icon: React.ReactNode; label: string; value: string; onPress?: () => void }) {
  const { isRTL } = useLanguage();
  const content = (
    <View style={[styles.row, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { textAlign: isRTL ? 'right' : 'left' }]}>{label}</Text>
        <Text style={[styles.rowValue, onPress ? styles.rowValueLink : null, { textAlign: isRTL ? 'right' : 'left' }]}>{value}</Text>
      </View>
      <View style={styles.iconWrap}>{icon}</View>
    </View>
  );
  if (onPress) return <Pressable onPress={onPress}>{content}</Pressable>;
  return content;
}

function KurdistanFlagIcon() {
  return (
    <View style={styles.kFlag}>
      <View style={[styles.kFlagBand, { backgroundColor: '#d21f26' }]} />
      <View style={[styles.kFlagBand, { backgroundColor: '#ffffff' }]} />
      <View style={[styles.kFlagBand, { backgroundColor: '#1f8f3a' }]} />
      <View style={styles.kFlagSun} />
    </View>
  );
}

function PlanCard({
  badge,
  badgeStyle,
  price,
  subtitle,
  features,
  isRTL,
  highlighted = false,
}: {
  badge: string;
  badgeStyle: object;
  price: string;
  subtitle: string;
  features: string[];
  isRTL: boolean;
  highlighted?: boolean;
}) {
  return (
    <View style={[styles.planCard, highlighted ? styles.planCardHighlight : null]}>
      <View style={[styles.planBadge, badgeStyle]}>
        <Text style={styles.planBadgeText}>{badge}</Text>
      </View>
      <Text style={[styles.planPrice, { textAlign: isRTL ? 'right' : 'left' }]}>{price}</Text>
      <Text style={[styles.planSub, { textAlign: isRTL ? 'right' : 'left' }]}>{subtitle}</Text>
      <View style={styles.planFeatures}>
        {features.map((feature, idx) => (
          <Text key={`${feature}-${idx}`} style={[styles.planFeature, { textAlign: isRTL ? 'right' : 'left' }]}>
            • {feature}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0F' },
  content: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 46, gap: 24 },
  heroCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingVertical: 24,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 15,
  },
  hero: { gap: 10, alignItems: 'center' },
  logoFrame: {
    width: 98,
    height: 98,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  logoImage: { width: 80, height: 80, borderRadius: 20 },
  brand: { fontSize: 34, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 },
  subtitle: { color: 'rgba(255,255,255,0.6)', lineHeight: 22, fontSize: 15, maxWidth: 320 },
  row: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  rowText: { flex: 1 },
  rowLabel: { color: 'rgba(255,255,255,0.45)', fontWeight: '700', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  rowValue: { color: 'rgba(255,255,255,0.85)', marginTop: 4, fontSize: 15, fontWeight: '600' },
  rowValueLink: { color: colors.primary, fontWeight: '700' },
  iconWrap: { width: 32, alignItems: 'center' },
  quickRow: { gap: 10 },
  quickBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  primaryBtn: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  primaryText: { color: '#FFF', fontWeight: '700', fontSize: 17 },
  enterBtn: { minHeight: 52, borderRadius: 16, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  enterText: { color: '#fff', fontWeight: '900' },
  langWrap: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  langTitle: { color: '#FFFFFF', fontWeight: '700', marginBottom: 10, fontSize: 18 },
  langRow: { gap: 10 },
  langBtn: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 6,
  },
  langBtnActive: { borderColor: colors.primary, borderWidth: 1.5, backgroundColor: 'rgba(124,92,252,0.12)' },
  langFlag: { fontSize: 16 },
  langText: { color: 'rgba(255,255,255,0.78)', fontWeight: '600', fontSize: 12 },
  langTextActive: { color: colors.primary, fontWeight: '700' },
  kFlag: { width: 22, height: 14, borderRadius: 2, overflow: 'hidden', borderWidth: 0.7, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center' },
  kFlagBand: { width: '100%', flex: 1 },
  kFlagSun: { position: 'absolute', width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#facc15' },
  planOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 18 },
  planModal: {
    maxHeight: '84%',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 15,
  },
  planHeader: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  planModalTitle: { color: '#FFFFFF', fontWeight: '700', fontSize: 18 },
  planClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  planCloseText: { color: '#FFFFFF', fontWeight: '800', fontSize: 18, lineHeight: 20 },
  planList: { gap: 12, paddingBottom: 4 },
  planCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  planCardHighlight: {
    borderColor: 'rgba(124,92,252,0.65)',
    shadowColor: colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 12,
  },
  planBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, minHeight: 24, borderRadius: 999, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  planBadgeMonthly: { backgroundColor: 'rgba(59,130,246,0.22)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.45)' },
  planBadgeQuarterly: { backgroundColor: 'rgba(124,92,252,0.24)', borderWidth: 1, borderColor: 'rgba(124,92,252,0.55)' },
  planBadgeYearly: { backgroundColor: 'rgba(245,158,11,0.22)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.45)' },
  planBadgeText: { color: '#FFFFFF', fontWeight: '700', fontSize: 11 },
  planPrice: { color: '#FFFFFF', fontWeight: '800', fontSize: 24, letterSpacing: 0.2 },
  planSub: { color: 'rgba(255,255,255,0.6)', fontWeight: '600', fontSize: 12, marginTop: 3, marginBottom: 8 },
  planFeatures: { gap: 4 },
  planFeature: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 18, fontWeight: '600' },
});
