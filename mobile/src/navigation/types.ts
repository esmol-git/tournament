import type { NavigatorScreenParams } from '@react-navigation/native'

export type MatchProtocolRouteParams = {
  tournamentId: string
  matchId: string
}

export type HomeStackParamList = {
  Home: undefined
}

export type TournamentsStackParamList = {
  Tournaments: undefined
  TournamentDetail: { tournamentId: string; tournamentName?: string }
  MatchProtocol: MatchProtocolRouteParams
}

export type MatchesStackParamList = {
  MatchResults: undefined
  MatchProtocol: MatchProtocolRouteParams
}

export type MainTabParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList> | undefined
  TournamentsTab: NavigatorScreenParams<TournamentsStackParamList> | undefined
  MatchesTab: NavigatorScreenParams<MatchesStackParamList> | undefined
}

export type RootStackParamList = {
  Login: undefined
  Main: undefined
}
