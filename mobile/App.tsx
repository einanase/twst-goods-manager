import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
import { loadTrades } from './src/services/tradeService';
import type { Trade } from './src/types/domain';

type MainTab = 'inventory' | 'trades';
type DueNotificationKind = 'ship' | 'receive';
type DueNotification = {
  key: string;
  kind: DueNotificationKind;
  trade: Trade;
  date: string;
  daysOverdue: number;
};

const brandIcon = require('./assets/app/icon.png');

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState<MainTab>('inventory');
  const [notificationVisible, setNotificationVisible] = useState(false);
  const [notifications, setNotifications] = useState<DueNotification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [selectedNotificationKey, setSelectedNotificationKey] = useState<string | null>(null);

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

  const refreshNotifications = useCallback(async () => {
    if (!userId) {
      setNotifications([]);
      return;
    }

    setNotificationsLoading(true);
    try {
      const trades = await loadTrades(userId);
      setNotifications(buildDueNotifications(trades));
    } finally {
      setNotificationsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      return;
    }

    refreshNotifications().catch(() => {
      setNotifications([]);
    });
  }, [refreshNotifications, userId]);

  const activeScreen = useMemo(() => {
    if (!userId) return null;
    if (tab === 'inventory') return <InventoryScreen userId={userId} />;
    return <TradesScreen userId={userId} onTradesChanged={refreshNotifications} />;
  }, [refreshNotifications, tab, userId]);

  const selectedNotification =
    notifications.find((notification) => notification.key === selectedNotificationKey) ?? null;

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

  function openNotifications() {
    setNotificationVisible(true);
    setSelectedNotificationKey(null);
    refreshNotifications().catch(() => {
      setNotifications([]);
    });
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.headerIdentity}>
          <Image source={brandIcon} resizeMode="contain" style={styles.headerIcon} />
          <View style={styles.headerTextBlock}>
            <Text style={styles.appName}>{appBrand.name}</Text>
            <Text style={styles.subtitleText}>{appBrand.subtitle}</Text>
            <Text style={styles.userText} numberOfLines={1}>
              {email}
            </Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="通知"
            onPress={openNotifications}
            style={({ pressed }) => [styles.notificationButton, pressed ? styles.pressed : null]}
          >
            <BellIcon />
            {notifications.length ? (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {notifications.length > 9 ? '9+' : notifications.length}
                </Text>
              </View>
            ) : null}
          </Pressable>
          <AppButton label="ログアウト" variant="ghost" onPress={signOut} />
        </View>
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
      <NotificationCenter
        loading={notificationsLoading}
        notifications={notifications}
        selectedNotification={selectedNotification}
        visible={notificationVisible}
        onClose={() => setNotificationVisible(false)}
        onOpenTrade={() => {
          setNotificationVisible(false);
          setTab('trades');
        }}
        onSelect={(notification) =>
          setSelectedNotificationKey((current) =>
            current === notification.key ? null : notification.key,
          )
        }
      />
    </SafeAreaView>
  );
}

function BellIcon() {
  return (
    <View style={styles.bellIcon}>
      <View style={styles.bellCap} />
      <View style={styles.bellBody} />
      <View style={styles.bellBase} />
      <View style={styles.bellClapper} />
    </View>
  );
}

function NotificationCenter({
  loading,
  notifications,
  selectedNotification,
  visible,
  onClose,
  onOpenTrade,
  onSelect,
}: {
  loading: boolean;
  notifications: DueNotification[];
  selectedNotification: DueNotification | null;
  visible: boolean;
  onClose: () => void;
  onOpenTrade: () => void;
  onSelect: (notification: DueNotification) => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.notificationOverlay}>
        <View style={styles.notificationPanel}>
          <View style={styles.notificationHeader}>
            <View>
              <Text style={styles.notificationTitle}>通知</Text>
              <Text style={styles.notificationSubTitle}>
                発送予定日・受取予定日を過ぎた取引
              </Text>
            </View>
            <AppButton label="閉じる" variant="ghost" onPress={onClose} />
          </View>

          {loading ? (
            <View style={styles.notificationLoading}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.notificationMuted}>通知を確認しています...</Text>
            </View>
          ) : notifications.length ? (
            <ScrollView contentContainerStyle={styles.notificationList}>
              {notifications.map((notification) => {
                const selected = selectedNotification?.key === notification.key;
                return (
                  <Pressable
                    key={notification.key}
                    accessibilityRole="button"
                    onPress={() => onSelect(notification)}
                    style={[styles.notificationItem, selected ? styles.notificationItemSelected : null]}
                  >
                    <View style={styles.notificationItemHeader}>
                      <Text style={styles.notificationItemTitle}>
                        {notification.kind === 'ship'
                          ? '発送予定日を過ぎています'
                          : '受取予定日を過ぎています'}
                      </Text>
                      <Text style={styles.notificationDate}>
                        {notification.daysOverdue}日超過
                      </Text>
                    </View>
                    <Text style={styles.notificationTradeName}>{notification.trade.name}</Text>
                    <Text style={styles.notificationMuted}>
                      予定日: {formatDisplayDate(notification.date)}
                    </Text>

                    {selected ? (
                      <View style={styles.notificationDetail}>
                        <DetailRow label="ステータス" value={notification.trade.status} />
                        <DetailRow label="内容" value={notification.trade.type} />
                        <DetailRow
                          label="進行"
                          value={[
                            `梱包:${notification.trade.is_packed ? '済' : '未'}`,
                            `発送:${notification.trade.is_sent ? '済' : '未'}`,
                            `受取:${notification.trade.is_received ? '済' : '未'}`,
                          ].join(' / ')}
                        />
                        <DetailRow
                          label="メモ"
                          value={notification.trade.memo?.trim() || 'なし'}
                        />
                        <AppButton label="取引タブを開く" variant="secondary" onPress={onOpenTrade} />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
            <View style={styles.notificationEmpty}>
              <Text style={styles.notificationEmptyTitle}>期限超過の取引はありません</Text>
              <Text style={styles.notificationMuted}>
                発送予定日や受取予定日を過ぎた取引があると、ここに表示されます。
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function buildDueNotifications(trades: Trade[]) {
  const today = startOfToday();
  const notifications: DueNotification[] = [];

  for (const trade of trades) {
    if (trade.status === '取引完了' || trade.status === 'キャンセル') continue;

    const shipDate = parseDateValue(trade.est_ship_date);
    if (shipDate && shipDate < today && !trade.is_sent) {
      notifications.push({
        key: `${trade.id}-ship`,
        kind: 'ship',
        trade,
        date: trade.est_ship_date ?? '',
        daysOverdue: daysBetween(shipDate, today),
      });
    }

    const receiveDate = parseDateValue(trade.est_receive_date);
    if (receiveDate && receiveDate < today && !trade.is_received) {
      notifications.push({
        key: `${trade.id}-receive`,
        kind: 'receive',
        trade,
        date: trade.est_receive_date ?? '',
        daysOverdue: daysBetween(receiveDate, today),
      });
    }
  }

  return notifications.sort((a, b) => b.daysOverdue - a.daysOverdue);
}

function parseDateValue(value: string | null | undefined) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function daysBetween(from: Date, to: Date) {
  return Math.max(1, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}

function formatDisplayDate(value: string) {
  const date = parseDateValue(value);
  if (!date) return value || '未設定';
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
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
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  headerIdentity: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    paddingRight: 12,
  },
  headerIcon: {
    height: 44,
    width: 44,
  },
  headerTextBlock: {
    flex: 1,
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
  notificationButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    position: 'relative',
    width: 42,
  },
  bellIcon: {
    alignItems: 'center',
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  bellCap: {
    backgroundColor: colors.primary,
    borderRadius: 3,
    height: 4,
    marginBottom: -1,
    width: 8,
  },
  bellBody: {
    backgroundColor: colors.primary,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    height: 13,
    width: 16,
  },
  bellBase: {
    backgroundColor: colors.primary,
    borderRadius: 2,
    height: 3,
    marginTop: -1,
    width: 20,
  },
  bellClapper: {
    backgroundColor: colors.primary,
    borderRadius: 3,
    height: 5,
    marginTop: 1,
    width: 5,
  },
  notificationBadge: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: 9,
    minWidth: 18,
    paddingHorizontal: 4,
    position: 'absolute',
    right: -5,
    top: -5,
  },
  notificationBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 17,
  },
  pressed: {
    opacity: 0.78,
  },
  notificationOverlay: {
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  notificationPanel: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    maxHeight: '86%',
    padding: 16,
  },
  notificationHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  notificationTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  notificationSubTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  notificationLoading: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 40,
  },
  notificationList: {
    gap: 10,
    paddingBottom: 24,
    paddingTop: 16,
  },
  notificationItem: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 12,
  },
  notificationItemSelected: {
    borderColor: colors.primary,
  },
  notificationItemHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  notificationItemTitle: {
    color: colors.danger,
    flex: 1,
    fontSize: 14,
    fontWeight: '900',
  },
  notificationDate: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '900',
  },
  notificationTradeName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  notificationMuted: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  notificationDetail: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    gap: 10,
    marginTop: 8,
    padding: 12,
  },
  detailRow: {
    gap: 2,
  },
  detailLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
  },
  detailValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  notificationEmpty: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 42,
  },
  notificationEmptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
  },
});
