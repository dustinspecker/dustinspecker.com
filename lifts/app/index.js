import React from 'react'
import {render} from 'react-dom'

function App() {
  return React.createElement('p', null, ['hello'])
}

render(App(), document.querySelector('#app'))
