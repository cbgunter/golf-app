import { Outlet, Link, NavLink } from 'react-router-dom';

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-sage-700 text-white">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-xl">⛳</span>
            <span className="font-semibold tracking-tight">Golf Trips</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <NavLink to="/" end className={({ isActive }) => isActive ? 'text-sand-300 font-medium' : 'text-white/70 hover:text-white transition-colors'}>
              Active
            </NavLink>
            <NavLink to="/history" className={({ isActive }) => isActive ? 'text-sand-300 font-medium' : 'text-white/70 hover:text-white transition-colors'}>
              History
            </NavLink>
            <Link to="/admin" className="text-white/50 hover:text-white/80 text-xs border border-white/20 px-2.5 py-1 rounded-full transition-colors">
              Admin
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-stone-100 border-t border-stone-200 text-stone-400 text-xs text-center py-4 mt-12">
        Golf Trips · Personal Tournament Tracker
      </footer>
    </div>
  );
}
