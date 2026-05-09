'use client';

import { ShieldOff } from 'lucide-react';
import { Button }   from '@/components/ui/button';
import { useAuth }  from '@/lib/auth-context';

export default function SuspendedPage() {
  const { logout } = useAuth();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-4 text-center">
      <ShieldOff size={36} className="text-text-tertiary" />
      <div className="space-y-1.5">
        <p className="text-base font-semibold text-text-primary">Account suspended</p>
        <p className="max-w-xs text-sm text-text-secondary">
          Your account has been suspended. Please contact support for assistance.
        </p>
      </div>
      <Button variant="secondary" onClick={logout}>
        Log out
      </Button>
    </div>
  );
}
