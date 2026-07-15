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
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { AppButton } from '../components/AppButton';
import { CameraCaptureModal, type CapturedImageAsset } from '../components/CameraCaptureModal';
import { EmptyState } from '../components/EmptyState';
import { ImagePreviewModal } from '../components/ImagePreviewModal';
import { QuantityStepper } from '../components/QuantityStepper';
import { TextField } from '../components/TextField';
import { colors } from '../lib/theme';
import type { GoodsItem } from '../types/domain';
import { createGoods, deleteGoods, loadGoods, updateGoods, updateGoodsCount } from '../services/goodsService';
import { getStoredImageValue, removeStoredImage, uploadPrivateImageFromUri } from '../services/imageStorage';

type InventoryScreenProps = {
  userId: string;
};

type ImagePreview = {
  uri: string;
  title: string;
} | null;

export function InventoryScreen({ userId }: InventoryScreenProps) {
  const [items, setItems] = useState<GoodsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
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

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) =>
      `${item.type} ${item.char}`.toLowerCase().includes(keyword),
    );
  }, [items, search]);

  function openCreate() {
    setCameraVisible(false);
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
      Alert.alert('画像を選べません', '写真へのアクセスを許可してください。');
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

  function takePhoto() {
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
    Alert.alert('画像を外しますか？', '保存するまで変更は確定しません。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '外す',
        style: 'destructive',
        onPress: clearImage,
      },
    ]);
  }

  async function saveItem() {
    if (!type.trim() || !name.trim()) {
      Alert.alert('入力不足', 'グッズ種類と品名・絵柄を入力してください。');
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
    setItems((current) =>
      current.map((candidate) =>
        String(candidate.id) === String(item.id) ? { ...candidate, count: nextCount } : candidate,
      ),
    );

    try {
      const saved = await updateGoodsCount(userId, item.id, nextCount);
      setItems((current) =>
        current.map((candidate) =>
          String(candidate.id) === String(item.id) ? saved : candidate,
        ),
      );
    } catch (error) {
      setItems(previous);
      showError('在庫数の更新に失敗しました', error);
    }
  }

  async function confirmDelete(item: GoodsItem) {
    Alert.alert('削除しますか？', `${item.type} / ${item.char} を削除します。`, [
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
        <AppButton label="追加" onPress={openCreate} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={filteredItems}
          keyExtractor={(item) => String(item.id)}
          ListEmptyComponent={
            <EmptyState title="在庫がありません" body="まずはグッズを追加して、交換に使う在庫を記録します。" />
          }
          renderItem={({ item }) => {
            const actualCount = item.count ?? 0;
            const plannedCount = item.planned_count ?? actualCount;

            return (
              <Pressable style={styles.card} onPress={() => openEdit(item)}>
                {item.image_display_url ? (
                  <Pressable
                    accessibilityRole="imagebutton"
                    onPress={(event) => {
                      event.stopPropagation();
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
                    <QuantityStepper value={actualCount} onChange={(next) => changeCount(item, next)} />
                  </View>
                </View>
                <AppButton label="削除" variant="danger" onPress={() => confirmDelete(item)} />
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
                  label="画像を外す"
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
    </View>
  );
}

function showError(title: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  Alert.alert(title, message);
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  toolbar: {
    gap: 10,
    padding: 16,
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
