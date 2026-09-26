import { expect, test } from '@playwright/test'

/**
 * SPEC §55 demo, end to end. Requires API + Vite running and a fresh `python -m app.seed`
 * (it submits Situación #001, so run it once per seeded database).
 */
test('Private → IA → borrador → selección → envío → Institutional', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Entrar como persona' }).click()
  await expect(page.getByRole('heading', { name: 'Hola, María' })).toBeVisible()
  await expect(page.getByText('✕ No puede verlo')).toHaveCount(4)

  await page.getByRole('button', { name: 'Continuar' }).first().click()
  await expect(page.getByText('Fecha inconsistente')).toBeVisible()
  await page.getByRole('button', { name: /captura_01.png ↗/ }).click()
  await expect(page.getByText('Fragmento usado por VERA')).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Confirmar', exact: true }).first().click()
  await expect(page.getByText('3 de 3')).toBeVisible()
  await page.getByRole('button', { name: 'Usar 16 sep' }).click()
  await expect(page.getByText('Fecha conservada según captura_01.png', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Preparar reporte →' }).click()
  await expect(page.getByText('Pendiente de confirmar', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Confirmar identidad' }).click()
  await expect(page.getByText('✓ Confirmado por ti')).toBeVisible()

  await page.getByRole('button', { name: 'Revisar y compartir →' }).click()
  const kept = page.locator('section', { has: page.getByRole('heading', { name: 'Seguirá privado' }) })
  await expect(kept.getByText('captura_02.png')).toBeVisible()
  await page.getByRole('button', { name: 'Revisar lo que verá la organización' }).click()
  await expect(page.getByText('Así recibirá el caso tu organización')).toBeVisible()
  await page.getByText(/Entiendo que, al confirmar/).click()
  await page.getByRole('button', { name: 'Confirmar y enviar' }).click()
  await expect(page.getByRole('heading', { name: 'Enviaste el caso V-004' })).toBeVisible()
  await expect(page.getByText('✓ Coincide')).toHaveCount(2)

  await page.getByRole('button', { name: /Ver como la organización/ }).click()
  await expect(page.getByRole('heading', { name: 'Caso V-004' })).toBeVisible()
  await expect(page.getByText('captura_02.png')).toHaveCount(0)
  await page.getByRole('button', { name: 'Asignarme' }).click()
  await expect(page.getByText('Lucía R. (tú)')).toBeVisible()
  await page.getByRole('button', { name: 'Información de derechos: Pendiente. Cambiar estado' }).click()
  await expect(page.getByRole('button', { name: 'Información de derechos: En curso. Cambiar estado' })).toBeVisible()
})
