import React, { Component, ErrorInfo, ReactNode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            padding: 24,
            color: "#182230",
            backgroundColor: "#ffffff",
            textAlign: "center",
          }}
        >
          <h2 style={{ fontSize: "1.5rem", marginBottom: 12 }}>
            Something went wrong
          </h2>
          <p style={{ color: "#64748b", maxWidth: 480, marginBottom: 20 }}>
            {this.state.error?.message ||
              "An unexpected error occurred while loading the player."}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "none",
              backgroundColor: "#89abd2",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
