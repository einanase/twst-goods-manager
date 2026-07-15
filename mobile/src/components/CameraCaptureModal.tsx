import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { CameraView, type CameraType, useCameraPermissions } from 'expo-camera';
import { colors } from '../lib/theme';
import { AppButton } from './AppButton';

export type CapturedImageAsset = {
  uri: string;
  fileName: string | null;
};

type CameraCaptureModalProps = {
  visible: boolean;
  title: string;
  onCancel: () => void;
  onUsePhoto: (asset: CapturedImageAsset) => void;
};

type CapturedPhoto = CapturedImageAsset & {
  width: number;
  height: number;
};

export function CameraCaptureModal({ visible, title, onCancel, onUsePhoto }: CameraCaptureModalProps) {
  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<CapturedPhoto | null>(null);

  useEffect(() => {
    if (!visible) {
      setCapturedPhoto(null);
      setCameraReady(false);
      setCapturing(false);
      return;
    }

    void getPermission();
  }, [getPermission, visible]);

  async function askPermission() {
    const nextPermission = await requestPermission();
    if (!nextPermission.granted) {
      Alert.alert('カメラを使えません', '端末の設定からカメラへのアクセスを許可してください。');
    }
  }

  async function capturePhoto() {
    if (capturing || !cameraReady || !cameraRef.current) return;

    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.82,
        skipProcessing: false,
      });

      if (!photo?.uri) {
        Alert.alert('撮影できませんでした', 'もう一度撮影してください。');
        return;
      }

      setCapturedPhoto({
        uri: photo.uri,
        fileName: buildFileName(photo.uri),
        width: photo.width,
        height: photo.height,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert('撮影に失敗しました', message);
    } finally {
      setCapturing(false);
    }
  }

  function usePhoto() {
    if (!capturedPhoto) return;
    onUsePhoto({
      uri: capturedPhoto.uri,
      fileName: capturedPhoto.fileName,
    });
  }

  function retakePhoto() {
    setCapturedPhoto(null);
    setCameraReady(false);
  }

  function toggleFacing() {
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  }

  const permissionGranted = Boolean(permission?.granted);

  if (!visible) return null;

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Pressable accessibilityRole="button" onPress={onCancel} style={styles.closeButton}>
          <Text style={styles.closeText}>閉じる</Text>
        </Pressable>
      </View>

      {!permission ? (
        <View style={styles.permissionPanel}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.permissionBody}>カメラの状態を確認しています...</Text>
        </View>
      ) : !permissionGranted ? (
        <View style={styles.permissionPanel}>
          <Text style={styles.permissionTitle}>カメラの許可が必要です</Text>
          <Text style={styles.permissionBody}>
            グッズや取引の画像を撮影するため、カメラへのアクセスを許可してください。
          </Text>
          <AppButton label="カメラを許可する" onPress={askPermission} />
        </View>
      ) : capturedPhoto ? (
        <View style={styles.previewWrap}>
          <Image source={{ uri: capturedPhoto.uri }} resizeMode="contain" style={styles.previewImage} />
          <View style={styles.previewActions}>
            <AppButton label="撮り直す" variant="secondary" onPress={retakePhoto} />
            <AppButton label="この写真を使う" onPress={usePhoto} />
          </View>
        </View>
      ) : (
        <View style={styles.cameraWrap}>
          <CameraView
            active={visible && !capturedPhoto}
            facing={facing}
            mode="picture"
            onCameraReady={() => setCameraReady(true)}
            onMountError={(event) => {
              Alert.alert('カメラを起動できません', event.message);
            }}
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
          />
          <View pointerEvents="none" style={styles.frameGuide} />
          <View style={styles.cameraControls}>
            <AppButton label="カメラ切替" variant="secondary" disabled={capturing} onPress={toggleFacing} />
            <Pressable
              accessibilityRole="button"
              disabled={capturing || !cameraReady}
              onPress={capturePhoto}
              style={({ pressed }) => [
                styles.shutterButton,
                pressed && !capturing ? styles.shutterPressed : null,
                capturing || !cameraReady ? styles.shutterDisabled : null,
              ]}
            >
              {capturing ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.shutterText}>撮影</Text>}
            </Pressable>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

function buildFileName(uri: string) {
  const withoutQuery = uri.split('?')[0] ?? '';
  const parts = withoutQuery.split('/');
  const last = parts[parts.length - 1];
  if (last && last.includes('.')) return last;
  return `camera-${Date.now()}.jpg`;
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#08111c',
    flex: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 16,
  },
  title: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
  closeButton: {
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  closeText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  permissionPanel: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    gap: 12,
    margin: 20,
    padding: 18,
  },
  permissionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  permissionBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  cameraWrap: {
    flex: 1,
    overflow: 'hidden',
  },
  frameGuide: {
    borderColor: 'rgba(255,255,255,0.55)',
    borderRadius: 8,
    borderWidth: 1,
    bottom: 118,
    left: 18,
    position: 'absolute',
    right: 18,
    top: 18,
  },
  cameraControls: {
    alignItems: 'center',
    bottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 18,
    position: 'absolute',
    right: 18,
  },
  shutterButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderColor: '#ffffff',
    borderRadius: 36,
    borderWidth: 4,
    height: 72,
    justifyContent: 'center',
    width: 72,
  },
  shutterPressed: {
    opacity: 0.78,
  },
  shutterDisabled: {
    opacity: 0.45,
  },
  shutterText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  previewWrap: {
    flex: 1,
    gap: 14,
    padding: 16,
  },
  previewImage: {
    backgroundColor: '#000000',
    borderRadius: 8,
    flex: 1,
    width: '100%',
  },
  previewActions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
});
