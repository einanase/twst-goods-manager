import type { RowId, Trade } from '../types/domain';
import { getFixedTradeItemCount } from './tradeItemQuantity';

export function calculatePendingStockDiff(itemId: RowId, trades: Trade[]) {
  const targetId = String(itemId);
  let pendingDiff = 0;

  for (const trade of trades) {
    if (trade.status !== '成約') continue;

    const give = (trade.give_items ?? []).find((item) => String(item.id) === targetId);
    const giveCount = give ? getFixedTradeItemCount(give) : null;
    if (giveCount && !trade.is_sent) pendingDiff -= giveCount;

    const receive = (trade.receive_items ?? []).find((item) => String(item.id) === targetId);
    const receiveCount = receive ? getFixedTradeItemCount(receive) : null;
    if (receiveCount && !trade.is_received) pendingDiff += receiveCount;
  }

  return pendingDiff;
}

export function calculatePlannedStockCount(actualCount: number, itemId: RowId, trades: Trade[]) {
  return Math.max(0, actualCount + calculatePendingStockDiff(itemId, trades));
}
