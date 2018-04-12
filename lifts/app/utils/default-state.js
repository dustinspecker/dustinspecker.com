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
  {id: uuidv4(), name: 'squats', workWeight: 280},
  {id: uuidv4(), name: 'bench press', workWeight: 180},
  {id: uuidv4(), name: 'rows', workWeight: 175},
  {id: uuidv4(), name: 'overhead press', workWeight: 110},
]

const defaultThreeByFiveWorkouts = flattenArray(
  defaultThreeByFiveLifts
    .map(({id}) => createWorkouts(threeByFiveWorkout, id))
)

const defaultOneByFiveLifts = [
  {id: uuidv4(), name: 'deadlifts', workWeight: 330}
]

const defaultOneByFiveWorkouts = flattenArray(
  defaultOneByFiveLifts
    .map(({id}) => createWorkouts(oneByFiveWorkout, id))
)

const defaultLifts = defaultThreeByFiveLifts.concat(defaultOneByFiveLifts)

const defaultWorkouts = defaultThreeByFiveWorkouts.concat(defaultOneByFiveWorkouts)

export default {
  lifts: defaultLifts,
  workouts: defaultWorkouts
}
