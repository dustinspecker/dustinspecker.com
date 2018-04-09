import AppBar from 'material-ui/AppBar'
import CssBaseline from 'material-ui/CssBaseline'
import Lift from './components/lift'
import List from 'material-ui/List'
import Paper from 'material-ui/Paper'
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
        <Paper
          elevation={0}
        >
          <List
            component='nav'
          >
            {Object.entries(lifts)
              .map(([id, liftData]) =>
                <Lift
                  key={id}
                  id={id}
                  {...liftData}
                />
              )
            }
          </List>
        </Paper>
      </React.Fragment>
    )
  }
}

render(<App />, document.querySelector('#app'))
