export default function UsuariosPage() {
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Usuarios</h1>
      <p className="max-w-xl text-sm text-gray-500 dark:text-white/50">
        La gestión de roles y accesos por proyecto (tabla <code>project_access</code>) se
        implementa en la Fase 4 — Admin Panel. Por ahora, todas las cuentas autenticadas ven todo
        el dashboard.
      </p>
    </div>
  )
}
