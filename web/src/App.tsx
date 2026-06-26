import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import DetailPage from './pages/DetailPage'
import TmdbDetailPage from './pages/TmdbDetailPage'
import AdminPage from './pages/AdminPage'
import ProfilePage from './pages/ProfilePage'
import LeaderboardPage from './pages/LeaderboardPage'

function Protected({ children }: { children: React.ReactNode }) {
  const { token } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/profile" element={<Protected><ProfilePage /></Protected>} />
      <Route path="/leaderboard" element={<Protected><LeaderboardPage /></Protected>} />
      <Route path="/media/:id" element={<Protected><DetailPage /></Protected>} />
      <Route path="/tmdb/:tmdbId" element={<Protected><TmdbDetailPage /></Protected>} />
      <Route path="/admin" element={<Protected><AdminPage /></Protected>} />
      <Route
        path="/*"
        element={
          <Protected>
            <DashboardPage />
          </Protected>
        }
      />
    </Routes>
  )
}
