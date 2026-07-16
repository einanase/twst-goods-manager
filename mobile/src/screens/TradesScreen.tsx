import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type AlertButton,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { AppButton } from '../components/AppButton';
import { CameraCaptureModal, type CapturedImageAsset } from '../components/CameraCaptureModal';
import { EmptyState } from '../components/EmptyState';
import { ImagePreviewModal } from '../components/ImagePreviewModal';
import { QuantityStepper } from '../components/QuantityStepper';
import { TextField } from '../components/TextField';
import { calculatePlannedStockCount } from '../lib/stockProjection';
import { colors } from '../lib/theme';
import { loadGoods, updateGoodsStock } from '../services/goodsService';
import { createTrade, deleteTrade, loadTrades, patchTrade, updateTrade } from '../services/tradeService';
import { getStoredImageValue, removeStoredImage, uploadPrivateImageFromUri } from '../services/imageStorage';
import type { GoodsItem, RowId, Trade, TradeInput, TradeItem, TradeStatus, TradeType } from '../types/domain';

type TradesScreenProps = {
  userId: string;
  onTradesChanged?: () => void;
};

type ImagePreview = {
  uri: string;
  title: string;
} | null;

const tradeTypes: TradeType[] = ['交換', '譲渡', '交換+譲渡'];
const statuses: TradeStatus[] = ['取引完了', '成約', '仮約束', 'お声掛け中'];
const flagLabels = {
  is_packed: '梱包',
  is_sent: '発送',
  is_received: '受取',
};
const progressStatuses: TradeStatus[] = ['成約', '取引完了'];
const calendarWeekdays = ['日', '月', '火', '水', '木', '金', '土'];

type TradeFormStep = 'basic' | 'items' | 'progress' | 'notes';
type CalendarTarget = 'ship' | 'receive' | null;
type ConfirmDialogState = {
  title: string;
  message: string;
  actions: AlertButton[];
} | null;

const tradeFormSteps: Array<{ key: TradeFormStep; label: string }> = [
  { key: 'basic', label: '基本' },
  { key: 'items', label: '品物' },
  { key: 'progress', label: '進行' },
  { key: 'notes', label: 'メモ' },
];

export function TradesScreen({ userId, onTradesChanged }: TradesScreenProps) {
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
  const [givePrice, setGivePrice] = useState('');
  const [receivePrice, setReceivePrice] = useState('');
  const [isPacked, setIsPacked] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [isReceived, setIsReceived] = useState(false);
  const [shipDate, setShipDate] = useState('');
  const [receiveDate, setReceiveDate] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [storedImageValue, setStoredImageValue] = useState<string | null>(null);
  const [tradeFormStep, setTradeFormStep] = useState<TradeFormStep>('basic');
  const [previewImage, setPreviewImage] = useState<ImagePreview>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [calendarTarget, setCalendarTarget] = useState<CalendarTarget>(null);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);

  function showNotice(title: string, message: string) {
    if (Platform.OS === 'web') {
      setConfirmDialog({ title, message, actions: [{ text: 'OK', style: 'cancel' }] });
      return;
    }

    Alert.alert(title, message);
  }

  function confirmAction(title: string, message: string, actions: AlertButton[]) {
    if (Platform.OS === 'web') {
      setConfirmDialog({ title, message, actions });
      return;
    }

    Alert.alert(title, message, actions);
  }

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
    setCameraVisible(false);
    setEditingTrade(null);
    setName('');
    setType('交換');
    setStatus('成約');
    setMemo('');
    setGiveItems([]);
    setReceiveItems([]);
    setGivePrice('');
    setReceivePrice('');
    setIsPacked(false);
    setIsSent(false);
    setIsReceived(false);
    setShipDate('');
    setReceiveDate('');
    setImageUri(null);
    setImageName(null);
    setStoredImageValue(null);
    setTradeFormStep('basic');
    setModalVisible(true);
  }

  function openEdit(trade: Trade) {
    setCameraVisible(false);
    setEditingTrade(trade);
    setName(trade.name ?? '');
    setType(trade.type ?? '交換');
    setStatus(trade.status ?? '成約');
    setMemo(trade.memo ?? '');
    setGiveItems(trade.give_items ?? []);
    setReceiveItems(trade.receive_items ?? []);
    setGivePrice(String(trade.give_price ?? 0));
    setReceivePrice(String(trade.receive_price ?? 0));
    setIsPacked(Boolean(trade.is_packed));
    setIsSent(Boolean(trade.is_sent));
    setIsReceived(Boolean(trade.is_received));
    setShipDate(trade.est_ship_date ?? '');
    setReceiveDate(trade.est_receive_date ?? '');
    setImageUri(null);
    setImageName(null);
    setStoredImageValue(getStoredImageValue(trade.image_url));
    setTradeFormStep('basic');
    setModalVisible(true);
  }

  async function pickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showNotice('画像を選べません', '写真へのアクセスを許可してください。');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      quality: 0.82,
    });

    if (!result.canceled) {
      applyPickedImage(result.assets[0]);
    }
  }

  async function takePhoto() {
    if (Platform.OS === 'web') {
      try {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          showNotice('カメラを使えません', 'Safariの設定からカメラへのアクセスを許可してください。');
          return;
        }

        const result = await ImagePicker.launchCameraAsync({
          allowsEditing: false,
          quality: 0.82,
        });

        if (!result.canceled) {
          applyPickedImage(result.assets[0]);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        showNotice('カメラを開けません', `Safariで撮影を開始できませんでした。画像を選ぶボタンも試してください。\n\n${message}`);
      }
      return;
    }

    setCameraVisible(true);
  }

  function applyCapturedPhoto(asset: CapturedImageAsset) {
    applyPickedImage(asset);
    setCameraVisible(false);
  }

  function applyPickedImage(asset: Pick<ImagePicker.ImagePickerAsset, 'uri' | 'fileName'> | undefined) {
    if (!asset?.uri) return;
    setImageUri(asset.uri);
    setImageName(asset.fileName ?? null);
  }

  function clearImage() {
    setImageUri(null);
    setImageName(null);
    setStoredImageValue(null);
  }

  function confirmRemoveImage() {
    if (!currentEditImageUri) return;
    confirmAction('画像を削除しますか？', '保存するまで変更は確定しません。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: clearImage,
      },
    ]);
  }

  function buildTradeInput(nextImageValue: string | null): TradeInput | null {
    if (!name.trim()) {
      showNotice('入力不足', '相手のX IDまたは名前を入力してください。');
      return null;
    }

    const nextGivePrice = parseMoneyInput(givePrice);
    const nextReceivePrice = parseMoneyInput(receivePrice);
    const normalizedGiveItems = giveItems.filter((item) => item.count > 0);
    const normalizedReceiveItems = receiveItems.filter((item) => item.count > 0);
    const hasItems = Boolean(normalizedGiveItems.length || normalizedReceiveItems.length);
    const hasMoney = Boolean(nextGivePrice || nextReceivePrice);

    if (!hasItems && !hasMoney) {
      showNotice('取引内容を入力してください', '渡すもの、受けるもの、または金額を1つ以上入力してください。');
      return null;
    }

    const progressManaged = canManageProgress(status);
    const nextPacked = progressManaged ? isPacked : false;
    const nextSent = progressManaged ? isSent : false;
    const nextReceived = progressManaged ? isReceived : false;

    if (status === '取引完了' && !(nextPacked && nextSent && nextReceived)) {
      showNotice('取引完了にできません', '取引完了にするには、梱包・発送・受取をすべて済にしてください。');
      return null;
    }

    return {
      name: name.trim(),
      type,
      status,
      memo: memo.trim() || null,
      give_items: normalizedGiveItems,
      receive_items: normalizedReceiveItems,
      give_price: nextGivePrice,
      receive_price: nextReceivePrice,
      image_url: nextImageValue,
      is_packed: nextPacked,
      is_sent: nextSent,
      is_received: nextReceived,
      est_ship_date: normalizeDateInput(shipDate),
      est_receive_date: normalizeDateInput(receiveDate),
    };
  }

  function saveTrade() {
    const input = buildTradeInput(storedImageValue);
    if (!input) return;

    confirmAction('保存前に確認してください', buildTradeSummaryMessage(input, goods, Boolean(imageUri)), [
      { text: '戻る', style: 'cancel' },
      {
        text: '保存する',
        onPress: () => persistTrade(input),
      },
    ]);
  }

  async function persistTrade(baseInput: TradeInput) {
    setSaving(true);
    try {
      let nextImageValue = baseInput.image_url;
      if (imageUri) {
        setUploadingImage(true);
        nextImageValue = await uploadPrivateImageFromUri({
          userId,
          uri: imageUri,
          fileName: imageName,
          prefix: 'trd',
        });
      }

      const input = { ...baseInput, image_url: nextImageValue };
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
      setCameraVisible(false);
      setModalVisible(false);
      onTradesChanged?.();
    } catch (error) {
      showError('取引の保存に失敗しました', error);
    } finally {
      setUploadingImage(false);
      setSaving(false);
    }
  }

  async function updateStatus(trade: Trade, nextStatus: TradeStatus) {
    if (trade.status === nextStatus) return;

    confirmAction(
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
    const patch = buildStatusPatch(trade, nextStatus);

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
      onTradesChanged?.();
    } catch (error) {
      setTrades(previous);
      setGoods(previousGoods);
      showError('ステータス更新に失敗しました', error);
    }
  }

  function updateTradeFlag(trade: Trade, field: 'is_packed' | 'is_sent' | 'is_received', value: boolean) {
    if (!canManageProgress(trade.status)) {
      showNotice('進行管理できません', '梱包・発送・受取の管理はステータスが成約または取引完了の取引で使えます。');
      return;
    }

    const action = value ? '済みにする' : '未完了に戻す';
    const nextFlags = getNextTradeFlags(trade, field, value);

    if (value && trade.status === '成約' && isTradeProgressComplete(nextFlags)) {
      confirmAction(
        '取引完了にしますか？',
        `${trade.name} の梱包・発送・受取がすべて済になります。ステータスも「取引完了」に変更しますか？`,
        [
          { text: 'キャンセル', style: 'cancel' },
          {
            text: '済だけ変更',
            onPress: () => applyTradeFlagChange(trade, field, value),
          },
          {
            text: '取引完了にする',
            onPress: () => applyTradeFlagChange(trade, field, value, '取引完了'),
          },
        ],
      );
      return;
    }

    if (!value && trade.status === '取引完了') {
      confirmAction(
        '取引完了を戻しますか？',
        `${trade.name} の「${flagLabels[field]}」を未完了に戻し、ステータスも「成約」に戻します。`,
        [
          { text: 'キャンセル', style: 'cancel' },
          {
            text: '戻す',
            onPress: () => applyTradeFlagChange(trade, field, value, '成約'),
          },
        ],
      );
      return;
    }

    confirmAction(
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
    nextStatus?: TradeStatus,
  ) {
    const previous = trades;
    const previousGoods = goods;
    const patch = {
      [field]: value,
      ...(nextStatus ? { status: nextStatus } : {}),
    };
    const optimistic = { ...trade, ...patch };
    setTrades((current) => upsertTrade(current, optimistic));

    try {
      const saved = await patchTrade(userId, trade.id, patch);
      const nextTrades = upsertTrade(previous, saved);
      const nextGoods = await syncStockAfterTradeChange(trade, saved, previousGoods, nextTrades, userId);
      setTrades(nextTrades);
      setGoods(nextGoods);
      onTradesChanged?.();
    } catch (error) {
      setTrades(previous);
      setGoods(previousGoods);
      showError('取引状態の更新に失敗しました', error);
    }
  }

  function confirmModalStatusChange(nextStatus: TradeStatus) {
    if (status === nextStatus) return;

    confirmAction('ステータスを変更しますか？', `編集中の取引を「${status}」から「${nextStatus}」へ変更します。`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '変更する',
        onPress: () => {
          setStatus(nextStatus);
          if (nextStatus === '取引完了') {
            setIsPacked(true);
            setIsSent(true);
            setIsReceived(true);
          } else if (!canManageProgress(nextStatus)) {
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
    const nextFlags = getNextModalFlags(field, nextValue, {
      is_packed: isPacked,
      is_sent: isSent,
      is_received: isReceived,
    });

    if (nextValue && status === '成約' && isTradeProgressComplete(nextFlags)) {
      confirmAction(
        '取引完了にしますか？',
        '梱包・発送・受取がすべて済になります。ステータスも「取引完了」に変更しますか？',
        [
          { text: 'キャンセル', style: 'cancel' },
          {
            text: '済だけ変更',
            onPress: () => setter(nextValue),
          },
          {
            text: '取引完了にする',
            onPress: () => {
              setter(nextValue);
              setStatus('取引完了');
            },
          },
        ],
      );
      return;
    }

    if (!nextValue && status === '取引完了') {
      confirmAction(
        '取引完了を戻しますか？',
        `「${flagLabels[field]}」を未完了に戻し、ステータスも「成約」に戻します。`,
        [
          { text: 'キャンセル', style: 'cancel' },
          {
            text: '戻す',
            onPress: () => {
              setter(nextValue);
              setStatus('成約');
            },
          },
        ],
      );
      return;
    }

    confirmAction(
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
    confirmAction('削除しますか？', `${trade.name} の取引を削除します。`, [
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
            onTradesChanged?.();
          } catch (error) {
            showError('削除に失敗しました', error);
          }
        },
      },
    ]);
  }

  const tradeFormStepIndex = Math.max(
    0,
    tradeFormSteps.findIndex((step) => step.key === tradeFormStep),
  );
  const isFirstTradeFormStep = tradeFormStepIndex === 0;
  const isLastTradeFormStep = tradeFormStepIndex === tradeFormSteps.length - 1;
  const currentEditImageUri = imageUri ?? (editingTrade?.image_display_url && storedImageValue ? editingTrade.image_display_url : null);

  function moveTradeFormStep(direction: -1 | 1) {
    const nextIndex = Math.min(tradeFormSteps.length - 1, Math.max(0, tradeFormStepIndex + direction));
    const nextStep = tradeFormSteps[nextIndex];
    if (nextStep) {
      setTradeFormStep(nextStep.key);
    }
  }

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={loading ? [] : filteredTrades}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={
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
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : (
            <EmptyState title="取引がありません" body="取引相手、渡すもの、受けるもの、発送状況を記録できます。" />
          )
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
                    onPress={(event) => {
                      event.stopPropagation();
                      updateStatus(item, candidate);
                    }}
                    style={[styles.statusChip, item.status === candidate ? styles.statusChipActive : null]}
                  >
                    <Text style={[styles.statusChipText, item.status === candidate ? styles.statusChipTextActive : null]}>
                      {candidate}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {item.image_display_url ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={(event) => {
                    event.stopPropagation();
                    setPreviewImage({ uri: item.image_display_url ?? '', title: item.name });
                  }}
                  style={styles.imageTapArea}
                >
                  <Image source={{ uri: item.image_display_url }} style={styles.tradeImage} />
                </Pressable>
              ) : null}

              <View style={styles.tradeDetailGrid}>
                <TradeItemsLabel title="渡すもの" items={item.give_items} goods={goods} />
                <TradeItemsLabel title="受けるもの" items={item.receive_items} goods={goods} />
              </View>

              {item.give_price || item.receive_price ? (
                <View style={styles.moneySummaryRow}>
                  <MoneySummary label="渡す金額" amount={item.give_price ?? 0} />
                  <MoneySummary label="受ける金額" amount={item.receive_price ?? 0} />
                </View>
              ) : null}

              <View style={styles.progressRow}>
                <ProgressPill
                  label="梱包"
                  done={Boolean(item.is_packed)}
                  disabled={!canManageProgress(item.status)}
                  onPress={() => updateTradeFlag(item, 'is_packed', !item.is_packed)}
                />
                <ProgressPill
                  label="発送"
                  done={Boolean(item.is_sent)}
                  disabled={!canManageProgress(item.status)}
                  onPress={() => updateTradeFlag(item, 'is_sent', !item.is_sent)}
                />
                <ProgressPill
                  label="受取"
                  done={Boolean(item.is_received)}
                  disabled={!canManageProgress(item.status)}
                  onPress={() => updateTradeFlag(item, 'is_received', !item.is_received)}
                />
              </View>

              {item.memo ? <Text style={styles.memo}>{item.memo}</Text> : null}
            </Pressable>
        )}
      />

      <Modal
        animationType="slide"
        visible={modalVisible}
        onRequestClose={() => {
          setCameraVisible(false);
          setModalVisible(false);
        }}
      >
        <View style={styles.modalRoot}>
          {cameraVisible ? (
            <CameraCaptureModal
              visible={cameraVisible}
              title="取引画像を撮影"
              onCancel={() => setCameraVisible(false)}
              onUsePhoto={applyCapturedPhoto}
            />
          ) : (
            <>
              <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingTrade ? '取引を編集' : '取引を追加'}</Text>

          <View style={styles.formStepTabs}>
            {tradeFormSteps.map((step) => {
              const active = step.key === tradeFormStep;
              return (
                <Pressable
                  key={step.key}
                  accessibilityRole="button"
                  onPress={() => setTradeFormStep(step.key)}
                  style={[styles.formStepTab, active ? styles.formStepTabActive : null]}
                >
                  <Text style={[styles.formStepTabText, active ? styles.formStepTabTextActive : null]}>
                    {step.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.formStepBody}>
            {tradeFormStep === 'basic' ? (
              <>
                <TextField label="相手のX ID / 名前" value={name} onChangeText={setName} placeholder="@username" />
                <Segmented label="取引内容" options={tradeTypes} value={type} onChange={setType} />
                <Segmented label="ステータス" options={statuses} value={status} onChange={confirmModalStatusChange} />
              </>
            ) : null}

            {tradeFormStep === 'items' ? (
              <>
                <TradeItemEditor title="渡すもの" goods={goods} items={giveItems} onChange={setGiveItems} />
                <TradeItemEditor title="受けるもの" goods={goods} items={receiveItems} onChange={setReceiveItems} />
                <View style={styles.moneyPanel}>
                  <Text style={styles.sectionLabel}>お金のやり取り</Text>
                  <View style={styles.moneyInputGrid}>
                    <TextField
                      label="渡す金額"
                      value={givePrice}
                      onChangeText={(value) => setGivePrice(toMoneyInput(value))}
                      placeholder="0"
                      keyboardType="number-pad"
                    />
                    <TextField
                      label="受ける金額"
                      value={receivePrice}
                      onChangeText={(value) => setReceivePrice(toMoneyInput(value))}
                      placeholder="0"
                      keyboardType="number-pad"
                    />
                  </View>
                </View>
              </>
            ) : null}

            {tradeFormStep === 'progress' ? (
              <>
                <View style={styles.checkPanel}>
                  <ToggleRow
                    label="梱包済"
                    value={isPacked}
                    onValueChange={(nextValue) =>
                      confirmModalFlagChange('is_packed', isPacked, nextValue, setIsPacked)
                    }
                    disabled={!canManageProgress(status)}
                  />
                  <ToggleRow
                    label="発送済"
                    value={isSent}
                    onValueChange={(nextValue) =>
                      confirmModalFlagChange('is_sent', isSent, nextValue, setIsSent)
                    }
                    disabled={!canManageProgress(status)}
                  />
                  <ToggleRow
                    label="受取済"
                    value={isReceived}
                    onValueChange={(nextValue) =>
                      confirmModalFlagChange('is_received', isReceived, nextValue, setIsReceived)
                    }
                    disabled={!canManageProgress(status)}
                  />
                </View>

                <CalendarField
                  label="発送予定日"
                  value={shipDate}
                  onPress={() => setCalendarTarget('ship')}
                  onClear={() => setShipDate('')}
                />
                <CalendarField
                  label="受取予定日"
                  value={receiveDate}
                  onPress={() => setCalendarTarget('receive')}
                  onClear={() => setReceiveDate('')}
                />
              </>
            ) : null}

            {tradeFormStep === 'notes' ? (
              <>
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
                  {currentEditImageUri ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setPreviewImage({ uri: currentEditImageUri, title: '取引画像' })}
                    >
                      <Image source={{ uri: currentEditImageUri }} style={styles.previewImage} />
                    </Pressable>
                  ) : (
                    <View style={styles.previewPlaceholder}>
                      <Text style={styles.placeholderText}>画像なし</Text>
                    </View>
                  )}
                  {uploadingImage ? (
                    <View style={styles.uploadNotice}>
                      <ActivityIndicator color={colors.primary} size="small" />
                      <Text style={styles.uploadNoticeText}>画像をアップロード中...</Text>
                    </View>
                  ) : null}
                  <View style={styles.rowActions}>
                    <AppButton label="画像を選ぶ" variant="secondary" disabled={saving} onPress={pickImage} />
                    <AppButton label="撮影する" variant="secondary" disabled={saving} onPress={takePhoto} />
                    <AppButton
                      label="画像を削除"
                      variant="ghost"
                      disabled={saving || !currentEditImageUri}
                      onPress={confirmRemoveImage}
                    />
                  </View>
                </View>
              </>
            ) : null}
          </View>

          <View style={styles.modalActions}>
            <View style={styles.modalNavActions}>
              <AppButton
                label="キャンセル"
                variant="cancel"
                disabled={saving}
                onPress={() => {
                  setCameraVisible(false);
                  setModalVisible(false);
                }}
              />
              <View style={styles.modalStepActions}>
                {!isFirstTradeFormStep ? (
                  <AppButton label="前へ" variant="ghost" disabled={saving} onPress={() => moveTradeFormStep(-1)} />
                ) : null}
                {!isLastTradeFormStep ? (
                  <AppButton label="次へ" variant="secondary" disabled={saving} onPress={() => moveTradeFormStep(1)} />
                ) : null}
              </View>
            </View>
            <AppButton
              label={uploadingImage ? '画像アップロード中...' : saving ? '保存中...' : '保存する'}
              disabled={saving}
              onPress={saveTrade}
            />
          </View>
          </ScrollView>
          <CalendarPickerModal
            visible={calendarTarget !== null}
            title={calendarTarget === 'ship' ? '発送予定日を選択' : '受取予定日を選択'}
            value={calendarTarget === 'ship' ? shipDate : receiveDate}
            onClose={() => setCalendarTarget(null)}
            onClear={() => {
              if (calendarTarget === 'ship') setShipDate('');
              if (calendarTarget === 'receive') setReceiveDate('');
              setCalendarTarget(null);
            }}
            onSelect={(date) => {
              if (calendarTarget === 'ship') setShipDate(date);
              if (calendarTarget === 'receive') setReceiveDate(date);
              setCalendarTarget(null);
            }}
          />
            </>
          )}
        </View>
      </Modal>
      <ImagePreviewModal
        uri={previewImage?.uri ?? null}
        title={previewImage?.title}
        onClose={() => setPreviewImage(null)}
      />
      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
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

function MoneySummary({ label, amount }: { label: string; amount: number }) {
  return (
    <View style={styles.moneySummaryBox}>
      <Text style={styles.moneySummaryLabel}>{label}</Text>
      <Text style={styles.moneySummaryValue}>{formatMoney(amount)}</Text>
    </View>
  );
}

function CalendarField({
  label,
  value,
  onPress,
  onClear,
}: {
  label: string;
  value: string;
  onPress: () => void;
  onClear: () => void;
}) {
  return (
    <View style={styles.calendarField}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.calendarFieldRow}>
        <Pressable accessibilityRole="button" onPress={onPress} style={styles.calendarValueButton}>
          <Text style={[styles.calendarValueText, !value ? styles.calendarValuePlaceholder : null]}>
            {value || '日付を選択'}
          </Text>
        </Pressable>
        {value ? <AppButton label="消す" variant="ghost" onPress={onClear} /> : null}
      </View>
    </View>
  );
}

function CalendarPickerModal({
  visible,
  title,
  value,
  onSelect,
  onClear,
  onClose,
}: {
  visible: boolean;
  title: string;
  value: string;
  onSelect: (date: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const selectedDate = parseDateValue(value);
  const [visibleMonth, setVisibleMonth] = useState(() => selectedDate ?? new Date());

  useEffect(() => {
    if (visible) {
      setVisibleMonth(selectedDate ?? new Date());
    }
  }, [selectedDate?.getTime(), visible]);

  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const days = buildCalendarDays(year, month);

  function moveMonth(diff: number) {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + diff, 1));
  }

  if (!visible) return null;

  return (
    <View style={styles.calendarOverlay}>
      <View style={styles.calendarPanel}>
        <Text style={styles.calendarTitle}>{title}</Text>
        <View style={styles.calendarHeader}>
          <AppButton label="前月" variant="ghost" onPress={() => moveMonth(-1)} />
          <Text style={styles.calendarMonthText}>{year}年 {month + 1}月</Text>
          <AppButton label="翌月" variant="ghost" onPress={() => moveMonth(1)} />
        </View>
        <View style={styles.weekdayRow}>
          {calendarWeekdays.map((weekday) => (
            <Text key={weekday} style={styles.weekdayText}>{weekday}</Text>
          ))}
        </View>
        <View style={styles.calendarGrid}>
          {days.map((date, index) => {
            if (!date) {
              return <View key={`empty-${index}`} style={styles.calendarDayPlaceholder} />;
            }

            const dateValue = formatDateValue(date);
            const selected = value === dateValue;
            return (
              <Pressable
                key={dateValue}
                accessibilityRole="button"
                onPress={() => onSelect(dateValue)}
                style={[styles.calendarDayButton, selected ? styles.calendarDaySelected : null]}
              >
                <Text style={[styles.calendarDayText, selected ? styles.calendarDayTextSelected : null]}>
                  {date.getDate()}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.calendarActions}>
          <AppButton label="閉じる" variant="cancel" onPress={onClose} />
          <AppButton label="日付を消す" variant="ghost" onPress={onClear} />
          <AppButton label="今日" variant="secondary" onPress={() => onSelect(formatDateValue(new Date()))} />
        </View>
      </View>
    </View>
  );
}

function ConfirmDialog({
  dialog,
  onClose,
}: {
  dialog: ConfirmDialogState;
  onClose: () => void;
}) {
  if (!dialog) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.confirmOverlay}>
        <View style={styles.confirmPanel}>
          <Text style={styles.confirmTitle}>{dialog.title}</Text>
          <ScrollView style={styles.confirmMessageScroll} contentContainerStyle={styles.confirmMessageContent}>
            <Text style={styles.confirmMessage}>{dialog.message}</Text>
          </ScrollView>
          <View style={styles.confirmActions}>
            {dialog.actions.map((action, index) => {
              const label = action.text ?? 'OK';
              const variant =
                action.style === 'destructive'
                  ? 'danger'
                  : action.style === 'cancel'
                    ? 'cancel'
                    : 'primary';

              return (
                <AppButton
                  key={`${label}-${index}`}
                  label={label}
                  variant={variant}
                  onPress={() => {
                    onClose();
                    action.onPress?.();
                  }}
                />
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
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
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
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

function canManageProgress(status: TradeStatus) {
  return progressStatuses.includes(status);
}

function isTradeProgressComplete(flags: Pick<Trade, 'is_packed' | 'is_sent' | 'is_received'>) {
  return Boolean(flags.is_packed && flags.is_sent && flags.is_received);
}

function getNextTradeFlags(
  trade: Trade,
  field: 'is_packed' | 'is_sent' | 'is_received',
  value: boolean,
) {
  return {
    is_packed: field === 'is_packed' ? value : Boolean(trade.is_packed),
    is_sent: field === 'is_sent' ? value : Boolean(trade.is_sent),
    is_received: field === 'is_received' ? value : Boolean(trade.is_received),
  };
}

function getNextModalFlags(
  field: 'is_packed' | 'is_sent' | 'is_received',
  value: boolean,
  current: Pick<Trade, 'is_packed' | 'is_sent' | 'is_received'>,
) {
  return {
    is_packed: field === 'is_packed' ? value : current.is_packed,
    is_sent: field === 'is_sent' ? value : current.is_sent,
    is_received: field === 'is_received' ? value : current.is_received,
  };
}

function buildStatusPatch(trade: Trade, nextStatus: TradeStatus): Partial<TradeInput> {
  if (nextStatus === '取引完了') {
    return {
      status: nextStatus,
      is_packed: true,
      is_sent: true,
      is_received: true,
    };
  }

  if (nextStatus === '成約') {
    return {
      status: nextStatus,
      is_packed: Boolean(trade.is_packed),
      is_sent: Boolean(trade.is_sent),
      is_received: Boolean(trade.is_received),
    };
  }

  return {
    status: nextStatus,
    is_packed: false,
    is_sent: false,
    is_received: false,
  };
}

function toMoneyInput(value: string) {
  return value.replace(/[^\d]/g, '');
}

function parseMoneyInput(value: string) {
  const normalized = toMoneyInput(value);
  if (!normalized) return 0;
  return Number(normalized);
}

function formatMoney(value: number | null | undefined) {
  return `${Math.max(0, Number(value ?? 0)).toLocaleString('ja-JP')}円`;
}

function normalizeDateInput(value: string) {
  return parseDateValue(value) ? value : null;
}

function parseDateValue(value: string | null | undefined) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

function formatDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: Array<Date | null> = [];

  for (let index = 0; index < firstDay.getDay(); index += 1) {
    days.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push(new Date(year, month, day));
  }

  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return days;
}

function buildTradeSummaryMessage(input: TradeInput, goods: GoodsItem[], hasNewImage: boolean) {
  const giveItemsText = formatTradeItemsForSummary(input.give_items, goods);
  const receiveItemsText = formatTradeItemsForSummary(input.receive_items, goods);
  const progressText = canManageProgress(input.status)
    ? `梱包:${input.is_packed ? '済' : '未'} / 発送:${input.is_sent ? '済' : '未'} / 受取:${input.is_received ? '済' : '未'}`
    : '対象外';

  return [
    `相手: ${input.name}`,
    `内容: ${input.type}`,
    `ステータス: ${input.status}`,
    `渡すもの: ${giveItemsText}`,
    `受けるもの: ${receiveItemsText}`,
    `渡す金額: ${formatMoney(input.give_price)}`,
    `受ける金額: ${formatMoney(input.receive_price)}`,
    `発送予定日: ${input.est_ship_date ?? '未設定'}`,
    `受取予定日: ${input.est_receive_date ?? '未設定'}`,
    `進行: ${progressText}`,
    `画像: ${hasNewImage ? '新しい画像あり' : input.image_url ? '登録済み' : 'なし'}`,
  ].join('\n');
}

function formatTradeItemsForSummary(items: TradeItem[], goods: GoodsItem[]) {
  if (!items.length) return 'なし';

  return items
    .map((item) => {
      const good = goods.find((candidate) => String(candidate.id) === String(item.id));
      const label = good ? `${good.type}/${good.char}` : `ID:${item.id}`;
      return `${label} x${item.count}`;
    })
    .join(', ');
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

  const addActualDelta = (itemId: RowId, delta: number) => {
    const sid = String(itemId);
    actualDeltas.set(sid, (actualDeltas.get(sid) ?? 0) + delta);
    affectedItemIds.add(sid);
  };

  const addTradeImpact = (trade: Trade | null, direction: 1 | -1) => {
    if (!trade) return;

    if (trade.is_sent) {
      for (const item of trade.give_items ?? []) {
        addActualDelta(item.id, -item.count * direction);
      }
    }

    if (trade.is_received) {
      for (const item of trade.receive_items ?? []) {
        addActualDelta(item.id, item.count * direction);
      }
    }
  };

  const actualDeltas = new Map<string, number>();
  addTradeImpact(oldTrade, -1);
  addTradeImpact(newTrade, 1);

  const updateActual = (itemId: string, delta: number) => {
    const sid = String(itemId);
    const index = nextGoods.findIndex((item) => String(item.id) === sid);
    if (index < 0) return;

    const item = nextGoods[index];
    if (!item) return;
    const nextCount = Math.max(0, (item?.count ?? 0) + delta);
    nextGoods[index] = { ...item, count: nextCount };
    affectedItemIds.add(sid);
  };

  for (const [itemId, delta] of actualDeltas) {
    if (delta !== 0) {
      updateActual(itemId, delta);
    }
  }

  addAffectedItems(oldTrade);
  addAffectedItems(newTrade);

  for (const itemId of affectedItemIds) {
    const index = nextGoods.findIndex((item) => String(item.id) === itemId);
    if (index < 0) continue;

    const item = nextGoods[index];
    if (!item) continue;
    const actualCount = item?.count ?? 0;
    const plannedCount = calculatePlannedStockCount(actualCount, itemId, nextTrades);
    nextGoods[index] = { ...item, planned_count: plannedCount };
    await updateGoodsStock(userId, item.id, {
      count: actualCount,
      planned_count: plannedCount,
    });
  }

  return nextGoods;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  toolbar: {
    gap: 10,
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
  imageTapArea: {
    borderRadius: 8,
  },
  tradeDetailGrid: {
    gap: 8,
  },
  moneySummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  moneySummaryBox: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    minWidth: 130,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  moneySummaryLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
  },
  moneySummaryValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
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
  modalRoot: {
    backgroundColor: colors.background,
    flex: 1,
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
  formStepTabs: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
  },
  formStepTab: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  formStepTabActive: {
    backgroundColor: colors.primary,
  },
  formStepTabText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '900',
  },
  formStepTabTextActive: {
    color: colors.primaryText,
  },
  formStepBody: {
    gap: 16,
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
  moneyPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  moneyInputGrid: {
    gap: 10,
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
  calendarField: {
    gap: 8,
  },
  calendarFieldRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  calendarValueButton: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  calendarValueText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  calendarValuePlaceholder: {
    color: colors.muted,
  },
  calendarOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'center',
    padding: 18,
  },
  calendarPanel: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    maxWidth: 420,
    padding: 16,
    width: '100%',
  },
  calendarTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  calendarHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  calendarMonthText: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayText: {
    color: colors.muted,
    flex: 1,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDayPlaceholder: {
    aspectRatio: 1,
    width: `${100 / 7}%`,
  },
  calendarDayButton: {
    alignItems: 'center',
    aspectRatio: 1,
    borderRadius: 8,
    justifyContent: 'center',
    width: `${100 / 7}%`,
  },
  calendarDaySelected: {
    backgroundColor: colors.primary,
  },
  calendarDayText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  calendarDayTextSelected: {
    color: colors.primaryText,
  },
  calendarActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
  },
  confirmOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    flex: 1,
    justifyContent: 'center',
    padding: 18,
  },
  confirmPanel: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    maxHeight: '86%',
    maxWidth: 480,
    padding: 16,
    width: '100%',
  },
  confirmTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  confirmMessageScroll: {
    maxHeight: 360,
  },
  confirmMessageContent: {
    paddingBottom: 4,
  },
  confirmMessage: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
  },
  confirmActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
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
  uploadNotice: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  uploadNoticeText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  placeholderText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modalActions: {
    gap: 10,
  },
  modalNavActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  modalStepActions: {
    flexDirection: 'row',
    gap: 8,
  },
});
