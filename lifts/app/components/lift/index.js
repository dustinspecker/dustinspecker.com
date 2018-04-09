import {ListItem, ListItemText} from 'material-ui/List'
import Paper from 'material-ui/Paper'
import PropTypes from 'prop-types'
import React from 'react'

class Lift extends React.Component {
  render() {
    const {name} = this.props

    return (
      <Paper
        elevation={1}
      >
        <ListItem
          button
          component='a'
          href={`#/${name.replace(/\s+/g, '')}`}
        >
          <ListItemText
            inset
            primary={name}
          />
        </ListItem>
      </Paper>
    )
  }
}

Lift.propTypes = {
  name: PropTypes.string.isRequired
}

export default Lift
