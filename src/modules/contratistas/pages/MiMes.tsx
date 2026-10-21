import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Input } from '@/modules/financiero/components/ui/input'
import { Label } from '@/modules/financiero/components/ui/label'
import { useAuthStore } from '@/store/authStore'
import { CeldaDoc, CeldaListado } from '@/modules/personal/components/DocsEmpresa'
import { DIA_LIMITE_EMPRESA, DOCS_EMPRESA } from '@/modules/personal/lib/catalogos'
import { ESTADO_MES, nombreMes, periodoDe, situacionMes } from '@/modules/personal/lib/contratistas'
import {
  confirmarListado,
  eliminarDocEmpresa,
  listarDocsEmpresas,
  listarListados,
  subirDocEmpresa,
  type DocEmpresa,
  type Listado,
} from '@/modules/personal/lib/api'
import { useEmpresa } from '../ContratistasApp'
import { misTrabajadores } from '../lib/api'

const msg = (err: unknown, porDefecto: string) => (err instanceof Error ? err.message : porDefecto)

/** Lo que la empresa tiene que dejar cada mes: los documentos y la confirmación del listado. */
export default function MiMes() {
  const { empresa, sso } = useEmpresa()
  const userId = useAuthStore((s) => s.user?.id)
  const [periodo, setPeriodo] = useState(periodoDe)
  const [docs, setDocs] = useState<DocEmpresa[]>([])
  const [listado, setListado] = useState<Listado | undefined>()
  const [activos, setActivos] = useState<number | undefined>()
  const [loading, setLoading] = useState(true)
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const [d, l, t] = await Promise.all([listarDocsEmpresas(periodo), listarListados(periodo), sso ? misTrabajadores(sso.id) : Promise.resolve([])])
      setDocs(d.filter((x) => x.empresa_id === empresa.id))
      setListado(l.find((x) => x.empresa_id === empresa.id))
      setActivos(t.filter((x) => x.activo).length)
    } catch (err) {
      toast.error(msg(err, 'Error al cargar'))
    } finally {
      setLoading(false)
    }
  }, [periodo, empresa.id, sso])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function hacer(accion: () => Promise<unknown>, exito: string) {
    setOcupado(true)
    try {
      await accion()
      toast.success(exito)
      await cargar()
    } catch (err) {
      toast.error(msg(err, 'No se pudo completar la acción'))
    } finally {
      setOcupado(false)
    }
  }

  const { estado, porCargar, porRevisar } = situacionMes(empresa.id, docs, listado ? [listado] : [], periodo)
  const futuro = periodo > periodoDe()

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold">Documentación de {nombreMes(periodo)}</h1>
          <p className="text-sm text-muted-foreground">
            Cada mes: confirmar el listado de trabajadores y subir los documentos. Plazo: día {DIA_LIMITE_EMPRESA} del mes. Tecnopanel revisa cada uno; si
            rechaza alguno, le llega un correo con el motivo y debe subirlo de nuevo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="cm-mes" className="text-sm">
            Mes
          </Label>
          <Input
            id="cm-mes"
            type="month"
            value={periodo.slice(0, 7)}
            max={periodoDe().slice(0, 7)}
            onChange={(e) => e.target.value && setPeriodo(`${e.target.value}-01`)}
            className="h-9 w-40"
          />
        </div>
      </div>

      {!empresa.activa && (
        <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
          Su empresa figura como inactiva en Tecnopanel: no se pueden subir documentos. Si es un error, avise a Tecnopanel.
        </p>
      )}

      {loading ? (
        <div className="h-40 animate-pulse rounded bg-muted" />
      ) : (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={ESTADO_MES[estado].variant}>{ESTADO_MES[estado].label}</Badge>
              <span className="text-sm text-muted-foreground">
                {estado === 'al_dia'
                  ? 'Tecnopanel aprobó todo lo del mes.'
                  : [porCargar.length ? `Falta subir o confirmar: ${porCargar.join(', ')}.` : '', porRevisar.length ? `Tecnopanel está revisando: ${porRevisar.join(', ')}.` : '']
                      .filter(Boolean)
                      .join(' ')}
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              <CeldaListado
                periodo={periodo}
                listado={listado}
                activos={activos}
                puedeConfirmar={empresa.activa && !futuro && !!sso}
                ocupado={ocupado}
                onConfirmar={() =>
                  window.confirm(
                    `¿Confirmar el listado de ${nombreMes(periodo)}? Quedan registrados sus ${activos ?? 0} trabajadores activos de hoy. Revise antes la pestaña Trabajadores.`,
                  ) && hacer(() => confirmarListado(periodo), 'Listado confirmado')
                }
              />
              {DOCS_EMPRESA.map((t) => (
                <CeldaDoc
                  key={t.key}
                  titulo={t.label}
                  archivos={docs.filter((d) => d.tipo === t.key)}
                  puedeSubir={empresa.activa && !futuro}
                  puedeBorrar={(d) => d.subido_por === userId && d.estado !== 'aprobado'}
                  ocupado={ocupado}
                  onSubir={(f) => hacer(() => subirDocEmpresa(empresa.id, periodo, t.key, f), 'Documento cargado')}
                  onBorrar={(d) => window.confirm(`¿Eliminar "${d.nombre}"?`) && hacer(() => eliminarDocEmpresa(d), 'Documento eliminado')}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              El listado es el de la pestaña{' '}
              <Link to="/contratistas/trabajadores" className="font-semibold text-brand hover:underline">
                Trabajadores
              </Link>
              : manténgalo al día (altas y bajas) y confírmelo cada mes. Si vuelve a confirmarlo, reemplaza al anterior del mismo mes.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
