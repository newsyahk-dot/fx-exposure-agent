import { describe, expect, it, vi } from "vitest";
import type { PayPalClient } from "./paypal";
import { isInvoiceEvent, verifyWebhook } from "./webhook";

const headers = (over: Record<string, string> = {}) =>
  new Headers({
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-cert-url": "https://api.sandbox.paypal.com/cert",
    "paypal-transmission-id": "t1",
    "paypal-transmission-sig": "sig",
    "paypal-transmission-time": "2026-10-26T00:00:00Z",
    ...over,
  });

describe("webhook", () => {
  it("asks PayPal to verify, and trusts only SUCCESS", async () => {
    const request = vi.fn().mockResolvedValue({ verification_status: "SUCCESS" });
    const pp = { request } as unknown as PayPalClient;
    expect(await verifyWebhook(pp, headers(), { event_type: "INVOICING.INVOICE.PAID" }, "WH-1")).toBe(true);
    expect(request.mock.calls[0][1]).toBe("/v1/notifications/verify-webhook-signature");
    expect(request.mock.calls[0][2]).toMatchObject({ webhook_id: "WH-1", transmission_id: "t1" });
    request.mockResolvedValueOnce({ verification_status: "FAILURE" });
    expect(await verifyWebhook(pp, headers(), {}, "WH-1")).toBe(false);
  });
  it("refuses a delivery without PayPal's signature headers, without calling PayPal", async () => {
    const request = vi.fn();
    const h = headers();
    h.delete("paypal-transmission-sig");
    expect(await verifyWebhook({ request } as unknown as PayPalClient, h, {}, "WH-1")).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });
  it("only invoice events expire the book", () => {
    expect(isInvoiceEvent("INVOICING.INVOICE.PAID")).toBe(true);
    expect(isInvoiceEvent("PAYMENT.CAPTURE.COMPLETED")).toBe(false);
    expect(isInvoiceEvent(undefined)).toBe(false);
  });
});
