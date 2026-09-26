import type { ReactNode } from 'react'

export function PageTitle({ eyebrow, title, lead, inst, children }: { eyebrow: string; title: string; lead?: ReactNode; inst?: boolean; children?: ReactNode }) {
  return <div className="page-head">
    <div className="page-title"><span className={`eyebrow${inst ? ' inst' : ''}`}>{eyebrow}</span><h1>{title}</h1>{lead && <p>{lead}</p>}</div>
    {children}
  </div>
}

export function ErrorAlert({ message }: { message: string }) {
  return message ? <p role="alert" className="error">{message}</p> : null
}

export function Loading({ text }: { text: string }) {
  return <p role="status" className="loading">{text}</p>
}
