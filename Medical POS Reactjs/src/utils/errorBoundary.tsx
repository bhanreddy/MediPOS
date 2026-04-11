import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * PHASE 10: GLOBAL ERROR BOUNDARY
 * Prevents "White Screen of Death" by catching React rendering errors.
 */
export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        // LOG TO LOCAL AUDIT/DIAGNOSTICS
        console.error("Uncaught error:", error, errorInfo);
        // In a future phase, we could log this to a special 'diagnostic_logs' table in Dexie
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    padding: '40px',
                    textAlign: 'center',
                    fontFamily: 'sans-serif',
                    background: '#fff0f0',
                    height: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center'
                }}>
                    <h1 style={{ color: '#d32f2f' }}>Something went wrong.</h1>
                    <p>The application encountered an unexpected error.</p>
                    <div style={{
                        margin: '20px auto',
                        padding: '15px',
                        background: '#f8d7da',
                        borderRadius: '4px',
                        maxWidth: '600px',
                        textAlign: 'left',
                        fontSize: '14px',
                        overflow: 'auto'
                    }}>
                        <code>{this.state.error?.toString()}</code>
                    </div>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            padding: '10px 20px',
                            background: '#d32f2f',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '16px'
                        }}
                    >
                        Reload Application
                    </button>
                    <p style={{ marginTop: '20px', fontSize: '12px', color: '#666' }}>
                        Data in your local database is likely safe. This error occurred in the user interface.
                    </p>
                </div>
            );
        }

        return this.props.children;
    }
}
