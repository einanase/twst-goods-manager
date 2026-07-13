import { Image, Modal, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../lib/theme';

type ImagePreviewModalProps = {
  uri: string | null;
  title?: string;
  onClose: () => void;
};

export function ImagePreviewModal({ uri, title = '画像プレビュー', onClose }: ImagePreviewModalProps) {
  return (
    <Modal animationType="fade" transparent visible={Boolean(uri)} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>閉じる</Text>
            </Pressable>
          </View>

          {uri ? (
            <Image source={{ uri }} resizeMode="contain" style={styles.image} />
          ) : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    color: '#ffffff',
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
  },
  closeButton: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  closeText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  image: {
    flex: 1,
    width: '100%',
  },
});
