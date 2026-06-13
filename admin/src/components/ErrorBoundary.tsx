import { Component, ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="max-w-2xl mx-auto px-4 py-16 text-center">
          <div className="text-4xl mb-4">⛳</div>
          <h2 className="text-xl font-bold text-ep-green mb-2">Something went wrong</h2>
          <p className="text-sm text-ep-silver mb-6">{this.state.error.message}</p>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            className="btn-primary"
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
