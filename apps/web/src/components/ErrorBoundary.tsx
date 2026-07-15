import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly hasError: boolean;
}

/**
 * Application-level error boundary. It catches render-time errors thrown by the
 * React tree below it and shows an accessible fallback instead of an unmounted,
 * blank page. A later phase can forward captured errors to a monitoring
 * backend; for now the browser console is the single diagnostic sink.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Unhandled error caught by ErrorBoundary:', error, errorInfo);
  }

  private readonly handleReset = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div role="alert" className="app-error">
          <h1>Something went wrong</h1>
          <p>
            An unexpected error occurred while displaying this page. You can try again; if the
            problem continues, reload the page.
          </p>
          <button type="button" onClick={this.handleReset}>
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
