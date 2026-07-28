/** Shared list of service-provider trades — used by worker onboarding and the
 *  registration wizard. Values are submitted to POST /api/workers as-is. */
export const TRADE_OPTIONS = [
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'carpentry', label: 'Carpentry' },
  { value: 'painting', label: 'Painting' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'masonry', label: 'Masonry' },
  { value: 'tiling', label: 'Tiling' },
  { value: 'roofing', label: 'Roofing' },
  { value: 'hvac', label: 'HVAC / AC Repair' },
  { value: 'security', label: 'Security Systems' },
  { value: 'gardening', label: 'Gardening / Landscaping' },
  { value: 'appliance', label: 'Appliance Repair' },
  { value: 'moving', label: 'Moving / Relocation' },
  { value: 'pest', label: 'Pest Control' },
]
