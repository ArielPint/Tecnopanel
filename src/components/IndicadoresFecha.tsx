const MESES_LARGOS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

// `fecha`: corte de los indicadores. Por defecto hoy; el dashboard Ejecutivo pasa
// el fin del mes elegido en su filtro.
export function fechaIndicadoresLbl(fecha: Date = new Date()) {
  return `${fecha.getDate()} de ${MESES_LARGOS[fecha.getMonth()]} del ${fecha.getFullYear()}`
}

export function IndicadoresFecha({ fecha }: { fecha?: Date }) {
  return (
    <p className="text-[.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
      Indicadores al {fechaIndicadoresLbl(fecha)}
    </p>
  )
}
