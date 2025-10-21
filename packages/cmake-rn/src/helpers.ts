export function toDefineArguments(declarations: Array<Record<string, string>>) {
  return declarations.flatMap((values) =>
    Object.entries(values).flatMap(([key, definition]) => [
      "-D",
      `${key}=${definition}`,
    ]),
  );
}
