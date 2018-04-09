import AppBar from 'material-ui/AppBar'
import CssBaseline from 'material-ui/CssBaseline'
import React from 'react'
import {render} from 'react-dom'
import ToolBar from 'material-ui/ToolBar'
import Typography from 'material-ui/Typography'

const App = () =>
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
  </React.Fragment>

render(<App />, document.querySelector('#app'))
