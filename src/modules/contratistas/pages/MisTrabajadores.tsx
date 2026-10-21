import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Pencil, Plus, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/modules/financiero/components/ui/badge'
import { Button } from '@/modules/financiero/components/ui/button'
import { Input } from '@/modules/financiero/components/ui/input'
import { FormTrabajador } from '@/modules/sso/components/FormTrabajador'
import { ImportarTrabajadores } from '@/modules/sso/components/ImportarTrabajadores'
import { actualizarTrabajador } from '@/modules/sso/lib/apiTrabajadores'
import { exportarTrabajadoresExcel } from '@/modules/sso/lib/importarTrabajadores'
import { formatearRut } from '@/modules/sso/lib/rut'
import { fmtFecha } from '@/modules/sso/lib/estados'
import type { TrabajadorV } from '@/modules/sso/lib/tiposTrabajadores'
import { useEmpresa } from '../ContratistasApp'
import { guardarFichas, misTrabajadores } from '../lib/api'

const msg = (err: unknown, porDefecto: string) => (err instanceof Error ? err.message : porDefecto)

/** Trabajadores de la empresa: los mismos de Prevención, con su formulario y su plantilla Excel. */
export default function MisTrabajadores() {
  const { empresa, sso } = useEmpresa()
  const [lista, setLista] = useState<TrabajadorV[]>([])
  const [loading, setLoading] = useState(true)
  const [texto, setTexto] = useState('')
  const [verBajas, setVerBajas] = useState(false)
  const [editar, setEditar] = useState<TrabajadorV | null | 'nuevo'>(null)
  const [importar, setImportar] = useState(false)

  const cargar = useCallback(async () => {
    if (!sso) return setLoading(false)
    try {
      setLista(await misTrabajadores(sso.id))
    } catch (err) {
      toast.error(msg(err, 'Error al cargar'))
    } finally {
      setLoading(false)
    }
  }, [sso])

  useEffect(() => {
    cargar()
  }, [cargar])

  const cargos = useMemo(() => [...new Set(lista.map((t) => t.cargo).filter((c): c is string => !!c))].sort(), [lista])
  const q = texto.trim().toLowerCase()
  const qRut = q.replace(/[^0-9k]/g, '')
  const visibles = lista
    .filter((t) => verBajas || t.activo)
    .filter(
      (t) =>
        !q ||
        `${t.nombres} ${t.apellidos}`.toLowerCase().includes(q) ||
        (t.cargo ?? '').toLowerCase().includes(q) ||
        (qRut.length >= 4 && t.rut.toLowerCase().replace('-', '').includes(qRut)),
    )
  const activos = lista.filter((t) => t.activo).length

  async function cambiarEstado(t: TrabajadorV) {
    const baja = t.activo
    if (baja && !window.confirm(`¿Dar de baja a ${t.nombres} ${t.apellidos}? Deja de aparecer en el listado del mes.`)) return
    try {
      await actualizarTrabajador(t.id, { activo: !baja })
      toast.success(baja ? 'Trabajador dado de baja' : 'Trabajador reactivado')
      await cargar()
    } catch (err) {
      toast.error(msg(err, 'No se pudo guardar'))
    }
  }

  if (!sso) {
    return (
      <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        Su empresa todavía no está enlazada con Prevención de Riesgos. Avise a Tecnopanel.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold">Trabajadores</h1>
          <p className="text-sm text-muted-foreground">
            {activos === 1 ? '1 trabajador activo' : `${activos} trabajadores activos`} de {empresa.nombre}. Es el listado que confirma cada mes y el que
            ve Prevención de Riesgos de Tecnopanel.
          </p>
        </div>
        {empresa.activa && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={lista.length === 0} onClick={() => exportarTrabajadoresExcel(lista, () => '', false)}>
              <Download className="mr-1 h-4 w-4" /> Exportar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setImportar(true)}>
              <Upload className="mr-1 h-4 w-4" /> Importar Excel
            </Button>
            <Button size="sm" onClick={() => setEditar('nuevo')}>
              <Plus className="mr-1 h-4 w-4" /> Agregar
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por nombre, RUT o cargo" className="h-9 w-full sm:w-72" />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={verBajas} onChange={(e) => setVerBajas(e.target.checked)} className="accent-[hsl(var(--brand))]" />
          Mostrar dados de baja
        </label>
      </div>

      {loading ? (
        <div className="h-40 animate-pulse rounded bg-muted" />
      ) : visibles.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {lista.length === 0 ? 'Todavía no hay trabajadores. Agréguelos uno a uno o con la plantilla Excel.' : 'No hay trabajadores con este filtro.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Trabajador</th>
                <th className="px-3 py-2 font-semibold">Cargo</th>
                <th className="px-3 py-2 font-semibold">Sucursal</th>
                <th className="px-3 py-2 font-semibold">Ingreso</th>
                <th className="px-3 py-2 font-semibold">Contacto</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {visibles.map((t) => (
                <tr key={t.id} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <p className="font-semibold">
                      {t.nombres} {t.apellidos}
                      {!t.activo && (
                        <Badge variant="secondary" className="ml-2">
                          Baja {fmtFecha(t.fecha_baja)}
                        </Badge>
                      )}
                    </p>
                    <p className="font-mono-tabular text-xs text-muted-foreground">{formatearRut(t.rut)}</p>
                  </td>
                  <td className="px-3 py-2">{t.cargo ?? '—'}</td>
                  <td className="px-3 py-2">{t.sucursal}</td>
                  <td className="px-3 py-2 font-mono-tabular">{fmtFecha(t.fecha_ingreso)}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{[t.telefono, t.email].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="px-3 py-2">
                    {empresa.activa && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditar(t)} aria-label={`Editar ${t.nombres}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => cambiarEstado(t)}>
                          {t.activo ? 'Dar de baja' : 'Reactivar'}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FormTrabajador
        open={editar !== null}
        onOpenChange={(v) => !v && setEditar(null)}
        trabajador={editar === 'nuevo' ? null : editar}
        empresas={[sso]}
        areas={[]}
        cargos={cargos}
        onGuardado={() => cargar()}
      />
      <ImportarTrabajadores
        open={importar}
        onOpenChange={setImportar}
        empresas={[sso]}
        areas={[]}
        existentes={lista}
        puedeCrearEmpresas={false}
        onImportado={() => cargar()}
        guardar={guardarFichas}
      />
    </div>
  )
}
