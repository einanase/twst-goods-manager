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
import { calculatePlannedStockCount } from '../lib/stockProjection';
import { colors } from '../lib/theme';
import type { GoodsItem, RowId } from '../types/domain';
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
const INVENTORY_VIEW_STORAGE_KEY = 'guttore.inventoryView';

export function InventoryScreen({ userId }: InventoryScreenProps) {
  const [items, setItems] = useState<GoodsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
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
      setItems(await loadGoods(userId));
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

      const input = {
        type: type.trim(),
        char: name.trim(),
        count,
        planned_count: editingItem?.planned_count ?? count,
        image_url: nextImageValue,
        sort_order: editingItem?.sort_order ?? null,
      };

      const saved = editingItem
        ? await updateGoods(userId, editingItem.id, input)
        : await createGoods(userId, input);

      if (editingItem?.image_url && getStoredImageValue(editingItem.image_url) !== nextImageValue) {
        await removeStoredImage(userId, editingItem.image_url);
      }

      setItems((current) => {
        if (!editingItem) return [saved, ...current];
        return current.map((item) => (String(item.id) === String(saved.id) ? saved : item));
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
    const pendingDiff = (item.planned_count ?? item.count ?? 0) - (item.count ?? 0);
    const optimisticPlannedCount = Math.max(0, nextCount + pendingDiff);

    setItems((current) =>
      current.map((candidate) =>
        String(candidate.id) === String(item.id)
          ? { ...candidate, count: nextCount, planned_count: optimisticPlannedCount }
          : candidate,
      ),
    );

    try {
      const trades = await loadTrades(userId);
      const plannedCount = calculatePlannedStockCount(nextCount, item.id, trades);
      await updateGoodsStock(userId, item.id, {
        count: nextCount,
        planned_count: plannedCount,
      });
      setItems((current) =>
        current.map((candidate) =>
          String(candidate.id) === String(item.id)
            ? { ...candidate, count: nextCount, planned_count: plannedCount }
            : candidate,
        ),
      );
    } catch (error) {
      setItems(previous);
      showError('在庫数の更新に失敗しました', error);
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
            setItems((current) => current.filter((candidate) => String(candidate.id) !== String(item.id)));
          } catch (error) {
            showError('削除に失敗しました', error);
          }
        },
      },
    ]);
  }

  const currentEditImageUri = imageUri ?? (editingItem?.image_display_url && storedImageValue ? editingItem.image_display_url : null);

  return (
    <View style={styles.screen}>
      <View style={styles.toolbar}>
        <TextField
          label="検索"
          value={search}
          onChangeText={setSearch}
          placeholder="種類・品名で検索"
          style={styles.searchInput}
        />
        <View style={styles.toolbarActions}>
          <View style={styles.viewToggle}>
            <AppButton
              label="一覧"
              variant={inventoryView === 'list' ? 'secondary' : 'ghost'}
              disabled={reorderSaving}
              onPress={() => setInventoryView('list')}
            />
            <AppButton
              label="画像"
              variant={inventoryView === 'gallery' ? 'secondary' : 'ghost'}
              disabled={reorderSaving}
              onPress={() => setInventoryView('gallery')}
            />
          </View>
          <AppButton
            label={reorderSaving ? '保存中...' : reorderMode ? '完了' : '並び替え'}
            variant="secondary"
            disabled={loading || saving || reorderSaving || hasSearch || items.length < 2}
            onPress={toggleReorderMode}
          />
          <AppButton label="追加" onPress={openCreate} />
        </View>
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
            const plannedCount = item.planned_count ?? actualCount;
            const itemIndex = items.findIndex((candidate) => idsMatch(candidate.id, item.id));
            const canMoveUp = itemIndex > 0;
            const canMoveDown = itemIndex >= 0 && itemIndex < items.length - 1;
            const actionControls = reorderMode ? (
              <View style={styles.reorderControls}>
                <AppButton
                  label="上へ"
                  variant="secondary"
                  disabled={!canMoveUp || reorderSaving}
                  onPress={() => moveItem(item, -1)}
                />
                <AppButton
                  label="下へ"
                  variant="secondary"
                  disabled={!canMoveDown || reorderSaving}
                  onPress={() => moveItem(item, 1)}
                />
              </View>
            ) : (
              <AppButton label="削除" variant="danger" onPress={() => confirmDelete(item)} />
            );

            if (isGalleryView) {
              return (
                <Pressable
                  style={[styles.galleryCard, reorderMode ? styles.reorderCard : null]}
                  onPress={() => {
                    if (reorderMode) return;
                    openEdit(item);
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
                        <Text style={styles.countBadgeValue}>{plannedCount}</Text>
                      </View>
                      <View style={styles.galleryCountBadge}>
                        <Text style={styles.countBadgeLabel}>実数</Text>
                        <Text style={styles.countBadgeValue}>{actualCount}</Text>
                      </View>
                    </View>
                    <View style={styles.galleryStepperRow}>
                      <Text style={styles.countLabel}>実数</Text>
                      <QuantityStepper
                        value={actualCount}
                        onChange={(next) => {
                          if (reorderMode) return;
                          changeCount(item, next);
                        }}
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
                  openEdit(item);
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
                  <Text style={styles.itemType}>{item.type}</Text>
                  <Text style={styles.itemName}>{item.char}</Text>
                  <View style={styles.countSummary}>
                    <View style={styles.countBadge}>
                      <Text style={styles.countBadgeLabel}>予定数</Text>
                      <Text style={styles.countBadgeValue}>{plannedCount}</Text>
                    </View>
                    <View style={styles.countBadge}>
                      <Text style={styles.countBadgeLabel}>実数</Text>
                      <Text style={styles.countBadgeValue}>{actualCount}</Text>
                    </View>
                  </View>
                  <View style={styles.countAdjustRow}>
                    <Text style={styles.countLabel}>実数を調整</Text>
                    <QuantityStepper
                      value={actualCount}
                      onChange={(next) => {
                        if (reorderMode) return;
                        changeCount(item, next);
                      }}
                    />
                  </View>
                </View>
                {actionControls}
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
                  予定数: {editingItem.planned_count ?? editingItem.count ?? 0}
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
      <ImageCropModal
        source={pendingCropImage}
        visible={Boolean(pendingCropImage)}
        onCancel={() => setPendingCropImage(null)}
        onApply={applyCroppedImage}
      />
      <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  toolbar: {
    gap: 10,
    padding: 16,
  },
  toolbarActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
  },
  viewToggle: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  searchInput: {
    minHeight: 44,
  },
  loader: {
    marginTop: 40,
  },
  listContent: {
    gap: 10,
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
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  reorderCard: {
    borderColor: colors.secondary,
  },
  reorderControls: {
    alignSelf: 'stretch',
    gap: 8,
    justifyContent: 'center',
    minWidth: 72,
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
  galleryStepperRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  galleryActions: {
    paddingBottom: 12,
    paddingHorizontal: 12,
  },
  goodsImage: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    height: 72,
    width: 72,
  },
  imageTapArea: {
    borderRadius: 8,
  },
  imagePlaceholder: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  imagePlaceholderText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  cardBody: {
    flex: 1,
    gap: 6,
  },
  itemType: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  itemName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  countSummary: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  countBadge: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    minWidth: 68,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  countBadgeLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
  },
  countBadgeValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  countAdjustRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  countLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
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
});
