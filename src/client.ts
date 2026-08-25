import { firstString, isProviderErrorStatus, sha1, todayUtc } from './util.js';
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

export interface VoPayFundInput {
  amountCents: number;
  currency: string;
  clientReferenceNumber: string;
  idempotencyKey: string;
  clientAccountId?: string;
  contactId?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  address1?: string;
  city?: string;
  province?: string;
  country?: string;
  postalCode?: string;
  accountNumber?: string;
  financialInstitutionNumber?: string;
  branchTransitNumber?: string;
  token?: string;
  flinksAccountId?: string;
  flinksLoginId?: string;
  plaidPublicToken?: string;
  plaidAccessToken?: string;
  plaidAccountId?: string;
  plaidProcessorToken?: string;
  mxAuthorizationCode?: string;
  inveriteRequestGuid?: string;
  iq11VerificationLevelId?: 1 | 2 | 3 | 4;
  transactionTypeCode?: string;
  transactionLabel?: string;
  notes?: string;
  glCode?: string;
  walletId?: string;
}

export interface VoPayFundResult {
  providerTransactionId: string | null;
  flagged: boolean;
  flaggedReason: string | null;
  raw: Record<string, unknown>;
}

export interface VoPayWithdrawInput {
  amountCents: number;
  currency: string;
  clientReferenceNumber: string;
  idempotencyKey: string;
  clientAccountId?: string;
  contactId?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  address1?: string;
  city?: string;
  province?: string;
  country?: string;
  postalCode?: string;
  accountNumber?: string;
  financialInstitutionNumber?: string;
  branchTransitNumber?: string;
  token?: string;
  flinksAccountId?: string;
  flinksLoginId?: string;
  plaidPublicToken?: string;
  plaidAccessToken?: string;
  plaidAccountId?: string;
  plaidProcessorToken?: string;
  mxAuthorizationCode?: string;
  inveriteRequestGuid?: string;
  parentTransactionId?: string;
  transactionTypeCode?: string;
  transactionLabel?: string;
  notes?: string;
  glCode?: string;
}

export interface VoPayWithdrawResult {
  providerTransactionId: string | null;
  flagged: boolean;
  flaggedReason: string | null;
  raw: Record<string, unknown>;
}

export interface VoPayClientAccountInput {
  clientAccountId: string;
  firstName: string;
  lastName: string;
  email: string;
  currency: string;
  phoneNumber: string;
  dateOfBirth: string;
  sinLastDigits: number;
  address1?: string;
  city?: string;
  province?: string;
  country?: string;
  nationality?: string;
  postalCode?: string;
  token?: string;
  label?: string;
  flinksAccountId?: string;
  flinksLoginId?: string;
  plaidProcessorToken?: string;
  mxProcessorToken?: string;
}

export interface VoPayClientAccountResult {
  clientAccountId: string | null;
  status: string | null;
  verificationLink: string | null;
  raw: Record<string, unknown>;
}

export interface VoPayGenerateEmbedUrlInput {
  clientAccountId?: string;
  redirectUrl?: string;
  redirectMethod?: 'innerredirect' | 'outerredirect' | 'javascriptmessage';
  companyName?: string;
  language?: 'en' | 'fr';
  accountSelectionMethod?: 'any' | 'online' | 'manual';
  paymentSelectionMethod?:
    | 'any'
    | 'bank'
    | 'email'
    | 'credit'
    | 'debitcard'
    | 'googlepay'
    | 'applepay'
    | 'paypal'
    | 'venmo';
  clientControlled?: boolean;
  clientReferenceNumber?: string;
  country?: 'CA' | 'US';
  requireDebitAuthorityAgreement?: boolean;
  verify?: string;
  cardTypeValidation?: boolean;
  trigger3DS?: boolean;
  acceptedCardBrands?: string;
  accountHolderType?: 'individual' | 'business';
  darkMode?: boolean;
}

export interface VoPayGenerateEmbedUrlResult {
  url: string | null;
  iframeKey: string | null;
  raw: Record<string, unknown>;
}

/** Number of cents in one dollar; VoPay amounts are submitted in dollars. */
const CENTS_PER_DOLLAR = 100;

/** VoPay transaction endpoints default to Canadian dollars. */
const DEFAULT_CURRENCY = 'CAD';

/** SIN last digits are a 0–9999 integer, i.e. up to four decimal digits. */
const SIN_LAST_DIGITS_MIN = 0;
const SIN_LAST_DIGITS_MAX = 9999;

/**
 * Validate that `value` is a positive integer.
 *
 * All monetary inputs are expected in cents, so fractional or non-positive
 * values are rejected before they reach the provider.
 */
function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`VoPay ${name} requires a positive integer amountCents`);
  }
}

/** Convert an integer cent amount to a two-decimal dollar string for VoPay. */
function formatDollarAmount(amountCents: number): string {
  return (amountCents / CENTS_PER_DOLLAR).toFixed(2);
}

/** Return the trimmed value or an empty string, treating `undefined` as empty. */
function trimmed(value: string | undefined): string {
  return value?.trim() ?? '';
}

/** Whether a string value is present (non-empty after trimming). */
function isPresent(value: string | undefined): boolean {
  return trimmed(value).length > 0;
}

/**
 * Throw if a required string is missing or whitespace-only.
 *
 * The `name` is included in the error so callers know which field failed,
 * especially when many required values are validated together.
 */
function assertNonEmptyString(value: unknown, name: string): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`VoPay ${name} is required`);
  }
}

/**
 * Whether the input carries a third-party connector token that can stand in
 * for raw bank account details.
 */
function hasConnectorToken(
  input: {
    token?: string;
    flinksAccountId?: string;
    flinksLoginId?: string;
    plaidPublicToken?: string;
    plaidAccessToken?: string;
    plaidAccountId?: string;
    plaidProcessorToken?: string;
    mxAuthorizationCode?: string;
    inveriteRequestGuid?: string;
  }
): boolean {
  return (
    isPresent(input.token) ||
    (isPresent(input.flinksAccountId) && isPresent(input.flinksLoginId)) ||
    (isPresent(input.plaidPublicToken) &&
      isPresent(input.plaidAccessToken) &&
      isPresent(input.plaidAccountId)) ||
    isPresent(input.plaidProcessorToken) ||
    isPresent(input.mxAuthorizationCode) ||
    isPresent(input.inveriteRequestGuid)
  );
}

/**
 * Whether the input contains any acceptable payment method for an EFT
 * transaction: a stored client account, a contact, a raw bank account, or
 * one of the supported connector tokens.
 */
function hasPaymentMethod(
  input: {
    clientAccountId?: string;
    contactId?: string;
    token?: string;
    accountNumber?: string;
    flinksAccountId?: string;
    flinksLoginId?: string;
    plaidPublicToken?: string;
    plaidAccessToken?: string;
    plaidAccountId?: string;
    plaidProcessorToken?: string;
    mxAuthorizationCode?: string;
    inveriteRequestGuid?: string;
  }
): boolean {
  return (
    isPresent(input.clientAccountId) ||
    isPresent(input.contactId) ||
    hasConnectorToken(input) ||
    isPresent(input.accountNumber)
  );
}

/**
 * Validate the fields common to every EFT transaction.
 *
 * Each transaction must have a positive integer amount in cents, a non-empty
 * currency, client reference, and idempotency key.
 */
function validateTransactionInput(
  input: {
    amountCents: number;
    currency: string;
    clientReferenceNumber: string;
    idempotencyKey: string;
  },
  name: string
): void {
  assertPositiveInteger(input.amountCents, name);
  assertNonEmptyString(input.currency, `${name} currency`);
  assertNonEmptyString(input.clientReferenceNumber, `${name} clientReferenceNumber`);
  assertNonEmptyString(input.idempotencyKey, `${name} idempotencyKey`);
}

/**
 * Validate the additional rules for eft/fund and eft/withdraw.
 *
 * Bank account fields must be complete if any are provided, a payment method
 * must be present, and a payee name is required when paying by raw bank
 * account without a stored client account or connector token.
 */
function validateEftInput(
  input: VoPayFundInput | VoPayWithdrawInput,
  name: 'eft/fund' | 'eft/withdraw'
): void {
  validateTransactionInput(input, name);
  const anyBankField =
    isPresent(input.accountNumber) ||
    isPresent(input.financialInstitutionNumber) ||
    isPresent(input.branchTransitNumber);
  const allBankFields =
    isPresent(input.accountNumber) &&
    isPresent(input.financialInstitutionNumber) &&
    isPresent(input.branchTransitNumber);
  if (anyBankField && !allBankFields) {
    throw new Error(
      `VoPay ${name} requires all bank account fields (accountNumber, financialInstitutionNumber, branchTransitNumber) when any are provided`
    );
  }
  if (!hasPaymentMethod(input)) {
    throw new Error(
      `VoPay ${name} requires a payment method (clientAccountId, contactId, token, or full bank account details)`
    );
  }
  const hasClientOrToken =
    isPresent(input.clientAccountId) ||
    isPresent(input.contactId) ||
    hasConnectorToken(input);
  const hasName =
    (isPresent(input.firstName) && isPresent(input.lastName)) ||
    isPresent(input.companyName);
  if (!hasClientOrToken && !hasName) {
    throw new Error(
      `VoPay ${name} requires either firstName+lastName or companyName when bank account details are provided`
    );
  }
}

/**
 * Validate the required VoPay individual client account fields.
 *
 * All listed string fields are mandatory, and `sinLastDigits` must be a
 * 0–9999 integer so it can be rendered as the last four SIN digits.
 */
function validateClientAccountInput(input: VoPayClientAccountInput): void {
  const requiredFields = [
    'clientAccountId',
    'firstName',
    'lastName',
    'email',
    'currency',
    'phoneNumber',
    'dateOfBirth',
  ] as const;
  for (const field of requiredFields) {
    assertNonEmptyString(input[field], `createClientAccount ${field}`);
  }
  if (
    !Number.isInteger(input.sinLastDigits) ||
    input.sinLastDigits < SIN_LAST_DIGITS_MIN ||
    input.sinLastDigits > SIN_LAST_DIGITS_MAX
  ) {
    throw new Error('VoPay createClientAccount requires a 4-digit sinLastDigits');
  }
}

/**
 * Create a VoPay client for the VoPay API.
 *
 * The client is intentionally narrow: it posts requests, validates responses,
 * and returns provider identifiers without touching product state.
 * Product-specific orchestration (charges, tenants, ledgers) lives in the
 * consuming application.
 */
export function createVoPayClient(config: VoPayConfig, fetchImpl: typeof fetch = fetch) {
  /**
   * POST `requestFields` to a VoPay `/api/v2/{endpoint}` path.
   *
   * Builds an `application/x-www-form-urlencoded` body, signs it, parses the
   * JSON response, and turns provider-level HTTP and `Success=false` failures
   * into typed errors. Non-JSON bodies are treated as empty objects so callers
   * do not accidentally leak provider error text in logs.
   */
  async function post(
    endpoint: string,
    requestFields: Record<string, string | undefined>,
    idempotencyKey?: string
  ): Promise<{ raw: Record<string, unknown> }> {
    const formBody = new URLSearchParams();
    formBody.set('AccountID', config.accountId);
    formBody.set('Key', config.apiKey);
    formBody.set('Signature', sha1(config.apiKey + config.sharedSecret + todayUtc()));
    if (idempotencyKey !== undefined && idempotencyKey !== '') {
      formBody.set('IdempotencyKey', idempotencyKey);
    }
    for (const [key, value] of Object.entries(requestFields)) {
      if (value !== undefined && value !== '') {
        formBody.set(key, value);
      }
    }

    const response = await fetchImpl(`${config.baseUrl}/api/v2/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: formBody,
    });

    const responseText = await response.text();
    let responseBody: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(responseText) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        responseBody = parsed as Record<string, unknown>;
      }
    } catch {
      // The provider may return a non-JSON error body; do not echo it into logs.
    }

    if (!response.ok) {
      throw new Error(`VoPay ${endpoint} failed with HTTP ${response.status}`);
    }
    if (responseBody.Success === false) {
      const message = firstString(responseBody, ['ErrorMessage']) ?? 'unknown';
      throw new Error(`VoPay ${endpoint} rejected: ${message}`);
    }
    if (isProviderErrorStatus(responseBody)) {
      throw new Error(`VoPay ${endpoint} rejected`);
    }

    return { raw: responseBody };
  }

  async function requestMoney(input: VoPayMoneyRequestInput): Promise<VoPayMoneyRequestResult> {
    assertPositiveInteger(input.amountCents, 'money request');
    const { raw: responseBody } = await post(
      'interac/money-request',
      {
        Amount: formatDollarAmount(input.amountCents),
        Currency: DEFAULT_CURRENCY,
        EmailAddress: input.recipientEmail,
        RecipientName: input.recipientName,
        MessageForRecipient: input.message,
        ClientReferenceNumber: input.clientReferenceNumber,
        GenerateURL: 'false',
      },
      input.idempotencyKey
    );
    return {
      providerTransactionId: firstString(responseBody, [
        'TransactionID',
        'TransactionId',
        'RequestID',
        'RequestId',
        'ID',
        'id',
      ]),
      raw: responseBody,
    };
  }

  /**
   * Build the form body fields shared by eft/fund and eft/withdraw.
   *
   * This keeps the long, identical field mappings in one place so the
   * fund- and withdraw-specific builders only add their unique keys.
   */
  function buildEftBaseFields(
    input: VoPayFundInput | VoPayWithdrawInput
  ): Record<string, string | undefined> {
    return {
      Amount: formatDollarAmount(input.amountCents),
      Currency: input.currency,
      ClientReferenceNumber: input.clientReferenceNumber,
      ClientAccountID: input.clientAccountId,
      ContactID: input.contactId,
      FirstName: input.firstName,
      LastName: input.lastName,
      CompanyName: input.companyName,
      Address1: input.address1,
      City: input.city,
      Province: input.province,
      Country: input.country,
      PostalCode: input.postalCode,
      AccountNumber: input.accountNumber,
      FinancialInstitutionNumber: input.financialInstitutionNumber,
      BranchTransitNumber: input.branchTransitNumber,
      Token: input.token,
      FlinksAccountID: input.flinksAccountId,
      FlinksLoginID: input.flinksLoginId,
      PlaidPublicToken: input.plaidPublicToken,
      PlaidAccessToken: input.plaidAccessToken,
      PlaidAccountID: input.plaidAccountId,
      PlaidProcessorToken: input.plaidProcessorToken,
      MxAuthorizationCode: input.mxAuthorizationCode,
      InveriteRequestGUID: input.inveriteRequestGuid,
      TransactionTypeCode: input.transactionTypeCode,
      TransactionLabel: input.transactionLabel,
      Notes: input.notes,
      IdempotencyKey: input.idempotencyKey,
      GLCode: input.glCode,
    };
  }

  function buildFundFields(input: VoPayFundInput): Record<string, string | undefined> {
    const fields: Record<string, string | undefined> = {
      ...buildEftBaseFields(input),
      WalletID: input.walletId,
    };
    if (input.iq11VerificationLevelId !== undefined) {
      fields.Iq11VerificationLevelID = String(input.iq11VerificationLevelId);
    }
    return fields;
  }

  async function eftFund(input: VoPayFundInput): Promise<VoPayFundResult> {
    validateEftInput(input, 'eft/fund');
    const { raw: responseBody } = await post('eft/fund', buildFundFields(input));
    return buildEftResult(responseBody);
  }

  function buildWithdrawFields(input: VoPayWithdrawInput): Record<string, string | undefined> {
    return {
      ...buildEftBaseFields(input),
      ParentTransactionID: input.parentTransactionId,
    };
  }

  /**
   * Convert a parsed eft/fund or eft/withdraw response into the standard
   * VoPay transaction result. Both endpoints share the same `TransactionID`
   * and `Flagged` semantics, so a single builder avoids the duplicate
   * response unwrapping that appeared in each method.
   */
  function buildEftResult(responseBody: Record<string, unknown>): VoPayFundResult {
    const flaggedReason =
      typeof responseBody.Flagged === 'string'
        ? responseBody.Flagged.trim() || null
        : null;
    return {
      providerTransactionId: firstString(responseBody, ['TransactionID']),
      flagged: flaggedReason !== null,
      flaggedReason,
      raw: responseBody,
    };
  }

  async function eftWithdraw(input: VoPayWithdrawInput): Promise<VoPayWithdrawResult> {
    validateEftInput(input, 'eft/withdraw');
    const { raw: responseBody } = await post('eft/withdraw', buildWithdrawFields(input));
    return buildEftResult(responseBody);
  }

  /**
   * Create an individual VoPay client account.
   *
   * The provider returns a verification link with an intentional typo in the
   * key (`VerifcationLink`), so we check both spellings and prefer the
   * corrected one when present.
   */
  async function createClientAccount(
    input: VoPayClientAccountInput
  ): Promise<VoPayClientAccountResult> {
    validateClientAccountInput(input);

    const { raw: responseBody } = await post('account/client-accounts/individual', {
      ClientAccountID: input.clientAccountId,
      FirstName: input.firstName,
      LastName: input.lastName,
      EmailAddress: input.email,
      Currency: input.currency,
      PhoneNumber: input.phoneNumber,
      DOB: input.dateOfBirth,
      SINLastDigits: String(input.sinLastDigits),
      Address1: input.address1,
      City: input.city,
      Province: input.province,
      Country: input.country,
      Nationality: input.nationality,
      PostalCode: input.postalCode,
      Token: input.token,
      Label: input.label,
      FlinksAccountID: input.flinksAccountId,
      FlinksLoginID: input.flinksLoginId,
      PlaidProcessorToken: input.plaidProcessorToken,
      MxProcessorToken: input.mxProcessorToken,
    });

    return {
      clientAccountId: firstString(responseBody, ['ClientAccountID']),
      status: firstString(responseBody, ['Status']),
      verificationLink: firstString(responseBody, ['VerifcationLink', 'VerificationLink']),
      raw: responseBody,
    };
  }

  async function generateEmbedUrl(
    input: VoPayGenerateEmbedUrlInput = {}
  ): Promise<VoPayGenerateEmbedUrlResult> {
    const fields: Record<string, string | undefined> = {
      ClientAccountID: input.clientAccountId,
      RedirectURL: input.redirectUrl,
      RedirectMethod: input.redirectMethod,
      CompanyName: input.companyName,
      Language: input.language,
      AccountSelectionMethod: input.accountSelectionMethod,
      PaymentSelectionMethod: input.paymentSelectionMethod,
      ClientReferenceNumber: input.clientReferenceNumber,
      Country: input.country,
      Verify: input.verify,
      AcceptedCardBrands: input.acceptedCardBrands,
      AccountHolderType: input.accountHolderType,
    };
    for (const [key, value] of Object.entries({
      ClientControlled: input.clientControlled,
      RequireDebitAuthorityAgreement: input.requireDebitAuthorityAgreement,
      CardTypeValidation: input.cardTypeValidation,
      Trigger3DS: input.trigger3DS,
      DarkMode: input.darkMode,
    })) {
      if (value !== undefined) {
        fields[key] = String(value);
      }
    }

    const { raw } = await post('iq11/generate-embed-url', fields);

    return {
      url: firstString(raw, ['EmbedURL']),
      iframeKey: firstString(raw, ['IframeKey']),
      raw,
    };
  }

  return {
    post,
    requestMoney,
    eftFund,
    eftWithdraw,
    createClientAccount,
    generateEmbedUrl,
  };
}

export type VoPayClient = ReturnType<typeof createVoPayClient>;
