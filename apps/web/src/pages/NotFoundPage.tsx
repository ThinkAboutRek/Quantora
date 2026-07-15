import { Link } from 'react-router';

/** Catch-all page shown for any route that does not exist. */
export function NotFoundPage() {
  return (
    <section className="not-found" aria-labelledby="not-found-heading">
      <h1 id="not-found-heading">Page not found</h1>
      <p>The page you are looking for does not exist.</p>
      <p>
        <Link to="/">Return to the home page</Link>
      </p>
    </section>
  );
}
