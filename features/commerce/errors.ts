export class CommerceValidationError extends Error {}
export class CommerceNotFoundError extends Error {}
export class CommerceStateError extends Error {}

export class CommerceConfigurationError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
