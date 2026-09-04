import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetCompanyParams,
  GetCompanyResponse,
  ListCompaniesQueryParams,
  ListCompaniesResponse,
} from "@workspace/api-zod";
import { db, discoveredCompanies } from "@workspace/db";
import { DEMO_ORGANIZATION_ID, ensureDemoData } from "../lib/demo-data";
import { serializeCompany } from "../lib/serializers";

const router: IRouter = Router();

function asArray(value: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return typeof value === "string" ? [value] : [];
}

function parseCompanyFilters(query: Record<string, unknown>) {
  return ListCompaniesQueryParams.parse({
    search: typeof query.search === "string" ? query.search : undefined,
    region: asArray(query.region),
    country: asArray(query.country),
    stage: asArray(query.stage),
    businessModel: asArray(query.businessModel),
    sector: asArray(query.sector),
  });
}

export async function listFilteredCompanies(query: Record<string, unknown>) {
  await ensureDemoData();
  const params = parseCompanyFilters(query);
  const companies = await db
    .select()
    .from(discoveredCompanies)
    .where(and(eq(discoveredCompanies.organizationId, DEMO_ORGANIZATION_ID)))
    .orderBy(discoveredCompanies.signalScore);
  const regionFiltered = companies.filter((company) => {
      const metadata = company.regionalMetadata;
      const searchable = [
        company.companyName,
        company.productDescription,
        company.website,
        company.knownInvestors.join(" "),
        company.foundersList.map((founder) => `${founder.name} ${founder.title}`).join(" "),
      ].join(" ").toLowerCase();
      const searchMatches =
        !params.search || searchable.includes(params.search.toLowerCase());
      const regionMatches =
        !params.region?.length ||
        params.region.includes(metadata.geographyRegion);
      const countryMatches =
        !params.country?.length ||
        params.country.includes(metadata.specificCountry);
      const stageMatches =
        !params.stage?.length ||
        params.stage.includes(company.lastFundingRound);
      const modelMatches =
        !params.businessModel?.length ||
        params.businessModel.includes(metadata.businessModel);
      const sector = serializeCompany(company).regionalMetadata.sector;
      const sectorMatches =
        !params.sector?.length ||
        params.sector.includes(sector);
      return searchMatches && regionMatches && countryMatches && stageMatches && modelMatches && sectorMatches;
  });
  return regionFiltered.reverse().map(serializeCompany);
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function companiesToCsv(companies: Awaited<ReturnType<typeof listFilteredCompanies>>) {
  const headers = ["Company", "Sector", "Region", "Country", "Stage", "Business model", "Signal score", "Signal label", "Website"];
  const rows = companies.map((company) => [
    company.companyName,
    company.regionalMetadata.sector,
    company.regionalMetadata.geographyRegion,
    company.regionalMetadata.specificCountry,
    company.lastFundingRound,
    company.regionalMetadata.businessModel,
    company.signalScore,
    company.signalLabel,
    company.website,
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

function pdfEscape(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function companiesToPdf(companies: Awaited<ReturnType<typeof listFilteredCompanies>>) {
  const rows = companies.map((company) =>
    `${company.companyName} | ${company.regionalMetadata.sector} | ${company.regionalMetadata.specificCountry} | ${company.lastFundingRound} | ${company.signalScore}`,
  );
  const chunks = Array.from({ length: Math.max(1, Math.ceil(rows.length / 42)) }, (_, index) =>
    rows.slice(index * 42, index * 42 + 42),
  );
  const pageObjects: string[] = [];
  const contentObjects: string[] = [];
  for (const [index, chunk] of chunks.entries()) {
    const lines = [
      "VENTUREFORGE / FILTERED COMPANY EXPORT",
      `Generated ${new Date().toISOString().slice(0, 10)}  |  ${companies.length} companies`,
      "Company | Sector | Country | Stage | Score",
      ...chunk,
    ];
    const commands = [
      "BT",
      "/F1 10 Tf",
      "50 760 Td",
      ...lines.flatMap((line, lineIndex) => [
        `(${pdfEscape(line.slice(0, 105))}) Tj`,
        ...(lineIndex < lines.length - 1 ? ["0 -16 Td"] : []),
      ]),
      "ET",
    ].join("\n");
    contentObjects.push(commands);
    pageObjects.push(String(index));
  }

  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageObjects.map((_, index) => `${4 + index * 2} 0 R`).join(" ")}] /Count ${chunks.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (const [index, content] of contentObjects.entries()) {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`);
  }
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

router.get("/companies", async (req, res, next) => {
  try {
    const companies = await listFilteredCompanies(req.query as Record<string, unknown>);
    return res.json(ListCompaniesResponse.parse(companies));
  } catch (error) {
    return next(error);
  }
});

router.get("/companies/export.csv", async (req, res, next) => {
  try {
    const companies = await listFilteredCompanies(req.query as Record<string, unknown>);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="ventureforge-companies.csv"');
    return res.send(companiesToCsv(companies));
  } catch (error) {
    return next(error);
  }
});

router.get("/companies/export.pdf", async (req, res, next) => {
  try {
    const companies = await listFilteredCompanies(req.query as Record<string, unknown>);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="ventureforge-companies.pdf"');
    return res.send(companiesToPdf(companies));
  } catch (error) {
    return next(error);
  }
});

router.get("/companies/:companyId", async (req, res, next) => {
  try {
    await ensureDemoData();
    const { companyId } = GetCompanyParams.parse(req.params);
    const [company] = await db
      .select()
      .from(discoveredCompanies)
      .where(
        and(
          eq(discoveredCompanies.id, companyId),
          eq(discoveredCompanies.organizationId, DEMO_ORGANIZATION_ID),
        ),
      )
      .limit(1);
    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }
    return res.json(GetCompanyResponse.parse(serializeCompany(company)));
  } catch (error) {
    return next(error);
  }
});

export default router;