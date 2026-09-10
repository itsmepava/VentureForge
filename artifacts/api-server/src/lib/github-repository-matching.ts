type MatchableCompany = {
  companyName: string;
  website: string;
};

function compact(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function repositoryMatchesCompany(
  repository: string,
  company: MatchableCompany,
  verifiedRepositories: string[],
) {
  const normalizedRepository = compact(repository);
  if (!normalizedRepository) return false;
  if (verifiedRepositories.length) {
    return verifiedRepositories.some((mapped) => compact(mapped) === normalizedRepository);
  }

  const companyName = compact(company.companyName);
  let websiteHost = "";
  try {
    websiteHost = compact(new URL(company.website).hostname.replace(/^www\./, "").split(".")[0] ?? "");
  } catch {
    websiteHost = "";
  }
  return normalizedRepository.includes(companyName) || Boolean(websiteHost && normalizedRepository.includes(websiteHost));
}