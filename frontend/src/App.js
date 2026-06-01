import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import StationDetail from './pages/StationDetail';
import AdminPanel from './pages/AdminPanel';
import './index.css';

function FullPageSpinner() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      justifyContent: 'center', alignItems: 'center',
      height: '100vh', gap: 16,
      background: 'var(--bg-void)',
    }}>
      <div style={{
        width: 36, height: 36,
        background: 'linear-gradient(135deg, #8B6914, #C9A84C, #F5D78E)',
        borderRadius: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18,
        boxShadow: '0 0 24px rgba(201,168,76,0.35)',
        animation: 'pulse 1.5s ease-in-out infinite',
      }}>📻</div>
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(0.92); opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  return user ? children : <Navigate to="/login" replace />;
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login"     element={<AuthPage />} />
          <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/station/:id" element={<PrivateRoute><StationDetail /></PrivateRoute>} />
          <Route path="/admin"     element={<PrivateRoute><AdminPanel /></PrivateRoute>} />
          <Route path="*"          element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}