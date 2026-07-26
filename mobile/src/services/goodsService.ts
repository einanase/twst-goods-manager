import { getSupabase } from '../lib/supabase';
import type { GoodsInput, GoodsItem, RowId } from '../types/domain';
import { attachDisplayImageUrls } from './imageStorage';

export async function loadGoods(userId: string) {
  const { data, error } = await getSupabase()
    .from('goods')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return attachDisplayImageUrls((data ?? []) as GoodsItem[]);
}

export async function createGoods(userId: string, input: GoodsInput) {
  const { data, error } = await getSupabase()
    .from('goods')
    .insert([{ ...input, user_id: userId }])
    .select()
    .single();

  if (error) throw error;
  const [item] = await attachDisplayImageUrls([data as GoodsItem]);
  if (!item) throw new Error('Saved goods item was not returned.');
  return item;
}

export async function updateGoods(userId: string, id: RowId, input: GoodsInput) {
  const { data, error } = await getSupabase()
    .from('goods')
    .update(input)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  const [item] = await attachDisplayImageUrls([data as GoodsItem]);
  if (!item) throw new Error('Updated goods item was not returned.');
  return item;
}

export async function updateGoodsCount(userId: string, id: RowId, count: number) {
  const { data, error } = await getSupabase()
    .from('goods')
    .update({ count })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  const [item] = await attachDisplayImageUrls([data as GoodsItem]);
  if (!item) throw new Error('Updated goods item was not returned.');
  return item;
}

export async function updateGoodsStock(
  userId: string,
  id: RowId,
  input: { count?: number; planned_count?: number },
) {
  const { error } = await getSupabase()
    .from('goods')
    .update(input)
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function updateGoodsSortOrders(
  userId: string,
  updates: Array<{ id: RowId; sort_order: number }>,
) {
  const supabase = getSupabase();
  const results = await Promise.all(
    updates.map(({ id, sort_order }) =>
      supabase
        .from('goods')
        .update({ sort_order })
        .eq('id', id)
        .eq('user_id', userId),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
}

export async function deleteGoods(userId: string, id: RowId) {
  const { error } = await getSupabase().from('goods').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
}
