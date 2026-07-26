import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
} from 'react-native';
import { AppButton } from './AppButton';
import { colors } from '../lib/theme';

const OUTPUT_SIZE = 512;
const PREVIEW_SIZE = 280;
const ZOOM_STEP = 0.15;
const MOVE_STEP = 0.08;

type CropShape = 'square' | 'circle';

type CropSource = {
  uri: string;
  fileName?: string | null;
};

type ImageSize = {
  width: number;
  height: number;
};

export type CroppedImageAsset = {
  uri: string;
  fileName: string;
};

type ImageCropModalProps = {
  source: CropSource | null;
  visible: boolean;
  onCancel: () => void;
  onApply: (asset: CroppedImageAsset) => void;
};

export function ImageCropModal({ source, visible, onCancel, onApply }: ImageCropModalProps) {
  const [shape, setShape] = useState<CropShape>('square');
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [sourceSize, setSourceSize] = useState<ImageSize | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setShape('square');
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setSourceSize(null);
    setRendering(false);
    setError('');
  }, [visible, source?.uri]);

  useEffect(() => {
    if (!visible || !source?.uri) return;
    let cancelled = false;
    const sourceUri = source.uri;

    async function loadSourceSize() {
      try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const image = await loadImage(sourceUri);
          if (!cancelled) {
            setSourceSize({
              width: image.naturalWidth || image.width,
              height: image.naturalHeight || image.height,
            });
          }
          return;
        }

        Image.getSize(
          sourceUri,
          (width, height) => {
            if (!cancelled) setSourceSize({ width, height });
          },
          () => {
            if (!cancelled) setSourceSize(null);
          },
        );
      } catch {
        if (!cancelled) setSourceSize(null);
      }
    }

    loadSourceSize();
    return () => {
      cancelled = true;
    };
  }, [visible, source?.uri]);

  useEffect(() => {
    setOffset((current) => clampCropOffset(current, sourceSize, zoom));
  }, [sourceSize, zoom]);

  if (!visible || !source) return null;
  const activeSource = source;

  function nudge(dx: number, dy: number) {
    setOffset((current) => clampCropOffset({ x: current.x + dx, y: current.y + dy }, sourceSize, zoom));
  }

  function changeZoom(delta: number) {
    setZoom((current) => {
      const nextZoom = clamp(Number((current + delta).toFixed(2)), 1, 3);
      setOffset((currentOffset) => clampCropOffset(currentOffset, sourceSize, nextZoom));
      return nextZoom;
    });
  }

  async function applyCrop() {
    if (Platform.OS !== 'web') {
      setError('切り抜き編集はPWA版で利用できます。');
      return;
    }

    setRendering(true);
    setError('');
    try {
      const uri = await renderCroppedImage({
        offsetX: offset.x,
        offsetY: offset.y,
        shape,
        sourceUri: activeSource.uri,
        zoom,
      });
      onApply({
        uri,
        fileName: buildCroppedFileName(activeSource.fileName),
      });
    } catch {
      setError('画像を編集できませんでした。保存済み画像の場合は、もう一度「画像を選ぶ」から元画像を選択して編集してください。');
    } finally {
      setRendering(false);
    }
  }

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onCancel}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>画像を切り抜き</Text>
          <Pressable accessibilityRole="button" onPress={onCancel} style={styles.closeButton}>
            <Text style={styles.closeText}>閉じる</Text>
          </Pressable>
        </View>

        <View style={styles.content}>
          <View style={[styles.cropFrame, shape === 'circle' ? styles.cropFrameCircle : null]}>
            <Image
              resizeMode="cover"
              source={{ uri: activeSource.uri }}
              style={[
                styles.cropImage as ImageStyle,
                {
                  transform: [
                    { translateX: offset.x * PREVIEW_SIZE },
                    { translateY: offset.y * PREVIEW_SIZE },
                    { scale: zoom },
                  ],
                },
              ]}
            />
          </View>

          <View style={styles.segmented}>
            <ShapeButton active={shape === 'square'} label="四角" onPress={() => setShape('square')} />
            <ShapeButton active={shape === 'circle'} label="丸く切り抜き" onPress={() => setShape('circle')} />
          </View>

          <View style={styles.controlPanel}>
            <Text style={styles.controlLabel}>拡大: {Math.round(zoom * 100)}%</Text>
            <View style={styles.controlRow}>
              <AppButton label="-" variant="secondary" disabled={rendering || zoom <= 1} onPress={() => changeZoom(-ZOOM_STEP)} />
              <AppButton label="リセット" variant="ghost" disabled={rendering} onPress={() => {
                setZoom(1);
                setOffset({ x: 0, y: 0 });
              }} />
              <AppButton label="+" variant="secondary" disabled={rendering || zoom >= 3} onPress={() => changeZoom(ZOOM_STEP)} />
            </View>
          </View>

          <View style={styles.controlPanel}>
            <Text style={styles.controlLabel}>位置調整</Text>
            <View style={styles.nudgeGrid}>
              <View style={styles.nudgeRow}>
                <View style={styles.nudgeSpacer} />
                <View style={styles.nudgeCell}>
                  <AppButton label="上" variant="secondary" disabled={rendering} onPress={() => nudge(0, -MOVE_STEP)} />
                </View>
                <View style={styles.nudgeSpacer} />
              </View>
              <View style={styles.nudgeRow}>
                <View style={styles.nudgeCell}>
                  <AppButton label="左" variant="secondary" disabled={rendering} onPress={() => nudge(-MOVE_STEP, 0)} />
                </View>
                <View style={styles.nudgeCell}>
                  <AppButton label="中央" variant="ghost" disabled={rendering} onPress={() => setOffset({ x: 0, y: 0 })} />
                </View>
                <View style={styles.nudgeCell}>
                  <AppButton label="右" variant="secondary" disabled={rendering} onPress={() => nudge(MOVE_STEP, 0)} />
                </View>
              </View>
              <View style={styles.nudgeRow}>
                <View style={styles.nudgeSpacer} />
                <View style={styles.nudgeCell}>
                  <AppButton label="下" variant="secondary" disabled={rendering} onPress={() => nudge(0, MOVE_STEP)} />
                </View>
                <View style={styles.nudgeSpacer} />
              </View>
            </View>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <AppButton label="キャンセル" variant="ghost" disabled={rendering} onPress={onCancel} />
            <AppButton label={rendering ? '変換中...' : 'この画像を使う'} disabled={rendering} onPress={applyCrop} />
          </View>

          {rendering ? (
            <View style={styles.renderingOverlay}>
              <ActivityIndicator color="#ffffff" />
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function ShapeButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.shapeButton, active ? styles.shapeButtonActive : null]}
    >
      <Text style={[styles.shapeButtonText, active ? styles.shapeButtonTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

async function renderCroppedImage({
  offsetX,
  offsetY,
  shape,
  sourceUri,
  zoom,
}: {
  offsetX: number;
  offsetY: number;
  shape: CropShape;
  sourceUri: string;
  zoom: number;
}) {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    throw new Error('切り抜き編集はPWA版で利用できます。');
  }

  const sourceImage = await loadImage(sourceUri);
  const sourceWidth = sourceImage.naturalWidth || sourceImage.width;
  const sourceHeight = sourceImage.naturalHeight || sourceImage.height;
  const cropSide = Math.max(1, Math.min(sourceWidth, sourceHeight) / zoom);
  const cropX = clamp((sourceWidth - cropSide) / 2 - offsetX * cropSide, 0, Math.max(0, sourceWidth - cropSide));
  const cropY = clamp((sourceHeight - cropSide) / 2 - offsetY * cropSide, 0, Math.max(0, sourceHeight - cropSide));
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('画像編集を開始できませんでした。');
  }

  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  context.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

  if (shape === 'circle') {
    context.save();
    context.beginPath();
    context.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    context.clip();
  }

  context.drawImage(sourceImage, cropX, cropY, cropSide, cropSide, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

  if (shape === 'circle') {
    context.restore();
  }

  return canvas.toDataURL('image/png');
}

function loadImage(sourceUri: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('画像を読み込めませんでした。画像を選び直してください。'));
    image.src = sourceUri;
  });
}

function buildCroppedFileName(fileName?: string | null) {
  const baseName = String(fileName ?? 'goods-image')
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'goods-image';

  return `${baseName}-cropped.png`;
}

function clampCropOffset(offset: { x: number; y: number }, sourceSize: ImageSize | null, zoom: number) {
  const limit = getOffsetLimit(sourceSize, zoom);
  return {
    x: clamp(offset.x, -limit.x, limit.x),
    y: clamp(offset.y, -limit.y, limit.y),
  };
}

function getOffsetLimit(sourceSize: ImageSize | null, zoom: number) {
  if (!sourceSize?.width || !sourceSize.height) {
    const fallbackLimit = Math.max(0, (zoom - 1) / 2);
    return { x: fallbackLimit, y: fallbackLimit };
  }

  const sourceWidth = Math.max(1, sourceSize.width);
  const sourceHeight = Math.max(1, sourceSize.height);
  const cropSide = Math.max(1, Math.min(sourceWidth, sourceHeight) / zoom);

  return {
    x: Math.max(0, (sourceWidth - cropSide) / (2 * cropSide)),
    y: Math.max(0, (sourceHeight - cropSide) / (2 * cropSide)),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  header: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 58,
    paddingHorizontal: 16,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  closeButton: {
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  closeText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  content: {
    alignItems: 'center',
    flex: 1,
    gap: 14,
    padding: 16,
  },
  cropFrame: {
    backgroundColor: '#111827',
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    height: PREVIEW_SIZE,
    overflow: 'hidden',
    width: PREVIEW_SIZE,
  },
  cropFrameCircle: {
    borderRadius: PREVIEW_SIZE / 2,
  },
  cropImage: {
    height: '100%',
    width: '100%',
  },
  segmented: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    width: PREVIEW_SIZE,
  },
  shapeButton: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 10,
  },
  shapeButtonActive: {
    backgroundColor: colors.primary,
  },
  shapeButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  shapeButtonTextActive: {
    color: colors.primaryText,
  },
  controlPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    maxWidth: 420,
    padding: 12,
    width: '100%',
  },
  controlLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  controlRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  nudgeGrid: {
    gap: 8,
  },
  nudgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  nudgeCell: {
    flex: 1,
  },
  nudgeSpacer: {
    flex: 1,
  },
  errorBox: {
    backgroundColor: '#fff4f4',
    borderColor: '#e7b8b8',
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 420,
    padding: 12,
    width: '100%',
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-end',
    maxWidth: 420,
    width: '100%',
  },
  renderingOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
