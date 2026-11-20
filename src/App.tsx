import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  BookOpen,
  CandlestickChart as ChartIcon,
  Menu,
  Moon,
  ShieldCheck,
  Sun,
  UserCheck,
  Wallet,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import type {
  ExecutionReceipt,
  MarketTickUpdate,
  PlatformSnapshot,
  Timeframe,
} from './types/trading';
import { TradingTerminalView } from './components/TradingTerminalView';
import { PortfolioWalletView } from './components/PortfolioWalletView';
import { ComplianceAuditView } from './components/ComplianceAuditView';
import { ApiDocsView } from './components/ApiDocsView';
import { MfaModal } from './components/MfaModal';
import { ReceiptModal } from './components/ReceiptModal';

type WorkspaceTab = 'terminal' | 'wallet' | 'compliance' | 'api';

const USER_ACCOUNTS_ORDER = ['usr_retail_01', 'usr_inst_01', 'usr_comp_01'];

export default function App() {
  const [snapshot, setSnapshot] = useState<PlatformSnapshot | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('terminal');
  const [activeUserId, setActiveUserId] = useState<string>('usr_retail_01');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTC-USD');
  const [isDark, setIsDark] = useState<boolean>(true);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [mobileNavOpen, setMobileNavOpen] = useState<boolean>(false);

  const [mfaModalOpen, setMfaModalOpen] = useState<boolean>(false);
  const pendingMfaActionRef = useRef<(() => void) | null>(null);
  const [inspectedReceipt, setInspectedReceipt] = useState<ExecutionReceipt | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  const applyTickUpdates = useCallback((updates: MarketTickUpdate[]) => {
    setSnapshot((prev) => {
      if (!prev) return prev;
      const updateMap = new Map<string, MarketTickUpdate>();
      for (const u of updates) updateMap.set(u.symbol, u);

      const nextInstruments = prev.instruments.map((inst) => {
        const u = updateMap.get(inst.symbol);
        if (!u) return inst;

        const nextCandles = { ...inst.candles };
        (['1m', '5m', '1h', '1D'] as Timeframe[]).forEach((tf) => {
          const incoming = u.latestCandles[tf];
          if (!incoming) return;
          const series = [...nextCandles[tf]];
          const last = series[series.length - 1];
          if (last && last.time === incoming.time) {
            series[series.length - 1] = incoming;
          } else {
            series.push(incoming);
            if (series.length > 140) series.shift();
          }
          nextCandles[tf] = series;
        });

        return {
          ...inst,
          price: u.price,
          high24h: u.high24h,
          low24h: u.low24h,
          volume24h: u.volume24h,
          changePct: u.changePct,
          bid: u.bid,
          ask: u.ask,
          spreadBps: u.spreadBps,
          bids: u.bids,
          asks: u.asks,
          candles: nextCandles,
          updatedAt: u.updatedAt,
        };
      });

      const eurInst = updateMap.get('EUR-USD');
      const gbpInst = updateMap.get('GBP-USD');

      return {
        ...prev,
        instruments: nextInstruments,
        fxRates: {
          ...prev.fxRates,
          ...(eurInst ? { EUR: eurInst.price } : {}),
          ...(gbpInst ? { GBP: gbpInst.price } : {}),
        },
        serverTime: Date.now(),
      };
    });
  }, []);

  useEffect(() => {
    let active = true;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    // Initial HTTP hydration for zero-latency first paint
    fetch('/api/state')
      .then((res) => res.json())
      .then((data: PlatformSnapshot) => {
        if (active) setSnapshot(data);
      })
      .catch(() => {});

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/ws`;
      ws = new WebSocket(url);

      ws.onopen = () => {
        if (active) setWsConnected(true);
      };

      ws.onmessage = (event) => {
        if (!active) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'state:init' || msg.type === 'state:sync') {
            setSnapshot(msg.payload as PlatformSnapshot);
          } else if (msg.type === 'market:tick') {
            applyTickUpdates(msg.payload as MarketTickUpdate[]);
          } else if (msg.type === 'trade:executed') {
            const { order, receipt, userAccount } = msg.payload;
            setSnapshot((prev) => {
              if (!prev) return prev;
              const existingOrderIdx = prev.orders.findIndex((o) => o.id === order.id);
              const nextOrders = [...prev.orders];
              if (existingOrderIdx >= 0) {
                nextOrders[existingOrderIdx] = order;
              } else {
                nextOrders.unshift(order);
              }
              const receiptExists = prev.receipts.some((r) => r.receiptId === receipt.receiptId);
              return {
                ...prev,
                orders: nextOrders,
                receipts: receiptExists ? prev.receipts : [receipt, ...prev.receipts],
                users: {
                  ...prev.users,
                  [userAccount.profile.id]: userAccount,
                },
              };
            });
          } else if (msg.type === 'order:updated') {
            const updatedOrder = msg.payload;
            setSnapshot((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                orders: prev.orders.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)),
              };
            });
          } else if (msg.type === 'audit:appended') {
            const entry = msg.payload;
            setSnapshot((prev) => {
              if (!prev) return prev;
              if (prev.auditLog.some((a) => a.id === entry.id)) return prev;
              return {
                ...prev,
                auditLog: [entry, ...prev.auditLog].slice(0, 250),
              };
            });
          }
        } catch {
          // Ignore invalid socket frames
        }
      };

      ws.onclose = () => {
        if (!active) return;
        setWsConnected(false);
        reconnectTimer = setTimeout(connect, 2000);
      };
    };

    connect();

    return () => {
      active = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [applyTickUpdates]);

  const requireMfa = (onVerified: () => void) => {
    pendingMfaActionRef.current = onVerified;
    setMfaModalOpen(true);
  };

  const handleMfaComplete = () => {
    setMfaModalOpen(false);
    const cb = pendingMfaActionRef.current;
    pendingMfaActionRef.current = null;
    if (cb) cb();
  };

  if (!snapshot) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0B0F17] flex items-center justify-center p-6">
        <div className="w-full max-w-4xl space-y-4">
          <div className="h-12 bg-slate-200 dark:bg-slate-800/70 rounded-lg animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 h-96 bg-slate-200 dark:bg-slate-800/70 rounded-lg animate-pulse" />
            <div className="h-96 bg-slate-200 dark:bg-slate-800/70 rounded-lg animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  const currentUserAccount =
    snapshot.users[activeUserId] ?? snapshot.users['usr_retail_01'];

  const navItems: { id: WorkspaceTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'terminal', label: 'Trade Terminal', icon: ChartIcon },
    { id: 'wallet', label: 'Portfolio & Wallet', icon: Wallet },
    { id: 'compliance', label: 'Compliance & Audit', icon: ShieldCheck },
    { id: 'api', label: 'API & Docs', icon: BookOpen },
  ];

  const activeBreadcrumb =
    activeTab === 'terminal'
      ? `Trading Terminal / ${selectedSymbol}`
      : activeTab === 'wallet'
        ? 'Multi-Currency Wallet & Settlement'
        : activeTab === 'compliance'
          ? 'Compliance, KYC & Audit Ledger'
          : 'Developer API & SRS Docs';

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100">
      {/* Mobile Sidebar Backdrop */}
      {mobileNavOpen && (
        <div
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden"
        />
      )}

      {/* Left Workspace Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-[#111723] border-r border-slate-200 dark:border-slate-800 flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-14 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <span className="text-base font-display font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0">
            Meridian Trade
          </span>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
            className="lg:hidden text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="p-3 space-y-1 flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileNavOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User Class / Role Switcher (SRS Section 2.3) */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 px-1">
            Account Role (SRS 2.3)
          </div>
          <div className="space-y-1">
            {USER_ACCOUNTS_ORDER.map((uid) => {
              const acc = snapshot.users[uid];
              if (!acc) return null;
              const selected = acc.profile.id === currentUserAccount.profile.id;
              return (
                <button
                  key={uid}
                  type="button"
                  onClick={() => setActiveUserId(uid)}
                  className={`w-full text-left px-3 py-2 rounded-md border transition-colors cursor-pointer ${
                    selected
                      ? 'border-blue-500 bg-blue-500/8'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/60'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {acc.profile.name}
                    </span>
                    <UserCheck
                      className={`w-3.5 h-3.5 shrink-0 ${
                        selected ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'
                      }`}
                    />
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {acc.profile.tierLabel}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Real WebSocket Connection Status */}
          <div className="flex items-center justify-between px-2 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              {wsConnected ? (
                <Wifi className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-amber-500" />
              )}
              {wsConnected ? 'WebSocket Live' : 'Reconnecting'}
            </span>
            <span className="font-mono">
              {currentUserAccount.profile.kycStatus === 'verified' ? 'KYC Verified' : 'KYC Pending'}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb Left — Theme & Primary Action Right */}
        <header className="h-14 px-4 lg:px-6 bg-white dark:bg-[#111723] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-8 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md cursor-pointer"
            >
              <Menu className="w-4 h-4" />
            </button>
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">
              Meridian Trade / <span className="text-slate-900 dark:text-white font-semibold">{activeBreadcrumb}</span>
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setIsDark((d) => !d)}
              aria-label={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
              className="p-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => {
                if (activeTab === 'wallet') {
                  requireMfa(() => {});
                } else {
                  setActiveTab('wallet');
                }
              }}
              className="px-3.5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {activeTab === 'wallet' ? 'Verify MFA Session' : 'Deposit Funds'}
            </button>
          </div>
        </header>

        {/* Active Workspace Viewport */}
        <main className="flex-1 p-4 lg:p-6 max-w-[1600px] w-full mx-auto">
          {snapshot.circuitBreakerActive && (
            <div className="mb-4 px-4 py-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-between gap-3 text-xs text-amber-800 dark:text-amber-300">
              <span className="flex items-center gap-2 font-medium">
                <Activity className="w-4 h-4 shrink-0" />
                Safety Circuit Breaker Active: Market order matching is paused and pending orders reverted safely per SRS Section 5.2.
              </span>
              <button
                type="button"
                onClick={() => setActiveTab('compliance')}
                className="font-semibold underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                Manage Safety Controls
              </button>
            </div>
          )}

          {activeTab === 'terminal' && (
            <TradingTerminalView
              instruments={snapshot.instruments}
              selectedSymbol={selectedSymbol}
              onSelectSymbol={setSelectedSymbol}
              recentTrades={snapshot.recentTrades}
              userAccount={currentUserAccount}
              orders={snapshot.orders}
              receipts={snapshot.receipts}
              circuitBreakerActive={snapshot.circuitBreakerActive}
              isDark={isDark}
              onOrderCancelled={() => {}}
              onSelectReceipt={(r) => setInspectedReceipt(r)}
            />
          )}

          {activeTab === 'wallet' && (
            <PortfolioWalletView
              userAccount={currentUserAccount}
              instruments={snapshot.instruments}
              fxRates={snapshot.fxRates}
              transactions={snapshot.walletTransactions}
              onRequireMfa={requireMfa}
            />
          )}

          {activeTab === 'compliance' && (
            <ComplianceAuditView
              userAccount={currentUserAccount}
              kycApplications={snapshot.kycApplications}
              auditLog={snapshot.auditLog}
              circuitBreakerActive={snapshot.circuitBreakerActive}
              onRequireMfa={requireMfa}
            />
          )}

          {activeTab === 'api' && (
            <ApiDocsView
              userAccount={currentUserAccount}
              apiKeys={snapshot.apiKeys}
              onRequireMfa={requireMfa}
            />
          )}
        </main>
      </div>

      {/* Security & Receipt Modals */}
      <MfaModal
        open={mfaModalOpen}
        user={currentUserAccount.profile}
        onClose={() => {
          setMfaModalOpen(false);
          pendingMfaActionRef.current = null;
        }}
        onVerified={handleMfaComplete}
      />

      <ReceiptModal
        receipt={inspectedReceipt}
        onClose={() => setInspectedReceipt(null)}
      />
    </div>
  );
}
