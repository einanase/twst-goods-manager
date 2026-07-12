import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { AppButton } from '../components/AppButton';
import { EmptyState } from '../components/EmptyState';
import { QuantityStepper } from '../components/QuantityStepper';
import { TextField } from '../components/TextField';
import { colors } from '../lib/theme';
import { loadGoods, updateGoodsStock } from '../services/goodsService';
import { createTrade, deleteTrade, loadTrades, patchTrade, updateTrade } from '../services/tradeService';
import { getStoredImageValue, removeStoredImage, uploadPrivateImageFromUri } from '../services/imageStorage';
import type { GoodsItem, RowId, Trade, TradeInput, TradeItem, TradeStatus, TradeType } from '../types/domain';

type TradesScreenProps = {
  userId: string;
};

const tradeTypes: TradeType[] = ['交換', '譲渡', '交換+譲渡'];
const statuses: TradeStatus[] = ['成約', '仮約束', 'お声掛け中'];
const flagLabels = {
  is_packed: '梱包',
  is_sent: '発送',
  is_received: '受取',
};

export function TradesScreen({ userId }: TradesScreenProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [goods, setGoods] = useState<GoodsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [memoSearch, setMemoSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TradeStatus>('all');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<TradeType>('交換');
  const [status, setStatus] = useState<TradeStatus>('成約');
  const [memo, setMemo] = useState('');
  const [giveItems, setGiveItems] = useState<TradeItem[]>([]);
  const [receiveItems, setReceiveItems] = useState<TradeItem[]>([]);
  const [isPacked, setIsPacked] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [isReceived, setIsReceived] = useState(false);
  const [shipDate, setShipDate] = useState('');
  const [receiveDate, setReceiveDate] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [storedImageValue, setStoredImageValue] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [nextGoods, nextTrades] = await Promise.all([loadGoods(userId), loadTrades(userId)]);
      setGoods(nextGoods);
      setTrades(nextTrades);
    } catch (error) {
      showError('取引の読み込みに失敗しました', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filteredTrades = useMemo(() => {
    const nameKeyword = search.trim().toLowerCase();
    const memoKeyword = memoSearch.trim().toLowerCase();
    return trades.filter((trade) => {
      if (statusFilter !== 'all' && trade.status !== statusFilter) return false;
      if (nameKeyword && !trade.name.toLowerCase().includes(nameKeyword)) return false;
      if (memoKeyword && !(trade.memo ?? '').toLowerCase().includes(memoKeyword)) return false;
      return true;
    });
  }, [memoSearch, search, statusFilter, trades]);

  function openCreate() {
    setEditingTrade(null);
    setName('');
    setType('交換');
    setStatus('成約');
    setMemo('');
    setGiveItems([]);
    setReceiveItems([]);
    setIsPacked(false);
    setIsSent(false);
    setIsReceived(false);
    setShipDate('');
    setReceiveDate('');
    setImageUri(null);
    setImageName(null);
    setStoredImageValue(null);
    setModalVisible(true);
  }

  function openEdit(trade: Trade) {
    setEditingTrade(trade);
    setName(trade.name ?? '');
    setType(trade.type ?? '交換');
    setStatus(trade.status ?? '成約');
    setMemo(trade.memo ?? '');
    setGiveItems(trade.give_items ?? []);
    setReceiveItems(trade.receive_items ?? []);
    setIsPacked(Boolean(trade.is_packed));
    setIsSent(Boolean(trade.is_sent));
    setIsReceived(Boolean(trade.is_received));
    setShipDate(trade.est_ship_date ?? '');
    setReceiveDate(trade.est_receive_date ?? '');
    setImageUri(null);
    setImageName(null);
    setStoredImageValue(getStoredImageValue(trade.image_url));
    setModalVisible(true);
  }

  async function pickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('画像を選べません', '写真へのアクセスを許可してください。');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      quality: 0.82,
    });

    if (!result.canceled) {
      setImageUri(result.assets[0]?.uri ?? null);
      setImageName(result.assets[0]?.fileName ?? null);
    }
  }

  async function saveTrade() {
    if (!name.trim()) {
      Alert.alert('入力不足', '相手のX IDまたは名前を入力してください。');
      return;
    }

    setSaving(true);
    try {
      let nextImageValue = storedImageValue;
      if (imageUri) {
        nextImageValue = await uploadPrivateImageFromUri({
          userId,
          uri: imageUri,
          fileName: imageName,
          prefix: 'trd',
        });
      }

      const contracted = status === '成約';
      const normalizedGiveItems = giveItems.filter((item) => item.count > 0);
      const normalizedReceiveItems = receiveItems.filter((item) => item.count > 0);
      if (!normalizedGiveItems.length && !normalizedReceiveItems.length) {
        Alert.alert('アイテムを選んでください', '渡すもの、または受けるものを1つ以上選んでください。');
        return;
      }

      const input: TradeInput = {
        name: name.trim(),
        type,
        status,
        memo: memo.trim() || null,
        give_items: normalizedGiveItems,
        receive_items: normalizedReceiveItems,
        image_url: nextImageValue,
        is_packed: contracted ? isPacked : false,
        is_sent: contracted ? isSent : false,
        is_received: contracted ? isReceived : false,
        est_ship_date: shipDate.trim() || null,
        est_receive_date: receiveDate.trim() || null,
      };

      const oldTrade = editingTrade;
      const saved = oldTrade
        ? await updateTrade(userId, editingTrade.id, input)
        : await createTrade(userId, input);

      if (oldTrade?.image_url && getStoredImageValue(oldTrade.image_url) !== nextImageValue) {
        await removeStoredImage(userId, oldTrade.image_url);
      }

      const nextTrades = upsertTrade(trades, saved);
      const nextGoods = await syncStockAfterTradeChange(oldTrade, saved, goods, nextTrades, userId);
      setTrades(nextTrades);
      setGoods(nextGoods);
      setModalVisible(false);
    } catch (error) {
      showError('取引の保存に失敗しました', error);
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(trade: Trade, nextStatus: TradeStatus) {
    if (trade.status === nextStatus) return;

    Alert.alert(
      'ステータスを変更しますか？',
      `${trade.name} のステータスを「${trade.status}」から「${nextStatus}」へ変更します。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '変更する',
          onPress: () => applyStatusChange(trade, nextStatus),
        },
      ],
    );
  }

  async function applyStatusChange(trade: Trade, nextStatus: TradeStatus) {
    const previous = trades;
    const previousGoods = goods;
    const patch = {
      status: nextStatus,
      is_packed: nextStatus === '成約' ? Boolean(trade.is_packed) : false,
      is_sent: nextStatus === '成約' ? Boolean(trade.is_sent) : false,
      is_received: nextStatus === '成約' ? Boolean(trade.is_received) : false,
    };

    setTrades((current) =>
      current.map((candidate) =>
        String(candidate.id) === String(trade.id) ? { ...candidate, ...patch } : candidate,
      ),
    );

    try {
      const saved = await patchTrade(userId, trade.id, patch);
      const nextTrades = upsertTrade(previous, saved);
      const nextGoods = await syncStockAfterTradeChange(trade, saved, previousGoods, nextTrades, userId);
      setTrades(nextTrades);
      setGoods(nextGoods);
    } catch (error) {
      setTrades(previous);
      setGoods(previousGoods);
      showError('ステータス更新に失敗しました', error);
    }
  }

  async function updateTradeFlag(trade: Trade, field: 'is_packed' | 'is_sent' | 'is_received', value: boolean) {
    if (trade.status !== '成約') {
      Alert.alert('成約以外では変更できません', '梱包・発送・受取の管理はステータスが成約の取引で使えます。');
      return;
    }

    const action = value ? '済みにする' : '未完了に戻す';
    Alert.alert(
      `${flagLabels[field]}を変更しますか？`,
      `${trade.name} の「${flagLabels[field]}」を${action}操作です。発送・受取は在庫数にも反映されます。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '変更する',
          onPress: () => applyTradeFlagChange(trade, field, value),
        },
      ],
    );
  }

  async function applyTradeFlagChange(
    trade: Trade,
    field: 'is_packed' | 'is_sent' | 'is_received',
    value: boolean,
  ) {
    const previous = trades;
    const previousGoods = goods;
    const optimistic = { ...trade, [field]: value };
    setTrades((current) => upsertTrade(current, optimistic));

    try {
      const saved = await patchTrade(userId, trade.id, { [field]: value });
      const nextTrades = upsertTrade(previous, saved);
      const nextGoods = await syncStockAfterTradeChange(trade, saved, previousGoods, nextTrades, userId);
      setTrades(nextTrades);
      setGoods(nextGoods);
    } catch (error) {
      setTrades(previous);
      setGoods(previousGoods);
      showError('取引状態の更新に失敗しました', error);
    }
  }

  function confirmModalStatusChange(nextStatus: TradeStatus) {
    if (status === nextStatus) return;

    Alert.alert('ステータスを変更しますか？', `編集中の取引を「${status}」から「${nextStatus}」へ変更します。`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '変更する',
        onPress: () => {
          setStatus(nextStatus);
          if (nextStatus !== '成約') {
            setIsPacked(false);
            setIsSent(false);
            setIsReceived(false);
          }
        },
      },
    ]);
  }

  function confirmModalFlagChange(
    field: 'is_packed' | 'is_sent' | 'is_received',
    currentValue: boolean,
    nextValue: boolean,
    setter: (value: boolean) => void,
  ) {
    if (currentValue === nextValue) return;

    const action = nextValue ? '済みにする' : '未完了に戻す';
    Alert.alert(
      `${flagLabels[field]}を変更しますか？`,
      `編集中の取引の「${flagLabels[field]}」を${action}操作です。保存すると在庫計算に反映されます。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '変更する',
          onPress: () => setter(nextValue),
        },
      ],
    );
  }

  async function confirmDelete(trade: Trade) {
    Alert.alert('削除しますか？', `${trade.name} の取引を削除します。`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTrade(userId, trade.id);
            await removeStoredImage(userId, trade.image_url);
            const nextTrades = trades.filter((candidate) => String(candidate.id) !== String(trade.id));
            const nextGoods = await syncStockAfterTradeChange(trade, null, goods, nextTrades, userId);
            setTrades(nextTrades);
            setGoods(nextGoods);
          } catch (error) {
            showError('削除に失敗しました', error);
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.toolbar}>
        <TextField label="相手で検索" value={search} onChangeText={setSearch} placeholder="@username" />
        <TextField label="メモで検索" value={memoSearch} onChangeText={setMemoSearch} placeholder="発送方法など" />
        <View style={styles.filterRow}>
          {(['all', ...statuses] as Array<'all' | TradeStatus>).map((candidate) => (
            <Pressable
              key={candidate}
              onPress={() => setStatusFilter(candidate)}
              style={[
                styles.filterChip,
                statusFilter === candidate ? styles.filterChipActive : null,
              ]}
            >
              <Text style={[styles.filterChipText, statusFilter === candidate ? styles.filterChipTextActive : null]}>
                {candidate === 'all' ? 'すべて' : candidate}
              </Text>
            </Pressable>
          ))}
        </View>
        <AppButton label="取引を追加" onPress={openCreate} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={filteredTrades}
          keyExtractor={(item) => String(item.id)}
          ListEmptyComponent={
            <EmptyState title="取引がありません" body="取引相手、渡すもの、受けるもの、発送状況を記録できます。" />
          }
          renderItem={({ item, index }) => (
            <Pressable style={styles.card} onPress={() => openEdit(item)}>
              <View style={styles.cardTop}>
                <View style={styles.tradeTitleBlock}>
                  <Text style={styles.tradeNo}>#{filteredTrades.length - index}</Text>
                  <Text style={styles.tradeName}>{item.name}</Text>
                </View>
                <AppButton label="削除" variant="danger" onPress={() => confirmDelete(item)} />
              </View>

              <View style={styles.statusRow}>
                {statuses.map((candidate) => (
                  <Pressable
                    key={candidate}
                    onPress={() => updateStatus(item, candidate)}
                    style={[styles.statusChip, item.status === candidate ? styles.statusChipActive : null]}
                  >
                    <Text style={[styles.statusChipText, item.status === candidate ? styles.statusChipTextActive : null]}>
                      {candidate}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {item.image_display_url ? (
                <Image source={{ uri: item.image_display_url }} style={styles.tradeImage} />
              ) : null}

              <View style={styles.tradeDetailGrid}>
                <TradeItemsLabel title="渡すもの" items={item.give_items} goods={goods} />
                <TradeItemsLabel title="受けるもの" items={item.receive_items} goods={goods} />
              </View>

              <View style={styles.progressRow}>
                <ProgressPill
                  label="梱包"
                  done={Boolean(item.is_packed)}
                  disabled={item.status !== '成約'}
                  onPress={() => updateTradeFlag(item, 'is_packed', !item.is_packed)}
                />
                <ProgressPill
                  label="発送"
                  done={Boolean(item.is_sent)}
                  disabled={item.status !== '成約'}
                  onPress={() => updateTradeFlag(item, 'is_sent', !item.is_sent)}
                />
                <ProgressPill
                  label="受取"
                  done={Boolean(item.is_received)}
                  disabled={item.status !== '成約'}
                  onPress={() => updateTradeFlag(item, 'is_received', !item.is_received)}
                />
              </View>

              {item.memo ? <Text style={styles.memo}>{item.memo}</Text> : null}
            </Pressable>
          )}
        />
      )}

      <Modal animationType="slide" visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <ScrollView contentContainerStyle={styles.modalContent}>
          <Text style={styles.modalTitle}>{editingTrade ? '取引を編集' : '取引を追加'}</Text>

          <TextField label="相手のX ID / 名前" value={name} onChangeText={setName} placeholder="@username" />
          <Segmented label="取引内容" options={tradeTypes} value={type} onChange={setType} />
          <Segmented label="ステータス" options={statuses} value={status} onChange={confirmModalStatusChange} />

          <View style={styles.checkPanel}>
            <ToggleRow
              label="梱包済"
              value={isPacked}
              onValueChange={(nextValue) =>
                confirmModalFlagChange('is_packed', isPacked, nextValue, setIsPacked)
              }
              disabled={status !== '成約'}
            />
            <ToggleRow
              label="発送済"
              value={isSent}
              onValueChange={(nextValue) =>
                confirmModalFlagChange('is_sent', isSent, nextValue, setIsSent)
              }
              disabled={status !== '成約'}
            />
            <ToggleRow
              label="受取済"
              value={isReceived}
              onValueChange={(nextValue) =>
                confirmModalFlagChange('is_received', isReceived, nextValue, setIsReceived)
              }
              disabled={status !== '成約'}
            />
          </View>

          <TextField
            label="発送予定日"
            value={shipDate}
            onChangeText={setShipDate}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
          />
          <TextField
            label="受取予定日"
            value={receiveDate}
            onChangeText={setReceiveDate}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
          />

          <TradeItemEditor title="渡すもの" goods={goods} items={giveItems} onChange={setGiveItems} />
          <TradeItemEditor title="受けるもの" goods={goods} items={receiveItems} onChange={setReceiveItems} />

          <TextField
            label="取引メモ"
            value={memo}
            onChangeText={setMemo}
            placeholder="発送方法や約束事など"
            multiline
            style={styles.memoInput}
          />

          <View style={styles.imageEditBox}>
            <Text style={styles.sectionLabel}>取引画像</Text>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.previewImage} />
            ) : editingTrade?.image_display_url && storedImageValue ? (
              <Image source={{ uri: editingTrade.image_display_url }} style={styles.previewImage} />
            ) : (
              <View style={styles.previewPlaceholder}>
                <Text style={styles.placeholderText}>画像なし</Text>
              </View>
            )}
            <View style={styles.rowActions}>
              <AppButton label="画像を選ぶ" variant="secondary" onPress={pickImage} />
              <AppButton
                label="画像を外す"
                variant="ghost"
                onPress={() => {
                  setImageUri(null);
                  setImageName(null);
                  setStoredImageValue(null);
                }}
              />
            </View>
          </View>

          <View style={styles.modalActions}>
            <AppButton label="キャンセル" variant="ghost" disabled={saving} onPress={() => setModalVisible(false)} />
            <AppButton label={saving ? '保存中...' : '保存する'} disabled={saving} onPress={saveTrade} />
          </View>
        </ScrollView>
      </Modal>
    </View>
  );
}

function TradeItemsLabel({ title, items, goods }: { title: string; items: TradeItem[]; goods: GoodsItem[] }) {
  return (
    <View style={styles.tradeItemsBox}>
      <Text style={styles.tradeItemsTitle}>{title}</Text>
      {items?.length ? (
        items.map((item) => {
          const good = goods.find((candidate) => String(candidate.id) === String(item.id));
          return (
            <Text key={`${title}-${item.id}`} style={styles.tradeItemsText}>
              {good ? `${good.type} / ${good.char}` : `ID:${item.id}`} x{item.count}
            </Text>
          );
        })
      ) : (
        <Text style={styles.tradeItemsTextMuted}>なし</Text>
      )}
    </View>
  );
}

function ProgressPill({
  label,
  done,
  disabled,
  onPress,
}: {
  label: string;
  done: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.progressPillButton,
        done ? styles.progressPillDone : null,
        disabled ? styles.progressPillDisabled : null,
      ]}
    >
      <Text
        style={[
          styles.progressPillText,
          done ? styles.progressPillTextDone : null,
          disabled ? styles.progressPillTextDisabled : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmentedWrap}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.segmentedRow}>
        {options.map((option) => (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            style={[styles.segmentedButton, option === value ? styles.segmentedButtonActive : null]}
          >
            <Text style={[styles.segmentedText, option === value ? styles.segmentedTextActive : null]}>
              {option}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={[styles.toggleLabel, disabled ? styles.disabledText : null]}>{label}</Text>
      <Switch value={value} disabled={disabled} onValueChange={onValueChange} />
    </View>
  );
}

function TradeItemEditor({
  title,
  goods,
  items,
  onChange,
}: {
  title: string;
  goods: GoodsItem[];
  items: TradeItem[];
  onChange: (items: TradeItem[]) => void;
}) {
  function quantityFor(id: RowId) {
    return items.find((item) => String(item.id) === String(id))?.count ?? 0;
  }

  function setQuantity(id: RowId, count: number) {
    const next = items.filter((item) => String(item.id) !== String(id));
    if (count > 0) next.push({ id, count });
    onChange(next);
  }

  return (
    <View style={styles.tradeItemEditor}>
      <Text style={styles.sectionLabel}>{title}</Text>
      {goods.length ? (
        goods.map((good) => {
          const quantity = quantityFor(good.id);
          return (
            <View key={`${title}-${good.id}`} style={styles.goodsPickRow}>
              <View style={styles.goodsPickTextBlock}>
                <Text style={styles.goodsPickType}>{good.type}</Text>
                <Text style={styles.goodsPickName}>{good.char}</Text>
              </View>
              <QuantityStepper value={quantity} onChange={(next) => setQuantity(good.id, next)} />
            </View>
          );
        })
      ) : (
        <Text style={styles.tradeItemsTextMuted}>先に在庫を追加してください。</Text>
      )}
    </View>
  );
}

function showError(title: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  Alert.alert(title, message);
}

function upsertTrade(current: Trade[], saved: Trade) {
  const exists = current.some((trade) => String(trade.id) === String(saved.id));
  if (!exists) return [saved, ...current];
  return current.map((trade) => (String(trade.id) === String(saved.id) ? saved : trade));
}

async function syncStockAfterTradeChange(
  oldTrade: Trade | null,
  newTrade: Trade | null,
  currentGoods: GoodsItem[],
  nextTrades: Trade[],
  userId: string,
) {
  const nextGoods = currentGoods.map((item) => ({ ...item }));
  const affectedItemIds = new Set<string>();

  const addAffectedItems = (trade: Trade | null) => {
    if (!trade) return;
    for (const item of trade.give_items ?? []) {
      if (item.id) affectedItemIds.add(String(item.id));
    }
    for (const item of trade.receive_items ?? []) {
      if (item.id) affectedItemIds.add(String(item.id));
    }
  };

  const updateActual = (itemId: RowId, delta: number) => {
    const sid = String(itemId);
    const index = nextGoods.findIndex((item) => String(item.id) === sid);
    if (index < 0) return;

    const item = nextGoods[index];
    if (!item) return;
    const nextCount = Math.max(0, (item?.count ?? 0) + delta);
    nextGoods[index] = { ...item, count: nextCount };
    affectedItemIds.add(sid);
  };

  if (!oldTrade?.is_sent && newTrade?.is_sent) {
    for (const item of newTrade.give_items ?? []) updateActual(item.id, -item.count);
  } else if (oldTrade?.is_sent && !newTrade?.is_sent) {
    for (const item of oldTrade.give_items ?? []) updateActual(item.id, item.count);
  } else if (oldTrade?.is_sent && newTrade?.is_sent) {
    for (const item of oldTrade.give_items ?? []) updateActual(item.id, item.count);
    for (const item of newTrade.give_items ?? []) updateActual(item.id, -item.count);
  }

  if (!oldTrade?.is_received && newTrade?.is_received) {
    for (const item of newTrade.receive_items ?? []) updateActual(item.id, item.count);
  } else if (oldTrade?.is_received && !newTrade?.is_received) {
    for (const item of oldTrade.receive_items ?? []) updateActual(item.id, -item.count);
  } else if (oldTrade?.is_received && newTrade?.is_received) {
    for (const item of oldTrade.receive_items ?? []) updateActual(item.id, -item.count);
    for (const item of newTrade.receive_items ?? []) updateActual(item.id, item.count);
  }

  addAffectedItems(oldTrade);
  addAffectedItems(newTrade);

  for (const itemId of affectedItemIds) {
    const index = nextGoods.findIndex((item) => String(item.id) === itemId);
    if (index < 0) continue;

    const item = nextGoods[index];
    if (!item) continue;
    const actualCount = item?.count ?? 0;
    const plannedCount = Math.max(0, actualCount + calculatePendingDiff(itemId, nextTrades));
    nextGoods[index] = { ...item, planned_count: plannedCount };
    await updateGoodsStock(userId, item.id, {
      count: actualCount,
      planned_count: plannedCount,
    });
  }

  return nextGoods;
}

function calculatePendingDiff(itemId: string, trades: Trade[]) {
  let pendingDiff = 0;

  for (const trade of trades) {
    if (trade.status !== '成約') continue;

    const give = (trade.give_items ?? []).find((item) => String(item.id) === itemId);
    if (give && !trade.is_sent) pendingDiff -= give.count;

    const receive = (trade.receive_items ?? []).find((item) => String(item.id) === itemId);
    if (receive && !trade.is_received) pendingDiff += receive.count;
  }

  return pendingDiff;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  toolbar: {
    gap: 10,
    padding: 16,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  filterChipTextActive: {
    color: colors.primaryText,
  },
  loader: {
    marginTop: 40,
  },
  listContent: {
    gap: 12,
    padding: 16,
    paddingTop: 0,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  cardTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  tradeTitleBlock: {
    flex: 1,
    gap: 2,
  },
  tradeNo: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '900',
  },
  tradeName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusChip: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  statusChipActive: {
    backgroundColor: colors.primary,
  },
  statusChipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  statusChipTextActive: {
    color: colors.primaryText,
  },
  tradeImage: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    height: 180,
    width: '100%',
  },
  tradeDetailGrid: {
    gap: 8,
  },
  tradeItemsBox: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    gap: 4,
    padding: 10,
  },
  tradeItemsTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  tradeItemsText: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
  },
  tradeItemsTextMuted: {
    color: colors.muted,
    fontSize: 13,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 8,
  },
  progressPillButton: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  progressPillDone: {
    backgroundColor: '#dff3e9',
  },
  progressPillDisabled: {
    opacity: 0.55,
  },
  progressPillText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900',
  },
  progressPillTextDone: {
    color: colors.success,
  },
  progressPillTextDisabled: {
    color: colors.muted,
  },
  memo: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  modalContent: {
    backgroundColor: colors.background,
    gap: 16,
    padding: 20,
    paddingBottom: 40,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  segmentedWrap: {
    gap: 8,
  },
  sectionLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  segmentedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  segmentedButton: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  segmentedButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  segmentedText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  segmentedTextActive: {
    color: colors.primaryText,
  },
  checkPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 12,
  },
  toggleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  toggleLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  disabledText: {
    color: colors.muted,
  },
  tradeItemEditor: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  goodsPickRow: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    paddingTop: 10,
  },
  goodsPickTextBlock: {
    flex: 1,
  },
  goodsPickType: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900',
  },
  goodsPickName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  memoInput: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  imageEditBox: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  previewImage: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    height: 190,
    width: '100%',
  },
  previewPlaceholder: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    height: 140,
    justifyContent: 'center',
  },
  placeholderText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  rowActions: {
    flexDirection: 'row',
    gap: 8,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
});
