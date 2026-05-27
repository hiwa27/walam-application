import 'react-native-gesture-handler';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BottomTabBarProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Bot, Home, MessageSquare, Settings, ToggleLeft, GitBranch } from 'lucide-react-native';
import { AuthProvider, useAuth } from './src/state/AuthContext';
import { LanguageProvider, useLanguage } from './src/state/LanguageContext';
import { IntroScreen } from './src/screens/IntroScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { PagesScreen } from './src/screens/PagesScreen';
import { AutomationsScreen } from './src/screens/AutomationsScreen';
import { InboxScreen } from './src/screens/InboxScreen';
import { HelpScreen } from './src/screens/HelpScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { colors } from './src/theme';
import { api } from './src/api/client';
import type { AdminInboxMessage } from './src/api/types';
import { playInboxSound } from './src/utils/refresh';

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

const TAB_ITEMS = [
  { key: 'Dashboard', labelKey: 'home', icon: Home },
  { key: 'Inbox', labelKey: 'inbox', icon: MessageSquare },
  { key: 'Pages', labelKey: 'stats', icon: Bot },
  { key: 'Automations', labelKey: 'posts', icon: ToggleLeft },
  { key: 'Help', labelKey: 'chat_flow', icon: GitBranch },
  { key: 'Settings', labelKey: 'settings', icon: Settings }
] as const;

function ExpandableTabBar({ state, navigation, unreadCount = 0 }: BottomTabBarProps & { unreadCount?: number }) {
  const { t, isRTL } = useLanguage();
  function onSelect(routeName: string) {
    const route = state.routes.find((r) => r.name === routeName);
    if (!route) return;
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true
    });
    if (!event.defaultPrevented) {
      navigation.navigate(routeName);
    }
  }

  return (
    <View style={styles.tabBarWrap}>
      <View style={styles.tabBarShell}>
        <View style={styles.tabBarGlass} />
        <View style={[styles.tabItemsRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {TAB_ITEMS.map((item) => {
            const routeIndex = state.routes.findIndex((r) => r.name === item.key);
            if (routeIndex < 0) return null;
            const focused = state.index === routeIndex;
            const showUnreadBadge = item.key === 'Inbox' && unreadCount > 0 && state.routes[state.index]?.name !== 'Inbox';
            const Icon = item.icon;
            return (
              <View key={item.key} style={styles.menuItemWrap}>
                <Pressable style={({ pressed }) => [styles.menuItemBtn, pressed && styles.menuItemBtnPressed]} onPress={() => onSelect(item.key)}>
                  <Icon color={focused ? '#ffffff' : 'rgba(255,255,255,0.38)'} size={23} />
                  <Text style={[styles.menuItemText, { color: focused ? '#ffffff' : 'rgba(255,255,255,0.45)' }]}>{t(item.labelKey)}</Text>
                  {showUnreadBadge ? (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>{unreadCount > 99 ? '99+' : String(unreadCount)}</Text>
                    </View>
                  ) : null}
                </Pressable>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function MainTabs() {
  const { token } = useAuth();
  const [inboxUnreadCount, setInboxUnreadCount] = React.useState(0);
  const latestMessageIdRef = React.useRef(0);
  const inboxBootstrappedRef = React.useRef(false);

  const pollInbox = React.useCallback(async () => {
    if (!token) {
      setInboxUnreadCount(0);
      latestMessageIdRef.current = 0;
      inboxBootstrappedRef.current = false;
      return;
    }
    try {
      const res = await api.request<{ messages?: AdminInboxMessage[]; unread_count?: number }>('admin_inbox', { limit: 1 });
      const list = Array.isArray(res.messages) ? res.messages : [];
      const latestId = Number(list[0]?.id ?? 0);
      const unreadFromApi = Number(res.unread_count ?? 0);
      const unreadCount = Number.isFinite(unreadFromApi) && unreadFromApi >= 0 ? unreadFromApi : list.filter((m) => Boolean(m?.is_unread)).length;

      if (inboxBootstrappedRef.current) {
        const hasNewMessage = latestId > latestMessageIdRef.current;
        if (hasNewMessage && unreadCount > 0) {
          playInboxSound().catch(() => {});
        }
      }

      inboxBootstrappedRef.current = true;
      if (latestId > latestMessageIdRef.current) {
        latestMessageIdRef.current = latestId;
      }
      setInboxUnreadCount(unreadCount);
    } catch {
      // keep current badge value when polling fails
    }
  }, [token]);

  React.useEffect(() => {
    pollInbox();
    const timer = setInterval(() => {
      pollInbox();
    }, 12000);
    return () => clearInterval(timer);
  }, [pollInbox]);

  return (
    <Tabs.Navigator
      tabBar={(props) => <ExpandableTabBar {...props} unreadCount={inboxUnreadCount} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' }
      }}
    >
      <Tabs.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }} />
      <Tabs.Screen name="Inbox" component={InboxScreen} options={{ title: 'Inbox', tabBarIcon: ({ color, size }) => <MessageSquare color={color} size={size} /> }} />
      <Tabs.Screen name="Pages" component={PagesScreen} options={{ title: 'ئامار', tabBarIcon: ({ color, size }) => <Bot color={color} size={size} /> }} />
      <Tabs.Screen name="Automations" component={AutomationsScreen} options={{ title: 'Posts', tabBarIcon: ({ color, size }) => <ToggleLeft color={color} size={size} /> }} />
      <Tabs.Screen name="Help" component={HelpScreen} options={{ title: 'Chat Flow', tabBarIcon: ({ color, size }) => <GitBranch color={color} size={size} /> }} />
      <Tabs.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings', tabBarIcon: ({ color, size }) => <Settings color={color} size={size} /> }} />
    </Tabs.Navigator>
  );
}

function RootNavigator() {
  const { token, ready } = useAuth();
  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.background } }}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {token ? (
          <Stack.Screen name="Main" component={MainTabs} />
        ) : (
          <>
            <Stack.Screen name="Intro" component={IntroScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </LanguageProvider>
  );
}

const styles = StyleSheet.create({
  tabBarWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 6
  },
  tabBarShell: {
    height: 78,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
    justifyContent: 'center',
    paddingHorizontal: 8
  },
  tabBarGlass: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(18,18,30,0.92)',
    borderRadius: 24
  },
  tabItemsRow: {
    zIndex: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    paddingHorizontal: 2
  },
  menuItemWrap: { flex: 1, alignItems: 'center' },
  menuItemBtn: {
    position: 'relative',
    width: '100%',
    maxWidth: 72,
    minHeight: 52,
    paddingHorizontal: 6,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4
  },
  unreadBadge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#FF4757',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900'
  },
  menuItemBtnPressed: {
    transform: [{ scale: 0.94 }],
    opacity: 0.9
  },
  menuItemText: { fontSize: 10, fontWeight: '800', lineHeight: 12, includeFontPadding: false, textAlign: 'center' }
});
