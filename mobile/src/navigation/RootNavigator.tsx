import { Ionicons } from '@expo/vector-icons'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useMemo } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { OfflineBanner } from '../components/system/OfflineBanner'
import { useAuth } from '../auth/AuthContext'
import { canAccessMatchResultsFlow } from '../auth/roleLabels'
import { LoginScreen } from '../screens/auth/LoginScreen'
import { HomeScreen } from '../screens/app/HomeScreen'
import { MatchResultsScreen } from '../screens/app/MatchResultsScreen'
import { SettingsScreen } from '../screens/app/SettingsScreen'
import { TournamentsScreen } from '../screens/app/TournamentsScreen'
import { TournamentDetailScreen } from '../screens/app/TournamentDetailScreen'
import { MatchProtocolScreen } from '../screens/app/MatchProtocolScreen'
import { useTheme } from '../theme/ThemeContext'
import { createAppLinking } from './linking'
import type {
  HomeStackParamList,
  MainTabParamList,
  MatchesStackParamList,
  RootStackParamList,
  SettingsStackParamList,
  TournamentsStackParamList,
} from './types'

const RootStack = createNativeStackNavigator<RootStackParamList>()
const Tab = createBottomTabNavigator<MainTabParamList>()
const HomeStack = createNativeStackNavigator<HomeStackParamList>()
const TournamentsStack = createNativeStackNavigator<TournamentsStackParamList>()
const MatchesStack = createNativeStackNavigator<MatchesStackParamList>()
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>()

function useThemedStackOptions() {
  const { colors } = useTheme()
  return useMemo(
    () => ({
      headerTintColor: colors.primary,
      headerTitleStyle: { fontWeight: '600' as const, color: colors.primary },
      /** Иначе на iOS шапка стека остаётся светлой и режет глаз в тёмной теме. */
      headerStyle: { backgroundColor: colors.background },
      headerShadowVisible: false,
      contentStyle: { backgroundColor: colors.background },
    }),
    [colors],
  )
}

function HomeStackNavigator() {
  const screenOptions = useThemedStackOptions()
  return (
    <HomeStack.Navigator screenOptions={screenOptions}>
      <HomeStack.Screen name="Home" component={HomeScreen} options={{ title: 'Главная' }} />
    </HomeStack.Navigator>
  )
}

function TournamentsStackNavigator() {
  const screenOptions = useThemedStackOptions()
  return (
    <TournamentsStack.Navigator screenOptions={screenOptions}>
      <TournamentsStack.Screen name="Tournaments" component={TournamentsScreen} options={{ title: 'Турниры' }} />
      <TournamentsStack.Screen
        name="TournamentDetail"
        component={TournamentDetailScreen}
        options={({ route }) => ({
          title: route.params.tournamentName?.trim() || 'Турнир',
        })}
      />
      <TournamentsStack.Screen name="MatchProtocol" component={MatchProtocolScreen} options={{ title: 'Протокол' }} />
    </TournamentsStack.Navigator>
  )
}

function MatchesStackNavigator() {
  const screenOptions = useThemedStackOptions()
  return (
    <MatchesStack.Navigator screenOptions={screenOptions}>
      <MatchesStack.Screen name="MatchResults" component={MatchResultsScreen} options={{ title: 'Матчи' }} />
      <MatchesStack.Screen name="MatchProtocol" component={MatchProtocolScreen} options={{ title: 'Протокол' }} />
    </MatchesStack.Navigator>
  )
}

function SettingsStackNavigator() {
  const screenOptions = useThemedStackOptions()
  return (
    <SettingsStack.Navigator screenOptions={screenOptions}>
      <SettingsStack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Настройки' }} />
    </SettingsStack.Navigator>
  )
}

function MainTabsNavigator() {
  const { user } = useAuth()
  const { colors } = useTheme()
  const showMatchesTab = user ? canAccessMatchResultsFlow(user.role) : false

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          borderTopColor: colors.border,
          backgroundColor: colors.background,
        },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStackNavigator}
        options={{
          title: 'Главная',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="TournamentsTab"
        component={TournamentsStackNavigator}
        options={{
          title: 'Турниры',
          tabBarIcon: ({ color, size }) => <Ionicons name="trophy-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="MatchesTab"
        component={MatchesStackNavigator}
        options={{
          title: 'Матчи',
          tabBarIcon: ({ color, size }) => <Ionicons name="football-outline" size={size} color={color} />,
          tabBarButton: showMatchesTab ? undefined : () => null,
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsStackNavigator}
        options={{
          title: 'Настройки',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  )
}

function BootScreen() {
  const { colors } = useTheme()
  return (
    <View style={[styles.boot, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.accent} />
    </View>
  )
}

export function RootNavigator() {
  const { user, isReady } = useAuth()
  const { colors } = useTheme()
  const linking = useMemo(() => createAppLinking(user), [user])

  if (!isReady) {
    return <BootScreen />
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <OfflineBanner />
      <View style={styles.navContainer}>
        <NavigationContainer linking={linking}>
          <RootStack.Navigator
            screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
          >
            {user ? (
              <RootStack.Screen name="Main" component={MainTabsNavigator} />
            ) : (
              <RootStack.Screen name="Login" component={LoginScreen} />
            )}
          </RootStack.Navigator>
        </NavigationContainer>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  navContainer: {
    flex: 1,
  },
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
