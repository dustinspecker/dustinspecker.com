import LiftListItem from '../lift-list-item'
import List from 'material-ui/List'
import Paper from 'material-ui/Paper'
import PropTypes from 'prop-types'
import React from 'react'

class LiftsList extends React.Component {
  render() {
    const {lifts} = this.props

    return (
      <Paper
        elevation={0}
      >
        <List
          component='nav'
        >
          {lifts
            .map(lift =>
              <LiftListItem
                key={lift.id}
                {...lift}
              />
            )
          }
        </List>
      </Paper>
    )
  }
}

LiftsList.propTypes = {
  lifts: PropTypes.array.isRequired
}

export default LiftsList
