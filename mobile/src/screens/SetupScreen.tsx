import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../lib/theme';

export function SetupScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.panel}>
        <Text style={styles.title}>Supabase設定が未設定です</Text>
        <Text style={styles.body}>
          mobile/ENVIRONMENTS.md を見て、奥さま用または販売用の .env を作成してください。
        </Text>
        <Text style={styles.code}>copy .env.wife .env</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 20,
    width: '100%',
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  body: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  code: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 6,
    color: colors.text,
    fontFamily: 'monospace',
    padding: 12,
  },
});
