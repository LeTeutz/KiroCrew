import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { renderWithProviders } from './helpers'
import ChatInput from '../components/ChatInput'

// Pins the resize-notice contract: downscale details render as a fixed-size
// accent ICON badge ON the attachment chip, with a styled hover tooltip
// showing the dimensions — not as a banner pinned above the transcript, and
// not as a localized word (a text pill cannot fit a chip whose width follows
// a portrait image's aspect ratio; it wrapped and covered the thumbnail).

const defaultProps = {
  value: '',
  onChange: vi.fn(),
  onSend: vi.fn(),
}

const IMG = '/tmp/uploads/big-test-image.png'
const OTHER = '/tmp/uploads/untouched.png'
const RESIZE = { name: 'big-test-image.png', fromW: 2400, fromH: 3200, toW: 1176, toH: 1568, fromBytes: 900000, toBytes: 300000 }

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('ChatInput attachment resize badge', () => {
  it('shows a fixed-size resize icon badge on a downscaled image chip', () => {
    renderWithProviders(
      <ChatInput {...defaultProps} pendingFiles={[IMG]} resizedInfo={{ [IMG]: RESIZE }} />,
    )
    const badge = screen.getByLabelText('Resized to fit model limits: 2400×3200 to 1176×1568')
    expect(badge).toBeInTheDocument()
    // Icon-only: the badge must not render the localized word, whose longest
    // catalog value needs ~96px against a 30px-wide portrait chip.
    expect(badge).toHaveTextContent('')
    // Fixed sizes so it can never reflow to cover the thumbnail it annotates:
    // a transparent 24x24 hit box (the minimum pointer target) around a 16x16
    // visible mark.
    expect(badge.className).toMatch(/\bw-6\b/)
    expect(badge.className).toMatch(/\bh-6\b/)
    const mark = badge.firstElementChild as HTMLElement
    expect(mark.className).toMatch(/\bw-4\b/)
    expect(mark.className).toMatch(/\bh-4\b/)
    // The hit box paints nothing, so enlarging it moved no pixels.
    expect(badge.className).not.toMatch(/bg-accent/)
    expect(mark.className).toMatch(/bg-accent/)
  })

  it('opens a tooltip with the dimensions on hover and closes on leave', () => {
    renderWithProviders(
      <ChatInput {...defaultProps} pendingFiles={[IMG]} resizedInfo={{ [IMG]: RESIZE }} />,
    )
    const badge = screen.getByLabelText(/Resized to fit model limits/)
    fireEvent.mouseEnter(badge)
    const tip = screen.getByRole('tooltip')
    expect(tip).toHaveTextContent('Resized to fit model limits')
    expect(tip).toHaveTextContent('2400×3200 → 1176×1568')
    fireEvent.mouseLeave(badge)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('opens the tooltip on keyboard focus too', () => {
    renderWithProviders(
      <ChatInput {...defaultProps} pendingFiles={[IMG]} resizedInfo={{ [IMG]: RESIZE }} />,
    )
    fireEvent.focus(screen.getByLabelText(/Resized to fit model limits/))
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })

  it('renders no badge for images that were not resized', () => {
    renderWithProviders(
      <ChatInput {...defaultProps} pendingFiles={[OTHER]} resizedInfo={{ [IMG]: RESIZE }} />,
    )
    expect(screen.queryByLabelText(/Resized to fit model limits/)).not.toBeInTheDocument()
  })

  it('badges only the resized chip when mixed with untouched files', () => {
    renderWithProviders(
      <ChatInput {...defaultProps} pendingFiles={[IMG, OTHER]} resizedInfo={{ [IMG]: RESIZE }} />,
    )
    expect(screen.getAllByLabelText(/Resized to fit model limits/)).toHaveLength(1)
  })

  it('renders no badge when resizedInfo is absent entirely', () => {
    renderWithProviders(<ChatInput {...defaultProps} pendingFiles={[IMG]} />)
    expect(screen.queryByLabelText(/Resized to fit model limits/)).not.toBeInTheDocument()
  })

  // The chip's height is fixed and its width follows the image's aspect ratio,
  // so an unbounded width collapses a phone screenshot (~0.46) to ~30px and
  // lets a panorama run hundreds of px wide, pushing siblings out of the strip.
  it('bounds the thumbnail width at both ends so extreme aspect ratios stay usable', () => {
    renderWithProviders(
      <ChatInput {...defaultProps} pendingFiles={[IMG]} resizedInfo={{ [IMG]: RESIZE }} />,
    )
    const thumb = screen.getByAltText(IMG)
    expect(thumb.className).toMatch(/\bmin-w-12\b/)
    expect(thumb.className).toMatch(/\bmax-w-32\b/)
    expect(thumb.className).toMatch(/\bobject-contain\b/)
  })
})
