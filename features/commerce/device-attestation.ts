import { CommerceConfigurationError, CommerceValidationError } from "./errors";

export type VerifiedDevice = {
  /** A non-reversible, stable digest produced by a trusted attestation adapter. */
  deviceKeyHash: string;
};

export interface DeviceAttestationVerifier {
  verify(token: string): Promise<VerifiedDevice>;
}

/**
 * Referral rewards fail closed until the mobile/web trust boundary supplies a
 * real attestation verifier. Client storage is never accepted as the ledger.
 */
export class UnconfiguredDeviceAttestationVerifier
  implements DeviceAttestationVerifier
{
  async verify(): Promise<VerifiedDevice> {
    throw new CommerceConfigurationError("DEVICE_ATTESTATION_NOT_CONFIGURED");
  }
}

export function assertVerifiedDevice(device: VerifiedDevice): VerifiedDevice {
  if (!/^[0-9a-f]{64}$/.test(device.deviceKeyHash)) {
    throw new CommerceValidationError("DEVICE_ATTESTATION_INVALID");
  }
  return device;
}
