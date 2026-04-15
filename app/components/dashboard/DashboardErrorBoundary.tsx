"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode };
type State = { hasError: boolean; message: string };

export default class DashboardErrorBoundary extends Component<
  Props,
  State
> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(err: Error): State {
    return {
      hasError: true,
      message: err.message || "Something went wrong",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[DashboardErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card my-6 border-destructive/40 p-6">
          <h2 className="text-lg font-semibold text-destructive">
            This section crashed
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {this.state.message}
          </p>
          <Button
            type="button"
            className="mt-4"
            onClick={() => window.location.reload()}
          >
            Reload page
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
