import type { RentReceipt } from './rentReceipt.js'
function escape(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}
function timestamp(value: Date | string): string {
  return new Date(value).toLocaleString('en-GB', { timeZone: 'UTC', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' UTC'
}
export function renderRentReceipt(receipt: RentReceipt, paymentStatus: string, generatedAt = new Date()): string {
  const rows = [
    ['Receipt number', receipt.number], ['Payment reference', receipt.paymentReference],
    ['Tenant', receipt.tenantName], ['Landlord', receipt.landlordName],
    ['Premises', receipt.propertyTitle], ['Premises address', receipt.premisesAddress],
    ['Furnishing', receipt.furnished ? 'Furnished' : 'Unfurnished'],
    ['Period from', receipt.periodStart], ['Period through (inclusive)', receipt.periodEnd],
    ['Payment recorded at', timestamp(receipt.paidAt)], ['Receipt issued at', timestamp(receipt.issuedAt)],
  ]
  const statusMessage = paymentStatus === 'completed' ? 'Payment confirmed'
    : paymentStatus === 'refunded' ? 'Payment refunded — original receipt retained'
      : `Current payment status: ${paymentStatus}. This copy does not confirm current settlement.`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rent payment receipt</title><style>
*{box-sizing:border-box}body{margin:0;background:#f2f4f6;color:#192a3a;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5}main{max-width:790px;margin:32px auto;padding:42px;background:white;border:1px solid #d7dfe6}header{border-bottom:2px solid #1e3a5f;padding-bottom:24px}.brand{font-size:17px;font-weight:bold;letter-spacing:.06em;color:#1e3a5f}h1{font-size:30px;margin:10px 0}.amount{font-size:34px;font-weight:bold;margin:22px 0 12px}.status{padding:12px 16px;border:1px solid #bfcddd;background:#edf3f8;font-weight:bold}.changed{border-color:#b44332;background:#fff0ed;color:#792517}dl{margin:26px 0}dl div{display:grid;grid-template-columns:210px minmax(0,1fr);gap:14px;padding:10px 0;border-bottom:1px solid #e6e9ed;break-inside:avoid}dt{color:#4b5c6d}dd{margin:0;overflow-wrap:anywhere}footer{font-size:12px;color:#4b5c6d;border-top:1px solid #d7dfe6;padding-top:18px;break-inside:avoid}footer p{margin:6px 0}@media(max-width:600px){main{margin:0;padding:24px;border:0}dl div{grid-template-columns:1fr;gap:3px}}@page{size:A4;margin:16mm}@media print{body{background:white}main{max-width:none;margin:0;padding:0;border:0}.status{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body><main><header><div class="brand">RentOS Ghana</div><h1>Rent payment receipt</h1><div>Recorded by RentOS</div></header><div class="amount">${escape(new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' }).format(receipt.amount))}</div><p class="status${paymentStatus !== 'completed' ? ' changed' : ''}" role="status">${escape(statusMessage)}</p><dl>${rows.map(([label, value]) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl><footer><p>This payment is towards the stated period. This receipt does not show the tenancy’s remaining balance.</p><p>Status checked when this copy was generated: ${escape(timestamp(generatedAt))}. Check RentOS for later changes.</p><p>Any applicable stamping must be arranged separately.</p></footer></main></body></html>`
}
