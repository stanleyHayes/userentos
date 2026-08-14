export function DoodleArrow({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="120" height="60" viewBox="0 0 120 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 45C20 50 40 35 55 30C70 25 85 28 100 15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="6 4" />
      <path d="M90 12L102 14L96 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function DoodleCircle({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M50 8C70 6 90 20 92 42C94 64 78 88 52 90C26 92 8 72 6 50C4 28 22 10 50 8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="8 5" />
    </svg>
  )
}

export function DoodleUnderline({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="200" height="16" viewBox="0 0 200 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 10C30 4 60 12 90 8C120 4 150 10 197 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M10 13C50 8 100 14 140 10C170 7 190 11 195 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
    </svg>
  )
}

export function DoodleStars({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 10L22 18L20 26L18 18Z" stroke="currentColor" strokeWidth="1.5" fill="currentColor" opacity="0.6" />
      <path d="M55 5L57 11L55 17L53 11Z" stroke="currentColor" strokeWidth="1.5" fill="currentColor" opacity="0.4" />
      <path d="M65 35L67 41L65 47L63 41Z" stroke="currentColor" strokeWidth="1.5" fill="currentColor" opacity="0.5" />
      <path d="M10 50L12 54L10 58L8 54Z" stroke="currentColor" strokeWidth="1.5" fill="currentColor" opacity="0.3" />
      <path d="M40 60L42 66L40 72L38 66Z" stroke="currentColor" strokeWidth="1.5" fill="currentColor" opacity="0.5" />
    </svg>
  )
}

export function DoodleSpiral({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M30 30C30 25 35 22 38 25C41 28 38 35 33 35C28 35 24 30 24 25C24 18 30 14 37 14C46 14 50 22 50 30C50 40 42 48 32 48C20 48 12 38 12 27" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function DoodleZigzag({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="150" height="20" viewBox="0 0 150 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 17L15 3L27 17L39 3L51 17L63 3L75 17L87 3L99 17L111 3L123 17L135 3L147 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function DoodleBlob({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <path fill="currentColor" d="M44.7,-76.4C58.8,-69.2,71.8,-58.1,79.6,-44.3C87.3,-30.5,89.8,-14,88.1,1.9C86.4,17.8,80.5,33.2,71.3,46.3C62.1,59.5,49.6,70.4,35.4,77.1C21.2,83.8,5.4,86.3,-10.1,84.3C-25.6,82.3,-40.8,75.8,-53.6,66.1C-66.4,56.4,-76.8,43.5,-82.3,28.6C-87.8,13.7,-88.4,-3.2,-84.2,-18.8C-80,-34.4,-71,-48.7,-58.7,-57.1C-46.4,-65.5,-30.8,-68,-16.2,-72.8C-1.6,-77.6,12,-83.6,25.4,-82.8C38.8,-82,30.6,-83.6,44.7,-76.4Z" transform="translate(100 100)" />
    </svg>
  )
}
