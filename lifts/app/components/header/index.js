import AppBar from 'material-ui/AppBar'
import React from 'react'
import Toolbar from 'material-ui/Toolbar'
import Typography from 'material-ui/Typography'

class Header extends React.Component {
  render() {
    return (
      <AppBar
        color='primary'
        position='static'
      >
        <Toolbar>
          <Typography
            color='inherit'
            variant='title'
          >
            Lifts
          </Typography>
        </Toolbar>
      </AppBar>
    )
  }
}

export default Header
