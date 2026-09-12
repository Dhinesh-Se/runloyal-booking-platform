import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AvailabilityForm } from '@/features/availability/AvailabilityForm'

describe('AvailabilityForm', () => {
  it('renders all fields for WORKING type by default', () => {
    render(
      <AvailabilityForm
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByLabelText(/Day/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Type/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Start Time/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/End Time/i)).toBeInTheDocument()
  })

  it('hides start and end time fields when type is OFF', async () => {
    const user = userEvent.setup()

    render(
      <AvailabilityForm
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    const typeSelect = screen.getByLabelText(/Type/i)
    await user.selectOptions(typeSelect, 'OFF')

    expect(screen.queryByLabelText(/Start Time/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/End Time/i)).not.toBeInTheDocument()
    expect(screen.getByText(/OFF marks this day as not available/i)).toBeInTheDocument()
  })

  it('validates that end time must be after start time', async () => {
    const handleSubmit = vi.fn()
    const user = userEvent.setup()

    render(
      <AvailabilityForm
        onSubmit={handleSubmit}
        onCancel={vi.fn()}
      />
    )

    const startInput = screen.getByLabelText(/Start Time/i)
    const endInput = screen.getByLabelText(/End Time/i)

    await user.clear(startInput)
    await user.type(startInput, '14:00')

    await user.clear(endInput)
    await user.type(endInput, '10:00')

    const submitBtn = screen.getByRole('button', { name: /Save/i })
    await user.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText(/End time must be after start time/i)).toBeInTheDocument()
    })

    expect(handleSubmit).not.toHaveBeenCalled()
  })

  it('submits valid availability schedule', async () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(
      <AvailabilityForm
        onSubmit={handleSubmit}
        onCancel={vi.fn()}
      />
    )

    const daySelect = screen.getByLabelText(/Day/i)
    await user.selectOptions(daySelect, 'TUESDAY')

    const startInput = screen.getByLabelText(/Start Time/i)
    await user.clear(startInput)
    await user.type(startInput, '10:00')

    const endInput = screen.getByLabelText(/End Time/i)
    await user.clear(endInput)
    await user.type(endInput, '18:00')

    const submitBtn = screen.getByRole('button', { name: /Save/i })
    await user.click(submitBtn)

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          dayOfWeek: 'TUESDAY',
          type: 'WORKING',
          startTime: '10:00',
          endTime: '18:00',
        })
      )
    })
  })
})
