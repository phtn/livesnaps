export const CRYPTO_WALLET_ADDRESSES_IDENTIFIER = 'crypto_wallet_addresses'
export const CRYPTO_WALLET_DESTINATION_IDENTIFIER = 'crypto_wallet_destination'
export const CRYPTO_PRIVATE_CREDENTIALS_IDENTIFIER = 'crypto_private_credentials'

export const CRYPTO_WALLET_NETWORK_KEYS = ['bitcoin', 'ethereum', 'polygon', 'sepolia', 'amoy'] as const
export const EVM_RELAY_NETWORK_KEYS = ['ethereum', 'polygon', 'sepolia', 'amoy'] as const

export type CryptoWalletNetworkKey = (typeof CRYPTO_WALLET_NETWORK_KEYS)[number]
export type EvmRelayNetworkKey = (typeof EVM_RELAY_NETWORK_KEYS)[number]

export interface CryptoWalletAddressEntry {
  active: boolean
  address: string
}

export type CryptoWalletAddressesSetting = Record<CryptoWalletNetworkKey, CryptoWalletAddressEntry>
export type CryptoWalletDestinationSetting = Record<CryptoWalletNetworkKey, string>

export interface EvmRelayCredentialsEntry {
  enabled: boolean
  evmNative: string
  evmPrivate: string
}

export interface BitcoinRelayCredentialsEntry {
  enabled: boolean
  btcApiUrl: string
  btcNative: string
  btcPrivate: string
}

export interface CryptoPrivateCredentialsSetting {
  enabled: boolean
  amoy: EvmRelayCredentialsEntry
  bitcoin: BitcoinRelayCredentialsEntry
  ethereum: EvmRelayCredentialsEntry
  polygon: EvmRelayCredentialsEntry
  sepolia: EvmRelayCredentialsEntry
}

export interface CryptoWalletSettingsBundle {
  privateCredentials: CryptoPrivateCredentialsSetting
  walletAddresses: CryptoWalletAddressesSetting
  walletDestination: CryptoWalletDestinationSetting
}

const DEFAULT_ACTIVE_NETWORKS: Record<CryptoWalletNetworkKey, boolean> = {
  bitcoin: true,
  ethereum: true,
  polygon: true,
  sepolia: false,
  amoy: false
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const asRecord = (value: unknown): Record<string, unknown> | null => (isRecord(value) ? value : null)

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined

const asBoolean = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined)

const getConfiguredAddress = (value: unknown): string => {
  const record = asRecord(value)

  return (
    asString(value) ??
    asString(record?.address) ??
    asString(record?.native) ??
    asString(record?.evmNative) ??
    asString(record?.btcNative) ??
    asString(record?.value) ??
    ''
  )
}

const getConfiguredSecret = (value: unknown): string => {
  const record = asRecord(value)

  return (
    asString(value) ??
    asString(record?.evmPrivate) ??
    asString(record?.btcPrivate) ??
    asString(record?.private) ??
    asString(record?.privateKey) ??
    asString(record?.value) ??
    ''
  )
}

export const parseStoredAdminValue = (value: string): unknown => {
  const trimmed = value.trim()
  if (!trimmed) {
    return {}
  }

  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return trimmed
  }
}

export const createDefaultCryptoWalletAddressesSetting = (): CryptoWalletAddressesSetting => ({
  bitcoin: { address: '', active: DEFAULT_ACTIVE_NETWORKS.bitcoin },
  ethereum: { address: '', active: DEFAULT_ACTIVE_NETWORKS.ethereum },
  polygon: { address: '', active: DEFAULT_ACTIVE_NETWORKS.polygon },
  sepolia: { address: '', active: DEFAULT_ACTIVE_NETWORKS.sepolia },
  amoy: { address: '', active: DEFAULT_ACTIVE_NETWORKS.amoy }
})

export const createDefaultCryptoWalletDestinationSetting = (): CryptoWalletDestinationSetting => ({
  bitcoin: '',
  ethereum: '',
  polygon: '',
  sepolia: '',
  amoy: ''
})

const createDefaultEvmRelayCredentialsEntry = (): EvmRelayCredentialsEntry => ({
  enabled: true,
  evmNative: '',
  evmPrivate: ''
})

const createDefaultBitcoinRelayCredentialsEntry = (): BitcoinRelayCredentialsEntry => ({
  enabled: true,
  btcApiUrl: '',
  btcNative: '',
  btcPrivate: ''
})

export const createDefaultCryptoPrivateCredentialsSetting = (): CryptoPrivateCredentialsSetting => ({
  enabled: true,
  amoy: createDefaultEvmRelayCredentialsEntry(),
  bitcoin: createDefaultBitcoinRelayCredentialsEntry(),
  ethereum: createDefaultEvmRelayCredentialsEntry(),
  polygon: createDefaultEvmRelayCredentialsEntry(),
  sepolia: createDefaultEvmRelayCredentialsEntry()
})

export const createDefaultCryptoWalletSettingsBundle = (): CryptoWalletSettingsBundle => ({
  privateCredentials: createDefaultCryptoPrivateCredentialsSetting(),
  walletAddresses: createDefaultCryptoWalletAddressesSetting(),
  walletDestination: createDefaultCryptoWalletDestinationSetting()
})

export const cloneCryptoWalletSettingsBundle = (value: CryptoWalletSettingsBundle): CryptoWalletSettingsBundle => ({
  privateCredentials: {
    enabled: value.privateCredentials.enabled,
    amoy: { ...value.privateCredentials.amoy },
    bitcoin: { ...value.privateCredentials.bitcoin },
    ethereum: { ...value.privateCredentials.ethereum },
    polygon: { ...value.privateCredentials.polygon },
    sepolia: { ...value.privateCredentials.sepolia }
  },
  walletAddresses: {
    bitcoin: { ...value.walletAddresses.bitcoin },
    ethereum: { ...value.walletAddresses.ethereum },
    polygon: { ...value.walletAddresses.polygon },
    sepolia: { ...value.walletAddresses.sepolia },
    amoy: { ...value.walletAddresses.amoy }
  },
  walletDestination: { ...value.walletDestination }
})

export const normalizeCryptoWalletAddressesSetting = (value: unknown): CryptoWalletAddressesSetting => {
  const record = asRecord(value)
  const defaults = createDefaultCryptoWalletAddressesSetting()

  return {
    bitcoin: {
      address: getConfiguredAddress(record?.bitcoin),
      active: asBoolean(asRecord(record?.bitcoin)?.active) ?? defaults.bitcoin.active
    },
    ethereum: {
      address: getConfiguredAddress(record?.ethereum),
      active: asBoolean(asRecord(record?.ethereum)?.active) ?? defaults.ethereum.active
    },
    polygon: {
      address: getConfiguredAddress(record?.polygon),
      active: asBoolean(asRecord(record?.polygon)?.active) ?? defaults.polygon.active
    },
    sepolia: {
      address: getConfiguredAddress(record?.sepolia),
      active: asBoolean(asRecord(record?.sepolia)?.active) ?? defaults.sepolia.active
    },
    amoy: {
      address: getConfiguredAddress(record?.amoy),
      active: asBoolean(asRecord(record?.amoy)?.active) ?? defaults.amoy.active
    }
  }
}

export const normalizeCryptoWalletDestinationSetting = (value: unknown): CryptoWalletDestinationSetting => {
  const record = asRecord(value)

  return {
    bitcoin: getConfiguredAddress(record?.bitcoin),
    ethereum: getConfiguredAddress(record?.ethereum),
    polygon: getConfiguredAddress(record?.polygon),
    sepolia: getConfiguredAddress(record?.sepolia),
    amoy: getConfiguredAddress(record?.amoy)
  }
}

const normalizeEvmRelayCredentialsEntry = (
  value: unknown,
  root: Record<string, unknown> | null
): EvmRelayCredentialsEntry => {
  const record = asRecord(value)

  return {
    enabled: asBoolean(record?.enabled) ?? asBoolean(root?.enabled) ?? true,
    evmNative:
      getConfiguredAddress(record) || getConfiguredAddress(root?.evmNative ?? root?.native ?? root?.address ?? ''),
    evmPrivate:
      getConfiguredSecret(record) || getConfiguredSecret(root?.evmPrivate ?? root?.privateKey ?? root?.private ?? '')
  }
}

const normalizeBitcoinRelayCredentialsEntry = (
  value: unknown,
  root: Record<string, unknown> | null
): BitcoinRelayCredentialsEntry => {
  const record = asRecord(value)

  return {
    enabled: asBoolean(record?.enabled) ?? asBoolean(root?.enabled) ?? true,
    btcApiUrl:
      asString(record?.btcApiUrl) ??
      asString(record?.apiUrl) ??
      asString(record?.mempoolApiUrl) ??
      asString(root?.btcApiUrl) ??
      asString(root?.apiUrl) ??
      asString(root?.mempoolApiUrl) ??
      '',
    btcNative:
      getConfiguredAddress(record) ||
      getConfiguredAddress(root?.btcNative ?? root?.native ?? root?.address ?? root?.value ?? ''),
    btcPrivate:
      getConfiguredSecret(record) || getConfiguredSecret(root?.btcPrivate ?? root?.privateKey ?? root?.private ?? '')
  }
}

export const normalizeCryptoPrivateCredentialsSetting = (value: unknown): CryptoPrivateCredentialsSetting => {
  const root = asRecord(value)

  return {
    enabled: asBoolean(root?.enabled) ?? true,
    amoy: normalizeEvmRelayCredentialsEntry(root?.amoy, root),
    bitcoin: normalizeBitcoinRelayCredentialsEntry(root?.bitcoin, root),
    ethereum: normalizeEvmRelayCredentialsEntry(root?.ethereum, root),
    polygon: normalizeEvmRelayCredentialsEntry(root?.polygon, root),
    sepolia: normalizeEvmRelayCredentialsEntry(root?.sepolia, root)
  }
}
