import { formatLongDate } from "../dates";
import type { StateRule } from "../states";
import { bpsToPercent, FUNERAL_LABELS, type WillAnswers } from "../will/answers";
import { isBlank, numberToWords, toRoman } from "../will/text";
import { childrenWithAges, hasMarriedStatus } from "../will/validation";
import type { DocBlock, DocumentModel } from "./model";

export interface WillDocumentInput {
  answers: WillAnswers;
  state: StateRule;
  /** Short reference printed in the footer, e.g. "Ref 1A2B3C4D · v1". */
  reference: string;
  /** Snapshot creation time — used for metadata and minor-status computation. */
  createdAt: Date;
  appName: string;
}

export class UnsupportedStateError extends Error {
  constructor(state: StateRule) {
    super(`Wills cannot be generated for ${state.name}`);
    this.name = "UnsupportedStateError";
  }
}

interface Article {
  title: string;
  blocks: DocBlock[];
}

const t = (s: string) => s.trim();
const p = (text: string, extra: Partial<Extract<DocBlock, { type: "paragraph" }>> = {}) =>
  ({ type: "paragraph", text, ...extra }) as const;

function declarationArticle(a: WillAnswers, state: StateRule): Article {
  const name = t(a.about.fullLegalName);
  return {
    title: "Declaration and Revocation of Prior Wills",
    blocks: [
      p(
        `I, ${name.toUpperCase()}, a resident of ${t(a.about.county)} County, ${state.name}, declare this to be my Last Will and Testament.`,
      ),
      p("I revoke all wills and codicils that I have previously made."),
      p(
        "I am of legal age and sound mind, and I make this will freely and voluntarily, without duress or undue influence.",
      ),
    ],
  };
}

function familyArticle(a: WillAnswers, createdAt: Date): Article {
  const blocks: DocBlock[] = [];
  const spouse = t(a.about.spouseName);
  switch (a.about.maritalStatus) {
    case "married":
      blocks.push(
        p(
          `I am married to ${spouse}. All references in this will to "my spouse" are to ${spouse}.`,
        ),
      );
      break;
    case "domestic_partnership":
      blocks.push(
        p(
          `I am in a registered domestic partnership or civil union with ${spouse}. All references in this will to "my spouse" are to ${spouse}.`,
        ),
      );
      break;
    case "separated":
      blocks.push(p("I am legally separated."));
      break;
    case "divorced":
      blocks.push(p("I am divorced and not currently married."));
      break;
    case "widowed":
      blocks.push(p("I am widowed and not currently married."));
      break;
    default:
      blocks.push(p("I am not married."));
  }

  const kids = childrenWithAges(a, createdAt);
  if (kids.length === 0) {
    blocks.push(p("I have no children."));
  } else {
    const noun = kids.length === 1 ? "child" : "children";
    blocks.push(p(`I have ${numberToWords(kids.length)} ${noun}, as follows:`));
    blocks.push({
      type: "list",
      items: kids.map((k) => `${t(k.fullName)}, born ${formatLongDate(k.dateOfBirth)}`),
    });
  }
  blocks.push(
    a.children.includeFutureChildren
      ? p(
          `References in this will to "my children" include ${kids.length ? "the children named above and " : ""}any child born to or legally adopted by me after I sign this will.`,
        )
      : p(
          `References in this will to "my children" mean only ${kids.length ? "the children named above" : "children living when I sign this will"}. I intentionally make no provision in this will for any child born to or adopted by me after I sign it.`,
        ),
  );
  return { title: "Family", blocks };
}

function executorArticle(a: WillAnswers, state: StateRule): Article {
  const e = a.executor;
  const primary = t(e.primary.fullName);
  const blocks: DocBlock[] = [
    p(
      `I appoint ${primary} as Executor (personal representative) of this will.${
        isBlank(e.alternate.fullName)
          ? ""
          : ` If ${primary} fails to qualify or ceases to serve for any reason, I appoint ${t(e.alternate.fullName)} as alternate Executor.`
      }`,
    ),
    e.waiveBond
      ? p(
          "No bond or other security shall be required of any Executor named in this will, in any jurisdiction, to the extent permitted by law.",
        )
      : p("My Executor shall serve with such bond as the court may require."),
    p(
      `To the extent permitted by the law of ${state.name}, I request that my estate be administered with as little court supervision as the law allows (independent or unsupervised administration).`,
    ),
    p(
      "In addition to all powers granted by law, my Executor may, without court order and without notice to any beneficiary:",
    ),
    {
      type: "list",
      items: [
        "(a) sell, lease, exchange or mortgage any real or personal property, publicly or privately, on terms my Executor considers appropriate;",
        "(b) collect, settle, compromise or abandon claims in favor of or against my estate;",
        "(c) pay my legally enforceable debts, funeral expenses and the costs of administering my estate;",
        "(d) employ and reasonably compensate attorneys, accountants and other advisers;",
        "(e) distribute property in cash or in kind, or partly in each, and allocate particular assets among beneficiaries;",
        "(f) access, manage, deactivate or close my digital accounts and digital assets, to the extent permitted by law; and",
        "(g) sign and deliver any document needed to carry out this will.",
      ],
    },
  ];
  return { title: "Executor and Executor's Powers", blocks };
}

function guardianArticle(a: WillAnswers): Article | null {
  const g = a.guardians;
  if (isBlank(g.primary.fullName)) return null;
  const primary = t(g.primary.fullName);
  return {
    title: "Guardian of Minor Children",
    blocks: [
      p(
        `If at my death any of my children is a minor and a guardian is needed, I appoint ${primary} as guardian of the person of each minor child.${
          isBlank(g.alternate.fullName)
            ? ""
            : ` If ${primary} is unable or unwilling to serve, I appoint ${t(g.alternate.fullName)} as guardian.`
        }`,
      ),
      p(
        "No bond shall be required of any guardian named in this will, to the extent permitted by law.",
      ),
    ],
  };
}

function giftsArticle(a: WillAnswers): Article | null {
  const gifts = a.gifts.gifts;
  if (gifts.length === 0) return null;
  return {
    title: "Specific Gifts",
    blocks: [
      p(
        "I make the following specific gifts. Each gift is made only if the recipient survives me. A gift that fails and does not pass to a named alternate becomes part of my residuary estate.",
      ),
      {
        type: "list",
        items: gifts.map((g, i) => {
          const recipient = t(g.recipientName);
          const alt = isBlank(g.alternateRecipientName)
            ? ""
            : ` If ${recipient} does not survive me, I give it to ${t(g.alternateRecipientName)}.`;
          return `(${i + 1}) I give ${t(g.description)} to ${recipient}.${alt}`;
        }),
      },
    ],
  };
}

function residuaryArticle(a: WillAnswers): Article {
  return {
    title: "Residuary Estate",
    blocks: [
      p(
        'I give all the rest, residue and remainder of my estate, including all property of every kind wherever located and any gift that fails or lapses (my "residuary estate"), to the following beneficiaries in the following shares:',
      ),
      {
        type: "list",
        items: a.residuary.beneficiaries.map((b) => {
          const desc =
            b.kind === "charity"
              ? ", a charitable organization"
              : isBlank(b.relationship)
                ? ""
                : `, my ${t(b.relationship).toLowerCase()}`;
          return `${t(b.name)}${desc}: ${bpsToPercent(b.shareBps)} percent (${bpsToPercent(b.shareBps)}%)`;
        }),
      },
    ],
  };
}

function contingentArticle(
  a: WillAnswers,
  state: StateRule,
  residuaryArticleNumber: string,
): Article {
  const blocks: DocBlock[] = [];
  if (a.residuary.contingency === "per_stirpes") {
    blocks.push(
      p(
        `If any individual beneficiary named in Article ${residuaryArticleNumber} does not survive me, that beneficiary's share shall pass to that beneficiary's descendants who survive me, per stirpes. If that beneficiary leaves no surviving descendants, the share shall be divided among the other residuary beneficiaries who survive me, in proportion to their shares.`,
      ),
    );
  } else {
    blocks.push(
      p(
        `If any beneficiary named in Article ${residuaryArticleNumber} does not survive me, that beneficiary's share shall be divided among the other residuary beneficiaries who survive me, in proportion to their shares.`,
      ),
    );
  }
  if (a.residuary.beneficiaries.some((b) => b.kind === "charity")) {
    blocks.push(
      p(
        "If any charitable beneficiary is not in existence, or is not a qualified charitable organization, at my death, its share shall be divided among the other residuary beneficiaries in proportion to their shares.",
      ),
    );
  }
  blocks.push(
    p(
      `If no share of my residuary estate can pass under this will, my residuary estate shall pass to my heirs at law, determined under the laws of ${state.name} in effect at my death.`,
    ),
  );
  return { title: "Contingent Beneficiaries", blocks };
}

function custodianArticle(a: WillAnswers, state: StateRule): Article | null {
  const m = a.minors;
  if (m.useCustodian !== true || isBlank(m.custodianName)) return null;
  const custodian = t(m.custodianName);
  const alt = isBlank(m.alternateCustodianName)
    ? ""
    : ` (or, if ${custodian} is unable or unwilling to serve, to ${t(m.alternateCustodianName)})`;
  return {
    title: "Property for Minor and Young Beneficiaries",
    blocks: [
      p(
        `If any property passing under this will is to be distributed to a person who has not reached age ${m.custodianAge}, my Executor may distribute it to ${custodian}${alt} as custodian for that person under the Uniform Transfers to Minors Act of ${state.name} or any similar law, to be held until that person reaches age ${m.custodianAge}.`,
      ),
      p(
        `If applicable law does not permit a custodianship to continue until age ${m.custodianAge}, the custodianship shall continue until the latest age the law permits.`,
      ),
    ],
  };
}

function wishesArticle(a: WillAnswers): Article | null {
  const w = a.wishes;
  const blocks: DocBlock[] = [];
  if (w.hasPets && !isBlank(w.petCaretakerName)) {
    const caretaker = t(w.petCaretakerName);
    blocks.push(
      p(
        `Pets. I give any pets I own at my death to ${caretaker}, if ${caretaker} survives me and is willing to care for them.${isBlank(w.petNotes) ? "" : ` It is my wish, which is not legally binding, that: ${t(w.petNotes)}`}`,
      ),
    );
  }
  if (!isBlank(w.digitalAssetsInstructions)) {
    blocks.push(
      p(
        `Digital assets. My Executor may access, manage, copy, deactivate and delete my digital assets and electronic communications to the extent permitted by law. I ask my Executor to follow these instructions: ${t(w.digitalAssetsInstructions)}`,
      ),
    );
  }
  if (w.funeralPreference && w.funeralPreference !== "no_preference") {
    const pref =
      w.funeralPreference === "other"
        ? t(w.funeralNotes)
        : `${FUNERAL_LABELS[w.funeralPreference]}.${isBlank(w.funeralNotes) ? "" : ` ${t(w.funeralNotes)}`}`;
    blocks.push(
      p(
        `Funeral wishes. The following are my wishes and are not legally binding on anyone: ${pref}`,
      ),
    );
  }
  if (blocks.length === 0) return null;
  return { title: "Other Wishes", blocks };
}

function generalArticle(state: StateRule): Article {
  return {
    title: "General Provisions",
    blocks: [
      p(
        "Survivorship. A beneficiary who does not survive me by thirty (30) days shall be treated as having died before me.",
      ),
      p(
        "Debts, expenses and taxes. My Executor shall pay from my residuary estate my legally enforceable debts, my funeral expenses, the expenses of administering my estate, and any estate or inheritance taxes payable because of my death.",
      ),
      p(
        'Definitions. "Children" and "descendants" include persons legally adopted before reaching age eighteen (18). "Executor" includes any alternate or successor Executor.',
      ),
      p(
        "Severability. If any provision of this will is unenforceable, the remaining provisions remain in full effect.",
      ),
      p("Headings. Headings are for convenience only and do not affect the meaning of this will."),
      p(`Governing law. This will is governed by the laws of ${state.name}.`),
    ],
  };
}

function signatureBlocks(a: WillAnswers): DocBlock[] {
  const name = t(a.about.fullLegalName);
  return [
    {
      type: "keepTogether",
      blocks: [
        { type: "heading", text: "Signature" },
        p(
          "IN WITNESS WHEREOF, I sign this Last Will and Testament, consisting of this and the preceding pages, each of which I have initialed, on the date written below.",
        ),
        { type: "fillLine", label: "Date:" },
        { type: "fillLine", label: "Signed at (city and state):" },
        { type: "signature", label: `${name}, Testator` },
      ],
    },
  ];
}

function witnessSignatures(count: number): DocBlock[] {
  return Array.from({ length: count }, (_, i) => ({
    type: "signature" as const,
    label: `Witness ${i + 1} signature`,
    detailLines: [
      "Printed name: ________________________________",
      "Address: _____________________________________",
    ],
  }));
}

function attestationBlocks(a: WillAnswers, state: StateRule): DocBlock[] {
  const name = t(a.about.fullLegalName);
  const n = state.witnessesRequired;
  return [
    {
      type: "keepTogether",
      blocks: [
        { type: "heading", text: "Attestation Clause" },
        p(
          `On the date written above, ${name} (the "Testator") declared to us, the ${numberToWords(n)} (${n}) undersigned witnesses, that this instrument is the Testator's will, and signed it in our presence. We now, at the Testator's request, in the Testator's presence and in the presence of each other, sign our names below as witnesses. Each of us declares that we are at least eighteen (18) years of age, that the Testator appears to be of sound mind and under no constraint or undue influence, and that none of us is a beneficiary under this will.`,
        ),
      ],
    },
    ...witnessSignatures(n),
  ];
}

function affidavitBlocks(a: WillAnswers, state: StateRule): DocBlock[] {
  const name = t(a.about.fullLegalName);
  const n = state.witnessesRequired;
  const blocks: DocBlock[] = [
    { type: "pageBreak" },
    { type: "title", text: "Self-Proving Affidavit" },
    p(`STATE OF ${state.name.toUpperCase()}`),
    { type: "fillLine", label: "COUNTY OF" },
    p(
      `We, ${name}, the Testator, and the witnesses, whose names are signed to the attached or foregoing instrument, being first duly sworn, declare to the undersigned authority that the Testator signed and executed the instrument as the Testator's last will; that the Testator signed willingly and executed it as a free and voluntary act for the purposes expressed in it; and that each of the witnesses, in the presence and hearing of the Testator and of each other, signed the will as witness, and that to the best of the witness's knowledge the Testator was at that time eighteen (18) years of age or older, of sound mind, and under no constraint or undue influence.`,
    ),
    { type: "signature", label: `${name}, Testator` },
    ...witnessSignatures(n),
  ];
  if (state.affidavitRequiresNotary) {
    blocks.push({
      type: "keepTogether",
      blocks: [
        { type: "heading", text: "Notary Acknowledgment" },
        p(
          `Subscribed, sworn to and acknowledged before me by ${name}, the Testator, and subscribed and sworn to before me by the above-named witnesses, this ______ day of ____________________, 20____.`,
        ),
        {
          type: "signature",
          label: "Notary Public",
          detailLines: [
            "Printed name: ________________________________",
            "My commission expires: _______________________",
            "(Official seal)",
          ],
        },
      ],
    });
  }
  return blocks;
}

/** Builds the "Last Will and Testament" document model from a snapshot of answers. */
export function buildWillDocument(input: WillDocumentInput): DocumentModel {
  const { answers: a, state } = input;
  if (!state.supported) throw new UnsupportedStateError(state);
  const name = t(a.about.fullLegalName);

  const articles: Article[] = [];
  articles.push(declarationArticle(a, state));
  articles.push(familyArticle(a, input.createdAt));
  articles.push(executorArticle(a, state));
  const guardian = guardianArticle(a);
  if (guardian) articles.push(guardian);
  const gifts = giftsArticle(a);
  if (gifts) articles.push(gifts);
  articles.push(residuaryArticle(a));
  const residuaryNumber = toRoman(articles.length);
  articles.push(contingentArticle(a, state, residuaryNumber));
  const custodian = custodianArticle(a, state);
  if (custodian) articles.push(custodian);
  const wishes = wishesArticle(a);
  if (wishes) articles.push(wishes);
  articles.push(generalArticle(state));

  const blocks: DocBlock[] = [
    { type: "title", text: "Last Will and Testament" },
    { type: "subtitle", text: `of ${name}` },
    { type: "spacer", size: 8 },
  ];
  articles.forEach((article, i) => {
    blocks.push({
      type: "heading",
      text: `Article ${toRoman(i + 1)} — ${article.title}`,
    });
    blocks.push(...article.blocks);
  });
  blocks.push(...signatureBlocks(a));
  blocks.push(...attestationBlocks(a, state));
  if (state.selfProvingAffidavitAvailable) blocks.push(...affidavitBlocks(a, state));

  return {
    kind: "will",
    title: `Last Will and Testament of ${name}`,
    header: `Last Will and Testament of ${name}`,
    footer: input.reference,
    initialsLine: true,
    blocks,
    metadata: {
      subject: `Last Will and Testament (${state.name})`,
      author: input.appName,
      createdAt: input.createdAt,
    },
  };
}

/** Names of all people appointed in the will (used by the signing kit's witness guidance). */
export function interestedPersons(a: WillAnswers): string[] {
  const names = [
    ...a.residuary.beneficiaries.filter((b) => b.kind === "person").map((b) => b.name),
    ...a.gifts.gifts.flatMap((g) => [g.recipientName, g.alternateRecipientName]),
    a.executor.primary.fullName,
    a.executor.alternate.fullName,
    a.guardians.primary.fullName,
    a.guardians.alternate.fullName,
    a.minors.custodianName,
    a.minors.alternateCustodianName,
    a.wishes.hasPets ? a.wishes.petCaretakerName : "",
    hasMarriedStatus(a) ? a.about.spouseName : "",
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const trimmed = n.trim();
    const key = trimmed.toLowerCase();
    if (trimmed && !seen.has(key)) {
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out;
}
