import { Injectable } from "@nestjs/common";
export type ModelTask =
  "INTENT" | "PLANNING" | "RESPONSE" | "VISION" | "VOICE" | "COMPLEX_REASONING";
export interface ModelRequest {
  task: ModelTask;
  input: string;
  allowedIntents?: readonly string[];
}
export interface ModelResult {
  value: string;
  provider: string;
}
export interface ModelProvider {
  readonly name: string;
  supports(task: ModelTask): boolean;
  complete(request: ModelRequest): Promise<ModelResult>;
}
@Injectable()
export class DeterministicModelProvider implements ModelProvider {
  readonly name = "DETERMINISTIC";
  supports(_task: ModelTask) {
    void _task;
    return true;
  }
  async complete(request: ModelRequest): Promise<ModelResult> {
    const value = request.input
      .normalize("NFC")
      .trim()
      .toLocaleLowerCase("tr-TR");
    return { value, provider: this.name };
  }
}
@Injectable()
export class ModelRouter {
  constructor(private readonly deterministic: DeterministicModelProvider) {}
  route(task: ModelTask) {
    if (!this.deterministic.supports(task))
      throw new Error("MODEL_CAPABILITY_NOT_AVAILABLE");
    return this.deterministic;
  }
}
