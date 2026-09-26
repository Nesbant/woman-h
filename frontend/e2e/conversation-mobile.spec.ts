import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const example = JSON.parse(readFileSync(new URL('../../contracts/examples/conversation.json', import.meta.url), 'utf8'))
const turnExample = JSON.parse(readFileSync(new URL('../../contracts/examples/chat_turn_candidate.json', import.meta.url), 'utf8'))

test.use({ viewport: { width: 390, height: 844 } })

test('conversación a 390 px conserva foco, texto y ancho al usar panel, adjuntos y cronología', async ({ page }) => {
  const caseState = { ...example.case_state, case_id: 'r1', events: [], evidence: [],
    counts: { candidate: 0, confirmed: 0, corrected: 0, discarded: 0, with_evidence: 0 } }
  const timeline = { revision: 1, mode: 'fixture', configured_mode: 'fixture', processed_at: '2026-09-26T00:00:00Z',
    events: [], warnings: [], review_items: [] }
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    const response = path === '/api/health' ? { demo: false }
      : path === '/api/auth/me' ? { id: 'u1', name: 'María', email: 'maria@example.test', memberships: [] }
        : path === '/api/records' ? [{ id: 'r1', title: 'Situación', created_at: '', updated_at: '' }]
          : path === '/api/records/r1/overview' ? { record: { id: 'r1', title: 'Situación', private_note: null, created_at: '', updated_at: '' },
            story: null, files: 0, timeline: { processed: true, revision: 1, total: 0, pending: 0, accepted: 0, discarded: 0, open_review_items: 0 },
            draft: { exists: false, reviewed: false, stale: false }, submissions: [] }
            : path === '/api/records/r1/conversation' ? { case_id: 'r1', messages: [], case_state: caseState }
              : path === '/api/records/r1/conversation/state' ? caseState
                : path === '/api/records/r1/timeline' ? timeline
                  : path === '/api/records/r1/files' && method === 'POST' ? { id: 'f1', filename: 'evidencia-con-un-nombre-muy-muy-largo-para-probar-overflow.pdf',
                    description: 'Correo', media_type: 'application/pdf', size: 4, sha256: 'a'.repeat(64), created_at: '', account_ids: [] }
                    : path === '/api/records/r1/files/f1' && method === 'DELETE' ? {}
                    : path === '/api/records/r1/conversation/messages' && method === 'POST' ? {
                      ...turnExample, user_message: { ...turnExample.user_message, text: route.request().postDataJSON().text,
                        client_message_id: route.request().postDataJSON().client_message_id },
                      suggested_actions: [{ type: 'keep_talking', label: 'Seguir conversando', event_ids: [], file_ids: [] }],
                      case_state: caseState,
                    } : null
    await route.fulfill({ status: response ? 200 : 404, contentType: 'application/json', body: JSON.stringify(response ?? { detail: path }) })
  })
  await page.goto('/#/s/r1/conversar')
  await expect(page.getByRole('heading', { name: '¿Qué pasó? Puedes empezar por donde quieras.' })).toBeVisible()
  await expect(page.getByRole('note', { name: 'Modo de conversación' })).toHaveText('Modo demostración')
  const noOverflow = async () => expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  await noOverflow()
  const composer = page.getByRole('textbox', { name: 'Tu mensaje' })
  for (let i = 0; i < 25 && await page.evaluate(() => document.activeElement?.id !== 'chat-text'); i++) await page.keyboard.press('Tab')
  await expect(composer).toBeFocused()
  expect(await composer.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid')
  await composer.fill('Texto que conservaré')
  await page.getByRole('button', { name: 'Mostrar panel' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Ocultar panel' })).toHaveAttribute('aria-expanded', 'true')
  await noOverflow()
  await page.getByRole('button', { name: 'Ocultar panel' }).focus()
  await page.keyboard.press('Enter')
  await expect(composer).toHaveValue('Texto que conservaré')
  await composer.focus()
  await page.keyboard.press('Shift+Enter')
  await expect(composer).toHaveValue('Texto que conservaré\n')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Seguir conversando' })).toBeVisible()
  await expect(page.getByRole('note', { name: 'Modo de conversación' })).toHaveText('Modo demostración')
  await page.getByRole('button', { name: 'Seguir conversando' }).focus()
  await page.keyboard.press('Enter')
  await expect(composer).toBeFocused()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Adjuntar archivo' }).focus()
  await page.keyboard.press('Enter')
  await (await chooser).setFiles({ name: 'evidencia-con-un-nombre-muy-muy-largo-para-probar-overflow.pdf',
    mimeType: 'application/pdf', buffer: Buffer.from('%PDF') })
  await page.getByRole('button', { name: 'Guardar evidencia' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('list', { name: 'Archivos para el siguiente mensaje' })).toContainText('Listo')
  await noOverflow()
  await page.getByRole('button', { name: 'Quitar evidencia-con-un-nombre-muy-muy-largo-para-probar-overflow.pdf' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('list', { name: 'Archivos para el siguiente mensaje' })).toHaveCount(0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await page.getByRole('note', { name: 'Modo de conversación' }).evaluate(element => {
    element.setAttribute('style', 'animation: pulse 1s infinite; transition: transform 1s')
    return [getComputedStyle(element).animationName, getComputedStyle(element).transitionDuration]
  })).toEqual(['none', '0s'])
  await page.getByRole('button', { name: 'Mostrar panel' }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Ver lo registrado' }).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#\/s\/r1\/entender$/)
  await page.getByRole('button', { name: 'Conversación' }).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#\/s\/r1\/conversar$/)
  await noOverflow()
})
