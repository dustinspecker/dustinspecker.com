import LiftListItem from '.'
import React from 'react'
import renderer from 'react-test-renderer'

test('LiftListItem', () => {
  const props = {
    id: '73',
    name: 'squats',
    workWeight: 300
  }

  const component = renderer.create(
    <LiftListItem {...props} />
  )

  const tree = component.toJSON()

  expect(tree).toMatchSnapshot()
})
