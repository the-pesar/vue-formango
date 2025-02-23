import { z } from 'zod'

import type { ComputedRef } from 'vue'
import {
  computed,
  getCurrentInstance,
  reactive,
  readonly,
  ref,
  watch,
} from 'vue'

import {
  generateId,
  get,
  set,
  unset,
} from '../utils'

import type {
  DeepPartial,
  Field,
  FieldArray,
  Path,
  Register,
  RegisterArray,
  Unregister,
  UseForm,
} from '../types'
import { registerFieldWithDevTools, registerFormWithDevTools, unregisterFieldWithDevTools } from '../devtools/devtools'

export default <T extends z.ZodType>(schema: T, initialData?: Partial<z.infer<T>>): UseForm<T> => {
  const form = reactive<DeepPartial<z.infer<T>>>({} as any)
  const errors = ref<z.ZodFormattedError<T>>({} as any)
  const _id = generateId()

  const isSubmitting = ref(false)
  const hasAttemptedToSubmit = ref(false)

  const initialState = ref<any>(initialData ? JSON.parse(JSON.stringify(initialData)) : null)

  if (initialData != null)
    Object.assign(form, JSON.parse(JSON.stringify(initialData)))

  let onSubmitCb: UseForm<any>['onSubmitForm'] | null = null

  const isValid = computed(() => {
    return Object.keys(errors.value).length === 0
  })

  const paths = reactive(new Map<string, string>())
  const trackedDepencies = reactive(new Map<string, ComputedRef<any>>())
  const registeredFields = reactive(new Map<string, Field<any, any>>())
  const registeredFieldArrays = reactive(new Map<string, FieldArray<any>>())

  const isDirty = computed(() => {
    return [...registeredFields.values()].some(field => field.isDirty)
      || [...registeredFieldArrays.values()].some(field => field.isDirty)
  })

  const getPathId = (
    path: string,
  ): string | null => [...paths.entries()].find(([, p]) => p === path)?.[0] ?? null

  // * form.register('array.0')
  // * form.register('array.1')
  // ! form.unregister('array.0') --> array.1 is now array.0
  // * form.register('array.1') --> should work since array.1 -> array.0
  const updatePaths = (path: string): void => {
    const isArray = !Number.isNaN(path.split('.').pop())

    if (isArray) {
      const index = parseInt(path.split('.').pop() ?? '0', 10)
      const parentPath = path.split('.').slice(0, -1).join('.')

      // Find all paths that start with the parent path
      const matchingPaths = [...paths.entries()].filter(([, p]) => p.startsWith(parentPath))

      for (const [id, p] of matchingPaths) {
        // Only update paths that have a number after the parent path
        if (!p.startsWith(`${parentPath}.`))
          continue

        // Only keep the number part of the path, in case there are other characters after it
        const i = parseInt(p.replace(`${parentPath}.`, ''), 10)

        if (i > index) {
          const newPath = `${parentPath}.${i - 1}`
          const suffixPath = p.slice(newPath.length)

          paths.set(id, `${newPath}${suffixPath}`)
        }
        else if (i === index) {
          paths.delete(id)
        }
      }
    }
    else {
      const id = getPathId(path)!

      paths.delete(id)
    }
  }

  const createField = <T, K = T | null>(id: string, defaultValue: K = null as K): Field<any, any> => {
    const path = paths.get(id) as string
    const value = get(form, path)

    if (value == null)
      set(form, path, defaultValue)

    const field = reactive<Field<any, any>>({
      '_id': id,
      '_path': path,
      'isValid': false,
      'isDirty': false,
      'isTouched': false,
      'isChanged': false,
      'modelValue': value,
      'onUpdate:modelValue': (newValue: unknown) => {
        // If the value is an empty string, set it to null to make sure the field is not dirty
        const valueOrNull = newValue === '' ? null : newValue
        const currentPath = paths.get(id) ?? null

        if (currentPath === null)
          return

        set(form, currentPath, valueOrNull)
      },
      'errors': undefined,
      'onBlur': () => {
        field.isTouched = true
      },
      'onChange': () => {
        field.isChanged = true
      },
      'setValue': (value: unknown) => {
        field['onUpdate:modelValue'](value)
      },
    })

    return field
  }

  const createFieldArray = <T>(id: string): FieldArray<any> => {
    const path = paths.get(id) as string
    const value = get(form, path)

    if (value == null)
      set(form, path, [])

    const fields = reactive<string[]>([])

    for (let i = 0; i < value?.length ?? 0; i++) {
      const fieldId = generateId()
      fields.push(fieldId)
    }

    const insert = (index: number, value: unknown): void => {
      fields[index] = generateId()
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      register(`${path}.${index}` as Path<T>, value as any)
    }

    const remove = (index: number): void => {
      const currentPath = paths.get(id) as string

      fields.splice(index, 1)
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      unregister(`${currentPath}.${index}` as Path<T>)
    }

    const prepend = (value: unknown): void => {
      insert(0, value)
    }

    const append = (value: unknown): void => {
      insert(fields.length, value)
    }

    const pop = (): void => {
      remove(fields.length - 1)
    }

    const shift = (): void => {
      remove(0)
    }

    const move = (from: number, to: number): void => {
      [fields[from], fields[to]] = [fields[to], fields[from]]

      const currentPath = paths.get(id) as string

      const currentValue = get(form, currentPath)
      const value = currentValue[from]

      currentValue[from] = currentValue[to]
      currentValue[to] = value

      set(form, currentPath, currentValue)

      const fromPath = `${currentPath}.${from}`
      const toPath = `${currentPath}.${to}`

      const fromId = getPathId(fromPath)!
      const toId = getPathId(toPath)!

      for (const [id, p] of paths.entries()) {
        if (p.startsWith(fromPath)) {
          const newPath = p.replace(fromPath, toPath)
          paths.set(id, newPath)
        }
        else if (p.startsWith(toPath)) {
          const newPath = p.replace(toPath, fromPath)
          paths.set(id, newPath)
        }
      }

      paths.set(fromId, toPath)
      paths.set(toId, fromPath)
    }

    const empty = (): void => {
      for (let i = fields.length - 1; i >= 0; i--)
        remove(i)
    }

    const setValue = (value: unknown): void => {
      empty()

      for (const arrayValue of value as unknown[])
        append(arrayValue)
    }

    const fieldArray = reactive<FieldArray<any>>({
      _id: id,
      _path: path,
      isValid: false,
      isDirty: false,
      modelValue: value,
      errors: undefined,
      append,
      fields,
      insert,
      pop,
      prepend,
      remove,
      shift,
      move,
      empty,
      setValue,
    })

    return fieldArray
  }

  const trackFieldDepencies = (field: Field<any, any> | FieldArray<any>, initialValue: any): void => {
    field._path = computed<string | null>(() => paths.get(field._id) ?? null) as any

    const value = computed(() => {
      if (field._path == null)
        return null

      return get(form, field._path)
    })

    field.modelValue = value

    field.isValid = computed<boolean>(() => {
      if (field._path == null)
        return false

      return get(errors.value, field._path) == null
    }) as any

    field.errors = computed<z.ZodFormattedError<T> | undefined>(() => {
      if (field._path == null)
        return undefined

      return get(errors.value, field._path)
    }) as any

    const parsedStringifiedInitialValue = JSON.parse(JSON.stringify(initialValue))

    field.isDirty = computed<boolean>(() => {
      if (field._path == null)
        return false

      const initialFieldValue = get(initialState.value, field._path!) ?? parsedStringifiedInitialValue

      if (field.modelValue === '' && initialFieldValue === null)
        return false

      return JSON.stringify(value.value) !== JSON.stringify(initialFieldValue)
    }) as any

    trackedDepencies.set(field._id, value)
  }

  const register: Register<T> = (path, value) => {
    const existingId = getPathId(path)

    if (existingId != null) {
      const field = registeredFields.get(existingId)

      if (field == null)
        throw new Error(`Path ${path} is already registered as a field array`)

      const isTracked = trackedDepencies.get(existingId)?.effect.active ?? false

      if (!isTracked)
        trackFieldDepencies(field, value ?? null)

      return field
    }

    const id = generateId()
    paths.set(id, path)

    const field = createField(id, value)
    trackFieldDepencies(field, value ?? null)

    registeredFields.set(id, field)

    // If registered path is child of an array, we also need to register the array index
    // So e.g. if we register `array.0.foo`, we also need to register `array.0`
    // It should work for nested arrays. So e.g. `array.0.test.0.foo` should also register `array.0.test.0`
    const pathParts = path.split('.')

    for (let i = pathParts.length - 1; i >= 0; i--) {
      const part = pathParts[i]

      if (!isNaN(Number(part))) {
        const arrayPath = pathParts.slice(0, i + 1).join('.')

        register(arrayPath as Path<T>)
      }
    }

    if (process.env.NODE_ENV === 'development')
      registerFieldWithDevTools(_id, field)

    return field
  }

  const registerArray: RegisterArray<T> = (path) => {
    const existingId = getPathId(path)

    if (existingId != null) {
      const fieldArray = registeredFieldArrays.get(existingId)

      if (fieldArray == null)
        throw new Error(`Path ${path} is already registered as a field`)

      const isTracked = trackedDepencies.get(existingId)?.effect.active ?? false

      if (!isTracked)
        trackFieldDepencies(fieldArray, [])

      return fieldArray
    }

    const id = generateId()
    paths.set(id, path)

    const fieldArray = createFieldArray(id)
    trackFieldDepencies(fieldArray, [])

    registeredFieldArrays.set(id, fieldArray)

    return fieldArray
  }

  const unregister: Unregister<T> = (path) => {
    const id = getPathId(path)

    if (id == null)
      return

    updatePaths(path)
    unset(form, path)

    if (process.env.NODE_ENV === 'development')
      unregisterFieldWithDevTools(registeredFields.get(id)!)

    registeredFields.delete(id)
    trackedDepencies.delete(id)
    paths.delete(id)
  }

  const setValues = (values: DeepPartial<z.infer<T>>): void => {
    for (const path in values)
      set(form, path, values[path])
  }

  const addErrors = (err: DeepPartial<z.ZodFormattedError<z.infer<T>>>): void => {
    const mergeErrors = (
      existingErrors: DeepPartial<z.ZodFormattedError<z.infer<T>>>,
      err: DeepPartial<z.ZodFormattedError<z.infer<T>>>,
    ): void => {
      for (const key in err) {
        if (key === '_errors') {
          existingErrors[key] = err[key]
        }
        else {
          if (existingErrors[key] == null) {
            existingErrors[key] = {
              _errors: [],
            } as any
          }

          mergeErrors(existingErrors[key] as any, err[key] as any)
        }
      }
    }

    mergeErrors(errors.value, err)
  }

  const blurAll = (): void => {
    for (const field of registeredFields.values())
      field.onBlur()
  }

  const submit = async (): Promise<void> => {
    hasAttemptedToSubmit.value = true

    blurAll()

    if (!isValid.value)
      return

    isSubmitting.value = true

    if (onSubmitCb == null)
      throw new Error('Attempted to submit form but `onSubmitForm` callback is not registered')

    const customErrors = await onSubmitCb?.(schema.parse(form))

    if (errors.value != null)
      Object.assign(errors.value, customErrors)

    isSubmitting.value = false
    initialState.value = JSON.parse(JSON.stringify(form))
  }

  const onSubmitForm = (cb: (
    data: z.infer<T>,
  ) => void,
  ): void => {
    onSubmitCb = cb
  }

  watch(form, async () => {
    try {
      await schema.parseAsync(form)

      errors.value = {}
    }
    catch (e) {
      if (e instanceof z.ZodError)
        errors.value = e.format()
    }
  }, {
    deep: true,
    immediate: true,
  })

  const returnObject = reactive<any>({
    _id,
    state: readonly(form),
    errors,
    isDirty,
    isSubmitting,
    hasAttemptedToSubmit,
    isValid,
    register,
    registerArray,
    submit,
    unregister,
    setValues,
    addErrors,
  })

  if (process.env.NODE_ENV === 'development')
    registerFormWithDevTools(returnObject, getCurrentInstance()?.type.__name)

  return {
    onSubmitForm,
    form: returnObject,
  }
}
