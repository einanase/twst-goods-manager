import type { RowId, Trade } from '../types/domain';

export function getTradeNumber(trades: Trade[], tradeId: RowId) {
  const index = trades.findIndex((trade) => String(trade.id) === String(tradeId));
  if (index < 0) return null;
  return trades.length - index;
}

export function formatTradeNumber(trades: Trade[], tradeId: RowId) {
  const number = getTradeNumber(trades, tradeId);
  return number === null ? '#?' : `#${number}`;
}
