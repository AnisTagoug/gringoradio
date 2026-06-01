import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

export default function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (user) api.get('/admin/users').then(() => setIsAdmin(true)).catch(() => setIsAdmin(false));
  }, [user]);

  return (
    <nav className="navbar">
<Link to="/dashboard" className="navbar-brand" style={{
  display: 'flex',
  alignItems: 'center',
  gap: 0,
}}>
  <img 
    src="/logo.png" 
    alt="Radio Gringo" 
    style={{ 
      width: 150,
      height: 100,
      objectFit: 'contain',
      flexShrink: 0,
      display: 'block',
    }} 
  />
  <span style={{
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: 17,
    letterSpacing: '-0.03em',
    marginLeft: -20,   // ← pull text closer to logo
    background: 'linear-gradient(135deg, #8B6914 0%, #C9A84C 35%, #F5D78E 55%, #C9A84C 75%, #8B6914 100%)',
    backgroundSize: '200% auto',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    animation: 'gold-shimmer 4s linear infinite',
  }}>
    Radio Gringo
  </span>
</Link>

      <div className="navbar-nav">
        {user && (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 12, color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(139,105,20,0.3), rgba(201,168,76,0.15))',
                border: '1px solid rgba(201,168,76,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
                color: '#C9A84C',
              }}>
                {user.username?.[0]?.toUpperCase()}
              </div>
              <span style={{ color: 'var(--text-secondary)' }}>{user.username}</span>
            </div>

            {isAdmin && (
              <Link to="/admin" style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700,
                letterSpacing: '0.08em',
                color: location.pathname === '/admin' ? '#F5D78E' : 'var(--text-muted)',
                background: location.pathname === '/admin'
                  ? 'linear-gradient(135deg, rgba(139,105,20,0.2), rgba(201,168,76,0.1))'
                  : 'transparent',
                borderRadius: 'var(--radius-sm)',
                padding: '5px 10px',
                border: '1px solid',
                borderColor: location.pathname === '/admin' ? 'rgba(201,168,76,0.35)' : 'var(--border-dim)',
                transition: 'all var(--t-fast)',
              }}>
                ⚙ ADMIN
              </Link>
            )}

            <button className="btn btn-ghost btn-sm" onClick={logout}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em' }}>
              LOGOUT
            </button>
          </>
        )}
      </div>
    </nav>
  );
}