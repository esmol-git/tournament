import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from './src/auth/AuthContext'
import { InvalidApiConfigScreen } from './src/components/system/InvalidApiConfigScreen'
import { getApiConfigIssue } from './src/config/validateApiConfig'
import { RootNavigator } from './src/navigation/RootNavigator'
import { ThemeProvider, useTheme } from './src/theme/ThemeContext'

function ThemedStatusBar() {
  const { isDark } = useTheme()
  return <StatusBar style={isDark ? 'light' : 'dark'} />
}

function AppShell() {
  const issue = getApiConfigIssue()
  if (issue) {
    return <InvalidApiConfigScreen message={issue} />
  }
  return (
    <>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
      <ThemedStatusBar />
    </>
  )
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppShell />
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
