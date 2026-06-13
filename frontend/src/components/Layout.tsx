import { Outlet, Link, NavLink } from 'react-router-dom';

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 bg-ep-cream/95 backdrop-blur-sm border-b border-ep-silver/20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="font-heading font-extrabold tracking-[0.04em] text-ep-green uppercase text-sm">
              Electric Phactory
            </span>
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <NavLink to="/" end className={({ isActive }) => isActive ? 'text-ep-orange font-medium' : 'text-ep-green/60 hover:text-ep-green transition-colors'}>
              Active
            </NavLink>
            <NavLink to="/history" className={({ isActive }) => isActive ? 'text-ep-orange font-medium' : 'text-ep-green/60 hover:text-ep-green transition-colors'}>
              History
            </NavLink>
            <NavLink to="/players" className={({ isActive }) => isActive ? 'text-ep-orange font-medium' : 'text-ep-green/60 hover:text-ep-green transition-colors'}>
              Players
            </NavLink>
            <NavLink to="/score" className={({ isActive }) => isActive ? 'bg-ep-orange text-ep-cream px-2.5 py-1 rounded-full text-xs font-medium' : 'bg-ep-green/10 hover:bg-ep-green/20 text-ep-green text-xs px-2.5 py-1 rounded-full transition-colors'}>
              Score
            </NavLink>
            <a href="https://admin.golf.caseyhunter.net" className="text-ep-green/40 hover:text-ep-green/70 text-xs border border-ep-silver/40 px-2.5 py-1 rounded-full transition-colors">
              Admin
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-ep-deep text-ep-cream/60 text-xs text-center py-6 mt-12">
        Electric Phactory
      </footer>
    </div>
  );
}
