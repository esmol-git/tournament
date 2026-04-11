import { Ionicons } from '@expo/vector-icons'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { API_BASE_URL } from '../../config/appConfig'
import { useTheme } from '../../theme/ThemeContext'

type Props = {
  message: string
}

export function InvalidApiConfigScreen({ message }: Props) {
  const { colors } = useTheme()
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.iconWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="warning-outline" size={40} color={colors.error} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Настройка API</Text>
        <Text style={[styles.body, { color: colors.muted }]}>{message}</Text>
        <View style={[styles.codeBlock, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.codeLabel, { color: colors.muted }]}>Сейчас используется</Text>
          <Text selectable style={[styles.code, { color: colors.primary }]}>
            {API_BASE_URL}
          </Text>
        </View>
        <Text style={[styles.hint, { color: colors.muted }]}>
          В каталоге mobile создайте файл .env (скопируйте из .env.example) и укажите, например:{'\n\n'}
          EXPO_PUBLIC_API_BASE_URL=https://api.tournament-platform.ru{'\n\n'}
          Затем перезапустите Metro с очисткой кэша: npx expo start -c
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 24, paddingBottom: 40 },
  iconWrap: {
    alignSelf: 'center',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  body: { fontSize: 16, lineHeight: 24, textAlign: 'center', marginBottom: 20 },
  codeBlock: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  codeLabel: { fontSize: 12, marginBottom: 6 },
  code: { fontSize: 14, fontFamily: 'Menlo' },
  hint: { fontSize: 14, lineHeight: 22 },
})
