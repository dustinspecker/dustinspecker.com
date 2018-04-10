import {InputAdornment} from 'material-ui/Input'
import Paper from 'material-ui/Paper'
import React from 'react'
import Table, {TableBody, TableCell, TableHead, TableRow} from 'material-ui/Table'
import TextField from 'material-ui/TextField'

const roundToNearest5 = x => {
  const correctionForNeedingToRoundUp = x % 5 > 2.5 ? 5 : 0

  return parseInt(x / 5) * 5 + correctionForNeedingToRoundUp
}

const setWeight = (workWeight, setIndex, numberOfSets) => {
  if (setIndex === 0) {
    return 45
  }

  const increment = (workWeight - 45) / (numberOfSets - 1)

  return roundToNearest5(45 + (increment * (setIndex)))
}

class LiftView extends React.Component {
  render() {
    const {id, name, setWorkWeight, workout, workWeight} = this.props

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
              .map((w, index, {length}) => {
                const weight = setWeight(workWeight, index, length)

                return (
                  <TableRow
                    key={`${w.sets}x${w.reps}x${weight}`}
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
        />
      </Paper>
    )
  }
}

export default LiftView
