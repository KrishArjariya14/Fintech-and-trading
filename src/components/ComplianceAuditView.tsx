import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileCheck2,
  Search,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type { AuditLogEntry, KycApplication, UserAccountState } from '../types/trading';

interface ComplianceAuditViewProps {
  userAccount: UserAccountState;
  kycApplications: KycApplication[];
  auditLog: AuditLogEntry[];
  circuitBreakerActive: boolean;
  onRequireMfa: (onVerified: () => void) => void;
}

export const ComplianceAuditView: React.FC<ComplianceAuditViewProps> = ({
  userAccount,
  kycApplications,
  auditLog,
  circuitBreakerActive,
  onRequireMfa,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<'all' | AuditLogEntry['category']>('all');
  const [auditSearch, setAuditSearch] = useState('');
  const [kycFormOpen, setKycFormOpen] = useState(false);
  const [docType, setDocType] = useState('Passport + Biometric Liveness');
  const [jurisdiction, setJurisdiction] = useState('IN / Global Clearing');
  const [sourceOfFunds, setSourceOfFunds] = useState('Trading Capital & Equities');
  const [kycFeedback, setKycFeedback] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const isComplianceOfficer = userAccount.profile.role === 'compliance';

  const filteredAudit = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return auditLog.filter((entry) => {
      if (categoryFilter !== 'all' && entry.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        entry.action.toLowerCase().includes(q) ||
        entry.details.toLowerCase().includes(q) ||
        entry.actorName.toLowerCase().includes(q) ||
        entry.entryHash.toLowerCase().includes(q)
      );
    });
  }, [auditLog, categoryFilter, auditSearch]);

  const handleReviewKyc = (kycId: string, decision: 'verified' | 'rejected') => {
    if (!isComplianceOfficer) {
      setKycFeedback('Switch to Compliance Officer role in the sidebar to approve or reject KYC dossiers.');
      return;
    }
    onRequireMfa(async () => {
      setBusyId(kycId);
      setKycFeedback(null);
      try {
        const res = await fetch('/api/kyc/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kycId,
            decision,
            reviewerId: userAccount.profile.id,
            notes:
              decision === 'verified'
                ? 'Onfido & sanctions screening verified by Compliance.'
                : 'Additional source-of-funds documentation required.',
          }),
        });
        if (res.ok) {
          setKycFeedback(`Dossier ${kycId} marked as ${decision}.`);
        }
      } finally {
        setBusyId(null);
      }
    });
  };

  const handleSubmitKyc = async (e: React.FormEvent) => {
    e.preventDefault();
    setKycFeedback(null);
    const res = await fetch('/api/kyc/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: userAccount.profile.id,
        applicantName: userAccount.profile.name,
        email: userAccount.profile.email,
        documentType: docType,
        jurisdiction,
        sourceOfFunds,
      }),
    });
    if (res.ok) {
      setKycFormOpen(false);
      setKycFeedback('KYC dossier submitted to the Compliance verification queue.');
    }
  };

  const handleToggleCircuitBreaker = () => {
    onRequireMfa(async () => {
      await fetch('/api/safety/circuit-breaker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actorId: userAccount.profile.id,
          active: !circuitBreakerActive,
        }),
      });
    });
  };

  const exportAuditCsv = () => {
    const header = 'Sequence,ID,Timestamp,Actor,Role,Category,Action,Details,PrevHash,EntryHash\n';
    const rows = filteredAudit
      .map(
        (e) =>
          `${e.sequence},${e.id},${new Date(e.timestamp).toISOString()},"${e.actorName}",${e.actorRole},${e.category},"${e.action.replace(/"/g, '""')}","${e.details.replace(/"/g, '""')}",${e.prevHash},${e.entryHash}`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meridian-regulatory-audit-log.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Safety & Risk Controls Bar (SRS 5.2 & 5.3) */}
      <div className="bg-white dark:bg-[#111723] border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1 max-w-2xl">
          <div className="flex items-center gap-2 text-sm font-display font-semibold text-slate-900 dark:text-white">
            {circuitBreakerActive ? (
              <ShieldAlert className="w-4 h-4 text-amber-500" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            )}
            Safety Circuit Breaker &amp; Order Protection (SRS Section 5.2)
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            In the event of network disruption or volatility spikes, activating the circuit breaker halts incoming market orders and safely reverts resting pending orders to an unfulfilled state with reserved funds released.
          </p>
        </div>

        <button
          type="button"
          onClick={handleToggleCircuitBreaker}
          className={`px-4 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            circuitBreakerActive
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'bg-amber-600 hover:bg-amber-700 text-white'
          }`}
        >
          {circuitBreakerActive ? 'Resume Matching Engine' : 'Trigger Safety Halt (MFA)'}
        </button>
      </div>

      {/* KYC / AML Verification Queue */}
      <div className="bg-white dark:bg-[#111723] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-display font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              KYC / AML Identity Verification Queue
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Onfido &amp; sanctions screening pipeline · Current account status: <span className="font-medium text-slate-900 dark:text-slate-200">{userAccount.profile.kycStatus.replace('_', ' ')}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={() => setKycFormOpen((v) => !v)}
            className="px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
          >
            {kycFormOpen ? 'Close Intake Form' : 'Submit KYC Dossier'}
          </button>
        </div>

        {kycFormOpen && (
          <form
            onSubmit={handleSubmitKyc}
            className="p-4 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
          >
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Identity Document
              </label>
              <input
                type="text"
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                required
                className="px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Regulatory Jurisdiction
              </label>
              <input
                type="text"
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value)}
                required
                className="px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Source of Funds
              </label>
              <input
                type="text"
                value={sourceOfFunds}
                onChange={(e) => setSourceOfFunds(e.target.value)}
                required
                className="px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
              />
            </div>
            <button
              type="submit"
              className="py-2 px-4 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors cursor-pointer"
            >
              Submit for AML Screening
            </button>
          </form>
        )}

        {kycFeedback && (
          <div className="px-4 py-2 text-xs bg-blue-500/10 border-b border-blue-500/20 text-blue-700 dark:text-blue-300">
            {kycFeedback}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-4 font-medium">Dossier ID</th>
                <th className="py-2.5 px-4 font-medium">Applicant</th>
                <th className="py-2.5 px-4 font-medium">Document &amp; Jurisdiction</th>
                <th className="py-2.5 px-4 font-medium">Risk Rating</th>
                <th className="py-2.5 px-4 font-medium">Status</th>
                <th className="py-2.5 px-4 font-medium text-right">Compliance Action</th>
              </tr>
            </thead>
            <tbody>
              {kycApplications.map((app) => (
                <tr
                  key={app.id}
                  className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-900/40"
                >
                  <td className="py-2.5 px-4 font-mono text-slate-700 dark:text-slate-300">
                    {app.id}
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="font-medium text-slate-900 dark:text-white">{app.applicantName}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{app.email}</div>
                  </td>
                  <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300">
                    <div>{app.documentType}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {app.jurisdiction} · {app.sourceOfFunds}
                    </div>
                  </td>
                  <td className="py-2.5 px-4 font-medium text-slate-700 dark:text-slate-300">
                    {app.riskScore}
                  </td>
                  <td className="py-2.5 px-4">
                    {app.status === 'verified' ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Verified
                      </span>
                    ) : app.status === 'rejected' ? (
                      <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-medium">
                        <XCircle className="w-3.5 h-3.5" />
                        Rejected
                      </span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400 font-medium">
                        Pending Review
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    {app.status === 'pending_review' ? (
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          disabled={busyId === app.id}
                          onClick={() => handleReviewKyc(app.id, 'verified')}
                          className="px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 rounded transition-colors cursor-pointer"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={busyId === app.id}
                          onClick={() => handleReviewKyc(app.id, 'rejected')}
                          className="px-2.5 py-1 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 rounded transition-colors cursor-pointer"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {app.reviewedBy ? `By ${app.reviewedBy}` : 'Closed'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Immutable SHA-256 Hash-Chained Audit Log (SRS Section 5.3) */}
      <div className="bg-white dark:bg-[#111723] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="text-sm font-display font-semibold text-slate-900 dark:text-white">
              Immutable Hash-Chained Audit Ledger
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Every trade execution, wallet settlement, MFA challenge, and administrative change is SHA-256 chained.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="Search action or hash..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100"
              />
            </div>

            <button
              type="button"
              onClick={exportAuditCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export Audit CSV
            </button>
          </div>
        </div>

        <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-1">
          {(['all', 'order', 'wallet', 'auth', 'compliance', 'api', 'safety'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors capitalize cursor-pointer ${
                categoryFilter === cat
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto max-h-[420px]">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-4 font-medium">Seq / ID</th>
                <th className="py-2.5 px-4 font-medium">Actor</th>
                <th className="py-2.5 px-4 font-medium">Category</th>
                <th className="py-2.5 px-4 font-medium">Event &amp; Details</th>
                <th className="py-2.5 px-4 font-medium text-right">SHA-256 Chain</th>
                <th className="py-2.5 px-4 font-medium text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {filteredAudit.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-900/40"
                >
                  <td className="py-2.5 px-4 font-mono text-slate-600 dark:text-slate-400">
                    #{entry.sequence} · {entry.id}
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="font-medium text-slate-900 dark:text-white">{entry.actorName}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">
                      {entry.actorRole}
                    </div>
                  </td>
                  <td className="py-2.5 px-4 font-mono text-slate-700 dark:text-slate-300 capitalize">
                    {entry.category}
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="font-medium text-slate-900 dark:text-slate-100">{entry.action}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{entry.details}</div>
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {entry.entryHash.slice(0, 12)}...
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-slate-500 dark:text-slate-400">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
