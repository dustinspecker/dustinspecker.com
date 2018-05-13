import {upperCaseWords} from './string'

test('upperCaseWords', () => {
  expect(upperCaseWords('hello       hEy\t\nBYE')).toEqual('Hello HEy BYE')
})
