/** Provider-neutral input kept intentionally small until an AI provider is selected. */
export interface AiRequest {
  readonly prompt: string;
}

export interface AiGateway {
  generate(request: AiRequest): Promise<string>;
}
