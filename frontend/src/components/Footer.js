import React, { useEffect, useRef, useState } from 'react';

/* ─── SVG Icons ─────────────────────────────────────────────────── */
const InstagramIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
    <circle cx="12" cy="12" r="4"/>
    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
  </svg>
);

const DiscordIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
);

const CooeeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
    <path d="M8 12a4 4 0 0 0 8 0"/>
    <path d="M9 9h.01M15 9h.01"/>
    <path d="M12 6v2M12 16v2M6 12H4M20 12h-2"/>
  </svg>
);

const RadioWaveIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0"/>
    <path d="M9.5 9.5a3.5 3.5 0 0 0 0 5"/>
    <path d="M14.5 9.5a3.5 3.5 0 0 1 0 5"/>
    <path d="M7 7a7 7 0 0 0 0 10"/>
    <path d="M17 7a7 7 0 0 1 0 10"/>
  </svg>
);

/* ─── Animated waveform bars ─────────────────────────────────────── */
const Waveform = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 20 }}>
    {[0.6, 1, 0.75, 1, 0.5, 0.85, 1, 0.6].map((h, i) => (
      <div key={i} style={{
        width: 2.5,
        height: `${h * 100}%`,
        background: 'linear-gradient(180deg, #FF6B1A, #C9A84C)',
        borderRadius: 2,
        animation: `footerWave 1.2s ease-in-out ${i * 0.1}s infinite alternate`,
        opacity: 0.8,
      }} />
    ))}
  </div>
);

/* ─── Social link card ───────────────────────────────────────────── */
function SocialCard({ icon: Icon, platform, handle, href, accentColor, glowColor }) {
  const [hovered, setHovered] = useState(false);

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        borderRadius: 12,
        border: `1px solid ${hovered ? accentColor + '55' : 'rgba(255,255,255,0.06)'}`,
        background: hovered
          ? `linear-gradient(135deg, ${accentColor}12, ${accentColor}06)`
          : 'rgba(255,255,255,0.02)',
        textDecoration: 'none',
        transition: 'all 0.3s cubic-bezier(0.22,1,0.36,1)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hovered ? `0 8px 32px ${glowColor}` : '0 0 0 transparent',
        cursor: 'pointer',
        flex: '1 1 200px',
        minWidth: 0,
      }}
    >
      {/* Icon bubble */}
      <div style={{
        width: 38,
        height: 38,
        borderRadius: 10,
        background: hovered ? accentColor + '22' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${hovered ? accentColor + '66' : 'rgba(255,255,255,0.08)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: hovered ? accentColor : 'rgba(255,255,255,0.4)',
        transition: 'all 0.3s',
        flexShrink: 0,
        boxShadow: hovered ? `0 0 12px ${glowColor}` : 'none',
      }}>
        <Icon />
      </div>

      {/* Text */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 10,
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 600,
          letterSpacing: '0.1em',
          color: hovered ? accentColor : 'rgba(255,255,255,0.3)',
          textTransform: 'uppercase',
          marginBottom: 2,
          transition: 'color 0.3s',
        }}>
          {platform}
        </div>
        <div style={{
          fontSize: 14,
          fontFamily: "'Outfit', sans-serif",
          fontWeight: 600,
          color: hovered ? '#ffffff' : 'rgba(255,255,255,0.7)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          transition: 'color 0.3s',
        }}>
          {handle}
        </div>
      </div>

      {/* Arrow */}
      <div style={{
        marginLeft: 'auto',
        fontSize: 12,
        color: hovered ? accentColor : 'transparent',
        transition: 'all 0.3s',
        flexShrink: 0,
        transform: hovered ? 'translateX(2px)' : 'translateX(-4px)',
      }}>
        →
      </div>
    </a>
  );
}

/* ─── Main Footer ────────────────────────────────────────────────── */
export default function Footer() {
  const year = new Date().getFullYear();
  const [lineWidth, setLineWidth] = useState(0);
  const footerRef = useRef(null);

  // Animate the top separator line on mount
  useEffect(() => {
    const timer = setTimeout(() => setLineWidth(100), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <style>{`
        @keyframes footerWave {
          from { transform: scaleY(0.4); }
          to   { transform: scaleY(1); }
        }
        @keyframes footerPulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 12px rgba(255,107,26,0.5); }
          50%       { opacity: 0.6; box-shadow: 0 0 24px rgba(255,107,26,0.2); }
        }
        @keyframes footerScan {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        @keyframes footerFadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .footer-social-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        @media (max-width: 600px) {
          .footer-inner { padding: 36px 20px 24px !important; }
          .footer-top { flex-direction: column !important; gap: 28px !important; }
          .footer-brand { align-items: center !important; text-align: center !important; }
          .footer-bottom { flex-direction: column !important; gap: 10px !important; text-align: center !important; }
        }
      `}</style>

      <footer ref={footerRef} style={{
        background: 'linear-gradient(180deg, #080808 0%, #0a0a0a 60%, #060606 100%)',
        borderTop: '1px solid rgba(255,255,255,0.04)',
        position: 'relative',
        overflow: 'hidden',
      }}>

        {/* ── Animated top glow line ── */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 1,
          background: 'linear-gradient(90deg, transparent 0%, #FF6B1A 30%, #C9A84C 50%, #FF6B1A 70%, transparent 100%)',
          width: `${lineWidth}%`,
          transition: 'width 1.2s cubic-bezier(0.22,1,0.36,1)',
          boxShadow: '0 0 20px rgba(255,107,26,0.6), 0 0 60px rgba(255,107,26,0.2)',
        }} />

        {/* ── Scanning light effect ── */}
        <div style={{
          position: 'absolute', top: 0, left: 0, bottom: 0, width: '25%',
          background: 'linear-gradient(90deg, transparent, rgba(255,107,26,0.02), transparent)',
          animation: 'footerScan 8s ease-in-out infinite',
          pointerEvents: 'none',
        }} />

        {/* ── Background radial glow ── */}
        <div style={{
          position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
          width: 600, height: 300,
          background: 'radial-gradient(ellipse, rgba(255,107,26,0.04) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div className="footer-inner" style={{
          maxWidth: 1120, margin: '0 auto',
          padding: '48px 28px 28px',
          position: 'relative', zIndex: 1,
          animation: 'footerFadeUp 0.6s ease both',
        }}>

          {/* ── Top section ── */}
          <div className="footer-top" style={{
            display: 'flex',
            gap: 48,
            marginBottom: 40,
            alignItems: 'flex-start',
          }}>

            {/* Brand column */}
            <div className="footer-brand" style={{
              display: 'flex', flexDirection: 'column', gap: 16,
              minWidth: 220, flexShrink: 0,
            }}>
              {/* Logo + Name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: 'linear-gradient(135deg, #FF6B1A22, #C9A84C22)',
                  border: '1px solid rgba(255,107,26,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#FF6B1A',
                  animation: 'footerPulse 3s ease-in-out infinite',
                  flexShrink: 0,
                }}>
                  <RadioWaveIcon />
                </div>
                <div>
                  <div style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: 18, fontWeight: 800,
                    letterSpacing: '-0.03em',
                    background: 'linear-gradient(135deg, #FF6B1A, #C9A84C, #FF6B1A)',
                    backgroundSize: '200% auto',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    animation: 'gold-shimmer 3s linear infinite',
                  }}>
                    Gringo Radio
                  </div>
                  <div style={{
                    fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                    color: 'rgba(255,255,255,0.25)', letterSpacing: '0.12em',
                    textTransform: 'uppercase', marginTop: 1,
                  }}>
                    Stream · Live · Broadcast
                  </div>
                </div>
              </div>

              {/* Waveform + status */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px',
                background: 'rgba(255,107,26,0.05)',
                border: '1px solid rgba(255,107,26,0.12)',
                borderRadius: 10,
              }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: '#FF6B1A',
                  boxShadow: '0 0 8px #FF6B1A',
                  animation: 'footerPulse 2s ease-in-out infinite',
                  flexShrink: 0,
                }} />
                <span style={{
                  fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                  color: 'rgba(255,107,26,0.8)', fontWeight: 600,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                }}>On Air</span>
                <div style={{ marginLeft: 'auto' }}>
                  <Waveform />
                </div>
              </div>

              {/* Dev credit */}
              <div style={{
                padding: '12px 14px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: 10,
              }}>
                <div style={{
                  fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                  color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em',
                  textTransform: 'uppercase', marginBottom: 5,
                }}>
                  Created by
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: 'linear-gradient(135deg, rgba(255,107,26,0.3), rgba(201,168,76,0.2))',
                    border: '1px solid rgba(255,107,26,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, color: '#FF6B1A',
                    fontFamily: "'Outfit', sans-serif",
                  }}>A</div>
                  <div>
                    <div style={{
                      fontSize: 13, fontWeight: 700,
                      fontFamily: "'Outfit', sans-serif",
                      color: 'rgba(255,255,255,0.85)',
                    }}>Anis Soprano</div>
                    <div style={{
                      fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                      color: 'rgba(255,107,26,0.6)',
                    }}>@Gringo</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div style={{
              width: 1, alignSelf: 'stretch', flexShrink: 0,
              background: 'linear-gradient(180deg, transparent, rgba(255,107,26,0.2), rgba(255,255,255,0.04), transparent)',
            }} />

            {/* Socials column */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                color: 'rgba(255,255,255,0.2)', letterSpacing: '0.12em',
                textTransform: 'uppercase', marginBottom: 14,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(255,107,26,0.3), transparent)' }} />
                Connect
                <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg, rgba(255,107,26,0.3), transparent)' }} />
              </div>

              <div className="footer-social-grid">
                <SocialCard
                  icon={InstagramIcon}
                  platform="Instagram"
                  handle="gringo_soprano"
                  href="https://instagram.com/gringo_soprano"
                  accentColor="#E1306C"
                  glowColor="rgba(225,48,108,0.2)"
                />
                <SocialCard
                  icon={CooeeIcon}
                  platform="Club Cooee"
                  handle="soprano_don"
                  href="https://pt.clubcooee.com/users/view/SoPraNo_DoN"
                  accentColor="#FF6B1A"
                  glowColor="rgba(255,107,26,0.2)"
                />
                <SocialCard
                  icon={DiscordIcon}
                  platform="Discord"
                  handle="boukom"
                  href="https://discord.com/users/boukom"
                  accentColor="#5865F2"
                  glowColor="rgba(88,101,242,0.2)"
                />
              </div>
            </div>
          </div>

          {/* ── Separator ── */}
          <div style={{
            height: 1, marginBottom: 20,
            background: 'linear-gradient(90deg, transparent, rgba(255,107,26,0.15), rgba(201,168,76,0.1), rgba(255,107,26,0.15), transparent)',
          }} />

          {/* ── Bottom bar ── */}
          <div className="footer-bottom" style={{
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: 16,
          }}>
            <div style={{
              fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
              color: 'rgba(255,255,255,0.2)',
            }}>
              © {year} <span style={{ color: 'rgba(255,107,26,0.6)' }}>Gringo Radio</span>. All rights reserved.
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 5, height: 5, borderRadius: '50%',
                background: '#FF6B1A',
                boxShadow: '0 0 6px #FF6B1A',
                animation: 'footerPulse 2s ease-in-out infinite',
              }} />
              <span style={{
                fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                color: 'rgba(255,107,26,0.5)', letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}>
                Built with ♥ by Anis Soprano
              </span>
            </div>
          </div>

        </div>
      </footer>
    </>
  );
}
