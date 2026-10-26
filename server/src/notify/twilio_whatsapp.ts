import { TwilioSms } from "./twilio_sms.js";
export class TwilioWhatsapp extends TwilioSms {
  override readonly name = "twilio_whatsapp";
  override readonly channel = "WHATSAPP" as const;
  protected override get from() {
    return this.c.TWILIO_WHATSAPP_FROM;
  }
}
