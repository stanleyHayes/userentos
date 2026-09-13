export interface RentReceiptCopy {
  paymentStatus: string
  receipt: {
    number: string; issuedAt: string; paymentReference: string; amount: number; currency: 'GHS'
    paidAt: string; periodStart: string; periodEnd: string; tenantName: string; landlordName: string
    propertyTitle: string; premisesAddress: string; furnished: boolean
  }
}
export function rentReceiptText(copy: RentReceiptCopy, checkedAt: string): string {
  const r = copy.receipt
  const status = copy.paymentStatus === 'completed' ? 'Payment confirmed' : copy.paymentStatus === 'refunded'
    ? 'Payment refunded — original receipt retained' : `Current payment status: ${copy.paymentStatus}. This copy does not confirm current settlement.`
  return [
    'RentOS Ghana — Rent payment receipt', status,
    `Receipt number: ${r.number}`, `Payment reference: ${r.paymentReference}`,
    `Amount: GHS ${r.amount.toFixed(2)}`, `Tenant: ${r.tenantName}`, `Landlord: ${r.landlordName}`,
    `Premises: ${r.propertyTitle}`, `Address: ${r.premisesAddress}`, `Furnishing: ${r.furnished ? 'Furnished' : 'Unfurnished'}`,
    `Period from: ${r.periodStart}`, `Period through (inclusive): ${r.periodEnd}`,
    `Payment recorded at: ${r.paidAt}`, `Receipt issued at: ${r.issuedAt}`,
    `Status checked: ${checkedAt}`,
    'This payment is towards the stated period. This receipt does not show the tenancy’s remaining balance.',
    'Check RentOS for later payment changes. Any applicable stamping must be arranged separately.',
  ].join('\n\n')
}
