import React from 'react';
import './EmptyState.css';

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  borderless?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  borderless = false,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`pkh-empty-state ${borderless ? 'pkh-empty-state--borderless' : ''} ${className}`}
      {...props}
    >
      {icon && <div className="pkh-empty-icon">{icon}</div>}
      <h4 className="pkh-empty-title">{title}</h4>
      {description && <p className="pkh-empty-description">{description}</p>}
      {action && <div className="pkh-empty-action">{action}</div>}
    </div>
  );
};
