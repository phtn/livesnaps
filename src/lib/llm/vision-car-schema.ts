import { z } from 'zod'
import type { VisionCar } from './vision-test-contract'

const nullableVehicleText = z.string().nullable()
const observation = z.string()

export const visionCarSchema: z.ZodType<VisionCar> = z.object({
  classification: z.literal('car'),
  make: nullableVehicleText.describe('Vehicle manufacturer visible or reliably identifiable from the image.'),
  model: nullableVehicleText.describe('Vehicle model visible or reliably identifiable from the image.'),
  year: z.number().nullable().describe('Model year only when supported by visible evidence.'),
  color: nullableVehicleText.describe('Primary exterior color.'),
  plate: nullableVehicleText.describe('License plate transcribed exactly as visible.'),
  damages: z.array(observation).describe('Visible vehicle damage only; use an empty array when none is visible.'),
  misc: z.array(observation).describe('Other relevant visible text, identifiers, condition, or uncertainty.')
})
