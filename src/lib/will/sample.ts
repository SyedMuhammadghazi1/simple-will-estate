import { emptyAnswers, type WillAnswers } from "./answers";

/**
 * A complete, valid set of answers used by tests, the seed script and e2e fixtures.
 * All people are fictional.
 */
export function sampleAnswers(overrides: Partial<WillAnswers> = {}): WillAnswers {
  const base = emptyAnswers();
  return {
    ...base,
    about: {
      fullLegalName: "Jordan Avery Sample",
      dateOfBirth: "1984-03-14",
      stateCode: "TX",
      county: "Travis",
      addressLine1: "100 Example Street",
      addressLine2: "",
      city: "Austin",
      postalCode: "78701",
      maritalStatus: "married",
      spouseName: "Casey Morgan Sample",
    },
    situation: {
      estimatedEstateValueCents: 450_000_00,
      ownsBusiness: false,
      specialNeedsBeneficiary: false,
      disinheritSpouse: false,
      spouseNonUsCitizen: false,
      significantForeignAssets: false,
      expectsContest: false,
    },
    children: {
      hasChildren: true,
      children: [
        { id: "c1", fullName: "Riley Sample", dateOfBirth: "2015-06-01" },
        { id: "c2", fullName: "Taylor Sample", dateOfBirth: "2001-09-20" },
      ],
      includeFutureChildren: true,
    },
    guardians: {
      primary: { fullName: "Morgan Lee Guardian", relationship: "Sister" },
      alternate: { fullName: "Sam Patel", relationship: "Friend" },
    },
    executor: {
      primary: { fullName: "Casey Morgan Sample", relationship: "Spouse" },
      alternate: { fullName: "Morgan Lee Guardian", relationship: "Sister" },
      waiveBond: true,
    },
    residuary: {
      beneficiaries: [
        {
          id: "b1",
          kind: "person",
          name: "Casey Morgan Sample",
          relationship: "Spouse",
          shareBps: 8_000,
        },
        { id: "b2", kind: "person", name: "Riley Sample", relationship: "Son", shareBps: 1_000 },
        {
          id: "b3",
          kind: "charity",
          name: "Example Animal Shelter",
          relationship: "",
          shareBps: 1_000,
        },
      ],
      contingency: "per_stirpes",
    },
    gifts: {
      gifts: [
        {
          id: "g1",
          description: "my grandfather's pocket watch",
          recipientName: "Taylor Sample",
          alternateRecipientName: "Riley Sample",
        },
      ],
    },
    minors: {
      useCustodian: true,
      custodianAge: 25,
      custodianName: "Morgan Lee Guardian",
      alternateCustodianName: "Sam Patel",
    },
    wishes: {
      funeralPreference: "cremation",
      funeralNotes: "Scatter my ashes at the lake.",
      hasPets: true,
      petCaretakerName: "Sam Patel",
      petNotes: "Please keep the two cats together.",
      digitalAssetsInstructions: "Memorialize my social media accounts.",
    },
    ...overrides,
  };
}
