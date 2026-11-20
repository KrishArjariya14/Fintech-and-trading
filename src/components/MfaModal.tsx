import React, { useState } from 'react';
import { Fingerprint, KeyRound, ShieldCheck, X } from 'lucide-react';
import type { UserProfile } from '../types/trading';

interface MfaModalProps {
  open: boolean;
  user: UserProfile;
  onClose: () => void;
  onVerified: () => void;
}

export const MfaModal: React.FC<MfaModalProps> = ({ open, user, onClose, onVerified }) => {
  const [method, setMethod] = useState<'Biometric Passkey' | 'FIDO2 Hardware Key' | 'Authenticator TOTP'>(
    user.mfaMethod
  );
  const [totpCode, setTotpCode] = useState('482910');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (method === 'Authenticator TOTP' && !/^\d{6}$/.test(totpCode.trim())) {
      setError('Enter a valid 6-digit authenticator code.');
      return;
    }

    setVerifying(true);
    try {
      const res = await fetch('/api/auth/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, method }),
      });
      if (!res.ok) {
        setError('MFA verification failed.');
        return;
      }
      onVerified();
    } catch {
      setError('Unable to reach authentication service.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mfa-modal-title"
        className="w-full max-w-md bg-white dark:bg-[#111723] border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <h3 id="mfa-modal-title" className="text-sm font-display font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            Multi-Factor Security Challenge
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close MFA modal"
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleVerify} className="p-5 flex flex-col gap-4">
          <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Authorizing security-sensitive action for <span className="font-semibold text-slate-900 dark:text-white">{user.name}</span>. Every MFA authorization is recorded in the immutable audit ledger.
          </div>

          <div className="grid grid-cols-1 gap-2">
            {(
              [
                {
                  id: 'Biometric Passkey',
                  desc: 'Face ID / Fingerprint WebAuthn Sensor',
                  icon: Fingerprint,
                },
                {
                  id: 'FIDO2 Hardware Key',
                  desc: 'YubiKey / USB-C Security Token',
                  icon: KeyRound,
                },
                {
                  id: 'Authenticator TOTP',
                  desc: '6-digit Time-based One-Time Password',
                  icon: ShieldCheck,
                },
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              const selected = method === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setMethod(opt.id)}
                  className={`flex items-center gap-3 p-3 text-left rounded-md border transition-colors cursor-pointer ${
                    selected
                      ? 'border-blue-500 bg-blue-500/8'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/60'
                  }`}
                >
                  <Icon className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">
                      {opt.id}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {opt.desc}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {method === 'Authenticator TOTP' && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                6-Digit Verification Code
              </label>
              <input
                type="text"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                className="px-3 py-2 text-sm font-mono tracking-widest bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
              />
            </div>
          )}

          {error && (
            <div className="text-xs px-3 py-2 bg-rose-500/10 border border-rose-500/30 rounded-md text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={verifying}
              className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors cursor-pointer disabled:opacity-50"
            >
              {verifying ? 'Verifying...' : 'Confirm MFA Challenge'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
