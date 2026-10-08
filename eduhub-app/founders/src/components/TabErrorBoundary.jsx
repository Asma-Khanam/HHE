import { Component } from "react";

// If one tab hits an unexpected error, show a small message in its place
// instead of turning the whole page blank.
export default class TabErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    console.error("Tab crashed:", error);
  }
  render() {
    if (this.state.error) {
      return (
        <section className="panel">
          <div className="hh-form-banner hh-form-banner-error">
            Something went wrong loading this tab. Refresh the page and try again. If it keeps happening, tell Asma
            and mention: {String(this.state.error?.message || this.state.error)}
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}
