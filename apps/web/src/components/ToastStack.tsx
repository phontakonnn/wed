import React from 'react';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: number;
  kind: 'success' | 'error' | 'info';
  message: string;
  action?: ToastAction;
}

interface ToastStackProps {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}

export const ToastStack: React.FC<ToastStackProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="toast-stack" role="region" aria-label="การแจ้งเตือน">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast-${toast.kind}`}
          role={toast.kind === 'error' ? 'alert' : 'status'}
        >
          <span className="toast-message">{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              className="toast-action-btn"
              onClick={() => {
                toast.action?.onClick();
                onDismiss(toast.id);
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button
            className="icon-button toast-close"
            type="button"
            aria-label="ปิดการแจ้งเตือน"
            onClick={() => onDismiss(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};
