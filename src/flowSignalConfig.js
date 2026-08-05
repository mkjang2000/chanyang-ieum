export const FLOW_SIGNAL_ICON_OPTIONS = [
  { id: 'circle-stop', label: '정지' },
  { id: 'rotate-ccw', label: '처음으로' },
  { id: 'repeat-2', label: '반복' },
  { id: 'music-2', label: '음악' },
  { id: 'skip-forward', label: '다음으로' },
  { id: 'corner-up-left', label: '돌아가기' },
  { id: 'play', label: '시작' },
  { id: 'pause', label: '멈춤' },
  { id: 'volume-1', label: '작게' },
  { id: 'trending-up', label: '빌드업' },
];

export const FLOW_SIGNAL_ICON_IDS = new Set(FLOW_SIGNAL_ICON_OPTIONS.map(option => option.id));

export const DEFAULT_FLOW_SIGNALS = [
  { id: 'finish', label: '곡 마침', shortLabel: '곡 마침', icon: 'circle-stop', color: '#fca5a5', sortOrder: 10 },
  { id: 'restart', label: '처음으로 돌아가기', shortLabel: '처음으로', icon: 'rotate-ccw', color: '#93c5fd', sortOrder: 20 },
  { id: 'chorus', label: '후렴으로 돌아가기', shortLabel: '후렴으로', icon: 'repeat-2', color: '#c4b5fd', sortOrder: 30 },
  { id: 'interlude', label: '간주 넣기', shortLabel: '간주 넣기', icon: 'music-2', color: '#86efac', sortOrder: 40 },
];
