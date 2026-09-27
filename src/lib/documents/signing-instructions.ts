import { FILING_METHOD_LABELS, availableFilingMethods } from "../filing";
import type { StateRule } from "../states";
import type { WillAnswers } from "../will/answers";
import { joinWithAnd, numberToWords } from "../will/text";
import type { DocBlock, DocumentModel } from "./model";
import { interestedPersons, UnsupportedStateError } from "./will-document";

export interface SigningInstructionsInput {
  answers: WillAnswers;
  state: StateRule;
  reference: string;
  createdAt: Date;
  appName: string;
}

/** State-specific signing kit (checklist) that accompanies the will. */
export function buildSigningInstructions(input: SigningInstructionsInput): DocumentModel {
  const { answers: a, state, appName } = input;
  if (!state.supported) throw new UnsupportedStateError(state);
  const name = a.about.fullLegalName.trim();
  const n = state.witnessesRequired;
  const nWords = `${numberToWords(n)} (${n})`;
  const interested = interestedPersons(a);

  const blocks: DocBlock[] = [
    { type: "title", text: "Signing Instructions" },
    { type: "subtitle", text: `${state.name} — for the will of ${name}` },
    { type: "spacer", size: 6 },
    {
      type: "paragraph",
      text: `A will only works if it is signed correctly. Follow every step below. Your will is sized for ${nWords} witnesses${state.selfProvingAffidavitAvailable ? " and includes a self-proving affidavit that must be notarized" : ""}.`,
    },
  ];

  if (state.legalReviewStatus !== "reviewed") {
    blocks.push({
      type: "paragraph",
      bold: true,
      text: `Important: the ${state.name}-specific details in this kit are general information and have not yet been verified by an attorney licensed in ${state.name}. ${appName} is not a law firm and does not give legal advice. If you have any doubt, ask a local attorney to supervise your signing.`,
    });
  }

  blocks.push({ type: "heading", text: "1. Before the signing" });
  const before = [
    "Read your entire will carefully. If anything is wrong, do not sign — update your answers in your dashboard and download the corrected will.",
    "Print the will single-sided on plain white paper. Do not print on both sides and do not add or remove pages.",
    `Choose ${nWords} witnesses. Each witness must be an adult (at least 18) who is "disinterested": not a beneficiary, not the spouse or partner of a beneficiary, and ideally not a relative or anyone you have appointed in the will.`,
  ];
  if (interested.length > 0) {
    before.push(`Do not ask any of these people to be a witness: ${joinWithAnd(interested)}.`);
  }
  if (state.selfProvingAffidavitAvailable && state.affidavitRequiresNotary) {
    before.push(
      "Arrange a notary public. The self-proving affidavit at the end of your will lets a court accept the will without tracking down your witnesses later. You and every witness sign it in front of the notary. Bring government-issued photo ID for everyone.",
    );
  } else if (state.selfProvingAffidavitAvailable) {
    before.push(
      "Your will includes a self-proving affidavit. You and every witness sign it at the same sitting.",
    );
  }
  blocks.push({ type: "list", items: before.map((s) => `• ${s}`) });

  blocks.push({ type: "heading", text: "2. At the signing" });
  const during = [
    `Everyone — you, the ${nWords} witnesses${state.selfProvingAffidavitAvailable && state.affidavitRequiresNotary ? " and the notary" : ""} — must be physically present in the same room for the entire signing. Remote or video signing is not supported by this kit.`,
    'Tell the witnesses: "This is my will, and I would like you to witness my signature."',
    "Initial the bottom of every page in the space provided.",
    "Write the date and the city and state, then sign the will on the signature line in blue or black ink while all witnesses watch.",
    "Each witness then signs, prints their name and writes their address in the attestation section, while you and the other witnesses watch. Everyone signs in each other's presence.",
  ];
  if (state.selfProvingAffidavitAvailable) {
    during.push(
      state.affidavitRequiresNotary
        ? "Finally, you and the witnesses sign the self-proving affidavit in front of the notary, who completes the acknowledgment and applies their seal."
        : "Finally, you and the witnesses sign the self-proving affidavit.",
    );
  }
  blocks.push({ type: "list", items: during.map((s, i) => `${i + 1}. ${s}`) });

  blocks.push({ type: "heading", text: "3. After the signing" });
  const methods = availableFilingMethods(state);
  const after = [
    "Do not unstaple, add to, cross out, or write on the will after it is signed. Any change needs a new will or a formal amendment (codicil) signed with the same formalities. Use your dashboard to update your will.",
    `Scan or photograph every page (including the signature pages) and upload it in your ${appName} dashboard, then mark your will as signed.`,
    `Choose where the original is kept: ${joinWithAnd(methods.map((m) => FILING_METHOD_LABELS[m].toLowerCase()))}${
      state.courtDepositOffered && state.depositAuthority
        ? `. In ${state.name}, deposits are made with the ${state.depositAuthority}`
        : ""
    }. You can also keep it yourself in a fireproof place — but tell your executor where it is.`,
    "Tell your executor where the original will is kept. A copy is not usually enough to probate a will.",
    "Review your will after major life events: marriage, divorce, the birth or adoption of a child, moving to another state, or the death of someone named in it. In many states marriage or divorce can automatically change or revoke parts of a will.",
  ];
  blocks.push({ type: "list", items: after.map((s) => `• ${s}`) });

  if (state.notes.length > 0) {
    blocks.push({ type: "heading", text: `4. Notes for ${state.name}` });
    blocks.push({ type: "list", items: state.notes.map((s) => `• ${s}`) });
  }

  blocks.push({
    type: "keepTogether",
    blocks: [
      { type: "heading", text: "Signing-day checklist" },
      { type: "checkbox", text: "Will printed single-sided, all pages present, stapled once" },
      { type: "checkbox", text: `${nWords} disinterested adult witnesses present` },
      ...(state.selfProvingAffidavitAvailable && state.affidavitRequiresNotary
        ? [{ type: "checkbox" as const, text: "Notary public present; photo ID for everyone" }]
        : []),
      { type: "checkbox", text: "Every page initialed by you" },
      {
        type: "checkbox",
        text: "Date and place written; will signed by you with witnesses watching",
      },
      {
        type: "checkbox",
        text: "Each witness signed, printed name and address, in everyone's presence",
      },
      ...(state.selfProvingAffidavitAvailable
        ? [
            {
              type: "checkbox" as const,
              text: "Self-proving affidavit signed (and notarized, if required)",
            },
          ]
        : []),
      { type: "checkbox", text: "Signed copy scanned and uploaded to your dashboard" },
      { type: "checkbox", text: "Original stored safely and executor told where it is" },
    ],
  });

  blocks.push({ type: "spacer", size: 10 });
  blocks.push({
    type: "paragraph",
    text: `${appName} is not a law firm and does not provide legal advice. These instructions are general information about signing a will in ${state.name}.`,
  });

  return {
    kind: "signing_instructions",
    title: `Signing Instructions — ${state.name}`,
    header: `Signing Instructions — will of ${name}`,
    footer: input.reference,
    initialsLine: false,
    blocks,
    metadata: {
      subject: `Signing instructions (${state.name})`,
      author: appName,
      createdAt: input.createdAt,
    },
  };
}
