import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { AppButton } from '../components/AppButton';
import { TextField } from '../components/TextField';
import { getSupabase } from '../lib/supabase';
import { colors } from '../lib/theme';

type AuthMode = 'login' | 'signup';

export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const isSignup = mode === 'signup';

  async function submit() {
    if (!email.trim() || !password) {
      Alert.alert('入力不足', 'メールアドレスとパスワードを入力してください。');
      return;
    }

    if (password.length < 6) {
      Alert.alert('パスワードが短いです', 'パスワードは6文字以上で入力してください。');
      return;
    }

    if (isSignup && password !== confirmPassword) {
      Alert.alert('確認してください', '確認用パスワードが一致していません。');
      return;
    }

    setLoading(true);
    try {
      const supabase = getSupabase();
      if (isSignup) {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: Linking.createURL('auth/callback'),
          },
        });
        if (error) throw error;
        Alert.alert('確認メールを送信しました', 'メール内のリンクを開いて登録を完了してください。');
        setMode('login');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert(isSignup ? '登録に失敗しました' : 'ログインに失敗しました', message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardWrap}
      >
        <View style={styles.panel}>
          <Text style={styles.title}>{isSignup ? '新規登録' : 'ログイン'}</Text>
          <Text style={styles.lead}>
            {isSignup
              ? '新しいメールアドレスでアカウントを作成します。'
              : 'クラウド同期を使うため、サインインしてください。'}
          </Text>

          <View style={styles.form}>
            <TextField
              label="メールアドレス"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              placeholder="example@mail.com"
              textContentType="emailAddress"
            />
            <TextField
              label="パスワード"
              value={password}
              onChangeText={setPassword}
              placeholder="6文字以上"
              secureTextEntry
              textContentType={isSignup ? 'newPassword' : 'password'}
            />
            {isSignup ? (
              <TextField
                label="パスワード確認"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="もう一度入力"
                secureTextEntry
                textContentType="newPassword"
              />
            ) : null}
          </View>

          <View style={styles.actions}>
            <AppButton
              label={loading ? '処理中...' : isSignup ? '登録する' : 'ログイン'}
              disabled={loading}
              onPress={submit}
            />
            <AppButton
              label={isSignup ? 'ログインに戻る' : '新規登録'}
              variant="secondary"
              disabled={loading}
              onPress={() => setMode(isSignup ? 'login' : 'signup')}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  keyboardWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 18,
    padding: 20,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
  },
  lead: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
  form: {
    gap: 12,
  },
  actions: {
    gap: 10,
  },
});

