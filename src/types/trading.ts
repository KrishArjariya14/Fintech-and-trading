export type UserRole = 'retail' | 'institutional' | 'compliance';

export type Timeframe = '1m' | '5m' | '1h' | '1D';

export type OrderSide = 'buy' | 'sell';

export type OrderType = 'market' | 'limit' | 'stop_loss';

export type OrderStatus = 'open' | 'filled' | 'cancelled' | 'reverted';

export type CurrencyCode = 'USD' | 'EUR' | 'GBP';

export type AssetClass = 'crypto' | 'equity' | 'fx';

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OrderBookLevel {
  price: number;
  size: number;
  total: number;
}

export interface MarketInstrument {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  price: number;
  open24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  changePct: number;
  bid: number;
  ask: number;
  spreadBps: number;
  decimals: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  candles: Record<Timeframe, Candle[]>;
  updatedAt: number;
}

export interface MarketTickUpdate {
  symbol: string;
  price: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  changePct: number;
  bid: number;
  ask: number;
  spreadBps: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  latestCandles: Record<Timeframe, Candle>;
  updatedAt: number;
}

export interface MarketTrade {
  id: string;
  symbol: string;
  price: number;
  size: number;
  side: OrderSide;
  timestamp: number;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  tierLabel: string;
  kycStatus: 'verified' | 'pending_review' | 'action_required';
  mfaEnabled: boolean;
  mfaMethod: 'FIDO2 Hardware Key' | 'Biometric Passkey' | 'Authenticator TOTP';
  mfaVerifiedAt: number | null;
  maxOrderNotionalUsd: number;
  apiAccessEnabled: boolean;
}

export interface Holding {
  symbol: string;
  quantity: number;
  avgEntryPrice: number;
}

export interface Order {
  id: string;
  userId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  limitPrice?: number;
  stopPrice?: number;
  executedPrice?: number;
  notionalUsd: number;
  feeUsd: number;
  status: OrderStatus;
  receiptId?: string;
  createdAt: number;
  updatedAt: number;
  note?: string;
}

export interface ExecutionReceipt {
  receiptId: string;
  orderId: string;
  userId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  fillPrice: number;
  grossNotionalUsd: number;
  feeUsd: number;
  netSettlementUsd: number;
  settlementLatencyMs: number;
  signatureHash: string;
  timestamp: number;
}

export interface WalletTransaction {
  id: string;
  userId: string;
  type: 'deposit' | 'withdrawal' | 'fx_conversion' | 'trade_settlement';
  rail: string;
  currency: CurrencyCode;
  amount: number;
  usdEquivalent: number;
  status: 'completed' | 'pending';
  referenceId: string;
  timestamp: number;
}

export interface KycApplication {
  id: string;
  userId: string;
  applicantName: string;
  email: string;
  documentType: string;
  jurisdiction: string;
  sourceOfFunds: string;
  riskScore: 'Low' | 'Medium' | 'Elevated';
  status: 'verified' | 'pending_review' | 'rejected';
  submittedAt: number;
  reviewedBy?: string;
  reviewedAt?: number;
  notes?: string;
}

export interface ApiKeyRecord {
  id: string;
  userId: string;
  label: string;
  prefix: string;
  permissions: string[];
  createdAt: number;
  lastUsedAt: number | null;
  status: 'active' | 'revoked';
}

export interface AuditLogEntry {
  id: string;
  sequence: number;
  timestamp: number;
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  category: 'auth' | 'order' | 'wallet' | 'compliance' | 'api' | 'safety';
  action: string;
  details: string;
  prevHash: string;
  entryHash: string;
}

export interface UserAccountState {
  profile: UserProfile;
  cashBalances: Record<CurrencyCode, number>;
  reservedCashUsd: number;
  holdings: Holding[];
}

export interface PlatformSnapshot {
  instruments: MarketInstrument[];
  recentTrades: Record<string, MarketTrade[]>;
  fxRates: Record<CurrencyCode, number>;
  users: Record<string, UserAccountState>;
  orders: Order[];
  receipts: ExecutionReceipt[];
  walletTransactions: WalletTransaction[];
  kycApplications: KycApplication[];
  apiKeys: ApiKeyRecord[];
  auditLog: AuditLogEntry[];
  circuitBreakerActive: boolean;
  serverTime: number;
}
