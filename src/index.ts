export * from './lib'
export type { UseForm, Field, FieldArray, Form } from './types'

// const address = z.object({
//   street: z.string(),
//   city: z.string(),
//   state: z.string(),
//   stuff: z.object({
//     thing: z.string(),
//   }),

// })

// const zodType = z.object({
//   name: z.string(),
//   address,
// })

// const { form } = useForm(zodType)

// const addressForm = form.register('address.stuff')
// addressForm.register('thing')

// const test = {} as unknown as Field<z.infer<typeof address>, {}, typeof address, undefined>
// test.register('stuff.thing')
