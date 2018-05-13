import {getPlates, roundToNearest5} from './weights'

test('roundToNearest5', () => {
  expect(roundToNearest5('42')).toBe(40)
  expect(roundToNearest5('43')).toBe(45)
  expect(roundToNearest5('47.49')).toBe(45)
  expect(roundToNearest5('47.5')).toBe(45)
  expect(roundToNearest5('47.51')).toBe(50)
})

test('getPlates', () => {
  expect(getPlates(45)).toBe('bar')
  expect(getPlates(50)).toBe('2.5')
  expect(getPlates(55)).toBe('5')
  expect(getPlates(60)).toBe('5 2.5')
  expect(getPlates(80)).toBe('10 5 2.5')
  expect(getPlates(90)).toBe('10 10 2.5')
  expect(getPlates(110)).toBe('25 5 2.5')
  expect(getPlates(130)).toBe('35 5 2.5')
  expect(getPlates(220)).toBe('45 35 5 2.5')
  expect(getPlates(315)).toBe('45 45 45')
})
