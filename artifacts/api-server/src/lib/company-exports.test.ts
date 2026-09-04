import assert from "node:assert/strict";
import test from "node:test";
import { companiesToCsv, companiesToPdf } from "./company-exports.ts";
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

test("CSV and PDF exports contain the same active-filtered company set", () => {
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
  const pdf = companiesToPdf(filtered).toString("utf8");

  assert.deepEqual(filtered.map((company) => company.companyName), ["Target Labs"]);
  assert.match(csv, /"Target Labs","Fintech","South Asia","Sri Lanka","Seed","B2B","94"/);
  assert.doesNotMatch(csv, /Excluded Health/);
  assert.match(pdf, /Target Labs \| Fintech \| Sri Lanka \| Seed \| 94/);
  assert.doesNotMatch(pdf, /Excluded Health/);
  assert.match(pdf, /^%PDF-1\.4/);
});