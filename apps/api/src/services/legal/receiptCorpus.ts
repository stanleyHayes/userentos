import { LegalDocument } from '../../models/LegalDocument.js'

export const LEGACY_RECEIPT_TITLE = 'Rent Act Section 23 — Rent Receipts'
export const LEGACY_RECEIPT_CONTENT = `Section 23 of the Rent Act, 1963 requires landlords to provide rent receipts:

1. Mandatory Receipts: Every landlord must provide a written receipt for every rent payment received.

2. Receipt Contents: The receipt must include:
   - Date of payment
   - Amount paid
   - Period covered by payment
   - Name of tenant
   - Address of premises

3. Refusal Penalty: A landlord who refuses to issue a receipt commits an offense punishable by a fine up to 100 penalty units.

4. Evidence: Rent receipts are admissible as evidence in rent tribunal proceedings and court cases.

Tenants should always demand and keep receipts as proof of payment.`

/** Paraphrase checked against Parliament Act 220 PDF, section 33, page 18. */
export const RECEIPT_LEGAL_DOCUMENT = {
  title: 'Rent Act Section 33 — Rent Receipts',
  content: `Section 33 of the Rent Act, 1963 (Act 220) requires a written receipt at the time rent is paid to the landlord, including payments covering furniture or fixtures.

The receipt must identify the premises, state whether they are furnished or unfurnished, and specify the amount, the period covered and the tenant's name. Stamping is required where another applicable enactment requires it.

Record the payment date and reference as useful payment evidence. Those operational fields do not replace the statutory particulars above.

This provision does not itself state a numerical penalty. Any advice about penalties, stamping or enforcement requires review of the applicable provisions and current amendments. A payment-provider confirmation without the required tenancy details is not evidence of full compliance with section 33.`,
  source: 'Rent Act, 1963 (Act 220)',
  category: 'act' as const,
  year: 1963,
  section: '33',
  tags: ['rent receipt', 'proof of payment', 'furnished status', 'rental period'],
}

/** Only replace the exact shipped legacy text. Preserve reviewer edits and activation state.
 * Clear stale embeddings; their vectors describe content that is no longer authoritative.
 */
export async function correctLegacyReceiptDocuments() {
  return LegalDocument.updateMany({
    title: LEGACY_RECEIPT_TITLE,
    source: RECEIPT_LEGAL_DOCUMENT.source,
    content: LEGACY_RECEIPT_CONTENT,
    section: '23',
  }, { $set: { ...RECEIPT_LEGAL_DOCUMENT, embedding: [] } })
}
