import { it, expect, vi, afterEach } from "vitest";
import { TwilioSms } from "../src/notify/twilio_sms.js";
import { TwilioWhatsapp } from "../src/notify/twilio_whatsapp.js";
import { deliver } from "../src/notify/provider.js";
import { configSchema } from "../src/config.js";
afterEach(() => vi.unstubAllGlobals());
const c = configSchema.parse({
  DATABASE_URL: "test",
  JWT_SECRET: "x".repeat(32),
  WEBHOOK_SECRET: "y".repeat(32),
  DOCUMENT_KEY: "a".repeat(64),
  SMS_ENABLED: "true",
  TWILIO_ACCOUNT_SID: "AC" + "0".repeat(32),
  TWILIO_AUTH_TOKEN: "fake-test-token",
  TWILIO_SMS_FROM: "+12025550100",
  TWILIO_WHATSAPP_FROM: "whatsapp:+12025550101",
});
it("uses Twilio REST form fields for SMS and WhatsApp without assuming handset delivery", async () => {
  const fetch = vi
    .fn()
    .mockImplementation(
      async () =>
        new Response(JSON.stringify({ status: "queued" }), { status: 201 }),
    );
  vi.stubGlobal("fetch", fetch);
  for (const p of [new TwilioSms(c), new TwilioWhatsapp(c)]) {
    expect(await deliver(p, "+12025550144", "Test emergency")).toEqual({
      status: "ACCEPTED",
      error: null,
    });
    const [url, options] = fetch.mock.lastCall!;
    expect(url).toBe(
      `https://api.twilio.com/2010-04-01/Accounts/${c.TWILIO_ACCOUNT_SID}/Messages.json`,
    );
    expect(options.body.get("To")).toBe(
      p.channel === "SMS" ? "+12025550144" : "whatsapp:+12025550144",
    );
    expect(options.body.get("Body")).toBe("Test emergency");
  }
});
it("does not fetch when disabled and retries a rejection only once", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response("Provider failure", { status: 500 }));
  vi.stubGlobal("fetch", fetch);
  expect(
    (
      await deliver(
        new TwilioSms({ ...c, SMS_ENABLED: "false" }),
        "+12025550144",
        "test",
      )
    ).status,
  ).toBe("NOT_CONFIGURED");
  expect(fetch).not.toHaveBeenCalled();
  expect((await deliver(new TwilioSms(c), "+12025550144", "test")).status).toBe(
    "FAILED",
  );
  expect(fetch).toHaveBeenCalledTimes(2);
});
