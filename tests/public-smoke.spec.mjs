import { expect, test } from "@playwright/test";

test("login page is available and has credential inputs", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveTitle(/MailFlow/i);
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in|login/i })).toBeVisible();
});

test("protected routes redirect an anonymous user to login", async ({ page }) => {
  await page.goto("/campaigns");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator('input[type="email"]')).toBeVisible();
});

test("forgot-password route loads", async ({ page }) => {
  await page.goto("/forgot-password");
  await expect(page).toHaveTitle(/MailFlow/i);
  await expect(page.locator('input[type="email"]')).toBeVisible();
});
