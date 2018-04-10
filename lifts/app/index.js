import AppBar from 'material-ui/AppBar'
import CssBaseline from 'material-ui/CssBaseline'
import {HashRouter, Route} from 'react-router-dom'
import LiftsList from './components/lifts-list'
import LiftView from './components/lift-view'
import React from 'react'
import {render} from 'react-dom'
import ToolBar from 'material-ui/ToolBar'
import Typography from 'material-ui/Typography'

class App extends React.Component {
  constructor() {
    super(...arguments)

    const lifts = {
      0: {
        name: 'squats'
      },
      1: {
        name: 'bench press'
      },
      2: {
        name: 'rows'
      },
      3: {
        name: 'overhead press'
      },
      4: {
        name: 'deadlifts'
      }
    }

    this.state = {
      lifts
    }
  }

  render() {
    return (
      <HashRouter>
        <React.Fragment>
          <CssBaseline />
          <AppBar
            color='primary'
            position='static'
          >
            <ToolBar>
              <Typography
                color='inherit'
                variant='title'
              >
                Lifts
              </Typography>
            </ToolBar>
          </AppBar>
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
                  {...this.state.lifts[id]}
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
