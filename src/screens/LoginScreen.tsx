import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ShieldCheck, X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useAuth } from '../state/AuthContext';
import { useLanguage } from '../state/LanguageContext';
import { colors, spacing } from '../theme';

type IssueTokenResponse = {
  success: boolean;
  error?: string;
  session?: { token: string; expires_at: string };
};

export function LoginScreen() {
  const { signIn, baseUrl } = useAuth();
  const { t } = useLanguage();
  const webRef = useRef<WebView>(null);
  const issuedTokenRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [showWebLogin, setShowWebLogin] = useState(false);
  const [webLoading, setWebLoading] = useState(false);
  const [webError, setWebError] = useState<string | null>(null);
  const [capturingSession, setCapturingSession] = useState(false);

  const apiUrl = baseUrl.trim();
  const loginUrl = 'https://walam.app/facebook-login.php?instagram=1';
  const issueTokenUrl = useMemo(() => `${apiUrl}?action=issue_token`, [apiUrl]);
  const allowedHosts = useMemo(() => {
    const hosts = new Set<string>(['walam.app', 'www.walam.app', 'facebook.com', 'www.facebook.com', 'm.facebook.com']);
    try {
      const apiHost = new URL(apiUrl).host;
      if (apiHost) hosts.add(apiHost);
    } catch {}
    return hosts;
  }, [apiUrl]);

  async function openFacebookLogin() {
    if (!apiUrl) {
      Alert.alert(t('error'), t('api_not_configured'));
      return;
    }
    issuedTokenRef.current = false;
    setWebError(null);
    setCapturingSession(false);
    setShowWebLogin(true);
  }


  function closeWebLogin() {
    try {
      webRef.current?.stopLoading();
      webRef.current?.injectJavaScript('window.stop(); true;');
    } catch {}
    issuedTokenRef.current = false;
    setShowWebLogin(false);
    setWebLoading(false);
    setCapturingSession(false);
    setWebError(null);
  }

  async function handleIssueTokenBody(body: string) {
    const raw = String(body ?? '').trim();
    const normalized = (() => {
      try {
        return JSON.stringify(JSON.parse(raw));
      } catch {
        const start = raw.indexOf('{');
        const end = raw.lastIndexOf('}');
        if (start >= 0 && end > start) {
          return raw.slice(start, end + 1);
        }
        return raw;
      }
    })();
    try {
      const parsed = JSON.parse(normalized) as IssueTokenResponse;
      if (!parsed.success || !parsed.session?.token) {
        if (parsed.error) {
          Alert.alert(t('login_failed'), parsed.error);
        }
        return;
      }
      setLoading(true);
      try {
        await signIn(apiUrl, parsed.session.token);
        closeWebLogin();
      } catch (error) {
        Alert.alert(t('dashboard_open_failed'), error instanceof Error ? error.message : t('unknown_error'));
      }
    } catch {
      // not token json
    } finally {
      setLoading(false);
      setCapturingSession(false);
    }
  }

  async function onWebMessage(event: WebViewMessageEvent) {
    const payload = String(event.nativeEvent.data ?? '');
    try {
      const data = JSON.parse(payload) as { type?: string; body?: string };
      if (data.type === 'issue_token_response' && data.body) {
        await handleIssueTokenBody(data.body);
        return;
      }
    } catch {
      await handleIssueTokenBody(payload);
    }
  }

  function goIssueToken() {
    if (issuedTokenRef.current) return;
    issuedTokenRef.current = true;
    setCapturingSession(true);
    const issueUrlJson = JSON.stringify(issueTokenUrl);
    webRef.current?.injectJavaScript(`
      (async function(){
        try {
          var u = ${issueUrlJson};
          var r = await fetch(u, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'issue_token' })
          });
          var b = await r.text();
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'issue_token_response', body: b }));
        } catch (e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'issue_token_response', body: JSON.stringify({ success:false, error:'issue_token_failed' }) }));
        }
      })();
      true;
    `);
  }

  return (
    <View style={styles.root}>
      <View style={styles.brand}>
        <ShieldCheck color={colors.primary} size={42} />
        <Text style={styles.title}>{t('app_name')}</Text>
        <Text style={styles.subtitle}>{t('enter_app')}</Text>
      </View>

      <Pressable style={styles.buttonFacebook} onPress={openFacebookLogin} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('enter_app')}</Text>}
      </Pressable>

      <Modal visible={showWebLogin} animationType="slide" onRequestClose={closeWebLogin}>
        <SafeAreaView style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <Pressable style={styles.iconBtn} onPress={closeWebLogin}>
              <X color={colors.text} size={20} />
            </Pressable>
            <Text style={styles.modalTitle}>{t('enter_app')}</Text>
            <View style={styles.iconBtn} />
          </View>

          <View style={styles.webWrap}>
            <WebView
              ref={webRef}
              source={{ uri: loginUrl }}
              javaScriptEnabled
              domStorageEnabled
              incognito
              cacheEnabled={false}
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
              onShouldStartLoadWithRequest={(req) => {
                const raw = String(req?.url || '').trim();
                if (!raw || raw.startsWith('about:blank')) return true;
                try {
                  const u = new URL(raw);
                  return u.protocol === 'https:' && allowedHosts.has(u.host);
                } catch {
                  return false;
                }
              }}
              onMessage={onWebMessage}
              onLoadStart={() => {
                setWebLoading(true);
                setWebError(null);
              }}
              onLoadEnd={(e) => {
                setWebLoading(false);
                const url = e.nativeEvent.url || '';
                if (url.includes('dashboard') || url.includes('admin') || url.includes('callback')) {
                  goIssueToken();
                }
              }}
              onError={() => {
                setWebLoading(false);
                setCapturingSession(false);
                setWebError(t('network_error_try_again'));
              }}
              startInLoadingState
            />

            {(webLoading || capturingSession) ? (
              <View style={styles.overlay} pointerEvents="none">
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.overlayText}>{t('please_wait')}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.bottomBar}>
            {webError ? <Text style={styles.errorText}>{webError}</Text> : null}
            <Pressable style={styles.continueBtn} onPress={goIssueToken}>
              <Text style={styles.continueText}>{t('continue')}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, padding: spacing.xl, justifyContent: 'center', gap: spacing.xl },
  brand: { alignItems: 'center', gap: spacing.sm },
  title: { fontSize: 40, fontWeight: '900', color: colors.text, letterSpacing: -0.5 },
  subtitle: { color: colors.muted, textAlign: 'center', lineHeight: 22 },
  buttonFacebook: { minHeight: 52, borderRadius: 16, backgroundColor: '#1877f2', alignItems: 'center', justifyContent: 'center', shadowColor: '#1877f2', shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  buttonText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  modalRoot: { flex: 1, backgroundColor: colors.background },
  modalHeader: { minHeight: 56, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.backgroundAlt },
  webWrap: { flex: 1 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { color: colors.text, fontWeight: '800' },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  overlayText: { marginTop: 10, color: colors.muted, fontWeight: '700' },
  bottomBar: { padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.backgroundAlt, gap: 8 },
  continueBtn: { minHeight: 48, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  continueText: { color: '#fff', fontWeight: '900' },
  errorText: { color: colors.danger, textAlign: 'center' }
});
