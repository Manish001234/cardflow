'use client';

import { useState, type FormEvent } from 'react';
import {
  ArrowRight, Check, CircleAlert, Eye, EyeOff, Layers3, LoaderCircle,
  LockKeyhole, Mail, ScanLine, ShieldCheck, Sparkles, UserRound,
} from 'lucide-react';

export interface Account { id: string; name: string; email: string; }
type Mode = 'login' | 'register';

export function AuthGate({ onAuthenticated }: { onAuthenticated: (user: Account) => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const registering = mode === 'register';

  function changeMode(next: Mode) {
    if (busy || next === mode) return;
    setMode(next);
    setError('');
    setPassword('');
    setShowPassword(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ...(registering ? { name } : {}), email, password }),
      });
      const result = await response.json() as { user?: Account; error?: string };
      if (!response.ok || !result.user) throw new Error(result.error || 'The request could not be completed. Please try again.');
      onAuthenticated(result.user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to continue. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const inputClass = 'block h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-[14px] text-slate-900 shadow-sm shadow-slate-900/[0.02] placeholder:text-slate-400 transition-colors hover:border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10 disabled:cursor-wait disabled:bg-slate-50';

  return (
    <main className="min-h-screen bg-[#F4F7FB] text-[#172238] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(480px,0.94fr)]">
      {/* Brand experience: static illustration, no external images or network requests. */}
      <aside className="relative isolate hidden min-h-screen overflow-hidden bg-[#10264F] px-10 py-9 text-white lg:flex lg:flex-col xl:px-16 xl:py-12">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-36 -top-44 size-[520px] rounded-full bg-blue-500/15 blur-3xl" />
          <div className="absolute -bottom-52 -right-44 size-[660px] rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '26px 26px' }} />
        </div>

        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-[14px] border border-white/20 bg-blue-500 text-white shadow-lg shadow-blue-950/20"><Layers3 aria-hidden="true" className="size-[23px]" /></span>
          <div className="text-[24px] font-extrabold tracking-tight">Card<span className="text-[#63A3FF]">Flow</span></div>
        </div>

        <div className="mx-auto flex w-full max-w-[540px] flex-1 flex-col justify-center py-14">
          <div className="mb-7 inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] px-3.5 py-2 text-[11px] font-semibold tracking-[0.13em] text-blue-100 uppercase">
            <Sparkles aria-hidden="true" className="size-3.5 text-[#8CC4FF]" /> Intelligent contact workspace
          </div>
          <h2 className="max-w-[520px] text-[clamp(2.6rem,3.7vw,4.3rem)] font-extrabold leading-[1.12] tracking-[-0.05em]">
            Every connection <span className="text-[#78B3FF]">starts here.</span>
          </h2>
          <p className="mt-6 max-w-[435px] text-[16px] leading-7 text-blue-100/75">
            Turn business cards into an organized contact directory with AI-powered scanning, verification, and easy exports.
          </p>

          <div className="relative mx-auto mt-12 w-full max-w-[455px]" aria-hidden="true">
            <div className="absolute inset-x-8 top-5 h-52 rotate-[7deg] rounded-3xl border border-white/10 bg-white/10" />
            <div className="relative overflow-hidden rounded-[22px] border border-white/25 bg-white p-6 text-slate-900 shadow-[0_26px_80px_rgba(0,0,0,0.25)] sm:p-7">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-xl bg-blue-600 text-white"><Layers3 className="size-6" /></span>
                  <div><div className="text-[12px] font-bold tracking-[0.15em] text-blue-600">YOUR NETWORK</div><div className="mt-0.5 text-[11px] text-slate-400">Digital contact</div></div>
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">Extracted</span>
              </div>
              <div className="mt-8 h-4 w-[56%] rounded-md bg-slate-900/85" />
              <div className="mt-3 h-2.5 w-[40%] rounded bg-slate-200" />
              <div className="mt-7 space-y-3 border-t border-slate-100 pt-5">
                <div className="flex items-center gap-3"><Mail className="size-4 text-blue-500" /><div className="h-2.5 w-[62%] rounded bg-slate-200" /></div>
                <div className="flex items-center gap-3"><ScanLine className="size-4 text-blue-500" /><div className="h-2.5 w-[46%] rounded bg-slate-200" /></div>
              </div>
            </div>
            <div className="absolute -bottom-6 -right-3 flex items-center gap-2.5 rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-slate-900 shadow-xl shadow-blue-950/15 sm:-right-8">
              <span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><Check className="size-5" /></span>
              <div><div className="text-[12px] font-bold">Ready to connect</div><div className="text-[11px] text-slate-500">Contact saved securely</div></div>
            </div>
          </div>

          <div className="mt-16 grid grid-cols-3 gap-3 text-[12px] font-medium text-blue-100/80">
            <span className="flex items-center gap-2"><Check className="size-4 text-sky-300" /> AI scanning</span>
            <span className="flex items-center gap-2"><Check className="size-4 text-sky-300" /> Contact review</span>
            <span className="flex items-center gap-2"><Check className="size-4 text-sky-300" /> Excel exports</span>
          </div>
        </div>
        <div className="text-[12px] text-blue-100/50">© {new Date().getFullYear()} CardFlow</div>
      </aside>

      <section className="flex min-h-screen flex-col px-5 py-7 sm:px-10 lg:px-12 lg:py-10 xl:px-20" aria-label="Account access">
        <header className="flex items-center justify-between gap-4 lg:justify-end">
          <div className="flex items-center gap-2.5 lg:hidden">
            <span className="grid size-10 place-items-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-600/15"><Layers3 className="size-5" /></span>
            <span className="text-[21px] font-extrabold tracking-tight">Card<span className="text-blue-600">Flow</span></span>
          </div>
          <div className="flex items-center gap-2 text-[13px] text-slate-500">
            <span className="hidden sm:inline">{registering ? 'Already have an account?' : 'New to CardFlow?'}</span>
            <button type="button" onClick={() => changeMode(registering ? 'login' : 'register')} disabled={busy} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-bold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50">
              {registering ? 'Sign in' : 'Create account'}
            </button>
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center py-12 sm:py-16">
          <div className="mb-9">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-[11px] font-bold tracking-wide text-blue-700">
              <ShieldCheck className="size-3.5" /> SECURE ACCOUNT ACCESS
            </div>
            <h1 className="text-[32px] font-extrabold leading-tight tracking-[-0.035em] text-[#172238] sm:text-[39px]">
              {registering ? 'Create your account' : 'Welcome back'}<span className="text-blue-600">.</span>
            </h1>
            <p className="mt-3 text-[15px] leading-6 text-slate-500">
              {registering ? 'A smarter way to scan, organize, and manage your contacts.' : 'Sign in to pick up right where you left off.'}
            </p>
          </div>

          <form onSubmit={event => void submit(event)} className="space-y-5">
            {registering && (
              <div>
                <label className="mb-2 block text-[13px] font-semibold text-slate-700" htmlFor="auth-name">Full name</label>
                <div className="relative"><UserRound aria-hidden="true" className="pointer-events-none absolute left-3.5 top-4 size-4 text-slate-400" />
                  <input id="auth-name" name="name" autoComplete="name" required minLength={2} maxLength={80} disabled={busy} value={name} onChange={event => setName(event.target.value)} placeholder="Your full name" className={inputClass} />
                </div>
              </div>
            )}
            <div>
              <label className="mb-2 block text-[13px] font-semibold text-slate-700" htmlFor="auth-email">Email address</label>
              <div className="relative"><Mail aria-hidden="true" className="pointer-events-none absolute left-3.5 top-4 size-4 text-slate-400" />
                <input id="auth-email" name="email" type="email" autoComplete="email" required disabled={busy} value={email} onChange={event => setEmail(event.target.value)} placeholder="name@company.com" className={inputClass} />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-[13px] font-semibold text-slate-700" htmlFor="auth-password">Password</label>
              <div className="relative"><LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-3.5 top-4 size-4 text-slate-400" />
                <input id="auth-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={registering ? 'new-password' : 'current-password'} required minLength={registering ? 12 : 1} maxLength={128} disabled={busy} value={password} onChange={event => setPassword(event.target.value)} placeholder={registering ? 'Create a strong password' : 'Enter your password'} className={`${inputClass} pr-12`} />
                <button type="button" onClick={() => setShowPassword(value => !value)} disabled={busy} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} className="absolute right-2 top-2 grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50">{showPassword ? <EyeOff className="size-[17px]" /> : <Eye className="size-[17px]" />}</button>
              </div>
              {registering && <p className="mt-2 text-xs leading-5 text-slate-500">Use at least 12 characters to protect your account.</p>}
            </div>

            {error && (
              <div role="alert" aria-live="polite" className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-[13px] leading-5 text-rose-700">
                <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <button type="submit" disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-5 text-[14px] font-bold text-white shadow-[0_8px_20px_-8px_rgba(37,99,235,0.75)] transition hover:bg-[#1D4ED8] hover:shadow-[0_10px_23px_-8px_rgba(37,99,235,0.8)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-65">
              {busy ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}
              {busy ? (registering ? 'Creating account…' : 'Signing in…') : registering ? 'Create account' : 'Sign in to CardFlow'}
              {!busy && <ArrowRight aria-hidden="true" className="size-4" />}
            </button>
          </form>

          <div className="mt-8 flex items-center gap-2 text-[13px] text-slate-500">
            <div className="h-px flex-1 bg-slate-200" />
            <span>{registering ? 'Have an account?' : 'Don’t have an account?'}</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <button type="button" disabled={busy} onClick={() => changeMode(registering ? 'login' : 'register')} className="mt-4 h-11 w-full rounded-xl border border-slate-200 bg-white text-[13px] font-bold text-blue-600 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50">
            {registering ? 'Back to sign in' : 'Create a new account'}
          </button>
        </div>

        <footer className="mx-auto flex w-full max-w-[440px] flex-wrap items-center justify-center gap-2 pb-3 text-center text-[12px] text-slate-400 lg:justify-between">
          <span>© {new Date().getFullYear()} CardFlow</span>
          <span className="hidden text-slate-300 lg:inline">•</span>
          <span>Smart contact management</span>
        </footer>
      </section>
    </main>
  );
}
