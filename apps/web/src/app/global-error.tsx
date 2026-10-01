'use client';

import { AlertTriangle } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f8f8f8' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ textAlign: 'center', maxWidth: '28rem' }}>
            <div style={{ width: 80, height: 80, borderRadius: 16, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
              <AlertTriangle style={{ width: 40, height: 40, color: '#dc2626' }} />
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>SafeScribe could not start</h1>
            <p style={{ color: '#737373', marginTop: '0.5rem' }}>
              Something went wrong and the app could not recover. Please refresh the page and try again.
            </p>
            <button
              onClick={reset}
              style={{ marginTop: '2rem', padding: '0.625rem 1.25rem', background: '#6b2d3c', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500 }}
            >
              Try Again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
