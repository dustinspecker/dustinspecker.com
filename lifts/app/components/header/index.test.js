import Header from '.'
import {MemoryRouter} from 'react-router'
import React from 'react'
import renderer from 'react-test-renderer'

test('Header displays "Lifts" when no lift selected', () => {
  const props = {
    lifts: []
  }

  const component = renderer.create(
    <MemoryRouter>
      <Header {...props} />
    </MemoryRouter>
  )

  const tree = component.toJSON()

  expect(tree).toMatchSnapshot()
})

test('Header displays "Lifts | Name" when lift selected', () => {
  const props = {
    lifts: [
      {
        id: '2',
        name: 'first lift'
      },
      {
        id: '4',
        name: 'second lift'
      },
      {
        id: '5',
        name: 'third lift'
      }
    ]
  }

  const memoryRouterProps = {
    initialEntries: ['/4']
  }

  const component = renderer.create(
    <MemoryRouter {...memoryRouterProps} >
      <Header {...props} />
    </MemoryRouter>
  )

  const tree = component.toJSON()

  expect(tree).toMatchSnapshot()
})
