import { Image, type ImageStyle, type StyleProp } from 'react-native'

const SOURCE = require('../../../assets/icon.png')

type Props = {
  /** Сторона квадрата в логических пикселях */
  size?: number
  style?: StyleProp<ImageStyle>
}

export function AppLogo({ size = 72, style }: Props) {
  return (
    <Image
      source={SOURCE}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
      accessibilityLabel="Tournament Platform"
    />
  )
}
