import { Injectable } from "@nestjs/common";
@Injectable()
export class ContextBuilder {
  build(
    session: Record<string, unknown>,
    turns: Array<{ role: string; content: string }>,
    allowedTools: string[],
    maxSize: number,
    globalization?: Readonly<{
      market: string;
      locale: string;
      language: string;
      currency: string;
      timezone: string;
    }>,
  ) {
    const context = {
      goal: session.activeGoal ?? null,
      intent: session.intent ?? "UNKNOWN",
      entities: session.entities ?? {},
      constraints: session.constraints ?? {},
      missingInformation: session.missingInformation ?? [],
      latestTurns: turns
        .slice(-4)
        .map((x) => ({ role: x.role, content: x.content.slice(0, 500) })),
      allowedTools,
      globalization: globalization ?? null,
    };
    const encoded = JSON.stringify(context);
    return encoded.length <= maxSize
      ? context
      : { ...context, latestTurns: [] };
  }
}
export interface CustomerMemoryStore {
  get(
    businessId: string,
    userId: string,
  ): Promise<Readonly<Record<string, unknown>> | null>;
}
@Injectable()
export class UnavailableCustomerMemory implements CustomerMemoryStore {
  async get() {
    return null;
  }
}
