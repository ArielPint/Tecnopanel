import { createContext, useContext, useState, ReactNode } from 'react'

interface GlobalModalsCtx {
  showNuevaOpp: boolean
  openNuevaOpp: () => void
  closeNuevaOpp: () => void
}

const Ctx = createContext<GlobalModalsCtx>({ showNuevaOpp: false, openNuevaOpp: () => {}, closeNuevaOpp: () => {} })

export function GlobalModalsProvider({ children }: { children: ReactNode }) {
  const [showNuevaOpp, setShowNuevaOpp] = useState(false)
  return (
    <Ctx.Provider value={{ showNuevaOpp, openNuevaOpp: () => setShowNuevaOpp(true), closeNuevaOpp: () => setShowNuevaOpp(false) }}>
      {children}
    </Ctx.Provider>
  )
}

export const useGlobalModals = () => useContext(Ctx)
