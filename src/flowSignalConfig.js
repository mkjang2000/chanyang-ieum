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
