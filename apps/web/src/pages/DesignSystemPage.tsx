import React, { useState, useEffect } from 'react';
import {
  Button,
  Input,
  Textarea,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Modal,
  ModalBody,
  ModalFooter,
  Skeleton,
  EmptyState,
} from '../components/ui';
import './DesignSystemPage.css';

export const DesignSystemPage: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoadingDemo, setIsLoadingDemo] = useState(false);
  const [testInput, setTestInput] = useState('');
  const [showErrorInput, setShowErrorInput] = useState(true);

  // Apply theme to document element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-mode', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <div className="ds-page">
      <div className="ds-container">
        {/* Top Header */}
        <header className="ds-header">
          <div className="ds-header__title-group">
            <h1>PKH Design System & Component Library</h1>
            <p>ระบบดีไซน์ โทเคน และคอมโพเนนต์พื้นฐานสำหรับ Life OS (Light & Dark Mode)</p>
          </div>
          <div className="ds-header__controls">
            <Button
              variant="outline"
              size="md"
              onClick={() => {
                window.location.href = '/';
              }}
              leftIcon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              }
            >
              กลับหน้าหลัก
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={toggleTheme}
              leftIcon={
                theme === 'light' ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" />
                    <line x1="21" y1="12" x2="23" y2="12" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                  </svg>
                )
              }
            >
              โหมด: {theme === 'light' ? 'Light' : 'Dark'}
            </Button>
          </div>
        </header>

        {/* Section 1: Color Tokens & WCAG AA Contrast */}
        <section className="ds-section">
          <h2 className="ds-section__title">1. Color Palette Tokens & WCAG AA Contrast</h2>
          <p className="ds-section__desc">
            โทนสีสว่าง อ่านง่าย สบายตา ผ่านเกณฑ์ WCAG AA Contrast Ratio สำหรับข้อความหลัก (&gt; 4.5:1)
          </p>

          <div className="ds-color-grid">
            <div className="ds-swatch">
              <div className="ds-swatch__preview" style={{ background: 'var(--pkh-primary)' }} />
              <div className="ds-swatch__info">
                <span className="ds-swatch__name">Primary (Emerald 500)</span>
                <span className="ds-swatch__wcag">WCAG AA: Contrast 4.6:1 (white text)</span>
              </div>
            </div>
            <div className="ds-swatch">
              <div className="ds-swatch__preview" style={{ background: 'var(--pkh-text-primary)' }} />
              <div className="ds-swatch__info">
                <span className="ds-swatch__name">Text Primary (Slate 900)</span>
                <span className="ds-swatch__wcag">WCAG AAA: Contrast &gt; 15:1 against surface</span>
              </div>
            </div>
            <div className="ds-swatch">
              <div className="ds-swatch__preview" style={{ background: 'var(--pkh-text-secondary)' }} />
              <div className="ds-swatch__info">
                <span className="ds-swatch__name">Text Secondary (Slate 600)</span>
                <span className="ds-swatch__wcag">WCAG AA: Contrast &gt; 5.5:1</span>
              </div>
            </div>
            <div className="ds-swatch">
              <div className="ds-swatch__preview" style={{ background: 'var(--pkh-danger)' }} />
              <div className="ds-swatch__info">
                <span className="ds-swatch__name">Danger (Red 500)</span>
                <span className="ds-swatch__wcag">Error & delete actions</span>
              </div>
            </div>
            <div className="ds-swatch">
              <div className="ds-swatch__preview" style={{ background: 'var(--pkh-warning)' }} />
              <div className="ds-swatch__info">
                <span className="ds-swatch__name">Warning (Amber 500)</span>
                <span className="ds-swatch__wcag">Alerts & cautionary notices</span>
              </div>
            </div>
            <div className="ds-swatch">
              <div className="ds-swatch__preview" style={{ background: 'var(--pkh-accent)' }} />
              <div className="ds-swatch__info">
                <span className="ds-swatch__name">Accent (Blue 500)</span>
                <span className="ds-swatch__wcag">Informative badges & links</span>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Thai Typography & Font Scales */}
        <section className="ds-section">
          <h2 className="ds-section__title">2. Self-Hosted Thai Font (Anuphan) & Spacing</h2>
          <p className="ds-section__desc">
            ฟอนต์ Anuphan โฮสต์ในตัว ไม่พึ่งพา CDN ทำงานได้ 100% บน Tailscale และออฟไลน์ พร้อมตัดคำภาษาไทย
          </p>

          <table className="ds-type-table">
            <thead>
              <tr>
                <th>Token</th>
                <th>Size / Line Height</th>
                <th>ตัวอย่างข้อความภาษาไทย (Thai Word-Break Showcase)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>--pkh-font-3xl</code></td>
                <td>30px / 40px</td>
                <td style={{ fontSize: 'var(--pkh-font-3xl)', lineHeight: 'var(--pkh-lh-3xl)', fontWeight: 700 }}>
                  ภาพรวมระบบและเป้าหมายชีวิต Life OS
                </td>
              </tr>
              <tr>
                <td><code>--pkh-font-2xl</code></td>
                <td>24px / 34px</td>
                <td style={{ fontSize: 'var(--pkh-font-2xl)', lineHeight: 'var(--pkh-lh-2xl)', fontWeight: 600 }}>
                  คลังความรู้ คลังไฟล์ และงานที่ต้องทำ
                </td>
              </tr>
              <tr>
                <td><code>--pkh-font-xl</code></td>
                <td>20px / 30px</td>
                <td style={{ fontSize: 'var(--pkh-font-xl)', lineHeight: 'var(--pkh-lh-xl)', fontWeight: 600 }}>
                  การจัดการโปรเจกต์และบันทึกโน้ตประจำวัน
                </td>
              </tr>
              <tr>
                <td><code>--pkh-font-base</code></td>
                <td>16px / 26px</td>
                <td style={{ fontSize: 'var(--pkh-font-base)', lineHeight: 'var(--pkh-lh-base)' }}>
                  ระบบจัดการข้อมูลส่วนตัวที่รองรับการตัดคำภาษาไทยอย่างสวยงาม วรรณยุกต์ไม่ชนบรรทัด
                </td>
              </tr>
              <tr>
                <td><code>--pkh-font-sm</code></td>
                <td>14px / 22px</td>
                <td style={{ fontSize: 'var(--pkh-font-sm)', lineHeight: 'var(--pkh-lh-sm)', color: 'var(--pkh-text-secondary)' }}>
                  ข้อความคำอธิบายระดับรอง พร้อมรองรับการแสดงผลตัวเลขและสัญลักษณ์
                </td>
              </tr>
              <tr>
                <td><code>--pkh-font-xs</code></td>
                <td>12px / 18px</td>
                <td style={{ fontSize: 'var(--pkh-font-xs)', lineHeight: 'var(--pkh-lh-xs)', color: 'var(--pkh-text-muted)' }}>
                  ป้ายกำกับ วันที่อัปเดตล่าสุด และข้อมูล Metadata ขนาดกะทัดรัด
                </td>
              </tr>
            </tbody>
          </table>

          {/* 8px Spacing Grid */}
          <div style={{ marginTop: 'var(--pkh-space-4)' }}>
            <h3 style={{ fontSize: 'var(--pkh-font-base)', margin: '0 0 var(--pkh-space-3) 0' }}>8px Grid Scale</h3>
            <div className="ds-spacing-grid">
              {[
                { name: 'space-1', val: 4 },
                { name: 'space-2', val: 8 },
                { name: 'space-3', val: 12 },
                { name: 'space-4', val: 16 },
                { name: 'space-6', val: 24 },
                { name: 'space-8', val: 32 },
                { name: 'space-12', val: 48 },
              ].map((s) => (
                <div key={s.name} className="ds-spacing-item">
                  <div
                    className="ds-spacing-bar"
                    style={{ width: `${s.val * 2}px`, height: `${s.val}px` }}
                  />
                  <span className="ds-spacing-label">{s.val}px</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Section 3: Buttons */}
        <section className="ds-section">
          <h2 className="ds-section__title">3. Button Components</h2>
          <p className="ds-section__desc">
            ทุกปุ่มรองรับคีย์บอร์ดนำทาง (:focus-visible), hover, active feedback, และ loading spinner
          </p>

          <div className="ds-row">
            <Button variant="primary">ปุ่มหลัก (Primary)</Button>
            <Button variant="secondary">ปุ่มรอง (Secondary)</Button>
            <Button variant="outline">ปุ่มเส้นขอบ (Outline)</Button>
            <Button variant="quiet">ปุ่มโปร่งใส (Quiet)</Button>
            <Button variant="danger">ลบข้อมูล (Danger)</Button>
            <Button variant="danger-quiet">ยกเลิก (Danger Quiet)</Button>
          </div>

          <div className="ds-row">
            <Button
              variant="primary"
              leftIcon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              }
            >
              สร้างโน้ตใหม่
            </Button>
            <Button
              variant="secondary"
              rightIcon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              }
            >
              ดูรายละเอียด
            </Button>
            <Button
              variant="primary"
              isLoading={isLoadingDemo}
              onClick={() => {
                setIsLoadingDemo(true);
                setTimeout(() => setIsLoadingDemo(false), 1500);
              }}
            >
              {isLoadingDemo ? 'กำลังบันทึก...' : 'ทดสอบปุ่มโหลด'}
            </Button>
            <Button variant="primary" disabled>
              ปุ่มถูกปิดใช้งาน (Disabled)
            </Button>
            <Button
              variant="secondary"
              iconOnly
              aria-label="การตั้งค่า"
              leftIcon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              }
            />
          </div>

          <div className="ds-row">
            <Button size="sm" variant="secondary">ขนาดเล็ก (sm)</Button>
            <Button size="md" variant="secondary">ขนาดกลาง (md)</Button>
            <Button size="lg" variant="secondary">ขนาดใหญ่ (lg)</Button>
          </div>
        </section>

        {/* Section 4: Inputs & Textarea */}
        <section className="ds-section">
          <h2 className="ds-section__title">4. Input & Textarea Components</h2>
          <p className="ds-section__desc">
            ฟิลด์กรอกข้อมูลพร้อม Label, Helper text, Validation error state และ Prefix slot
          </p>

          <div className="ds-grid-2">
            <Input
              label="หัวข้อโน้ต"
              required
              placeholder="พิมพ์หัวข้อโน้ต..."
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              helperText="ความยาวไม่เกิน 100 ตัวอักษร"
            />

            <Input
              label="ค้นหาข้อมูล"
              placeholder="ค้นหาบันทึก หรือโปรเจกต์..."
              prefixIcon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              }
              helperText="กด Enter เพื่อเริ่มค้นหา"
            />

            <Input
              label="ที่อยู่อีเมลหรือชื่อผู้ใช้"
              required
              value="user@invalid-domain"
              error={showErrorInput ? 'รูปแบบอีเมลหรือชื่อผู้ใช้ไม่ถูกต้อง' : undefined}
              onChange={() => setShowErrorInput(!showErrorInput)}
              helperText="คลิกเพื่อสลับแสดง Error state"
            />

            <Input
              label="รหัสเฉพาะ (Disabled)"
              disabled
              value="PKH-SYS-2026-X1"
              helperText="ค่านี้ถูกกำหนดโดยระบบ ไม่สามารถแก้ไขได้"
            />
          </div>

          <Textarea
            label="รายละเอียดเนื้อหาโน้ต"
            placeholder="พิมพ์เนื้อหาที่ต้องการบันทึกที่นี่..."
            rows={4}
            helperText="รองรับ Markdown formatting และตัวอักษรภาษาไทยเต็มรูปแบบ"
          />
        </section>

        {/* Section 5: Bento Box Cards */}
        <section className="ds-section">
          <h2 className="ds-section__title">5. Card Components (Bento Box Aesthetic)</h2>
          <p className="ds-section__desc">
            การ์ดแบบ Bento box มีเงาและขอบมนนุ่มนวล พร้อม Hover interaction
          </p>

          <div className="ds-bento-grid">
            <Card variant="interactive">
              <CardHeader>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="ds-badge">โน้ตทั้งหมด</span>
                  <span style={{ fontSize: '20px' }}>📝</span>
                </div>
                <CardTitle>142 รายการ</CardTitle>
                <CardDescription>อัปเดตล่าสุดเมื่อ 10 นาทีที่แล้ว</CardDescription>
              </CardHeader>
              <CardContent>
                <p style={{ margin: 0, fontSize: 'var(--pkh-font-xs)', color: 'var(--pkh-text-muted)' }}>
                  คลิกเพื่อเข้าสู่หน้าจัดการโน้ตทั้งหมดในคลัง
                </p>
              </CardContent>
            </Card>

            <Card variant="interactive">
              <CardHeader>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="ds-badge" style={{ backgroundColor: 'var(--pkh-accent-light)', color: 'var(--pkh-accent)' }}>
                    โปรเจกต์
                  </span>
                  <span style={{ fontSize: '20px' }}>🎯</span>
                </div>
                <CardTitle>8 โครงการ</CardTitle>
                <CardDescription>กำลังดำเนินการ 3 โครงการ</CardDescription>
              </CardHeader>
              <CardContent>
                <p style={{ margin: 0, fontSize: 'var(--pkh-font-xs)', color: 'var(--pkh-text-muted)' }}>
                  เป้าหมายไตรมาสที่ 4 ครบกำหนดใน 45 วัน
                </p>
              </CardContent>
            </Card>

            <Card variant="elevated">
              <CardHeader>
                <CardTitle>การ์ดพร้อมปุ่มควบคุม</CardTitle>
                <CardDescription>ตัวอย่างการ์ดแบบมีส่วนหัว เนื้อหา และส่วนท้าย</CardDescription>
              </CardHeader>
              <CardContent>
                <p style={{ margin: 0, fontSize: 'var(--pkh-font-sm)', color: 'var(--pkh-text-secondary)' }}>
                  การแบ่งสัดส่วนเนื้อหาแบบ Bento Box ช่วยให้อ่านข้อมูลสำคัญได้ในพริบตา
                </p>
              </CardContent>
              <CardFooter>
                <span className="ds-badge ds-badge--contrast">Active</span>
                <Button size="sm" variant="quiet">ดูเพิ่มเติม</Button>
              </CardFooter>
            </Card>
          </div>
        </section>

        {/* Section 6: Modal Dialog */}
        <section className="ds-section">
          <h2 className="ds-section__title">6. Modal Dialog Component</h2>
          <p className="ds-section__desc">
            หน้าต่างโมดอลที่เข้าถึงได้ด้วยคีย์บอร์ด (Esc to Close, Focus Lock, Backdrop Blur)
          </p>

          <div className="ds-row">
            <Button variant="primary" onClick={() => setIsModalOpen(true)}>
              เปิดหน้าต่างตัวอย่าง Modal
            </Button>
          </div>

          <Modal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            title="ยืนยันการตั้งค่าโปรไฟล์"
            size="md"
          >
            <ModalBody>
              <p style={{ margin: '0 0 var(--pkh-space-4) 0' }}>
                คุณต้องการบันทึกการเปลี่ยนแปลงและอัปเดตระบบดีไซน์ใหม่เข้าสู่โปรไฟล์ของคุณหรือไม่?
              </p>
              <Input
                label="ชื่อผู้ใช้สำหรับแสดงผล"
                defaultValue="Phontakon User"
                helperText="ชื่อนี้จะปรากฏบนแถบด้านบนของ Life OS"
              />
            </ModalBody>
            <ModalFooter>
              <Button variant="quiet" onClick={() => setIsModalOpen(false)}>
                ยกเลิก (Cancel)
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setIsModalOpen(false);
                }}
              >
                บันทึกข้อมูล
              </Button>
            </ModalFooter>
          </Modal>
        </section>

        {/* Section 7: Skeleton Placeholder Loading */}
        <section className="ds-section">
          <h2 className="ds-section__title">7. Skeleton Loading Placeholder</h2>
          <p className="ds-section__desc">
            แอนิเมชัน Shimmer นุ่มนวล สำหรับแสดงสถานะขณะโหลดข้อมูลการ์ดและข้อความ
          </p>

          <div className="ds-bento-grid">
            <Card>
              <CardHeader>
                <Skeleton variant="text" width="40%" height={20} />
                <Skeleton variant="text" width="70%" height={14} />
              </CardHeader>
              <CardContent>
                <Skeleton variant="text" width="100%" height={14} />
                <Skeleton variant="text" width="90%" height={14} />
                <Skeleton variant="text" width="60%" height={14} />
              </CardContent>
              <CardFooter>
                <Skeleton variant="rectangular" width={80} height={28} />
                <Skeleton variant="circular" width={28} height={28} />
              </CardFooter>
            </Card>

            <Card>
              <CardContent style={{ padding: 'var(--pkh-space-6)' }}>
                <Skeleton variant="card" height={130} />
                <div style={{ marginTop: 'var(--pkh-space-4)' }}>
                  <Skeleton variant="text" width="80%" height={16} />
                  <Skeleton variant="text" width="50%" height={12} />
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Section 8: Empty State */}
        <section className="ds-section">
          <h2 className="ds-section__title">8. EmptyState Component</h2>
          <p className="ds-section__desc">
            แสดงสถานะว่างอย่างเป็นมิตรเมื่อยังไม่มีข้อมูลโน้ต งาน หรือเอกสาร
          </p>

          <EmptyState
            icon={<span>📂</span>}
            title="ยังไม่มีบันทึกในหมวดหมู่นี้"
            description="คุณสามารถเริ่มต้นสร้างบันทึกแรก เพื่อจัดเก็บข้อมูลความรู้ เอกสาร หรือไอเดียสำคัญของคุณไว้ในที่เดียว"
            action={
              <Button
                variant="primary"
                leftIcon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                }
              >
                สร้างโน้ตใหม่ทันที
              </Button>
            }
          />
        </section>
      </div>
    </div>
  );
};
