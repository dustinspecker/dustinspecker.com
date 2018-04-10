import AppBar from 'material-ui/AppBar'
import CssBaseline from 'material-ui/CssBaseline'
import {HashRouter} from 'react-router-dom'
import LiftsList from './components/lifts-list'
import React from 'react'
import {render} from 'react-dom'
import ToolBar from 'material-ui/ToolBar'
import Typography from 'material-ui/Typography'

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

class App extends React.Component {
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
          <LiftsList
            lifts={lifts}
          />
        </React.Fragment>
      </HashRouter>
    )
  }
}

render(<App />, document.querySelector('#app'))
