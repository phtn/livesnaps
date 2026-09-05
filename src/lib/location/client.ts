import {
  type DeviceLocation,
  deviceLocationFromPosition,
  isSnapLocationCurrentAndAccurate,
  MAX_SNAP_LOCATION_ACCURACY_METERS
} from './type'

const INITIAL_LOCATION_TIMEOUT_MS = 45_000

export class DeviceLocationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DeviceLocationError'
  }
}

const getGeolocationErrorMessage = (error: GeolocationPositionError) => {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Location permission was denied. Enable precise location access to continue.'
    case error.POSITION_UNAVAILABLE:
      return 'Your device could not determine a precise location. Check Location Services and GPS signal.'
    case error.TIMEOUT:
      return 'A precise location could not be confirmed in time. Move to an area with a clearer GPS signal.'
    default:
      return 'Location Services became unavailable. Restart verification after restoring location access.'
  }
}

export interface DeviceLocationWatch {
  initialLocation: DeviceLocation
  getLatestLocation: () => DeviceLocation
  getFreshLocation: () => Promise<DeviceLocation>
  stop: VoidFunction
}

const requestAccurateLocation = () =>
  new Promise<DeviceLocation>((resolve, reject) => {
    let watchId: number | null = null
    const timeoutId = window.setTimeout(() => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId)
      }

      reject(
        new DeviceLocationError(
          `Location accuracy must reach ${MAX_SNAP_LOCATION_ACCURACY_METERS} meters or better. Check GPS signal and try again.`
        )
      )
    }, INITIAL_LOCATION_TIMEOUT_MS)

    const finish = (callback: () => void) => {
      window.clearTimeout(timeoutId)

      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId)
      }

      callback()
    }

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const location = deviceLocationFromPosition(position)

        if (isSnapLocationCurrentAndAccurate(location)) {
          finish(() => resolve(location))
        }
      },
      (error) => finish(() => reject(new DeviceLocationError(getGeolocationErrorMessage(error)))),
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 30_000
      }
    )
  })

export const startDeviceLocationWatch = ({
  onFatalError,
  onLocation
}: {
  onFatalError: (error: DeviceLocationError) => void
  onLocation: (location: DeviceLocation) => void
}) =>
  new Promise<DeviceLocationWatch>((resolve, reject) => {
    if (!window.isSecureContext || !navigator.geolocation) {
      reject(
        new DeviceLocationError('Location verification requires a supported browser on a secure HTTPS connection.')
      )
      return
    }

    let latestLocation: DeviceLocation | null = null
    let permissionStatus: PermissionStatus | null = null
    let permissionChangeHandler: VoidFunction | null = null
    let settled = false
    let stopped = false
    const timeoutId = window.setTimeout(() => {
      if (settled || stopped) {
        return
      }

      stopped = true
      navigator.geolocation.clearWatch(watchId)
      reject(
        new DeviceLocationError(
          `Location accuracy must reach ${MAX_SNAP_LOCATION_ACCURACY_METERS} meters or better. Check GPS signal and try again.`
        )
      )
    }, INITIAL_LOCATION_TIMEOUT_MS)

    const stop = () => {
      if (stopped) {
        return
      }

      stopped = true
      window.clearTimeout(timeoutId)
      navigator.geolocation.clearWatch(watchId)

      if (permissionStatus && permissionChangeHandler) {
        permissionStatus.removeEventListener('change', permissionChangeHandler)
      }
    }

    const monitorPermission = () => {
      if (!navigator.permissions) {
        return
      }

      void navigator.permissions
        .query({ name: 'geolocation' })
        .then((status) => {
          if (stopped) {
            return
          }

          permissionStatus = status
          permissionChangeHandler = () => {
            if (status.state === 'granted' || stopped) {
              return
            }

            const error = new DeviceLocationError(
              'Precise location permission was disabled during verification. Start a new session after restoring it.'
            )
            stop()
            onFatalError(error)
          }
          status.addEventListener('change', permissionChangeHandler)
        })
        .catch(() => undefined)
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (stopped) {
          return
        }

        const location = deviceLocationFromPosition(position)
        latestLocation = location
        onLocation(location)

        if (!settled && isSnapLocationCurrentAndAccurate(location)) {
          settled = true
          window.clearTimeout(timeoutId)
          monitorPermission()
          resolve({
            initialLocation: location,
            getLatestLocation: () => {
              if (!latestLocation) {
                throw new DeviceLocationError('No active device location is available.')
              }

              return latestLocation
            },
            getFreshLocation: async () => {
              if (latestLocation && isSnapLocationCurrentAndAccurate(latestLocation)) {
                return latestLocation
              }

              const freshLocation = await requestAccurateLocation()
              latestLocation = freshLocation
              onLocation(freshLocation)
              return freshLocation
            },
            stop
          })
        }
      },
      (error) => {
        if (stopped) {
          return
        }

        const locationError = new DeviceLocationError(getGeolocationErrorMessage(error))

        if (!settled) {
          stop()
          reject(locationError)
          return
        }

        stop()
        onFatalError(locationError)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 30_000
      }
    )
  })
