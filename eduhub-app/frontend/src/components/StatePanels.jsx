import "./StatePanels.css";

// Friendly loading / error screens (Asma, 12 Oct 2026). Before this, a card
// whose data failed to load just vanished and a page that failed to load
// showed nothing at all, so families couldn't tell "nothing here" from
// "something went wrong". Same look everywhere, always with a way forward.

export function CardSkeleton({ title, rows = 2 }) {
  return (
    <section className="dash-card sp-card" aria-busy="true" aria-live="polite">
      <div className="dash-card-head">
        <h2>{title}</h2>
      </div>
      <div className="sp-skel">
        {Array.from({ length: rows }, (_, i) => (
          <span key={i} className="sp-skel-line" style={{ width: `${90 - i * 18}%` }} />
        ))}
      </div>
    </section>
  );
}

export function CardError({ title, message, onRetry }) {
  return (
    <section className="dash-card sp-card" role="status">
      <div className="dash-card-head">
        <h2>{title}</h2>
      </div>
      <div className="sp-notice">
        <span className="sp-icon" aria-hidden="true">!</span>
        <div className="sp-text">
          <strong>We couldn&rsquo;t load this just now</strong>
          <span>{message || "Your information is safe. Please try again in a moment."}</span>
        </div>
        {onRetry && (
          <button type="button" className="sp-btn" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </section>
  );
}

export function PageLoading({ label = "Loading…" }) {
  return (
    <div className="sp-page" aria-busy="true" aria-live="polite">
      <span className="sp-spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function PageError({ title = "We couldn’t load this page", message, onRetry }) {
  return (
    <div className="sp-page" role="alert">
      <span className="sp-icon sp-icon-lg" aria-hidden="true">!</span>
      <h2>{title}</h2>
      <p>{message || "Your information is safe. Check your connection and try again."}</p>
      <div className="sp-actions">
        {onRetry && (
          <button type="button" className="sp-btn sp-btn-primary" onClick={onRetry}>
            Try again
          </button>
        )}
        <button type="button" className="sp-btn" onClick={() => window.location.reload()}>
          Reload the page
        </button>
      </div>
      <small>If it keeps happening, tell your consultant and we&rsquo;ll look into it.</small>
    </div>
  );
}
