'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Zap } from 'lucide-react';
import { Card }        from '@/components/ui/card';
import { Input }       from '@/components/ui/input';
import { Button }      from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';
import { useAuth }     from '@/lib/auth-context';

function validateForm(email: string, password: string, confirm: string): string {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address.';
  if (password.length < 8)                         return 'Password must be at least 8 characters.';
  if (password !== confirm)                         return 'Passwords do not match.';
  return '';
}

export default function SignupPage() {
  const { signup } = useAuth();

  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const validationError = validateForm(email, password, confirm);
    if (validationError) { setError(validationError); return; }

    setError('');
    setLoading(true);
    try {
      await signup(email, password, name.trim() || undefined);
      // redirect is handled inside signup() based on user role
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Account creation failed. Please try again.');
      setLoading(false);
    }
  }

  function clearError() { setError(''); }

  return (
    <Card className="relative z-10 w-full max-w-sm">
      <div className="space-y-6">

        {/* Brand */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Zap size={20} className="text-accent" fill="currentColor" />
            <span className="text-xl font-bold tracking-tight text-text-primary">FlashEngine</span>
          </div>
          <p className="text-sm text-text-secondary">
            Protect your flash sales from crashes
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Input
            label="Name (optional)"
            type="text"
            placeholder="Jane Smith"
            autoComplete="name"
            value={name}
            onChange={e => { setName(e.target.value); clearError(); }}
          />
          <Input
            label="Email"
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            value={email}
            onChange={e => { setEmail(e.target.value); clearError(); }}
            required
          />
          <Input
            label="Password"
            type="password"
            placeholder="Min. 8 characters"
            autoComplete="new-password"
            value={password}
            onChange={e => { setPassword(e.target.value); clearError(); }}
            required
          />
          <Input
            label="Confirm password"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            value={confirm}
            onChange={e => { setConfirm(e.target.value); clearError(); }}
            required
          />

          {error && <ErrorBanner message={error} />}

          <Button type="submit" loading={loading} className="w-full">
            Create account
          </Button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border-subtle" />
          <span className="text-xs text-text-tertiary">or</span>
          <div className="h-px flex-1 bg-border-subtle" />
        </div>

        <p className="text-center text-sm text-text-secondary">
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-medium text-accent transition-colors hover:text-accent-hover"
          >
            Sign in
          </Link>
        </p>

      </div>
    </Card>
  );
}
