import { getSupabase } from '../lib/supabase';
import { loadGoods } from './goodsService';
import { getStoredImageValue, removeStoredImage, removeUserStorageFolder } from './imageStorage';
import { loadTrades } from './tradeService';

type SupportRequestType = 'contact' | 'account_deletion';

type SupportRequestInput = {
  userId: string;
  email: string;
  requestType: SupportRequestType;
  subject: string;
  message: string;
  metadata?: Record<string, unknown>;
};

export async function submitSupportRequest({
  userId,
  email,
  requestType,
  subject,
  message,
  metadata,
}: SupportRequestInput) {
  const { data, error } = await getSupabase()
    .from('support_requests')
    .insert([
      {
        user_id: userId,
        email,
        request_type: requestType,
        subject,
        message,
        metadata: metadata ?? {},
      },
    ])
    .select('id')
    .single();

  if (error) throw error;
  return String(data?.id ?? '');
}

export async function deleteAccountDataWithPassword({
  userId,
  email,
  password,
}: {
  userId: string;
  email: string;
  password: string;
}) {
  const supabase = getSupabase();
  const { error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError) {
    throw new Error('パスワードが正しくありません。');
  }

  const [goods, trades] = await Promise.all([loadGoods(userId), loadTrades(userId)]);
  const imageValues = [
    ...goods.map((item) => getStoredImageValue(item.image_url)),
    ...trades.map((trade) => getStoredImageValue(trade.image_url)),
  ].filter(Boolean);

  await submitSupportRequest({
    userId,
    email,
    requestType: 'account_deletion',
    subject: 'アカウント削除',
    message:
      '利用者本人がアプリ内でパスワード確認と了承チェックを行い、在庫・取引・画像データの削除を開始しました。ログインアカウント本体の削除完了処理をお願いします。',
    metadata: {
      deletion_requested_at: new Date().toISOString(),
      target_goods_count: goods.length,
      target_trades_count: trades.length,
    },
  });

  for (const imageValue of imageValues) {
    await removeStoredImage(userId, imageValue);
  }
  await removeUserStorageFolder(userId);

  const { error: tradesError } = await supabase.from('trades').delete().eq('user_id', userId);
  if (tradesError) throw tradesError;

  const { error: goodsError } = await supabase.from('goods').delete().eq('user_id', userId);
  if (goodsError) throw goodsError;

  await supabase.auth.signOut();
}
