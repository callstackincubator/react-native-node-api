export function toDeclarationArguments(declarations: Record<string, string>) {
  return Object.entries(declarations).flatMap(([key, value]) => [
    "-D",
    `${key}=${value}`,
  ]);
}
