import { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import { AppButton } from './src/components/AppButton';
import { SetupScreen } from './src/screens/SetupScreen';
import { AuthScreen } from './src/screens/AuthScreen';
import { InventoryScreen } from './src/screens/InventoryScreen';
import { TradesScreen } from './src/screens/TradesScreen';
import { getSupabase } from './src/lib/supabase';
import { hasSupabaseConfig } from './src/lib/env';
import { colors } from './src/lib/theme';
import { appBrand } from './src/lib/brand';

type MainTab = 'inventory' | 'trades';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState<MainTab>('inventory');

  useEffect(() => {
    if (!hasSupabaseConfig) {
      setAuthLoading(false);
      return;
    }

    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id ?? null;
  const email = session?.user.email ?? '';

  const activeScreen = useMemo(() => {
    if (!userId) return null;
    if (tab === 'inventory') return <InventoryScreen userId={userId} />;
    return <TradesScreen userId={userId} />;
  }, [tab, userId]);

  if (!hasSupabaseConfig) {
    return <SetupScreen />;
  }

  if (authLoading) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <StatusBar style="dark" />
        <Text style={styles.loadingText}>読み込み中...</Text>
      </SafeAreaView>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  async function signOut() {
    await getSupabase().auth.signOut();
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.headerTextBlock}>
          <Text style={styles.appName}>{appBrand.name}</Text>
          <Text style={styles.subtitleText}>{appBrand.subtitle}</Text>
          <Text style={styles.userText} numberOfLines={1}>
            {email}
          </Text>
        </View>
        <AppButton label="ログアウト" variant="ghost" onPress={signOut} />
      </View>

      <View style={styles.tabs}>
        <AppButton
          label="在庫"
          variant={tab === 'inventory' ? 'primary' : 'secondary'}
          onPress={() => setTab('inventory')}
        />
        <AppButton
          label="取引"
          variant={tab === 'trades' ? 'primary' : 'secondary'}
          onPress={() => setTab('trades')}
        />
      </View>

      {activeScreen}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  header: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTextBlock: {
    flex: 1,
    paddingRight: 12,
  },
  appName: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  subtitleText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  userText: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
});
