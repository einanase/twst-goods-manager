export type RowId = string | number;

export type GoodsItem = {
  id: RowId;
  user_id: string;
  type: string;
  char: string;
  count: number;
  planned_count: number | null;
  planned_min_count?: number | null;
  planned_max_count?: number | null;
  image_url: string | null;
  image_display_url?: string;
  sort_order: number | null;
  created_at?: string;
  updated_at?: string;
};

export type TradeStatus = '取引完了' | '成約' | '仮約束' | 'お声掛け中' | 'キャンセル';
export type TradeType = '交換' | '譲渡' | '交換+譲渡';

export type TradeItem = {
  id: RowId;
  count: number;
  quantity_mode?: 'fixed' | 'range';
  min_count?: number | null;
  max_count?: number | null;
};

export type Trade = {
  id: RowId;
  user_id: string;
  name: string;
  type: TradeType;
  status: TradeStatus;
  memo: string | null;
  give_items: TradeItem[];
  receive_items: TradeItem[];
  give_price: number;
  receive_price: number;
  image_url: string | null;
  image_display_url?: string;
  is_packed: boolean;
  is_sent: boolean;
  is_received: boolean;
  est_ship_date: string | null;
  est_receive_date: string | null;
  created_at?: string;
  updated_at?: string;
};

export type GoodsInput = {
  type: string;
  char: string;
  count: number;
  planned_count: number;
  image_url: string | null;
  sort_order?: number | null;
};

export type TradeInput = {
  name: string;
  type: TradeType;
  status: TradeStatus;
  memo: string | null;
  give_items: TradeItem[];
  receive_items: TradeItem[];
  give_price: number;
  receive_price: number;
  image_url: string | null;
  is_packed: boolean;
  is_sent: boolean;
  is_received: boolean;
  est_ship_date: string | null;
  est_receive_date: string | null;
};
