import type { TradeItem } from '../types/domain';

export function isRangeTradeItem(item: TradeItem) {
  return item.quantity_mode === 'range' || item.min_count != null || item.max_count != null;
}

export function sanitizeFixedCount(value: number | null | undefined) {
  return Math.max(0, Math.floor(Number(value ?? 0) || 0));
}

export function sanitizeRangeCount(value: number | null | undefined) {
  return Math.max(1, Math.floor(Number(value ?? 1) || 1));
}

export function normalizeTradeItems(items: TradeItem[]) {
  return items
    .map((item) => {
      if (isRangeTradeItem(item)) {
        const min = sanitizeRangeCount(item.min_count ?? item.count);
        const max = Math.max(min, sanitizeRangeCount(item.max_count ?? item.count));
        return {
          id: item.id,
          count: max,
          quantity_mode: 'range' as const,
          min_count: min,
          max_count: max,
        };
      }

      return {
        id: item.id,
        count: sanitizeFixedCount(item.count),
      };
    })
    .filter((item) => item.count > 0);
}

export function hasRangeTradeItems(items: TradeItem[]) {
  return items.some(isRangeTradeItem);
}

export function getFixedTradeItemCount(item: TradeItem) {
  if (isRangeTradeItem(item)) return null;
  const count = sanitizeFixedCount(item.count);
  return count > 0 ? count : null;
}

export function formatTradeItemQuantity(item: TradeItem) {
  if (isRangeTradeItem(item)) {
    const min = sanitizeRangeCount(item.min_count ?? item.count);
    const max = Math.max(min, sanitizeRangeCount(item.max_count ?? item.count));
    return min === max ? `${min}個前後` : `${min}〜${max}個`;
  }

  return `${sanitizeFixedCount(item.count)}個`;
}
