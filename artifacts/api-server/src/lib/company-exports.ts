export type ExportCompany = {
  companyName: string;
  website: string;
  lastFundingRound: string;
  signalScore: number;
  signalLabel: string;
  regionalMetadata: {
    sector: string;
    geographyRegion: string;
    specificCountry: string;
    businessModel: string;
  };
};

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export function companiesToCsv(companies: ExportCompany[]) {
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

export function companiesToPdf(companies: ExportCompany[]) {
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