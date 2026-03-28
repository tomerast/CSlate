import { render, screen } from '@testing-library/react'
import App from '../App'

describe('App', () => {
  it('renders the CSlate headline', () => {
    render(<App />)
    expect(screen.getByText('CSlate')).toBeInTheDocument()
  })

  it('renders the welcome message', () => {
    render(<App />)
    expect(screen.getByText(/Press ⌘K to begin/)).toBeInTheDocument()
  })
})
