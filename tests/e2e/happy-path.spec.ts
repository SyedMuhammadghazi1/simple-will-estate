import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { extractText, getDocumentProxy } from "unpdf";

const PASSWORD = "e2e-password-123456";
const TESTATOR = "Elliot Example Tester";
const SPOUSE = "Robin Example Tester";

async function continueStep(page: Page, nextPath: RegExp) {
  await page.getByRole("button", { name: "Save and continue →" }).click();
  await expect(page).toHaveURL(nextPath);
}

async function signUp(page: Page, email: string) {
  await page.goto("/");
  await page
    .getByRole("link", { name: /Start your will/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/sign-up/);
  await page.getByLabel("Your name").fill("E2E Customer");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByLabel(/I agree to the/).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function pdfText(path: string) {
  const bytes = await readFile(path);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return String(text).replace(/\s+/g, " ");
}

test("customer makes, pays for, downloads, signs and files a will; staff completes filing", async ({
  page,
}) => {
  const email = `e2e-${Date.now()}@example.test`;
  await signUp(page, email);

  // --- Wizard -------------------------------------------------------------
  await page.getByRole("button", { name: "Start individual will" }).click();
  await expect(page).toHaveURL(/\/dashboard\/wills\/[0-9a-f-]+\/about$/);
  const willUrl = page.url().replace(/\/about$/, "");

  // Per-step validation blocks progress with clear messages
  await page.getByRole("button", { name: "Save and continue →" }).click();
  await expect(page.getByTestId("error-summary")).toContainText("Enter your full legal name");

  await page.getByRole("textbox", { name: "Full legal name", exact: true }).fill(TESTATOR);
  await page.getByLabel("Date of birth").fill("1980-05-17");
  await page.getByLabel("State of residence").selectOption("TX");
  await page.getByRole("textbox", { name: "County", exact: true }).fill("Travis");
  await page.getByLabel("Street address").fill("1 Congress Avenue");
  await page.getByLabel("City or town").fill("Austin");
  await page.getByLabel("ZIP code").fill("78701");
  await page.getByLabel("Marital status").selectOption("married");
  await page.getByLabel("Spouse or partner's full legal name").fill(SPOUSE);
  await continueStep(page, /\/situation$/);

  // Resume: reloading the previous step shows the autosaved answers
  await page.goto(`${willUrl}/about`);
  await expect(page.getByRole("textbox", { name: "Full legal name", exact: true })).toHaveValue(
    TESTATOR,
  );
  await page.goto(`${willUrl}/situation`);

  await page.getByLabel(/everything you own worth/).fill("350000");
  for (const q of [
    /own all or part of a business/,
    /means-tested benefits/,
    /leave your spouse or partner out/,
    /NOT a US citizen/,
    /outside the US/,
    /challenge your will/,
  ]) {
    await page.getByRole("group", { name: q }).getByLabel("No").check();
  }
  await continueStep(page, /\/children$/);

  await page
    .getByRole("group", { name: /Do you have any children/ })
    .getByLabel("Yes")
    .check();
  await page.getByLabel("Full name").fill("Sky Example Tester");
  await page.getByLabel("Date of birth").fill("2016-02-03");
  await continueStep(page, /\/guardians$/);

  await page
    .getByRole("textbox", { name: "Guardian — full name", exact: true })
    .fill("Pat Guardian Person");
  await continueStep(page, /\/executor$/);

  await page.getByRole("textbox", { name: "Executor — full name", exact: true }).fill(SPOUSE);
  await continueStep(page, /\/beneficiaries$/);

  await page.getByRole("button", { name: `+ Add ${SPOUSE}` }).click();
  await page.getByLabel("Share (%)").fill("90");
  await page.getByRole("button", { name: "+ Add a person" }).click();
  await page.getByLabel("Full name").nth(1).fill("Sky Example Tester");
  await page.getByLabel("Share (%)").nth(1).fill("5");
  await expect(page.getByTestId("share-total")).toContainText("95%");
  await page.getByLabel(/per stirpes/).check();
  await page.getByRole("button", { name: "Save and continue →" }).click();
  await expect(page.getByTestId("error-summary")).toContainText(
    "Shares must add up to exactly 100%",
  );
  await page.getByLabel("Share (%)").nth(1).fill("10");
  await expect(page.getByTestId("share-total")).toContainText("100%");
  await continueStep(page, /\/gifts$/);

  await continueStep(page, /\/minors$/);
  await page
    .getByRole("group", { name: /Appoint a custodian/ })
    .getByLabel("Yes")
    .check();
  await page.getByLabel("Hold property until the beneficiary reaches age").selectOption("25");
  await page.getByLabel("Custodian's full name").fill("Pat Guardian Person");
  await continueStep(page, /\/wishes$/);

  await continueStep(page, /\/review$/);
  await expect(page.getByText("All questions answered")).toBeVisible();
  await expect(page.getByText(`You are ${TESTATOR}, born May 17, 1980.`)).toBeVisible();

  // --- Checkout (real Stripe code path against the local Stripe emulator) ---
  await page.getByTestId("continue-to-checkout").click();
  await expect(page).toHaveURL(/\/dashboard\/orders\/[0-9a-f-]+#checkout$/);
  const orderUrl = page.url().replace(/#checkout$/, "");
  await page.getByRole("button", { name: /Pay \$99/ }).click();
  await expect(page.getByRole("heading", { name: /Stripe test checkout/ })).toBeVisible();
  // Going back and paying again returns to the same Checkout Session (no second charge possible).
  const checkoutSessionUrl = page.url();
  await page.goto(`${orderUrl}#checkout`);
  await page.getByRole("button", { name: /Pay \$99/ }).click();
  await expect(page.getByRole("heading", { name: /Stripe test checkout/ })).toBeVisible();
  expect(page.url()).toBe(checkoutSessionUrl);
  await page.getByRole("button", { name: "Pay (test)" }).click();
  await expect(page).toHaveURL(/checkout=success/);
  await expect(page.getByTestId("order-status")).toHaveAttribute("data-status", "documents_ready");

  // --- Download the final (unwatermarked) will ------------------------------
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("download-will").click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^last-will-and-testament-.*-v1\.pdf$/);
  const text = await pdfText((await download.path())!);
  expect(text).toContain(`Last Will and Testament of ${TESTATOR}`);
  expect(text).toContain("Self-Proving Affidavit");
  expect(text).not.toContain("DRAFT");

  // --- Upload the signed copy and request court deposit ---------------------
  await page.goto(orderUrl);
  await expect(page.getByTestId("order-status")).toHaveAttribute(
    "data-status",
    "awaiting_execution",
  );
  await page.getByLabel(/Signed copy of/).setInputFiles({
    name: "signed-will.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% scanned signed will\n%%EOF\n"),
  });
  await page.getByRole("button", { name: "Upload signed copy" }).click();
  await expect(page.getByText("Signed copy uploaded.")).toBeVisible();
  await page.getByLabel(/I signed my will in the presence of 2 adult witnesses/).check();
  await page.getByLabel(/Deposit with the court/).check();
  await page.getByRole("button", { name: "Confirm signing and request filing" }).click();
  await expect(page).toHaveURL(/signed=1/);
  await expect(page.getByTestId("order-status")).toHaveAttribute(
    "data-status",
    "filing_in_progress",
  );
  const ref = orderUrl.split("/").pop()!.slice(0, 8).toUpperCase();

  // --- Staff marks the will as filed ----------------------------------------
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.goto("/sign-in?next=/admin/filing");
  await page.getByLabel("Email").fill("admin@plainwill.test");
  await page.getByLabel("Password").fill("Plainwill-demo-2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin\/filing$/);
  const task = page.getByTestId("filing-task").filter({ hasText: ref });
  await task.getByLabel("Court reference no.").fill("TRAVIS-W-2026-0042");
  await task.getByRole("button", { name: "Mark filed" }).click();
  await expect(page.getByTestId("filing-task").filter({ hasText: ref })).toHaveCount(0);
  await page.goto(`/admin/orders/${orderUrl.split("/").pop()}`);
  await expect(page.getByTestId("order-status")).toHaveAttribute("data-status", "filed");
  await expect(page.getByText("Court ref: TRAVIS-W-2026-0042")).toBeVisible();
});

test("customers cannot reach the staff console or staff APIs", async ({ page }) => {
  await signUp(page, `e2e-sec-${Date.now()}@example.test`);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  const api = await page.request.get("/api/admin/orders");
  expect(api.status()).toBe(403);
});

test("marketing and legal pages render with the not-a-law-firm disclaimer", async ({ page }) => {
  for (const path of ["/", "/pricing", "/legal/terms", "/legal/privacy", "/legal/disclaimer"]) {
    await page.goto(path);
    await expect(page.getByTestId("footer-disclaimer")).toContainText("is not a law firm");
  }
  await page.goto("/pricing");
  await expect(page.getByTestId("price-individual")).toHaveText("$99");
  await expect(page.getByTestId("price-couple")).toHaveText("$169");
  await page.goto("/legal/terms");
  await expect(page.getByTestId("lawyer-review-banner")).toBeVisible();
});
