import CssBaseline from 'material-ui/CssBaseline'
import {HashRouter, Route} from 'react-router-dom'
import Header from './components/header'
import LiftsList from './components/lifts-list'
import LiftView from './components/lift-view'
import React from 'react'
import {render} from 'react-dom'

const oneByFiveWorkout = [
  {sets: 2, reps: 5},
  {sets: 1, reps: 5},
  {sets: 1, reps: 3},
  {sets: 1, reps: 2},
  {sets: 1, reps: 5}
]

const threeByFiveWorkout = [
  {sets: 2, reps: 5},
  {sets: 1, reps: 5},
  {sets: 1, reps: 3},
  {sets: 1, reps: 2},
  {sets: 3, reps: 5}
]

const defaultState = {
  lifts: {
    0: {
      name: 'squats',
      workout: threeByFiveWorkout,
      workWeight: 280
    },
    1: {
      name: 'bench press',
      workout: threeByFiveWorkout,
      workWeight: 180
    },
    2: {
      name: 'rows',
      workout: threeByFiveWorkout,
      workWeight: 175
    },
    3: {
      name: 'overhead press',
      workout: threeByFiveWorkout,
      workWeight: 110
    },
    4: {
      name: 'deadlifts',
      workout: oneByFiveWorkout,
      workWeight: 330
    }
  }
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

  setWorkWeight = (id, newWorkWeight) => {
    const newState = Object.assign({}, this.state)

    newState.lifts[id].workWeight = newWorkWeight

    this.writeState(newState)
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

              return (
                <LiftView
                  id={id}
                  {...this.state.lifts[id]}
                  setWorkWeight={this.setWorkWeight}
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
