import React, { useEffect, useState, useRef } from 'react';
import api from '../utils/api';

export default function NowPlaying({ stationId, streamUrl }) {
  const [data, setData]       = useState(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume]   = useState(0.8);
  const audioRef = useRef(null);

  useEffect(() => {
    const doFetch = () => api.get(`/stations/${stationId}/now-playing`)
      .then(r => setData(r.data)).catch(() => {});
    doFetch();
    const iv = setInterval(doFetch, 5000);
    return () => clearInterval(iv);
  }, [stationId]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.load();
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  const isLive    = data?.is_live;
  const running   = data?.autodj_running;
  const title     = (data?.title && data.title !== 'AutoDJ') ? data.title : (data?.autodj_running ? 'AutoDJ' : '');
  const artist    = data?.artist || '';
  const listeners = data?.listeners ?? 0;

  const statusColor = !running ? 'var(--text-muted)' : isLive ? 'var(--green)' : 'var(--amber)';
  const statusLabel = !running ? 'OFFLINE' : isLive ? 'LIVE' : 'AUTODJ';

  return (
    <div className={`np-widget ${isLive ? 'is-live' : running ? 'is-autodj' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>

        {/* Play button */}
        <button onClick={togglePlay} style={{
          width: 44, height: 44, borderRadius: '50%',
          background: playing ? 'rgba(61,220,132,0.15)' : 'var(--amber-dim)',
          border: `1.5px solid ${playing ? 'rgba(61,220,132,0.4)' : 'var(--amber-mid)'}`,
          color: playing ? 'var(--green)' : 'var(--amber)',
          fontSize: 16, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          transition: 'all var(--t-fast) var(--ease)',
          boxShadow: playing ? '0 0 14px rgba(61,220,132,0.25)' : '0 0 14px rgba(245,166,35,0.2)',
        }}>
          {playing ? '⏹' : '▶'}
        </button>

        {/* Track info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>

            {/* Status indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {running && (
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: statusColor,
                  boxShadow: `0 0 6px ${statusColor}`,
                  animation: 'pulse-dot 2s ease-in-out infinite',
                  flexShrink: 0,
                }} />
              )}
              <span style={{
                fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 700,
                letterSpacing: '0.1em', color: statusColor, textTransform: 'uppercase',
              }}>
                {statusLabel}
              </span>
            </div>

            {running && isLive && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
              }}>
                · 👥 {listeners}
              </div>
            )}
          </div>

          {running ? (
            <>
              <div style={{
                fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-display)',
                color: 'var(--text-primary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                marginBottom: 1,
              }}>
                {title}
              </div>
              {artist && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {artist}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Station is offline
            </div>
          )}
        </div>

        {/* Waveform (visible when playing) */}
        {playing && (
          <div className="waveform">
            <div className="waveform-bar" style={{ height: '100%' }} />
            <div className="waveform-bar" />
            <div className="waveform-bar" style={{ height: '100%' }} />
            <div className="waveform-bar" />
            <div className="waveform-bar" style={{ height: '100%' }} />
          </div>
        )}

        {/* Volume */}
        {playing && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
            </span>
            <input type="range" min="0" max="1" step="0.05" value={volume}
              onChange={e => setVolume(parseFloat(e.target.value))}
              style={{ width: 70, accentColor: 'var(--amber)', cursor: 'pointer' }} />
          </div>
        )}

        {/* Stream URL */}
        <div style={{
          fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-ghost)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          maxWidth: 180, display: 'none',
        }}>
          {streamUrl}
        </div>
      </div>

      <audio ref={audioRef} src={streamUrl} preload="none"
        onEnded={() => setPlaying(false)} onError={() => setPlaying(false)} />
    </div>
  );
}