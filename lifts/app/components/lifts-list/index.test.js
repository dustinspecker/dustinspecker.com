import LiftsList from '.'
import React from 'react'
import renderer from 'react-test-renderer'

test('LiftsList', () => {
  const props = {
    lifts: [
      {
        id: '73',
        name: 'squats',
        workWeight: 300
      }
    ]
  }

  const component = renderer.create(
    <LiftsList {...props} />
  )

  const tree = component.toJSON()

  expect(tree).toMatchSnapshot()
})
