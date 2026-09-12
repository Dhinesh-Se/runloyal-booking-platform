import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ServiceForm } from '@/features/services/ServiceForm'

describe('ServiceForm', () => {
  it('renders all form inputs and default values', () => {
    render(
      <ServiceForm
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(screen.getByLabelText(/Name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Category/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Duration/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Price/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Status/i)).toBeInTheDocument()
  })

  it('validates required fields on submit', async () => {
    const handleSubmit = vi.fn()
    const user = userEvent.setup()

    render(
      <ServiceForm
        onSubmit={handleSubmit}
        onCancel={vi.fn()}
      />
    )

    const submitBtn = screen.getByRole('button', { name: /Save/i })
    await user.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument()
      expect(screen.getByText('Category is required')).toBeInTheDocument()
    })

    expect(handleSubmit).not.toHaveBeenCalled()
  })

  it('submits valid data successfully', async () => {
    const handleSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(
      <ServiceForm
        onSubmit={handleSubmit}
        onCancel={vi.fn()}
      />
    )

    await user.type(screen.getByLabelText(/Name/i), 'Full Dog Groom')
    await user.type(screen.getByLabelText(/Category/i), 'Grooming')
    await user.type(screen.getByLabelText(/Duration/i), '60')
    await user.type(screen.getByLabelText(/Price/i), '45.00')

    const submitBtn = screen.getByRole('button', { name: /Save/i })
    await user.click(submitBtn)

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Full Dog Groom',
          category: 'Grooming',
          durationMinutes: 60,
          price: 45,
          status: 'ACTIVE',
        })
      )
    })
  })

  it('displays server validation field errors', () => {
    const serverError = {
      response: {
        status: 400,
        data: {
          errors: {
            name: 'Service with this name already exists',
          },
        },
      },
    }

    render(
      <ServiceForm
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        serverError={serverError}
      />
    )

    expect(screen.getByText('Service with this name already exists')).toBeInTheDocument()
  })
})
