import React, { useState } from 'react';
import { BookOpen, Copy, FileText, KeyRound, Play, Trash2 } from 'lucide-react';
import type { ApiKeyRecord, UserAccountState } from '../types/trading';

interface ApiDocsViewProps {
  userAccount: UserAccountState;
  apiKeys: ApiKeyRecord[];
  onRequireMfa: (onVerified: () => void) => void;
}

const AVAILABLE_SCOPES = ['read:market', 'trade:execute', 'read:orders', 'read:audit'];

const TEST_ENDPOINTS = [
  { label: 'GET /api/market/BTC-USD', url: '/api/market/BTC-USD' },
  { label: 'GET /api/market/NVDA', url: '/api/market/NVDA' },
  { label: 'GET /api/openapi.json', url: '/api/openapi.json' },
  { label: 'GET /api/health', url: '/api/health' },
];

export const ApiDocsView: React.FC<ApiDocsViewProps> = ({
  userAccount,
  apiKeys,
  onRequireMfa,
}) => {
  const [label, setLabel] = useState('Algorithmic Execution Key');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['read:market', 'trade:execute']);
  const [newRawSecret, setNewRawSecret] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [selectedEndpoint, setSelectedEndpoint] = useState(TEST_ENDPOINTS[0].url);
  const [apiResponse, setApiResponse] = useState<string | null>(null);
  const [responseMs, setResponseMs] = useState<number | null>(null);
  const [runningTest, setRunningTest] = useState(false);

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const handleCreateKey = (e: React.FormEvent) => {
    e.preventDefault();
    setKeyError(null);
    setNewRawSecret(null);

    if (userAccount.profile.role === 'retail') {
      setKeyError('API key provisioning is restricted to Institutional Trader and Compliance roles.');
      return;
    }

    onRequireMfa(async () => {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userAccount.profile.id,
          label,
          permissions: selectedScopes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setKeyError(data.error || 'Could not provision API key.');
        return;
      }
      setNewRawSecret(data.rawSecret);
    });
  };

  const handleRevokeKey = async (id: string) => {
    await fetch(`/api/keys/${id}?actorId=${encodeURIComponent(userAccount.profile.id)}`, {
      method: 'DELETE',
    });
  };

  const handleRunEndpoint = async () => {
    setRunningTest(true);
    const t0 = performance.now();
    try {
      const res = await fetch(selectedEndpoint);
      const data = await res.json();
      setResponseMs(Math.round(performance.now() - t0));
      setApiResponse(JSON.stringify(data, null, 2));
    } catch {
      setApiResponse('{"error": "Request failed"}');
    } finally {
      setRunningTest(false);
    }
  };

  const copySecret = () => {
    if (!newRawSecret) return;
    navigator.clipboard.writeText(newRawSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Institutional API Key Provisioning */}
        <div className="bg-white dark:bg-[#111723] border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col gap-4">
          <div>
            <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Institutional API Credentials
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Low-latency REST &amp; WebSocket credentials for Institutional Prime accounts (SRS 2.3).
            </p>
          </div>

          <form onSubmit={handleCreateKey} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Credential Label
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
                className="px-3 py-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {AVAILABLE_SCOPES.map((scope) => {
                const active = selectedScopes.includes(scope);
                return (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => toggleScope(scope)}
                    className={`px-2.5 py-1 text-xs font-mono rounded border transition-colors cursor-pointer ${
                      active
                        ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {scope}
                  </button>
                );
              })}
            </div>

            {keyError && (
              <div className="text-xs px-3 py-2 bg-rose-500/10 border border-rose-500/30 rounded-md text-rose-700 dark:text-rose-300">
                {keyError}
              </div>
            )}

            {newRawSecret && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-md space-y-1.5">
                <div className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                  One-Time API Secret Generated
                </div>
                <div className="flex items-center justify-between gap-2">
                  <code className="text-xs font-mono text-slate-900 dark:text-white break-all">
                    {newRawSecret}
                  </code>
                  <button
                    type="button"
                    onClick={copySecret}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shrink-0 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              className="py-2 px-4 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors cursor-pointer"
            >
              Provision API Key (MFA)
            </button>
          </form>

          <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2">
            {apiKeys.map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 dark:border-slate-800/60 last:border-b-0 text-xs"
              >
                <div>
                  <div className="font-medium text-slate-900 dark:text-white">{k.label}</div>
                  <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {k.prefix}... · {k.permissions.join(', ')}
                  </div>
                </div>
                {k.status === 'active' ? (
                  <button
                    type="button"
                    onClick={() => handleRevokeKey(k.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 rounded transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Revoke
                  </button>
                ) : (
                  <span className="text-slate-400 font-mono">Revoked</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Live Swagger / OpenAPI Interactive Explorer */}
        <div className="bg-white dark:bg-[#111723] border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                OpenAPI 3.1 Live Explorer
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Execute live REST requests against the Meridian Trade Express server (SRS 2.6).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedEndpoint}
              onChange={(e) => setSelectedEndpoint(e.target.value)}
              className="flex-1 px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
            >
              {TEST_ENDPOINTS.map((ep) => (
                <option key={ep.url} value={ep.url}>
                  {ep.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleRunEndpoint}
              disabled={runningTest}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              {runningTest ? 'Running...' : 'Execute'}
            </button>
          </div>

          <div className="flex-1 flex flex-col bg-slate-950 text-slate-100 rounded-md border border-slate-800 overflow-hidden min-h-[240px]">
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-[11px] font-mono text-slate-400">
              <span>Response Payload</span>
              {responseMs !== null && <span>{responseMs}ms roundtrip</span>}
            </div>
            <pre className="p-3 text-[11px] font-mono overflow-auto max-h-[280px] leading-relaxed">
              {apiResponse ?? '// Select an endpoint and click Execute to inspect live server output.'}
            </pre>
          </div>
        </div>
      </div>

      {/* SRS Architecture & Onboarding Reference */}
      <div className="bg-white dark:bg-[#111723] border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1 max-w-2xl">
          <h3 className="text-sm font-display font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            Software Requirements Specification (SRS v1.0) Alignment
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Built directly from the Fintech And Trading Platform SRS: WebSocket real-time streaming (&lt;200ms), multi-timeframe candlestick charts (1m, 5m, 1h, 1D), pre-trade balance verification (REQ-3), instant execution receipts (REQ-4), multi-currency Plaid/Stripe settlement, FIDO2/Biometric MFA, KYC/AML review queue, and SHA-256 immutable audit logging.
          </p>
        </div>

        <a
          href="/assets/aistudio/kunal_SRS_d6d923ea.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md text-slate-800 dark:text-slate-100 transition-colors whitespace-nowrap shrink-0"
        >
          Open Original SRS PDF
        </a>
      </div>
    </div>
  );
};
