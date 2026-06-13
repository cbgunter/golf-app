import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';

// Public pages
import Home from './pages/Home';
import TournamentView from './pages/TournamentView';
import TournamentResults from './pages/TournamentResults';
import History from './pages/History';
import Players from './pages/Players';
import PlayerProfilePage from './pages/PlayerProfile';
import ScoreHub from './pages/ScoreHub';
import ScoreEntry from './pages/ScoreEntry';

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
      <ErrorBoundary>
      <Routes>
        {/* Public routes */}
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="tournament/:id" element={<TournamentView />} />
          <Route path="tournament/:id/results" element={<TournamentResults />} />
          <Route path="history" element={<History />} />
          <Route path="players" element={<Players />} />
          <Route path="players/:id" element={<PlayerProfilePage />} />
        </Route>

        {/* Scoring routes — full-screen mobile, no nav wrapper */}
        <Route path="/score" element={<ScoreHub />} />
        <Route path="/tournament/:tournamentId/score" element={<ScoreHub />} />
        <Route path="/score/:pin" element={<ScoreEntry />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
