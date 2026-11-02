import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <div className="stack">
      <h1>Page not found</h1>
      <p>This page doesn't exist. <Link to="/">Go to your home page</Link>.</p>
    </div>
  );
}
