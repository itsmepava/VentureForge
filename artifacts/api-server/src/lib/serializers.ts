import type {
  DiscoveredCompany,
  PortfolioSource,
  SavedSearch,
} from "@workspace/db";

function inferSector(company: DiscoveredCompany) {
  const text = `${company.companyName} ${company.productDescription}`.toLowerCase();
  if (text.includes("compliance") || text.includes("regulatory")) return "Regtech";
  if (text.includes("finance") || text.includes("financing") || text.includes("payment")) return "Fintech";
  if (text.includes("clinic") || text.includes("care")) return "Healthtech";
  if (text.includes("commerce") || text.includes("retailer")) return "Commerce";
  if (text.includes("developer") || text.includes("deployment") || text.includes("engineering")) return "Developer Tools";
  return "Other";
}

export function serializeCompany(company: DiscoveredCompany) {
  return {
    id: company.id,
    companyName: company.companyName,
    website: company.website,
    foundersList: company.foundersList,
    productDescription: company.productDescription,
    lastFundingRound: company.lastFundingRound,
    fundingAmountEstimated: Number(company.fundingAmountEstimated),
    fundingCurrency: company.fundingCurrency,
    knownInvestors: company.knownInvestors,
    behavioralMetrics: company.behavioralMetrics,
    regionalMetadata: {
      ...company.regionalMetadata,
      sector: company.regionalMetadata.sector ?? inferSector(company),
    },
    signalScore: company.signalScore,
    signalLabel: company.signalLabel,
    discoveredAt: company.discoveredAt.toISOString(),
    source: company.source,
    logoLetter: company.logoLetter,
  };
}

export function serializeSavedSearch(search: SavedSearch, matchCount: number) {
  return {
    id: search.id,
    name: search.name,
    filterParams: {
      ...search.filterParams,
      sector: search.filterParams.sector ?? [],
    },
    createdAt: search.createdAt.toISOString(),
    matchCount,
    isActive: search.isActive,
  };
}

export function serializePortfolioSource(source: PortfolioSource) {
  return {
    id: source.id,
    urlLink: source.urlLink,
    status: source.status,
    companyCount: source.companyCount,
    createdAt: source.createdAt.toISOString(),
  };
}