export interface LiteData {
  ip: string
  asn: string
  as_name: string
  as_domain: string
  country_code: string
  country: string
  continent_code: string
  continent: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export const parseLiteData = (value: unknown): LiteData | null => {
  if (!isRecord(value)) {
    return null
  }

  const { ip, asn, as_name, as_domain, country_code, country, continent_code, continent } = value

  if (
    typeof ip !== 'string' ||
    typeof asn !== 'string' ||
    typeof as_name !== 'string' ||
    typeof as_domain !== 'string' ||
    typeof country_code !== 'string' ||
    typeof country !== 'string' ||
    typeof continent_code !== 'string' ||
    typeof continent !== 'string'
  ) {
    return null
  }

  return {
    ip,
    asn,
    as_name,
    as_domain,
    country_code,
    country,
    continent_code,
    continent
  }
}
