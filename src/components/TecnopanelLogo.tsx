import icon from '../assets/tecnopanel-icon.png'

// Isologo real (recortado del brandbook oficial, no una reconstrucción a
// mano) + wordmark en texto, en el layout horizontal compacto que ya se usa
// en La Chacra: ícono — TECNOPANEL (TECNO + PANEL en rojo) — ®.

export function TecnopanelMark({
  size = 28,
  className = '',
}: {
  size?: number
  className?: string
}) {
  return <img src={icon} alt="" className={className} style={{ height: size, width: 'auto' }} />
}

export function TecnopanelWordmark({
  variant = 'dark',
  className = '',
}: {
  variant?: 'dark' | 'light'
  className?: string
}) {
  return (
    <span className={`inline-flex items-baseline gap-0.5 font-display font-extrabold uppercase leading-none tracking-tight ${className}`}>
      <span className={variant === 'dark' ? 'text-white' : 'text-tecnopanel-plomo'}>Tecno</span>
      <span className="text-tecnopanel">Panel</span>
      <sup className={`text-[8px] font-semibold ${variant === 'dark' ? 'text-white/60' : 'text-gray-400'}`}>
        ®
      </sup>
    </span>
  )
}

export default function TecnopanelLogo({
  variant = 'dark',
  className = '',
}: {
  variant?: 'dark' | 'light'
  className?: string
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <TecnopanelMark size={30} className="shrink-0" />
      <TecnopanelWordmark variant={variant} className="text-base" />
    </div>
  )
}
