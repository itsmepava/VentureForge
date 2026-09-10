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

test("PDF exports route Sinhala, Korean, and accented Latin text to embedded fonts", async () => {
  const company = {
    ...companies[0],
    companyName: "Café ලංකා 서울벤처스",
    regionalMetadata: {
      ...companies[0].regionalMetadata,
      sector: "Fintech මූල්‍ය 금융",
      specificCountry: "ශ්‍රී ලංකාව · 대한민국",
    },
  };
  const runs = splitPdfFontRuns(company.companyName);
  assert.ok(runs.some((run) => run.font === "latin" && run.text.includes("Café")));
  assert.ok(runs.some((run) => run.font === "sinhala" && run.text.includes("ලංකා")));
  assert.ok(runs.some((run) => run.font === "korean" && run.text.includes("서울벤처스")));

  const pdf = await companiesToPdf([company]);
  const source = pdf.toString("latin1");
  assert.match(source, /^%PDF-1\.4/);
  assert.ok((source.match(/\/ToUnicode/g) ?? []).length >= 3);
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