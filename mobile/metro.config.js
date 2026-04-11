// Expo / Metro по умолчанию не подхватывает модули вне `mobile/`.
// Репозиторийный `shared/protocol/*` лежит на уровень выше — добавляем корень в watchFolders.
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const monorepoRoot = path.resolve(projectRoot, '..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [...new Set([...(config.watchFolders ?? []), monorepoRoot])]

const nmProject = path.resolve(projectRoot, 'node_modules')
const nmRoot = path.resolve(monorepoRoot, 'node_modules')
config.resolver.nodeModulesPaths = [...new Set([...(config.resolver.nodeModulesPaths ?? []), nmProject, nmRoot])]

module.exports = config
