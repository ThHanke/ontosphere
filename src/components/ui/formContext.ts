/**
 * Form context objects and the useFormField hook.
 *
 * Kept out of formHelpers.tsx so that file exports only React components:
 * react-refresh/only-export-components warns when a module mixes component and
 * non-component exports, because fast refresh cannot preserve state for it.
 *
 * Minimal stubs, matching the rest of the form scaffolding. Install
 * react-hook-form and replace with a real implementation if forms are needed.
 */
import * as React from "react"

export type FormFieldContextValue = {
  name: string
}

export type FormItemContextValue = {
  id: string
}

export const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue
)

export const FormItemContext = React.createContext<FormItemContextValue>(
  {} as FormItemContextValue
)

export function useFormField() {
  const fieldContext = React.useContext(FormFieldContext)
  const itemContext = React.useContext(FormItemContext)
  const id = itemContext.id

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    error: undefined as any,
  }
}
