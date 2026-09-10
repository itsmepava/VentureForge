import { createRequire } from "node:module";
import PDFDocument from "pdfkit";

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

const require = createRequire(import.meta.url);
const pdfFonts = {
  latin: require.resolve("@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff"),
  sinhala: require.resolve("@fontsource/noto-sans-sinhala/files/noto-sans-sinhala-sinhala-400-normal.woff"),
  korean: require.resolve("@fontsource/noto-sans-kr/files/noto-sans-kr-korean-400-normal.woff"),
} as const;

export type PdfFontName = keyof typeof pdfFonts;

export function pdfFontForCharacter(character: string): PdfFontName {
  const codePoint = character.codePointAt(0) ?? 0;
  if (codePoint >= 0x0d80 && codePoint <= 0x0dff) return "sinhala";
  if (
    (codePoint >= 0x1100 && codePoint <= 0x11ff)
    || (codePoint >= 0x3130 && codePoint <= 0x318f)
    || (codePoint >= 0xa960 && codePoint <= 0xa97f)
    || (codePoint >= 0xac00 && codePoint <= 0xd7af)
    || (codePoint >= 0xd7b0 && codePoint <= 0xd7ff)
  ) return "korean";
  return "latin";
}

export function splitPdfFontRuns(text: string) {
  const runs: Array<{ font: PdfFontName; text: string }> = [];
  for (const character of text) {
    const current = runs.at(-1);
    const inheritsPreviousFont = character === "\u200c"
      || character === "\u200d"
      || /\p{Mark}/u.test(character);
    const font = inheritsPreviousFont && current
      ? current.font
      : pdfFontForCharacter(character);
    if (current?.font === font) current.text += character;
    else runs.push({ font, text: character });
  }
  return runs;
}

function csvCell(value: unknown) {
  const raw = String(value ?? "");
  const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
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

export function companiesToPdf(companies: ExportCompany[]) {
  const rows = companies.map((company) =>
    `${company.companyName} | ${company.regionalMetadata.sector} | ${company.regionalMetadata.specificCountry} | ${company.lastFundingRound} | ${company.signalScore}`,
  );
  const chunks = Array.from({ length: Math.max(1, Math.ceil(rows.length / 42)) }, (_, index) =>
    rows.slice(index * 42, index * 42 + 42),
  );
  return new Promise<Buffer>((resolve, reject) => {
    const output: Buffer[] = [];
    const document = new PDFDocument({
      autoFirstPage: false,
      compress: false,
      margin: 0,
      pdfVersion: "1.4",
    });
    document.on("data", (chunk: Buffer) => output.push(chunk));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(output)));
    for (const [fontName, fontPath] of Object.entries(pdfFonts)) {
      document.registerFont(fontName, fontPath);
    }

    const writeLine = (line: string, y: number, size = 9) => {
      const text = Array.from(line).slice(0, 105).join("");
      const runs = splitPdfFontRuns(text);
      let x = 50;
      const rightEdge = 562;
      for (const run of runs) {
        if (x >= rightEdge) break;
        document.font(run.font).fontSize(size);
        const runWidth = document.widthOfString(run.text);
        document.text(run.text, x, y, {
          ellipsis: runWidth > rightEdge - x,
          lineBreak: false,
          width: rightEdge - x,
        });
        x += Math.min(runWidth, rightEdge - x);
      }
    };

    for (const [pageIndex, chunk] of chunks.entries()) {
      document.addPage({ size: "LETTER", margin: 0 });
      writeLine("VENTUREFORGE / FILTERED COMPANY EXPORT", 42, 10);
      writeLine(`Generated ${new Date().toISOString().slice(0, 10)}  |  ${companies.length} companies`, 62);
      writeLine("Company | Sector | Country | Stage | Score", 82);
      chunk.forEach((line, index) => writeLine(line, 106 + index * 15));
      document
        .font("latin")
        .fontSize(8)
        .text(`Page ${pageIndex + 1} of ${chunks.length}`, 50, 765, {
          align: "right",
          lineBreak: false,
          width: 512,
        });
    }
    document.end();
  });
}