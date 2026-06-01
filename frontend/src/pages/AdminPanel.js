import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import api from '../utils/api';
import Footer from '../components/Footer';


export default function AdminPanel() {
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm]         = useState({ username: '', email: '', password: '' });
  const [editForm, setEditForm] = useState({ username: '', email: '', password: '' });
  const [saving, setSaving]     = useState(false);
  const navigate = useNavigate();

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/users');
      setUsers(res.data);
    } catch (err) {
      if (err.response?.status === 403) navigate('/dashboard');
      else setError('Failed to load users');
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, []);

  const flash = (msg, isError = false) => {
    if (isError) { setError(msg); setSuccess(''); }
    else { setSuccess(msg); setError(''); }
    setTimeout(() => { setError(''); setSuccess(''); }, 4000);
  };

  const createUser = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await api.post('/admin/users', form);
      setForm({ username: '', email: '', password: '' });
      setShowCreate(false);
      flash('User created successfully');
      fetchUsers();
    } catch (err) { flash(err.response?.data?.error || 'Failed to create user', true); }
    finally { setSaving(false); }
  };

  const saveEdit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = { username: editForm.username, email: editForm.email };
      if (editForm.password) payload.password = editForm.password;
      await api.patch(`/admin/users/${editUser.id}`, payload);
      setEditUser(null);
      flash('User updated');
      fetchUsers();
    } catch (err) { flash(err.response?.data?.error || 'Failed to update user', true); }
    finally { setSaving(false); }
  };

  const deleteUser = async (user) => {
    if (!window.confirm(`Delete "${user.username}"? This removes their station and all tracks.`)) return;
    try {
      await api.delete(`/admin/users/${user.id}`);
      flash(`Deleted "${user.username}"`);
      fetchUsers();
    } catch (err) { flash(err.response?.data?.error || 'Delete failed', true); }
  };

  const adminCount = users.filter(u => u.is_admin).length;
  const stationCount = users.filter(u => u.station_name).length;

  return (
    <>
      <Navbar />
      <div className="container" style={{ paddingTop: 40, paddingBottom: 60, maxWidth: 960 }}>

        <div className="page-header">
          <div>
            <h1>Admin Panel</h1>
            <p>Manage platform users and accounts</p>
          </div>
          <button className="btn btn-primary" onClick={() => { setShowCreate(!showCreate); setError(''); }}>
            {showCreate ? '✕ Cancel' : '+ New User'}
          </button>
        </div>

        {error   && <div className="alert alert-error animate-in"><span>⚠</span>{error}</div>}
        {success && <div className="alert alert-success animate-in"><span>✓</span>{success}</div>}

        {/* Stats */}
        <div className="grid-3" style={{ marginBottom: 28 }}>
          {[
            { label: 'Total Users', value: users.length, color: 'var(--text-primary)' },
            { label: 'Active Stations', value: stationCount, color: 'var(--amber)' },
            { label: 'Admins', value: adminCount, color: 'var(--ice)' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Create User Form */}
        {showCreate && (
          <div className="card animate-in" style={{ marginBottom: 24, borderColor: 'var(--amber-mid)' }}>
            <div className="section-header">
              <div>
                <div className="section-title">Create User</div>
                <div className="section-sub">New account will have no station by default</div>
              </div>
            </div>
            <form onSubmit={createUser}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 18 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Username *</label>
                  <input className="input" value={form.username}
                    onChange={e => setForm({ ...form, username: e.target.value })}
                    placeholder="john_doe" required />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Email *</label>
                  <input className="input" type="email" value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    placeholder="john@example.com" required />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Password *</label>
                  <input className="input" type="password" value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    placeholder="••••••••" required />
                </div>
              </div>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? <><span className="spinner" style={{ borderTopColor: '#0a0a0a' }} /> Creating…</> : 'Create User →'}
              </button>
            </form>
          </div>
        )}

        {/* Users Table */}
        <div className="card">
          <div className="section-header" style={{ marginBottom: 20 }}>
            <div>
              <div className="section-title">All Users</div>
              <div className="section-sub">{users.length} account{users.length !== 1 ? 's' : ''} registered</div>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <span className="spinner" style={{ width: 28, height: 28 }} />
            </div>
          ) : users.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">👥</div>
              <h3>No users yet</h3>
              <p>Create the first user account</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    {['ID', 'User', 'Email', 'Station', 'Joined', 'Actions'].map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-ghost)' }}>
                        #{user.id}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: '50%',
                            background: 'var(--amber-dim)', border: '1px solid var(--amber-mid)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, color: 'var(--amber)', fontWeight: 700, flexShrink: 0,
                          }}>
                            {user.username?.[0]?.toUpperCase()}
                          </div>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{user.username}</span>
                          {user.is_admin && (
                            <span style={{
                              background: 'var(--amber-dim)', color: 'var(--amber)',
                              borderRadius: 4, padding: '1px 6px',
                              fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-mono)',
                              border: '1px solid var(--amber-mid)', letterSpacing: '0.06em',
                            }}>ADMIN</span>
                          )}
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                        {user.email}
                      </td>
                      <td>
                        {user.station_name ? (
                          <span style={{ color: 'var(--green)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                            📻 {user.station_name}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-ghost)', fontSize: 12 }}>—</span>
                        )}
                      </td>
                      <td style={{ color: 'var(--text-ghost)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-ghost btn-sm"
                            onClick={() => { setEditUser(user); setEditForm({ username: user.username, email: user.email, password: '' }); }}>
                            Edit
                          </button>
                          {!user.is_admin && (
                            <button className="btn btn-danger btn-sm" onClick={() => deleteUser(user)}>
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editUser && (
        <div className="modal-overlay" onClick={() => setEditUser(null)}>
          <div className="modal animate-in" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700 }}>
                  Edit User
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                  @{editUser.username}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditUser(null)}>✕</button>
            </div>

            <form onSubmit={saveEdit}>
              <div className="form-group">
                <label>Username</label>
                <input className="input" value={editForm.username}
                  onChange={e => setEditForm({ ...editForm, username: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input className="input" type="email" value={editForm.email}
                  onChange={e => setEditForm({ ...editForm, email: e.target.value })} />
              </div>
              <div className="form-group">
                <label>New Password <span style={{ color: 'var(--text-ghost)', fontWeight: 400 }}>(leave blank to keep)</span></label>
                <input className="input" type="password" value={editForm.password}
                  onChange={e => setEditForm({ ...editForm, password: e.target.value })}
                  placeholder="••••••••" />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? <><span className="spinner" style={{ borderTopColor: '#0a0a0a' }} /> Saving…</> : 'Save Changes'}
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => setEditUser(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
      <Footer />
    </>
  );
}