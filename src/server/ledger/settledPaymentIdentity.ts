export type SettledPaymentIdentityInput = {
  paymentReceipt?: {
    erc7710Proof?: {
      permissionContextHash?: string | null;
    } | null;
    oneShot?: {
      txHash?: string | null;
    } | null;
    requirementId?: string | null;
    txHash?: string | null;
  } | null;
  paymentRequirement?: {
    id?: string | null;
  } | null;
};

export type SettledPaymentIdentity = {
  payloadContextHash: string | null;
  requirementId: string | null;
  txHash: string | null;
};

function lower(value: string | null | undefined) {
  return value ? value.toLowerCase() : null;
}

export function settledPaymentIdentity(
  input: SettledPaymentIdentityInput
): SettledPaymentIdentity {
  return {
    payloadContextHash: lower(
      input.paymentReceipt?.erc7710Proof?.permissionContextHash
    ),
    requirementId: input.paymentReceipt?.requirementId ?? input.paymentRequirement?.id ?? null,
    txHash: lower(input.paymentReceipt?.txHash ?? input.paymentReceipt?.oneShot?.txHash)
  };
}

export function hasSettledPaymentIdentity(identity: SettledPaymentIdentity) {
  return !!identity.txHash || !!identity.requirementId || !!identity.payloadContextHash;
}

export function settledPaymentIdentitiesMatch(
  left: SettledPaymentIdentity,
  right: SettledPaymentIdentity
) {
  return (
    (!!left.txHash && left.txHash === right.txHash) ||
    (!!left.requirementId && left.requirementId === right.requirementId) ||
    (!!left.payloadContextHash &&
      left.payloadContextHash === right.payloadContextHash)
  );
}
