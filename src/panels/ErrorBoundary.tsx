import React from "react";

interface Props { children: React.ReactNode; label: string; }
interface State { err?: string; }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = {};
  static getDerivedStateFromError(e: Error) { return { err: e.message }; }
  render() {
    if (this.state.err) {
      return (
        <div className="panel-page">
          <h2>{this.props.label} crashed</h2>
          <p className="sub">{this.state.err}</p>
          <button onClick={() => this.setState({ err: undefined })}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}
