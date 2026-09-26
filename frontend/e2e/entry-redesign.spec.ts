import { expect, test } from '@playwright/test'

for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }, { width: 1875, height: 900 }]) {
  test(`login y portada conservan el flujo a ${viewport.width} px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.route(url => url.pathname.startsWith('/api/'), async route => {
      const path = new URL(route.request().url()).pathname
      const response = path === '/api/health' ? { demo: false }
        : path === '/api/auth/me' ? { detail: 'Inicia sesión' }
          : path === '/api/auth/login' ? { id: 'u1', name: 'María', email: 'maria@example.test', memberships: [] }
            : path === '/api/records' ? [] : null
      await route.fulfill({ status: path === '/api/auth/me' ? 401 : response ? 200 : 404,
        contentType: 'application/json', body: JSON.stringify(response ?? { detail: path }) })
    })

    await page.goto('/')
    const headline = page.getByRole('heading', { level: 1, name: 'No tienes que atravesarlo todo a solas.' })
    await expect(headline).toBeVisible()
    await expect(page.getByText('Un espacio para conversar, ordenar lo que ocurrió y revisar tus registros a tu propio ritmo.')).toBeVisible()
    if (viewport.width > 640) {
      const lines = await headline.locator('span').evaluateAll(spans => spans.map(span => span.getBoundingClientRect().top))
      expect(new Set(lines).size).toBe(3)
    }
    await expect(page.getByRole('heading', { name: 'Bienvenida de nuevo' })).toBeVisible()
    const aboutSection = page.getByRole('heading', { name: '¿Qué es VERA?' })
    await expect(aboutSection).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Conoce a tu compañero VERA' })).toBeVisible()
    for (const title of ['A tu ritmo', 'Tus palabras importan', 'Tú decides']) {
      await expect(page.getByRole('heading', { name: title })).toBeVisible()
    }
    expect(await page.locator('.about-vera').locator('button').count()).toBe(0)
    const loginCardBox = await page.locator('.login-card').boundingBox()
    const aboutBox = await page.locator('.about-vera').boundingBox()
    expect(aboutBox!.y).toBeGreaterThan(loginCardBox!.y + loginCardBox!.height)
    const mascot = page.locator('.login-companion').getByRole('img', { name: /perrito lavanda/ })
    await expect(mascot).toBeVisible()
    expect(await mascot.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    await expect(page.getByText('Puedes tomarte tu tiempo. Empieza cuando quieras.')).toBeVisible()
    expect(await mascot.evaluate(image => {
      const picture = image as HTMLImageElement
      const box = picture.getBoundingClientRect()
      return Math.abs(box.width / box.height - picture.naturalWidth / picture.naturalHeight) < 0.02
    })).toBe(true)
    if (viewport.width > 900) {
      expect(await mascot.evaluate(image => image.getBoundingClientRect().bottom)).toBeLessThanOrEqual(viewport.height)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    if (viewport.width <= 900) {
      const noteBox = await page.locator('.login-companion span').boundingBox()
      expect(noteBox!.y + noteBox!.height).toBeLessThanOrEqual(loginCardBox!.y)
    }
    await page.getByLabel('Correo electrónico').fill('maria@example.test')
    await page.getByLabel('Contraseña').fill('secreto')
    await page.getByRole('button', { name: 'Ingresar a mi espacio' }).click()
    await expect(page.getByRole('heading', { name: 'Hola, María' })).toBeVisible()
    await expect(page.getByText('Un espacio para ti').first()).toBeVisible()
    await expect(page.getByRole('heading', { name: '¿Qué es VERA?' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Conoce VERA' }).click()
    const dialog = page.getByRole('dialog', { name: 'Conoce VERA' })
    await expect(dialog.getByRole('heading', { name: '¿Qué es VERA?' })).toBeVisible()
    await expect(dialog.getByRole('heading', { name: 'Conoce a tu compañero VERA' })).toBeVisible()
    await expect(dialog).toContainText('VERA es un asistente virtual.')
    await dialog.getByRole('heading', { name: 'Conoce a tu compañero VERA' }).scrollIntoViewIfNeeded()
    await expect(dialog.getByRole('img', { name: /compañero VERA/ })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    await dialog.getByRole('button', { name: 'Cerrar presentación' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Conoce VERA' })).toBeFocused()
    const homeHeading = page.getByRole('heading', { level: 2, name: 'No tienes que atravesarlo todo a solas.' })
    await expect(homeHeading).toBeVisible()
    if (viewport.width > 900) {
      expect(await homeHeading.evaluate(element => element.getBoundingClientRect().height / parseFloat(getComputedStyle(element).lineHeight))).toBeGreaterThan(1.5)
    }
    const privacy = page.getByRole('region', { name: 'Quién puede ver tus registros' })
    await expect(privacy).toContainText('Tú decides qué compartir.')
    await expect(privacy).toContainText('Guardar una situación no significa reportarla. Tú decides qué compartir con tu organización.')
    const visibility = privacy.locator('details')
    await expect(visibility).toHaveJSProperty('open', false)
    await expect(visibility.locator('.visibility')).toBeHidden()
    const summary = visibility.locator('summary')
    await summary.focus()
    await page.keyboard.press('Enter')
    await expect(visibility).toHaveJSProperty('open', true)
    await expect(visibility.locator('.visibility > div')).toHaveCount(5)
    await expect(visibility).toContainText('Admin de la organización')
    await page.keyboard.press('Space')
    await expect(visibility).toHaveJSProperty('open', false)
    await summary.click()
    await expect(visibility).toHaveJSProperty('open', true)
    await summary.click()
    await expect(visibility).toHaveJSProperty('open', false)
    for (const title of ['Lo que guardaste', 'Qué pasó y cuándo', 'Tu borrador de reporte', 'Decidir qué compartir']) {
      await expect(page.getByText(title, { exact: true })).toBeVisible()
    }
    await expect(page.getByText('Puedes empezar contando lo que pasó o añadiendo una captura o un documento. No necesitas tenerlo todo en orden.')).toBeVisible()
    const homeMascot = page.locator('.home-welcome-art')
    await expect(homeMascot.getByText('Puedes tomarte tu tiempo. Empieza cuando quieras.')).toHaveCount(0)
    expect(await homeMascot.getByRole('button').count()).toBe(0)
    const homeImage = homeMascot.getByRole('img', { name: /perrito lavanda recostado/ })
    await expect(homeImage).toHaveAttribute('src', '/images/vera-companion-resting.jpeg')
    await expect(homeImage).toBeVisible()
    expect(await homeImage.evaluate(image => {
      const picture = image as HTMLImageElement
      const box = picture.getBoundingClientRect()
      return picture.naturalWidth > 0 && box.width > 250 && box.height > 150
    })).toBe(true)
    if (viewport.width <= 640) {
      const artBox = await homeMascot.boundingBox()
      const buttonBox = await page.getByRole('button', { name: 'Registrar algo nuevo' }).first().boundingBox()
      expect(artBox!.y).toBeGreaterThan(buttonBox!.y + buttonBox!.height)
    }
    await expect(page.getByRole('button', { name: 'Conversar con VERA' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Registrar algo nuevo' }).first()).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    await page.getByRole('button', { name: 'Registrar algo nuevo' }).first().click()
    await expect(page).toHaveURL(/#\/s\/nuevo\/registrar$/)
    // Up to 900 px the navigation lives in the menu drawer.
    if (viewport.width <= 900) await page.getByRole('button', { name: 'Abrir menú' }).click()
    await page.getByRole('button', { name: 'Mi espacio' }).click()
    await page.getByRole('button', { name: 'Conversar con VERA' }).click()
    await expect(page).toHaveURL(/#\/conversar$/)
  })
}

test('un error de acceso sigue visible sin ocultar la presentación', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const path = new URL(route.request().url()).pathname
    await route.fulfill({ status: path === '/api/health' ? 200 : 401, contentType: 'application/json',
      body: JSON.stringify(path === '/api/health' ? { demo: false } : { detail: 'Correo o contraseña incorrectos' }) })
  })
  await page.goto('/')
  await page.getByLabel('Correo electrónico').fill('maria@example.test')
  await page.getByLabel('Contraseña').fill('incorrecta')
  await page.getByRole('button', { name: 'Ingresar a mi espacio' }).click()
  await expect(page.getByRole('alert')).toHaveText('Correo o contraseña incorrectos')
  await expect(page.getByLabel('Correo electrónico')).toHaveValue('maria@example.test')
  await expect(page.getByRole('heading', { name: '¿Qué es VERA?' })).toBeVisible()
})
