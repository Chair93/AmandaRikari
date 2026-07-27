import { IconChevronLeft, IconChevronRight } from '../icons';

export type PeriodMode = 'month' | 'year';

interface Props {
  mode: PeriodMode;
  onModeChange: (m: PeriodMode) => void;
  monthOffset: number;
  onMonthOffsetChange: (n: number) => void;
  yearOffset: number;
  onYearOffsetChange: (n: number) => void;
  monthLabel: string;
  yearLabel: string;
}

export default function PeriodNav({ mode, onModeChange, monthOffset, onMonthOffsetChange, yearOffset, onYearOffsetChange, monthLabel, yearLabel }: Props) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 3, background: 'var(--surface-2)', borderRadius: 999, padding: 3 }}>
        <button className={'pill sm' + (mode === 'month' ? '' : '')} style={{ background: mode === 'month' ? 'white' : 'transparent', color: mode === 'month' ? 'var(--text)' : 'var(--idle-color)' }} onClick={() => onModeChange('month')}>
          Mês
        </button>
        <button style={{ all: 'unset', cursor: 'pointer', padding: '6px 13px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: mode === 'year' ? 'white' : 'transparent', color: mode === 'year' ? 'var(--text)' : 'var(--idle-color)' }} onClick={() => onModeChange('year')}>
          Ano
        </button>
      </div>
      {mode === 'month' ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 8px' }}>
          <button className="icon-btn" onClick={() => onMonthOffsetChange(monthOffset - 1)}>
            <IconChevronLeft />
          </button>
          <span style={{ fontSize: 13, fontWeight: 600, minWidth: 110, textAlign: 'center', textTransform: 'capitalize' }}>{monthLabel}</span>
          <button className="icon-btn" onClick={() => onMonthOffsetChange(monthOffset + 1)}>
            <IconChevronRight />
          </button>
          {monthOffset !== 0 && (
            <button className="pill accent sm" onClick={() => onMonthOffsetChange(0)}>
              Hoje
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 8px' }}>
          <button className="icon-btn" onClick={() => onYearOffsetChange(yearOffset - 1)}>
            <IconChevronLeft />
          </button>
          <span style={{ fontSize: 13, fontWeight: 600, minWidth: 50, textAlign: 'center' }}>{yearLabel}</span>
          <button className="icon-btn" onClick={() => onYearOffsetChange(yearOffset + 1)}>
            <IconChevronRight />
          </button>
        </div>
      )}
    </div>
  );
}
