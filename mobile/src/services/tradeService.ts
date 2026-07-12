import { getSupabase } from '../lib/supabase';
import type { RowId, Trade, TradeInput } from '../types/domain';
import { attachDisplayImageUrls } from './imageStorage';

export async function loadTrades(userId: string) {
  const { data, error } = await getSupabase()
    .from('trades')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return attachDisplayImageUrls((data ?? []) as Trade[]);
}

export async function createTrade(userId: string, input: TradeInput) {
  const { data, error } = await getSupabase()
    .from('trades')
    .insert([{ ...input, user_id: userId }])
    .select()
    .single();

  if (error) throw error;
  const [trade] = await attachDisplayImageUrls([data as Trade]);
  if (!trade) throw new Error('Saved trade was not returned.');
  return trade;
}

export async function updateTrade(userId: string, id: RowId, input: TradeInput) {
  const { data, error } = await getSupabase()
    .from('trades')
    .update(input)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  const [trade] = await attachDisplayImageUrls([data as Trade]);
  if (!trade) throw new Error('Updated trade was not returned.');
  return trade;
}

export async function patchTrade(userId: string, id: RowId, input: Partial<TradeInput>) {
  const { data, error } = await getSupabase()
    .from('trades')
    .update(input)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;
  const [trade] = await attachDisplayImageUrls([data as Trade]);
  if (!trade) throw new Error('Updated trade was not returned.');
  return trade;
}

export async function deleteTrade(userId: string, id: RowId) {
  const { error } = await getSupabase().from('trades').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
}
