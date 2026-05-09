'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Zap } from 'lucide-react';
import { Card }        from '@/components/ui/card';
import { Input }       from '@/components/ui/input';
import { Button }      from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';
import { useAuth }     from '@/lib/auth-context';

export default function LoginPage() {
  const { login } = useAuth();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      // redirect is handled inside login() based on user role
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed. Please try again.');
      setLoading(false);
    }
  }

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
            label="Email"
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />

          {error && <ErrorBanner message={error} />}

          <Button type="submit" loading={loading} className="w-full">
            Sign in
          </Button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border-subtle" />
          <span className="text-xs text-text-tertiary">or</span>
          <div className="h-px flex-1 bg-border-subtle" />
        </div>

        <p className="text-center text-sm text-text-secondary">
          Don&apos;t have an account?{' '}
          <Link
            href="/signup"
            className="font-medium text-accent transition-colors hover:text-accent-hover"
          >
            Sign up
          </Link>
        </p>

      </div>
    </Card>
  );
}
