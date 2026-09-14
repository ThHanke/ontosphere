/**
 * Minimal stubs for form components.
 * This file exists to satisfy the import in form.tsx.
 * Install react-hook-form and replace with real implementation if forms are needed.
 *
 * Only React components are exported here. The contexts and the useFormField hook
 * live in ./formContext so react-refresh can preserve state for this module.
 */
import * as React from "react"

import { FormFieldContext } from "./formContext"

// Stub Form — wraps children; real impl would use react-hook-form's FormProvider
export function Form({ children, ...props }: React.PropsWithChildren<Record<string, any>>) {
  return <form {...props}>{children}</form>
}

// Stub FormField — renders nothing meaningful without react-hook-form
export function FormField({ name, render }: { name: string; render: (arg: any) => React.ReactNode }) {
  return (
    <FormFieldContext.Provider value={{ name }}>
      {render({ field: {}, fieldState: {}, formState: {} })}
    </FormFieldContext.Provider>
  )
}
