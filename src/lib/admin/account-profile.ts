import { accountEndpoint } from '@/hooks/use-workspace'
import { workspaceJson, writeWorkspaceJson } from '@/lib/accounts/link-client'
import type { AdminAccountResponse } from '@/server/admin-account-routes'

export type AccountProfile = AdminAccountResponse
export type AccountProfileValues = {
  name: string
  contactName: string
  contactEmail: string
  contactPhone: string
  contactTitle: string
  legalName: string
  website: string
  industry: string
  size: string
  taxId: string
  billingEmail: string
  addressLine1: string
  addressLine2: string
  city: string
  region: string
  postalCode: string
  country: string
  notes: string
}

export const EMPTY_ACCOUNT_PROFILE_VALUES: AccountProfileValues = {
  name: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  contactTitle: '',
  legalName: '',
  website: '',
  industry: '',
  size: '',
  taxId: '',
  billingEmail: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  region: '',
  postalCode: '',
  country: '',
  notes: ''
}

export const toAccountProfileValues = (account: AdminAccountResponse['account']): AccountProfileValues => ({
  name: account.name,
  contactName: account.primaryContact.name,
  contactEmail: account.primaryContact.email,
  contactPhone: account.primaryContact.phone ?? '',
  contactTitle: account.primaryContact.title ?? '',
  legalName: account.organization.legalName ?? '',
  website: account.organization.website ?? '',
  industry: account.organization.industry ?? '',
  size: account.organization.size ?? '',
  taxId: account.organization.taxId ?? '',
  billingEmail: account.billingEmail ?? '',
  addressLine1: account.organization.address?.line1 ?? '',
  addressLine2: account.organization.address?.line2 ?? '',
  city: account.organization.address?.city ?? '',
  region: account.organization.address?.region ?? '',
  postalCode: account.organization.address?.postalCode ?? '',
  country: account.organization.address?.country ?? '',
  notes: account.notes ?? ''
})

const payload = (values: AccountProfileValues) => ({
  name: values.name,
  primaryContact: {
    name: values.contactName,
    email: values.contactEmail,
    phone: values.contactPhone,
    title: values.contactTitle
  },
  organization: {
    legalName: values.legalName,
    website: values.website,
    industry: values.industry,
    size: values.size,
    taxId: values.taxId,
    address: {
      line1: values.addressLine1,
      line2: values.addressLine2,
      city: values.city,
      region: values.region,
      postalCode: values.postalCode,
      country: values.country
    }
  },
  billingEmail: values.billingEmail,
  notes: values.notes
})

export const fetchAccountProfile = (accountId: string, signal?: AbortSignal) =>
  workspaceJson<AdminAccountResponse>(accountEndpoint('/api/admin/account', accountId), { signal })

export const saveAccountProfile = (accountId: string, values: AccountProfileValues) =>
  writeWorkspaceJson<AdminAccountResponse>(accountEndpoint('/api/admin/account', accountId), payload(values))

export const uploadAccountLogo = async (accountId: string, file: File) => {
  const data = new FormData()
  data.set('file', file)
  return workspaceJson<AdminAccountResponse>(accountEndpoint('/api/admin/account/logo', accountId), {
    method: 'POST',
    body: data
  })
}

export const accountLogoUrl = (accountId: string, version: number) =>
  `${accountEndpoint('/api/admin/account/logo', accountId)}&v=${version}`
