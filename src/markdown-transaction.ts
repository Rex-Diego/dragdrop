export interface MarkdownMutation {
  path: string;
  before: string;
  after: string;
}

export interface MarkdownTransactionAdapter {
  apply(mutation: MarkdownMutation): Promise<void> | void;
  rollback(mutation: MarkdownMutation): Promise<void> | void;
}

export interface MarkdownTransactionResult {
  ok: boolean;
  error?: unknown;
  rollbackFailed: boolean;
}

function validateMutations(mutations: readonly MarkdownMutation[]): void {
  const paths = new Set<string>();
  for (const mutation of mutations) {
    if (mutation.path.length === 0) throw new Error("Markdown transaction has an empty path.");
    if (paths.has(mutation.path)) {
      throw new Error(`Markdown transaction has duplicate path: ${mutation.path}`);
    }
    paths.add(mutation.path);
  }
}

export async function runMarkdownTransaction(
  mutations: readonly MarkdownMutation[],
  adapter: MarkdownTransactionAdapter,
): Promise<MarkdownTransactionResult> {
  try {
    validateMutations(mutations);
  } catch (error) {
    return { ok: false, error, rollbackFailed: false };
  }

  const applied: MarkdownMutation[] = [];
  try {
    for (const mutation of mutations) {
      if (mutation.before === mutation.after) continue;
      await adapter.apply(mutation);
      applied.push(mutation);
    }
    return { ok: true, rollbackFailed: false };
  } catch (error) {
    let rollbackFailed = false;
    for (const mutation of applied.reverse()) {
      try {
        await adapter.rollback(mutation);
      } catch {
        rollbackFailed = true;
      }
    }
    return { ok: false, error, rollbackFailed };
  }
}
