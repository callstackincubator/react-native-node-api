export function toDefineArguments(
  declarations: Array<Record<string, string | undefined>>,
) {
  return declarations.flatMap((values) =>
    Object.entries(values)
      .filter(([, definition]) => definition)
      .flatMap(([key, definition]) => ["-D", `${key}=${definition}`]),
  );
}
