import React, { useState, useEffect } from 'react';

interface WebsiteLogoProps {
  url?: string;
  size?: number;
  title?: string;
  fallbackIcon?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function extractHostname(urlStr?: string): string {
  if (!urlStr || typeof urlStr !== 'string') return '';
  const trimmed = urlStr.trim();
  if (!trimmed) return '';
  try {
    const withProto = trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : `https://${trimmed}`;
    const parsed = new URL(withProto);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export const WebsiteLogo: React.FC<WebsiteLogoProps> = ({
  url,
  size = 36,
  title,
  fallbackIcon,
  className = '',
  style = {},
}) => {
  const [loadFailed, setLoadFailed] = useState(false);
  const hostname = extractHostname(url);

  // Reset failed state if URL changes
  useEffect(() => {
    setLoadFailed(false);
  }, [url]);

  const domainInitial = hostname ? hostname.charAt(0).toUpperCase() : '?';
  const logoUrl = hostname
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=128`
    : '';

  const containerStyle: React.CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    minWidth: `${size}px`,
    minHeight: `${size}px`,
    borderRadius: size >= 32 ? '10px' : '6px',
    backgroundColor: 'var(--pkh-bg-subtle, #f1f5f9)',
    border: '1px solid var(--pkh-border-subtle, #e2e8f0)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    userSelect: 'none',
    ...style,
  };

  if (!hostname || loadFailed || !logoUrl) {
    return (
      <div
        className={`website-logo-fallback ${className}`}
        style={{
          ...containerStyle,
          background: 'linear-gradient(135deg, rgba(37,99,235,0.1), rgba(147,51,234,0.1))',
          color: 'var(--pkh-primary, #2563eb)',
          fontWeight: 700,
          fontSize: `${Math.max(12, Math.floor(size * 0.45))}px`,
          letterSpacing: '-0.5px',
        }}
        title={title || hostname || 'เว็บไซต์'}
      >
        {fallbackIcon || domainInitial}
      </div>
    );
  }

  return (
    <div
      className={`website-logo-container ${className}`}
      style={containerStyle}
      title={title || hostname}
    >
      <img
        src={logoUrl}
        alt={title || hostname}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setLoadFailed(true)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          padding: size >= 36 ? '4px' : '2px',
          boxSizing: 'border-box',
          display: 'block',
        }}
      />
    </div>
  );
};
