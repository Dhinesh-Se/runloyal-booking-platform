import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import toast from 'react-hot-toast'
import { AlertCircle, Clock, DollarSign } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useServices } from '@/features/services/useServices'
import { getAvailableStaffForSlot } from '@/api/staff'
import { useCreateBooking } from './useBookings'
import { useCanManageBookings } from './useBookingPermissions'
import { bookingDefaults, bookingSchema, bookingStartInstant, type BookingFormValues } from './bookingForm'
import type { BookingResponse, StaffResponse } from '@/api/types'
import { extractErrorMessage, isConflictError } from '@/utils/errors'
import { formatInstantTime } from '@/utils/dates'

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
  const canManageBookings = useCanManageBookings()
  const queryClient = useQueryClient()
  const defaultServicePending = useRef(!initialServiceId)
  const [appliedPrefill, setAppliedPrefill] = useState({ isOpen, initialServiceId, initialStartAt })

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BookingFormValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: bookingDefaults(initialServiceId, initialStaffId, initialStartAt),
  })

  // Watch fields to dynamically query available staff
  const selectedServiceId = watch('serviceId')
  const selectedStartAtDate = watch('startAtDate')
  const selectedStartAtTime = watch('startAtTime')
  const selectedStaffId = watch('staffId')

  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const activeService = services?.find((s) => s.id === selectedServiceId && s.status === 'ACTIVE')
  const currentIsoStartAt = bookingStartInstant(selectedStartAtDate, selectedStartAtTime)
  // Opening/changing slots must not query the old form before the reset effect.
  // A staff-only prefill change can keep using the same slot's eligibility cache.
  const prefillApplied = appliedPrefill.isOpen === isOpen &&
    appliedPrefill.initialServiceId === initialServiceId && appliedPrefill.initialStartAt === initialStartAt
  const staffQueryEnabled = isOpen && prefillApplied && !!activeService && !!currentIsoStartAt
  const staffQuery = useQuery({
    queryKey: ['available-staff', selectedServiceId, currentIsoStartAt],
    queryFn: () => getAvailableStaffForSlot(selectedServiceId, currentIsoStartAt!),
    enabled: staffQueryEnabled,
    staleTime: 0,
    refetchOnMount: 'always',
    retry: false,
    // Never borrow eligibility from another service/time, even with global defaults.
    placeholderData: undefined,
  })
  const staffReady = staffQueryEnabled && staffQuery.isSuccess &&
    staffQuery.fetchStatus === 'idle' && !staffQuery.isPlaceholderData
  const availableStaff = staffReady ? staffQuery.data ?? [] : []
  const selectedStaffEligible = availableStaff.some((staff) => staff.id === selectedStaffId)

  // Reset form when modal opens or initial props change
  useEffect(() => {
    if (isOpen) {
      reset(bookingDefaults(initialServiceId, initialStaffId, initialStartAt))
      defaultServicePending.current = !initialServiceId
      setErrorMessage(null)
    }
    setAppliedPrefill({ isOpen, initialServiceId, initialStartAt })
  }, [isOpen, initialServiceId, initialStaffId, initialStartAt, reset])

  // Initial catalogue load supplies only the default service, never resets user input.
  useEffect(() => {
    if (!isOpen || !defaultServicePending.current) return
    if (getValues('serviceId')) {
      defaultServicePending.current = false
      return
    }
    const firstActive = services?.find((service) => service.status === 'ACTIVE')
    if (firstActive) {
      setValue('serviceId', firstActive.id)
      defaultServicePending.current = false
    }
  }, [isOpen, initialServiceId, initialStaffId, initialStartAt, services, getValues, setValue])

  // Reconcile only against verified results, not on selection changes. Keep a valid
  // manual choice; an old prefill must not keep overriding it after refreshes.
  useEffect(() => {
    if (!isOpen || !staffReady) return
    // A prefill reset runs before this effect; do not reconcile the new form
    // against the previous render's slot while its new query is still mounting.
    if (getValues('serviceId') !== selectedServiceId ||
      bookingStartInstant(getValues('startAtDate'), getValues('startAtTime')) !== currentIsoStartAt) return
    const staff = staffQuery.data ?? []
    const selected = getValues('staffId')
    if (selected && !staff.some((member) => member.id === selected)) {
      setValue('staffId', '', { shouldValidate: true })
    } else if (!selected && staff.length === 1) {
      setValue('staffId', staff[0].id, { shouldValidate: true })
    }
  }, [isOpen, staffReady, staffQuery.data, selectedServiceId, currentIsoStartAt,
    initialServiceId, initialStaffId, initialStartAt, getValues, setValue])

  const endDate = currentIsoStartAt && activeService && activeService.durationMinutes > 0
    ? new Date(Date.parse(currentIsoStartAt) + activeService.durationMinutes * 60_000)
    : null
  const endInstantDisplay = endDate && Number.isFinite(endDate.getTime()) ? endDate.toISOString() : null

  const onSubmit = async (data: BookingFormValues) => {
    setErrorMessage(null)
    if (!isOpen || !canManageBookings) {
      setErrorMessage('Only active tenant administrators can create bookings.')
      return
    }
    const startAt = bookingStartInstant(data.startAtDate, data.startAtTime)
    // Read the cache synchronously too: invalidation may begin while async form
    // validation is running, before the observer has delivered another render.
    const eligibility = queryClient.getQueryState<StaffResponse[]>(['available-staff', data.serviceId, startAt])
    if (!staffReady || !startAt || !endInstantDisplay || startAt !== currentIsoStartAt ||
      data.serviceId !== activeService?.id ||
      eligibility?.status !== 'success' || eligibility.fetchStatus !== 'idle' || eligibility.isInvalidated ||
      !eligibility.data?.some((staff) => staff.id === data.staffId) || createBookingMutation.isPending) {
      setErrorMessage('Please wait for availability to be checked and select an eligible staff member.')
      return
    }

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

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Booking" size="md">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="form" id="booking-create-form">
        {!canManageBookings && (
          <p role="alert">Only active tenant administrators can create bookings.</p>
        )}
        {errorMessage && (
          <div
            role="alert"
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
            value={selectedServiceId}
          >
            <option value="">-- Select a Service --</option>
            {services?.filter((s) => s.status === 'ACTIVE').map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.durationMinutes} min — ${s.price.toFixed(2)})
              </option>
            ))}
          </select>
          {errors.serviceId && (
            <span className="form__error" role="alert">{errors.serviceId.message}</span>
          )}
          {selectedServiceId && !servicesLoading && !activeService && (
            <span className="form__error" role="alert">Please select an active service.</span>
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
            disabled={!staffReady}
            {...register('staffId')}
            value={selectedStaffId}
          >
            <option value="">
              {staffQueryEnabled && staffQuery.isFetching
                ? 'Checking available staff...'
                : staffQueryEnabled && staffQuery.isError
                ? '-- Availability check failed --'
                : !staffReady
                ? '-- Select an active service and valid date/time --'
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
          {staffQueryEnabled && staffQuery.isError && (
            <div role="alert" className="form__error">
              <span>Unable to check staff availability: {extractErrorMessage(staffQuery.error)}</span>
              <Button type="button" variant="ghost" onClick={() => void staffQuery.refetch()} disabled={staffQuery.isFetching}>
                Retry availability
              </Button>
            </div>
          )}
          {staffReady && availableStaff.length === 0 && (
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
            disabled={!canManageBookings || !staffReady || !selectedStaffEligible || !endInstantDisplay}
          >
            Confirm Booking
          </Button>
        </div>
      </form>
    </Modal>
  )
}
