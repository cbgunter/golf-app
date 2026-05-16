import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { authApi } from '../api/client';

export default function AdminLayout() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    authApi.verify()
      .then(r => { if (!r.valid) navigate('/admin/login'); })
      .catch(() => navigate('/admin/login'))
      .finally(() => setChecking(false));
  }, [navigate]);

  function logout() {
    localStorage.removeItem('golf_admin_token');
    navigate('/admin/login');
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Verifying session...</div>
      </div>
    );
  }

  const navItem = ({ isActive }: { isActive: boolean }) =>
    `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-fairway-600 text-white'
        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    }`;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <header className="bg-fairway-700 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-white/60 hover:text-white text-sm">⛳ Golf Trips</Link>
            <span className="text-white/30">/</span>
            <span className="text-sm font-medium">Admin</span>
          </div>
          <button onClick={logout} className="text-xs text-white/60 hover:text-white border border-white/20 px-3 py-1 rounded-full transition-colors">
            Log out
          </button>
        </div>
      </header>

      <div className="flex flex-1 max-w-7xl mx-auto w-full px-4 py-6 gap-6">
        {/* Sidebar */}
        <aside className="w-48 shrink-0">
          <nav className="space-y-1 sticky top-6">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-3">Menu</p>
            <NavLink to="/admin" end className={navItem}>Dashboard</NavLink>
            <NavLink to="/admin/players" className={navItem}>Players</NavLink>
            <NavLink to="/admin/tournaments" className={navItem}>Tournaments</NavLink>
            <NavLink to="/admin/courses" className={navItem}>Courses</NavLink>
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
