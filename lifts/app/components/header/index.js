import AppBar from 'material-ui/AppBar'
import Button from 'material-ui/Button'
import Icon from 'material-ui/Icon'
import {matchPath, withRouter} from 'react-router-dom'
import React from 'react'
import Toolbar from 'material-ui/Toolbar'
import Typography from 'material-ui/Typography'
import {upperCaseWords} from '../../utils/string'
import {withStyles} from 'material-ui/styles'

const styles = {
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between'
  }
}

class Header extends React.Component {
  render() {
    const match = matchPath(this.props.location.pathname, '/:id')
    const id = match && match.params.id
    const selectedLift = this.props.lifts[id]
    const {classes} = this.props

    return (
      <AppBar
        color='primary'
        position='static'
      >
        <Toolbar
          className={classes.toolbar}
        >
          <Typography
            color='inherit'
            variant='title'
          >
            {selectedLift
              ? `Lifts | ${upperCaseWords(selectedLift.name)}`
              : 'Lifts'
            }
          </Typography>
          <Button
            color='inherit'
            component='a'
            href='#/'
          >
            <Icon>home</Icon>
          </Button>
        </Toolbar>
      </AppBar>
    )
  }
}

export default withRouter(withStyles(styles)(Header))
