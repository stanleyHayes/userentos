/**
 * Ama — RentOS friendly onboarding mascot.
 *
 * A warm, locally-relatable guide character. Inline SVG only — no external
 * assets. Two expressions: 'happy' (default greeting) and 'pointing' (drawing
 * attention to a feature).
 *
 * Visual language matches the brand palette in ErrorBoundary.tsx:
 *   navy primary  #1e3a5f
 *   amber accent  #f59e0b
 *   dark bg       #0c0e1a
 *
 * The character is drawn at viewBox 200x240. Width is controlled via the
 * `size` prop (defaults to 160px, scales the SVG).
 */

export type AmaExpression = 'happy' | 'pointing'

interface AmaProps {
  expression?: AmaExpression
  /** Pixel width; height is computed from the SVG aspect ratio. */
  size?: number
  /** Plays the entrance bounce when true (default). */
  animateIn?: boolean
  className?: string
}

export function Ama({
  expression = 'happy',
  size = 160,
  animateIn = true,
  className = '',
}: AmaProps) {
  // Trigger a one-shot entrance animation whenever the expression changes by
  // using the expression itself as the React key — changing keys remount the
  // node and replay the animation. Avoids a setState-in-effect cascade.
  const isPointing = expression === 'pointing'

  return (
    <div
      key={expression}
      className={`inline-block ${animateIn ? 'animate-ama-pop' : ''} ${className}`}
      style={{ width: size }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 200 240"
        width="100%"
        height="100%"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Ama, your RentOS guide"
      >
        <defs>
          <radialGradient id="amaGlow" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="amaSkin" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8a5a3b" />
            <stop offset="100%" stopColor="#6b4329" />
          </linearGradient>
          <linearGradient id="amaScarf" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
          <linearGradient id="amaBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1e3a5f" />
            <stop offset="100%" stopColor="#142844" />
          </linearGradient>
        </defs>

        {/* Soft glow halo */}
        <circle cx="100" cy="110" r="95" fill="url(#amaGlow)" />

        {/* Ground shadow (gentle floating) */}
        <ellipse
          cx="100"
          cy="226"
          rx="44"
          ry="6"
          className="fill-black/15 dark:fill-black/40"
        >
          <animate
            attributeName="rx"
            values="44;38;44"
            dur="3s"
            repeatCount="indefinite"
          />
        </ellipse>

        {/* Whole character bobs gently */}
        <g style={{ transformOrigin: '100px 120px' }}>
          <animateTransform
            attributeName="transform"
            type="translate"
            values="0 0; 0 -4; 0 0"
            dur="3s"
            repeatCount="indefinite"
          />

          {/* Body / kente-inspired tunic */}
          <g>
            {/* Tunic base */}
            <path
              d="M 60 170 Q 60 145 75 138 L 125 138 Q 140 145 140 170 L 145 215 Q 145 222 138 222 L 62 222 Q 55 222 55 215 Z"
              fill="url(#amaBody)"
            />
            {/* Kente accent stripe */}
            <rect x="55" y="180" width="90" height="6" fill="#f59e0b" />
            <rect x="55" y="190" width="90" height="2" fill="#fcd34d" />
            <rect x="55" y="198" width="90" height="3" fill="#1e3a5f" />
            {/* Collar V */}
            <path
              d="M 85 138 L 100 158 L 115 138 Z"
              fill="#0c0e1a"
              opacity="0.4"
            />
          </g>

          {/* Arms */}
          {isPointing ? (
            // Pointing arm raised to upper-right with finger
            <g>
              {/* Resting left arm */}
              <path
                d="M 60 170 Q 50 185 53 205 Q 54 212 62 212 Q 70 210 70 200 L 70 175 Z"
                fill="url(#amaBody)"
              />
              {/* Pointing right arm */}
              <g style={{ transformOrigin: '140px 165px' }}>
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  values="-2; 4; -2"
                  dur="2.4s"
                  repeatCount="indefinite"
                />
                <path
                  d="M 138 165 Q 162 150 178 130 Q 182 124 178 120 Q 174 116 168 120 L 145 138 Z"
                  fill="url(#amaBody)"
                />
                {/* Hand */}
                <circle cx="178" cy="122" r="9" fill="url(#amaSkin)" />
                {/* Pointer finger */}
                <path
                  d="M 178 116 Q 188 110 192 100"
                  stroke="url(#amaSkin)"
                  strokeWidth="6"
                  strokeLinecap="round"
                  fill="none"
                />
              </g>
            </g>
          ) : (
            // Default: both arms relaxed at sides, slight wave on right
            <g>
              <path
                d="M 60 170 Q 50 188 54 210 Q 55 217 63 217 Q 71 215 71 205 L 71 175 Z"
                fill="url(#amaBody)"
              />
              <g style={{ transformOrigin: '140px 175px' }}>
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  values="-3; 6; -3"
                  dur="2.8s"
                  repeatCount="indefinite"
                />
                <path
                  d="M 140 170 Q 150 188 146 210 Q 145 217 137 217 Q 129 215 129 205 L 129 175 Z"
                  fill="url(#amaBody)"
                />
                {/* Waving hand */}
                <circle cx="137" cy="217" r="8" fill="url(#amaSkin)" />
              </g>
            </g>
          )}

          {/* Head */}
          <g>
            {/* Neck */}
            <rect x="92" y="125" width="16" height="14" fill="url(#amaSkin)" />
            {/* Face */}
            <ellipse cx="100" cy="100" rx="36" ry="40" fill="url(#amaSkin)" />
            {/* Hair / head wrap (duku) — amber accent */}
            <path
              d="M 64 92 Q 60 60 100 56 Q 140 60 136 92 Q 130 80 120 76 Q 100 70 80 76 Q 70 80 64 92 Z"
              fill="url(#amaScarf)"
            />
            {/* Wrap fold detail */}
            <path
              d="M 64 92 Q 70 78 100 76 Q 130 78 136 92"
              stroke="#fcd34d"
              strokeWidth="2"
              fill="none"
              opacity="0.7"
            />
            {/* Wrap knot (top-right) */}
            <ellipse
              cx="128"
              cy="62"
              rx="9"
              ry="7"
              fill="#f59e0b"
              transform="rotate(20 128 62)"
            />
            <ellipse
              cx="134"
              cy="56"
              rx="6"
              ry="4"
              fill="#fcd34d"
              transform="rotate(20 134 56)"
            />

            {/* Ear */}
            <ellipse cx="64" cy="102" rx="4" ry="6" fill="url(#amaSkin)" />
            <ellipse cx="136" cy="102" rx="4" ry="6" fill="url(#amaSkin)" />
            {/* Hoop earring */}
            <circle
              cx="136"
              cy="110"
              r="3"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="1.5"
            />

            {/* Eyes — gentle blink loop */}
            <g>
              <ellipse cx="86" cy="100" rx="4" ry="5" fill="#0c0e1a">
                <animate
                  attributeName="ry"
                  values="5;5;0.4;5;5"
                  keyTimes="0;0.45;0.5;0.55;1"
                  dur="4s"
                  repeatCount="indefinite"
                />
              </ellipse>
              <ellipse cx="114" cy="100" rx="4" ry="5" fill="#0c0e1a">
                <animate
                  attributeName="ry"
                  values="5;5;0.4;5;5"
                  keyTimes="0;0.45;0.5;0.55;1"
                  dur="4s"
                  repeatCount="indefinite"
                />
              </ellipse>
              {/* Eye highlight */}
              <circle cx="87.5" cy="98.5" r="1.2" fill="#fff" />
              <circle cx="115.5" cy="98.5" r="1.2" fill="#fff" />
            </g>

            {/* Cheek warmth */}
            <ellipse cx="78" cy="112" rx="5" ry="3" fill="#d97706" opacity="0.35" />
            <ellipse cx="122" cy="112" rx="5" ry="3" fill="#d97706" opacity="0.35" />

            {/* Mouth */}
            {isPointing ? (
              // Slightly open, "O" shape — explaining
              <ellipse
                cx="100"
                cy="120"
                rx="4"
                ry="5"
                fill="#0c0e1a"
              />
            ) : (
              // Wide warm smile
              <path
                d="M 88 118 Q 100 130 112 118"
                stroke="#0c0e1a"
                strokeWidth="2.5"
                strokeLinecap="round"
                fill="none"
              />
            )}
          </g>
        </g>

        <style>{`
          @keyframes amaPop {
            0%   { transform: translateY(14px) scale(0.85); opacity: 0; }
            55%  { transform: translateY(-6px) scale(1.05); opacity: 1; }
            100% { transform: translateY(0) scale(1); opacity: 1; }
          }
        `}</style>
      </svg>

      <style>{`
        .animate-ama-pop {
          animation: amaPop 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        @keyframes amaPop {
          0%   { transform: translateY(14px) scale(0.85); opacity: 0; }
          55%  { transform: translateY(-6px) scale(1.05); opacity: 1; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
