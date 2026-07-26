import type { RowId, Trade } from '../types/domain';
import { getTradeItemCountRange } from './tradeItemQuantity';

export type StockCountRange = {
  min: number;
  max: number;
};

type PlannedStockItem = {
  id: RowId;
  count: number;
  planned_count: number | null;
  planned_min_count?: number | null;
  planned_max_count?: number | null;
};

function affectsPlannedStock(trade: Trade) {
  return trade.status === '成約' || trade.status === '仮約束';
}

function normalizeStockCount(value: number | null | undefined) {
  return Math.max(0, Math.floor(Number(value ?? 0) || 0));
}

function normalizeStockRange(min: number, max: number): StockCountRange {
  const nextMin = normalizeStockCount(min);
  return {
    min: nextMin,
    max: Math.max(nextMin, normalizeStockCount(max)),
  };
}

export function calculatePendingStockDiffRange(itemId: RowId, trades: Trade[]): StockCountRange {
  const targetId = String(itemId);
  let minDiff = 0;
  let maxDiff = 0;

  for (const trade of trades) {
    if (!affectsPlannedStock(trade)) continue;

    const give = (trade.give_items ?? []).find((item) => String(item.id) === targetId);
    const giveRange = give ? getTradeItemCountRange(give) : null;
    if (giveRange && !trade.is_sent) {
      minDiff -= giveRange.max;
      maxDiff -= giveRange.min;
    }

    const receive = (trade.receive_items ?? []).find((item) => String(item.id) === targetId);
    const receiveRange = receive ? getTradeItemCountRange(receive) : null;
    if (receiveRange && !trade.is_received) {
      minDiff += receiveRange.min;
      maxDiff += receiveRange.max;
    }
  }

  return { min: minDiff, max: maxDiff };
}

export function calculatePendingStockDiff(itemId: RowId, trades: Trade[]) {
  return calculatePendingStockDiffRange(itemId, trades).max;
}

export function calculatePlannedStockRange(actualCount: number, itemId: RowId, trades: Trade[]) {
  const actual = normalizeStockCount(actualCount);
  const pendingDiff = calculatePendingStockDiffRange(itemId, trades);
  return normalizeStockRange(actual + pendingDiff.min, actual + pendingDiff.max);
}

export function calculatePlannedStockCount(actualCount: number, itemId: RowId, trades: Trade[]) {
  return calculatePlannedStockRange(actualCount, itemId, trades).max;
}

export function applyPlannedStockRange<T extends PlannedStockItem>(
  item: T,
  range: StockCountRange,
): T {
  return {
    ...item,
    planned_count: range.max,
    planned_min_count: range.min,
    planned_max_count: range.max,
  };
}

export function calculateGoodsPlannedStockRange<T extends PlannedStockItem>(item: T, trades: Trade[]) {
  return calculatePlannedStockRange(item.count ?? 0, item.id, trades);
}

export function applyCalculatedPlannedStockRange<T extends PlannedStockItem>(item: T, trades: Trade[]) {
  return applyPlannedStockRange(item, calculateGoodsPlannedStockRange(item, trades));
}

export function getPlannedStockRangeFromItem(item: PlannedStockItem): StockCountRange {
  const fallback = normalizeStockCount(item.planned_count ?? item.count);
  return normalizeStockRange(item.planned_min_count ?? fallback, item.planned_max_count ?? fallback);
}

export function formatStockCountRange(range: StockCountRange) {
  return range.min === range.max ? String(range.max) : `${range.min}〜${range.max}`;
}

export function formatPlannedStockCount(item: PlannedStockItem) {
  return formatStockCountRange(getPlannedStockRangeFromItem(item));
}
