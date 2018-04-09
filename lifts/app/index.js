import AppBar from 'material-ui/AppBar'
import CssBaseline from 'material-ui/CssBaseline'
import Lift from './components/lift'
import List from 'material-ui/List'
import Paper from 'material-ui/Paper'
import React from 'react'
import {render} from 'react-dom'
import ToolBar from 'material-ui/ToolBar'
import Typography from 'material-ui/Typography'

const lifts = [
  'squats',
  'bench press',
  'rows',
  'overhead press',
  'deadlifts'
]

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
            {lifts
              .map(lift =>
                <Lift
                  key={lift}
                  name={lift}
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
