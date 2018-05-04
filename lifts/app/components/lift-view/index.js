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

const getPlates = weight => {
  if (weight === 45) {
    return 'bar'
  }

  return [45, 35, 25, 10, 5, 2.5]
    .reduce((acc, plate) => {
      const plateWeight = acc.currentWeight - 45
      const oneSideOfPlates = plateWeight / 2
      const numOfPlates = Math.floor(oneSideOfPlates / plate)

      return {
        currentWeight: acc.currentWeight - (numOfPlates * plate * 2),
        str: acc.str + `${plate.toString()} `.repeat(numOfPlates)
      }
    }, {currentWeight: weight, str: ''})
    .str
    .trim()
}

class LiftView extends React.Component {
  render() {
    const {
      id,
      name,
      notes,
      setNotes,
      setWorkWeight,
      usesBarbell,
      workout,
      workWeight
    } = this.props

    return (
      <Paper
        elevation={0}
      >
        <TextField
          inputProps={{
            min: usesBarbell ? 45 : 0,
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
              {usesBarbell &&  <TableCell>Plates</TableCell>}
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
                    {usesBarbell && <TableCell>{getPlates(weight)}</TableCell>}
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
