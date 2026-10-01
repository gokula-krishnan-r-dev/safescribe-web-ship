'use client';

import { useEffect, useMemo, useState } from 'react';
import { Copy, KeyRound, RefreshCw } from 'lucide-react';
import { toast } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export type UserPasswordDialogMode = 'change' | 'reset';

function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

interface UserPasswordDialogProps {
  open: boolean;
  mode: UserPasswordDialogMode;
  userName: string;
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (password: string) => void;
}

export function UserPasswordDialog({
  open,
  mode,
  userName,
  loading,
  onOpenChange,
  onSubmit,
}: UserPasswordDialogProps) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  useEffect(() => {
    if (!open) return;
    if (mode === 'reset') {
      const next = generatePassword();
      setPassword(next);
      setConfirm(next);
    } else {
      setPassword('');
      setConfirm('');
    }
  }, [open, mode]);

  const mismatch = confirm.length > 0 && password !== confirm;
  const tooShort = password.length > 0 && password.length < 8;
  const canSubmit = password.length >= 8 && password === confirm && !loading;

  const copy = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      toast.success('Password copied', { announce: true });
    } catch {
      toast.error('Could not copy password');
    }
  };

  const title = mode === 'reset' ? 'Reset password' : 'Change password';
  const description = useMemo(
    () =>
      mode === 'reset'
        ? `Generate a new password for ${userName}. Share it with them securely — it will not be shown again.`
        : `Set a new password for ${userName}. They will use this the next time they sign in.`,
    [mode, userName],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <KeyRound className="h-4 w-4 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label htmlFor="user-new-password">New password</Label>
            <div className="flex gap-2">
              <Input
                id="user-new-password"
                type={mode === 'reset' ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="font-mono"
              />
              {mode === 'reset' ? (
                <>
                  <Button type="button" variant="outline" size="icon" onClick={copy} title="Copy">
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="Generate another"
                    onClick={() => {
                      const next = generatePassword();
                      setPassword(next);
                      setConfirm(next);
                    }}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </>
              ) : null}
            </div>
            {tooShort ? (
              <p className="text-xs text-destructive">Use at least 8 characters.</p>
            ) : (
              <p className="text-xs text-muted-foreground">Minimum 8 characters.</p>
            )}
          </div>

          {mode === 'change' ? (
            <div className="space-y-2">
              <Label htmlFor="user-confirm-password">Confirm password</Label>
              <Input
                id="user-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              {mismatch ? (
                <p className="text-xs text-destructive">Passwords do not match.</p>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={() => onSubmit(password)}>
            {mode === 'reset' ? 'Reset password' : 'Save password'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
