// Missing or malformed capabilities fail closed; preview availability is not authority.
export function generatedDecisionSupported(capability: unknown): boolean {
  return capability === true;
}
