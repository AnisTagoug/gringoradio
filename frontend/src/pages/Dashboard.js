import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import api from '../utils/api';
import Footer from '../components/Footer';

export default function Dashboard() {
  const [stations, setStations] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ name: '', description: '', genre: '' });
  const [error, setError]       = useState('');
  const navigate = useNavigate();

  const fetchStations = async () => {
    try {
      const res = await api.get('/stations');
      setStations(res.data);
    } catch { setError('Failed to load stations'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchStations(); }, []);

  const hasStation = stations.length > 0;

  const createStation = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true); setError('');
    try {
      await api.post('/stations', form);
      setForm({ name: '', description: '', genre: '' });
      setShowForm(false);
      fetchStations();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create station');
    } finally { setCreating(false); }
  };

  const deleteStation = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this station and all its tracks?')) return;
    try {
      await api.delete(`/stations/${id}`);
      setStations(stations.filter(s => s.id !== id));
    } catch { setError('Failed to delete station'); }
  };

  return (
    <>
      <Navbar />
      <div className="container" style={{ paddingTop: 40, paddingBottom: 60 }}>

        <div className="page-header">
          <div>
            <h1>My Station</h1>
            <p>Manage your radio broadcast</p>
          </div>
          {!hasStation && !loading && (
            <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
              {showForm ? '✕ Cancel' : '+ Create Station'}
            </button>
          )}
        </div>

        {error && <div className="alert alert-error"><span>⚠</span>{error}</div>}

        {/* Create form */}
        {!hasStation && showForm && (
          <div className="card animate-in" style={{ marginBottom: 32 }}>
            <div className="section-header">
              <div>
                <div className="section-title">New Radio Station</div>
                <div className="section-sub">One station per account</div>
              </div>
            </div>
            <form onSubmit={createStation}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="form-group">
                  <label>Station Name *</label>
                  <input className="input" value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="My Awesome Radio" required autoFocus />
                </div>
                <div className="form-group">
                  <label>Genre</label>
                  <input className="input" value={form.genre}
                    onChange={e => setForm({ ...form, genre: e.target.value })}
                    placeholder="Hip-Hop, Jazz, Electronic…" />
                </div>
              </div>
              <div className="form-group">
                <label>Description</label>
                <input className="input" value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="Tell listeners what your station is about…" />
              </div>
              <button className="btn btn-primary" disabled={creating}>
                {creating ? <><span className="spinner" style={{ borderTopColor: '#0a0a0a' }} /> Creating…</> : 'Launch Station →'}
              </button>
            </form>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', paddingTop: 80 }}>
            <span className="spinner" style={{ width: 32, height: 32 }} />
          </div>
        ) : stations.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <div className="empty-state-icon">📻</div>
              <h3>No station yet</h3>
              <p>Create your radio station to start streaming music to the world</p>
              <button className="btn btn-primary btn-lg" onClick={() => setShowForm(true)}>
                + Launch Your Station
              </button>
            </div>
          </div>
        ) : (
          <div>
            {stations.map(station => (
              <StationCard key={station.id} station={station}
                onManage={() => navigate(`/station/${station.id}`)}
                onDelete={(e) => deleteStation(station.id, e)} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function StationCard({ station, onManage, onDelete }) {
  const isOnline = station.status === 'online' || station.status === 'live';

  return (
    <div className="station-card animate-in" onClick={onManage}>

      {/* Top section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Station avatar */}
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: 'linear-gradient(135deg, var(--amber-dim), rgba(96,207,255,0.08))',
            border: '1px solid var(--amber-mid)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, flexShrink: 0,
          }}>
            📻
          </div>
          <div>
            <div className="station-card-title">{station.name}</div>
            <div className="station-card-genre">{station.genre || 'No genre'}</div>
          </div>
        </div>

        <span className={`badge badge-${station.status}`}>
          {station.status || 'offline'}
        </span>
      </div>

      {station.description && (
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
          {station.description}
        </p>
      )}

      {/* Stream URL */}
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 11,
        color: 'var(--text-ghost)',
        background: 'var(--bg-void)',
        border: '1px solid var(--border-dim)',
        borderRadius: 'var(--radius-sm)',
        padding: '7px 12px',
        marginBottom: 16,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {station.stream_url || '—'}
      </div>

      {/* Stats row */}
      <div style={{
        display: 'flex', gap: 20, marginBottom: 18,
        paddingBottom: 18, borderBottom: '1px solid var(--border-dim)',
      }}>
        {[
          { label: 'Status', value: station.status || 'offline' },
          { label: 'Mount', value: station.mount_point || '—' },
        ].map(({ label, value }) => (
          <div key={label}>
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-ghost)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10 }} onClick={e => e.stopPropagation()}>
        <button className="btn btn-primary btn-sm" onClick={onManage}>
          Manage →
        </button>
        <button className="btn btn-danger btn-sm" onClick={onDelete}>
          Delete
        </button>
      </div>
   <Footer />
    </div>
  );
}