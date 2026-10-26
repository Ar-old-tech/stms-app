import type { Config } from "../config.js";
import type { NotificationProvider } from "./provider.js";
export class TwilioSms implements NotificationProvider {
  readonly name: string = "twilio_sms";
  readonly channel: "SMS" | "WHATSAPP" = "SMS";
  constructor(protected readonly c: Config) {}
  protected get from() {
    return this.c.TWILIO_SMS_FROM;
  }
  get configured() {
    return (
      this.c.SMS_ENABLED === "true" &&
      !!this.c.TWILIO_ACCOUNT_SID &&
      !!this.c.TWILIO_AUTH_TOKEN &&
      !!this.from
    );
  }
  async send(phone: string, message: string) {
    if (!this.configured) throw new Error("Provider not configured");
    const whatsapp = this.channel === "WHATSAPP";
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.c.TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.c.TWILIO_ACCOUNT_SID}:${this.c.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: whatsapp ? `whatsapp:${phone}` : phone,
          From: this.from!,
          Body: message,
        }),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) throw new Error("Provider rejected message");
    const result = (await response.json()) as { status?: string };
    if (["failed", "undelivered", "canceled"].includes(result.status ?? ""))
      throw new Error("Provider rejected message");
  }
}
