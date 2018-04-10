import {InputAdornment} from 'material-ui/Input'
import Paper from 'material-ui/Paper'
import React from 'react'
import Table, {TableBody, TableCell, TableHead, TableRow} from 'material-ui/Table'
import TextField from 'material-ui/TextField'

const roundToNearest5 = x => {
  const correctionForNeedingToRoundUp = x % 5 > 2.5 ? 5 : 0

  return parseInt(x / 5) * 5 + correctionForNeedingToRoundUp
}

const setWeight = (workWeight, percentOfWorkingWeight) => {
  return Math.max(roundToNearest5(workWeight * percentOfWorkingWeight / 100), 45)
}

class LiftView extends React.Component {
  render() {
    const {id, name, notes, setNotes, setWorkWeight, workout, workWeight} = this.props

    return (
      <Paper
        elevation={0}
      >
        <TextField
          inputProps={{
            min: 45,
            step: 5
          }}
          InputProps={{
            endAdornment: <InputAdornment position='end'>lbs</InputAdornment>,
          }}
          label='Working Weight'
          onChange={event => {
            setWorkWeight(id, parseInt(event.target.value, 10))
          }}
          placeholder='150'
          type='number'
          value={workWeight}
        />
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Sets x Reps</TableCell>
              <TableCell numeric>Weight (lbs)</TableCell>
              <TableCell>Plates</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {workout
              .map(w => {
                const weight = setWeight(workWeight, w.percentOfWorkingWeight)

                return (
                  <TableRow
                    key={w.id}
                  >
                    <TableCell>{`${w.sets}x${w.reps}`}</TableCell>
                    <TableCell numeric>{weight}</TableCell>
                    <TableCell>bar</TableCell>
                  </TableRow>
                )
              })
            }
          </TableBody>
        </Table>
        <TextField
          label="Notes"
          placeholder="Notes"
          multiline
          onChange={event => {
            setNotes(id, event.target.value)
          }}
          value={notes}
        />
      </Paper>
    )
  }
}

export default LiftView
