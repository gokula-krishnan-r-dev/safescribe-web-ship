'use client';

export function AuthPageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4 page-gradient">
      {children}
    </div>
  );
}
