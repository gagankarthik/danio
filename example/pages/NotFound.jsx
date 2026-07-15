import { useLocation, Link } from 'danio'

export function NotFound() {
  const { pathname } = useLocation()

  return (
    <section>
      <h1>404</h1>
      <p className="muted">
        Nothing routed for <code>{pathname}</code>.
      </p>
      <Link to="/" className="cta">
        ← Home
      </Link>
    </section>
  )
}
