import { useForm } from '@octanejs/tanstack-form'
import { ACCOUNT_PHONE_MAX_LENGTH } from '@/lib/accounts/accounts'
import type { AdminSnapListItem } from '@/lib/snaps/admin-photo-types'
import type { UpdateAdminSnapInput } from '@/lib/snaps/admin-writes'
import { MAX_VEHICLE_MILEAGE, normalizeMileage } from '@/lib/snaps/odometer'
import { MAX_PLATE_NUMBER_LENGTH, MAX_VEHICLE_NAME_LENGTH } from '@/lib/snaps/vehicle-details'
import { VERIFICATION_APPLICANT_MAX_LENGTH } from '@/lib/verifications/entries'

export interface EditSnapFormValues {
  fullName: string
  plateNumber: string
  make: string
  model: string
  year: string
  mileage: string
  phone: string
}

export type EditSnapFieldName = keyof EditSnapFormValues

export const editSnapFormDefaults = (snap?: AdminSnapListItem | null): EditSnapFormValues => ({
  fullName: snap?.fullName ?? '',
  plateNumber: snap?.plateNumber ?? '',
  make: snap?.make ?? '',
  model: snap?.model ?? '',
  year: snap?.year === null || snap?.year === undefined ? '' : String(snap.year),
  mileage: snap?.mileage === null || snap?.mileage === undefined ? '' : String(snap.mileage),
  phone: snap?.phone ?? ''
})

export function validateEditSnapForm(values: EditSnapFormValues) {
  const fields: Partial<Record<EditSnapFieldName, string>> = {}
  const requiredTextFields = ['fullName', 'plateNumber', 'make', 'model', 'phone'] as const
  for (const field of requiredTextFields) {
    if (!values[field].trim()) fields[field] = 'This field is required.'
  }

  if (values.fullName.trim().length > VERIFICATION_APPLICANT_MAX_LENGTH)
    fields.fullName = `Keep this under ${VERIFICATION_APPLICANT_MAX_LENGTH} characters.`
  if (values.plateNumber.trim().length > MAX_PLATE_NUMBER_LENGTH)
    fields.plateNumber = `Keep this under ${MAX_PLATE_NUMBER_LENGTH} characters.`
  if (values.make.trim().length > MAX_VEHICLE_NAME_LENGTH)
    fields.make = `Keep this under ${MAX_VEHICLE_NAME_LENGTH} characters.`
  if (values.model.trim().length > MAX_VEHICLE_NAME_LENGTH)
    fields.model = `Keep this under ${MAX_VEHICLE_NAME_LENGTH} characters.`
  if (values.phone.trim().length > ACCOUNT_PHONE_MAX_LENGTH)
    fields.phone = `Keep this under ${ACCOUNT_PHONE_MAX_LENGTH} characters.`

  const year = Number(values.year)
  if (!values.year.trim() || !Number.isSafeInteger(year) || year < 1886 || year > new Date().getFullYear() + 1)
    fields.year = 'Enter a valid vehicle model year.'

  if (values.mileage.trim()) {
    const mileage = normalizeMileage(values.mileage)
    if (mileage === null) fields.mileage = `Enter a value from 0 to ${MAX_VEHICLE_MILEAGE.toLocaleString()} km.`
  }

  return Object.keys(fields).length > 0 ? { fields } : undefined
}

export function toUpdateAdminSnapInput(snap: AdminSnapListItem, values: EditSnapFormValues): UpdateAdminSnapInput {
  const validation = validateEditSnapForm(values)
  if (validation) throw new Error('Correct the highlighted snap details.')

  return {
    snapId: snap._id,
    fullName: values.fullName.trim(),
    plateNumber: values.plateNumber.trim(),
    make: values.make.trim(),
    model: values.model.trim(),
    year: Number(values.year),
    mileage: values.mileage.trim() ? normalizeMileage(values.mileage) : null,
    phone: values.phone.trim()
  }
}

export function useEditSnapForm(onSubmit: (values: EditSnapFormValues) => Promise<void>) {
  return useForm({
    defaultValues: editSnapFormDefaults(),
    validators: { onChange: ({ value }) => validateEditSnapForm(value) },
    onSubmit: async ({ value, formApi }) => {
      try {
        await onSubmit(value)
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unable to update the snap.'
        formApi.setErrorMap({ onSubmit: { form: message, fields: {} } })
      }
    }
  })
}

export type EditSnapForm = ReturnType<typeof useEditSnapForm>

export const readEditSnapValidationMessage = (errors: ReadonlyArray<unknown>) => {
  const message = errors.find((error) => typeof error === 'string' && error.length > 0)
  return typeof message === 'string' ? message : null
}
