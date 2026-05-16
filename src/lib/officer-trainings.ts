type RankOrder = {
  sortOrder: number
}

type TrainingMinimum = {
  id: string
  sortOrder: number
  minRankId?: string | null
  minRank?: RankOrder | null
}

type OfficerTrainingRow<TTraining extends TrainingMinimum> = {
  id: string
  trainingId: string
  completed: boolean
  training: TTraining
}

type OfficerWithTrainingRows<TTraining extends TrainingMinimum> = {
  id: string
  rank: RankOrder
  trainings: OfficerTrainingRow<TTraining>[]
}

export function isTrainingAvailableForRank(training: TrainingMinimum, rank: RankOrder) {
  return !training.minRank || rank.sortOrder <= training.minRank.sortOrder
}

export function eligibleTrainingsForRank<TTraining extends TrainingMinimum>(trainings: TTraining[], rank: RankOrder) {
  return trainings
    .filter((training) => isTrainingAvailableForRank(training, rank))
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

export function withEligibleOfficerTrainings<
  TOfficer extends OfficerWithTrainingRows<TTraining>,
  TTraining extends TrainingMinimum,
>(officer: TOfficer, trainings: TTraining[]) {
  const existingByTrainingId = new Map(officer.trainings.map((row) => [row.trainingId, row]))
  const rows = eligibleTrainingsForRank(trainings, officer.rank).map((training) => {
    const existing = existingByTrainingId.get(training.id)
    if (existing) {
      return { ...existing, training }
    }

    return {
      id: `virtual-${officer.id}-${training.id}`,
      trainingId: training.id,
      completed: false,
      training,
    }
  })

  return {
    ...officer,
    trainings: rows,
  }
}
