import { z } from 'zod'
import { useForm } from './lib'

export * from './lib'
export type { UseForm, Field, FieldArray, Form } from './types'

const address = z.object({
  street: z.string(),
  city: z.string(),
  state: z.string(),
  zip: z.string(),
})

const bigForm = z.object({
  name: z.string(),
})

const { form } = useForm(
  bigForm,
  {},
  {
    address,
  },
)

form.register('address.street')
