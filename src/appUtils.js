export const instrumentLabel = (value, presets = [], explicit = '') => (
  explicit || presets.find(instrument => instrument.id === value)?.label || value
);

export const selectableInstruments = (presets = [], currentValue = '') => (
  presets.filter(instrument => instrument.active || instrument.id === currentValue)
);

export const serviceDefaultTime = (serviceType, presets = []) => (
  presets.find(preset => preset.id === serviceType)?.defaultTime || ''
);

export const iso = date => {
  const value = new Date(date);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
};

export const dateKo = (value, full = false) => {
  const date = new Date(`${value}T00:00:00`);
  return full
    ? `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${'일월화수목금토'[date.getDay()]}요일`
    : `${date.getMonth() + 1}월 ${date.getDate()}일`;
};

export const TODAY = iso(new Date());

export const DEFAULT_SETTINGS = {
  system: { churchName: '', defaultServiceType: '' },
  preferences: {
    defaultMode: 'regular', viewerZoom: 100, showNotes: true,
    quickSignalsEnabled: true, quickSignalsPosition: 'left',
  },
};
