const MESES_LARGOS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export function fechaIndicadoresLbl() {
  const hoy = new Date()
  return `${hoy.getDate()} de ${MESES_LARGOS[hoy.getMonth()]} del ${hoy.getFullYear()}`
}

export function IndicadoresFecha() {
  return (
    <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
      Indicadores al {fechaIndicadoresLbl()}
    </p>
  )
}
