export type CompanyFilterInput = {
  search?: string;
  region?: string[];
  country?: string[];
  stage?: string[];
  businessModel?: string[];
  sector?: string[];
};

export type FilterableCompany = {
  companyName: string;
  productDescription: string;
  website: string;
  knownInvestors: string[];
  foundersList: Array<{ name: string; title: string }>;
  lastFundingRound: string;
  regionalMetadata: {
    geographyRegion: string;
    specificCountry: string;
    businessModel: string;
    sector: string;
  };
};

export function matchesCompanyFilters(company: FilterableCompany, params: CompanyFilterInput) {
  const searchable = [
    company.companyName,
    company.productDescription,
    company.website,
    company.knownInvestors.join(" "),
    company.foundersList.map((founder) => `${founder.name} ${founder.title}`).join(" "),
  ].join(" ").toLowerCase();
  return (
    (!params.search || searchable.includes(params.search.toLowerCase())) &&
    (!params.region?.length || params.region.includes(company.regionalMetadata.geographyRegion)) &&
    (!params.country?.length || params.country.includes(company.regionalMetadata.specificCountry)) &&
    (!params.stage?.length || params.stage.includes(company.lastFundingRound)) &&
    (!params.businessModel?.length || params.businessModel.includes(company.regionalMetadata.businessModel)) &&
    (!params.sector?.length || params.sector.includes(company.regionalMetadata.sector))
  );
}