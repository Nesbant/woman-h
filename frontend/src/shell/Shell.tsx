import type { DemoView } from '../api/session'
import type { User } from '../types'
import { navigate, NEW_RECORD, recordPath } from '../router'
import type { Route, Step } from '../router'
import { progress } from '../progress'
import { RecordContext } from '../recordContext'
import { Sidebar } from './Sidebar'
import { Stepper } from './Stepper'
import { Topbar } from './Topbar'
import { ViewRouter } from './ViewRouter'
import type { ShellData } from './useShellData'

const CRUMBS: Record<Step | 'enviado', string> = { registrar: 'Registrar', entender: 'Entender', preparar: 'Preparar reporte', compartir: 'Revisar y compartir', enviado: 'Caso enviado' }

function crumbs(route: Route, recordTitle: string | undefined): [string, string] {
  switch (route.name) {
    case 'home': return ['Mi espacio', '/ Situaciones']
    case 'profile': return ['Mi perfil', '/ Datos para tus reportes']
    case 'institutional': return ['VERA Institutional', '/ Casos recibidos']
    case 'record': return [CRUMBS[route.step], `/ ${recordTitle ?? (route.recordId === NEW_RECORD ? 'Nueva situación' : 'Situación')}`]
  }
}

function activePage(route: Route) {
  if (route.name === 'record') return route.step === 'enviado' ? 'compartir' : route.step
  return route.name === 'home' || route.name === 'profile' ? route.name : null
}

type Props = { route: Route; user: User; demo: boolean; onDemo: (view: DemoView) => void; onLogout: () => void; data: ShellData }

export function Shell({ route, user, demo, onDemo, onLogout, data }: Props) {
  const { done } = progress(data.overview)
  const page = activePage(route)
  const [title, subtitle] = crumbs(route, data.overview?.record.title)
  const goStep = (step: Step) => {
    if (data.recordId && data.recordId !== NEW_RECORD) navigate(recordPath(data.recordId, step))
    else if (step === 'registrar') navigate(recordPath(NEW_RECORD, 'registrar'))
  }
  const showStepper = route.name === 'record' && route.step !== 'enviado'
  return <RecordContext.Provider value={{ overview: data.overview, refresh: data.refresh }}>
    <div className="layout">
      <Sidebar user={user} demo={demo} onDemo={onDemo} onLogout={onLogout} institutional={data.institutional} caseCount={data.caseCount}
        page={page} recordId={data.recordId} overview={data.overview} done={done} onStep={goStep} />
      <div className="content">
        <Topbar title={title} subtitle={subtitle} institutional={data.institutional} user={user} />
        <main className="main">
          {showStepper && <Stepper active={page as Step} done={done} onGo={goStep} />}
          <ViewRouter route={route} user={user} demo={demo} onDemo={onDemo} />
        </main>
      </div>
    </div>
  </RecordContext.Provider>
}
