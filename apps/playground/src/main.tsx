import React from 'react'
import ReactDOM from 'react-dom/client'
import { Playground } from './Playground'

const params = new URLSearchParams(window.location.search)
const componentName = params.get('component')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Playground componentName={componentName} />
  </React.StrictMode>
)
