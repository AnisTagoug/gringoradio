import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register({ switchToLogin }) {
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form.username, form.email, form.password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <div className="auth-logo">📻 RadioStudio</div>
        <h2 style={{ fontSize: 20, marginBottom: 24 }}>Create account</h2>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={submit}>
          <div className="form-group">
            <label>Username</label>
            <input className="input" value={form.username} onChange={set('username')}
              placeholder="cooldjname" required />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input className="input" type="email" value={form.email} onChange={set('email')}
              placeholder="you@example.com" required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input className="input" type="password" value={form.password} onChange={set('password')}
              placeholder="••••••••" minLength={6} required />
          </div>
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
            disabled={loading}>
            {loading ? <span className="spinner" /> : 'Create account'}
          </button>
        </form>
        <div className="auth-footer">
          Already have an account? <a onClick={switchToLogin}>Sign in</a>
        </div>
      </div>
    </div>
  );
}
