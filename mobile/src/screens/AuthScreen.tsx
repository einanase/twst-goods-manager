import { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { AppButton } from '../components/AppButton';
import { TextField } from '../components/TextField';
import { getSupabase } from '../lib/supabase';
import { colors } from '../lib/theme';
import { appBrand } from '../lib/brand';

type AuthMode = 'login' | 'signup';
type NoticeTone = 'error' | 'success';
type Notice = {
  title: string;
  message: string;
  tone: NoticeTone;
} | null;

const brandIcon = require('../../assets/app/icon.png');

export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const isSignup = mode === 'signup';

  async function submit() {
    setNotice(null);

    if (!email.trim() || !password) {
      showNotice('入力不足', 'メールアドレスとパスワードを入力してください。', 'error');
      return;
    }

    if (password.length < 6) {
      showNotice('パスワードが短いです', 'パスワードは6文字以上で入力してください。', 'error');
      return;
    }

    if (isSignup && password !== confirmPassword) {
      showNotice('確認してください', '確認用パスワードが一致していません。', 'error');
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
            emailRedirectTo: getAuthRedirectUrl(),
          },
        });
        if (error) throw error;
        showNotice('確認メールを送信しました', 'メール内のリンクを開いて登録を完了してください。', 'success');
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
      showNotice(isSignup ? '登録に失敗しました' : 'ログインに失敗しました', message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function showNotice(title: string, message: string, tone: NoticeTone) {
    setNotice({ title, message, tone });
    if (Platform.OS !== 'web') {
      Alert.alert(title, message);
    }
  }

  function switchMode() {
    setNotice(null);
    setMode(isSignup ? 'login' : 'signup');
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardWrap}
      >
        <View style={styles.panel}>
          <View style={styles.brandBlock}>
            <Image source={brandIcon} resizeMode="contain" style={styles.brandIcon} />
            <Text style={styles.brandName}>{appBrand.name}</Text>
            <Text style={styles.brandSubtitle}>{appBrand.subtitle}</Text>
          </View>
          <Text style={styles.title}>{isSignup ? '新規登録' : 'ログイン'}</Text>
          <Text style={styles.lead}>
            {isSignup
              ? '新しいメールアドレスでアカウントを作成します。'
              : '在庫と取引をクラウド同期するため、サインインしてください。'}
          </Text>

          {notice ? (
            <View style={[styles.notice, notice.tone === 'success' ? styles.noticeSuccess : styles.noticeError]}>
              <Text style={styles.noticeTitle}>{notice.title}</Text>
              <Text style={styles.noticeMessage}>{notice.message}</Text>
            </View>
          ) : null}

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
              onPress={switchMode}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function getAuthRedirectUrl() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/auth/callback`;
  }

  return Linking.createURL('auth/callback');
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
  brandBlock: {
    alignItems: 'center',
    gap: 6,
  },
  brandIcon: {
    height: 84,
    width: 84,
  },
  brandName: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
  },
  brandSubtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800',
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
  notice: {
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noticeError: {
    backgroundColor: '#fff4f4',
    borderColor: '#e7b8b8',
  },
  noticeSuccess: {
    backgroundColor: '#eef8f2',
    borderColor: '#afd9c2',
  },
  noticeTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  noticeMessage: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
});
