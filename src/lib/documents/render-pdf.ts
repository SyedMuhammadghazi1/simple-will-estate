import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { isRenderableChar } from "../will/text";
import type { DocBlock, DocumentModel } from "./model";

/**
 * Renders a DocumentModel to PDF bytes using pdf-lib's built-in Times fonts.
 * Output is deterministic for a given model (fixed metadata dates, no random ids), so the same
 * snapshot always yields byte-identical documents.
 */

export interface RenderOptions {
  /** Diagonal watermark text on every page (used for pre-payment previews). */
  watermark?: string;
}

const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;
const MARGIN_X = 72;
const MARGIN_TOP = 72;
const MARGIN_BOTTOM = 80;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const BODY_SIZE = 11.5;
const LINE_HEIGHT = 15.5;
const TEXT_COLOR = rgb(0.08, 0.08, 0.1);
const MUTED = rgb(0.35, 0.35, 0.4);

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
}

/** Replaces characters the standard fonts cannot encode (validation should prevent these). */
export function sanitizeForPdf(text: string): string {
  let out = "";
  for (const ch of text.replace(/\t/g, "    ")) {
    const cp = ch.codePointAt(0) ?? 0x3f;
    out += isRenderableChar(cp) && cp !== 0x0d ? ch : "?";
  }
  return out;
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of sanitizeForPdf(text).split("\n")) {
    const words = paragraph.split(/ +/).filter((w) => w.length > 0);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // Hard-break words longer than the available width.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    if (line) lines.push(line);
  }
  return lines;
}

class Layout {
  page!: PDFPage;
  y = 0;
  pages: PDFPage[] = [];

  constructor(
    private readonly doc: PDFDocument,
    private readonly fonts: Fonts,
  ) {
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pages.push(this.page);
    this.y = PAGE_HEIGHT - MARGIN_TOP;
  }

  remaining() {
    return this.y - MARGIN_BOTTOM;
  }

  ensure(height: number) {
    if (height > this.remaining()) this.newPage();
  }

  lines(
    lines: string[],
    font: PDFFont,
    size: number,
    opts: {
      indent?: number;
      align?: "left" | "center";
      lineHeight?: number;
      color?: typeof TEXT_COLOR;
    } = {},
  ) {
    const lh = opts.lineHeight ?? LINE_HEIGHT;
    for (const line of lines) {
      this.ensure(lh);
      const x =
        opts.align === "center"
          ? (PAGE_WIDTH - font.widthOfTextAtSize(line, size)) / 2
          : MARGIN_X + (opts.indent ?? 0);
      this.page.drawText(line, {
        x,
        y: this.y - size,
        size,
        font,
        color: opts.color ?? TEXT_COLOR,
      });
      this.y -= lh;
    }
  }

  measure(block: DocBlock): number {
    const f = this.fonts;
    switch (block.type) {
      case "title":
        return wrap(block.text, f.bold, 18, CONTENT_WIDTH).length * 24 + 6;
      case "subtitle":
        return wrap(block.text, f.italic, 13, CONTENT_WIDTH).length * 18 + 4;
      case "heading":
        return (
          wrap(block.text.toUpperCase(), f.bold, 11.5, CONTENT_WIDTH).length * LINE_HEIGHT + 14
        );
      case "paragraph":
        return (
          wrap(
            block.text,
            block.bold ? f.bold : f.regular,
            BODY_SIZE,
            CONTENT_WIDTH - (block.indent ?? 0),
          ).length *
            LINE_HEIGHT +
          6
        );
      case "list":
        return (
          block.items.reduce(
            (sum, item) =>
              sum + wrap(item, f.regular, BODY_SIZE, CONTENT_WIDTH - 24).length * LINE_HEIGHT + 3,
            0,
          ) + 6
        );
      case "checkbox":
        return wrap(block.text, f.regular, BODY_SIZE, CONTENT_WIDTH - 22).length * LINE_HEIGHT + 4;
      case "signature":
        return 34 + 14 + (block.detailLines?.length ?? 0) * 16 + 8;
      case "fillLine":
        return 26;
      case "spacer":
        return block.size;
      case "pageBreak":
        return 0;
      case "keepTogether":
        return block.blocks.reduce((sum, b) => sum + this.measure(b), 0);
    }
  }

  render(block: DocBlock) {
    const f = this.fonts;
    switch (block.type) {
      case "title":
        this.lines(wrap(block.text, f.bold, 18, CONTENT_WIDTH), f.bold, 18, {
          align: "center",
          lineHeight: 24,
        });
        this.y -= 6;
        break;
      case "subtitle":
        this.lines(wrap(block.text, f.italic, 13, CONTENT_WIDTH), f.italic, 13, {
          align: "center",
          lineHeight: 18,
        });
        this.y -= 4;
        break;
      case "heading": {
        // Keep the heading with at least three lines of the following text.
        this.ensure(this.measure(block) + LINE_HEIGHT * 3);
        this.y -= 8;
        this.lines(wrap(block.text.toUpperCase(), f.bold, 11.5, CONTENT_WIDTH), f.bold, 11.5);
        this.y -= 6;
        break;
      }
      case "paragraph": {
        const font = block.bold ? f.bold : f.regular;
        this.lines(
          wrap(block.text, font, BODY_SIZE, CONTENT_WIDTH - (block.indent ?? 0)),
          font,
          BODY_SIZE,
          {
            indent: block.indent,
          },
        );
        this.y -= 6;
        break;
      }
      case "list":
        for (const item of block.items) {
          this.lines(wrap(item, f.regular, BODY_SIZE, CONTENT_WIDTH - 24), f.regular, BODY_SIZE, {
            indent: 24,
          });
          this.y -= 3;
        }
        this.y -= 6;
        break;
      case "checkbox": {
        const lines = wrap(block.text, f.regular, BODY_SIZE, CONTENT_WIDTH - 22);
        this.ensure(lines.length * LINE_HEIGHT + 4);
        this.page.drawRectangle({
          x: MARGIN_X + 2,
          y: this.y - BODY_SIZE,
          width: 10,
          height: 10,
          borderColor: TEXT_COLOR,
          borderWidth: 0.8,
        });
        this.lines(lines, f.regular, BODY_SIZE, { indent: 22 });
        this.y -= 4;
        break;
      }
      case "signature": {
        this.ensure(this.measure(block));
        this.y -= 34;
        this.page.drawLine({
          start: { x: MARGIN_X, y: this.y },
          end: { x: MARGIN_X + 280, y: this.y },
          thickness: 0.8,
          color: TEXT_COLOR,
        });
        this.y -= 4;
        this.lines([sanitizeForPdf(block.label)], f.regular, 10, { lineHeight: 14 });
        for (const detail of block.detailLines ?? []) {
          this.y -= 2;
          this.lines([sanitizeForPdf(detail)], f.regular, 10, { lineHeight: 14 });
        }
        this.y -= 8;
        break;
      }
      case "fillLine": {
        this.ensure(26);
        this.y -= 12;
        const label = sanitizeForPdf(block.label);
        this.page.drawText(label, {
          x: MARGIN_X,
          y: this.y - BODY_SIZE + 4,
          size: BODY_SIZE,
          font: f.regular,
          color: TEXT_COLOR,
        });
        const start = MARGIN_X + f.regular.widthOfTextAtSize(label, BODY_SIZE) + 8;
        this.page.drawLine({
          start: { x: start, y: this.y - BODY_SIZE + 3 },
          end: { x: Math.max(start + 120, MARGIN_X + 330), y: this.y - BODY_SIZE + 3 },
          thickness: 0.6,
          color: TEXT_COLOR,
        });
        this.y -= 14;
        break;
      }
      case "spacer":
        this.y -= block.size;
        break;
      case "pageBreak":
        if (this.y < PAGE_HEIGHT - MARGIN_TOP) this.newPage();
        break;
      case "keepTogether": {
        const height = this.measure(block);
        if (height <= PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM) this.ensure(height);
        for (const b of block.blocks) this.render(b);
        break;
      }
    }
  }
}

export async function renderDocumentPdf(
  model: DocumentModel,
  options: RenderOptions = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.TimesRoman),
    bold: await doc.embedFont(StandardFonts.TimesRomanBold),
    italic: await doc.embedFont(StandardFonts.TimesRomanItalic),
  };
  const helvetica = await doc.embedFont(StandardFonts.HelveticaBold);

  const layout = new Layout(doc, fonts);
  for (const block of model.blocks) layout.render(block);

  const total = layout.pages.length;
  layout.pages.forEach((page, i) => {
    const header = sanitizeForPdf(model.header);
    page.drawText(header, {
      x: MARGIN_X,
      y: PAGE_HEIGHT - 44,
      size: 8.5,
      font: fonts.italic,
      color: MUTED,
    });
    page.drawLine({
      start: { x: MARGIN_X, y: PAGE_HEIGHT - 50 },
      end: { x: PAGE_WIDTH - MARGIN_X, y: PAGE_HEIGHT - 50 },
      thickness: 0.4,
      color: MUTED,
    });
    const footerY = 40;
    page.drawText(sanitizeForPdf(model.footer), {
      x: MARGIN_X,
      y: footerY,
      size: 8,
      font: fonts.regular,
      color: MUTED,
    });
    const pageLabel = `Page ${i + 1} of ${total}`;
    page.drawText(pageLabel, {
      x: (PAGE_WIDTH - fonts.regular.widthOfTextAtSize(pageLabel, 9)) / 2,
      y: footerY,
      size: 9,
      font: fonts.regular,
      color: TEXT_COLOR,
    });
    if (model.initialsLine) {
      const label = "Testator's initials: ________";
      page.drawText(label, {
        x: PAGE_WIDTH - MARGIN_X - fonts.regular.widthOfTextAtSize(label, 9),
        y: footerY,
        size: 9,
        font: fonts.regular,
        color: TEXT_COLOR,
      });
    }
    if (options.watermark) {
      const text = sanitizeForPdf(options.watermark);
      const size = 46;
      const width = helvetica.widthOfTextAtSize(text, size);
      const angle = 45;
      const rad = (angle * Math.PI) / 180;
      page.drawText(text, {
        x: PAGE_WIDTH / 2 - (width / 2) * Math.cos(rad) + (size / 3) * Math.sin(rad),
        y: PAGE_HEIGHT / 2 - (width / 2) * Math.sin(rad) - (size / 3) * Math.cos(rad),
        size,
        font: helvetica,
        color: rgb(0.8, 0.1, 0.1),
        opacity: 0.18,
        rotate: degrees(angle),
      });
      page.drawText(`${text} — preview only, do not sign`, {
        x: MARGIN_X,
        y: PAGE_HEIGHT - 30,
        size: 9,
        font: helvetica,
        color: rgb(0.7, 0.1, 0.1),
      });
    }
  });

  doc.setTitle(
    sanitizeForPdf(options.watermark ? `${options.watermark}: ${model.title}` : model.title),
  );
  doc.setAuthor(sanitizeForPdf(model.metadata.author));
  doc.setSubject(sanitizeForPdf(model.metadata.subject));
  doc.setCreator(sanitizeForPdf(model.metadata.author));
  doc.setProducer(sanitizeForPdf(model.metadata.author));
  doc.setCreationDate(model.metadata.createdAt);
  doc.setModificationDate(model.metadata.createdAt);

  return doc.save({ useObjectStreams: false });
}
