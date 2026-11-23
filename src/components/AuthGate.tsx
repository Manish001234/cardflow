'use client';

import { useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, Layers3, LoaderCircle, LockKeyhole, Mail, UserRound } from 'lucide-react';

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
    if (busy) return;
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
      if (!response.ok || !result.user) throw new Error(result.error || 'Could not sign in. Please try again.');
      onAuthenticated(result.user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to continue. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const inputClass = 'block h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50';
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F4F7FB] px-4 py-10 text-[#172238] sm:px-6">
      <div className="w-full max-w-[420px]">
        <header className="mb-8 flex items-center justify-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/15"><Layers3 className="size-6" /></span>
          <span className="text-2xl font-extrabold tracking-tight">Card<span className="text-blue-600">Flow</span></span>
        </header>

        <section className="rounded-[24px] border border-slate-200/90 bg-white px-6 py-8 shadow-[0_14px_48px_-25px_rgba(15,23,42,0.2)] sm:px-9 sm:py-9">
          <div className="mb-7 text-center">
            <h1 className="text-2xl font-extrabold tracking-tight">{registering ? 'Create your account' : 'Welcome back'}</h1>
            <p className="mt-2 text-sm text-slate-500">{registering ? 'Get started with your contact workspace.' : 'Sign in to your contact workspace.'}</p>
          </div>
          <form onSubmit={event => void submit(event)} className="space-y-4">
            {registering && <label className="block text-sm font-semibold text-slate-700" htmlFor="auth-name">Full name
              <span className="relative mt-1.5 block"><UserRound aria-hidden="true" className="absolute left-3 top-3.5 size-4 text-slate-400" />
                <input id="auth-name" name="name" autoComplete="name" required minLength={2} maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="Your name" className={inputClass} />
              </span>
            </label>}
            <label className="block text-sm font-semibold text-slate-700" htmlFor="auth-email">Email address
              <span className="relative mt-1.5 block"><Mail aria-hidden="true" className="absolute left-3 top-3.5 size-4 text-slate-400" />
                <input id="auth-email" name="email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@company.com" className={inputClass} />
              </span>
            </label>
            <label className="block text-sm font-semibold text-slate-700" htmlFor="auth-password">Password
              <span className="relative mt-1.5 block"><LockKeyhole aria-hidden="true" className="absolute left-3 top-3.5 size-4 text-slate-400" />
                <input id="auth-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={registering ? 'new-password' : 'current-password'} required minLength={registering ? 12 : 1} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} placeholder={registering ? 'At least 12 characters' : 'Enter your password'} className={`${inputClass} pr-11`} />
                <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} className="absolute right-2 top-1.5 grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
              </span>
            </label>
            {registering && <p className="text-xs leading-5 text-slate-500">Use 12 or more characters for a secure password.</p>}
            {error && <div role="alert" className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
            <button type="submit" disabled={busy} className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-60">{busy ? <LoaderCircle className="size-4 animate-spin" /> : null}{registering ? 'Create account' : 'Sign in'}{!busy && <ArrowRight className="size-4" />}</button>
          </form>
          <div className="mt-7 border-t border-slate-100 pt-6 text-center text-sm text-slate-500">
            {registering ? 'Already have an account?' : 'New to CardFlow?'}{' '}
            <button type="button" disabled={busy} onClick={() => changeMode(registering ? 'login' : 'register')} className="font-bold text-blue-600 hover:text-blue-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50">{registering ? 'Sign in' : 'Create an account'}</button>
          </div>
        </section>
        <p className="mt-6 text-center text-xs text-slate-400">CardFlow · Smart Contact Extraction</p>
      </div>
    </main>
  );
}
