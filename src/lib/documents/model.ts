/**
 * Renderer-independent document model. Documents are built as plain data first (easy to unit
 * test), then rendered to PDF by `render-pdf.ts`.
 */

export type DocBlock =
  | { type: "title"; text: string }
  | { type: "subtitle"; text: string }
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string; indent?: number; bold?: boolean }
  | { type: "list"; items: string[]; ordered?: boolean }
  | { type: "checkbox"; text: string }
  | { type: "signature"; label: string; detailLines?: string[] }
  | { type: "fillLine"; label: string }
  | { type: "spacer"; size: number }
  | { type: "pageBreak" }
  | { type: "keepTogether"; blocks: DocBlock[] };

export interface DocumentModel {
  kind: "will" | "signing_instructions";
  title: string;
  /** Running header text on every page. */
  header: string;
  /** Left footer text (e.g. document reference). */
  footer: string;
  /** Adds "Testator's initials: ____" to every page footer. */
  initialsLine: boolean;
  blocks: DocBlock[];
  metadata: {
    subject: string;
    author: string;
    /** Fixed creation date so rendering is deterministic. */
    createdAt: Date;
  };
}

/** Flattens a document model to plain text (for tests, search and hashing). */
export function documentText(model: DocumentModel): string {
  const lines: string[] = [model.title];
  const walk = (blocks: DocBlock[]) => {
    for (const b of blocks) {
      switch (b.type) {
        case "title":
        case "subtitle":
        case "heading":
        case "paragraph":
        case "checkbox":
          lines.push(b.text);
          break;
        case "list":
          lines.push(...b.items);
          break;
        case "signature":
          lines.push(b.label, ...(b.detailLines ?? []));
          break;
        case "fillLine":
          lines.push(b.label);
          break;
        case "keepTogether":
          walk(b.blocks);
          break;
        default:
          break;
      }
    }
  };
  walk(model.blocks);
  return lines.join("\n");
}
