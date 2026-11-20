import crypto from 'node:crypto';
import type {
  ApiKeyRecord,
  AssetClass,
  AuditLogEntry,
  Candle,
  CurrencyCode,
  ExecutionReceipt,
  KycApplication,
  MarketInstrument,
  MarketTickUpdate,
  MarketTrade,
  Order,
  OrderBookLevel,
  OrderSide,
  OrderType,
  PlatformSnapshot,
  Timeframe,
  UserAccountState,
  UserRole,
  WalletTransaction,
} from '../src/types/trading.ts';

interface InstrumentSeed {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  basePrice: number;
  volatility: number;
  decimals: number;
  baseVolume: number;
}

const INSTRUMENT_SEEDS: InstrumentSeed[] = [
  { symbol: 'BTC-USD', name: 'Bitcoin / US Dollar', assetClass: 'crypto', basePrice: 91420.5, volatility: 0.0028, decimals: 2, baseVolume: 28450 },
  { symbol: 'ETH-USD', name: 'Ethereum / US Dollar', assetClass: 'crypto', basePrice: 3284.75, volatility: 0.0034, decimals: 2, baseVolume: 192400 },
  { symbol: 'SOL-USD', name: 'Solana / US Dollar', assetClass: 'crypto', basePrice: 214.6, volatility: 0.0046, decimals: 2, baseVolume: 4821000 },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', assetClass: 'equity', basePrice: 146.82, volatility: 0.0022, decimals: 2, baseVolume: 41200000 },
  { symbol: 'AAPL', name: 'Apple Inc.', assetClass: 'equity', basePrice: 229.45, volatility: 0.0014, decimals: 2, baseVolume: 36800000 },
  { symbol: 'MSFT', name: 'Microsoft Corporation', assetClass: 'equity', basePrice: 428.15, volatility: 0.0015, decimals: 2, baseVolume: 18400000 },
  { symbol: 'TSLA', name: 'Tesla, Inc.', assetClass: 'equity', basePrice: 334.9, volatility: 0.0036, decimals: 2, baseVolume: 68100000 },
  { symbol: 'EUR-USD', name: 'Euro / US Dollar', assetClass: 'fx', basePrice: 1.0842, volatility: 0.0005, decimals: 4, baseVolume: 89400000 },
  { symbol: 'GBP-USD', name: 'British Pound / US Dollar', assetClass: 'fx', basePrice: 1.2678, volatility: 0.0006, decimals: 4, baseVolume: 51200000 },
  { symbol: 'XAU-USD', name: 'Spot Gold / US Dollar', assetClass: 'fx', basePrice: 2684.4, volatility: 0.0012, decimals: 2, baseVolume: 318000 },
];

const TIMEFRAME_MS: Record<Timeframe, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '1h': 3_600_000,
  '1D': 86_400_000,
};

function roundTo(val: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

function buildOrderBook(midPrice: number, decimals: number, volatility: number): {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  bid: number;
  ask: number;
  spreadBps: number;
} {
  const halfSpread = Math.max(midPrice * (volatility * 0.14), Math.pow(10, -decimals));
  const bestBid = roundTo(midPrice - halfSpread, decimals);
  const bestAsk = roundTo(midPrice + halfSpread, decimals);
  const step = Math.max(roundTo(midPrice * 0.00045, decimals), Math.pow(10, -decimals));

  const bids: OrderBookLevel[] = [];
  const asks: OrderBookLevel[] = [];
  let bidCum = 0;
  let askCum = 0;

  for (let i = 0; i < 10; i++) {
    const bidPrice = roundTo(bestBid - i * step, decimals);
    const askPrice = roundTo(bestAsk + i * step, decimals);
    const baseLot = midPrice > 10000 ? 0.35 : midPrice > 500 ? 2.8 : midPrice > 50 ? 38 : 1200;
    const bidSize = roundTo(baseLot * (0.4 + Math.random() * 1.9) * (1 + i * 0.18), 4);
    const askSize = roundTo(baseLot * (0.4 + Math.random() * 1.9) * (1 + i * 0.18), 4);
    bidCum = roundTo(bidCum + bidSize, 4);
    askCum = roundTo(askCum + askSize, 4);
    bids.push({ price: bidPrice, size: bidSize, total: bidCum });
    asks.push({ price: askPrice, size: askSize, total: askCum });
  }

  const spreadBps = roundTo(((bestAsk - bestBid) / midPrice) * 10000, 2);
  return { bids, asks, bid: bestBid, ask: bestAsk, spreadBps };
}

function generateInitialCandles(seed: InstrumentSeed, now: number): Record<Timeframe, Candle[]> {
  const result = {} as Record<Timeframe, Candle[]>;
  const timeframes: Timeframe[] = ['1m', '5m', '1h', '1D'];

  for (const tf of timeframes) {
    const interval = TIMEFRAME_MS[tf];
    const scale = tf === '1m' ? 1 : tf === '5m' ? 1.8 : tf === '1h' ? 3.6 : 7.5;
    const count = 90;
    const candles: Candle[] = [];
    let price = seed.basePrice * (1 - (Math.random() - 0.45) * 0.018);

    const alignedNow = Math.floor(now / interval) * interval;
    for (let i = count - 1; i >= 0; i--) {
      const time = alignedNow - i * interval;
      const drift = (seed.basePrice - price) * 0.04;
      const shock = (Math.random() - 0.49) * seed.basePrice * seed.volatility * scale;
      const open = roundTo(price, seed.decimals);
      const close = roundTo(Math.max(0.01, open + drift + shock), seed.decimals);
      const wickUp = Math.abs(Math.random() * seed.basePrice * seed.volatility * scale * 0.7);
      const wickDown = Math.abs(Math.random() * seed.basePrice * seed.volatility * scale * 0.7);
      const high = roundTo(Math.max(open, close) + wickUp, seed.decimals);
      const low = roundTo(Math.max(0.01, Math.min(open, close) - wickDown), seed.decimals);
      const volume = Math.round((seed.baseVolume / 240) * (0.45 + Math.random() * 1.4));
      candles.push({ time, open, high, low, close, volume });
      price = close;
    }

    // Align final candle close to basePrice
    const last = candles[candles.length - 1];
    last.close = seed.basePrice;
    last.high = roundTo(Math.max(last.high, last.close), seed.decimals);
    last.low = roundTo(Math.min(last.low, last.close), seed.decimals);
    result[tf] = candles;
  }

  return result;
}

export type EngineEventListener = (event: {
  type: 'market:tick' | 'trade:executed' | 'order:updated' | 'audit:appended' | 'state:sync';
  payload: unknown;
}) => void;

export class TradingEngine {
  private instruments = new Map<string, MarketInstrument>();
  private recentTrades = new Map<string, MarketTrade[]>();
  private users = new Map<string, UserAccountState>();
  private orders: Order[] = [];
  private receipts: ExecutionReceipt[] = [];
  private walletTransactions: WalletTransaction[] = [];
  private kycApplications: KycApplication[] = [];
  private apiKeys: ApiKeyRecord[] = [];
  private auditLog: AuditLogEntry[] = [];
  private circuitBreakerActive = false;
  private listeners = new Set<EngineEventListener>();
  private fxRates: Record<CurrencyCode, number> = {
    USD: 1,
    EUR: 1.0842,
    GBP: 1.2678,
  };
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const now = Date.now();
    this.seedMarkets(now);
    this.seedUsersAndRecords(now);
    this.startMarketStream();
  }

  public subscribe(listener: EngineEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: {
    type: 'market:tick' | 'trade:executed' | 'order:updated' | 'audit:appended' | 'state:sync';
    payload: unknown;
  }) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private seedMarkets(now: number) {
    for (const seed of INSTRUMENT_SEEDS) {
      const candles = generateInitialCandles(seed, now);
      const dayCandles = candles['1D'];
      const open24h = dayCandles[dayCandles.length - 2]?.close ?? seed.basePrice;
      const book = buildOrderBook(seed.basePrice, seed.decimals, seed.volatility);
      const recent1h = candles['1h'].slice(-24);
      const high24h = roundTo(Math.max(...recent1h.map((c) => c.high), seed.basePrice), seed.decimals);
      const low24h = roundTo(Math.min(...recent1h.map((c) => c.low), seed.basePrice), seed.decimals);

      this.instruments.set(seed.symbol, {
        symbol: seed.symbol,
        name: seed.name,
        assetClass: seed.assetClass,
        price: seed.basePrice,
        open24h,
        high24h,
        low24h,
        volume24h: seed.baseVolume,
        changePct: roundTo(((seed.basePrice - open24h) / open24h) * 100, 2),
        bid: book.bid,
        ask: book.ask,
        spreadBps: book.spreadBps,
        decimals: seed.decimals,
        bids: book.bids,
        asks: book.asks,
        candles,
        updatedAt: now,
      });

      const trades: MarketTrade[] = [];
      for (let i = 0; i < 16; i++) {
        const side: OrderSide = Math.random() > 0.48 ? 'buy' : 'sell';
        const offset = (Math.random() - 0.5) * seed.basePrice * seed.volatility * 0.4;
        const sizeBase = seed.basePrice > 10000 ? 0.12 : seed.basePrice > 500 ? 1.4 : 18;
        trades.push({
          id: `TRD-${seed.symbol}-${i}`,
          symbol: seed.symbol,
          price: roundTo(seed.basePrice + offset, seed.decimals),
          size: roundTo(sizeBase * (0.2 + Math.random() * 1.8), 4),
          side,
          timestamp: now - i * 4200,
        });
      }
      this.recentTrades.set(seed.symbol, trades);
    }
  }

  private seedUsersAndRecords(now: number) {
    const retailUser: UserAccountState = {
      profile: {
        id: 'usr_retail_01',
        name: 'Kunal Khatri',
        email: 'kunal.khatri@meridiantrade.io',
        role: 'retail',
        tierLabel: 'Retail Individual · Tier 2',
        kycStatus: 'verified',
        mfaEnabled: true,
        mfaMethod: 'Biometric Passkey',
        mfaVerifiedAt: now - 900_000,
        maxOrderNotionalUsd: 250_000,
        apiAccessEnabled: false,
      },
      cashBalances: {
        USD: 148500.0,
        EUR: 24500.0,
        GBP: 12000.0,
      },
      reservedCashUsd: 0,
      holdings: [
        { symbol: 'BTC-USD', quantity: 0.85, avgEntryPrice: 88410.0 },
        { symbol: 'ETH-USD', quantity: 6.5, avgEntryPrice: 3120.0 },
        { symbol: 'NVDA', quantity: 140, avgEntryPrice: 138.4 },
        { symbol: 'AAPL', quantity: 85, avgEntryPrice: 221.1 },
      ],
    };

    const instUser: UserAccountState = {
      profile: {
        id: 'usr_inst_01',
        name: 'Apex Quant Desk',
        email: 'execution@apexquant.capital',
        role: 'institutional',
        tierLabel: 'Institutional Prime · FIX & REST',
        kycStatus: 'verified',
        mfaEnabled: true,
        mfaMethod: 'FIDO2 Hardware Key',
        mfaVerifiedAt: now - 300_000,
        maxOrderNotionalUsd: 10_000_000,
        apiAccessEnabled: true,
      },
      cashBalances: {
        USD: 4250000.0,
        EUR: 850000.0,
        GBP: 420000.0,
      },
      reservedCashUsd: 0,
      holdings: [
        { symbol: 'BTC-USD', quantity: 18.4, avgEntryPrice: 86950.0 },
        { symbol: 'ETH-USD', quantity: 165.0, avgEntryPrice: 3095.0 },
        { symbol: 'NVDA', quantity: 4200, avgEntryPrice: 132.75 },
        { symbol: 'MSFT', quantity: 1100, avgEntryPrice: 414.2 },
        { symbol: 'XAU-USD', quantity: 120, avgEntryPrice: 2610.0 },
      ],
    };

    const complianceUser: UserAccountState = {
      profile: {
        id: 'usr_comp_01',
        name: 'Elena Vance',
        email: 'elena.vance@meridiantrade.io',
        role: 'compliance',
        tierLabel: 'Compliance & Risk Officer',
        kycStatus: 'verified',
        mfaEnabled: true,
        mfaMethod: 'FIDO2 Hardware Key',
        mfaVerifiedAt: now - 120_000,
        maxOrderNotionalUsd: 0,
        apiAccessEnabled: true,
      },
      cashBalances: { USD: 0, EUR: 0, GBP: 0 },
      reservedCashUsd: 0,
      holdings: [],
    };

    this.users.set(retailUser.profile.id, retailUser);
    this.users.set(instUser.profile.id, instUser);
    this.users.set(complianceUser.profile.id, complianceUser);

    // Seed an open limit order for retail user
    const openLimitOrder: Order = {
      id: 'ORD-840219',
      userId: retailUser.profile.id,
      symbol: 'BTC-USD',
      side: 'buy',
      type: 'limit',
      quantity: 0.15,
      limitPrice: 89500.0,
      notionalUsd: 13425.0,
      feeUsd: 13.43,
      status: 'open',
      createdAt: now - 1_850_000,
      updatedAt: now - 1_850_000,
      note: 'Resting limit bid in matching book',
    };
    retailUser.reservedCashUsd = roundTo(openLimitOrder.notionalUsd + openLimitOrder.feeUsd, 2);
    this.orders.push(openLimitOrder);

    // Seed filled historical orders & execution receipts
    const filledOrder: Order = {
      id: 'ORD-840104',
      userId: retailUser.profile.id,
      symbol: 'NVDA',
      side: 'buy',
      type: 'market',
      quantity: 40,
      executedPrice: 145.6,
      notionalUsd: 5824.0,
      feeUsd: 2.91,
      status: 'filled',
      receiptId: 'RCP-992014',
      createdAt: now - 7_200_000,
      updatedAt: now - 7_200_000,
    };
    this.orders.push(filledOrder);

    this.receipts.push({
      receiptId: 'RCP-992014',
      orderId: filledOrder.id,
      userId: retailUser.profile.id,
      symbol: 'NVDA',
      side: 'buy',
      type: 'market',
      quantity: 40,
      fillPrice: 145.6,
      grossNotionalUsd: 5824.0,
      feeUsd: 2.91,
      netSettlementUsd: 5826.91,
      settlementLatencyMs: 34,
      signatureHash: crypto.createHash('sha256').update('RCP-992014:ORD-840104:5826.91').digest('hex').slice(0, 24),
      timestamp: now - 7_200_000,
    });

    this.walletTransactions.push(
      {
        id: 'TXN-40291',
        userId: retailUser.profile.id,
        type: 'deposit',
        rail: 'Plaid Instant ACH',
        currency: 'USD',
        amount: 50000,
        usdEquivalent: 50000,
        status: 'completed',
        referenceId: 'PLD-8829104',
        timestamp: now - 86_400_000 * 2,
      },
      {
        id: 'TXN-40292',
        userId: retailUser.profile.id,
        type: 'deposit',
        rail: 'SEPA Wire Transfer',
        currency: 'EUR',
        amount: 24500,
        usdEquivalent: roundTo(24500 * this.fxRates.EUR, 2),
        status: 'completed',
        referenceId: 'SEPA-391042',
        timestamp: now - 86_400_000,
      },
      {
        id: 'TXN-40310',
        userId: instUser.profile.id,
        type: 'deposit',
        rail: 'Fedwire Institutional Settlement',
        currency: 'USD',
        amount: 2500000,
        usdEquivalent: 2500000,
        status: 'completed',
        referenceId: 'FED-9910421',
        timestamp: now - 86_400_000 * 3,
      }
    );

    this.kycApplications.push(
      {
        id: 'KYC-2026-019',
        userId: 'usr_retail_01',
        applicantName: 'Kunal Khatri',
        email: 'kunal.khatri@meridiantrade.io',
        documentType: 'National Passport + Biometric Liveness',
        jurisdiction: 'IN / Global Clearing',
        sourceOfFunds: 'Salaried Compensation & Equities Portfolio',
        riskScore: 'Low',
        status: 'verified',
        submittedAt: now - 86_400_000 * 5,
        reviewedBy: 'Elena Vance',
        reviewedAt: now - 86_400_000 * 4,
        notes: 'Onfido identity check passed; sanctions screening clear.',
      },
      {
        id: 'KYC-2026-042',
        userId: 'usr_applicant_02',
        applicantName: 'Aarav Mehta',
        email: 'aarav.mehta@meridian-client.com',
        documentType: 'Passport + Utility Proof of Address',
        jurisdiction: 'SG / MAS Tier',
        sourceOfFunds: 'Venture Equity Distribution',
        riskScore: 'Medium',
        status: 'pending_review',
        submittedAt: now - 5_400_000,
        notes: 'Enhanced due diligence requested for $250k+ wire limit.',
      },
      {
        id: 'KYC-2026-047',
        userId: 'usr_applicant_03',
        applicantName: 'Nordic Capital Holdings Ltd.',
        email: 'treasury@nordiccap.eu',
        documentType: 'LEI Certificate + UBO Registry',
        jurisdiction: 'SE / MiFID II',
        sourceOfFunds: 'Institutional Treasury Mandate',
        riskScore: 'Low',
        status: 'pending_review',
        submittedAt: now - 2_100_000,
        notes: 'Awaiting final compliance sign-off for API prime access.',
      }
    );

    this.apiKeys.push(
      {
        id: 'key_inst_prod_01',
        userId: instUser.profile.id,
        label: 'Primary Execution Engine (FIX/REST)',
        prefix: 'mk_live_98a4f1c2',
        permissions: ['read:market', 'trade:execute', 'read:orders'],
        createdAt: now - 86_400_000 * 14,
        lastUsedAt: now - 45_000,
        status: 'active',
      },
      {
        id: 'key_inst_ro_02',
        userId: instUser.profile.id,
        label: 'Risk & Reconciliation Feed',
        prefix: 'mk_live_44b0e912',
        permissions: ['read:market', 'read:orders', 'read:audit'],
        createdAt: now - 86_400_000 * 6,
        lastUsedAt: now - 320_000,
        status: 'active',
      }
    );

    this.appendAudit(
      'usr_comp_01',
      'auth',
      'System Initialization & Ledger Genesis',
      'Matching engine started; TLS 1.3 & AES-256 storage policy enforced.',
      now - 10_800_000
    );
    this.appendAudit(
      'usr_retail_01',
      'order',
      'Order Filled: BUY 40 NVDA @ $145.60',
      'Receipt RCP-992014 issued in 34ms; balance updated.',
      now - 7_200_000
    );
    this.appendAudit(
      'usr_inst_01',
      'auth',
      'FIDO2 Hardware MFA Verified',
      'Institutional Prime session authorized via FIDO2 security key.',
      now - 300_000
    );
  }

  private appendAudit(
    actorId: string,
    category: AuditLogEntry['category'],
    action: string,
    details: string,
    customTimestamp?: number
  ): AuditLogEntry {
    const actor = this.users.get(actorId)?.profile;
    const sequence = this.auditLog.length + 1;
    const prevHash = this.auditLog.length > 0 ? this.auditLog[0].entryHash : '00000000000000000000000000000000';
    const timestamp = customTimestamp ?? Date.now();
    const payloadStr = `${sequence}|${timestamp}|${actorId}|${category}|${action}|${details}|${prevHash}`;
    const entryHash = crypto.createHash('sha256').update(payloadStr).digest('hex').slice(0, 32);

    const entry: AuditLogEntry = {
      id: `AUD-${String(sequence).padStart(6, '0')}`,
      sequence,
      timestamp,
      actorId,
      actorName: actor?.name ?? 'System Kernel',
      actorRole: actor?.role ?? 'compliance',
      category,
      action,
      details,
      prevHash,
      entryHash,
    };

    this.auditLog.unshift(entry);
    if (this.auditLog.length > 250) {
      this.auditLog.pop();
    }
    this.emit({ type: 'audit:appended', payload: entry });
    return entry;
  }

  private startMarketStream() {
    // 180ms real-time tick stream (meets SRS REQ-1: <200ms)
    this.tickTimer = setInterval(() => {
      const now = Date.now();
      const updates: MarketTickUpdate[] = [];

      // Update 4 random instruments per 180ms cycle for lively, realistic streaming
      const seeds = [...INSTRUMENT_SEEDS].sort(() => Math.random() - 0.5).slice(0, 4);

      for (const seed of seeds) {
        const inst = this.instruments.get(seed.symbol);
        if (!inst) continue;

        const meanReversion = (seed.basePrice - inst.price) * 0.002;
        const delta = (Math.random() - 0.495) * inst.price * seed.volatility * 0.32 + meanReversion;
        const newPrice = roundTo(Math.max(0.01, inst.price + delta), inst.decimals);
        const book = buildOrderBook(newPrice, inst.decimals, seed.volatility);

        inst.price = newPrice;
        inst.bid = book.bid;
        inst.ask = book.ask;
        inst.spreadBps = book.spreadBps;
        inst.bids = book.bids;
        inst.asks = book.asks;
        inst.high24h = Math.max(inst.high24h, newPrice);
        inst.low24h = Math.min(inst.low24h, newPrice);
        inst.changePct = roundTo(((newPrice - inst.open24h) / inst.open24h) * 100, 2);
        inst.updatedAt = now;

        const tradeVol = roundTo((seed.baseVolume / 24000) * (0.3 + Math.random() * 1.6), 4);
        inst.volume24h = roundTo(inst.volume24h + tradeVol, 2);

        const latestCandles = {} as Record<Timeframe, Candle>;
        const timeframes: Timeframe[] = ['1m', '5m', '1h', '1D'];
        for (const tf of timeframes) {
          const interval = TIMEFRAME_MS[tf];
          const bucket = Math.floor(now / interval) * interval;
          const series = inst.candles[tf];
          const lastCandle = series[series.length - 1];

          if (lastCandle && lastCandle.time === bucket) {
            lastCandle.close = newPrice;
            lastCandle.high = Math.max(lastCandle.high, newPrice);
            lastCandle.low = Math.min(lastCandle.low, newPrice);
            lastCandle.volume = roundTo(lastCandle.volume + tradeVol, 4);
            latestCandles[tf] = { ...lastCandle };
          } else {
            const newCandle: Candle = {
              time: bucket,
              open: lastCandle ? lastCandle.close : newPrice,
              high: newPrice,
              low: newPrice,
              close: newPrice,
              volume: tradeVol,
            };
            series.push(newCandle);
            if (series.length > 140) series.shift();
            latestCandles[tf] = { ...newCandle };
          }
        }

        // Occasionally record a public market tape trade
        if (Math.random() > 0.45) {
          const trades = this.recentTrades.get(seed.symbol) ?? [];
          trades.unshift({
            id: `TRD-${now}-${Math.floor(Math.random() * 1000)}`,
            symbol: seed.symbol,
            price: newPrice,
            size: tradeVol,
            side: delta >= 0 ? 'buy' : 'sell',
            timestamp: now,
          });
          if (trades.length > 30) trades.pop();
          this.recentTrades.set(seed.symbol, trades);
        }

        if (seed.symbol === 'EUR-USD') this.fxRates.EUR = newPrice;
        if (seed.symbol === 'GBP-USD') this.fxRates.GBP = newPrice;

        updates.push({
          symbol: inst.symbol,
          price: inst.price,
          high24h: inst.high24h,
          low24h: inst.low24h,
          volume24h: inst.volume24h,
          changePct: inst.changePct,
          bid: inst.bid,
          ask: inst.ask,
          spreadBps: inst.spreadBps,
          bids: inst.bids,
          asks: inst.asks,
          latestCandles,
          updatedAt: now,
        });

        // Check resting Limit and Stop-Loss orders against live market price
        if (!this.circuitBreakerActive) {
          this.evaluateRestingOrders(inst);
        }
      }

      if (updates.length > 0) {
        this.emit({ type: 'market:tick', payload: updates });
      }
    }, 180);
  }

  private evaluateRestingOrders(inst: MarketInstrument) {
    const openOrders = this.orders.filter(
      (o) => o.symbol === inst.symbol && o.status === 'open'
    );

    for (const order of openOrders) {
      let shouldFill = false;
      let fillPrice = inst.price;

      if (order.type === 'limit' && order.limitPrice !== undefined) {
        if (order.side === 'buy' && inst.ask <= order.limitPrice) {
          shouldFill = true;
          fillPrice = Math.min(inst.ask, order.limitPrice);
        } else if (order.side === 'sell' && inst.bid >= order.limitPrice) {
          shouldFill = true;
          fillPrice = Math.max(inst.bid, order.limitPrice);
        }
      } else if (order.type === 'stop_loss' && order.stopPrice !== undefined) {
        if (order.side === 'sell' && inst.bid <= order.stopPrice) {
          shouldFill = true;
          fillPrice = inst.bid;
        } else if (order.side === 'buy' && inst.ask >= order.stopPrice) {
          shouldFill = true;
          fillPrice = inst.ask;
        }
      }

      if (shouldFill) {
        this.executeOrderFill(order, fillPrice);
      }
    }
  }

  private executeOrderFill(order: Order, fillPrice: number) {
    const user = this.users.get(order.userId);
    if (!user) return;
    const now = Date.now();
    const startExec = performance.now();

    const grossNotional = roundTo(fillPrice * order.quantity, 2);
    const feeRate = user.profile.role === 'institutional' ? 0.0004 : 0.001;
    const feeUsd = roundTo(grossNotional * feeRate, 2);

    // Release previously reserved funds if it was a resting buy order
    if (order.status === 'open' && order.side === 'buy') {
      user.reservedCashUsd = roundTo(Math.max(0, user.reservedCashUsd - (order.notionalUsd + order.feeUsd)), 2);
    }

    if (order.side === 'buy') {
      const totalDebit = roundTo(grossNotional + feeUsd, 2);
      if (user.cashBalances.USD < totalDebit) {
        order.status = 'reverted';
        order.note = 'Reverted safely: insufficient USD settlement balance.';
        order.updatedAt = now;
        this.emit({ type: 'order:updated', payload: order });
        return;
      }
      user.cashBalances.USD = roundTo(user.cashBalances.USD - totalDebit, 2);

      const existing = user.holdings.find((h) => h.symbol === order.symbol);
      if (existing) {
        const newQty = roundTo(existing.quantity + order.quantity, 6);
        existing.avgEntryPrice = roundTo(
          (existing.quantity * existing.avgEntryPrice + grossNotional) / newQty,
          4
        );
        existing.quantity = newQty;
      } else {
        user.holdings.push({
          symbol: order.symbol,
          quantity: order.quantity,
          avgEntryPrice: fillPrice,
        });
      }
    } else {
      const existing = user.holdings.find((h) => h.symbol === order.symbol);
      if (!existing || existing.quantity < order.quantity) {
        order.status = 'reverted';
        order.note = 'Reverted safely: insufficient asset holdings.';
        order.updatedAt = now;
        this.emit({ type: 'order:updated', payload: order });
        return;
      }
      existing.quantity = roundTo(existing.quantity - order.quantity, 6);
      if (existing.quantity <= 0.000001) {
        user.holdings = user.holdings.filter((h) => h.symbol !== order.symbol);
      }
      const netCredit = roundTo(grossNotional - feeUsd, 2);
      user.cashBalances.USD = roundTo(user.cashBalances.USD + netCredit, 2);
    }

    const receiptId = `RCP-${Math.floor(100000 + Math.random() * 900000)}`;
    const latencyMs = Math.max(12, Math.round(performance.now() - startExec + 18 + Math.random() * 24));
    const netSettlementUsd = order.side === 'buy'
      ? roundTo(grossNotional + feeUsd, 2)
      : roundTo(grossNotional - feeUsd, 2);

    order.executedPrice = fillPrice;
    order.notionalUsd = grossNotional;
    order.feeUsd = feeUsd;
    order.status = 'filled';
    order.receiptId = receiptId;
    order.updatedAt = now;

    const receipt: ExecutionReceipt = {
      receiptId,
      orderId: order.id,
      userId: order.userId,
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      quantity: order.quantity,
      fillPrice,
      grossNotionalUsd: grossNotional,
      feeUsd,
      netSettlementUsd,
      settlementLatencyMs: latencyMs,
      signatureHash: crypto
        .createHash('sha256')
        .update(`${receiptId}:${order.id}:${fillPrice}:${netSettlementUsd}:${now}`)
        .digest('hex')
        .slice(0, 24),
      timestamp: now,
    };

    this.receipts.unshift(receipt);
    this.walletTransactions.unshift({
      id: `TXN-${Math.floor(10000 + Math.random() * 90000)}`,
      userId: order.userId,
      type: 'trade_settlement',
      rail: 'Internal Clearing Engine',
      currency: 'USD',
      amount: order.side === 'buy' ? -netSettlementUsd : netSettlementUsd,
      usdEquivalent: netSettlementUsd,
      status: 'completed',
      referenceId: receiptId,
      timestamp: now,
    });

    this.appendAudit(
      order.userId,
      'order',
      `Order Filled: ${order.side.toUpperCase()} ${order.quantity} ${order.symbol} @ $${fillPrice}`,
      `Receipt ${receiptId} · Latency ${latencyMs}ms · Fee $${feeUsd}`
    );

    this.emit({
      type: 'trade:executed',
      payload: { order, receipt, userAccount: user },
    });
  }

  public getSnapshot(): PlatformSnapshot {
    const usersRecord: Record<string, UserAccountState> = {};
    for (const [id, state] of this.users.entries()) {
      usersRecord[id] = state;
    }
    const tradesRecord: Record<string, MarketTrade[]> = {};
    for (const [sym, list] of this.recentTrades.entries()) {
      tradesRecord[sym] = list;
    }
    return {
      instruments: Array.from(this.instruments.values()),
      recentTrades: tradesRecord,
      fxRates: { ...this.fxRates },
      users: usersRecord,
      orders: this.orders,
      receipts: this.receipts,
      walletTransactions: this.walletTransactions,
      kycApplications: this.kycApplications,
      apiKeys: this.apiKeys,
      auditLog: this.auditLog,
      circuitBreakerActive: this.circuitBreakerActive,
      serverTime: Date.now(),
    };
  }

  public getInstrument(symbol: string): MarketInstrument | undefined {
    return this.instruments.get(symbol);
  }

  public placeOrder(input: {
    userId: string;
    symbol: string;
    side: OrderSide;
    type: OrderType;
    quantity: number;
    limitPrice?: number;
    stopPrice?: number;
  }): { ok: true; order: Order; receipt?: ExecutionReceipt; userAccount: UserAccountState } | { ok: false; error: string } {
    if (this.circuitBreakerActive) {
      return { ok: false, error: 'Safety circuit breaker is active. Pending market execution halted per Section 5.2.' };
    }

    const user = this.users.get(input.userId);
    if (!user) return { ok: false, error: 'Account not found.' };
    if (user.profile.role === 'compliance') {
      return { ok: false, error: 'Compliance Officer accounts cannot submit trading orders.' };
    }

    const inst = this.instruments.get(input.symbol);
    if (!inst) return { ok: false, error: `Unknown instrument: ${input.symbol}` };
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      return { ok: false, error: 'Order quantity must be greater than zero.' };
    }

    const refPrice =
      input.type === 'limit' && input.limitPrice
        ? input.limitPrice
        : input.type === 'stop_loss' && input.stopPrice
          ? input.stopPrice
          : input.side === 'buy'
            ? inst.ask
            : inst.bid;

    const notionalUsd = roundTo(refPrice * input.quantity, 2);
    if (notionalUsd > user.profile.maxOrderNotionalUsd) {
      return {
        ok: false,
        error: `Order notional ($${notionalUsd.toLocaleString()}) exceeds ${user.profile.role} tier limit ($${user.profile.maxOrderNotionalUsd.toLocaleString()}).`,
      };
    }

    const feeRate = user.profile.role === 'institutional' ? 0.0004 : 0.001;
    const feeUsd = roundTo(notionalUsd * feeRate, 2);

    // REQ-3: Verify available account balance / asset holdings prior to accepting trade order
    if (input.side === 'buy') {
      const availableUsd = roundTo(user.cashBalances.USD - user.reservedCashUsd, 2);
      const requiredUsd = roundTo(notionalUsd + feeUsd, 2);
      if (availableUsd < requiredUsd) {
        return {
          ok: false,
          error: `Insufficient available USD balance. Required $${requiredUsd.toLocaleString()}, available $${availableUsd.toLocaleString()}.`,
        };
      }
    } else {
      const holding = user.holdings.find((h) => h.symbol === input.symbol);
      const openSellQty = this.orders
        .filter((o) => o.userId === input.userId && o.symbol === input.symbol && o.side === 'sell' && o.status === 'open')
        .reduce((sum, o) => sum + o.quantity, 0);
      const availableQty = (holding?.quantity ?? 0) - openSellQty;
      if (availableQty < input.quantity) {
        return {
          ok: false,
          error: `Insufficient ${input.symbol} holdings. Available ${roundTo(availableQty, 6)}, requested ${input.quantity}.`,
        };
      }
    }

    const now = Date.now();
    const order: Order = {
      id: `ORD-${Math.floor(100000 + Math.random() * 900000)}`,
      userId: input.userId,
      symbol: input.symbol,
      side: input.side,
      type: input.type,
      quantity: roundTo(input.quantity, 6),
      limitPrice: input.limitPrice ? roundTo(input.limitPrice, inst.decimals) : undefined,
      stopPrice: input.stopPrice ? roundTo(input.stopPrice, inst.decimals) : undefined,
      notionalUsd,
      feeUsd,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };

    this.orders.unshift(order);

    const immediateMarket = input.type === 'market';
    const immediateLimit =
      input.type === 'limit' &&
      order.limitPrice !== undefined &&
      ((input.side === 'buy' && inst.ask <= order.limitPrice) ||
        (input.side === 'sell' && inst.bid >= order.limitPrice));

    if (immediateMarket || immediateLimit) {
      const fillPrice = input.side === 'buy' ? inst.ask : inst.bid;
      this.executeOrderFill(order, fillPrice);
      const latestReceipt = this.receipts[0];
      return { ok: true, order, receipt: latestReceipt, userAccount: user };
    }

    // Reserve funds for resting buy limit/stop order
    if (order.side === 'buy') {
      user.reservedCashUsd = roundTo(user.reservedCashUsd + notionalUsd + feeUsd, 2);
    }

    this.appendAudit(
      input.userId,
      'order',
      `Resting ${order.type.toUpperCase()} Order Placed: ${order.side.toUpperCase()} ${order.quantity} ${order.symbol}`,
      `Order ${order.id} queued @ $${refPrice}`
    );

    this.emit({ type: 'order:updated', payload: order });
    this.emit({ type: 'state:sync', payload: this.getSnapshot() });
    return { ok: true, order, userAccount: user };
  }

  public cancelOrder(orderId: string, actorId: string): { ok: true; order: Order } | { ok: false; error: string } {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) return { ok: false, error: 'Order not found.' };
    if (order.status !== 'open') return { ok: false, error: `Cannot cancel order with status: ${order.status}` };

    const user = this.users.get(order.userId);
    if (user && order.side === 'buy') {
      user.reservedCashUsd = roundTo(Math.max(0, user.reservedCashUsd - (order.notionalUsd + order.feeUsd)), 2);
    }

    order.status = 'cancelled';
    order.updatedAt = Date.now();
    order.note = 'Cancelled by user';

    this.appendAudit(
      actorId,
      'order',
      `Order Cancelled: ${order.id}`,
      `Released reserved funds for ${order.side.toUpperCase()} ${order.quantity} ${order.symbol}`
    );

    this.emit({ type: 'state:sync', payload: this.getSnapshot() });
    return { ok: true, order };
  }

  public depositOrWithdraw(input: {
    userId: string;
    action: 'deposit' | 'withdrawal';
    currency: CurrencyCode;
    amount: number;
    rail: string;
  }): { ok: true; transaction: WalletTransaction; userAccount: UserAccountState } | { ok: false; error: string } {
    const user = this.users.get(input.userId);
    if (!user) return { ok: false, error: 'Account not found.' };
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      return { ok: false, error: 'Amount must be positive.' };
    }

    const rate = this.fxRates[input.currency];
    const usdEquiv = roundTo(input.amount * rate, 2);

    if (input.action === 'withdrawal') {
      if (input.currency === 'USD') {
        const available = roundTo(user.cashBalances.USD - user.reservedCashUsd, 2);
        if (available < input.amount) {
          return { ok: false, error: `Insufficient available USD. Available: $${available.toLocaleString()}` };
        }
      } else if (user.cashBalances[input.currency] < input.amount) {
        return { ok: false, error: `Insufficient ${input.currency} balance.` };
      }
      user.cashBalances[input.currency] = roundTo(user.cashBalances[input.currency] - input.amount, 2);
    } else {
      user.cashBalances[input.currency] = roundTo(user.cashBalances[input.currency] + input.amount, 2);
    }

    const now = Date.now();
    const txn: WalletTransaction = {
      id: `TXN-${Math.floor(10000 + Math.random() * 90000)}`,
      userId: input.userId,
      type: input.action,
      rail: input.rail,
      currency: input.currency,
      amount: roundTo(input.amount, 2),
      usdEquivalent: usdEquiv,
      status: 'completed',
      referenceId: `${input.rail.slice(0, 3).toUpperCase()}-${Math.floor(1000000 + Math.random() * 8999999)}`,
      timestamp: now,
    };

    this.walletTransactions.unshift(txn);
    this.appendAudit(
      input.userId,
      'wallet',
      `${input.action === 'deposit' ? 'Deposit' : 'Withdrawal'} Settled: ${input.amount.toLocaleString()} ${input.currency}`,
      `Via ${input.rail} · Ref ${txn.referenceId}`
    );

    this.emit({ type: 'state:sync', payload: this.getSnapshot() });
    return { ok: true, transaction: txn, userAccount: user };
  }

  public convertCurrency(input: {
    userId: string;
    fromCurrency: CurrencyCode;
    toCurrency: CurrencyCode;
    amount: number;
  }): { ok: true; convertedAmount: number; userAccount: UserAccountState } | { ok: false; error: string } {
    const user = this.users.get(input.userId);
    if (!user) return { ok: false, error: 'Account not found.' };
    if (input.fromCurrency === input.toCurrency) return { ok: false, error: 'Select two different currencies.' };
    if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, error: 'Amount must be positive.' };

    const available =
      input.fromCurrency === 'USD'
        ? user.cashBalances.USD - user.reservedCashUsd
        : user.cashBalances[input.fromCurrency];

    if (available < input.amount) {
      return { ok: false, error: `Insufficient ${input.fromCurrency} balance.` };
    }

    const usdValue = input.amount * this.fxRates[input.fromCurrency];
    const convertedAmount = roundTo((usdValue / this.fxRates[input.toCurrency]) * 0.9985, 2);

    user.cashBalances[input.fromCurrency] = roundTo(user.cashBalances[input.fromCurrency] - input.amount, 2);
    user.cashBalances[input.toCurrency] = roundTo(user.cashBalances[input.toCurrency] + convertedAmount, 2);

    const now = Date.now();
    this.walletTransactions.unshift({
      id: `TXN-${Math.floor(10000 + Math.random() * 90000)}`,
      userId: input.userId,
      type: 'fx_conversion',
      rail: `FX Desk (${input.fromCurrency} → ${input.toCurrency})`,
      currency: input.toCurrency,
      amount: convertedAmount,
      usdEquivalent: roundTo(usdValue, 2),
      status: 'completed',
      referenceId: `FX-${Math.floor(100000 + Math.random() * 900000)}`,
      timestamp: now,
    });

    this.appendAudit(
      input.userId,
      'wallet',
      `FX Conversion: ${input.amount} ${input.fromCurrency} → ${convertedAmount} ${input.toCurrency}`,
      `Mid-market rate applied with 15bps liquidity spread`
    );

    this.emit({ type: 'state:sync', payload: this.getSnapshot() });
    return { ok: true, convertedAmount, userAccount: user };
  }

  public verifyMfa(userId: string, method: string): { ok: true; userAccount: UserAccountState } | { ok: false; error: string } {
    const user = this.users.get(userId);
    if (!user) return { ok: false, error: 'Account not found.' };
    user.profile.mfaVerifiedAt = Date.now();

    this.appendAudit(
      userId,
      'auth',
      `MFA Challenge Verified (${method})`,
      `Multi-factor cryptographic token validated for ${user.profile.email}`
    );

    this.emit({ type: 'state:sync', payload: this.getSnapshot() });
    return { ok: true, userAccount: user };
  }

  public submitKyc(input: {
    userId: string;
    applicantName: string;
    email: string;
    documentType: string;
    jurisdiction: string;
    sourceOfFunds: string;
  }): KycApplication {
    const now = Date.now();
    const app: KycApplication = {
      id: `KYC-2026-${Math.floor(100 + Math.random() * 899)}`,
      userId: input.userId,
      applicantName: input.applicantName,
      email: input.email,
      documentType: input.documentType,
      jurisdiction: input.jurisdiction,
      sourceOfFunds: input.sourceOfFunds,
      riskScore: input.jurisdiction.includes('Global') ? 'Medium' : 'Low',
      status: 'pending_review',
      submittedAt: now,
      notes: 'Submitted via Onfido KYC/AML verification intake.',
    };
    this.kycApplications.unshift(app);

    const user = this.users.get(input.userId);
    if (user) user.profile.kycStatus = 'pending_review';

    this.appendAudit(
      input.userId,
      'compliance',
      `KYC Dossier Submitted (${app.id})`,
      `${input.documentType} · Jurisdiction: ${input.jurisdiction}`
    );

    this.emit({ type: 'state:sync', payload: this.getSnapshot() });
    return app;
  }

  public reviewKyc(input: {
    kycId: string;
    decision: 'verified' | 'rejected';
    reviewerId: string;
    notes: string;
  }): { ok: true; application: KycApplication } | { ok: false; error: string } {
    const app = this.kycApplications.find((k) => k.id === input.kycId);
    if (!app) return { ok: false, error: 'KYC application not found.' };

    const reviewer = this.users.get(input.reviewerId)?.profile;
    app.status = input.decision;
    app.reviewedBy = reviewer?.name ?? 'Compliance Officer';
    app.reviewedAt = Date.now();
    app.notes = input.notes || `Reviewed by ${app.reviewedBy}`;

    const applicantUser = this.users.get(app.userId);
    if (applicantUser) {
      applicantUser.profile.kycStatus = input.decision === 'verified' ? 'verified' : 'action_required';
    }

    this.appendAudit(
      input.reviewerId,
      'compliance',
      `KYC ${input.decision.toUpperCase()}: ${app.applicantName} (${app.id})`,
      app.notes
    );

    this.emit({ type: 'state:sync', payload: this.getSnapshot() });
    return { ok: true, application: app };
  }

  public createApiKey(input: {
    userId: string;
    label: string;
    permissions: string[];
  }): { ok: true; keyRecord: ApiKeyRecord; rawSecret: string } | { ok: false; error: string } {
    const user = this.users.get(input.userId);
    if (!user) return { ok: false, error: 'Account not found.' };
    if (!user.profile.apiAccessEnabled && user.profile.role === 'retail') {
      return { ok: false, error: 'API key provisioning requires Institutional or Compliance role.' };
    }

    const randomToken = crypto.randomBytes(16).toString('hex');
    const prefix = `mk_live_${randomToken.slice(0, 8)}`;
    const rawSecret = `${prefix}_${randomToken.slice(8)}`;

    const record: ApiKeyRecord = {
      id: `key_${Date.now()}`,
      userId: input.userId,
      label: input.label.trim() || 'Institutional API Key',
      prefix,
      permissions: input.permissions.length > 0 ? input.permissions : ['read:market'],
      createdAt: Date.now(),
      lastUsedAt: null,
      status: 'active',
    };

    this.apiKeys.unshift(record);
    this.appendAudit(
      input.userId,
      'api',
      `API Key Provisioned: ${record.label}`,
      `Prefix ${prefix} · Scopes: ${record.permissions.join(', ')}`
    );

    this.emit({ type: 'state:sync', payload: this.getSnapshot() });
    return { ok: true, keyRecord: record, rawSecret };
  }

  public revokeApiKey(keyId: string, actorId: string): { ok: true } | { ok: false; error: string } {
    const key = this.apiKeys.find((k) => k.id === keyId);
    if (!key) return { ok: false, error: 'API key not found.' };
    key.status = 'revoked';

    this.appendAudit(
      actorId,
      'api',
      `API Key Revoked: ${key.label}`,
      `Prefix ${key.prefix} immediately invalidated`
    );

    this.emit({ type: 'state:sync', payload: this.getSnapshot() });
    return { ok: true };
  }

  public toggleCircuitBreaker(actorId: string, active: boolean): { circuitBreakerActive: boolean; revertedCount: number } {
    this.circuitBreakerActive = active;
    let revertedCount = 0;

    if (active) {
      for (const order of this.orders) {
        if (order.status === 'open') {
          order.status = 'reverted';
          order.updatedAt = Date.now();
          order.note = 'Reverted to safe unfulfilled state during circuit breaker (SRS 5.2).';
          revertedCount++;
          const user = this.users.get(order.userId);
          if (user && order.side === 'buy') {
            user.reservedCashUsd = roundTo(Math.max(0, user.reservedCashUsd - (order.notionalUsd + order.feeUsd)), 2);
          }
        }
      }
    }

    this.appendAudit(
      actorId,
      'safety',
      active ? 'Safety Circuit Breaker Activated' : 'Safety Circuit Breaker Cleared',
      active
        ? `Halted new execution and safely reverted ${revertedCount} open orders per SRS Section 5.2.`
        : 'Normal continuous matching engine resumed.'
    );

    this.emit({ type: 'state:sync', payload: this.getSnapshot() });
    return { circuitBreakerActive: this.circuitBreakerActive, revertedCount };
  }

  public shutdown() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }
}
