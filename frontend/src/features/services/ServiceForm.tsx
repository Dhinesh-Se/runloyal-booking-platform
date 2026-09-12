import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import type { ServiceResponse } from '@/api/types'
import { extractFieldErrors } from '@/utils/errors'

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(120),
  description: z.string().max(1000).optional(),
  category: z.string().min(1, 'Category is required').max(80),
  durationMinutes: z.coerce.number().int().positive('Duration must be a positive number'),
  price: z.coerce.number().min(0, 'Price must be non-negative'),
  status: z.enum(['ACTIVE', 'INACTIVE']),
})

export type ServiceFormValues = z.infer<typeof schema>

interface ServiceFormProps {
  defaultValues?: Partial<ServiceFormValues>
  onSubmit: (values: ServiceFormValues) => Promise<void>
  onCancel: () => void
  submitLabel?: string
  serverError?: unknown
}

export function ServiceForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel = 'Save',
  serverError,
}: ServiceFormProps) {
  const fieldErrors = extractFieldErrors(serverError)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ServiceFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      status: 'ACTIVE',
      ...defaultValues,
    },
  })

  const handleFormSubmit = (data: ServiceFormValues) => {
    return onSubmit(data)
  }

  return (
    <form
      onSubmit={handleSubmit(handleFormSubmit)}
      noValidate
      className="form"
      id="service-form"
    >
      <div className="form__field">
        <label className="form__label" htmlFor="svc-name">
          Name <span aria-hidden="true" className="form__required">*</span>
        </label>
        <input
          id="svc-name"
          className={`form__input ${errors.name ? 'form__input--error' : ''}`}
          placeholder="e.g. Grooming — Full Groom"
          {...register('name')}
        />
        {errors.name && <span className="form__error" role="alert">{errors.name.message}</span>}
        {fieldErrors.name && <span className="form__error" role="alert">{fieldErrors.name}</span>}
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="svc-description">Description</label>
        <textarea
          id="svc-description"
          className="form__input form__textarea"
          rows={3}
          placeholder="Optional description…"
          {...register('description')}
        />
        {errors.description && <span className="form__error" role="alert">{errors.description.message}</span>}
      </div>

      <div className="form__row">
        <div className="form__field">
          <label className="form__label" htmlFor="svc-category">
            Category <span aria-hidden="true" className="form__required">*</span>
          </label>
          <input
            id="svc-category"
            className={`form__input ${errors.category ? 'form__input--error' : ''}`}
            placeholder="e.g. Grooming"
            {...register('category')}
          />
          {errors.category && <span className="form__error" role="alert">{errors.category.message}</span>}
        </div>

        <div className="form__field">
          <label className="form__label" htmlFor="svc-status">Status</label>
          <select id="svc-status" className="form__select" {...register('status')}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
      </div>

      <div className="form__row">
        <div className="form__field">
          <label className="form__label" htmlFor="svc-duration">
            Duration (minutes) <span aria-hidden="true" className="form__required">*</span>
          </label>
          <input
            id="svc-duration"
            type="number"
            min={1}
            className={`form__input ${errors.durationMinutes ? 'form__input--error' : ''}`}
            placeholder="60"
            {...register('durationMinutes')}
          />
          {errors.durationMinutes && <span className="form__error" role="alert">{errors.durationMinutes.message}</span>}
        </div>

        <div className="form__field">
          <label className="form__label" htmlFor="svc-price">
            Price ($) <span aria-hidden="true" className="form__required">*</span>
          </label>
          <input
            id="svc-price"
            type="number"
            min={0}
            step={0.01}
            className={`form__input ${errors.price ? 'form__input--error' : ''}`}
            placeholder="0.00"
            {...register('price')}
          />
          {errors.price && <span className="form__error" role="alert">{errors.price.message}</span>}
        </div>
      </div>

      <div className="form__actions">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}

export function serviceResponseToFormValues(s: ServiceResponse): ServiceFormValues {
  return {
    name: s.name,
    description: s.description ?? '',
    category: s.category,
    durationMinutes: s.durationMinutes,
    price: Number(s.price),
    status: s.status,
  }
}
