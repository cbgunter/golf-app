import { Outlet, Link, NavLink } from 'react-router-dom';

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-fairway-700 text-white shadow-md">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-2xl">⛳</span>
            <span className="text-lg font-semibold tracking-tight">Golf Trips</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm font-medium">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                isActive ? 'text-gold-300' : 'text-white/80 hover:text-white transition-colors'
              }
            >
              Active
            </NavLink>
            <NavLink
              to="/history"
              className={({ isActive }) =>
                isActive ? 'text-gold-300' : 'text-white/80 hover:text-white transition-colors'
              }
            >
              History
            </NavLink>
            <Link
              to="/admin"
              className="text-white/60 hover:text-white/90 text-xs border border-white/20 px-3 py-1 rounded-full transition-colors"
            >
              Admin
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-fairway-900 text-white/50 text-xs text-center py-4 mt-8">
        Golf Trips — Personal Tournament Tracker
      </footer>
    </div>
  );
}
