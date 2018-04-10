import Paper from 'material-ui/Paper'
import React from 'react'
import Table, {TableBody, TableCell, TableHead, TableRow} from 'material-ui/Table'
import TextField from 'material-ui/TextField'

class LiftView extends React.Component {
  render() {
    const {name} = this.props

    return (
      <Paper
        elevation={0}
      >
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Sets x Reps</TableCell>
              <TableCell numeric>Weight (lbs)</TableCell>
              <TableCell>Plates</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell>2x5</TableCell>
              <TableCell numeric>45</TableCell>
              <TableCell>bar</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>1x5</TableCell>
              <TableCell numeric>100</TableCell>
              <TableCell>25 2.5</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>1x3</TableCell>
              <TableCell numeric>155</TableCell>
              <TableCell>45 10</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>1x2</TableCell>
              <TableCell numeric>210</TableCell>
              <TableCell>45 35 2.5</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>3x5</TableCell>
              <TableCell numeric>270</TableCell>
              <TableCell>45 45 10 10 2.5</TableCell>
            </TableRow>
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
