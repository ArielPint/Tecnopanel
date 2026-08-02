import { LogOut, UploadCloud } from 'lucide-react'
import isologo from '@/modules/financiero/assets/tecnopanel-isologo-color.png'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/modules/financiero/components/ui/tabs'
import { Button } from '@/modules/financiero/components/ui/button'
import { Card, CardContent } from '@/modules/financiero/components/ui/card'
import { Skeleton } from '@/modules/financiero/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/modules/financiero/components/ui/avatar'
import PortalShell from '@/modules/financiero/components/PortalShell'
import { useProyectoActual } from '@/hooks/useProyectoActual'
import { useAuth, type DashboardTab } from '../hooks/useAuth'
import { useExcelData } from '../hooks/useExcelData'
import Resumen from './Resumen'
import Modulos from './Modulos'
import Compras from './Compras'
import Productos from './Productos'
import Stock from './Stock'
import Curva from './Curva'
import Despachos from './Despachos'
import Ejecutivo from './Ejecutivo'
import Proyeccion from './Proyeccion'
import ProdDiaria from './ProdDiaria'

const TABS: { value: DashboardTab; label: string; implementado: boolean }[] = [
  { value: 'resumen', label: 'Resumen', implementado: true },
  { value: 'curva', label: 'Curva', implementado: true },
  { value: 'modulos', label: 'Módulos', implementado: true },
  { value: 'compras', label: 'Compras', implementado: true },
  { value: 'productos', label: 'Productos', implementado: true },
  { value: 'stock', label: 'Stock', implementado: true },
  { value: 'despachos', label: 'Despachos', implementado: true },
  { value: 'proyeccion', label: 'Proyección', implementado: true },
  { value: 'prod-diaria', label: 'Prod. diaria', implementado: true },
  { value: 'ejecutivo', label: 'Ejecutivo', implementado: true },
]

function iniciales(nombre: string | undefined) {
  if (!nombre) return '?'
  return nombre.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')
}

export default function DashboardLayout() {
  const { perfil, puedeVer, puedeSubirExcel, signOut } = useAuth()
  const { nombre: nombreProyecto } = useProyectoActual()
  const { excelData, autoLoading, uploading, error, handleFile } = useExcelData()
  const visibles = TABS.filter((t) => puedeVer(t.value))
  const primerTab = visibles.find((t) => t.implementado)?.value ?? visibles[0]?.value ?? 'resumen'

  return (
    <PortalShell actual="dashboard">
    <div className="flex flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4 md:px-6">
        <img src={isologo} alt="" className="size-7 shrink-0" />
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold tracking-wide text-muted-foreground uppercase">{nombreProyecto}</p>
          <p className="text-sm font-bold leading-none">Dashboard</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {excelData && puedeSubirExcel && (
            <label className="cursor-pointer text-xs text-muted-foreground underline">
              {uploading ? 'Procesando…' : 'Reemplazar archivo'}
              <input
                type="file"
                accept=".xlsm,.xlsx"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                }}
              />
            </label>
          )}
          <Avatar className="size-8">
            <AvatarFallback className="text-xs">{iniciales(perfil?.name)}</AvatarFallback>
          </Avatar>
          <Button variant="ghost" size="icon" onClick={signOut} title="Salir">
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      <main className="min-w-0 flex-1 overflow-x-auto p-4 md:p-6">
        {error && <p className="mb-3 text-xs text-destructive">{error}</p>}

        {autoLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
            <Skeleton className="h-[280px]" />
          </div>
        ) : !excelData ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <UploadCloud className="size-8 text-muted-foreground" />
              <p className="text-sm font-medium">No hay datos de avance cargados</p>
              {puedeSubirExcel ? (
                <>
                  <p className="max-w-md text-xs text-muted-foreground">
                    Sube el archivo LA CHACRA.xlsm para calcular los KPIs y gráficos del dashboard. Queda guardado para el resto del equipo.
                  </p>
                  <Button asChild disabled={uploading}>
                    <label className="cursor-pointer">
                      {uploading ? 'Procesando…' : 'Subir archivo .xlsm'}
                      <input
                        type="file"
                        accept=".xlsm,.xlsx"
                        className="hidden"
                        disabled={uploading}
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) handleFile(f)
                        }}
                      />
                    </label>
                  </Button>
                </>
              ) : (
                <p className="max-w-md text-xs text-muted-foreground">Pide a un administrador que suba el archivo LA CHACRA.xlsm.</p>
              )}
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue={primerTab}>
            <TabsList variant="line" className="mb-4 flex-wrap border-b">
              {visibles.map((t) => (
                <TabsTrigger key={t.value} value={t.value} disabled={!t.implementado}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="resumen">
              <Resumen excelData={excelData} />
            </TabsContent>
            <TabsContent value="curva">
              <Curva excelData={excelData} />
            </TabsContent>
            <TabsContent value="modulos">
              <Modulos excelData={excelData} />
            </TabsContent>
            <TabsContent value="compras">
              <Compras excelData={excelData} />
            </TabsContent>
            <TabsContent value="productos">
              <Productos excelData={excelData} />
            </TabsContent>
            <TabsContent value="stock">
              <Stock excelData={excelData} />
            </TabsContent>
            <TabsContent value="despachos">
              <Despachos excelData={excelData} />
            </TabsContent>
            <TabsContent value="proyeccion">
              <Proyeccion excelData={excelData} />
            </TabsContent>
            <TabsContent value="prod-diaria">
              <ProdDiaria />
            </TabsContent>
            <TabsContent value="ejecutivo">
              <Ejecutivo excelData={excelData} />
            </TabsContent>
            {visibles
              .filter((t) => !t.implementado)
              .map((t) => (
                <TabsContent key={t.value} value={t.value}>
                  <p className="py-10 text-center text-sm text-muted-foreground">Próximamente</p>
                </TabsContent>
              ))}
          </Tabs>
        )}
      </main>
    </div>
    </PortalShell>
  )
}
