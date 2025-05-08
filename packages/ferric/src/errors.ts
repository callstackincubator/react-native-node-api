import assert from "node:assert/strict";

export type Fix =
  | {
      instructions: string;
      command?: never;
    }
  | {
      instructions?: never;
      command: string;
    };

export class UsageError extends Error {
  public readonly fix?: Fix;

  constructor(
    message: string,
    { fix, cause }: { cause?: unknown; fix?: Fix } = {}
  ) {
    super(message, { cause });
    this.fix = fix;
  }
}

export function assertFixable(
  value: unknown,
  message: string,
  fix: Fix
): asserts value {
  try {
    assert(value, message);
  } catch (error) {
    assert(error instanceof Error);
    throw new UsageError(message, { fix });
  }
}
