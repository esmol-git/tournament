export type MatchStageUi =
  | 'GROUP'
  | 'PLAYOFF'
  | 'GOLD_CUP'
  | 'SILVER_CUP'

export function matchStageLabel(
  stage: string | null | undefined,
  t: (key: string) => string,
): string {
  switch (stage) {
    case 'GROUP':
      return t('admin.match_stage.group')
    case 'PLAYOFF':
      return t('admin.match_stage.playoff')
    case 'GOLD_CUP':
      return t('admin.match_stage.gold_cup')
    case 'SILVER_CUP':
      return t('admin.match_stage.silver_cup')
    default:
      return stage ?? '—'
  }
}

export function isGroupLikeStage(stage: string | null | undefined): boolean {
  return stage === 'GROUP'
}

export function isPlayoffLikeStage(stage: string | null | undefined): boolean {
  return (
    stage === 'PLAYOFF' || stage === 'GOLD_CUP' || stage === 'SILVER_CUP'
  )
}
