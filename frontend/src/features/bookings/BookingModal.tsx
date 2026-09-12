import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { AlertCircle, Clock, DollarSign } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useServices } from '@/features/services/useServices'
import { getAvailableStaffForSlot } from '@/api/staff'
import { useCreateBooking } from './useBookings'
import type { BookingResponse, StaffResponse } from '@/api/types'
import { extractErrorMessage, isConflictError } from '@/utils/errors'
import { deriveEndInstant, formatInstantTime } from '@/utils/dates'

const bookingSchema = z.object({
  serviceId: z.string().min(1, 'Please select a service'),
  staffId: z.string().min(1, 'Please select an available staff member'),
  startAtDate: z.string().min(1, 'Date is required'),
  startAtTime: z.string().min(1, 'Time is required').regex(/^\d{2}:\d{2}$/, 'Format: HH:mm'),
  customerName: z.string().min(1, 'Customer name is required').max(100),
  petName: z.string().max(100).optional(),
})

type BookingFormValues = z.infer<typeof bookingSchema>

interface BookingModalProps {
  isOpen: boolean
  onClose: () => void
  initialServiceId?: string
  initialStaffId?: string
  initialStartAt?: string // ISO-8601 Instant e.g. "2026-09-15T09:00:00Z"
  onSuccess?: (booking: BookingResponse) => void
}

export function BookingModal({
  isOpen,
  onClose,
  initialServiceId,
  initialStaffId,
  initialStartAt,
  onSuccess,
}: BookingModalProps) {
  const { data: services, isLoading: servicesLoading } = useServices()
  const createBookingMutation = useCreateBooking()

  // Parse initial startAt into date (YYYY-MM-DD) and time (HH:mm) in UTC
  const defaultDate = initialStartAt
    ? initialStartAt.substring(0, 10)
    : new Date().toISOString().substring(0, 10)
  const defaultTime = initialStartAt
    ? initialStartAt.substring(11, 16)
    : '09:00'

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BookingFormValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      serviceId: initialServiceId ?? '',
      staffId: initialStaffId ?? '',
      startAtDate: defaultDate,
      startAtTime: defaultTime,
      customerName: '',
      petName: '',
    },
  })

  // Watch fields to dynamically query available staff
  const selectedServiceId = watch('serviceId')
  const selectedStartAtDate = watch('startAtDate')
  const selectedStartAtTime = watch('startAtTime')
  const selectedStaffId = watch('staffId')

  const [availableStaff, setAvailableStaff] = useState<StaffResponse[]>([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Derive active service
  const activeService = services?.find((s) => s.id === selectedServiceId)

  // Construct ISO Instant
  const currentIsoStartAt =
    selectedStartAtDate && selectedStartAtTime
      ? `${selectedStartAtDate}T${selectedStartAtTime}:00Z`
      : null

  // Reset form when modal opens or initial props change
  useEffect(() => {
    if (isOpen) {
      reset({
        serviceId: initialServiceId ?? (services && services.length > 0 ? services[0].id : ''),
        staffId: initialStaffId ?? '',
        startAtDate: defaultDate,
        startAtTime: defaultTime,
        customerName: '',
        petName: '',
      })
      setErrorMessage(null)
    }
  }, [isOpen, initialServiceId, initialStaffId, initialStartAt, defaultDate, defaultTime, reset, services])

  // Fetch available staff when service or start time changes
  useEffect(() => {
    if (!isOpen || !selectedServiceId || !currentIsoStartAt) return

    let cancelled = false
    setStaffLoading(true)

    getAvailableStaffForSlot(selectedServiceId, currentIsoStartAt)
      .then((staff) => {
        if (cancelled) return
        setAvailableStaff(staff)
        // Auto-select staff if initialStaffId is available or if only 1 staff available
        if (initialStaffId && staff.some((s) => s.id === initialStaffId)) {
          setValue('staffId', initialStaffId)
        } else if (staff.length === 1) {
          setValue('staffId', staff[0].id)
        } else if (selectedStaffId && !staff.some((s) => s.id === selectedStaffId)) {
          setValue('staffId', '')
        }
      })
      .catch(() => {
        if (!cancelled) setAvailableStaff([])
      })
      .finally(() => {
        if (!cancelled) setStaffLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, selectedServiceId, currentIsoStartAt, initialStaffId, setValue, selectedStaffId])

  const onSubmit = async (data: BookingFormValues) => {
    setErrorMessage(null)
    const startAt = `${data.startAtDate}T${data.startAtTime}:00Z`

    try {
      const result = await createBookingMutation.mutateAsync({
        serviceId: data.serviceId,
        staffId: data.staffId,
        startAt,
        customerName: data.customerName.trim(),
        petName: data.petName?.trim() || undefined,
      })

      toast.success('Booking created successfully!')
      if (onSuccess) onSuccess(result)
      onClose()
    } catch (err: unknown) {
      if (isConflictError(err)) {
        setErrorMessage(
          'That slot was just booked by someone else. Please choose another available slot or staff member.'
        )
      } else {
        setErrorMessage(extractErrorMessage(err))
      }
    }
  }

  // End time display calculation
  const endInstantDisplay =
    currentIsoStartAt && activeService
      ? deriveEndInstant(currentIsoStartAt, activeService.durationMinutes)
      : null

  const handleFormSubmit = (data: BookingFormValues) => {
    return onSubmit(data)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Booking" size="md">
      <form onSubmit={handleSubmit(handleFormSubmit)} noValidate className="form" id="booking-create-form">
        {errorMessage && (
          <div
            className="card"
            style={{
              background: 'var(--color-danger-light)',
              border: '1px solid var(--color-danger)',
              padding: 'var(--space-3) var(--space-4)',
              color: 'var(--color-danger)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Service Selector */}
        <div className="form__field">
          <label className="form__label" htmlFor="booking-service">
            Service <span aria-hidden="true" className="form__required">*</span>
          </label>
          <select
            id="booking-service"
            className={`form__select ${errors.serviceId ? 'form__input--error' : ''}`}
            disabled={servicesLoading}
            {...register('serviceId')}
          >
            <option value="">-- Select a Service --</option>
            {services?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.durationMinutes} min — ${s.price.toFixed(2)})
              </option>
            ))}
          </select>
          {errors.serviceId && (
            <span className="form__error" role="alert">{errors.serviceId.message}</span>
          )}
        </div>

        {/* Date & Time Row */}
        <div className="form__row">
          <div className="form__field">
            <label className="form__label" htmlFor="booking-date">
              Date (UTC) <span aria-hidden="true" className="form__required">*</span>
            </label>
            <input
              id="booking-date"
              type="date"
              className={`form__input ${errors.startAtDate ? 'form__input--error' : ''}`}
              {...register('startAtDate')}
            />
            {errors.startAtDate && (
              <span className="form__error" role="alert">{errors.startAtDate.message}</span>
            )}
          </div>

          <div className="form__field">
            <label className="form__label" htmlFor="booking-time">
              Start Time (UTC) <span aria-hidden="true" className="form__required">*</span>
            </label>
            <input
              id="booking-time"
              type="time"
              className={`form__input ${errors.startAtTime ? 'form__input--error' : ''}`}
              {...register('startAtTime')}
            />
            {errors.startAtTime && (
              <span className="form__error" role="alert">{errors.startAtTime.message}</span>
            )}
          </div>
        </div>

        {/* Service summary pill */}
        {activeService && endInstantDisplay && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--bg-elevated)',
              padding: 'var(--space-3) var(--space-4)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--text-secondary)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Clock size={14} style={{ color: 'var(--color-primary)' }} />
              <span>
                Duration: <strong style={{ color: 'var(--text-primary)' }}>{activeService.durationMinutes} min</strong>{' '}
                (Ends at {formatInstantTime(endInstantDisplay)})
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
              <DollarSign size={14} style={{ color: 'var(--color-success)' }} />
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                ${activeService.price.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Staff Member Selector */}
        <div className="form__field">
          <label className="form__label" htmlFor="booking-staff">
            Staff Member <span aria-hidden="true" className="form__required">*</span>
          </label>
          <select
            id="booking-staff"
            className={`form__select ${errors.staffId ? 'form__input--error' : ''}`}
            disabled={staffLoading || !selectedServiceId}
            {...register('staffId')}
          >
            <option value="">
              {staffLoading
                ? 'Checking available staff...'
                : availableStaff.length === 0
                ? '-- No staff available for this slot --'
                : '-- Select Staff Member --'}
            </option>
            {availableStaff.map((st) => (
              <option key={st.id} value={st.id}>
                {st.name}
              </option>
            ))}
          </select>
          {errors.staffId && (
            <span className="form__error" role="alert">{errors.staffId.message}</span>
          )}
          {!staffLoading && selectedServiceId && availableStaff.length === 0 && (
            <span className="form__hint" style={{ color: 'var(--color-warning)' }}>
              No staff members are scheduled and available at this date and time for this service.
            </span>
          )}
        </div>

        {/* Customer & Pet Name */}
        <div className="form__row">
          <div className="form__field">
            <label className="form__label" htmlFor="booking-customer">
              Customer Name <span aria-hidden="true" className="form__required">*</span>
            </label>
            <input
              id="booking-customer"
              type="text"
              placeholder="e.g. Jane Doe"
              className={`form__input ${errors.customerName ? 'form__input--error' : ''}`}
              {...register('customerName')}
            />
            {errors.customerName && (
              <span className="form__error" role="alert">{errors.customerName.message}</span>
            )}
          </div>

          <div className="form__field">
            <label className="form__label" htmlFor="booking-pet">
              Pet Name <span className="text-muted font-normal">(optional)</span>
            </label>
            <input
              id="booking-pet"
              type="text"
              placeholder="e.g. Max"
              className="form__input"
              {...register('petName')}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="form__actions">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={isSubmitting}
            disabled={staffLoading || availableStaff.length === 0}
          >
            Confirm Booking
          </Button>
        </div>
      </form>
    </Modal>
  )
}
