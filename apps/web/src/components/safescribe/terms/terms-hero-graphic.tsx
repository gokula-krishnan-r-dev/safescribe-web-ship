export function TermsHeroGraphic() {
  return (
    <svg
      viewBox="0 0 520 400"
      role="img"
      aria-label="Illustration of a signed document with a verification shield"
      className="ss-privacy-hero-svg"
    >
      <defs>
        <linearGradient id="ss-terms-page" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#F4FBFC" />
        </linearGradient>
        <linearGradient id="ss-terms-shield" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1AA3B8" />
          <stop offset="100%" stopColor="#008CA4" />
        </linearGradient>
        <filter id="ss-terms-soft" x="-25%" y="-25%" width="150%" height="150%">
          <feDropShadow dx="0" dy="16" stdDeviation="18" floodColor="#06244A" floodOpacity="0.12" />
        </filter>
      </defs>

      <ellipse cx="268" cy="342" rx="150" ry="22" fill="#06244A" opacity="0.06" />
      <circle cx="86" cy="92" r="50" fill="#E8F6F8" />
      <circle cx="438" cy="74" r="36" fill="#F3FAFB" />
      <circle cx="452" cy="256" r="58" fill="#F7FBFC" />

      <g opacity="0.32" fill="none" stroke="#087DB5" strokeWidth="1.6">
        <rect x="52" y="176" width="64" height="80" rx="10" />
        <path d="M64 196h40M64 212h28M64 228h36" />
        <ellipse cx="420" cy="300" rx="22" ry="11" />
        <ellipse cx="442" cy="290" rx="14" ry="8" />
      </g>

      <g filter="url(#ss-terms-soft)">
        <rect x="148" y="58" width="220" height="268" rx="18" fill="url(#ss-terms-page)" stroke="#D7E7EE" />
        <rect x="176" y="88" width="96" height="10" rx="5" fill="#06244A" opacity="0.78" />
        <rect x="176" y="118" width="164" height="7" rx="3.5" fill="#9BB0C4" />
        <rect x="176" y="138" width="148" height="7" rx="3.5" fill="#C5D3DF" />
        <rect x="176" y="158" width="156" height="7" rx="3.5" fill="#C5D3DF" />
        <rect x="176" y="178" width="120" height="7" rx="3.5" fill="#C5D3DF" />
        <path d="M176 230c18 18 36 28 52 8" fill="none" stroke="#087DB5" strokeWidth="3" strokeLinecap="round" />
        <line x1="176" y1="252" x2="268" y2="252" stroke="#D7E7EE" strokeWidth="2" />
      </g>

      <g filter="url(#ss-terms-soft)">
        <path
          d="M368 168c-2 10-16 18-40 22v54c0 34 18 56 40 70 22-14 40-36 40-70v-54c-24-4-38-12-40-22Z"
          fill="url(#ss-terms-shield)"
        />
        <path
          d="M352 214l12 12 22-24"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
