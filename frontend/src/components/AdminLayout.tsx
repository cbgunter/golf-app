import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { authApi } from '../api/client';
import { LayoutDashboard, Users, Trophy, MapPin, LogOut, Menu, X } from 'lucide-react';

export default function AdminLayout() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

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
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-stone-400 text-sm">Verifying session…</div>
      </div>
    );
  }

  const navItems = [
    { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/admin/players', label: 'Players', icon: Users },
    { to: '/admin/tournaments', label: 'Tournaments', icon: Trophy },
    { to: '/admin/courses', label: 'Courses', icon: MapPin },
  ];

  const navCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive ? 'bg-sage-600 text-white' : 'text-stone-600 hover:bg-stone-100'
    }`;

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Top bar */}
      <header className="bg-sage-700 text-white sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm">
            <Link to="/" className="text-white/50 hover:text-white/80 transition-colors">⛳ Golf Trips</Link>
            <span className="text-white/30">/</span>
            <span className="font-medium">Admin</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={logout} className="hidden sm:flex items-center gap-1.5 text-xs text-white/60 hover:text-white border border-white/20 px-2.5 py-1 rounded-full transition-colors">
              <LogOut size={12} /> Log out
            </button>
            {/* Mobile menu toggle */}
            <button className="sm:hidden text-white/70 hover:text-white p-1" onClick={() => setMenuOpen(o => !o)}>
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile nav drawer */}
      {menuOpen && (
        <div className="sm:hidden bg-white border-b border-stone-200 px-4 py-3 space-y-1 shadow-sm">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={navCls} onClick={() => setMenuOpen(false)}>
              <Icon size={16} /> {label}
            </NavLink>
          ))}
          <button onClick={logout} className="flex items-center gap-2.5 px-3 py-2 text-sm text-red-500 font-medium w-full">
            <LogOut size={16} /> Log out
          </button>
        </div>
      )}

      <div className="max-w-7xl mx-auto flex gap-6 px-4 py-6">
        {/* Desktop sidebar */}
        <aside className="hidden sm:block w-44 shrink-0">
          <nav className="space-y-0.5 sticky top-20">
            <p className="section-title px-3 mb-3">Navigation</p>
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className={navCls}>
                <Icon size={15} /> {label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
