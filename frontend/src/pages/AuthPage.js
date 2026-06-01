import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function AuthPage() {
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);

  const { login } = useAuth();
  const navigate  = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await login(loginForm.email, loginForm.password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid email or password');
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      {/* Ambient glow */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(201,168,76,0.07) 0%, transparent 70%)',
      }} />

      <div className="auth-card card animate-in" style={{ position: 'relative', zIndex: 1 }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 36 }}>
          <div className="brand-icon-gold" style={{
            width: 40, height: 40, borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, flexShrink: 0,
          }}>📻</div>
          <span style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22, fontWeight: 800,
            letterSpacing: '-0.03em',
            background: 'linear-gradient(135deg, #8B6914 0%, #C9A84C 35%, #F5D78E 55%, #C9A84C 75%, #8B6914 100%)',
            backgroundSize: '200% auto',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            animation: 'gold-shimmer 4s linear infinite',
          }}>
            Radio Gringo
          </span>
        </div>

        {/* Heading */}
        <div style={{ marginBottom: 6, fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
          Welcome back
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 28 }}>
          Sign in to manage your radio station
        </div>

        {/* Error */}
        {error && (
          <div className="alert alert-error animate-in">
            <span>⚠</span> {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>Email</label>
            <input className="input" type="email"
              value={loginForm.email}
              onChange={e => setLoginForm({ ...loginForm, email: e.target.value })}
              placeholder="you@example.com" required autoFocus />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input className="input" type="password"
              value={loginForm.password}
              onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
              placeholder="••••••••" required />
          </div>

          <button className="btn btn-gold btn-full btn-lg" disabled={loading} style={{ marginTop: 8 }}>
            {loading
              ? <><span className="spinner" style={{ borderTopColor: '#1a1100', borderColor: 'rgba(26,17,0,0.2)' }} /> Signing in…</>
              : 'Sign in →'}
          </button>
        </form>

      </div>
    </div>
  );
}