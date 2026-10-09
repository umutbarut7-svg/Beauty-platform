import { Injectable } from "@nestjs/common";
@Injectable()
export class ProfessionalConfidenceService {
  calculate(
    input: {
      weights: number[];
      latestAt?: Date;
      verifiedResults: number;
      completedJobs: number;
      repeatCustomers: number;
    },
    now = new Date(),
  ) {
    if (!input.weights.length) return { sufficient: false, confidence: 0 };
    const quantity = Math.min(1, input.weights.length / 8);
    const quality =
      input.weights.reduce((a, b) => a + Math.max(0, Math.min(1, b)), 0) /
      input.weights.length;
    const age = input.latestAt
      ? Math.max(0, (now.getTime() - input.latestAt.getTime()) / 86_400_000)
      : 730;
    const freshness = Math.pow(0.5, age / 365);
    const verification = Math.min(1, input.verifiedResults / 3);
    const repeat = Math.min(1, input.repeatCustomers / 3);
    const confidence = Number(
      (
        quantity * 0.3 +
        quality * 0.25 +
        freshness * 0.2 +
        verification * 0.15 +
        repeat * 0.1
      ).toFixed(4),
    );
    return {
      sufficient: input.completedJobs >= 3 || input.verifiedResults >= 2,
      confidence,
    };
  }
}
