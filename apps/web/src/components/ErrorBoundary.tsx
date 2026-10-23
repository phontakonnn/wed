import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './ui/Button';
import { logger } from '../lib/logger';

interface Props {
  children: ReactNode;
  /** Kept for backwards compatibility with the existing route-level boundary. */
  fallbackView?: string;
  onReset?: () => void;
  /** Feature boundaries keep the shell usable; route boundaries may be full-page. */
  scope?: 'route' | 'feature';
  title?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logger.error('React render failed', error, this.props.scope ?? 'route', {
      componentStack: errorInfo.componentStack ?? undefined,
    });
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  public override render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="error-boundary" role="alert" aria-live="assertive">
        <div className="life-card error-boundary-card">
          <div className="error-boundary-icon" aria-hidden="true">🛡️</div>
          <h2>{this.props.title ?? 'เกิดข้อผิดพลาดในการแสดงผล'}</h2>
          <p>
            ระบบดักจับข้อผิดพลาดไว้แล้วเพื่อไม่ให้หน้าจอค้าง ข้อมูลของคุณยังปลอดภัยดี
            ลองโหลดส่วนนี้อีกครั้งหรือกลับสู่หน้าหลัก
          </p>

          {this.state.error && (
            <pre className="error-boundary-detail">{this.state.error.message || 'Unknown runtime error'}</pre>
          )}

          <div className="error-boundary-actions">
            <Button variant="primary" onClick={this.handleReset}>
              🔄 ลองใหม่อีกครั้ง
            </Button>
            <Button variant="secondary" onClick={this.handleReload}>
              🌐 รีเฟรชทั้งหน้าเว็บ
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
