import type { RowId, Trade } from '../types/domain';

export function calculatePendingStockDiff(itemId: RowId, trades: Trade[]) {
  const targetId = String(itemId);
  let pendingDiff = 0;

  for (const trade of trades) {
    if (trade.status !== '成約') continue;

    const give = (trade.give_items ?? []).find((item) => String(item.id) === targetId);
    if (give && !trade.is_sent) pendingDiff -= give.count;

    const receive = (trade.receive_items ?? []).find((item) => String(item.id) === targetId);
    if (receive && !trade.is_received) pendingDiff += receive.count;
  }

  return pendingDiff;
}

export function calculatePlannedStockCount(actualCount: number, itemId: RowId, trades: Trade[]) {
  return Math.max(0, actualCount + calculatePendingStockDiff(itemId, trades));
}
