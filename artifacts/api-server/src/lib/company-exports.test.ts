import assert from "node:assert/strict";
import test from "node:test";
import {
  companiesToCsv,
  companiesToPdf,
  splitPdfFontRuns,
} from "./company-exports.ts";
import { matchesCompanyFilters } from "./company-filters.ts";

const companies = [
  {
    companyName: "Target Labs",
    website: "https://target.example",
    productDescription: "Finance infrastructure for modern teams",
    knownInvestors: ["Northstar"],
    foundersList: [{ name: "Ari Morgan", title: "Founder" }],
    lastFundingRound: "Seed",
    signalScore: 94,
    signalLabel: "High signal",
    regionalMetadata: {
      sector: "Fintech",
      geographyRegion: "South Asia",
      specificCountry: "Sri Lanka",
      businessModel: "B2B",
    },
  },
  {
    companyName: "Excluded Health",
    website: "https://excluded.example",
    productDescription: "Care coordination software",
    knownInvestors: ["Other"],
    foundersList: [{ name: "Other Founder", title: "CEO" }],
    lastFundingRound: "Pre-Seed",
    signalScore: 82,
    signalLabel: "Promising",
    regionalMetadata: {
      sector: "Healthtech",
      geographyRegion: "East Asia",
      specificCountry: "South Korea",
      businessModel: "B2B2C",
    },
  },
];

test("CSV and PDF exports contain the same active-filtered company set", async () => {
  const filters = {
    search: "target",
    region: ["South Asia"],
    country: ["Sri Lanka"],
    stage: ["Seed"],
    businessModel: ["B2B"],
    sector: ["Fintech"],
  };
  const filtered = companies.filter((company) => matchesCompanyFilters(company, filters));
  const csv = companiesToCsv(filtered);
  const pdf = await companiesToPdf(filtered);
  const pdfSource = pdf.toString("latin1");

  assert.deepEqual(filtered.map((company) => company.companyName), ["Target Labs"]);
  assert.match(csv, /"Target Labs","Fintech","South Asia","Sri Lanka","Seed","B2B","94"/);
  assert.doesNotMatch(csv, /Excluded Health/);
  assert.match(pdfSource, /^%PDF-1\.4/);
  assert.match(pdfSource, /\/ToUnicode/);
});

test("CSV exports neutralize spreadsheet formulas", () => {
  const csv = companiesToCsv([
    {
      ...companies[0],
      companyName: "=HYPERLINK(\"https://malicious.example\")",
    },
  ]);
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/malicious\.example""\)"/);
});

test("PDF exports route every target-market script to an embedded font", async () => {
  const scriptSamples = [
    { font: "latin", text: "Café Ventures" },
    { font: "sinhala", text: "ලංකා වෙන්චර්ස්" },
    { font: "tamil", text: "சென்னை முயற்சி" },
    { font: "devanagari", text: "मुंबई वेंचर्स" },
    { font: "bengali", text: "বাংলা উদ্যোগ" },
    { font: "arabic", text: "شركة الرياض" },
    { font: "thai", text: "กรุงเทพ เวนเจอร์" },
    { font: "chinese", text: "公司（北京）", hanFont: "chinese" },
    { font: "japanese", text: "株式会社【東京】", hanFont: "japanese" },
    { font: "korean", text: "서울벤처스" },
  ] as const;
  for (const sample of scriptSamples) {
    const runs = splitPdfFontRuns(sample.text, "hanFont" in sample ? sample.hanFont : undefined);
    assert.ok(
      runs.some((run) => run.font === sample.font && run.text.includes(sample.text.split(" ")[0])),
      `${sample.font} text was not routed to its expected font`,
    );
    if (sample.font === "chinese" || sample.font === "japanese") {
      assert.ok(
        runs.every((run) => run.font === sample.font),
        `${sample.font} punctuation did not inherit the CJK font`,
      );
    }
    if (sample.font === "arabic") {
      assert.deepEqual(runs, [{ font: "arabic", text: sample.text }]);
    }
  }

  const pdf = await companiesToPdf(
    scriptSamples.map((sample) => ({
      ...companies[0],
      companyName: sample.text,
      regionalMetadata: {
        ...companies[0].regionalMetadata,
        specificCountry: sample.font === "japanese"
          ? "Japan"
          : sample.font === "chinese"
            ? "China"
            : companies[0].regionalMetadata.specificCountry,
      },
    })),
  );
  const source = pdf.toString("latin1");
  assert.match(source, /^%PDF-1\.4/);
  assert.ok((source.match(/\/ToUnicode/g) ?? []).length >= scriptSamples.length);
});

test("PDF exports preserve 42 company rows per page", async () => {
  const pdf = await companiesToPdf(
    Array.from({ length: 43 }, (_, index) => ({
      ...companies[0],
      companyName: `Company ${index + 1}`,
    })),
  );
  const pageObjects = pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? [];
  assert.equal(pageObjects.length, 2);
});