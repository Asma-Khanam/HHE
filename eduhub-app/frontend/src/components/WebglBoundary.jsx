import { Component } from "react";

// WebGL/three.js can throw for reasons that have nothing to do with our code
// (old browser, GPU blocklist, WebGL disabled). Catch that and show whatever
// fallback was passed in instead of taking the whole page down with it.
export default class WebglBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.warn("3D logo failed to render, falling back to flat logo:", error);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}
