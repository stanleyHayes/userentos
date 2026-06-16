export function HouseIllustration({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 400 300" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Sky */}
      <rect width="400" height="300" rx="16" fill="#f0f7ff" />
      {/* Sun */}
      <circle cx="320" cy="60" r="30" fill="#fbbf24" opacity="0.8" />
      <circle cx="320" cy="60" r="40" fill="#fbbf24" opacity="0.2" />
      {/* Cloud */}
      <ellipse cx="100" cy="50" rx="40" ry="15" fill="white" />
      <ellipse cx="130" cy="45" rx="30" ry="12" fill="white" />
      <ellipse cx="80" cy="45" rx="25" ry="10" fill="white" />
      {/* Ground */}
      <rect y="220" width="400" height="80" fill="#86efac" rx="0" />
      <rect y="210" width="400" height="20" fill="#4ade80" rx="0" />
      {/* House body */}
      <rect x="120" y="130" width="160" height="100" fill="#f8fafc" stroke="#1e3a5f" strokeWidth="3" rx="2" />
      {/* Roof */}
      <path d="M100 135L200 65L300 135" fill="#1e3a5f" stroke="#1e3a5f" strokeWidth="3" strokeLinejoin="round" />
      <path d="M110 135L200 72L290 135" fill="#2d5a8e" />
      {/* Door */}
      <rect x="180" y="180" width="40" height="50" fill="#f59e0b" rx="2" />
      <circle cx="212" cy="208" r="3" fill="#1e3a5f" />
      {/* Windows */}
      <rect x="140" y="155" width="30" height="25" fill="#bfdbfe" stroke="#1e3a5f" strokeWidth="2" rx="2" />
      <line x1="155" y1="155" x2="155" y2="180" stroke="#1e3a5f" strokeWidth="1.5" />
      <line x1="140" y1="167" x2="170" y2="167" stroke="#1e3a5f" strokeWidth="1.5" />
      <rect x="230" y="155" width="30" height="25" fill="#bfdbfe" stroke="#1e3a5f" strokeWidth="2" rx="2" />
      <line x1="245" y1="155" x2="245" y2="180" stroke="#1e3a5f" strokeWidth="1.5" />
      <line x1="230" y1="167" x2="260" y2="167" stroke="#1e3a5f" strokeWidth="1.5" />
      {/* Chimney */}
      <rect x="240" y="75" width="20" height="40" fill="#94a3b8" stroke="#1e3a5f" strokeWidth="2" />
      {/* Tree */}
      <rect x="50" y="170" width="10" height="50" fill="#92400e" />
      <circle cx="55" cy="160" r="25" fill="#16a34a" />
      <circle cx="45" cy="145" r="18" fill="#22c55e" />
      <circle cx="65" cy="150" r="20" fill="#15803d" />
      {/* Tree 2 */}
      <rect x="340" y="175" width="8" height="40" fill="#92400e" />
      <circle cx="344" cy="165" r="20" fill="#16a34a" />
      <circle cx="336" cy="155" r="15" fill="#22c55e" />
      {/* Path */}
      <path d="M190 230L180 300" stroke="#d4d4d8" strokeWidth="20" strokeLinecap="round" />
      <path d="M210 230L220 300" stroke="#d4d4d8" strokeWidth="20" strokeLinecap="round" />
      {/* Fence */}
      {[310, 325, 340, 355, 370].map((x) => (
        <g key={x}>
          <rect x={x} y="195" width="4" height="25" fill="white" stroke="#d4d4d8" strokeWidth="1" />
          <polygon points={`${x},195 ${x+2},189 ${x+4},195`} fill="white" stroke="#d4d4d8" strokeWidth="1" />
        </g>
      ))}
      <rect x="308" y="203" width="68" height="3" fill="white" stroke="#d4d4d8" strokeWidth="1" />
      <rect x="308" y="212" width="68" height="3" fill="white" stroke="#d4d4d8" strokeWidth="1" />
    </svg>
  )
}

export function SavingsIllustration({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 300 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="300" height="200" rx="16" fill="#f0fdf4" />
      {/* Piggy bank body */}
      <ellipse cx="150" cy="120" rx="70" ry="55" fill="#fbbf24" />
      <ellipse cx="150" cy="120" rx="70" ry="55" fill="url(#piggyGrad)" />
      {/* Ears */}
      <ellipse cx="110" cy="80" rx="15" ry="20" fill="#f59e0b" transform="rotate(-15 110 80)" />
      <ellipse cx="190" cy="80" rx="15" ry="20" fill="#f59e0b" transform="rotate(15 190 80)" />
      {/* Snout */}
      <ellipse cx="215" cy="120" rx="20" ry="15" fill="#f59e0b" />
      <circle cx="210" cy="116" r="3" fill="#92400e" />
      <circle cx="220" cy="116" r="3" fill="#92400e" />
      {/* Eye */}
      <circle cx="185" cy="100" r="5" fill="white" />
      <circle cx="186" cy="99" r="3" fill="#1e3a5f" />
      {/* Legs */}
      <rect x="110" y="160" width="15" height="20" fill="#f59e0b" rx="4" />
      <rect x="135" y="165" width="15" height="15" fill="#f59e0b" rx="4" />
      <rect x="160" y="165" width="15" height="15" fill="#f59e0b" rx="4" />
      <rect x="185" y="160" width="15" height="20" fill="#f59e0b" rx="4" />
      {/* Coin slot */}
      <rect x="140" y="68" width="30" height="6" fill="#92400e" rx="3" />
      {/* Coins */}
      <circle cx="70" cy="50" r="15" fill="#fbbf24" stroke="#f59e0b" strokeWidth="2" />
      <text x="70" y="55" textAnchor="middle" fill="#92400e" fontSize="12" fontWeight="bold">G</text>
      <circle cx="50" cy="80" r="12" fill="#fbbf24" stroke="#f59e0b" strokeWidth="2" />
      <text x="50" y="84" textAnchor="middle" fill="#92400e" fontSize="10" fontWeight="bold">G</text>
      <circle cx="240" cy="45" r="13" fill="#fbbf24" stroke="#f59e0b" strokeWidth="2" />
      <text x="240" y="49" textAnchor="middle" fill="#92400e" fontSize="11" fontWeight="bold">G</text>
      {/* Sparkles */}
      <path d="M80 30L82 36L80 42L78 36Z" fill="#fbbf24" />
      <path d="M250 70L252 74L250 78L248 74Z" fill="#fbbf24" />
      <path d="M45 40L47 44L45 48L43 44Z" fill="#fbbf24" />
      <defs>
        <linearGradient id="piggyGrad" x1="80" y1="65" x2="220" y2="175">
          <stop stopColor="#fbbf24" stopOpacity="0" />
          <stop offset="1" stopColor="#f59e0b" stopOpacity="0.3" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function LegalIllustration({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 300 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="300" height="200" rx="16" fill="#eef2ff" />
      {/* Scale */}
      <rect x="145" y="40" width="10" height="100" fill="#1e3a5f" rx="2" />
      {/* Beam */}
      <line x1="70" y1="65" x2="230" y2="65" stroke="#1e3a5f" strokeWidth="5" strokeLinecap="round" />
      {/* Triangle top */}
      <polygon points="150,30 145,45 155,45" fill="#1e3a5f" />
      {/* Left pan */}
      <path d="M60 70L80 70L90 95L50 95Z" fill="#2d5a8e" />
      <ellipse cx="70" cy="95" rx="25" ry="5" fill="#1e3a5f" />
      {/* Right pan */}
      <path d="M220 70L240 70L250 95L210 95Z" fill="#2d5a8e" />
      <ellipse cx="230" cy="95" rx="25" ry="5" fill="#1e3a5f" />
      {/* Chains */}
      <line x1="70" y1="65" x2="60" y2="70" stroke="#64748b" strokeWidth="2" />
      <line x1="70" y1="65" x2="80" y2="70" stroke="#64748b" strokeWidth="2" />
      <line x1="230" y1="65" x2="220" y2="70" stroke="#64748b" strokeWidth="2" />
      <line x1="230" y1="65" x2="240" y2="70" stroke="#64748b" strokeWidth="2" />
      {/* Base */}
      <rect x="120" y="140" width="60" height="10" fill="#1e3a5f" rx="3" />
      <rect x="110" y="148" width="80" height="8" fill="#0f1f33" rx="2" />
      {/* Book */}
      <rect x="30" y="130" width="50" height="40" fill="#fbbf24" rx="3" stroke="#f59e0b" strokeWidth="2" />
      <line x1="55" y1="130" x2="55" y2="170" stroke="#f59e0b" strokeWidth="2" />
      <line x1="38" y1="140" x2="52" y2="140" stroke="#92400e" strokeWidth="1.5" />
      <line x1="38" y1="147" x2="50" y2="147" stroke="#92400e" strokeWidth="1.5" />
      <line x1="38" y1="154" x2="52" y2="154" stroke="#92400e" strokeWidth="1.5" />
      {/* Gavel */}
      <rect x="220" y="130" width="50" height="12" fill="#92400e" rx="3" transform="rotate(-30 245 136)" />
      <rect x="250" y="145" width="8" height="25" fill="#78350f" rx="2" />
    </svg>
  )
}
