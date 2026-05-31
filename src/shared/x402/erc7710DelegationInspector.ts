import { getSmartAccountsEnvironment } from "@metamask/smart-accounts-kit";
import type { Caveat } from "@metamask/smart-accounts-kit";
import { decodeDelegations } from "@metamask/smart-accounts-kit/utils";
import { getAddress, isAddress, isHex, type Address, type Hex } from "viem";
import { BASE_SEPOLIA_CHAIN_ID } from "@/shared/chain";

export type Erc7710RedeemerConstraintInspection = {
  acceptedRedeemers: Address[];
  allowedRedeemers: Address[];
  decoded: boolean;
  delegationCount: number;
  error: string | null;
  hasAcceptedFacilitatorRedeemer: boolean;
  hasAllRequiredRedeemers: boolean;
  hasRedeemerEnforcer: boolean;
  missingRequiredRedeemers: Address[];
  redeemerCaveatCount: number;
  redeemerEnforcer: Address | null;
};

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return typeof error === "string" ? error : "Unknown error";
}

function normalizeAddress(value: string): Address | null {
  return isAddress(value) ? getAddress(value) as Address : null;
}

function uniqueAddresses(addresses: readonly string[]) {
  const seen = new Set<string>();
  const result: Address[] = [];

  for (const value of addresses) {
    const address = normalizeAddress(value);
    if (!address) continue;

    const key = address.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(address);
  }

  return result;
}

function decodeRedeemerTerms(terms: Hex) {
  const body = terms.slice(2);

  if (body.length === 0 || body.length % 40 !== 0) {
    throw new Error("RedeemerEnforcer terms are not 20-byte address chunks.");
  }

  const redeemers: Address[] = [];

  for (let offset = 0; offset < body.length; offset += 40) {
    const address = normalizeAddress(`0x${body.slice(offset, offset + 40)}`);

    if (!address) {
      throw new Error("RedeemerEnforcer terms include an invalid address.");
    }

    redeemers.push(address);
  }

  return redeemers;
}

function decodeCaveatRedeemers(caveat: Caveat) {
  if (!isHex(caveat.terms)) {
    throw new Error("RedeemerEnforcer caveat terms are not hex.");
  }

  return decodeRedeemerTerms(caveat.terms);
}

function emptyInspection(
  requiredRedeemers: Address[],
  error: string | null
): Erc7710RedeemerConstraintInspection {
  return {
    acceptedRedeemers: [],
    allowedRedeemers: [],
    decoded: false,
    delegationCount: 0,
    error,
    hasAcceptedFacilitatorRedeemer: false,
    hasAllRequiredRedeemers: requiredRedeemers.length === 0,
    hasRedeemerEnforcer: false,
    missingRequiredRedeemers: requiredRedeemers,
    redeemerCaveatCount: 0,
    redeemerEnforcer: null
  };
}

export function inspectErc7710RedeemerConstraint(
  permissionContext: Hex,
  requiredRedeemers: readonly string[],
  chainId = BASE_SEPOLIA_CHAIN_ID
): Erc7710RedeemerConstraintInspection {
  const required = uniqueAddresses(requiredRedeemers);

  if (!isHex(permissionContext) || permissionContext === "0x") {
    return emptyInspection(required, "Permission context is not non-empty hex.");
  }

  try {
    const environment = getSmartAccountsEnvironment(chainId);
    const redeemerEnforcer = normalizeAddress(
      environment.caveatEnforcers.RedeemerEnforcer
    );

    if (!redeemerEnforcer) {
      return emptyInspection(required, "RedeemerEnforcer is not configured.");
    }

    const redeemerEnforcerKey = redeemerEnforcer.toLowerCase();
    const delegations = decodeDelegations(permissionContext);
    const redeemerCaveats = delegations.flatMap((delegation) =>
      delegation.caveats.filter(
        (caveat) => caveat.enforcer.toLowerCase() === redeemerEnforcerKey
      )
    );
    const allowedRedeemers = uniqueAddresses(
      redeemerCaveats.flatMap((caveat) => decodeCaveatRedeemers(caveat))
    );
    const allowedKeys = new Set(
      allowedRedeemers.map((address) => address.toLowerCase())
    );
    const requiredKeys = new Set(required.map((address) => address.toLowerCase()));
    const acceptedRedeemers = allowedRedeemers.filter((address) =>
      requiredKeys.has(address.toLowerCase())
    );
    const missingRequiredRedeemers = required.filter(
      (address) => !allowedKeys.has(address.toLowerCase())
    );

    return {
      acceptedRedeemers,
      allowedRedeemers,
      decoded: true,
      delegationCount: delegations.length,
      error: null,
      hasAcceptedFacilitatorRedeemer: acceptedRedeemers.length > 0,
      hasAllRequiredRedeemers: missingRequiredRedeemers.length === 0,
      hasRedeemerEnforcer: redeemerCaveats.length > 0,
      missingRequiredRedeemers,
      redeemerCaveatCount: redeemerCaveats.length,
      redeemerEnforcer
    };
  } catch (error) {
    return emptyInspection(required, errorMessage(error));
  }
}
