import {ListItem, ListItemText} from 'material-ui/List'
import Paper from 'material-ui/Paper'
import PropTypes from 'prop-types'
import React from 'react'
import {upperCaseWords} from '../../utils/string'

class LiftListItem extends React.Component {
  render() {
    const {id, name, workWeight} = this.props

    return (
      <Paper
        elevation={1}
      >
        <ListItem
          button
          component='a'
          href={`#/${id}`}
        >
          <ListItemText
            inset
            primary={upperCaseWords(name)}
            secondary={`${workWeight} lbs`}
          />
        </ListItem>
      </Paper>
    )
  }
}

LiftListItem.propTypes = {
  id: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired
}

export default LiftListItem
