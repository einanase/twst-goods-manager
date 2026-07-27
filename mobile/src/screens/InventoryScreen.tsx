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
  Text,
  useWindowDimensions,
  View,
  type AlertButton,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { AppButton } from '../components/AppButton';
import { CameraCaptureModal, type CapturedImageAsset } from '../components/CameraCaptureModal';
import { EmptyState } from '../components/EmptyState';
import { ImageCropModal, type CroppedImageAsset } from '../components/ImageCropModal';
import { ImagePreviewModal } from '../components/ImagePreviewModal';
import { QuantityStepper } from '../components/QuantityStepper';
import { TextField } from '../components/TextField';
import {
  applyCalculatedPlannedStockRange,
  applyPlannedStockRange,
  calculatePlannedStockRange,
  formatPlannedStockCount,
  getPlannedStockRangeFromItem,
  getStoredPlannedStockCount,
} from '../lib/stockProjection';
import { colors } from '../lib/theme';
import { formatTradeItemQuantity } from '../lib/tradeItemQuantity';
import { formatTradeNumber } from '../lib/tradeNumber';
import type { GoodsItem, RowId, Trade, TradeItem, TradeStatus } from '../types/domain';
import {
  createGoods,
  deleteGoods,
  loadGoods,
  updateGoods,
  updateGoodsSortOrders,
  updateGoodsStock,
} from '../services/goodsService';
import { getStoredImageValue, removeStoredImage, uploadPrivateImageFromUri } from '../services/imageStorage';
import { loadTrades } from '../services/tradeService';

type InventoryScreenProps = {
  userId: string;
  onOpenTrade?: (tradeId: RowId) => void;
};

type ImagePreview = {
  uri: string;
  title: string;
} | null;

type ConfirmDialogState = {
  title: string;
  message: string;
  actions: AlertButton[];
} | null;

type PendingCropImage = {
  uri: string;
  fileName: string | null;
} | null;

type InventoryView = 'list' | 'gallery';
type PlannedTradeStatus = Extract<TradeStatus, '成約' | '仮約束'>;
type PlannedTradeDirection = 'give' | 'receive';
type PlannedTradeEntry = {
  trade: Trade;
  item: TradeItem;
};
type PlannedTradeGroups = Record<PlannedTradeDirection, Record<PlannedTradeStatus, PlannedTradeEntry[]>>;

const INVENTORY_VIEW_STORAGE_KEY = 'guttore.inventoryView';
const plannedTradeStatuses: PlannedTradeStatus[] = ['成約', '仮約束'];

export function InventoryScreen({ userId, onOpenTrade }: InventoryScreenProps) {
  const [items, setItems] = useState<GoodsItem[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [inventoryView, setInventoryView] = useState<InventoryView>(getInitialInventoryView);
  const [reorderMode, setReorderMode] = useState(false);
  const [reorderSaving, setReorderSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<GoodsItem | null>(null);
  const [type, setType] = useState('');
  const [name, setName] = useState('');
  const [count, setCount] = useState(0);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [storedImageValue, setStoredImageValue] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<ImagePreview>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const [pendingCropImage, setPendingCropImage] = useState<PendingCropImage>(null);
  const [plannedDetailItemId, setPlannedDetailItemId] = useState<RowId | null>(null);
  const [countAdjustItem, setCountAdjustItem] = useState<GoodsItem | null>(null);
  const [countAdjustDraft, setCountAdjustDraft] = useState('');
  const [countAdjustSaving, setCountAdjustSaving] = useState(false);
  const { width } = useWindowDimensions();

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
      const [nextItems, nextTrades] = await Promise.all([loadGoods(userId), loadTrades(userId)]);
      setTrades(nextTrades);
      setItems(nextItems.map((item) => applyCalculatedPlannedStockRange(item, nextTrades)));
    } catch (error) {
      showError('在庫の読み込みに失敗しました', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(INVENTORY_VIEW_STORAGE_KEY, inventoryView);
    } catch {
      // 表示切替の保存に失敗しても、一覧操作自体はそのまま使える。
    }
  }, [inventoryView]);

  const hasSearch = search.trim().length > 0;
  const canUseReorderMode = !hasSearch && items.length > 1;
  const isGalleryView = inventoryView === 'gallery';
  const galleryColumnCount = width >= 900 ? 4 : width >= 640 ? 3 : 2;

  useEffect(() => {
    if (!hasSearch) return;
    setReorderMode(false);
  }, [hasSearch]);

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) =>
      `${item.type} ${item.char}`.toLowerCase().includes(keyword),
    );
  }, [items, search]);

  const plannedDetailItem = useMemo(() => {
    if (plannedDetailItemId === null) return null;
    return items.find((item) => idsMatch(item.id, plannedDetailItemId)) ?? null;
  }, [items, plannedDetailItemId]);

  function openCreate() {
    setCameraVisible(false);
    setPendingCropImage(null);
    setEditingItem(null);
    setType('');
    setName('');
    setCount(0);
    setImageUri(null);
    setImageName(null);
    setStoredImageValue(null);
    setModalVisible(true);
  }

  function openEdit(item: GoodsItem) {
    setCameraVisible(false);
    setPendingCropImage(null);
    setEditingItem(item);
    setType(item.type ?? '');
    setName(item.char ?? '');
    setCount(item.count ?? 0);
    setImageUri(null);
    setImageName(null);
    setStoredImageValue(getStoredImageValue(item.image_url));
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
    if (Platform.OS === 'web') {
      setPendingCropImage({
        uri: asset.uri,
        fileName: asset.fileName ?? null,
      });
      return;
    }

    setImageUri(asset.uri);
    setImageName(asset.fileName ?? null);
  }

  function applyCroppedImage(asset: CroppedImageAsset) {
    setImageUri(asset.uri);
    setImageName(asset.fileName);
    setPendingCropImage(null);
  }

  function openCropEditor() {
    if (!currentEditImageUri) return;
    if (Platform.OS !== 'web') {
      showNotice('PWA版で利用できます', '切り抜き編集はWeb/PWA版で利用できます。');
      return;
    }

    setPendingCropImage({
      uri: currentEditImageUri,
      fileName: imageName ?? 'goods-image.png',
    });
  }

  function clearImage() {
    setImageUri(null);
    setImageName(null);
    setStoredImageValue(null);
    setPendingCropImage(null);
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

  async function saveItem() {
    if (!type.trim() || !name.trim()) {
      showNotice('入力不足', 'グッズ種類と品名・絵柄を入力してください。');
      return;
    }

    setSaving(true);
    try {
      let nextImageValue = storedImageValue;
      if (imageUri) {
        setUploadingImage(true);
        nextImageValue = await uploadPrivateImageFromUri({
          userId,
          uri: imageUri,
          fileName: imageName,
          prefix: 'inv',
        });
      }

      const latestTrades = editingItem ? await loadTrades(userId) : trades;
      if (editingItem) setTrades(latestTrades);
      const plannedRange = editingItem
        ? calculatePlannedStockRange(count, editingItem.id, latestTrades)
        : { min: count, max: count };

      const input = {
        type: type.trim(),
        char: name.trim(),
        count,
        planned_count: getStoredPlannedStockCount(plannedRange),
        image_url: nextImageValue,
        sort_order: editingItem?.sort_order ?? null,
      };

      const saved = editingItem
        ? await updateGoods(userId, editingItem.id, input)
        : await createGoods(userId, input);

      if (editingItem?.image_url && getStoredImageValue(editingItem.image_url) !== nextImageValue) {
        await removeStoredImage(userId, editingItem.image_url);
      }

      const savedWithPlannedRange = applyPlannedStockRange(saved, plannedRange);
      setItems((current) => {
        if (!editingItem) return [savedWithPlannedRange, ...current];
        return current.map((item) => (String(item.id) === String(saved.id) ? savedWithPlannedRange : item));
      });
      setCameraVisible(false);
      setModalVisible(false);
    } catch (error) {
      showError('在庫の保存に失敗しました', error);
    } finally {
      setUploadingImage(false);
      setSaving(false);
    }
  }

  async function changeCount(item: GoodsItem, nextCount: number) {
    const previous = items;
    const currentRange = getPlannedStockRangeFromItem(item);
    const currentActual = item.count ?? 0;
    const optimisticMin = nextCount + currentRange.min - currentActual;
    const optimisticMax = Math.max(optimisticMin, nextCount + currentRange.max - currentActual);

    setItems((current) =>
      current.map((candidate) =>
        String(candidate.id) === String(item.id)
          ? applyPlannedStockRange({ ...candidate, count: nextCount }, { min: optimisticMin, max: optimisticMax })
          : candidate,
      ),
    );

    try {
      const nextTrades = await loadTrades(userId);
      setTrades(nextTrades);
      const plannedRange = calculatePlannedStockRange(nextCount, item.id, nextTrades);
      await updateGoodsStock(userId, item.id, {
        count: nextCount,
        planned_count: getStoredPlannedStockCount(plannedRange),
      });
      setItems((current) =>
        current.map((candidate) =>
          String(candidate.id) === String(item.id)
            ? applyPlannedStockRange({ ...candidate, count: nextCount }, plannedRange)
            : candidate,
        ),
      );
      return true;
    } catch (error) {
      setItems(previous);
      showError('在庫数の更新に失敗しました', error);
      return false;
    }
  }

  function toggleReorderMode() {
    setReorderMode((current) => !current);
  }

  async function persistReorderedItems(previousItems: GoodsItem[], nextItems: GoodsItem[]) {
    setItems(nextItems);
    setReorderSaving(true);

    try {
      await updateGoodsSortOrders(
        userId,
        nextItems.map((item, index) => ({ id: item.id, sort_order: index })),
      );
    } catch (error) {
      setItems(previousItems);
      const message = error instanceof Error ? error.message : String(error);
      showNotice('並び替えを保存できませんでした', message);
    } finally {
      setReorderSaving(false);
    }
  }

  async function moveItem(item: GoodsItem, direction: -1 | 1) {
    if (!canUseReorderMode || !reorderMode || reorderSaving) return;

    const currentIndex = items.findIndex((candidate) => idsMatch(candidate.id, item.id));
    const nextIndex = currentIndex + direction;
    const nextItems = moveGoodsItem(items, currentIndex, nextIndex);
    if (nextItems === items) return;

    await persistReorderedItems(items, nextItems);
  }

  async function confirmDelete(item: GoodsItem) {
    confirmAction('削除しますか？', `${item.type} / ${item.char} を削除します。`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteGoods(userId, item.id);
            await removeStoredImage(userId, item.image_url);
            if (idsMatch(plannedDetailItemId, item.id)) setPlannedDetailItemId(null);
            setItems((current) => current.filter((candidate) => String(candidate.id) !== String(item.id)));
          } catch (error) {
            showError('削除に失敗しました', error);
          }
        },
      },
    ]);
  }

  const currentEditImageUri = imageUri ?? (editingItem?.image_display_url && storedImageValue ? editingItem.image_display_url : null);

  function openTradeFromPlannedDetail(tradeId: RowId) {
    setPlannedDetailItemId(null);
    onOpenTrade?.(tradeId);
  }

  function toggleSearchVisible() {
    if (searchVisible) {
      setSearch('');
      setSearchVisible(false);
      return;
    }

    setSearchVisible(true);
  }

  function openCountAdjust(item: GoodsItem) {
    setCountAdjustItem(item);
    setCountAdjustDraft(String(item.count ?? 0));
  }

  function closeCountAdjust() {
    if (countAdjustSaving) return;
    setCountAdjustItem(null);
    setCountAdjustDraft('');
  }

  async function saveCountAdjust() {
    if (!countAdjustItem) return;

    const nextCount = parseCountInput(countAdjustDraft);
    if (nextCount === null) {
      showNotice('実数を入力してください', '0以上の数字で入力してください。');
      return;
    }

    const latestItem =
      items.find((candidate) => idsMatch(candidate.id, countAdjustItem.id)) ?? countAdjustItem;
    setCountAdjustSaving(true);
    const saved = await changeCount(latestItem, nextCount);
    setCountAdjustSaving(false);
    if (saved) {
      setCountAdjustItem(null);
      setCountAdjustDraft('');
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.toolbar}>
        <View style={styles.toolbarActions}>
          <AppButton
            label={searchVisible ? '閉じる' : '検索'}
            variant={searchVisible || hasSearch ? 'secondary' : 'ghost'}
            disabled={reorderSaving}
            size="compact"
            onPress={toggleSearchVisible}
          />
          <View style={styles.viewToggle}>
            <AppButton
              label="一覧"
              variant={inventoryView === 'list' ? 'secondary' : 'ghost'}
              disabled={reorderSaving}
              size="compact"
              onPress={() => setInventoryView('list')}
            />
            <AppButton
              label="画像"
              variant={inventoryView === 'gallery' ? 'secondary' : 'ghost'}
              disabled={reorderSaving}
              size="compact"
              onPress={() => setInventoryView('gallery')}
            />
          </View>
          <AppButton
            label={reorderSaving ? '保存中...' : reorderMode ? '完了' : '並び替え'}
            variant="secondary"
            disabled={loading || saving || reorderSaving || hasSearch || items.length < 2}
            size="compact"
            onPress={toggleReorderMode}
          />
          <AppButton label="追加" size="compact" onPress={openCreate} />
        </View>
        {searchVisible ? (
          <TextField
            label="検索"
            value={search}
            onChangeText={setSearch}
            placeholder="種類・品名で検索"
            style={styles.searchInput}
            autoFocus
          />
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : (
        <FlatList
          key={isGalleryView ? `gallery-${galleryColumnCount}` : 'list'}
          columnWrapperStyle={isGalleryView ? styles.galleryRow : undefined}
          contentContainerStyle={[styles.listContent, isGalleryView ? styles.galleryContent : null]}
          data={filteredItems}
          extraData={{ inventoryView, reorderMode, reorderSaving, width }}
          keyExtractor={(item) => String(item.id)}
          ListEmptyComponent={
            <EmptyState title="在庫がありません" body="まずはグッズを追加して、交換に使う在庫を記録します。" />
          }
          numColumns={isGalleryView ? galleryColumnCount : 1}
          renderItem={({ item }) => {
            const actualCount = item.count ?? 0;
            const plannedCountText = formatPlannedStockCount(item);
            const itemIndex = items.findIndex((candidate) => idsMatch(candidate.id, item.id));
            const canMoveUp = itemIndex > 0;
            const canMoveDown = itemIndex >= 0 && itemIndex < items.length - 1;
            const actionControls = reorderMode ? (
              <View style={styles.reorderControls}>
                <AppButton
                  label="上へ"
                  variant="secondary"
                  disabled={!canMoveUp || reorderSaving}
                  size="compact"
                  onPress={() => moveItem(item, -1)}
                />
                <AppButton
                  label="下へ"
                  variant="secondary"
                  disabled={!canMoveDown || reorderSaving}
                  size="compact"
                  onPress={() => moveItem(item, 1)}
                />
              </View>
            ) : (
              <View style={styles.itemActions}>
                <AppButton label="編集" variant="secondary" size="compact" onPress={() => openEdit(item)} />
                <AppButton label="削除" variant="danger" size="compact" onPress={() => confirmDelete(item)} />
              </View>
            );

            if (isGalleryView) {
              return (
                <Pressable
                  style={[styles.galleryCard, reorderMode ? styles.reorderCard : null]}
                  onPress={() => {
                    if (reorderMode) return;
                    setPlannedDetailItemId(item.id);
                  }}
                >
                  <Pressable
                    accessibilityRole="imagebutton"
                    onPress={(event) => {
                      event.stopPropagation();
                      if (reorderMode) return;
                      if (item.image_display_url) {
                        setPreviewImage({ uri: item.image_display_url, title: `${item.type} / ${item.char}` });
                      }
                    }}
                    style={styles.galleryImageTapArea}
                  >
                    {item.image_display_url ? (
                      <Image source={{ uri: item.image_display_url }} resizeMode="contain" style={styles.galleryImage} />
                    ) : (
                      <Text style={styles.imagePlaceholderText}>No Image</Text>
                    )}
                  </Pressable>
                  <View style={styles.galleryBody}>
                    <Text style={styles.itemType} numberOfLines={1}>{item.type}</Text>
                    <Text style={styles.itemName} numberOfLines={2}>{item.char}</Text>
                    <View style={styles.galleryCountSummary}>
                      <View style={styles.galleryCountBadge}>
                        <Text style={styles.countBadgeLabel}>予定数</Text>
                        <Text style={styles.countBadgeValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                          {plannedCountText}
                        </Text>
                      </View>
                      <ActualCountBadge
                        count={actualCount}
                        disabled={reorderMode || reorderSaving}
                        onAdjust={() => openCountAdjust(item)}
                      />
                    </View>
                  </View>
                  <View style={styles.galleryActions}>{actionControls}</View>
                </Pressable>
              );
            }

            return (
              <Pressable
                style={[styles.card, reorderMode ? styles.reorderCard : null]}
                onPress={() => {
                  if (reorderMode) return;
                  setPlannedDetailItemId(item.id);
                }}
              >
                {item.image_display_url ? (
                  <Pressable
                    accessibilityRole="imagebutton"
                    onPress={(event) => {
                      event.stopPropagation();
                      if (reorderMode) return;
                      setPreviewImage({ uri: item.image_display_url ?? '', title: `${item.type} / ${item.char}` });
                    }}
                    style={styles.imageTapArea}
                  >
                    <Image source={{ uri: item.image_display_url }} style={styles.goodsImage} />
                  </Pressable>
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Text style={styles.imagePlaceholderText}>No Image</Text>
                  </View>
                )}
                <View style={styles.cardBody}>
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.cardTitleBlock}>
                      <Text style={styles.itemType} numberOfLines={1}>{item.type}</Text>
                      <Text style={styles.itemName} numberOfLines={1}>{item.char}</Text>
                    </View>
                    {actionControls}
                  </View>
                  <View style={styles.stockControlsRow}>
                    <View style={styles.countSummary}>
                      <View style={styles.countBadge}>
                        <Text style={styles.countBadgeLabel}>予定数</Text>
                        <Text style={styles.countBadgeValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                          {plannedCountText}
                        </Text>
                      </View>
                      <ActualCountBadge
                        count={actualCount}
                        disabled={reorderMode || reorderSaving}
                        onAdjust={() => openCountAdjust(item)}
                      />
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <Modal
        animationType="slide"
        visible={modalVisible}
        onRequestClose={() => {
          setCameraVisible(false);
          setModalVisible(false);
        }}
      >
        {cameraVisible ? (
          <CameraCaptureModal
            visible={cameraVisible}
            title="グッズ画像を撮影"
            onCancel={() => setCameraVisible(false)}
            onUsePhoto={applyCapturedPhoto}
          />
        ) : (
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingItem ? '在庫を編集' : '在庫を追加'}</Text>
            <TextField label="グッズ種類" value={type} onChangeText={setType} placeholder="例：缶バッジ" />
            <TextField label="品名・絵柄" value={name} onChangeText={setName} placeholder="例：A柄 / 通常版" />
            <View style={styles.stepperField}>
              <Text style={styles.stepperLabel}>実数</Text>
              {editingItem ? (
                <Text style={styles.plannedHint}>
                  予定数: {formatPlannedStockCount(editingItem)}
                </Text>
              ) : null}
              <QuantityStepper value={count} onChange={setCount} />
            </View>

            <View style={styles.imageEditBox}>
              <Text style={styles.stepperLabel}>グッズ画像</Text>
              {currentEditImageUri ? (
                <Pressable
                  accessibilityRole="imagebutton"
                  onPress={() => setPreviewImage({ uri: currentEditImageUri, title: 'グッズ画像' })}
                >
                  <Image source={{ uri: currentEditImageUri }} style={styles.previewImage} />
                </Pressable>
              ) : (
                <View style={styles.previewPlaceholder}>
                  <Text style={styles.imagePlaceholderText}>画像なし</Text>
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
                  label="切り抜き編集"
                  variant="secondary"
                  disabled={saving || !currentEditImageUri}
                  onPress={openCropEditor}
                />
                <AppButton
                  label="画像を削除"
                  variant="ghost"
                  disabled={saving || !currentEditImageUri}
                  onPress={confirmRemoveImage}
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <AppButton
                label="キャンセル"
                variant="ghost"
                disabled={saving}
                onPress={() => {
                  setCameraVisible(false);
                  setModalVisible(false);
                }}
              />
              <AppButton
                label={uploadingImage ? '画像アップロード中...' : saving ? '保存中...' : '保存する'}
                disabled={saving}
                onPress={saveItem}
              />
            </View>
          </ScrollView>
        )}
      </Modal>
      <ImagePreviewModal
        uri={previewImage?.uri ?? null}
        title={previewImage?.title}
        onClose={() => setPreviewImage(null)}
      />
      <PlannedTradesModal
        item={plannedDetailItem}
        onClose={() => setPlannedDetailItemId(null)}
        onOpenTrade={openTradeFromPlannedDetail}
        trades={trades}
      />
      <ImageCropModal
        source={pendingCropImage}
        visible={Boolean(pendingCropImage)}
        onCancel={() => setPendingCropImage(null)}
        onApply={applyCroppedImage}
      />
      <CountAdjustModal
        item={countAdjustItem}
        saving={countAdjustSaving}
        value={countAdjustDraft}
        onChangeValue={(value) => setCountAdjustDraft(normalizeCountInput(value))}
        onClose={closeCountAdjust}
        onSave={saveCountAdjust}
      />
      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </View>
  );
}

function ActualCountBadge({
  count,
  disabled,
  onAdjust,
}: {
  count: number;
  disabled: boolean;
  onAdjust: () => void;
}) {
  return (
    <View style={styles.countBadge}>
      <View style={styles.countBadgeHeader}>
        <Text style={styles.countBadgeLabel}>実数</Text>
        <AppButton
          label="調整"
          variant="secondary"
          disabled={disabled}
          size="compact"
          onPress={onAdjust}
        />
      </View>
      <Text style={styles.countBadgeValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {count}
      </Text>
    </View>
  );
}

function CountAdjustModal({
  item,
  saving,
  value,
  onChangeValue,
  onClose,
  onSave,
}: {
  item: GoodsItem | null;
  saving: boolean;
  value: string;
  onChangeValue: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal visible={Boolean(item)} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.confirmOverlay}>
        <View style={styles.countAdjustPanel}>
          <View style={styles.countAdjustHeader}>
            <View style={styles.countAdjustTitleBlock}>
              <Text style={styles.confirmTitle}>実数を調整</Text>
              <Text style={styles.countAdjustSubtitle} numberOfLines={2}>
                {item ? `${item.type} / ${item.char}` : ''}
              </Text>
            </View>
            <AppButton label="閉じる" variant="ghost" disabled={saving} size="compact" onPress={onClose} />
          </View>
          <TextField
            autoFocus
            inputMode="numeric"
            keyboardType="number-pad"
            label="実数"
            onChangeText={onChangeValue}
            onSubmitEditing={onSave}
            placeholder="例：80"
            selectTextOnFocus
            value={value}
          />
          <View style={styles.countAdjustActions}>
            <AppButton label="キャンセル" variant="ghost" disabled={saving} onPress={onClose} />
            <AppButton label={saving ? '保存中...' : '反映する'} disabled={saving} onPress={onSave} />
          </View>
        </View>
      </View>
    </Modal>
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

function PlannedTradesModal({
  item,
  trades,
  onClose,
  onOpenTrade,
}: {
  item: GoodsItem | null;
  trades: Trade[];
  onClose: () => void;
  onOpenTrade: (tradeId: RowId) => void;
}) {
  const groups = item ? buildPlannedTradeGroups(item.id, trades) : createEmptyPlannedTradeGroups();
  const hasEntries = hasPlannedTradeEntries(groups);

  return (
    <Modal visible={Boolean(item)} animationType="slide" onRequestClose={onClose}>
      <View style={styles.detailModalRoot}>
        <View style={styles.detailModalHeader}>
          <View style={styles.detailTitleBlock}>
            <Text style={styles.modalTitle}>予定の内訳</Text>
            <Text style={styles.detailSubtitle}>
              {item ? `${item.type} / ${item.char}` : ''}
            </Text>
          </View>
          <AppButton label="閉じる" variant="ghost" onPress={onClose} />
        </View>

        {item ? (
          <View style={styles.detailCountRow}>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeLabel}>予定数</Text>
              <Text style={styles.countBadgeValue}>{formatPlannedStockCount(item)}</Text>
            </View>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeLabel}>実数</Text>
              <Text style={styles.countBadgeValue}>{item.count ?? 0}</Text>
            </View>
          </View>
        ) : null}

        <ScrollView contentContainerStyle={styles.plannedDetailContent}>
          {hasEntries ? (
            <>
              <PlannedDirectionSection
                groups={groups.give}
                onOpenTrade={onOpenTrade}
                trades={trades}
                title="渡すもの"
              />
              <PlannedDirectionSection
                groups={groups.receive}
                onOpenTrade={onOpenTrade}
                trades={trades}
                title="受けるもの"
              />
            </>
          ) : (
            <View style={styles.plannedEmptyBox}>
              <Text style={styles.plannedEmptyTitle}>予定にかかっている取引はありません</Text>
              <Text style={styles.plannedEmptyText}>
                成約・仮約束のうち、未発送または未受取でこの在庫に関係する取引だけがここに出ます。
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function PlannedDirectionSection({
  title,
  groups,
  trades,
  onOpenTrade,
}: {
  title: string;
  groups: Record<PlannedTradeStatus, PlannedTradeEntry[]>;
  trades: Trade[];
  onOpenTrade: (tradeId: RowId) => void;
}) {
  const hasEntries = plannedTradeStatuses.some((status) => groups[status].length > 0);
  if (!hasEntries) return null;

  return (
    <View style={styles.plannedDirectionSection}>
      <Text style={styles.plannedDirectionTitle}>{title}</Text>
      {plannedTradeStatuses.map((status) => {
        const entries = groups[status];
        if (!entries.length) return null;

        return (
          <View key={`${title}-${status}`} style={styles.plannedStatusSection}>
            <Text style={styles.plannedStatusTitle}>{status}</Text>
            {entries.map((entry) => (
              <Pressable
                key={`${title}-${status}-${entry.trade.id}-${entry.item.id}-${entry.item.count}-${entry.item.min_count}-${entry.item.max_count}`}
                accessibilityRole="button"
                onPress={() => onOpenTrade(entry.trade.id)}
                style={styles.plannedTradeRow}
              >
                <View style={styles.plannedTradeTextBlock}>
                  <Text style={styles.plannedTradeName}>
                    {formatTradeNumber(trades, entry.trade.id)} {entry.trade.name}
                  </Text>
                  <Text style={styles.plannedTradeQuantity}>{formatTradeItemQuantity(entry.item)}</Text>
                </View>
                <Text style={styles.plannedTradeOpenText}>開く</Text>
              </Pressable>
            ))}
          </View>
        );
      })}
    </View>
  );
}

function showError(title: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  Alert.alert(title, message);
}

function getInitialInventoryView(): InventoryView {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 'list';
  try {
    const saved = window.localStorage.getItem(INVENTORY_VIEW_STORAGE_KEY);
    return saved === 'gallery' ? 'gallery' : 'list';
  } catch {
    return 'list';
  }
}

function normalizeCountInput(input: string) {
  return input
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
    .replace(/[^\d]/g, '');
}

function parseCountInput(input: string) {
  const normalized = normalizeCountInput(input);
  if (!normalized) return null;
  return Math.max(0, Math.trunc(Number(normalized) || 0));
}

function idsMatch(left: RowId | string | null | undefined, right: RowId | string | null | undefined) {
  if (left === null || left === undefined || right === null || right === undefined) return false;
  return String(left) === String(right);
}

function moveGoodsItem(items: GoodsItem[], currentIndex: number, nextIndex: number) {
  if (
    currentIndex < 0 ||
    nextIndex < 0 ||
    currentIndex >= items.length ||
    nextIndex >= items.length ||
    currentIndex === nextIndex
  ) {
    return items;
  }

  const reordered = [...items];
  const [movedItem] = reordered.splice(currentIndex, 1);
  if (!movedItem) return items;
  reordered.splice(nextIndex, 0, movedItem);
  return reordered.map((item, index) => ({ ...item, sort_order: index }));
}

function createEmptyPlannedTradeGroups(): PlannedTradeGroups {
  return {
    give: {
      成約: [],
      仮約束: [],
    },
    receive: {
      成約: [],
      仮約束: [],
    },
  };
}

function buildPlannedTradeGroups(itemId: RowId, trades: Trade[]): PlannedTradeGroups {
  const groups = createEmptyPlannedTradeGroups();
  const targetId = String(itemId);

  for (const trade of trades) {
    if (!isPlannedTradeStatus(trade.status)) continue;

    const giveItem = (trade.give_items ?? []).find((candidate) => String(candidate.id) === targetId);
    if (giveItem && !trade.is_sent) {
      groups.give[trade.status].push({ trade, item: giveItem });
    }

    const receiveItem = (trade.receive_items ?? []).find((candidate) => String(candidate.id) === targetId);
    if (receiveItem && !trade.is_received) {
      groups.receive[trade.status].push({ trade, item: receiveItem });
    }
  }

  return groups;
}

function isPlannedTradeStatus(status: TradeStatus): status is PlannedTradeStatus {
  return status === '成約' || status === '仮約束';
}

function hasPlannedTradeEntries(groups: PlannedTradeGroups) {
  return plannedTradeStatuses.some(
    (status) => groups.give[status].length > 0 || groups.receive[status].length > 0,
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  toolbar: {
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  toolbarActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-end',
  },
  viewToggle: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  searchInput: {
    minHeight: 42,
  },
  loader: {
    marginTop: 40,
  },
  listContent: {
    gap: 8,
    padding: 16,
    paddingTop: 0,
  },
  galleryContent: {
    gap: 10,
  },
  galleryRow: {
    gap: 10,
  },
  card: {
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  reorderCard: {
    borderColor: colors.secondary,
  },
  reorderControls: {
    flexDirection: 'row',
    flexShrink: 0,
    gap: 6,
  },
  itemActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flexShrink: 0,
    gap: 6,
    justifyContent: 'flex-end',
  },
  galleryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    maxWidth: 280,
    minWidth: 0,
    overflow: 'hidden',
  },
  galleryImageTapArea: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
    width: '100%',
  },
  galleryImage: {
    height: '100%',
    width: '100%',
  },
  galleryBody: {
    gap: 8,
    padding: 12,
  },
  galleryCountSummary: {
    flexDirection: 'row',
    gap: 8,
  },
  galleryCountBadge: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  galleryActions: {
    paddingBottom: 12,
    paddingHorizontal: 12,
  },
  goodsImage: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    height: 64,
    width: 64,
  },
  imageTapArea: {
    borderRadius: 8,
  },
  imagePlaceholder: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  imagePlaceholderText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  cardBody: {
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  cardHeaderRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
    minWidth: 0,
  },
  cardTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  itemType: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900',
  },
  itemName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  stockControlsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    minWidth: 0,
  },
  countSummary: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    minWidth: 142,
  },
  countBadge: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    flex: 1,
    gap: 2,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  countBadgeHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'space-between',
    minHeight: 36,
  },
  countBadgeLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
  },
  countBadgeValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
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
  countAdjustPanel: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    maxWidth: 420,
    padding: 16,
    width: '100%',
  },
  countAdjustHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  countAdjustTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  countAdjustSubtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
    marginTop: 2,
  },
  countAdjustActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
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
  stepperField: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  stepperLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  plannedHint: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
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
    height: 180,
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
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  detailModalRoot: {
    backgroundColor: colors.background,
    flex: 1,
  },
  detailModalHeader: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  detailTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  detailSubtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
  detailCountRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    paddingBottom: 0,
  },
  plannedDetailContent: {
    gap: 16,
    padding: 16,
    paddingBottom: 36,
  },
  plannedDirectionSection: {
    gap: 10,
  },
  plannedDirectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  plannedStatusSection: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  plannedStatusTitle: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '900',
  },
  plannedTradeRow: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  plannedTradeTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  plannedTradeName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  plannedTradeQuantity: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
  plannedTradeOpenText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  plannedEmptyBox: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 32,
  },
  plannedEmptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  plannedEmptyText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
});
