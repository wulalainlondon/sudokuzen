import { useState, useCallback, useEffect, type ReactElement } from 'react';
import { useSettingsStore } from './settingsStore';
import { ZenOverlay } from '../motion/ZenOverlay';
import { getAudioSettings, saveAudioSettings, type AudioSettings } from '../../game/audioSettings';
import { getDocumentTheme, setDocumentTheme } from '../../game/coreUiBridge';
import { SK } from '../../storage/keys';

function VolumeSlider({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
}): ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        style={{
          flex: 1,
          accentColor: 'var(--accent, #4a90e2)',
          opacity: disabled ? 0.35 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      />
      <span
        style={{
          minWidth: 36,
          textAlign: 'right',
          fontSize: '0.85rem',
          color: disabled ? 'var(--text-light)' : 'var(--text-color)',
        }}
      >
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}

function ToggleButton({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}): ReactElement {
  return (
    <button
      onClick={onToggle}
      style={{
        width: 52,
        height: 28,
        borderRadius: 14,
        border: 'none',
        cursor: 'pointer',
        background: enabled ? 'var(--accent, #4a90e2)' : 'var(--cell-border, #ccc)',
        position: 'relative',
        flexShrink: 0,
        transition: 'background 0.2s',
      }}
      aria-label={enabled ? '關閉' : '開啟'}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: enabled ? 27 : 3,
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }}
      />
    </button>
  );
}

function SettingsRow({
  label,
  enabled,
  volume,
  onToggle,
  onVolume,
}: {
  label: string;
  enabled: boolean;
  volume: number;
  onToggle: () => void;
  onVolume: (v: number) => void;
}): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '14px 0',
        borderBottom: '1px solid var(--cell-border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600, fontSize: '1rem' }}>{label}</span>
        <ToggleButton enabled={enabled} onToggle={onToggle} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-light)', minWidth: 28 }}>音量</span>
        <VolumeSlider value={volume} disabled={!enabled} onChange={onVolume} />
      </div>
    </div>
  );
}

export function SettingsModal(): ReactElement {
  const { visible, close } = useSettingsStore();
  const [settings, setSettings] = useState<AudioSettings>(() => getAudioSettings());
  const [isDark, setIsDark] = useState(() => getDocumentTheme() === 'dark');

  const apply = useCallback((patch: Partial<AudioSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveAudioSettings(patch);

    // Live BGM updates
    if (patch.bgmVolume !== undefined || patch.bgmEnabled !== undefined) {
      void import('../../game/bgm').then(({ applyBgmVolume, applyBgmEnabled }) => {
        if (patch.bgmEnabled !== undefined) applyBgmEnabled(next.bgmEnabled);
        if (patch.bgmVolume !== undefined) applyBgmVolume(next.bgmVolume);
      });
    }
  }, [settings]);

  const toggleTheme = useCallback(() => {
    const next = isDark ? 'light' : 'dark';
    setIsDark(!isDark);
    setDocumentTheme(next);
    localStorage.setItem(SK.THEME, next);
  }, [isDark]);

  // Sync state when modal opens
  useEffect(() => {
    if (!visible) return;
    setSettings(getAudioSettings());
    setIsDark(getDocumentTheme() === 'dark');
  }, [visible]);

  return (
    <ZenOverlay
      visible={visible}
      onClose={close}
      id="settings-modal"
      backdropCloseDelayMs={120}
    >
      <div
        className="stats-panel"
        style={{ maxWidth: 340, width: '90vw' }}
      >
        <h2 style={{ marginBottom: 4 }}>設定</h2>

        {/* 主題 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 0',
          borderBottom: '1px solid var(--cell-border)',
        }}>
          <span style={{ fontWeight: 600, fontSize: '1rem' }}>
            {isDark ? '🌙 暗色模式' : '☀️ 亮色模式'}
          </span>
          <ToggleButton enabled={isDark} onToggle={toggleTheme} />
        </div>

        <SettingsRow
          label="🔔 音效"
          enabled={settings.sfxEnabled}
          volume={settings.sfxVolume}
          onToggle={() => apply({ sfxEnabled: !settings.sfxEnabled })}
          onVolume={(v) => apply({ sfxVolume: v })}
        />

        <SettingsRow
          label="🎵 背景音樂"
          enabled={settings.bgmEnabled}
          volume={settings.bgmVolume}
          onToggle={() => apply({ bgmEnabled: !settings.bgmEnabled })}
          onVolume={(v) => apply({ bgmVolume: v })}
        />

        <button
          className="resume-btn"
          onClick={close}
          style={{ marginTop: 20 }}
        >
          關閉
        </button>
      </div>
    </ZenOverlay>
  );
}
