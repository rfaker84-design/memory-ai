export class PaymentValidationError extends Error {}
export class PaymentNotFoundError extends Error {}
export class PaymentStateError extends Error {}
export class PaymentConfigurationError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
