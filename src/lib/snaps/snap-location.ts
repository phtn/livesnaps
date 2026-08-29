import type { SnapLocation } from '../../../convex/snaps/d'
import type { ReverseGeocodedAddress } from '../location/type'

export type { SnapLocation } from '../../../convex/snaps/d'

interface SnapLocationSource {
  address: ReverseGeocodedAddress
  best_accuracy_meters: number
  country_code_matches_ipinfo: boolean | null
}

export const prepareSnapLocation = ({
  address,
  best_accuracy_meters,
  country_code_matches_ipinfo
}: SnapLocationSource): SnapLocation => ({
  address: {
    city: address.city ?? '',
    country: address.country ?? '',
    country_code: address.country_code ?? '',
    country_code_alpha_3: address.country_code_alpha_3 ?? '',
    feature_type: address.feature_type,
    full_address: address.full_address,
    latitude: address.latitude,
    locality: address.locality ?? '',
    longitude: address.longitude,
    mapbox_id: address.mapbox_id,
    postcode: address.postcode ?? '',
    provider: address.provider,
    region: address.region ?? '',
    street_name: address.street_name ?? ''
  },
  best_accuracy_meters,
  country_code_matches_ipinfo: country_code_matches_ipinfo === true
})
