export function SiteNav() {
  return (
    <nav className="nav" aria-label="Primary">
      <div className="nav__start">
        <a href="/" className="nav__logo">
          <img
            className="nav__logo-img brand-logo"
            src="/assets/logo.png"
            width={220}
            height={90}
            alt="www.serviceopera.to"
            decoding="async"
          />
        </a>
      </div>
      <div className="nav__links">
        <a href="/pricing" className="nav__text">
          Pricing
        </a>
        <a
          href="/login.html"
          className="nav__login"
          id="navPortalAuth"
          aria-label="Login or Register"
        >
          Login / Register
        </a>
        <button type="button" className="theme-toggle" data-theme-toggle aria-label="Theme" />
      </div>
    </nav>
  );
}
