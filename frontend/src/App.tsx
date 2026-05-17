import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import AdminLayout from './components/AdminLayout';

// Public pages
import Home from './pages/Home';
import TournamentView from './pages/TournamentView';
import TournamentResults from './pages/TournamentResults';
import History from './pages/History';

// Admin pages
import AdminLogin from './pages/admin/Login';
import AdminDashboard from './pages/admin/Dashboard';
import AdminPlayers from './pages/admin/Players';
import AdminTournaments from './pages/admin/Tournaments';
import AdminTournamentSetup from './pages/admin/TournamentSetup';
import AdminRoundScoring from './pages/admin/RoundScoring';

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
      <Routes>
        {/* Public routes */}
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="tournament/:id" element={<TournamentView />} />
          <Route path="tournament/:id/results" element={<TournamentResults />} />
          <Route path="history" element={<History />} />
        </Route>

        {/* Admin routes */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="players" element={<AdminPlayers />} />
          <Route path="tournaments" element={<AdminTournaments />} />
          <Route path="tournaments/:id" element={<AdminTournamentSetup />} />
          <Route path="rounds/:id/scoring" element={<AdminRoundScoring />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
