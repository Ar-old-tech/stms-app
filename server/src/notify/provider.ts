export type Channel = "SMS" | "WHATSAPP";
export interface NotificationProvider {
  readonly name: string;
  readonly channel: Channel;
  readonly configured: boolean;
  send(phone: string, message: string): Promise<void>;
}
export function maskedPhone(phone: string) {
  return `***${phone.slice(-4)}`;
}
export async function deliver(
  provider: NotificationProvider,
  phone: string,
  message: string,
) {
  if (!provider.configured)
    return { status: "NOT_CONFIGURED", error: "Provider not configured" };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await provider.send(phone, message);
      return { status: "ACCEPTED", error: null };
    } catch {
      /* Never persist/log provider responses: they may contain phone numbers or credentials. */
    }
  }
  return {
    status: "FAILED",
    error: `${provider.channel} failed after 2 attempts`,
  };
}
