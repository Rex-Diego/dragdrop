export type DragCommitOwner = "canvas" | "markdown";

export interface DragCommitClaim {
  sessionId: string;
  owner: DragCommitOwner;
}

export function claimDragCommit(
  current: DragCommitClaim | null,
  sessionId: string,
  owner: DragCommitOwner,
): { accepted: boolean; claim: DragCommitClaim | null } {
  if (current !== null) return { accepted: false, claim: current };
  return {
    accepted: true,
    claim: { sessionId, owner },
  };
}

export class DragCommitGate {
  private claim: DragCommitClaim | null = null;

  begin(sessionId: string): void {
    if (this.claim?.sessionId !== sessionId) this.claim = null;
  }

  tryClaim(sessionId: string, owner: DragCommitOwner): boolean {
    if (this.claim?.sessionId === sessionId) return false;
    if (this.claim !== null) return false;

    const result = claimDragCommit(this.claim, sessionId, owner);
    this.claim = result.claim;
    return result.accepted;
  }

  reset(): void {
    this.claim = null;
  }

  current(): DragCommitClaim | null {
    return this.claim;
  }
}
