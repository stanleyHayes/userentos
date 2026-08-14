import mongoose, { Schema, type Document } from 'mongoose'

export type MoveOutStatus =
  | 'initiated'
  | 'inspection_scheduled'
  | 'inspected'
  | 'disputed'
  | 'refund_pending'
  | 'refund_paid'
  | 'closed'

export type MoveOutInitiator = 'tenant' | 'landlord' | 'system'

export interface MoveOutDamage {
  description: string
  cost: number
  photos: string[]
}

export interface MoveOutNote {
  text: string
  by: string
  at: string
}

export interface IMoveOut extends Document {
  agreementId: string
  tenantId: string
  landlordId: string
  propertyId: string
  status: MoveOutStatus
  initiatedBy: MoveOutInitiator
  moveOutDate: string
  inspectionDate?: string
  inspectionNotes?: string
  damages: MoveOutDamage[]
  /** Snapshot from agreement at initiation time. */
  securityDeposit: number
  /** Computed: sum of damages[].cost. */
  deductionsTotal: number
  /** Computed: securityDeposit - deductionsTotal (clamped >= 0). */
  refundAmount: number
  refundedAt?: string
  refundReference?: string
  /** Status the move-out was in before a dispute was raised — enables withdraw/resolve. */
  preDisputeStatus?: MoveOutStatus
  tenantAcknowledgedAt?: string
  landlordAcknowledgedAt?: string
  notes: MoveOutNote[]
  createdAt: Date
  updatedAt: Date
}

const damageSchema = new Schema<MoveOutDamage>(
  {
    description: { type: String, required: true },
    cost: { type: Number, required: true, min: 0 },
    photos: { type: [String], default: [] },
  },
  { _id: false }
)

const noteSchema = new Schema<MoveOutNote>(
  {
    text: { type: String, required: true },
    by: { type: String, required: true },
    at: { type: String, required: true },
  },
  { _id: false }
)

const moveOutSchema = new Schema<IMoveOut>(
  {
    agreementId: { type: String, required: true, index: true },
    tenantId: { type: String, required: true, index: true },
    landlordId: { type: String, required: true, index: true },
    propertyId: { type: String, required: true, index: true },
    status: {
      type: String,
      required: true,
      enum: [
        'initiated',
        'inspection_scheduled',
        'inspected',
        'disputed',
        'refund_pending',
        'refund_paid',
        'closed',
      ],
      default: 'initiated',
      index: true,
    },
    initiatedBy: { type: String, required: true, enum: ['tenant', 'landlord', 'system'] },
    moveOutDate: { type: String, required: true },
    inspectionDate: String,
    inspectionNotes: String,
    damages: { type: [damageSchema], default: [] },
    securityDeposit: { type: Number, required: true, default: 0 },
    deductionsTotal: { type: Number, default: 0 },
    refundAmount: { type: Number, default: 0 },
    refundedAt: String,
    refundReference: String,
    preDisputeStatus: {
      type: String,
      enum: [
        'initiated',
        'inspection_scheduled',
        'inspected',
        'disputed',
        'refund_pending',
        'refund_paid',
        'closed',
      ],
    },
    tenantAcknowledgedAt: String,
    landlordAcknowledgedAt: String,
    notes: { type: [noteSchema], default: [] },
  },
  { timestamps: true }
)

// Allow only one non-closed move-out per agreement — enforced by a unique
// partial index so two concurrent initiations can't both win the check-then-create
// race. $ne isn't allowed in partialFilterExpression, hence the explicit $in list.
moveOutSchema.index(
  { agreementId: 1 },
  {
    unique: true,
    name: 'one_active_moveout_per_agreement',
    partialFilterExpression: {
      status: {
        $in: ['initiated', 'inspection_scheduled', 'inspected', 'disputed', 'refund_pending', 'refund_paid'],
      },
    },
  }
)

export const MoveOut = mongoose.model<IMoveOut>('MoveOut', moveOutSchema)
