'use client';

import { useState, type FormEvent } from 'react';
import {
  ArrowRight, Check, CircleAlert, ContactRound, Eye, EyeOff,
  Layers3, LoaderCircle, LockKeyhole, Mail, ShieldCheck, Sparkles, UserRound,
} from 'lucide-react';

export interface Account { id: string; name: string; email: string; }
type Mode = 'login' | 'register';

/** Authentication presentation only. The existing API contract and validation stay intact. */
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

  const inputClass = 'h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-[#172238] placeholder:text-slate-400 shadow-sm shadow-slate-900/[0.02] outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 disabled:cursor-wait disabled:bg-slate-50';

  return (
    <main className="flex min-h-dvh flex-col bg-[#F4F7FB] text-[#172238] lg:h-dvh lg:min-h-[650px] lg:flex-row lg:overflow-hidden">
      {/* Compact brand panel: content is height-bounded on desktop. */}
      <aside className="relative hidden w-[46%] shrink-0 flex-col overflow-hidden bg-[#102349] px-9 py-7 text-white lg:flex xl:px-14 xl:py-9">
        <div className="pointer-events-none absolute inset-0 opacity-[0.07]" aria-hidden="true" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '25px 25px' }} />
        <div aria-hidden="true" className="pointer-events-none absolute -left-36 top-[35%] size-[360px] rounded-full bg-blue-500/25 blur-[100px]" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-32 bottom-0 size-[380px] rounded-full bg-cyan-400/15 blur-[110px]" />
        <div className="relative flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-[#2563EB] shadow-lg shadow-blue-950/20"><Layers3 aria-hidden="true" className="size-5" /></span>
          <span className="text-[23px] font-extrabold tracking-tight">Card<span className="text-[#71A8FF]">Flow</span></span>
        </div>

        <div className="relative my-auto mx-auto w-full max-w-[490px] py-6">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-blue-100">
            <Sparkles aria-hidden="true" className="size-3.5" /> Smart contact workspace
          </div>
          <h2 className="max-w-[480px] text-[clamp(2.5rem,3.1vw,3.8rem)] font-extrabold leading-[1.12] tracking-[-0.045em]">
            Every connection <span className="text-[#75AAFF]">starts here.</span>
          </h2>
          <p className="mt-4 max-w-[410px] text-[14px] leading-6 text-blue-100/75">
            Scan business cards, keep your contacts organized, and export when you need them.
          </p>
          {/* Deliberately modest product illustration so it never pushes the screen below the fold. */}
          <div className="relative mt-7 max-w-[410px] rounded-2xl border border-white/20 bg-white p-5 text-[#172238] shadow-[0_18px_45px_rgba(0,0,0,0.18)] 2xl:mt-9">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-600"><ContactRound className="size-5" aria-hidden="true" /></div>
                <div><p className="text-[13px] font-bold">Your contacts, organized</p><p className="text-[11px] text-slate-500">Smart digital directory</p></div>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">Ready</span>
            </div>
            <div className="mt-4 flex gap-3 border-t border-slate-100 pt-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500"><UserRound className="size-4" /></span>
              <div className="flex-1 space-y-2 pt-1"><div className="h-2 w-2/3 rounded-full bg-slate-300" /><div className="h-2 w-1/2 rounded-full bg-slate-100" /></div>
              <span className="mt-1 grid size-6 place-items-center rounded-full bg-emerald-50 text-emerald-600"><Check className="size-4" /></span>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-blue-100/75">
            <span className="flex items-center gap-1.5"><Check className="size-3.5 text-sky-300" /> AI scanning</span>
            <span className="flex items-center gap-1.5"><Check className="size-3.5 text-sky-300" /> Duplicate review</span>
            <span className="flex items-center gap-1.5"><Check className="size-3.5 text-sky-300" /> Easy exports</span>
          </div>
        </div>
        <p className="relative text-[11px] text-blue-100/45">© {new Date().getFullYear()} CardFlow</p>
      </aside>

      <section className="flex min-h-dvh min-w-0 flex-1 flex-col items-center justify-center px-4 py-6 sm:px-8 lg:min-h-0 lg:px-10 lg:py-5" aria-label="Account access">
        <div className="mb-5 flex w-full max-w-[430px] items-center gap-2.5 lg:hidden">
          <span className="grid size-10 place-items-center rounded-xl bg-[#2563EB] text-white shadow-sm"><Layers3 className="size-5" aria-hidden="true" /></span>
          <span className="text-[22px] font-extrabold tracking-tight">Card<span className="text-blue-600">Flow</span></span>
        </div>

        <div className="w-full max-w-[430px] rounded-[24px] border border-slate-200 bg-white px-6 py-6 shadow-[0_16px_55px_-25px_rgba(23,34,56,0.25)] sm:px-9 sm:py-7">
          <div className="mb-5 rounded-xl bg-slate-100 p-1" role="group" aria-label="Choose sign in or registration">
            <div className="grid grid-cols-2 gap-1">
              {(['login', 'register'] as const).map(value => (
                <button key={value} type="button" disabled={busy} onClick={() => changeMode(value)} aria-pressed={mode === value}
                  className={`h-9 rounded-lg text-[13px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-60 ${mode === value ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                  {value === 'login' ? 'Sign in' : 'Register'}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-5 text-center">
            <span className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-600"><ShieldCheck className="size-3.5" /> SECURE ACCOUNT ACCESS</span>
            <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.035em] sm:text-[31px]">{registering ? 'Create your account' : 'Welcome back'}<span className="text-blue-600">.</span></h1>
            <p className="mt-1.5 text-[13px] text-slate-500">{registering ? 'Start managing your contacts with CardFlow.' : 'Sign in to access your contact workspace.'}</p>
          </div>

          <form onSubmit={event => void submit(event)} className="space-y-3.5">
            {registering && (
              <div>
                <label htmlFor="auth-name" className="mb-1.5 block text-[12px] font-semibold text-slate-700">Full name</label>
                <div className="relative"><UserRound className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-slate-400" aria-hidden="true" />
                  <input id="auth-name" name="name" autoComplete="name" required minLength={2} maxLength={80} disabled={busy} value={name} onChange={event => setName(event.target.value)} placeholder="Your full name" className={inputClass} />
                </div>
              </div>
            )}
            <div>
              <label htmlFor="auth-email" className="mb-1.5 block text-[12px] font-semibold text-slate-700">Email address</label>
              <div className="relative"><Mail className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-slate-400" aria-hidden="true" />
                <input id="auth-email" name="email" type="email" autoComplete="email" required disabled={busy} value={email} onChange={event => setEmail(event.target.value)} placeholder="name@company.com" className={inputClass} />
              </div>
            </div>
            <div>
              <label htmlFor="auth-password" className="mb-1.5 block text-[12px] font-semibold text-slate-700">Password</label>
              <div className="relative"><LockKeyhole className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-slate-400" aria-hidden="true" />
                <input id="auth-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={registering ? 'new-password' : 'current-password'} required minLength={registering ? 12 : 1} maxLength={128} disabled={busy} value={password} onChange={event => setPassword(event.target.value)} placeholder={registering ? 'Create a strong password' : 'Enter your password'} className={`${inputClass} pr-11`} />
                <button type="button" disabled={busy} onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} className="absolute right-2 top-1.5 grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50">
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {registering && <p className="mt-1.5 text-[11px] text-slate-500">Use at least 12 characters.</p>}
            </div>

            {error && (
              <div role="alert" aria-live="polite" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs leading-5 text-rose-700">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>{error}</span>
              </div>
            )}
            <button type="submit" disabled={busy} className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 text-[13px] font-bold text-white shadow-[0_8px_20px_-8px_rgba(37,99,235,0.7)] transition hover:bg-[#1D4ED8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-60">
              {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
              {busy ? (registering ? 'Creating account…' : 'Signing in…') : registering ? 'Create account' : 'Sign in'}
              {!busy && <ArrowRight className="size-4" aria-hidden="true" />}
            </button>
          </form>
          <p className="mt-4 text-center text-[11px] text-slate-400">Your contact workspace, securely accessible.</p>
        </div>
        <p className="mt-4 text-center text-[11px] text-slate-400 lg:hidden">© {new Date().getFullYear()} CardFlow</p>
      </section>
    </main>
  );
}
