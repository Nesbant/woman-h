import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { getProfile, listOrganizations, updateProfile } from '../../api/profile'
import type { ProfileInput } from '../../api/profile'
import type { Profile } from '../../types'
import { LockIcon } from '../../components/icons'
import { ErrorAlert, Loading, PageTitle } from '../../components/PageTitle'
import { useToast } from '../../components/Toast'
import { useAction } from '../../hooks/useAction'
import { useResource } from '../../hooks/useResource'

const FIELDS: [keyof Omit<ProfileInput, 'institution_id'>, string][] = [['document', 'Documento de identidad'], ['contact', 'Contacto'], ['position', 'Cargo'], ['area', 'Área'], ['relationship', 'Relación con la organización']]
const toInput = (p: Profile): ProfileInput => ({ institution_id: p.institution?.id ?? null, document: p.document, contact: p.contact, position: p.position, area: p.area, relationship: p.relationship })

async function loadProfile() {
  const [profile, organizations] = await Promise.all([getProfile(), listOrganizations()])
  return { profile, organizations }
}

function ProfileForm({ profile, organizations, busy, onSave }: { profile: Profile; organizations: { id: string; name: string }[]; busy: boolean; onSave: (input: ProfileInput) => void }) {
  const [form, setForm] = useState<ProfileInput>(toInput(profile))
  useEffect(() => setForm(toInput(profile)), [profile])
  const set = (patch: Partial<ProfileInput>) => setForm(f => ({ ...f, ...patch }))
  const submit = (event: FormEvent) => { event.preventDefault(); onSave({ ...form, ...Object.fromEntries(FIELDS.map(([k]) => [k, form[k]?.trim() || null])) }) }
  return <form className="panel" onSubmit={submit}>
    <div className="panel-head"><span className="roman">I</span><h3>Tus datos</h3></div>
    <div className="panel-body field-grid">
      <label className="field"><span>Nombres</span><input className="input" value={profile.name} readOnly /></label>
      {FIELDS.map(([key, label]) => <label key={key} className="field"><span>{label}</span>
        <input className="input" maxLength={200} value={form[key] ?? ''} placeholder="Opcional" onChange={e => set({ [key]: e.target.value })} /></label>)}
      <label className="field"><span>Tu organización</span>
        <select className="input" value={form.institution_id ?? ''} onChange={e => set({ institution_id: e.target.value || null })}>
          <option value="">Sin indicar</option>{organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
    </div>
    <div className="panel-foot" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <span>Se usan para prellenar la sección I de tus borradores. Los borradores que ya editaste no cambian.</span>
      <button className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Guardando…' : 'Guardar perfil'}</button>
    </div>
  </form>
}

export function ProfileView() {
  const { data, setData, error } = useResource(useCallback(loadProfile, []))
  const action = useAction()
  const { notify } = useToast()
  const save = async (input: ProfileInput) => {
    const profile = await action.run(() => updateProfile(input))
    if (profile && data) { setData({ ...data, profile }); notify('Perfil guardado.') }
  }
  return <>
    <PageTitle eyebrow="Espacio privado" title="Mi perfil" lead="Datos que confirmas sobre ti. VERA los usa como punto de partida; nunca se comparten sin que envíes un caso." />
    <div className="callout"><span className="icon"><LockIcon size={16} /></span><span><strong>Tu organización no ve tu perfil.</strong> Solo recibe lo que incluyas en un caso enviado.</span></div>
    <ErrorAlert message={error || action.error} />
    {!data ? !error && <Loading text="Cargando tu perfil…" /> : <ProfileForm profile={data.profile} organizations={data.organizations} busy={action.busy} onSave={save} />}
  </>
}
