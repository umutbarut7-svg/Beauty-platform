import { Injectable } from "@nestjs/common";

export interface ExpertiseInput {
  completedAppointments: number;
  serviceMatched: boolean;
}
export interface ExpertiseProvider {
  score(input: ExpertiseInput): number | null;
}

@Injectable()
export class HistoricalExpertiseProvider implements ExpertiseProvider {
  score(input: ExpertiseInput) {
    if (!input.serviceMatched) return null;
    return Number(
      Math.min(10, Math.log2(input.completedAppointments + 1) * 2).toFixed(3),
    );
  }
}
