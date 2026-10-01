export function PrivacyHeroGraphic() {
  return (
    <svg
      viewBox="0 0 520 400"
      role="img"
      aria-label="Illustration of a lock on a shield, representing privacy by design"
      className="ss-privacy-hero-svg"
    >
      <defs>
        <linearGradient id="ss-privacy-shield" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1AA3B8" />
          <stop offset="100%" stopColor="#008CA4" />
        </linearGradient>
        <linearGradient id="ss-privacy-glow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#D7F0F4" />
          <stop offset="100%" stopColor="#F4FBFC" />
        </linearGradient>
        <filter id="ss-privacy-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="14" stdDeviation="18" floodColor="#06244A" floodOpacity="0.12" />
        </filter>
      </defs>

      <ellipse cx="268" cy="338" rx="148" ry="22" fill="#06244A" opacity="0.06" />
      <circle cx="92" cy="86" r="54" fill="url(#ss-privacy-glow)" />
      <circle cx="430" cy="78" r="38" fill="#E8F6F8" />
      <circle cx="448" cy="248" r="62" fill="#F3FAFB" />

      <g opacity="0.35" fill="none" stroke="#087DB5" strokeWidth="1.6">
        <rect x="48" y="168" width="72" height="88" rx="10" />
        <path d="M62 188h44M62 204h32M62 220h40" />
        <circle cx="452" cy="132" r="22" />
        <circle cx="452" cy="124" r="8" />
        <path d="M436 152c4-10 28-10 32 0" />
        <ellipse cx="88" cy="78" rx="28" ry="14" />
        <ellipse cx="108" cy="68" rx="18" ry="10" />
        <ellipse cx="414" cy="292" rx="24" ry="12" />
        <ellipse cx="438" cy="282" rx="16" ry="9" />
      </g>

      <g filter="url(#ss-privacy-soft)">
        <path
          d="M260 52c-4 18-28 32-72 40v96c0 62 32 104 72 128 40-24 72-66 72-128V92c-44-8-68-22-72-40Z"
          fill="url(#ss-privacy-shield)"
        />
        <path
          d="M260 68c-2 12-22 24-56 30v86c0 50 26 86 56 106 30-20 56-56 56-106V98c-34-6-54-18-56-30Z"
          fill="#0E9BB0"
          opacity="0.28"
        />
        <rect x="226" y="168" width="68" height="78" rx="12" fill="#FFFFFF" />
        <path
          d="M248 168v-16a12 12 0 0 1 24 0v16"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <circle cx="260" cy="204" r="7" fill="#008CA4" />
        <rect x="257" y="210" width="6" height="16" rx="3" fill="#008CA4" />
      </g>
    </svg>
  );
}
