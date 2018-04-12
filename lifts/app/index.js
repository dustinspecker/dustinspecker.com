import CssBaseline from 'material-ui/CssBaseline'
import {HashRouter, Route} from 'react-router-dom'
import Header from './components/header'
import LiftsList from './components/lifts-list'
import LiftView from './components/lift-view'
import React from 'react'
import {render} from 'react-dom'
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

const defaultState = {
  lifts: defaultLifts,
  workouts: defaultWorkouts
}

class App extends React.Component {
  constructor() {
    super()

    const existingState = localStorage.getItem('state')
    this.state = existingState ? JSON.parse(existingState) : defaultState
  }

  writeState = state => {
    localStorage.setItem('state', JSON.stringify(state))
    return this.setState(state)
  }

  setNotes = (id, newNotes) => {
    this.state.lifts =
      this.state.lifts
        .map(lift => {
          if (lift.id === id) {
            return Object.assign({}, lift, {notes: newNotes})
          }

          return lift
        })

    this.writeState(this.state)
  }

  setWorkWeight = (id, newWorkWeight) => {
    this.state.lifts =
      this.state.lifts
        .map(lift => {
          if (lift.id === id) {
            return Object.assign({}, lift, {workWeight: newWorkWeight})
          }

          return lift
        })

    this.writeState(this.state)
  }

  render() {
    return (
      <HashRouter>
        <React.Fragment>
          <CssBaseline />
          <Header
            lifts={this.state.lifts}
          />
          <Route
            exact
            path='/'
            render={() =>
              <LiftsList
                lifts={this.state.lifts}
              />
            }
          />
          <Route
            path='/:id'
            render={props => {
              const {id} = props.match.params

              const lift = this.state.lifts
                .find(l => l.id === id)

              const workout = this.state.workouts
                .filter(w => w.liftId === id)

              return (
                <LiftView
                  id={id}
                  {...lift}
                  setNotes={this.setNotes}
                  setWorkWeight={this.setWorkWeight}
                  workout={workout}
                />
              )
            }}
          />
        </React.Fragment>
      </HashRouter>
    )
  }
}

render(<App />, document.querySelector('#app'))
