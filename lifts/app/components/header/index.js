import AppBar from 'material-ui/AppBar'
import {matchPath, withRouter} from 'react-router-dom'
import React from 'react'
import Toolbar from 'material-ui/Toolbar'
import Typography from 'material-ui/Typography'

class Header extends React.Component {
  render() {
    const match = matchPath(this.props.location.pathname, '/:id')
    const id = match && match.params.id
    const selectedLift = this.props.lifts[id]

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
            {selectedLift
              ? `Lifts | ${selectedLift.name}`
              : 'Lifts'
            }
          </Typography>
        </Toolbar>
      </AppBar>
    )
  }
}

export default withRouter(Header)
