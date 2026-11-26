import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

/**
 * Top-level error boundary preventing uncaught rendering errors from leaving
 * an unrecoverable blank viewport.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  public override state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected rendering error occurred.',
    };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Uncaught application error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
          <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-card p-6">
            <div className="space-y-1">
              <h1 className="text-base font-semibold">
                Something went wrong
              </h1>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {this.state.errorMessage}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={this.handleReload}>
              Reload workspace
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
