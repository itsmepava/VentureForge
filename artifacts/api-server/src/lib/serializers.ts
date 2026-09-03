import type {
  DiscoveredCompany,
  PortfolioSource,
  SavedSearch,
} from "@workspace/db";

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
    regionalMetadata: company.regionalMetadata,
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
    filterParams: search.filterParams,
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