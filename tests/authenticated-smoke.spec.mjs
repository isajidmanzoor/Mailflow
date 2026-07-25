import { expect, test } from "@playwright/test";

const email = process.env.QA_USER_A_EMAIL;
const password = process.env.QA_USER_A_PASSWORD;

test.skip(!email || !password, "QA_USER_A_EMAIL and QA_USER_A_PASSWORD are required for authenticated checks");

test("test account A can authenticate and load campaigns", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /sign in|login/i }).click();

  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
  await page.goto("/campaigns");
  await expect(page).toHaveURL(/\/campaigns/);
  await expect(page.locator("body")).not.toContainText(/json route get|unable to reach/i);
});
