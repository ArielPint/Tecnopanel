interface KpiCardProps {
  label: string
  value: number
}

export default function KpiCard({ label, value }: KpiCardProps) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm dark:bg-neutral-800 dark:border-white/10">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-white/50">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-tecnopanel">
        {new Intl.NumberFormat('es-CL').format(value)}
      </p>
    </div>
  )
}
