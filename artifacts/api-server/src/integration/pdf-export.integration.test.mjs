import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import test from "node:test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const databaseRequire = createRequire(
  new URL("../../../../lib/db/package.json", import.meta.url),
);
const pg = databaseRequire("pg");
const { Pool } = pg;
const DEMO_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForHealth(baseUrl, child, logs) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`API exited before becoming healthy:\n${logs.join("")}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/healthz`);
      if (response.ok) return;
    } catch {
      // The server has not opened its port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`API did not become healthy:\n${logs.join("")}`);
}

async function parsePdf(buffer) {
  const document = await getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useWorkerFetch: false,
  }).promise;
  const pages = [];
  const textItems = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if ("str" in item) textItems.push({ direction: item.dir, text: item.str });
    }
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  return { pageCount: document.numPages, text: pages.join("\n"), textItems };
}

function compactText(value) {
  return value.replace(/[\s\p{Cc}\p{Cf}]+/gu, "");
}

test("PDF download preserves filters, Unicode text, headers, empty results, and pagination", async (context) => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for the PDF integration test");
  const port = await availablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const logs = [];
  const adminPool = new Pool({ connectionString: process.env.DATABASE_URL });
  const schema = `pdf_export_test_${randomUUID().replaceAll("-", "")}`;
  await adminPool.query(`create schema "${schema}"`);
  const scopedDatabaseUrl = new URL(process.env.DATABASE_URL);
  scopedDatabaseUrl.searchParams.set("options", `-c search_path=${schema}`);
  const pool = new Pool({ connectionString: scopedDatabaseUrl.toString() });
  const child = spawn(process.execPath, ["--enable-source-maps", "./dist/index.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: scopedDatabaseUrl.toString(),
      PORT: String(port),
      GITHUB_WORKER_ENABLED: "false",
      STRIPE_SYNC_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString()));

  const marker = `pdf-integration-${randomUUID()}`;
  context.after(async () => {
    await pool.end();
    if (child.exitCode === null) child.kill("SIGTERM");
    await new Promise((resolve) => {
      if (child.exitCode !== null) resolve();
      else child.once("exit", resolve);
    });
    await adminPool.query(`drop schema if exists "${schema}" cascade`);
    await adminPool.end();
  });

  await waitForHealth(baseUrl, child, logs);
  const initializationResponse = await fetch(`${baseUrl}/api/companies`);
  assert.equal(initializationResponse.status, 200);

  const insertCompany = async ({
    companyName,
    sector = "Fintech",
    country = "Sri Lanka",
    searchToken,
    score = 90,
  }) => {
    await pool.query(
      `insert into discovered_companies (
        id, company_name, website, organization_id, founders_list,
        product_description, last_funding_round, funding_amount_estimated,
        funding_currency, known_investors, behavioral_metrics, regional_metadata,
        signal_score, signal_label, source, logo_letter
      ) values (
        $1, $2, $3, $4, $5::jsonb, $6, 'Seed', 1000000,
        'USD', '[]'::jsonb, $7::jsonb, $8::jsonb,
        $9, 'High signal', $10, 'I'
      )`,
      [
        randomUUID(),
        companyName,
        `https://${randomUUID()}.example`,
        DEMO_ORGANIZATION_ID,
        JSON.stringify([{ name: "Integration Founder", title: "CEO", linkedinHandle: null }]),
        `${searchToken} integration fixture`,
        JSON.stringify({
          builderResilienceScore: 80,
          problemSolvingNotes: "Integration fixture",
          commitVelocitySpike: 0,
        }),
        JSON.stringify({
          geographyRegion: "South Asia",
          specificCountry: country,
          businessModel: "B2B",
          sector,
          employeeCount: 5,
        }),
        score,
        marker,
      ],
    );
  };

  const filterToken = `filter-${randomUUID()}`;
  const internationalCompanies = [
    { companyName: "Café Ventures" },
    { companyName: "ලංකා වෙන්චර්ස්" },
    { companyName: "சென்னை முயற்சி" },
    { companyName: "मुंबई वेंचर्स" },
    { companyName: "বাংলা উদ্যোগ" },
    { companyName: "شركة الرياض" },
    { companyName: "กรุงเทพ เวนเจอร์" },
    { companyName: "公司（北京）", country: "China" },
    { companyName: "株式会社【東京】", country: "Japan" },
    { companyName: "日本銀行", country: "Japan" },
    { companyName: "서울벤처스" },
  ];
  const extractionAnchors = [
    "Café Ventures",
    "ලංකා",
    "முயற்சி",
    "मुंबई",
    "বাংলা",
    "الرياض",
    "กรุงเทพ",
    "公司（北京）",
    "株式会社【東京】",
    "日本銀行",
    "서울벤처스",
  ];
  await Promise.all(
    internationalCompanies.map(({ companyName, country }, index) =>
      insertCompany({ companyName, country, searchToken: filterToken, score: 99 - index })),
  );
  await insertCompany({
    companyName: "Excluded Health Company",
    searchToken: filterToken,
    sector: "Healthtech",
    score: 98,
  });

  const filteredUrl = new URL("/api/companies/export.pdf", baseUrl);
  filteredUrl.searchParams.set("search", filterToken);
  filteredUrl.searchParams.set("region", "South Asia");
  filteredUrl.searchParams.append("country", "Sri Lanka");
  filteredUrl.searchParams.append("country", "China");
  filteredUrl.searchParams.append("country", "Japan");
  filteredUrl.searchParams.set("stage", "Seed");
  filteredUrl.searchParams.set("businessModel", "B2B");
  filteredUrl.searchParams.set("sector", "Fintech");
  const filteredResponse = await fetch(filteredUrl);
  assert.equal(filteredResponse.status, 200);
  assert.equal(filteredResponse.headers.get("content-type"), "application/pdf");
  assert.equal(
    filteredResponse.headers.get("content-disposition"),
    'attachment; filename="ventureforge-companies.pdf"',
  );
  const filteredPdf = await parsePdf(await filteredResponse.arrayBuffer());
  const filteredText = compactText(filteredPdf.text);
  assert.equal(filteredPdf.pageCount, 1);
  for (const anchor of extractionAnchors) {
    assert.ok(
      filteredText.includes(compactText(anchor)),
      `PDF.js could not recover ${anchor}`,
    );
  }
  assert.ok(
    filteredPdf.textItems.some(
      (item) =>
        item.direction === "rtl"
        && compactText(item.text).includes(compactText("شركة"))
        && compactText(item.text).includes(compactText("الرياض")),
    ),
    "Arabic company name was not rendered as one right-to-left phrase",
  );
  assert.ok(!filteredText.includes(compactText("Excluded Health Company")));

  const emptyUrl = new URL("/api/companies/export.pdf", baseUrl);
  emptyUrl.searchParams.set("search", `empty-${randomUUID()}`);
  const emptyResponse = await fetch(emptyUrl);
  assert.equal(emptyResponse.status, 200);
  const emptyPdf = await parsePdf(await emptyResponse.arrayBuffer());
  assert.equal(emptyPdf.pageCount, 1);
  assert.match(emptyPdf.text, /0 companies/);

  const paginationToken = `pages-${randomUUID()}`;
  await Promise.all(
    Array.from({ length: 43 }, (_, index) =>
      insertCompany({
        companyName: `Pagination Company ${index + 1}`,
        searchToken: paginationToken,
        score: 97 - (index % 10),
      })),
  );
  const paginatedUrl = new URL("/api/companies/export.pdf", baseUrl);
  paginatedUrl.searchParams.set("search", paginationToken);
  const paginatedResponse = await fetch(paginatedUrl);
  assert.equal(paginatedResponse.status, 200);
  const paginatedPdf = await parsePdf(await paginatedResponse.arrayBuffer());
  assert.equal(paginatedPdf.pageCount, 2);
  assert.ok(compactText(paginatedPdf.text).includes(compactText("Pagination Company 43")));
});