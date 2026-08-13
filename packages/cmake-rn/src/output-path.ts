import path from "node:path";

/**
 * Expand `{placeholder}` occurrences in a template.
 *
 * Placeholders without a value are left untouched, so a template can be expanded
 * in multiple passes as more values become known.
 */
export function expandTemplate(
  input: string,
  values: Record<string, unknown>,
): string {
  return input.replaceAll(/{([^}]+)}/g, (match, key: string) =>
    typeof values[key] === "string" ? values[key] : match,
  );
}

/**
 * The final artifacts are emitted per target, relative to the source directory
 * of the target itself. This keeps a target's prebuild next to the sources it
 * was built from, even when a single project declares many addons, which is what
 * the Babel plugin and auto-linking rely on to resolve a `require`.
 */
export function createOutputPathResolver(outTemplate: string, source: string) {
  return function resolveOutputPath(targetSourceDir: string) {
    return path.resolve(
      process.cwd(),
      expandTemplate(outTemplate, {
        // `paths.source` is relative to the top-level source directory, unless
        // the target lives outside of it, in which case it is already absolute.
        targetSourceDir: path.resolve(source, targetSourceDir),
      }),
    );
  };
}
