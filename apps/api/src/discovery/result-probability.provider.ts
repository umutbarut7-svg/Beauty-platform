import { Injectable } from "@nestjs/common";

export interface ResultProbabilityContext {
  businessId: string;
  serviceId?: string;
  professionalId?: string;
}
export interface ResultProbabilityProvider {
  probability(context: ResultProbabilityContext): Promise<number | null>;
}

@Injectable()
export class UnavailableResultProbabilityProvider implements ResultProbabilityProvider {
  async probability(context: ResultProbabilityContext) {
    void context;
    return null;
  }
}
