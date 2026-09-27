import { emptyAnswers, type WillAnswers } from "./answers";
import { sameName } from "./text";

/**
 * Builds a starting draft for the second will of a couple ("mirror will") from the first
 * testator's answers. The partner becomes the testator; anywhere the partner was named as a
 * beneficiary / executor / guardian / custodian, the first testator is named instead.
 *
 * Personal items (specific gifts, funeral wishes) and the partner's own date of birth are NOT
 * copied — the partner must review and complete every step themselves.
 */
export function mirrorAnswers(source: WillAnswers, idFactory: () => string): WillAnswers {
  const out = emptyAnswers();
  const testator = source.about.fullLegalName.trim();
  const partner = source.about.spouseName.trim();
  const swap = (name: string) =>
    sameName(name, partner) ? testator : sameName(name, testator) ? partner : name;

  out.about = {
    ...source.about,
    fullLegalName: partner,
    spouseName: testator,
    dateOfBirth: "",
  };
  out.situation = { ...source.situation };
  out.children = {
    ...source.children,
    children: source.children.children.map((c) => ({ ...c, id: idFactory() })),
  };
  out.guardians = {
    primary: { ...source.guardians.primary, fullName: swap(source.guardians.primary.fullName) },
    alternate: {
      ...source.guardians.alternate,
      fullName: swap(source.guardians.alternate.fullName),
    },
  };
  out.executor = {
    primary: { ...source.executor.primary, fullName: swap(source.executor.primary.fullName) },
    alternate: {
      ...source.executor.alternate,
      fullName: swap(source.executor.alternate.fullName),
    },
    waiveBond: source.executor.waiveBond,
  };
  out.residuary = {
    contingency: source.residuary.contingency,
    beneficiaries: source.residuary.beneficiaries.map((b) => ({
      ...b,
      id: idFactory(),
      name: swap(b.name),
    })),
  };
  out.minors = {
    ...source.minors,
    custodianName: swap(source.minors.custodianName),
    alternateCustodianName: swap(source.minors.alternateCustodianName),
  };
  return out;
}
