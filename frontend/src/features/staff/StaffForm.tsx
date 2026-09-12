import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { extractFieldErrors } from '@/utils/errors'

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(120),
  status: z.enum(['ACTIVE', 'INACTIVE']),
})

export type StaffFormValues = z.infer<typeof schema>

interface StaffFormProps {
  defaultValues?: Partial<StaffFormValues>
  onSubmit: (values: StaffFormValues) => Promise<void>
  onCancel: () => void
  submitLabel?: string
  serverError?: unknown
}

export function StaffForm({ defaultValues, onSubmit, onCancel, submitLabel = 'Save', serverError }: StaffFormProps) {
  const fieldErrors = extractFieldErrors(serverError)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<StaffFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { status: 'ACTIVE', ...defaultValues },
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="form" id="staff-form">
      <div className="form__field">
        <label className="form__label" htmlFor="staff-name">
          Full Name <span aria-hidden="true" className="form__required">*</span>
        </label>
        <input
          id="staff-name"
          className={`form__input ${errors.name ? 'form__input--error' : ''}`}
          placeholder="e.g. Jane Smith"
          {...register('name')}
        />
        {errors.name && <span className="form__error" role="alert">{errors.name.message}</span>}
        {fieldErrors.name && <span className="form__error" role="alert">{fieldErrors.name}</span>}
      </div>

      <div className="form__field">
        <label className="form__label" htmlFor="staff-status">Status</label>
        <select id="staff-status" className="form__select" {...register('status')}>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
      </div>

      <div className="form__actions">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" variant="primary" loading={isSubmitting}>{submitLabel}</Button>
      </div>
    </form>
  )
}
