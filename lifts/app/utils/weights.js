export const roundToNearest5 = x => {
  const correctionForNeedingToRoundUp = x % 5 > 2.5 ? 5 : 0

  return parseInt(x / 5) * 5 + correctionForNeedingToRoundUp
}

export const getPlates = weight => {
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

