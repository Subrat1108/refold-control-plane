import { test, expect, type Page } from '@playwright/test'
import crypto from 'node:crypto'

// Headless UI smoke test (Cleanup 2, equal-admins Parts 3-4 session).
// Signs in as the fictional super admin through the REAL login UI and the
// REAL MFA challenge screen — not a bypass. seed.sql seeds a pre-verified
// TOTP factor for this user with the fixed secret below (local-only fixture
// data, same category as every other fictional seed row; the secret is
// plain text in the local Postgres instance, confirmed by direct inspection
// — nothing about production auth is weakened by a test knowing it).
const TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const char of input.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(char).toString(2).padStart(5, '0')
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}

function computeTotp(secret: string): string {
  const counter = Buffer.alloc(8)
  counter.writeBigInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)))
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3]
  return (code % 1_000_000).toString().padStart(6, '0')
}

// Collects console errors + uncaught page errors so each step can assert
// none happened, without re-wiring listeners per step.
function trackErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
  page.on('pageerror', (err) => errors.push(err.message))
  return errors
}

async function expectNoErrors(page: Page, errors: string[]) {
  await expect(page.getByText('An unexpected error occurred')).not.toBeVisible()
  expect(errors, `console/page errors: ${JSON.stringify(errors)}`).toEqual([])
}

test('super admin smoke: Home, Portfolio, Account 360, Approvals, Audit log, Standups, People', async ({ page }) => {
  const errors = trackErrors(page)

  // ── Login (real form) + MFA challenge (real screen, seeded factor) ──────
  await page.goto('/login')
  await page.fill('#email', 'super@refold.internal')
  await page.fill('#password', 'demo-super-2026')
  await page.click('button[type="submit"]')

  await expect(page.getByText('Two-factor authentication')).toBeVisible()
  await page.getByPlaceholder('123456').fill(computeTotp(TOTP_SECRET))
  await page.click('button[type="submit"]')

  // ── Home ─────────────────────────────────────────────────────────────
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible()
  await expectNoErrors(page, errors)

  // ── Portfolio → open an Account 360 → click each tab ────────────────
  await page.getByRole('link', { name: 'Portfolio' }).click()
  await expect(page.getByRole('heading', { name: 'Portfolio' })).toBeVisible()
  await expectNoErrors(page, errors)

  const firstAccountLink = page.locator('table a[href^="/accounts/"]').first()
  await expect(firstAccountLink).toBeVisible()
  const accountName = (await firstAccountLink.textContent())?.trim()
  await firstAccountLink.click()
  if (accountName) await expect(page.getByRole('heading', { name: accountName })).toBeVisible()
  await expectNoErrors(page, errors)

  for (const tabName of ['Overview', 'Projects', 'Escalations', 'Tickets', 'Engagements', 'Metrics']) {
    await page.getByRole('tab', { name: tabName }).click()
    await expectNoErrors(page, errors)
  }

  // one write: add a milestone on the first project, if one exists
  const addProjectButton = page.getByRole('button', { name: 'Add project' })
  await page.getByRole('tab', { name: 'Projects' }).click()
  if (await addProjectButton.isVisible()) {
    await addProjectButton.click()
    await page.getByRole('dialog').locator('input').first().fill('Smoke test project')
    await page.getByRole('button', { name: 'Add project' }).last().click()
    await expect(page.getByText('Smoke test project').first()).toBeVisible()
  }
  await expectNoErrors(page, errors)

  // ── Approvals → approve one pending proposal ────────────────────────
  await page.getByRole('link', { name: 'Approvals' }).click()
  await expect(page.getByRole('heading', { name: 'Approvals' })).toBeVisible()
  await expectNoErrors(page, errors)

  const approveButton = page.getByRole('button', { name: 'Approve', exact: true }).first()
  if (await approveButton.isVisible()) {
    await approveButton.click()
    await page.waitForTimeout(500) // let the mutation + refetch settle
  }
  await expectNoErrors(page, errors)

  // ── Audit log (inside the collapsed-by-default "Admin" disclosure) ──
  await page.getByRole('button', { name: 'Admin' }).click()
  await page.getByRole('link', { name: 'Audit Log' }).click()
  await expect(page.getByRole('heading', { name: 'Audit Log' })).toBeVisible()
  await expectNoErrors(page, errors)

  // ── Standups: start one, edit own entry, open live mode ─────────────
  await page.getByRole('link', { name: 'Standups' }).click()
  await expect(page.getByRole('heading', { name: 'Standups' })).toBeVisible()
  await expectNoErrors(page, errors)

  await page.getByRole('button', { name: 'Start a standup' }).click()
  await page.getByRole('combobox').first().selectOption({ index: 1 }) // "Add a person…"
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('button', { name: 'Start standup' }).click()

  await expect(page.getByRole('heading', { name: /Standup —/ })).toBeVisible()
  await expectNoErrors(page, errors)

  const todayField = page.locator('textarea').nth(1) // Yesterday/Today/Blockers order, first card
  await todayField.fill('Smoke test today entry')
  await page.getByRole('button', { name: 'Save' }).first().click()
  await page.waitForTimeout(500)
  await expectNoErrors(page, errors)

  await page.getByRole('button', { name: 'Live mode' }).click()
  await expect(page.getByText(/Participant 1 of/)).toBeVisible()
  await expectNoErrors(page, errors)

  // ── People: open a person's detail slide-over ───────────────────────
  await page.getByRole('link', { name: 'People' }).click()
  await expect(page.getByRole('heading', { name: 'People' })).toBeVisible()
  await expectNoErrors(page, errors)

  await page.getByRole('button', { name: 'Manage roles' }).first().click()
  await expect(page.getByText('Recent activity')).toBeVisible()
  await expectNoErrors(page, errors)
})
