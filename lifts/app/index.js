import CssBaseline from 'material-ui/CssBaseline'
import defaultState from './utils/default-state'
import {HashRouter, Route} from 'react-router-dom'
import Header from './components/header'
import LiftsList from './components/lifts-list'
import LiftView from './components/lift-view'
import React from 'react'
import {render} from 'react-dom'

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
