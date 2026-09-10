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
  arabic: require.resolve("@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff"),
  bengali: require.resolve("@fontsource/noto-sans-bengali/files/noto-sans-bengali-bengali-400-normal.woff"),
  devanagari: require.resolve("@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff"),
  japanese: require.resolve("@fontsource/noto-sans-jp/files/noto-sans-jp-japanese-400-normal.woff"),
  chinese: require.resolve("@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff"),
  tamil: require.resolve("@fontsource/noto-sans-tamil/files/noto-sans-tamil-tamil-400-normal.woff"),
  thai: require.resolve("@fontsource/noto-sans-thai/files/noto-sans-thai-thai-400-normal.woff"),
} as const;

export type PdfFontName = keyof typeof pdfFonts;
type PdfHanFont = Extract<PdfFontName, "chinese" | "japanese">;

export function pdfFontForCharacter(
  character: string,
  hanFont: PdfHanFont = "chinese",
): PdfFontName {
  const codePoint = character.codePointAt(0) ?? 0;
  if (
    (codePoint >= 0x0600 && codePoint <= 0x06ff)
    || (codePoint >= 0x0750 && codePoint <= 0x077f)
    || (codePoint >= 0x0870 && codePoint <= 0x089f)
    || (codePoint >= 0x08a0 && codePoint <= 0x08ff)
    || (codePoint >= 0xfb50 && codePoint <= 0xfdff)
    || (codePoint >= 0xfe70 && codePoint <= 0xfeff)
  ) return "arabic";
  if (
    (codePoint >= 0x0900 && codePoint <= 0x097f)
    || (codePoint >= 0xa8e0 && codePoint <= 0xa8ff)
  ) return "devanagari";
  if (codePoint >= 0x0980 && codePoint <= 0x09ff) return "bengali";
  if (codePoint >= 0x0b80 && codePoint <= 0x0bff) return "tamil";
  if (codePoint >= 0x0d80 && codePoint <= 0x0dff) return "sinhala";
  if (codePoint >= 0x0e00 && codePoint <= 0x0e7f) return "thai";
  if (
    (codePoint >= 0x1100 && codePoint <= 0x11ff)
    || (codePoint >= 0x3130 && codePoint <= 0x318f)
    || (codePoint >= 0xa960 && codePoint <= 0xa97f)
    || (codePoint >= 0xac00 && codePoint <= 0xd7af)
    || (codePoint >= 0xd7b0 && codePoint <= 0xd7ff)
  ) return "korean";
  if (
    (codePoint >= 0x3040 && codePoint <= 0x30ff)
    || (codePoint >= 0x31f0 && codePoint <= 0x31ff)
    || (codePoint >= 0xff65 && codePoint <= 0xff9f)
  ) return "japanese";
  if (
    (codePoint >= 0x3400 && codePoint <= 0x4dbf)
    || (codePoint >= 0x4e00 && codePoint <= 0x9fff)
    || (codePoint >= 0xf900 && codePoint <= 0xfaff)
    || (codePoint >= 0x20000 && codePoint <= 0x3134f)
  ) return hanFont;
  return "latin";
}

function isCjkContextFont(font: PdfFontName) {
  return font === "chinese" || font === "japanese" || font === "korean";
}

function isCjkPunctuationOrFullwidth(character: string) {
  const codePoint = character.codePointAt(0) ?? 0;
  return (
    (codePoint >= 0x3000 && codePoint <= 0x303f)
    || (codePoint >= 0xff01 && codePoint <= 0xff64)
    || (codePoint >= 0xffe0 && codePoint <= 0xffef)
  );
}

function pdfHanFontForCountry(country: string): PdfHanFont | undefined {
  const normalized = country.trim().toLowerCase();
  if (["japan", "jp", "jpn", "日本", "日本国"].includes(normalized)) return "japanese";
  if (
    [
      "china",
      "cn",
      "chn",
      "中国",
      "taiwan",
      "tw",
      "twn",
      "台灣",
      "台湾",
      "hong kong",
      "香港",
      "macau",
      "macao",
      "澳門",
      "澳门",
    ].includes(normalized)
  ) return "chinese";
  return undefined;
}

export function splitPdfFontRuns(text: string, preferredHanFont?: PdfHanFont) {
  const runs: Array<{ font: PdfFontName; text: string }> = [];
  const characters = Array.from(text);
  const hanFont = preferredHanFont
    ?? (/[\u3040-\u30ff\u31f0-\u31ff\uff65-\uff9f]/u.test(text) ? "japanese" : "chinese");
  const detectedFonts = characters.map((character) => pdfFontForCharacter(character, hanFont));
  const contextualFonts = detectedFonts.map((font, index) => {
    if (!isCjkPunctuationOrFullwidth(characters[index])) return font;
    for (let left = index - 1; left >= 0; left -= 1) {
      if (isCjkContextFont(detectedFonts[left])) return detectedFonts[left];
      if (/\p{Letter}|\p{Number}/u.test(characters[left])) break;
    }
    for (let right = index + 1; right < characters.length; right += 1) {
      if (isCjkContextFont(detectedFonts[right])) return detectedFonts[right];
      if (/\p{Letter}|\p{Number}/u.test(characters[right])) break;
    }
    return font;
  });
  for (const [index, character] of characters.entries()) {
    const current = runs.at(-1);
    const inheritsPreviousFont = character === "\u200c"
      || character === "\u200d"
      || /\p{Mark}/u.test(character)
      || (current?.font !== "latin" && /\p{Separator}/u.test(character));
    const font = inheritsPreviousFont && current
      ? current.font
      : contextualFonts[index];
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
  const rows = companies.map((company) => ({
    text: `${company.companyName} | ${company.regionalMetadata.sector} | ${company.regionalMetadata.specificCountry} | ${company.lastFundingRound} | ${company.signalScore}`,
    preferredHanFont: pdfHanFontForCountry(company.regionalMetadata.specificCountry),
  }));
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

    const writeLine = (
      line: string,
      y: number,
      size = 9,
      preferredHanFont?: PdfHanFont,
    ) => {
      const text = Array.from(line).slice(0, 105).join("");
      const runs = splitPdfFontRuns(text, preferredHanFont);
      let x = 50;
      const rightEdge = 562;
      for (const run of runs) {
        if (x >= rightEdge) break;
        document.font(run.font).fontSize(size);
        // A features array makes PDFKit send the entire Arabic phrase to
        // fontkit. Without it PDFKit shapes each space-separated word as an
        // independent RTL run, which reverses glyphs but not the word order.
        const features = run.font === "arabic" ? [] : undefined;
        const runWidth = document.widthOfString(run.text, { features });
        document.text(run.text, x, y, {
          ellipsis: runWidth > rightEdge - x,
          features,
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
      chunk.forEach((row, index) =>
        writeLine(row.text, 106 + index * 15, 9, row.preferredHanFont));
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