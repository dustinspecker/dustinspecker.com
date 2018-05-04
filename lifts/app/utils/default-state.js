import uuidv4 from 'uuid/v4'

const flattenArray = array =>
  [].concat(...array)

const oneByFiveWorkout = [
  {sets: 2, reps: 5, percentOfWorkingWeight: 0},
  {sets: 1, reps: 5, percentOfWorkingWeight: 40},
  {sets: 1, reps: 3, percentOfWorkingWeight: 60},
  {sets: 1, reps: 2, percentOfWorkingWeight: 80},
  {sets: 1, reps: 5, percentOfWorkingWeight: 100}
]

const threeByFiveWorkout = [
  {sets: 2, reps: 5, percentOfWorkingWeight: 0},
  {sets: 1, reps: 5, percentOfWorkingWeight: 40},
  {sets: 1, reps: 3, percentOfWorkingWeight: 60},
  {sets: 1, reps: 2, percentOfWorkingWeight: 80},
  {sets: 3, reps: 5, percentOfWorkingWeight: 100}
]

const weightedWorkout = [
  {sets: 3, reps: 5, percentOfWorkingWeight: 100}
]

const dumbellWorkout = [
  {sets: 3, reps: 12, percentOfWorkingWeight: 100}
]

const createWorkouts = (workouts, liftId) =>
  workouts
    .map(workout =>
      Object.assign(
        {},
        workout,
        {
          id: uuidv4(),
          liftId
        }
      )
    )

const defaultThreeByFiveLifts = [
  {id: uuidv4(), name: 'squats', workWeight: 280, usesBarbell: true},
  {id: uuidv4(), name: 'bench press', workWeight: 180, usesBarbell: true},
  {id: uuidv4(), name: 'rows', workWeight: 175, usesBarbell: true},
  {id: uuidv4(), name: 'overhead press', workWeight: 110, usesBarbell: true}
]

const defaultThreeByFiveWorkouts = flattenArray(
  defaultThreeByFiveLifts
    .map(({id}) => createWorkouts(threeByFiveWorkout, id))
)

const defaultOneByFiveLifts = [
  {id: uuidv4(), name: 'deadlifts', workWeight: 330, usesBarbell: true}
]

const defaultOneByFiveWorkouts = flattenArray(
  defaultOneByFiveLifts
    .map(({id}) => createWorkouts(oneByFiveWorkout, id))
)

const defaultWeightedLifts = [
  {id: uuidv4(), name: 'dips', workWeight: 45},
  {id: uuidv4(), name: 'chin-ups', workWeight: 35}
]

const defaultWeightedWorkouts = flattenArray(
  defaultWeightedLifts
    .map(({id}) => createWorkouts(weightedWorkout, id))
)

const defaultDumbellLifts = [
  {id: uuidv4(), name: 'curls', workWeight: 45},
  {id: uuidv4(), name: 'hammer curls', workWeight: 35},
  {id: uuidv4(), name: 'croc rows', workWeight: 75},
]

const defaultDumbellWorkouts = flattenArray(
  defaultDumbellLifts
    .map(({id}) => createWorkouts(dumbellWorkout, id))
)

const defaultLifts = defaultThreeByFiveLifts
  .concat(defaultOneByFiveLifts)
  .concat(defaultWeightedLifts)
  .concat(defaultDumbellLifts)

const defaultWorkouts = defaultThreeByFiveWorkouts
  .concat(defaultOneByFiveWorkouts)
  .concat(defaultWeightedWorkouts)
  .concat(defaultDumbellWorkouts)

export default {
  lifts: defaultLifts,
  workouts: defaultWorkouts
}
