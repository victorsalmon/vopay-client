import { firstString, sha1, todayUtc } from './util.js';
import type { VoPayConfig } from './config.js';

export interface VoPayMoneyRequestInput {
  amountCents: number;
  recipientEmail: string;
  recipientName: string;
  message: string;
  clientReferenceNumber: string;
  idempotencyKey: string;
}

export interface VoPayMoneyRequestResult {
  providerTransactionId: string | null;
  raw: Record<string, unknown>;
}

/**
 * Create a VoPay client for the Interac money-request endpoint.
 *
 * The client is intentionally narrow: it posts a request, validates the
 * response, and returns the provider transaction id without touching product
 * state. Product-specific orchestration (charges, tenants, ledgers) lives in
 * the consuming application.
 */
export function createVoPayClient(config: VoPayConfig, fetchImpl: typeof fetch = fetch) {
  return {
    async requestMoney(input: VoPayMoneyRequestInput): Promise<VoPayMoneyRequestResult> {
      if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
        throw new Error('VoPay money requests require a positive integer amountCents');
      }
      const body = new URLSearchParams({
        AccountID: config.accountId,
        Key: config.apiKey,
        Signature: sha1(config.apiKey + config.sharedSecret + todayUtc()),
        Amount: (input.amountCents / 100).toFixed(2),
        Currency: 'CAD',
        EmailAddress: input.recipientEmail,
        RecipientName: input.recipientName,
        MessageForRecipient: input.message,
        ClientReferenceNumber: input.clientReferenceNumber,
        GenerateURL: 'false',
        IdempotencyKey: input.idempotencyKey,
      });
      const response = await fetchImpl(`${config.baseUrl}/api/v2/interac/money-request`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      });
      const text = await response.text();
      let raw: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(text) as unknown;
        if (parsed && typeof parsed === 'object') raw = parsed as Record<string, unknown>;
      } catch {
        // The provider may return a non-JSON error body; do not echo it into logs.
      }
      if (!response.ok) throw new Error(`VoPay money request failed with HTTP ${response.status}`);
      const success = firstString(raw, ['Status', 'status', 'Result', 'result']);
      if (success && ['error', 'failed', 'failure', 'declined'].includes(success.toLowerCase())) {
        throw new Error('VoPay rejected the money request');
      }
      return {
        providerTransactionId: firstString(raw, [
          'TransactionID',
          'TransactionId',
          'RequestID',
          'RequestId',
          'ID',
          'id',
        ]),
        raw,
      };
    },
  };
}

export type VoPayClient = ReturnType<typeof createVoPayClient>;
