export interface InquiryStatusCount {
  _id: string
  count: number
}

export function summarizeInquiryStatuses(statusCounts: InquiryStatusCount[]) {
  const counts = new Map(statusCounts.map((item) => [item._id, item.count]))
  const totalInquiries = statusCounts.reduce((sum, item) => sum + item.count, 0)
  const wonInquiries = counts.get('won') ?? 0

  return {
    totalInquiries,
    newInquiries: counts.get('new') ?? 0,
    wonInquiries,
    conversionRate: totalInquiries
      ? Math.round((wonInquiries / totalInquiries) * 1000) / 10
      : 0,
  }
}
