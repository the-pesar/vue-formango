import type { z } from 'zod'
import { computed, reactive } from 'vue'
import type { Form, Register, RegisterArray, Unregister } from '../types'

export const createSubform = <T extends z.ZodType, TParent extends z.ZodType >(key: string, parent: Form<TParent, any>) => {
  const register: Register<T> = (field) => {
    return parent.register(`${key}.${field}` as any)
  }

  const unregister: Unregister<T> = (field) => {
    return parent.unregister(`${key}.${field}` as any)
  }

  const registerArray: RegisterArray<T> = (field) => {
    return parent.registerArray(`${key}.${field}` as any)
  }

  const errors = computed(() => ((parent.errors as any)[key]) || {})

  const isValid = computed(() => {
    return Object.keys(errors.value).length === 0
  })

  const returnObject = reactive({
    register,
    unregister,
    registerArray,
    errors,
    isValid,
  })

  return returnObject
}
