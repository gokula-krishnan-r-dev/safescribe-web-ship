'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  stepLabel: string;
  children: ReactNode;
  onBack?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * Isolates a single wizard step crash so the shell (stepper, history) stays usable.
 */
export class StepErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ConsultationWizard] ${this.props.stepLabel} crashed:`, error, info.componentStack);
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.stepLabel !== this.props.stepLabel && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    const isDev = process.env.NODE_ENV === 'development';

    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-destructive/20 bg-destructive/5 px-6 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <div className="max-w-md space-y-1.5">
          <p className="text-base font-semibold text-foreground">
            This step could not be displayed
          </p>
          <p className="text-sm text-muted-foreground">
            Something went wrong loading <span className="font-medium text-foreground/80">{this.props.stepLabel}</span>.
            You can retry or go back — your consultation data is still saved.
          </p>
          {isDev && (
            <p className="mt-2 break-words rounded-lg bg-muted/60 px-3 py-2 text-left font-mono text-[11px] text-muted-foreground">
              {this.state.error.message}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </Button>
          {this.props.onBack && (
            <Button type="button" size="sm" variant="outline" onClick={this.props.onBack}>
              Go back
            </Button>
          )}
        </div>
      </div>
    );
  }
}
