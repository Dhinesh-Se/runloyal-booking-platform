import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { extractErrorMessage, extractFieldErrors } from '@/utils/errors'
import type { AvailabilityResponse, DayOfWeek } from '@/api/types'

const DAYS: { value: DayOfWeek; label: string }[] = [
  { value: 'MONDAY', label: 'Monday' },
  { value: 'TUESDAY', label: 'Tuesday' },
  { value: 'WEDNESDAY', label: 'Wednesday' },
  { value: 'THURSDAY', label: 'Thursday' },
  { value: 'FRIDAY', label: 'Friday' },
  { value: 'SATURDAY', label: 'Saturday' },
  { value: 'SUNDAY', label: 'Sunday' },
]

const schema = z.object({
  dayOfWeek: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']),
  startTime: z.string().min(1, 'Start time required').regex(/^\d{2}:\d{2}$/, 'Format: HH:MM'),
  endTime: z.string().min(1, 'End time required').regex(/^\d{2}:\d{2}$/, 'Format: HH:MM'),
  type: z.enum(['WORKING', 'BREAK', 'OFF']),
}).refine(
  (d) => {
    const [sh, sm] = d.startTime.split(':').map(Number)
    const [eh, em] = d.endTime.split(':').map(Number)
    return eh * 60 + em > sh * 60 + sm
  },
  { message: 'End time must be after start time', path: ['endTime'] }
)

export type AvailabilityFormValues = z.infer<typeof schema>

interface AvailabilityFormProps {
  defaultValues?: Partial<AvailabilityFormValues>
  onSubmit: (values: AvailabilityFormValues) => Promise<void>
  onCancel: () => void
  submitLabel?: string
  serverError?: unknown
}

export function AvailabilityForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel = 'Save',
  serverError,
}: AvailabilityFormProps) {
  const fieldErrors = extractFieldErrors(serverError)
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<AvailabilityFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      dayOfWeek: 'MONDAY',
      type: 'WORKING',
      startTime: '09:00',
      endTime: '17:00',
      ...defaultValues,
    },
  })

  const selectedType = watch('type')
  const handleFormSubmit = (data: AvailabilityFormValues) => {
    return onSubmit(data)
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} noValidate className="form" id="availability-form">
      <div className="form__row">
        <div className="form__field">
          <label className="form__label" htmlFor="av-day">
            Day <span aria-hidden="true" className="form__required">*</span>
          </label>
          <select id="av-day" className="form__select" {...register('dayOfWeek')}>
            {DAYS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div className="form__field">
          <label className="form__label" htmlFor="av-type">
            Type <span aria-hidden="true" className="form__required">*</span>
          </label>
          <select id="av-type" className={`form__select form__select--type-${selectedType.toLowerCase()}`} {...register('type')}>
            <option value="WORKING">Working</option>
            <option value="BREAK">Break / Unavailable</option>
            <option value="OFF">Off (Unavailable period)</option>
          </select>
        </div>
      </div>

        <div className="form__row">
          <div className="form__field">
            <label className="form__label" htmlFor="av-start">
              Start Time <span aria-hidden="true" className="form__required">*</span>
            </label>
            <input
              id="av-start"
              type="time"
              className={`form__input ${errors.startTime ? 'form__input--error' : ''}`}
              {...register('startTime')}
            />
            {errors.startTime && <span className="form__error" role="alert">{errors.startTime.message}</span>}
            {fieldErrors.startTime && <span className="form__error" role="alert">{fieldErrors.startTime}</span>}
          </div>

          <div className="form__field">
            <label className="form__label" htmlFor="av-end">
              End Time <span aria-hidden="true" className="form__required">*</span>
            </label>
            <input
              id="av-end"
              type="time"
              className={`form__input ${errors.endTime ? 'form__input--error' : ''}`}
              {...register('endTime')}
            />
            {errors.endTime && <span className="form__error" role="alert">{errors.endTime.message}</span>}
            {fieldErrors.endTime && <span className="form__error" role="alert">{fieldErrors.endTime}</span>}
          </div>
        </div>

      {selectedType === 'OFF' && (
        <p className="form__hint">
          OFF blocks only the specified local time range, not the entire day.
        </p>
      )}

      {serverError != null && <p className="form__error" role="alert">{extractErrorMessage(serverError)}</p>}

      <div className="form__actions">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" variant="primary" loading={isSubmitting}>{submitLabel}</Button>
      </div>
    </form>
  )
}

export function availabilityToFormValues(a: AvailabilityResponse): AvailabilityFormValues {
  return {
    dayOfWeek: a.dayOfWeek,
    startTime: a.startTime.substring(0, 5),
    endTime: a.endTime.substring(0, 5),
    type: a.type,
  }
}
