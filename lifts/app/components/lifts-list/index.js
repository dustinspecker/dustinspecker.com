import LiftListItem from '../lift-list-item'
import List from 'material-ui/List'
import Paper from 'material-ui/Paper'
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
          {Object.entries(lifts)
            .map(([id, liftData]) =>
              <LiftListItem
                key={id}
                id={id}
                {...liftData}
              />
            )
          }
        </List>
      </Paper>
    )
  }
}

export default LiftsList
