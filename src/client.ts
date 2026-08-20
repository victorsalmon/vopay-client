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

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`VoPay ${name} requires a positive integer amountCents`);
  }
}

function trimmed(value: string | undefined): string {
  return value?.trim() ?? '';
}

function isPresent(value: string | undefined): boolean {
  return trimmed(value).length > 0;
}

function assertNonEmptyString(value: unknown, name: string): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`VoPay ${name} is required`);
  }
}

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
 * Create a VoPay client for the VoPay API.
 *
 * The client is intentionally narrow: it posts requests, validates responses,
 * and returns provider identifiers without touching product state.
 * Product-specific orchestration (charges, tenants, ledgers) lives in the
 * consuming application.
 */
export function createVoPayClient(config: VoPayConfig, fetchImpl: typeof fetch = fetch) {
  async function post(
    endpoint: string,
    fields: Record<string, string | undefined>,
    idempotencyKey?: string
  ): Promise<{ raw: Record<string, unknown> }> {
    const body = new URLSearchParams();
    body.set('AccountID', config.accountId);
    body.set('Key', config.apiKey);
    body.set('Signature', sha1(config.apiKey + config.sharedSecret + todayUtc()));
    if (idempotencyKey !== undefined && idempotencyKey !== '') {
      body.set('IdempotencyKey', idempotencyKey);
    }
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && value !== '') {
        body.set(key, value);
      }
    }

    const response = await fetchImpl(`${config.baseUrl}/api/v2/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });

    const text = await response.text();
    let raw: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        raw = parsed as Record<string, unknown>;
      }
    } catch {
      // The provider may return a non-JSON error body; do not echo it into logs.
    }

    if (!response.ok) {
      throw new Error(`VoPay ${endpoint} failed with HTTP ${response.status}`);
    }
    if (raw.Success === false) {
      const message = firstString(raw, ['ErrorMessage']) ?? 'unknown';
      throw new Error(`VoPay ${endpoint} rejected: ${message}`);
    }
    if (isProviderErrorStatus(raw)) {
      throw new Error(`VoPay ${endpoint} rejected`);
    }

    return { raw };
  }

  async function requestMoney(input: VoPayMoneyRequestInput): Promise<VoPayMoneyRequestResult> {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new Error('VoPay money requests require a positive integer amountCents');
    }
    const { raw } = await post(
      'interac/money-request',
      {
        Amount: (input.amountCents / 100).toFixed(2),
        Currency: 'CAD',
        EmailAddress: input.recipientEmail,
        RecipientName: input.recipientName,
        MessageForRecipient: input.message,
        ClientReferenceNumber: input.clientReferenceNumber,
        GenerateURL: 'false',
      },
      input.idempotencyKey
    );
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
  }

  function buildFundFields(input: VoPayFundInput): Record<string, string | undefined> {
    const fields: Record<string, string | undefined> = {
      Amount: (input.amountCents / 100).toFixed(2),
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
      WalletID: input.walletId,
    };
    if (input.iq11VerificationLevelId !== undefined) {
      fields.Iq11VerificationLevelID = String(input.iq11VerificationLevelId);
    }
    return fields;
  }

  async function eftFund(input: VoPayFundInput): Promise<VoPayFundResult> {
    validateTransactionInput(input, 'eft/fund');
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
        'VoPay eft/fund requires all bank account fields (accountNumber, financialInstitutionNumber, branchTransitNumber) when any are provided'
      );
    }
    if (!hasPaymentMethod(input)) {
      throw new Error(
        'VoPay eft/fund requires a payment method (clientAccountId, contactId, token, or full bank account details)'
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
        'VoPay eft/fund requires either firstName+lastName or companyName when bank account details are provided'
      );
    }

    const { raw } = await post('eft/fund', buildFundFields(input));
    const flaggedReason =
      typeof raw.Flagged === 'string' ? raw.Flagged.trim() || null : null;
    return {
      providerTransactionId: firstString(raw, ['TransactionID']),
      flagged: flaggedReason !== null,
      flaggedReason,
      raw,
    };
  }

  function buildWithdrawFields(input: VoPayWithdrawInput): Record<string, string | undefined> {
    return {
      Amount: (input.amountCents / 100).toFixed(2),
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
      ParentTransactionID: input.parentTransactionId,
      TransactionTypeCode: input.transactionTypeCode,
      TransactionLabel: input.transactionLabel,
      Notes: input.notes,
      IdempotencyKey: input.idempotencyKey,
      GLCode: input.glCode,
    };
  }

  async function eftWithdraw(input: VoPayWithdrawInput): Promise<VoPayWithdrawResult> {
    validateTransactionInput(input, 'eft/withdraw');
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
        'VoPay eft/withdraw requires all bank account fields (accountNumber, financialInstitutionNumber, branchTransitNumber) when any are provided'
      );
    }
    if (!hasPaymentMethod(input)) {
      throw new Error(
        'VoPay eft/withdraw requires a payment method (clientAccountId, contactId, token, or full bank account details)'
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
        'VoPay eft/withdraw requires either firstName+lastName or companyName when bank account details are provided'
      );
    }

    const { raw } = await post('eft/withdraw', buildWithdrawFields(input));
    const flaggedReason =
      typeof raw.Flagged === 'string' ? raw.Flagged.trim() || null : null;
    return {
      providerTransactionId: firstString(raw, ['TransactionID']),
      flagged: flaggedReason !== null,
      flaggedReason,
      raw,
    };
  }

  async function createClientAccount(
    input: VoPayClientAccountInput
  ): Promise<VoPayClientAccountResult> {
    assertNonEmptyString(input.clientAccountId, 'createClientAccount clientAccountId');
    assertNonEmptyString(input.firstName, 'createClientAccount firstName');
    assertNonEmptyString(input.lastName, 'createClientAccount lastName');
    assertNonEmptyString(input.email, 'createClientAccount email');
    assertNonEmptyString(input.currency, 'createClientAccount currency');
    assertNonEmptyString(input.phoneNumber, 'createClientAccount phoneNumber');
    assertNonEmptyString(input.dateOfBirth, 'createClientAccount dateOfBirth');
    if (
      !Number.isInteger(input.sinLastDigits) ||
      input.sinLastDigits < 0 ||
      input.sinLastDigits > 9999
    ) {
      throw new Error('VoPay createClientAccount requires a 4-digit sinLastDigits');
    }

    const { raw } = await post('account/client-accounts/individual', {
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
      clientAccountId: firstString(raw, ['ClientAccountID']),
      status: firstString(raw, ['Status']),
      verificationLink: firstString(raw, ['VerifcationLink', 'VerificationLink']),
      raw,
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
