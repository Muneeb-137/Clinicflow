import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

/*
 * Catches errors thrown while rendering so a bug on one
 * page shows a recoverable message instead of a blank
 * white screen. Details go to the browser console.
 */
class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(
    error: Error,
  ): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(
    error: Error,
    info: ErrorInfo,
  ) {
    console.error(
      "ClinicFlow page error:",
      error,
      info.componentStack,
    );
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-slate-950">
            Something went wrong
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-500">
            This page hit an unexpected error. Reloading
            usually fixes it. If it keeps happening, note
            what you were doing and let the team know.
          </p>

          <p className="mt-4 break-words rounded-xl bg-slate-50 px-3 py-2 font-mono text-xs text-slate-500">
            {this.state.error.message}
          </p>

          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-[#13B2B3] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#10999a]"
            >
              Reload page
            </button>

            <button
              type="button"
              onClick={() => {
                window.location.href = "/";
              }}
              className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
            >
              Go to home
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
