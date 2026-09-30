'use client';
import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
} from 'react';

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  const generated = useId();
  const child = Children.only(children);
  if (!isValidElement(child)) throw new Error('Field requires one form control');
  const id = generated;
  let controlIndex = 0;
  function associate(node: ReactNode): ReactNode {
    if (!isValidElement(node)) return node;
    const element = node as ReactElement<{
      children?: ReactNode;
      id?: string;
      'aria-describedby'?: string;
      'aria-invalid'?: boolean;
    }>;
    if (
      typeof element.type !== 'string' ||
      ['input', 'select', 'textarea'].includes(element.type)
    ) {
      return cloneElement(element, {
        id: controlIndex++ === 0 ? id : `${id}-${controlIndex}`,
        'aria-describedby':
          [
            element.props['aria-describedby'],
            hint ? `${id}-hint` : null,
            error ? `${id}-error` : null,
          ]
            .filter(Boolean)
            .join(' ') || undefined,
        'aria-invalid': !!error,
      });
    }
    return ['div', 'span'].includes(element.type as string) && element.props.children
      ? cloneElement(element, {}, Children.map(element.props.children, associate))
      : element;
  }
  const associated = associate(child);
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {associated}
      {hint && (
        <span id={`${id}-hint`} className="field-hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
