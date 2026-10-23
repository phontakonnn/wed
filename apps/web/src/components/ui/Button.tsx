import React from 'react';
import './Button.css';

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'outline' | 'danger' | 'danger-quiet';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  iconOnly?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      iconOnly = false,
      children,
      className = '',
      disabled,
      ...props
    },
    ref
  ) => {
    const classNames = [
      'pkh-button',
      `pkh-button--${variant}`,
      `pkh-button--${size}`,
      iconOnly ? 'pkh-button--icon-only' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        className={classNames}
        {...props}
      >
        {isLoading ? (
          <span className="pkh-button__spinner" aria-hidden="true" />
        ) : (
          leftIcon && <span className="pkh-button__icon pkh-button__icon--left">{leftIcon}</span>
        )}
        {children && <span className="pkh-button__label">{children}</span>}
        {!isLoading && rightIcon && (
          <span className="pkh-button__icon pkh-button__icon--right">{rightIcon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
