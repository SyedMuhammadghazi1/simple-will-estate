import { describe, expect, it } from "vitest";
import {
  availableFilingMethods,
  canTransitionFiling,
  isFilingMethodAllowed,
  isFilingOpen,
} from "./filing";
import { getStateRule } from "./states";

describe("filing rules", () => {
  it("offers court deposit only where the state data says so", () => {
    expect(availableFilingMethods(getStateRule("TX"))).toEqual(["court_deposit", "vault"]);
    expect(availableFilingMethods(getStateRule("CA"))).toEqual(["vault"]);
    expect(isFilingMethodAllowed(getStateRule("CA"), "court_deposit")).toBe(false);
    expect(isFilingMethodAllowed(getStateRule("CA"), "vault")).toBe(true);
  });

  it("enforces court-deposit transitions", () => {
    expect(canTransitionFiling("court_deposit", "pending", "sent_to_court")).toBe(true);
    expect(canTransitionFiling("court_deposit", "sent_to_court", "filed")).toBe(true);
    expect(canTransitionFiling("court_deposit", "pending", "filed")).toBe(true);
    expect(canTransitionFiling("court_deposit", "pending", "vaulted")).toBe(false);
    expect(canTransitionFiling("court_deposit", "filed", "sent_to_court")).toBe(false);
  });

  it("enforces vault transitions", () => {
    expect(canTransitionFiling("vault", "pending", "vaulted")).toBe(true);
    expect(canTransitionFiling("vault", "pending", "sent_to_court")).toBe(false);
    expect(canTransitionFiling("vault", "pending", "filed")).toBe(false);
    expect(canTransitionFiling("vault", "vaulted", "cancelled")).toBe(false);
  });

  it("knows which tasks are open", () => {
    expect(isFilingOpen("pending")).toBe(true);
    expect(isFilingOpen("sent_to_court")).toBe(true);
    expect(isFilingOpen("filed")).toBe(false);
  });
});
