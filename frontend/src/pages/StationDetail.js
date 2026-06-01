import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import NowPlaying from '../components/NowPlaying';
import api from '../utils/api';
import Footer from '../components/Footer';
/* ─────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────── */
const fmtSize = (bytes) => {
  if (!bytes) return '—';
  return bytes > 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : (bytes / 1024).toFixed(0) + ' KB';
};

const isYTExpired = (t) => {
  if (t.source !== 'youtube' || !t.stream_url_expires_at) return false;
  return new Date(t.stream_url_expires_at) < new Date();
};

const isYTExpiring = (t) => {
  if (t.source !== 'youtube' || !t.stream_url_expires_at) return false;
  const diff = new Date(t.stream_url_expires_at) - new Date();
  return diff > 0 && diff < 3600000;
};

/* ─────────────────────────────────────────────────
   CopyButton
───────────────────────────────────────────────── */
function CopyBtn({ value, label }) {
  const [done, setDone] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setDone(true); setTimeout(() => setDone(false), 2000);
  };
  return (
    <button className={`copy-btn ${done ? 'copied' : ''}`} onClick={copy}>
      {done ? '✓ copied' : '⧉ copy'}
    </button>
  );
}

/* ─────────────────────────────────────────────────
   StationDetail
───────────────────────────────────────────────── */
export default function StationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [station, setStation]       = useState(null);
  const [tracks, setTracks]         = useState([]);
  const [broadcasters, setBroadcasters] = useState([]);
  const [credentials, setCredentials]   = useState(null);
  const [tab, setTab]               = useState('tracks');
  const [loading, setLoading]       = useState(true);
  const [uploading, setUploading]   = useState(false);
  const [uploadMeta, setUploadMeta] = useState({ title: '', artist: '' });
  const [dragover, setDragover]     = useState(false);
  const [msg, setMsg]               = useState({ text: '', ok: true });

  // YouTube
  const [ytUrl, setYtUrl]           = useState('');
  const [ytArtist, setYtArtist]     = useState('');
  const [ytLoading, setYtLoading]   = useState(false);
  const [ytRefreshing, setYtRefreshing] = useState(null);

  // Google Drive
  const [driveOpen, setDriveOpen]   = useState(false);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveFolder, setDriveFolder]   = useState(null);
  const [driveSelected, setDriveSelected] = useState(new Set());
  const [driveImporting, setDriveImporting] = useState(false);

  // Broadcasters
  const [showBcForm, setShowBcForm] = useState(false);
  const [bcForm, setBcForm]         = useState({ display_name: '', username: '', password: '', role: 'broadcaster' });
  const [bcLoading, setBcLoading]   = useState(false);
  const [bcCredModal, setBcCredModal] = useState(null);

  const fileRef = useRef();

  useEffect(() => { loadAll(); }, [id]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [sRes, tRes, cRes, bRes] = await Promise.all([
        api.get(`/stations/${id}`),
        api.get(`/stations/${id}/tracks`),
        api.get(`/stations/${id}/credentials`),
        api.get(`/stations/${id}/broadcasters`),
      ]);
      setStation(sRes.data);
      setTracks(tRes.data);
      setCredentials(cRes.data);
      setBroadcasters(bRes.data);
    } catch { flash('Failed to load station', false); }
    finally { setLoading(false); }
  };

  const flash = (text, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg({ text: '', ok: true }), 4000);
  };

  /* ── File upload ── */
  const handleFileUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('audio', file);
    fd.append('title', uploadMeta.title || file.name.replace(/\.[^/.]+$/, ''));
    fd.append('artist', uploadMeta.artist || 'Unknown');
    try {
      await api.post(`/stations/${id}/tracks/upload`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      flash('Track uploaded ☁️');
      setUploadMeta({ title: '', artist: '' });
      const tRes = await api.get(`/stations/${id}/tracks`);
      setTracks(tRes.data);
    } catch (err) { flash(err.response?.data?.error || 'Upload failed', false); }
    finally { setUploading(false); }
  };

  /* ── YouTube ── */
  const addYouTubeTrack = async (e) => {
    e.preventDefault();
    if (!ytUrl) return;
    setYtLoading(true);
    try {
      await api.post(`/stations/${id}/youtube`, { youtube_url: ytUrl, artist: ytArtist });
      flash('YouTube track added ✅');
      setYtUrl(''); setYtArtist('');
      const tRes = await api.get(`/stations/${id}/tracks`);
      setTracks(tRes.data);
    } catch (err) { flash(err.response?.data?.error || 'Failed to add YouTube track', false); }
    finally { setYtLoading(false); }
  };

const refreshYouTube = async (trackId) => {
    setYtRefreshing(trackId);
    try {
      await api.post(`/stations/${id}/youtube/${trackId}/refresh`);
      flash('Stream URL refreshed ✅');
      const tRes = await api.get(`/stations/${id}/tracks`);
      setTracks(tRes.data);
    } catch (err) {
      const isRestricted = err.response?.status === 422 || 
                           err.response?.data?.restricted;
      if (isRestricted) {
        flash('⚠ This video is age-restricted or requires sign-in. Please delete it and add a different video.', false);
      } else {
        flash(err.response?.data?.error || 'Refresh failed', false);
      }
    }
    finally { setYtRefreshing(null); }
  };

  /* ── Google Drive ── */
  const openDriveImport = async () => {
    setDriveOpen(true);
    if (driveFolder) return;
    setDriveLoading(true);
    try {
      const res = await api.get(`/stations/${id}/drive/folder`);
      setDriveFolder(res.data);
    } catch (err) { flash(err.response?.data?.error || 'Failed to load Drive', false); setDriveOpen(false); }
    finally { setDriveLoading(false); }
  };

  const refreshDriveFolder = async () => {
    setDriveLoading(true);
    try {
      const res = await api.get(`/stations/${id}/drive/folder`);
      setDriveFolder(res.data); setDriveSelected(new Set());
    } catch (err) { flash(err.response?.data?.error || 'Refresh failed', false); }
    finally { setDriveLoading(false); }
  };

  const toggleDriveFile = (fileId) => {
    setDriveSelected(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId); else next.add(fileId);
      return next;
    });
  };

  const importDriveTracks = async () => {
    if (driveSelected.size === 0) return;
    setDriveImporting(true);
    try {
      const res = await api.post(`/stations/${id}/drive/import`, { file_ids: Array.from(driveSelected) });
      flash(`Imported ${res.data.imported} track(s) ✅`);
      setDriveSelected(new Set());
      const [tRes, folderRes] = await Promise.all([
        api.get(`/stations/${id}/tracks`),
        api.get(`/stations/${id}/drive/folder`),
      ]);
      setTracks(tRes.data); setDriveFolder(folderRes.data);
    } catch (err) { flash(err.response?.data?.error || 'Import failed', false); }
    finally { setDriveImporting(false); }
  };

  const deleteTrack = async (trackId) => {
    if (!window.confirm('Delete this track?')) return;
    try {
      await api.delete(`/stations/${id}/tracks/${trackId}`);
      setTracks(tracks.filter(t => t.id !== trackId));
    } catch { flash('Failed to delete track', false); }
  };

  /* ── Broadcasters ── */
  const createBroadcaster = async (e) => {
    e.preventDefault(); setBcLoading(true);
    try {
      await api.post(`/stations/${id}/broadcasters`, bcForm);
      flash('Broadcaster created!');
      setBcForm({ display_name: '', username: '', password: '', role: 'broadcaster' });
      setShowBcForm(false);
      const bRes = await api.get(`/stations/${id}/broadcasters`);
      setBroadcasters(bRes.data);
    } catch (err) { flash(err.response?.data?.error || 'Failed to create', false); }
    finally { setBcLoading(false); }
  };

  const toggleBroadcaster = async (b) => {
    try {
      await api.patch(`/stations/${id}/broadcasters/${b.id}`, { is_active: !b.is_active });
      const bRes = await api.get(`/stations/${id}/broadcasters`);
      setBroadcasters(bRes.data);
    } catch { flash('Failed to update broadcaster', false); }
  };

  const deleteBroadcaster = async (bId) => {
    if (!window.confirm('Delete this broadcaster?')) return;
    try {
      await api.delete(`/stations/${id}/broadcasters/${bId}`);
      setBroadcasters(broadcasters.filter(b => b.id !== bId));
    } catch { flash('Failed to delete broadcaster', false); }
  };

  const loadBcCredentials = async (bId) => {
    try {
      const res = await api.get(`/stations/${id}/broadcasters/${bId}/credentials`);
      setBcCredModal(res.data);
    } catch { flash('Failed to load credentials', false); }
  };

  const genPassword = () => {
    const p = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
    setBcForm({ ...bcForm, password: p });
  };

  /* ── Render ── */
  if (loading) return (
    <>
      <Navbar />
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh' }}>
        <span className="spinner" style={{ width: 36, height: 36 }} />
      </div>
    </>
  );

  if (!station) return (
    <>
      <Navbar />
      <div className="container" style={{ paddingTop: 40 }}>
        <div className="alert alert-error"><span>⚠</span>Station not found</div>
      </div>
    </>
  );

  const TABS = [
    { key: 'tracks',       label: 'Tracks',       icon: '🎵', count: tracks.length },
    { key: 'broadcasters', label: 'Broadcasters',  icon: '🎙️', count: broadcasters.length },
    { key: 'credentials',  label: 'Credentials',   icon: '🔑', count: null },
    { key: 'autodj',       label: 'AutoDJ',        icon: '🤖', count: null },
  ];

  return (
    <>
      <Navbar />
      <div className="container" style={{ paddingTop: 36, paddingBottom: 60 }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <button className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}
            onClick={() => navigate('/dashboard')}>
            ← Back
          </button>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14,
                background: 'linear-gradient(135deg, var(--amber-dim), rgba(96,207,255,0.08))',
                border: '1px solid var(--amber-mid)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
              }}>📻</div>
              <div>
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em' }}>
                  {station.name}
                </h1>
                <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
                  <span className={`badge badge-${station.status}`}>{station.status || 'offline'}</span>
                  {station.genre && <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{station.genre}</span>}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Flash message */}
        {msg.text && (
          <div className={`alert animate-in ${msg.ok ? 'alert-success' : 'alert-error'}`}>
            <span>{msg.ok ? '✓' : '⚠'}</span> {msg.text}
          </div>
        )}

        {/* Now Playing */}
        <NowPlaying stationId={station.id} streamUrl={station.stream_url || credentials?.stream_url} />

        {/* Tabs */}
        <div className="tabs">
          {TABS.map(t => (
            <div key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span style={{ fontSize: 14, lineHeight: 1 }}>{t.icon}</span>
              <span>{t.label}</span>
              {t.count !== null && (
                <span style={{
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  background: tab === t.key ? 'rgba(201,168,76,0.2)' : 'var(--bg-overlay)',
                  color: tab === t.key ? '#F5D78E' : 'var(--text-ghost)',
                  borderRadius: '999px',
                  padding: '1px 6px',
                  fontWeight: 700,
                  border: tab === t.key ? '1px solid rgba(201,168,76,0.25)' : '1px solid var(--border-dim)',
                  transition: 'all var(--t-fast)',
                }}>
                  {t.count}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* ── TRACKS TAB ── */}
        {tab === 'tracks' && (
          <div className="animate-in">
            {/* Upload */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="section-header">
                <div>
                  <div className="section-title">Upload Track</div>
                  <div className="section-sub">MP3, WAV, OGG, FLAC — max 50 MB</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Title</label>
                  <input className="input" value={uploadMeta.title}
                    onChange={e => setUploadMeta({ ...uploadMeta, title: e.target.value })}
                    placeholder="Track title" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Artist</label>
                  <input className="input" value={uploadMeta.artist}
                    onChange={e => setUploadMeta({ ...uploadMeta, artist: e.target.value })}
                    placeholder="Artist name" />
                </div>
              </div>
              <div className={`upload-area ${dragover ? 'dragover' : ''}`}
                onClick={() => fileRef.current.click()}
                onDragOver={e => { e.preventDefault(); setDragover(true); }}
                onDragLeave={() => setDragover(false)}
                onDrop={e => { e.preventDefault(); setDragover(false); handleFileUpload(e.dataTransfer.files[0]); }}>
                {uploading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <span className="spinner" style={{ width: 28, height: 28 }} />
                    <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Uploading to cloud…</span>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 28, marginBottom: 10 }}>☁</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 4, fontWeight: 500 }}>
                      Drop audio file here or click to browse
                    </div>
                    <div style={{ color: 'var(--text-ghost)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                      MP3 · WAV · OGG · FLAC · AAC
                    </div>
                  </>
                )}
                <input ref={fileRef} type="file" accept="audio/*" style={{ display: 'none' }}
                  onChange={e => handleFileUpload(e.target.files[0])} />
              </div>
            </div>

            {/* YouTube Import */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="section-header">
                <div>
                  <div className="section-title">▶ Import from YouTube</div>
                  <div className="section-sub">Stream URL is extracted — no download</div>
                </div>
              </div>
              <form onSubmit={addYouTubeTrack}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'end' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>YouTube URL</label>
                    <input className="input" value={ytUrl} onChange={e => setYtUrl(e.target.value)}
                      placeholder="https://youtube.com/watch?v=..." required />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Artist (optional)</label>
                    <input className="input" value={ytArtist} onChange={e => setYtArtist(e.target.value)}
                      placeholder="Artist name" style={{ width: 160 }} />
                  </div>
                  <button className="btn btn-primary" type="submit" disabled={ytLoading || !ytUrl}>
                    {ytLoading ? <><span className="spinner" style={{ width: 13, height: 13, borderTopColor: '#0a0a0a' }} /> Extracting…</> : 'Add Track'}
                  </button>
                </div>
              </form>
            </div>

            {/* Google Drive Import */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="section-header" style={{ marginBottom: driveOpen ? 16 : 0 }}>
                <div>
                  <div className="section-title">📂 Import from Google Drive</div>
                  <div className="section-sub">Stream directly from your Drive folder</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {driveFolder && (
                    <a href={driveFolder.folder_url} target="_blank" rel="noreferrer"
                      style={{ fontSize: 12, color: 'var(--ice)' }}>↗ Open</a>
                  )}
                  <button className="btn btn-ghost btn-sm"
                    onClick={driveOpen ? () => setDriveOpen(false) : openDriveImport}>
                    {driveOpen ? '▲ Collapse' : '▼ Browse'}
                  </button>
                </div>
              </div>

              {driveOpen && (
                <>
                  {driveLoading ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                      <span className="spinner" style={{ width: 16, height: 16 }} /> Loading Drive folder…
                    </div>
                  ) : driveFolder ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          📁 <strong style={{ color: 'var(--text-secondary)' }}>{driveFolder.folder_name}</strong>
                          {' · '}{driveFolder.files.length} file{driveFolder.files.length !== 1 ? 's' : ''}
                        </span>
                        <button className="btn btn-ghost btn-sm" onClick={refreshDriveFolder} disabled={driveLoading}>↻ Refresh</button>
                      </div>

                      {driveFolder.files.length === 0 ? (
                        <div className="empty-state" style={{ padding: '28px 0' }}>
                          <div className="empty-state-icon" style={{ fontSize: 28 }}>📭</div>
                          <p>No audio files in this folder yet.<br />
                            <a href={driveFolder.folder_url} target="_blank" rel="noreferrer" style={{ color: 'var(--amber)' }}>Open in Drive</a> to upload music.
                          </p>
                        </div>
                      ) : (
                        <>
                          <div style={{ border: '1px solid var(--border-dim)', borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: 12 }}>
                            {driveFolder.files.map((file, i) => {
                              const isImported = driveFolder.already_imported?.includes(file.id);
                              const isSelected = driveSelected.has(file.id);
                              return (
                                <div key={file.id} style={{
                                  display: 'flex', alignItems: 'center', gap: 12,
                                  padding: '11px 14px',
                                  background: isSelected ? 'var(--amber-dim)' : i % 2 === 0 ? 'var(--bg-void)' : 'transparent',
                                  borderBottom: i < driveFolder.files.length - 1 ? '1px solid var(--border-dim)' : 'none',
                                  cursor: isImported ? 'default' : 'pointer',
                                  transition: 'background var(--t-fast)',
                                }} onClick={() => !isImported && toggleDriveFile(file.id)}>
                                  <div style={{
                                    width: 16, height: 16, borderRadius: 4,
                                    border: `1.5px solid ${isSelected ? 'var(--amber)' : 'var(--border-bright)'}`,
                                    background: isSelected ? 'var(--amber)' : 'transparent',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 10, color: '#0a0a0a', flexShrink: 0,
                                    transition: 'all var(--t-fast)',
                                  }}>
                                    {isSelected && '✓'}
                                  </div>
                                  <span style={{ fontSize: 13, flex: 1, color: isImported ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                                    {file.name}
                                  </span>
                                  {isImported && (
                                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--green)', background: 'var(--green-dim)', padding: '2px 7px', borderRadius: 'var(--radius-full)', border: '1px solid rgba(61,220,132,0.2)' }}>
                                      IMPORTED
                                    </span>
                                  )}
                                  <span style={{ fontSize: 11, color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}>
                                    {fmtSize(file.size)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                          {driveSelected.size > 0 && (
                            <button className="btn btn-primary" onClick={importDriveTracks} disabled={driveImporting}>
                              {driveImporting ? <><span className="spinner" style={{ width: 13, height: 13, borderTopColor: '#0a0a0a' }} /> Importing…</> : `Import ${driveSelected.size} file${driveSelected.size > 1 ? 's' : ''} →`}
                            </button>
                          )}
                        </>
                      )}
                    </>
                  ) : null}
                </>
              )}
            </div>

            {/* Track List */}
            {tracks.length > 0 ? (
              <div className="card">
                <div className="section-header">
                  <div>
                    <div className="section-title">Playlist</div>
                    <div className="section-sub">{tracks.length} track{tracks.length !== 1 ? 's' : ''} in rotation</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {tracks.map((t, i) => {
                    const expired = isYTExpired(t);
                    const expiring = isYTExpiring(t);
                    return (
                      <div key={t.id} className="track-item">
                        <span className="track-num">{i + 1}</span>
                        <div className="track-icon" style={{
                          background: t.source === 'youtube' ? 'rgba(255,77,77,0.1)' : t.source === 'gdrive' ? 'rgba(96,207,255,0.08)' : 'var(--amber-dim)',
                          border: `1px solid ${t.source === 'youtube' ? 'rgba(255,77,77,0.2)' : t.source === 'gdrive' ? 'rgba(96,207,255,0.15)' : 'var(--amber-mid)'}`,
                        }}>
                          {t.source === 'youtube' ? '▶' : t.source === 'gdrive' ? '📁' : '♪'}
                        </div>
                        <div className="track-info">
                          <div className="track-title">{t.title}</div>
                          <div className="track-artist">
                            {t.artist}
                            {t.source !== 'upload' && (
                              <span style={{
                                marginLeft: 8, fontSize: 10, fontFamily: 'var(--font-mono)',
                                color: expired ? 'var(--red)' : expiring ? 'var(--amber)' : 'var(--text-ghost)',
                                background: expired ? 'var(--red-dim)' : expiring ? 'var(--amber-dim)' : 'transparent',
                                padding: expired || expiring ? '1px 5px' : '0',
                                borderRadius: 3,
                              }}>
                                {t.source?.toUpperCase()}
                                {expired ? ' · EXPIRED' : expiring ? ' · EXPIRING' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="track-meta">{fmtSize(t.file_size)}</div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          {t.source === 'youtube' && (expired || expiring) && (
                            <button className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--amber)', borderColor: 'var(--amber-mid)' }}
                              disabled={ytRefreshing === t.id}
                              onClick={() => refreshYouTube(t.id)}>
                              {ytRefreshing === t.id ? <span className="spinner" style={{ width: 12, height: 12 }} /> : '↻'}
                            </button>
                          )}
                          <button className="btn btn-danger btn-sm" onClick={() => deleteTrack(t.id)}>✕</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="card">
                <div className="empty-state">
                  <div className="empty-state-icon">🎵</div>
                  <h3>No tracks yet</h3>
                  <p>Upload audio files or import from YouTube / Google Drive to build your playlist</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── BROADCASTERS TAB ── */}
        {tab === 'broadcasters' && (
          <div className="animate-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700 }}>Broadcasters</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Each person gets their own password</div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => setShowBcForm(!showBcForm)}>
                {showBcForm ? '✕ Cancel' : '+ Add Broadcaster'}
              </button>
            </div>

            {showBcForm && (
              <div className="card animate-in" style={{ marginBottom: 20, borderColor: 'var(--amber-mid)' }}>
                <div className="section-title" style={{ marginBottom: 16 }}>New Broadcaster</div>
                <form onSubmit={createBroadcaster}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div className="form-group">
                      <label>Display Name</label>
                      <input className="input" value={bcForm.display_name}
                        onChange={e => setBcForm({ ...bcForm, display_name: e.target.value })}
                        placeholder="DJ Silva" required />
                    </div>
                    <div className="form-group">
                      <label>Username</label>
                      <input className="input" value={bcForm.username}
                        onChange={e => setBcForm({ ...bcForm, username: e.target.value })}
                        placeholder="dj_silva" required />
                    </div>
                    <div className="form-group">
                      <label>Password</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input className="input" value={bcForm.password}
                          onChange={e => setBcForm({ ...bcForm, password: e.target.value })}
                          placeholder="Stream password" required />
                        <button type="button" className="btn btn-ghost btn-sm" onClick={genPassword}
                          style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>Generate</button>
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Role</label>
                      <select className="input" value={bcForm.role}
                        onChange={e => setBcForm({ ...bcForm, role: e.target.value })}>
                        <option value="broadcaster">Broadcaster</option>
                        <option value="host">Host</option>
                        <option value="guest">Guest</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  </div>
                  <button className="btn btn-primary" disabled={bcLoading}>
                    {bcLoading ? <><span className="spinner" style={{ width: 13, height: 13, borderTopColor: '#0a0a0a' }} /> Creating…</> : 'Create Broadcaster →'}
                  </button>
                </form>
              </div>
            )}

            {broadcasters.length === 0 ? (
              <div className="card">
                <div className="empty-state">
                  <div className="empty-state-icon">🎙</div>
                  <h3>No broadcasters yet</h3>
                  <p>Add a broadcaster to let DJs connect and go live</p>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {broadcasters.map(b => (
                  <div key={b.id} className="card" style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: '50%',
                          background: b.is_active ? 'var(--green-dim)' : 'var(--bg-overlay)',
                          border: `1.5px solid ${b.is_active ? 'rgba(61,220,132,0.3)' : 'var(--border-dim)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0,
                        }}>🎙</div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{b.display_name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                            @{b.username} · {b.role}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span className={`badge ${b.is_active ? 'badge-online' : 'badge-offline'}`}>
                          {b.is_active ? 'Active' : 'Disabled'}
                        </span>
                        <button className="btn btn-ghost btn-sm" onClick={() => loadBcCredentials(b.id)}>
                          Credentials
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => toggleBroadcaster(b)}
                          style={{ color: b.is_active ? 'var(--red)' : 'var(--green)', borderColor: b.is_active ? 'rgba(255,77,106,0.3)' : 'rgba(61,220,132,0.3)' }}>
                          {b.is_active ? 'Disable' : 'Enable'}
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteBroadcaster(b.id)}>Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Credentials Modal */}
            {bcCredModal && (
              <div className="modal-overlay" onClick={() => setBcCredModal(null)}>
                <div className="modal animate-in" onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700 }}>
                        🎙 {bcCredModal.display_name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Stream Credentials</div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => setBcCredModal(null)}>✕</button>
                  </div>

                  <div className="alert alert-info" style={{ marginBottom: 16 }}>
                    <span>ℹ</span> Connect to <strong>Liquidsoap harbor</strong> — not Icecast directly. Liquidsoap switches live/AutoDJ automatically.
                  </div>

                  <div className="credentials-box">
                    {[
                      { label: 'Host', value: bcCredModal.host },
                      { label: 'Port (Harbor)', value: String(bcCredModal.harbor_port || credentials?.harbor_port || '?') },
                      { label: 'Mount', value: bcCredModal.mount_point },
                      { label: 'Password', value: bcCredModal.password },
                      { label: 'Listener URL', value: bcCredModal.stream_url },
                    ].map(({ label, value }) => (
                      <div key={label} className="credentials-row">
                        <span className="credentials-label">{label}</span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span className="credentials-value">{value}</span>
                          <CopyBtn value={value} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CREDENTIALS TAB ── */}
        {tab === 'credentials' && credentials && (
          <div className="animate-in">
            <div style={{ display: 'grid', gap: 16 }}>

              <div className="card">
                <div className="section-header">
                  <div>
                    <div className="section-title">🎙 Broadcaster Connection</div>
                    <div className="section-sub">Use in RadioBoss / BUTT / OBS / Mixxx</div>
                  </div>
                </div>
                <div className="credentials-box">
                  {[
                    { label: 'Host', value: credentials.icecast_host },
                    { label: 'Port (Harbor)', value: String(credentials.harbor_port) },
                    { label: 'Mount', value: credentials.mount_point },
                    { label: 'Server', value: `${credentials.icecast_host}:${credentials.harbor_port}${credentials.mount_point}` },
                  ].map(({ label, value }) => (
                    <div key={label} className="credentials-row">
                      <span className="credentials-label">{label}</span>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span className="credentials-value">{value}</span>
                        <CopyBtn value={value} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="section-header">
                  <div>
                    <div className="section-title">📻 Public Stream URL</div>
                    <div className="section-sub">Share with listeners — this URL never changes</div>
                  </div>
                </div>
                <div className="credentials-box">
                  {[
                    { label: 'Host', value: credentials.icecast_host },
                    { label: 'Icecast Port', value: String(credentials.icecast_port) },
                    { label: 'Mount', value: credentials.mount_point },
                    { label: 'Stream URL', value: credentials.stream_url },
                  ].map(({ label, value }) => (
                    <div key={label} className="credentials-row">
                      <span className="credentials-label">{label}</span>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span className="credentials-value">{value}</span>
                        <CopyBtn value={value} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="section-header">
                  <div>
                    <div className="section-title">🔑 Source Password</div>
                    <div className="section-sub">Used by Liquidsoap AutoDJ → Icecast</div>
                  </div>
                </div>
                <div className="credentials-box">
                  <div className="credentials-row">
                    <span className="credentials-label">Source password</span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span className="credentials-value">{credentials.source_password}</span>
                      <CopyBtn value={credentials.source_password} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── AUTODJ TAB ── */}
        {tab === 'autodj' && (
          <AutoDJTab station={station} tracks={tracks} credentials={credentials} />
        )}
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────
   AutoDJ Tab
───────────────────────────────────────────────── */
function AutoDJTab({ station, tracks, credentials }) {
  const [status,      setStatus]      = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [skipLoading, setSkipLoading] = useState(false);
  const [modeLoading, setModeLoading] = useState(false);
  const [msg,         setMsg]         = useState({ text: '', ok: true });
  const [localElapsed, setLocalElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const tickRef    = useRef(null);

  const authHdr = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  const flash = (text, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg({ text: '', ok: true }), 4000);
  };

  const fetchStatus = React.useCallback(async () => {
    try {
      const r    = await fetch(`/api/stations/${station.id}/autodj/status`, { headers: authHdr() });
      const data = await r.json();
      setStatus(data);
      const srv = data.elapsed_seconds ?? 0;
      elapsedRef.current = srv;
      setLocalElapsed(srv);
    } catch {}
  }, [station.id]);

  useEffect(() => {
    fetchStatus();
    const iv = setInterval(fetchStatus, 3000);
    return () => clearInterval(iv);
  }, [fetchStatus]);

  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setLocalElapsed(elapsedRef.current);
    }, 1000);
    return () => clearInterval(tickRef.current);
  }, []);

  const control = async (action) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/stations/${station.id}/autodj/${action}`, {
        method: 'POST', headers: { ...authHdr(), 'Content-Type': 'application/json' },
      });
      const data = await r.json();
      if (data.error) flash(data.error, false);
      else flash(data.message || 'Done');
      setTimeout(fetchStatus, 800);
    } catch { flash('Network error', false); }
    finally { setLoading(false); }
  };

  const skip = async () => {
    setSkipLoading(true);
    try {
      const r = await fetch(`/api/stations/${station.id}/autodj/skip`, { method: 'POST', headers: authHdr() });
      const data = await r.json();
      if (data.error) flash(data.error, false); else flash('⏭ Skipped');
      setTimeout(fetchStatus, 800);
    } catch { flash('Skip failed', false); }
    finally { setSkipLoading(false); }
  };

  const setMode = async (mode) => {
    setModeLoading(true);
    try {
      await fetch(`/api/stations/${station.id}/autodj/mode`, {
        method: 'POST',
        headers: { ...authHdr(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      flash(`Mode: ${mode}`);
      setTimeout(fetchStatus, 1200);
    } catch { flash('Mode change failed', false); }
    finally { setModeLoading(false); }
  };

  const running    = status?.running ?? false;
  const np         = status?.now_playing;
  const isShuffled = (status?.autodj_mode ?? 'randomize') === 'randomize';
  const listeners  = status?.listeners ?? 0;
  const expiredCount = tracks.filter(t => t.source === 'youtube' && isYTExpired(t)).length;

  const EST_DURATION = 240;
  const elapsed   = Math.min(localElapsed, EST_DURATION);
  const progress  = running && np ? Math.min((elapsed / EST_DURATION) * 100, 100) : 0;
  const fmtTime   = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const remaining = Math.max(0, EST_DURATION - elapsed);

  const currentIdx = np ? tracks.findIndex(t => t.title === np.title) : -1;
  const nextTrack  = currentIdx >= 0
    ? (isShuffled ? null : tracks[(currentIdx + 1) % tracks.length])
    : (tracks.length > 0 ? tracks[0] : null);

  return (
    <div className="animate-in">
      {/* Flash */}
      {msg.text && (
        <div className={`alert animate-in ${msg.ok ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: 16 }}>
          <span>{msg.ok ? '✓' : '⚠'}</span> {msg.text}
        </div>
      )}

      {/* Stats row */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        {[
          { label: 'Engine',    value: running ? 'Running' : 'Stopped', color: running ? 'var(--green)' : 'var(--red)', icon: running ? '●' : '○' },
          { label: 'Tracks',   value: tracks.length, color: 'var(--amber)', icon: '♪' },
          { label: 'Mode',     value: isShuffled ? 'Shuffle' : 'Seq.', color: 'var(--purple)', icon: isShuffled ? '⇄' : '▶' },
          { label: 'Listeners', value: listeners, color: 'var(--ice)', icon: '👥' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div style={{ display: 'flex', align: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ color: s.color, fontSize: 12 }}>{s.icon}</span>
            </div>
            <div className="stat-value" style={{ color: s.color, fontSize: 20 }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Now Playing card */}
      <div className="card" style={{ marginBottom: 16 }}>
        {/* Status bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {running && (
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: np?.source === 'live' ? 'var(--green)' : 'var(--amber)',
                boxShadow: `0 0 8px ${np?.source === 'live' ? 'var(--green)' : 'var(--amber)'}`,
                animation: 'pulse-dot 2s ease-in-out infinite',
              }} />
            )}
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: running ? (np?.source === 'live' ? 'var(--green)' : 'var(--amber)') : 'var(--text-muted)',
            }}>
              {running ? (np?.source === 'live' ? 'Live Broadcast' : 'AutoDJ Running') : 'AutoDJ Stopped'}
            </span>
          </div>
          {running && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              👥 {listeners} listener{listeners !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {running && np ? (
          <>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 12, flexShrink: 0,
                background: 'linear-gradient(135deg, var(--amber-dim), rgba(96,207,255,0.06))',
                border: '1px solid var(--amber-mid)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
              }}>🎵</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-ghost)', letterSpacing: '0.08em', marginBottom: 4 }}>
                  {np.source === 'live' ? 'LIVE BROADCASTER' : 'NOW PLAYING'}
                </div>
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700,
                  letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {np.title || '—'}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3 }}>
                  {np.artist || 'Unknown artist'}
                </div>
              </div>
            </div>

            {/* Progress */}
            <div style={{ marginBottom: 8 }}>
              <div className="progress-track" style={{ marginBottom: 6 }}>
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)' }}>
                <span>{fmtTime(elapsed)}</span>
                <span style={{ color: 'var(--text-ghost)', fontSize: 10 }}>~{fmtTime(EST_DURATION)} est.</span>
                <span>-{fmtTime(remaining)}</span>
              </div>
            </div>
          </>
        ) : (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            {running ? '⏳ Loading track info…' : '▷ Start AutoDJ to begin broadcasting'}
          </div>
        )}

        {/* Next track */}
        {running && nextTrack && np?.source !== 'live' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', background: 'var(--bg-void)',
            borderRadius: 'var(--radius-md)', border: '1px solid var(--border-dim)', marginTop: 4,
          }}>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-ghost)' }}>NEXT</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              ♪ {nextTrack.title}{nextTrack.artist && nextTrack.artist !== 'Unknown' ? ` — ${nextTrack.artist}` : ''}
            </span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className={`btn btn-lg ${running ? 'btn-danger' : 'btn-primary'}`}
              disabled={loading} onClick={() => control(running ? 'stop' : 'start')}
              style={{ minWidth: 148 }}>
              {loading
                ? <><span className="spinner" style={{ width: 14, height: 14, ...(running ? {} : { borderTopColor: '#0a0a0a' }) }} /> Working…</>
                : running ? '⏹ Stop AutoDJ' : '▶ Start AutoDJ'}
            </button>

            <button className="btn btn-ghost"
              disabled={!running || skipLoading || np?.source === 'live'}
              onClick={skip}
              title={np?.source === 'live' ? 'Cannot skip during live broadcast' : 'Skip to next track'}>
              {skipLoading ? <span className="spinner" style={{ width: 13, height: 13 }} /> : '⏭'} Skip
            </button>
          </div>

          {/* Mode toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>MODE</span>
            <div style={{ display: 'flex', background: 'var(--bg-void)', border: '1px solid var(--border-base)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <button onClick={() => !isShuffled && setMode('shuffle')} disabled={modeLoading}
                className="btn btn-sm"
                style={{
                  borderRadius: 0, borderRight: '1px solid var(--border-dim)',
                  background: isShuffled ? 'var(--amber-dim)' : 'transparent',
                  color: isShuffled ? 'var(--amber)' : 'var(--text-muted)',
                  border: 'none', borderRight: '1px solid var(--border-dim)',
                }}>⇄ Shuffle</button>
              <button onClick={() => isShuffled && setMode('sequential')} disabled={modeLoading}
                className="btn btn-sm"
                style={{
                  borderRadius: 0,
                  background: !isShuffled ? 'var(--amber-dim)' : 'transparent',
                  color: !isShuffled ? 'var(--amber)' : 'var(--text-muted)',
                  border: 'none',
                }}>▶ Seq</button>
            </div>
          </div>
        </div>
      </div>

      {/* Warnings */}
      {!running && tracks.length === 0 && (
        <div className="alert alert-warn">
          <span>⚠</span> Add tracks to the playlist first, then AutoDJ will start automatically.
        </div>
      )}
      {!running && tracks.length > 0 && (
        <div className="alert alert-warn">
          <span>⚠</span> AutoDJ stopped. Click <strong>▶ Start AutoDJ</strong> above.
        </div>
      )}
      {expiredCount > 0 && (
        <div className="alert alert-error">
          <span>⚠</span> {expiredCount} YouTube track{expiredCount > 1 ? 's have' : ' has'} expired URLs. Go to Tracks tab and click ↻ Refresh.
        </div>
      )}

      {/* Priority chain */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title" style={{ marginBottom: 14 }}>Priority chain</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { p: '1', color: 'var(--green)', bg: 'var(--green-dim)', icon: '🎙', label: 'Live broadcaster', desc: `Connect BUTT/OBS to Liquidsoap harbor port ${credentials?.harbor_port || '?'}. AutoDJ pauses instantly.` },
            { p: '2', color: 'var(--amber)', bg: 'var(--amber-dim)', icon: '☁', label: `AutoDJ — ${tracks.length} track${tracks.length !== 1 ? 's' : ''}`, desc: `Streams 24/7. New uploads appear at next track boundary. Mode: ${isShuffled ? 'shuffle' : 'sequential'}.` },
            { p: '3', color: 'var(--text-ghost)', bg: 'var(--bg-overlay)', icon: '○', label: 'Silence', desc: 'Only if playlist is empty.' },
          ].map(({ p, color, bg, icon, label, desc }) => (
            <div key={p} style={{
              display: 'flex', gap: 12, padding: '12px 14px',
              background: 'var(--bg-void)', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-dim)', alignItems: 'flex-start',
            }}>
              <span style={{
                fontSize: 10, background: bg, color,
                padding: '2px 8px', borderRadius: 'var(--radius-full)',
                fontFamily: 'var(--font-mono)', fontWeight: 700,
                whiteSpace: 'nowrap', marginTop: 2, flexShrink: 0,
              }}>#{p}</span>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3, color: 'var(--text-primary)' }}>{label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Manual start */}
      <div className="card">
        <div className="section-title" style={{ marginBottom: 10 }}>Manual start</div>
        <div style={{
          background: 'var(--bg-void)', borderRadius: 'var(--radius-md)',
          padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: 12,
          color: 'var(--text-secondary)', border: '1px solid var(--border-dim)',
        }}>
          liquidsoap backend/liq/{station.mount_point}.liq
        </div>
      </div>
     <Footer />
    </div>
  );
}