import React, { useId } from 'react';
import './Input.css';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  error?: string;
  prefixIcon?: React.ReactNode;
  suffixIcon?: React.ReactNode;
  required?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      helperText,
      error,
      prefixIcon,
      suffixIcon,
      required,
      id,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;

    const inputClasses = [
      'pkh-input',
      error ? 'pkh-input--error' : '',
      prefixIcon ? 'pkh-input--with-prefix' : '',
      suffixIcon ? 'pkh-input--with-suffix' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className="pkh-form-field">
        {label && (
          <label htmlFor={inputId} className="pkh-form-label">
            {label}
            {required && <span className="pkh-form-label__required">*</span>}
          </label>
        )}
        <div className="pkh-input-wrapper">
          {prefixIcon && (
            <span className="pkh-input__slot pkh-input__slot--prefix" aria-hidden="true">
              {prefixIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : helperText ? helperId : undefined}
            className={inputClasses}
            {...props}
          />
          {suffixIcon && (
            <span className="pkh-input__slot pkh-input__slot--suffix" aria-hidden="true">
              {suffixIcon}
            </span>
          )}
        </div>
        {error ? (
          <span id={errorId} className="pkh-form-error" role="alert">
            {error}
          </span>
        ) : helperText ? (
          <span id={helperId} className="pkh-form-helper">
            {helperText}
          </span>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  error?: string;
  required?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      helperText,
      error,
      required,
      id,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const textareaId = id || generatedId;
    const errorId = `${textareaId}-error`;
    const helperId = `${textareaId}-helper`;

    const textareaClasses = [
      'pkh-textarea',
      error ? 'pkh-textarea--error' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className="pkh-form-field">
        {label && (
          <label htmlFor={textareaId} className="pkh-form-label">
            {label}
            {required && <span className="pkh-form-label__required">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
          className={textareaClasses}
          {...props}
        />
        {error ? (
          <span id={errorId} className="pkh-form-error" role="alert">
            {error}
          </span>
        ) : helperText ? (
          <span id={helperId} className="pkh-form-helper">
            {helperText}
          </span>
        ) : null}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
