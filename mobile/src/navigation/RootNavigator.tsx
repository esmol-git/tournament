import { Ionicons } from '@expo/vector-icons'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { useAuth } from '../auth/AuthContext'
import { canAccessMatchResultsFlow } from '../auth/roleLabels'
import { LoginScreen } from '../screens/auth/LoginScreen'
import { HomeScreen } from '../screens/app/HomeScreen'
import { MatchResultsScreen } from '../screens/app/MatchResultsScreen'
import { TournamentsScreen } from '../screens/app/TournamentsScreen'
import { TournamentDetailScreen } from '../screens/app/TournamentDetailScreen'
import { MatchProtocolScreen } from '../screens/app/MatchProtocolScreen'
import { colors } from '../theme/colors'
import type {
  HomeStackParamList,
  MainTabParamList,
  MatchesStackParamList,
  RootStackParamList,
  TournamentsStackParamList,
} from './types'

const RootStack = createNativeStackNavigator<RootStackParamList>()
const Tab = createBottomTabNavigator<MainTabParamList>()
const HomeStack = createNativeStackNavigator<HomeStackParamList>()
const TournamentsStack = createNativeStackNavigator<TournamentsStackParamList>()
const MatchesStack = createNativeStackNavigator<MatchesStackParamList>()

const stackScreenOptions = {
  headerTintColor: colors.primary,
  headerTitleStyle: { fontWeight: '600' as const },
  contentStyle: { backgroundColor: colors.background },
}

function HomeStackNavigator() {
  return (
    <HomeStack.Navigator screenOptions={stackScreenOptions}>
      <HomeStack.Screen name="Home" component={HomeScreen} options={{ title: 'Главная' }} />
    </HomeStack.Navigator>
  )
}

function TournamentsStackNavigator() {
  return (
    <TournamentsStack.Navigator screenOptions={stackScreenOptions}>
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
  return (
    <MatchesStack.Navigator screenOptions={stackScreenOptions}>
      <MatchesStack.Screen name="MatchResults" component={MatchResultsScreen} options={{ title: 'Матчи' }} />
      <MatchesStack.Screen name="MatchProtocol" component={MatchProtocolScreen} options={{ title: 'Протокол' }} />
    </MatchesStack.Navigator>
  )
}

function MainTabsNavigator() {
  const { user } = useAuth()
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
    </Tab.Navigator>
  )
}

export function RootNavigator() {
  const { user, isReady } = useAuth()

  if (!isReady) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    )
  }

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        {user ? (
          <RootStack.Screen name="Main" component={MainTabsNavigator} />
        ) : (
          <RootStack.Screen name="Login" component={LoginScreen} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  )
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
})
