export interface ProviderMessage {
  notificationId: string;
  channel: string;
  recipient: string;
  subject?: string;
  body: string;
}
export interface ProviderResult {
  providerMessageId: string;
  delivered: boolean;
}
export interface NotificationProvider {
  readonly name: string;
  supports(channel: string): boolean;
  validateConfig(config: unknown): void;
  send(message: ProviderMessage): Promise<ProviderResult>;
}
/** IN_APP is persisted locally; it never pretends to contact an external provider. */
export class InAppNotificationProvider implements NotificationProvider {
  readonly name = "internal-in-app";
  supports(c: string) {
    return c === "IN_APP";
  }
  validateConfig() {}
  async send(m: ProviderMessage) {
    return { providerMessageId: `in-app:${m.notificationId}`, delivered: true };
  }
}
