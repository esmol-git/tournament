import { useNetInfo } from '@react-native-community/netinfo'

/** true, если устройство явно без сети или без доступа в интернет. */
export function useNetworkOffline(): boolean {
  const net = useNetInfo()
  if (net.isConnected === false) return true
  if (net.isInternetReachable === false) return true
  return false
}
