import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './ui/Button';

interface Props {
  children: ReactNode;
  fallbackView?: string;
  onReset?: () => void;
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

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in UI component:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  private handleReload = () => {
    window.location.reload();
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '32px 16px', maxWidth: '600px', margin: '40px auto', textAlign: 'center' }}>
          <div
            className="life-card"
            style={{
              padding: '32px 24px',
              border: '1px solid var(--pkh-border-subtle, #e2e8f0)',
              borderRadius: '16px',
              background: 'var(--pkh-bg-surface, #ffffff)',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
            }}
          >
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🛡️</div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px', color: 'var(--pkh-text-primary, #0f172a)' }}>
              เกิดข้อผิดพลาดในการแสดงผล
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: '14px', color: 'var(--pkh-text-secondary, #64748b)', lineHeight: 1.5 }}>
              ระบบได้ดักจับข้อผิดพลาดไว้เรียบร้อยแล้วเพื่อป้องกันหน้าจอค้าง คุณสามารถลองโหลดหน้านี้ใหม่หรือกลับสู่หน้าหลัก
            </p>

            {this.state.error && (
              <pre
                style={{
                  textAlign: 'left',
                  background: 'var(--pkh-bg-subtle, #f8fafc)',
                  padding: '12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: 'var(--pkh-text-danger, #ef4444)',
                  overflowX: 'auto',
                  maxHeight: '120px',
                  margin: '0 0 24px',
                  border: '1px solid var(--pkh-border-subtle, #e2e8f0)',
                }}
              >
                {this.state.error.message || 'Unknown runtime error'}
              </pre>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
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

    return this.props.children;
  }
}
