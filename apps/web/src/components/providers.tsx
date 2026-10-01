'use client';

import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { useAuthStore } from '@/features/auth/auth-store';
import { ThemeProvider } from '@/components/theme-provider';
import { ColorPaletteApplier } from '@/components/shared/color-palette-applier';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

/**
 * Sparse, dismissible error surface. Routine success is silent via `@/lib/notify`.
 */
function ThemedToaster() {
  return (
    <Toaster
      position="top-center"
      theme="light"
      richColors
      closeButton
      expand={false}
      visibleToasts={3}
      gap={10}
      offset={16}
      toastOptions={{
        classNames: {
          toast:
            'group toast border shadow-lg !rounded-xl !text-[13.5px] !font-medium',
          title: '!font-semibold !tracking-tight',
          description: '!text-[12.5px] !opacity-90',
          error: '!border-red-200/80',
          warning: '!border-amber-200/80',
          success: '!border-teal-200/80',
          closeButton: '!bg-white !border-border',
        },
      }}
    />
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ColorPaletteApplier />
        {children}
        <ThemedToaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
